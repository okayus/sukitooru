# nginx の HTTP/2 の処理にあった 2 つのメモリ安全の脆弱性（2026-11-18）
<!-- kind: daily -->
<!-- tags: http -->
<!-- missing: HTTP/2 のフロー制御、ASLR -->

- 出典: nginx の[セキュリティ勧告の一覧](https://nginx.org/en/security_advisories.html)と[変更の記録](https://nginx.org/en/CHANGES)（2026-11-18。1.31.9 と 1.30.7）。見つけた組の 1 つ、Wiz Research の[記事](https://www.wiz.io/blog/nginx-http2-rce-vulnerabilities)（2026-11-18）。
- 話題: [Hacker News](https://news.ycombinator.com/item?id=50547374) の 1 位（677 点）と[はてなブックマーク](https://b.hatena.ne.jp/entry/s/www.wiz.io/blog/nginx-http2-rce-vulnerabilities)（15 users）、2026-11-19 の朝の時点。
- 調べた時点: 2026-11-19。日刊のノート（自動で選んで書いた）。人は確かめていない。nginx.org の 1.31.8 と 1.31.9 のソースを比べ、直した行を確かめた。

## 要点

HTTP/2（第21章 場面3）で届くフレームを扱う nginx のコードに、メモリの安全（第26章 場面6）を壊す脆弱性が 2 つあった。CVE-2026-123633 では、要求を処理中の接続が「閉じてよい接続」の列に残り、接続の枠が足りなくなると nginx 自身がその接続を解放して、要求が解放後のメモリを使い続ける。CVE-2026-123007 では、送ってよい量を数える符号なしの数が上限を超え、上限からの引き算が下にあふれて検査を素通りし、最後は範囲外のメモリの写しになる。Wiz は、どちらでも認証なしにコードを実行できたと書き、nginx は 2026-11-18 の 1.31.9 と 1.30.7 で直した。

## どの層の話か <!-- tab: 層 -->

種類は事故（脆弱性の公表と修正）で、働くのは実行時、HTTP/2 で話す相手が nginx に送るフレームの並びで起きる。当たるのは HTTP/2 を有効にした nginx で、CVE-2026-123633 は要求を奥のサーバーへ渡す置き方のときに限る（F5）。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| 逆プロキシ | nginx は TLS と HTTP を終えて、要求を奥のサーバーへ渡す役でよく使われる。CVE-2026-123633 は、奥への接続を開くときに起きる。CVE-2026-123007 は、奥を持たずに静的なファイルを返す nginx でも起きた（Wiz） | [22章 場面3][22-3] |
| **HTTP/2** | 攻撃者は、HEADERS フレームを途中まで送る、WINDOW_UPDATE フレームを数多く送る、といったフレームの並びで欠陥まで届く | [21章 場面3][21-3] |
| 送れる量の窓 | HTTP/2 にも TCP の受信ウィンドウと同じ考え方の窓がある。nginx は接続ごとに、送ってよい残りを `send_window` で数える。上限は 2³¹−1 | 教材に無い（HTTP/2 のフロー制御）。近いのは [19章 場面4][19-4] |
| 整数の型 | `send_window` は符号なしの `size_t` で、上限を超えた数を上限から引くと、負にならず大きな正の数になる。のちに符号付きの `off_t` に直すと、十分に大きな数は負の長さになる | [26章 場面1][26-1] |
| **メモリの安全** | 解放した接続のメモリを、要求の処理が使い続ける（CVE-2026-123633）。負の長さが、範囲外のメモリの写しになる（CVE-2026-123007） | [26章 場面6][26-6] |
| プロセス | 壊れるのはワーカーのプロセスで、CVE-2026-123007 では多くの場合 segmentation fault で落ちる（F5）。コードを実行するには ASLR を破る必要があり、Wiz はどちらの欠陥でもメモリを読み出して破れたと書く | 教材に無い（ASLR）。近いのは [9章 場面4][9-4] |

## 何が起きたか <!-- tab: 動き -->

CVE-2026-123633 では、要求が始まっても接続が「閉じてよい接続」の列に残る。接続の枠が足りなくなると、nginx は処理中のその接続を閉じに行き、要求の処理は解放されたメモリを使い続ける。

```anim mem
title: 処理中の接続を閉じ、解放したメモリを使う
caption: 左はポインタを持つ所、右はワーカーのメモリ（模式）。破線は解放した区画と、それを指したままのポインタ。関数の名前は 1.31.8 のソース。
left: ポインタを持つ所
right: ワーカーのメモリ
ptr req: 要求の処理 | ストリーム 1 本 -> conn
ptr drain: `ngx_drain_connections()` | 列から閉じる接続を選ぶ -> conn
block conn: HTTP/2 の接続 | 閉じてよい接続の列にある
step: HEADERS を途中まで送る
要求が 1 本も無い接続では、`ngx_http_v2_handle_connection()` が接続を閉じてよい列に入れる。フレームの残りを待つ間も、列に入れたままにする。
show: conn
down: conn -> 21-http.html#s3: HEADERS は、要求のヘッダを運ぶ HTTP/2 のフレーム
step: 残りが届き、要求が始まる
`ngx_http_v2_create_stream()` がストリームを作り、処理中の要求の数 `processing` を 1 増やす。接続を列から外さないので、処理中なのに閉じてよい接続のままになる。
show: req
x: req conn
step: 奥への接続で、枠が足りない
要求を奥のサーバーへ渡すため、`ngx_get_connection()` が接続の枠を取る。空きが `worker_connections` の 1/16 以下だと、列の接続を閉じに行き、この接続が選ばれることがある。
show: drain
set: req = 要求の処理 | 奥への接続を開く途中
x: drain req
down: req -> 22-server.html#s3: 奥のサーバーへ要求を渡すのは、TLS を終えた逆プロキシ
step: GOAWAY を作れず、解放する
閉じる前に GOAWAY フレームを作ろうとするが、接続のフレームが上限の 10,000 個に達し、使い回せる物も無いと作れない。誤りの道が接続を閉じ、結びついたメモリを解放する。
bad: conn req
set: conn = 解放した区画 | 要求の処理はまだ指している
x: conn
step: 戻った処理が、古いポインタで読む
呼び出しから戻ると要求の処理が続き、古いポインタをたどる。解放した区画が別のデータに使い回されていれば、それを要求や接続の中身として扱う。Wiz は、ここから認証なしのコードの実行まで確かめた。
hide: drain
ok: conn
set: conn = 別のデータ | 要求や接続として読まれる
send: conn -> req: 古いポインタで読む
x: conn req
down: conn -> 26-kata.html#s6: 解放した区画は、別の型の物に使い回される
```

## 中身 <!-- tab: 中身 -->

### 起きたこと

- 2026-11-18、nginx は 1.31.9（mainline）と 1.30.7（stable）を出し、それぞれ 10 個と 9 個の CVE を直した。HTTP/2 の 2 つはその一部である。
- 当たる版は、CVE-2026-123007 が 1.9.5（2015 年）〜1.31.8、CVE-2026-123633 が 1.19.7〜1.31.8。どちらも HTTP/2 を有効にしたときだけ当たる。
- 深刻度は、F5 の CVE の記録ではどちらも CVSS 4.0 で 9.2（Critical）、CVSS 3.1 で 8.1（High）。
- Wiz・Ikotas Labs・Metnir・Rapid7・Xint が別々に見つけて F5 へ知らせた（Wiz）。Wiz は AI を使う自社の道具で見つけたと書き、攻撃のコードは公開していない。
- Wiz は CVE-2026-123007 で、公式の 1.31.7 と 1.31.8 のビルドに対し、ASLR を破ってコードを実行できた。64 ビットの機械で、TLS の上の HTTP/2 で、メモリから応答を返す道を使った。

### CVE-2026-123007 の原因

- nginx は応答のデータを送る待ち行列に入れるとき、その大きさを `send_window` から先に引く。ストリームが取り消されると、`ngx_http_v2_filter_cleanup()` が送らなかった分を戻す。戻すときに上限を確かめない。
- 待つ間に相手が WINDOW_UPDATE で窓を広げていると、戻した後の数が上限を超えることがある。検査 `window > NGX_HTTP_V2_MAX_WINDOW - h2c->send_window` の引き算が下にあふれ、どの増分も通る。相手は WINDOW_UPDATE を数多く送って、数を好きな大きさにできる。
- `ngx_http_v2_send_chain()` がこの数を `off_t` に直すと、十分に大きい数は負になり、応答の区画の終わりが始まりより前を指す。TLS で送る `ngx_ssl_send_chain()` がそれを写すとき、範囲外のメモリを写す。

### 対策

- 1.31.9 か 1.30.7 以降に上げる。F5 の商用版 NGINX Plus にも直した版が出た。
- すぐ上げられなければ HTTP/2 を止める（1.25.1 以降は server の `http2 off;`。`listen` の `http2` も外す）。読み込み直したら、古いワーカーが終わったことを確かめる（Wiz）。
- 1.31.9 のソースでは、要求を作る `ngx_http_v2_create_stream()` に、接続を列から外す `ngx_reusable_connection(h2c->connection, 0);` の 1 行が足された。送る待ちの量は `send_queued` で別に数え、WINDOW_UPDATE の検査で `send_window` と合わせて上限と比べる。
- HTTP/2 を終える CDN や WAF が前にあれば、攻撃のフレームがそのまま nginx に届かず、一部を防げることがある。実装による（Wiz）。

## 前提と出典 <!-- tab: 前提 -->

### 前提知識

| 概念 | このニュースでの役割 | 章・場面 |
|---|---|---|
| 符号なしと符号付きの整数 | 同じビットを符号なしで読むと大きな正の数、符号付きで読むと負の数になる。CVE-2026-123007 の長さが負になった | [26章 場面1][26-1] |
| 解放後の使用 | 解放した区画は別の物に使い回される。古いポインタで読み書きすると、別の物を壊す | [26章 場面6][26-6] |
| ASLR | プロセスのメモリの配置を起動ごとにずらし、番地を当てにくくする。2 つの欠陥はメモリを読み出せるので、番地を知って破れる（Wiz） | 教材に無い。近いのは [9章 場面4][9-4] |
| 受信ウィンドウ | 受け手が受け取れる量を知らせ、送り手はその分だけ送る。HTTP/2 は同じ窓を接続とストリームごとに持ち、WINDOW_UPDATE で広げる | [19章 場面4][19-4] |
| フレームとストリーム | 1 本の接続に、HEADERS や DATA のフレームで何本もの要求を混ぜる | [21章 場面3][21-3] |

### 出典と確かさ

- nginx の[セキュリティ勧告の一覧](https://nginx.org/en/security_advisories.html)と、[1.31.9](https://nginx.org/en/CHANGES)・[1.30.7](https://nginx.org/en/CHANGES-1.30) の変更の記録（2026-11-18）。当たる版、直した CVE の数、nginx の深刻度はここから取った。
- F5 の CVE の記録 [CVE-2026-123633](https://www.cve.org/CVERecord?id=CVE-2026-123633)・[CVE-2026-123007](https://www.cve.org/CVERecord?id=CVE-2026-123007)（2026-11-18 公開）。CVSS と、ASLR を破ればコードを実行できるという説明はここから取った。
- [Wiz Research の記事](https://www.wiz.io/blog/nginx-http2-rce-vulnerabilities)（Nir Ohfeld・Tomer Schwartz、2026-11-18）。欠陥の仕組み、攻撃を確かめた条件、HTTP/2 を止める回避策はここから取った。
- 確かめたこと: nginx.org の nginx-1.31.8.tar.gz と nginx-1.31.9.tar.gz を tar（GNU tar 1.35）で展開し、`src/http/v2` を diff（GNU diffutils 3.10）で比べた。ビルドも実行もしていない。関数の名前、`send_window` の型、上限 `(1U << 31) - 1`、フレームの上限 10,000 個、空きが 1/16 以下という条件は、このソースで読んだ。
- 出典どうしの食い違い: CVE-2026-123633 の深刻度は、nginx.org の一覧では medium（CVE-2026-123007 は major）で、F5 の CVE の記録の 9.2（Critical）と違う。謝辞も違い、nginx の変更の記録は CVE-2026-123633 を「Albert of Vexera AI」、CVE-2026-123007 を Xint.io に帰し、CVE の記録はそれぞれ 3 組と 4 組を挙げる。
- 確かめていないこと: 攻撃のコードは公開されておらず、コードを実行できることは Wiz と F5 の説明だけによる。CVE-2026-123007 で数を負にするのに要る WINDOW_UPDATE の数と時間は調べていない。F5 の勧告のページ（K000163926・K000163928）は、中身をスクリプトで読み込むので機械的な取得では読めず、CVE の記録で代えた。

[9-4]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s4
[19-4]: https://sukitooru.shiraoka.workers.dev/chapters/19-tcp.html#s4
[21-3]: https://sukitooru.shiraoka.workers.dev/chapters/21-http.html#s3
[22-3]: https://sukitooru.shiraoka.workers.dev/chapters/22-server.html#s3
[26-1]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s1
[26-6]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s6
