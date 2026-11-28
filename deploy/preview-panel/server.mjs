// Settings panel of the pull request previews (#608, docs/runbooks/previews.md).
//
// A page per server, https://capi-previews.gbodin.cloud (tailnet only): one card
// per running preview with its look (staging or production), the demo sign-in
// and a « fresh demo data » button. Plain HTML forms, no script in the page.
//
// It holds no power of its own on purpose: it reads the index preview.sh
// writes (/data/public/index.json) and writes what the owner asks to
// /data/requests/pr-<n>.json, nothing else. preview.sh (as `deploy`, started
// by the capi-previews-apply.path unit) checks each request against its own
// allow-list and applies it. No Docker socket, secret or database here.
//
// Node's standard library only: nothing to install, run read-only by
// deploy/preview-panel/compose.yml.
import { randomBytes } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'

const PUBLIC_DIR = process.env.PANEL_PUBLIC_DIR ?? '/data/public'
const REQUESTS_DIR = process.env.PANEL_REQUESTS_DIR ?? '/data/requests'
const CSS_FILE =
  process.env.PANEL_CSS_FILE ?? new URL('./panel.css', import.meta.url).pathname
const ORIGIN = process.env.PANEL_ORIGIN ?? 'https://capi-previews.gbodin.cloud'
const PORT = Number(process.env.PANEL_PORT ?? 8080)
const MAX_BODY = 1024

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  )

const validNumber = (value) => /^[1-9][0-9]{0,5}$/.test(value)

export async function readIndex() {
  try {
    const index = JSON.parse(
      await readFile(join(PUBLIC_DIR, 'index.json'), 'utf8'),
    )
    return Array.isArray(index.previews) ? index : { previews: [], visual: [] }
  } catch {
    return { previews: [], visual: [] }
  }
}

export async function readRequest(n) {
  try {
    const request = JSON.parse(
      await readFile(join(REQUESTS_DIR, `pr-${n}.json`), 'utf8'),
    )
    return request && typeof request === 'object' && !Array.isArray(request)
      ? request
      : {}
  } catch {
    return {}
  }
}

/**
 * The request for pull request `n` after one form post, or `null` when the
 * form holds nothing the panel offers. Only the allow-listed settings are
 * kept, whatever the file held before.
 */
export function nextRequest(current, form) {
  const next = {}
  if (current.look === 'staging' || current.look === 'production')
    next.look = current.look
  if (typeof current.autoSignIn === 'boolean')
    next.autoSignIn = current.autoSignIn
  if (
    typeof current.reset === 'string' &&
    /^[0-9a-z]{1,32}$/.test(current.reset)
  ) {
    next.reset = current.reset
  }
  const look = form.get('look')
  const auto = form.get('autoSignIn')
  let changed = false
  if (look === 'staging' || look === 'production') {
    next.look = look
    changed = true
  }
  if (auto === 'on' || auto === 'off') {
    next.autoSignIn = auto === 'on'
    changed = true
  }
  if (form.get('reset') === 'confirm') {
    next.reset = randomBytes(6).toString('hex')
    changed = true
  }
  return changed ? next : null
}

async function writeRequest(n, request) {
  const file = join(REQUESTS_DIR, `pr-${n}.json`)
  const tmp = join(
    REQUESTS_DIR,
    `.pr-${n}.${randomBytes(4).toString('hex')}.tmp`,
  )
  await writeFile(tmp, JSON.stringify(request), { mode: 0o640 })
  await rename(tmp, file)
}

/** What the owner asked that preview.sh has not applied yet. */
function pending(preview, request) {
  return (
    (request.look !== undefined && request.look !== preview.look) ||
    (request.autoSignIn !== undefined &&
      request.autoSignIn !== preview.autoSignIn) ||
    (request.reset !== undefined && request.reset !== preview.reset)
  )
}

const STATE_LABELS = {
  up: 'En ligne',
  starting: 'Démarrage',
  failed: 'En échec',
}

