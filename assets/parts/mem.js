/* ============================================================
   台本の部品 mem（メモリの区画）— assets/parts/mem.js

   ニュースのノートの台本（```anim mem）を描く。左にポインタを持つ所（ptr）、右にメモリの区画（block）を縦に並べ、
   ポインタから区画へ矢印を引く。確保・解放（bad）・使い回し（set）・指す先の付け替え（point）・読み書き（send）を見せる。
   台本の書き方は news/README.md「動きの場面（台本）」、読み方は assets/anim-script.js、共通の道具は assets/anim.js。
   見本の台本は第26章 場面6 段階3（解放した後に使う）の例の値。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var LX = 32, LW = 268, RX = 560, RW = 368, TOP = 72, BOT = 536;

  /* 縦に並べる: 箱の高さの列 hs を、間を 14〜40 で置く。返す: { ys: 各箱の上端（0 から）, h: 全体の高さ } */
  function column(hs) {
    var sum = hs.reduce(function (a, b) { return a + b; }, 0), n = hs.length;
    var gap = n > 1 ? Math.max(14, Math.min(40, (BOT - TOP - sum) / (n - 1))) : 0;
    var y = 0, out = [];
    hs.forEach(function (h) { out.push(y); y += h + gap; });
    return { ys: out, h: y - gap };
  }
  /* ポインタの矢印（持ち主の右の縁 → 区画の左の縁）と、区画どうし・持ち主どうしの道 */
  function curve(x1, y1, x2, y2) {
    var c = Math.max(60, Math.abs(x2 - x1) * 0.45) * (x2 >= x1 ? 1 : -1);
    return 'M' + x1 + ',' + y1.toFixed(1) + ' C' + (x1 + c) + ',' + y1.toFixed(1) + ' ' + (x2 - c) + ',' + y2.toFixed(1) + ' ' + x2 + ',' + y2.toFixed(1);
  }
  /* 同じ列の 2 つを結ぶ道。列の間（矢印の通る所）へ SIDE × 0.75 だけふくらむ。dir は +1 で右、-1 で左 */
  var SIDE = 40;
  function side(x, y1, y2, dir) { var b = x + dir * SIDE; return 'M' + x + ',' + y1.toFixed(1) + ' C' + b + ',' + y1.toFixed(1) + ' ' + b + ',' + y2.toFixed(1) + ' ' + x + ',' + y2.toFixed(1); }

  YT.parts.define('mem', {
    generic: true,
    title: 'メモリの区画',
    use: '解放後の使用・二重解放・範囲外アクセス',
    lead:'ポインタが指すメモリの区画を、確保・解放・使い回しの順に見せる台本の部品。解放後の使用や二重解放のニュースに使う。見本は第26章 場面6 の例。',
    caption: '図　左はポインタを持つ所、右はメモリの区画。破線は解放した区画と、その区画を指したままのポインタ。x はその段階で変わった物。',
    note: '台本の書き方は news/README.md の「動きの場面」。ptr・block を宣言し、段階ごとに show・bad・set・point・send で変える。',
    sample: [
      'title: 解放した後に使う（第26章 場面6 の例）',
      'caption: 左は番地を持つ変数、右はヒープの区画（番地は例）。破線は解放した区画と、それを指したままのポインタ。',
      'left: 番地を持つ変数',
      'right: ヒープ',
      'ptr a: a | `struct Seg *` -> seg',
      'ptr b: b | 物 B を指す -> seg',
      'block seg: 物 A（Seg、12 バイト） | `0x5010` から',
      'step: 物 A を作る',
      '`a = malloc(12)` で、物 A（Seg、12 バイト）を 0x5010 に作る。a はその番地を持つ。',
      'show: a seg',
      'step: 解放する',
      '`free(a)` で、0x5010 からの領域は空きに戻る。a には番地が残ったまま。',
      'set: seg = 空き | `0x5010` から',
      'bad: seg a',
      'step: 別の物が同じ所に置かれる',
      '物 B を作ると、空いた 0x5010 に置かれる。a は古い番地のまま、型の違う B を指している。',
      'set: seg = 物 B（on_end・len） | `0x5010` から',
      'ok: seg',
      'show: b',
      'x: seg b',
      'step: 古いポインタで書く',
      '`a->start_ms = 0x41414141` と書くと、B の on_end の 4 バイトが変わる。CPU も OS も止めない。',
      'send: a -> seg: 0x41414141 を書く',
      'x: a seg',
      'down: seg -> 09-os.html#s4.4: 区画は確保したページの中なので、書いてもページフォールトにならない'
    ].join('\n'),
    steps: function (p) { return YT_ANIM.steps(p); },
    setup: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, svg = ctx.svg;
      A.head(ctx);
      st.mk = S.markers(svg);
      st.gArrow = S.g({}, svg);
      var ptrs = A.kinds(p, 'ptr'), blocks = A.kinds(p, 'block');
      st.ptr = {}; st.block = {};
      // 箱の高さは、段階を通した札の全部が入る高さ
      var pc = ptrs.map(function (it) { return A.card(svg, LX, 0, LW, A.variants(p, it.id), { align: 'l', minH: 46 }); });
      var bc = blocks.map(function (it) { return A.card(svg, RX, 0, RW, A.variants(p, it.id), { align: 'l', data: true, minH: 62 }); });
      // 左右の列は、高い方の列を TOP〜BOT の真ん中に置く高さから、そろえて並べる（列の見出しの高さをそろえる）
      var cols = [pc, bc].map(function (cs) { return column(cs.map(function (c) { return c.h; })); });
      var y0 = TOP + 8 + Math.max(0, (BOT - TOP - 8 - Math.max(cols[0].h, cols[1].h)) / 2);
      [[pc, ptrs, st.ptr, LX, p.head.left || 'ポインタ', cols[0]], [bc, blocks, st.block, RX, p.head.right || 'メモリの区画', cols[1]]].forEach(function (grp) {
        var ys = grp[5].ys.map(function (y) { return y0 + y; });
        A.fill(S.text(grp[3], y0 - 20, '', { cls: 't-sm t-dim' }, svg), grp[4]);   // 列の見出しは列の上（最初の箱の上の縁の印の札に重ねない高さ）
        grp[0].forEach(function (c, k) {
          // card は y = 0 で作ったので、決めた高さへ移す
          c.g.setAttribute('transform', 'translate(0,' + ys[k].toFixed(1) + ')');
          c.y = ys[k];
          c.g.classList.add('fade');
          grp[2][grp[1][k].id] = c;
        });
      });
      // ポインタの矢印（ptr ごとに 1 本。指す先は段階で変わる）
      st.arrow = {};
      ptrs.forEach(function (it) { st.arrow[it.id] = S.path('M0,0', { cls: 'f-none s-mid w15' }, st.gArrow); });
      // 読み書き（send）の道・粒・札。1 段階に 2 つまで。ポインタの矢印と同じ道なら、道は描かずに粒だけ流す
      st.sends = [0, 1].map(function () {
        var path = S.path('M0,0', { cls: 'f-none s-d w15 dash2', style: { display: 'none' } }, st.gArrow);
        return { path: path, dots: A.flowDots(svg, 3, 'f-d'), tag: A.tag(svg, 0, 0, '', { cls: 't-sm t-b t-d' }) };
      });
      st.anchor = function (id) {
        var c = st.ptr[id] || st.block[id];
        return c ? { el: c.rect, x: c.x + c.w - 14, y: c.y - 4, dx: -30 } : null;   // 箱の上の縁の右（2 つ目からは左へ。箱の文字は隠さない）
      };
    },
    onStep: function (ctx, i) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, now = A.at(ctx);
      var see = function (id) { return now.st[id] || {}; };
      Object.keys(st.ptr).concat(Object.keys(st.block)).forEach(function (id) {
        var c = st.ptr[id] || st.block[id], s = see(id);
        c.set(s.l, s.s, s);
        c.g.classList.toggle('hide', !s.v);
      });
      // 矢印: 区画ごとに、指しているポインタの数で端をずらす
      var into = {};
      A.kinds(p, 'ptr').forEach(function (it) { var s = see(it.id); if (s.v && s.t) (into[s.t] || (into[s.t] = [])).push(it.id); });
      st.ends = {};
      Object.keys(st.arrow).forEach(function (id) {
        var s = see(id), a = st.arrow[id], c = st.ptr[id], b = s.t && st.block[s.t];
        if (!s.v || !b) { a.style.display = 'none'; return; }
        var list = into[s.t], j = list.indexOf(id), off = (j - (list.length - 1) / 2) * 14;
        var y1 = c.y + c.h / 2, y2 = b.y + b.h / 2 + off;
        a.setAttribute('d', curve(LX + LW, y1, RX - 2, y2));
        a.setAttribute('class', A.lineCls('ref', s));
        a.setAttribute('marker-end', st.mk(A.lineColor('ref', s)));
        a.style.display = '';
        st.ends[id] = { y1: y1, y2: y2 };
      });
      // 読み書き（send）
      st.sends.forEach(function (sd, k) {
        var o = now.send[k];
        sd.on = !!o;
        sd.path.style.display = o ? '' : 'none';
        if (!o) { sd.tag.set(''); return; }
        var ca = st.ptr[o.a] || st.block[o.a], cb = st.ptr[o.b] || st.block[o.b], d, same = false;
        var ya = ca.y + ca.h / 2, yb = cb.y + cb.h / 2;
        // 区画どうし・持ち主どうしは、列の間へふくらむ道（札はふくらみの外側。図の外へ出さない）
        if (st.ptr[o.a] && st.block[o.b]) { same = see(o.a).t === o.b && !!st.ends[o.a]; d = curve(LX + LW, ya, RX - 2, same ? st.ends[o.a].y2 : yb); }
        else if (st.block[o.a] && st.ptr[o.b]) { same = see(o.b).t === o.a && !!st.ends[o.b]; d = curve(RX - 2, same ? st.ends[o.b].y2 : ya, LX + LW, yb); }
        else if (st.block[o.a]) d = side(RX - 2, ya, yb, -1);
        else d = side(LX + LW + 2, ya, yb, 1);
        sd.path.setAttribute('d', d);
        sd.path.setAttribute('class', same ? 'f-none s-none' : 'f-none s-d w15 dash2');
        var q = A.point(sd.path, 0.5);
        if (st.block[o.a] && st.block[o.b]) sd.tag.set(o.label, 't-sm t-b t-d', q.x - 8, q.y, 'r');
        else if (st.ptr[o.a] && st.ptr[o.b]) sd.tag.set(o.label, 't-sm t-b t-d', q.x + 8, q.y, 'l');
        else { var hw = A.measure(ctx.svg, 't-sm t-b', o.label) / 2; sd.tag.set(o.label, 't-sm t-b t-d', Math.max(LX + LW + 8 + hw, Math.min(RX - 8 - hw, q.x)), q.y - 14, 'c'); }
      });
    },
    frame: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx), f = A.growth(ctx);
      Object.keys(st.arrow).forEach(function (id) { A.grow(st.arrow[id], now.fresh.indexOf(id) >= 0 ? f : 1); });
      st.sends.forEach(function (sd) { sd.dots.update(ctx, sd.path, sd.on, 80); });
    }
  });
})();
