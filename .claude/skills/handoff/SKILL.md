---
name: handoff
description: セッションの区切りで「いま」を書き戻す。docs/status.md を今の状態に書き換え、終わった節目を docs/log.md の先頭へ 1 行ずつ移し、上限（40 行・3 KB、見出し 4 つ）を検査してコミットする。持ち主が /handoff と打ったときだけ使う。
disable-model-invocation: true
argument-hint: "[一言（任意）]"
---

持ち主の一言: $ARGUMENTS（空なら無い）。

## 手順（この順で。省かない）

1. 今の状態を読む: `git status -sb`、`git log --oneline -10`、`docs/status.md`、`head -12 docs/log.md`。このセッションで終わったこと、残ったこと、詰まったことを 3 行にまとめる。
2. `docs/log.md` の先頭に、終わった節目を 1 行ずつ足す（`- YYYY-MM-DD 何を（コミット・記録）`）。前からある行は変えない。節目は、push、マージ、持ち主の作業の完了、公開の状態の変化。作業中の試行錯誤は書かない（git log と `docs/log/` の作業記録にある）。
3. `docs/status.md` を書き換える（足さない）。見出し 4 つ（フェーズ／次の 3 手／詰まり・人手待ち／進行中 PR）はそのままにし、中身を今の状態にする。終わった項目は消す（取り消し線は使わない）。8 行を超える節は `docs/plans/<題>.md` に切り出し、1 行で指す。「次の 3 手」の 1 手目は、次のセッションが最初に手を付ける具体的な作業にする。
4. `docs/plans/` の済んだ計画を消す。結論は log の 1 行と `docs/log/` の作業記録に残してから消す。
5. `bash .claude/hooks/check-status.sh` を走らせ、OK になるまで 3 を直す。
6. main にコミットする（このリポジトリは main に直接コミットする）。push は持ち主に確かめてからにし、push の前に `git pull --rebase` する（日刊が毎朝 main にマージされる）。
7. 次のセッションの出発点（「次の 3 手」の 1 手目）を 1 行で伝える。

## 書かないもの

- CLAUDE.md に、進み具合と履歴（決まりと地図だけを書く）
- docs/status.md に、済んだ項目・経緯・調べた結果（plans・log・`docs/log/` へ）
- docs/log.md に、作業中の細かい出来事
