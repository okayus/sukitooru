#!/usr/bin/env bash
# docs/status.md の上限の検査（/handoff が呼ぶ）: 40 行・3000 バイト・取り消し線なし・見出しは決まった 4 つ。
set -u
f="${1:-docs/status.md}"
max_lines=40
max_bytes=3000
fail=0
[ -f "$f" ] || { echo "NG: $f が無い"; exit 1; }
lines=$(wc -l <"$f")
bytes=$(wc -c <"$f")
[ "$lines" -le "$max_lines" ] || { echo "NG: $f は $lines 行（上限 $max_lines）。終わった項目は docs/log.md へ、長い節は docs/plans/ へ"; fail=1; }
[ "$bytes" -le "$max_bytes" ] || { echo "NG: $f は $bytes バイト（上限 $max_bytes）"; fail=1; }
if grep -n '~~' "$f"; then echo "NG: 取り消し線は使わない。終わった項目は消して docs/log.md へ"; fail=1; fi
expected=$'## フェーズ\n## 次の 3 手\n## 詰まり・人手待ち\n## 進行中 PR'
actual=$(grep '^## ' "$f")
if [ "$actual" != "$expected" ]; then
  echo "NG: 見出しは 4 つ（## フェーズ / ## 次の 3 手 / ## 詰まり・人手待ち / ## 進行中 PR）。今は:"
  echo "$actual"
  fail=1
fi
[ "$fail" -eq 0 ] && echo "OK: $f は $lines 行 / $bytes バイト"
exit "$fail"
