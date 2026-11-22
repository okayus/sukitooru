# いま（status hub）

<!-- 上限 40 行・3 KB。見出し 4 つは変えない。終わった項目は消して docs/log.md の先頭へ 1 行で移す（取り消し線は使わない）。
     8 行を超える節は docs/plans/<題>.md に切り出す。書き換えは /handoff。
     手元のセッションの開始時に .claude/hooks/session-start.sh がこのファイルを出す（クラウドの実行では出さない）。 -->

## フェーズ

透き通る（[plans/learning-loop.md](plans/learning-loop.md)）の P1 並走。P0 は 2026-11-22 に済んだ。Worker `sukitooru`（https://sukitooru.shiraoka.workers.dev/）が main と同じ内容を配り、GitHub Pages も動いたまま。

## 次の 3 手

1. Workers Builds を Worker `sukitooru` につなぐ（持ち主の画面での作業。下の「人手待ち」）。つないだら main に 1 コミット push し、check-run `Workers Builds: sukitooru` が付くかを見る。
2. 次の朝の日刊のマージの後、Workers Builds が起動して新しいノートが新しい URL に出たかを見る（learning-loop.md §8 の 1 つ目）。出たら P1 の並走の出口を満たす。
3. セッション 2: P1 の切り替え（learning-loop.md §4・§6 P1）。古い URL を転送するか（§3 の 5）を先に持ち主に聞く。kokemusu で開くセッション 3（P2）は並行できる。

## 詰まり・人手待ち

- Workers Builds の接続（Cloudflare の画面）。値は plans/learning-loop.md §6 P1。
- 持ち主が決めること: learning-loop.md §3 の 1〜5。
- 日刊の動きの場面の試しは 11-25 まで。必須にするかを 11-26 ごろ持ち主が決める（P3 で日刊の型を変えるのはその後）。
- 検収をまだ聞いていない: 層をつなぐ作業の P2〜P6（log/2026-11-22-handoff.md の各項）。

## 進行中 PR

- なし（日刊の PR は毎朝 news-pr.yml が検査してマージする。落ちたものは開いたまま残る）。
