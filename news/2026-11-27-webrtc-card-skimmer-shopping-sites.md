# WebRTC でカード情報を送り出すスクリプトが通販サイトに仕込まれた事故（2026-11-27）
<!-- kind: daily -->
<!-- layer: browser -->
<!-- tags: CSP、サプライチェーン、JavaScript、セキュリティ -->
<!-- prereqs: DOM -->
<!-- tag-candidates: WebRTC、スキミング -->
<!-- missing: CSP（Content Security Policy）、WebRTC（データチャネルと TURN の中継） -->

- 出典: InfoHawk の記事 [Credit card skimming scripts using WebRTC found on popular shopping sites](https://www.infohawk.com/news/2026-11-27-black-friday-webrtc-skimmer)（2026-11-27）。調べた本人の報告。
- 話題: [Hacker News](https://news.ycombinator.com/item?id=50668145) の 13 位（240 点・コメント 133、2026-11-27 20:08 UTC の時点）。
- 調べた時点: 2026-11-28。日刊のノート（自動で選んで書いた）。人は確かめていない。実行して確かめたことは無い。

## 要点

ブラウザ（第10章 場面2）の上で、他社のタグや店の CDN のファイルを書き換えて決済のページに入れたコードが、カードの情報を WebRTC のデータチャネルで送り出した事故である。調べた InfoHawk によれば、ブラックフライデーの前の週に 5 つの通販サイトに仕込まれ、11-24〜25 に取り除かれた。CSP の `connect-src` で止められる要求は中継の情報を取る GET と接続の申し出を送る POST だけで、盗むコードと盗んだ情報はその外の道を通った。取られた人の数は分かっていない。

## どの層の話か <!-- tab: 層 -->

種類は事故（他社のタグや店のファイルの改ざんと、カード情報の盗み取り）で、働くのは実行時、買い物をする人のブラウザが決済のページを開いたときである。

| 層 | このニュースで起きること | 章と場面 |
|---|---|---|
| **他社のスクリプト** | 決済のページは、広告の計測のピクセルや Cookie の同意の帯のような他社のスクリプトを、店のスクリプトと同じ権限で動かしていた。それらはページを読み書きし、打った文字を見て、さらにコードを読み込める | [10章 場面2][10-2] |
| JS の実行 | Seers の同意の帯の設定では、プライバシーポリシーのリンクの欄に隠した画像が入り、その `onerror` のハンドラが悪意のコードを読み込んだ。中継から届いた盗むコードは `eval` で動いた | [10章 場面5][10-5] |
| HTTP | 決済のページのスクリプトは、`northbridgeads[.]com` の名の付いた窓口に、`GET /_cf/ice` で中継の情報を問い、`POST /_cf/rel` で WebRTC の申し出を送った | [21章 場面2][21-2] |
| WebRTC | ページが相手との間に開くデータチャネルは、Cloudflare の TURN の中継を通った。コードが入り、カードの情報が出ていった | 教材に無い。近いのは [19章 場面5][19-5]（通話の WebRTC が UDP を使う） |
| 送り先の制限（CSP） | `connect-src` が絞るのはふつうの要求で、データチャネルはその外にある。決済のページで使う先だけを書けば、前の 2 つの要求が止まる | 教材に無い。近いのは [10章 場面2][10-2] |

## 何が起きたか <!-- tab: 動き -->

スクリプトはふつうの要求で中継の宛先を受け取り、その後は Cloudflare の中継を通るデータチャネルで、盗むコードを受け取ってカードの情報を送り出した。

```anim seq
title: 決済のページから、中継を通って出ていくまで
caption: 列は決済のページ・S3・シグナリングの窓口・TURN の中継・攻撃者で、下へ時間が進む。攻撃者の居場所は記事に無く、列は模式。名前は InfoHawk の記事による。
actor page: 決済のページ | 小さい画面か触れる画面
actor s3: S3 のバケット | ブランド名-static
actor sig: シグナリング | northbridgeads[.]com
actor turn: TURN の中継 | turn.cloudflare.com
actor atk: 攻撃者 | 中継の先で見えない
msg m1: page -> s3: `Insds.js` か `gtage.js` を取る
msg m2: page -> sig: `GET /_cf/ice`
msg m3: sig -> page: 中継の情報（`turn.cloudflare.com`）
msg m4: page -> sig: `POST /_cf/rel`（WebRTC の申し出）
note n1: page: 答えの宛先は中継だけ
msg m5: atk -> turn: 盗むコード
msg m6: turn -> page: 塊に分けて届く
note n2: page: SHA-256 で確かめて `eval`
msg m7: page -> turn: カードの番号・期限・セキュリティコード
msg m8: turn -> atk: 盗んだ情報
step: 読み込み役がスクリプトを取る
読み込み役は、同意の帯の設定・店の CDN のファイル・計測のピクセル・店の HTML のどれかからページに入る。Samsonite の版は `/checkout` でだけ動き、InfoHawk が見たサーバーも決済のページでだけ盗むコードを有効にした。
show: m1
down: m1 -> 10-browser.html#s2: スクリプトが読み書きするページの中身は、HTML から組み立てた木の DOM
step: シグナリングで申し出を交わす
2 つともふつうの Web の要求で、CSP の `connect-src` に無い送り先なら止められる。返ってきた答え（answer）には Cloudflare の中継の宛先しか無く、本当の相手は隠れた。
show: m2 m3 m4 n1
down: m4 -> 21-http.html#s2: GET と POST は、要求の最初の語で何をしたいかを示すメソッド
step: 盗むコードが中継を通って届く
ここからの道は WebRTC のデータチャネルで、`connect-src` の外にある。InfoHawk は、守りの規則や見張りの道具がこの道をあまり見ないので使われたとみる。
show: m5 m6 n2
down: n2 -> 10-browser.html#s5: eval に渡した文字列を解析して動かすのは、JS エンジン
step: カードの情報が同じ道で出ていく
Lascana の決済では、InfoHawk の試しのカードの情報がこの道で送られた。InfoHawk は、氏名・住所・電話・メールも合わせ、店が支払いを確かめる前に送る作りだとみる。そうなら、注文が断られても取られ、買い物をする人には何も変に見えない。
show: m7 m8
```

## 中身 <!-- tab: 中身 -->

### 起きたこと

- Lascana は、Quorum（広告の効果を店の訪問と売上に結びつける会社）の計測のピクセルが書き換えられていた。11-24 15:48 UTC に Lascana がピクセルを外し、21:09 UTC に Quorum が元のピクセルに戻した。
- Samsonite と American Tourister は、Seers（Cookie の同意の帯の会社）の設定が書き換えられていた。どちらも返事は無かったが、11-24 14:25 UTC にコードが消えた。
- Revolve と FWRD は、Revolve 自身の CDN の上のファイルが書き換えられていた。Revolve は 11-25 に直したと答え、スマートフォンとタブレット向けの版の問題だったとした。
- 動くところを見たのは Lascana だけである。5 つのサイトでどれだけの人の情報が取られたかは、InfoHawk にも分からない。

### 原因

- 5 つのサイトの 3 つの経路は、どれも同じ攻撃者の基盤に頼っているように見えた。InfoHawk は、ほかのサイトにも入っている見込みが高いとみる。
- InfoHawk は弱みとして、支払い・ログイン・個人情報のページがほかのページと同じ広告のスクリプトを読み込むことが多く、ピクセルのファイルはその持ち主がサイトに気づかれずに変えられることを挙げる。
- ピクセル・同意の帯の設定・CDN のファイルを、攻撃者がどう書き換えたかは記事に無い。

### 対策

- 支払いを受けるページすべてで、CSP の `connect-src` に使う先だけを書く。WebRTC を開く前の 2 つの要求が止まり、どのファイルが書き換えられても盗むコードは届かない。
- カードの欄は分けた支払いの枠に置き、決済・ログイン・個人情報のページから他社のタグを外す。
- InfoHawk は見分ける印として、S3 のバケットの名前（`<brand>-static`）とファイル名、Seers の設定の URL の欄に URL 以外が無いか、コードの中の文字列 `KghRtc`・`rtc-signal-v1`・`quickfetch` を挙げる。InfoHawk は 11-24 に、AWS・Cloudflare・ドメインの登録事業者・ピクセルと同意の帯の会社・店に知らせた。

## 前提と出典 <!-- tab: 前提 -->

### 前提知識

| 概念 | このニュースでの役割 | 章と場面 |
|---|---|---|
| WebRTC（データチャネルと TURN の中継） | ページが相手との間に自前の通り道を開く仕組み。TURN は両端の間に立って中継する。盗むコードと盗んだ情報はここを通った | 教材に無い。近いのは [19章 場面5][19-5]（通話の WebRTC が UDP を使う） |
| GET と POST | GET は取り出すだけ、POST は本文を送って処理を頼む。中継の情報を取る要求と、申し出を送る要求がこれだった | [21章 場面2][21-2] |
| DOM | ページの文書の木。他社のスクリプトも、店のスクリプトと同じくこの木を読み書きできる | [10章 場面2][10-2] |
| イベントとハンドラ | 画像の読み込みに失敗すると error のイベントが起き、`onerror` に書いたコードが呼ばれる | [10章 場面5][10-5] |
| CSP（Content Security Policy） | ページが読み込める先と送れる先を決める。`connect-src` はふつうの要求の送り先を絞る | 教材に無い。近いのは [10章 場面2][10-2] |

### 出典と確かさ

- [InfoHawk の記事](https://www.infohawk.com/news/2026-11-27-black-friday-webrtc-skimmer)（2026-11-27。サイトのニュースの一覧の日付も同じ）。経路・時刻・7 つの段・印・勧める対策は、すべてここから取った。Revolve の答えと Quorum の確認も、この記事による。
- 似た弱点を突いた 11-16 の事故は、前のノート [Optimizely Web の配る JavaScript に悪意のコードが入った事故](https://sukitooru.shiraoka.workers.dev/news/2026-11-16-optimizely-snippet-malware-injection.html) が説明する。
- 確かめていないこと: スクリプトのファイルは取って調べていない。動きは記事の説明と図による。WebRTC を使った理由と、店が支払いを確かめる前に送る作りであることは、InfoHawk の見立て。Hacker News のコメントには、CSP の `webrtc` の指示で WebRTC そのものを止められるという書き込みがあるが、ブラウザの対応は確かめていない。
- 出典どうしの食い違い: 記事は、名を挙げた全社に 11-24 に知らせたと書くが、記事が引く Revolve の答えは、InfoHawk から知らせを受けたのを 11-25 とする。

[10-2]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s2
[10-5]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s5
[19-5]: https://sukitooru.shiraoka.workers.dev/chapters/19-tcp.html#s5
[21-2]: https://sukitooru.shiraoka.workers.dev/chapters/21-http.html#s2
