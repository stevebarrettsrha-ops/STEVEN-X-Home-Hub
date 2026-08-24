/* ============================================================================
   STEVEN X — HOME HUB  ·  app downloader
   ----------------------------------------------------------------------------
   Downloads every app listed in apps.json from GitHub into  apps/<id>/  so the
   hub can host the whole collection. Zero dependencies — only Node built-ins.

     node get-apps.js            install anything that's missing
     node get-apps.js --update   also refresh apps that are already installed
     node get-apps.js reel       only the named app(s)

   How it fetches:
     1. If git is installed  ->  shallow "git clone" (updates keep your media:
        a reset only touches the app's own files, never your movies/games).
     2. Otherwise            ->  downloads the repo ZIP from GitHub and unpacks
        it with a built-in extractor (files are overwritten in place, anything
        you added — movies, ROMs, music — is left alone).

   One-time internet is required; after that the whole hub runs offline.
   ============================================================================ */

"use strict";

const fs    = require("fs");
const path  = require("path");
const http  = require("http");
const https = require("https");
const tls   = require("tls");
const zlib  = require("zlib");
const { spawnSync } = require("child_process");

const ROOT     = __dirname;
const APPS_DIR = path.join(ROOT, "apps");
const MANIFEST = path.join(ROOT, "apps.json");

/* ---- tiny console helpers -------------------------------------------------- */
const say  = m => console.log("  " + m);
const rule = () => console.log("  " + "-".repeat(60));

/* ---- git availability ------------------------------------------------------- */
function hasGit() {
  try { return spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0; }
  catch (e) { return false; }
}

/* ---- HTTPS download (follows redirects, supports HTTPS_PROXY) --------------- */
function fetchBuffer(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const u = new URL(url);
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || "";

    const onResponse = res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchBuffer(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " for " + url));
      }
      const total = parseInt(res.headers["content-length"] || "0", 10);
      const chunks = [];
      let got = 0, lastPct = -1;
      res.on("data", c => {
        chunks.push(c); got += c.length;
        if (total) {
          const pct = Math.floor(got / total * 100);
          if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; process.stdout.write("\r     downloading… " + pct + "%   "); }
        } else if (got - lastPct > 4 * 1024 * 1024) {
          lastPct = got; process.stdout.write("\r     downloading… " + (got / 1048576).toFixed(0) + " MB   ");
        }
      });
      res.on("end", () => { process.stdout.write("\r" + " ".repeat(40) + "\r"); resolve(Buffer.concat(chunks)); });
      res.on("error", reject);
    };

    if (proxy) {
      // Tunnel through an HTTP(S) proxy with CONNECT, then speak TLS inside it.
      const p = new URL(proxy);
      const connectReq = http.request({
        host: p.hostname, port: p.port || 80, method: "CONNECT",
        path: u.hostname + ":443", headers: { Host: u.hostname + ":443" },
      });
      connectReq.on("connect", (r, socket) => {
        if (r.statusCode !== 200) return reject(new Error("Proxy CONNECT failed: HTTP " + r.statusCode));
        const req = https.request({
          host: u.hostname, path: u.pathname + u.search, method: "GET",
          headers: { "User-Agent": "steven-x-home-hub", Host: u.hostname },
          createConnection: () => tls.connect({ socket, servername: u.hostname }),
        }, onResponse);
        req.on("error", reject);
        req.end();
      });
      connectReq.on("error", reject);
      connectReq.end();
    } else {
      https.get(url, { headers: { "User-Agent": "steven-x-home-hub" } }, onResponse).on("error", reject);
    }
  });
}

/* ---- minimal ZIP extractor (stored + deflate entries) ----------------------- */
function unzipInto(buf, destDir, stripTop) {
  // Find the End Of Central Directory record (scan the last 64 KB).
  let eocd = -1;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no central directory)");
  const count  = buf.readUInt16LE(eocd + 10);
  let offset   = buf.readUInt32LE(eocd + 16);
  let written  = 0;

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error("Bad central directory entry");
    const method   = buf.readUInt16LE(offset + 10);
    const csize    = buf.readUInt32LE(offset + 20);
    const nameLen  = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const cmtLen   = buf.readUInt16LE(offset + 32);
    const lho      = buf.readUInt32LE(offset + 42);
    let name = buf.toString("utf8", offset + 46, offset + 46 + nameLen).replace(/\\/g, "/");
    offset += 46 + nameLen + extraLen + cmtLen;

    if (stripTop) {
      const slash = name.indexOf("/");
      if (slash === -1) continue;              // the top-level folder itself
      name = name.slice(slash + 1);
      if (!name) continue;
    }
    // Refuse anything that would escape the destination.
    const dest = path.normalize(path.join(destDir, name));
    if (dest !== destDir && !dest.startsWith(destDir + path.sep)) continue;

    if (name.endsWith("/")) { fs.mkdirSync(dest, { recursive: true }); continue; }

    // Local header gives the real start of this entry's data.
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error("Bad local header for " + name);
    const lNameLen  = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    const raw   = buf.subarray(start, start + csize);

    let data;
    if (method === 0)      data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error("Unsupported compression (method " + method + ") in " + name);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    written++;
  }
  return written;
}

