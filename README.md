# STEVEN X — HOME HUB

The master home server for the whole STEVEN X collection. Download this folder
to **one computer**, run one launcher, and every phone, tablet and TV on your
Wi‑Fi gets a single address that opens **everything** — no internet needed once
it's set up.

## What it hosts

**Twenty-six full apps** in seven categories, downloaded straight from their own
repositories. The hub groups its tiles and sidebar by these categories (they
are declared at the top of `apps.json`).

### Cinema & Music

| App | What it is | How the hub runs it |
|---|---|---|
| **REEL** | The full movie platform — profiles, posters, series, instant-seek streaming | Own server on port **8081** |
| **CLOUDPLAYER** | The SXB DrivePlayer for your music | Hosted by the hub at `/apps/cloudplayer/` |

### Scripture

| App | What it is | How the hub runs it |
|---|---|---|
| **THE BESORAH** | Scripture of All Truths — Bereshiyth to Revelation + apocrypha | Hosted by the hub at `/apps/besorah/` |

### Scripture Games

| App | What it is | How the hub runs it |
|---|---|---|
| **BERĔSHITH** | Scripture Game — the Genesis adventure | Hosted by the hub at `/apps/scripture-game/` |
| **THE VOYAGE** | Scripture Game 2 — all the earth within the firmament, in 3D | Hosted by the hub at `/apps/voyage/` |

### Games & Arcade

| App | What it is | How the hub runs it |
|---|---|---|
| **ARCADE** | Console emulation in the browser — GBA, NES, SNES, N64 and more | Own server on port **8082** |
| **GISH** | Gish Reloaded — the J2ME tar-ball platformer reborn as HTML5, 88 levels | Hosted by the hub at `/apps/gish/` |
| **SERPENT** | Modern Snake — ten seasonal levels, three kinds of prey, swipe or keys | Hosted by the hub at `/apps/serpent/` |
| **SPACE IMPACT** | Space Impact: Reforged — the side-scrolling phone shooter, five worlds | Hosted by the hub at `/apps/space-impact/` |
| **WILDLIGHT** | Wildlight Frontier — offline 3D frontier game with two-player LAN co-op | Started when opened, port **41739** |

### Tools & Studio

| App | What it is | How the hub runs it |
|---|---|---|
| **VOICESCRIPT** | VoiceScript Studio — on-device Whisper transcription of meetings, recordings and live calls, with speaker labels and exports | Hosted by the hub at `/apps/voicescript/` |
| **SCRIPT BUILDER** | Text-to-Speech — two-speaker scripts read in natural voices, exported as MP3 | Hosted by the hub at `/apps/script-builder/` |
| **PDF WORKSHOP** | Complete PDF toolkit — split, compress, OCR, watermark, redact, sign, edit | Hosted by the hub at `/apps/pdf-workshop/` |
| **PACKR** | Android App Creator — web pages into installable APKs | Own server on port **4477** (use on the server computer) |

### AI Studio

