/* ============================================================================
   STEVEN X — HOME HUB  ·  home server
   ----------------------------------------------------------------------------
   A tiny, ZERO-DEPENDENCY media server for your house. It:
     1. Creates/scans one folder per system (movies, music, scripture, …).
     2. Hands the hub a live catalog of everything it finds (JSON API).
     3. Streams video & audio with HTTP "range" support, so seeking/scrubbing
        works instantly on phones, tablets and TVs.
     4. Serves the STEVEN X hub itself (index.html) to every device on your
        Wi-Fi — no internet required.

   It uses ONLY Node's built-in modules. There is nothing to "npm install";
   you only need Node.js itself (https://nodejs.org).

   Run it:   node server.js         (or double-click a start-* launcher)
   ============================================================================ */

const http = require("http");
const https = require("https");
const net  = require("net");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const ROOT = __dirname;                       // folder this file lives in
const APPS_DIR = path.join(ROOT, "apps");     // full apps live here (see get-apps.js)

// ---- full apps (REEL, ARCADE, …) — registry comes from apps.json -----------
let APPS = [], CATEGORIES = [];
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "apps.json"), "utf8"));
  APPS       = (manifest.apps || []).filter(a => a.enabled !== false);
  CATEGORIES = manifest.categories || [];
} catch (e) { console.error("  (apps.json missing or invalid — full apps disabled: " + e.message + ")"); }

// Apps grouped by the categories declared in apps.json (in declared order);
// anything with an unknown category lands in a trailing "Other" group.
function appGroups() {
  const known  = new Set(CATEGORIES.map(c => c.id));
  const groups = CATEGORIES.map(c => ({ id: c.id, name: c.name, apps: APPS.filter(a => a.category === c.id) }));
  const rest   = APPS.filter(a => !known.has(a.category));
  if (rest.length) groups.push({ id: "other", name: "Other", apps: rest });
  return groups.filter(g => g.apps.length);
}

const appDir       = a => path.join(APPS_DIR, a.id, a.subdir || "");
const appEntry     = a => a.type === "node" ? path.join(appDir(a), a.serverFile || "server.js")
                                            : path.join(appDir(a), "index.html");
const appInstalled = a => { try { return fs.existsSync(appEntry(a)); } catch (e) { return false; } };

// Each hub "system" maps to a folder of the same name and a set of file types.
// Keep these in sync with the SYSTEMS list inside index.html.
const SYSTEMS = {
  "scripture-game": ["html", "htm"],
  "movies":         ["mp4", "m4v", "webm", "mov", "ogv", "mkv", "avi"],
  "scripture":      ["pdf", "txt", "md", "html", "htm", "epub"],
  "music":          ["mp3", "wav", "ogg", "m4a", "flac", "aac", "opus"],
  "books":          ["pdf", "txt", "md", "html", "htm", "epub"],
  "games":          ["html", "htm"],
};

const MIME = {
  ".html":"text/html; charset=utf-8", ".htm":"text/html; charset=utf-8",
  ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".txt":"text/plain; charset=utf-8", ".md":"text/plain; charset=utf-8",
  ".vtt":"text/vtt", ".svg":"image/svg+xml", ".pdf":"application/pdf",
  ".epub":"application/epub+zip",
  ".mp4":"video/mp4", ".m4v":"video/x-m4v", ".webm":"video/webm",
  ".mov":"video/quicktime", ".ogv":"video/ogg", ".mkv":"video/x-matroska",
  ".avi":"video/x-msvideo",
  ".mp3":"audio/mpeg", ".wav":"audio/wav", ".ogg":"audio/ogg",
  ".m4a":"audio/mp4", ".flac":"audio/flac", ".aac":"audio/aac", ".opus":"audio/ogg",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png",
  ".webp":"image/webp", ".gif":"image/gif", ".ico":"image/x-icon",
  ".webmanifest":"application/manifest+json",
  ".wasm":"application/wasm", ".zip":"application/zip",
  ".ttf":"font/ttf", ".otf":"font/otf", ".woff":"font/woff", ".woff2":"font/woff2",
  ".xml":"application/xml", ".data":"application/octet-stream",
  ".mem":"application/octet-stream", ".map":"application/json",
};
// Files in the hub folder that browsers may fetch directly. Add a name here if
// the hub pages ever need another file (an icon, a stylesheet …).
const HUB_FILES = new Set(["index.html", "launch.html", "pad-bridge.js", "manifest.webmanifest",
                           "icon-192.png", "icon-512.png", "apple-touch-icon.png"]);
