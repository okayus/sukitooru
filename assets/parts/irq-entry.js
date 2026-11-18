/* ============================================================
   部品 irq-entry（割り込みの入口）— assets/parts/irq-entry.js

   部品 cpu-mode と同じ YT-8 の模式（第6章の YT-8 に M などを足したもの）に、FLAGS の IF・スタックポインタ SP・
   IDT の先頭を指す IDTR・ローカル APIC（割り込みコントローラ）を足した図。命令の切れ目で INT と IF を見て、
   IDT から入口を読み、SP をカーネルのスタックに替えて SP・FLAGS・M・PC を積んで入口へ飛び、ハンドラの後 iretq で戻すまで。
   段階の順は SDM の擬似コードの順（IDT の行を読んでから積み、積んだ後に CPL を変える）。
   使う所: 第7章 場面3 段階4・5（キーボード、ベクタ 33）、第9章 場面1 段階3（入口は 3 つ）、
   第9章 場面5 段階2（タイマ割り込み。params の src: 'timer'）。部品 ctx-switch の段階1 がこの部品の timer を指す。
   値: 第7章 場面3（キー A、ベクタ 33、i7 を終えて PC = i8 を保存、EOI、iret、約 1 µs）、第9章 場面5（HZ = 250〜1000、
   レンダラ メイン）、部品 cpu-mode（番地を 8 ビットに縮めた模式。カーネルの 0x80〜0xAF と 0xF0 は cpu-mode が使う）。
   番地の割り当て: i7・i8 は 0x26・0x27、ユーザーのスタック 0x78、ハンドラはキーボード 0xB0〜0xB7・タイマ 0xBA〜0xC1
   （iretq は 2 バイト）、カーネルのスタックは 0xD8〜0xDF（底 0xE0）。部品 ctx-switch の B のスタックは 0xC8〜0xCF（底 0xD0）。
   事実は Intel SDM（Vol. 2 の INT n・IRET の擬似コード、Vol. 3A 6.6・6.8.1・6.14）と Linux 7.4-rc3 のソース
   （arch/x86/include/asm/irq_vectors.h の LOCAL_TIMER_VECTOR = 0xEC、arch/x86/entry/entry_64.S の idtentry・error_entry・
   common_interrupt_return、arch/x86/kernel/apic/apic.c の sysvec_apic_timer_interrupt、arch/x86/kernel/cpu/common.c の
   TSS の sp0、arch/x86/kernel/idt.c の割り込みゲート）で確かめた（2026-11-18）。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var hx = function (n) { return '0x' + n.toString(16).toUpperCase(); };
  var lvl = function (el, v, w) { el.setAttribute('class', 'f-none round ' + (v ? 's-h ' + (w || 'w3') : 's-dim w2')); };
  // 値（番地は 8 ビットの模式）。src ごとに違う所だけ SRC に置く
  var V = { i7: 0x26, i8: 0x27, usp: 0x78, rsp0: 0xE0 };
  var SRC = {
    key: { vec: 33, off: '528', ent: 0xB0, user: [[0x26, 'i7 mul', '第7章の例'], [0x27, 'i8 store', ''], [0x78, '（ユーザーのスタック）', '']], ir: ['mul', '= i7（第7章の命令の列）'],
      hand: [[0xB0, '入口：汎用レジスタを積む'], [0xB2, 'スキャンコードを読み、キューへ'], [0xB4, 'EOI を書き、汎用を戻す'], [0xB6, 'iretq（48 CF）']] },
    timer: { vec: 236, off: '3776', ent: 0xBA, user: [[0x26, '（実行中の命令）', 'レンダラ メイン'], [0x27, '（次の命令）', ''], [0x78, '（ユーザーのスタック）', '']], ir: ['…', '= レンダラ メインの命令'],
      hand: [[0xBA, '入口：汎用レジスタを積む'], [0xBC, 'EOI を書く'], [0xBE, '時刻と消費時間を進め、汎用を戻す'], [0xC0, 'iretq（48 CF）']] }
  };
  // 積む 4 つ（底から）と、入口のコードが積む汎用レジスタ
  var PUSH = [[0xDF, 'SP = 0x78', '0x78'], [0xDE, 'FLAGS（IF = 1）', 'IF=1'], [0xDD, 'M = 1', 'M=1'], [0xDC, 'PC = 0x27', '0x27'], [0xDB, '汎用レジスタ 15 個', '汎用']];
  var STEPS_KEY = [
    { title: '命令の切れ目で INT と IF を見る', text: 'キー A が押されると、ローカル APIC が**ベクタ 33**（第7章 場面3 の例）を用意して CPU の INT を 1 にする。CPU は i7（mul）を終えた切れ目で INT と FLAGS の **IF** を見て、両方 1 なら i8 を取り出さずに割り込みへ移る。' },
    { title: 'IDT の 33 番から入口を読む', text: 'IDTR が指す IDT の 33 番（1 行 16 バイトなので先頭から 528 バイト先）を読み、入口 0xB0 を得る。この手順の IDT・TSS・積む先への読み書きは、M = 1 のままでもカーネルの読み書きとして扱われる。IDT は 256 行あり、番号ごとに別の入口を置ける。' },
    { title: 'スタックを替えて積み、入口へ飛ぶ', text: 'M = 1 からカーネルの入口へ移るので、SP をカーネルのスタックの底 0xE0（TSS の RSP0）に替え、元の SP・FLAGS・M・PC = 0x27 を積む。スタックなので、割り込みが入れ子になっても前の値は消えない。次の拍で PC ← 0xB0、M ← 0、IF ← 0 が入る。' },
    { title: 'ハンドラが装置と話す', text: '入口のコードが汎用レジスタも積み、CPU が積んだ 4 つと合わせて Linux の pt_regs になる。ハンドラはキーボードのデータレジスタからスキャンコードを読み、入力のキューに入れる。APIC に EOI（処理済み）を書くと、APIC は同じ優先度以下の割り込みも CPU に渡せるようになる。' },
    { title: 'iretq でスタックから戻す', text: '汎用レジスタを戻してから `iretq`（48 CF）を実行すると、積んだ逆の順に PC ← 0x27、M ← 1、FLAGS（IF = 1）、SP ← 0x78 が戻り、i8 からユーザーモードで続く。i7 は終えてあるので、やり直さない。' }
  ];
  var STEPS_TIMER = [
    { title: '命令の切れ目で INT と IF を見る', text: 'ローカル APIC の中のタイマが 1〜4 ms ごと（HZ = 250〜1000）に、Linux の**ベクタ 236**（0xEC）で INT を 1 にする。CPU はレンダラ メインの命令を終えた切れ目で INT と FLAGS の **IF** を見て、両方 1 なら割り込みへ移る。合図は CPU の中から来る。' },
    { title: 'IDT の 236 番から入口を読む', text: 'IDTR が指す IDT の 236 番（1 行 16 バイトなので先頭から 3,776 バイト先）を読み、入口 0xBA を得る。この手順の IDT・TSS・積む先への読み書きは、M = 1 のままでもカーネルの読み書きとして扱われる。IDT は 256 行あり、番号ごとに別の入口を置ける。' },
    { title: 'スタックを替えて積み、入口へ飛ぶ', text: 'M = 1 からカーネルの入口へ移るので、SP をカーネルのスタックの底 0xE0（TSS の RSP0）に替え、元の SP・FLAGS・M・PC = 0x27 を積む。積む手順は第7章のキーボードと同じ。次の拍で PC ← 0xBA、M ← 0、IF ← 0 が入る。' },
    { title: 'タイマの処理', text: '入口のコードが汎用レジスタを積む。Linux はまず APIC に EOI を書き、時刻を 1 刻み進め、走っているタスクの消費時間（vruntime）を足す。取り分を使い切っていれば、戻る手前で別のタスクに替える（部品「タスクの切り替え」）。ここでは取り分が残っている。' },
    { title: 'iretq でスタックから戻す', text: '汎用レジスタを戻してから `iretq`（48 CF）を実行すると、積んだ逆の順に PC ← 0x27、M ← 1、FLAGS（IF = 1）、SP ← 0x78 が戻り、同じタスクがユーザーモードで続く。割り込まれたことは、プログラムからは見えない。' }
  ];

  YT.parts.define('irq-entry', {
    title: '割り込みの入口',
    layer: 'cpu',
    home: '07-shuuhen.html#s3',
    lead: '装置やタイマの合図で、CPU が命令の切れ目にカーネルの入口へ飛び、iretq で戻るまでを YT-8 の模式で見る。第7章 場面3 のキーボード（ベクタ 33）と、第9章 場面5 のタイマ割り込みから掘る。',
    caption: '図　部品「CPU のモード」の YT-8 に、IF・SP・IDTR とローカル APIC を足した模式。Linux では CPU が積む先は CPU ごとの trampoline スタックで、入口のコードがタスクのカーネルのスタックへ写す。',
    note: '積む値は 1 段に 1 つの模式。実物は SS・RSP・RFLAGS・CS・RIP を 8 バイトずつ積み、M は CS の下位 2 ビット。FRED を備えた CPU では Linux 7.1 以降の既定で IDT を引かずに 1 つの入口へ飛び、ERETU で戻る。',
    steps: function (p) { return p && p.src === 'timer' ? STEPS_TIMER : STEPS_KEY; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, mk = S.markers(svg);
      var src = ctx.params && ctx.params.src === 'timer' ? 'timer' : 'key';
      var P = st.P = SRC[src];
      st.src = src;
      // ---------- 枠とバス ----------
      S.rect(14, 14, 638, 452, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(30, 40, 'CPU', { cls: 't-b t-lg' }, svg);
      S.text(72, 40, 'YT-8（第6章）に M・IF・SP・IDTR・ローカル APIC を足した模式', { cls: 't-xs t-dim' }, svg);
      S.rect(664, 14, 280, 532, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(680, 40, 'メモリ', { cls: 't-b t-lg' }, svg);
      S.text(736, 40, '番地は 8 ビットに縮めた', { cls: 't-xs t-dim' }, svg);
      S.path('M462,80 H664', { cls: 'f-none s-rule w4' }, svg);
      S.path('M664,132 H462', { cls: 'f-none s-rule w4' }, svg);
      S.text(570, 68, 'アドレスバス（番地）', { cls: 't-c t-xs t-dim' }, svg);
      S.text(570, 154, 'データバス（中身）', { cls: 't-c t-xs t-dim' }, svg);
      st.pathA = S.path('M500,80 H640', { cls: 'f-none s-none' }, svg);
      st.pathD = S.path('M636,132 H506', { cls: 'f-none s-none' }, svg);
      st.pathW = S.path('M506,132 H636', { cls: 'f-none s-none' }, svg);

      // ---------- レジスタ（中の列。並びは部品 cpu-mode と同じ位置） ----------
      var reg = function (y, h, name, sub) {
        var g = S.g({}, svg);
        var bg = S.rect(246, y, 216, h, { rx: 5, cls: 'f-in s-rule w1' }, g);
        S.text(256, y + 19, name, { cls: 't-b t-md' }, g);
        var sb = S.text(256, y + 36, sub, { cls: 't-xs t-dim' }, g);
        var val = S.text(452, y + 20, '', { cls: 't-mono t-lg t-b t-end' }, g);
        return { g: g, bg: bg, sub: sb, val: val };
      };
      st.pc = reg(58, 44, 'PC', '次の命令の番地');
      st.ir = reg(110, 44, 'IR', '');
      st.sp = reg(162, 44, 'SP（rsp）', 'スタックのいちばん上の番地');
      st.fl = reg(214, 44, 'FLAGS の IF', '1 ならマスクできる割り込みを受け付ける');
      st.idtr = reg(266, 44, 'IDTR', '入口の表 IDT の先頭');
      st.idtr.val.textContent = 'IDT';
      st.idtr.val.setAttribute('class', 't-mono t-md t-b t-end');
      st.m = reg(322, 58, 'M（モード）', '1 = ユーザー ／ 0 = カーネル');
      st.m.val.setAttribute('y', 362);
      st.m.val.setAttribute('class', 't-mono t-xl t-b t-end');
      S.path('M246,364 L256,370 L246,376 Z', { cls: 'f-fg' }, st.m.g);   // クロック入力の印（第5章の D フリップフロップと同じ）

      // ---------- 制御装置（左の列）：割り込みのときに出す合図の 4 つ ----------
      st.ctrl = S.rect(30, 58, 196, 204, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(42, 80, '制御装置', { cls: 't-b t-md' }, svg);
      S.text(42, 97, '命令の切れ目ごとに INT を見る', { cls: 't-xs t-dim' }, svg);
      st.dec = [['切れ目で INT を見る', 'INT と IF が 1 なら受け付け'], ['IDT の ' + P.vec + ' 番を読む', '入口の番地を得る'], ['スタックに積んで飛ぶ', 'PC ← 入口、M ← 0、IF ← 0'], ['iretq（48 CF）', 'PC・M・FLAGS・SP を戻す']].map(function (r, k) {
        var y = 106 + k * 39;
        return { bg: S.rect(38, y, 180, 35, { rx: 4, cls: 'f-sf s-rule w1' }, svg), a: S.text(46, y + 15, r[0], { cls: 't-sm t-b' }, svg), b: S.text(46, y + 29, r[1], { cls: 't-xs t-dim' }, svg) };
      });
      // 凡例
      S.line(38, 290, 58, 290, { cls: 's-h w3 round' }, svg);
      S.text(66, 294, '1（高い電位）の線。0 は灰色', { cls: 't-xs t-dim' }, svg);
      S.line(38, 312, 58, 312, { cls: 's-e w2' }, svg);
      S.text(66, 316, '装置からの合図（電気信号）', { cls: 't-xs t-dim' }, svg);
      S.rect(38, 326, 20, 12, { rx: 2, cls: 'f-d' }, svg);
      S.text(66, 336, '番地・中身', { cls: 't-xs t-dim' }, svg);
      S.polygon([[42, 348], [50, 353], [42, 358]], { cls: 'f-x' }, svg);
      S.text(66, 357, 'SP が指す所', { cls: 't-xs t-dim' }, svg);
      // クロック・いまの動作
      S.rect(30, 392, 196, 56, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(42, 412, 'クロック', { cls: 't-b t-sm' }, svg);
      st.clk = S.path('', { cls: 'f-none s-e w2 round' }, svg);
      S.rect(246, 392, 216, 56, { rx: 5, cls: 'f-sf s-rule w1' }, svg);
      st.s1 = S.text(256, 413, '', { cls: 't-xs t-b' }, svg);
      st.s2 = S.text(256, 433, '', { cls: 't-xs t-dim' }, svg);

      // ---------- 受け付けの判定（右の列）：受け付け = INT AND IF ----------
      S.text(560, 180, '受け付けの判定', { cls: 't-c t-sm t-b' }, svg);
      S.text(560, 196, '命令の切れ目ごと', { cls: 't-c t-xs t-dim' }, svg);
      st.wIF = S.path('M462,236 H522', {}, svg);
      S.text(480, 228, 'IF', { cls: 't-xs t-b t-mono' }, svg);
      st.wINT = S.path('M502,312 V256 H522', {}, svg);
      S.text(508, 292, 'INT', { cls: 't-xs t-b t-mono' }, svg);
      st.gAcc = S.path('M522,226 H540 A20,20 0 0 1 540,266 H522 Z', { cls: 'f-sf s-fg w2' }, svg);
      S.text(537, 250, 'AND', { cls: 't-c t-xs t-mono t-dim' }, svg);
      st.wAcc = S.path('M560,246 H590', {}, svg);
      st.accBit = YT.zoom.bit(svg, 606, 246, 26, 22, 13);
      S.text(606, 226, '受け付け', { cls: 't-c t-xs t-b' }, svg);
      S.text(606, 276, '→ 制御装置', { cls: 't-c t-xs t-dim' }, svg);

      // ---------- ローカル APIC と、外の装置 ----------
      st.apic = S.rect(482, 312, 158, 82, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(494, 332, 'ローカル APIC', { cls: 't-sm t-b' }, svg);
      S.text(494, 348, '割り込みコントローラ', { cls: 't-xs t-dim' }, svg);
      st.tmr = S.rect(584, 318, 48, 20, { rx: 4, cls: 'f-sf s-rule w1' }, svg);
      S.text(608, 332, 'タイマ', { cls: 't-c t-xs' }, svg);
      st.vecTxt = S.text(494, 378, '', { cls: 't-xs t-mono t-b' }, svg);
      st.wIRQ = S.path('M560,482 V394', { cls: 'f-none s-dim w15' }, svg);
      S.circle(560, 466, 4, { cls: 'f-sf s-fg w15' }, svg);   // CPU の割り込みの端子
      st.irqLbl = S.text(568, 444, 'IRQ1', { cls: 't-xs t-mono t-e' }, svg);
      st.dev = S.rect(482, 482, 170, 60, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      st.devG = S.g({}, svg);
      S.text(494, 502, 'キーボード（PS/2）', { cls: 't-sm t-b' }, st.devG);
      S.text(494, 520, 'I/O APIC を通って IRQ1', { cls: 't-xs t-dim' }, st.devG);
      S.text(494, 536, 'データレジスタにスキャンコード', { cls: 't-xs t-dim' }, st.devG);
      st.pIRQ = S.path('M560,482 V394', { cls: 'f-none s-none' }, svg);
      st.pulse = S.circle(560, 482, 6, { cls: 'f-e glow', style: { opacity: 0 } }, svg);

      // ---------- syscall（部品 cpu-mode）と比べる表（CPU の下） ----------
      st.cmp = [['合図', 'INT 端子', '命令'], ['入口', 'IDT[' + P.vec + ']', 'LSTAR'], ['戻り先', 'スタック', 'rcx'], ['戻る', 'iretq', 'sysret']].map(function (c, k) {
        var x = 96 + k * 92;
        var bg = S.rect(x - 6, 480, 86, 62, { rx: 4, cls: 'f-none' }, svg);
        S.text(x, 496, c[0], { cls: 't-xs t-dim' }, svg);
        S.text(x, 516, c[1], { cls: 't-xs t-b t-mono' }, svg);
        S.text(x, 536, c[2], { cls: 't-xs t-dim t-mono' }, svg);
        return bg;
      });
      st.cmpBox = S.rect(14, 478, 456, 66, { rx: 6, cls: 'f-none s-rule w1' }, svg);
      S.text(22, 516, '割り込み', { cls: 't-xs t-b' }, svg);
      S.text(22, 536, 'syscall', { cls: 't-xs t-dim' }, svg);

      // ---------- メモリ：ユーザーのページ・IDT・ハンドラ・カーネルのスタック ----------
      st.rows = {};
      var page = function (y, h, title, us) {
        S.rect(676, y, 256, h, { rx: 6, cls: 'f-in s-rule w1' }, svg);
        S.text(688, y + 20, title, { cls: 't-sm t-b' }, svg);
        S.rect(864, y + 7, 60, 20, { rx: 4, cls: 'f-sf s-rule w1' }, svg);
        S.text(894, y + 21, 'U/S = ' + us, { cls: 't-c t-xs t-mono t-b' }, svg);
      };
      var row = function (y, key, a, b, c) {
        var r = { bg: S.rect(688, y - 15, 238, 21, { rx: 3, cls: 'f-none' }, svg), y: y };
        r.a = S.text(694, y, a, { cls: 't-mono t-xs t-dim' }, svg);
        r.b = S.text(728, y, b, { cls: b.charAt(0) === '（' || b.length > 9 ? 't-xs' : 't-mono t-sm' }, svg);
        r.c = S.text(920, y, c || '', { cls: 't-xs t-dim t-end' }, svg);
        st.rows[key] = r;
        return r;
      };
      page(52, 98, 'ユーザーのページ', 1);
      P.user.forEach(function (u, k) { row(96 + k * 22, u[0], hx(u[0]), u[1], u[2]); });
      page(160, 378, 'カーネルのページ', 0);
      S.text(688, 204, 'IDT（256 行 × 16 B）', { cls: 't-xs t-b' }, svg);
      st.idtBox = S.rect(684, 208, 246, 46, { rx: 4, cls: 'f-none s-rule w1 dash' }, svg);
      row(226, 'v33', '33', '0xB0', 'キーボード（第7章の例）');
      row(248, 'v236', '236', '0xBA', 'タイマ（Linux）');
      S.text(688, 276, '割り込みハンドラ', { cls: 't-xs t-b' }, svg);
      P.hand.forEach(function (h, k) { row(298 + k * 22, h[0], hx(h[0]), h[1]); });
      S.text(688, 392, 'カーネルのスタック', { cls: 't-xs t-b' }, svg);
      st.stackBox = S.rect(684, 396, 246, 114, { rx: 4, cls: 'f-none s-rule w1 dash' }, svg);
      PUSH.slice().reverse().forEach(function (p, k) { row(414 + k * 22, p[0], hx(p[0]), '', k === 0 ? '入口のコード' : k === 2 ? 'CPU が積む' : ''); });
      st.botTxt = S.text(688, 526, '底 0xE0 ＝ TSS の RSP0。上へ積む', { cls: 't-xs t-dim' }, svg);
      st.spMark = S.polygon([[678, -5], [686, 0], [678, 5]], { cls: 'f-x' }, svg);

      // ---------- 動く札（番地・中身） ----------
      var pulse = function (w) {
        var g = S.g({ style: { display: 'none' } }, svg);
        S.rect(-w / 2, -10, w, 20, { rx: 4, cls: 'f-d' }, g);
        var tx = S.text(0, 4, '', { cls: 't-c t-mono t-xs t-b t-sf' }, g);
        g.put = function (s, pathEl, f) { if (s == null) { g.style.display = 'none'; return; } tx.textContent = s; g.style.display = ''; S.place(g, pathEl, f); };
        return g;
      };
      st.pA = pulse(72);
      st.pD = pulse(84);
      st.pW = pulse(84);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.apic, { to: '07-shuuhen.html#s3.3', label: 'ローカル APIC', at: [646, 306], steps: [1], bridge: 'ベクタの番号は、OS が出どころごとに決め、割り込みコントローラに設定してある' });
      ctx.mark(st.gAcc, { to: '04-ronri.html#s3.3', label: '受け付けの AND', at: [548, 214], steps: [1], bridge: '受け付けの AND は、NAND の出力を NOT で反転した論理ゲート' });
      ctx.mark(st.cmpBox, { part: 'cpu-mode', step: 3, label: 'syscall と比べる', at: [458, 488], steps: [1, 2, 3], bridge: 'syscall では、命令を解読した拍で PC・戻り先・M が同時に変わる' });
      ctx.mark(st.sp.bg, { to: '05-kioku.html#s3.5', label: 'SP', at: [372, 162], steps: [5], bridge: 'SP も PC と同じく D フリップフロップの束。積む・取り出すたびに番地を書き換える' });
      ctx.mark(st.stackBox, { to: '06-cpu.html#s1.4', label: 'スタックへの書き込み', at: [924, 384], steps: [3], bridge: 'スタックに積むのはメモリへの書き込み。番地と値をバスに出して「書け」と合図する' });
      ctx.mark(st.idtBox, { part: 'mem-read', step: 2, label: 'IDT の読み出し', at: [924, 200], steps: [2], bridge: 'IDT の行を読むのもメモリの読み出し。番地をデコーダが 1 本の行に変える（例は YT-8）' });
      ctx.mark(st.m.bg, { to: '05-kioku.html#s2.3', label: 'M', at: [440, 322], steps: [3, 5], bridge: 'M は D フリップフロップ 1 個。クロックの立ち上がりの瞬間だけ値を取り込む' });
      ctx.mark(st.cmpBox, { part: 'cpu-mode', step: 5, label: 'sysret と比べる', at: [458, 488], steps: [5], bridge: 'sysret は戻り先を rcx から読み、PC と M を同じ拍で戻す' });

      // 変わらない札（src で決まるもの）
      var key = src === 'key';
      st.devG.style.opacity = key ? 1 : 0.4;
      st.dev.style.opacity = key ? 1 : 0.4;
      st.irqLbl.setAttribute('class', 't-xs t-mono ' + (key ? 't-e' : 't-dim'));
    },
    onStep: function (ctx) {
      ctx.state.ph = -1;   // frame が段階の中の場面（ph）を描き直す
    },
    frame: function (ctx) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing, ts = ctx.ts, P = st.P, key = st.src === 'key';
      // 段階の中の場面 ph と、その中の進み f。止めているときは段階の要点の姿（SETTLED）
      var SEQ = [[1.4, 1.2, 1.6, 2.6], [1.6, 3.0], [0.9, 0.8, 0.8, 0.8, 0.8, 1.0, 2.8], [1.0, 1.4, 1.2, 2.6], [1.0, 1.0, 1.4, 1.0, 2.6]];
      var SETTLED = [2, 1, 6, 3, 4];
      var q = U.seq(ts, SEQ[i], true), ph = run ? q.i : SETTLED[i], f = run ? q.f : 1;
      drawClock(st, run ? ts : 0, i === 2 || i === 4);   // 立ち上がりでレジスタに書く段階（積んで飛ぶ・iretq）
      var vec = P.vec, ent = P.ent, iretAt = P.hand[3][0];
      // 既定（段階の初め）の姿
      var m = { pc: hx(V.i8), ir: P.ir, sp: hx(V.usp), IF: 1, M: 1, INT: 0, dec: -1, cmp: -1, hl: [], filled: 0, popped: 0, flash: [], vecTxt: '', tmr: false, dev: false, apic: false, edge: false, s1: '', s2: '' };
      var addr = null, data = null, wdata = null, irqF = -1;
      if (i === 0) {
        m.cmp = 0;
        m.hl = [V.i7];
        if (ph === 0) {
          if (key) irqF = f; else m.tmr = f > 0.5;
          m.s1 = key ? 'i7（mul）を実行中' : 'レンダラ メインの命令を実行中';
          m.s2 = key ? 'キー A が押され、IRQ1 が来る' : 'APIC のタイマが時刻に達する';
        } else {
          m.INT = 1; m.tmr = !key; m.apic = true;
          m.vecTxt = 'ベクタ ' + vec + ' → INT';
          if (ph === 1) { m.s1 = 'APIC が INT を 1 にした'; m.s2 = key ? '条件はそろった。i7 の終わりを待つ' : '条件はそろった。命令の終わりを待つ'; }
          else { m.dec = 0; m.hl = [V.i8]; m.s1 = '命令の切れ目：INT = 1、IF = 1'; m.s2 = key ? 'i8 を取り出さずに割り込みへ' : '次の命令を取り出さずに割り込みへ'; }
        }
      } else if (i === 1) {
        // IDT の行を読む。割り込みの手順の IDT・TSS の読み出しは CPL によらずカーネルの読み出し（SDM Vol. 3A 4.6.1）
        m.cmp = 1; m.dec = 1; m.vecTxt = 'ベクタ ' + vec + ' を処理中';
        m.hl = ['v' + vec];
        if (ph === 0) {
          if (run) { if (f < 0.5) addr = ['IDT+' + P.off, f * 2]; else data = [hx(ent), (f - 0.5) * 2]; }
          m.s1 = 'IDT の先頭 + ' + vec + ' × 16 = ' + P.off;
          m.s2 = 'IDT の ' + vec + ' 番 → 入口 ' + hx(ent);
        } else {
          m.s1 = '入口 ' + hx(ent) + ' を読んだ';
          m.s2 = 'IDT は M = 1 でもカーネルとして読む';
        }
      } else if (i === 2) {
        // スタックを替えて 4 つを積み（ph 0〜4）、次の立ち上がりで入口へ飛ぶ（ph 5・6）
        m.cmp = 2; m.dec = 2; m.vecTxt = 'ベクタ ' + vec + ' を処理中';
        if (ph === 0) {
          m.edge = !run || f >= 0.4;
          m.sp = m.edge ? hx(V.rsp0) : hx(V.usp);
          if (m.edge && run && f < 0.7) m.flash = [st.sp];
          m.s1 = 'カーネルへ移るので、スタックを替える';
          m.s2 = m.edge ? 'SP ← 0xE0（TSS の RSP0）' : 'TSS の RSP0 を読む';
        } else if (ph <= 4) {
          var k = ph - 1, pk = PUSH[k];
          m.sp = hx(V.rsp0 - k - 1);
          m.filled = k + (f >= 0.6 ? 1 : 0);
          if (run && f < 0.6) { addr = [hx(pk[0]), f / 0.6]; wdata = [pk[2], f / 0.6]; }
          m.edge = f >= 0.6;
          m.s1 = '積む ' + (k + 1) + ' 個め（SP を 1 減らして書く）';
          m.s2 = hx(pk[0]) + ' ← ' + pk[1];
        } else {
          m.filled = 4; m.sp = hx(0xDC);
          var after = m.edge = ph >= 6 || (ph === 5 && (f >= 0.25 || !run));
          if (after) { m.pc = hx(ent); m.M = 0; m.IF = 0; m.hl = [ent]; }
          if (ph === 5) {
            if (after && run && f < 0.75) m.flash = [st.pc, st.m, st.fl];
            m.s1 = after ? '立ち上がりで同時に' : '4 つを積んだ（SP = 0xDC）';
            m.s2 = after ? 'PC ← ' + hx(ent) + '、M ← 0、IF ← 0' : '次の立ち上がりで入口へ';
          } else {
            if (run && f < 0.5) addr = [hx(ent), f * 2];
            if (!run) m.flash = [st.pc, st.m, st.fl];
            m.s1 = '次の拍から ' + hx(ent) + ' をカーネルモードで';
            m.s2 = 'ここまで約 1 µs（第7章）';
          }
        }
      } else if (i === 3) {
        m.M = 0; m.IF = 0; m.filled = 4; m.sp = hx(0xDC); m.ir = ['…', '= ハンドラの命令'];
        m.vecTxt = 'ベクタ ' + vec + ' を処理中';
        var eoiAt = key ? 2 : 1;
        if (ph >= 0) {
          m.pc = hx(P.hand[Math.min(ph, 2)][0]);
          m.hl = [P.hand[Math.min(ph, 2)][0]];
        }
        if (ph === 0) {
          m.edge = f >= 0.6;
          m.filled = 4 + (f >= 0.6 ? 1 : 0);
          m.sp = f >= 0.6 ? hx(0xDB) : hx(0xDC);
          if (run && f < 0.6) { addr = [hx(0xDB), f / 0.6]; wdata = ['汎用', f / 0.6]; }
          m.s1 = '入口のコードが汎用レジスタを積む';
          m.s2 = 'CPU の 4 つと合わせて pt_regs';
        } else {
          m.filled = 5; m.sp = hx(0xDB);
          if (ph >= eoiAt) m.vecTxt = 'EOI を受けた';
          m.apic = ph === eoiAt || (!run && ph >= eoiAt);
          if (key) {
            m.dev = ph === 1;
            m.s1 = ph === 1 ? 'スキャンコードを読む' : 'APIC に EOI を書く';
            m.s2 = ph === 1 ? '入力のキューに入れる' : 'APIC は次の割り込みを渡せる';
          } else {
            m.s1 = ph === 1 ? 'まず APIC に EOI を書く' : '時刻を 1 刻み進め、';
            m.s2 = ph === 1 ? 'APIC は次の割り込みを渡せる' : '消費時間を足す（取り分は残る）';
          }
        }
      } else {
        m.cmp = 3; m.vecTxt = 'EOI を受けた';
        var back = m.edge = ph >= 4 || (ph === 3 && (f >= 0.25 || !run));
        m.M = back ? 1 : 0; m.IF = back ? 1 : 0;
        m.pc = back ? hx(V.i8) : ph === 0 ? hx(P.hand[2][0]) : hx(ph === 1 && f < 0.5 && run ? iretAt : iretAt + 2);
        m.sp = back ? hx(V.usp) : hx(ph === 0 && f < 0.5 ? 0xDB : 0xDC);
        m.filled = ph === 0 && f < 0.5 ? 5 : 4;
        m.popped = back ? 5 : (ph === 0 && f < 0.5 ? 0 : 1);
        m.ir = ph >= 2 || (ph === 1 && f >= 0.5) ? ['48 CF', '= iretq'] : ['…', '= ハンドラの命令'];
        m.dec = ph >= 1 ? 3 : -1;
        m.hl = back ? [V.i8] : [ph === 0 ? P.hand[2][0] : iretAt];
        if (ph === 0) {
          if (run) data = ['汎用', f];
          m.s1 = '汎用レジスタを戻す';
          m.s2 = f < 0.5 && run ? 'SP = 0xDB' : 'SP = 0xDC';
        } else if (ph === 1) {
          if (run) { if (f < 0.5) addr = [hx(iretAt), f * 2]; else data = ['48 CF', (f - 0.5) * 2]; }
          m.s1 = 'フェッチ：' + hx(iretAt) + ' の 48 CF を IR へ';
          m.s2 = '解読：48 CF = iretq';
        } else if (ph === 2) {
          var j = Math.min(3, Math.floor(f * 4)), pj = PUSH[3 - j];
          if (run) { var g = f * 4 - j; if (g < 0.5) addr = [hx(pj[0]), g * 2]; else data = [pj[2], (g - 0.5) * 2]; }
          m.s1 = 'スタックから 4 つを読む（積んだ逆の順）';
          m.s2 = hx(pj[0]) + ' → ' + pj[1];
        } else {
          if (back && run && ph === 3 && f < 0.75) m.flash = [st.pc, st.m, st.fl, st.sp];
          if (!run) m.flash = [st.pc, st.m, st.fl, st.sp];
          if (ph === 3 && !back) { m.s1 = '読んだ 4 つは次の立ち上がりで入る'; m.s2 = 'PC・M・IF・SP'; }
          else if (ph === 3) { m.s1 = '立ち上がりで同時に'; m.s2 = 'PC ← 0x27、M ← 1、IF ← 1、SP ← 0x78'; }
          else { m.s1 = key ? 'i8（0x27）からユーザーモードで続く' : '同じタスクが 0x27 から続く'; m.s2 = 'プログラムは割り込みに気づかない'; }
        }
      }
      // ---------- 描く ----------
      st.pA.put(addr ? addr[0] : null, st.pathA, addr ? addr[1] : 0);
      st.pD.put(data ? data[0] : null, st.pathD, data ? data[1] : 0);
      st.pW.put(wdata ? wdata[0] : null, st.pathW, wdata ? wdata[1] : 0);
      if (irqF >= 0) { var pt = S.along(st.pIRQ, irqF); st.pulse.setAttribute('cx', pt.x); st.pulse.setAttribute('cy', pt.y); st.pulse.style.opacity = 1; }
      else st.pulse.style.opacity = 0;
      // 文字と色は見た目が変わったときだけ書き換える。edge と行の数を鍵に入れ、時刻が飛んでも書き換えを落とさない
      var keyStr = [i, ph, m.edge ? 1 : 0, m.filled, m.popped, m.flash.length, irqF >= 0 ? 1 : 0, m.tmr ? 1 : 0, m.apic ? 1 : 0, m.s1, m.s2].join(':');
      if (st.ph === keyStr) return;
      st.ph = keyStr;
      st.pc.val.textContent = m.pc;
      st.ir.val.textContent = m.ir[0];
      st.ir.sub.textContent = m.ir[1];
      st.sp.val.textContent = m.sp;
      st.fl.val.textContent = String(m.IF);
      st.fl.val.setAttribute('class', 't-mono t-lg t-b t-end ' + (m.IF ? 't-h' : 't-dim'));
      st.m.val.textContent = String(m.M);
      st.m.val.setAttribute('class', 't-mono t-xl t-b t-end ' + (m.M ? 't-h' : 't-dim'));
      [st.pc, st.ir, st.sp, st.fl, st.idtr, st.m].forEach(function (r) { r.bg.setAttribute('class', m.flash.indexOf(r) >= 0 ? 'f-x-soft s-x w2' : 'f-in s-rule w1'); });
      if (i === 1) st.idtr.bg.setAttribute('class', 'f-x-soft s-x w2');
      st.dec.forEach(function (d, k) {
        var on = k === m.dec;
        d.bg.setAttribute('class', on ? 'f-e-soft s-e w15' : 'f-sf s-rule w1');
        d.a.setAttribute('class', 't-sm t-b ' + (on ? 't-e' : ''));
      });
      st.cmp.forEach(function (c, k) { c.setAttribute('class', k === m.cmp ? 'f-x-soft' : 'f-none'); });
      for (var r in st.rows) {
        var rw = st.rows[r], keyHl = m.hl.indexOf(isNaN(Number(r)) ? r : Number(r)) >= 0;
        rw.bg.setAttribute('class', keyHl ? 'f-x-soft' : 'f-none');
      }
      // カーネルのスタックの行：底から filled 個が積まれ、上から popped 個は戻した（中身は残るので薄く）
      PUSH.forEach(function (p, k) {
        var rw = st.rows[p[0]], full = k < m.filled, gone = k >= 5 - m.popped && m.popped > 0;
        rw.b.textContent = full || gone ? p[1] : '';
        rw.b.setAttribute('class', (gone ? 't-xs t-dim' : 't-xs') + (k < 4 && !gone ? ' t-mono' : ''));
        if (full && !gone && k === m.filled - 1 && run && m.edge && (i === 2 ? ph >= 1 && ph <= 4 : i === 3)) rw.bg.setAttribute('class', 'f-x-soft');
      });
      // SP が指す所
      var spv = parseInt(m.sp, 16), sr = st.rows[spv];
      var my = sr ? sr.y - 4 : spv === V.rsp0 ? 522 : null;
      if (my != null) { st.spMark.setAttribute('transform', 'translate(0,' + my + ')'); st.spMark.style.display = ''; }
      else st.spMark.style.display = 'none';
      // 受け付けの判定: 受け付け = INT AND IF
      var acc = m.INT && m.IF ? 1 : 0;
      lvl(st.wIF, m.IF); lvl(st.wINT, m.INT); lvl(st.wAcc, acc);
      st.accBit.set(acc);
      st.gAcc.setAttribute('class', i === 0 ? 'f-sf s-x w2' : 'f-sf s-fg w2');
      st.vecTxt.textContent = m.vecTxt;
      st.apic.setAttribute('class', m.apic ? 'f-x-soft s-x w15' : 'f-in s-rule w1');
      st.tmr.setAttribute('class', m.tmr ? 'f-x-soft s-x w15' : 'f-sf s-rule w1');
      st.wIRQ.setAttribute('class', 'f-none ' + (irqF >= 0 ? 's-e w3' : 's-dim w15'));
      st.dev.setAttribute('class', m.dev ? 'f-x-soft s-x w15' : 'f-in s-rule w1');
      st.s1.textContent = m.s1;
      st.s2.textContent = m.s2;
    }
  });

  /* クロックの波形（部品 cpu-mode と同じ形）。on の段階は e の色にする */
  function drawClock(st, t, on) {
    var x0 = 100, x1 = 214, yH = 404, yL = 436, w = 14;
    var off = U.mod(t / 1.4, 1) * 2 * w, pts = [];
    for (var xs = x0 - 2 * w - off; xs < x1 + 2 * w; xs += 2 * w) pts.push([xs, yL], [xs, yH], [xs + w, yH], [xs + w, yL]);
    st.clk.setAttribute('d', pts.map(function (p, k) { return (k ? 'L' : 'M') + U.clamp(p[0], x0, x1).toFixed(1) + ',' + p[1]; }).join(''));
    st.clk.setAttribute('class', 'f-none round ' + (on ? 's-e w2' : 's-dim w15'));
  }
})();
