import { useEffect, useMemo, useRef, useState } from 'react'
import { finanzas } from '../api'
import { EmptyState, Icon, Input } from '../components/ui'
import { soles } from '../lib/format'
import type { FinEntry } from '../types'

/*
 * Panel de finanzas: KPIs del periodo, tendencia mensual, gasto por comercio, por categoría
 * y por rubro, y una búsqueda de producto («agua») que muestra en qué tienda se concentra.
 * Todo se cruza: tocar un comercio o un rubro filtra el resto.
 */

type Period = 1 | 3 | 6 | 12
const PERIODS: { months: Period; label: string }[] = [
  { months: 1, label: 'Este mes' },
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '12 meses' },
]
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Mes AAAA-MM desplazado n meses (n negativo = hacia atrás). */
function shift(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const round = (n: number) => Math.round(n * 100) / 100

/** Una línea de boleta con el comercio y la fecha de su boleta. */
type Line = { entryId: number; date: string; brand: string; category: string; description: string; amount: number; rubro: string }

function totals(rows: [string, number][]) {
  const map = new Map<string, number>()
  for (const [key, value] of rows) map.set(key, (map.get(key) || 0) + value)
  return [...map]
    .map(([k, v]) => [k, round(v)] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
}

// ---------- piezas ----------

/** Barras horizontales de una sola serie (un solo tono): ranking de mayor a menor, cada barra filtra. */
function RankBars({
  title,
  hint,
  rows,
  active,
  onPick,
  limit = 8,
}: {
  title: string
  hint?: string
  rows: [string, number][]
  active?: string | null
  onPick?: (key: string) => void
  limit?: number
}) {
  const [all, setAll] = useState(false)
  if (!rows.length) return null
  const total = rows.reduce((a, [, v]) => a + v, 0)
  const max = rows[0][1]
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <section className="card fin-panel-card">
      <header className="fin-panel-head">
        <h2 className="section-title">{title}</h2>
        {hint ? <span className="small muted">{hint}</span> : null}
      </header>
      <ul className="fin-rank">
        {shown.map(([label, value]) => {
          const share = total ? (value / total) * 100 : 0
          const tip = `${label}: ${soles(value)} (${share.toFixed(1)}% del total)`
          const body = (
            <>
              <span className="fin-rank-label">{label}</span>
              <span className="fin-rank-track" aria-hidden="true">
                <i style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
              </span>
              <span className="fin-rank-value">
                <strong>{soles(value)}</strong>
                <span className="muted">{share.toFixed(0)}%</span>
              </span>
            </>
          )
          return (
            <li key={label}>
              {onPick ? (
                <button type="button" className={`fin-rank-row ${active === label ? 'is-active' : ''}`} title={tip} aria-pressed={active === label} onClick={() => onPick(label)}>
                  {body}
                </button>
              ) : (
                <div className="fin-rank-row" title={tip}>
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > limit ? (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Ver menos' : `Ver los ${rows.length}`}
        </button>
      ) : null}
    </section>
  )
}

/** Barra vertical con solo el extremo de arriba redondeado (la base queda pegada al eje). */
function barPath(x: number, top: number, w: number, h: number) {
  const height = Math.max(1, h)
  const r = Math.min(4, w / 2, height)
  const bottom = top + height
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`
}

/** Ingresos y gastos por mes: barras agrupadas, un solo eje, con tooltip y tabla. */
function Trend({ months, entries }: { months: string[]; entries: FinEntry[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // El gráfico se dibuja al ancho real del contenedor: así el texto no se encoge en el celular.
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const data = months.map((month) => {
    const of = (kind: string) => round(entries.filter((e) => e.kind === kind && e.date.startsWith(month)).reduce((a, e) => a + e.amount, 0))
    return { month, ingresos: of('ingreso'), gastos: of('gasto') }
  })
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.gastos]))
  // Escala «redonda»: el paso más chico de 1, 2, 2.5 o 5 × 10ⁿ que cubre el máximo en 4 líneas o menos.
  const magnitude = 10 ** Math.floor(Math.log10(max / 4))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => Math.ceil(max / s) <= 4) ?? magnitude * 10
  const lines = Math.max(1, Math.ceil(max / step))
  const top = step * lines
  const W = width
  const H = 220
  const left = W < 420 ? 44 : 56
  const bottom = 26
  const plotH = H - bottom - 10
  const slot = (W - left) / data.length
  const barW = Math.min(26, (slot - 14) / 2)
  const y = (v: number) => 10 + plotH - (v / top) * plotH
  const short = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} mil` : String(Math.round(v)))
  const h = hover !== null ? data[hover] : null

  return (
    <section className="card fin-panel-card">
      <header className="fin-panel-head">
        <h2 className="section-title">Ingresos y gastos por mes</h2>
        <span className="fin-legend">
          <span>
            <i className="fin-swatch is-in" /> Ingresos
          </span>
          <span>
            <i className="fin-swatch is-out" /> Gastos
          </span>
        </span>
      </header>
      <div className="fin-trend" ref={box} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ingresos y gastos de ${data.length} meses`}>
          {Array.from({ length: lines + 1 }, (_, i) => i).map((i) => {
            const v = step * i
            return (
              <g key={i}>
                <line x1={left} x2={W} y1={y(v)} y2={y(v)} className={i === 0 ? 'fin-axis' : 'fin-grid'} />
                <text x={left - 8} y={y(v) + 4} textAnchor="end" className="fin-tick">
                  {short(v)}
                </text>
              </g>
            )
          })}
          {data.map((d, i) => {
            const x = left + slot * i + slot / 2
            return (
              <g key={d.month}>
                {hover === i ? <rect x={left + slot * i + 2} y={6} width={slot - 4} height={plotH + 6} className="fin-hover-band" /> : null}
                {d.ingresos > 0 ? <path d={barPath(x - barW - 1, y(d.ingresos), barW, y(0) - y(d.ingresos))} className="fin-bar-in" /> : null}
                {d.gastos > 0 ? <path d={barPath(x + 1, y(d.gastos), barW, y(0) - y(d.gastos))} className="fin-bar-out" /> : null}
                <text x={x} y={H - 8} textAnchor="middle" className="fin-tick">
                  {monthLabel(d.month)}
                </text>
                {/* Zona de hover más grande que las barras. */}
                <rect x={left + slot * i} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(d.month)}: ingresos ${soles(d.ingresos)}, gastos ${soles(d.gastos)}`} />
              </g>
            )
          })}
        </svg>
        {h ? (
          <div className="fin-tooltip" style={{ left: `${((left + slot * (hover! + 0.5)) / W) * 100}%` }} role="status">
            <strong>{monthLabel(h.month)}</strong>
            <span>
              <i className="fin-swatch is-in" /> Ingresos {soles(h.ingresos)}
            </span>
            <span>
              <i className="fin-swatch is-out" /> Gastos {soles(h.gastos)}
            </span>
            <span className="muted">Queda {soles(h.ingresos - h.gastos)}</span>
          </div>
        ) : null}
      </div>
      <details className="fin-table-toggle">
        <summary className="small">Ver como tabla</summary>
        <table className="data-table fin-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="num">Ingresos</th>
              <th className="num">Gastos</th>
              <th className="num">Queda</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{monthLabel(d.month)}</td>
                <td className="num">{soles(d.ingresos)}</td>
                <td className="num">{soles(d.gastos)}</td>
                <td className="num">{soles(d.ingresos - d.gastos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

// ---------- panel ----------

export function FinanzasPanel({ month, onGo }: { month: string; onGo: (tab: 'ingresos' | 'gastos' | 'inversiones') => void }) {
  const [period, setPeriod] = useState<Period>(1)
  const [entries, setEntries] = useState<FinEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [rubro, setRubro] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const months = useMemo(() => Array.from({ length: period }, (_, i) => shift(month, i - period + 1)), [month, period])
  useEffect(() => {
    let alive = true
    setEntries(null)
    finanzas
      .range(months[0], months[months.length - 1])
      .then((state) => alive && setEntries(state.entries))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'No se pudo cargar'))
    return () => {
      alive = false
    }
  }, [months])

  const view = useMemo(() => {
    const list = entries ?? []
    const gastos = list.filter((e) => e.kind === 'gasto')
    const ingresos = list.filter((e) => e.kind === 'ingreso')
    const inversiones = list.filter((e) => e.kind === 'inversion')
    const lines: Line[] = gastos.flatMap((e) =>
      e.lines.map((l) => ({ entryId: e.id, date: e.date, brand: e.brand, category: e.category, description: l.description, amount: l.amount, rubro: l.rubro || 'Otros' })),
    )
    const q = fold(query.trim())
    const matchQuery = (l: Line) => !q || fold(l.description).includes(q)
    // Con un rubro o una búsqueda, el gasto se mide por línea; si no, por boleta completa.
    const byLine = Boolean(rubro || q)
    const selLines = lines.filter((l) => (!rubro || l.rubro === rubro) && matchQuery(l) && (!brand || l.brand === brand))
    const selEntries = gastos.filter((e) => !brand || e.brand === brand)

    const brandRows = byLine
      ? totals(lines.filter((l) => (!rubro || l.rubro === rubro) && matchQuery(l)).map((l) => [l.brand, l.amount]))
      : totals(gastos.map((e) => [e.brand, e.amount]))
    const rubroRows = totals(lines.filter((l) => (!brand || l.brand === brand) && matchQuery(l) && l.category === 'Supermercado').map((l) => [l.rubro, l.amount]))
    const categoryRows = totals(selEntries.map((e) => [e.category, e.amount]))
    const selectionTotal = byLine ? round(selLines.reduce((a, l) => a + l.amount, 0)) : round(selEntries.reduce((a, e) => a + e.amount, 0))
    const selectionCount = byLine ? new Set(selLines.map((l) => l.entryId)).size : selEntries.length

    // Precio promedio por línea en cada comercio (para comparar dónde sale más barato).
    const avgByBrand = q
      ? totals(selLines.map((l) => [l.brand, l.amount])).map(([b]) => {
          const mine = selLines.filter((l) => l.brand === b)
          return [b, round(mine.reduce((a, l) => a + l.amount, 0) / mine.length), mine.length] as [string, number, number]
        })
      : []

    return {
      ingresos: round(ingresos.reduce((a, e) => a + e.amount, 0)),
      gastos: round(gastos.reduce((a, e) => a + e.amount, 0)),
      invested: round(inversiones.reduce((a, e) => a + e.amount, 0)),
      value: round(inversiones.reduce((a, e) => a + (e.current_value ?? e.amount), 0)),
      hasGastos: gastos.length > 0,
      brandRows,
      rubroRows,
      categoryRows,
      selLines,
      selectionTotal,
      selectionCount,
      avgByBrand,
      filtered: Boolean(brand || rubro || q),
    }
  }, [entries, brand, rubro, query])

  const periodLabel = period === 1 ? monthLabel(month) : `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`
  const toggle = (current: string | null, set: (v: string | null) => void) => (value: string) => set(current === value ? null : value)
  const q = query.trim()
  const selectionName = [q ? `«${q}»` : '', rubro || '', brand ? `en ${brand}` : ''].filter(Boolean).join(' ')

  return (
    <div className="stack fin-panel">
      <div className="fin-filters">
        <div className="segmented" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p.months} className={period === p.months ? 'is-active' : ''} aria-pressed={period === p.months} onClick={() => setPeriod(p.months)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="fin-search">
          <Icon name="search" size={16} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto: agua, leche, pollo…" aria-label="Buscar producto" type="search" />
        </label>
      </div>
      {brand || rubro || q ? (
        <div className="fin-active">
          <span className="small muted">Filtrando:</span>
          {q ? (
            <button type="button" className="chip is-selected" onClick={() => setQuery('')}>
              «{q}» <Icon name="x" size={13} />
            </button>
          ) : null}
          {rubro ? (
            <button type="button" className="chip is-selected" onClick={() => setRubro(null)}>
              {rubro} <Icon name="x" size={13} />
            </button>
          ) : null}
          {brand ? (
            <button type="button" className="chip is-selected" onClick={() => setBrand(null)}>
              {brand} <Icon name="x" size={13} />
            </button>
          ) : null}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBrand(null)
              setRubro(null)
              setQuery('')
            }}
          >
            Quitar filtros
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="gate-error" role="alert">
          {error}
        </p>
      ) : null}

      {!entries ? (
        <div className="splash-inline">
          <span className="spinner" />
        </div>
      ) : (
        <>
          <div className="fin-tiles">
            <button type="button" className="fin-tile is-in" onClick={() => onGo('ingresos')}>
              <span className="fin-tile-label">
                <Icon name="download" size={16} /> Ingresos
              </span>
              <strong>{soles(view.ingresos)}</strong>
              <span className="small muted">{periodLabel}</span>
            </button>
            <button type="button" className="fin-tile is-out" onClick={() => onGo('gastos')}>
              <span className="fin-tile-label">
                <Icon name="upload" size={16} /> Gastos
              </span>
              <strong>{soles(view.gastos)}</strong>
              <span className="small muted">{periodLabel}</span>
            </button>
            <div className={`fin-tile ${view.ingresos - view.gastos < 0 ? 'is-negative' : ''}`}>
              <span className="fin-tile-label">
                <Icon name="wallet" size={16} /> Te queda
              </span>
              <strong>{soles(view.ingresos - view.gastos)}</strong>
              <span className="small muted">ingresos menos gastos</span>
            </div>
            <button type="button" className="fin-tile is-inv" onClick={() => onGo('inversiones')}>
              <span className="fin-tile-label">
                <Icon name="chart" size={16} /> Inversiones
              </span>
              <strong>{soles(view.value)}</strong>
              <span className="small muted">
                {view.invested ? `${view.value >= view.invested ? '+' : ''}${soles(view.value - view.invested)} sobre lo invertido` : 'valor actual'}
              </span>
            </button>
          </div>

          {view.filtered ? (
            <section className="fin-selection" aria-live="polite">
              <span className="fin-tile-label">Selección</span>
              <strong>{soles(view.selectionTotal)}</strong>
              <span>
                {selectionName} · {view.selectionCount} {view.selectionCount === 1 ? 'compra' : 'compras'} · {periodLabel}
              </span>
            </section>
          ) : null}

          {period > 1 ? <Trend months={months} entries={entries} /> : null}

          {!view.hasGastos ? (
            <EmptyState icon="wallet" title="Aún no hay gastos en este periodo" hint="Entra a Gastos y sube tu primera boleta: el panel se arma solo." />
          ) : (
            <div className="fin-panel-grid">
              <RankBars
                title={q || rubro ? `¿Dónde gastas más en ${q ? `«${q}»` : rubro?.toLowerCase()}?` : 'Gasto por comercio'}
                hint="Toca un comercio para filtrar"
                rows={view.brandRows}
                active={brand}
                onPick={toggle(brand, setBrand)}
              />
              <RankBars title={brand ? `Supermercado en ${brand}, por rubro` : 'Supermercado por rubro'} hint="Toca un rubro para filtrar" rows={view.rubroRows} active={rubro} onPick={toggle(rubro, setRubro)} />
              {!q && !rubro ? <RankBars title={brand ? `Categorías en ${brand}` : 'Gasto por categoría'} rows={view.categoryRows} /> : null}
              {q && view.avgByBrand.length ? (
                <section className="card fin-panel-card">
                  <header className="fin-panel-head">
                    <h2 className="section-title">Precio promedio de «{q}» por compra</h2>
                    <span className="small muted">Para ver dónde sale más barato</span>
                  </header>
                  <table className="data-table fin-table">
                    <thead>
                      <tr>
                        <th>Comercio</th>
                        <th className="num">Veces</th>
                        <th className="num">Promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...view.avgByBrand]
                        .sort((a, b) => a[1] - b[1])
                        .map(([b, avg, n]) => (
                          <tr key={b}>
                            <td>{b}</td>
                            <td className="num">{n}</td>
                            <td className="num">{soles(avg)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </div>
          )}

          {(q || rubro) && view.selLines.length ? (
            <section className="card table-card fin-panel-card">
              <header className="fin-panel-head">
                <h2 className="section-title">Compras de {selectionName}</h2>
              </header>
              <table className="data-table fin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Comercio</th>
                    <th className="num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {view.selLines.slice(0, 60).map((l, i) => (
                    <tr key={`${l.entryId}-${i}`}>
                      <td className="nowrap">
                        {l.date.slice(8, 10)}/{l.date.slice(5, 7)}
                      </td>
                      <td>{l.description}</td>
                      <td>{l.brand}</td>
                      <td className="num">{soles(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : q && !view.selLines.length ? (
            <EmptyState icon="search" title={`No hay compras de «${q}» en este periodo`} hint="Prueba con otra palabra o un periodo más largo." />
          ) : null}
        </>
      )}
    </div>
  )
}
