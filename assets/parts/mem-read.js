/* ============================================================
   部品 mem-read（メモリの読み出し）— assets/parts/mem-read.js

   第6章の YT-8 のメモリ（16 番地 × 8 ビット）を、1 番地 = 1 行の DRAM の格子として描いた模式図。
   アドレスバスの 4 ビットをデコーダ（NOT と、行ごとの AND）が 16 本のワード線の 1 本に変え、その行のセル 8 個が
   ビット線と電荷を分け合い、センスアンプが増幅してデータバスに出す。最後の段階は、第7章の図の 32 ビットの番地で、
   上位のビットが答える部品（RAM か NIC か）を選ぶこと（MMIO）。
   使う所: 第6章 場面1 段階4（番地 1 → 0010 1011）、場面3 段階1（番地 0001 の行を選ぶ）・段階4（番地 1011 → 0000 0011）、
     第7章 場面2 段階2（MMIO。段階5）、第5章 場面3 段階4・場面4 段階5・場面5 段階5（デコーダ。段階2）。
   値（params）: addr（番地。1 か 11）。既定は 1（第6章 場面3 段階1・2 のフェッチ）。11 は第6章 場面3 段階4 のオペランドの読み出し。
     段階の文はこの 2 つだけを書いた。ほかの値は 1 に寄せる。中身は第6章の INIT_MEM（場面3 の時点で sum = 0、n = 3）。
   事実: DRAM の読み出し（VDD の半分のプリチャージ、電荷の分け合い、差 0.1 V 以下、センスアンプの増幅と書き戻し）は教材の
     第5章 場面5 段階3・5、デコーダの作りは第4章 場面3 段階6 の積和形に合わせた（2026-11-18）。
     段階5 の番地の範囲・RAM の範囲は第7章 場面2 の図（RAM 0x0000_0000〜0xBFFF_FFFF、NIC 0xFEB0_0000〜0xFEB1_FFFF）。
     PCI の装置が受け持つ番地の範囲を BAR（Base Address Register）に持ち、起動時にファームウェアが番地を書き込むこと、範囲の
     大きさは 2 のべき乗で、先頭はその大きさの倍数にそろえること（だから上位のビットだけを比べれば範囲に入るかが分かる）は、
     Oracle「Writing Device Drivers」の PCI の章（docs.oracle.com/cd/E19620-01/805-3024/hwovr-25）で、BIOS が割り当てて
     いなければカーネルが pci_enable_device() で割り当てることは Linux の文書（docs.kernel.org/PCI/pci.html）で確かめた
     （2026-11-18）。YT-8 は教材の架空の CPU。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var bits8 = function (v) { return (v & 255).toString(2).padStart(8, '0'); };
  var bits4 = function (v) { return (v & 15).toString(2).padStart(4, '0'); };
  var fmt8 = function (v) { var b = bits8(v); return b.slice(0, 4) + ' ' + b.slice(4); };
  var lvl = function (el, v, w) { el.setAttribute('class', 'f-none round ' + (v ? 's-h ' + (w || 'w2') : 's-dim w15')); };
  // 第6章の INIT_MEM と意味（場面3 の ADD 11 の時点。sum = 0、n = 3）
  var MEM = [0x1A, 0x2B, 0x4A, 0x1B, 0x3C, 0x4B, 0x50, 0x00, 0, 0, 0, 3, 1, 0, 0, 0];
  var NOTE = ['LOAD 10', 'ADD 11', 'STORE 10', 'LOAD 11', 'SUB 12', 'STORE 11', 'JNZ 0', 'HALT', '', '', 'sum = 0', 'n = 3', '定数 1', '', '', ''];
  var pick = function (p) { return p && Number(p.addr) === 11 ? 11 : 1; };
  var STEPS_1 = [
    { title: 'メモリは 16 行 × 8 列のセルの格子', text: 'YT-8 のメモリを、1 番地 = 1 行の格子として描く。16 行 × 8 列 = 128 個のセルに、行ごとの**ワード線**と列ごとの**ビット線**が通る。第6章 場面3 の 1 拍めで、CPU がアドレスバスの 4 本に番地 0001 を出す。' },
    { title: 'デコーダ：4 本の番地から 16 本のうち 1 本へ', text: '番地の 4 本と、NOT で反転した 4 本を縦に通し、行ごとに AND を 1 個置く。行 1 の AND は ¬b3・¬b2・¬b1・b0 につないであり、0001 のときだけ 4 本そろって 1。ほかの 15 行は、どれかの入力が 0。' },
    { title: 'ワード線が行のセルをビット線につなぐ', text: 'ワード線 1 が 1 になると、行 1 の 8 個のセルの nMOS がオンになり、コンデンサがビット線とつながる。ビット線は前もって VDD の半分にしてあり、電荷を分け合って 1 のセルの線はわずかに上がり、0 の線は下がる。差は 0.1 V 以下。' },
    { title: 'センスアンプが増幅し、データバスへ', text: '列ごとのセンスアンプが小さな差を VDD か 0 V まで広げ、8 ビット 0010 1011 がそろってデータバスに乗る（第6章 場面3 の 2 拍め、IR へ）。読むとセルも VDD の半分近くになって値が壊れるので、同じ増幅で行の 8 個に書き戻す。' },
    { title: '上位の番地で、答える部品を選ぶ', text: '第7章の図の番地は 32 ビット。0xFEB0_0000〜0xFEB1_FFFF は上位 15 ビットが 1111 1110 1011 000 で、この並びに合う AND が NIC を選ぶ線を 1 にし、RAM の線は 0 のまま。パソコンはこの並びを配線でなく NIC のレジスタ（BAR）に置き、起動時に決める。' }
  ];
  var STEPS_11 = [
    { title: 'メモリは 16 行 × 8 列のセルの格子', text: 'YT-8 のメモリを、1 番地 = 1 行の格子として描く。16 行 × 8 列 = 128 個のセルに、行ごとの**ワード線**と列ごとの**ビット線**が通る。第6章 場面3 の 4 拍めで、IR のオペランド 1011 がアドレスバスの 4 本に出る。' },
    { title: 'デコーダ：4 本の番地から 16 本のうち 1 本へ', text: '番地の 4 本と、NOT で反転した 4 本を縦に通し、行ごとに AND を 1 個置く。行 11 の AND は b3・¬b2・b1・b0 につないであり、1011 のときだけ 4 本そろって 1。ほかの 15 行は、どれかの入力が 0。' },
    { title: 'ワード線が行のセルをビット線につなぐ', text: 'ワード線 11 が 1 になると、行 11 の 8 個のセルの nMOS がオンになり、コンデンサがビット線とつながる。ビット線は前もって VDD の半分にしてあり、電荷を分け合って 1 のセルの線はわずかに上がり、0 の線は下がる。差は 0.1 V 以下。' },
    { title: 'センスアンプが増幅し、データバスへ', text: '列ごとのセンスアンプが小さな差を VDD か 0 V まで広げ、8 ビット 0000 0011（n = 3）がデータバスに乗る（第6章 場面3 の 4 拍め、ALU の入力 2 へ）。読むとセルも VDD の半分近くになって値が壊れるので、同じ増幅で行の 8 個に書き戻す。' },
    { title: '上位の番地で、答える部品を選ぶ', text: '第7章の図の番地は 32 ビット。0xFEB0_0000〜0xFEB1_FFFF は上位 15 ビットが 1111 1110 1011 000 で、この並びに合う AND が NIC を選ぶ線を 1 にし、RAM の線は 0 のまま。パソコンはこの並びを配線でなく NIC のレジスタ（BAR）に置き、起動時に決める。' }
  ];

  YT.parts.define('mem-read', {
    title: 'メモリの読み出し',
    layer: 'kioku',
    home: '05-kioku.html#s5',
    lead: '番地の 4 ビットをデコーダが 16 本のワード線の 1 本に変え、その行のセル 8 個がセンスアンプを通ってデータバスに出るまでを見る。第6章 場面1・3 のメモリから掘る。',
    caption: '図　YT-8 のメモリの模式。左が番地のデコーダ、中が 16 行 × 8 列のセル、下がセンスアンプとデータバス。段階5 の AND・NAND は第7章の図の番地の模式。',
    note: '実物の DRAM は 1 本のワード線に数千個のセルが並び、行を開いてから列アドレスで 8 バイトなどを選ぶ（第5章 場面5）。YT-8 は 1 番地を 1 行に縮めた模式で、列の選び方を省いた。',
    steps: function (p) { return pick(p) === 11 ? STEPS_11 : STEPS_1; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state;
      var addr = st.addr = pick(ctx.params), word = st.word = MEM[addr];
      var UX = [44, 80, 116, 152], CX = function (c) { return 280 + c * 40; }, CY = function (r) { return 138 + r * 21; };
      st.main = S.g({}, svg);   // YT-8 のメモリ（段階5 は薄くする）
      var g = st.main;

      // ---------- 見出しとアドレスバス ----------
      S.text(24, 36, 'メモリの読み出し', { cls: 't-b t-lg' }, svg);
      S.text(156, 36, 'YT-8 の 16 番地 × 8 ビット（DRAM）。1 番地 = 1 行に縮めた模式', { cls: 't-xs t-dim' }, svg);
      S.text(98, 58, 'アドレスバス（CPU から）', { cls: 't-c t-xs t-b t-d' }, g);
      st.aBits = UX.map(function (x) { return YT.zoom.bit(g, x, 76, 26, 22, 13); });

      // ---------- デコーダ: b3〜b0 と、NOT した ¬b3〜¬b0 ----------
      st.lines = []; st.nots = []; st.nlines = [];
      UX.forEach(function (x, j) {
        var nx = x + 18;
        st.lines.push(S.path('M' + x + ',88 V468', {}, g));
        st.nots.push(S.path('M' + x + ',98 H' + nx + ' V102', {}, g));
        S.circle(x, 98, 2.5, { cls: 'f-fg' }, g);
        S.path('M' + (nx - 7) + ',102 L' + (nx + 7) + ',102 L' + nx + ',114 Z', { cls: 'f-sf s-fg w15' }, g);
        S.circle(nx, 118, 3.5, { cls: 'f-sf s-fg w15' }, g);
        st.nlines.push(S.path('M' + nx + ',122 V468', {}, g));
        S.text(x, 482, 'b' + (3 - j), { cls: 't-c t-mono t-xs t-dim' }, g);
        S.text(nx, 482, '¬b' + (3 - j), { cls: 't-c t-mono t-xs t-dim' }, g);
      });

      // ---------- ビット線（列ごと。濃さが電圧）と列の番号 ----------
      S.text(420, 104, 'ビット線（列）とビットの位置', { cls: 't-c t-xs t-dim' }, g);
      S.text(592, 120, '意味（第6章）', { cls: 't-xs t-dim' }, g);
      st.bl = [];
      for (var c = 0; c < 8; c++) {
        S.text(CX(c), 120, String(7 - c), { cls: 't-c t-mono t-xs t-dim' }, g);
        S.path('M' + CX(c) + ',126 V478', { cls: 'f-none s-dim w2' }, g);
        st.bl.push(S.path('M' + CX(c) + ',126 V478', { cls: 'f-none s-h w2' }, g));
      }

      // ---------- 16 行: AND（● が入力）→ ワード線 → セル 8 個 ----------
      st.band = S.rect(228, 0, 348, 20, { rx: 4, cls: 'f-x-soft', style: { opacity: 0 } }, g);
      st.andG = S.g({}, g);
      st.rows = [];
      for (var r = 0; r < 16; r++) {
        var cy = CY(r), p = bits4(r), dots = [];
        S.path('M' + (p[0] === '1' ? UX[0] : UX[0] + 18) + ',' + cy + ' H184', { cls: 'f-none s-rule w1' }, g);
        for (var j = 0; j < 4; j++) dots.push({ el: S.circle(p[j] === '1' ? UX[j] : UX[j] + 18, cy, 2.6, {}, g), j: j, on1: p[j] === '1' });
        S.path('M184,' + (cy - 8) + ' H191 A8,8 0 0 1 191,' + (cy + 8) + ' H184 Z', { cls: 'f-sf s-fg w15' }, st.andG);
        var stub = S.path('M199,' + cy + ' H205', {}, g);
        var num = S.text(216, cy + 3.5, String(r), { cls: 't-c t-mono t-xs t-dim' }, g);
        var wl = S.path('M228,' + cy + ' H574', {}, g);
        var cells = [];
        for (var c2 = 0; c2 < 8; c2++) {
          var v = (MEM[r] >> (7 - c2)) & 1;
          S.rect(CX(c2) - 15, cy - 8, 30, 16, { rx: 3, cls: 'f-sf' }, g);   // 下地（ワード線とビット線を文字の下に隠す）
          var bg = S.rect(CX(c2) - 15, cy - 8, 30, 16, { rx: 3, cls: v ? 'f-h-soft s-h w1' : 'f-in s-rule w1' }, g);
          S.text(CX(c2), cy + 3.5, String(v), { cls: 't-c t-mono t-xs ' + (v ? 't-h' : 't-dim') }, g);
          cells.push(bg);
        }
        if (NOTE[r]) S.text(592, cy + 3.5, NOTE[r], { cls: 't-xs t-dim' }, g);
        st.rows.push({ cy: cy, dots: dots, stub: stub, num: num, wl: wl, cells: cells });
      }

      // ---------- センスアンプとデータバス ----------
      S.text(252, 492, 'センスアンプ', { cls: 't-end t-xs t-b' }, g);
      S.text(252, 528, 'データバス → CPU', { cls: 't-end t-xs t-b t-d' }, g);
      st.saG = S.g({}, g);
      st.sa = []; st.saTxt = []; st.dW = []; st.dBits = [];
      for (var c3 = 0; c3 < 8; c3++) {
        st.sa.push(S.rect(CX(c3) - 16, 478, 32, 20, { rx: 4, cls: 'f-sf s-rule w15' }, st.saG));
        st.saTxt.push(S.text(CX(c3), 492, '', { cls: 't-c t-mono t-xs' }, g));
        st.dW.push(S.path('M' + CX(c3) + ',498 V514', {}, g));
        st.dBits.push(YT.zoom.bit(g, CX(c3), 524, 24, 18, 11));
      }

      // ---------- いまの読み出し（右上）。番地・行・中身は YT-8 の値なので、段階5 は YT-8 の図と一緒に薄くする ----------
      S.rect(700, 56, 244, 128, { rx: 6, cls: 'f-sf s-rule w1' }, svg);
      st.nowG = S.g({}, svg);
      S.text(712, 76, '番地', { cls: 't-xs t-dim' }, st.nowG);
      st.vAddr = S.text(756, 76, '', { cls: 't-mono t-sm t-b t-d' }, st.nowG);
      S.text(712, 98, '行', { cls: 't-xs t-dim' }, st.nowG);
      st.vRow = S.text(756, 98, '', { cls: 't-sm t-b' }, st.nowG);
      S.text(712, 120, '中身', { cls: 't-xs t-dim' }, st.nowG);
      st.vData = S.text(756, 120, '', { cls: 't-mono t-sm t-b t-d' }, st.nowG);
      st.s1 = S.text(712, 148, '', { cls: 't-xs t-b' }, svg);
      st.s2 = S.text(712, 168, '', { cls: 't-xs t-dim' }, svg);

      // ---------- セル 1 個の中（段階1〜4）: nMOS 1 個とコンデンサ 1 個 ----------
      var gc = st.cellG = S.g({ cls: 'fade' }, svg);
      S.rect(700, 200, 244, 150, { rx: 6, cls: 'f-sf s-rule w1' }, gc);
      S.text(712, 220, 'セル 1 個の中（DRAM の 1T1C）', { cls: 't-xs t-b' }, gc);
      st.cWl = S.path('M716,246 H930', {}, gc);
      S.text(930, 240, 'ワード線', { cls: 't-end t-xs t-dim' }, gc);
      S.path('M740,236 V340', { cls: 'f-none s-mid w2' }, gc);
      S.text(748, 338, 'ビット線', { cls: 't-xs t-dim' }, gc);
      st.cGate = S.path('M790,246 V271', {}, gc);
      st.cSw = S.rect(777, 271, 26, 18, { rx: 3, cls: 'f-sf s-fg w15' }, gc);
      S.text(790, 304, 'nMOS', { cls: 't-c t-xs t-dim' }, gc);
      S.path('M740,280 H777 M803,280 H850 V292', { cls: 'f-none s-fg w15' }, gc);
      S.circle(740, 280, 2.5, { cls: 'f-fg' }, gc);
      S.rect(830, 292, 40, 5, { cls: 'f-fg' }, gc);
      S.rect(830, 304, 40, 5, { cls: 'f-fg' }, gc);
      S.path('M850,309 V318 M838,318 H862 M842,323 H858 M846,328 H854', { cls: 'f-none s-fg w15' }, gc);
      S.text(878, 300, 'コンデンサ', { cls: 't-xs t-dim' }, gc);
      S.text(878, 314, '電荷あり = 1', { cls: 't-xs t-dim' }, gc);

      // ---------- 段階5: 第7章の図の 32 ビットの番地で、答える部品を選ぶ ----------
      var gp = st.pcG = S.g({ cls: 'fade hide' }, svg);
      S.rect(700, 200, 244, 262, { rx: 6, cls: 'f-sf s-x w15' }, gp);
      S.text(712, 220, '第7章の図：番地は 32 ビット', { cls: 't-xs t-b' }, gp);
      S.text(712, 244, '番地', { cls: 't-xs t-dim' }, gp);
      S.text(744, 244, '0xFEB0_0000（NIC の CTRL）', { cls: 't-mono t-xs t-b t-d' }, gp);
      S.text(712, 266, '上位 15 ビット（b31〜b17）', { cls: 't-xs t-dim' }, gp);
      S.text(712, 284, '1111 1110 1011 000', { cls: 't-mono t-sm t-b' }, gp);
      st.pAnd = S.rect(712, 296, 112, 24, { rx: 4, cls: 'f-sf s-fg w15' }, gp);
      S.text(768, 312, 'AND（15 入力）', { cls: 't-c t-xs t-b' }, gp);
      st.pNicW = S.path('M824,308 H840', {}, gp);
      st.pNic = S.text(844, 312, 'NIC の線 = 1', { cls: 't-xs t-b t-h' }, gp);
      S.text(712, 342, 'b31・b30 = 11（RAM は 11 以外の番地）', { cls: 't-xs t-dim' }, gp);
      st.pNand = S.rect(712, 352, 112, 24, { rx: 4, cls: 'f-sf s-fg w15' }, gp);
      S.text(768, 368, 'NAND（b31・b30）', { cls: 't-c t-xs t-b' }, gp);
      S.path('M824,364 H840', { cls: 'f-none s-dim w15' }, gp);
      S.text(844, 368, 'RAM の線 = 0', { cls: 't-xs t-b t-dim' }, gp);
      S.text(712, 398, '下位 17 ビットは、選んだ部品の中の', { cls: 't-xs' }, gp);
      S.text(712, 414, 'レジスタを選ぶ（+0x00 = CTRL）', { cls: 't-xs' }, gp);
      S.text(712, 438, '実物は並びを配線でなく NIC の BAR に置く', { cls: 't-xs t-dim' }, gp);

      // ---------- 凡例 ----------
      S.line(712, 482, 732, 482, { cls: 's-h w3 round' }, svg);
      S.text(740, 486, '1（高い電位）。0 は灰色', { cls: 't-xs t-dim' }, svg);
      S.circle(722, 502, 2.6, { cls: 'f-h' }, svg);
      S.text(740, 506, 'AND の入力（4 本）', { cls: 't-xs t-dim' }, svg);
      S.line(712, 522, 732, 522, { cls: 's-h w2', style: { opacity: 0.5 } }, svg);
      S.text(740, 526, 'ビット線の濃さ ＝ 電圧（差は誇張）', { cls: 't-xs t-dim' }, svg);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.cellG, { to: '05-kioku.html#s5.1', label: 'セル（1T1C）', at: [928, 214], steps: [1], bridge: 'YT-8 のセルも DRAM の 1T1C。nMOS 1 個とコンデンサ 1 個で 1 ビットを覚える' });
      ctx.mark(st.andG, { to: '04-ronri.html#s3.6', label: '行デコーダの AND', at: [194, 118], steps: [2], bridge: '行ごとに AND を置くデコーダは、真理値表の 1 になる行ごとに AND を作る積和形' });
      ctx.mark(st.bl[0], { to: '05-kioku.html#s5.3', label: 'ビット線のわずかな差', at: [254, 120], steps: [3], bridge: 'ビット線がわずかに動くのは、セルのコンデンサとビット線が電荷を分け合うから' });
      ctx.mark(st.saG, { to: '05-kioku.html#s5.3', label: 'センスアンプ', at: [598, 488], steps: [4], bridge: 'センスアンプは 0.1 V 以下の差を VDD か 0 V まで広げ、同じ動きでセルに書き戻す' });
      ctx.mark(st.pAnd, { to: '04-ronri.html#s3.6', label: '部品を選ぶ AND', at: [928, 308], steps: [5], bridge: '上位のビットで部品を選ぶ AND も、行デコーダと同じく積和形の 1 行分' });
    },
    onStep: function (ctx, i) {
      var st = ctx.state;
      S.fade(st.cellG, i <= 3);
      S.fade(st.pcG, i === 4);
      st.main.style.opacity = st.nowG.style.opacity = i === 4 ? 0.4 : '';
      st.key = '';
    },
    frame: function (ctx) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing, ts = ctx.ts, addr = st.addr, word = st.word;
      // 段階の中の姿。arr: 番地が届いた、lines: 縦の 8 本、wl: ワード線、share: 電荷を分け合った割合（0〜1）、amp: 増幅の割合、out: データバスに出た、wb: 書き戻しの合図
      var arr = i >= 1 || !run || ts >= 0.6;
      var lines = i >= 2 || (i === 1 && (!run || ts >= 0.3));
      var wl = i >= 2 || (i === 1 && (!run || ts >= 0.9));
      var share = i >= 3 ? 1 : i === 2 ? (run ? U.clamp((ts - 0.4) / 0.8, 0, 1) : 1) : 0;
      var amp = i >= 4 ? 1 : i === 3 ? (run ? U.clamp(ts / 0.7, 0, 1) : 1) : 0;
      var out = i >= 4 || (i === 3 && (!run || ts >= 0.8));
      var wb = i === 3 && run && ts >= 1.3 && ts < 2.1;
      // ビット線の電圧（毎フレーム）: 段階1・2 は VDD の半分、段階3 で ±わずか、段階4 で 0 か VDD
      for (var c = 0; c < 8; c++) {
        var bv = (word >> (7 - c)) & 1, dv = bv ? 1 : -1;
        var v = 0.5 + dv * 0.08 * share;
        v = v + ((bv ? 1 : 0) - v) * amp;
        st.bl[c].style.opacity = v.toFixed(3);
      }
      var key = i + ':' + arr + ':' + lines + ':' + wl + ':' + (share >= 1) + ':' + (share > 0) + ':' + (amp >= 1) + ':' + out + ':' + wb;
      if (st.key === key) return;
      st.key = key;
      var a4 = bits4(addr);
      st.aBits.forEach(function (b, j) { b.set(arr ? Number(a4[j]) : '?'); });
      st.lines.forEach(function (el, j) {
        var v = (addr >> (3 - j)) & 1;
        lvl(el, lines && v); lvl(st.nots[j], lines && v); lvl(st.nlines[j], lines && !v);
      });
      st.rows.forEach(function (row, r) {
        var sel = r === addr;
        row.dots.forEach(function (d) { var v = (addr >> (3 - d.j)) & 1, on = d.on1 ? v : !v; d.el.setAttribute('class', lines ? (on ? 'f-h' : 'f-dim') : 'f-fg'); });
        lvl(row.stub, wl && sel, 'w3');
        lvl(row.wl, wl && sel, 'w3');
        row.num.setAttribute('class', 't-c t-mono t-xs ' + (wl && sel ? 't-h t-b' : 't-dim'));
        row.cells.forEach(function (cb, c) {
          var v = (MEM[r] >> (7 - c)) & 1;
          cb.setAttribute('class', (v ? 'f-h-soft s-h ' : 'f-in s-rule ') + (sel && wb ? 'w2' : 'w1'));
        });
      });
      var cyS = st.rows[addr].cy;
      st.band.setAttribute('y', cyS - 10);
      st.band.style.opacity = wl ? 1 : 0;
      // センスアンプとデータバス
      for (var c2 = 0; c2 < 8; c2++) {
        var b2 = (word >> (7 - c2)) & 1;
        st.saTxt[c2].textContent = i === 2 && share > 0 ? (b2 ? '↑' : '↓') : amp >= 1 ? String(b2) : '';
        st.saTxt[c2].setAttribute('class', 't-c t-mono t-xs t-b ' + (amp >= 1 ? (b2 ? 't-h' : 't-dim') : 't-mid'));
        st.sa[c2].setAttribute('class', i === 3 ? 'f-x-soft s-x w15' : 'f-sf s-rule w15');
        lvl(st.dW[c2], out && b2);
        st.dBits[c2].set(out ? b2 : '?');
      }
      // セル 1 個の中: ワード線とスイッチ
      lvl(st.cWl, wl, 'w2'); lvl(st.cGate, wl, 'w2');
      st.cSw.setAttribute('class', wl ? 'f-h s-h w15' : 'f-sf s-fg w15');
      lvl(st.pNicW, i === 4, 'w2');
      st.pAnd.setAttribute('class', i === 4 ? 'f-x-soft s-x w15' : 'f-sf s-fg w15');
      // いまの読み出し
      st.vAddr.textContent = arr ? a4 + ' = ' + addr : '?';
      st.vRow.textContent = wl ? 'ワード線 ' + addr + ' だけが 1' : lines ? 'デコーダが選んでいる' : 'まだ選んでいない';
      st.vData.textContent = out ? fmt8(word) + '（' + NOTE[addr] + '）' : '?';
      var s1 = '', s2 = '';
      if (i === 0) { s1 = arr ? '番地 ' + a4 + ' が届いた' : 'CPU が番地を出す'; s2 = 'ビット線は VDD の半分にしてある'; }
      else if (i === 1) { s1 = wl ? '行 ' + addr + ' の AND だけが 1' : '縦の 8 本のうち 4 本が 1'; s2 = 'ほかの行の AND は入力のどれかが 0'; }
      else if (i === 2) { s1 = share > 0 ? '1 の列は ↑、0 の列は ↓（0.1 V 以下）' : '行 ' + addr + ' のセルがビット線とつながる'; s2 = 'セルも VDD の半分近くになる'; }
      else if (i === 3) { s1 = out ? 'データバスに ' + fmt8(word) : 'センスアンプが差を広げている'; s2 = wb ? '行 ' + addr + ' の 8 個に書き戻す' : '同じ増幅でセルに書き戻す'; }
      else { s1 = 'YT-8 の番地は 4 ビットで部品は 1 つ'; s2 = 'パソコンは上位のビットで部品を選ぶ'; }
      st.s1.textContent = s1;
      st.s2.textContent = s2;
    }
  });
})();