// The home-screen icon + manifest stay reachable even when the PIN lock is on,
// so "Add to Home Screen" works (they contain nothing private).
const PUBLIC_FILES = new Set(["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]);

const mimeOf = p => MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
const extOf  = n => (n.includes(".") ? n.split(".").pop().toLowerCase() : "");

// Make sure every system folder exists so people know where to drop files.
for (const id of Object.keys(SYSTEMS)) {
  try { fs.mkdirSync(path.join(ROOT, id), { recursive: true }); } catch (e) {}
}

// Recursively collect matching files under a folder (depth-capped, count-capped).
// Returns [{ name, path (relative), url, ext }].
function walk(sysId, baseDir, rel, exts, out, depth) {
  if (depth > 5 || out.length > 800) return out;
  let entries = [];
  try { entries = fs.readdirSync(path.join(baseDir, rel), { withFileTypes: true }); }
  catch (e) { return out; }
  for (const e of entries) {
    if (out.length > 800) break;
    if (e.name.startsWith(".")) continue;
    if (e.isFile() && e.name.toLowerCase() === "readme.txt") continue;  // skip the drop-in guide
    const childRel = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      walk(sysId, baseDir, childRel, exts, out, depth + 1);
    } else if (exts.includes(extOf(e.name))) {
      const url = "media/" + encodeURIComponent(sysId) + "/" +
                  childRel.split("/").map(encodeURIComponent).join("/");
      out.push({ name: e.name, path: childRel, url, ext: extOf(e.name) });
    }
  }
  return out;
}

// Send a file with Range support (partial content) so media can seek.
function serveFile(req, res, full) {
  let stat;
  try { stat = fs.statSync(full); } catch (e) { res.writeHead(404); return res.end("Not found"); }
  if (stat.isDirectory()) {
    const idx = path.join(full, "index.html");
    if (fs.existsSync(idx)) return serveFile(req, res, idx);
    res.writeHead(404); return res.end("Not found");
  }
  const type = mimeOf(full);
  // Revalidate-on-use caching: browsers keep their copy and just ask "changed?"
  // — an unchanged file costs a tiny 304 instead of a full re-download, and an
  // updated file (new movie, refreshed app) is picked up immediately.
  const etag = '"' + stat.size.toString(16) + "-" + Math.floor(stat.mtimeMs).toString(16) + '"';
  const cache = { "ETag": etag, "Last-Modified": stat.mtime.toUTCString(), "Cache-Control": "no-cache" };
  const inm = req.headers["if-none-match"];
  const ims = req.headers["if-modified-since"];
  const fresh = inm ? inm.split(",").some(t => t.trim().replace(/^W\//, "") === etag)
                    : (ims ? Math.floor(stat.mtimeMs / 1000) * 1000 <= Date.parse(ims) : false);
  if (fresh) { res.writeHead(304, cache); return res.end(); }
  // A Range request tied to an older copy (If-Range) gets the whole new file.
  const ifRange = req.headers["if-range"];
  const range = (ifRange && ifRange !== etag && ifRange !== cache["Last-Modified"]) ? null : req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end   = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end(); }
    res.writeHead(206, {
      ...cache,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": type,
    });
    fs.createReadStream(full, { start, end }).on("error", () => res.end()).pipe(res);
  } else {
    res.writeHead(200, { ...cache, "Content-Length": stat.size, "Content-Type": type, "Accept-Ranges": "bytes" });
    fs.createReadStream(full).on("error", () => res.end()).pipe(res);
  }
}

// Games with a "pad" block in apps.json get the hub's controller + touch bridge
// (pad-bridge.js) added to their pages as they are served. The game's files on
// disk are never touched, so updating an app can't undo it. Returns false when
// the file isn't a page, and the caller serves it the normal way.
function servePageWithPad(req, res, full, app) {
  let stat;
  try {
    stat = fs.statSync(full);
    if (stat.isDirectory()) { full = path.join(full, "index.html"); stat = fs.statSync(full); }
  } catch (e) { return false; }
  if (!/\.html?$/i.test(full) || stat.size > 20 * 1024 * 1024) return false;
  let html;
  try { html = fs.readFileSync(full, "utf8"); } catch (e) { return false; }
  const config = JSON.stringify(app.pad).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
  const tag = "<script src=\"/pad-bridge.js\" data-pad='" + config + "'></script>\n";
  const at = html.search(/<\/head>/i);
  html = at === -1 ? tag + html : html.slice(0, at) + tag + html.slice(at);
  const body = Buffer.from(html, "utf8");
  const etag = '"' + crypto.createHash("sha1").update(body).digest("hex").slice(0, 20) + '"';
  const headers = { "ETag": etag, "Cache-Control": "no-cache", "Content-Type": "text/html; charset=utf-8" };
  if ((req.headers["if-none-match"] || "").split(",").some(t => t.trim().replace(/^W\//, "") === etag)) {
    res.writeHead(304, headers); res.end(); return true;
  }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

// decodeURIComponent throws on malformed input like "%zz" — never let a bad
// link take the server down. Returns null instead.
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return null; }
}

// Resolve a request path safely inside `base` (blocks ../ traversal, and any
// hidden file or folder such as .git or .env). Returns null if not allowed.
function safeResolve(base, relPath) {
  let decoded = safeDecode(relPath);
  if (decoded === null || decoded.includes("\0")) return null;
  decoded = decoded.replace(/\\/g, "/");
  if (decoded.split("/").some(seg => seg.startsWith(".") && seg !== ".")) return null;
  const full = path.normalize(path.join(base, decoded));
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

/* ============================================================================
   APP SUPERVISOR — starts each Node-based app (REEL, ARCADE, PACKR …) as a
   child process on its own port, restarts it if it crashes, and shuts every-
   thing down together on Ctrl+C. Static apps are served by the hub directly.
   ============================================================================ */
const children = {};   // app.id -> { proc, restarts, state: starting|running|failed|stopped }

function startApp(app) {
  if (!appInstalled(app)) return;
  const c = children[app.id] = children[app.id] || { restarts: 0 };
  // With the PIN lock on, the app is moved to a private port on this computer
  // only, and the hub takes over its usual port to check the PIN (see APP
  // FRONT DOORS below). First start: pick the private port, open the door.
  if (PIN && !c.privatePort) {
    c.state = "starting";
    return freePort(port => {
      if (!port) { c.state = "failed"; return console.error("  [" + app.id + "] could not reserve a private port"); }
      c.privatePort = port;
      openFrontDoor(app, c);
      startApp(app);
    });
  }
  const entry = appEntry(app);
  const env = Object.assign({}, process.env);
  env[app.portEnv || "PORT"] = String(app.port);
  const args = [entry];
  if (PIN) {
    args.unshift("--require", path.join(ROOT, "hub-guard.js"));
    env.HUB_GUARD_PORTS = JSON.stringify({ [app.port]: c.privatePort });
    delete env.ARCADE_HTTPS;          // the hub serves ARCADE's HTTPS port itself (PIN-checked)
  }
  const proc = spawn(process.execPath, args, { cwd: appDir(app), env });
  c.proc = proc; c.state = "starting";

  const tag = "[" + app.id + "] ";
  const relay = data => {
    for (const line of String(data).split("\n")) if (line.trim()) console.log("  " + tag + line);
  };
  proc.stdout.on("data", relay);
  proc.stderr.on("data", relay);
  proc.on("exit", (code, sig) => {
    if (shuttingDown) { c.state = "stopped"; return; }
    c.state = "failed";
    console.error("  " + tag + "exited (" + (sig || code) + ")");
    if (c.restarts < 5) {
      c.restarts++;
      const wait = Math.min(30, 2 ** c.restarts);
      console.error("  " + tag + "restarting in " + wait + "s (attempt " + c.restarts + "/5)");
      setTimeout(() => startApp(app), wait * 1000);
    } else {
      console.error("  " + tag + "gave up after 5 restarts — fix the app, then restart the hub");
    }
  });
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n  Shutting down the hub and every app…");
  for (const id of Object.keys(children)) {
    const c = children[id];
    if (c.proc && c.proc.exitCode === null) { try { c.proc.kill(); } catch (e) {} }
  }
  server.close();
  for (const d of frontDoors) { try { d.close(); } catch (e) {} }
  // Any app that ignores the polite stop gets force-killed before we leave —
  // no orphaned servers holding ports after the hub window closes.
  setTimeout(() => {
    for (const id of Object.keys(children)) {
      const c = children[id];
      if (c.proc && c.proc.exitCode === null) { try { c.proc.kill("SIGKILL"); } catch (e) {} }
    }
    process.exit(0);
  }, 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Ask a child app whether it is answering HTTP yet (used by the loading screens).
function probeApp(app, cb) {
  const port = (children[app.id] || {}).privatePort || app.port;
  const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, res => {
    res.resume();
    cb(res.statusCode > 0);
  });
  req.on("timeout", () => { req.destroy(); cb(false); });
  req.on("error", () => cb(false));
}

// Is this request coming from the server machine itself? (PACKR is local-only.)
function requestIsLocal(req) {
  const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1") return true;
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name] || []) if (net.address === ip) return true;
  return false;
}

/* ============================================================================
   OPTIONAL PIN LOCK — for when guests are on your Wi-Fi.
   Off by default. Turn it on by putting a PIN in a file called  pin.txt  next
   to server.js (or by starting with HUB_PIN=1234). Each device then types the
   PIN once and is remembered for 30 days; the server computer itself is never
   asked. Delete pin.txt (and restart) to turn the lock off again.
   ============================================================================ */
let PIN = (process.env.HUB_PIN || "").trim();
if (!PIN) {
  try { PIN = fs.readFileSync(path.join(ROOT, "pin.txt"), "utf8").split(/\r?\n/)[0].trim(); } catch (e) {}
}
const PIN_COOKIE = "stevenx_hub";
const PIN_DAYS   = 30;
// What a remembered device carries. It is derived from the PIN, so it survives
// restarts of the hub, and changing the PIN signs every device out.
const PIN_TOKEN  = PIN ? crypto.createHmac("sha256", PIN).update("stevenx-home-hub-session").digest("hex") : "";
const sameText   = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function hasPinCookie(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i !== -1 && part.slice(0, i).trim() === PIN_COOKIE) return sameText(part.slice(i + 1).trim(), PIN_TOKEN);
  }
  return false;
}

