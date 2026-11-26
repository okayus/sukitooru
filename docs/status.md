# いま（status hub）

<!-- 上限 40 行・3 KB。見出し 4 つは変えない。終わった項目は消して docs/log.md の先頭へ 1 行で移す（取り消し線は使わない）。
     8 行を超える節は docs/plans/<題>.md に切り出す。書き換えは /handoff。
     手元のセッションの開始時に .claude/hooks/session-start.sh がこのファイルを出す（クラウドの実行では出さない）。 -->

## フェーズ

透き通る（[plans/learning-loop.md](plans/learning-loop.md)）の P1（改名と Cloudflare への移行）・P2（kokemusu の「リンクで渡す」入口）・P3（ニュースのタグ。語彙は `assets/tags.js`）を終え、P4（つなぐ）の途中。P4 の記録の導線（ノートのページの「苔むすに積む」、`assets/kokemusu.js`）は公開済みで、残りは前提のクイズとクイズ待ちの一覧。公開は Worker `sukitooru`（https://sukitooru.shiraoka.workers.dev/）、リポジトリは okayus/sukitooru。第X部「関数型」も公開済み（全43章・10部・層 25）。

## 次の 3 手

1. P4 の前提のクイズ（learning-loop.md §6 P4）。最初に mazuoboeru の公開の一覧のタグを語彙と突き合わせ、前提のタグを層と章のどちらから引くかを決め、前提に欲しい 12 語を語彙に足す（§6 P3 の「後に回したこと」）。続けてクイズ待ちの一覧。
2. 第X部の検収を持ち主に聞く: 層の読み 2 つと見た目（log/2026-11-22-fp-create.md §10）、残した点 3 つ（plan.md「後で見直す所」の第X部の項。Turing 1937、`<code>` の「-」の折れ、記憶照合だけの文献）。
3. `tools/stepindex.mjs` の数字で始まる題の頭を削る不具合を直す（24 行め。タグを剥がす前に番号の span を除く）。

## 詰まり・人手待ち

- 検収をまだ聞いていない: 層をつなぐ作業の P2〜P6（log/2026-11-22-handoff.md の各項）と第X部（上の 2 手め）。
- kokemusu の `docs/senders.md` の送り側一覧に、透き通るの実装の場所（`assets/kokemusu.js`）を足す。kokemusu で開いたセッションで行う（learning-loop.md §6 P4 の残り）。

## 進行中 PR

- なし（日刊の PR は毎朝 news-pr.yml が検査してマージする。落ちたものは開いたまま残る）。
