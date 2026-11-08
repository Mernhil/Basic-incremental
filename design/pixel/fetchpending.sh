#!/bin/bash
# fetch every line "name id" of pending.txt into shop raw dir, drop the ones that arrived
cd "$(dirname "$0")"; rm -f pending.left; touch pending.left
while read n i; do [ -z "$n" ] && continue
  c=$(curl -s -o shop-market-stalls/raw/$n.png -w "%{http_code}" "https://api.pixellab.ai/mcp/images/$i/download")
  if [ "$c" = "200" ]; then echo "ok $n"; else echo "$n $i" >> pending.left; rm -f shop-market-stalls/raw/$n.png; echo "wait $n $c"; fi
done < pending.txt; mv pending.left pending.txt