Local AI tools. They run on the **server computer's own graphics card**, so
they open only on that computer, and each one starts when you open its tile
(the hub runs the app's own start script). The first start sets up Python and
downloads models, which can take a long while and a lot of disk.

| App | What it is | Port |
|---|---|---|
| **KOKORO STUDIO** | Voice-over and video studio — directed reads, cloned voices | 8765 |
| **OPENVOICE** | Voice cloning — read any script in a cloned voice | 7811 |
| **YUE STUDIO** | Song generator (YuE2) — lyrics and a style in, a song out | 7788 |
| **M3 STUDIO** | Song generator (MiniMax Music) — full songs with vocals | 7789 |
| **IDEOGRAM STUDIO** | Text-to-image generator | 7802 |
| **MINIMAX STUDIO** | Text-to-video generator | 7804 |
| **AVATAR STUDIO** | Talking avatar video from a photo and a voice | 7808 |
| **MULTI-TALK** | Talking video for one or two people | 7807 |
| **LLAMA STUDIO** | Local AI chat | 7806 |
| **SOUND SPLITTER** | Splits a song into vocals and backing | 8791 |
| **GRABBIT** | Video and audio downloader | 7812 |

These need **Python** on the server computer (each app's own README lists what
else, such as a graphics card with enough memory).

### Learning

| App | What it is | How the hub runs it |
|---|---|---|
| **PRACTICE TEST** | Painter — Section A practice paper | Hosted by the hub at `/apps/practice-test/` |

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
   It pulls all twenty-six apps from GitHub into `apps/` — with git if you have it,
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

Inside `music/` and `movies/`, **sub-folders become groups** — one block per
album, series or season (`music/Album Name/…`, `movies/Series/Season 1/…`),
sorted so *Episode 2* comes before *Episode 10*. Files left at the top level
are listed first.

## Pick up where you left off

Close a film part-way and the hub remembers the spot. It shows on the Home page
under **Continue Watching** and resumes from there next time; the same goes for
long recordings (20 minutes or more — teachings, audiobooks). Press the **×**
on a card to forget it. Positions are remembered **per device**, in that
device's browser.

## Updates

Open **Settings → Updates** in the hub and press **Check for updates**. It
lists every app — and the hub itself — whose repository has changed, and one
button downloads them. Running apps are stopped, updated and started again.

- Start a download from the server computer, or from any device that has typed
  the PIN (when a PIN is set).
- Your media, saved games, `apps/` additions and `pin.txt` are never touched.
- After the **hub itself** updates, restart it to use the new version. A hub
  update replaces `apps.json`, so re-apply any edits you made there (controller
  layouts, switched-off apps).
- Private repositories can only be checked if this computer's git is signed in
  to GitHub.
- By hand, the same thing is `node get-apps.js --check`, `--update` and `--hub`.

## Getting around

- **Phones** — the menu button (top left) slides the full menu in; swipe the
  banner on Home to change slides.
- **TV remote or keyboard** — arrow keys move between tiles, **Enter** opens,
  **Esc** closes a film, **/** jumps to search, **Space** pauses the music.
- **Game controller** — the hub's own pages work with an Xbox, PlayStation or
  Bluetooth pad: D-pad or stick moves, **A** opens, **B** goes back, **LB/RB**
  change page, **Y** is Home, **X** pauses music, **Start** opens Settings, the
  right stick scrolls. In a film: **A** play/pause, left/right skip 10 seconds,
  up/down volume, **B** close. ARCADE's library uses the same layout.
- **Search** — on Home it looks through the apps *and* inside every folder
  library; on a library page it filters that library.
- **Back button** — steps back through the hub's pages instead of leaving it.
- **Next episode** — when a video in a folder ends, the next one starts.
- **New files** — press the refresh button beside a library's item count to
  pick up files you just dropped in, without reloading.
- The startup animation plays once per visit; after that the hub opens straight
  away. Accent colour, hub name and the ambient background (Settings) are
  remembered on each device.

## Game controllers and touch

**GISH, SERPENT and SPACE IMPACT** take a real controller (Xbox, PlayStation or
Bluetooth) when played on a computer. Plug it in, open the game from the hub
and press any button — a note shows the layout.

| Game | Layout |
|---|---|
| **GISH** | Stick or D-pad move · **A** jump (select in menus) · **X** / **RT** sticky · **B** / **LT** slick (back in menus) · **Y** attack · **Start** pause |
| **SERPENT** | Stick or D-pad steer · **A** / **Start** start, pause, retry |
| **SPACE IMPACT** | Stick or D-pad fly · **A** / **RT** fire · **B** back · **X** weapon · **Y** boost · **LB** / **RB** throttle · **LT** autofire · **Start** pause · **Back** map · **L3** camera · **R3** dock |

To change a layout, edit that game's `"pad"` block in `apps.json` (button
numbers follow the standard layout: 0 = A, 1 = B, 2 = X, 3 = Y, 4/5 = LB/RB,
6/7 = LT/RT, 8 = Back, 9 = Start) and restart the hub.

On a phone or tablet, GISH and SPACE IMPACT use their own on-screen controls,
and SERPENT gets an on-screen D-pad under the board as well as swipes.

The hub adds this to the games as it serves them (`pad-bridge.js`); the games'
own files are not changed, so it applies when they are opened through the hub.
BERĔSHITH and THE VOYAGE have their own controller support built in.

## Put it on your home screen

Open the hub on a phone, tablet or TV browser and choose **Add to Home Screen**
(iPhone/iPad: Share → Add to Home Screen; Android: ⋮ menu → Add to Home screen).
It gets the STEVEN X plaque as its icon. On iPhone/iPad it opens full-screen
like an app; Android opens it in the browser, because Chrome only gives the
full "install" treatment to `https://` sites.

## Lock it with a PIN (optional)

For when guests are on your Wi‑Fi. Create a file called **`pin.txt`** next to
`server.js` containing just your PIN (for example `2468`), then restart the hub.

- Each device types the PIN once and is remembered for 30 days.
- The server computer itself is never asked.
- Five wrong tries and that device has to wait (30 seconds, doubling each time).
- Change the PIN and every device is asked again. Delete `pin.txt` and restart
  to switch the lock off.
- **It covers everything** — the hub page, the six folder libraries, the apps
  at `/apps/…`, and REEL, ARCADE and PACKR on their own ports. While the PIN is
  on, those three listen on the server computer only and the hub answers on
  their ports (8081, 8082, 4477), checks the PIN and passes requests through.
  Unlocking once on a device unlocks all of them.
- PACKR stays a server-computer tool: other devices can only fetch a finished
  download through its QR link (after the PIN).

## Good to know

- **Zero dependencies** — the hub, the downloader and both big apps use only
  Node's built-in modules. There is nothing to `npm install`.
- **Ports** — hub `8080`, REEL `8081`, ARCADE `8082`, PACKR `4477`, WILDLIGHT
  `41739`, the AI Studio apps `7788`–`8791` (table above). Change the
  hub's with `PORT=8090 node server.js`; app ports live in `apps.json`.
- **Turn an app off** — set its `"enabled": false` in `apps.json`. To move an
  app between categories, change its `"category"`; to add a category, add it
  to the `"categories"` list at the top of the file.
- **Three of the studio tools reach out to the internet the first time they
  run.** VOICESCRIPT downloads its speech models from Hugging Face (then caches
  them in the browser — use *Settings → Advanced → Download models now* while
  online); PDF WORKSHOP loads its PDF/OCR libraries from cdnjs on every open;
  SCRIPT BUILDER fetches its online voices as it speaks. Everything else in
  the hub runs fully offline.
- **Microphone capture needs a secure page.** Browsers only allow the mic and
  tab-audio capture over `https://` or on `localhost`, so VOICESCRIPT's live
  recording works on the server computer itself; transcribing uploaded files
  works from any device on the Wi‑Fi.
- **PACKR is local-only by design**: you build apps on the server computer
  itself; finished APKs still reach any phone via QR code.
- Everything stays on your machine and your local network — nothing is uploaded
  anywhere.
