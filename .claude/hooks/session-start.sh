#!/usr/bin/env bash
# SessionStart hook: 手元のセッションの開始・再開・/clear・compact の後に「いま」を出す。stdout は Claude の文脈に入る。
# クラウドの実行（CLAUDE_CODE_REMOTE=true）では何も出さない。毎朝の日刊は docs/daily-news.md の手順だけで動かし、「いま」を混ぜない。
# 失敗してもセッションは止めない。
set -u
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" || exit 0

if [ -f docs/status.md ]; then
  echo "=== docs/status.md（いま。終わった項目は /handoff で docs/log.md へ）==="
  cat docs/status.md
fi
if [ -f docs/log.md ]; then
  echo
  echo "=== docs/log.md（新しい 5 行。続きは head -30 docs/log.md）==="
  grep -m 5 '^- ' docs/log.md
fi
echo
echo "=== git（ブランチと新しい 5 コミット。日刊が毎朝 main にマージされるので、始める前に git pull --ff-only）==="
git rev-parse --abbrev-ref HEAD 2>/dev/null
git log --oneline -5 2>/dev/null
exit 0
