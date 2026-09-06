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
const fs   = require("fs");
const path = require("path");
const os   = require("os");
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
  ".wasm":"application/wasm", ".zip":"application/zip",
  ".ttf":"font/ttf", ".otf":"font/otf", ".woff":"font/woff", ".woff2":"font/woff2",
  ".xml":"application/xml", ".data":"application/octet-stream",
  ".mem":"application/octet-stream", ".map":"application/json",
};
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
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end   = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end(); }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": type,
    });
    fs.createReadStream(full, { start, end }).on("error", () => res.end()).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": stat.size, "Content-Type": type, "Accept-Ranges": "bytes" });
    fs.createReadStream(full).on("error", () => res.end()).pipe(res);
  }
}

// Resolve a request path safely inside `base` (blocks ../ traversal).
function safeResolve(base, relPath) {
  const decoded = decodeURIComponent(relPath).replace(/\\/g, "/");
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
  const entry = appEntry(app);
  const env = Object.assign({}, process.env);
  env[app.portEnv || "PORT"] = String(app.port);
  const proc = spawn(process.execPath, [entry], { cwd: appDir(app), env });
  const c = children[app.id] = children[app.id] || { restarts: 0 };
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
  const req = http.get({ host: "127.0.0.1", port: app.port, path: "/", timeout: 1500 }, res => {
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

const server = http.createServer((req, res) => {
  let pathname = "/";
  try { pathname = new URL(req.url, "http://x").pathname; } catch (e) {}

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
    const id    = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash));
    const app   = APPS.find(a => a.id === id);
    if (!app || app.type !== "static") { res.writeHead(404); return res.end("Not found"); }
    if (slash === -1) { res.writeHead(302, { Location: "/apps/" + encodeURIComponent(id) + "/" }); return res.end(); }
    const base = path.join(APPS_DIR, app.id);
    const full = safeResolve(base, rest.slice(slash + 1));
    if (!full) { res.writeHead(403); return res.end("Forbidden"); }
    return serveFile(req, res, full);
  }

  // ---- library listing -----------------------------------------------------
  if (pathname === "/api/library") {
    const sys = new URL(req.url, "http://x").searchParams.get("sys") || "";
    const exts = SYSTEMS[sys];
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
    const sys = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash));
    if (!SYSTEMS[sys]) { res.writeHead(404); return res.end("Not found"); }
    const base = path.join(ROOT, sys);
    const full = safeResolve(base, slash === -1 ? "" : rest.slice(slash + 1));
    if (!full) { res.writeHead(403); return res.end("Forbidden"); }
    return serveFile(req, res, full);
  }

  // ---- the hub + any other static file next to it --------------------------
  if (pathname === "/") return serveFile(req, res, path.join(ROOT, "index.html"));
  const full = safeResolve(ROOT, pathname.replace(/^\/+/, ""));
  if (!full) { res.writeHead(403); return res.end("Forbidden"); }
  // The apps/ tree is only reachable through the /apps/ route above (which
  // limits it to static apps) — never through this generic fallback.
  if (full === APPS_DIR || full.startsWith(APPS_DIR + path.sep)) { res.writeHead(404); return res.end("Not found"); }
  return serveFile(req, res, full);
});

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
