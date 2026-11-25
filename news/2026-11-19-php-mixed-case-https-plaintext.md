# PHP が大文字の HTTPS:// を平文で送っていた脆弱性（2026-11-19）
<!-- kind: daily -->
<!-- layer: tls -->
<!-- tags: PHP、TLS、URL、セキュリティ -->
<!-- missing: PHP 本体（サーバーの言語処理系）、FTP -->

- 出典: PHP の勧告 [GHSA-f6gg-rchx-xw8j](https://github.com/php/php-src/security/advisories/GHSA-f6gg-rchx-xw8j)（CVE-2026-128064、2026-11-19）と、同じ日の 8.2.36・8.3.37・8.4.28・8.5.13・8.6.0 の[変更の記録](https://www.php.net/ChangeLog-8.php)。
- 話題: [はてなブックマーク](https://b.hatena.ne.jp/entry/s/forest.watch.impress.co.jp/docs/serial/yajiuma/2158241.html)のテクノロジーの 2 位（176 users、2026-11-21 の朝の時点）。
- 調べた時点: 2026-11-21。日刊のノート（自動で選んで書いた）。人は確かめていない。手元の PHP 8.3.6 で、`HTTPS://` の URL への POST が 80 番に平文で届くことを確かめた。

## 要点

PHP が URL を開くとき、TLS（第20章 場面1）をかけるかどうかを決める所に欠陥があった。HTTP と FTP のストリームは `HTTPS://` のように大文字で書いたスキームも受け付けるが、TLS を使うかは決まった位置の小文字の `s` で判定していたため、末尾の S が大文字の URL では暗号化せずにつないだ。`file_get_contents()` などで送る認証の情報・Cookie・POST の本文を、通信を見られる者が読める。PHP は 2026-11-19 の 8.2.36・8.3.37・8.4.28・8.5.13 と 8.6.0 で、スキーム全体を大小を区別せずに比べるよう直した。

## どの層の話か <!-- tab: 層 -->

種類は事故（脆弱性の公表と修正）で、働くのは実行時、PHP のプログラムが URL を開いて相手に要求を送るときに起きる。悪用には、大文字を含む URL が直接か転送でストリームに渡ることと、通信を見られることの両方が要る（勧告）。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| URL | PHP は URL を部品に分け、スキームが `http` か `https` なら HTTP のストリームで開く。この比べ方は大文字と小文字を区別しないが、TLS を決める行だけが決まった位置の小文字の `s` を見ていた | [31章 場面3][31-3] |
| ポート | TLS を使わないと決まると、ポートを書いていない URL の接続先は 443 番ではなく 80 番になる | [19章 場面1][19-1] |
| **TLS** | TLS を通さないので、要求は文字のまま経路を通る。同じ網の機器や途中の中継が、認証のヘッダ・Cookie・本文を読める | [20章 場面1][20-1] |
| HTTP | 307・308 の転送では、メソッドと本文を保って送り直す。正しい HTTPS の相手が大文字の `HTTPS://` へ転送すると、POST の本文と認証のヘッダが平文で出る | [21章 場面2][21-2] |
| FTP | `ftpS://` なども同じで、TLS に切り替える `AUTH TLS` を送らずに、ログインの `USER`・`PASS` を平文で送る | 教材に無い（FTP）。近いのは [21章 場面1][21-1] |

## 何が起きたか <!-- tab: 動き -->

小文字の `https://` なら最初に TLS のハンドシェイクを送るが、大文字の `HTTPS://` では 80 番へ平文の要求を送る。転送で大文字の URL へ導かれたときも同じになる。

```anim seq
title: `HTTPS://` だと TLS を通さずに送る
caption: 列は PHP のアプリ、途中の機器、相手のサーバーで、下へ時間が進む（模式）。要求の例は PHP の試験に合わせ、段階1・2 は手元の PHP 8.3.6 で確かめた。
actor app: PHP のアプリ | `file_get_contents()`
actor mid: 途中の機器 | 通信を見られる者
actor srv: 相手のサーバー | 443 番・80 番
msg m1: app -> srv: 443 番へ ClientHello
note n1: mid: 暗号文しか見えない
msg m2: app -> srv: 80 番へ `POST /secret HTTP/1.1`
msg m3: app -> srv: `Authorization` と本文
note n2: mid: 要求がそのまま読める
msg m4: app -> srv: 443 番へ TLS で POST
msg m5: srv -> app: 307 で `HTTPS://…` へ転送
msg m6: app -> srv: 80 番へ同じ本文と認証
note n3: mid: 本文と認証が読める
step: 小文字の https:// は TLS から
`https://` と書くと、PHP は `ssl://ホスト:443` へつなぎ、最初に TLS の ClientHello を送る。手元で受けると、届いた最初のバイトはハンドシェイクを示す 0x16 だった。`HTTPs://` も 5 文字目が小文字なので同じになる。
show: m1 n1
down: m1 -> 20-tls.html#s5: ClientHello は、鍵交換の値を入れて送る TLS 1.3 のハンドシェイクの最初のメッセージ
step: 大文字の HTTPS:// は平文で
`HTTPS://alice:secret@…` へ POST すると TLS を使わないと決まり、ポートを書かない URL なので `tcp://ホスト:80` へつなぐ。手元の受け手には、要求行・URL の名前とパスワードから作った `Authorization` の行・本文が、そのまま届いた。
show: m2 m3 n2
bad: m2 m3
down: m2 -> 19-tcp.html#s1: 80 番は HTTP の、443 番は HTTPS のよく知られたポート
down: n2 -> 20-tls.html#s1: 要求がそのまま読めるのは、TLS をかけない通信が経路のどこでも読める平文だから
step: 転送でも平文に落ちる
正しい `https://` の相手でも、307 か 308 の転送で大文字の `HTTPS://` へ導かれると同じになる。8.5.12 のソースは、スキームを大小を区別せずに比べて同じ相手と見なし、認証のヘッダを外さない。307・308 ではメソッドと本文も保つ。
show: m4 m5 m6 n3
bad: m6
down: m5 -> 21-http.html#s2: 307 の転送は、状態コードの 3xx が示す転送の 1 つ
```

## 中身 <!-- tab: 中身 -->

### 起きたこと

- 2026-11-19、PHP は勧告 GHSA-f6gg-rchx-xw8j（CVE-2026-128064）を公開し、8.2.36・8.3.37・8.4.28・8.5.13 で直した。同じ日の 8.6.0 の変更の記録にも同じ項目がある。8.5.13 は、ほかに 16 件の勧告も直した。
- 深刻度は High（CVSS 4.0 で 8.2）、弱点の分類は CWE-319（機微な情報の平文での送信）。
- 勧告は、アプリが渡す URL では PHP 5.2.0（2006 年）から、大文字の URL への転送では 4.3.0（2002 年）から当たると書く。
- 見つけたのは Kushalkhemka、知らせたのは Shalistera と offset7、直したのは bukka（勧告の謝辞）。

### 原因

- スキームは大小を区別しない決まりで、RFC 3986 §3.1 は `HTTP` も `http` と同じに受け付けるよう勧める。PHP の HTTP のストリームも、受け付ける所は `zend_string_equals_literal_ci()` で大小を区別せずに比べていた。
- 8.5.12 のソースで TLS を決める行は `use_ssl = (ZSTR_LEN(resource->scheme) > 4) && ZSTR_VAL(resource->scheme)[4] == 's';` で、5 文字目だけを小文字の `s` と比べる。FTP のストリームは 4 文字目を比べていた。

### 対策

- 修正版に上げる。8.5.13 は、HTTP は `zend_string_equals_literal_ci(resource->scheme, "https")`、FTP は `"ftps"` と、スキーム全体を比べる。
- すぐ上げられなければ、スキームを小文字にそろえてからストリームに渡し、自動の転送を止めるか、転送先をすべて確かめて正規化する。最初の URL だけを直しても、転送は守れない（勧告）。
- 8.5.13 には試験が 2 つ足された。HTTP は受け手に届いた最初のバイトが TLS の 0x16 か、FTP は最初のコマンドが `AUTH TLS` かを確かめる。

## 前提と出典 <!-- tab: 前提 -->

### 前提知識

| 概念 | このニュースでの役割 | 章・場面 |
|---|---|---|
| ポート番号 | サーバーは役割ごとに決まった番号で待つ。PHP も TLS を使うと決めたときだけ既定を 443 にし、ほかは 80 にする | [19章 場面1][19-1] |
| 平文の通信 | TLS をかけない通信は、経路の誰もが読み、書き換えられる。勧告の言う「通信を見られる者」が読む | [20章 場面1][20-1] |
| HTTP/1.1 の要求 | 要求行・ヘッダ・空行・本文の文字の列。PHP の要求もこの形で、認証のヘッダと本文が読める字のまま流れた | [21章 場面1][21-1] |
| URL のスキーム | URL の最初の部品で、開く手順を決める。saba は部分文字列 `http://` を含むかで確かめ、大文字の `HTTP://` は通さない | [31章 場面3][31-3] |
| PHP 本体（サーバーの言語処理系） | C で書かれた処理系。`file_get_contents()` や `fopen()` が、URL の解析から相手との送受信までを受け持つ | 教材に無い。近いのは [31章 場面5][31-5] の、要求を組み立てて TCP に書く所 |

### 出典と確かさ

- PHP の勧告 [GHSA-f6gg-rchx-xw8j](https://github.com/php/php-src/security/advisories/GHSA-f6gg-rchx-xw8j)（2026-11-19、bukka）。仕組み・当たる版・深刻度・謝辞・回避策はここから取った。curl での取得は 403 で、別の取得の道具で本文を読んだ。
- PHP の[変更の記録](https://www.php.net/ChangeLog-8.php)と、php.net のリリースの一覧（JSON）。版と日付（どれも 2026-11-19）はここから取った。
- 紹介記事: 窓の杜の[やじうまの杜](https://forest.watch.impress.co.jp/docs/serial/yajiuma/2158241.html)（2026-11-20）。事実の出典にはしていない。
- 確かめたこと: php.net の php-8.5.12.tar.xz と php-8.5.13.tar.xz（SHA-256 は php.net の値と一致）を tar（GNU tar 1.35）で展開し、`ext/standard/http_fopen_wrapper.c`・`ftp_fopen_wrapper.c` を diff（GNU diffutils 3.10）で比べ、足された 2 つの試験を読んだ。ソースはビルドしていない。手元の PHP 8.3.6（CLI）を、Python 3.11.18 で書いた受け手（127.0.0.1 の 80 番と 443 番）に向けると、`https://`・`HTTPs://` は 443 番に 0x16 で始まる 517 バイト、`httpS://`・`HTTPS://` は 80 番に平文の要求が届いた。
- 出典どうしの食い違い: 勧告の直った版は 8.2.36・8.3.37・8.4.28・8.5.13 で、8.6.0 は無い。変更の記録は 8.6.0 にも同じ項目を載せる。
- 確かめていないこと: 転送（307・308）と FTP は試しておらず、勧告と 8.5.12 のソースを読んだだけ。8.2〜8.4 の修正版と 8.6.0 のソースは読んでいない。当たり始めた版（5.2.0・4.3.0）は勧告の値で、確かめていない。

[19-1]: https://sukitooru.shiraoka.workers.dev/chapters/19-tcp.html#s1
[20-1]: https://sukitooru.shiraoka.workers.dev/chapters/20-tls.html#s1
[21-1]: https://sukitooru.shiraoka.workers.dev/chapters/21-http.html#s1
[21-2]: https://sukitooru.shiraoka.workers.dev/chapters/21-http.html#s2
[31-3]: https://sukitooru.shiraoka.workers.dev/chapters/31-saba-http.html#s3
[31-5]: https://sukitooru.shiraoka.workers.dev/chapters/31-saba-http.html#s5
