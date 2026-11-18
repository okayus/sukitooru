/* ============================================================
   台本の部品 tree（木）— assets/parts/tree.js

   ニュースのノートの台本（```anim tree）を描く。node の親（<）をたどって根を上に置いた木を描き、親から子へ枝を引く。
   証明書の連鎖（ルート → 中間 CA → サーバーの証明書）、DNS の名前の木、DOM の木などに使う。木は 3 本まで並べられ、
   木をまたぐつながり（クロス署名など）は edge で引く。send は枝に沿って流れる粒と札。
   台本の書き方は news/README.md「動きの場面（台本）」、読み方は assets/anim-script.js、共通の道具は assets/anim.js。
   見本の台本は第17章 場面2（名前の木・ゾーンと委任）の例の値。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var X0 = 32, XW = 896, TOP = 66, BOT = 538;

  /* 親から子への枝（親の下の縁 → 子の上の縁。途中で横に折れる） */
  function branch(p, c) {
    var x1 = p.x + p.w / 2, y1 = p.y + p.h, x2 = c.x + c.w / 2, y2 = c.y - 2, my = (y1 + y2) / 2;
    return 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' V' + my.toFixed(1) + ' H' + x2.toFixed(1) + ' V' + y2.toFixed(1);
  }
  function byIdParent(sc, id) { var n = sc.items.filter(function (x) { return x.id === id; })[0]; return n ? n.parent : ''; }
  function branchUp(p, c) {
    var x1 = p.x + p.w / 2, y1 = p.y + p.h + 2, x2 = c.x + c.w / 2, y2 = c.y, my = (y1 + y2) / 2;
    return 'M' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' V' + my.toFixed(1) + ' H' + x1.toFixed(1) + ' V' + y1.toFixed(1);
  }

  YT.parts.define('tree', {
    generic: true,
    title: '木',
    use: '証明書の連鎖・DNS の名前の木・DOM',
    lead: '親から子へ枝分かれする木を、段階ごとに枝を出し、壊れた所に印を付けて見せる台本の部品。証明書の連鎖や名前の木のニュースに使う。見本は第17章 場面2 の例。',
    caption: '図　根を上に置いた木。枝は親から子へ。破線の箱は壊れた所、点線は木をまたぐつながり（edge）。x はその段階で変わった物。',
    note: 'node は「札 | 小さい札 < 親の id」で宣言する（根は < を書かない）。木は 3 本・深さ 4 段・葉 6 つまで。',
    sample: [
      'title: 名前の木とゾーン（第17章 場面2 の例）',
      'caption: DNS の名前は根から枝分かれする木。箱 1 つが名前 1 つで、小さい札はそのゾーンを持つ所。',
      'node root: 根（.） | ルートゾーン',
      'node com: com | Verisign < root',
      'node jp: jp | JPRS < root',
      'node yt: youtube.com | Google の ns1〜ns4 < com',
      'node www: www.youtube.com | A・AAAA < yt',
      'node m: m.youtube.com < yt',
      'step: 名前の木',
      'DNS の名前は根から枝分かれする木で、`www.youtube.com` は根 → com → youtube → www とたどった先の葉。`m.youtube.com` は同じ枝の兄弟。',
      'x: root com yt www',
      'step: ゾーンと委任',
      '木を持ち主ごとに切り分けた単位がゾーン。親のゾーンは子の中身を書かず、「youtube.com は ns1.google.com などが担当」という NS レコードと、そのサーバーの番号（グルー）だけを書く。これが委任。',
      'send: com -> yt: NS（委任）',
      'x: com yt',
      'step: ルート：TLD の担当表',
      '根のゾーンには TLD が 1,437 個（2026 年 10 月）と、それぞれの担当サーバーが載る。ルートは答えを持たず、次に聞く先を紹介する。',
      'set: root = 根（.） | TLD 1,437 個',
      'send: root -> com: com の担当',
      'step: TLD：名前ごとの担当表',
      'com のゾーンは Verisign が持ち、中身は登録された名前ごとの NS。youtube.com の行は、持ち主の Google が登録事業者を通して申し込んだもの。jp は JPRS が持つ。',
      'x: com jp',
      'step: 権威サーバー：答えを持つ所',
      'youtube.com のゾーンは Google 自身の ns1〜ns4.google.com が持つ。www の A や AAAA が書いてあるのはここだけで、答えには AA ビットが立つ。',
      'x: yt www',
      'down: www -> 18-ip.html#s1.6: www の A レコードの番号が、IP ヘッダの宛先に入る'
    ].join('\n'),
    steps: function (p) { return YT_ANIM.steps(p); },
    setup: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, svg = ctx.svg;
      A.head(ctx);
      st.mk = S.markers(svg);
      var nodes = A.kinds(p, 'node'), kids = {}, pos = {}, depth = {}, maxD = 0, slot = 0;
      nodes.forEach(function (n) { kids[n.id] = []; });
      nodes.forEach(function (n) { if (n.parent && kids[n.parent]) kids[n.parent].push(n.id); });
      // 葉に左から順に枠を割り当て、親は子の真ん中に置く。木と木の間は半枠あける
      var place = function (id, d) {
        depth[id] = d; if (d > maxD) maxD = d;
        if (!kids[id].length) { pos[id] = slot; slot += 1; return; }
        kids[id].forEach(function (c) { place(c, d + 1); });
        pos[id] = (pos[kids[id][0]] + pos[kids[id][kids[id].length - 1]]) / 2;
      };
      nodes.filter(function (n) { return !n.parent; }).forEach(function (r, k) { if (k) slot += 0.5; place(r.id, 0); });
      // 葉が多いと箱は狭くなる（葉 6・根 3 で 1 枠 128px）。狭い箱は横の余白を詰め、札は折って小さくする（YT_ANIM.card）
      var sw = Math.min(230, XW / Math.max(1, slot)), x0 = X0 + (XW - slot * sw) / 2, w = Math.min(210, sw - 14), pad = w < 150 ? 6 : 10;
      st.gEdge = S.g({}, svg);
      st.gNode = S.g({}, svg);
      // 箱（高さは段階を通した札が入る高さ）。段ごとの高さは、その段で一番高い箱
      st.card = {};
      var rowH = [];
      nodes.forEach(function (n) {
        var c = A.card(st.gNode, x0 + (pos[n.id] + 0.5) * sw - w / 2, 0, w, A.variants(p, n.id), { lcls: 't-sm', scls: 't-xs', minH: 38, pad: pad });
        st.card[n.id] = c;
        rowH[depth[n.id]] = Math.max(rowH[depth[n.id]] || 0, c.h);
      });
      var sumH = rowH.reduce(function (a, b) { return a + b; }, 0);
      var gapY = maxD ? Math.max(26, Math.min(96, (BOT - TOP - sumH) / maxD)) : 0;
      var used = sumH + gapY * maxD, y = TOP + Math.max(0, (BOT - TOP - used) / 2), rowY = [];
      rowH.forEach(function (h, d) { rowY[d] = y; y += h + gapY; });
      nodes.forEach(function (n) {
        var c = st.card[n.id], d = depth[n.id];
        c.y = rowY[d] + (rowH[d] - c.h) / 2;
        c.g.setAttribute('transform', 'translate(0,' + c.y.toFixed(1) + ')');
        c.g.classList.add('fade');
      });
      // 枝（子の id で持つ）と、木をまたぐ edge
      st.branch = {};
      nodes.forEach(function (n) {
        if (!n.parent) return;
        st.branch[n.id] = S.path(branch(st.card[n.parent], st.card[n.id]), { cls: 'f-none s-mid w15' }, st.gEdge);
      });
      st.edge = {};
      A.kinds(p, 'edge').forEach(function (e) {
        var a = st.card[e.from], b = st.card[e.to], ra = { x: a.x, y: a.y, w: a.w, h: a.h }, rb = { x: b.x, y: b.y, w: b.w, h: b.h };
        var pa = A.edgePoint(ra, b.x + b.w / 2, b.y + b.h / 2, 3), pb = A.edgePoint(rb, a.x + a.w / 2, a.y + a.h / 2, 3);
        var path = S.path('M' + pa[0].toFixed(1) + ',' + pa[1].toFixed(1) + ' L' + pb[0].toFixed(1) + ',' + pb[1].toFixed(1), { cls: 'f-none s-mid w15 dash2' }, st.gEdge);
        var mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, horiz = Math.abs(pb[0] - pa[0]) >= Math.abs(pb[1] - pa[1]);
        var tag = A.tag(svg, horiz ? mx : mx + 8, horiz ? my - 12 : my, '', { cls: 't-xs', anchor: horiz ? 'c' : 'l' });
        st.edge[e.id] = { path: path, tag: tag, it: e, pa: pa, horiz: horiz, flat: Math.abs(pb[1] - pa[1]) < 1, mx: mx, my: my, seg: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), lift: Math.max(a.h, b.h) / 2 + 11 };
        // edge はまっすぐ引くので、両端のほかの箱の上を通ると読めない。台本の並び（木と子の宣言の順）で避ける
        nodes.forEach(function (n) {
          if (n.id === e.from || n.id === e.to) return;
          var c = st.card[n.id];
          for (var j = 1; j < 40; j++) {
            var x = pa[0] + (pb[0] - pa[0]) * j / 40, y = pa[1] + (pb[1] - pa[1]) * j / 40;
            if (x > c.x + 2 && x < c.x + c.w - 2 && y > c.y + 2 && y < c.y + c.h - 2) { console.error('[YT] 台本 tree: edge ' + e.id + '（' + e.from + ' と ' + e.to + '）が node ' + n.id + ' の箱の上を通る。木や子の宣言の順を入れ替えて、2 つを近くに置く'); return; }
          }
        });
      });
      // 線の札（edge の札・send の札）の位置: 横向きの短い edge の札は箱の上の縁より上へ。図の中に収める
      st.pos = function (e, text, cls) {
        var w = text ? A.measure(svg, cls, text) : 0, x = e.horiz ? e.mx : e.mx + 8, y = e.horiz ? e.my - 12 : e.my, an = e.horiz ? 'c' : 'l';
        if (e.horiz) {
          if (w + 12 > e.seg && e.flat) y = e.pa[1] - e.lift;   // 持ち上げるのは真横の edge だけ
          x = Math.max(8 + w / 2, Math.min(952 - w / 2, x));
        } else if (x + w > 952) { an = 'r'; x = e.mx - 8; }
        return { x: x, y: y, w: w, an: an };
      };
      // send o が通る edge（親子の枝を通るなら null）と、段階 s で edge e に出る札（e を send が通るなら send の札。edge の札の代わりに出す）
      var byId = {};
      p.items.forEach(function (it) { byId[it.id] = it; });
      st.edgeOf = function (o) {
        if (byId[o.b].parent === o.a || byId[o.a].parent === o.b) return null;
        return Object.keys(st.edge).map(function (k) { return st.edge[k]; }).filter(function (x) { return (x.it.from === o.a && x.it.to === o.b) || (x.it.from === o.b && x.it.to === o.a); })[0] || null;
      };
      st.etext = function (e, s, q) {
        var o = (s.send || []).filter(function (x) { return st.edgeOf(x) === e; })[0];
        return o ? [o.label, 't-sm t-b t-d'] : [q.v ? q.l || '' : '', 't-xs' + (q.x ? ' t-b t-x' : ' t-mid')];
      };
      // send（枝か edge に沿って流れる粒と札）。1 段階に 2 つまで
      st.sends = [0, 1].map(function () {
        var path = S.path('M0,0', { cls: 'f-none s-none' }, st.gEdge);
        return { path: path, dots: A.flowDots(svg, 3, 'f-d'), tag: A.tag(svg, 0, 0, '', { cls: 't-sm t-b t-d', anchor: 'l' }) };
      });
      // edge の札（edge を通る send の札も）と send の札は、流れる粒より上
      Object.keys(st.edge).forEach(function (id) { svg.appendChild(st.edge[id].tag.g); });
      st.sends.forEach(function (sd) { svg.appendChild(sd.tag.g); });
      // 掘り下げの印の札: 箱は下の右の角の外（2 つ目は下の左の角の外、3 つ目は上の縁の右。子への枝と edge の札に重ねない）、edge は札の右
      st.anchor = function (id, s, k) {
        var c = st.card[id], e = st.edge[id];
        if (c) {
          var pt = [[c.x + c.w + 4, c.y + c.h - 4], [c.x - 4, c.y + c.h - 4], [c.x + c.w - 14, c.y - 4]][Math.min(k || 0, 2)];
          return { el: c.rect, x: pt[0], y: pt[1], dx: 0, dy: 0 };
        }
        if (!e) return null;
        var tx = st.etext(e, s || A.at(ctx), A.stOf(ctx, s, id)), r = st.pos(e, tx[0], tx[1]);
        if (!r.w) return { el: e.path, x: e.mx + 16, y: e.my, dx: 30 };
        var left = r.an === 'r' || (r.an === 'c' && r.x + r.w / 2 + 18 + 30 * (k || 0) > 945);
        var x = r.an === 'l' ? r.x + r.w + 18 : r.an === 'r' ? r.x - r.w - 18 : left ? r.x - r.w / 2 - 18 : r.x + r.w / 2 + 18;
        return { el: e.path, x: x, y: r.y, dx: left ? -30 : 30 };
      };
    },
    onStep: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, now = A.at(ctx);
      Object.keys(st.card).forEach(function (id) {
        var s = now.st[id] || {}, c = st.card[id];
        c.set(s.l, s.s, s);
        c.g.classList.toggle('hide', !s.v);
      });
      Object.keys(st.branch).forEach(function (id) {
        var s = now.st[id] || {}, b = st.branch[id];
        b.style.display = s.v ? '' : 'none';
        b.setAttribute('class', s.x ? 'f-none s-x w2' : 'f-none s-mid w15');
        b.setAttribute('marker-end', st.mk(s.x ? 'x' : 'mid'));
      });
      Object.keys(st.edge).forEach(function (id) {
        var s = now.st[id] || {}, e = st.edge[id];
        e.path.style.display = s.v ? '' : 'none';
        e.path.setAttribute('class', 'f-none ' + (s.x ? 's-x w2' : 's-mid w15') + (s.b ? ' dash' : e.it.dir ? '' : ' dash2'));
        if (e.it.dir) e.path.setAttribute('marker-end', st.mk(s.x ? 'x' : 'mid'));
        var tx = st.etext(e, now, s), q = st.pos(e, tx[0], tx[1]);
        e.tag.set(tx[0], tx[1], q.x, q.y, q.an);
      });
      st.sends.forEach(function (sd, k) {
        var o = now.send[k];
        sd.on = !!o;
        if (!o) { sd.tag.set(''); return; }
        var a = st.card[o.a], b = st.card[o.b], e = st.edgeOf(o), d;
        if (e) {
          var dd = e.path.getAttribute('d').match(/-?[\d.]+/g).map(Number);
          d = e.it.from === o.a ? 'M' + dd[0] + ',' + dd[1] + ' L' + dd[2] + ',' + dd[3] : 'M' + dd[2] + ',' + dd[3] + ' L' + dd[0] + ',' + dd[1];
        } else d = byIdParent(p, o.b) === o.a ? branch(a, b) : branchUp(b, a);
        sd.path.setAttribute('d', d);
        if (e) { sd.tag.set(''); return; }   // edge を通る send の札は、edge の札の所に出す（上の etext）
        // 枝を通る send の札は道の真ん中の右（枝の横の線の上）。図の右へ出るなら左
        var q = A.point(sd.path, 0.5), tw = A.measure(ctx.svg, 't-sm t-b', o.label), r = q.x + 10 + tw <= 952;
        sd.tag.set(o.label, 't-sm t-b t-d', r ? q.x + 10 : q.x - 10, q.y - 11, r ? 'l' : 'r');
      });
    },
    frame: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx), f = A.growth(ctx);
      Object.keys(st.branch).forEach(function (id) { A.grow(st.branch[id], now.fresh.indexOf(id) >= 0 ? f : 1); });
      Object.keys(st.edge).forEach(function (id) { A.grow(st.edge[id].path, now.fresh.indexOf(id) >= 0 ? f : 1); });
      st.sends.forEach(function (sd) { sd.dots.update(ctx, sd.path, sd.on, 70); });
    }
  });
})();
