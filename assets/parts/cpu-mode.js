/* ============================================================
   部品 cpu-mode（CPU のモード）— assets/parts/cpu-mode.js

   第6章の YT-8 に、モードのビット M（D フリップフロップ 1 個）、入口のレジスタ（x86-64 の IA32_LSTAR に当たる）、
   戻り先のレジスタ（rcx に当たる）と、メモリの照らし合わせの回路（M と U/S）を足した模式図。
   第9章 場面1・3 の「CPU がモードを切り替える」の下の層として、掘り下げの板（YT.drill）に出す。
   値は第9章 場面3 と同じ（rax = 45 は recvfrom、fd 23、戻り値 1452）。番地は 8 ビットに縮めた。
   事実は Intel SDM（SYSCALL・SYSRET・WRMSR の項、Vol. 3A 4.6 のアクセス権）で確かめた（2026-11-17）。
   FRED は Intel の FRED 仕様（346446-009）8.4 と、Linux 7.1 のコミット「x86/fred: Enable FRED by default」で確かめた。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var hx = function (n) { return '0x' + n.toString(16).toUpperCase(); };
  // 値（第9章 場面3 と同じ。番地は 8 ビットの模式）
  var V = { nr: 45, fd: 23, ret: 1452, sys: 0x1A, next: 0x1C, entry: 0x80, sysret: 0xF0 };
  var INS = { movA: ['B8 2D 00 00 00', 'mov eax, 45'], movD: ['BF 17 00 00 00', 'mov edi, 23'], sys: ['0F 05', 'syscall'], wr: ['0F 30', 'wrmsr'], ret: ['48 0F 07', 'sysret'] };
  var lvl = function (el, v, w) { el.setAttribute('class', 'f-none round ' + (v ? 's-h ' + (w || 'w3') : 's-dim w2')); };
  var sig = function (el, on) { el.setAttribute('class', 'f-none ' + (on ? 's-e w2 dash' : 's-dim w1 dash')); };

  YT.parts.define('cpu-mode', {
    title: 'CPU のモード',
    layer: 'cpu',
    home: '06-cpu.html#s3',
    caption: '図　第6章の YT-8 に、モードのビット M、入口と戻り先のレジスタ、メモリの照らし合わせの回路を足した模式図。U/S はページの印。syscall が RFLAGS を r11 に写すなど、x86 のほかの動作は省いた。',
    note: 'x86-64 のモードは CS の下位 2 ビット（CPL。カーネル 0、ユーザー 3）で、ここでは 1 ビットにした。FRED を備えた CPU では Linux 7.1 以降の既定で入口が IA32_FRED_CONFIG、戻りが ERETU になり、戻り先はスタックに積む。',
    steps: [
      { title: 'M：いまのモードを覚える 1 ビット', text: '第6章の YT-8 に、1 ビットのレジスタ **M** を足す。M = 1 ならユーザーモード、0 ならカーネルモード。中身は D フリップフロップ 1 個で、ほかのレジスタと同じクロックで書き換わる。M の出力は制御装置とメモリの照らし合わせに配られ、命令ごとに「いま何をしてよいか」を決める。' },
      { title: '入口のレジスタはカーネルモードでだけ書ける', text: '入口の番地を置く**入口**のレジスタ（x86-64 では MSR の IA32_LSTAR）は `wrmsr` 命令で書く。Load は「wrmsr を解読した」と「M = 0」の AND。M = 1 で実行すると CPU は例外（#GP）でカーネルへ移る。カーネルは起動時に entry_SYSCALL_64 の番地を書く。' },
      { title: 'syscall：3 つのレジスタが同じ拍で変わる', text: '`syscall`（0F 05）も、ほかの命令と同じく PC の番地から取り出して IR で解読する（第6章 場面3）。実行の拍の立ち上がりで、PC ← 入口、戻り先 ← 次の命令の番地、M ← 0 が同時に入る。次の拍からは、入口の命令をカーネルモードで取り出す。番号 45 は A（rax）に置いたまま。' },
      { title: 'メモリに触れるたびに照らし合わせる', text: '読み書きのたびに、M と、触れる番地のページの **U/S** の印（第9章 場面4 のページテーブルの 1 ビット）を NOT と AND で照らし合わせる。M = 1（ユーザー）で U/S = 0（カーネル用）のページに触れると出力が 1 になり、CPU は命令を止めてページフォールト（#PF）でカーネルへ移る。' },
      { title: 'sysret で戻る', text: 'カーネルは戻り値 1452 を A（rax）に置き、`sysret` を実行する。実行の拍で PC ← 戻り先、M ← 1 が同時に入り、syscall の次の命令へユーザーモードで戻る。sysret も M = 0 でだけ動く。M を 0 にするのは、syscall・割り込み・例外など、決まった入口へ飛ぶ仕組みだけ。' }
    ],
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, mk = S.markers(svg);
      // ---------- 枠とバス（照らし合わせの回路＝MMU も CPU の中。第9章 場面4） ----------
      S.rect(14, 14, 638, 532, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(30, 40, 'CPU', { cls: 't-b t-lg' }, svg);
      S.text(72, 40, 'YT-8（第6章）に M・入口・戻り先・照らし合わせを足した模式', { cls: 't-xs t-dim' }, svg);
      S.rect(664, 14, 280, 532, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(680, 40, 'メモリ', { cls: 't-b t-lg' }, svg);
      S.text(736, 40, '番地は 8 ビットに縮めた', { cls: 't-xs t-dim' }, svg);
      S.path('M462,80 H664', { cls: 'f-none s-rule w4' }, svg);
      S.path('M664,132 H462', { cls: 'f-none s-rule w4' }, svg);
      S.text(570, 68, 'アドレスバス（番地）', { cls: 't-c t-xs t-dim' }, svg);
      S.text(570, 154, 'データバス（中身）', { cls: 't-c t-xs t-dim' }, svg);
      st.pathA = S.path('M478,80 H648', { cls: 'f-none s-none' }, svg);
      st.pathD = S.path('M648,132 H478', { cls: 'f-none s-none' }, svg);

      // ---------- レジスタ（右の列） ----------
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
      st.a = reg(162, 44, 'A（rax）', 'システムコールの番号・戻り値');
      st.ret = reg(214, 44, '戻り先（rcx）', 'syscall の次の命令の番地');
      st.ent = reg(266, 44, '入口（LSTAR）', 'カーネルの入口の番地');
      st.m = reg(322, 58, 'M（モード）', '1 = ユーザー ／ 0 = カーネル');
      st.m.val.setAttribute('y', 362);
      st.m.val.setAttribute('class', 't-mono t-xl t-b t-end');
      S.path('M246,364 L256,370 L246,376 Z', { cls: 'f-fg' }, st.m.g);   // クロック入力の印（第5章の D フリップフロップと同じ）
      // 移す道（段階2 は起動時の wrmsr の間、段階3・5 は実行の拍の立ち上がりから出す）
      st.arrWr = S.path('M462,190 H470 V292 H465', { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, svg);
      st.arrEnt = S.path('M246,288 H236 V80 H243', { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, svg);
      st.arrRet = S.path('M462,94 H470 V227 H465', { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, svg);
      st.arrBack = S.path('M462,227 H470 V94 H465', { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, svg);

      // ---------- 制御装置（左の列） ----------
      st.ctrl = S.rect(30, 58, 196, 206, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(42, 80, '制御装置', { cls: 't-b t-md' }, svg);
      S.text(42, 97, 'IR を解読し、Load を出す', { cls: 't-xs t-dim' }, svg);
      st.dec = [['wrmsr（0F 30）', '入口 ← A（M = 0 のときだけ）'], ['syscall（0F 05）', 'PC ← 入口、戻り先 ← 次、M ← 0'], ['sysret（48 0F 07）', 'PC ← 戻り先、M ← 1']].map(function (r, k) {
        var y = 108 + k * 51;
        return { bg: S.rect(38, y, 180, 46, { rx: 4, cls: 'f-sf s-rule w1' }, svg), a: S.text(46, y + 18, r[0], { cls: 't-mono t-sm t-b' }, svg), b: S.text(46, y + 36, r[1], { cls: 't-xs t-dim' }, svg) };
      });

      // ---------- 入口の書き込みの門（段階2）：Load = wrmsr AND ¬M ----------
      st.wWr = S.path('M66,264 V291 H122', {}, svg);
      S.text(72, 284, 'wrmsr', { cls: 't-xs t-mono t-dim' }, svg);
      st.gWr = S.path('M122,282 H138 A18,18 0 0 1 138,318 H122 Z', { cls: 'f-sf s-fg w2' }, svg);
      st.wNM1 = S.path('M300,380 V392 H100 V352', {}, svg);
      S.path('M92,352 H108 L100,336 Z', { cls: 'f-sf s-fg w2' }, svg);
      S.circle(100, 332, 4, { cls: 'f-sf s-fg w2' }, svg);
      S.text(84, 348, 'NOT', { cls: 't-xs t-dim t-mono t-end' }, svg);
      st.wNM2 = S.path('M100,328 V309 H122', {}, svg);
      st.wLd = S.path('M156,300 H246', {}, svg);
      S.text(201, 293, 'Load', { cls: 't-c t-xs t-mono' }, svg);
      st.gp = S.text(36, 446, 'M = 1 なら #GP（例外）でカーネルへ', { cls: 't-xs t-x t-b fade hide' }, svg);

      // ---------- 照らし合わせ（中の列）：違反 = M AND ¬U/S ----------
      S.text(570, 214, '照らし合わせ', { cls: 't-c t-sm t-b' }, svg);
      S.text(570, 230, '読み書きのたび（MMU）', { cls: 't-c t-xs t-dim' }, svg);
      st.cM = S.path('M462,351 H550 V372', {}, svg);
      S.text(506, 344, 'M', { cls: 't-c t-xs t-b t-mono' }, svg);
      st.cU1 = S.path('M664,290 H570 V300', {}, svg);
      S.path('M562,300 H578 L570,316 Z', { cls: 'f-sf s-fg w2' }, svg);
      S.circle(570, 320, 4, { cls: 'f-sf s-fg w2' }, svg);
      st.cU2 = S.path('M570,324 V372', {}, svg);
      st.cAnd = S.path('M540,372 H580 V384 A20,20 0 0 1 540,384 Z', { cls: 'f-sf s-fg w2' }, svg);
      S.text(526, 392, 'AND', { cls: 't-xs t-dim t-mono t-end' }, svg);
      st.cOut = S.path('M560,404 V421', {}, svg);
      st.uBit = YT.zoom.bit(svg, 620, 290, 26, 22, 13);
      S.text(620, 272, 'U/S', { cls: 't-c t-xs t-b t-mono' }, svg);
      S.text(620, 316, 'ページの印', { cls: 't-c t-xs t-dim' }, svg);
      st.cBit = YT.zoom.bit(svg, 560, 432, 26, 22, 13);
      S.text(580, 436, '違反', { cls: 't-xs t-b' }, svg);
      st.cTxt = S.text(570, 470, '', { cls: 't-c t-xs t-b' }, svg);
      st.cTxt2 = S.text(570, 486, '', { cls: 't-c t-xs t-dim' }, svg);

      // ---------- クロック・いまの動作・凡例 ----------
      S.rect(30, 474, 196, 56, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(42, 494, 'クロック', { cls: 't-b t-sm' }, svg);
      st.clk = S.path('', { cls: 'f-none s-e w2 round' }, svg);
      S.rect(246, 402, 216, 56, { rx: 5, cls: 'f-sf s-rule w1' }, svg);
      st.s1 = S.text(256, 423, '', { cls: 't-xs t-b' }, svg);
      st.s2 = S.text(256, 443, '', { cls: 't-xs t-dim' }, svg);
      S.line(252, 482, 272, 482, { cls: 's-h w3 round' }, svg);
      S.text(280, 486, '1（高い電位）の線。0 は灰色', { cls: 't-xs t-dim' }, svg);
      S.line(252, 502, 272, 502, { cls: 's-e w2 dash' }, svg);
      S.text(280, 506, '制御信号（命令の解読から）', { cls: 't-xs t-dim' }, svg);
      S.rect(252, 515, 20, 12, { rx: 2, cls: 'f-d' }, svg);
      S.text(280, 525, '番地・中身', { cls: 't-xs t-dim' }, svg);

      // ---------- メモリの 2 つのページ ----------
      st.rows = {};
      var page = function (y, h, title, us) {
        S.rect(676, y, 256, h, { rx: 6, cls: 'f-in s-rule w1' }, svg);
        S.text(688, y + 20, title, { cls: 't-sm t-b' }, svg);
        S.rect(864, y + 7, 60, 20, { rx: 4, cls: 'f-sf s-rule w1' }, svg);
        S.text(894, y + 21, 'U/S = ' + us, { cls: 't-c t-xs t-mono t-b' }, svg);
      };
      var row = function (y, r) {
        st.rows[r[0]] = S.rect(682, y - 16, 244, 24, { rx: 3, cls: 'f-none' }, svg);
        S.text(690, y, hx(r[0]), { cls: 't-mono t-xs t-dim' }, svg);
        S.text(724, y, r[1], { cls: r[1].charAt(0) === '（' ? 't-xs' : 't-mono t-sm' }, svg);
        if (r[2]) S.text(920, y, r[2], { cls: 't-xs t-dim t-end' }, svg);
      };
      page(56, 190, 'ユーザーのページ', 1);
      page(262, 270, 'カーネルのページ', 0);
      [[0x10, 'mov eax, 45', '45 = recvfrom'], [0x15, 'mov edi, 23', 'fd 23'], [V.sys, 'syscall', '0F 05'], [V.next, '（次の命令）', '戻り先']].forEach(function (r, k) { row(102 + k * 34, r); });
      [[V.entry, 'entry_SYSCALL_64', '入口'], [0x84, '（レジスタを保存）', ''], [0x90, '（システムコール表）', '45 → recvfrom'], [0xA0, 'sys_recvfrom', 'fd 23 を読む'], [V.sysret, 'sysret', '48 0F 07']].forEach(function (r, k) { row(308 + k * 34, r); });

      // ---------- 動く札（番地・中身） ----------
      var pulse = function (w) {
        var g = S.g({ style: { display: 'none' } }, svg);
        S.rect(-w / 2, -10, w, 20, { rx: 4, cls: 'f-d' }, g);
        var tx = S.text(0, 4, '', { cls: 't-c t-mono t-xs t-b t-sf' }, g);
        g.put = function (s, pathEl, f) { if (s == null) { g.style.display = 'none'; return; } tx.textContent = s; g.style.display = ''; S.place(g, pathEl, f); };
        return g;
      };
      st.pA = pulse(48);
      st.pD = pulse(84);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.m.bg, { to: '05-kioku.html#s2.3', label: 'M', at: [440, 322], bridge: 'M は D フリップフロップ 1 個。クロックの立ち上がりの瞬間だけ値を取り込む' });
      ctx.mark(st.ret.bg, { to: '05-kioku.html#s3.2', label: '戻り先・PC', at: [398, 214], steps: [3, 5], bridge: '戻り先も PC も、Load = 1 の拍だけ取り込む D フリップフロップの束' });
      ctx.mark(st.gWr, { to: '04-ronri.html#s3.3', label: '入口の門（AND）', at: [160, 280], steps: [2], bridge: 'NOT と AND は、どちらも NAND を組み合わせて作れる' });
      ctx.mark(st.cAnd, { to: '04-ronri.html#s3.3', label: '照らし合わせの AND', at: [596, 374], steps: [4], bridge: 'NOT と AND は、どちらも NAND を組み合わせて作れる' });
      ctx.mark(st.ctrl, { to: '06-cpu.html#s1.5', label: '制御装置', at: [212, 62], steps: [3, 5], bridge: 'syscall も sysret も、第6章の解読と同じく AND と NOT の配線で 1 本の合図になる' });
    },
    onStep: function (ctx, i) {
      var st = ctx.state;
      S.fade(st.gp, i === 1);   // 移す道（arrWr・arrEnt・arrRet・arrBack）は frame が段階の中の場面から決める
      st.ent.val.textContent = hx(V.entry);
      st.ret.val.textContent = '—';
      st.a.val.textContent = String(V.nr);
      st.cTxt.textContent = '';
      st.cTxt2.textContent = '';
      st.ph = -1;   // frame が段階の中の場面（ph）を描き直す
    },
    frame: function (ctx, t) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing;
      var ts = ctx.ts;
      // 段階の中の場面 ph と、その中の進み f。止めているときは段階の要点の姿（settled）
      var ph, f = 1, q;
      if (i === 0) { q = U.seq(ts, [1.8, 1.8], true); ph = run ? q.i : 1; f = run ? q.f : 1; }
      else if (i === 1) { q = U.seq(ts, [4, 4], true); ph = run ? q.i : 1; f = run ? q.f : 1; }
      else if (i === 2 || i === 4) { q = U.seq(ts, [0.6, 1.0, 1.0, 1.2, 4.2], true); ph = run ? q.i : 4; f = run ? q.f : 1; }
      else { q = U.seq(ts, [3, 3, 3], true); ph = run ? q.i : 1; f = run ? q.f : 1; }
      drawClock(st, run ? ts : 0, i === 1 || i === 2 || i === 4);   // 立ち上がりで書き込む段階（wrmsr・syscall・sysret）
      var M = 1, pc = '', ir = null, a = V.nr, ret = '—', ent = hx(V.entry), hlRow = null, s1 = '', s2 = '', dec = -1, us = null, viol = null, flash = [];
      var addr = null, data = null, edge = false;   // edge: 段階の中の書き込みの立ち上がりを過ぎたか
      if (i === 0) {
        // ユーザーのプログラムが M = 1 のまま進む
        hlRow = ph === 0 ? 0x10 : 0x15;
        ir = ph === 0 ? INS.movA : INS.movD;
        pc = hx(ph === 0 ? 0x15 : V.sys);
        a = ph === 0 ? '—' : String(V.nr);
        s1 = 'M = 1：ユーザーのプログラムを実行中';
        s2 = 'ふつうの命令では M は変わらない';
      } else if (i === 1) {
        dec = 0;
        ir = INS.wr;
        pc = '…';
        if (ph === 0) {
          M = 0;
          a = hx(V.entry);   // wrmsr は A（x86 では edx:eax）の値を入口へ書く。起動時はカーネルが入口の番地を置く
          edge = !run || f > 0.5;
          ent = edge ? hx(V.entry) : '—';
          if (run && f > 0.5 && f < 0.7) flash.push(st.ent);
          s1 = '起動時（M = 0）：wrmsr で入口を書く';
          s2 = edge ? '入口 ← 0x80（entry_SYSCALL_64）' : 'Load = 1：次の立ち上がりで入る';
        } else {
          M = 1;
          s1 = 'ユーザー（M = 1）が wrmsr を実行';
          s2 = 'Load = 0。入口は変わらず、#GP へ';
        }
      } else if (i === 2) {
        // syscall: フェッチ → 解読 → 実行の拍（PC・戻り先・M が同時に変わる）→ 次の拍からカーネル
        var after = edge = ph >= 3 && (ph > 3 || f >= 0.25 || !run);
        M = after ? 0 : 1;
        pc = after ? hx(V.entry) : (ph >= 2 ? hx(V.next) : hx(V.sys));
        ir = ph >= 2 ? INS.sys : INS.movD;
        ret = after ? hx(V.next) : '—';
        hlRow = after ? V.entry : V.sys;
        dec = ph >= 2 ? 1 : -1;
        if (ph === 1) { addr = f < 0.5 ? [hx(V.sys), f * 2] : null; data = f >= 0.5 ? ['0F 05', (f - 0.5) * 2] : null; }
        if (after && run && ph === 3 && f < 0.75) flash = [st.pc, st.ret, st.m];
        if (!run) flash = [st.pc, st.ret, st.m];
        s1 = ph <= 1 ? 'フェッチ：0x1A の 0F 05 を IR へ' : ph === 2 ? '解読：0F 05 = syscall' : after && ph === 3 ? '実行の拍の立ち上がりで同時に' : '次の拍から 0x80 をカーネルモードで';
        s2 = ph <= 1 ? '同じ拍で PC ← 0x1C（2 バイト進む）' : ph === 2 ? 'Load：PC・戻り先・M' : after && ph === 3 ? 'PC ← 0x80、戻り先 ← 0x1C、M ← 0' : 'PC = 0x80、戻り先 = 0x1C、M = 0';
      } else if (i === 3) {
        // 照らし合わせ: 3 通り（止めているときは違反の場合）
        var cs = [[1, V.next, 1], [1, 0x90, 0], [0, 0x90, 0]][ph];
        M = cs[0]; hlRow = cs[1]; us = cs[2]; viol = M && !us ? 1 : 0;
        pc = '…';   // 触れる番地は命令の中の番地。PC の値とは別
        ir = ['…', '読み書きする命令'];
        addr = run && f < 0.4 ? [hx(cs[1]), f / 0.4] : null;
        s1 = 'M = ' + M + ' で ' + hx(cs[1]) + '（U/S = ' + us + '）に触れる';
        s2 = viol ? '違反 = 1：命令を止めて #PF へ' : '違反 = 0：そのまま読み書きする';
      } else {
        // sysret: フェッチ → 解読 → 実行の拍（PC ← 戻り先、M ← 1）→ 次の拍からユーザー
        var back = edge = ph >= 3 && (ph > 3 || f >= 0.25 || !run);
        M = back ? 1 : 0;
        a = String(V.ret);
        ret = hx(V.next);
        pc = back ? hx(V.next) : (ph >= 2 ? hx(V.sysret + 3) : hx(V.sysret));
        ir = ph >= 2 ? INS.ret : ['…', 'カーネルの処理'];
        hlRow = back ? V.next : V.sysret;
        dec = ph >= 2 ? 2 : -1;
        if (ph === 1) { addr = f < 0.5 ? [hx(V.sysret), f * 2] : null; data = f >= 0.5 ? ['48 0F 07', (f - 0.5) * 2] : null; }
        if (back && run && ph === 3 && f < 0.75) flash = [st.pc, st.m];
        if (!run) flash = [st.pc, st.m];
        s1 = ph <= 1 ? 'フェッチ：0xF0 の 48 0F 07 を IR へ' : ph === 2 ? '解読：48 0F 07 = sysret' : back && ph === 3 ? '実行の拍の立ち上がりで同時に' : '次の拍から 0x1C をユーザーモードで';
        s2 = ph <= 1 ? 'A（rax）= 1452 は戻り値' : ph === 2 ? 'Load：PC・M（M = 0 のときだけ）' : back && ph === 3 ? 'PC ← 0x1C、M ← 1' : 'PC = 0x1C、M = 1';
      }
      // ---------- 描く ----------
      st.pA.put(addr ? addr[0] : null, st.pathA, addr ? addr[1] : 0);
      st.pD.put(data ? data[0] : null, st.pathD, data ? data[1] : 0);
      // 文字と色は見た目が変わったときだけ書き換える（札の位置は上で毎回）。edge を鍵に入れ、時刻が飛んでも書き換えを落とさない
      var key = i + ':' + ph + ':' + (edge ? 1 : 0) + ':' + flash.length;
      if (st.ph === key) return;
      st.ph = key;
      S.fade(st.arrWr, i === 1 && ph === 0);
      S.fade(st.arrEnt, i === 2 && edge);
      S.fade(st.arrRet, i === 2 && edge);
      S.fade(st.arrBack, i === 4 && edge);
      st.pc.val.textContent = pc;
      st.ir.val.textContent = ir ? ir[0] : '';
      st.ir.sub.textContent = ir ? '= ' + ir[1] : 'いま解読している命令';
      st.a.val.textContent = a;
      st.ret.val.textContent = ret;
      st.ent.val.textContent = ent;
      st.m.val.textContent = String(M);
      st.m.val.setAttribute('class', 't-mono t-xl t-b t-end ' + (M ? 't-h' : 't-dim'));
      [st.pc, st.ir, st.a, st.ret, st.ent, st.m].forEach(function (r) { r.bg.setAttribute('class', flash.indexOf(r) >= 0 ? 'f-x-soft s-x w2' : 'f-in s-rule w1'); });
      if (i === 0) st.m.bg.setAttribute('class', 'f-x-soft s-x w2');
      st.dec.forEach(function (d, k) {
        var on = k === dec;
        d.bg.setAttribute('class', on ? 'f-e-soft s-e w15' : 'f-sf s-rule w1');
        d.a.setAttribute('class', 't-mono t-sm t-b ' + (on ? 't-e' : ''));
      });
      for (var r in st.rows) st.rows[r].setAttribute('class', Number(r) === hlRow ? 'f-x-soft' : 'f-none');
      // 入口の門: Load = wrmsr AND ¬M
      var wr = i === 1, ld = wr && !M;
      sig(st.wWr, wr);
      lvl(st.wNM1, M); lvl(st.wNM2, !M); lvl(st.wLd, ld);
      st.gWr.setAttribute('class', wr ? 'f-sf s-x w2' : 'f-sf s-fg w2');
      // 照らし合わせ: 違反 = M AND ¬U/S
      lvl(st.cM, M);
      var chk = i === 3;
      lvl(st.cU1, chk && us === 1); lvl(st.cU2, chk && us === 0);
      lvl(st.cOut, chk && viol === 1);
      st.uBit.set(chk ? us : '?');
      st.cBit.set(chk ? viol : '?');
      st.cAnd.setAttribute('class', chk ? (viol ? 'f-x-soft s-x w2' : 'f-sf s-x w2') : 'f-sf s-fg w2');
      st.cTxt.textContent = chk ? (viol ? '1：#PF でカーネルへ' : '0：そのまま読み書き') : '';
      st.cTxt.setAttribute('class', 't-c t-xs t-b ' + (chk && viol ? 't-x' : ''));
      st.cTxt2.textContent = chk ? 'M = ' + M + '、U/S = ' + us : '';
      st.s1.textContent = s1;
      st.s2.textContent = s2;
    }
  });

  /* クロックの波形（第6章の drawClock と同じ形）。on の段階（2・3・5）は e の色にする */
  function drawClock(st, t, on) {
    var x0 = 100, x1 = 214, yH = 486, yL = 514, w = 14;
    var off = U.mod(t / 1.4, 1) * 2 * w, pts = [];
    for (var xs = x0 - 2 * w - off; xs < x1 + 2 * w; xs += 2 * w) pts.push([xs, yL], [xs, yH], [xs + w, yH], [xs + w, yL]);
    st.clk.setAttribute('d', pts.map(function (p, k) { return (k ? 'L' : 'M') + U.clamp(p[0], x0, x1).toFixed(1) + ',' + p[1]; }).join(''));
    st.clk.setAttribute('class', 'f-none round ' + (on ? 's-e w2' : 's-dim w15'));
  }
})();
