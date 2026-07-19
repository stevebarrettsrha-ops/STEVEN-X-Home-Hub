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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const ROOT = __dirname;                       // folder this file lives in

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
  ".webp":"image/webp", ".gif":"image/gif",
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

const server = http.createServer((req, res) => {
  let pathname = "/";
  try { pathname = new URL(req.url, "http://x").pathname; } catch (e) {}

  // ---- health check --------------------------------------------------------
  if (pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, name: "STEVEN X", version: "1.0" }));
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
  console.log("   Leave this window OPEN while anyone is using the hub.");
  console.log("   Press Ctrl+C to stop.");
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
