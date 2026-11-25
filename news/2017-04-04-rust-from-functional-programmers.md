# 関数型プログラマからみた Rust（2017-04-04）
<!-- tags: Rust、関数型、ガベージコレクション、所有権 -->
<!-- prereqs: 解放後の使用、型推論 -->
<!-- missing: スタックとヒープ、ガベージコレクション、参照透過性と副作用、マクロ、線形型 -->

- 出典: [関数型プログラマからみたRust](https://keens.github.io/blog/2017/04/04/kansuugatapuroguramakaramitarust/)（κeen、2017-04-04。当時の安定版は Rust 1.16）。記事の外の問いは、論文と各言語の公式の文書に拠った
- 調べた時点: 2026-11-14（安定版は Rust 1.100）。エラーの文、型の大きさ、確保の量は rustc 1.95.0 で、GC の回数は GHC 9.6.7 で確かめた。

## 要点

言語とコンパイラの層（第28・29章）と、メモリの管理（第26章 場面6）の話である。SML や Common Lisp を使ってきた筆者が Rust を使った感想で、型・パターンマッチ・高階関数は関数型言語の道具がそのまま使え、つまずいたのは所有権だったと書く。関数型言語は GC を前提に、値を自由に共有する。Rust は GC を持たず、値を写すのか指すのかをコンパイル時に決めさせる。言語の指向性は機械の層では分かれない。分かれるのは、書き手に何を書かせて確かめるか（作る側）と、実行時に何が要るか（動かす側）で、言語が使える層を決めるのは後者である。

## どの層の話か <!-- tab: 層 -->

記事は機能の追加ではなく、関数型言語の経験者が Rust を使った感想である。挙げている違いを、働くのがビルド時（作る側）か実行時（動かす側）かで分けた。筆者がつまずいた所が太字。記事の末尾に、海外で流行った記事の野良和訳の文体で書いた（原文は無い）とあり、強い言い切りは文体である。

| 層 | この記事で起きること | 章・場面 |
|---|---|---|
| 構文（作る側） | `let`、既定で不変、シャドーイング、式指向は ML と同じ。関数定義の見た目は手続き型。総称の `<>` は比較の `<` と同じ記号で、筆者は紛らわしいと書く | [28章 場面1][28-1] の段階2・3 |
| 型（作る側） | トレイト、タプル、代数的データ型と match、高階関数、型推論は関数型言語から来た。関数の引数と戻り値の型は書かせる | [29章 場面2][29-2] の段階1・3、[28章 場面2][28-2] の段階4・5、[33章 場面1][33-1] の段階3・6 |
| **所有と借用（作る側）** | 値の持ち主を 1 つに決め、写すのか指すのかを書かせる。筆者は数日「ボローチェッカとの戦い」を続けた。検査はビルド時に終わり、機械語には残らない | [28章 場面2][28-2] の段階6、[30章 場面1][30-1] の段階4、[34章 場面5][34-5] の段階6 |
| マクロ（作る側） | `macro_rules!` は Scheme の syntax-rules に当たる。筆者は、Common Lisp のような伝統的なマクロは不安定な機能にしか無いと書く | 教材に無い。近いのは [28章 場面1][28-1] の段階4 |
| コンパイルの単位（作る側） | 分けてコンパイルするとインライン展開が届かず、全体をまとめると時間がかかる。Rust はモジュールの上にクレートという単位を置いた | [28章 場面6][28-6] の段階1、[28章 場面4][28-4] の段階2 |
| **メモリの管理（動かす側）** | 関数型言語は GC が前提で、筆者は「メモリは無尽蔵にあると思ってプログラミングする」と書く。Rust は GC を持たず、解放の時点は持ち主で決まる | [26章 場面6][26-6] の段階3・5。GC の仕組みは教材に無い |
| データ構造（題材） | 再帰的なデータ型は `Box` が要る。ハッシュ表は入れるたびに中身を書き換えるので `mut` が要る | [27章 場面1][27-1] の段階3、[27章 場面3][27-3] の段階4、[26章 場面2][26-2] の段階1 |

## 何を解決するか <!-- tab: 解決 -->

### 関数型が解決すること

- 困りごとは、共有された値が書き換わることである。離れた所の代入で値が変わるので、式の意味がその場で決まらない。Backus（1978）は、従来の言語は変数が機械の記憶のセルをまねた形で、プログラムについて推論するための数学的な性質を欠くと書いた。
- 関数型の答えは、代入と副作用をやめることである。式はいつ評価しても同じ値になり、変数をその値で置き換えて読める（参照透過性）。
- Hughes（1989）は、これは無いものの説明でしかないと書き、利点を部品化に置く。高階関数と遅延評価が、小さな部品をつなぐ糊（glue）になる。
- ML や Haskell には、代数的データ型とパターンマッチ、型推論、型クラスもある。The Rust Reference は、これらを SML・OCaml・Haskell から採ったと書く。

### 費用と、Rust の別の答え

| 関数型の道具 | 実行時に要るもの | Rust での形 |
|---|---|---|
| 書き換えない値を自由に共有する | 値の寿命が書いた場所から決まらないので GC | 持ち主は 1 つ。共有は借用（`&`）か `Rc` と書く |
| 高階関数と閉包 | 捕まえた変数をヒープに置く。GC | 閉包は値で、捕まえた分の大きさを持つ。箱に入れるなら `Box<dyn Fn>` と書く |
| 代数的データ型とパターンマッチ | 場合を示すタグ | enum と match にそのまま採った |
| 型推論 | 無い（ビルド時だけ） | 関数の中だけ推す |

Rust の規則は「ある時点で持てるのは、書き換えられる参照 1 つか、読むだけの参照いくつかの、どちらか一方」である（The Rust Programming Language 4.2）。関数型は書き換えをやめ、Rust は共有と書き換えが重なることをやめる。防ぐ困りごとは同じで、Rust は GC を足さない。この対比は、調べた者の整理である。

#### 解決しないこと

- 書く手間。筆者は「プログラム全てで所有権を意識するのが思いの外難しかった」と書く。Go の FAQ は、寿命を管理する仕組みは設計に負担を足すとして GC を選んだ。
- ジェネリクスの `<>`、REPL が無いこと、関数の型を書くことは、記事の時点のままである。

## GC と所有権 <!-- tab: 仕組み -->

### GC のある関数型言語（Haskell）

```
data List = Nil | Cons Int List

t = Cons 2 Nil
a = Cons 1 t
b = Cons 0 t    -- t を a と b が共有する
```

- 定義はそのまま通る。値はヒープの物を指す番地なので、型の大きさを決めなくてよい。
- `t` を 2 か所から指しても、書き換えが無いので、写したのか指したのかを区別しなくてよい。いつ解放するかは、実行中に GC が決める。
- 手元の GHC 9.6.7 で 100 万個のリストを作って足すと、ヒープに 40,051,584 バイトを確保し、GC が 10 回走った。要素 1 個が約 40 バイトである。

### GC の無い Rust

```
enum List { Nil, Cons(i64, List) }
// error[E0072]: recursive type `List` has infinite size

enum List { Nil, Cons(i64, Box<List>) }

let t = Cons(2, Box::new(Nil));
let a = Cons(1, Box::new(t));
let b = Cons(0, Box::new(t));
// error[E0382]: use of moved value: `t`
```

- 値は中身そのものなので、型の大きさがコンパイル時に要る。`Box` は 8 バイトの番地で、`List` は 16 バイトに決まる。記事の「再帰的データ型を定義するとすぐにエラー」はこれである。
- 持ち主は 1 つで、`t` は `a` に移した後は使えない。写す（`clone`）、指す（`&`）、数えて共有する（`Rc`）のどれかを書く。記事の「コピーしたいのか参照したいのか」の区別である。
- 解放は持ち主が消える時点で、GC は無い。100 万個では 16 バイトを 1,000,000 回確保し、リストを手放した時点で全部が解放された。

## 言語の指向性はなぜ分かれるか <!-- tab: 分かれ目 -->

### 分かれる場所

- 機械は 1 種類で、どの言語のプログラムも、レジスタとメモリを書き換える命令の列になる（[6章 場面2][6-2]、[28章 場面5][28-5]）。Backus は、変数が記憶のセルを、代入がその読み書きを、制御文が飛び越しの命令をまねた言語を、フォン・ノイマン型の言語と呼んだ。手続き型は機械の形に近い書き方である。
- 分かれるのは機械より上の 2 か所である。1 つは言語とコンパイラ（作る側）で、書き手に何を書かせ、何を確かめるか。関数型の道具の多くはここにあり、直和型は TypeScript にもある（[29章 場面2][29-2] の段階6）。
- もう 1 つはランタイム（動かす側）で、書き手から隠したものを、実行中に誰が面倒を見るか。代表はメモリの解放で、GC、手で解放、所有権の 3 つがある（The Rust Programming Language 4.1）。
- 言語が使える層を決めるのは後者である。OS やランタイムそのものは下に GC を置く層が無く、GC の要らない言語で書くのがふつうである。教材の saba は OS 無しの環境向けに作る（[31章 場面1][31-1] の段階2）。

### 言語は課題から作られた

| 言語 | 作られた目的 | 選んだもの |
|---|---|---|
| C（1972 年ごろ） | Unix を書くためのシステム記述言語 | 機械に近い抽象。解放は手で書く |
| ML（1970 年代） | 定理証明器 LCF で、証明の手順を書くメタ言語 | 厳密な型と、値としての関数。GC |
| JavaScript（1995 年） | ブラウザのページに埋め込む言語。見た目は Java に似せる | Scheme 風の第一級関数と、Self 風のプロトタイプ。GC |
| Go（2009 年公開） | ネットワークのサーバー。速いコンパイル・速い実行・書きやすさを 1 つの言語で | GC。寿命の管理を書き手にさせない |
| Rust（1.0 は 2015 年） | 信頼できて効率のよいシステムを作りやすくする | 所有権。GC もランタイムも要らない |

出どころは順に、Ritchie、Gordon、Eich、Go の FAQ、Rust 1.0 の発表である。

### 問いへの答え

- なぜ分かれるか: 解く課題が違い、同時には取れないものがあるからである。GC は書く手間を減らし、解放の時点を手放す。所有権はその逆を選ぶ。
- どの層から分かれるか: 機械より上の、言語とコンパイラの層からである。指向性は層ではなく、型（[26章 場面5][26-5]）やデータ構造（[27章 場面6][27-6]）と同じく、層を横切る道具である。
- 言語ごとに得意な層があるか: ある。決め手は指向性より、実行時に要るものと、その層が受け付ける形式である。ブラウザは JavaScript を受け付ける（[10章 場面5][10-5]）。
- 課題への取り組み方が設計思想か: 出自についてはそう読める。Van Roy（2009）は、どのパラダイムも、ある種の問題にいちばん向く概念の組を支えると書き、言語は複数のパラダイムを支えるべきだとする。記事が Rust を「むしろ手続き型」と呼びつつ、関数型の道具が使えると書くのは、その例である。

## 前提知識 <!-- tab: 前提 -->

下の層から、依存の順に並べた。関数型言語の文法の知識は要らない。中心は、メモリをいつ誰が解放するか（2・8 行目）と、直和と網羅性の検査（5 行目）である。

| 概念 | この記事での役割 | 章・場面 |
|---|---|---|
| 型の大きさと並び | 再帰的なデータ型がそのままでは定義できない理由。値を中身で持つ言語は、型の大きさがコンパイル時に要る | [26章 場面2][26-2] の段階1・3 |
| ポインタと、解放後の使用 | 所有と借用が防ぐ失敗。GC が防ぐ失敗でもある | [26章 場面6][26-6] の段階1・3・5 |
| スタックとヒープ | `Box` はヒープに置いて番地で持つ。関数型言語の値は、ほとんどがヒープの物である | 教材に無い。近いのは [30章 場面5][30-5] の段階2 |
| 連結リストとハッシュ表 | 筆者がつまずいた題材。リストは番地でつなぎ、ハッシュ表は入れるたびに中身を書き換える | [27章 場面1][27-1] の段階3、[27章 場面3][27-3] の段階1・4 |
| 直積・直和と、網羅性の検査 | 代数的データ型と match の中身。関数型言語から来た道具の中心 | [29章 場面2][29-2] の段階1・3・4、[28章 場面2][28-2] の段階5、[29章 場面4][29-4] の段階2 |
| 型検査と型推論 | ML は関数の型まで推す。Rust は関数の中だけ推し、引数と戻り値は書かせる | [28章 場面2][28-2] の段階2・4 |
| 所有と借用 | 記事の中心。動かした後の使用（E0382）、Copy と Clone、参照の規則 | [28章 場面2][28-2] の段階6、[28章 場面4][28-4] の段階4、[34章 場面5][34-5] の段階6 |
| ガベージコレクション | 関数型言語の前提。届かなくなった物を実行中に探して解放する | 教材に無い。近いのは [26章 場面6][26-6] の段階5 |
| トレイトと導出、閉包 | 筆者がうらやむ機能と、関数を値として渡す道具。トレイトは Haskell の型クラスに当たる | [33章 場面1][33-1] の段階3・6、[32章 場面1][32-1] の段階4、[30章 場面5][30-5] の段階2 |
| 単相化、インライン展開、コンパイルの単位 | ツールの節の土台。コンパイルはクレートずつ進む | [28章 場面3][28-3] の段階6、[28章 場面4][28-4] の段階2、[28章 場面6][28-6] の段階1 |
| 参照透過性と副作用 | 関数型が解決することの中身 | 教材に無い |
| マクロ | 構文木を、コンパイルの途中で組み替える仕組み | 教材に無い。近いのは [28章 場面1][28-1] の段階4 |
| 一意型・線形型・リージョン | 筆者が手がかりにした型。The Rust Reference が挙げる出どころは、C++ の RAII とムーブ、ML Kit と Cyclone のリージョン | 教材に無い。近いのは [29章 場面4][29-4] の段階4 |

## 予想との差と出典 <!-- tab: 出典 -->

### 読む前の予想と差

読む前の予想は、層が「OS レイヤーからアプリケーションレイヤーまで」で、解決する問題は「関数型は何を解決するのか」という問いだった。もう 1 つ、言語の指向性がなぜ、どの層から分かれるのかという問いがあった。

- 層: 記事が話しているのは、言語とコンパイラの層と、メモリの管理だった。「OS からアプリケーションまで」は、Rust が使われる範囲としては合っている。そうなる理由が、記事の中心の「GC が無い」である。使われる層と、話題の層は分けて読む。
- 前提: 予想には無かった。要るのは、メモリをいつ誰が解放するか（[26章 場面6][26-6] の段階5）と、直和と網羅性の検査（[29章 場面2][29-2]）である。
- 解決する問題: 共有された値の書き換えだった。関数型は書き換えをやめ、Rust は共有と書き換えが重なることをやめる。
- 指向性の問い: 「分かれ目」の場面に答えを書いた。

### 記事の後に変わったこと

| 記事（2017-04） | その後 |
|---|---|
| 借用の検査と数日やり合った | 検査は 2 代目の NLL に替わった。借用の寿命を、字句の範囲ではなく制御の流れで決める。2018 edition（1.31）で入り、1.63（2022-08）で全部のコードに効く |
| 伝統的なマクロは不安定な機能にしか無い | 手続きマクロは、derive 用が 1.15（2017-02）、属性と関数の形が 1.30（2018-10）で安定した |
| `<>`、REPL が無い、関数の型を書く | 変わっていない。REPL は、手元の toolchain 1.95.0 の構成要素に無い |

#### 追って確かめること

- ガベージコレクションは「教材に無い」前提の 1 回目。[26章 場面6][26-6] の段階5 に、GC と所有権を並べる図を足すか。
- 記事が触れない関数型の書き方（末尾呼び出し、閉包を返す関数、永続データ構造）が Rust でどうなるか。

### 出典

- 記事: [関数型プログラマからみたRust](https://keens.github.io/blog/2017/04/04/kansuugatapuroguramakaramitarust/)（κeen、2017-04-04）。記事が挙げる [Rust for functional programmers](https://dr-knz.net/rust-for-functional-programmers.html)（Raphael Poss、2014 年 7 月）
- Rust: The Rust Programming Language の [4.1](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html)（メモリの管理の 3 つのやり方）、[4.2](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html)（参照の規則）、[15.1](https://doc.rust-lang.org/book/ch15-01-box.html)（再帰的な型と Box）。The Rust Reference の [Influences](https://doc.rust-lang.org/reference/influences.html)。[Announcing Rust 1.0](https://blog.rust-lang.org/2015/05/15/Rust-1.0/)（2015-05-15）。[RELEASES.md](https://github.com/rust-lang/rust/blob/master/RELEASES.md)（1.15、1.30、1.31、1.63、1.100）。[NLL の告知](https://blog.rust-lang.org/2022/08/05/nll-by-default/)（2022-08-05）と [RFC 2094](https://rust-lang.github.io/rfcs/2094-nll.html)
- 関数型とパラダイム: Backus [Can Programming Be Liberated from the von Neumann Style?](https://dl.acm.org/doi/10.1145/359576.359579)（1978）、Hughes [Why Functional Programming Matters](https://www.cs.kent.ac.uk/people/staff/dat/miranda/whyfp90.pdf)（1989）、Van Roy [Programming Paradigms for Dummies](https://webperso.info.ucl.ac.be/~pvr/VanRoyChapter.pdf)（2009）
- 言語の成り立ち: Ritchie [The Development of the C Language](https://www.nokia.com/bell-labs/about/dennis-m-ritchie/chist.html)、Gordon [From LCF to HOL: a short history](https://www.cl.cam.ac.uk/archive/mjcg/papers/HolHistory.pdf)、Eich [Popularity](https://brendaneich.com/2008/04/popularity/)（2008-04-03）、[Go の FAQ](https://go.dev/doc/faq)

[6-2]: https://sukitooru.shiraoka.workers.dev/chapters/06-cpu.html#s2
[10-5]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s5
[26-2]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s2
[26-5]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s5
[26-6]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s6
[27-1]: https://sukitooru.shiraoka.workers.dev/chapters/27-algorithm.html#s1
[27-3]: https://sukitooru.shiraoka.workers.dev/chapters/27-algorithm.html#s3
[27-6]: https://sukitooru.shiraoka.workers.dev/chapters/27-algorithm.html#s6
[28-1]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s1
[28-2]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s2
[28-3]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s3
[28-4]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s4
[28-5]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s5
[28-6]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s6
[29-2]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s2
[29-4]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s4
[30-1]: https://sukitooru.shiraoka.workers.dev/chapters/30-gbemu-desktop.html#s1
[30-5]: https://sukitooru.shiraoka.workers.dev/chapters/30-gbemu-desktop.html#s5
[31-1]: https://sukitooru.shiraoka.workers.dev/chapters/31-saba-http.html#s1
[32-1]: https://sukitooru.shiraoka.workers.dev/chapters/32-saba-tokenizer.html#s1
[33-1]: https://sukitooru.shiraoka.workers.dev/chapters/33-saba-dom.html#s1
[34-5]: https://sukitooru.shiraoka.workers.dev/chapters/34-saba-css.html#s5
