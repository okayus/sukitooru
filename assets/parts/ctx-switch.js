/* ============================================================
   部品 ctx-switch（タスクの切り替え）— assets/parts/ctx-switch.js

   部品 irq-entry（割り込みの入口）と同じ YT-8 の模式で、タイマ割り込みで入ったカーネルが、走っていたタスク A から
   次のタスク B へ CPU を渡すまで。A の PC・SP・FLAGS・汎用レジスタは入口で A のカーネルのスタックに積まれ（pt_regs）、
   schedule() が B を選び、別プロセスなら CR3 を B の表に替え、__switch_to_asm が callee-saved のレジスタを積んで
   SP を A の task_struct（thread.sp）に置き、B の thread.sp を読み込み、B のスタックから戻って B の続きへ。
   使う所: 第9章 場面5 段階2・3（タイマ割り込みとコンテキストスイッチ）。params の next: 'comp' で同じプロセスの
   スレッドへの交代（CR3 を替えない。第9章 場面2 段階2 のスレッドの話）。
   値: 第9章 場面5 の図（レンダラ メイン PID 4188・vruntime 120.0、ネットワーク PID 4133・118.2、合成スレッド PID 4188・
   121.5、1 目盛 1 ms、レンダラ メインは 3 ms 走る、直接の費用は数 µs）、部品 irq-entry（A の PC 0x27・SP 0x78、
   タイマの入口 0xBA〜、A のカーネルのスタックは底 0xE0）。B の番地（PC 0x43・SP 0x5C、スタック 0xC8〜0xCF・底 0xD0）はこの部品で決めた。
   事実は Linux 7.4-rc3 のソースで確かめた（2026-11-18）: kernel/sched/core.c の context_switch（switch_mm_irqs_off の後に
   switch_to）、arch/x86/entry/entry_64.S の __switch_to_asm（rbp・rbx・r12〜r15 を積み、rsp を thread.sp に置き、次の
   thread.sp を読む）、arch/x86/include/asm/switch_to.h の inactive_task_frame、arch/x86/kernel/process_64.c の
   __switch_to、arch/x86/mm/tlb.c の switch_mm_irqs_off（同じ mm なら CR3 を書かない）、arch/x86/include/asm/ptrace.h の
   pt_regs、kernel/sched/fair.c の update_curr・update_deadline、kernel/entry/common.c（戻る手前で schedule()）。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var hx = function (n) { return '0x' + n.toString(16).toUpperCase(); };
  // A の値は部品 irq-entry と同じ。B の番地はこの部品で決めた（8 ビットの模式）
  var A = { pc: 0x27, sp: 0x78, base: 0xE0, ent: 0xBA, tick: 0xBE };
  var B = { pc: 0x43, sp: 0x5C, base: 0xD0 };
  // スタックの 7 段（上から。番地は底 - 7 〜 底 - 1）
  // 戻り番地の段は、割り込みの出口のコードが schedule() を呼んでから __switch_to_asm を呼ぶまでの戻り番地をまとめたもの
  var ROWS = function (pc, sp) { return [['rbp・rbx・r12〜r15', 'switch_to が積む'], ['戻り番地（割り込みの出口へ）', ''], ['汎用レジスタ 15 個', '入口のコード'], ['PC = ' + hx(pc), ''], ['M = 1', 'CPU が積む'], ['FLAGS（IF = 1）', ''], ['SP = ' + hx(sp), '']]; };
  var NEXT = {
    net: { name: 'ネットワーク', pid: 4133, vr: '118.2', pt: 'PID 4133 の表', cr3: '4133 の表', other: 'comp' },
    comp: { name: '合成スレッド', pid: 4188, vr: '121.5', pt: 'A と同じ表（PID 4188）', cr3: '4188 の表', other: 'net' }
  };
  var STEPS_NET = [
    { title: 'タイマ割り込みで A のスタックに積む', text: 'レンダラ メイン（A、PID 4188）の走っている所へタイマの割り込みが来る。CPU が A のカーネルのスタックに SP・FLAGS・M・PC = 0x27 を積み、入口のコードが汎用レジスタを積む（部品「割り込みの入口」と同じ）。A の PC・SP・FLAGS・汎用レジスタは、これで全部 A のスタックにある。' },
    { title: '取り分を使い切ったら印を立てる', text: 'タイマの処理が A の消費時間を足す。A は 3 ms 走り、vruntime が 120.0 から 123.0 になった（第9章 場面5 の図の値）。取り分を使い切ったので交代の印 need_resched を立て、割り込みから戻る手前でこの印を見て `schedule()` を呼ぶ。' },
    { title: 'schedule() が次のタスク B を選ぶ', text: 'ランキューで vruntime が最小の B（ネットワーク、PID 4133、118.2）を選ぶ（第9章 場面5 段階4 の規則）。A は実行可能のままランキューに戻る。ここでは B も実行可能で、前に同じ道で止まったとする。B のスタックにも同じ形の値が積んであり、B の thread.sp がその上端を指す。' },
    { title: 'CR3 を B の表に替える', text: 'A と B は別のプロセスなので、`switch_mm_irqs_off` が CR3 を B のページテーブルの根に書き換える。以後、ユーザーの番地は B の表で引く。カーネルの番地の対応はどのプロセスの表にも同じものが入っているので、走っているカーネルのコードはそのまま続く。' },
    { title: 'SP を入れ替える（switch_to）', text: '`__switch_to_asm` が rbp・rbx・r12〜r15 を A のスタックに積み、SP = 0xD9 を A の thread.sp に置く。B の thread.sp = 0xC9 を SP に読み、B のスタックから同じ 6 個を取り出す。次の割り込みで積む先も B のスタックに替わる。' },
    { title: 'B のスタックから B の続きへ', text: 'B は schedule() の続きから走り、戻り番地で割り込みの出口へ戻って汎用レジスタを戻し、`iretq` を実行する。PC ← 0x43、M ← 1、SP ← 0x5C が入り、B は止まった所から続く。PC は task_struct でなく、B のカーネルのスタックに積んであった。' }
  ];
  var STEPS_COMP = [
    { title: 'タイマ割り込みで A のスタックに積む', text: 'レンダラ メイン（A、PID 4188）の走っている所へタイマの割り込みが来る。CPU が A のカーネルのスタックに SP・FLAGS・M・PC = 0x27 を積み、入口のコードが汎用レジスタを積む（部品「割り込みの入口」と同じ）。A の PC・SP・FLAGS・汎用レジスタは、これで全部 A のスタックにある。' },
    { title: '取り分を使い切ったら印を立てる', text: 'タイマの処理が A の消費時間を足す。A は 3 ms 走り、vruntime が 120.0 から 123.0 になった（第9章 場面5 の図の値）。取り分を使い切ったので交代の印 need_resched を立て、割り込みから戻る手前でこの印を見て `schedule()` を呼ぶ。' },
    { title: 'schedule() が次のタスク B を選ぶ', text: 'ネットワークは待ち（S）でランキューにいない。残るうち vruntime が最小の B（合成スレッド、PID 4188、121.5）を選ぶ。A は実行可能のままランキューに戻る。ここでは B も前に同じ道で止まったとする。B のスタックにも同じ形の値が積んであり、B の thread.sp がその上端を指す。' },
    { title: 'CR3 は替えない（同じプロセス）', text: 'A と B は同じプロセス（PID 4188）のスレッドで、ページテーブルを共有する。`switch_mm_irqs_off` は表が同じなので CR3 を書かず、TLB の控えもそのまま使える。スレッドどうしの交代で替わるのは、スタックとレジスタの組だけ（第9章 場面2）。' },
    { title: 'SP を入れ替える（switch_to）', text: '`__switch_to_asm` が rbp・rbx・r12〜r15 を A のスタックに積み、SP = 0xD9 を A の thread.sp に置く。B の thread.sp = 0xC9 を SP に読み、B のスタックから同じ 6 個を取り出す。次の割り込みで積む先も B のスタックに替わる。' },
    { title: 'B のスタックから B の続きへ', text: 'B は schedule() の続きから走り、戻り番地で割り込みの出口へ戻って汎用レジスタを戻し、`iretq` を実行する。PC ← 0x43、M ← 1、SP ← 0x5C が入り、B は止まった所から続く。PC は task_struct でなく、B のカーネルのスタックに積んであった。' }
  ];

  YT.parts.define('ctx-switch', {
    title: 'タスクの切り替え',
    layer: 'cpu',
    home: '09-os.html#s5',
    lead: 'タイマ割り込みで入ったカーネルが、走っていたタスク A から B へ CPU を渡すまでを、レジスタとメモリの値で見る。第9章 場面5 のタイマ割り込みとコンテキストスイッチから掘る。',
    caption: '図　部品「割り込みの入口」と同じ模式で、2 つのタスクの task_struct・カーネルのスタック・ページテーブルを並べた図。積む値は 1 段に 1 つで、switch_to の 6 個と呼び出しの戻り番地もそれぞれ 1 段にした。',
    note: 'Linux x86-64 では、ユーザーの PC・SP・FLAGS・汎用レジスタは入口でカーネルのスタックに積み（pt_regs）、task_struct にはスタックの上端（thread.sp）を置く。FPU と fs・gs のベースは task_struct 側に置く。',
    steps: function (p) { return p && p.next === 'comp' ? STEPS_COMP : STEPS_NET; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, mk = S.markers(svg);
      var nx = ctx.params && ctx.params.next === 'comp' ? 'comp' : 'net';
      var N = st.N = NEXT[nx];
      st.nx = nx;
      // ---------- CPU ----------
      S.rect(14, 14, 286, 532, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(30, 40, 'CPU', { cls: 't-b t-lg' }, svg);
      S.text(30, 58, 'YT-8 の模式（部品「割り込みの入口」と同じ）', { cls: 't-xs t-dim' }, svg);
      var reg = function (y, name, sub) {
        var g = S.g({}, svg);
        var bg = S.rect(28, y, 258, 48, { rx: 5, cls: 'f-in s-rule w1' }, g);
        S.text(38, y + 20, name, { cls: 't-b t-md' }, g);
        S.text(38, y + 38, sub, { cls: 't-xs t-dim' }, g);
        var val = S.text(276, y + 22, '', { cls: 't-mono t-lg t-b t-end' }, g);
        return { g: g, bg: bg, val: val };
      };
      st.pc = reg(72, 'PC', '次の命令の番地');
      st.m = reg(132, 'M（モード）', '1 = ユーザー ／ 0 = カーネル');
      st.sp = reg(192, 'SP（rsp）', 'スタックのいちばん上の番地');
      st.cr3 = reg(252, 'CR3', 'ページテーブルの根');
      st.gp = reg(312, 'rax・rbx ほか', '汎用レジスタ 15 個');
      S.rect(28, 374, 258, 70, { rx: 5, cls: 'f-sf s-rule w1' }, svg);
      st.s1 = S.text(38, 395, '', { cls: 't-xs t-b' }, svg);
      st.s2 = S.text(38, 413, '', { cls: 't-xs t-dim' }, svg);
      st.s3 = S.text(38, 431, '', { cls: 't-xs t-dim' }, svg);
      S.polygon([[34, 461], [42, 466], [34, 471]], { cls: 'f-x' }, svg);
      S.text(50, 470, 'SP が指す所', { cls: 't-xs t-dim' }, svg);
      S.rect(30, 482, 14, 12, { rx: 2, cls: 'f-x-soft s-x w1' }, svg);
      S.text(50, 492, 'この拍で書き換わる値', { cls: 't-xs t-dim' }, svg);
      S.rect(30, 504, 14, 12, { rx: 2, cls: 'f-d' }, svg);
      S.text(50, 514, '番地・中身（動く札）', { cls: 't-xs t-dim' }, svg);

      // ---------- メモリ ----------
      S.rect(312, 14, 632, 532, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(328, 40, 'メモリ', { cls: 't-b t-lg' }, svg);
      S.text(384, 40, '番地は 8 ビットに縮めた。A は部品「割り込みの入口」と同じ値', { cls: 't-xs t-dim' }, svg);
      // ランキュー
      st.rq = S.rect(324, 52, 608, 62, { rx: 6, cls: 'f-in s-rule w1' }, svg);
      S.text(336, 70, 'コア 0 のランキュー（vruntime の小さい順に選ぶ。第9章 場面5）', { cls: 't-xs t-b' }, svg);
      st.chips = [['A', 'レンダラ メイン（A）', '120.0'], ['net', 'ネットワーク' + (nx === 'net' ? '（B）' : ''), '118.2'], ['comp', '合成スレッド' + (nx === 'comp' ? '（B）' : ''), '121.5']].map(function (c, k) {
        var x = 336 + k * 198;
        return { key: c[0], bg: S.rect(x, 76, 188, 32, { rx: 4, cls: 'f-sf s-rule w1' }, svg), name: S.text(x + 10, 90, c[1], { cls: 't-sm t-b' }, svg), sub: S.text(x + 10, 103, '', { cls: 't-xs t-dim' }, svg), vr: c[2] };
      });
      // A と B の列
      var col = function (x, who, name, pid, pt, pc, sp, base) {
        var c = { x: x, rows: [] };
        c.ts = S.rect(x, 124, 296, 72, { rx: 6, cls: 'f-in s-rule w1' }, svg);
        S.text(x + 12, 142, who + ' の task_struct', { cls: 't-sm t-b' }, svg);
        S.text(x + 284, 142, name + '、PID ' + pid, { cls: 't-xs t-dim t-end' }, svg);
        c.tsp = { bg: S.rect(x + 6, 149, 284, 20, { rx: 3, cls: 'f-none' }, svg) };
        S.text(x + 12, 163, 'thread.sp', { cls: 't-xs t-mono' }, svg);
        c.tsp.val = S.text(x + 284, 163, '', { cls: 't-sm t-mono t-b t-end' }, svg);
        c.nr = { bg: S.rect(x + 6, 171, 284, 20, { rx: 3, cls: 'f-none' }, svg) };
        S.text(x + 12, 185, '交代の印（need_resched）', { cls: 't-xs' }, svg);
        c.nr.val = S.text(x + 284, 185, '0', { cls: 't-sm t-mono t-b t-end' }, svg);
        c.stack = S.rect(x, 206, 296, 206, { rx: 6, cls: 'f-in s-rule w1' }, svg);
        S.text(x + 12, 224, who + ' のカーネルのスタック', { cls: 't-sm t-b' }, svg);
        S.text(x + 24, 402, '底 ' + hx(base) + '（ここから上へ積む）', { cls: 't-xs t-dim' }, svg);
        ROWS(pc, sp).forEach(function (r, k) {
          var y = 246 + k * 22, a = base - 7 + k;
          c.rows.push({ a: a, y: y, txt: r[0], bg: S.rect(x + 18, y - 15, 270, 21, { rx: 3, cls: 'f-none' }, svg),
            b: (S.text(x + 24, y, hx(a), { cls: 't-mono t-xs t-dim' }, svg), S.text(x + 60, y, '', { cls: 't-xs' }, svg)),
            c: S.text(x + 284, y, r[1], { cls: 't-xs t-dim t-end' }, svg) });
        });
        c.ptb = S.rect(x, 422, 296, 50, { rx: 6, cls: 'f-in s-rule w1' }, svg);
        S.text(x + 12, 440, who + ' のページテーブル', { cls: 't-sm t-b' }, svg);
        S.text(x + 284, 440, pt, { cls: 't-xs t-end' }, svg);
        S.text(x + 12, 460, 'ユーザーの番地の対応（第9章 場面4）', { cls: 't-xs t-dim' }, svg);
        S.rect(x, 482, 296, 52, { rx: 6, cls: 'f-in s-rule w1' }, svg);
        S.text(x + 12, 500, who + ' のユーザーのコード', { cls: 't-sm t-b' }, svg);
        c.code = S.rect(x + 18, 507, 270, 21, { rx: 3, cls: 'f-none' }, svg);
        S.text(x + 24, 522, hx(pc), { cls: 't-mono t-xs t-dim' }, svg);
        S.text(x + 60, 522, '（' + who + ' の次の命令）', { cls: 't-xs' }, svg);
        return c;
      };
      st.A = col(324, 'A', 'レンダラ メイン', 4188, 'PID 4188 の表', A.pc, A.sp, A.base);
      st.B = col(636, 'B', N.name, N.pid, N.pt, B.pc, B.sp, B.base);
      st.A.mark = S.polygon([[328, -5], [336, 0], [328, 5]], { cls: 'f-x' }, svg);
      st.B.mark = S.polygon([[640, -5], [648, 0], [640, 5]], { cls: 'f-x' }, svg);
      // 移す道（SP → A.thread.sp、B.thread.sp → SP、B の表 → CR3）
      st.arrSave = S.path('M286,206 H304 V159 H322', { cls: 'f-none s-x w2 fade hide', 'marker-end': mk('x') }, svg);
      st.arrLoad = S.path('M636,159 H628 V201 H309 V228 H290', { cls: 'f-none s-x w2 fade hide', 'marker-end': mk('x') }, svg);
      st.arrCr3 = S.path('M636,447 H628 V417 H296 V276 H290', { cls: 'f-none s-x w2 fade hide', 'marker-end': mk('x') }, svg);
      var pulse = function (w) {
        var g = S.g({ style: { display: 'none' } }, svg);
        S.rect(-w / 2, -10, w, 20, { rx: 4, cls: 'f-d' }, g);
        var tx = S.text(0, 4, '', { cls: 't-c t-mono t-xs t-b t-sf' }, g);
        g.put = function (s, pathEl, f) { if (s == null) { g.style.display = 'none'; return; } tx.textContent = s; g.style.display = ''; S.place(g, pathEl, f); };
        return g;
      };
      st.pv = pulse(76);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.A.stack, { part: 'irq-entry', step: 3, params: { src: 'timer' }, label: 'タイマの入口', at: [604, 210], steps: [1], bridge: 'A のスタックに積むのは、タイマの割り込みで CPU と入口のコードがする仕事' });
      ctx.mark(st.cr3.bg, { part: 'mmu-walk', step: 2, label: 'CR3', at: [150, 252], steps: [4], bridge: 'CR3 を B の表に替えると、MMU はその値から 1 段目の表（PML4）を読み始める' });
      ctx.mark(st.sp.bg, { to: '05-kioku.html#s3.5', label: 'SP', at: [150, 192], steps: [5], bridge: 'SP も D フリップフロップの束。書き換えた次の拍から別のスタックを指す' });
      ctx.mark(st.B.stack, { part: 'irq-entry', step: 5, params: { src: 'timer' }, label: 'iretq', at: [916, 210], steps: [6], bridge: 'B に戻る iretq も、割り込みから戻るときと同じく積んだ 4 つを読む' });
    },
    onStep: function (ctx) {
      ctx.state.ph = -1;   // frame が段階の中の場面（ph）を描き直す
    },
    frame: function (ctx) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing, ts = ctx.ts, N = st.N, net = st.nx === 'net';
      var SEQ = [[1.0, 0.6, 0.6, 0.6, 0.6, 0.9, 2.6], [1.4, 1.2, 2.8], [0.9, 1.4, 1.0, 2.6], [1.2, 1.0, 2.8], [1.0, 1.0, 1.2, 1.0, 2.6], [0.9, 0.9, 1.2, 1.0, 2.6]];
      var SETTLED = [6, 2, 3, 2, 4, 4];
      var q = U.seq(ts, SEQ[i], true), ph = run ? q.i : SETTLED[i], f = run ? q.f : 1;
      // 既定（段階の初めより前の姿から段階ごとに進める）
      var m = { pc: hx(A.pc), M: 1, sp: hx(A.sp), cr3: '4188 の表', gp: 'A の値', aFill: 0, aPop: 0, bPop: 0, aTsp: '—', nr: 0, vrA: '120.0', chosen: false, aState: '実行中', flash: [], hl: [], arr: [], s1: '', s2: '', s3: '', edge: false };
      var pv = null;
      if (i >= 1) { m.aFill = 5; m.sp = hx(0xDB); m.M = 0; m.pc = hx(A.tick); m.gp = 'カーネル（A）'; }
      if (i >= 2) { m.vrA = '123.0'; m.nr = 1; m.pc = '…'; }
      if (i >= 3) { m.aFill = 6; m.sp = hx(0xDA); m.nr = 0; m.chosen = true; m.aState = '実行可能'; }
      if (i >= 4 && net) m.cr3 = N.cr3;
      if (i >= 5) { m.aFill = 7; m.aTsp = hx(0xD9); m.sp = hx(0xCA); m.bPop = 1; m.gp = 'カーネル（B）'; m.arr = ['save', 'load']; }
      if (i === 0) {
        if (ph === 0) {
          m.hl = ['codeA'];
          m.s1 = 'A（レンダラ メイン）を実行中';
          m.s2 = 'タイマの割り込み（ベクタ 236）が来る';
        } else if (ph <= 4) {
          var k = ph - 1;
          m.aFill = k + (f >= 0.6 ? 1 : 0);
          m.sp = hx(0xDF - k);
          m.edge = f >= 0.6;
          m.s1 = 'CPU が A のスタックに積む';
          m.s2 = hx(0xDF - k) + ' ← ' + ['SP = 0x78', 'FLAGS（IF = 1）', 'M = 1', 'PC = 0x27'][k];
        } else {
          var e5 = ph > 5 || f >= 0.4;
          m.aFill = e5 ? 5 : 4; m.sp = hx(e5 ? 0xDB : 0xDC); m.M = 0; m.pc = hx(A.ent); m.gp = e5 ? 'カーネル（A）' : 'A の値';
          m.edge = e5;
          if (ph === 5 && run && f < 0.4) m.flash = ['pc', 'm'];
          if (!run) m.flash = ['pc', 'm', 'sp'];
          m.s1 = ph === 5 ? 'タイマの入口 ' + hx(A.ent) + ' へ。M = 0' : 'PC・SP・FLAGS・汎用は A のスタックに';
          m.s2 = ph === 5 ? '入口のコードが汎用レジスタを積む' : 'SP = 0xDB、PC = ' + hx(A.ent) + '（タイマの入口）';
        }
      } else if (i === 1) {
        m.hl = ['chipA'];
        if (ph === 0) {
          m.vrA = f >= 0.5 || !run ? '123.0' : '120.0'; m.nr = 0; m.edge = f >= 0.5;
          m.s1 = 'A は 3 ms 走った（1 目盛 1 ms）';
          m.s2 = 'vruntime 120.0 → 123.0';
        } else {
          m.vrA = '123.0'; m.nr = 1; m.hl = ['chipA', 'nrA'];
          m.s1 = ph === 1 ? '取り分を使い切った' : '割り込みから戻る手前で印を見る';
          m.s2 = ph === 1 ? '交代の印 need_resched = 1' : '→ schedule() を呼ぶ';
        }
        if (!run) { m.s1 = '取り分を使い切り、交代の印を立てた'; m.s2 = '戻る手前で schedule() を呼ぶ'; }
      } else if (i === 2) {
        if (ph === 0) {
          m.aFill = 5 + (f >= 0.6 ? 1 : 0); m.sp = hx(f >= 0.6 ? 0xDA : 0xDB); m.chosen = false; m.aState = '実行中'; m.nr = 1; m.edge = f >= 0.6;
          m.s1 = 'schedule() を呼ぶ';
          m.s2 = '戻り番地を積む。SP = ' + (f >= 0.6 ? '0xDA' : '0xDB');
        } else {
          m.aFill = 6; m.sp = hx(0xDA);
          if (ph >= 2 || !run) m.nr = 0;   // __schedule() は次を選んだ後、context_switch の前に印を消す
          m.chosen = ph >= 2 || !run; m.hl = ['chip' + st.nx];
          if (m.chosen) m.aState = '実行可能';
          if (ph >= 2 || !run) m.hl.push('tsB');
          m.s1 = ph === 1 ? 'vruntime が最小のタスクを選ぶ' : 'B ＝ ' + N.name + '（PID ' + N.pid + '）';
          m.s2 = ph === 1 ? (net ? 'ネットワーク 118.2 が最小' : '合成スレッド 121.5（ネットワークは待ち）') : 'A は実行可能のままランキューへ';
          if (ph === 1) { m.chosen = false; m.aState = '実行中'; }
        }
      } else if (i === 3) {
        if (net) {
          var e4 = m.edge = ph >= 2 || (ph === 1 && (f >= 0.25 || !run));
          m.cr3 = e4 ? N.cr3 : '4188 の表';
          m.hl = ['ptB'];
          m.arr = ['cr3'];
          if (ph === 0 && run) pv = [N.cr3, st.arrCr3, f];
          if ((e4 && run && ph === 1 && f < 0.75) || !run) m.flash = ['cr3'];
          m.s1 = 'switch_mm_irqs_off：別のプロセス';
          m.s2 = e4 ? 'CR3 ← B の表（PID 4133）' : 'B のページテーブルの根を読む';
          m.s3 = e4 ? 'カーネルの対応はどの表にもある' : '';
        } else {
          m.hl = ['ptA', 'ptB'];
          m.s1 = 'switch_mm_irqs_off：同じプロセス';
          m.s2 = '表が同じなので CR3 は書かない';
          m.s3 = 'TLB の控えもそのまま使える';
        }
      } else if (i === 4) {
        m.aFill = 6; m.aTsp = '—'; m.sp = hx(0xDA); m.bPop = 0; m.gp = 'カーネル（A）'; m.arr = [];
        if (ph >= 0) { m.aFill = ph === 0 && f < 0.6 && run ? 6 : 7; m.sp = hx(m.aFill === 7 ? 0xD9 : 0xDA); }
        if (ph === 0) {
          m.edge = f >= 0.6;
          m.s1 = '__switch_to_asm：6 個を A に積む';
          m.s2 = 'rbp・rbx・r12〜r15。SP = ' + m.sp;
        } else if (ph === 1) {
          var e1 = f >= 0.6;
          m.aTsp = e1 ? hx(0xD9) : '—'; m.arr = ['save']; m.hl = ['tspA'];
          if (run && !e1) pv = ['0xD9', st.arrSave, f / 0.6];
          m.edge = e1;
          m.s1 = 'SP を A の thread.sp に置く';
          m.s2 = 'A.thread.sp ← 0xD9';
        } else if (ph === 2) {
          var e2 = f >= 0.6;
          m.aTsp = hx(0xD9); m.arr = ['save', 'load']; m.hl = ['tspB'];
          m.sp = e2 ? hx(0xC9) : hx(0xD9);
          if (run && !e2) pv = ['0xC9', st.arrLoad, f / 0.6];
          if (e2 && run) m.flash = ['sp'];
          m.edge = e2;
          m.s1 = 'B の thread.sp を SP に読む';
          m.s2 = 'SP ← 0xC9（ここから B のスタック）';
        } else {
          m.aTsp = hx(0xD9); m.arr = ['save', 'load'];
          var e3 = ph > 3 || f >= 0.5 || !run;
          m.sp = hx(e3 ? 0xCA : 0xC9); m.bPop = e3 ? 1 : 0; m.gp = e3 ? 'カーネル（B）' : 'カーネル（A）';
          m.edge = e3;
          if (!run) m.flash = ['sp', 'gp'];
          m.s1 = ph === 3 ? 'B のスタックから 6 個を取り出す' : 'SP を替えた所から B の流れ';
          m.s2 = ph === 3 ? 'SP = ' + m.sp : 'A.thread.sp = 0xD9、SP = 0xCA';
          m.s3 = '次の割り込みで積む先も B のスタックに';
        }
      } else {
        m.arr = [];
        var bp = 1, sp = 0xCA;
        if (ph >= 1 || (ph === 0 && f >= 0.5)) { bp = 2; sp = 0xCB; }
        if (ph >= 2 || (ph === 1 && f >= 0.5)) { bp = 3; sp = 0xCC; m.gp = 'B の値'; }
        var back = m.edge = ph >= 4 || (ph === 3 && (f >= 0.25 || !run));
        if (back) { bp = 7; m.pc = hx(B.pc); m.M = 1; sp = B.sp; }
        m.bPop = bp; m.sp = hx(sp);
        if (ph === 0) { m.s1 = 'ret：schedule() から割り込みの出口へ'; m.s2 = '戻り番地を取り出す。SP = ' + m.sp; }
        else if (ph === 1) { m.s1 = '割り込みの出口：汎用レジスタを戻す'; m.s2 = 'SP = ' + m.sp; }
        else if (ph === 2) {
          var j = Math.min(3, Math.floor(f * 4));
          m.s1 = 'iretq：積んだ 4 つを読む';
          m.s2 = hx(0xCC + j) + ' → ' + ['PC = 0x43', 'M = 1', 'FLAGS（IF = 1）', 'SP = 0x5C'][j];
          m.hl = ['rowB' + (3 + j)];
        } else if (ph === 3 && !back) { m.s1 = '読んだ 4 つは次の立ち上がりで入る'; m.s2 = 'PC・M・IF・SP'; }
        else if (ph === 3) { m.s1 = '立ち上がりで同時に'; m.s2 = 'PC ← 0x43、M ← 1、SP ← 0x5C'; }
        else { m.s1 = 'B が止まった所（0x43）から続く'; m.s2 = 'PC は B のスタックに積んであった'; m.s3 = '直接の費用は 1 回数 µs（第9章 場面5）'; m.hl = ['codeB']; }
        if ((back && run && ph === 3 && f < 0.75) || !run) m.flash = ['pc', 'm', 'sp'];
        if (back) m.aState = '実行可能';
      }
      // ---------- 描く ----------
      st.pv.put(pv ? pv[0] : null, pv ? pv[1] : st.arrSave, pv ? pv[2] : 0);
      var key = [i, ph, m.edge ? 1 : 0, m.aFill, m.bPop, m.flash.join(','), m.hl.join(','), m.arr.join(','), m.sp, m.s2].join(':');
      if (st.ph === key) return;
      st.ph = key;
      var setReg = function (r, v, big) { r.val.textContent = v; r.val.setAttribute('class', 't-mono t-b t-end ' + (big ? 't-lg' : 't-md')); };
      setReg(st.pc, m.pc, true);
      setReg(st.m, String(m.M), true);
      st.m.val.setAttribute('class', 't-mono t-lg t-b t-end ' + (m.M ? 't-h' : 't-dim'));
      setReg(st.sp, m.sp, true);
      setReg(st.cr3, m.cr3, false);
      setReg(st.gp, m.gp, false);
      ['pc', 'm', 'sp', 'cr3', 'gp'].forEach(function (n) { st[n].bg.setAttribute('class', m.flash.indexOf(n) >= 0 ? 'f-x-soft s-x w2' : 'f-in s-rule w1'); });
      // ランキュー
      st.chips.forEach(function (c) {
        var isB = c.key === st.nx, sleep = c.key === 'net' && !net;
        var vr = c.key === 'A' ? m.vrA : c.vr;
        var state = c.key === 'A' ? m.aState : sleep ? '待ち（S）' : isB && (m.chosen || i >= 3) ? (i === 5 && m.edge ? '実行中' : '次に走る') : '実行可能';
        c.sub.textContent = 'vruntime ' + vr + '・' + state;
        var on = m.hl.indexOf('chip' + c.key) >= 0;
        c.bg.setAttribute('class', on ? 'f-x-soft s-x w15' : sleep ? 'f-in s-rule w1' : 'f-sf s-rule w1');
        c.name.setAttribute('class', 't-sm t-b' + (sleep ? ' t-dim' : ''));
      });
      // task_struct
      st.A.tsp.val.textContent = m.aTsp;
      st.B.tsp.val.textContent = hx(0xC9);
      st.A.nr.val.textContent = String(m.nr);
      st.B.nr.val.textContent = '0';
      st.A.tsp.bg.setAttribute('class', m.hl.indexOf('tspA') >= 0 ? 'f-x-soft' : 'f-none');
      st.B.tsp.bg.setAttribute('class', m.hl.indexOf('tspB') >= 0 ? 'f-x-soft' : 'f-none');
      st.A.nr.bg.setAttribute('class', m.hl.indexOf('nrA') >= 0 ? 'f-x-soft' : 'f-none');
      st.B.ts.setAttribute('class', m.hl.indexOf('tsB') >= 0 ? 'f-in s-x w2' : 'f-in s-rule w1');
      st.A.ptb.setAttribute('class', m.hl.indexOf('ptA') >= 0 ? 'f-x-soft s-x w15' : 'f-in s-rule w1');
      st.B.ptb.setAttribute('class', m.hl.indexOf('ptB') >= 0 ? 'f-x-soft s-x w15' : 'f-in s-rule w1');
      st.A.code.setAttribute('class', m.hl.indexOf('codeA') >= 0 ? 'f-x-soft' : 'f-none');
      st.B.code.setAttribute('class', m.hl.indexOf('codeB') >= 0 ? 'f-x-soft' : 'f-none');
      // スタック：A は底から aFill 段が積まれている。B は 7 段が積んであり、上から bPop 段を取り出した（中身は残るので薄く）
      st.A.rows.forEach(function (r, k) {
        var full = k >= 7 - m.aFill;
        r.b.textContent = full ? r.txt : '';
        r.b.setAttribute('class', 't-xs' + (k >= 3 ? ' t-mono' : ''));
        r.bg.setAttribute('class', full && k === 7 - m.aFill && m.edge && run && (i === 0 || i === 2 || i === 4) ? 'f-x-soft' : 'f-none');
      });
      st.B.rows.forEach(function (r, k) {
        var gone = k < m.bPop;
        r.b.textContent = r.txt;
        r.b.setAttribute('class', 't-xs' + (gone ? ' t-dim' : '') + (k >= 3 && !gone ? ' t-mono' : ''));
        r.bg.setAttribute('class', m.hl.indexOf('rowB' + k) >= 0 ? 'f-x-soft' : 'f-none');
      });
      // SP が指す所
      var spv = parseInt(m.sp, 16);
      [st.A, st.B].forEach(function (c) {
        var r = null;
        c.rows.forEach(function (x) { if (x.a === spv) r = x; });
        if (r) { c.mark.setAttribute('transform', 'translate(0,' + (r.y - 4) + ')'); c.mark.style.display = ''; }
        else c.mark.style.display = 'none';
      });
      S.fade(st.arrSave, m.arr.indexOf('save') >= 0);
      S.fade(st.arrLoad, m.arr.indexOf('load') >= 0);
      S.fade(st.arrCr3, m.arr.indexOf('cr3') >= 0);
      st.s1.textContent = m.s1;
      st.s2.textContent = m.s2;
      st.s3.textContent = m.s3;
    }
  });
})();