/* ---- compatibility patches -------------------------------------------------- */
// REEL hard-codes port 8080, which the hub itself uses. Teach it to honour the
// PORT environment variable so the hub can run it on its own port. Re-applied
// safely after every update; a no-op once the line is already env-aware.
function applyPatches(app, dir) {
  if (app.id !== "reel") return;
  const file = path.join(dir, app.serverFile || "server.js");
  let src;
  try { src = fs.readFileSync(file, "utf8"); } catch (e) { return; }
  if (/const PORT\s*=\s*process\.env\.PORT/.test(src)) return;
  const patched = src.replace(
    /const PORT\s*=\s*(\d+)\s*;/,
    "const PORT       = process.env.PORT ? parseInt(process.env.PORT, 10) : $1;"
  );
  if (patched !== src) {
    fs.writeFileSync(file, patched);
    say("   · patched " + app.id + "/" + (app.serverFile || "server.js") + " to accept the hub's port");
  }
}

/* ---- install / update one app ----------------------------------------------- */
function isInstalled(dir) {
  try { return fs.readdirSync(dir).filter(f => f !== ".git").length > 0; }
  catch (e) { return false; }
}

async function installApp(app, useGit, update) {
  const dir = path.join(APPS_DIR, app.id);
  const url = "https://github.com/" + app.repo;
  const installed = isInstalled(dir);

  if (installed && !update) {
    say("✔ " + app.name.padEnd(14) + " already installed  (apps/" + app.id + "/)");
    applyPatches(app, dir);
    return "kept";
  }

  if (useGit) {
    if (installed && fs.existsSync(path.join(dir, ".git"))) {
      say("↻ " + app.name.padEnd(14) + " updating from " + app.repo + " …");
      let r = spawnSync("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { stdio: "inherit" });
      if (r.status === 0) r = spawnSync("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("git update failed for " + app.repo);
    } else if (!installed) {
      say("⇣ " + app.name.padEnd(14) + " cloning " + app.repo + " …");
      const r = spawnSync("git", ["clone", "--depth", "1", url, dir], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("git clone failed for " + app.repo);
    } else {
      // Installed from ZIP earlier (no .git): refresh by unpacking over the top.
      say("↻ " + app.name.padEnd(14) + " refreshing from ZIP (your added files are kept)…");
      const buf = await fetchBuffer("https://codeload.github.com/" + app.repo + "/zip/HEAD");
      unzipInto(buf, dir, true);
    }
  } else {
    say("⇣ " + app.name.padEnd(14) + " downloading ZIP of " + app.repo + " …");
    fs.mkdirSync(dir, { recursive: true });
    const buf = await fetchBuffer("https://codeload.github.com/" + app.repo + "/zip/HEAD");
    const files = unzipInto(buf, dir, true);
    say("   · unpacked " + files + " files");
  }

  applyPatches(app, dir);
  return installed ? "updated" : "installed";
}

/* ---- main -------------------------------------------------------------------- */
(async function main() {
  const argv   = process.argv.slice(2);
  const update = argv.includes("--update") || argv.includes("-u");
  const picked = argv.filter(a => !a.startsWith("-"));

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }
  catch (e) { console.error("\n  Could not read apps.json next to get-apps.js: " + e.message + "\n"); process.exit(1); }

  let apps = (manifest.apps || []).filter(a => a.enabled !== false);
  if (picked.length) {
    apps = apps.filter(a => picked.includes(a.id));
    if (!apps.length) {
      console.error("\n  No app matches: " + picked.join(", "));
      console.error("  Known apps: " + (manifest.apps || []).map(a => a.id).join(", ") + "\n");
      process.exit(1);
    }
  }

  console.log("");
  say("STEVEN X — downloading apps into apps/ …");
  rule();

  fs.mkdirSync(APPS_DIR, { recursive: true });
  const useGit = hasGit();
  if (!useGit) say("(git not found — using ZIP downloads instead)");

  let ok = 0, failed = [];
  for (const app of apps) {
    try { await installApp(app, useGit, update); ok++; }
    catch (e) {
      failed.push(app.id);
      say("✘ " + app.name.padEnd(14) + " FAILED: " + e.message);
    }
  }

  rule();
  if (failed.length) {
    say(ok + " app(s) ready, " + failed.length + " failed: " + failed.join(", "));
    say("Check your internet connection and run this again — it resumes safely.");
    process.exitCode = 1;
  } else {
    say("All " + ok + " apps are ready. Start the hub:   node server.js");
  }
  console.log("");
})();
