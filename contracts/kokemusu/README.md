# 苔むすの契約（vendoring）

苔むす（okayus/kokemusu）が受信側として所有する schema の写し。読み方の文書は苔むすの [docs/senders.md「リンクで渡す」](https://github.com/okayus/kokemusu/blob/main/docs/senders.md#リンクで渡す)。変更は受信側 → 送信側の順で、上限やキーはこの写しと苔むすの文書だけに置く（苔むす ADR-0008。ほかのファイルに写さない）。

| ファイル | 元 | 取り込んだ版 |
|---|---|---|
| posts.schema.json | okayus/kokemusu `docs/senders/posts.schema.json`（`POST /api/posts` の body。リンクで渡す `/積む#post=` の中身も同じ形） | main fa38cca（2026-11-25）。schema の中身は 33b01ea（2026-09-11）から変わっていない |

- 使う所: `assets/kokemusu.js`（ノートのページの「苔むすに積む」。中身を作る `post` と、URL を作る `href`）。
- 検査: `node tools/build-news.mjs && node tools/kokemusucheck.mjs`。作ったノートのページに埋めた中身を、この写しと苔むすの「日の規則」で確かめ、URL を解いて元に戻るかを見る。
- 古さ: `node tools/kokemusucheck.mjs --fetch` が、苔むすの main の schema と比べる。
- 更新: 苔むすの docs/senders.md の変更履歴（wire）を読んでから、`curl -fsSL https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders/posts.schema.json -o contracts/kokemusu/posts.schema.json` で上書きし、この表の版を直して、上の検査を通す。検査が読まない語が写しに入ったら、`tools/kokemusucheck.mjs` の `valid` を直す。
