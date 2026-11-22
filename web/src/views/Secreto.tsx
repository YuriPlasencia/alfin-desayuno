import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { secreto, ApiError } from '../api'
import { Avatar, Button, EmptyState, Field, Icon, IconButton, Input, Magnet, Modal, PageHeader, Select, TextArea } from '../components/ui'
import { ShareButton } from '../components/share'
import type { Member, SecretGame, SecretMessage, SecretState, SecretWish } from '../types'
import { daysUntil, formatLongDate, money, plural, relativeTime } from '../lib/format'
import '../secreto.css'

function budgetLabel(game: SecretGame): string {
  if (game.budget_min && game.budget_max && game.budget_min !== game.budget_max) {
    return `Entre ${money(game.budget_min)} y ${money(game.budget_max)}`
  }
  if (game.budget_max) return `Hasta ${money(game.budget_max)}`
  if (game.budget_min) return `Desde ${money(game.budget_min)}`
  return 'Monto libre'
}

function countdown(date: string): string {
  const days = daysUntil(date)
  if (days === null) return 'Fecha por definir'
  if (days < 0) return 'La entrega ya pasó'
  if (days === 0) return '¡La entrega es hoy!'
  if (days === 1) return 'La entrega es mañana'
  return `Faltan ${days} días para la entrega`
}

/** Las rondas del sorteo en orden: A→B→C→…→A. */
function rounds(pairs: { giver_id: number; receiver_id: number }[]): number[][] {
  const next = new Map(pairs.map((pair) => [pair.giver_id, pair.receiver_id]))
  const seen = new Set<number>()
  const out: number[][] = []
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const round: number[] = []
    let current: number | undefined = start
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      round.push(current)
      current = next.get(current)
    }
    out.push(round)
  }
  return out
}

