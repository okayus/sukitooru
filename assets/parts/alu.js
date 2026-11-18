/* ============================================================
   部品 alu（ALU の中）— assets/parts/alu.js

   第6章の YT-8 の 8 ビットの ALU。第4章 場面5・6 の全加算器を 8 個つなぎ、減算のために M を反転する XOR と
   桁上がりの入力 Cin（どちらも制御信号 SUB 1 本で切り替える）、和の 8 本から Z を作る OR と NOT を足した回路を、
   値を渡して動かす。第6章 場面1・3 の板の関数 buildALU を部品に書き直したもの（章の関数は変えていない）。
   使う所: 第6章 場面3 段階5（ADD 11 の 0 + 3）、場面4 段階3（SUB 12 の 3 − 1、Z = 0）、場面4 段階5（3 周めの 1 − 1、Z = 1）。
   値（params）: a・b（入力 A と M）、op（'add' | 'sub'）。既定は第6章 場面3 段階5 の 0 + 3。
     段階の文は第6章の 3 つの例（0 + 3、3 − 1、1 − 1）だけを書いた。ほかの値は op の例に寄せる（図だけ値を変えると文と食い違うため）。
   事実: 回路と値は教材の第4章 場面3・5・6（XOR、全加算器、リップルキャリー、2 の補数）と第6章 場面1〜4（YT-8 の命令・
     プログラム・値）に合わせた（2026-11-18）。YT-8 は教材の架空の CPU なので、外の資料では確かめていない。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var bits8 = function (v) { return (v & 255).toString(2).padStart(8, '0'); };
  var fmt8 = function (v) { var b = bits8(v); return b.slice(0, 4) + ' ' + b.slice(4); };
  var lvl = function (el, v) { el.setAttribute('class', 'f-none round ' + (v ? 's-h w3' : 's-dim w2')); };
  // 第6章の 3 つの例。z0 は計算の前の Z（どの例でも直前の結果は 0 でない）
  var EX = {
    add: { a: 0, b: 3, op: 'add', eq: '0 + 3', z0: 0 },
    sub31: { a: 3, b: 1, op: 'sub', eq: '3 − 1', z0: 0 },
    sub11: { a: 1, b: 1, op: 'sub', eq: '1 − 1', z0: 0 }
  };
  var pick = function (p) {
    p = p || {};
    if (p.op === 'sub') return Number(p.a) === 1 && Number(p.b) === 1 ? 'sub11' : 'sub31';
    return 'add';
  };
  var STEPS_ADD = [
    { title: '入力：A と M、制御信号は加算', text: 'ADD 11 の実行では、入力 1 に A の 0000 0000、入力 2 にメモリから読んだ 0000 0011（n = 3）が届く。制御装置は **SUB = 0** を出すので、XOR は M をそのまま B へ通し、右端の桁上がりの入力 Cin も 0。' },
    { title: '右端のビット 0 から決まる', text: 'ビット 0 の全加算器は A = 0、B = 1、Cin = 0 を足して S = 1、桁上がり 0 を出す。ビット 1 は、この桁上がりが届くまで答えが決まらない（「?」）。全加算器 1 個の中は XOR 2・AND 2・OR 1。' },
    { title: '桁上がりが左へ 1 段ずつ伝わる', text: '0 + 3 では桁上がりはどれも 0 で、和は 0000 0011 = 3、ビット 7 からのあふれも 0。A と B がともに 0 の桁は右隣を待たずに桁上がり 0 を出すが、図はどの桁も右隣を待つ形で描いた。CPU は、桁上がりが 8 段を全部通る最悪の場合でも間に合うように拍の長さを決めてある。' },
    { title: 'Z：和の 8 本の OR を NOT する', text: '和の 8 本を OR に入れ、その出力を NOT したものが **Z**。8 本のうち 1 本でも 1 なら OR = 1 で Z = 0、全部 0 のときだけ Z = 1。0000 0011 はビット 0 と 1 が 1 なので Z = 0。' },
    { title: '次の立ち上がりで A と Z に入る', text: 'ALU は記憶を持たない組み合わせ回路で、入力が変われば和もすぐ変わる。結果が残るのは、5 拍めのクロックの立ち上がりで A が 0000 0011 を、Z が 0 を取り込むから。続く STORE 10 が、この 3 を sum に書き込む。' }
  ];
  var STEPS_SUB31 = [
    { title: '入力：A と M、制御信号は減算', text: 'SUB 12 では A = 0000 0011（n = 3）、M = 0000 0001（定数 1）。3 − 1 は 3 + (−1) で、−1 は 1 の各ビットを反転して 1 を足した数（2 の補数）。**SUB = 1** で XOR が M を 1111 1110 に反転し、Cin = 1 が +1 になる。' },
    { title: '右端のビット 0 から決まる', text: 'ビット 0 の全加算器は A = 1、B = 0、Cin = 1 を足して 10。S = 0 で、桁上がり 1 がビット 1 へ出る。ビット 1 から左は、この桁上がりが届くまで答えが決まらない（「?」）。' },
    { title: '桁上がりが左へ 1 段ずつ伝わる', text: 'ビット 1 は 1 + 1 + 1 = 11 で S = 1、桁上がり 1。ビット 2〜7 は 0 + 1 + 1 = 10 で S = 0、桁上がり 1 が最上位まで伝わる。ビット 7 からのあふれ 1 は捨て、和は 0000 0010 = 2。8 ビットの範囲では、これが 3 − 1 の答え。' },
    { title: 'Z：和の 8 本の OR を NOT する', text: '和の 8 本を OR に入れ、その出力を NOT したものが **Z**。0000 0010 はビット 1 が 1 なので OR = 1、Z = 0。全部の桁が 0 のときだけ Z = 1 になる。第6章 場面4 の JNZ 0 は、この Z = 0 を見て 0 番地へ戻る。' },
    { title: '次の立ち上がりで A と Z に入る', text: 'ALU は記憶を持たない組み合わせ回路で、入力が変われば和もすぐ変わる。結果が残るのは、次のクロックの立ち上がりで A が 0000 0010 を、Z が 0 を取り込むから。続く STORE 11 が、この 2 を n に書き戻す。' }
  ];
  var STEPS_SUB11 = [
    { title: '入力：A と M、制御信号は減算', text: '3 周めの SUB 12 では A = 0000 0001（n = 1）、M = 0000 0001（定数 1）。1 − 1 は 1 + (−1)。**SUB = 1** で XOR が M を 1111 1110 に反転し、Cin = 1 で 1 を足すと、−1 の 2 の補数 1111 1111 を足したことになる。' },
    { title: '右端のビット 0 から決まる', text: 'ビット 0 の全加算器は A = 1、B = 0、Cin = 1 を足して 10。S = 0 で、桁上がり 1 がビット 1 へ出る。ビット 1 から左は、この桁上がりが届くまで答えが決まらない（「?」）。' },
    { title: '桁上がりが左へ 1 段ずつ伝わる', text: 'ビット 1〜7 は、どれも 0 + 1 + 1 = 10 で S = 0、桁上がり 1。桁上がりが 8 段を全部通る、加算器でいちばん遅い形。ビット 7 からのあふれ 1 は捨て、和は 0000 0000 = 0。' },
    { title: 'Z：和の 8 本の OR を NOT する', text: '和の 8 本がどれも 0 なので OR = 0、それを NOT して **Z = 1**。Z が 1 になるのは、和の全部の桁が 0 のときだけ。第6章 場面4 の JNZ 0 は、この Z = 1 を見て飛ばず、7 番地の HALT へ進む。' },
    { title: '次の立ち上がりで A と Z に入る', text: 'ALU は記憶を持たない組み合わせ回路で、入力が変われば和もすぐ変わる。結果が残るのは、次のクロックの立ち上がりで A が 0000 0000 を、Z が 1 を取り込むから。続く STORE 11 で n = 0 になる。' }
  ];

  YT.parts.define('alu', {
    title: 'ALU の中',
    layer: 'ronri',
    home: '04-ronri.html#s6',
    lead: '全加算器 8 個と XOR・OR・NOT で、8 ビットの足し算・引き算と Z を作る ALU の中を見る。第6章 場面3・4 の ALU から、0 + 3・3 − 1・1 − 1 の値のまま掘る。',
    caption: '図　YT-8 の ALU。上から入力 A と M、M を反転する XOR、全加算器 8 個、和、Z を作る OR と NOT。下は結果を取り込む A と Z。',
    note: 'パソコンやスマートフォンの CPU の ALU は 64 ビットで、桁上がりを先読みする加算器に、AND・OR・シフトなどの回路を並べ、制御信号で出力を選ぶ。YT-8 の ALU は加算・減算と Z（結果が 0 か）だけの模式。',
    steps: function (p) { var k = pick(p); return k === 'sub11' ? STEPS_SUB11 : k === 'sub31' ? STEPS_SUB31 : STEPS_ADD; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, mk = S.markers(svg);
      var ex = st.ex = EX[pick(ctx.params)];
      // 計算（第6章の buildALU と同じ）。sub なら M を反転し、Cin = 1
      var sub = st.sub = ex.op === 'sub';
      var mm = st.mm = sub ? (~ex.b) & 255 : ex.b;
      var c = st.cin0 = sub ? 1 : 0;
      st.res = []; st.cy = [];
      for (var b = 0; b < 8; b++) { var x = ((ex.a >> b) & 1) + ((mm >> b) & 1) + c; st.res[b] = x & 1; st.cy[b] = x >> 1; c = x >> 1; }
      st.sum = (ex.a + mm + st.cin0) & 255;
      st.z = st.sum === 0 ? 1 : 0;
      var X = function (k) { return 120 + k * 102; };   // k = 0 がビット 7（左端）、k = 7 がビット 0（右端）

      // ---------- 見出しと制御信号 ----------
      S.text(24, 36, 'ALU', { cls: 't-b t-lg' }, svg);
      S.text(62, 36, 'YT-8 の 8 ビット。第4章の全加算器 × 8 に、減算の XOR とゼロ検出を足した', { cls: 't-xs t-dim' }, svg);
      S.rect(744, 14, 192, 48, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(756, 32, '制御装置から（命令の解読）', { cls: 't-xs t-dim' }, svg);
      st.ctlTxt = S.text(756, 52, '', { cls: 't-sm t-b t-e' }, svg);
      // SUB の線: 各桁の XOR の片方の入力と、ビット 0 の Cin（2 の補数の +1）に同じ線を配る
      st.subLine = S.path('M924,62 V126 H' + (X(0) + 26), {}, svg);
      st.cinLine = S.path('M924,126 V236 H' + (X(7) + 37), { 'marker-end': mk('dim') }, svg);
      S.text(904, 112, 'SUB', { cls: 't-xs t-b t-mono t-e t-end' }, svg);
      st.cinVal = S.text(897, 228, '', { cls: 't-c t-mono t-xs' }, svg);

      // ---------- 8 桁 ----------
      S.text(70, 84, 'A', { cls: 't-end t-mono t-b t-sm' }, svg);
      S.text(70, 110, 'M', { cls: 't-end t-mono t-b t-sm' }, svg);
      S.text(70, 188, 'B', { cls: 't-end t-mono t-b t-sm' }, svg);
      S.text(70, 294, '和 S', { cls: 't-end t-b t-xs' }, svg);
      st.A = []; st.M = []; st.B = []; st.Sb = []; st.wA = []; st.wM = []; st.wB = []; st.wS = []; st.wZ = []; st.xor = []; st.fa = []; st.cAr = []; st.cVal = [];
      for (var k = 0; k < 8; k++) {
        var x0 = X(k), bb = 7 - k, cx = x0 + 20;
        st.wA.push(S.path('M' + (x0 - 20) + ',91 V210', {}, svg));
        st.wM.push(S.path('M' + (x0 + 14) + ',117 V137', {}, svg));
        S.path('M' + (x0 + 26) + ',126 V137', { cls: 'f-none w15 ' + (sub ? 's-e' : 's-dim') }, svg);   // SUB から XOR へ（SUB の線と同じ色）
        S.circle(x0 + 26, 126, 2.5, { cls: sub ? 'f-e' : 'f-dim' }, svg);
        st.xor.push(xorDown(svg, cx, 140));
        st.wB.push([S.path('M' + cx + ',166 V173', {}, svg), S.path('M' + cx + ',195 V210', {}, svg)]);
        st.A.push(YT.zoom.bit(svg, x0 - 20, 80, 26, 22, 13));
        st.M.push(YT.zoom.bit(svg, x0 + 14, 106, 26, 22, 13));
        st.B.push(YT.zoom.bit(svg, cx, 184, 26, 22, 13));
        st.fa.push(S.rect(x0 - 35, 210, 70, 52, { rx: 6, cls: 'f-sf s-fg w2' }, svg));
        S.text(x0, 231, '全加算器', { cls: 't-c t-xs t-b' }, svg);
        S.text(x0, 247, 'ビット ' + bb, { cls: 't-c t-xs t-dim' }, svg);
        st.wS.push(S.path('M' + x0 + ',262 V279', {}, svg));
        st.Sb.push(YT.zoom.bit(svg, x0, 290, 26, 22, 13));
        st.wZ.push(S.path('M' + x0 + ',301 V330', {}, svg));
        // この箱の右の隙間の矢印 ＝ 右隣（ビット bb − 1）から入る桁上がり。右端は Cin（SUB の線）
        if (k < 7) {
          st.cAr.push(S.path('M' + (X(k + 1) - 35) + ',236 H' + (x0 + 37), { 'marker-end': mk('dim') }, svg));
          st.cVal.push(S.text(x0 + 52, 228, '', { cls: 't-c t-mono t-xs' }, svg));
        }
      }
      st.cOut = S.path('M' + (X(0) - 35) + ',236 H52', { 'marker-end': mk('dim') }, svg);
      S.text(62, 226, 'あふれ', { cls: 't-c t-xs t-dim' }, svg);
      st.cOutVal = S.text(62, 254, '', { cls: 't-c t-mono t-xs' }, svg);
      st.cOutNote = S.text(62, 268, '', { cls: 't-c t-xs t-x' }, svg);

      // ---------- ゼロ検出: 和の 8 本の OR → NOT → Z ----------
      st.orBar = S.rect(80, 330, 794, 24, { rx: 5, cls: 'f-sf s-fg w2' }, svg);
      S.text(480, 346, '和の 8 本の OR：どれか 1 本でも 1 なら 1', { cls: 't-c t-xs t-b' }, svg);
      st.wOr = S.path('M480,354 V364', {}, svg);
      S.path('M472,364 L488,364 L480,380 Z', { cls: 'f-sf s-fg w2' }, svg);
      S.circle(480, 384, 4, { cls: 'f-sf s-fg w2' }, svg);
      S.text(498, 377, 'NOT', { cls: 't-xs t-dim t-mono' }, svg);
      st.wNot = S.path('M480,388 V397', {}, svg);
      st.Zb = YT.zoom.bit(svg, 480, 408, 26, 22, 13);
      S.text(500, 412, 'Z（和が 0 なら 1）', { cls: 't-xs' }, svg);
      S.text(40, 412, '和', { cls: 't-sm t-b' }, svg);
      st.resTxt = S.text(62, 412, '', { cls: 't-mono t-md t-b' }, svg);

      // ---------- 出口: 次の立ち上がりで A と Z が取り込む ----------
      st.regA = S.rect(40, 436, 300, 46, { rx: 5, cls: 'f-in s-rule w1' }, svg);
      S.text(52, 455, 'A ← 和', { cls: 't-sm t-b' }, svg);
      st.regAv = S.text(328, 455, '', { cls: 't-mono t-md t-b t-end' }, svg);
      st.regAs = S.text(52, 473, '', { cls: 't-xs t-dim' }, svg);
      st.wZr = S.path('M480,419 V436', {}, svg);
      st.regZ = S.rect(360, 436, 180, 46, { rx: 5, cls: 'f-in s-rule w1' }, svg);
      S.text(372, 455, 'Z ← Z の出力', { cls: 't-sm t-b' }, svg);
      st.regZv = S.text(528, 455, '', { cls: 't-mono t-md t-b t-end' }, svg);
      st.regZs = S.text(372, 473, '', { cls: 't-xs t-dim' }, svg);
      S.text(566, 444, 'クロック', { cls: 't-xs t-e t-b' }, svg);
      S.path('M566,476 H592 V454 H618 V476 H644 V454 H670 V476 H692', { cls: 'f-none s-e w2 round' }, svg);
      st.edge = S.path('M644,448 V482', { cls: 'f-none s-x w2 fade hide' }, svg);
      st.edgeTxt = S.text(644, 498, '↑ 立ち上がり', { cls: 't-c t-xs t-x t-b fade hide' }, svg);

      // ---------- いまの動作と凡例 ----------
      st.s1 = S.text(40, 516, '', { cls: 't-sm t-b' }, svg);
      st.s2 = S.text(40, 536, '', { cls: 't-xs t-dim' }, svg);
      S.line(726, 450, 746, 450, { cls: 's-h w3 round' }, svg);
      S.text(754, 454, '1（高い電位）の線。0 は灰色', { cls: 't-xs t-dim' }, svg);
      S.line(726, 472, 746, 472, { cls: 's-e w2 dash' }, svg);
      S.text(754, 476, '制御信号（SUB）', { cls: 't-xs t-dim' }, svg);
      YT.zoom.bit(svg, 736, 496, 20, 18, 11).set('?');
      S.text(754, 500, 'まだ決まっていない値', { cls: 't-xs t-dim' }, svg);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.xor[7], { to: '04-ronri.html#s3.5', label: 'XOR（M の反転）', at: [882, 152], steps: [1], bridge: 'SUB = 1 で M を反転する XOR は、NAND 4 個を組み合わせて作れる' });
      ctx.mark(st.fa[7], { to: '04-ronri.html#s5.4', label: '全加算器', at: [886, 270], steps: [2, 3], bridge: '全加算器 1 個の中は、半加算器 2 個と、2 つの桁上がりをまとめる OR' });
      ctx.mark(st.cOut, { to: '04-ronri.html#s6.4', label: '桁上がりの遅延', at: [62, 202], steps: [3], bridge: '桁上がりが通る段の数だけ遅れる。64 ビットの CPU は桁上がりを先読みする回路で段を減らす' });
      ctx.mark(st.orBar, { to: '04-ronri.html#s3.4', label: 'OR と NOT（Z）', at: [890, 342], steps: [4], bridge: 'Z を作る OR も NAND で作れる。入力をそれぞれ NOT してから NAND に入れる' });
    },
    onStep: function (ctx, i) {
      var st = ctx.state;
      S.fade(st.edge, i === 4);
      S.fade(st.edgeTxt, i === 4);
      st.key = '';   // frame が段階の中の姿を描き直す
    },
    frame: function (ctx) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing, ts = ctx.ts, ex = st.ex;
      // 段階の中の姿。bOn: XOR の出力が出た、n: 確定した桁の数（ビット 0 から）、zOn: Z が出た、reg: A と Z が取り込んだ
      var bOn = true, n = 8, orOn = true, zOn = true, reg = false, flash = false;
      if (i === 0) { bOn = !run || ts >= 0.8; n = 0; orOn = zOn = false; }
      else if (i === 1) { n = !run || ts >= 0.6 ? 1 : 0; orOn = zOn = false; }
      else if (i === 2) { n = run ? U.clamp(1 + Math.floor(U.mod(ts, 7.5) / 0.45), 1, 8) : 8; orOn = zOn = false; }
      else if (i === 3) { orOn = !run || ts >= 0.4; zOn = !run || ts >= 0.9; }
      else { var u5 = U.mod(ts, 4.5); reg = !run || u5 >= 1.2; flash = run && u5 >= 1.2 && u5 < 1.8; }
      var key = i + ':' + bOn + ':' + n + ':' + orOn + ':' + zOn + ':' + reg + ':' + flash;
      if (st.key === key) return;
      st.key = key;
      var sub = st.sub, any = st.sum !== 0;
      st.ctlTxt.textContent = sub ? 'SUB = 1：減算（Cin = 1）' : 'SUB = 0：加算（Cin = 0）';
      st.subLine.setAttribute('class', 'f-none ' + (sub ? 's-e w2 dash' : 's-dim w15 dash'));
      st.cinLine.setAttribute('class', 'f-none ' + (sub ? 's-e w2 dash' : 's-dim w15 dash'));
      st.cinLine.setAttribute('marker-end', S.markers(ctx.svg)(sub ? 'e' : 'dim'));
      st.cinVal.textContent = 'Cin ' + st.cin0;
      st.cinVal.setAttribute('class', 't-c t-mono t-xs ' + (st.cin0 ? 't-e t-b' : 't-dim'));
      for (var k = 0; k < 8; k++) {
        var b = 7 - k, av = (ex.a >> b) & 1, mv = (ex.b >> b) & 1, bv = (st.mm >> b) & 1, done = b < n;
        st.A[k].set(av); lvl(st.wA[k], av);
        st.M[k].set(mv); lvl(st.wM[k], mv);
        st.B[k].set(bOn ? bv : '?'); lvl(st.wB[k][0], bOn && bv); lvl(st.wB[k][1], bOn && bv);
        st.xor[k].firstChild.setAttribute('class', 'f-sf w15 ' + (i === 0 ? 's-x' : 's-fg'));
        st.Sb[k].set(done ? st.res[b] : '?');
        lvl(st.wS[k], done && st.res[b]);
        lvl(st.wZ[k], orOn && st.res[b]);
        // 段階2 はビット 0、段階3 は伝わっている途中でいま確定した桁の箱を注目の色に
        st.fa[k].setAttribute('class', (i === 1 && b === 0) || (i === 2 && run && n < 8 && b === n - 1) ? 'f-x-soft s-x w2' : 'f-sf s-fg w2');
        if (k < 7) {   // ビット b の左の隙間 ＝ ビット b の桁上がり（ビット b + 1 の Cin）。k の箱の右 ＝ ビット b − 1 の桁上がり
          var known = b - 1 < n, v = st.cy[b - 1];
          carry(st.cAr[k], v, known, ctx.svg);
          st.cVal[k].textContent = known ? String(v) : '?';
          st.cVal[k].setAttribute('class', 't-c t-mono t-xs ' + (known ? (v ? 't-h t-b' : 't-dim') : 't-x'));
        }
      }
      carry(st.cOut, st.cy[7], n >= 8, ctx.svg);
      st.cOutVal.textContent = n >= 8 ? String(st.cy[7]) : '?';
      st.cOutNote.textContent = n >= 8 && st.cy[7] ? '捨てる' : '';
      st.cOutVal.setAttribute('class', 't-c t-mono t-xs ' + (n >= 8 ? (st.cy[7] ? 't-h t-b' : 't-dim') : 't-x'));
      st.orBar.setAttribute('class', i === 3 ? 'f-x-soft s-x w2' : 'f-sf s-fg w2');
      lvl(st.wOr, orOn && any);
      lvl(st.wNot, zOn && !any);
      st.Zb.set(zOn ? st.z : '?');
      var partial = st.res.map(function (v, bi) { return bi < n ? v : '?'; }).reverse().join('');
      st.resTxt.textContent = n >= 8 ? fmt8(st.sum) + ' = ' + st.sum + '（' + ex.eq + '）' : partial.slice(0, 4) + ' ' + partial.slice(4);
      // 出口のレジスタ
      st.regAv.textContent = fmt8(reg ? st.sum : ex.a);
      st.regAs.textContent = reg ? '立ち上がりで取り込んだ' : i === 4 ? 'Load = 1：次の立ち上がりで取り込む' : 'いまの値（ALU の入力 1）';
      st.regZv.textContent = String(reg ? st.z : ex.z0);
      st.regZs.textContent = reg ? '立ち上がりで取り込んだ' : 'いまの値';
      st.regA.setAttribute('class', flash ? 'f-x-soft s-x w2' : (i === 4 ? 'f-in s-x w15' : 'f-in s-rule w1'));
      st.regZ.setAttribute('class', flash ? 'f-x-soft s-x w2' : (i === 4 ? 'f-in s-x w15' : 'f-in s-rule w1'));
      lvl(st.wZr, i === 4 && st.z);
      // いまの動作
      var a0 = ex.a & 1, b0 = st.mm & 1, s0 = a0 + b0 + st.cin0;
      var s1 = '', s2 = '';
      if (i === 0) { s1 = sub ? 'SUB = 1：XOR が M の 8 ビットを反転して B へ' : 'SUB = 0：XOR は M をそのまま B へ'; s2 = bOn ? 'B = ' + fmt8(st.mm) + '、Cin = ' + st.cin0 : 'XOR の出力はまだ決まっていない'; }
      else if (i === 1) { s1 = n ? 'ビット 0：' + a0 + ' + ' + b0 + ' + ' + st.cin0 + ' = ' + s0.toString(2) : 'ビット 0 の全加算器が足している'; s2 = n ? 'S = ' + (s0 & 1) + '、桁上がり ' + (s0 >> 1) + ' がビット 1 へ' : '右隣の桁上がりを待つ桁は「?」'; }
      else if (i === 2) { s1 = n < 8 ? 'ビット ' + (n - 1) + ' まで確定' : '8 桁が確定：' + fmt8(st.sum) + ' = ' + st.sum; s2 = n < 8 ? '左の桁は、右の桁上がりが届くのを待つ' : 'ビット 7 からのあふれ ' + st.cy[7] + (st.cy[7] ? ' は捨てる' : ''); }
      else if (i === 3) { s1 = zOn ? 'OR = ' + (any ? 1 : 0) + ' → NOT → Z = ' + st.z : orOn ? 'OR = ' + (any ? 1 : 0) : '和の 8 本が OR に入る'; s2 = st.z ? '和の全部の桁が 0' : '和に 1 の桁がある'; }
      else { s1 = reg ? '立ち上がりで A と Z が取り込んだ' : 'Load = 1：次の立ち上がりを待つ'; s2 = 'A ← ' + fmt8(st.sum) + '、Z ← ' + st.z + '（' + ex.eq + ' = ' + st.sum + '）'; }
      st.s1.textContent = s1;
      st.s2.textContent = s2;
    }
  });

  /* 下向きの XOR の記号（入力が上、出力が下）。in1 は cx − 6、in2 は cx + 6、出力は (cx, top + 26) */
  function xorDown(parent, cx, top) {
    var g = S.g({}, parent);
    S.path('M' + (cx - 12) + ',' + top + ' Q' + (cx - 12) + ',' + (top + 14) + ' ' + cx + ',' + (top + 26) + ' Q' + (cx + 12) + ',' + (top + 14) + ' ' + (cx + 12) + ',' + top + ' Q' + cx + ',' + (top + 6) + ' ' + (cx - 12) + ',' + top + ' Z', { cls: 'f-sf s-fg w15' }, g);
    S.path('M' + (cx - 12) + ',' + (top - 5) + ' Q' + cx + ',' + (top + 1) + ' ' + (cx + 12) + ',' + (top - 5), { cls: 'f-none s-fg w15' }, g);
    return g;
  }
  /* 桁上がりの矢印（決まって 1 なら h の太線） */
  function carry(el, v, known, svg) {
    el.setAttribute('class', 'f-none round ' + (known && v ? 's-h w3' : 's-dim w2'));
    el.setAttribute('marker-end', S.markers(svg)(known && v ? 'h' : 'dim'));
  }
})();