// Wrong-PIN guard: 5 free tries per device, then a wait that doubles each time
// (30s, 1m, 2m … up to 15m), so a 4-digit PIN can't simply be guessed through.
const pinFails = new Map();   // ip -> { n, until }
function pinWait(ip) {
  const f = pinFails.get(ip);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function pinFailed(ip) {
  if (pinFails.size > 2000) pinFails.clear();
  const f = pinFails.get(ip) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) f.until = Date.now() + Math.min(900, 30 * 2 ** (f.n - 5)) * 1000;
  pinFails.set(ip, f);
}

function handleUnlock(req, res) {
  const ip = req.socket.remoteAddress || "";
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  if (req.method !== "POST") return json(405, { ok: false });
  const wait = pinWait(ip);
  if (wait) return json(429, { ok: false, wait });
  let body = "", tooBig = false;
  req.on("data", chunk => {
    if (tooBig) return;
    body += chunk;
    if (body.length > 2048) { tooBig = true; json(413, { ok: false }); req.destroy(); }
  });
  req.on("end", () => {
    if (tooBig) return;
    let pin = "";
    try { pin = String((JSON.parse(body) || {}).pin || "").trim(); } catch (e) {}
    if (pin && sameText(pin, PIN)) {
      pinFails.delete(ip);
      res.writeHead(200, {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "Set-Cookie": PIN_COOKIE + "=" + PIN_TOKEN + "; Path=/; Max-Age=" + PIN_DAYS * 86400 + "; HttpOnly; SameSite=Lax",
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    pinFailed(ip);
    json(401, { ok: false, wait: pinWait(ip) });
  });
}

const LOCK_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#060b15">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>STEVEN X — Home Hub</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;background:#060b15;color:#e9eefb;
  display:grid;place-items:center;padding:24px}
form{width:100%;max-width:340px;background:#101a2d;border:1px solid rgba(255,255,255,.07);border-radius:16px;
  padding:30px 26px;text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.45)}
img{width:96px;height:96px;border-radius:22px;margin-bottom:16px}
h1{font-size:15px;letter-spacing:.3em;font-weight:800}
p{font-size:13px;color:#8ea3c4;margin:8px 0 20px}
input{width:100%;font:inherit;font-size:26px;letter-spacing:.4em;text-align:center;padding:12px;border-radius:12px;
  border:1px solid rgba(255,255,255,.14);background:#060b15;color:#e9eefb}
input:focus{outline:2px solid #5cb872;outline-offset:2px}
button{width:100%;margin-top:14px;font:inherit;font-weight:700;padding:13px;border:0;border-radius:12px;
  background:#5cb872;color:#07160c;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
#msg{min-height:18px;margin-top:14px;font-size:12.5px;color:#ff8f8f}
</style></head><body>
<form id="f" autocomplete="off">
  <img src="/icon-192.png" alt="">
  <h1>STEVEN X</h1>
  <p>Enter the house PIN to open the Home Hub.</p>
  <input id="pin" type="password" inputmode="numeric" maxlength="32" aria-label="PIN" autofocus>
  <button id="go">Unlock</button>
  <div id="msg" role="alert"></div>
</form>
<script>
const f = document.getElementById("f"), pin = document.getElementById("pin"),
      go = document.getElementById("go"), msg = document.getElementById("msg");
let timer = null;
function hold(secs){
  clearInterval(timer);
  go.disabled = true;
  const tick = () => {
    if (secs <= 0) { clearInterval(timer); go.disabled = false; msg.textContent = ""; return; }
    msg.textContent = "Too many wrong tries — wait " + secs + "s";
    secs--;
  };
  tick(); timer = setInterval(tick, 1000);
}
f.addEventListener("submit", async e => {
  e.preventDefault();
  if (go.disabled || !pin.value) return;
  go.disabled = true; msg.textContent = "";
  try {
    const r = await fetch("/api/unlock", { method:"POST", headers:{ "Content-Type":"application/json" },
                                           body: JSON.stringify({ pin: pin.value }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) return location.reload();
    pin.value = ""; pin.focus();
    if (j.wait) return hold(j.wait);
    msg.textContent = "That PIN isn't right — try again";
  } catch (err) { msg.textContent = "Couldn't reach the hub — check your Wi-Fi"; }
  go.disabled = false;
});
</script>
</body></html>`;

// Tell a device it has to unlock first: the PIN page for a browser, JSON otherwise.
function sendLocked(req, res) {
  const wantsPage = /text\/html/.test(req.headers.accept || "") && (req.method === "GET" || req.method === "HEAD");
  if (wantsPage) {
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(req.method === "HEAD" ? "" : LOCK_PAGE);
  }
  res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: "locked" }));
}

/* ============================================================================
   APP FRONT DOORS — the PIN for REEL, ARCADE and PACKR.
   Those apps run their own servers on their own ports, so the hub's PIN check
   never saw their traffic. With the PIN on, each app is started behind
   hub-guard.js (private port, this computer only) and the hub listens on the
   app's public port instead: it checks the PIN, then passes the request —
   streaming, seeking, uploads and WebSockets included — straight through.
   The browser's PIN cookie is shared by every port on the hub's address, so
   unlocking the hub unlocks the apps too. Nothing here runs with the PIN off.
   ============================================================================ */
const frontDoors = [];

function freePort(cb) {
  const probe = net.createServer();
  probe.once("error", () => cb(0));
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => cb(port)); });
}

// The hub's own cookie is no business of the app behind the door.
function withoutPinCookie(cookie) {
  return String(cookie || "").split(";").filter(p => p.split("=")[0].trim() !== PIN_COOKIE).join(";").trim();
}

// Apps marked "localOnly" (PACKR) are for the server computer; other devices
// may only fetch the paths listed in the app's "lanPaths" (finished downloads).
function lanMayReach(app, req, pathname) {
  if (!app.localOnly) return true;
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  return (app.lanPaths || []).some(p => pathname.startsWith(p));
}

function openFrontDoor(app, c) {
  const tag = "  [" + app.id + "] ";

  const onRequest = (req, res) => {
    let pathname = "/";
    try { pathname = new URL(req.url, "http://x").pathname; } catch (e) {}
    const local = requestIsLocal(req);
    if (!local && !hasPinCookie(req)) {
      if (pathname === "/api/unlock") return handleUnlock(req, res);
      return sendLocked(req, res);
    }
    if (!local && !lanMayReach(app, req, pathname)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(app.name + " is used on the server computer itself.");
    }
    const headers = Object.assign({}, req.headers);
    const cookie = withoutPinCookie(headers.cookie);
    if (cookie) headers.cookie = cookie; else delete headers.cookie;
    const upstream = http.request(
      { host: "127.0.0.1", port: c.privatePort, method: req.method, path: req.url, headers },
      ures => { res.writeHead(ures.statusCode, ures.statusMessage, ures.headers); ures.pipe(res); }
    );
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(app.name + " is still starting — try again in a moment.");
    });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  };

  // WebSockets (ARCADE's phone-as-controller link) get the same check.
  const onUpgrade = (req, socket, head) => {
    let pathname = "/";
    try { pathname = new URL(req.url, "http://x").pathname; } catch (e) {}
    const local = requestIsLocal(req);
    if ((!local && !hasPinCookie(req)) || (!local && !lanMayReach(app, req, pathname))) return socket.destroy();
    const upstream = net.connect(c.privatePort, "127.0.0.1", () => {
      let raw = req.method + " " + req.url + " HTTP/" + req.httpVersion + "\r\n";
      for (let i = 0; i < req.rawHeaders.length; i += 2) raw += req.rawHeaders[i] + ": " + req.rawHeaders[i + 1] + "\r\n";
      upstream.write(raw + "\r\n");
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
  };

  const open = (srv, port, label) => {
    srv.requestTimeout = 0;                         // long uploads and streams are normal here
    srv.on("request", onRequest);
    srv.on("upgrade", onUpgrade);
    srv.on("error", err => console.error(tag + label + " port " + port + " could not be opened: " + (err && err.code === "EADDRINUSE" ? "already in use" : err.message)));
    srv.listen(port);
    frontDoors.push(srv);
  };
  open(http.createServer(), app.port, "PIN door on");

  // ARCADE's optional HTTPS mode (ARCADE_HTTPS=1, for Java games over the LAN):
  // the hub serves that port too, with ARCADE's own certificate.
  if (app.id === "arcade" && process.env.ARCADE_HTTPS === "1") {
    try {
      const key  = fs.readFileSync(path.join(appDir(app), "certs", "key.pem"));
      const cert = fs.readFileSync(path.join(appDir(app), "certs", "cert.pem"));
      open(https.createServer({ key, cert }), parseInt(process.env.HTTPS_PORT, 10) || 8443, "HTTPS PIN door on");
    } catch (e) {
      console.error(tag + "ARCADE_HTTPS=1 but certs/key.pem + certs/cert.pem are missing — run  node make-cert.js  in apps/arcade");
    }
  }
}

// Last line of defence: whatever goes wrong inside one request, answer that
// request with an error and keep the hub (and every app) running.
const server = http.createServer((req, res) => {
  try { return handleRequest(req, res); }
  catch (e) {
    console.error("  request failed: " + req.url + " — " + (e && e.message ? e.message : e));
    try {
      if (!res.headersSent) res.writeHead(500);
      res.end("Server error");
    } catch (e2) {}
  }
});

function handleRequest(req, res) {
  let pathname = "/";
  try { pathname = new URL(req.url, "http://x").pathname; } catch (e) {}

  // ---- PIN lock (only when a PIN is set) -------------------------------------
  if (PIN) {
    if (pathname === "/api/unlock") return handleUnlock(req, res);
    const open = PUBLIC_FILES.has(pathname.slice(1)) || requestIsLocal(req) || hasPinCookie(req);
    if (!open) return sendLocked(req, res);
  }

  // ---- health check --------------------------------------------------------
  if (pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, name: "STEVEN X", version: "1.0" }));
  }

  // ---- full apps: registry + live status ------------------------------------
  if (pathname === "/api/apps") {
    const list = APPS.map(a => ({
      id: a.id, name: a.name, title: a.title, tagline: a.tagline, desc: a.desc,
      category: a.category || null,
      type: a.type, port: a.port || null, icon: a.icon, fx: a.fx,
      color1: a.color1, color2: a.color2, bootLines: a.bootLines || [],
      localOnly: !!a.localOnly,
      installed: appInstalled(a),
      state: a.type === "node" ? ((children[a.id] || {}).state || "stopped") : "static",
      url: a.type === "static" ? "/apps/" + a.id + "/" : null,   // node apps: client builds host:port
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ categories: CATEGORIES, apps: list, youAreLocal: requestIsLocal(req) }));
  }

  // Live readiness probe for one app — the launch screen polls this.
  if (pathname === "/api/app-status") {
    const id  = new URL(req.url, "http://x").searchParams.get("id") || "";
    const app = APPS.find(a => a.id === id);
    if (!app) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "unknown app" })); }
    const reply = ready => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id, installed: appInstalled(app), ready, state: app.type === "node" ? ((children[id] || {}).state || "stopped") : "static" }));
    };
    if (!appInstalled(app)) return reply(false);
    if (app.type === "static") return reply(true);
    return probeApp(app, ok => {
      const c = children[id];
      if (ok && c && c.state === "starting") { c.state = "running"; c.restarts = 0; }
      reply(ok);
    });
  }

  // Animated loading screen: /launch/<id>
  if (pathname.startsWith("/launch/")) {
    return serveFile(req, res, path.join(ROOT, "launch.html"));
  }

  // Static apps are hosted by the hub at /apps/<id>/…  (Node apps run on their
  // own ports, and their folders — profiles, saves — are never exposed here.)
  if (pathname.startsWith("/apps/")) {
    const rest  = pathname.slice("/apps/".length);
    const slash = rest.indexOf("/");
    const id    = safeDecode(slash === -1 ? rest : rest.slice(0, slash));
    const app   = APPS.find(a => a.id === id);
    if (!app || app.type !== "static") { res.writeHead(404); return res.end("Not found"); }
    if (slash === -1) { res.writeHead(302, { Location: "/apps/" + encodeURIComponent(id) + "/" }); return res.end(); }
    const base = path.join(APPS_DIR, app.id);
    const full = safeResolve(base, rest.slice(slash + 1));
    if (!full) { res.writeHead(403); return res.end("Forbidden"); }
    if (app.pad && servePageWithPad(req, res, full, app)) return;
    return serveFile(req, res, full);
  }

  // ---- library listing -----------------------------------------------------
  if (pathname === "/api/library") {
    const sys = new URL(req.url, "http://x").searchParams.get("sys") || "";
    const exts = Object.prototype.hasOwnProperty.call(SYSTEMS, sys) ? SYSTEMS[sys] : null;
    if (!exts) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "unknown system" })); }
    const items = walk(sys, path.join(ROOT, sys), "", exts, [], 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ sys, items }));
  }

  // ---- media files (range-enabled), locked to a single system folder -------
  if (pathname.startsWith("/media/")) {
    const rest = pathname.slice("/media/".length);
    const slash = rest.indexOf("/");
    const sys = safeDecode(slash === -1 ? rest : rest.slice(0, slash));
    if (!sys || !Object.prototype.hasOwnProperty.call(SYSTEMS, sys)) { res.writeHead(404); return res.end("Not found"); }
    const base = path.join(ROOT, sys);
    const full = safeResolve(base, slash === -1 ? "" : rest.slice(slash + 1));
    if (!full) { res.writeHead(403); return res.end("Forbidden"); }
    return serveFile(req, res, full);
  }

  // ---- the hub itself -------------------------------------------------------
  // Only the pages listed in HUB_FILES are served from the hub folder. The
  // server's own code, apps.json, the launchers and .git are never handed out;
  // libraries go through /media/ and apps through /apps/ above.
  if (pathname === "/") return serveFile(req, res, path.join(ROOT, "index.html"));
  const name = safeDecode(pathname.slice(1));
  if (name && HUB_FILES.has(name)) return serveFile(req, res, path.join(ROOT, name));
  res.writeHead(404); return res.end("Not found");
}

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  console.log("");
  console.log("  ============================================");
  console.log("   STEVEN X — HOME HUB  ·  home server running");
  console.log("  ============================================");
  console.log("");
  console.log("   On THIS computer:   http://localhost:" + PORT);
  if (ips.length) {
    console.log("");
    console.log("   On OTHER devices on your Wi-Fi:");
    for (const ip of ips) console.log("     http://" + ip + ":" + PORT);
  }
  console.log("");
  console.log("   Drop your files into these folders next to server.js:");
  console.log("     " + Object.keys(SYSTEMS).join("/  ") + "/");
  console.log("");

  // ---- start the full apps (listed by category) ----------------------------
  const missing = APPS.filter(a => !appInstalled(a));

  if (APPS.length) {
    console.log("   Apps (" + APPS.length + "):");
    for (const g of appGroups()) {
      console.log("     " + g.name);
      for (const a of g.apps) {
        if (!appInstalled(a)) { console.log("       · " + a.name.padEnd(15) + "not installed"); continue; }
        if (a.type === "node") { console.log("       · " + a.name.padEnd(15) + "starting on port " + a.port + " …"); startApp(a); }
        else console.log("       · " + a.name.padEnd(15) + "hosted at /apps/" + a.id + "/");
      }
    }
    if (missing.length) {
      console.log("");
      console.log("   " + missing.length + " app(s) missing — download them once with:   node get-apps.js");
    }
    console.log("");
  }

  if (PIN) {
    console.log("   PIN lock is ON — other devices type the PIN once (remembered " + PIN_DAYS + " days).");
    if (PIN.length < 4) console.log("   (That PIN is very short — 4 or more characters is safer.)");
    const own = APPS.filter(a => a.type === "node" && appInstalled(a));
    if (own.length) console.log("   It also covers " + own.map(a => a.name).join(", ") + " on their own ports.");
    console.log("");
  }
  console.log("   Leave this window OPEN while anyone is using the hub.");
  console.log("   Press Ctrl+C to stop everything.");
  console.log("");
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error("\n  Port " + PORT + " is already in use.");
    console.error("  Close whatever is using it, or start with another port:");
    console.error("     PORT=8090 node server.js\n");
  } else {
    console.error("\n  Server error:", err && err.message ? err.message : err, "\n");
  }
  process.exit(1);
});
