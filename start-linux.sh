#!/usr/bin/env bash
# ===== STEVEN X - HOME HUB - home server launcher (Linux) =====
# Run in a terminal:   ./start-linux.sh
# (First time, make it executable:   chmod +x start-linux.sh )
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed yet."
  echo "  Install it from https://nodejs.org or your package manager, e.g.:"
  echo "    Debian/Ubuntu:  sudo apt install nodejs"
  echo "    Fedora:         sudo dnf install nodejs"
  echo "    Arch:           sudo pacman -S nodejs"
  echo "  then run this again."
  echo
  exit 1
fi

# First run: offer to download the full apps (REEL, ARCADE, ...) into apps/
if [ -z "$(ls -A apps 2>/dev/null)" ]; then
  echo
  echo "  The full apps (REEL, ARCADE, the scripture apps...) aren't downloaded yet."
  printf "  Download them now? Needs internet once. [Y/n] "
  read -r ans
  case "$ans" in
    n*|N*) echo "  Skipping - the hub still works; run 'node get-apps.js' anytime." ;;
    *) node get-apps.js ;;
  esac
fi

echo
echo "  Starting the STEVEN X home server..."
echo "  Leave this terminal OPEN while anyone is using the hub."
echo "  Press Ctrl+C to stop the server."
echo
node server.js
