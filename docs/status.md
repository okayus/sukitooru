# いま（status hub）

<!-- 上限 40 行・3 KB。見出し 4 つは変えない。終わった項目は消して docs/log.md の先頭へ 1 行で移す（取り消し線は使わない）。
     8 行を超える節は docs/plans/<題>.md に切り出す。書き換えは /handoff。
     手元のセッションの開始時に .claude/hooks/session-start.sh がこのファイルを出す（クラウドの実行では出さない）。 -->

## フェーズ

透き通る（[plans/learning-loop.md](plans/learning-loop.md)）の P1（改名と Cloudflare への移行）・P2（kokemusu の「リンクで渡す」入口）・P3（ニュースのタグ。語彙は `assets/tags.js`）を終えた。公開は Worker `sukitooru`（https://sukitooru.shiraoka.workers.dev/）、リポジトリは okayus/sukitooru。次は P4（つなぐ）で、ここで行う。第X部「関数型」も公開済み（全43章・10部・層 25）。

## 次の 3 手

1. learning-loop.md §3 の 3（kokemusu に積む石）と 4（クイズが無い前提タグの扱い。依頼文が途中で切れているので続きも聞く）を持ち主に決めてもらい、P4 を始める（§6 P4。前提のタグの出し方と、前提に欲しい 12 語は §6 P3 の「後に回したこと」）。
2. 第X部の検収を持ち主に聞く: 層の読み 2 つと見た目（log/2026-11-22-fp-create.md §10）、残した点 3 つ（plan.md「後で見直す所」の第X部の項。Turing 1937、`<code>` の「-」の折れ、記憶照合だけの文献）。
3. `tools/stepindex.mjs` の数字で始まる題の頭を削る不具合を直す（24 行め。タグを剥がす前に番号の span を除く）。

## 詰まり・人手待ち

- 持ち主が決めること: learning-loop.md §3 の 3・4（P4 の前に要る。上の 1 手め）。
- 検収をまだ聞いていない: 層をつなぐ作業の P2〜P6（log/2026-11-22-handoff.md の各項）と第X部（上の 2 手め）。

## 進行中 PR

- なし（日刊の PR は毎朝 news-pr.yml が検査してマージする。落ちたものは開いたまま残る）。
