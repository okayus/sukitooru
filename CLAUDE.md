# sukitooru（透き通る）

「インターネットで YouTube の動画が見られるまで」を電子から画素まで追う、アニメーション学習教材（純粋な HTML/CSS/JS、ビルドなし）。リポジトリは okayus/sukitooru。手元のディレクトリ名（`youtube-ga-mieru-made`）は変えない（Claude Code の記憶と履歴がこのパスに結びついている）。

- いま: `docs/status.md`（今の段と次の 3 手。40 行・3 KB まで）。手元のセッションでは SessionStart hook（`.claude/hooks/session-start.sh`）が最初に出す。節目は `docs/log.md`（新しい順に 1 行ずつ）、題ごとの計画は `docs/plans/`（済んだら消す）。区切りで持ち主が `/handoff` を打って書き戻す。進み具合と履歴はこのファイルに書かない。日刊のクラウドの実行（`docs/daily-news.md`）は、この 3 つを読まない。
- 始める前に `git pull --ff-only`、push の前に `git pull --rebase`（日刊が毎朝 main にマージされる）。担当への指示書の雛形は `docs/briefs.md`、作業の詳しい記録は `docs/log/`。
- 全体計画と進捗: `docs/plan.md`（全43章・10部。章ごとの6場面の題材と進捗表）
- 章の書き方: `docs/authoring.md`（骨組み、場面の型、エンジン API、高さの予算、検証、文章の書き方）
- 手本の章: `chapters/01-denshi.html`
- 共通ファイル: `assets/base.css`（配色・レイアウト・SVG 用クラス）、`assets/engine.js`（場面・段階・動きの時計・SVG 部品）。章の都合で変えない。変えるときは全章に影響することを確認する。
- 検証: `node tools/verify.mjs [--shots DIR --all-steps] chapters/NN-*.html`（ヘッドレス Chrome で JS エラー・はみ出し・横スクロール・リンク切れ・時刻送りの例外・未定義のクラスを測る。`--nav` で段階の行き来も比べる。`--overlap` で止まっている文字どうしの重なりも調べる。`--drill` で掘り下げの印を 1 つずつ開いて板を調べる）。章を直したら必ず走らせる。他の章へのリンク（掘り下げの印の行き先と部品も）は `node tools/xrefcheck.mjs chapters/NN-*.html`。
- 掘り下げ: 図の要素に「下の層へ」の印（`YT.drill.mark`）を付けると、押したとき場面の上に板が重なり、下の章の場面（`?embed=1` の埋め込み）か部品（`assets/parts/<名前>.js`、`YT.parts.define`）を見せる。書き方は `docs/authoring.md` §5.5。手本は第9章 場面3 の `syscall` から第1章まで。場面ごとの印の数と向きは `node tools/drillcheck.mjs [--list] chapters/NN-*.html`、行き先探しは `node tools/stepindex.mjs`（全章の場面・段階の索引）。
- 部品の見本: `parts.html`（部品ごとに 1 場面。`parts.html?part=<名前>` でその部品だけ、残りの問い合わせは部品に渡す値。verify.mjs・shot.mjs にもこの形で渡す）。「使う所」は章の印から `node tools/build-parts.mjs` で作り直す。`parts.html?set=anim` はニュースの台本の部品 6 つ（下の「ニュースの台本」）。
- 時刻を指定した写真: `node tools/shot.mjs chapters/NN-*.html --scene N --step K --at 0,1.5,3 --out DIR [--dark] [--size 1280x688]`（動く札の止まる位置や、途中で書き換わる文字・色を確かめる。`--size` は上部バーのタブが収まるかを見るとき）。
- 用語索引: `glossary.html` が `assets/glossary-data.js` を読む。章の用語表を直したら `node tools/build-glossary.mjs` で作り直す。
- 配信: `tools/serve.sh` で http://127.0.0.1:8766/ 。止めるのは `tools/serve.sh stop`（pkill は使わない）。
- 公開: Worker `sukitooru`（https://sukitooru.shiraoka.workers.dev/）。main に push すると Workers Builds が配り直す。設定は `wrangler.jsonc`（コードの無い、静的アセットだけの Worker。配る前に `build` で news/ のページを作る）、配る範囲は `.assetsignore`（ページとページが読むものだけ）、`/` と `/news/` は `_redirects`。配信先での検証は `node tools/verify.mjs --base https://sukitooru.shiraoka.workers.dev/ <ページ>`。手元での試しは `wrangler dev`（このリポジトリは依存を持たないので、kokemusu の wrangler を使う）。
- 表示方針は one-screen-artifact スキルに従う（デスクトップは場面ごとに1画面、スマートフォンは縦読み）。
- 層の登録簿: `assets/layers.js`（25 の層、層の上下、全 258 場面の層）。ニュースの層・層の地図（`assets/news-graph.js`）・章の見出しのニュースの札が読む。章の場面を足したり層を変えたりしたら `node tools/layercheck.mjs` で確かめる。
- ニュースの学習: `news/`（tech ニュースを調べ、この教材のどの層＝章・場面の話かに結びつけたノート）。ノートは Markdown で書き、`node tools/build-news.mjs` でページ（`news/*.html`）、一覧（`news/index.html`。層の地図と「教材に無い」を含む）、月のページ（`news/YYYY-MM.html`）、ノートのデータ（`news/news-data.js`）を作る。作ったものはコミットしない（`.gitignore`）。手元で開く前と検証の前に走らせる（新しい worktree や clone には無い）。ノートの「層」の場面の表は、行を段階にした層の歩き（`assets/news-graph.js` の `walk`。行の層を図で光らせ、章の場面を掘り下げの板で開く）になる。書き方は `news/README.md`。
- ニュースの台本: ノートの場面に ```` ```anim <部品> ```` のブロック（台本。登場する物と段階ごとの変化だけを書く）を置くと、その場面が動きの場面になる。描くのは手で書いた部品（`assets/parts/` の seq・mem・stack・boxes・tree・timeline。詳しいノートだけは `news/anim/<名前>.js` も）。台本の書き方は `news/README.md`「動きの場面（台本）」、読み方と検査は `assets/anim-script.js`（build-news.mjs と news-pr-check.mjs が使う）、部品の作り方は `docs/authoring.md` §5.6。台本は `parts.html?part=<部品>&src=<URL エンコードした台本>` で試せる。
- 日刊のノート: 毎朝、クラウドの scheduled task が `docs/daily-news.md` の手順で 1 件書き、`claude/news-*` のプルリクエストを出す。`.github/workflows/news-pr.yml` が検査（`tools/news-pr-check.mjs`、README の表の作り直しとの一致、`verify.mjs`）してマージし、Workers Builds が公開する。候補集めは `node tools/news-candidates.mjs`。
