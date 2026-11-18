/* ============================================================
   部品 mmu-walk（ページの表を引く）— assets/parts/mmu-walk.js

   第9章 場面4 の仮想アドレス 0x00007f3a2c41_1b20 を、CPU の MMU が 9・9・9・9・12 ビットに切り、CR3 から 4 段の表
   （PML4・PDPT・PD・PT）を 1 段ずつ読み（項の番地 = 表の先頭 + 番号 × 8）、物理アドレス 0x1a2b4b20 を作って TLB に控える
   までの模式図。表の項の印（P・R/W・U/S・NX）の照らし合わせと #PF、装置の DMA の番地を同じ形の表で変換する IOMMU
   （Intel VT-d）も同じ図で見せる。第9章 場面4・第7章 場面2 段階5・場面4 段階5 の下の層として、掘り下げの板（YT.drill）に出す。
   値: 仮想アドレス・TLB の行（VPN 0x7f3a2c411 → PFN 0x1a2b4 など）・0x7f3a2c43_1000（デマンドページング）は第9章 場面4、
   DMA の番地 0x1000 は第7章 場面4、NIC のレジスタの物理アドレス 0xFEB0_0000 は第7章 場面2。表の先頭の番地と項の中身、
   IOMMU の表、libc のコードと NIC のレジスタ（カーネルが写したページ）の仮想アドレス、装置の番号 03:00.0 は例。
   番号は VA >> 39 & 0x1FF などで計算した（PT の番号は 0x011。docs/log/2026-11-18-p5-mmu-walk.md に計算）。
   params: fault（段階5 で止めたときに見せる照らし合わせの例。'p' 既定・'rw'・'us'・'nx'・'none'）。
   事実は Intel SDM Vol. 3A（253668-093US、2026-09）4.5・5.5・5.6・5.7・5.10、Intel VT-d 仕様 Rev. 5.20（D51397-019）
   3.4・3.5・3.7・6.2.4・7.1〜7.3・9.8、Linux の pgtable_types.h と 5level-paging.rst で確かめた（2026-11-18）。
   仕上げ確認で SDM 093US と VT-d Rev. 3.2（D51397-012）の該当節、Linux の mm.rst・intel/Kconfig・iommu.c を読み直した。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var hx = function (n, d) { var s = n.toString(16); while (s.length < d) s = '0' + s; return '0x' + s; };
  var bin = function (n, d) { var s = n.toString(2); while (s.length < d) s = '0' + s; return s; };
  var pa = function (pfn, off) { return hx(pfn * 4096 + (off || 0), 8); };   // ページの番号（と中の位置）から物理アドレス
  var COL = [160, 316, 472, 628, 784], CW = 130;                             // 4 段の表と物理ページの列
  var NAMES = ['① PML4', '② PDPT', '③ PD', '④ PT'];
  var FIELDS = [['PML4 の番号', '47–39'], ['PDPT の番号', '38–30'], ['PD の番号', '29–21'], ['PT の番号', '20–12'], ['オフセット', '11–0']];
  // 引く番地。base は各段の表の先頭のページの番号、next は項の中身（次の表か物理ページの番号）。miss は項が無い段
  var CPU = { lbl: '仮想アドレス', va: '0x00007f3a2c41_1b20', idx: [0x0fe, 0x0e8, 0x162, 0x011], off: 0xb20,
    base: [0x05d27, 0x0b8e1, 0x13f6a, 0x0e0c9], next: [0x0b8e1, 0x13f6a, 0x0e0c9, 0x1a2b4],
    fl: ['P1 RW1 US1 NX0', 'P1 RW1 US1 NX0', 'P1 RW1 US1 NX0', 'P1 RW1 US1 NX1'], miss: -1 };
  var CPU2 = { lbl: CPU.lbl, va: '0x00007f3a2c41_1b28', idx: CPU.idx, off: 0xb28, base: CPU.base, next: CPU.next, fl: CPU.fl, miss: -1 };
  var NIC = { lbl: 'NIC の DMA の番地', va: '0x1000', idx: [0, 0, 0, 1], off: 0,
    base: [0x2b7c4, 0x31a09, 0x0f6d2, 0x2e815], next: [0x31a09, 0x0f6d2, 0x2e815, 0x3d0e2], fl: ['R1 W1', 'R1 W1', 'R1 W1', 'R1 W1'], miss: -1 };
  var BAD = { lbl: NIC.lbl, va: '0x1a2b4b20', idx: [0, 0, 0x0d1, 0x0b4], off: 0xb20,
    base: [0x2b7c4, 0x31a09, 0x0f6d2, -1], next: [0x31a09, 0x0f6d2, -1, -1], fl: ['R1 W1', 'R1 W1', 'R0 W0', ''], miss: 2 };
  // 段階5 の例で TLB に無く 4 段を引く番地。p は第9章 場面4 段階4 のヒープ（PT の 0x031 番が P = 0）、
  // rw は libc のコード（PT の項が RW0）、us はカーネルが NIC のレジスタ（物理 0xFEB0_0000、第7章 場面2）を写したページ（4 段とも US0）
  var KTAB = 'P1 RW1 US0 NX0';
  var WP = { lbl: CPU.lbl, va: '0x00007f3a2c43_1000', idx: [0x0fe, 0x0e8, 0x162, 0x031], off: 0,
    base: CPU.base, next: [0x0b8e1, 0x13f6a, 0x0e0c9, -1], fl: [CPU.fl[0], CPU.fl[1], CPU.fl[2], 'P0'], miss: 3 };
  var WRW = { lbl: CPU.lbl, va: '0x00007f3a2d82_8000', idx: [0x0fe, 0x0e8, 0x16c, 0x028], off: 0,
    base: [0x05d27, 0x0b8e1, 0x13f6a, 0x15c37], next: [0x0b8e1, 0x13f6a, 0x15c37, 0x0a7c3], fl: [CPU.fl[0], CPU.fl[1], CPU.fl[2], 'P1 RW0 US1 NX0'], miss: -1 };
  var WUS = { lbl: CPU.lbl, va: '0xffffc90000a0_0000', idx: [0x192, 0x000, 0x005, 0x000], off: 0,
    base: [0x05d27, 0x0270c, 0x0381e, 0x1f4a6], next: [0x0270c, 0x0381e, 0x1f4a6, 0xfeb00], fl: [KTAB, KTAB, KTAB, 'P1 RW1 US0 NX1'], miss: -1 };
  // 段階5 の照らし合わせの例。v は 4 段をまとめた印、s は 0 = このアクセスでは見ない・1 = 見て通る・2 = 違反、
  // w は引いた表（tlb = 1 は TLB のヒットで表を読まない）
  var ORDER = ['p', 'rw', 'us', 'nx', 'none'];
  var CASES = {
    p: { addr: '0x00007f3a2c43_1000', acc: 'ユーザーが初めて書く', v: ['0', '—', '—', '—'], s: [2, 0, 0, 0], r: ['#PF：項が無い', 'CR2 ← 0x00007f3a2c43_1000', 'カーネルが割り当て、やり直す'], w: WP, tlb: 0 },
    rw: { addr: '0x00007f3a2d82_8000（例）', acc: 'ユーザーが書く（libc のコード）', v: ['1', '0', '1', '0'], s: [1, 2, 1, 0], r: ['#PF：書けない', 'CR2 ← 0x00007f3a2d82_8000', '不正なので SIGSEGV'], w: WRW, tlb: 0 },
    us: { addr: '0xffffc90000a0_0000（例）', acc: 'ユーザーが書く（NIC のレジスタ）', v: ['1', '1', '0', '1'], s: [1, 1, 2, 0], r: ['#PF：ユーザーは触れない', 'CR2 ← 0xffffc90000a0_0000', '不正なので SIGSEGV'], w: WUS, tlb: 0 },
    nx: { addr: '0x00007f3a2c41_1b20', acc: 'ユーザーが命令として取り出す', v: ['1', '1', '1', '1'], s: [1, 0, 1, 2], r: ['#PF：実行できない', 'CR2 ← 0x00007f3a2c41_1b20', '不正なので SIGSEGV'], w: CPU, tlb: 1 },
    none: { addr: '0x00007f3a2c41_1b20', acc: 'ユーザーが書く', v: ['1', '1', '1', '1'], s: [1, 1, 1, 0], r: ['通る → 0x1a2b4b20 に書く', '', ''], w: CPU, tlb: 1 }
  };
  var RULES = [['P', '0 なら項が無い'], ['R/W', '書くとき 0 なら不可'], ['U/S', 'ユーザーで 0 なら不可'], ['NX', '実行のとき 1 なら不可']];
  var TLB = [['0x7f3a2c411', '0x1a2b4', 'RW1 US1 NX1'], ['0x7f3a2c412', '0x1a2b5', 'RW1 US1 NX1'], ['0x000000401', '0x08c10', 'RW0 US1 NX0']];
  var FCLS = { idle: 'f-in s-rule w1', cur: 'f-x-soft s-x w15', on: 'f-x-soft s-rule w1', vpn: 'f-d-soft s-d w15' };
  var RCLS = { idle: 'f-sf s-rule w1', cur: 'f-x-soft s-x w15', done: 'f-d-soft s-d w1', none: 'f-x-soft s-x w15' };
  var TCLS = { empty: 'f-in s-rule w1', normal: 'f-sf s-rule w1', 'new': 'f-x-soft s-x w15', hit: 'f-d-soft s-d w15' };
  var fadeCls = function (el, base, on) { el.setAttribute('class', base + (on ? ' fade' : ' fade hide')); };

  YT.parts.define('mmu-walk', {
    title: 'ページの表を引く',
    layer: 'cpu',
    home: '09-os.html#s4',
    lead: '仮想アドレスを 9 ビットずつ切って 4 段の表を引き、TLB に控え、印を照らし合わせる MMU と IOMMU の仕事を見る。第9章 場面4・第7章 場面4 の下の層で、番地はそれぞれの章の例と同じ。',
    caption: '図　第9章 場面4 の表を、DRAM の 4 KiB の表と CPU の MMU に分けた模式図。表の番地と項の中身は例。IOMMU は VT-d の second-stage 変換の形（印は R・W）。大きなページと項のほかの印は省いた。',
    note: '実物の MMU は上の段の項も控える（ページ構造キャッシュ）ので、TLB のミスでも 4 回読むとは限らない。LA57 を備えた CPU で 5 段の表を使うと、どの番地も 1 段多く引く（Linux はプロセスが求めない限り、番地を 47 ビットの範囲に置く）。',
    steps: [
      { title: '番地を 9・9・9・9・12 ビットに切る', text: 'レンダラが 0x00007f3a2c41_1b20 を読む。MMU はまず **TLB** を探し、無ければ表を引く。48 ビットを上から 9・9・9・9・12 ビットに切る。9 ビットは各段の表の番号（0〜511）、12 ビットはページの中の位置。上位 16 ビットはビット 47 と同じ値でないと例外になる。' },
      { title: 'CR3 から 1 段目の項を読む', text: '**CR3** は 1 段目の表（PML4）の物理アドレス 0x05d27000 を持つ。番号 0x0fe の項は 0x05d27000 + 0x0fe × 8 = 0x05d277f0 にあり、MMU はこの 8 バイトをメモリから読む。中身は、次の表のページの番号 0x0b8e1 と、P・R/W・U/S・NX などの印。' },
      { title: '同じ手順を 3 回くり返す', text: 'ページの番号に 12 ビットの 0 を付けると、次の表の先頭 0x0b8e1000 になる。PDPT・PD・PT でも同じ計算で 1 項ずつ読み、PT の項から物理ページの番号 0x1a2b4 を得る。オフセット 0xb20 を付けた 0x1a2b4b20 が物理アドレス。表を 4 回読んでから、やっと中身を読む。' },
      { title: 'TLB に控え、次は表を読まない', text: '結果（VPN 0x7f3a2c411 → PFN 0x1a2b4）と 4 段の印をまとめて、TLB の 1 行に控える。次に同じページの 0x00007f3a2c41_1b28 を読むと、TLB の 1 行だけで 0x1a2b4b28 が決まり、表は読まない。控えに無いページならミスで、また表を引く。' },
      { title: '印を照らし合わせ、合わなければ #PF', text: 'MMU は変換のたびに、項の印とアクセスの種類を照らし合わせる。P = 0 なら項が無い。書くのに R/W = 0、ユーザーモードで U/S = 0、命令を取り出すのに NX = 1 のときも許さない。どれかに当たると CPU は命令を止め、CR2 に番地を入れて例外 14（**#PF**）でカーネルへ移る。' },
      { title: '装置の番地も IOMMU が表で引く', text: 'NIC が DMA で書く番地 0x1000 も、**IOMMU**（Intel VT-d）が変換する。装置の番号 03:00.0 でその装置の表を選び、CPU と同じ形の表（512 項 × 8 バイト、9 ビットずつ）を引く。項の無い番地への書き込みは止めて記録し、割り込みで OS に知らせる。' }
    ],
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, mk = S.markers(svg);
      st.mk = mk;
      // ---------- 仮想アドレス（上の帯）。番号の欄は、その番号で引く表の真上に置く ----------
      st.vaG = S.g({}, svg);
      st.vaLbl = S.text(26, 40, '', { cls: 't-sm t-b' }, st.vaG);
      st.vaVal = S.text(26, 58, '', { cls: 't-mono t-xs' }, st.vaG);
      st.vaL3 = S.text(26, 74, '', { cls: 't-mono t-xs' }, st.vaG);
      st.f = FIELDS.map(function (fd, j) {
        var x = COL[j];
        S.text(x + 2, 24, fd[0], { cls: 't-xs t-b' }, st.vaG);
        S.text(x + CW - 2, 24, fd[1], { cls: 't-xs t-dim t-end' }, st.vaG);
        return { bg: S.rect(x, 30, CW, 46, { rx: 4, cls: FCLS.idle }, st.vaG), bin: S.text(x + CW / 2, 48, '', { cls: 't-c t-mono t-xs' }, st.vaG), hex: S.text(x + CW / 2, 68, '', { cls: 't-c t-mono t-sm t-b' }, st.vaG) };
      });

      // ---------- メモリ（DRAM）の 4 段の表と物理ページ ----------
      S.rect(14, 88, 932, 202, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      st.memTitle = S.text(26, 112, 'メモリ（DRAM）', { cls: 't-b t-md' }, svg);
      S.text(26, 130, '表はカーネルが書き、', { cls: 't-xs t-dim' }, svg);
      st.memWho = S.text(26, 144, '', { cls: 't-xs t-dim' }, svg);
      S.text(26, 170, '表 1 枚 = 4 KiB', { cls: 't-xs' }, svg);
      S.text(26, 184, '（512 項 × 8 B）', { cls: 't-xs' }, svg);
      S.text(26, 210, '項の番地', { cls: 't-xs t-b' }, svg);
      S.text(26, 224, '= 表の先頭', { cls: 't-xs t-b' }, svg);
      S.text(26, 238, '  + 番号 × 8', { cls: 't-xs t-b' }, svg);
      st.tabG = S.g({}, svg);
      st.t = NAMES.map(function (nm, j) {
        var x = COL[j], g = S.g({}, st.tabG);
        S.text(x, 106, nm, { cls: 't-sm t-b' }, g);
        var o = { g: g, base: S.text(x + CW, 106, '', { cls: 't-mono t-xs t-end' }, g) };
        S.rect(x, 114, CW, 110, { rx: 3, cls: 'f-in s-rule w1' }, g);
        o.dotT = S.text(x + CW / 2, 131, '…', { cls: 't-c t-xs t-dim' }, g);
        o.row = S.rect(x + 4, 140, CW - 8, 54, { rx: 3, cls: RCLS.idle }, g);
        o.l1 = S.text(x + 10, 155, '', { cls: 't-xs' }, g);
        o.l2 = S.text(x + 10, 173, '', { cls: 't-mono t-sm t-b' }, g);
        o.l3 = S.text(x + 10, 188, '', { cls: 't-mono t-xs' }, g);
        o.dotB = S.text(x + CW / 2, 213, '…', { cls: 't-c t-xs t-dim' }, g);
        o.c1 = S.text(x + CW / 2, 244, '', { cls: 't-c t-xs' }, g);
        o.c2 = S.text(x + CW / 2, 262, '', { cls: 't-c t-mono t-xs' }, g);
        return o;
      });
      // 項 → 次の表の先頭（④ の項 → 物理ページ）
      st.arr = [0, 1, 2, 3].map(function (j) {
        var x = COL[j];
        return S.path('M' + (x + CW - 4) + ',167 H' + (x + CW + 13) + ' V120 H' + COL[j + 1], { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, st.tabG);
      });
      // 物理ページ（4 KiB）。印はオフセットの位置
      st.pgG = S.g({}, svg);
      S.text(COL[4], 106, '物理ページ', { cls: 't-sm t-b' }, st.pgG);
      st.pgBase = S.text(COL[4] + CW, 106, '', { cls: 't-mono t-xs t-end' }, st.pgG);
      st.pgBody = S.rect(COL[4], 114, CW, 110, { rx: 3, cls: 'f-in s-rule w1' }, st.pgG);
      st.pgMark = S.rect(COL[4] + 6, 0, CW - 12, 6, { rx: 2, cls: 'f-d fade hide' }, st.pgG);
      st.pgOff = S.text(COL[4] + 8, 0, '', { cls: 't-mono t-xs t-b' }, st.pgG);
      st.pgC1 = S.text(COL[4] + CW / 2, 244, '', { cls: 't-c t-mono t-xs' }, st.pgG);
      st.pgC2 = S.text(COL[4] + CW / 2, 262, '', { cls: 't-c t-mono t-sm t-b' }, st.pgG);
      st.pgC3 = S.text(COL[4] + CW / 2, 280, '', { cls: 't-c t-xs t-dim' }, st.pgG);

      // ---------- CPU の MMU（CR3・読んだ回数・TLB・照らし合わせ） ----------
      S.rect(14, 302, 602, 244, { rx: 10, cls: 'f-sf s-fg w15' }, svg);
      S.text(26, 322, 'CPU の MMU', { cls: 't-b t-md' }, svg);
      S.text(166, 322, '番地を変換し、印を照らし合わせる', { cls: 't-xs t-dim' }, svg);   // x = 155 を CR3 の矢印が通る
      st.cpuG = S.g({}, svg);
      st.cr3 = S.rect(26, 334, 114, 54, { rx: 5, cls: 'f-in s-rule w1' }, st.cpuG);
      S.text(36, 352, 'CR3', { cls: 't-b t-sm t-mono' }, st.cpuG);
      S.text(36, 371, pa(CPU.base[0]), { cls: 't-mono t-sm t-b' }, st.cpuG);
      S.text(36, 384, '1 段目の表の先頭', { cls: 't-xs t-dim' }, st.cpuG);
      st.cr3Arr = S.path('M140,361 H155 V120 H' + COL[0], { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, svg);
      st.cntG = S.g({}, st.cpuG);   // 段階5 では薄くする（照らし合わせの例ごとに読む回数は変わる）
      S.rect(26, 398, 114, 136, { rx: 5, cls: 'f-in s-rule w1' }, st.cntG);
      S.text(36, 416, '表を読んだ回数', { cls: 't-xs t-b' }, st.cntG);
      st.cnt = S.text(76, 466, '', { cls: 't-c t-xxl t-b t-mono' }, st.cntG);
      st.cntU = S.text(94, 466, '回', { cls: 't-sm' }, st.cntG);
      st.cntA = S.text(36, 500, '', { cls: 't-xs' }, st.cntG);
      st.cntB = S.text(36, 516, '', { cls: 't-xs t-dim' }, st.cntG);
      // TLB
      st.tlbBg = S.rect(150, 334, 240, 200, { rx: 5, cls: 'f-in s-rule w1' }, st.cpuG);
      S.text(160, 352, 'TLB（変換の控え）', { cls: 't-b t-sm' }, st.cpuG);
      S.text(160, 368, 'VPN（ページの番号）→ PFN と印', { cls: 't-xs t-dim' }, st.cpuG);
      st.tlb = TLB.map(function (r, j) {
        var y = 378 + j * 24;
        return { bg: S.rect(158, y, 224, 20, { rx: 3, cls: TCLS.normal }, st.cpuG), tx: S.text(164, y + 14, '', { cls: 't-mono t-xs' }, st.cpuG), fl: S.text(376, y + 14, '', { cls: 't-mono t-xs t-dim t-end' }, st.cpuG) };
      });
      st.tlbS1 = S.text(160, 470, '', { cls: 't-xs t-b' }, st.cpuG);
      st.tlbS2 = S.text(160, 488, '', { cls: 't-xs' }, st.cpuG);
      // 照らし合わせ（4 段の印をまとめた値とアクセスの種類）
      st.chkBg = S.rect(400, 334, 206, 200, { rx: 5, cls: 'f-in s-rule w1' }, st.cpuG);
      S.text(410, 352, '照らし合わせ', { cls: 't-b t-sm' }, st.cpuG);
      S.text(482, 352, '4 段をまとめた印', { cls: 't-xs t-dim' }, st.cpuG);
      st.chkAddr = S.text(410, 372, '', { cls: 't-mono t-xs' }, st.cpuG);
      st.chkAcc = S.text(410, 388, '', { cls: 't-xs' }, st.cpuG);
      st.chk = RULES.map(function (r, j) {
        var y = 397 + j * 18;
        return { bg: S.rect(406, y, 194, 17, { rx: 3, cls: 'f-none' }, st.cpuG), nm: S.text(412, y + 12, r[0], { cls: 't-mono t-xs t-b' }, st.cpuG), v: S.text(454, y + 12, '', { cls: 't-mono t-sm t-b' }, st.cpuG), ru: S.text(470, y + 12, r[1], { cls: 't-xs' }, st.cpuG) };
      });
      st.res1 = S.text(410, 490, '', { cls: 't-xs t-b' }, st.cpuG);
      st.res2 = S.text(410, 507, '', { cls: 't-mono t-xs' }, st.cpuG);
      st.res3 = S.text(410, 524, '', { cls: 't-xs t-dim' }, st.cpuG);

      // ---------- IOMMU（段階6）：装置の DMA の番地を、装置ごとの同じ形の表で変換する ----------
      st.ioFrame = S.g({}, svg);
      S.rect(628, 302, 318, 244, { rx: 10, cls: 'f-sf s-fg w15' }, st.ioFrame);
      S.text(640, 322, 'IOMMU', { cls: 't-b t-md' }, st.ioFrame);
      S.text(692, 322, '装置の番地を変換（Intel VT-d の例）', { cls: 't-xs t-dim' }, st.ioFrame);
      st.ioG = S.g({ cls: 'fade hide' }, svg);
      S.rect(640, 334, 92, 54, { rx: 5, cls: 'f-in s-rule w1' }, st.ioG);
      S.text(650, 352, 'NIC', { cls: 't-b t-sm' }, st.ioG);
      S.text(650, 368, '03:00.0', { cls: 't-mono t-xs' }, st.ioG);
      S.text(650, 382, '装置の番号', { cls: 't-xs t-dim' }, st.ioG);
      S.path('M732,361 H750', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, st.ioG);
      S.rect(752, 334, 182, 54, { rx: 5, cls: 'f-in s-rule w1' }, st.ioG);
      S.text(760, 351, '番号でその装置の表を選ぶ', { cls: 't-xs t-b' }, st.ioG);
      S.text(760, 367, '表の先頭', { cls: 't-xs t-dim' }, st.ioG);
      S.text(806, 367, pa(NIC.base[0]), { cls: 't-mono t-xs t-b' }, st.ioG);
      S.text(760, 382, 'ルート表とコンテキスト表から', { cls: 't-xs t-dim' }, st.ioG);
      st.ioTlbBg = S.rect(640, 398, 294, 46, { rx: 5, cls: 'f-in s-rule w1' }, st.ioG);
      S.text(650, 414, 'IOTLB（変換の控え）', { cls: 't-xs t-b' }, st.ioG);
      st.ioTlb = S.text(650, 434, '', { cls: 't-mono t-xs' }, st.ioG);
      st.ioTlbF = S.text(926, 434, '', { cls: 't-mono t-xs t-dim t-end' }, st.ioG);
      st.io1 = S.text(640, 466, '', { cls: 't-xs t-b' }, st.ioG);
      st.io2 = S.text(640, 484, '', { cls: 't-xs t-b' }, st.ioG);
      st.io3 = S.text(640, 502, '', { cls: 't-xs' }, st.ioG);
      st.io4 = S.text(640, 520, '', { cls: 't-xs t-dim' }, st.ioG);
      st.ioArr = S.path('M920,334 V296 H155 V120 H' + COL[0], { cls: 'f-none s-d w2 fade hide', 'marker-end': mk('d') }, svg);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.vaLbl, { to: '04-ronri.html#s4.5', label: '仮想アドレス', at: [118, 36], steps: [1], bridge: '番地を 9 ビットずつ切るには、16 進を 1 文字 4 ビットの 2 進に直してから区切る' });
      ctx.mark(st.cr3, { to: '05-kioku.html#s3.1', label: 'CR3', at: [124, 348], steps: [2], bridge: 'CR3 も D-FF を 64 個並べたレジスタ。立ち上がりの瞬間に 64 ビットを同時に取り込む' });
      ctx.mark(st.memTitle, { to: '06-cpu.html#s6.3', label: '表の読み出し', at: [137, 108], steps: [2, 3], bridge: '表の項を読むのも、ふつうのメモリの読み出し。キャッシュに無ければ DRAM まで降りて待つ' });
      ctx.mark(st.pgBody, { to: '05-kioku.html#s5.5', label: '物理ページ（DRAM）', at: [930, 126], steps: [3], bridge: '物理アドレス 0x1a2b4b20 で DRAM の行を開き、列を選んで中身を取り出す' });
      ctx.mark(st.tlbBg, { to: '06-cpu.html#s6.2', label: 'TLB', at: [376, 346], steps: [1, 4], bridge: 'TLB も L1〜L3 と同じく、CPU の中の SRAM に置いた小さな写し' });
      ctx.mark(st.chkBg, { part: 'cpu-mode', step: 4, label: '照らし合わせ', at: [592, 347], steps: [5], bridge: '照らし合わせは論理ゲートの仕事。U/S なら、モードのビット M と NOT と AND でつなぐ' });
      ctx.mark(st.res1, { part: 'irq-entry', step: 3, label: '例外 #PF', at: [592, 486], steps: [5], bridge: '#PF も同じ手順で積んで入口へ飛ぶ。番号は 14 で誤りコードも積み、PC は止めた命令の番地' });
      ctx.mark(st.ioTlbBg, { to: '06-cpu.html#s6.3', label: 'IOTLB', at: [920, 410], steps: [6], bridge: 'IOTLB も変換の控え。表を読むのはミスのときだけで、キャッシュのヒットとミスと同じ' });
    },
    onStep: function (ctx) {
      ctx.state.key = '';   // frame が段階の見た目を全部描き直す
    },
    frame: function (ctx) {
      var st = ctx.state, L = look(ctx.step, ctx.ts, YT.motion.playing, ctx.params || {});
      var key = JSON.stringify(L);   // 見た目が変わったときだけ書き換える（段階・場面・読んだ段の数がすべて入る）
      if (key === st.key) return;
      st.key = key;
      draw(st, L);
    }
  });

  /* ---------- 段階と時刻から見た目を決める（止めているときは段階の要点の姿） ---------- */
  function look(i, ts, run, p) {
    var L = { W: CPU, cut: 5, nd: 0, rd: false, res: false, noPg: false, fld: null, l3: '', l3c: 't-dim', tabDim: false,
      cr3: 'idle', cr3Arr: '', cnt: '', cntA: '', cntB: '', tlb0: 'empty', tlbHi: -1, tlbS1: '', tlbS1c: '', tlbS2: '', chk: null, cpuDim: false, io: null, who: 'MMU が読む' };
    var q, ph, k;
    if (i === 0) {
      q = U.seq(ts, [1.6, 0.8, 0.8, 0.8, 0.8, 0.8, 2.4], true); ph = run ? q.i : 6;
      L.cut = ph === 6 ? 5 : ph;
      L.fld = ph >= 1 && ph <= 5 ? ph - 1 : -1;
      L.l3 = 'VPN 0x7f3a2c411'; L.l3c = ph === 0 ? 't-x t-b' : 't-dim';
      L.tlbS1 = 'VPN 0x7f3a2c411 を探す'; L.tlbS2 = ph === 0 ? '' : '→ 無い（ミス）。表を引く'; L.tlbS1c = ph === 0 ? 'x' : '';   // 結果は探し終えてから
      L.cnt = '0'; L.cntA = '1 回 = 項の 8 バイト';
    } else if (i === 1) {
      q = U.seq(ts, [1.5, 3.0], true); ph = run ? q.i : 1;
      L.nd = ph; L.rd = ph === 0; L.fld = 0;
      L.cr3 = 'cur'; L.cr3Arr = 'x';
      L.tlbS1 = 'ミス：表を引いている';
      L.cnt = String(L.nd); L.cntA = '1 回 = 項の 8 バイト';
    } else if (i === 2) {
      q = U.seq(ts, [0.7, 0.8, 0.7, 0.8, 0.7, 0.8, 3.0], true); ph = run ? q.i : 6;
      if (ph < 6) { k = 1 + (ph >> 1); L.nd = (ph & 1) ? k + 1 : k; L.rd = !(ph & 1); L.fld = k; }
      else { L.nd = 4; L.res = true; L.fld = 4; }
      L.cr3Arr = 'd';
      L.tlbS1 = L.res ? 'ミス：表を 4 段とも引いた' : 'ミス：表を引いている';
      L.cnt = String(L.nd); L.cntA = '1 回 = 項の 8 バイト'; L.cntB = L.res ? 'このあと中身を 1 回' : '';
    } else if (i === 3) {
      q = U.seq(ts, [2.6, 3.4], true); ph = run ? q.i : 1;
      L.nd = 4; L.res = true;
      if (ph === 0) {
        L.cr3Arr = 'd'; L.tlb0 = 'new'; L.tlbS1 = '結果と印を 1 行に控える';
        L.cnt = '4'; L.cntA = '1 回 = 項の 8 バイト';
      } else {
        L.W = CPU2; L.fld = 'vpn'; L.l3 = 'VPN 0x7f3a2c411'; L.l3c = 't-d t-b'; L.tabDim = true;
        L.tlb0 = 'hit'; L.tlbS1 = 'VPN 0x7f3a2c411：ヒット'; L.tlbS1c = 'd'; L.tlbS2 = '表は読まずに 0x1a2b4b28 へ';
        L.cnt = '0'; L.cntA = '表は読まない'; L.cntB = 'TLB の 1 行で済んだ';
      }
    } else if (i === 4) {
      // 例ごとに、その番地を引いた姿（p・rw・us は TLB に無く 4 段を引く。nx・none は段階4 と同じ TLB のヒット）。
      // 物理ページに届くのは、通る例（none）だけ
      var s0 = Math.max(0, ORDER.indexOf(p.fault));
      q = U.seq(ts, [3, 3, 3, 3, 3], true);
      var c = ORDER[(s0 + (run ? q.i : 0)) % ORDER.length], C = CASES[c];
      L.chk = c; L.W = C.w; L.nd = 4; L.tlb0 = 'normal'; L.noPg = c !== 'none'; L.res = c === 'none';
      if (C.tlb) {
        L.tabDim = true; L.fld = 'vpn'; L.l3 = 'VPN 0x7f3a2c411'; L.l3c = 't-d t-b';
        L.tlbHi = 0; L.tlbS1 = 'VPN 0x7f3a2c411：ヒット'; L.tlbS1c = 'd'; L.tlbS2 = '印は TLB の行のものを使う';
        L.cnt = '0'; L.cntA = '表は読まない'; L.cntB = 'TLB の 1 行で済んだ';
      } else {
        L.cr3Arr = 'd';
        L.tlbS1 = 'ミス：表を 4 段とも引いた'; L.tlbS2 = c === 'p' ? 'P = 0 の変換は TLB に入らない' : '';
        L.cnt = '4'; L.cntA = '1 回 = 項の 8 バイト';
      }
    } else {
      // IOMMU: 0x1000 は表にあって書ける。0x1a2b4b20 は ③ の項が無いので止める
      q = U.seq(ts, [7.2, 6.4], true);
      var A = !run || q.i === 0, tt = run ? q.f * (A ? 7.2 : 6.4) : 99, W = A ? NIC : BAD, last = A ? 4 : 3;
      if (tt >= last * 1.2) { L.nd = last; L.res = A; }
      else { k = Math.floor(tt / 1.2); if (tt - k * 1.2 < 0.5) { L.nd = k; L.rd = true; } else L.nd = k + 1; L.fld = Math.min(3, k); }
      L.W = W; L.cpuDim = true; L.who = 'IOMMU が読む'; L.l3 = '装置が使う番地'; L.tlb0 = 'normal';
      L.io = { A: run ? (A ? 1 : 2) : 0, done: tt >= last * 1.2, tlb: A ? tt >= last * 1.2 : true };
    }
    return L;
  }

  /* ---------- 描く ---------- */
  function draw(st, L) {
    var W = L.W, mk = st.mk;
    // 仮想アドレスの帯
    st.vaLbl.textContent = W.lbl;
    st.vaVal.textContent = W.va;
    st.vaL3.textContent = L.l3;
    st.vaL3.setAttribute('class', 't-mono t-xs ' + L.l3c);
    st.f.forEach(function (f, j) {
      var v = j < 4 ? W.idx[j] : W.off;
      f.bin.textContent = bin(v, j < 4 ? 9 : 12);
      f.hex.textContent = hx(v, 3);
      var s = L.fld === 'vpn' ? (j < 4 ? 'vpn' : 'on') : L.fld === j ? 'cur' : (j < L.cut ? 'on' : 'idle');
      f.bg.setAttribute('class', FCLS[s]);
    });
    // 4 段の表
    st.tabG.style.opacity = L.tabDim ? 0.3 : 1;
    st.memWho.textContent = L.who;
    st.t.forEach(function (T, j) {
      var done = j < L.nd, none = done && W.miss === j, reading = j === L.nd && L.rd;
      var known = j === 0 ? (L.nd > 0 || L.rd) : (L.nd >= j && W.base[j] >= 0);
      T.base.textContent = known ? pa(W.base[j]) : '';
      T.dotT.style.display = W.idx[j] > 0 ? '' : 'none';
      T.l1.textContent = j < L.cut ? hx(W.idx[j], 3) + ' 番の項' : '';
      T.l2.textContent = done ? (none ? '無し' : '→ ' + hx(W.next[j], 5)) : '';
      T.l2.setAttribute('class', 't-mono t-sm t-b' + (none ? ' t-x' : ''));
      T.l3.textContent = done ? W.fl[j] : '';
      T.row.setAttribute('class', RCLS[done ? (none ? 'none' : 'done') : reading ? 'cur' : 'idle']);
      T.c1.textContent = done || reading ? '先頭 + ' + hx(W.idx[j], 3) + ' × 8' : '';
      T.c2.textContent = done || reading ? '= ' + pa(W.base[j], W.idx[j] * 8) : '';
      var on = done && !none && !(j === 3 && L.noPg);   // 許さないアクセスは物理ページへ進まない
      fadeCls(st.arr[j], 'f-none s-d w2', on);
    });
    // 物理ページ
    var pg = L.nd === 4 && W.miss < 0 && !L.noPg;
    st.pgBase.textContent = pg ? pa(W.next[3]) : '';
    st.pgBody.setAttribute('class', L.res ? 'f-d-soft s-d w1' : 'f-in s-rule w1');
    var my = 114 + Math.round(W.off / 4096 * 110);
    st.pgMark.setAttribute('y', U.clamp(my - 3, 116, 216));
    fadeCls(st.pgMark, 'f-d', L.res);
    st.pgOff.setAttribute('y', W.off < 0x200 ? my + 18 : my - 7);
    st.pgOff.textContent = L.res ? '+' + hx(W.off, 3) : '';
    st.pgC1.textContent = L.res ? pa(W.next[3]) + ' + ' + hx(W.off, 3) : '';
    st.pgC2.textContent = L.res ? '= ' + pa(W.next[3], W.off) : '';
    st.pgC3.textContent = L.res ? '物理アドレス' : '';
    // CR3 と、IOMMU の表の先頭からの矢印
    st.cr3.setAttribute('class', L.cr3 === 'cur' ? 'f-x-soft s-x w15' : 'f-in s-rule w1');
    fadeCls(st.cr3Arr, 'f-none w2 ' + (L.cr3Arr === 'x' ? 's-x' : 's-d'), !!L.cr3Arr);
    st.cr3Arr.setAttribute('marker-end', mk(L.cr3Arr === 'x' ? 'x' : 'd'));
    fadeCls(st.ioArr, 'f-none s-d w2', !!L.io && (L.nd > 0 || L.rd));
    // 読んだ回数・TLB・照らし合わせ
    st.cpuG.style.opacity = L.cpuDim ? 0.3 : 1;
    st.cntG.style.opacity = L.cnt ? 1 : 0.3;
    st.cnt.textContent = L.cnt;
    st.cntU.textContent = L.cnt ? '回' : '';
    st.cntA.textContent = L.cntA;
    st.cntB.textContent = L.cntB;
    st.tlb.forEach(function (r, j) {
      var s = j === 0 ? L.tlb0 : 'normal', empty = s === 'empty';
      if (j === L.tlbHi) s = 'hit';
      r.bg.setAttribute('class', TCLS[s]);
      r.tx.textContent = empty ? '（空き）' : TLB[j][0] + ' → ' + TLB[j][1];
      r.tx.setAttribute('class', empty ? 't-xs t-dim' : 't-mono t-xs');
      r.fl.textContent = empty ? '' : TLB[j][2];
    });
    st.tlbS1.textContent = L.tlbS1;
    st.tlbS1.setAttribute('class', 't-xs t-b' + (L.tlbS1c ? ' t-' + L.tlbS1c : ''));
    st.tlbS2.textContent = L.tlbS2;
    var C = L.chk ? CASES[L.chk] : null;
    st.chkBg.setAttribute('class', C ? 'f-in s-x w15' : 'f-in s-rule w1');
    st.chkAddr.textContent = C ? C.addr : '';
    st.chkAcc.textContent = C ? C.acc : '';
    st.chk.forEach(function (r, j) {
      var s = C ? C.s[j] : 0;
      r.bg.setAttribute('class', s === 2 ? 'f-x-soft' : 'f-none');
      r.v.textContent = C ? C.v[j] : '';
      r.v.setAttribute('class', 't-mono t-sm t-b' + (s === 2 ? ' t-x' : ''));
      r.nm.setAttribute('class', 't-mono t-xs t-b' + (s === 2 ? ' t-x' : C && s === 0 ? ' t-dim' : ''));
      r.ru.setAttribute('class', 't-xs' + (s === 2 ? ' t-x t-b' : C && s === 1 ? '' : ' t-dim'));
    });
    st.res1.textContent = C ? C.r[0] : '';
    st.res1.setAttribute('class', 't-xs t-b ' + (C && L.chk !== 'none' ? 't-x' : 't-d'));
    st.res2.textContent = C ? C.r[1] : '';
    st.res3.textContent = C ? C.r[2] : '';
    // IOMMU
    var io = L.io;
    st.ioFrame.style.opacity = io ? 1 : 0.4;
    S.fade(st.ioG, !!io);
    st.ioTlb.textContent = io && io.tlb ? '0x000000001 → 0x3d0e2' : '';
    st.ioTlbF.textContent = io && io.tlb ? 'R1 W1' : '';
    // 結果の行は、その例の表を引き終えてから出す（動いているときは、いま引いている例だけ。止めているときは両方）
    var okA = io && (io.A === 0 || io.A === 2 || io.done), okB = io && (io.A === 0 || (io.A === 2 && io.done));
    st.io1.textContent = !io ? '' : okA ? '0x1000 → 0x3d0e2000：W = 1 で書ける' : '0x1000 に書く → NIC の表を引く';
    st.io2.textContent = !io || io.A === 1 ? '' : okB ? '0x1a2b4b20：③ の 0x0d1 番の項が無い（R0 W0）' : '0x1a2b4b20 に書く → NIC の表を引く';
    st.io3.textContent = okB ? '→ 書き込みを止め、フォールトを記録' : '';
    st.io4.textContent = okB ? '記録したら、割り込みで OS に知らせる' : '';
    st.io1.setAttribute('class', 't-xs t-b' + (io && io.A === 2 ? ' t-dim' : okA ? ' t-d' : ''));
    st.io2.setAttribute('class', 't-xs t-b' + (okB ? ' t-x' : ''));
  }
})();
