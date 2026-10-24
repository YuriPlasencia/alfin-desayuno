import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath

const commands = [
  { name: 'api', args: [path.join(root, 'server', 'index.js')], env: { ...process.env, PORT: process.env.PORT || '8787' } },
  { name: 'web', args: [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], env: process.env },
]

const children = commands.map((command) => {
  const child = spawn(node, command.args, { cwd: root, env: command.env, stdio: 'inherit' })
  child.on('exit', (code) => {
    console.log(`[${command.name}] terminó con código ${code}`)
    shutdown()
  })
  return child
})

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
console.log('\n  Al Fin Desayuno en marcha')
console.log('  Web:  http://localhost:5173')
console.log('  API:  http://localhost:8787/api/health\n')
