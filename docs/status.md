# いま（status hub）

<!-- 上限 40 行・3 KB。見出し 4 つは変えない。終わった項目は消して docs/log.md の先頭へ 1 行で移す（取り消し線は使わない）。
     8 行を超える節は docs/plans/<題>.md に切り出す。書き換えは /handoff。
     手元のセッションの開始時に .claude/hooks/session-start.sh がこのファイルを出す（クラウドの実行では出さない）。 -->

## フェーズ

2 本が並行。

- 第X部「関数型」（第37〜43章）を足す（[plans/fp-part-x.md](plans/fp-part-x.md)）。指示書まで済み、章のファイルはまだ無い。
- 透き通る（[plans/learning-loop.md](plans/learning-loop.md)）の P1 並走。Worker `sukitooru` は Workers Builds で main を配り、GitHub Pages も動いたまま（log/2026-11-22-p1.md）。

## 次の 3 手

1. 第X部の章を作る: plans/fp-part-x.md §3 の 1。指示書 log/2026-11-22-fp-brief.md の §11 の型で、第37〜42章の担当を並行で頼む（第43章はその後）。新しいセッションで行う。
2. 11-23 朝の日刊のマージのコミットに check-run `Workers Builds: sukitooru` が付き、新しいノートが新しい URL で 200 になるかを見る（learning-loop.md §8 の 1 つ目）。付かなければ、切り替えの前に手を考える。
3. P1 の切り替え（learning-loop.md §4・§6 P1）。古い URL を転送するか（§3 の 5）を先に持ち主に聞く。kokemusu の P2 は並行できる。

## 詰まり・人手待ち

- 第X部の共通の変更（目次・用語索引・第36章・層の登録簿など）は手元のブランチ `wip/fp-part-x` にある。main に入れるのは 7 章ができてから（plans/fp-part-x.md §2）。
- 持ち主が決めること: learning-loop.md §3 の 1〜5。第X部は章立てと層「関数型」を足すことが決まった（fp-part-x.md §1。層の読みの確かめは §5）。
- 日刊の動きの場面の試しは 11-25 まで。必須にするかを 11-26 ごろ持ち主が決める（P3 で日刊の型を変えるのはその後）。
- 検収をまだ聞いていない: 層をつなぐ作業の P2〜P6（log/2026-11-22-handoff.md の各項）。

## 進行中 PR

- なし（日刊の PR は毎朝 news-pr.yml が検査してマージする。落ちたものは開いたまま残る）。
