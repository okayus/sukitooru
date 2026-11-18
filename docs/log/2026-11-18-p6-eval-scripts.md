# 評価で作った台本（2026-11-18、P6）

[2026-11-18-p6.md](2026-11-18-p6.md) の「書き方の評価」の 2 回目（README の決まりを補った後）で、白紙の担当が作業ツリーの写しの中で書いた台本。Web を見ずに、ノートに書いてある事実だけで書いた。**ノートには入れていない**（内容の確認を通していない）。入れるときは、出典と照らす確認（P6 の内容の担当と同じ）を通し、build-news.mjs と verify.mjs --sizes all --nav --overlap --drill を通す。担当は、もとの場面の文も配り直した（A は「中身」の列から台本に移した文を消し、B は ### の 2 列を 1 つの場面にした）。下は足した・変えた場面だけで、ほかの場面の変更は含まない。

## A 日刊: Optimizely のノート（boxes、6 段階）

`news/2026-11-16-optimizely-snippet-malware-injection.md` の「層」と「中身」の間に足した場面。担当は「中身」の「起きたこと」から、スニペットの構成・読み込むコードの 3 種・track.js がしたことと iOS の攻撃を台本へ移し、原因の 1 つ目（Optimizely の発表）を段階2 に移して、列の見出しを「経過と影響」にした。

````
## 何が起きたか <!-- tab: 動き -->

攻撃者が書き換えたのは Optimizely の側の欄だけで、訪問者のブラウザまではふだんの配布の道が運んだ。届いたコードが攻撃者のスクリプトを読み込み、暗号資産の宛先を替え、カード番号と Cookie を送った。

```anim boxes
title: 書き足した欄から、盗んだ物が出ていくまで
caption: 矢印はファイルとデータの流れで、流れる粒がその段階で送る物。破線は攻撃者が書き換えた欄と、悪意のコードが動いたページ。盗んだ物の送り先は模式。
box atk: 攻撃者 @ 1,1
box proj: 顧客のプロジェクト | Project JavaScript の欄 @ 2,1
box cdn: `cdn.optimizely.com` | Optimizely の CDN @ 3,1
box evil: `1688360.cc` | 攻撃者の `track.js` @ 2,2
box br: 訪問者のブラウザ | 各社のページ @ 3,2
box site: 各社のサーバー @ 4,2
box sink: 盗んだ物の送り先 @ 3,3
line l_ap: atk -> proj
line l_pc: proj -> cdn
line l_cb: cdn -> br
line l_eb: evil -> br
line l_sb: site -> br
line l_bs: br -> sink
step: ページとスニペットは別々に届く
スニペットは Optimizely のコード・顧客の実験・顧客が画面で書く「Project JavaScript」の欄からなり、各社の全ページで動く。
send: site -> br: ページ
send: cdn -> br: スニペット
x: proj cdn br
step: 攻撃者が欄に書き足す
Optimizely の発表では、攻撃者は Experimentation の脆弱性を突いて、一部の顧客のプロジェクトに書き足した（脆弱性の中身は書いていない）。同じスニペットの Optimizely のコードと顧客の実験は、そのままだった。
show: atk l_ap
bad: proj
set: site = 各社のサーバー | 変わっていない
send: atk -> proj: 読み込むコード
x: atk proj
step: CDN は渡された版を配る
破線の欄を含む版が、ふだんの版と同じ矢印を通って届く。Report URI の見立てでは、CDN の置き場は汚されておらず、壊れているのは欄の箱だけである。
set: br = 訪問者のブラウザ | 足したコードも動く
send: proj -> cdn: 書き足した版
send: cdn -> br: 正しい証明書つき
x: cdn br
down: cdn -> 22-server.html#s4: CDN は、上流から受け取った物を、利用者の近くの置き場から返す
down: cdn -> 20-tls.html#s4: 証明書が保証するのは送り手の名前で、それを認証局の署名でたどって確かめる
step: ブラウザが track.js を取りに行く
読み込むコードは 3 種あった。script 要素を足すもの、URL を base64 で隠したもの、`1688360.cc` を止められたときに `eval` で動く、中身を丸ごと書いたもの。
show: evil l_eb
set: br = 訪問者のブラウザ | script 要素を足す
send: evil -> br: `track.js`
x: evil br
down: br -> 10-browser.html#s2: スニペットが足す script 要素も、パーサが HTML から作る要素と同じ DOM の木に入る
step: 宛先を替え、iOS を狙う
`track.js` は、ページの文字・入力欄・クリップボード・`fetch` の送信の中の暗号資産の宛先を、攻撃者のものに替えた。iOS 18.6 以前の端末には、既知の攻撃キット（Coruna・DarkSword）を読み込ませた。
bad: br
set: br = 訪問者のブラウザ | 宛先をすり替える
x: br
step: カード番号と Cookie を送る
カード番号は、サイト自身のフォームに打たれたものを送った。Cookie は、ページの JS から読める分を送った。
show: sink l_bs
send: br -> sink: カード番号・Cookie
x: br sink
down: br -> 21-http.html#s5: Cookie は Set-Cookie で渡る札で、HttpOnly を付ければ JS から読めない
```
````

