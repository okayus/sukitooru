/* ============================================================
   部品 dec（命令の解読）— assets/parts/dec.js

   第6章の YT-8 の制御装置の中の解読。IR の上位 4 ビット（オペコード）を NOT と AND の配線で 1 本の命令の線にし、
   その線が制御信号になる。JNZ の線は Z の NOT と AND を取ってから PC の Load になる（条件つきの命令）。
   第6章 場面1・3 の板の関数 buildDEC を部品に書き直したもの（章の関数は変えていない）。
   使う所: 第6章 場面3 段階3（ADD 11 の解読）、場面4 段階3（JNZ 0、Z = 0 で 0 番地へ戻る）、場面4 段階5（JNZ 0、Z = 1 で飛ばない）。
     第6章 場面1 段階5・場面2 段階1・2 の制御装置・オペコード・命令表も、既定の ADD 11 で使える。
     Z は値を保っているレジスタとして段階1 から値を出し、JNZ の条件の回路は段階1〜3 だけ薄くする（仕上げ確認 2026-11-18）。
   値（params）: op（'add' | 'sub' | 'jnz'）、z（JNZ のときの Z。0 か 1）。既定は ADD 11（0010 1011）。
     命令は第6章のプログラムの ADD 11（1 番地）・SUB 12（4 番地）・JNZ 0（6 番地）で、PC はフェッチで 1 進めた後の値。
     ほかの op は ADD に寄せる（段階の文を書いた例だけを出す）。
   事実: 命令のビットと合図は教材の第6章 場面2 の命令表と第6章の buildDEC、解読の作り（1 になる行ごとに AND、0 の桁は NOT）は
     第4章 場面3 段階6 の積和形に合わせた（2026-11-18）。YT-8 は教材の架空の CPU なので、外の資料では確かめていない。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var bits8 = function (v) { return (v & 255).toString(2).padStart(8, '0'); };
  var bits4 = function (v) { return (v & 15).toString(2).padStart(4, '0'); };
  var lvl = function (el, v, w) { el.setAttribute('class', 'f-none round ' + (v ? 's-h ' + (w || 'w2') : 's-dim w15')); };
  // 第6章 場面2 の命令表（並びも同じ）。合図の列: 番地 ← IR 下位、メモリ読め、ALU、A ←、メモリ ← A、停止（PC ← 番地 は JNZ の AND の先）
  var ISA = [['0001', 'LOAD'], ['0010', 'ADD'], ['0011', 'SUB'], ['0100', 'STORE'], ['0101', 'JNZ'], ['0000', 'HALT']];
  var SIG = { LOAD: ['●', '●', '', 'メモリ', '', ''], ADD: ['●', '●', '＋', 'ALU', '', ''], SUB: ['●', '●', '−', 'ALU', '', ''], STORE: ['●', '', '', '', '●', ''], JNZ: ['', '', '', '', '', ''], HALT: ['', '', '', '', '', '●'] };
  var COLS = [440, 490, 540, 590, 640, 690];
  // 例（第6章のプログラム）。pc はフェッチで 1 進めた後の PC
  var EX = {
    add: { ir: 0x2B, name: 'ADD 11', pc: 2, z: 0 },
    sub: { ir: 0x3C, name: 'SUB 12', pc: 5, z: 0 },
    jnz0: { ir: 0x50, name: 'JNZ 0', pc: 7, z: 0 },
    jnz1: { ir: 0x50, name: 'JNZ 0', pc: 7, z: 1 }
  };
  var pick = function (p) {
    p = p || {};
    if (p.op === 'jnz') return Number(p.z) === 1 ? 'jnz1' : 'jnz0';
    if (p.op === 'sub') return 'sub';
    return 'add';
  };
  var STEPS_ADD = [
    { title: 'IR の上位 4 ビットだけを解読する', text: 'IR = 0010 1011（ADD 11）。解読の入力は上位 4 ビットのオペコード 0010 だけで、下位 4 ビットのオペランド 1011 は解読せず、11 番地としてそのままアドレスバスへ回す。どのビットをどこへ回すかは、配線の引き方で決め打ちにしてある。' },
    { title: 'NOT で 8 本の線にする', text: 'オペコードの 4 本 b7〜b4 を縦に通し、それぞれを NOT にも通して ¬b7〜¬b4 を作る。0010 なら 1 になるのは b5 と ¬b7・¬b6・¬b4 の 4 本。どの命令でも、8 本のうちちょうど 4 本が 1 になる。' },
    { title: '命令 1 種類に AND を 1 個', text: '6 個の AND は、命令のビットが 1 の桁は b を、0 の桁は ¬b を入力につないである。ADD（0010）の AND の入力は ¬b7・¬b6・b5・¬b4 で、0010 のときだけ 4 本そろって 1。ほかの 5 個は、どれかの入力が 0 なので出力は 0。' },
    { title: 'AND の出力が制御信号になる', text: 'ADD の線が 1 になると、「番地 ← IR 下位」「メモリは読め」「ALU は＋」「A ← ALU」の合図が出て、第6章 場面3 の 4・5 拍めの動きになる。命令の意味は、この線がどの部品の Load や選択線につながっているかで決まる。' },
    { title: 'JNZ だけは Z と AND を取る', text: 'JNZ の線は、Z を NOT した ¬Z と AND を取ってから PC の Load になる。いまは ADD なので JNZ の線は 0 で、PC の Load も 0。PC はフェッチで進めた 0010（2）のままで、次は 2 番地の STORE 10 を取り出す。' }
  ];
  var STEPS_SUB = [
    { title: 'IR の上位 4 ビットだけを解読する', text: 'IR = 0011 1100（SUB 12）。解読の入力は上位 4 ビットのオペコード 0011 だけで、下位 4 ビットのオペランド 1100 は解読せず、12 番地としてそのままアドレスバスへ回す。どのビットをどこへ回すかは、配線の引き方で決め打ちにしてある。' },
    { title: 'NOT で 8 本の線にする', text: 'オペコードの 4 本 b7〜b4 を縦に通し、それぞれを NOT にも通して ¬b7〜¬b4 を作る。0011 なら 1 になるのは b5・b4 と ¬b7・¬b6 の 4 本。どの命令でも、8 本のうちちょうど 4 本が 1 になる。' },
    { title: '命令 1 種類に AND を 1 個', text: '6 個の AND は、命令のビットが 1 の桁は b を、0 の桁は ¬b を入力につないである。SUB（0011）の AND の入力は ¬b7・¬b6・b5・b4 で、0011 のときだけ 4 本そろって 1。ほかの 5 個は、どれかの入力が 0 なので出力は 0。' },
    { title: 'AND の出力が制御信号になる', text: 'SUB の線が 1 になると、「番地 ← IR 下位」「メモリは読め」「ALU は−」「A ← ALU」の合図が出る。ADD との違いは ALU への合図だけで、これが ALU の SUB の線になる。命令の意味は、線のつなぎ先で決まる。' },
    { title: 'JNZ だけは Z と AND を取る', text: 'JNZ の線は、Z を NOT した ¬Z と AND を取ってから PC の Load になる。いまは SUB なので JNZ の線は 0 で、PC の Load も 0。PC はフェッチで進めた 0101（5）のままで、次は 5 番地の STORE 11 を取り出す。' }
  ];
  var STEPS_JNZ0 = [
    { title: 'IR の上位 4 ビットだけを解読する', text: 'IR = 0101 0000（JNZ 0）。解読の入力は上位 4 ビットのオペコード 0101 だけで、下位 4 ビットのオペランド 0000 は解読せず、飛び先の 0 番地として PC の入口へ回す。どのビットをどこへ回すかは、配線の引き方で決め打ちにしてある。' },
    { title: 'NOT で 8 本の線にする', text: 'オペコードの 4 本 b7〜b4 を縦に通し、それぞれを NOT にも通して ¬b7〜¬b4 を作る。0101 なら 1 になるのは b6・b4 と ¬b7・¬b5 の 4 本。どの命令でも、8 本のうちちょうど 4 本が 1 になる。' },
    { title: '命令 1 種類に AND を 1 個', text: '6 個の AND は、命令のビットが 1 の桁は b を、0 の桁は ¬b を入力につないである。JNZ（0101）の AND の入力は ¬b7・b6・¬b5・b4 で、0101 のときだけ 4 本そろって 1。ほかの 5 個は、どれかの入力が 0 なので出力は 0。' },
    { title: 'AND の出力が制御信号になる', text: 'JNZ の線が出す合図は「PC ← 番地」の 1 つだけで、メモリも ALU も使わない。ただし、この線は PC の Load に直接はつながらず、もう 1 つの AND を通る。条件つきの命令は、この AND で条件を足す。' },
    { title: 'JNZ だけは Z と AND を取る', text: 'JNZ の線は、Z を NOT した ¬Z と AND を取ってから PC の Load になる。直前の SUB 12 の結果 2 で Z = 0 なので ¬Z = 1、Load = 1。次の立ち上がりで PC が 0111（7）から 0000 に書き換わり、0 番地へ戻る。' }
  ];
  var STEPS_JNZ1 = [
    { title: 'IR の上位 4 ビットだけを解読する', text: 'IR = 0101 0000（JNZ 0）。解読の入力は上位 4 ビットのオペコード 0101 だけで、下位 4 ビットのオペランド 0000 は解読せず、飛び先の 0 番地として PC の入口へ回す。どのビットをどこへ回すかは、配線の引き方で決め打ちにしてある。' },
    { title: 'NOT で 8 本の線にする', text: 'オペコードの 4 本 b7〜b4 を縦に通し、それぞれを NOT にも通して ¬b7〜¬b4 を作る。0101 なら 1 になるのは b6・b4 と ¬b7・¬b5 の 4 本。どの命令でも、8 本のうちちょうど 4 本が 1 になる。' },
    { title: '命令 1 種類に AND を 1 個', text: '6 個の AND は、命令のビットが 1 の桁は b を、0 の桁は ¬b を入力につないである。JNZ（0101）の AND の入力は ¬b7・b6・¬b5・b4 で、0101 のときだけ 4 本そろって 1。ほかの 5 個は、どれかの入力が 0 なので出力は 0。' },
    { title: 'AND の出力が制御信号になる', text: 'JNZ の線が出す合図は「PC ← 番地」の 1 つだけで、メモリも ALU も使わない。ただし、この線は PC の Load に直接はつながらず、もう 1 つの AND を通る。条件つきの命令は、この AND で条件を足す。' },
    { title: 'JNZ だけは Z と AND を取る', text: 'JNZ の線は、Z を NOT した ¬Z と AND を取ってから PC の Load になる。3 周めの SUB 12 の結果 0 で Z = 1 なので ¬Z = 0、Load = 0。PC はフェッチで進めた 0111（7）のままで、次は 7 番地の HALT を取り出す。' }
  ];

  YT.parts.define('dec', {
    title: '命令の解読',
    layer: 'ronri',
    home: '06-cpu.html#s1',
    lead: 'IR の上位 4 ビットを NOT と AND の配線で 1 本の命令の線に変え、その線が制御信号になる解読の回路を見る。第6章 場面1〜4 の制御装置から、ADD 11・JNZ 0 の値のまま掘る。',
    caption: '図　YT-8 の制御装置の中の解読。上が IR、縦の 8 本が b7〜b4 と NOT した ¬b7〜¬b4、行ごとの AND が命令 1 種類。右は各命令が出す合図と、JNZ の条件の AND。',
    note: 'YT-8 の命令は 6 種類なので AND も 6 個。合図を何拍めに出すかを決める回路、全命令に共通のフェッチの合図、PC の入口で PC + 1 か番地かを選ぶ回路は省いた。可変長の x86-64 では、命令の切れ目を探す所から解読が始まる。',
    steps: function (p) { var k = pick(p); return k === 'jnz1' ? STEPS_JNZ1 : k === 'jnz0' ? STEPS_JNZ0 : k === 'sub' ? STEPS_SUB : STEPS_ADD; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state;
      var ex = st.ex = EX[pick(ctx.params)];
      st.op = ex.ir >> 4; st.isJ = st.op === 5;
      var UX = [70, 106, 142, 178], LX = [242, 278, 314, 350];

      // ---------- 見出しと IR ----------
      S.text(24, 36, '命令の解読', { cls: 't-b t-lg' }, svg);
      S.text(112, 36, 'YT-8 の制御装置の中。第6章 場面2 の命令表を、NOT と AND の配線にしたもの', { cls: 't-xs t-dim' }, svg);
      S.text(28, 87, 'IR', { cls: 't-sm t-b' }, svg);
      S.text(124, 62, 'オペコード（何を）', { cls: 't-c t-xs t-b t-d' }, svg);
      S.text(296, 62, 'オペランド（どこ）', { cls: 't-c t-xs t-dim' }, svg);
      st.cells = UX.concat(LX).map(function (x) { return YT.zoom.bit(svg, x, 82, 32, 28, 15); });
      // オペランドは解読しない: そのまま番地として回す
      st.opdPath = S.path('M242,96 V106 H350 V96 M296,106 V116 H712', {}, svg);
      st.opdBox = S.rect(712, 98, 226, 36, { rx: 5, cls: 'f-in s-rule w1' }, svg);
      st.opdT1 = S.text(722, 113, '', { cls: 't-xs t-b t-mono' }, svg);
      st.opdT2 = S.text(722, 127, '', { cls: 't-xs t-dim' }, svg);

      // ---------- b7〜b4 と、NOT した ¬b7〜¬b4 ----------
      st.lines = []; st.nots = []; st.nlines = []; st.notG = S.g({}, svg);
      UX.forEach(function (x, j) {
        var nx = x + 18;
        st.lines.push(S.path('M' + x + ',96 V470', {}, svg));
        st.nots.push(S.path('M' + x + ',112 H' + nx + ' V118', {}, svg));
        S.circle(x, 112, 3, { cls: 'f-fg' }, svg);
        S.path('M' + (nx - 8) + ',118 L' + (nx + 8) + ',118 L' + nx + ',134 Z', { cls: 'f-sf s-fg w2' }, st.notG);
        S.circle(nx, 139, 4, { cls: 'f-sf s-fg w2' }, st.notG);
        st.nlines.push(S.path('M' + nx + ',143 V470', {}, svg));
        S.text(x, 486, 'b' + (7 - j), { cls: 't-c t-mono t-xs t-dim' }, svg);
        S.text(nx, 486, '¬b' + (7 - j), { cls: 't-c t-mono t-xs t-dim' }, svg);
      });

      // ---------- 合図の表の見出し ----------
      [['番地 ←', 'IR 下位'], ['メモリ', '読め'], ['ALU', '＋ か −'], ['A ←', 'どこから'], ['メモリ', '← A'], ['停止', '']].forEach(function (h, c) {
        S.text(COLS[c], 162, h[0], { cls: 't-c t-xs t-dim' }, svg);
        S.text(COLS[c], 176, h[1], { cls: 't-c t-xs t-dim' }, svg);
      });
      S.text(900, 162, 'PC ←', { cls: 't-c t-xs t-dim' }, svg);
      S.text(900, 176, '番地', { cls: 't-c t-xs t-dim' }, svg);

      // ---------- 命令 1 種類に AND 1 個 ----------
      st.andG = S.g({}, svg);
      st.rows = ISA.map(function (r, k) {
        var p = r[0], name = r[1], cy = 200 + k * 46;
        var hl = S.rect(286, cy - 21, 432, 42, { rx: 5, cls: 'f-e-soft', style: { opacity: 0 } }, svg);
        var taps = [-15, -5, 5, 15].map(function (dy, j) {
          var on1 = p[j] === '1', lx = on1 ? UX[j] : UX[j] + 18;
          var el = S.path('M' + lx + ',' + (cy + dy) + ' H236', {}, svg);
          S.circle(lx, cy + dy, 3, { cls: 'f-fg' }, svg);
          return { el: el, j: j, on1: on1 };
        });
        var gate = S.path('M236,' + (cy - 20) + ' H256 A20,20 0 0 1 256,' + (cy + 20) + ' H236 Z', { cls: 'f-sf s-fg w2' }, st.andG);
        var out = S.path('M276,' + cy + ' H286', {}, svg);
        var nameEl = S.text(292, cy + 4, name, { cls: 't-mono t-sm t-b t-dim' }, svg);
        S.text(346, cy + 4, p, { cls: 't-mono t-xs t-dim' }, svg);
        var toks = SIG[name].map(function (s, c) { return S.text(COLS[c], cy + 4, s, { cls: 't-c t-xs t-dim' }, svg); });
        return { p: p, name: name, cy: cy, hl: hl, taps: taps, gate: gate, out: out, nameEl: nameEl, toks: toks };
      });

      // ---------- JNZ の条件: PC の Load = JNZ の線 AND ¬Z ----------
      // Z はいまのレジスタの値（直前の ADD・SUB の結果）。解読の段階1〜3 は、この条件の回路を薄くしておく
      var jy = st.rows[4].cy;
      st.jLine = S.path('M380,' + jy + ' H756 V' + (jy + 11) + ' H770', {}, svg);
      var gz = st.condG = S.g({}, svg);
      S.text(790, 280, 'ALU の結果が 0 なら 1', { cls: 't-c t-xs t-dim' }, gz);
      S.text(772, 304, 'Z', { cls: 't-end t-sm t-b t-mono' }, gz);
      st.zBox = YT.zoom.bit(gz, 790, 300, 26, 22, 13);
      st.zW = S.path('M790,311 V320', {}, gz);
      S.path('M782,320 L798,320 L790,336 Z', { cls: 'f-sf s-fg w2' }, gz);
      S.circle(790, 340, 4, { cls: 'f-sf s-fg w2' }, gz);
      S.text(806, 333, 'NOT', { cls: 't-xs t-dim t-mono' }, gz);
      st.nzW = S.path('M790,344 V354 H752 V' + (jy - 11) + ' H770', {}, gz);
      S.text(744, 360, '¬Z', { cls: 't-end t-xs t-mono t-dim' }, gz);
      st.jGate = S.path('M770,' + (jy - 20) + ' H790 A20,20 0 0 1 790,' + (jy + 20) + ' H770 Z', { cls: 'f-sf s-fg w2' }, gz);
      st.ldW = S.path('M810,' + jy + ' H900 V450', {}, gz);
      st.ldDot = S.circle(900, jy, 5, {}, gz);
      S.text(864, jy - 8, 'Load', { cls: 't-c t-xs t-mono t-dim' }, gz);
      st.pcBox = S.rect(800, 450, 140, 44, { rx: 5, cls: 'f-in s-rule w1' }, svg);
      S.text(812, 469, 'PC', { cls: 't-sm t-b' }, svg);
      st.pcVal = S.text(930, 469, '', { cls: 't-mono t-sm t-b t-end' }, svg);
      st.pcSub = S.text(812, 486, '', { cls: 't-xs t-dim' }, svg);

      // ---------- いまの解読と凡例 ----------
      S.rect(290, 466, 410, 74, { rx: 6, cls: 'f-sf s-rule w1' }, svg);
      st.s1 = S.text(304, 494, '', { cls: 't-sm t-b' }, svg);
      st.s2 = S.text(304, 516, '', { cls: 't-xs t-dim' }, svg);
      S.line(722, 510, 742, 510, { cls: 's-h w3 round' }, svg);
      S.text(750, 514, '1（高い電位）。0 は灰色', { cls: 't-xs t-dim' }, svg);
      S.text(732, 533, '●', { cls: 't-c t-xs t-e t-b' }, svg);
      S.text(750, 533, '出す合図（制御信号）', { cls: 't-xs t-dim' }, svg);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.notG, { to: '04-ronri.html#s3.2', label: 'NOT（¬b）', at: [220, 126], steps: [2], bridge: '¬b を作る NOT は、NAND の 2 つの入力を束ねて作れる' });
      ctx.mark(st.andG, { to: '04-ronri.html#s3.6', label: '命令ごとの AND', at: [256, 466], steps: [3], bridge: '命令ごとに AND を置く形は、真理値表の 1 になる行ごとに AND を作る積和形' });
      ctx.mark(st.jGate, { to: '04-ronri.html#s3.3', label: 'JNZ と ¬Z の AND', at: [830, 360], steps: [5], bridge: 'PC の Load を作る AND も、NAND の出力を NOT で反転して作れる' });
      // Z の出どころ: JNZ（3 周め）は 1 − 1、JNZ（1 周め）は 3 − 1、SUB 12（1 周め）は直前の ADD 11 の 0 + 3。ADD 11 は自分の 0 + 3 の結果も Z = 0
      if (st.isJ && ex.z) ctx.mark(st.zBox.g, { part: 'alu', step: 4, params: { a: 1, b: 1, op: 'sub' }, label: 'Z', at: [824, 300], steps: [5], bridge: 'Z は ALU が和の 8 本の OR を NOT して作る 1 ビット。1 − 1 = 0 で Z = 1' });
      else if (st.isJ) ctx.mark(st.zBox.g, { part: 'alu', step: 4, params: { a: 3, b: 1, op: 'sub' }, label: 'Z', at: [824, 300], steps: [5], bridge: 'Z は ALU が和の 8 本の OR を NOT して作る 1 ビット。3 − 1 = 2 で Z = 0' });
      else ctx.mark(st.zBox.g, { part: 'alu', step: 4, label: 'Z', at: [824, 300], steps: [5], bridge: 'Z は ALU が和の 8 本の OR を NOT して作る 1 ビット。ADD 11 の 0 + 3 では Z = 0' });
    },
    onStep: function (ctx, i) {
      ctx.state.key = '';
      ctx.state.condG.style.opacity = i >= 3 ? '' : 0.4;   // JNZ の条件は段階4（JNZ の線の行き先）から
    },
    frame: function (ctx) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing, ts = ctx.ts, ex = st.ex;
      // 段階の中の姿: ph は 0 ビット → 1 線 → 2 ゲート → 3 合図 → 4 条件（JNZ の AND）。段階 i では ph = i まで描く
      var a = !run || ts >= 0.5, b = !run || ts >= 1.1;   // 段階の中の 2 つの区切り
      var ph = i, ldOn = i === 4 && b, pcNew = i === 4 && (!run || ts >= 1.7);
      var key = i + ':' + a + ':' + b + ':' + pcNew;
      if (st.key === key) return;
      st.key = key;
      var ir = ex.ir, op = st.op, n = ir & 15, b8 = bits8(ir), lines = ph >= 2 || (ph === 1 && a), gates = ph >= 3 || (ph === 2 && a), sig = ph >= 4 || (ph === 3 && a);
      st.cells.forEach(function (c, k) { c.set(Number(b8[k])); });
      // オペランドの道（段階1 は少し遅れて光る）
      var opd = ph >= 1 || a;
      st.opdPath.setAttribute('class', 'f-none round ' + (opd ? 's-d w2' : 's-dim w15'));
      st.opdBox.setAttribute('class', i === 0 && opd ? 'f-d-soft s-d w15' : 'f-in s-rule w1');
      st.opdT1.textContent = bits4(n) + ' = ' + n + ' 番地';
      st.opdT2.textContent = st.isJ ? '→ PC の入口へ（飛び先。解読しない）' : '→ アドレスバスへ（解読しない）';
      // 縦の 8 本
      st.lines.forEach(function (el, j) {
        var v = (op >> (3 - j)) & 1;
        lvl(el, lines && v); lvl(st.nots[j], lines && v); lvl(st.nlines[j], lines && !v);
      });
      // AND と合図
      st.rows.forEach(function (row) {
        var active = row.p === b8.slice(0, 4);
        row.taps.forEach(function (tp) { var v = (op >> (3 - tp.j)) & 1; lvl(tp.el, lines && ph >= 2 && (tp.on1 ? v : !v)); });
        lvl(row.out, gates && active, 'w3');
        row.gate.setAttribute('class', i === 2 && active && gates ? 'f-x-soft s-x w2' : 'f-sf s-fg w2');
        row.nameEl.setAttribute('class', 't-mono t-sm t-b ' + (gates && active ? 't-h' : 't-dim'));
        row.hl.style.opacity = sig && active ? 1 : 0;
        row.toks.forEach(function (t) { t.setAttribute('class', 't-c t-xs ' + (sig && active ? 't-e t-b' : 't-dim')); });
      });
      // JNZ の条件
      var jOn = sig && st.isJ, ld = st.isJ && !ex.z;
      lvl(st.jLine, jOn, 'w3');
      st.zBox.set(ex.z);   // Z は解読の間も値を保っている（段階1〜3 は回路ごと薄くする）
      lvl(st.zW, ex.z);
      lvl(st.nzW, !ex.z);
      st.jGate.setAttribute('class', i === 4 ? (ldOn && ld ? 'f-x-soft s-x w2' : 'f-sf s-x w2') : 'f-sf s-fg w2');
      lvl(st.ldW, ldOn && ld, 'w3');
      st.ldDot.setAttribute('class', ldOn && ld ? 'f-e' : 'f-in s-dim w1');
      var pcShow = pcNew && ld ? 0 : ex.pc;
      st.pcVal.textContent = bits4(pcShow) + '（' + pcShow + '）';
      st.pcSub.textContent = i < 4 ? 'フェッチで +1 した値' : pcNew ? (ld ? 'Load = 1：0 番地へ' : 'Load = 0：そのまま') : '次の立ち上がりを待つ';
      st.pcBox.setAttribute('class', pcNew && ld ? 'f-x-soft s-x w2' : 'f-in s-rule w1');
      // いまの解読
      var nm = ISA.filter(function (r) { return r[0] === b8.slice(0, 4); })[0][1];
      var s1 = '', s2 = '';
      if (i === 0) { s1 = 'IR = ' + b8.slice(0, 4) + ' ' + b8.slice(4) + '（' + ex.name + '）'; s2 = '上位 ' + b8.slice(0, 4) + ' は解読へ、下位 ' + b8.slice(4) + ' は番地として回す'; }
      else if (i === 1) { s1 = lines ? '1 の線：' + onLines(op).join('・') : 'b7〜b4 と NOT の出力'; s2 = '8 本のうち 4 本が 1'; }
      else if (i === 2) { s1 = gates ? nm + ' の AND だけが 1' : 'AND の入力を照らし合わせる'; s2 = 'ほかの 5 個は入力のどれかが 0'; }
      else if (i === 3) { s1 = sig ? nm + ' の線 → ' + sigList(nm) : nm + ' の線が 1'; s2 = '線のつなぎ先が命令の意味'; }
      else { s1 = 'JNZ の線 ' + (st.isJ ? 1 : 0) + ' AND ¬Z ' + (ex.z ? 0 : 1) + ' → Load = ' + (ld ? 1 : 0); s2 = ld ? (pcNew ? 'PC ← 0000：0 番地へ戻る' : '次の立ち上がりで PC ← 0000') : 'PC は ' + bits4(ex.pc) + '（' + ex.pc + '）のまま'; }
      st.s1.textContent = s1;
      st.s2.textContent = s2;
    }
  });

  /* オペコード op で 1 になる 8 本の名前（b7 から順に） */
  function onLines(op) {
    var out = [];
    for (var j = 0; j < 4; j++) out.push(((op >> (3 - j)) & 1 ? 'b' : '¬b') + (7 - j));
    return out;
  }
  /* 命令が出す合図の一覧（表の見出しの言葉で） */
  function sigList(nm) {
    return { LOAD: '番地・読め・A ← メモリ', ADD: '番地・読め・ALU ＋・A ← ALU', SUB: '番地・読め・ALU −・A ← ALU', STORE: '番地・メモリ ← A', JNZ: 'PC ← 番地（Z の条件つき）', HALT: '停止' }[nm];
  }
})();
