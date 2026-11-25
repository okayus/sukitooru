# いま（status hub）

<!-- 上限 40 行・3 KB。見出し 4 つは変えない。終わった項目は消して docs/log.md の先頭へ 1 行で移す（取り消し線は使わない）。
     8 行を超える節は docs/plans/<題>.md に切り出す。書き換えは /handoff。
     手元のセッションの開始時に .claude/hooks/session-start.sh がこのファイルを出す（クラウドの実行では出さない）。 -->

## フェーズ

透き通る（[plans/learning-loop.md](plans/learning-loop.md)）の P1（改名と Cloudflare への移行）と P2（kokemusu の「リンクで渡す」入口）を終えた。公開は Worker `sukitooru`（https://sukitooru.shiraoka.workers.dev/）、リポジトリは okayus/sukitooru。次は P3（タグ）、その後 P4（つなぐ）で、どちらもここで行う。第X部「関数型」も公開済み（全43章・10部・層 25）。

## 次の 3 手

1. 日刊の動きの場面を必須にするかを持ち主に決めてもらう（docs/daily-news.md の「動きの場面は任意」の項）。試しの 7 件（11-19〜11-25 の実行）は、6 件が台本を 1 つ足し、11-23 の 1 件は足さなかった。決めたら P3 を始める: §3 の 2（タグの決め方）を決め、語彙の正本を作る（learning-loop.md §6 P3）。
2. 第X部の検収を持ち主に聞く: 層の読み 2 つと見た目（log/2026-11-22-fp-create.md §10）、残した点 3 つ（plan.md「後で見直す所」の第X部の項。Turing 1937、`<code>` の「-」の折れ、記憶照合だけの文献）。
3. `tools/stepindex.mjs` の数字で始まる題の頭を削る不具合を直す（24 行め。タグを剥がす前に番号の span を除く）。

## 詰まり・人手待ち

- 持ち主が決めること: learning-loop.md §3 の 2〜4（2 は P3、3・4 は P4 の前に要る）。
- 検収をまだ聞いていない: 層をつなぐ作業の P2〜P6（log/2026-11-22-handoff.md の各項）と第X部（上の 2 手め）。
- 手元のブランチ `wip/fp-part-x` は取り込み済みで要らない。消すかを持ち主に聞く。

## 進行中 PR

- なし（日刊の PR は毎朝 news-pr.yml が検査してマージする。落ちたものは開いたまま残る）。
