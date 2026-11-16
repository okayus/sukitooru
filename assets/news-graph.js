/* ============================================================
   層の地図 (assets/news-graph.js)

   ニュースの一覧と月のページの場面「層の地図」に、左の一覧と右の図を入れる。場面の枠は tools/build-news.mjs が書く。
   データは news/news-data.js（window.YT_NEWS）と assets/layers.js（window.YT_LAYERS）。日刊のプルリクエストでは変わらない。

     YT_NEWS_GRAPH.mount(section, { period: true })     // 一覧: 期間（全部・直近 30 日）を選べる
     YT_NEWS_GRAPH.mount(section, { month: 'YYYY-MM' }) // 月のページ: その月のノートだけ

   図: 層を列（計算機の中・通信・配信と動画、下に横断）に固定して並べ、層ごとにノートの数を出す。
   一覧でノートを選ぶと、その層の札が x の枠になり、中心の層の札から各層へ x の線を引く。
   線の太さは、両方の層に触れたノートの数（期間の中）。層の札を押すと、一覧をその層で絞る。
   URL の ?layer=os・?scene=9-2・?ch=9 で、一覧を絞って開く（ノートの層の札と、章の場面の札から来る）。
   力学で並べるグラフは層の上下が消えるので使わない（docs/layers-plan.md §2）。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var COLX = { pc: 16, net: 362, media: 708 }, BW = 236, BH = 27, TOP = 40, RH = 33;
  var CROSS = ['pc', 'net', 'media'];   // 横断の層は、row の順に 3 つの列の下へ置く
  var CROSS_Y = 474, MISS_Y = 528;
  var DAY = 86400000;

  /* 層の札の位置（viewBox 960×560） */
  function boxOf(x) {
    if (x.col === 'cross') return { x: COLX[CROSS[x.row]], y: CROSS_Y, w: BW, h: BH, col: CROSS[x.row] };
    return { x: COLX[x.col], y: TOP + (11 - x.row) * RH, w: BW, h: BH, col: x.col };
  }
  /* 2 つの札を結ぶ線。列の間の隙間を通す。同じ列なら隙間の側へ膨らませる（右端の列だけ左へ） */
  function edgePath(a, b) {
    var ay = a.y + a.h / 2, by = b.y + b.h / 2;
    if (a.col === b.col) {
      var d = a.col === 'media' ? -1 : 1;
      var ax = d > 0 ? a.x + a.w : a.x, bx = d > 0 ? b.x + b.w : b.x;
      var bulge = 22 + Math.min(42, Math.abs(by - ay) * 0.12);
      return 'M' + ax + ',' + ay + ' C' + (ax + d * bulge) + ',' + ay + ' ' + (bx + d * bulge) + ',' + by + ' ' + bx + ',' + by;
    }
    var l = a.x < b.x ? a : b, r = l === a ? b : a;
    var y1 = l.y + l.h / 2, y2 = r.y + r.h / 2, x1 = l.x + l.w, x2 = r.x, mx = (x1 + x2) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
  }
  /* 共起の数 → 線の太さのクラス */
  function wCls(n) { return n >= 8 ? 'w6' : n >= 5 ? 'w4' : n >= 3 ? 'w3' : n >= 2 ? 'w2' : 'w15'; }
  /* 文字の幅の見積もり（11px。札は隠れた場面でも作るので getBBox を使わない） */
  function textW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e7f ? 11 : 6.4; return w; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function mount(sec, opts) {
    var L = window.YT_LAYERS, NEWS = window.YT_NEWS;
    var side = sec && sec.querySelector('.nwg-side'), svg = sec && sec.querySelector('svg');
    if (!L || !side || !svg) return;
    if (!NEWS) { side.appendChild(el('p', 'nwg-foot', 'ノートのデータ（news/news-data.js）を読めなかった。')); return; }
    opts = opts || {};
    var q = new URLSearchParams(location.search);
    var st = {
      period: 'all',
      layer: L.byId[q.get('layer')] ? q.get('layer') : '',
      scene: /^\d+-\d+$/.test(q.get('scene') || '') ? q.get('scene') : '',
      ch: /^\d+$/.test(q.get('ch') || '') ? q.get('ch') : '',
      sel: ''
    };
    var since = ymd(Date.now() - 30 * DAY);

    /* 期間（と月）の中のノート。数と線の太さはこれで数える */
    function inRange() {
      return NEWS.filter(function (n) {
        if (opts.month) return n.date.slice(0, 7) === opts.month;
        return st.period === 'all' || n.date >= since;
      });
    }
    /* 一覧に出すノート（期間に加えて、層・場面・章で絞る） */
    function listed(ns) {
      return ns.filter(function (n) {
        if (st.layer && n.layers.indexOf(st.layer) < 0) return false;
        if (st.scene && n.scenes.indexOf(st.scene) < 0) return false;
        if (st.ch && !n.scenes.some(function (k) { return k === st.ch || k.indexOf(st.ch + '-') === 0; })) return false;
        return true;
      });
    }
    function syncUrl() {
      var p = new URLSearchParams();
      if (st.layer) p.set('layer', st.layer);
      if (st.scene) p.set('scene', st.scene);
      if (st.ch) p.set('ch', st.ch);
      var s = p.toString();
      try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* 書き換えられなくても絞り込みは効く */ }
    }

    /* ---------- 左の列 ---------- */
    var ctl = el('div', 'nwg-ctl'), list = el('ol', 'nwg-list'), foot = el('p', 'nwg-foot');
    list.setAttribute('aria-label', 'ノート（新しい順）');
    side.appendChild(ctl); side.appendChild(list); side.appendChild(foot);

    function filterChip(label, clear) {
      var c = el('span', 'nwg-chip');
      c.appendChild(document.createTextNode(label));
      var b = el('button', '', '×');
      b.type = 'button';
      b.setAttribute('aria-label', label + ' の絞り込みを外す');
      b.addEventListener('click', function () { clear(); syncUrl(); render(); });
      c.appendChild(b);
      return c;
    }
    function drawCtl() {
      ctl.textContent = '';
      if (opts.period) {
        var seg = el('span', 'nwg-seg');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', '期間');
        [['all', '全部'], ['30', '直近 30 日']].forEach(function (p) {
          var b = el('button', '', p[1]);
          b.type = 'button';
          b.setAttribute('aria-pressed', st.period === p[0] ? 'true' : 'false');
          b.addEventListener('click', function () { st.period = p[0]; render(); });
          seg.appendChild(b);
        });
        ctl.appendChild(seg);
      } else ctl.appendChild(el('span', 'nwg-label', opts.month + ' のノート'));
      if (st.layer) ctl.appendChild(filterChip('層: ' + L.byId[st.layer].name, function () { st.layer = ''; }));
      if (st.scene) ctl.appendChild(filterChip('第' + st.scene.split('-')[0] + '章 場面' + st.scene.split('-')[1], function () { st.scene = ''; }));
      if (st.ch) ctl.appendChild(filterChip('第' + st.ch + '章', function () { st.ch = ''; }));
    }
    function drawList(ns) {
      list.textContent = '';
      ns.forEach(function (n) {
        var li = el('li', n.slug === st.sel ? 'on' : '');
        var b = el('button', 'nwg-pick');
        b.type = 'button';
        b.setAttribute('aria-pressed', n.slug === st.sel ? 'true' : 'false');
        b.appendChild(el('span', 'd', n.date + (n.daily ? ' ／ 日刊' : '')));
        b.appendChild(el('b', '', n.title));
        b.appendChild(el('span', 'c', '中心: ' + (L.byId[n.center] ? L.byId[n.center].name : '—') + '・層 ' + n.layers.length));
        b.addEventListener('click', function () { st.sel = n.slug; render(); });
        var a = el('a', '', '読む ›');
        a.href = n.slug + '.html';
        li.appendChild(b);
        li.appendChild(a);
        list.appendChild(li);
      });
      if (!ns.length) list.appendChild(el('li', 'nwg-none', 'この絞り込みに当たるノートは無い。'));
    }

    /* ---------- 右の図 ---------- */
    var gEdge = S.g({}, svg), gBox = S.g({}, svg), gMiss = S.g({}, svg);
    L.cols.forEach(function (c) {
      if (c.id === 'cross') S.text(16, CROSS_Y - 10, '横断 — どの層にも出てくる', { cls: 't-sm t-dim' }, svg);
      else S.text(COLX[c.id], 22, c.name, { cls: 't-sm t-dim t-b' }, svg);
    });
    S.text(16, MISS_Y - 10, '教材に無い — 選んだノートが挙げた概念', { cls: 't-sm t-dim' }, svg);

    function drawFig(range, sel) {
      S.clear(gEdge); S.clear(gBox); S.clear(gMiss);
      var count = {};
      L.layers.forEach(function (x) { count[x.id] = 0; });
      range.forEach(function (n) { n.layers.forEach(function (id) { if (id in count) count[id]++; }); });
      var mine = sel ? sel.layers : [];
      /* 線: 選んだノートの中心の層から、ほかの層へ。太さは期間の中の共起 */
      if (sel && L.byId[sel.center]) {
        var c0 = boxOf(L.byId[sel.center]);
        mine.forEach(function (id) {
          if (id === sel.center || !L.byId[id]) return;
          var co = range.filter(function (n) { return n.layers.indexOf(id) >= 0 && n.layers.indexOf(sel.center) >= 0; }).length;
          S.path(edgePath(c0, boxOf(L.byId[id])), { cls: 'f-none s-x round ' + wCls(co) }, gEdge);
        });
      }
      /* 層の札 */
      L.layers.forEach(function (x) {
        var b = boxOf(x), on = mine.indexOf(x.id) >= 0, center = sel && sel.center === x.id, pick = st.layer === x.id;
        var a = S.el('a', { href: '?layer=' + x.id + location.hash, cls: 'nwg-box', 'aria-label': x.name + '（ノート ' + count[x.id] + ' 件）。押すと、一覧をこの層で絞る' }, gBox);
        S.rect(b.x, b.y, b.w, b.h, { rx: 4, cls: (center ? 'f-x-soft' : 'f-sf') + ' ' + (on ? 's-x w2' : pick ? 's-fg w2' : 's-rule w1') }, a);
        S.text(b.x + 10, b.y + 18, x.name, { cls: 't-sm' + (count[x.id] ? '' : ' t-dim') + (on ? ' t-b' : '') }, a);
        S.text(b.x + b.w - 10, b.y + 18, count[x.id] ? String(count[x.id]) : '—', { cls: 't-sm t-mono t-end' + (count[x.id] ? ' t-b' : ' t-dim') }, a);
        a.addEventListener('click', function (e) {
          e.preventDefault();
          st.layer = st.layer === x.id ? '' : x.id;
          syncUrl();
          render();
        });
      });
      /* 教材に無い概念（破線の札） */
      var mx = 16, miss = sel ? sel.missing : [];
      if (!sel) S.text(16, MISS_Y + 18, 'ノートを選ぶと出る', { cls: 't-sm t-dim' }, gMiss);
      else if (!miss.length) S.text(16, MISS_Y + 18, 'このノートは挙げていない', { cls: 't-sm t-dim' }, gMiss);
      for (var i = 0; i < miss.length; i++) {
        var w = Math.round(textW(miss[i]) + 20);
        if (mx + w > 944) { S.text(mx + 4, MISS_Y + 18, 'ほか ' + (miss.length - i), { cls: 't-sm t-dim' }, gMiss); break; }
        S.rect(mx, MISS_Y, w, BH, { rx: 4, cls: 'f-sf s-mid w1 dash' }, gMiss);
        S.text(mx + 10, MISS_Y + 18, miss[i], { cls: 't-sm t-mid' }, gMiss);
        mx += w + 8;
      }
    }

    function render() {
      var range = inRange(), ns = listed(range);
      if (!ns.some(function (n) { return n.slug === st.sel; })) st.sel = ns.length ? ns[0].slug : '';
      var sel = null;
      ns.forEach(function (n) { if (n.slug === st.sel) sel = n; });
      drawCtl();
      drawList(ns);
      drawFig(range, sel);
      foot.textContent = ns.length + ' 件' + (ns.length !== range.length ? '（' + range.length + ' 件のうち）' : '') + '。ノートを押すと、図にそのノートの層が出る。層の札を押すと、その層で絞る。';
    }
    render();
  }

  window.YT_NEWS_GRAPH = { mount: mount };
})();
