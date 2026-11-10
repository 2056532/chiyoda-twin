/**
 * Chiyoda Twin 后端（零依赖，只用 Node.js 自带模块，要求 Node 18+）
 *
 * 它做四件事：
 *  1. 静态托管：前端构建产物 web/dist、本地 PLATEAU 3D Tiles（data/plateau）、预处理数据（data/derived）
 *  2. 实时数据代理 + 缓存：ODPT 列车/巴士/单车、气象厅、Open-Meteo、OpenSky
 *     —— 统一出口、限流、上游失败时返回上一次的缓存（stale）
 *  3. 瓦片磁盘缓存：PLATEAU 地形和航拍影像第一次在线取，之后存到 data/tilecache，断网也能演示
 *  4. 共享单车历史快照：每 5 分钟存一次各站可用车数，供前端时间轴回放
 *
 * 启动：node server/server.mjs   然后浏览器打开 http://localhost:8787
 * 可选环境变量：
 *   PORT=8787                          监听端口
 *   OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET   OpenSky API 客户端（不填则匿名，每天 400 积分）
 *   NODE_USE_ENV_PROXY=1 + HTTPS_PROXY=http://127.0.0.1:7897   让 Node 走本机代理（Node 22.21+/24+）
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') // 工程根目录
const PORT = Number(process.env.PORT || 8787)
const DIST = path.join(ROOT, 'web', 'dist')              // 前端构建产物
const PLATEAU_DIR = path.join(ROOT, 'data', 'plateau')    // 下载好的 3D Tiles
const DERIVED_DIR = path.join(ROOT, 'data', 'derived')    // 预处理结果（lines.json）
const RAW_DIR = path.join(ROOT, 'data', 'raw')            // 静态原始数据（车站、单车站点）
const TILE_CACHE = path.join(ROOT, 'data', 'tilecache')   // 地形/影像瓦片缓存
const HISTORY_DIR = path.join(ROOT, 'data', 'history')    // 单车快照

const ODPT = 'https://api-public.odpt.org/api/v4'
const UA = 'chiyoda-twin/1.0 (portfolio demo)'

// ---------------------------------------------------------------- 工具函数

/** 常见扩展名 → Content-Type。3D Tiles 的 b3dm/glb 是二进制，必须给对类型 */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.b3dm': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.i3dm': 'application/octet-stream', '.pnts': 'application/octet-stream', '.cmpt': 'application/octet-stream',
  '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.xml': 'application/xml', '.ico': 'image/x-icon',
  '.terrain': 'application/vnd.quantized-mesh', '.woff2': 'font/woff2',
}

/** 发送 JSON；文本类内容如果客户端支持 gzip 就压缩 */
function sendJson(req, res, status, obj, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(obj))
  sendBuffer(req, res, status, body, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extraHeaders })
}

function sendBuffer(req, res, status, buf, type, headers = {}) {
  const h = { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', ...headers }
  const compressible = /json|javascript|css|html|xml|svg/.test(type) && buf.length > 1024
  if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf, { level: 6 })
    h['Content-Encoding'] = 'gzip'
  }
  h['Content-Length'] = buf.length
  res.writeHead(status, h)
  res.end(req.method === 'HEAD' ? undefined : buf)
}

/** 防目录穿越：确保请求的文件真的在 baseDir 里面 */
function safeJoin(baseDir, rel) {
  const p = path.normalize(path.join(baseDir, decodeURIComponent(rel)))
  return p.startsWith(baseDir) ? p : null
}

