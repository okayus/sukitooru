# AT Protocol について、プログラマが信じがちな誤りの一覧（2026-11-22）
<!-- kind: daily -->
<!-- tags: http -->
<!-- missing: DID（分散識別子）、内容アドレス（CID） -->

- 出典: [Falsehoods Programmers Believe About ATProto](https://reiver.link/atproto/falsehoods-programmers-believe/)（Charles Iliya Krempeaux。日付が無く、2026-11-22 は投稿の日）。ATProto を実装してきた本人の記事。仕様は [Handle](https://atproto.com/specs/handle) など。
- 話題: [Lobsters](https://lobste.rs/s/bjoete) の 3 位（11 点、2026-11-22 20:08 UTC の時点）。
- 調べた時点: 2026-11-23。日刊のノート（自動で選んで書いた）。人は確かめていない。ハンドルの 2 通りの引き方と誤りの応答を、curl で確かめた。

## 要点

AT Protocol（ATProto。Bluesky などが使う）について、プログラマが信じがちな 77 の誤りを正す解説で、土台にあるのは DNS（第17章 場面1）と HTTP（第21章 場面1）の層である。利用者の名前（ハンドル）はドメイン名で、`_atproto.` を前に付けた名前の TXT レコードか、`/.well-known/atproto-did` の URL で、変わらない識別子 DID を知らせる。ハンドルはいつでも変わるので、利用者は DID で指し、引いた結果は時々引き直す。記録は JSON でも書けるが、署名とハッシュには形を 1 つに決めた CBOR のバイト列を使うので、書き直すと同じバイトに戻らないことがある浮動小数点数は使えない。

## どの層の話か <!-- tab: 層 -->

種類は解説（仕組みの説明）で、働くのは実行時、アプリやサーバーがハンドルを引き、記録を読み書きするとき。

| 層 | このニュースで起きること | 章と場面 |
|---|---|---|
| **名前** | ハンドルは点で区切った 2 つ以上のラベルからなるドメイン名で、ラベルは 63 字、全体は 253 字まで。小文字にそろえて扱う。`_atproto.<ハンドル>` の TXT レコードに、`did=` に続けて DID を書く | [17章 場面1][17-1] |
| キャッシュ | 仕様は、引いた結果を一定の間覚え、時々引き直すよう勧める。DNS の TTL を覚える長さに使えるが、ハンドルには短すぎるだろうと書く | [17章 場面4][17-4] |
| 要求と応答 | もう 1 つの引き方は `https://<ハンドル>/.well-known/atproto-did` への GET で、本文が DID だけの `text/plain` が返る。API（XRPC）も、`/xrpc/` に名前を続けたパスへのふつうの HTTP で、本文の多くは JSON | [21章 場面1][21-1] |
| 状態コード | 無い API に、Bluesky の PDS は 404 でなく 401 を返した。大文字の DID には plc.directory が 400 を返す。誤りの応答が JSON でなく、負荷分散の機器などの HTML のこともある | [21章 場面2][21-2] |
| 数の型 | データの形に浮動小数点数は無い。整数は 64 ビットまで書けるが、JavaScript の数で正しく扱えるよう、53 ビットまでにすることを勧める | [26章 場面1][26-1] |
| 境界の検査 | DID の一般の構文の検査は大文字の `did:plc` を通すが、plc.directory は拒む。PDS は知らない種類の記録を確かめずに受け取るので、読む側が確かめ直す | [29章 場面5][29-5] |

## 中身 <!-- tab: 中身 -->

### 分かったこと

- ハンドルは変わり、変わらないのは DID である。著者のハンドルは reiver.bsky.social から 2 度変わった。利用者を表の鍵にするなら DID にし、ハンドルは表示にだけ使う。
- ハンドルを引けただけでは、その利用者のものとは言えない。DID 文書の `alsoKnownAs` に同じハンドルがあり、両向きが合うことを確かめる。合わなければ `handle.invalid` と出す。
- 利用者の PDS は、その人がフォローする相手を知っているが、フォロワーは知らない。フォローの記録はフォローした側のリポジトリにあるからで、フォロワーの数は、網を集めるサービスがそれぞれ数えた値になる。著者のアカウントについて、同じ時刻に 3 つのサービスが 292・196・134 と答えた。
- 記録の `createdAt` はクライアントが書いた時刻で、過去にも未来にもできる。

### 仕組み

- DID は `did:plc` か `did:web` である。`did:plc` の文書は plc.directory が配り、署名した操作でハンドル・PDS・署名の鍵を替えられる。アカウントは DID を保ったまま別の PDS へ移れる。
- リポジトリへの変更（コミット）には利用者の鍵で署名し、記録はハッシュ（CID。SHA-256）で名指す。だから、誰から受け取った写しでも確かめられる。
- JSON は欄の順や空白が決まらず、同じ値が別のバイト列になる。そこで署名とハッシュには、形を 1 つに決めた CBOR（DRISL）を使う。浮動小数点数は、機械の形に読み込んでから書き直すと、同じバイトに戻らないことがある。そこでデータの形から外した（データの形の仕様）。

### 教材との違い

- 教材のレコードのタイプに TXT は無い。TXT は任意の文字列を入れるタイプで、ATProto は `did=` で始まる値だけを読み、違う DID の値が 2 つあれば失敗とする。
- 名前全体の上限 255 バイト（教材の場面1）は、メッセージの中の形で数え、ラベルごとの長さの 1 バイトと終わりの 0 を含む。点で区切った文字で書くと 253 字になる。`_atproto.` を足すと 253 字を超える長いハンドルは、DNS では引けず、HTTPS で引く（仕様）。
- 名前の持ち主かどうかを、DNS か Web に値を置けるかで確かめる点は、認証局が証明書を出す前の確かめ方（[20章 場面4][20-4]）に似ている。

## 前提と出典 <!-- tab: 前提 -->

### 前提知識

| 概念 | このニュースでの役割 | 章と場面 |
|---|---|---|
| 64 ビットの浮動小数点数 | JavaScript の数。仮数が 52 ビットなので、整数を 1 刻みで正しく表せるのは 2⁵³ まで | [26章 場面1][26-1] |
| 署名 | 秘密鍵で作り、対の公開鍵で確かめる値。コミットに付き、署名の鍵（`#atproto`）の公開鍵は DID 文書に載る | [20章 場面4][20-4] |
| ドメイン名とリソースレコード | ハンドルはドメイン名で、TXT レコードで DID を知らせる | [17章 場面1][17-1] |
| DID（分散識別子） | ハンドルが変わっても変わらない利用者の識別子。文書に PDS と公開鍵が載る | 教材に無い。近いのは [17章 場面1][17-1] |
| 内容アドレス（CID） | データを中身のハッシュで名指す。写しを、送り手によらず確かめられる | 教材に無い。近いのは [27章 場面3][27-3] |

### 出典と確かさ

- [記事](https://reiver.link/atproto/falsehoods-programmers-believe/)（Charles Iliya Krempeaux）。ページにも著者のサイトの目次にも日付が無く、2026-11-22 は Lobsters に投稿された日。記事には同じ日の問い合わせの結果が載る。77 の項目は、どれも仕様か 2026 年 11 月の問い合わせで裏付けたと書く。誤りの項目、ハンドルの移り変わり、フォロワーの数は、ここから取った。
- AT Protocol の仕様の [Handle](https://atproto.com/specs/handle)・[DID](https://atproto.com/specs/did)・[Data Model](https://atproto.com/specs/data-model)・[HTTP API (XRPC)](https://atproto.com/specs/xrpc)。字数の上限、TXT と well-known の書き方、キャッシュと TTL、53 ビット、浮動小数点数を外した理由、CID の形、状態コードは、ここから取った。
- 確かめたこと（2026-11-22 20:15 UTC ごろ、curl 8.5.0）: Cloudflare の DNS over HTTPS で、`_atproto.bsky.app` の TXT は `did=did:plc:z72i7hdynmk6r22z27h6tvur`（TTL 300 秒）。`https://reiver.blacksky.team/.well-known/atproto-did` は 200 の `text/plain` で DID を返した。plc.directory は大文字の DID に 400 を、小文字の DID に `alsoKnownAs` が `at://bsky.app` の文書を返し、Bluesky の PDS は無い API に 401 `AuthMissing` を返した。Node.js 22.23.5 で `Number.MAX_SAFE_INTEGER` は 9007199254740991、`2**53 + 1 === 2**53` は true だった。
- 確かめていないこと: ハンドルの移り変わりとフォロワーの数（記事の問い合わせの結果）、Spaces の提案、リレーと AppView の動き。255 バイトと 253 字の差は、このノートでの計算である。
- 出典どうしの差: XRPC の仕様は、無い API を 404 で示せると書く。Bluesky の PDS は 401 を返した（記事と、このノートの問い合わせ）。

[17-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/17-dns.html#s1
[17-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/17-dns.html#s4
[20-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s4
[21-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s1
[21-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s2
[26-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/26-kata.html#s1
[27-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/27-algorithm.html#s3
[29-5]: https://okayus.github.io/youtube-ga-mieru-made/chapters/29-imi.html#s5
