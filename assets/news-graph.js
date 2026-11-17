/* ============================================================
   層の地図と層の歩き (assets/news-graph.js)

   ニュースのページの 2 つの図を描く。層は assets/layers.js（window.YT_LAYERS）。場面の枠は tools/build-news.mjs が書く。
   日刊のプルリクエストでは変わらない。どちらの図も、層を列（計算機の中・通信・配信と動画、下に横断）に固定して並べる。
   力学で並べるグラフは層の上下が消えるので使わない（docs/layers-plan.md §2）。

   層の地図（一覧と月のページの場面「層の地図」。データは news/news-data.js の window.YT_NEWS）
     YT_NEWS_GRAPH.mount(section, { period: true })     // 一覧: 期間（全部・直近 30 日）を選べる
     YT_NEWS_GRAPH.mount(section, { month: 'YYYY-MM' }) // 月のページ: その月のノートだけ
     左の一覧でノートを選ぶと、その層の札が x の枠になり、中心の層の札から各層へ x の線を引く。
     線の太さは、両方の層に触れたノートの数（期間の中）。層の札を押すと、一覧をその層で絞る。
     URL の ?layer=os・?scene=9-2・?ch=9 で、一覧を絞って開く（ノートの層の札と、章の場面の札から来る）。

   層の歩き（ノートのページの場面「層」。docs/layers-plan.md §3 P3）
     YT.chapter({ meta, scenes: { s1: YT_NEWS_GRAPH.walk(section, data) } })
       data = { layers: [ノートの層の id], missing: [教材に無い概念],
                rows: [{ l: [{ to: '28-compiler.html#s2.4', ids: [層の id], n: 1（「教材に無い」行の近い場面） }], m: [概念の番号] }] }
     「層」の表（層 | 起きること | 章・場面）の 1 行が 1 段階。段階の題・文・章と場面は、場面の中の表（縦読み版に出す）から写す。
     1画面版: いまの行の層を x の枠にし、前の行の層から線を伸ばす。札の右の数字は、その層が出る行。
       層の札の ↓（YT.drill の印）と、章と場面の欄のリンクで、章の場面を板に開く。
     縦読み版: 表を縦に並べ、図は全部の行の道筋（x を使わない）。表の章と場面のリンクも板に開く。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg, U = YT.util;
  /* 層の札の位置（viewBox 960×560）。列の間（110px 余り）に線と掘り下げの札を通す */
  var COLX = { pc: 16, net: 362, media: 708 }, BW = 220, BH = 27, TOP = 40, RH = 33;
  var CROSS = ['pc', 'net', 'media'];   // 横断の層は、row の順に 3 つの列の下へ置く
  var CROSS_Y = 474, MISS_Y = 528;
  /* 通信の列の、札の無い帯（y の中心）。計算機の中と配信と動画を結ぶ線は、この帯を横切る */
  var BANDS = [52, 284, 419];
  var DAY = 86400000;

  /* 層 x の札の位置 */
  function boxOf(x) {
    if (x.col === 'cross') return { x: COLX[CROSS[x.row]], y: CROSS_Y, w: BW, h: BH, col: CROSS[x.row] };
    return { x: COLX[x.col], y: TOP + (11 - x.row) * RH, w: BW, h: BH, col: x.col };
  }
  /* 2 つの札を結ぶ線。札の上は通らない。
     同じ列: 列の右の隙間へ膨らませる（右端の列だけ左へ）。札の右の掘り下げの印（中心が札から 16px）より外まで膨らませ、
     隣り合う札の間の短い線も印に隠れないようにする。隣の列: 列の間の隙間で曲げる。
     計算機の中と配信と動画: 通信の列の札の無い帯（BANDS のうち近い方）を横切る */
  function route(a, b) {
    var ay = a.y + a.h / 2, by = b.y + b.h / 2;
    if (a.col === b.col) {
      var d = a.col === 'media' ? -1 : 1;
      var ax = d > 0 ? a.x + a.w : a.x, bx = d > 0 ? b.x + b.w : b.x;
      var bulge = 44 + Math.min(26, Math.abs(by - ay) * 0.12);
      return 'M' + ax + ',' + ay + ' C' + (ax + d * bulge) + ',' + ay + ' ' + (bx + d * bulge) + ',' + by + ' ' + bx + ',' + by;
    }
    var l = a.x < b.x ? a : b, r = l === a ? b : a;
    var y1 = l.y + l.h / 2, y2 = r.y + r.h / 2, x1 = l.x + l.w, x2 = r.x;
    if (l.col === 'pc' && r.col === 'media') {
      var band = BANDS.reduce(function (p, q) { return Math.abs(q - y1) + Math.abs(q - y2) < Math.abs(p - y1) + Math.abs(p - y2) ? q : p; });
      var n0 = COLX.net, n1 = COLX.net + BW, g1 = (x1 + n0) / 2, g2 = (n1 + x2) / 2;
      return 'M' + x1 + ',' + y1 + ' C' + g1 + ',' + y1 + ' ' + g1 + ',' + band + ' ' + n0 + ',' + band +
        ' L' + n1 + ',' + band + ' C' + g2 + ',' + band + ' ' + g2 + ',' + y2 + ' ' + x2 + ',' + y2;
    }
    var mx = (x1 + x2) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
  }
  /* 共起の数 → 線の太さのクラス */
  function wCls(n) { return n >= 8 ? 'w6' : n >= 5 ? 'w4' : n >= 3 ? 'w3' : n >= 2 ? 'w2' : 'w15'; }
  /* 文字の幅の見積もり（11px。札は隠れた場面でも作るので getBBox を使わない） */
  function textW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e7f ? 11 : 6.4; return w; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  /* 列の名前と、横断・教材に無いの段の見出し */
  function heads(svg, L, missLabel) {
    L.cols.forEach(function (c) {
      if (c.id === 'cross') S.text(16, CROSS_Y - 10, '横断 — どの層にも出てくる', { cls: 't-sm t-dim' }, svg);
      else S.text(COLX[c.id], 22, c.name, { cls: 't-sm t-dim t-b' }, svg);
    });
    S.text(16, MISS_Y - 10, missLabel, { cls: 't-sm t-dim' }, svg);
  }
  /* 教材に無い概念の札を左から並べる。収まらない分は「ほか N」。tail は名前の後ろに足す文字の幅 */
  function missRow(names, tail) {
    var out = [], mx = 16;
    for (var i = 0; i < names.length; i++) {
      var w = Math.round(textW(names[i]) + 20 + (tail ? tail(i) : 0));
      if (mx + w > 944) return { boxes: out, more: names.length - i, x: mx };
      out.push({ i: i, x: mx, w: w });
      mx += w + 8;
    }
    return { boxes: out, more: 0, x: mx };
  }

  /* ---------------------------------------------------------------
     層の地図
     --------------------------------------------------------------- */
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
    heads(svg, L, '教材に無い — 選んだノートが挙げた概念');

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
          S.path(route(c0, boxOf(L.byId[id])), { cls: 'f-none s-x round ' + wCls(co) }, gEdge);
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
      var miss = sel ? sel.missing : [];
      if (!sel) S.text(16, MISS_Y + 18, 'ノートを選ぶと出る', { cls: 't-sm t-dim' }, gMiss);
      else if (!miss.length) S.text(16, MISS_Y + 18, 'このノートは挙げていない', { cls: 't-sm t-dim' }, gMiss);
      var row = missRow(miss);
      row.boxes.forEach(function (m) {
        S.rect(m.x, MISS_Y, m.w, BH, { rx: 4, cls: 'f-sf s-mid w1 dash' }, gMiss);
        S.text(m.x + 10, MISS_Y + 18, miss[m.i], { cls: 't-sm t-mid' }, gMiss);
      });
      if (row.more) S.text(row.x + 4, MISS_Y + 18, 'ほか ' + row.more, { cls: 't-sm t-dim' }, gMiss);
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

  /* ---------------------------------------------------------------
     層の歩き
     --------------------------------------------------------------- */
  var isFit = function () { return document.documentElement.classList.contains('fit'); };
  /* 札の右に並べる行の番号の幅（数字 6.4px、区切りの「・」11px） */
  function numsW(ks) { return ks.reduce(function (w, k, j) { return w + String(k).length * 6.4 + (j ? 11 : 0); }, 0); }

  function walk(sec, data) {
    var L = window.YT_LAYERS;
    data = data || {};
    var trs = sec ? [].slice.call(sec.querySelectorAll('.nw-wtbl tbody tr')) : [];
    var rows = (data.rows || []).slice(0, trs.length);
    if (!L || !rows.length) return {};
    var cell = function (i, k) { return trs[i] && trs[i].cells[k] ? trs[i].cells[k] : null; };
    var textOf = function (i, k) { var c = cell(i, k); return c ? c.textContent.replace(/\s+/g, ' ').trim() : ''; };
    var steps = rows.map(function (r, i) { return { title: textOf(i, 0), text: textOf(i, 1) }; });
    /* 板の上端のつなぎの一文: 行の題と、起きることの最初の文 */
    var bridge = function (i) { var t = textOf(i, 1); return steps[i].title + '：' + ((/^.*?。/.exec(t) || [t])[0]); };
    var notes = {};
    (data.layers || []).forEach(function (id) { notes[id] = 1; });
    var missing = data.missing || [];

    /* 段階ごとの層（{ id: 'solid' | 'near' }）と、層・概念が出る段階（1 始まり） */
    var at = rows.map(function (r) {
      var o = {};
      r.l.forEach(function (x) { x.ids.forEach(function (id) { if (L.byId[id] && o[id] !== 'solid') o[id] = x.n ? 'near' : 'solid'; }); });
      return o;
    });
    var seenIn = {}, missIn = missing.map(function () { return []; });
    at.forEach(function (o, i) { Object.keys(o).forEach(function (id) { (seenIn[id] || (seenIn[id] = [])).push(i + 1); }); });
    rows.forEach(function (r, i) { (r.m || []).forEach(function (k) { if (missIn[k] && missIn[k].indexOf(i + 1) < 0) missIn[k].push(i + 1); }); });
    /* 行 i へ伸びる線: 前に層のあった行の層から、新しく出た層へ。近い順に 1 本ずつ */
    var center = function (id) { var b = boxOf(L.byId[id]); return [b.x + b.w / 2, b.y + b.h / 2]; };
    var hops = at.map(function (o, i) {
      var j = i - 1;
      while (j >= 0 && !Object.keys(at[j]).length) j--;
      if (j < 0) return [];
      var prev = Object.keys(at[j]);
      return Object.keys(o).filter(function (id) { return !(id in at[j]); }).map(function (id) {
        var c = center(id);
        var from = prev.slice().sort(function (a, b) { var p = center(a), q = center(b); return Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q[0] - c[0], q[1] - c[1]); })[0];
        return { from: from, to: id, near: o[id] === 'near' };
      });
    });

    /* 札の文字: 番号と並べて収まらなければ短い名前 */
    function nameFor(x) {
      var ks = seenIn[x.id] || [];
      return !ks.length || textW(x.name) + numsW(ks) + 32 <= BW ? x.name : L.label(x.id);
    }
    /* 番号を tspan で並べる。cur（0 始まり。-1 なら無し）の番号だけ x の太字 */
    function putNums(t, ks, cur) {
      S.clear(t);
      ks.forEach(function (k, j) {
        if (j) S.el('tspan', { text: '・', cls: 't-dim' }, t);
        S.el('tspan', { text: String(k), cls: k - 1 === cur ? 't-x t-b' : 't-mid' }, t);
      });
    }

    function setup(ctx) {
      var st = ctx.state, svg = ctx.svg;
      heads(svg, L, '教材に無い — このノートが挙げた概念');
      st.gTrail = S.g({}, svg); st.gHop = S.g({}, svg); st.gBox = S.g({}, svg); st.gMiss = S.g({}, svg);
      st.box = {};
      L.layers.forEach(function (x) {
        var b = boxOf(x), g = S.g({}, st.gBox);
        st.box[x.id] = {
          b: b,
          rect: S.rect(b.x, b.y, b.w, b.h, { rx: 4 }, g),
          name: S.text(b.x + 10, b.y + 18, nameFor(x), {}, g),
          nums: S.text(b.x + b.w - 10, b.y + 18, '', { cls: 't-sm t-mono t-end' }, g)
        };
      });
      /* 教材に無い概念: 名前の後ろに番号 */
      var mr = missRow(missing, function (i) { return missIn[i].length ? numsW(missIn[i]) + 8 : 0; });
      st.miss = mr.boxes.map(function (m) {
        var g = S.g({}, st.gMiss);
        var rect = S.rect(m.x, MISS_Y, m.w, BH, { rx: 4 }, g);
        var t = S.text(m.x + 10, MISS_Y + 18, missing[m.i], {}, g);
        var nums = S.text(m.x + m.w - 10, MISS_Y + 18, '', { cls: 't-sm t-mono t-end' }, g);
        return { i: m.i, rect: rect, t: t, nums: nums };
      });
      if (mr.more) S.text(mr.x + 4, MISS_Y + 18, 'ほか ' + mr.more, { cls: 't-sm t-dim' }, st.gMiss);
      if (!missing.length) S.text(16, MISS_Y + 18, 'このノートは挙げていない', { cls: 't-sm t-dim' }, st.gMiss);

      /* 掘り下げの印: 行のリンクごとに、その層の札の右（右端の列で収まらなければ左）。リンクが同じ札に重なれば横へずらす */
      rows.forEach(function (r, i) {
        var used = {}, n = {};
        r.l.forEach(function (x) {
          var ids = x.ids.filter(function (id) { return st.box[id]; });
          if (!ids.length) return;
          var id = ids.filter(function (k) { return !used[k]; })[0] || ids[0];
          used[id] = 1;
          var o = st.box[id], k = n[id] = (n[id] || 0) + 1, bx = o.b;
          var x0 = bx.x + bx.w + 16 + (k - 1) * 28;
          if (x0 > 960 - 15) x0 = bx.x - 16 - (k - 2) * 28;
          YT.drill.mark(o.rect, { to: x.to, label: L.label(id), bridge: bridge(i), steps: [i + 1], at: [x0, bx.y + bx.h / 2] });
        });
      });

      /* 説明欄: 文の下に「章・場面」の欄を足す。表の章と場面のリンクは、章へ移らずに板を開く */
      var narr = ctx.root.querySelector('.narr');
      st.ref = el('p', 'nw-ref');
      if (narr) narr.appendChild(st.ref);
      var th = sec.querySelector('.nw-wtbl thead th:last-child');
      st.refLabel = th ? th.textContent.trim() : '';
      sec.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[data-to]');
        if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        var tr = a.closest('tr'), i = tr ? trs.indexOf(tr) : ctx.step;
        e.preventDefault();
        YT.drill.open({ to: a.getAttribute('data-to'), bridge: i >= 0 ? bridge(i) : '', label: a.textContent });
      });
    }

    /* 段階 i（1画面版）か、全部の道筋（縦読み版）を描く。エンジンは setup の前にも resize を呼ぶ（縦読み版で場面を移ったとき）ので、その間は描かない */
    function render(ctx) {
      var st = ctx.state, fit = isFit(), cur = fit ? ctx.step : -1;
      if (!st.box) return;
      st.fit = fit;
      L.layers.forEach(function (x) {
        var o = st.box[x.id], ks = seenIn[x.id] || [], lit = cur >= 0 ? at[cur][x.id] : '';
        var nearOnly = ks.length && ks.every(function (k) { return at[k - 1][x.id] === 'near'; });
        o.rect.setAttribute('class', lit ? 'f-x-soft s-x w2' + (lit === 'near' ? ' dash' : '') : notes[x.id] || ks.length ? 'f-sf s-fg w1' + (nearOnly ? ' dash' : '') : 'f-sf s-rule w1');
        o.name.setAttribute('class', 't-sm' + (lit ? ' t-b' : notes[x.id] || ks.length ? '' : ' t-dim'));
        putNums(o.nums, ks, cur);
      });
      st.miss.forEach(function (m) {
        var on = cur >= 0 && (rows[cur].m || []).indexOf(m.i) >= 0;
        m.rect.setAttribute('class', on ? 'f-x-soft s-x w2 dash' : 'f-sf s-mid w1 dash');
        m.t.setAttribute('class', 't-sm' + (on ? ' t-b' : ' t-mid'));
        putNums(m.nums, missIn[m.i], cur);
      });
      /* 線: いまの行へ伸びる線は x、それより前の行の線は細い灰色（縦読み版は全部の行を灰色で） */
      S.clear(st.gTrail); S.clear(st.gHop);
      st.grow = [];
      hops.forEach(function (hs, i) {
        if (cur >= 0 && i > cur) return;
        hs.forEach(function (h) {
          var a = boxOf(L.byId[h.from]), b = boxOf(L.byId[h.to]), d = route(a, b);
          // route は列が違うと左の札から引くので、前の行の層が右にあれば線の終わりの側から伸ばす
          if (i === cur) st.grow.push({ p: S.path(d, h.near ? { cls: 'f-none s-x w2 round dash' } : { cls: 'f-none s-x w2 round', pathLength: 1 }, st.gHop), near: h.near, rev: a.col !== b.col && a.x > b.x });
          else S.path(d, { cls: 'f-none s-mid w15 round' + (h.near ? ' dash' : '') }, st.gTrail);
        });
      });
      /* 説明欄の文と「章・場面」は、表の行から写す（リンクと太字を保つ） */
      var i = ctx.step, c1 = cell(i, 1), c2 = cell(i, 2);
      if (ctx.ui && ctx.ui.text && c1) ctx.ui.text.innerHTML = c1.innerHTML;
      if (c2) st.ref.innerHTML = (st.refLabel ? '<span class="nw-ref-l">' + YT.esc(st.refLabel) + '</span>' : '') + c2.innerHTML;
      ctx.$$('.nw-route li').forEach(function (li, j) {
        li.classList.toggle('on', j === i);
        var a = li.querySelector('a');
        if (a) { if (j === i) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); }
      });
    }

    return {
      steps: steps,
      setup: setup,
      onStep: function (ctx) { render(ctx); },
      /* いまの行へ伸びる線。止めているとき（動きを減らす設定を含む）は伸び切った姿 */
      frame: function (ctx) {
        var st = ctx.state;
        if (st.fit !== isFit()) render(ctx);
        if (!st.grow) return;
        var f = YT.motion.playing ? U.ease.out(U.prog(ctx.ts, 0.1, 0.6)) : 1;
        st.grow.forEach(function (g) {
          if (g.near) { g.p.style.opacity = f.toFixed(3); return; }
          g.p.style.strokeDasharray = '1 1';   // 長さ 1（pathLength）の線の、始め（rev なら終わり）から f だけを見せる
          g.p.style.strokeDashoffset = (g.rev ? f - 1 : 1 - f).toFixed(4);
          g.p.style.opacity = f > 0.005 ? '' : '0';
        });
      },
      resize: function (ctx) { if (ctx.state.fit !== isFit()) render(ctx); }
    };
  }

  window.YT_NEWS_GRAPH = { mount: mount, walk: walk, boxOf: boxOf, route: route };
})();