/** 托管静态文件；fallbackIndex=true 时找不到文件就回退到 index.html（单页应用路由） */
async function serveStatic(req, res, baseDir, rel, { fallbackIndex = false, maxAge = 0 } = {}) {
  let file = safeJoin(baseDir, rel || 'index.html')
  if (!file) return sendJson(req, res, 403, { error: 'forbidden' })
  try {
    let st = await fsp.stat(file)
    if (st.isDirectory()) { file = path.join(file, 'index.html'); st = await fsp.stat(file) }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
    const headers = { 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache' }
    // 大文件（b3dm）直接流式发送，避免一次读进内存
    if (st.size > 2 * 1024 * 1024 || !/json|javascript|css|html|xml|svg/.test(type)) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Access-Control-Allow-Origin': '*', ...headers })
      if (req.method === 'HEAD') return res.end()
      return fs.createReadStream(file).pipe(res)
    }
    return sendBuffer(req, res, 200, await fsp.readFile(file), type, headers)
  } catch {
    if (fallbackIndex) return serveStatic(req, res, baseDir, 'index.html')
    return sendJson(req, res, 404, { error: 'not found', path: rel })
  }
}

/** 带超时的 fetch */
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } })
  } finally { clearTimeout(t) }
}

// ---------------------------------------------------------------- 缓存代理

/**
 * 内存缓存：key → { at, data, error }
 * ttl 内直接返回缓存；过期后重新请求，失败则返回旧数据并标记 stale，前端据此显示“数据延迟”。
 * inflight 用来合并并发请求：同一时刻 10 个浏览器标签来要数据，上游只请求一次。
 */
const cache = new Map()
const inflight = new Map()

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return { ...hit, stale: false }
  if (inflight.has(key)) return inflight.get(key)
  const p = (async () => {
    try {
      const data = await loader()
      const entry = { at: Date.now(), data }
      cache.set(key, entry)
      return { ...entry, stale: false }
    } catch (e) {
      console.warn(`[upstream] ${key} 失败：${e.message}`)
      if (hit) return { ...hit, stale: true, error: e.message }   // 降级：返回旧数据
      throw e
    } finally { inflight.delete(key) }
  })()
  inflight.set(key, p)
  return p
}

