// Tests of the previews' settings panel (#608): `node --test deploy/preview-panel/`.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const ORIGIN = 'https://capi-previews.gbodin.cloud'
const root = await mkdtemp(join(tmpdir(), 'panel-'))
process.env.PANEL_PUBLIC_DIR = join(root, 'public')
process.env.PANEL_REQUESTS_DIR = join(root, 'requests')
process.env.PANEL_ORIGIN = ORIGIN
await mkdir(process.env.PANEL_PUBLIC_DIR)
await mkdir(process.env.PANEL_REQUESTS_DIR)

const preview = (number, extra = {}) => ({
  number,
  label: `#${number}`,
  title: `Title ${number}`,
  labels: [],
  visual: false,
  state: 'up',
  version: `pr-${number}-abcdef0`,
  url: `https://capi-pr-${number}.gbodin.cloud`,
  pullUrl: `https://github.com/GregoireBDN/capi/pull/${number}`,
  look: 'staging',
  autoSignIn: true,
  reset: '',
  ...extra,
})
const previews = [
  preview(12, {
    visual: true,
    labels: ['visuel'],
    title: 'Verre <script>alert(1)</script>',
  }),
  preview(13),
]
await writeFile(
  join(process.env.PANEL_PUBLIC_DIR, 'index.json'),
  JSON.stringify({ previews, visual: previews.filter((p) => p.visual) }),
)

const { handle, nextRequest } = await import('./server.mjs')
let server
let base
before(async () => {
  server = createServer(handle)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: ORIGIN,
      ...headers,
    },
    body,
  })
const request = async (n) =>
  JSON.parse(
    await readFile(
      join(process.env.PANEL_REQUESTS_DIR, `pr-${n}.json`),
      'utf8',
    ),
  )

test('the page lists the visual previews, titles escaped, no script', async () => {
  const res = await fetch(base + '/')
  const html = await res.text()
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/)
  assert.match(html, /#12/)
  assert.doesNotMatch(html, /#13</)
  assert.match(html, /Verre &lt;script&gt;/)
  assert.doesNotMatch(html, /<script/)
  assert.match(await (await fetch(base + '/?tous')).text(), /#13</)
})

test('a setting from the page is written as a request', async () => {
  const res = await post('/pr/12', 'look=production')
  assert.equal(res.status, 303)
  assert.deepEqual(await request(12), { look: 'production' })
  await post('/pr/12', 'autoSignIn=off')
  assert.deepEqual(await request(12), { look: 'production', autoSignIn: false })
  await post('/pr/12', 'reset=confirm')
  assert.match((await request(12)).reset, /^[0-9a-f]{12}$/)
})

test('a post from another origin, or without one, is refused', async () => {
  assert.equal(
    (
      await post('/pr/13', 'look=production', {
        Origin: 'https://evil.example',
      })
    ).status,
    403,
  )
  const res = await fetch(base + '/pr/13', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'look=production',
  })
  assert.equal(res.status, 403)
  assert.ok(
    !(await readdir(process.env.PANEL_REQUESTS_DIR)).includes('pr-13.json'),
  )
})

test('only the allow-listed settings, for a running preview', async () => {
  assert.equal((await post('/pr/13', 'look=prod-data')).status, 400)
  assert.equal(
    (await post('/pr/13', 'DATABASE_URL=postgres://x/finances')).status,
    400,
  )
  assert.equal((await post('/pr/99', 'look=production')).status, 404)
  assert.equal((await post('/pr/..%2F12', 'look=production')).status, 404)
  assert.equal(
    (
      await post('/pr/13', 'look=production', {
        'Content-Type': 'application/json',
      })
    ).status,
    415,
  )
  assert.equal((await post('/pr/13', 'x='.padEnd(2000, 'a'))).status, 413)
})

test('nextRequest keeps nothing outside the allow-list from the old file', () => {
  const next = nextRequest(
    { look: 'production', DATABASE_URL: 'x', autoSignIn: 'yes', reset: '../x' },
    new URLSearchParams('autoSignIn=on'),
  )
  assert.deepEqual(next, { look: 'production', autoSignIn: true })
})
