# STEVEN X — HOME HUB

A fully-offline home entertainment hub. One page, six systems — Scripture Game,
Movies, Scripture, Music, Educational Books and Games — all playing straight from
your own folders, with no internet connection required.

## Two ways to use it

### 1. Open the file directly (quick, single device)
Double-click **`index.html`**. On each system page press **Connect folder** and
choose the matching folder on your PC. Your files play right inside the hub.
Best in Chrome or Edge; Firefox falls back to a folder picker.

### 2. Run the home server (whole house, offline)
This hosts STEVEN X on your local Wi‑Fi so **every phone, tablet and TV** in the
house can open it in a browser — still with no internet. When the hub is opened
through the server, all libraries load automatically and videos stream with
instant seeking.

1. Install **Node.js** once from <https://nodejs.org> (the "LTS" version).
2. Start the server:
   - **Windows** — double-click `start-windows.bat`
   - **macOS** — double-click `start-mac.command`
   - **Linux** — run `bash START.sh` (or `./start-linux.sh`)
3. The window prints an address like `http://192.168.1.20:8080`. Open that on
   any device on the same Wi‑Fi.

Leave the terminal/window open while anyone is using the hub. Press `Ctrl+C` to stop.

## Where your files go

Put your media in these folders (created automatically next to `server.js`):

| Folder            | Holds                                             |
|-------------------|---------------------------------------------------|
| `scripture-game/` | your BERĔSHITH build and other scripture games    |
| `movies/`         | `.mp4 .m4v .webm .mov .mkv .avi` …                |
| `scripture/`      | bibles, study PDFs, notes                         |
| `music/`          | `.mp3 .wav .ogg .m4a .flac` …                     |
| `books/`          | training manuals, e-books, references             |
| `games/`          | single-file HTML games                            |

Subfolders are scanned too. Browsers play `.mp4/.webm/.mov` natively; other
formats (e.g. `.mkv`, `.avi`) may need converting to MP4 first.

## Notes

- **Zero dependencies.** `server.js` uses only Node's built-in modules — there is
  nothing to `npm install`.
- **Change the port** if 8080 is busy: `PORT=8090 node server.js`.
- Your media never leaves your machine; the server only listens on your local network.
