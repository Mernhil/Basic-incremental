#!/bin/bash
# usage: fetch.sh <dir> <name> <job_id>   (PixelLab no-auth download)
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  c=$(curl -s -o "$1/$2.png" -w "%{http_code}" "https://api.pixellab.ai/mcp/images/$3/download")
  [ "$c" = "200" ] && { echo "ok $2"; exit 0; }
  sleep 6
done; echo "FAIL $2 ($c)"