async function getJson(url, opts) {
  const r = await fetchWithTimeout(url, opts)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

async function getBuffer(url, opts) {
  const r = await fetchWithTimeout(url, opts)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return Buffer.from(await r.arrayBuffer())
}

/** 把缓存结果包装成统一响应格式：{ fetchedAt, stale, data } */
function reply(req, res, result) {
  sendJson(req, res, 200, { fetchedAt: new Date(result.at).toISOString(), stale: !!result.stale, data: result.data })
}

// ---------------------------------------------------------------- 各数据源

/** 气象厅 AMeDAS：先读最新时刻，再取该时刻的全国观测 JSON，只保留关东附近的站点减小体积 */
async function loadAmedas() {
  const latest = (await (await fetchWithTimeout('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt')).text()).trim()
  const stamp = latest.replace(/[-:T]/g, '').slice(0, 12) + '00'   // 2026-10-29T15:00:00+09:00 → 20261029150000
  const [map, table] = await Promise.all([
    getJson(`https://www.jma.go.jp/bosai/amedas/data/map/${stamp}.json`),
    stationTable(),
  ])
  const out = []
  for (const [id, obs] of Object.entries(map)) {
    const s = table[id]
    if (!s) continue
    const lat = s.lat[0] + s.lat[1] / 60, lon = s.lon[0] + s.lon[1] / 60   // 气象厅坐标是“度+分”
    if (lat < 35.3 || lat > 36.1 || lon < 139.2 || lon > 140.2) continue    // 只要东京周边
    out.push({
      id, name: s.kjName, lat, lon,
      temp: obs.temp?.[0] ?? null, humidity: obs.humidity?.[0] ?? null,
      wind: obs.wind?.[0] ?? null, windDirection: obs.windDirection?.[0] ?? null,  // 风向是 16 方位（1–16）
      precipitation1h: obs.precipitation1h?.[0] ?? null,
    })
  }
  return { time: latest, stations: out }
}

let amedasTable = null
async function stationTable() {
  if (amedasTable) return amedasTable
  try { amedasTable = JSON.parse(await fsp.readFile(path.join(RAW_DIR, 'jma_amedastable.json'), 'utf8')) }
  catch { amedasTable = await getJson('https://www.jma.go.jp/bosai/amedas/const/amedastable.json') }
  return amedasTable
}

/** OpenSky：可选 OAuth2 客户端凭证。token 有效期约 30 分钟，过期前刷新 */
let osToken = null
async function openskyHeaders() {
  const id = process.env.OPENSKY_CLIENT_ID, secret = process.env.OPENSKY_CLIENT_SECRET
  if (!id || !secret) return {}
  if (!osToken || Date.now() > osToken.exp) {
    const r = await fetchWithTimeout('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    })
    if (!r.ok) throw new Error('OpenSky token ' + r.status)
    const j = await r.json()
    osToken = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
  }
  return { Authorization: `Bearer ${osToken.value}` }
}
const hasOpenskyKey = () => !!(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET)

async function loadFlights() {
  // 东京湾 + 羽田周边，面积约 1.2°×1.6° < 25 平方度，每次只消耗 1 积分
  const url = 'https://opensky-network.org/api/states/all?lamin=35.2&lomin=139.4&lamax=36.0&lomax=140.4'
  const j = await getJson(url, { headers: await openskyHeaders() })
  // state 数组字段顺序见 OpenSky 文档：0 icao24, 1 呼号, 5 经度, 6 纬度, 7 气压高度, 8 是否在地面, 9 速度, 10 航向, 13 几何高度
  const states = (j.states || []).filter(s => s[5] != null && s[6] != null).map(s => ({
    icao24: s[0], callsign: (s[1] || '').trim(), country: s[2], lon: s[5], lat: s[6],
    alt: s[13] ?? s[7] ?? 0, onGround: s[8], velocity: s[9], heading: s[10],
  }))
  return { time: j.time, states }
}

// ---------------------------------------------------------------- 单车历史快照

const bikeHistory = []          // 内存里保留最近 24 小时：[{ t, a: {station_id: 可用车数} }]
const HISTORY_MAX = 24 * 12     // 5 分钟一次 → 每天 288 个

async function loadBikeStatus() {
  const j = await getJson(`${ODPT}/gbfs/docomo-cycle-tokyo/station_status.json`)
  return j.data.stations.map(s => ({
    id: s.station_id, bikes: s.num_bikes_available, docks: s.num_docks_available,
    renting: s.is_renting, returning: s.is_returning,
  }))
}

async function snapshotBikes() {
  try {
    const r = await cached('bike-status', 55_000, loadBikeStatus)
    const a = {}
    for (const s of r.data) a[s.id] = s.bikes
    const snap = { t: new Date().toISOString(), a }
    bikeHistory.push(snap)
    while (bikeHistory.length > HISTORY_MAX) bikeHistory.shift()
    await fsp.mkdir(HISTORY_DIR, { recursive: true })
    const day = snap.t.slice(0, 10)
    await fsp.appendFile(path.join(HISTORY_DIR, `bike-${day}.jsonl`), JSON.stringify(snap) + '\n')  // 每天一个文件，一行一个快照
  } catch (e) { console.warn('[bike] 快照失败', e.message) }
}

/** 启动时把今天和昨天的快照读回内存，重启服务不丢历史 */
async function restoreBikeHistory() {
  const days = [0, 1].map(d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10)).reverse()
  for (const day of days) {
    try {
      const lines = (await fsp.readFile(path.join(HISTORY_DIR, `bike-${day}.jsonl`), 'utf8')).trim().split('\n')
      for (const l of lines) { try { bikeHistory.push(JSON.parse(l)) } catch {} }
    } catch {}
  }
  const cutoff = Date.now() - 864e5
  while (bikeHistory.length && Date.parse(bikeHistory[0].t) < cutoff) bikeHistory.shift()
  console.log(`[bike] 恢复历史快照 ${bikeHistory.length} 个`)
}

// ---------------------------------------------------------------- 瓦片磁盘缓存

/**
 * 地形：/tiles/terrain/...  → https://tile.plateauview.mlit.go.jp/terrain/...
 * 影像：/tiles/ortho/z/x/y.png → https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2024/z/x/y.png
 * 先查本地文件，没有再在线取并写盘。404（海面、范围外）也记下来，避免反复请求。
 */
const TILE_UPSTREAM = {
  terrain: 'https://tile.plateauview.mlit.go.jp/terrain/',
  ortho: 'https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2024/',
  light: 'https://tile.plateauview.mlit.go.jp/tiles/light-map/',     // PLATEAU VIEW 的浅色底图
  gsi: 'https://cyberjapandata.gsi.go.jp/xyz/pale/',     // 国土地理院淡色地图：PLATEAU 影像范围外的底图
}
const missing = new Set()

async function serveTile(req, res, kind, rel) {
  const base = TILE_UPSTREAM[kind]
  if (!base || !/^[\w./-]+$/.test(rel) || rel.includes('..')) return sendJson(req, res, 400, { error: 'bad tile path' })
  // 地形瓦片要带扩展参数，不同参数的内容不同，所以写进缓存文件名
  const ext = kind === 'terrain' ? (new URL(req.url, 'http://x').searchParams.get('extensions') || '') : ''
  const file = path.join(TILE_CACHE, kind, rel + (ext ? `.${ext}` : ''))
  const type = rel.endsWith('.json') ? 'application/json' : (MIME[path.extname(rel)] || 'application/octet-stream')
  const key = kind + rel + ext
  if (missing.has(key)) return sendJson(req, res, 404, { error: 'tile not available' })
  try {
    const buf = await fsp.readFile(file)
    return sendBuffer(req, res, 200, buf, type, { 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'HIT' })
  } catch {}
  try {
    const headers = kind === 'terrain' && rel.endsWith('.terrain')
      ? { Accept: `application/vnd.quantized-mesh${ext ? `;extensions=${ext}` : ''},application/octet-stream;q=0.9` }
      : {}
    const r = await fetchWithTimeout(base + rel, { headers }, 20000)
    if (r.status === 404) { missing.add(key); return sendJson(req, res, 404, { error: 'tile not available' }) }
    if (!r.ok) throw new Error(String(r.status))
    const buf = Buffer.from(await r.arrayBuffer())   // fetch 会自动解压 gzip，存的是原始内容
    await fsp.mkdir(path.dirname(file), { recursive: true })
    fsp.writeFile(file, buf).catch(() => {})
    return sendBuffer(req, res, 200, buf, type, { 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'MISS' })
  } catch (e) {
    return sendJson(req, res, 502, { error: 'tile upstream failed', detail: e.message })
  }
}

// ---------------------------------------------------------------- 路由

const routes = {
  // 都营地铁列车位置：上游约 30 秒更新一次，缓存 15 秒
  '/api/trains': (req, res) => cached('trains', 15_000, () => getJson(`${ODPT}/odpt:Train?odpt:operator=odpt.Operator:Toei`)).then(r => reply(req, res, r)),
  // 运行信息（延误、停运）
  '/api/train-info': (req, res) => cached('train-info', 60_000, () => getJson(`${ODPT}/odpt:TrainInformation?odpt:operator=odpt.Operator:Toei`)).then(r => reply(req, res, r)),
  // 都营巴士 GTFS-RT：原样转发二进制，前端用 gtfs-realtime-bindings 解码
  '/api/bus.pb': async (req, res) => {
    const r = await cached('bus', 20_000, () => getBuffer(`${ODPT}/gtfs/realtime/ToeiBus`))
    sendBuffer(req, res, 200, r.data, 'application/x-protobuf', { 'Cache-Control': 'no-store', 'X-Stale': String(!!r.stale) })
  },
  '/api/bike/status': (req, res) => cached('bike-status', 55_000, loadBikeStatus).then(r => reply(req, res, r)),
  '/api/bike/history': (req, res) => sendJson(req, res, 200, { data: bikeHistory }),
  '/api/amedas': (req, res) => cached('amedas', 5 * 60_000, loadAmedas).then(r => reply(req, res, r)),
  // 降雨临近预报的可用时刻列表；瓦片本身前端直连气象厅（支持跨域）
  '/api/nowcast-times': (req, res) => cached('nowc', 2 * 60_000, () => getJson('https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json')).then(r => reply(req, res, r)),
  // Open-Meteo：AMeDAS 失败时的备用天气
  '/api/weather': (req, res) => cached('weather', 10 * 60_000, () => getJson('https://api.open-meteo.com/v1/forecast?latitude=35.694&longitude=139.754&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code&timezone=Asia%2FTokyo')).then(r => reply(req, res, r)),
  // 航班：匿名每天 400 积分 → 缓存 4 分钟（每天最多 360 次）；有密钥时缓存 20 秒
  '/api/flights': (req, res) => cached('flights', hasOpenskyKey() ? 20_000 : 240_000, loadFlights).then(r => reply(req, res, r)),
  '/api/health': (req, res) => sendJson(req, res, 200, {
    app: 'chiyoda-twin', ok: true, time: new Date().toISOString(), bikeSnapshots: bikeHistory.length, openskyAuth: hasOpenskyKey(),
    cache: [...cache.entries()].map(([k, v]) => ({ key: k, age_s: Math.round((Date.now() - v.at) / 1000) })),
  }),
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  try {
    if (req.method === 'OPTIONS') {   // 跨域预检
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
      return res.end()
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'method not allowed' })
    if (routes[pathname]) return await routes[pathname](req, res)
    if (pathname.startsWith('/tiles/')) {
      const [, , kind, ...rest] = pathname.split('/')
      return await serveTile(req, res, kind, rest.join('/'))
    }
    if (pathname.startsWith('/plateau/')) return await serveStatic(req, res, PLATEAU_DIR, pathname.slice(9), { maxAge: 86400 })
    if (pathname.startsWith('/data/')) return await serveStatic(req, res, DERIVED_DIR, pathname.slice(6), { maxAge: 3600 })
    if (pathname.startsWith('/raw/')) return await serveStatic(req, res, RAW_DIR, pathname.slice(5), { maxAge: 3600 })
    return await serveStatic(req, res, DIST, pathname.slice(1), { fallbackIndex: true, maxAge: pathname.startsWith('/assets/') ? 31536000 : 0 })
  } catch (e) {
    console.error('[error]', pathname, e.message)
    if (!res.headersSent) sendJson(req, res, 502, { error: 'upstream unavailable', detail: e.message })
    else res.end()
  }
})