function card(preview, request, { confirmReset }) {
  const n = preview.number
  const look = request.look ?? preview.look
  const auto = request.autoSignIn ?? preview.autoSignIn
  const busy = pending(preview, request)
  const action = `/pr/${n}`
  const seg = (value, text) =>
    `<button name="look" value="${value}" class="seg-item${look === value ? ` on ${value}` : ''}"${
      look === value ? ' aria-pressed="true"' : ''
    }>${text}</button>`
  return `
  <article class="card" id="pr-${n}">
    <header class="card-head">
      <span class="state ${escape(preview.state)}" title="${escape(STATE_LABELS[preview.state] ?? '')}"></span>
      <a class="num" href="${escape(preview.pullUrl)}">#${n}</a>
      <h2 class="title">${escape(preview.title)}</h2>
      ${preview.visual ? '<span class="chip">visuel</span>' : ''}
    </header>
    <form method="post" action="${action}" class="seg" aria-label="Apparence">
      ${seg('staging', 'Staging')}${seg('production', 'Production')}
    </form>
    <form method="post" action="${action}" class="line">
      <span>🔑 Connexion auto</span>
      <button name="autoSignIn" value="${auto ? 'off' : 'on'}" class="switch${auto ? ' on' : ''}" role="switch" aria-checked="${auto}" aria-label="Connexion automatique au compte démo"></button>
    </form>
    ${
      confirmReset
        ? `<form method="post" action="${action}" class="confirm">
      <span>Effacer et recharger les données démo ?</span>
      <div class="btns"><a class="btn ghost" href="/#pr-${n}">Annuler</a><button name="reset" value="confirm" class="btn danger">↺ Effacer</button></div>
    </form>`
        : `<div class="btns">
      <a class="btn" href="${escape(preview.url)}">Ouvrir</a>
      <a class="btn ghost" href="/?reset=${n}#pr-${n}">↺ Données neuves</a>
    </div>`
    }
    ${busy ? '<p class="toast">Application en cours…</p>' : ''}
  </article>`
}

export async function renderPage(url) {
  const index = await readIndex()
  const all = url.searchParams.has('tous')
  const confirm = url.searchParams.get('reset')
  const shown = all ? index.previews : index.previews.filter((p) => p.visual)
  const others = index.previews.length - index.visual.length
  const requests = await Promise.all(shown.map((p) => readRequest(p.number)))
  const busy = shown.some((p, i) => pending(p, requests[i]))
  const cards = shown.map((p, i) =>
    card(p, requests[i], { confirmReset: confirm === String(p.number) }),
  )
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
${busy ? '<meta http-equiv="refresh" content="5">' : ''}
<title>Aperçus · Capi</title>
<link rel="stylesheet" href="/panel.css">
</head>
<body>
<main>
  <nav class="top">
    <a class="back" href="https://gbodin.cloud" aria-label="gbodin.cloud">‹</a>
    <h1>Aperçus</h1>
    <a class="filter" href="${all ? '/' : '/?tous'}">${all ? 'Visuels' : `Tous${others > 0 ? ` · ${others + index.visual.length}` : ''}`}</a>
  </nav>
  ${cards.length ? cards.join('') : `<p class="empty">${all ? 'Aucun aperçu en ligne.' : 'Aucun aperçu visuel en ligne.'}</p>`}
</main>
</body>
</html>`
}

async function readForm(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) return null
    chunks.push(chunk)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function send(
  res,
  status,
  body,
  type = 'text/html; charset=utf-8',
  extra = {},
) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, ...extra })
  res.end(body)
}

export async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://panel.invalid')
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, await renderPage(url))
    }
    if (req.method === 'GET' && url.pathname === '/panel.css') {
      return send(res, 200, await readFile(CSS_FILE), 'text/css; charset=utf-8')
    }
    // Read by the gbodin.cloud portal's server (Homepage, on the proxy network).
    if (req.method === 'GET' && url.pathname === '/index.json') {
      return send(
        res,
        200,
        JSON.stringify(await readIndex()),
        'application/json',
      )
    }
    const match = /^\/pr\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'POST' && match) {
      // Same-origin forms only: a page elsewhere in the browser can't post here.
      if (req.headers.origin !== ORIGIN)
        return send(res, 403, 'Forbidden', 'text/plain')
      const type = String(req.headers['content-type'] ?? '')
        .split(';')[0]
        .trim()
      if (type !== 'application/x-www-form-urlencoded') {
        return send(res, 415, 'Unsupported Media Type', 'text/plain')
      }
      const n = match[1]
      const index = await readIndex()
      if (
        !validNumber(n) ||
        !index.previews.some((p) => String(p.number) === n)
      ) {
        return send(res, 404, 'Not found', 'text/plain')
      }
      const form = await readForm(req)
      if (!form) return send(res, 413, 'Payload Too Large', 'text/plain')
      const next = nextRequest(await readRequest(n), form)
      if (!next) return send(res, 400, 'Bad Request', 'text/plain')
      await writeRequest(n, next)
      return send(res, 303, '', 'text/plain', { Location: `/#pr-${n}` })
    }
    return send(res, 404, 'Not found', 'text/plain')
  } catch {
    // Paths and errors are not logged: nothing here is worth keeping.
    return send(res, 500, 'Internal Server Error', 'text/plain')
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  createServer(handle).listen(PORT, () => {
    console.log(`preview panel on :${PORT}`)
  })
}