export function Secreto() {
  const { data, actor, toast, refresh } = useStore()
  const [state, setState] = useState<SecretState | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    try {
      setState(await secreto.get())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  // Cada cambio en el evento (data.seq) vuelve a pedir el juego: así se ve en vivo.
  useEffect(() => {
    void load()
  }, [load, data?.seq])

  /** Ejecuta una acción del juego y deja la pantalla con lo que respondió el servidor. */
  const run = useCallback(
    async (action: () => Promise<SecretState>, okMessage?: string): Promise<boolean> => {
      try {
        setState(await action())
        if (okMessage) toast(okMessage)
        void refresh()
        return true
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'No se pudo guardar', 'error')
        return false
      }
    },
    [toast, refresh],
  )

  const byId = useMemo(() => new Map((data?.members ?? []).map((member) => [member.id, member])), [data?.members])

  if (!data) return null
  if (!state) {
    return (
      <div className="stack">
        <PageHeader title="Amigo secreto" subtitle="Regalos sorpresa entre el grupo" />
        {failed ? (
          <EmptyState icon="wifiOff" title="No se pudo cargar el juego" hint="Revisa tu conexión y vuelve a entrar a esta pestaña." />
        ) : (
          <span className="spinner" />
        )}
      </div>
    )
  }

  const { game } = state
  const players = state.participants.map((p) => ({ ...p, member: byId.get(p.member_id) })).filter((p) => p.member) as (SecretState['participants'][number] & {
    member: Member
  })[]

  if (!game) {
    return (
      <div className="stack">
        <PageHeader title="Amigo secreto" subtitle="Regalos sorpresa entre el grupo" />
        <section className="card sec-hero">
          <span className="sec-hero-icon">
            <Icon name="gift" size={30} />
          </span>
          <h2>Jueguen al amigo secreto sin papelitos</h2>
          <p className="muted">
            Juntay sortea, guarda el secreto y acompaña el juego hasta el día de la entrega. Ni quien organiza sabe quién
            le tocó a quién.
          </p>
          <ol className="sec-steps">
            <li>
              <strong>Acuerden las reglas.</strong> Monto del regalo, fecha y lugar de la entrega.
            </li>
            <li>
              <strong>Cada quien se apunta</strong> y deja su lista de deseos.
            </li>
            <li>
              <strong>Sorteo en un toque.</strong> Cada persona ve solo a quién le regala.
            </li>
            <li>
              <strong>Mientras tanto:</strong> mensajes anónimos, endulzadas y apuestas sobre quién te regala.
            </li>
            <li>
              <strong>El día de la entrega</strong> se revela la ronda completa.
            </li>
          </ol>
          <Button icon="gift" onClick={() => setEditing(true)}>
            Armar el amigo secreto
          </Button>
        </section>
        {editing ? <RulesEditor game={null} run={run} onClose={() => setEditing(false)} /> : null}
      </div>
    )
  }

  const title = game.title || 'Amigo secreto'
  const inviteText = () =>
    [
      `🎁 *${title}* · ${data.settings.event_name}`,
      `Regalo: ${budgetLabel(game)}`,
      game.deliver_date ? `Entrega: ${formatLongDate(game.deliver_date)}${game.deliver_time ? ` · ${game.deliver_time}` : ''}` : '',
      game.place ? `Lugar: ${game.place}` : '',
      '',
      game.status === 'armando'
        ? 'Entra a la pestaña «Amigo secreto», apúntate y deja tu lista de deseos. El sorteo es secreto: cada quien ve solo a quién le regala.'
        : 'Ya se hizo el sorteo. Entra a la pestaña «Amigo secreto» y abre tu papelito.',
    ]
      .filter((line, index) => line || index === 4)
      .join('\n')

  return (
    <div className="stack">
      <PageHeader
        title={title}
        subtitle={
          game.status === 'armando'
            ? 'Apúntense y dejen su lista de deseos; luego se sortea'
            : game.status === 'sorteado'
              ? countdown(game.deliver_date)
              : 'Se reveló la ronda: así se regalaron'
        }
        action={
          <div className="btn-group">
            <ShareButton title={title} label="Invitar" text={inviteText} />
            {state.can_manage && game.status !== 'revelado' ? (
              <Button variant="outline" icon="pencil" onClick={() => setEditing(true)}>
                Reglas
              </Button>
            ) : null}
          </div>
        }
      />

      <RulesCard game={game} />

      {state.locked ? (
        <div className="card info-card">
          <Icon name="lock" />
          <p className="small">
            Tu nombre se apuntó al juego desde otra cuenta, y el papelito solo se abre desde esa cuenta. Entra con ella o
            pide a quien organiza que te retire y vuelve a apuntarte.
          </p>
        </div>
      ) : null}

      {game.status === 'armando' ? (
        <Setup state={state} players={players} members={data.members} actor={actor} run={run} />
      ) : game.status === 'sorteado' ? (
        <Playing state={state} game={game} players={players} byId={byId} run={run} />
      ) : (
        <Revealed state={state} byId={byId} />
      )}

      {state.me && game.status !== 'revelado' ? <WishList wishes={state.me.wishes} run={run} /> : null}

      {editing ? <RulesEditor game={game} run={run} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}

type Run = (action: () => Promise<SecretState>, okMessage?: string) => Promise<boolean>
type Player = SecretState['participants'][number] & { member: Member }

function RulesCard({ game }: { game: SecretGame }) {
  return (
    <section className="card sec-rules">
      <div className="sec-rule">
        <Icon name="wallet" size={18} />
        <div>
          <span className="sec-rule-label">Regalo</span>
          <strong>{budgetLabel(game)}</strong>
        </div>
      </div>
      <div className="sec-rule">
        <Icon name="calendar" size={18} />
        <div>
          <span className="sec-rule-label">Entrega</span>
          <strong>
            {game.deliver_date ? formatLongDate(game.deliver_date) : 'Fecha por definir'}
            {game.deliver_time ? ` · ${game.deliver_time}` : ''}
          </strong>
        </div>
      </div>
      {game.place ? (
        <div className="sec-rule">
          <Icon name="flag" size={18} />
          <div>
            <span className="sec-rule-label">Lugar</span>
            <strong>{game.place}</strong>
          </div>
        </div>
      ) : null}
      <div className="sec-rule">
        <Icon name="heart" size={18} />
        <div>
          <span className="sec-rule-label">Endulzadas</span>
          <strong>{game.sweets ? 'Sí, con detalles anónimos' : 'Sin endulzadas'}</strong>
        </div>
      </div>
      {game.rules ? <p className="sec-rules-note small">{game.rules}</p> : null}
    </section>
  )
}

// ---------- antes del sorteo ----------

function Setup({
  state,
  players,
  members,
  actor,
  run,
}: {
  state: SecretState
  players: Player[]
  members: Member[]
  actor: Member | null
  run: Run
}) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const joined = Boolean(state.me)
  const missing = 3 - players.length
  const inGame = new Set(players.map((p) => p.member_id))
  const waiting = members.filter((member) => !inGame.has(member.id))

  const addExclusion = () => {
    const first = Number(a)
    const second = Number(b)
    if (!first || !second || first === second) return
    const exists = state.exclusions.some(([x, y]) => (x === first && y === second) || (x === second && y === first))
    if (!exists) void run(() => secreto.setExclusions([...state.exclusions, [first, second]]))
    setA('')
    setB('')
  }

  const draw = async () => {
    if (!window.confirm(`¿Sortear entre ${players.length} personas? Cada quien verá solo a quién le regala.`)) return
    await run(() => secreto.draw(), '¡Sorteo hecho! Abre tu papelito')
  }

  const name = (id: number) => players.find((p) => p.member_id === id)?.member.name.split(' ')[0] ?? '—'

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>
              Ya se apuntaron <span className="sec-count">{players.length}</span>
            </h2>
            <p className="muted small">
              {missing > 0 ? `Faltan ${missing} para poder sortear (mínimo 3).` : 'Cada quien se apunta desde su celular.'}
            </p>
          </div>
          {state.locked ? null : joined ? (
            <Button variant="outline" size="sm" onClick={() => void run(() => secreto.leave(), 'Saliste del juego')}>
              Salirme
            </Button>
          ) : (
            <Button icon="plus" onClick={() => void run(() => secreto.join(), '¡Estás dentro! Arma tu lista de deseos')}>
              Me apunto
            </Button>
          )}
        </div>
        {players.length === 0 ? (
          <p className="muted small">Todavía nadie. Sé la primera persona en apuntarse.</p>
        ) : (
          <ul className="sec-people">
            {players.map((p) => (
              <li key={p.member_id}>
                <Magnet member={p.member} me={p.member_id === actor?.id} />
                <span className={`small ${p.wishes ? 'sec-ok' : 'muted'}`}>
                  {p.wishes ? plural(p.wishes, 'deseo', 'deseos') : 'Sin lista aún'}
                </span>
                {state.can_manage && p.member_id !== actor?.id ? (
                  <IconButton
                    icon="x"
                    label={`Retirar a ${p.member.name}`}
                    onClick={() => {
                      if (window.confirm(`¿Retirar a ${p.member.name} del juego?`)) void run(() => secreto.leave(p.member_id))
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {waiting.length > 0 ? (
          <p className="muted small sec-waiting">
            Aún no se apuntan: {waiting.map((member) => member.name.split(' ')[0]).join(', ')}.
          </p>
        ) : null}
      </section>

      {state.can_manage ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Sorteo</h2>
              <p className="muted small">Tú también juegas: ni organizando verás quién le tocó a quién.</p>
            </div>
          </div>

          {players.length >= 2 ? (
            <div className="sec-exclusions">
              <p className="mini-title">¿Alguien no debe tocarle a alguien?</p>
              <p className="muted small">Por ejemplo una pareja, o quienes ya se regalaron el año pasado.</p>
              <div className="sec-exclusion-form">
                <Select value={a} onChange={(event) => setA(event.target.value)} aria-label="Primera persona">
                  <option value="">Persona…</option>
                  {players.map((p) => (
                    <option key={p.member_id} value={p.member_id}>
                      {p.member.name}
                    </option>
                  ))}
                </Select>
                <span className="muted small">y</span>
                <Select value={b} onChange={(event) => setB(event.target.value)} aria-label="Segunda persona">
                  <option value="">Persona…</option>
                  {players
                    .filter((p) => String(p.member_id) !== a)
                    .map((p) => (
                      <option key={p.member_id} value={p.member_id}>
                        {p.member.name}
                      </option>
                    ))}
                </Select>
                <Button variant="soft" size="sm" icon="plus" disabled={!a || !b} onClick={addExclusion}>
                  Agregar
                </Button>
              </div>
              {state.exclusions.length > 0 ? (
                <ul className="sec-exclusion-list">
                  {state.exclusions.map(([x, y]) => (
                    <li key={`${x}-${y}`}>
                      <span>
                        {name(x)} y {name(y)} no se regalan entre sí
                      </span>
                      <IconButton
                        icon="x"
                        label="Quitar excepción"
                        onClick={() => void run(() => secreto.setExclusions(state.exclusions.filter(([p, q]) => !(p === x && q === y))))}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="sec-draw">
            <Button icon="sparkles" disabled={players.length < 3} onClick={() => void draw()}>
              Sortear ahora
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('¿Cancelar el amigo secreto? Se borran las listas de deseos.')) void run(() => secreto.cancel(), 'Juego cancelado')
              }}
            >
              Cancelar el juego
            </Button>
          </div>
        </section>
      ) : (
        <div className="card info-card">
          <Icon name="info" />
          <p className="small muted">Cuando todos se hayan apuntado, quien organiza hace el sorteo y te aparece tu papelito aquí.</p>
        </div>
      )}
    </>
  )
}

// ---------- lista de deseos ----------

function WishList({ wishes, run }: { wishes: SecretWish[]; run: Run }) {
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [price, setPrice] = useState('')
  const [more, setMore] = useState(false)

  const add = async () => {
    if (!title.trim()) return
    const ok = await run(() => secreto.addWish({ title: title.trim(), link: link.trim(), price: Number(price) || 0 }))
    if (ok) {
      setTitle('')
      setLink('')
      setPrice('')
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Tu lista de deseos</h2>
          <p className="muted small">Solo la ve quien te regala. Dale pistas: tallas, colores, gustos.</p>
        </div>
      </div>
      {wishes.length > 0 ? (
        <ul className="sec-wishes">
          {wishes.map((wish) => (
            <li key={wish.id}>
              <WishLine wish={wish} />
              <IconButton icon="trash" label="Quitar deseo" onClick={() => void run(() => secreto.removeWish(wish.id))} />
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="sec-wish-form"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Una taza grande, chocolates, medias de colores" maxLength={120} aria-label="Deseo" />
        <Button type="submit" icon="plus" disabled={!title.trim()}>
          Agregar
        </Button>
      </form>
      {more ? (
        <div className="sec-wish-more">
          <Input value={link} onChange={(event) => setLink(event.target.value)} placeholder="Enlace de la tienda (opcional)" inputMode="url" aria-label="Enlace" />
          <Input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Precio aprox." inputMode="decimal" aria-label="Precio aproximado" />
        </div>
      ) : (
        <button type="button" className="sec-link" onClick={() => setMore(true)}>
          Agregar enlace o precio
        </button>
      )}
    </section>
  )
}

function WishLine({ wish }: { wish: SecretWish }) {
  return (
    <span className="sec-wish">
      <Icon name="star" size={15} />
      <span>
        {wish.title}
        {wish.price ? <em> · aprox. {money(wish.price)}</em> : null}
        {wish.link ? (
          <>
            {' '}
            <a href={wish.link} target="_blank" rel="noreferrer noopener">
              ver enlace
            </a>
          </>
        ) : null}
      </span>
    </span>
  )
}

// ---------- después del sorteo ----------

function Playing({
  state,
  game,
  players,
  byId,
  run,
}: {
  state: SecretState
  game: SecretGame
  players: Player[]
  byId: Map<number, Member>
  run: Run
}) {
  const [open, setOpen] = useState(false)
  const me = state.me
  const receiver = me?.receiver ? byId.get(me.receiver.member_id) : null
  const seen = players.filter((p) => p.seen).length
  const ready = players.filter((p) => p.gift_ready).length

  const reveal = async () => {
    if (!window.confirm('¿Revelar la ronda completa? Todos verán quién le regaló a quién. No se puede deshacer.')) return
    await run(() => secreto.reveal(), '¡Se reveló el amigo secreto!')
  }

  return (
    <>
      {me && receiver ? (
        <>
          <section className={`card sec-slip ${open ? 'is-open' : ''}`}>
            {open ? (
              <>
                <p className="sec-slip-label">Tú le regalas a</p>
                <div className="sec-slip-name">
                  <Avatar member={receiver} size="lg" />
                  <strong>{receiver.name}</strong>
                </div>
                <p className="muted small">
                  {budgetLabel(game)} · guarda el secreto hasta la entrega.
                </p>
                <div className="sec-slip-actions">
                  <button
                    type="button"
                    className={`sec-check ${me.gift_ready ? 'is-on' : ''}`}
                    aria-pressed={me.gift_ready}
                    onClick={() => void run(() => secreto.gift(!me.gift_ready), me.gift_ready ? undefined : '¡Regalo listo!')}
                  >
                    <Icon name="check" size={16} /> {me.gift_ready ? 'Ya tengo el regalo' : 'Marcar que ya tengo el regalo'}
                  </button>
                  <Button variant="ghost" size="sm" icon="lock" onClick={() => setOpen(false)}>
                    Ocultar
                  </Button>
                </div>

                <div className="sec-block">
                  <p className="mini-title">Su lista de deseos</p>
                  {me.receiver!.wishes.length > 0 ? (
                    <ul className="sec-wishes">
                      {me.receiver!.wishes.map((wish) => (
                        <li key={wish.id}>
                          <WishLine wish={wish} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">Todavía no dejó deseos. Pregúntale abajo, sin decir quién eres.</p>
                  )}
                </div>

                <Chat
                  title={`Escríbele a ${receiver.name.split(' ')[0]} sin que sepa quién eres`}
                  hint="Le llega firmado como «tu amigo secreto»."
                  messages={me.to_receiver}
                  unread={me.unread_to_receiver}
                  thread="receiver"
                  sweets={Boolean(game.sweets)}
                  placeholder="Ej. ¿Qué talla usas? ¿Dulce o salado?"
                  otherLabel={receiver.name.split(' ')[0]}
                  run={run}
                />
              </>
            ) : (
              <button
                type="button"
                className="sec-slip-cover"
                onClick={() => {
                  setOpen(true)
                  if (!me.seen) void run(() => secreto.seen())
                }}
              >
                <span className="sec-hero-icon">
                  <Icon name="gift" size={30} />
                </span>
                <strong>{me.seen ? 'Tu papelito' : '¡Ya tienes amigo secreto!'}</strong>
                <span className="muted small">Toca para ver a quién le regalas. Que nadie mire tu pantalla.</span>
              </button>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Quien te regala a ti</h2>
                <p className="muted small">No sabes quién es… todavía.</p>
              </div>
            </div>
            <Chat
              title="Mensajes de tu amigo secreto"
              hint="Puedes responderle aunque no sepas quién es."
              messages={me.from_giver}
              unread={me.unread_from_giver}
              thread="giver"
              sweets={false}
              placeholder="Respóndele a tu amigo secreto"
              otherLabel="Tu amigo secreto"
              run={run}
            />
            <div className="sec-guess">
              <Field label="¿Quién crees que te regala?" hint="Apuesta y cámbiala cuando quieras. En la entrega se ve quién adivinó.">
                <Select value={me.guess_id ?? ''} onChange={(event) => void run(() => secreto.guess(Number(event.target.value) || null))}>
                  <option value="">Aún no sé</option>
                  {players
                    .filter((p) => p.member_id !== me.member_id)
                    .map((p) => (
                      <option key={p.member_id} value={p.member_id}>
                        {p.member.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </section>
        </>
      ) : state.locked ? null : (
        <div className="card info-card">
          <Icon name="info" />
          <p className="small muted">
            El sorteo ya se hizo y no estabas en la lista. Si quieres jugar, pide a quien organiza que deshaga el sorteo
            para que te apuntes.
          </p>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Cómo va el grupo</h2>
            <p className="muted small">
              {seen} de {players.length} abrieron su papelito · {ready} de {players.length} ya tienen el regalo
            </p>
          </div>
        </div>
        <ul className="sec-people">
          {players.map((p) => (
            <li key={p.member_id}>
              <Magnet member={p.member} me={p.member_id === me?.member_id} />
              <span className={`small ${p.gift_ready ? 'sec-ok' : 'muted'}`}>
                {p.gift_ready ? 'Regalo listo' : p.seen ? 'Buscando regalo' : 'No abrió su papelito'}
              </span>
              {p.wishes === 0 ? <span className="small sec-warn">Sin lista de deseos</span> : null}
            </li>
          ))}
        </ul>
        {state.can_manage ? (
          <div className="sec-draw">
            <Button icon="sparkles" onClick={() => void reveal()}>
              Revelar la ronda
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('¿Deshacer el sorteo? Se borran los papelitos y los mensajes; las listas de deseos se quedan.')) {
                  void run(() => secreto.reopen(), 'Sorteo deshecho: pueden apuntarse de nuevo')
                }
              }}
            >
              Deshacer el sorteo
            </Button>
          </div>
        ) : null}
        {state.can_manage ? (
          <p className="muted small sec-waiting">Revela la ronda el día de la entrega, cuando ya todos tengan su regalo en la mano.</p>
        ) : null}
      </section>
    </>
  )
}

function Chat({
  title,
  hint,
  messages,
  unread,
  thread,
  sweets,
  placeholder,
  otherLabel,
  run,
}: {
  title: string
  hint: string
  messages: SecretMessage[]
  unread: number
  thread: 'receiver' | 'giver'
  sweets: boolean
  placeholder: string
  otherLabel: string
  run: Run
}) {
  const [body, setBody] = useState('')
  const [sweet, setSweet] = useState(false)
  const end = useRef<HTMLLIElement>(null)

  // Al estar a la vista, lo recibido queda leído.
  useEffect(() => {
    if (unread > 0) void secreto.read(thread).catch(() => {})
  }, [unread, thread])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  const send = async () => {
    const clean = body.trim()
    if (!clean) return
    const ok = await run(() => secreto.message(thread, clean, sweet ? 'endulzada' : 'mensaje'))
    if (ok) {
      setBody('')
      setSweet(false)
    }
  }

  return (
    <div className="sec-block">
      <p className="mini-title">{title}</p>
      <p className="muted small">{hint}</p>
      {messages.length > 0 ? (
        <ul className="sec-chat">
          {messages.map((message) => (
            <li key={message.id} className={`${message.mine ? 'is-mine' : ''} ${message.kind === 'endulzada' ? 'is-sweet' : ''}`.trim()}>
              <span className="sec-chat-who">
                {message.kind === 'endulzada' ? '🍬 Endulzada · ' : ''}
                {message.mine ? 'Tú' : otherLabel} · {relativeTime(message.created_at)}
              </span>
              {message.body}
            </li>
          ))}
          <li ref={end} aria-hidden="true" className="sec-chat-end" />
        </ul>
      ) : null}
      <form
        className="sec-chat-form"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <Input value={body} onChange={(event) => setBody(event.target.value)} placeholder={sweet ? 'Ej. Te dejé algo en tu escritorio' : placeholder} maxLength={500} aria-label="Mensaje" />
        <Button type="submit" disabled={!body.trim()}>
          Enviar
        </Button>
      </form>
      {sweets ? (
        <label className="sec-sweet">
          <input type="checkbox" checked={sweet} onChange={(event) => setSweet(event.target.checked)} /> Es una endulzada: le dejé un
          detalle
        </label>
      ) : null}
    </div>
  )
}

// ---------- revelación ----------

function Revealed({ state, byId }: { state: SecretState; byId: Map<number, Member> }) {
  const pairs = state.reveal ?? []
  const giverOf = new Map(pairs.map((pair) => [pair.receiver_id, pair.giver_id]))
  const winners = (state.guesses ?? []).filter((g) => g.guess_id && giverOf.get(g.member_id) === g.guess_id)
  const myGiver = state.me ? byId.get(giverOf.get(state.me.member_id) ?? 0) : null
  const person = (id: number): ReactNode => {
    const member = byId.get(id)
    return member ? <Magnet member={member} me={id === state.me?.member_id} /> : <span className="muted small">Alguien</span>
  }

  return (
    <>
      {myGiver ? (
        <section className="card sec-slip is-open">
          <p className="sec-slip-label">Tu amigo secreto era</p>
          <div className="sec-slip-name">
            <Avatar member={myGiver} size="lg" />
            <strong>{myGiver.name}</strong>
          </div>
          <p className="muted small">
            {state.me?.guess_id
              ? state.me.guess_id === myGiver.id
                ? '¡Adivinaste! 🎉'
                : `Apostaste por ${byId.get(state.me.guess_id)?.name.split(' ')[0] ?? 'otra persona'}. Casi.`
              : 'No llegaste a apostar.'}
          </p>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>La ronda completa</h2>
            <p className="muted small">Cada quien le entrega al siguiente.</p>
          </div>
        </div>
        {rounds(pairs).map((round, index) => (
          <ol key={index} className="sec-round">
            {round.map((id) => (
              <li key={id}>
                {person(id)}
                <Icon name="arrowRight" size={15} />
              </li>
            ))}
            <li>{person(round[0])}</li>
          </ol>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Quiénes adivinaron</h2>
            <p className="muted small">
              {winners.length === 0 ? 'Nadie le atinó a su amigo secreto. ¡Bien guardado!' : `${winners.length} le ${winners.length === 1 ? 'atinó' : 'atinaron'} a quien le regalaba.`}
            </p>
          </div>
          {winners.length > 0 ? <Icon name="trophy" size={22} /> : null}
        </div>
        {winners.length > 0 ? <div className="chip-select">{winners.map((g) => <span key={g.member_id}>{person(g.member_id)}</span>)}</div> : null}
      </section>
    </>
  )
}

// ---------- reglas ----------

function RulesEditor({ game, run, onClose }: { game: SecretGame | null; run: Run; onClose: () => void }) {
  const { data } = useStore()
  const [title, setTitle] = useState(game?.title ?? '')
  const [min, setMin] = useState(game?.budget_min ? String(game.budget_min) : '')
  const [max, setMax] = useState(game?.budget_max ? String(game.budget_max) : '')
  const [date, setDate] = useState(game ? game.deliver_date : data?.settings.event_date ?? '')
  const [time, setTime] = useState(game ? game.deliver_time : data?.settings.event_time ?? '')
  const [place, setPlace] = useState(game ? game.place : data?.settings.location ?? '')
  const [rules, setRules] = useState(game?.rules ?? '')
  const [sweets, setSweets] = useState(game ? Boolean(game.sweets) : true)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const ok = await run(
      () =>
        secreto.save({
          title: title.trim(),
          budget_min: Number(min) || 0,
          budget_max: Number(max) || 0,
          deliver_date: date,
          deliver_time: time,
          place: place.trim(),
          rules: rules.trim(),
          sweets,
        }),
      game ? 'Reglas actualizadas' : '¡Amigo secreto armado! Invita al grupo',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={game ? 'Reglas del amigo secreto' : 'Armar el amigo secreto'}
      description="Lo que acuerden aquí lo ve todo el grupo."
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Guardando…' : game ? 'Guardar' : 'Crear juego'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nombre del juego" hint="Opcional">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Amigo secreto de la oficina" maxLength={80} autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Regalo desde (S/)">
            <Input value={min} onChange={(event) => setMin(event.target.value)} inputMode="decimal" placeholder="30" />
          </Field>
          <Field label="Hasta (S/)">
            <Input value={max} onChange={(event) => setMax(event.target.value)} inputMode="decimal" placeholder="50" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Día de la entrega" hint="La reunión donde se dan los regalos">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>
        <Field label="Lugar">
          <Input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Ej. Casa de la abuela, sala de reuniones" maxLength={120} />
        </Field>
        <label className="sec-sweet">
          <input type="checkbox" checked={sweets} onChange={(event) => setSweets(event.target.checked)} /> Con endulzadas: detalles
          anónimos mientras llega el día
        </label>
        <Field label="Otras reglas" hint="Opcional">
          <TextArea rows={3} value={rules} onChange={(event) => setRules(event.target.value)} placeholder="Ej. Nada de sobres con plata. El regalo va envuelto y con el nombre de quien lo recibe." maxLength={600} />
        </Field>
      </div>
    </Modal>
  )
}