const shouldOpenBrowser = process.platform === 'win32' && process.argv.includes('--open')

function openBrowser() {
  const url = `http://localhost:${PORT}`
  // Prefer an installed browser executable: some Windows URL handlers silently fail.
  const browser = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].find(file => fs.existsSync(file))
  return new Promise(resolve => {
    const child = browser
      ? spawn(browser, ['--new-window', url], { windowsHide: true, detached: true, stdio: 'ignore' })
      : spawn('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`,
      ], { windowsHide: true, detached: true, stdio: 'ignore' })
    child.once('error', error => {
      console.warn(`  浏览器未能自动打开，请手动访问 ${url}：${error.message}`)
      resolve()
    })
    child.once('spawn', resolve)
    child.unref()
  })
}

// A second double-click reopens the running app instead of starting another server.
if (shouldOpenBrowser) {
  try {
    const response = await fetchWithTimeout(`http://localhost:${PORT}/api/health`, {}, 1500)
    const health = await response.json()
    if (response.ok && health.app === 'chiyoda-twin' && health.ok) {
      console.log(`  Chiyoda Twin 已在运行，正在打开 http://localhost:${PORT}`)
      await openBrowser()
      process.exit(0)
    }
  } catch { /* No existing instance; start the server below. */ }
}

await restoreBikeHistory()
snapshotBikes()
setInterval(snapshotBikes, 5 * 60_000)   // 每 5 分钟存一次单车快照

server.listen(PORT, () => {
  console.log(`\n  Chiyoda Twin 已启动：http://localhost:${PORT}\n`)
  if (shouldOpenBrowser) openBrowser()
  if (!fs.existsSync(DIST)) console.log('  ⚠ 未找到 web/dist，请先在 web 目录执行 npm run build，或用 npm run dev 开发模式')
})