## B 詳しいノート: Node.js のノートの「接続」（seq、5 段階）

`news/2026-10-21-nodejs-security-releases.md` の場面「使い回す接続と、先に届いていた応答（CVE-2026-105481）」を置き換えた場面。もとの ### の 2 列の事実を、リード・段階・図の札・補足に配り直し、章への参照 5 つを down: 4 つと本文のリンク 1 つに移した。

````
## 使い回す接続と、先に届いていた応答（CVE-2026-105481） <!-- tab: 接続 -->

空いた keep-alive の接続に要求より先に届いていたデータが、次の要求の応答として読まれた。6 月に付けた見張りが動く前に、同じ処理の中で次の要求が接続を取ったときである。

```anim seq
title: 空いた接続に先に届いた応答を、次の要求の応答として読む
caption: 列は Node の HTTP・イベントループ・カーネルの受信キュー・相手のサーバーで、下へ時間が進む。破線は、要求より先に届いていた応答。要求 1・要求 2 は例。
actor agent: Node の HTTP | `keepAlive` の `http.Agent`
actor loop: イベントループ | 受信を調べ、見張りを動かす
actor kq: 受信キュー | カーネルの中
actor srv: 相手のサーバー
msg q1: agent -> srv: 要求 1
msg r1: srv -> agent: 応答 1
note idle: agent: 空きの列に置く
msg early: srv -> kq: 要求を待たずに書いた応答
note take: agent: 要求 2 が接続を取る
msg peek: agent -> kq: `MSG_PEEK` で 1 バイト読む
note kill: agent: データがあれば接続を壊す
msg q2: agent -> srv: 要求 2（同じ接続）
note poll: loop: `epoll_wait()` で受信を調べる
msg read: kq -> agent: 要求 2 の応答として読む
step: 要求 1 の応答を読み、接続を空きの列へ
HTTP/1.1 の応答は要求の番号を持たず、応答 1 は同じ接続で要求 1 の次に来たから要求 1 の応答になる。HTTP/2 はストリームの番号で組にする（[21章 場面3][21-3] の段階3）。既定の `http.globalAgent` と `https.globalAgent` も `keepAlive` が有効である。
show: q1 r1 idle
down: r1 -> 21-http.html#s3.1: 要求 1 と応答 1 のように、HTTP/1.1 の接続は要求と応答を 1 組ずつ順に運ぶ
step: 空いた接続に、要求を待たない応答が届く
6 月の修正（CVE-2026-48931）の見張りは、空いた接続にデータが届いたら、その接続を壊す。見張りが動くのは、イベントループが受信を調べたとき（Linux では `epoll_wait()`）だけである。
show: early
bad: early
x: early loop
down: kq -> 09-os.html#s6.4: 受信キューにデータが入ると、カーネルは epoll_wait() で待っていたプロセスを起こす
step: 同じ処理の中で、要求 2 が接続を取る
データが受信キューに入ってから、ループが次に受信を調べるまでの間に、同じ処理の中で次の要求が出た。接続の上では、届いていた応答が要求 2 より前に並ぶ。
show: take q2
x: early take q2
down: loop -> 10-browser.html#s5.3: ループが次に受信を扱うのは、いまのタスクを最後まで実行してから
step: 先に届いていた応答を、要求 2 の応答として読む
データは見張りより先に読まれた。この PC の 24.19.0 で試すと、要求 2 への応答として、`X-Poisoned: true` の付いた偽の応答を受け取った。
show: poll read
bad: read
x: early poll read
step: 直し：渡す前に、受信キューを OS に聞く
`recv()` に `MSG_PEEK` と `MSG_DONTWAIT` を付けて読むので、データはキューに残り、無くても待たない。この PC の 24.22.1 では、接続を壊したあと、新しい接続で本物の応答を受け取った。
hide: poll read
show: peek kill
set: take = 要求 2 に渡す前に聞く
set: q2 = 要求 2（別の接続）
x: take peek kill q2
down: peek -> 09-os.html#s3.3: recv() は、カーネルの受信キューのデータをユーザーのバッファへ写すシステムコール
```

影響が大きいのは、多くの利用者の要求を同じ相手への接続で運ぶ使い方（中継のプロキシなど）と考えられる。相手が要求を待たずに応答を書けると、取り違えは利用者をまたぐ。これは推測で、告知は影響の範囲を書いていない。
````
