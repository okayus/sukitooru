# hex.pm に偽の構造体を送り、サーバーでコマンドを動かした侵入（2026-11-24）
<!-- kind: daily -->
<!-- tags: type -->
<!-- missing: Web アプリの枠組み（Rails・Sinatra） -->

- 出典: hex.pm の記事 [Security incident on hex.pm](https://hex.pm/blog/security-incident-on-hexpm)（Peter Ullrich・Jonatan Männchen・Eric Meadows-Jönsson、2026-11-24）と、EEF の CNA の [CVE-2026-129514](https://cna.erlef.org/cves/CVE-2026-129514.html) の記録（同じ日）。前者は当事者の記事、後者は勧告。
- 話題: [Lobsters](https://lobste.rs/s/rfcgkx) の 2 位（29 点、2026-11-25 の朝の時点）。
- 調べた時点: 2026-11-25。日刊のノート（自動で選んで書いた）。人は確かめていない。実行して確かめたことは無い。

## 要点

外から届いたバイトを、入口で確かめずに型の付いた値に戻した（第29章 場面5）ことから始まった侵入である。Elixir・Erlang・Gleam のパッケージの置き場 hex.pm は、要求の本文を Erlang の項に戻すとき、`__struct__` の欄を持つマップを拒まず、Elixir の構造体として中に入れていた。2026-11-23、攻撃者は偽の構造体を送り、プロトコルが値の中の名前で実装を選ぶ所を 2 度伝って、6 台の Web サーバーで OS のコマンドを動かした。hex.pm は 20 分以内に直した版に入れ替え、読まれたかもしれない資格情報を替え、利用者にパスワードの変更と 2FA の設定し直しを求めている。

## どの層の話か <!-- tab: 層 -->

種類は事故（侵入と、脆弱性の公表と修正）で、働くのは実行時である。hex.pm のサーバーが要求を受け、本文を読んで処理する間に起きた。

| 層 | このニュースで起きること | 章と場面 |
|---|---|---|
| HTTP の本文 | 要求の `Content-Type` が `application/vnd.hex+erlang` なら、hex.pm は本文を自前の読み手で Erlang の項に戻す。読み手は経路を選ぶ前、認証の前に動くので、どの経路への POST も、ログインせずにここまで届く | [21章 場面1][21-1] |
| **境界のパース** | 戻した項がマップなら、そのまま要求の引数になる。`__struct__` の欄を持つマップを拒まなかったので、外から来たバイトが Elixir の構造体として中に入った | [29章 場面5][29-5] |
| Web アプリの枠組み | Plug の部品は、ログインしていない要求の引数も扱う。MethodOverride は POST のたびに本文の `_method` を読み、誤りの報告は要求のデータを `inspect` で文字にする | 教材に無い（Web アプリの枠組み）。近いのは [21章 場面2][21-2] と [22章 場面5][22-5] |
| 動的な型 | 構造体は、`__struct__` の欄にモジュールの名前を持つマップで、値が自分の型を持ち歩く。プロトコルはこの欄だけを見て実装を選ぶので、送り手が次に走るコードを選べた | [26章 場面4][26-4] |
| プロセスの権限 | 最後に本文の {モジュール, 関数, 引数} の組が呼ばれ、BEAM のプロセスの利用者として OS のコマンドが動いた。その利用者は、アプリの環境にある DB の URL・保存先の資格情報・レジストリの署名鍵を読める | [9章 場面2][9-2] |

## 何が起きたか <!-- tab: 動き -->

偽の構造体は入口の読み手を通り、誤りの報告の中で 2 度、次に走る実装を選ばせた。最後に、本文に書いた関数の呼び出しが OS のコマンドを動かした。

```anim stack
title: 偽の構造体が、次に走るコードを選んでいく
caption: 1 つの要求の本文が通った所を、上から順に並べた（模式）。モジュールと関数の名前は CVE の記録による。右の道は値の受け渡し。
layer body: 要求の本文 | `application/vnd.hex+erlang`
layer parse: 本文の読み手 | `non_executable_binary_to_term`
layer mo: `Plug.MethodOverride` | 本文の `_method` を読む
layer rep: 誤りの報告 | Sentry・Bandit の誤りのログ・JSON のログ
layer insp: `Inspect` の実装 | `Ecto.Query.DynamicExpr`
layer enum: `Enumerable` の実装 | `DBConnection.Stream`
layer os: OS のコマンド | BEAM のプロセスの利用者で動く
step: 偽の構造体が入口を通る
読み手が呼ぶ関数は、`[:safe]` を付けて関数と新しいアトムを拒む。マップの中は調べないので、`__struct__` の欄にモジュールの名前を書いたマップが通り、要求の引数になった。
show: body parse
send: body -> parse: Erlang の項
bad: parse
down: body -> 21-http.html#s1: 本文の形式を名乗るのは、要求のヘッダ。HTTP の要求は要求行・ヘッダ・空行・本文からなる
down: parse -> 29-imi.html#s5: 読み手は外から来たバイトを確かめずに値にした。入口で一度だけ確かめて型に作り直すのが、境界でのパース
step: _method を読もうとして誤りになる
MethodOverride が構造体から `_method` を読むと、名指されたモジュールの `fetch/2` が呼ばれる。`Ecto.Query.DynamicExpr` には無いので UndefinedFunctionError になり、スタックの一番上の枠が偽の構造体を引数に持つ。
show: mo
send: parse -> mo: 偽の構造体
step: 誤りの報告が inspect を呼ぶ
誤りの報告は、要求のデータとスタックの引数を `inspect` で文字にする。`inspect` はプロトコルで、構造体なら `__struct__` が名指すモジュールの実装が走る。ここでは Ecto の問い合わせの部品の実装が選ばれた。
show: rep insp
send: mo -> rep: `UndefinedFunctionError`
down: insp -> 26-kata.html#s4: 実装を選ぶ手がかりは、値の中の型の名前。動的な型では、値が自分の型を持ち歩く
step: 列挙の実装を、もう一度選ばせる
この実装は `binding` の欄がリストかを確かめずに `Enum.map/2` に渡す。列挙もプロトコルなので、欄に置いた `DBConnection.Stream` の実装が走り、`DBConnection.reduce/3` から `declare/4` へ進む。
show: enum
send: insp -> enum: `binding` の欄
down: enum -> 41-inference.html#s5: 列挙もプロトコルで、型ごとに別の実装を持つ。1 つの名前で型ごとの実装を呼ぶ多相を、Haskell は型クラスで書く
step: log の指定を呼び、コマンドが動く
問い合わせの符号化は接続を取る前に失敗するが、誤りの道でも `:log` の指定を呼ぶ。指定は本文から取った {モジュール, 関数, 引数} の組で、`apply` が OTP の標準ライブラリの関数を介して OS のコマンドを動かした。
show: os
send: enum -> os: `apply(mod, fun, args)`
bad: os
down: os -> 09-os.html#s2: OS のコマンドは BEAM のプロセスの利用者で動く。プロセスはアドレス空間・PID・権限を持つ
step: 直し：入口で構造体を拒む
修正のコミット 379b0a2 は、読み手が戻した項のどこかに `__struct__` の欄を持つマップがあれば誤りにし、400 を返す。この形式を読むのはこの読み手だけなので、この形式を受け付ける全部の経路に効く。
hide: mo rep insp enum os
ok: parse
set: parse = 本文の読み手 | `__struct__` があれば 400 を返す
x: body parse
down: parse -> 21-http.html#s2: 400 は、要求の側の誤りを示す 4xx の状態コード
```

## 中身 <!-- tab: 中身 -->

### 起きたこと

- 2026-11-23 18:16〜18:29 UTC に、攻撃者は悪意の要求を 69 回送り、6 台の Web サーバーでコマンドを動かした。18:28 の再起動で直す前の版のサーバーが 3 台立ち上がったため、6 台になった。
- hex.pm は 18:27 に防火壁の規則を足し（効いたのは 18:30〜18:33）、18:30〜18:31 に全部のサーバーを直した版に入れ替えた。19:07 に、同じ脆弱性を知らせるメールが届いた。
- 調べた範囲では、パッケージの書き換え・DB の書き換え・居残りは見つかっていない。DB の読み出しは記録されないので、メールアドレス・パスワードと API キーのハッシュ・2FA の秘密・セッション・監査の記録が読まれた可能性は消せない。
- 要求への応答は、MethodOverride の誤りのふつうの 500 だった。構造体の `Inspect` の実装は、`Inspect.Algebra` の rescue の中で走るからである（CVE の記録）。
- 11-19 からの記録では、攻撃者の番地が hex.pm 自身の依存のパッケージを繰り返し取っていた。hex.pm は、手元に hex.pm の写しを作って試したとみている。

### 原因

- 読み手の安全の確かめは、2016-02-23 のコミットで外れていた。CVE の記録は、hex.pm の当たる範囲を 2016-02-23 から 2026-11-23 の前までとする。深刻度は CVSS 4.0 で 10.0、弱点の分類は CWE-502（信頼できないデータのデシリアライズ）。
- `[:safe]` が新しいアトムを拒んでも、妨げにならなかった。リリースでは、全部のモジュールと関数の名前が既にあるアトムだからである（CVE の記録）。
- 調べる中で、Ash のキーセットのページ送りにも同じ種類の欠陥が見つかった。利用者が渡すカーソルの中の構造体から、コマンドの実行か SQL の注入に届きうる。Ash は 11-24 の 3.38.0 で直した（CVE-2026-124283）。

### 対策

- 読まれたかもしれない資格情報を替えた。保存先・CDN・メール・DB の資格情報と、セッションとアクセストークンに署名する鍵で、全員が hex.pm と Hex のクライアントからログアウトした。11-24 10:42 UTC までに、レジストリの署名鍵と、影響の小さい少しの秘密を除いて替え終えた。
- レジストリの署名鍵は、まだ替えていない。鍵を替えられる署名の仕組みと、新しい Hex のクライアントを数日のうちに出す。それまでは第三者のミラーを使わず、repo.hex.pm からだけ取るよう求める。
- 利用者には、パスワードを変え、2FA を設定し直して新しい秘密と回復コードを得るよう求める。API キーは 128 ビットの乱数を HMAC-SHA256 で保存しているので、替えなくてよいとする。
- 防ぎを重ねる直しを、部品ごとに進めている。plug_crypto（読み手は認証した本文にだけ安全と文書に書き、構造体を拒む選択肢を足す）、plug（構造体を本文の引数として拒む）、ecto（`binding` がリストかを確かめる）、db_connection（ストリームの構造体から取った `:log` を呼ばない。CVE-2026-133555）。

## 前提と出典 <!-- tab: 前提 -->

### 前提知識

| 概念 | このニュースでの役割 | 章と場面 |
|---|---|---|
| プロセスと権限 | コマンドは BEAM のプロセスと同じ利用者で動き、その利用者が読める秘密を読めた。hex.pm が資格情報を替えたのはこのため | [9章 場面2][9-2] |
| 要求の本文 | 本文の形式は、要求のヘッダが名乗る。hex.pm は名乗りで読み手を選び、経路を選ぶ前に読んだ | [21章 場面1][21-1] |
| 値が持ち歩く型 | Elixir の構造体の型は、値の中の `__struct__` の欄にある。誰が作った値でも、欄が同じなら同じ型として扱われる | [26章 場面4][26-4] |
| 型ごとの実装を選ぶ多相 | Haskell の型クラスは、どの実装を使うかを型検査の時点で決める。Elixir のプロトコルは、実行中に `__struct__` の欄で選ぶ | [41章 場面5][41-5] |
| 境界でのパース | 外から来たバイトは入口で確かめて型を作り直し、中ではその型を信じる。hex.pm の入口は構造体を確かめなかった | [29章 場面5][29-5] |

### 出典と確かさ

- hex.pm の記事 [Security incident on hex.pm](https://hex.pm/blog/security-incident-on-hexpm)（2026-11-24。ブログの一覧の日付も同じ）。時刻・数・調べた方法と結果・対策・防ぎを重ねる直しは、ここから取った。記事は、調べが進めば更新すると書く。
- EEF の CNA の [CVE-2026-129514](https://cna.erlef.org/cves/CVE-2026-129514.html)（2026-11-24 に公表・更新）。モジュールと関数の名前、連鎖の段、当たる範囲、深刻度、500 で終わること、環境にある秘密は、ここから取った。
- [Lobsters](https://lobste.rs/s/rfcgkx) のコメントは、Erlang の項を読む部分は Plug ではなく hex.pm 自身のコードだと補う（CVE の記録のモジュールの名前と合う）。事実の出典にはしていない。
- 確かめていないこと: 修正のコミット 379b0a2 と GitHub の勧告 GHSA-9pmm-hf4r-27pg は、この実行の環境からは開けなかった（403）。修正の中身は、記事と CVE の記録の説明による。Ash と db_connection の CVE の記録は読んでいない。11-19 からの取得が攻撃の準備だったことは、hex.pm の推測である。手元に Erlang と Elixir が無く、何も動かしていない。
- 出典どうしの食い違いは見つからなかった。

[9-2]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s2
[21-1]: https://sukitooru.shiraoka.workers.dev/chapters/21-http.html#s1
[21-2]: https://sukitooru.shiraoka.workers.dev/chapters/21-http.html#s2
[22-5]: https://sukitooru.shiraoka.workers.dev/chapters/22-server.html#s5
[26-4]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s4
[29-5]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s5
[41-5]: https://sukitooru.shiraoka.workers.dev/chapters/41-inference.html#s5
