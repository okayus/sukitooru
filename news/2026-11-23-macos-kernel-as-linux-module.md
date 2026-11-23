# macOS のカーネルを Linux のモジュールとして動かす xnulinux（2026-11-23）
<!-- kind: daily -->
<!-- tags: os -->
<!-- missing: カーネルモジュール、仮想マシン（ハイパーバイザ） -->

- 出典: [AFK-surf/xnulinux](https://github.com/AFK-surf/xnulinux) の README（Heyang Zhou ほか。日付が無く、2026-11-23 は投稿の日）。作った本人たちのリポジトリ。
- 話題: [Hacker News](https://news.ycombinator.com/item?id=50607261) の 7 位（561 点、2026-11-23 20:08 UTC の時点）と[はてなブックマーク](https://b.hatena.ne.jp/entry/s/github.com/AFK-surf/xnulinux)（6 users）。
- 調べた時点: 2026-11-24。日刊のノート（自動で選んで書いた）。人は確かめていない。実行して確かめたことは無い。

## 要点

OS の層（第9章）の話で、Linux のカーネルの中に macOS のカーネル XNU をもう 1 つ入れ、2 つのユーザー空間を同じ CPU で動かした報告である。xnulinux は、XNU を Apple の公開したソースから作り、手を加えない arm64 の Linux のカーネルに、読み込めるモジュール（`xnu.ko`）として入れる。XNU は CPU と MMU を直に操るので、macOS のプロセスは Linux のプロセスの隣で、ハイパーバイザを挟まずに動く。メモリ・タイマ・ファイル・ネットワーク・GPU は、Linux が小さなモジュール（`fki.ko`）を通して XNU に貸す。

## どの層の話か <!-- tab: 層 -->

種類は作ったものの報告（リポジトリの公開）である。働くのは実行時で、起動した Linux に `xnu.ko` を読み込んでから macOS が止まるまでの間に当たる。ビルド時には、XNU のソースに Linux の上で動くための変更を当てて作る。

| 層 | このニュースで起きること | 章と場面 |
|---|---|---|
| **カーネルとユーザー空間** | 1 台の機械に Linux と XNU の 2 つのカーネルがあり、その上にユーザー空間が 2 つ並ぶ。例外で CPU が飛ぶ先は Linux の入口のままで、XNU の分は `fki.ko` が XNU に渡す | [9章 場面1][9-1] |
| CPU | Linux のスケジューラから見ると、macOS の CPU の 1 つ 1 つが、決まったコアに固定したカーネルスレッドである | [9章 場面5][9-5] |
| 仮想メモリ | XNU は Linux から物理的に連続した区画（CMA）を 1 つもらい、自分の pmap で管理する。ページは 4 KiB で、アドレス空間のユーザーの側の半分の配置を Linux と共通にする | [9章 場面4][9-4] |
| ドライバ | XNU のドライバ（kext）が、macOS にディスク・画面・キーボードとポインタ・Ethernet を見せる。ディスクの中身は Linux の側のファイル、Ethernet は Linux のネットワークインターフェースである | [9章 場面6][9-6] |
| フレームバッファ | macOS の画面は、Linux の側が読むフレームバッファにある。README の画像は、そこから直に取った 1280×800 | [8章 場面1][8-1] |
| GPU | macOS の Metal を Vulkan に訳し、Linux の側の GPU へ橋渡しする（今は virtio-gpu の Venus だけ）。橋が無ければ CPU で描く | [8章 場面2][8-2] |

## 何が起きたか <!-- tab: 動き -->

XNU は Linux のカーネルの中で、2 つのモジュールを挟んで動く。図は README の層の図の macOS の側を、起動から順に追う。

```anim stack
title: Linux のカーネルの中で XNU を動かす
caption: README の層の図の左の列（macOS の側）を上から並べた。Linux のプロセスは図の外で、Linux のカーネルの上に並ぶ。右の道は層をまたぐ受け渡し。
layer mac: macOS のプロセス | loginwindow・WindowServer・Finder
layer xnu: XNU | macOS のカーネル。ソースから作る
layer xko: `xnu.ko` | XNU の側のモジュール（APSL）
layer fki: `fki.ko` | Linux の側のモジュール（GPL）
layer lnx: Linux のカーネル | 手を加えない配布版（Ubuntu など）
step: Linux に 2 つのモジュールを入れる
起動した Linux に、`fki.ko` と `xnu.ko` を読み込む。2 つは `fki_*` の口でだけつながり、`xnu.ko` はそのほかの Linux の関数を呼ばない。
show: fki xko
step: xnu.ko が XNU を走らせる
`xnu.ko` は、XNU と kext をつないだカーネルの集まり（kernel collection）を読み込んで走らせる。XNU はハイパーバイザを介さず、CPU と MMU を自分で操る。
show: xnu
send: xko -> xnu: 読み込んで起動
down: xnu -> 09-os.html#s4: XNU が自分で操る MMU は、ページテーブルを引いて仮想アドレスを物理アドレスに変える
step: macOS がデスクトップまで起動する
XNU は、Apple のインストーラで作った macOS 27 のディスクから、デスクトップまで起動する。macOS のプロセスは、Linux のプロセスと同じ CPU の上で並んで動く。
show: mac
step: 例外は Linux の入口で受ける
例外の入口（ベクタ）は Linux のものをそのまま使う。XNU の側のコードで起きたフォールトとユーザーの例外は、`fki.ko` が XNU のハンドラへ回す。
send: fki -> xnu: 例外を回す
x: lnx fki xnu
down: lnx -> 09-os.html#s1: 例外の入口は、CPU がモードを切り替えて飛ぶ、あらかじめ登録された番地
step: 休む・入出力・タイマは Linux を呼ぶ
XNU は、Linux のカーネルスレッドを自分の CPU として走り続け、休むとき・入出力・タイマのときにだけ Linux を呼ぶ。
send: xnu -> lnx: ホストの呼び出し
x: xnu lnx
down: lnx -> 09-os.html#s2: カーネルスレッドも、カーネルの表ではプロセスと同じタスクとして管理される
```

## 中身 <!-- tab: 中身 -->

### 動いていること

- Apple Silicon の Mac の上の arm64 Linux の VM（krunkit。macOS の CPU は 1〜6 個）で、macOS 27.2.1 が自動ログインのデスクトップまで 31〜48 秒で起動する。同じ Mac で Apple の仮想化の VM に入れた macOS は 49 秒。
- Safari などのアプリと Spotlight・ディスクの走査を 40 回まわす 30 分の試験を、パニックもクラッシュの報告も無く終える。
- NVIDIA DGX Spark では、仮想化を挟まない arm64 の Linux（Ubuntu 24.04.5 LTS）の上で、XNU に CPU 4 つと 8 GiB を渡して動く。

### 作り方と分け方

- XNU（`xnu-12377.121.6`）は arm64 の Linux の上でソースから作り、Linux の上で動く機械の層（LINUX64）などの変更を当てる。
- Apple のバイナリはリポジトリに無い。Apple の kext と macOS のシステムのディスクは、利用者が自分の macOS から取る。
- Linux の側（GPL-2.0）と XNU の側（APSL-2.0）はライセンスで分ける。Linux は `xnu.ko` を GPL でないモジュールとして扱い、ZFS と同じくカーネルに印（taint）を付ける。
- 動かす機械は PAC（FEAT_PAuth）のある arm64 で、Linux のページが 4 KiB、メモリが 16 GB 以上（8 GB を XNU に取る）。

### まだ仮のこと

- README は仮のままの所として、OS の cryptex をシステムのボリュームに混ぜたこと、AMFI に手を入れたこと、SIP を緩めたことを挙げる。
- ページが 16 KiB でなく 4 KiB なので、メモリの読み書きは macOS をふつうの VM で動かすときより遅い。
- DGX Spark では CPU で描く。`xnudrmd` が今は virtio-gpu（Venus）の要求しか運ばないので、GB10 の GPU を使うには橋の別の実装が要る。

## 前提と出典 <!-- tab: 前提 -->

### 前提知識

| 概念 | このニュースでの役割 | 章と場面 |
|---|---|---|
| CPU のモードと例外 | 例外が起きると、CPU は特権のモードに切り替えて登録された入口へ飛ぶ。xnulinux ではその入口が Linux のもので、XNU の分を XNU へ回す | [9章 場面1][9-1] |
| ページテーブルと MMU | 仮想アドレスを物理アドレスに変える表と、それを引く回路。XNU は Linux に頼まず、自分の表で MMU を使う | [9章 場面4][9-4] |
| スレッドとタスク | Linux から見ると、macOS の CPU 1 つがカーネルスレッド 1 つに当たる | [9章 場面2][9-2] |
| カーネルモジュール | 動いている Linux のカーネルに、後からコードを読み込む仕組み。`xnu.ko` と `fki.ko` はこれで入る | 教材に無い。近いのは [9章 場面1][9-1]、[9章 場面6][9-6] |
| 仮想マシン（ハイパーバイザ） | ハイパーバイザが CPU とメモリを区切り、その上で別の OS のカーネルを動かす。xnulinux はこれを挟まないが、比べた相手と、Mac の上の Linux は VM で動く | 教材に無い。近いのは [9章 場面4][9-4] |

### 出典と確かさ

- [AFK-surf/xnulinux](https://github.com/AFK-surf/xnulinux) の README。このノートの事実はすべてここから取った。README に日付は無く、2026-11-23 は Hacker News に出た日である。
- 起動の時間と 30 分の試験は作者の報告で、測り方の細部は README に無い。
- 確かめていないこと: リポジトリの公開の日、コミットの履歴、リリースの一覧。README の本文は読めたが、github.com のリポジトリのページはこの実行の環境から開けなかった。README が挙げる `docs/production.md` は開いていない。動かしてはいない。
- Hacker News の題は「OS X」と書くが、README が動かすのは macOS 27 である。

[8-1]: https://sukitooru.shiraoka.workers.dev/chapters/08-display.html#s1
[8-2]: https://sukitooru.shiraoka.workers.dev/chapters/08-display.html#s2
[9-1]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s1
[9-2]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s2
[9-4]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s4
[9-5]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s5
[9-6]: https://sukitooru.shiraoka.workers.dev/chapters/09-os.html#s6
