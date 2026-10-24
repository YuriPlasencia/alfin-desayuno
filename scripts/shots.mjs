import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = process.env.SHOTS_BASE || 'http://127.0.0.1:8788'
const OUT = 'docs/screenshots'
const errors = []

await fs.rm(OUT, { recursive: true, force: true })
await fs.mkdir(OUT, { recursive: true })

const browser = await chromium.launch()

function watch(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
}

async function newPage(options) {
  const context = await browser.newContext({
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    ...options,
  })
  // Entra como Ana Torres para que la app se vea como en uso real.
  await context.addInitScript(() => {
    window.localStorage.setItem('alfin.actor.v1', '1')
    // Simula una visita de hace tres días para mostrar "desde tu última visita".
    window.localStorage.setItem('alfin.lastVisit', new Date(Date.now() - 3 * 86400000).toISOString())
  })
  const page = await context.newPage()
  watch(page)
  return page
}

const desktop = await newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })
await desktop.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await desktop.waitForTimeout(900)

const tabs = [
  ['inicio', ''],
  ['actividades', 'actividades'],
  ['acuerdos', 'acuerdos'],
  ['equipo', 'equipo'],
  ['presupuesto', 'presupuesto'],
  ['ajustes', 'ajustes'],
]

for (const [name, hash] of tabs) {
  await desktop.evaluate((h) => {
    window.location.hash = h ? `#/${h}` : '#/inicio'
  }, hash)
  await desktop.waitForTimeout(650)
  await desktop.screenshot({ path: `${OUT}/web-${name}.png`, fullPage: true })
}

await desktop.evaluate(() => {
  window.location.hash = '#/actividades'
})
await desktop.waitForTimeout(600)
const editButton = desktop.locator('button[title="Editar actividad"]').first()
if (await editButton.count()) {
  await editButton.click()
  await desktop.waitForTimeout(450)
  await desktop.screenshot({ path: `${OUT}/web-editar-actividad.png` })
  await desktop.keyboard.press('Escape')
}

const mobile = await newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await mobile.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(900)
await mobile.screenshot({ path: `${OUT}/movil-inicio.png` })
await mobile.screenshot({ path: `${OUT}/movil-inicio-completo.png`, fullPage: true })

const overflow = await mobile.evaluate(() => {
  const width = document.documentElement.clientWidth
  const offenders = []
  for (const element of document.querySelectorAll('body *')) {
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.right > width + 1) {
      const name = `${element.tagName.toLowerCase()}${element.className ? '.' + String(element.className).split(' ').join('.') : ''}`
      offenders.push(`${name} → ${Math.round(rect.right)}px`)
    }
  }
  return { width, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 8) }
})
console.log('MOBILE', JSON.stringify(overflow))

for (const [name, hash] of [
  ['actividades', 'actividades'],
  ['presupuesto', 'presupuesto'],
]) {
  await mobile.evaluate((h) => {
    window.location.hash = `#/${h}`
  }, hash)
  await mobile.waitForTimeout(650)
  await mobile.screenshot({ path: `${OUT}/movil-${name}.png` })
}

await browser.close()

if (errors.length) {
  console.log('ERRORES DE CONSOLA:')
  for (const error of errors) console.log(' -', error)
  process.exitCode = 1
} else {
  console.log('Sin errores de consola. Capturas en', OUT)
}
