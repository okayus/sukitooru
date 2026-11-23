# 作って学ぶ、JSX (TSX) ランタイムの基本（2026-06-06）
<!-- missing: トランスパイラ、モジュール、関数を値として渡す、名前空間と型の宣言、テンプレートエンジン -->

- 出典: [作って学ぶ、JSX (TSX) ランタイムの基本](https://speakerdeck.com/syumai/jsx-runtime-basics)（syumai、フロントエンド・PHPカンファレンス北海道2026、2026-06-06、56 枚）と、サンプル [syumai/minimum-jsx](https://github.com/syumai/minimum-jsx)（コミット 737a3e4、MIT）
- 調べた時点: 2026-11-15。変換は Bun 1.3.14、実行は Node.js 24.22.1、型検査は Deno 2.8.0 に同梱の TypeScript 6.0.3 で確かめた。サンプルそのものは走らせていない。

## 要点

ブラウザの層ではなく、ブラウザに届く前の変換（作る側、第28章 場面1）と、JavaScript エンジンの上で動くライブラリの話である。JSX は JavaScript の中に XML 風の式を書く記法で、ECMAScript の文法ではないので、ブラウザも Node.js もそのままでは読めない。トランスパイラが関数呼び出しに書き換え、その関数の実装を JSX ランタイムと呼ぶ。関数は何を返してもよく、発表は 7 行の実装から始めて、型、組み込み要素、コンポーネントを足していく。ブラウザの中で関わるのは、変換後の JavaScript を走らせるエンジン（第10章 場面5）だけで、同じ関数はサーバーでも動く。

## どの層の話か <!-- tab: 層 -->

発表は新機能の知らせではなく、仕組みの解説である。JSX を書いてから画面に出るまでを、通る順に並べた。発表が扱うのは太字の 3 段で、どれもブラウザの部品ではない。JSX は HTML に似ているが、ブラウザの HTML パーサ（[10章 場面2][10-2]）は通らない。

| 層 | この発表で起きること | 章・場面 |
|---|---|---|
| ソース（書く側） | `.jsx`・`.tsx` に `<a href="…">…</a>` と書く。ECMAScript の文法ではないので、そのまま走らせると構文エラーになる。Node.js 24 は `Unexpected token '<'` で止まった | [28章 場面1][28-1] の段階5、[10章 場面5][10-5] の段階1 |
| **トランスパイラ（作る側）** | Babel・tsc・Oxc などが、JSX の式を関数呼び出し `h("a", { href: "…" }, "…")` に書き換える。働くのは実行の前で、ふつうはビルド時である。Deno は読み込むときに変換した | [28章 場面1][28-1] の段階2〜4、[26章 場面4][26-4] の段階6。トランスパイラは教材に無い |
| **型検査（作る側）** | TypeScript は、JSX 名前空間に書いた型で、要素の名前と属性を確かめる。JSX の式の型は `JSX.Element` の 1 種類になる | [28章 場面2][28-2] の段階2・3、[26章 場面4][26-4] の段階6 |
| **JSX ランタイム（動かす側）** | 書き換えた先の関数 `h` の実装。ふつうの JavaScript の関数で、名前・属性・子を受け取って値を返す。何を返すかは自由である | [10章 場面5][10-5] の段階1、[36章 場面3][36-3] の段階3 |
| 値の使い道（動かす側） | 返した値の使い道はライブラリごとに違う。React は DOM に反映し、hono/jsx はサーバーで HTML を作り、jsx-slack は Slack の JSON を作る | [36章 場面5][36-5] の段階5、[22章 場面5][22-5] の段階1 |
| ブラウザ（動かす側） | 受け取るのは変換後の JavaScript だけで、JSX も `h` も知らない。DOM が書き換われば、変わった所のレイアウトから先をやり直す | [10章 場面3][10-3] の段階5 |

## 何を解決するか <!-- tab: 解決 -->

### 困っていたこと

- 入れ子のデータを JavaScript で組むと、関数呼び出しや JSON の入れ子になり、形が読み取りにくい。発表の例の jsx-slack は、生の JSON で組む Slack のブロックを JSX で書けるようにする。
- JSX は同じ入れ子を、タグの入れ子として書けるようにする。式なので、変数に入れ、引数に渡せる。発表は、ejs などのテンプレートエンジンの代わりに使うだけでも便利だと書く。
- JSX の仕様は、意味を定めない記法で、エンジンやブラウザが実装するものではなく、ECMAScript に入れる提案でもないと書く。意味は、変換と関数の実装が決める。

### 記法と意味を分ける

| 分担 | 決めること | 決める所 |
|---|---|---|
| 記法 | タグ・属性・子の書き方 | JSX の仕様 |
| 変換 | どの関数の呼び出しに書き換えるか | トランスパイラの設定 |
| ランタイム | その関数が何を返すか | ライブラリ（React、Preact、hono/jsx、自作） |
| 型 | どの名前と属性を許すか | ライブラリが書く JSX 名前空間 |

記法と意味が分かれているので、同じ書き方が、DOM にも、HTML の文字列にも、JSON にも使える。発表のまとめは「JSXは、HTMLに囚われない多様なユースケースに使える」である。

#### 解決しないこと

- ビルドが要る。ブラウザは JSX を読めないままである。
- 型は粗い。TypeScript の文書は、JSX の式の型から要素・属性・子の情報は取り出せず、black box だと書く。
- 関数の約束は標準ではない。classic と automatic の 2 つの方式があり、変換の設定とランタイムが合わないと動かない。

## 変換と、最小のランタイム <!-- tab: 仕組み -->

### 変換の前と後

```
// 前（発表の例）
<outer attr1="attribute 1">
  <inner attr2="attribute 2"></inner>
  <inner></inner>
</outer>

// 後: classic（関数の名前を h と設定）
h("outer", { attr1: "attribute 1" },
  h("inner", { attr2: "attribute 2" }),
  h("inner", null))

// 後: automatic（取り込み元を my-lib と設定）
import { jsx, jsxs } from "my-lib/jsx-runtime";
jsxs("outer", { attr1: "attribute 1", children: [
  jsx("inner", { attr2: "attribute 2" }),
  jsx("inner", {}) ] })
```

- Bun 1.3.14 で変換した結果である（改行を詰め、Bun が名前に付ける乱数を省いた）。
- classic は子を 3 つめ以降の引数に渡す。automatic は子を属性の `children` に入れ、import 文も足す。React 17 からの `_jsx`・`_jsxs` は automatic、その前の `React.createElement` は classic である。

### 最小のランタイム

```
export function h(type, props, ...children) {
  return { type, props, children };
}
```

- サンプルの 7 行を 3 行に詰めた。classic の変換結果をこの `h` と一緒に Node.js で走らせると、`{ type: 'outer', props: { attr1: 'attribute 1' }, children: [ … ] }` という入れ子の値が出た。
- 同じ変換結果に、文字列を組み立てる `h` を当てると、`<outer attr1="attribute 1"><inner …></inner><inner></inner></outer>` が出た。返す値はランタイムが決める。
- 要素名が大文字で始まると、文字列ではなく、その名前の関数が `h` に渡る。サンプルは `typeof type === "function"` なら呼び出す。これがコンポーネントである。

#### 型（TypeScript 6.0.3）

- JSX 名前空間が無いと、TS7026（`JSX.IntrinsicElements` が無い）で止まる。
- `JSX.Element` を書かなければ、JSX の式は any になる。number を返すコンポーネントの式を、string の変数に入れても通った。
- `JSX.Element` を書くと、式の型はその 1 種類になり、string を返すコンポーネントは TS2786 で拒まれた。

## 前提知識 <!-- tab: 前提 -->

下の層から、依存の順に並べた。React の知識は要らない。中心は、ソースを木にして書き換える段（1 行目）と、作る側で消えるもの（3 行目）である。

| 概念 | この発表での役割 | 章・場面 |
|---|---|---|
| 字句解析・構文解析・構文木 | 「文法として有効ではない」の意味。変換は、構文木の JSX の節を、関数呼び出しの節に置き換える | [28章 場面1][28-1] の段階2〜5 |
| JavaScript エンジンがソースを読む段 | ブラウザが JSX を読めない理由。エンジンは ECMAScript の文法で解析する | [10章 場面5][10-5] の段階1、[36章 場面2][36-2] の段階1・2 |
| 型は作る側で消える | tsc は型を消して JavaScript にする。JSX も同じ段で書き換わり、実行する側には残らない | [26章 場面4][26-4] の段階6、[29章 場面5][29-5] の段階3 |
| 木 | JSX の入れ子は、関数呼び出しの入れ子になり、値の木になる | [27章 場面4][27-4] の段階1・6 |
| HTML のパースと DOM | JSX が通らない道。見た目は似ているが、HTML パーサの仕事ではない | [10章 場面2][10-2] の段階2・3・5、[33章 場面6][33-6] の段階1 |
| JavaScript から DOM を書き換える | React のようなランタイムが、返した値を画面にする道 | [36章 場面5][36-5] の段階2・5、[10章 場面3][10-3] の段階5 |
| サーバーが HTML を作る | JSX ランタイムがサーバーで動く使い道 | [22章 場面5][22-5] の段階1 |
| トランスパイラ | 発表の中心。ソースを、別の書き方のソースに書き換える道具 | 教材に無い。近いのは [26章 場面4][26-4] の段階6 |
| モジュール（import と export） | `h` の取り込みと、automatic が足す import 文 | 教材に無い |
| 関数を値として渡す（JavaScript） | コンポーネントは、要素名の位置に渡す関数である | 教材に無い。近いのは [30章 場面5][30-5] の段階2 |
| TypeScript の名前空間と型の宣言 | JSX 名前空間の `IntrinsicElements`・`Element`・`ElementChildrenAttribute` | 教材に無い |
| テンプレートエンジン | JSX が代わりになる相手 | 教材に無い |

## いつ使えるか <!-- tab: 段階 -->

### 記法・変換・関数の約束の段階

JSX は ECMAScript の提案ではないので、TC39 の段階は無い。段階は、トランスパイラとライブラリの版で読む。

| 時期 | 出来事 | 出どころ |
|---|---|---|
| 2012-08 | hyperscript の最初のコミット。`h(名前, 属性, 子)` に近い形のライブラリで、`h` はこの名前の略 | GitHub、Vue.js の文書 |
| 2013-06 | React のブログが JSX を、使わなくてもよい構文の拡張として紹介した | React のブログ |
| 2020-03 | Babel 7.9.0 に automatic の変換が入った。7 までの既定は classic | Babel の文書 |
| 2020-09 | React が新しい変換を発表した。React 17 と、16.14.0・15.7.0・0.14.10 が対応する。TypeScript は 4.1 で `react-jsx` を足した | React のブログ、TypeScript 4.1 のリリースノート |
| 2024-04 | React 19 の移行の手引きが、新しい変換を必須と書いた | React のブログ |
| 2026-06 | 発表。サンプルは classic（`jsx: "react"` と `jsxFactory: "h"`）で、変換は tsc と Oxc | 発表、サンプル |

### 誰が何をすれば効くか

- 書く人が、トランスパイラに方式を設定する。classic は関数の名前を、automatic は取り込み元（`jsxImportSource`）を指定する。
- classic では、JSX を書くファイルごとに `h` を import する。automatic では、トランスパイラが import 文を足す。
- ランタイムを作る人は、関数と JSX 名前空間の型を用意する。automatic なら `jsx`・`jsxs`・`Fragment` を、決まったパス（`…/jsx-runtime`）から出す。
- ブラウザは何も変えなくてよい。届くのは JavaScript である。

## 予想との差と出典 <!-- tab: 出典 -->

### 読む前の予想と差

読む前の予想は「ブラウザレイヤーの話。ブラウザレイヤーの中でも、さらに細かくしたどのレイヤーかは分からない」だった。

- 層: ブラウザの層ではなかった。半分はブラウザに届く前の変換（作る側）で、半分は JavaScript エンジンの上で動くライブラリである。「ランタイム」という名前でも、ブラウザの部品ではない。
- ブラウザの中の細かい層: 第10章の順に、HTML のパース、スタイル計算、レイアウト、ペイント、合成と、JavaScript エンジンに分かれる。JSX が関わるのは JavaScript エンジンだけで、届く時点で JSX は消えている。
- 前提と解決する問題: 予想には無かった。前提は、ソースを木にして書き換える段と、「型は作る側で消える」（[26章 場面4][26-4] の段階6）である。解決するのは、入れ子のデータをタグの入れ子として書くことだった。
- 見分け方: 画面に出るものの話でも、ブラウザがそのまま読めない記法なら、まず作る側を疑う。

### 追って確かめること

- サンプルを、発表と同じ tsc と Oxc で走らせる。今回は Bun・Node.js・Deno で同じ形を確かめた。
- トランスパイラとモジュールは「教材に無い」前提の 1 回目。[26章 場面4][26-4] の段階6 に、JSX の変換を例として足すか。

### 出典

- 発表: [作って学ぶ、JSX (TSX) ランタイムの基本](https://speakerdeck.com/syumai/jsx-runtime-basics)（syumai、2026-06-06）。サンプル: [syumai/minimum-jsx](https://github.com/syumai/minimum-jsx)（コミット 737a3e4、MIT）
- JSX: [仕様](https://github.com/facebook/jsx)、TypeScript の [JSX の文書](https://www.typescriptlang.org/docs/handbook/jsx.html)と [4.1 のリリースノート](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html)、[Babel の変換の文書](https://babeljs.io/docs/babel-plugin-transform-react-jsx)、[Oxc の変換の文書](https://oxc.rs/docs/guide/usage/transformer/jsx.html)
- React: [Why did we build React?](https://legacy.reactjs.org/blog/2013/06/05/why-react.html)（2013-06-05）、[Introducing the New JSX Transform](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)（2020-09-22）、[React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)（2024-04-25）、[createRoot](https://react.dev/reference/react-dom/client/createRoot)
- ほかのランタイム: [hyperscript](https://github.com/hyperhype/hyperscript)、Vue.js の [Render Functions & JSX](https://vuejs.org/guide/extras/render-function.html)、[hono/jsx](https://hono.dev/docs/guides/jsx)、[jsx-slack](https://github.com/yhatt/jsx-slack)

[10-2]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s2
[10-3]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s3
[10-5]: https://sukitooru.shiraoka.workers.dev/chapters/10-browser.html#s5
[22-5]: https://sukitooru.shiraoka.workers.dev/chapters/22-server.html#s5
[26-4]: https://sukitooru.shiraoka.workers.dev/chapters/26-kata.html#s4
[27-4]: https://sukitooru.shiraoka.workers.dev/chapters/27-algorithm.html#s4
[28-1]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s1
[28-2]: https://sukitooru.shiraoka.workers.dev/chapters/28-compiler.html#s2
[29-5]: https://sukitooru.shiraoka.workers.dev/chapters/29-imi.html#s5
[30-5]: https://sukitooru.shiraoka.workers.dev/chapters/30-gbemu-desktop.html#s5
[33-6]: https://sukitooru.shiraoka.workers.dev/chapters/33-saba-dom.html#s6
[36-2]: https://sukitooru.shiraoka.workers.dev/chapters/36-saba-js.html#s2
[36-3]: https://sukitooru.shiraoka.workers.dev/chapters/36-saba-js.html#s3
[36-5]: https://sukitooru.shiraoka.workers.dev/chapters/36-saba-js.html#s5
