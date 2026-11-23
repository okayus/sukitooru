# いま（status hub）

<!-- 上限 40 行・3 KB。見出し 4 つは変えない。終わった項目は消して docs/log.md の先頭へ 1 行で移す（取り消し線は使わない）。
     8 行を超える節は docs/plans/<題>.md に切り出す。書き換えは /handoff。
     手元のセッションの開始時に .claude/hooks/session-start.sh がこのファイルを出す（クラウドの実行では出さない）。 -->

## フェーズ

透き通る（[plans/learning-loop.md](plans/learning-loop.md)）の P1 切り替えを 2026-11-23 に済ませた。公開は Worker `sukitooru`（https://sukitooru.shiraoka.workers.dev/）だけで、GitHub Pages は止めた。リポジトリは okayus/sukitooru、サイトの名前は「透き通る」（log/2026-11-23-p1-cutover.md）。第X部「関数型」も 11-23 に公開済み（全43章・10部・層 25）。

## 次の 3 手

1. 11-24 朝の日刊で P1 の出口を見る: 差が md と README.md の表だけで news-pr.yml が通り、マージのコミットに check-run `Workers Builds: sukitooru` が付き、新しいノートが新しい URL で 200。改名したリポジトリをクラウドの実行が使えるかもここで分かる。通ったら okayus-skills への還元（log/2026-11-23-p1-cutover.md「残り」）と、セッション 3（kokemusu の P2）・4（P3）。
2. 第X部の検収を持ち主に聞く: 層の読み 2 つと見た目（log/2026-11-22-fp-create.md §10）、残した点 3 つ（plan.md「後で見直す所」の第X部の項。Turing 1937、`<code>` の「-」の折れ、記憶照合だけの文献）。
3. `tools/stepindex.mjs` の数字で始まる題の頭を削る不具合を直す（番号の span を先に除く。同じ項）。

## 詰まり・人手待ち

- 持ち主が決めること: learning-loop.md §3 の 1〜4（5 は「転送しない」に決まった）。
- 日刊の動きの場面の試しは 11-25 まで。必須にするかを 11-26 ごろ持ち主が決める（P3 で日刊の型を変えるのはその後）。
- 検収をまだ聞いていない: 層をつなぐ作業の P2〜P6（log/2026-11-22-handoff.md の各項）と第X部（上の 2 手め）。
- 手元のブランチ `wip/fp-part-x` は取り込み済みで要らない。消すかを持ち主に聞く。

## 進行中 PR

- なし（日刊の PR は毎朝 news-pr.yml が検査してマージする。落ちたものは開いたまま残る）。
