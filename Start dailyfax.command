#!/bin/zsh
cd "$(dirname "$0")"
PORT=8765
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT >/tmp/dailyfax-server.log 2>&1 &
  for i in {1..30}; do
    if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi
open "http://127.0.0.1:$PORT"
