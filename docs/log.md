# 記録（足すだけ・新しい順）

1 行が 1 つの節目（push・マージ・持ち主の作業の完了・公開の状態の変化）。形は `- YYYY-MM-DD 何を（コミット・記録）`。記録は `docs/log/` からの相対パス。
自動では全体を読まない（SessionStart hook が新しい 5 行を出す）。作業中の試行錯誤は書かない（git log と `docs/log/` の作業記録にある）。

- 2026-11-25 日刊の候補の 3 語（ファイアウォール、Cookie、疑似乱数）を持ち主が語彙に足した（aeff2c5。語彙 95 個）。候補はノートを直さずに内容のタグになるが、札が増え、Check Point のノートの表紙の余りが 1280×688 で 29px から 2px に減った（CI は新しいノートしか検証しないので、足したら手元で verify.mjs にかける）
- 2026-11-25 手で起こした日刊（#11、fd3ebeb）で P3 の出口を満たした。語彙のタグ 5 個・前提 2 個・候補 3 語で出て、news-pr.yml（タグの strict の検査を含む）と Workers Builds が success、本番の tags.html とタグのページが verify.mjs で ✓（plans/learning-loop.md §6 P3）
- 2026-11-25 透き通るの P3（タグ）を push した（681c010）。語彙 `assets/tags.js`（92 個）、既存の 18 件のタグ（担当が付けた）、タグの札・`news/tag-<id>.html`・`news/tags.html`、日刊の型・手順・検査。層の指定の印を `tags` から `layer` に改めた
- 2026-11-25 持ち主が決めた: 日刊の動きの場面は任意のまま（試しの 7 件のうち 6 件が台本を足した。2c24df6）、learning-loop.md §3 の 2（タグは語彙から選び、無い語は候補として出して持ち主が足す）。取り込み済みの手元のブランチ `wip/fp-part-x` を消した
- 2026-11-25 透き通るの P2 を終えた。kokemusu に「リンクで渡す」入口 `/積む#post=…` が入り（kokemusu #87・ADR-0009、11-24 に merge）、本番を持ち主の端末で確かめた。契約は kokemusu の docs/senders.md「リンクで渡す」（plans/learning-loop.md §6 P2）
- 2026-11-24 learning-loop.md §3 の 1（記録の形）を、持ち主が推奨の「kokemusu が開き、積むを押す」に決めた
- 2026-11-24 kokemusu のサンドボックスの GitHub の PAT（期限切れ）を持ち主が再生成し、1Password の `github-pat-kokemusu-sandbox` を書き換えた（期限 2026-12-24、30 日。`./shell.sh gh auth status` で確認）
- 2026-11-24 okayus-skills の cloudflare-workers-builds-keyless-deploy に静的サイトの版を還元した（0.4.2 → 0.5.0。references/static-site.md、「接続」が出ない罠、GITHUB_TOKEN のマージでの起動、改名の後の接続。okayus-skills #52、32971f7、2026-11-23-p1-cutover.md）
- 2026-11-24 11-24 朝の日刊（#9、5f0a81d）で P1 の出口を満たした。差はノートの md と README.md の表だけで、news-pr.yml が success、マージのコミットに check-run `Workers Builds: sukitooru` success、新しいノートが新しい URL で 200。クラウドの実行は改名したリポジトリで動いた（2026-11-23-p1-cutover.md）
- 2026-11-23 日刊の手順 5 で、missing の名前を揃える先をノートの md の grep にした（news/index.html はコミットしなくなり、クラウドの clone に無いため）。ルーティンのプロンプトは手順書を指すだけで、改名の影響は無かった（d6f27f3、2026-11-23-p1-cutover.md）
- 2026-11-23 日刊のルーティンのリポジトリを okayus/sukitooru に替えた（名前「日刊のノート（sukitooru）」。effort max・モデル・環境はそのまま）
- 2026-11-23 公開を Worker sukitooru に切り替えた。GitHub Pages を止め、リポジトリを okayus/sukitooru に改名し、サイトの名前を「透き通る」にした。古い URL は転送しない。news/ のページはコミットせず、デプロイのときに作る。全 68 ページが新しい URL で ✓（9fb1b1b・4d4fc0f、2026-11-23-p1-cutover.md）
- 2026-11-23 第X部「関数型」（第37〜43章）を公開した。作成・仕上げ確認・共通の変更・層「関数型」（横断の 4 つめ、ニュースの層の地図も）・既存の 6 章から 9 か所のリンク・全 37 ページの検証まで（6bb640a〜90adba0、2026-11-22-fp-create.md）。全43章・10部・層 25・場面 258。plans/fp-part-x.md は消した
- 2026-11-23 11-23 朝の日刊のマージ（#8、77044eb）に check-run `Workers Builds: sukitooru` success。新しいノートと第43章が新しい URL で 200（learning-loop.md §8 の 1 つ目）
- 2026-11-22 持ち主の依頼: 関数型の重要な概念のページを作る。第X部「関数型」（第37〜43章）として設計し、担当への指示書を書いた。章はまだ無い（plans/fp-part-x.md、2026-11-22-fp-brief.md）
- 2026-11-22 Workers Builds を Worker sukitooru につないだ。push（440b3da）で最初のビルドが起動し、デプロイまで通った（check-run `Workers Builds: sukitooru` success、2026-11-22-p1.md）
- 2026-11-22 Worker sukitooru を作り、main と同じ内容を https://sukitooru.shiraoka.workers.dev/ で配り始めた。全 60 ページが verify.mjs --base で ✓（153ae67、2026-11-22-p1.md）
- 2026-11-22 引き継ぎを status hub に替えた（docs/status.md・docs/log.md・SessionStart hook・/handoff）。それまでの docs/handoff.md は 2026-11-22-handoff.md（plans/learning-loop.md の P0）
- 2026-11-22 持ち主の依頼: 名前を「透き通る」に変え、Cloudflare に移し、タグでニュース・クイズ・記録をつなぐ（plans/learning-loop.md）
- 2026-11-19 日刊のルーティンを effort max にした（Opus 5.5、環境 daily news）。動きの場面の試しは 11-25 まで
- 2026-11-18 層をつなぐ P6: ニュースの台本と部品 6 つ（103f7f9、2026-11-18-p6.md）
- 2026-11-18 層をつなぐ P5: 部品 9 つと、章の印の部品への張り替え（3dd481f、2026-11-18-p5.md）
- 2026-11-18 層をつなぐ P4: 第2〜25章に掘り下げの印 518 個（22e8319、2026-11-17-p4.md）
- 2026-11-18 日刊のノートが新しい手順で初めてマージされた（#3）
- 2026-11-17 層をつなぐ P2・P3: 掘り下げの板と、ノートの層の歩き（8e243a0・3a0a024、2026-11-17-p2.md・2026-11-17-p3.md）
- 2026-11-16 層をつなぐ P0・P1: 目次からニュースへの導線と、層の登録簿（002862e・830adbd、layers-plan.md）
- 2026-11-16 日刊のノートの最初のマージ（#1）
- 2026-11-15 日刊のノートの仕組み: 候補集め・検査・自動のマージ・scheduled task（2f9e31d、2026-11-15-daily-news.md）
- 2026-11-14 第IX部「ブラウザを読む」第31〜36章（0d6e89c、2026-11-14-saba-review.md）
- 2026-11-14 ニュースのノートに「更新の型」（0be48c8）
- 2026-11-01 第VIII部 第30章「エミュレータの外側」（74d65b4、2026-11-01.md）
- 2026-10-29 第28章「コンパイラ」・第29章「型で意味を表す」（c03df9b、2026-10-29.md）
- 2026-10-28 第VII部 第26・27章（05dece0、2026-10-28.md）
- 2026-10-25 ズーム（YT.zoom）を第6章と第5章に（e0e5a7f・85199e7・d65dcd6、2026-10-25.md）
- 2026-10-21 ニュースのノートを始め、サイトで読めるようにした（db7e9dc・4482c27）
- 2026-10-19 内容レビューの対応、git での管理、GitHub Pages での公開（b708c1d・a9dddb7、2026-10-19.md）
