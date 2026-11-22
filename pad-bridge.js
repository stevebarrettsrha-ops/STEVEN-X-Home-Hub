/* ============================================================================
   STEVEN X — HOME HUB  ·  controller + touch bridge
   ----------------------------------------------------------------------------
   The hub adds this script to games that have a "pad" block in apps.json
   (GISH, SERPENT, SPACE IMPACT). It gives a keyboard-only game:

     · On a computer — a real game controller (Xbox / PlayStation / Bluetooth).
       Stick or D-pad and the buttons are turned into the key presses the game
       already understands, using the layout written in apps.json.
     · On a phone or tablet — an on-screen D-pad, for games that ask for one
       with "touchPad": true (games with their own touch controls keep them).

   The game's own files are never changed, so app updates keep working.
   ============================================================================ */
(function () {
  "use strict";
  var tag = document.currentScript, cfg;
  try { cfg = JSON.parse(tag.getAttribute("data-pad")) || {}; } catch (e) { return; }

  var hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  var finePointer = !!(window.matchMedia && matchMedia("(any-pointer: fine)").matches);
  var touchOnly = hasTouch && !finePointer;          // a phone or tablet with no mouse

  /* ---- turning a key name ("ArrowUp", "Space", "KeyK", "Digit1") into an event ---- */
  var SPECIAL = {
    ArrowUp: ["ArrowUp", 38], ArrowDown: ["ArrowDown", 40], ArrowLeft: ["ArrowLeft", 37], ArrowRight: ["ArrowRight", 39],
    Space: [" ", 32], Enter: ["Enter", 13], Escape: ["Escape", 27], Backspace: ["Backspace", 8], Tab: ["Tab", 9],
    ShiftLeft: ["Shift", 16], ControlLeft: ["Control", 17]
  };
  function keyInfo(code) {
    if (SPECIAL[code]) return { key: SPECIAL[code][0], keyCode: SPECIAL[code][1] };
    var m = /^Key([A-Z])$/.exec(code);
    if (m) return { key: m[1].toLowerCase(), keyCode: m[1].charCodeAt(0) };
    m = /^Digit(\d)$/.exec(code);
    if (m) return { key: m[1], keyCode: 48 + Number(m[1]) };
    return { key: code, keyCode: 0 };
  }
  function send(type, code) {
    var k = keyInfo(code), ev;
    try {
      ev = new KeyboardEvent(type, { key: k.key, code: code, bubbles: true, cancelable: true });
      Object.defineProperty(ev, "keyCode", { get: function () { return k.keyCode; } });
      Object.defineProperty(ev, "which",   { get: function () { return k.keyCode; } });
    } catch (e) { return; }
    (document.body || document.documentElement).dispatchEvent(ev);
  }
  function tap(code) { send("keydown", code); setTimeout(function () { send("keyup", code); }, 60); }

  function note(text, ms) {
    if (!text || !document.body) return;
    var n = document.createElement("div");
    n.textContent = text;
    n.setAttribute("role", "status");
    n.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;max-width:92vw;" +
      "padding:10px 16px;border-radius:12px;background:rgba(8,13,24,.92);color:#e9eefb;border:1px solid rgba(92,184,114,.55);" +
      "font:600 13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;pointer-events:none;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.5);transition:opacity .5s";
    document.body.appendChild(n);
    setTimeout(function () { n.style.opacity = "0"; }, ms || 7000);
    setTimeout(function () { n.remove(); }, (ms || 7000) + 600);
  }

  /* ============================ real controller (computers) ============================ */
  if (cfg.buttons && !touchOnly && navigator.getGamepads) {
    var DIRS = cfg.dirs || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    var held = {};            // key name -> currently pressed by the controller
    var stale = {};           // buttons still down from before a menu/game switch — ignored until released
    var lastPlaying = null, running = false, greeted = false;
    var isPlaying = function () { return true; };
    if (cfg.playingWhen) {
      // e.g. "Game.active": lets a button mean one thing in menus and another in play
      try { isPlaying = new Function("try{return !!(" + cfg.playingWhen + ")}catch(e){return true}"); } catch (e) {}
    }

    var firstPad = function () {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected && pads[i].buttons.length) return pads[i];
      return null;
    };
    var down = function (pad, i) { var b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
    var releaseAll = function () { for (var c in held) if (held[c]) { held[c] = false; send("keyup", c); } };

    var frame = function () {
      var pad = firstPad();
      if (!pad) { running = false; releaseAll(); return; }
      requestAnimationFrame(frame);
      if (document.hidden || !document.hasFocus()) { releaseAll(); return; }

      var playing = isPlaying();
      if (playing !== lastPlaying) {
        if (lastPlaying !== null) for (var s = 0; s < pad.buttons.length; s++) if (down(pad, s)) stale[s] = true;
        lastPlaying = playing;
      }
      var map = (!playing && cfg.menuButtons) || cfg.buttons;
      var want = {};
      var x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      if (y < -0.5 || down(pad, 12)) want[DIRS[0]] = true;
      if (y >  0.5 || down(pad, 13)) want[DIRS[1]] = true;
      if (x < -0.5 || down(pad, 14)) want[DIRS[2]] = true;
      if (x >  0.5 || down(pad, 15)) want[DIRS[3]] = true;
      for (var i = 0; i < pad.buttons.length; i++) {
        var on = down(pad, i);
        if (stale[i]) { if (!on) delete stale[i]; continue; }
        if (on && map[i]) [].concat(map[i]).forEach(function (c) { want[c] = true; });
      }
      var c;
      for (c in held) if (held[c] && !want[c]) { held[c] = false; send("keyup", c); }
      for (c in want) if (!held[c]) { held[c] = true; send("keydown", c); }
    };
    var start = function () {
      if (running || !firstPad()) return;
      running = true;
      if (!greeted) { greeted = true; note("Controller connected" + (cfg.help ? " — " + cfg.help : "")); }
      requestAnimationFrame(frame);
    };
    window.addEventListener("gamepadconnected", start);
    window.addEventListener("blur", releaseAll);
    setInterval(start, 1500);     // some browsers only reveal a pad when asked
  }

  /* ============================ on-screen D-pad (phones, tablets) ============================ */
  if (cfg.touchPad && hasTouch && !finePointer) {
    var build = function () {
      var keys = cfg.dirs || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      var wrap = document.createElement("div");
      wrap.setAttribute("aria-label", "Direction pad");
      // Sits in the page right under the game board (so it never covers the
      // game's own buttons); falls back to a floating corner pad if there is no board.
      var board = document.querySelector(cfg.touchPadAfter || "canvas");
      var common = "width:156px;height:156px;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;";
      wrap.style.cssText = board
        ? common + "position:relative;margin:14px auto 6px;flex:none"
        : common + "position:fixed;z-index:2147482000;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));opacity:.9";
      var spot = [[52, 0, "▲"], [52, 104, "▼"], [0, 52, "◀"], [104, 52, "▶"]];
      spot.forEach(function (p, i) {
        var b = document.createElement("div");
        b.textContent = p[2];
        b.setAttribute("role", "button");
        b.setAttribute("aria-label", ["Up", "Down", "Left", "Right"][i]);
        b.style.cssText = "position:absolute;left:" + p[0] + "px;top:" + p[1] + "px;width:52px;height:52px;border-radius:14px;" +
          "display:flex;align-items:center;justify-content:center;font:700 20px system-ui,sans-serif;color:#e9eefb;" +
          "background:rgba(16,26,45,.72);border:1px solid rgba(255,255,255,.28);touch-action:none";
        var press = function (e) {
          e.preventDefault(); e.stopPropagation();
          b.style.background = "rgba(92,184,114,.85)";
          tap(keys[i]);
        };
        var lift = function () { b.style.background = "rgba(16,26,45,.72)"; };
        b.addEventListener("touchstart", press, { passive: false });
        b.addEventListener("touchend", function (e) { e.preventDefault(); e.stopPropagation(); lift(); }, { passive: false });
        b.addEventListener("touchcancel", lift);
        wrap.appendChild(b);
      });
      if (board && board.parentNode) board.parentNode.insertBefore(wrap, board.nextSibling);
      else document.body.appendChild(wrap);
    };
    if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
  }
})();
