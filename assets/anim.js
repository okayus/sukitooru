/* ============================================================
   台本の部品の共通 (assets/anim.js)

   ニュースのノートの台本（```anim。読み方は assets/anim-script.js）を動かす部品（assets/parts/seq.js・mem.js・
   stack.js・boxes.js・tree.js・timeline.js。news/anim/<名前>.js の手書きの部品も）が使う道具と、
   ニュースのページの場面の組み立て。engine.js の後、部品より前に読み込む。
     YT_ANIM.scene(section, { part, script, html })   ノートの場面（tools/build-news.mjs が呼ぶ形で書く）。
                                                     script は anim-script.js が段階ごとの姿まで決めた台本、html は段階の本文の HTML
     YT_ANIM.steps(script)    部品の steps（段階の題と本文）
     YT_ANIM.at(ctx) / is(ctx, id)   いまの段階の姿（{ v, x, b, l, s, t }）
     YT_ANIM.card(...)        札と小さい札の箱（幅に収まらない札は 2 行に折り、それでも入らなければ字を小さくする）
     YT_ANIM.flowDots(...)    道に沿って流れる粒（時刻から位置を決めるので、frame の dt が 0 でも同じ姿）
     YT_ANIM.downs(ctx)       台本の down: を掘り下げの印にする（部品は state.anchor(id, 段階, k) で札の位置を返す）
   部品の約束（docs/authoring.md §5.6）: setup で全部の物を作り、onStep で段階の姿を全部決め、frame は ctx.ts から描く。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg, U = YT.util;

  /* ---------- 段階の姿 ---------- */
  /* 段階の題と本文。本文は台本の Markdown（parts.html ではエンジンの簡易マークアップで `コード` と **太字** が効く）。
     ニュースのページは本文の HTML を onStep で入れ直すので、build-news.mjs は記号を外した plain だけを渡す */
  function steps(p) { return ((p && p.steps) || []).map(function (s) { return { title: s.title, text: s.text != null ? s.text : s.plain }; }); }
  var NONE = { st: {}, fresh: [], send: [], down: [] };   // 台本が読めなかったとき（parts.html は誤りを console に出し、空の図にする）
  function at(ctx) { var ss = (ctx.params && ctx.params.steps) || []; return ss[Math.min(ctx.step, ss.length - 1)] || ss[0] || NONE; }
  function is(ctx, id) { return at(ctx).st[id] || { v: 0, x: 0, b: 0, l: '', s: '' }; }
  /* 台本の物を種類ごとに（宣言の順） */
  function kinds(p, k) { return p.items.filter(function (it) { return it.kind === k; }); }
  /* 段階を通して、物 id が取る札と小さい札の組（箱の高さを決めるため） */
  function variants(p, id) {
    var out = [], seen = {};
    p.steps.forEach(function (s) { var x = s.st[id]; if (!x) return; var k = x.l + '\u0000' + x.s; if (!seen[k]) { seen[k] = 1; out.push([x.l, x.s]); } });
    return out;
  }

  /* ---------- 文字 ---------- */
  /* 札の文字を入れる。`…` の所は等幅の tspan */
  function fill(t, s) {
    S.clear(t);
    String(s || '').split('`').forEach(function (part, k) {
      if (!part) return;
      if (k % 2) S.el('tspan', { cls: 't-mono', text: part }, t);
      else t.appendChild(document.createTextNode(part));
    });
    return t;
  }
  /* 文字の幅の見積もり（px）。字ごとの幅の表から決める（書体の読み込みの前後で配置が変わらないように、実際には測らない）。
     半角（0x20〜0x7e）は IBM Plex Sans JP の 400 と 600（t-b）の広い方を 1/100 em で並べた表 ASCII_EM（2026-11-18 に Chrome で 100px の字を
     10 個並べて測った。M・W は 0.94〜0.97em、記号は 0.3〜0.97em）。`…` の中（IBM Plex Mono）は 0.6em。漢字・かな・全角の記号と、
     そのほかの字（0x80 以上）は 1em（測った字はどれも 1em 以下）。表の誤差に 2% 足す。見積もりで収まれば、実際の字も収まる */
  var ASCII_EM = '2530477563977527353555632942294163636363636363636363313163636350946968647461597377425366579475806480676062766597676261334133635963606352635939636631316231986662636345504366578658574939403963';
  function fontPx(cls) { return /t-xs/.test(cls) ? 10 : /t-sm/.test(cls) ? 11 : /t-lg/.test(cls) ? 15 : /t-xl/.test(cls) ? 19 : 12.5; }
  function measure(svg, cls, s) {
    var em = 0, mono = false;
    String(s || '').split('').forEach(function (ch) {
      if (ch === '`') { mono = !mono; return; }
      var c = ch.charCodeAt(0);
      if (c >= 0xdc00 && c <= 0xdfff) return;
      em += c < 0x20 ? 0 : c > 0x7e ? 1 : mono ? 0.6 : Number(ASCII_EM.substr((c - 0x20) * 2, 2)) / 100;
    });
    return em * fontPx(cls) * 1.02;
  }
  /* s を幅 w に収まる 2 行に分ける。空白で切れればそこで、無ければ字の間で。英単語と `…` の途中では切らない。
     loose なら英単語の途中でも切る（`…` の途中では ` を閉じて開き直す）。返す: 行の配列（1 行で収まれば 1 つ）。2 行でも収まらなければ null */
  function split2(svg, cls, s, w, loose) {
    s = String(s || '');
    if (!s || measure(svg, cls, s) <= w) return [s];
    var best = null, chars = Array.from ? Array.from(s) : s.split('');
    for (var k = 1; k < chars.length; k++) {
      var a = chars.slice(0, k).join(''), b = chars.slice(k).join('');
      var code = (a.split('`').length - 1) % 2 === 1, latin = /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b);
      if ((code || latin) && !loose) continue;
      if (code) { a += '`'; b = '`' + b; }
      var sp = /\s$/.test(a) || /^\s/.test(b);
      var wa = measure(svg, cls, a.trim()), wb = measure(svg, cls, b.trim());
      if (wa > w || wb > w) continue;
      var score = Math.abs(wa - wb) - (sp ? 30 : 0);
      if (!best || score < best.score) best = { score: score, lines: [a.trim(), b.trim()] };
    }
    return best ? best.lines : null;
  }
  var LH = { 't-md': 16, 't-sm': 14, 't-xs': 13 };
  var BASE = { 't-md': 12, 't-sm': 10.5, 't-xs': 9.5 };
  var SIZES = ['t-md', 't-sm', 't-xs'];
  function sizeOf(cls) { return /t-xs/.test(cls) ? 't-xs' : /t-sm/.test(cls) ? 't-sm' : 't-md'; }
  /* 文字 s を幅 w に収める大きさ（z0 から t-xs まで）と行（maxN 行まで）。返す: { z, ll }。
     札（shrinkFirst が偽）は、その大きさで 1 行 → 2 行 → 1 段小さく …の順。小さい札（shrinkFirst）は、小さくしてから折る。
     どれでも収まらなければ、英単語や `…` の途中でも折る。それでも収まらなければ t-xs の 1 行（台本の幅の上限の中なら起きない） */
  function fitText(svg, s, w, z0, maxN, extra, shrinkFirst) {
    s = String(s || '');
    var zs = SIZES.slice(Math.max(0, SIZES.indexOf(z0))), tries = [];
    if (shrinkFirst) { zs.forEach(function (z) { tries.push([z, 1]); }); if (maxN > 1) tries.push([zs[zs.length - 1], 2]); }
    else zs.forEach(function (z) { tries.push([z, 1]); if (maxN > 1) tries.push([z, 2]); });
    if (maxN > 1) zs.forEach(function (z) { tries.push([z, 2, true]); });
    for (var i = 0; i < tries.length; i++) {
      var cls = tries[i][0] + (extra || ''), ll = tries[i][1] === 1 ? (measure(svg, cls, s) <= w ? [s] : null) : split2(svg, cls, s, w, tries[i][2]);
      if (ll) return { z: tries[i][0], ll: ll };
    }
    return { z: zs[zs.length - 1], ll: [s] };
  }

  /* ---------- 箱（札と小さい札） ----------
     parent に、左上 (x, y)・幅 w の箱を作る。vs は段階を通した [札, 小さい札] の組（全部が入る高さにする）。
     o: { align: 'c' | 'l', lcls: 札の文字の大きさ（既定 't-md'）, scls: 小さい札（既定 't-sm'）, pad: 横の余白, data: データの箱か,
          minH: 最低の高さ, lines: 札の行の上限（既定 2）, subLines: 小さい札の行の上限（既定 2） }
     札は幅に収まるように折り（2 行まで）、それでも入らなければ 1 段ずつ小さくする。小さい札は先に小さくしてから折る（fitText）。
     返す: { g, rect, x, y, w, h, set(label, sub, state) }。state は { x, b }（注目・壊れた） */
  function card(parent, x, y, w, vs, o) {
    o = o || {};
    var svg = parent.ownerSVGElement || parent, pad = o.pad == null ? 10 : o.pad, maxL = o.lines || 2, maxS = o.subLines == null ? 2 : o.subLines;
    var lsz = sizeOf(o.lcls || 't-md'), ssz = sizeOf(o.scls || 't-sm'), inner = w - 2 * pad;
    var layout = function (l, s) {
      var a = fitText(svg, l, inner, lsz, maxL, ' t-b', false), b = s ? fitText(svg, s, inner, ssz, maxS, '', true) : { z: ssz, ll: [] };
      return { lz: a.z, ll: a.ll, sz: b.z, sl: b.ll };
    };
    var inside = function (L) { return L.ll.length * LH[L.lz] + (L.sl.length ? 2 + L.sl.length * LH[L.sz] : 0); };
    var hmax = 0;
    (vs && vs.length ? vs : [['', '']]).forEach(function (v) { hmax = Math.max(hmax, 16 + inside(layout(v[0], v[1]))); });
    var h = Math.max(o.minH || 0, hmax);
    var g = S.g({}, parent);
    var rect = S.rect(x, y, w, h, { rx: o.rx == null ? 5 : o.rx, cls: 'f-sf s-mid w15' }, g);
    var tx = o.align === 'l' ? x + pad : x + w / 2;
    var acls = o.align === 'l' ? '' : ' t-c';
    var mk = function (n, cls) { var out = []; for (var k = 0; k < n; k++) out.push(S.text(tx, 0, '', { cls: cls + acls }, g)); return out; };
    var lt = mk(Math.max(2, maxL), lsz + ' t-b'), st = mk(Math.max(1, maxS), ssz + ' t-mid');
    var api = {
      g: g, rect: rect, x: x, y: y, w: w, h: h,
      set: function (label, sub, state) {
        state = state || {};
        var L = layout(label, sub), y0 = y + (h - inside(L)) / 2, bx = state.b, xx = state.x;
        lt.forEach(function (t, k) {
          fill(t, L.ll[k] || '');
          t.setAttribute('y', (y0 + k * LH[L.lz] + BASE[L.lz]).toFixed(1));
          t.setAttribute('class', L.lz + ' t-b' + (bx && !xx ? ' t-mid' : '') + acls);
        });
        var sy = y0 + L.ll.length * LH[L.lz] + 2;
        st.forEach(function (t, k) {
          fill(t, L.sl[k] || '');
          t.setAttribute('y', (sy + k * LH[L.sz] + BASE[L.sz]).toFixed(1));
          t.setAttribute('class', L.sz + (bx ? ' t-dim' : ' t-mid') + acls);
        });
        rect.setAttribute('class', xx ? 'f-x-soft s-x w2' + (bx ? ' dash' : '') : o.data ? (bx ? 'f-none s-dim w15 dash' : 'f-d-soft s-d w15') : (bx ? 'f-sf s-mid w15 dash' : 'f-sf s-mid w15'));
        return api;
      }
    };
    return api;
  }

  /* ---------- 線と粒 ---------- */
  /* 線の見た目。kind: 'data'（データが流れる）| 'ref'（指す・つながり）。st: { x, b } */
  function lineCls(kind, st) {
    var c = st && st.x ? 's-x w2' : kind === 'data' ? 's-d w15' : 's-mid w15';
    return 'f-none ' + c + (st && st.b ? ' dash' : '') + ' round';
  }
  function lineColor(kind, st) { return st && st.x ? 'x' : kind === 'data' ? 'd' : 'mid'; }
  /* 道の長さと、始点から f（0..1）の点。道の形は段階で変わるので、毎回測る（YT.svg.len は長さを覚えてしまう） */
  function lenOf(p) { try { return p.getTotalLength(); } catch (e) { return 0; } }
  function point(p, f) { var L = lenOf(p); return L ? p.getPointAtLength(U.clamp(f, 0, 1) * L) : { x: 0, y: 0 }; }
  /* 道を始点から f（0..1）だけ見せる。伸び切ったら破線（dash）などのクラスの線に戻す。
     pathLength は使わない（使うと dash の間隔まで縮み、破線が実線に見える） */
  function grow(p, f) {
    if (f >= 1) { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.style.opacity = ''; return; }
    var L = lenOf(p);
    if (!L) { p.style.opacity = f > 0.5 ? '' : '0'; return; }
    p.style.strokeDasharray = L.toFixed(1) + ' ' + L.toFixed(1);
    p.style.strokeDashoffset = (L * (1 - f)).toFixed(1);
    p.style.opacity = f > 0.005 ? '' : '0';
  }
  /* 段階に入って t0 秒後から dur 秒で伸びる（止めているときは伸び切った姿） */
  function growth(ctx, t0, dur) { return YT.motion.playing ? U.ease.out(U.prog(ctx.ts, t0 == null ? 0.15 : t0, dur || 0.6)) : 1; }
  /* 道に沿って流れる粒 n 個。update(ctx, path, on) で位置を決める（時刻から決めるので、止めていても同じ並び） */
  function flowDots(parent, n, cls) {
    var g = S.g({ style: { display: 'none' } }, parent), dots = [];
    for (var k = 0; k < (n || 3); k++) dots.push(S.circle(0, 0, 4, { cls: cls || 'f-d' }, g));
    return {
      g: g,
      update: function (ctx, path, on, speed) {
        g.style.display = on && path ? '' : 'none';
        if (!on || !path) return;
        var L = lenOf(path);
        if (!L) return;
        var ph = U.mod(ctx.t * (speed || 90) / L, 1);
        dots.forEach(function (d, k) {
          var f = U.mod(ph + k / dots.length, 1), q = path.getPointAtLength(f * L);
          d.setAttribute('cx', q.x.toFixed(1));
          d.setAttribute('cy', q.y.toFixed(1));
          d.style.opacity = (Math.min(1, f / 0.12, (1 - f) / 0.12)).toFixed(2);
        });
      }
    };
  }
  /* 線の横の札（下地つき）。(x, y) は文字の中心、anchor は 'c' | 'l' | 'r'。
     set(文字, クラス, x, y, anchor) で、文字・クラス・位置・寄せ方を替える（省いたものはそのまま）。w は文字の幅の見積もり */
  function tag(parent, x, y, s, o) {
    o = o || {};
    var anc = o.anchor || 'c', base = o.cls || 't-sm';
    var al = function () { return anc === 'l' ? '' : anc === 'r' ? ' t-end' : ' t-c'; };
    var g = S.g({}, parent);
    var bg = S.rect(0, 0, 0, 0, { rx: 3, cls: 'f-sf' }, g);
    var t = S.text(x, y + 4, '', { cls: base + al() }, g);
    var api = {
      g: g, t: t, w: 0,
      set: function (text, cls, nx, ny, na) {
        fill(t, text);
        if (na) anc = na;
        if (nx != null) { x = nx; y = ny; t.setAttribute('x', x); t.setAttribute('y', y + 4); }
        if (cls) base = cls;
        t.setAttribute('class', base + al());
        var w = api.w = text ? measure(parent.ownerSVGElement || parent, base, text) : 0;
        var x0 = anc === 'l' ? x : anc === 'r' ? x - w : x - w / 2;
        S.attrs(bg, { x: (x0 - 4).toFixed(1), y: (y - 8).toFixed(1), width: w ? (w + 8).toFixed(1) : 0, height: w ? 16 : 0 });
        g.style.display = text ? '' : 'none';
        return api;
      }
    };
    return api;
  }
  /* 箱 r（{x, y, w, h}）の縁の、中心から (tx, ty) へ向かう線との交点 */
  function edgePoint(r, tx, ty, gap) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    var sx = dx ? (r.w / 2 + (gap || 0)) / Math.abs(dx) : Infinity, sy = dy ? (r.h / 2 + (gap || 0)) / Math.abs(dy) : Infinity, s = Math.min(sx, sy);
    return [cx + dx * s, cy + dy * s];
  }

  /* ---------- 図の題・注記 ---------- */
  /* 題（左）と注記（右）。`…` は等幅。2 つが 1 行に並ぶ幅は anim-script.js が確かめる（title の幅 × 1.3 ＋ note の幅）。
     M・W の多い札などで並ばないときは、注記を題の下の行（y 46。どの部品も図の中身は y 50 より下）に置く */
  function head(ctx) {
    var p = ctx.params, svg = ctx.svg;
    fill(S.text(24, 30, '', { cls: 't-md t-b' }, svg), p.title || '');
    if (!p.note) return;
    var two = 24 + measure(svg, 't-md t-b', p.title || '') + 20 > 936 - measure(svg, 't-xs', p.note);
    fill(S.text(936, two ? 46 : 30, '', { cls: 't-xs t-dim t-end' }, svg), p.note);
  }

  /* ---------- 掘り下げの印（台本の down:） ----------
     部品の state.anchor(id, s, k) が、段階 s（台本の段階。札は s.st[id].l）で物 id に付ける k 番目（0 始まり）の印の札の位置
     { el, x, y, dx, dy } を返す。札は (x + k × dx, y + k × dy) に置く（dx・dy を省くと右へ 30 ずつ） */
  function downs(ctx) {
    var st = ctx.state, p = ctx.params, mark = ctx.mark || function (el, o) { return YT.drill.mark(el, o); };
    if (!st.anchor) return;
    p.steps.forEach(function (s, i) {
      var seen = {};
      (s.down || []).forEach(function (d) {
        var k = seen[d.id] = (seen[d.id] || 0) + 1, a = st.anchor(d.id, s, k - 1), lab = String(markLabel(p, s, d.id)).replace(/`/g, '');
        if (!a) return;
        var x = a.x + (k - 1) * (a.dx == null ? 30 : a.dx), y = a.y + (k - 1) * (a.dy || 0);
        mark(a.el, { to: d.to, label: short(lab, 20), bridge: d.bridge, steps: [i + 1], at: [Math.round(x), Math.round(y)] });
      });
    });
  }
  /* 掘り下げの一覧に出す、上の要素の名前: 物の札。札の無い線（boxes の line・tree の edge・seq の msg）は「端の札 → 端の札」 */
  function markLabel(p, s, id) {
    var o = s.st[id] || {}, it = p.items.filter(function (x) { return x.id === id; })[0] || {};
    if (o.l) return o.l;
    if (it.from && it.to) { var a = s.st[it.from] || {}, b = s.st[it.to] || {}; return (a.l || it.from) + (it.dir ? ' → ' : '・') + (b.l || it.to); }
    return id;
  }
  /* 段階 s の物 id の姿（anchor が札の幅を測るのに使う。s が無ければいまの段階） */
  function stOf(ctx, s, id) { return (s && s.st && s.st[id]) || is(ctx, id); }
  /* 掘り下げの一覧の札は n 字まで（docs/authoring.md §5.5）。切るときは語の切れ目で切って … を付ける */
  function short(s, n) {
    var cs = Array.from ? Array.from(s) : s.split('');
    if (cs.length <= n) return s;
    var t = cs.slice(0, n - 1).join(''), sp = t.search(/[\s\-]+[^\s\-]*$/);
    return (sp > n / 2 ? t.slice(0, sp) : t).replace(/[\s\-・、]+$/, '') + '…';
  }

  /* ---------- ニュースのページの場面 ---------- */
  function scene(sec, data) {
    var d = YT.parts.get(data.part);
    if (!d || !data.script) {
      console.error('[YT] 台本の部品「' + data.part + '」が読み込まれていない（assets/parts/' + data.part + '.js か news/anim/' + data.part + '.js）');
      return {};
    }
    var def = d.def, sc = data.script, html = data.html || [];
    return {
      steps: steps(sc),
      setup: function (ctx) {
        ctx.params = sc;
        ctx.part = data.part;
        ctx.mark = function (el, o) { return YT.drill.mark(el, o); };
        if (def.setup) def.setup(ctx);
        downs(ctx);
        // 本文の章へのリンクは、章へ移らずに板を開く（層の歩きと同じ。Ctrl などを押したクリックは、ふつうのリンク）
        sec.addEventListener('click', function (e) {
          var a = e.target.closest && e.target.closest('a[data-to]');
          if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          YT.drill.open({ to: a.getAttribute('data-to'), bridge: (sc.steps[ctx.step] || {}).title || '', label: a.textContent });
        });
      },
      onStep: function (ctx, i, prev) {
        if (def.onStep) def.onStep(ctx, i, prev);
        if (html[i] && ctx.ui && ctx.ui.text) ctx.ui.text.innerHTML = html[i];
      },
      frame: function (ctx, t, dt) { if (def.frame) def.frame(ctx, t, dt); },
      leave: function (ctx) { if (def.leave) def.leave(ctx); }
    };
  }

  window.YT_ANIM = {
    steps: steps, at: at, is: is, stOf: stOf, kinds: kinds, variants: variants,
    fill: fill, measure: measure, split2: split2, fitText: fitText, card: card, tag: tag,
    lineCls: lineCls, lineColor: lineColor, grow: grow, growth: growth, flowDots: flowDots, edgePoint: edgePoint, point: point,
    head: head, downs: downs, scene: scene
  };
})();
