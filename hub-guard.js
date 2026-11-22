/* ============================================================================
   STEVEN X — HOME HUB  ·  app guard
   ----------------------------------------------------------------------------
   Loaded into each full app the hub starts (REEL, ARCADE, PACKR …) — but only
   while the PIN lock is on. It makes the app listen on this computer only, on
   a private port, so nothing on the Wi-Fi can reach it directly. The hub then
   answers on the app's usual port, checks the PIN, and passes requests through.

   The app itself is not modified and still believes it is on its usual port,
   so every address it prints or shows (QR codes, pairing links) stays correct.
   ============================================================================ */
"use strict";
const net = require("net");

let ports = {};
try { ports = JSON.parse(process.env.HUB_GUARD_PORTS || "{}"); } catch (e) {}

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
  const first = args[0];
  let opts = null;
  if (first && typeof first === "object") {
    // listen({ port, host }) — leave pipes, file descriptors and handles alone
    if (first.path === undefined && first.fd === undefined && first._handle === undefined && first.handle === undefined) {
      opts = Object.assign({}, first);
    }
  } else if (first === undefined || typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    // listen(port, host?, backlog?)
    opts = { port: Number(first || 0) };
    const backlog = args.slice(1).find(a => typeof a === "number");
    if (backlog !== undefined) opts.backlog = backlog;
  }
  if (!opts) return listen.apply(this, cb ? args.concat(cb) : args);

  const mapped = ports[String(opts.port)];
  if (mapped) opts.port = mapped;
  opts.host = "127.0.0.1";
  delete opts.ipv6Only;
  return cb ? listen.call(this, opts, cb) : listen.call(this, opts);
};
