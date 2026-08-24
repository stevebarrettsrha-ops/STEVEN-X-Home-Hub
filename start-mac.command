#!/usr/bin/env bash
# ===== STEVEN X - HOME HUB - home server launcher (macOS) =====
# Double-click this file in Finder to start the server.
# (If macOS blocks it the first time: right-click -> Open, or run
#  chmod +x "start-mac.command" once in Terminal.)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed yet."
  echo "  Install the LTS version from https://nodejs.org"
  echo "  (or:  brew install node ), then run this again."
  echo
  read -n 1 -s -r -p "  Press any key to close..."
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
echo "  Leave this window OPEN while anyone is using the hub."
echo "  Press Ctrl+C to stop the server."
echo
node server.js
