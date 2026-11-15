# youtube-ga-mieru-made

このリポジトリの決まりは [CLAUDE.md](CLAUDE.md) に書いてある。作業の前に読む。このファイルは、Codex のコードレビューに向けた決まりだけを持つ。

## Code Review Rules

### 日刊のノート（claude/news-* のプルリクエスト）

毎朝の自動の実行が、`news/` に日刊のノートを 1 つ足すプルリクエストを出す（手順は [docs/daily-news.md](docs/daily-news.md)、型は [news/README.md](news/README.md) の「日刊の型」）。

- 見るのは、足された `news/YYYY-MM-DD-題.md` だけ。`news/` の `.html` と `news/README.md` の表は `tools/build-news.mjs` の出力で、GitHub Actions が作り直して一致を確かめる。レビューしない。
- 本文が出典と食い違っていたら指摘する。対象は、数値・日付・版・固有名・因果の説明。出典はノートの「出典」の行と「出典と確かさ」の節にある。開いて確かめられなかった出典は、確かめられなかったと書く。
- 章と場面へのリンクが、リンク先の場面の中身と合っていなかったら指摘する。場面 K の中身は `chapters/NN-名前.html` の 2 か所にある。`id="sK"` の section（見出し・リード・補足・図の説明）と、スクリプトの `const sK = { steps: [...] }`（段階ごとの題と文）。
- 確かめていないことを言い切っている文を指摘する。安全な書き方は、「確かめていない」と書くか、出典の言い方に合わせて弱めること。
- 文体・語の選び方・長さは指摘しない。はみ出しとリンク切れは `tools/verify.mjs` が確かめる。
