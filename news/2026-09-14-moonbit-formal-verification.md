# MoonBit の形式検証をアルゴリズムの実装に使った報告（2026-09-14）
<!-- missing: 契約、SMT ソルバ、WebAssembly、浮動小数点数と丸め、差分テスト、貪欲法と局所探索 -->

- 出典: [アルゴリズムの実装に MoonBit の Formal Verification を活用する](https://eng.mates.education/blog/b-moonbit-formal-verification/)（株式会社メイツ エンジニアリングチーム、ubugeeei、2026-09-14）と、公開サンプル [MatesEngineer/moon-formal-examples](https://github.com/MatesEngineer/moon-formal-examples)（コミット c52ffac、CC BY-NC-SA 4.0）
- 調べた時点: 2026-11-14（MoonBit の最新の版は v0.10.19）。手元では確かめていない。証明は走らせていない。

## 要点

言語処理系の作る側（第28章）に、型検査の先の検査として証明を足す話である。MoonBit は wasm と JavaScript に下ろせる静的型付けの言語で、0.9（2026-04）から、関数に書いた契約を SMT ソルバで証明する `moon prove` を持つ。記事は、図形を照合するアルゴリズムで「補完の後の配列に番兵の -1 が残らない」ことを、事前条件を満たすすべての入力について証明した。型では書けず、18,937 件のテストでは試した分しか言えない性質である。証明が届くのは整数の計算までで、浮動小数点と 32 ビットのあふれはテストが受け持つ。アルゴリズム（第27章）は題材で、新しいのは確かめる道具である。

## 何が変わるか <!-- tab: 層 -->

変更の種類はインターフェースの追加（契約の構文と `moon prove` の命令）で、働くのはビルド時だけである。契約を書いた関数にだけ効き、実行する側は何も変わらない。表は、記事の計算が作られて動くまでの順に並べた。新しい段と、記事が落とし穴として挙げる層が太字。

| 層 | この記事で起きること | 章・場面 |
|---|---|---|
| 型（作る側） | `FixedArray[Int]` が言うのは「整数の配列」まで。-1 を `Option` で締め出す形と、補完の関数だけが作れる抽象型も検討している。型が言えるのは「その関数を通った」までで、関数が全部を埋めたかは言えない | [29章 場面2][29-2] の段階3・5、[29章 場面3][29-3] の段階2・5 |
| **証明（作る側）** | 関数の `where` 節に事前条件・事後条件・ループ不変条件を書く。`moon prove` は、事前条件を満たすすべての入力で事後条件が成り立つことを、実行せずに確かめる。`moon build`・`moon test` と並ぶ別の命令である | [28章 場面2][28-2] の段階2、[29章 場面3][29-3] の段階6、[29章 場面6][29-6] の段階3 |
| 別の形へ下ろす（作る側） | 契約付きの関数は Why3 の言語に訳され、Why3 が証明義務を作って Z3・cvc5 に渡す。機械語へ下ろす道とは別の、2 本目の下ろし先である | [28章 場面3][28-3]。Why3 と SMT ソルバは教材に無い |
| 成果物 | 契約は検証にだけ使われ、wasm にも JavaScript にも残らない。wasm は約 37 KiB で、import が 1 つも無い | [26章 場面4][26-4] の段階6、[26章 場面5][26-5] の段階1。WebAssembly は教材に無い |
| **機械の整数（動かす側）** | 既定の証明は `Int` を数学の整数として扱い、あふれが無い。実行時の `Int` は 32 ビットで折り返す。`0 <= result` が証明された引き算が、動かすと -2 を返す | [4章 場面4][4-4] の段階3、[26章 場面1][26-1] の段階3、[28章 場面3][28-3] の段階2 |
| 浮動小数点（動かす側） | 距離の計算は `Double` で、契約付きの関数の本体には書けない。足す順が変わると丸めが変わり、同点の候補の順位が入れ替わる。移植の互換性の不具合は全部これで、差分テストが見つけた | [26章 場面1][26-1] の段階4、[26章 場面3][26-3] の段階2 |
| 配列の範囲（動かす側） | 残った -1 を添字に使うと範囲外になる。wasm の版は trap で止まり、元の JavaScript の版は undefined を読む | [27章 場面1][27-1] の段階1、[26章 場面6][26-6] の段階4 |
| アルゴリズム（題材） | 貪欲法と局所改善で対応を探し、残った -1 を補完で埋める。証明したのは添字の計算で、選んだ対応が距離を最小にするかは証明していない | [27章 場面6][27-6] の段階6。貪欲法と局所探索は教材に無い |

## 何を解決するか <!-- tab: 解決 -->

### 困っていたこと

- 対応付けは整数の配列で、-1 は「まだ決まっていない」を表す番兵である。補完（completion）の後、後段はこの配列の値を検査なしで添字に使う。
- -1 が 1 つ残ると範囲外アクセスになる。元の実装にも検査は無く、記事は「たまたま残らない」だけだったと書く。
- 補完の後に実行時の検査を足せば、-1 を後段へ渡すことは防げる。ただし分かるのは実行した入力のことだけで、補完がいつも全部を埋めるかは分からない。

#### ほかの検証の道具との違い

MoonBit の公式の記事は、既存の言語に後付けする検証（Frama-C、OpenJML、Creusot）は言語と道具が別になり、検証用の言語（Dafny、Rocq、Lean）は汎用の言語としての周辺が弱いと書く。MoonBit は契約を言語の構文に入れ、同じツールチェーンで証明まで行う。

### 型・テスト・証明の分担

| 手段 | 言えたこと | 言えなかったこと |
|---|---|---|
| 型検査 | データの形、パッケージの境界、移植での取り違え | 配列の中身が満たす条件 |
| テスト | 実際の機械での動き、浮動小数点の値、元の実装との一致（18,937 件で不一致 0） | 試していない入力では起きないこと |
| 証明 | 事前条件を満たすすべての入力で、番兵が残らないこと（本体は 6 パッケージ、証明義務 177 件） | `Double` の計算、機械の整数のあふれ、答えの正しさ |

#### 解決しないこと

- 契約が意図を書けているか。「-1 が無い」は `[-2]` も満たす。値が有効な添字であることは別の性質で、公開サンプルは扱っていない。
- 事前条件を呼び出し側が守るか。`proof_require` は実行時には検査されず、破っても誤りは出ない。
- 証明の整数と機械の整数の違い。-2 を返す引き算は、単体テストが 1 回目で見つけた。
- 書く量と設計。契約は本体より長いことがある。変更前の値を指す `old(...)` が無いので、入力を書き換えず、出力を新しく確保する形に変えた。

## 証明の仕組み <!-- tab: 仕組み -->

### 契約を書く

記事と公開サンプル（`src/gap/gap.mbt`）の関数。先頭が決まっている配列を受け取り、-1 を左隣の値で埋める。

```
pub fn fill_forward(xs : FixedArray[Int]) -> FixedArray[Int] where {
  proof_require: 0 < xs.length(),
  proof_require: assigned(xs, 0),
  proof_ensure: result => result.length() == xs.length(),
  proof_ensure: result => total(result),
} {
  let n = xs.length()
  let out = FixedArray::make(n, -1)
  out[0] = xs[0]
  for i = 1; i < n; i = i + 1 {
    out[i] = if xs[i] == -1 { out[i - 1] } else { xs[i] }
  } where {
    proof_invariant: 1 <= i,
    proof_invariant: i <= n,
    proof_invariant: out.length() == n,
    proof_invariant: prefix_total(out, i),
  }
  out
}
```

### 証明義務にして解く

形式検証は形式手法の 1 つで、プログラムが仕様を満たすことを、実行せずに証明する。この記事のやり方は演繹的検証と呼ばれ、次の順に進む。

1. 契約を書く。`proof_require` が事前条件、`proof_ensure` が事後条件、`proof_invariant` がループ不変条件である。`assigned(xs, i)` は `xs[i] != -1`、`total` は全部の添字で、`prefix_total(out, i)` は i より手前の添字で `assigned` という述語である。
2. `moon prove` が関数を Why3 の言語に訳す。Why3 は「事前条件を仮定すると、事後条件が成り立つ」という論理式を作る。これが証明義務である。
3. SMT ソルバ（Z3、cvc5）が、証明義務を破る値の組を探す。1 つも無いと分かれば証明は通る。時間内に決まらなければ timeout で、成り立たないという意味ではない。

#### ループ不変条件

ループは回る回数が入力で変わるので、毎回の入口で成り立つ条件を書いておく。ここでは `prefix_total(out, i)` である。

- 成立: `out[0] = xs[0]` と事前条件 `assigned(xs, 0)` から、`prefix_total(out, 1)`。
- 保存: 書く値は `xs[i]`（-1 でない）か `out[i - 1]`（不変条件が -1 でないと言う）なので、手前の範囲が 1 つ伸びる。
- 出口: `i == n` で `prefix_total(out, n)`。これは `total(out)` と同じである。

事前条件の `assigned(xs, 0)` を外すと、`[-1]` を渡したときに `[-1]` が返る。記事の実行では、20 件が通り 1 件が timeout になった。

## 前提知識 <!-- tab: 前提 -->

下の層から、依存の順に並べた。MoonBit の文法の知識はほとんど要らない。中心は、型検査とテストがそれぞれ何を言えるか（5 行目）と、契約と SMT ソルバ（7・8 行目）である。

| 概念 | この記事での役割 | 章・場面 |
|---|---|---|
| 2 の補数と、32 ビットのあふれ | 証明が通った式が、動かすと負になる理由。`2147483647 - (-2147483647)` は 32 ビットで折り返して -2 | [4章 場面4][4-4] の段階3、[4章 場面6][4-6] の段階5、[26章 場面1][26-1] の段階3 |
| 浮動小数点数と丸め | 証明の外に残る半分。加算は結合則が成り立たず、足す順で結果が変わる | [26章 場面1][26-1] の段階4、[26章 場面3][26-3] の段階2。結合則が成り立たないことは教材に無い |
| 配列の添字と範囲外アクセス | 守りたい失敗。言語によって、止まる・undefined を返す・隣を壊す、と振る舞いが違う | [27章 場面1][27-1] の段階1、[26章 場面6][26-6] の段階2・4 |
| 静的な検査は、通らない道も確かめる | 証明が「すべての入力」と言える理由。型検査と同じく実行しない | [28章 場面2][28-2] の段階2、[26章 場面4][26-4] の段階1 |
| 型で言えること・言えないこと | 記事の「型だけでは届かなかったこと」の土台。番兵と `Option`、作る関数を 1 つに限る型、篩型 | [29章 場面2][29-2] の段階3・5、[29章 場面3][29-3] の段階2・5・6、[29章 場面6][29-6] の段階1〜3 |
| コンパイラの段と中間表現 | ソースの行き先が 2 本ある。wasm・JavaScript へ下ろす道と、Why3 へ訳して証明する道 | [28章 場面3][28-3]、[28章 場面6][28-6] の段階6 |
| 契約（事前条件・事後条件・ループ不変条件） | 証明する性質の書き方そのもの。ホーア論理に由来する | 教材に無い |
| 述語論理と SMT ソルバ | 証明義務は ∀ や → を含む論理式で、ソルバがそれを破る値を探す | 教材に無い。近いのは [4章 場面3][4-3] の段階1・6（真理値表と AND・OR・NOT）。名前は [29章 場面3][29-3] の段階6 に出る |
| WebAssembly | 動かす先。範囲外で trap、import の有無、線形メモリと wasm-gc | 教材に無い。近いのは [10章 場面5][10-5] の段階1、[28章 場面6][28-6] の段階5 |
| テストの手法（差分テスト、オラクル） | 証明と組にする相手。元の実装の出力と比べる | 教材に無い。近いのは [29章 場面6][29-6] の段階3 |

## いつ使えるか <!-- tab: 段階 -->

### MoonBit と形式検証の段階

MoonBit は、IDEA（International Digital Economy Academy、深圳）が開発する言語とツールチェーンで、バックエンドは wasm・wasm-gc・js・native の 4 つである。処理系は 1 つで、標準化団体の仕様は無い。段階は処理系の版で読む。

| 日付（2026 年） | 出来事 | 出どころ |
|---|---|---|
| 04-07 | v0.9 で形式検証（`moon prove`）が入った | MoonBit の更新の記録 |
| 08-19 | v0.10.9 で、Why3 を別に入れなくてよくなった。ソルバが 1 つあれば動く | MoonBit の更新の記録 |
| 09-14 | 記事。実プロダクトの 6 パッケージに使った。公開サンプルは moonc v0.10.12 に固定している | 記事、サンプルの README |
| 11-05 | 最新の版は v0.10.19。1.0 は出ていない | MoonBit の更新の記録 |

公式文書は形式検証を実験的（experimental）と書き、構文とソルバとのつなぎ方は変わりうるとする。セットアップの節は、Why3 を別に入れると書いたままである。既定の整数は数学の整数で、機械の整数での検証は「予定」である。記事は、ツールチェーンに同梱の機械整数用の prelude を環境変数で切り替えて試した。番兵の証明は 4 件とも通り、ほかの 2 パッケージは timeout が出た。

### 誰が何をすれば効くか

- 使う側が、処理系を v0.10.9 以降にして、ソルバ（Z3・cvc5・Alt-Ergo のどれか）を入れる。
- 使う側が、パッケージの `moon.pkg` に `"proof-enabled": true` を書き、関数に契約を書く。契約の無い関数には何も起きない。
- 動かす側（ブラウザ、wasm のエンジン）は何も変えなくてよい。契約は成果物に残らない。
- 版を固定する。記事は、契約が訳された Why3 から黙って消える版があったと書き、コンパイラとソルバを Nix で固定している。
- 記事と MoonBit の公式の記事は、契約と不変条件を書く手間は AI で下がると書く。記事は、出てきた契約が意図どおりかを読む手間は減らないと続ける。

## 予想との差と出典 <!-- tab: 出典 -->

### 読む前の予想と差

読む前の予想は「アルゴリズムの話。MoonBit と形式手法は分からない」だった。

- 層: アルゴリズム（第27章）は確かめられる題材で、変わったのは確かめる道具だった。作る側の検査の段（第28章 場面2、第29章 場面3・6）に当たる。題材の層と、変わる層は分けて読む。
- 前提: MoonBit の知識はほとんど要らなかった。要るのは、型検査とテストがそれぞれ何を言えるかである。記事の「型だけでは届かなかったこと」は、[29章 場面3][29-3] の段階5 と同じ議論をしている。
- 解決する問題: 「試していない入力でも起きない」と言うことだった。予想には無かった。

### 追って確かめること

- 公開サンプルを走らせる。記事の値は、既定で 3 パッケージ・8 件が通る、事前条件を 1 つ外すと 20 件が通って 1 件が timeout、である。測ったのは aarch64-darwin で、件数はマシンの負荷でも変わる。
- 機械整数の prelude が、公式の設定の項目になるか。
- [29章 場面3][29-3] の段階6 と [29章 場面6][29-6] の段階3 に、`moon prove` を例として足すか。

### 出典

- 記事: [アルゴリズムの実装に MoonBit の Formal Verification を活用する](https://eng.mates.education/blog/b-moonbit-formal-verification/)（2026-09-14。公開後に、環境の節を書き直している）
- 公開サンプル: [MatesEngineer/moon-formal-examples](https://github.com/MatesEngineer/moon-formal-examples)（コミット c52ffac、CC BY-NC-SA 4.0）。`src/gap`（番兵の証明）、`src/pitfall`（証明が通るのに誤る例）、`src/saturating`（範囲を手で書いた算術）
- MoonBit: [Formal Verification](https://docs.moonbitlang.com/en/latest/language/verification.html)（公式文書）、[MoonBit 0.9: Introducing First-Class Formal Verification](https://www.moonbitlang.com/blog/moonbit-0-9-release)（2026-04-08）、[更新の記録](https://www.moonbitlang.com/updates/)（v0.9、v0.10.9、v0.10.19）、[文書の表紙](https://docs.moonbitlang.com/en/latest/)（バックエンド）
- 道具: [Why3](https://www.why3.org/)（演繹的検証の基盤。Inria の Toccata チーム）、[Z3](https://github.com/Z3Prover/z3)（Microsoft Research）、[cvc5](https://cvc5.github.io/)、[SMT-LIB の FloatingPoint の理論](https://smt-lib.org/theories-FloatingPoint.shtml)

[4-3]: https://sukitooru.shiraoka.workers.dev/chapters/04-ronri.html#s3
[4-4]: https://sukitooru.shiraoka.workers.dev/chapters/04-ronri.html#s4
[4-6]: https://sukitooru.shiraoka.workers.dev/chapters/04-ronri.html#s6
[10-5]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s5
[26-1]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s1
[26-3]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s3
[26-4]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s4
[26-5]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s5
[26-6]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s6
[27-1]: https://sukitooru.shiraoka.workers.dev/chapters/27-algorithm.html#s1
[27-6]: https://sukitooru.shiraoka.workers.dev/chapters/27-algorithm.html#s6
[28-2]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s2
[28-3]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s3
[28-6]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s6
[29-2]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s2
[29-3]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s3
[29-6]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s6
