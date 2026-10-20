// Harness: a fake studio (/events, /api/requests, /api/requests/:id/sent) and the channel spoken to over stdio.
import { spawn } from 'node:child_process'
import http from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = process.argv[2]
let failed = false
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`)
  if (!ok) failed = true
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 4000) => {
  for (let t = 0; t < ms; t += 25) {
    if (fn()) return true
    await wait(25)
  }
  return false
}

const request = (id, status = 'pending', page = { kind: 'screen', name: 'home' }) => ({ id, page, status, shapeIds: ['a'] })

// The fake studio.
const streams = new Set()
const sent = []
let eventsHits = 0
const studio = http.createServer((req, res) => {
  if (req.url === '/events') {
    eventsHits++
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(': hi\n\n')
    streams.add(res)
    req.on('close', () => streams.delete(res))
  } else if (req.url.startsWith('/api/requests?')) {
    res.end(JSON.stringify([{ id: 'rq-00000001', page: { kind: 'screen', name: 'home' }, status: 'pending' }]))
  } else if (req.method === 'POST' && req.url.endsWith('/sent')) {
    sent.push(req.url.split('/')[3])
    res.end('{}')
  } else res.writeHead(404).end()
})
const emit = (event) => {
  for (const res of streams) res.write(`data: ${JSON.stringify({ type: 'change', event })}\n\n`)
}
await new Promise((r) => studio.listen(0, '127.0.0.1', r))
const port = studio.address().port

function start(dir) {
  const child = spawn('node', [script], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
  const out = []
  let buf = ''
  child.stdout.on('data', (c) => {
    buf += c
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      out.push(JSON.parse(buf.slice(0, i)))
      buf = buf.slice(i + 1)
    }
  })
  const rpc = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
  return { child, out, rpc }
}

const local = mkdtempSync(join(tmpdir(), 'channel-local-'))
writeFileSync(join(local, 'design.manifest.json'), JSON.stringify({ backend: 'local', studio: { port } }))
const claude = mkdtempSync(join(tmpdir(), 'channel-claude-'))
writeFileSync(join(claude, 'design.manifest.json'), JSON.stringify({ designProjectId: 'abc', studio: { port } }))

// Handshake.
const a = start(local)
a.rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } })
await until(() => a.out.length > 0)
const init = a.out[0].result
check('declares the channel capability', init.capabilities.experimental, { 'claude/channel': {} })
check('is one-way (no tools)', init.capabilities.tools, undefined)
check('names itself design', init.serverInfo.name, 'design')
check('has instructions', typeof init.instructions === 'string' && init.instructions.includes('design-sketch'), true)
a.rpc({ method: 'notifications/initialized' })

// Pending requests at connect are forwarded, and marked sent.
await until(() => a.out.some((m) => m.method === 'notifications/claude/channel'))
const first = a.out.find((m) => m.method === 'notifications/claude/channel')
check('forwards a pending request on connect', first?.params.meta, { request_id: 'rq-00000001', page: 'screen/home' })
check('content is one line', first?.params.content.includes('\n'), false)
await until(() => sent.includes('rq-00000001'))
check('marks it sent', sent, ['rq-00000001'])

// A new request event, then ignored events.
emit({ kind: 'request', request: request('rq-aaaaaaaa') })
await until(() => a.out.filter((m) => m.method).length >= 2)
check('forwards a new request', a.out.filter((m) => m.method).at(-1).params.meta.request_id, 'rq-aaaaaaaa')
const count = () => a.out.filter((m) => m.method).length
const before = count()
emit({ kind: 'request', request: request('rq-bbbbbbbb', 'sent') })
emit({ kind: 'request', request: request('rq-cccccccc', 'done') })
emit({ kind: 'request', request: request('../etc/passwd') })
emit({ kind: 'request', request: request('rq-dddddddd', 'pending', { kind: 'screen', name: 'Evil\nname' }) })
emit({ kind: 'page', name: 'home', pageKind: 'screen', variant: 'proposal', hash: 'x' })
await wait(300)
check('ignores sent, done, bad ids, bad names and other events', count(), before)

// Reconnects when the studio drops the stream.
const hits = eventsHits
for (const res of streams) res.end()
await until(() => eventsHits > hits)
check('reconnects', eventsHits > hits, true)
await until(() => streams.size > 0)
emit({ kind: 'request', request: request('rq-eeeeeeee') })
await until(() => a.out.some((m) => m.params?.meta?.request_id === 'rq-eeeeeeee'))
check('forwards after a reconnect', a.out.some((m) => m.params?.meta?.request_id === 'rq-eeeeeeee'), true)
a.child.kill()

// Idle without a local-backend manifest: no connection to the studio.
const hitsBefore = eventsHits
const b = start(claude)
b.rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } })
await until(() => b.out.length > 0)
b.rpc({ method: 'notifications/initialized' })
await wait(600)
check('still answers initialize when idle', b.out[0].result.capabilities.experimental, { 'claude/channel': {} })
check('idle on a Claude Design manifest', eventsHits, hitsBefore)
b.child.kill()

const c = start(mkdtempSync(join(tmpdir(), 'channel-none-')))
c.rpc({ id: 1, method: 'initialize', params: {} })
await until(() => c.out.length > 0)
c.rpc({ method: 'notifications/initialized' })
await wait(300)
check('idle without a manifest', eventsHits, hitsBefore)
c.child.kill()

studio.close()
for (const d of [local, claude]) rmSync(d, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
