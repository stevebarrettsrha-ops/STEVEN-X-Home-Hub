# STEVEN X — HOME HUB

The master home server for the whole STEVEN X collection. Download this folder
to **one computer**, run one launcher, and every phone, tablet and TV on your
Wi‑Fi gets a single address that opens **everything** — no internet needed once
it's set up.

## What it hosts

**Seven full apps**, downloaded straight from their own repositories:

| App | What it is | How the hub runs it |
|---|---|---|
| **REEL** | The full movie platform — profiles, posters, series, instant-seek streaming | Own server on port **8081** |
| **ARCADE** | Console emulation in the browser — GBA, NES, SNES, N64 and more | Own server on port **8082** |
| **BERĔSHITH** | Scripture Game — the Genesis adventure | Hosted by the hub at `/apps/scripture-game/` |
| **THE VOYAGE** | Scripture Game 2 — all the earth within the firmament, in 3D | Hosted by the hub at `/apps/voyage/` |
| **THE BESORAH** | Scripture of All Truths — Bereshiyth to Revelation + apocrypha | Hosted by the hub at `/apps/besorah/` |
| **CLOUDPLAYER** | The SXB DrivePlayer for your music | Hosted by the hub at `/apps/cloudplayer/` |
| **PACKR** | Android App Creator — web pages into installable APKs | Own server on port **4477** (use on the server computer) |

Every app tile in the hub shows a **live status light** and opens through an
**animated loading screen** themed to that app.

**Plus six folder libraries** served by the hub itself: `movies/`, `music/`,
`scripture/`, `books/`, `games/`, `scripture-game/` — drop files in, they appear
in the hub with streaming and instant seeking.

## Set it up (once)

1. Install **Node.js** (the LTS version) from <https://nodejs.org>.
2. Download this hub folder to the computer that will be the server.
3. Download the apps (needs internet this one time):
   ```
   node get-apps.js
   ```
   It pulls all seven apps from GitHub into `apps/` — with git if you have it,
   otherwise as ZIPs. Run it again with `--update` any time to refresh them.
   (The start launchers below also offer to do this on first run.)

## Run it (every day)

- **Windows** — double-click `start-windows.bat`
- **macOS** — double-click `start-mac.command`
- **Linux** — run `bash START.sh` (or `./start-linux.sh`)

The window prints an address like `http://192.168.1.20:8080` — open it on any
device on the same Wi‑Fi. The hub starts REEL, ARCADE and PACKR automatically,
restarts them if they crash, and stops everything together when you press
`Ctrl+C`. Leave the window open while anyone is using the hub.

## Where your media goes

| Put it here | It shows up in |
|---|---|
| `apps/reel/movies/`, `apps/reel/series/`, `apps/reel/Kids/` … | **REEL** |
| `apps/arcade/games/gba/`, `apps/arcade/games/nes/` … | **ARCADE** |
| `movies/` `music/` `scripture/` `books/` `games/` | the hub's own folder libraries |

Updating apps never touches the media you dropped into them.

## Good to know

- **Zero dependencies** — the hub, the downloader and both big apps use only
  Node's built-in modules. There is nothing to `npm install`.
- **Ports** — hub `8080`, REEL `8081`, ARCADE `8082`, PACKR `4477`. Change the
  hub's with `PORT=8090 node server.js`; app ports live in `apps.json`.
- **Turn an app off** — set its `"enabled": false` in `apps.json`.
- **PACKR is local-only by design**: you build apps on the server computer
  itself; finished APKs still reach any phone via QR code.
- Everything stays on your machine and your local network — nothing is uploaded
  anywhere.
