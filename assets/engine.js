/* ============================================================
   YouTubeが見えるまで — 共通エンジン (assets/engine.js)

   読み込み方: <head> の中で defer を付けずに読み込む。
     1画面版かどうかの判定（html に .fit を付ける）を本文より前に走らせるため。
   章ページは本文の末尾で YT.chapter({ meta, scenes }) を呼ぶ（docs/authoring.md）。

   提供するもの
     YT.util   clamp / lerp / mod / prog / remap / seq / ease / pulse / cycle / seg / fmt / esc / rich
     YT.svg    el / g / rect / circle / line / path / poly / polygon / text / lines / clear / len / along / place / label / arrow / markers / show / fade
     YT.anim   flow（道に沿って粒を流す）/ wave（正弦波を描く）
     YT.chapter(def)   章の登録。場面の切り替え、段階（ステッパー）、動きの時計をまとめて面倒を見る
     YT.zoom   箱の中を前の章の回路で開く「板」（段階に入ると時間で開く）
     YT.drill  掘り下げ。図の要素に「下の層へ」の印を付け、押すと場面の上に板を重ねて下の層を見せる（板は積める）
     YT.parts  部品（assets/parts/<名前>.js）の登録。部品は値を渡して動かせる小さな場面で、掘り下げの板の中身になる
     window.oneScreen  計測スクリプト用の入口（show / count / ctx / drill）

   埋め込み（?embed=1）: 掘り下げの板の iframe の中で、章の 1 場面だけを出す。上部バー・表紙・まとめ・場面の見出しを
     出さず、1画面版の倍率の下限を外す。‹ › とキーは場面の中の段階だけを動かし、URL と「続きから」を書き換えない。
     段階の変化と印の押下は親へ postMessage で知らせ、親が板を積む（同じオリジンの親子の通知だけを受ける）。

   通しで進む（1画面版）: 上部バー右上の ›（#pg-next）と → は、次の段階、段階の終わりなら次の場面、最後の
     場面（まとめ）なら meta.next の章の場面1（#s1。章の表紙は飛ばす）へ進む。目次では › で第1章の場面1へ。
     ‹（#pg-prev）と ← はその逆（前の場面は最後の段階から。場面1 の最初の段階で ‹ を押すと、表紙を飛ばして
     前の章のまとめ（#last）へ。第1章なら目次へ）。↓↑ は場面ごとに移り、章の端では前後の章へ。
     「自動で進む」も同じ順に進む（段階は本文の長さに応じて 12〜30 秒）。今いる章・場面・段階は localStorage（ytm-last）に残し、
     目次の「続きから」に使う。URL の末尾は #s3（場面3）または #s3.2（場面3 の段階2）。
     まとめの下には次の章の導入（meta.next.lead）を出し、表紙の操作の説明（.keys[data-auto]）も埋める。
   ============================================================ */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------
     1画面版の判定。幅1216px以上かつ高さ654px以上（拡大率0.76以上）なら .fit。
     舞台は論理 1600〜1920 × 860 で、transform: scale で画面に合わせる。
     --------------------------------------------------------------- */
  var MIN_W = 1600, MAX_W = 1920, BASE_H = 860, MIN_S = 0.76;
  var mq = window.matchMedia('(min-width: ' + Math.ceil(MIN_W * MIN_S) + 'px) and (min-height: ' + Math.ceil(BASE_H * MIN_S) + 'px)');
  /* 埋め込み（掘り下げの板の iframe）。上部バー（48px）と場面の見出し（約 76px）を出さないので、舞台の高さは 736px で
     1画面版の本体と同じ大きさになる。iframe は板の大きさなので、倍率の下限（0.76）は外し、幅 960px 以上なら 1画面版にする */
  var EMBED = /(?:^|&)embed=1(?:&|$)/.test(location.search.slice(1)), EMBED_H = 736;
  if (EMBED) root.classList.add('embed');
  /* このファイルの場所。部品（assets/parts/）と章（chapters/）の場所は、どのページから読んでもここから決める */
  var ENGINE_URL = (document.currentScript && document.currentScript.src) || location.href;
  function urlIn(rel, base) { try { return new URL(rel, base).href; } catch (e) { return rel; } }
  var CHAPTERS_URL = urlIn('../chapters/', ENGINE_URL), PARTS_URL = urlIn('parts/', ENGINE_URL);
  function fit() {
    var vw = root.clientWidth, vh = root.clientHeight;
    if (EMBED && (!vw || !vh)) return root.classList.contains('fit');   // 隠した板の iframe（大きさ 0）では切り替えない
    var on = EMBED ? vw >= 960 && vh >= 420 : mq.matches;
    root.classList.toggle('fit', on);
    if (!on) return false;
    if (!vw || !vh) return true;
    var s = Math.min(vh / (EMBED ? EMBED_H : BASE_H), vw / MIN_W);
    var w = Math.min(MAX_W, vw / s);
    root.style.setProperty('--s', s.toFixed(5));
    root.style.setProperty('--W', w.toFixed(2) + 'px');
    root.style.setProperty('--H', (vh / s).toFixed(2) + 'px');
    root.style.setProperty('--ox', ((vw - w * s) / 2).toFixed(2) + 'px');
    return true;
  }
  window.__fit = fit;
  fit();
  var isFit = function () { return root.classList.contains('fit'); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------
     ユーティリティ
     --------------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 説明文の簡易マークアップ → HTML
       [[3|題名]]      場面3へのリンク（3「題名」と表示）
       [[3:2|題名]]    場面3の段階3（0始まりで2）へのリンク
       [[13-ethernet.html#s4|第13章 場面4]]   他の章へのリンク（#s4.2 で段階2 も指せる）。文字はそのまま出す
       `code`          等幅
       **強調**        太字
       {e|電子}        色付きの語（e h p r d x）  */
  function rich(s) {
    s = esc(s);
    s = s.replace(/\[\[(\d\d-[a-z0-9-]+\.html(?:#s\d+(?:\.\d+)?)?)\|([^\]]+)\]\]/g, '<a class="xref" href="$1">$2</a>');
    s = s.replace(/\[\[(\d+)(?::(\d+))?\|([^\]]+)\]\]/g, function (_, n, st, name) {
      return '<a class="xref" href="#s' + n + '" data-go="' + n + '"' + (st ? ' data-step="' + st + '"' : '') + '>' + n + '「' + name + '」</a>';
    });
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\{(e|h|p|r|d|x)\|([^}]+)\}/g, '<span class="tag $1">$2</span>');
    return s;
  }
  var util = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    mod: function (v, m) { return ((v % m) + m) % m; },
    /* t0 から dur 秒かけて 0→1 になる進み具合（前は0、後は1のまま） */
    prog: function (t, t0, dur) { return util.clamp((t - t0) / dur, 0, 1); },
    ease: {
      inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
      out: function (t) { return 1 - (1 - t) * (1 - t); },
      in: function (t) { return t * t; },
      back: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    },
    /* period 秒でなめらかに 0→1→0 を繰り返す */
    pulse: function (t, period) { return 0.5 - 0.5 * Math.cos(2 * Math.PI * t / (period || 1)); },
    /* period 秒で 0→1 を繰り返す（鋸波） */
    cycle: function (t, period) { return util.mod(t, period || 1) / (period || 1); },
    /* 0..1 の f を n 個の区間に分けたとき、いまの区間番号 */
    seg: function (f, n) { return Math.min(n - 1, Math.floor(util.clamp(f, 0, 0.999999) * n)); },
    fmt: function (n, d) { return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); },
    /* v を [a,b] から [c,d] へ比例で写す（はみ出しは切り詰める） */
    remap: function (v, a, b, c, d) { return c + (d - c) * util.clamp((v - a) / (b - a), 0, 1); },
    /* 時刻 t を、長さ durs[] の区間の列に当てはめる。{ i: いまの区間, f: 区間内の進み 0..1, done: 全部終わった }。
       loop が真なら最後まで行ったら最初に戻る */
    seq: function (t, durs, loop) {
      var total = 0, k;
      for (k = 0; k < durs.length; k++) total += durs[k];
      if (loop) t = util.mod(t, total);
      var acc = 0;
      for (k = 0; k < durs.length; k++) {
        if (t < acc + durs[k]) return { i: k, f: (t - acc) / durs[k], done: false, t: t - acc };
        acc += durs[k];
      }
      return { i: durs.length - 1, f: 1, done: true, t: durs[durs.length - 1] };
    },
    esc: esc,
    rich: rich
  };

  /* ---------------------------------------------------------------
     SVG の部品づくり。属性は {cls: 'f-e w2'} のように書く（class の代わりに cls も可）
     --------------------------------------------------------------- */
  var NS = 'http://www.w3.org/2000/svg';
  function attrs(e, a) {
    if (!a) return e;
    for (var k in a) {
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'cls') e.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') { for (var p in v) e.style[p] = v[p]; }
      else e.setAttribute(k, v);
    }
    return e;
  }
  function el(tag, a, parent) {
    var e = document.createElementNS(NS, tag);
    attrs(e, a);
    if (parent) parent.appendChild(e);
    return e;
  }
  function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in b) o[j] = b[j]; return o; }
  var mkCount = 0;
  var svg = {
    NS: NS,
    el: el,
    attrs: attrs,
    g: function (a, p) { return el('g', a, p); },
    rect: function (x, y, w, h, a, p) { return el('rect', merge({ x: x, y: y, width: w, height: h }, a), p); },
    circle: function (cx, cy, r, a, p) { return el('circle', merge({ cx: cx, cy: cy, r: r }, a), p); },
    line: function (x1, y1, x2, y2, a, p) { return el('line', merge({ x1: x1, y1: y1, x2: x2, y2: y2 }, a), p); },
    path: function (d, a, p) { return el('path', merge({ d: d }, a), p); },
    poly: function (pts, a, p) {
      return el('polyline', merge({ points: pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' ') }, a), p);
    },
    polygon: function (pts, a, p) {
      return el('polygon', merge({ points: pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' ') }, a), p);
    },
    text: function (x, y, s, a, p) { return el('text', merge({ x: x, y: y, text: s }, a), p); },
    /* 複数行の文字。lines は配列、lh は行の高さ */
    lines: function (x, y, lines, a, p, lh) {
      var t = el('text', merge({ x: x, y: y }, a), p);
      lines.forEach(function (s, i) { el('tspan', { x: x, dy: i ? (lh || 15) : 0, text: s }, t); });
      return t;
    },
    clear: function (node) { while (node.firstChild) node.removeChild(node.firstChild); },
    /* 道（path / line / polyline）の長さ。非表示のうちは 0 になることがあるので、使うたびに測り直す */
    len: function (pathEl) {
      if (pathEl.__len) return pathEl.__len;
      var L = 0;
      try { L = pathEl.getTotalLength(); } catch (e) { L = 0; }
      if (L) pathEl.__len = L;
      return L;
    },
    /* 道の上の、始点から f（0..1）の位置の点 */
    along: function (pathEl, f) {
      var L = svg.len(pathEl);
      if (!L) return { x: 0, y: 0 };
      return pathEl.getPointAtLength(util.clamp(f, 0, 1) * L);
    },
    /* 矢印の先端。svg ごとに作り、 markers(svg)('e') のように色を指定して marker-end に渡す */
    markers: function (svgEl) {
      if (svgEl.__mk) return svgEl.__mk;
      var prefix = 'mk' + (++mkCount);
      var defs = el('defs');
      svgEl.insertBefore(defs, svgEl.firstChild);
      ['fg', 'mid', 'dim', 'e', 'h', 'p', 'r', 'd', 'x'].forEach(function (c) {
        var m = el('marker', { id: prefix + '-' + c, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', cls: 'f-' + c }, m);
      });
      svgEl.__mk = function (c) { return 'url(#' + prefix + '-' + (c || 'fg') + ')'; };
      return svgEl.__mk;
    },
    show: function (node, on) { node.style.display = on ? '' : 'none'; return node; },
    fade: function (node, on) { node.classList.add('fade'); node.classList.toggle('hide', !on); return node; },
    /* 部品（g など）を道の上の f（0..1）の位置へ移す。rotate が真なら進行方向に向ける */
    place: function (node, pathEl, f, rotate) {
      var L = svg.len(pathEl);
      if (!L) return node;
      f = util.clamp(f, 0, 1);
      var p = pathEl.getPointAtLength(f * L);
      var tr = 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')';
      if (rotate) {
        var q = pathEl.getPointAtLength(Math.min(L, f * L + 1));
        var r = pathEl.getPointAtLength(Math.max(0, f * L - 1));
        tr += ' rotate(' + (Math.atan2(q.y - r.y, q.x - r.x) * 180 / Math.PI).toFixed(1) + ')';
      }
      node.setAttribute('transform', tr);
      return node;
    },
    /* 枠付きの札。中央 (x,y)。opts: { cls: 文字のクラス, box: 枠のクラス, pad, rx, w: 幅を決め打ち } */
    label: function (parent, x, y, text, opts) {
      opts = opts || {};
      var g = el('g', { transform: 'translate(' + x + ',' + y + ')', cls: opts.gcls }, parent);
      var t = el('text', { x: 0, y: 4, text: text, cls: 't-c ' + (opts.cls || 't-sm t-b') }, g);
      var w = opts.w;
      if (!w) {
        try { w = t.getBBox().width; } catch (e) { w = 0; }
        if (!w) w = String(text).length * ((opts.fs || 11) * 0.95);
        w += (opts.pad == null ? 16 : opts.pad);
      }
      var h = opts.h || 22;
      g.insertBefore(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: opts.rx == null ? 4 : opts.rx, cls: opts.box || 'f-sf s-rule w1' }), t);
      return g;
    },
    /* 矢印。color は markers と同じ名前（fg / e / h …）。attrs で太さなどを足す */
    arrow: function (parent, x1, y1, x2, y2, color, attrs) {
      var owner = parent.ownerSVGElement || parent;
      var mk = svg.markers(owner);
      return el('line', merge({ x1: x1, y1: y1, x2: x2, y2: y2, cls: 's-' + (color || 'fg') + ' w2', 'marker-end': mk(color || 'fg') }, attrs), parent);
    }
  };

  /* ---------------------------------------------------------------
     よく使う動き
     --------------------------------------------------------------- */
  /* 道に沿って粒を流す。update(dt) を毎フレーム呼ぶ。speed は px/秒（負なら逆向き）。
     set('speed', 120) で途中から速さを変えられる。 */
  function flow(pathEl, opts) {
    var o = merge({ count: 8, speed: 60, r: 3.5, cls: 'f-e', parent: null, reverse: false, jitter: 0, fade: false, phase: 0 }, opts || {});
    var parent = o.parent || pathEl.parentNode;
    var g = el('g', { cls: 'flow' }, parent);
    var dots = [], seeds = [];
    for (var i = 0; i < o.count; i++) {
      dots.push(el('circle', { r: o.r, cls: o.cls }, g));
      seeds.push(Math.sin(i * 12.9898 + 78.233));  // -1..1 の疑似乱数（毎回同じ並び）
    }
    var phase = o.phase, L = 0;
    var api = {
      g: g, dots: dots, o: o,
      update: function (dt) {
        if (!L) { L = svg.len(pathEl); if (!L) return; }
        phase = util.mod(phase + (dt || 0) * o.speed / L, 1);
        var n = dots.length;
        for (var k = 0; k < n; k++) {
          var f = util.mod(phase + k / n, 1);
          if (o.reverse) f = 1 - f;
          var p = pathEl.getPointAtLength(f * L);
          var d = dots[k];
          d.setAttribute('cx', (p.x + seeds[k] * o.jitter).toFixed(2));
          d.setAttribute('cy', (p.y + seeds[(k + 3) % n] * o.jitter).toFixed(2));
          if (o.fade) d.style.opacity = Math.sin(Math.PI * f).toFixed(3);
        }
      },
      set: function (k, v) { o[k] = v; if (k === 'r') dots.forEach(function (d) { d.setAttribute('r', v); }); if (k === 'cls') dots.forEach(function (d) { d.setAttribute('class', v); }); return api; },
      show: function (on) { g.style.display = on ? '' : 'none'; return api; },
      reset: function () { L = 0; phase = o.phase; return api; }
    };
    return api;
  }
  /* 正弦波を path に描く。x0..x1 の範囲、中心 y、振幅 amp、波長 lambda（px）、speed は位相の進む速さ（px/秒）。
     env(f) を渡すと、0..1 の位置ごとに振幅を掛ける（減衰や包絡線）。 */
  function wave(pathEl, opts) {
    var o = merge({ x0: 0, x1: 300, y: 0, amp: 20, lambda: 80, speed: 60, samples: 0, env: null, phase: 0 }, opts || {});
    var phase = o.phase;
    var api = {
      o: o,
      get phase() { return phase; },
      update: function (dt) { phase += (dt || 0) * o.speed; api.draw(); },
      draw: function () {
        var n = o.samples || Math.max(24, Math.round((o.x1 - o.x0) / 3));
        var d = '';
        for (var i = 0; i <= n; i++) {
          var x = o.x0 + (o.x1 - o.x0) * i / n;
          var a = o.env ? o.amp * o.env((x - o.x0) / (o.x1 - o.x0)) : o.amp;
          var y = o.y - a * Math.sin(2 * Math.PI * (x - phase) / o.lambda);
          d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
        }
        pathEl.setAttribute('d', d);
      },
      set: function (k, v) { o[k] = v; return api; }
    };
    api.draw();
    return api;
  }
  var anim = { flow: flow, wave: wave };

  /* ---------------------------------------------------------------
     動きの設定（止める・速さ・自動で進む）。この閲覧者の便宜として localStorage に残す
     --------------------------------------------------------------- */
  var motion = { playing: !reduced.matches, speed: 1, auto: false };
  try {
    var saved = JSON.parse(localStorage.getItem('ytm-motion') || 'null');
    if (saved) {
      if (typeof saved.playing === 'boolean' && !reduced.matches) motion.playing = saved.playing;
      if ([0.5, 1, 2].indexOf(Number(saved.speed)) >= 0) motion.speed = Number(saved.speed);
      if (typeof saved.auto === 'boolean') motion.auto = saved.auto;
    }
  } catch (e) { /* 使えなければ既定のまま */ }
  if (EMBED) motion.auto = false;   // 埋め込みは自分では進まない（止める・速さは親から知らせる）
  function saveMotion() { if (EMBED) return; try { localStorage.setItem('ytm-motion', JSON.stringify(motion)); } catch (e) { /* 無視 */ } }

  /* ---------------------------------------------------------------
     章の登録と初期化
     --------------------------------------------------------------- */
  var DEF = null, inited = false, ctxs = [], scenes = [], active = null, curScene = 0, STEPPERS = {};
  var ui = {}, LINKS = { next: null, prev: null, isHome: false }, leaving = false;
  // 掘り下げ（YT.drill）の印・板の積み重ね・部品の登録（下の「掘り下げ」の節で使う）
  var MARKS = [], markSeq = 0, stack = [], panelSeq = 0, layer = null, PARTS = {}, partWait = {}, armed = false, skipPop = 0;

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function chapter(def) { DEF = def || {}; onReady(init); }
  onReady(function () { if (!DEF) { DEF = {}; init(); } });

  function safe(ctx, fn) {
    try { fn(); }
    catch (err) {
      if (!ctx.__err) {
        ctx.__err = true;
        console.error('[YT] scene ' + ctx.id + ' でエラー:', err);
        if (EMBED) toParent({ type: 'error', msg: 'scene ' + ctx.id + ': ' + (err && err.message ? err.message : err) });
        var p = document.createElement('p');
        p.className = 'anim-err';
        p.textContent = '図の描画でエラー: ' + (err && err.message ? err.message : err);
        (ctx.root.querySelector('.anim-fig') || ctx.root).appendChild(p);
      }
    }
  }

  function init() {
    if (inited) return;
    inited = true;
    fit();
    scenes = $$('section.scene');
    if (!scenes.length) return;
    var meta = DEF.meta || {};
    LINKS = chapterLinks(meta);
    if (EMBED) {
      // 埋め込み: リンクは板の外（ページ全体）で開く。場面の中の data-go だけは iframe の中で場面を移る
      var bt = document.createElement('base');
      bt.target = '_top';
      document.head.appendChild(bt);
      window.addEventListener('message', fromParent);
      window.addEventListener('error', function (e) { toParent({ type: 'error', msg: (e.message || '') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '') }); });
    } else {
      buildTopbar(meta);
      newsChips();
      window.addEventListener('message', fromChild);
    }
    fillAuto(meta);
    ctxs = scenes.map(function (s, i) { return makeCtx(s, i, (DEF.scenes || {})[s.id]); });
    wireNav();
    wireKeys();
    wireHl();
    var m = /^#s(\d+)(?:\.(\d+))?$/.exec(location.hash || '');
    if (m) {
      curScene = Math.min(scenes.length - 1, Number(m[1]));
      if (m[2] && ctxs[curScene] && ctxs[curScene].steps) goStep(ctxs[curScene], Number(m[2]) - 1);
    } else if (location.hash === '#last') curScene = scenes.length - 1;
    else if (EMBED) curScene = Math.min(1, scenes.length - 1);
    showScene(curScene, false);
    if (!isFit()) watchMobile();
    requestAnimationFrame(loop);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { MARKS.forEach(function (mk) { if (mk.badge && mk.badge.style.display !== 'none') placeBadge(mk); }); });
    window.oneScreen = {
      show: function (n) { showScene(n, false); },
      get count() { return scenes.length; },
      ctx: function (n) { return ctxs[n]; },
      motion: motion,
      drill: drillApi
    };
    if (EMBED) embedReport();
  }

  /* ---------- 上部バー（1画面版だけに出る） ---------- */
  function buildTopbar(meta) {
    var app = $('.app');
    if (!app) return;
    var bar = $('.topbar', app);
    if (!bar) { bar = document.createElement('header'); bar.className = 'topbar'; app.insertBefore(bar, app.firstChild); }
    var home = meta.home || '../index.html';
    // meta.actions（[{ href, label, sub, go, primary, title, tail }]）があれば、色の凡例の代わりにボタンを並べる（目次とニュースのページで使う）。
    // tail は label の後ろに続く文字で、幅が足りないときも消さない（fitActs）
    var acts = meta.actions && meta.actions.length ? meta.actions : null;
    bar.innerHTML =
      '<a class="brand" href="' + esc(home) + '" title="目次へ"><span class="brand-eyebrow"></span><span class="brand-title"></span></a>' +
      '<nav class="tabs" aria-label="場面"></nav>' +
      (acts ? '<nav class="topbar-acts" aria-label="始める"></nav>' : '<p class="topbar-key" aria-label="色の意味"></p>') +
      '<div class="motion" role="group" aria-label="動き">' +
        '<button type="button" class="mo-btn" id="mo-play" aria-pressed="true" title="動きを止める／動かす（スペースキー）"></button>' +
        '<select class="mo-sel" id="mo-speed" aria-label="動きの速さ"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select>' +
        '<label class="mo-auto" title="段階・場面・章を自動で進める（段階は本文の長さに応じて約 12〜30 秒、表紙とまとめは約 15 秒）"><input type="checkbox" id="mo-auto">自動で進む</label>' +
      '</div>' +
      // 移動はこの ‹ › に集める。› だけ押していけば、段階・場面・章の順に全ページを通せる
      '<div class="pager">' +
        '<button type="button" class="pg" id="pg-prev" title="前へ（←キー）" aria-label="前へ">‹</button>' +
        '<button type="button" class="pg primary" id="pg-next" title="次へ（→キー）" aria-label="次へ">›</button>' +
      '</div>';
    $('.brand-eyebrow', bar).textContent = meta.eyebrow || '';
    $('.brand-title', bar).textContent = meta.title || document.title;
    var tabs = $('.tabs', bar);
    scenes.forEach(function (s, i) {
      var a = document.createElement('a');
      a.className = 'tab';
      a.href = '#' + s.id;
      a.dataset.go = i;
      var label = s.dataset.tab || (i ? '場面' + i : '表紙');
      a.innerHTML = (i ? '<span class="n">' + i + '</span>' : '') + esc(label);
      tabs.appendChild(a);
    });
    if (acts) {
      var actNav = $('.topbar-acts', bar);
      acts.forEach(function (x) {
        var a = document.createElement('a');
        a.className = 'act' + (x.primary ? ' primary' : '');
        a.href = x.href;
        if (x.go !== undefined) a.dataset.go = x.go;
        if (x.title) a.title = x.title;
        a.innerHTML = (x.sub ? '<small>' + esc(x.sub) + '</small> ' : '') +
          (x.tail ? '<span class="act-fold">' + esc(x.label) + '</span><span>' + esc(x.tail) + '</span>' : esc(x.label));
        if (x.tail) { a.classList.add('shrink'); actNav.classList.add('shrink'); }
        actNav.appendChild(a);
      });
      fitActs();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitActs);
    } else {
      $('.topbar-key', bar).innerHTML = legendHtml(meta.legend);
    }
    ui.play = $('#mo-play', bar);
    ui.speed = $('#mo-speed', bar);
    ui.auto = $('#mo-auto', bar);
    ui.prev = $('#pg-prev', bar);
    ui.next = $('#pg-next', bar);
    ui.play.addEventListener('click', function () { setPlaying(!motion.playing); });
    ui.speed.value = String(motion.speed);
    ui.speed.addEventListener('change', function () { motion.speed = Number(ui.speed.value) || 1; saveMotion(); drillMotion(); });
    ui.auto.checked = motion.auto;
    ui.auto.addEventListener('change', function () { motion.auto = ui.auto.checked; saveMotion(); if (active) active.ts = 0; });
    syncPlay();
  }
  /* tail のあるボタンの label（.act-fold）が切れるなら、切れ端を出さずに label ごと消す。幅が戻れば出す。全文は呼び出し側が title に書く */
  function fitActs() {
    $$('.topbar-acts .act.shrink').forEach(function (a) {
      var f = $('.act-fold', a);
      a.classList.remove('folded');
      if (f && f.scrollWidth > f.clientWidth + 1) a.classList.add('folded');
    });
  }
  function legendHtml(legend) {
    return (legend || []).map(function (l) { return '<span><i class="sw ' + esc(l.c) + '"></i>' + esc(l.label) + '</span>'; }).join('');
  }
  function setPlaying(on) {
    // 埋め込みの中で押した「止める」は親に頼む（親が自分と全部の板に知らせる）
    if (EMBED && window.parent !== window) { toParent({ type: 'key', key: ' ' }); return; }
    motion.playing = on;
    saveMotion();
    syncPlay();
    if (active) settle(active);
    drillMotion();
  }
  function syncPlay() {
    if (ui.play) {
      ui.play.setAttribute('aria-pressed', motion.playing ? 'true' : 'false');
      ui.play.textContent = motion.playing ? '❚❚ 止める' : '▶ 動かす';
    }
    $$('.m-play').forEach(function (b) { b.textContent = motion.playing ? '❚❚' : '▶'; b.setAttribute('aria-pressed', motion.playing ? 'true' : 'false'); });
  }

  /* 表紙の操作の説明（1画面版だけに出る。章の HTML には <p class="keys fit-only" data-auto></p> と書く） */
  var KEYS_HTML = '右上の <kbd>›</kbd>（または<kbd>→</kbd>）だけを押していけば、段階・場面・章の順に全ページを通して見られる。章のまとめの次は、次の章の場面1。<kbd>‹</kbd>（<kbd>←</kbd>）で戻り、<kbd>↓</kbd><kbd>↑</kbd>で場面を移り、<kbd>スペース</kbd>で動きを止める。図の大きさや速さは見やすいように誇張してある。';
  /* data-auto の付いた凡例・操作の説明・章の前後リンクを meta から埋める */
  function fillAuto(meta) {
    $$('.legend[data-auto]').forEach(function (p) { p.innerHTML = legendHtml(meta.legend); });
    $$('.keys[data-auto]').forEach(function (p) { p.innerHTML = KEYS_HTML; });
    var glossHref = (meta.home || '../index.html').replace(/index\.html$/, '') + 'glossary.html';
    $$('.chnav[data-auto]').forEach(function (nav) {
      var h = '';
      if (meta.prev) h += '<a class="prev" href="' + esc(meta.prev.href) + '">‹ <small>前の章</small> ' + esc(meta.prev.title) + '</a>';
      h += '<a class="home" href="' + esc(meta.home || '../index.html') + '">目次</a>';
      if (nav.closest('.sc-wrap')) h += '<a class="gloss" href="' + esc(glossHref) + '">用語索引</a>';
      if (meta.next) h += '<a class="next" href="' + esc(meta.next.href) + '"><small>次の章</small> ' + esc(meta.next.title) + ' ›</a>';
      nav.innerHTML = h;
      // まとめの下に、次の章の導入（次の章の表紙のリードの 1 文目。meta.next.lead）を出す。通しで進むときは表紙を飛ばすので、
      // 章の境目で「前の章を受ける一文」が消えないようにする
      if (meta.next && meta.next.lead && nav.closest('.sc-wrap')) {
        var num = /(\d+)-[a-z]/.exec(meta.next.href || '');
        var p = document.createElement('p');
        p.className = 'next-lead';
        p.innerHTML = '<small>次の章</small> <b>' + (num ? '第' + Number(num[1]) + '章 ' : '') + esc(meta.next.title) + '</b><span class="lead-text">' + esc(meta.next.lead) + '</span><span class="go">右上の › で進む</span>';
        nav.parentNode.insertBefore(p, nav);
      }
    });
    $$('[data-chapter-title]').forEach(function (e) { e.textContent = meta.title || ''; });
  }

  /* 章のページだけ: 場面の見出しに「この場面のニュース N ›」、まとめの見出しに「この章に関わるニュース N ›」を出す。
     数えるのは、その場面（まとめは章のどこか）にリンクしているノート。1 件ならノートへ、2 件からは層の地図を絞って開く。
     ノートのデータ（news/news-data.js、tools/build-news.mjs が作る）は要るときに読み、読めなければ何も出さない */
  function newsChips() {
    var m = /\/chapters\/(\d\d)-[a-z0-9-]+\.html$/.exec(location.pathname);
    if (!m) return;
    var ch = String(Number(m[1]));
    var put = function () {
      var news = window.YT_NEWS;
      if (!news || !news.length) return;
      scenes.forEach(function (sec) {
        var head = $('.sh', sec), k = Number(sec.id.slice(1)), wrap = sec.classList.contains('sc-wrap');
        if (!head || (!wrap && !(k >= 1))) return;
        var hits = news.filter(function (n) {
          return wrap ? n.scenes.some(function (s) { return s === ch || s.indexOf(ch + '-') === 0; }) : n.scenes.indexOf(ch + '-' + k) >= 0;
        });
        if (!hits.length) return;
        var box = $('.sh-meta', head);
        if (!box) { box = document.createElement('p'); box.className = 'sh-meta'; head.appendChild(box); }
        var a = document.createElement('a');
        a.className = 'chip nw-chip';
        a.href = hits.length === 1 ? '../news/' + hits[0].slug + '.html' : '../news/index.html?' + (wrap ? 'ch=' + ch : 'scene=' + ch + '-' + k) + '#s1';
        a.title = hits.map(function (n) { return n.date + ' ' + n.title; }).join('\n');
        a.textContent = (wrap ? 'この章に関わるニュース ' : 'この場面のニュース ') + hits.length + ' ›';
        box.appendChild(a);
      });
    };
    if (window.YT_NEWS) { put(); return; }
    var s = document.createElement('script');
    s.src = '../news/news-data.js';
    s.onload = put;
    document.head.appendChild(s);
  }

  /* ---------- 場面ごとの文脈（ctx） ---------- */
  function makeCtx(sec, i, def) {
    def = def || {};
    var ctx = {
      id: sec.id, index: i, root: sec, def: def,
      svg: sec.querySelector('svg[data-anim]') || sec.querySelector('.anim-fig svg') || sec.querySelector('figure svg') || sec.querySelector('svg'),
      steps: (def.steps && def.steps.length) ? def.steps : null,
      step: 0, t: 0, ts: 0, state: {}, ready: false, ui: null,
      $: function (s) { return sec.querySelector(s); },
      $$: function (s) { return $$(s, sec); },
      goStep: function (n) { goStep(ctx, n); },
      next: function () { goStep(ctx, ctx.step + 1); },
      prev: function () { goStep(ctx, ctx.step - 1); },
      /* 図を描き直す（止めているときにも1回だけ frame を呼ぶ） */
      settle: function () { settle(ctx); }
    };
    if (ctx.steps) {
      buildStepper(ctx);
      STEPPERS[i] = { step: function (d) { goStep(ctx, ctx.step + d); }, goStep: function (n) { goStep(ctx, n); } };
    }
    return ctx;
  }

  function buildStepper(ctx) {
    var sec = ctx.root;
    var slot = sec.querySelector('.narr-slot');
    var panel = document.createElement('div');
    panel.className = (slot ? slot.className.replace(/\bnarr-slot\b/, '') : 'a-panel') + ' panel';
    panel.innerHTML =
      '<div class="narr" aria-live="polite"><p class="where"></p><h3></h3><p class="txt"></p></div>' +
      '<div class="drill-list" hidden></div>' +   // この段階の掘り下げの印の一覧（YT.drill。縦読み版でも出す）
      '<div class="ctrls">' +
        '<button type="button" class="btn st-reset">最初から</button>' +
        '<button type="button" class="btn st-prev">← 前へ</button>' +
        '<span class="counter st-count"></span>' +
        '<button type="button" class="btn primary st-next" data-measure="next">次へ →</button>' +
        '<span class="hint">右上の › か →キーで進む</span>' +
      '</div>';
    if (slot) slot.replaceWith(panel);
    else {
      var left = sec.querySelector('.a-left') || sec;
      var lead = left.querySelector('.a-lead');
      if (lead && lead.nextSibling) left.insertBefore(panel, lead.nextSibling); else left.appendChild(panel);
    }
    var mbar = document.createElement('div');
    mbar.className = 'mbar a-mbar';
    mbar.setAttribute('role', 'group');
    mbar.setAttribute('aria-label', '一歩ずつ進める');
    mbar.innerHTML =
      '<button type="button" class="btn m-reset">最初から</button>' +
      '<button type="button" class="btn arrow m-prev" aria-label="前へ">←</button>' +
      '<p class="mnow"><span class="counter m-count"></span><span class="mtitle"></span></p>' +
      '<button type="button" class="btn m-play" aria-label="動きを止める／動かす" aria-pressed="true">❚❚</button>' +
      '<button type="button" class="btn primary arrow m-next" aria-label="次へ">→</button>';
    sec.appendChild(mbar);
    ctx.ui = {
      where: panel.querySelector('.where'), title: panel.querySelector('h3'), text: panel.querySelector('.txt'), drill: panel.querySelector('.drill-list'),
      count: panel.querySelector('.st-count'), prev: panel.querySelector('.st-prev'), next: panel.querySelector('.st-next'), reset: panel.querySelector('.st-reset'),
      mcount: mbar.querySelector('.m-count'), mtitle: mbar.querySelector('.mtitle'), mprev: mbar.querySelector('.m-prev'), mnext: mbar.querySelector('.m-next'), mreset: mbar.querySelector('.m-reset'), mplay: mbar.querySelector('.m-play')
    };
    ctx.ui.next.addEventListener('click', ctx.next);
    ctx.ui.prev.addEventListener('click', ctx.prev);
    ctx.ui.reset.addEventListener('click', function () { goStep(ctx, 0); });
    ctx.ui.mnext.addEventListener('click', ctx.next);
    ctx.ui.mprev.addEventListener('click', ctx.prev);
    ctx.ui.mreset.addEventListener('click', function () { goStep(ctx, 0); });
    ctx.ui.mplay.addEventListener('click', function () { setPlaying(!motion.playing); });
    renderStepText(ctx);
  }

  function renderStepText(ctx) {
    var st = ctx.steps[ctx.step], u = ctx.ui, n = ctx.steps.length;
    u.where.textContent = st.where || '';
    u.title.textContent = st.title || '';
    u.text.innerHTML = rich(st.text || '');
    var count = (ctx.step + 1) + ' / ' + n;
    u.count.textContent = count;
    u.mcount.textContent = count;
    u.mtitle.textContent = st.title || '';
    var first = ctx.step === 0, last = ctx.step === n - 1;
    u.prev.disabled = first; u.mprev.disabled = first;
    u.next.disabled = last; u.mnext.disabled = last;
    if (ctx.index === curScene) syncPager();
  }

  function goStep(ctx, n) {
    if (!ctx.steps) return;
    n = util.clamp(n, 0, ctx.steps.length - 1);
    var prevIdx = ctx.step;
    if (stack.length && ctx.index === curScene && n !== prevIdx) drillClose(0);   // 段階が変わると掘り下げの板を全部閉じる
    ctx.step = n;
    ctx.ts = 0;
    renderStepText(ctx);
    if (ctx.ready) { enterStep(ctx, prevIdx); renderMarks(ctx); }
    if (inited && ctx.index === curScene) { syncHash(); rememberPlace(); if (EMBED) embedReport(); }
  }
  /* 1画面版では URL の末尾を今の場面と段階にする（#s3 ＝ 場面3 の最初の段階、#s3.2 ＝ 場面3 の段階2）。
     ‹ › やキーで移っても、再読み込み・共有で同じ所に戻れる。履歴は増やさない */
  function hashFor(n) {
    var c = ctxs[n];
    return '#' + scenes[n].id + (c && c.steps && c.step > 0 ? '.' + (c.step + 1) : '');
  }
  function syncHash() {
    if (EMBED || !isFit() || !history.replaceState) return;
    var h = hashFor(curScene);
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function enterStep(ctx, prevIdx) {
    var st = ctx.steps[ctx.step];
    safe(ctx, function () {
      if (st.enter) st.enter(ctx, prevIdx);
      if (ctx.def.onStep) ctx.def.onStep(ctx, ctx.step, prevIdx);
    });
    settle(ctx);
  }
  function ensureSetup(ctx) {
    if (ctx.ready) return;
    ctx.ready = true;
    safe(ctx, function () { if (ctx.def.setup) ctx.def.setup(ctx); });
    if (ctx.steps) enterStep(ctx, -1);
    renderMarks(ctx);
  }
  function settle(ctx) {
    if (!ctx.ready || !ctx.def.frame) return;
    safe(ctx, function () { ctx.def.frame(ctx, ctx.t, 0); });
  }
  function activate(ctx) {
    if (active === ctx) return;
    if (active && active.def.leave) safe(active, function () { active.def.leave(active); });
    active = ctx;
    if (!ctx) return;
    ensureSetup(ctx);
    if (ctx.def.enterScene) safe(ctx, function () { ctx.def.enterScene(ctx); });
    ctx.ts = 0;
    settle(ctx);
  }

  /* 「自動で進む」で 1 段階に留まる秒数。段階の dur → 章の stepDur → 本文の字数から（8 秒 ＋ 0.1 秒×字数、12〜30 秒） */
  function stepWait(ctx) {
    var st = ctx.steps[ctx.step];
    if (st.dur) return st.dur;
    if (DEF.stepDur) return DEF.stepDur;
    var plain = String(st.text || '').replace(/\{[ehprdx]\|([^}]+)\}/g, '$1').replace(/\[\[(?:\d+(?::\d+)?|\d\d-[a-z0-9-]+\.html(?:#s\d+(?:\.\d+)?)?)\|([^\]]+)\]\]/g, '$1').replace(/\*\*|`/g, '');
    var n = Array.from ? Array.from(plain).length : plain.length;
    return util.clamp(8 + 0.1 * n, 12, 30);
  }

  /* ---------- 動きの時計 ---------- */
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.1) dt = 0.1;
    dt *= motion.speed;
    // 掘り下げの板が開いている間は、下の場面を動かさず「自動で進む」も止める。動かすのは一番上の板の部品だけ
    // （埋め込みの板は iframe の中のエンジンが自分で動かす）
    if (stack.length) {
      var top = stack[stack.length - 1], pc = top.ctx;
      if (pc && pc.ready && motion.playing && !document.hidden && !leaving && pc.def.frame) {
        pc.t += dt;
        pc.ts += dt;
        safe(pc, function () { pc.def.frame(pc, pc.t, dt); });
      }
      return;
    }
    var ctx = active;
    if (!ctx || !motion.playing || document.hidden || leaving) return;
    ctx.t += dt;
    ctx.ts += dt;
    if (ctx.def.frame) safe(ctx, function () { ctx.def.frame(ctx, ctx.t, dt); });
    if (!motion.auto) return;
    if (isFit()) {
      // 段階は stepDur（既定 10 秒）、段階の無い場面（表紙・まとめ）は def.dur か stillDur（既定 15 秒）ごとに進む
      var wait = ctx.steps ? stepWait(ctx) : (ctx.def.dur || DEF.stillDur || 15);
      if (ctx.ts >= wait) { ctx.ts = 0; goNext(); }
    } else if (ctx.steps && ctx.step < ctx.steps.length - 1) {
      if (ctx.ts >= stepWait(ctx)) ctx.next();
    }
  }

  /* ---------- 通しで進む（段階 → 場面 → 章） ---------- */
  function chapterLinks(meta) {
    var home = meta.home || '../index.html', isHome = false;
    try { isHome = new URL(home, location.href).pathname === location.pathname; } catch (e) { /* 無視 */ }
    return {
      isHome: isHome,
      // 次の章は場面1 から（章の表紙は飛ばす。meta.next.href に # があればそのまま）
      next: meta.next ? { href: /#/.test(meta.next.href) ? meta.next.href : meta.next.href + '#s1', title: meta.next.title || '' } : null,
      // 前の章はまとめ（最後の場面）から。前の章が無ければ目次の表紙へ（目次そのものなら前は無い）
      prev: meta.prev ? { href: meta.prev.href + '#last', title: meta.prev.title || '' } : (isHome ? null : { href: home, title: '目次', home: true })
    };
  }
  function leaveTo(href) {
    if (leaving) return;
    leaving = true;
    location.href = href;
  }
  /* d 場面だけ移る。章の端を越えるときは前後の章へ。toLastStep なら移った先の場面は最後の段階から */
  function goScene(d, toLastStep) {
    var n = curScene + d;
    if (n >= 0 && n < scenes.length) {
      var c = ctxs[n];
      if (toLastStep && c && c.steps) goStep(c, c.steps.length - 1);
      showScene(n, true);
      return true;
    }
    var to = d > 0 ? LINKS.next : LINKS.prev;
    if (to) { leaveTo(to.href); return true; }
    return false;
  }
  function goNext() {
    if (stack.length) return drillStep(1);   // 板が開いている間は、› と → は一番上の板の段階を進める
    if (EMBED) { var e = ctxs[curScene]; if (e && e.steps) goStep(e, e.step + 1); return true; }   // 埋め込みは場面の中だけ
    if (LINKS.isHome && LINKS.next) { leaveTo(LINKS.next.href); return true; }   // 目次では › で第1章の場面1へ
    var c = ctxs[curScene];
    if (c && c.steps && c.step < c.steps.length - 1) { goStep(c, c.step + 1); return true; }
    return goScene(1, false);
  }
  function goPrev() {
    if (stack.length) return drillStep(-1);
    if (EMBED) { var e = ctxs[curScene]; if (e && e.steps) goStep(e, e.step - 1); return true; }
    var c = ctxs[curScene];
    if (c && c.steps && c.step > 0) { goStep(c, c.step - 1); return true; }
    // 場面1 の最初では、› で来たときと逆に、表紙を飛ばして前の章のまとめへ（前の章が無ければ目次へ）
    if (curScene <= 1 && LINKS.prev && !LINKS.isHome) { leaveTo(LINKS.prev.href); return true; }
    return goScene(-1, true);
  }
  /* 今いる章と場面を残す（目次の「続きから」に使う。目次そのものは残さない） */
  function rememberPlace() {
    if (LINKS.isHome || EMBED) return;
    var meta = DEF.meta || {};
    var c = ctxs[curScene];
    try { localStorage.setItem('ytm-last', JSON.stringify({ path: location.pathname, scene: curScene, step: c && c.steps ? c.step : 0, title: meta.title || document.title, eyebrow: meta.eyebrow || '' })); } catch (e) { /* 無視 */ }
  }

  /* ---------- 場面の切り替え ---------- */
  function syncNav() {
    $$('.tabs [data-go]').forEach(function (t) {
      if (Number(t.dataset.go) === curScene) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    });
    syncPager();
  }
  /* 上部バーの ‹ ›: 押すとどこへ移るかを題（ツールチップ）に出す。最後の章の最後では › を押せない */
  function syncPager() {
    if (!ui.next) return;
    if (stack.length) {
      // 板が開いている間: ‹ › は一番上の板の段階を動かす（端では押せない）
      var tp = drillTopStep();
      ui.prev.disabled = !tp || tp.step <= 0;
      ui.next.disabled = !tp || tp.step >= tp.n - 1;
      ui.prev.title = '板の前の段階へ（←キー）';
      ui.next.title = '板の次の段階へ（→キー）。板を閉じるのは Esc';
      return;
    }
    var c = ctxs[curScene], n = scenes.length;
    var atStart = LINKS.isHome ? curScene === 0 : (curScene <= 1 && !(c && c.steps && c.step > 0));
    var atEnd = LINKS.isHome ? !!LINKS.next : (curScene === n - 1 && !(c && c.steps && c.step < c.steps.length - 1));
    ui.prev.disabled = atStart && !LINKS.prev && (LINKS.isHome || curScene === 0);
    ui.prev.title = atStart && LINKS.prev ? (LINKS.prev.home ? '目次へ（←キー）' : '前の章へ：' + LINKS.prev.title + '（←キー）') : '前へ（←キー）';
    ui.next.disabled = atEnd && !LINKS.next;
    ui.next.title = atEnd ? (LINKS.next ? (LINKS.isHome ? '第1章から通して見る：' : '次の章へ：') + LINKS.next.title + '（→キー）' : 'おわり') : '次へ（→キー）';
  }
  function showScene(n, move) {
    n = Math.max(0, Math.min(scenes.length - 1, n));
    var changed = n !== curScene;
    if (stack.length && (changed || move)) drillClose(0);   // 場面を移る・選び直すと掘り下げの板を全部閉じる
    curScene = n;
    scenes.forEach(function (s, i) {
      s.classList.toggle('on', i === n);
      s.classList.remove('enter');
    });
    if (isFit()) {
      if (changed && move && !reduced.matches) { void scenes[n].offsetWidth; scenes[n].classList.add('enter'); }
      scenes[n].scrollTop = 0;
      activate(ctxs[n]);
    } else if (move) {
      scenes[n].scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    }
    syncNav();
    // 1画面版では URL の末尾も今の場面と段階にする（‹ › や キーで移っても、再読み込みで同じ所に戻れる）
    if (changed || /^#(last|s\d+\.\d+)$/.test(location.hash)) syncHash();
    rememberPlace();
    if (changed && ctxs[n] && ctxs[n].def.resize) safe(ctxs[n], function () { ctxs[n].def.resize(ctxs[n]); });
    if (EMBED && changed && inited) embedReport();
  }

  function wireNav() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-go]');
      if (!a) return;
      e.preventDefault();
      var n = Number(a.dataset.go);
      if (a.dataset.step !== undefined && STEPPERS[n]) STEPPERS[n].goStep(Number(a.dataset.step));
      showScene(n, true);
      if (isFit()) syncHash(); else if (history.replaceState && !EMBED) history.replaceState(null, '', '#' + scenes[n].id);
    });
    if (ui.prev) ui.prev.addEventListener('click', function () { goPrev(); });
    if (ui.next) ui.next.addEventListener('click', function () { goNext(); });

    var wasFit = isFit(), raf = 0;
    function relayout() {
      raf = 0;
      fit();
      fitActs();
      var f = isFit();
      if (f !== wasFit) {
        wasFit = f;
        if (f) { window.scrollTo(0, 0); showScene(curScene, false); }
        else { scenes.forEach(function (s) { s.classList.remove('enter'); }); scenes[curScene].scrollIntoView({ block: 'start' }); watchMobile(); }
      }
      if (active && active.def.resize) safe(active, function () { active.def.resize(active); });
    }
    window.addEventListener('resize', function () { if (!raf) raf = requestAnimationFrame(relayout); });
    window.addEventListener('hashchange', function () {
      var m = /^#s(\d+)(?:\.(\d+))?$/.exec(location.hash || '');
      if (m) {
        var n = Math.min(scenes.length - 1, Number(m[1]));
        if (m[2] && ctxs[n] && ctxs[n].steps) goStep(ctxs[n], Number(m[2]) - 1);
        showScene(n, true);
      } else if (location.hash === '#last') showScene(scenes.length - 1, true);
    });
  }

  /* 縦読み版: 画面に最も大きく映っている場面を動かす */
  var mobileWatch = null;
  function watchMobile() {
    if (mobileWatch || !('IntersectionObserver' in window)) { if (!mobileWatch) activate(ctxs[curScene]); return; }
    var ratios = new Map();
    mobileWatch = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        ratios.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
        // 画面に入った場面は、いちばん大きく映る前に図を組み立てておく（空の箱を見せない）
        if (en.isIntersecting) { var c = ctxs[scenes.indexOf(en.target)]; if (c && !c.ready) { ensureSetup(c); settle(c); } }
      });
      if (isFit()) return;
      var best = null, bestR = 0;
      scenes.forEach(function (s, i) { var r = ratios.get(s) || 0; if (r > bestR) { bestR = r; best = i; } });
      if (best != null) { curScene = best; activate(ctxs[best]); }
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    scenes.forEach(function (s) { mobileWatch.observe(s); });
  }

  /* ---------- キー操作 ---------- */
  function wireKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target, k = e.key;
      // Esc は掘り下げの板を 1 段閉じる（埋め込みの中で押したときは親に頼む）
      if (k === 'Escape') {
        if (EMBED) { toParent({ type: 'key', key: 'Escape' }); e.preventDefault(); }
        else if (stack.length) { drillClose(stack.length - 1); e.preventDefault(); }
        return;
      }
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) {
        if (!(t.tagName === 'BUTTON' && /^Arrow|^Page/.test(e.key))) return;
      }
      if (k === ' ' && !e.shiftKey) { setPlaying(!motion.playing); e.preventDefault(); return; }
      if (e.shiftKey) return;
      if (EMBED || stack.length) {
        // 埋め込みと、板が開いている間は、←→ で段階だけを動かす（場面・章は移らない）
        if (k === 'ArrowRight') goNext();
        else if (k === 'ArrowLeft') goPrev();
        else return;
        e.preventDefault();
        return;
      }
      if (isFit()) {
        if (k === 'ArrowDown' || k === 'PageDown') goScene(1, false);
        else if (k === 'ArrowUp' || k === 'PageUp') goScene(-1, false);
        else if (k === 'ArrowRight') goNext();
        else if (k === 'ArrowLeft') goPrev();
        else if (k === 'Home') showScene(0, true);
        else if (k === 'End') showScene(scenes.length - 1, true);
        else return;
        e.preventDefault();
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        var sc = t && t.closest && t.closest('.scene');
        var n = sc ? scenes.indexOf(sc) : curScene;
        if (STEPPERS[n]) { STEPPERS[n].step(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
      }
    });
  }

  /* ---------- 段落と図の対応（data-hl） ---------- */
  function wireHl() {
    $$('[data-hl]').forEach(function (src) {
      var sel = src.dataset.hl;
      var set = function (on) {
        $$(sel).forEach(function (e) { e.classList.toggle('lit', on); });
        src.classList.toggle('lit-src', on);
      };
      src.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') set(true); });
      src.addEventListener('pointerleave', function () { set(false); });
    });
  }

  /* ---------------------------------------------------------------
     ズーム：図の箱の中を、前の章の回路で開く「板」（第6章で始めた型。使い方は docs/authoring.md §4・§5）
     板は箱の位置から 0.7 秒で図いっぱい（PANEL）に広がる。開いている間は元の図（base）を消し、
     動きを止めている人には、段階に入った時点で開き切った姿を出す
     --------------------------------------------------------------- */
  var PANEL = { x: 30, y: 56, w: 900, h: 478 };
  var zoom = {
    PANEL: PANEL,
    /* 値の箱（0 / 1 / '?'）。set(v) で中身と色が変わる */
    bit: function (parent, x, y, w, h, fs) {
      var g = el('g', { transform: 'translate(' + x + ',' + y + ')' }, parent);
      var r = svg.rect(-w / 2, -h / 2, w, h, { rx: 4, cls: 'f-in s-rule w1' }, g);
      var t = svg.text(0, Math.round(fs * 0.36), '0', { cls: 't-c t-mono t-b t-dim', style: { fontSize: fs + 'px' } }, g);
      var api = { g: g, v: 0, set: function (v) {
        api.v = v; t.textContent = String(v);
        var q = v === '?' ? ['f-x-soft s-x w1', 't-x'] : (v === 1 ? ['f-h-soft s-h w15', 't-h'] : ['f-in s-rule w1', 't-dim']);
        r.setAttribute('class', q[0]); t.setAttribute('class', 't-c t-mono t-b ' + q[1]); return api;
      } };
      return api;
    },
    /* 板の見出し（題・説明・元の章へのリンク） */
    title: function (g, title, sub, href, linkText) {
      var t = svg.text(46, 82, title, { cls: 't-b t-lg' }, g);
      var s = svg.text(46, 100, sub, { cls: 't-xs t-dim' }, g);
      var a = el('a', { href: href, cls: 'zlink' }, g);
      svg.text(914, 82, linkText + ' を開く ↗', { cls: 't-end t-xs t-dim' }, a);
      return { t: t, s: s };
    },
    /* 板の置き場。add(name, build) で板を作り（build(g) は { frame(u, settled), … } を返す）、apply(z) で開閉を描く。
       base は開いている間に消す図の部品（.fade を付けた要素は 0.35 秒遅れるので、付けていない親で包む） */
    make: function (svgEl, base) {
      var cue = svg.rect(0, 0, 10, 10, { rx: 8, cls: 'f-none s-x w2', style: { display: 'none' } }, svgEl);
      var layer = el('g', { style: { display: 'none' } }, svgEl);
      var panels = {};
      var cx0 = PANEL.x + PANEL.w / 2, cy0 = PANEL.y + PANEL.h / 2;
      return {
        add: function (name, build) {
          var g = el('g', { style: { display: 'none' } }, layer);
          svg.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, { rx: 10, cls: 'f-sf s-x w15' }, g);
          panels[name] = { g: g, api: build(g) };
          return panels[name].api;
        },
        panel: function (name) { return panels[name].api; },
        /* z が無いか z.f = 0 なら閉じる（z.src があれば出どころの箱に合図の枠を出す）。0 < f ≤ 1 で箱から板へ広がる */
        apply: function (z) {
          var k;
          // 板が開いている間は、元の図に付けた掘り下げの印（YT.drill）を出さない（base.css の .zoom-open）
          svgEl.classList.toggle('zoom-open', !!(z && z.f > 0));
          if (!z || z.f <= 0) {
            layer.style.display = 'none';
            base.forEach(function (n) { n.style.opacity = ''; });
            if (z && z.src) {
              var p = 3 + 3 * util.pulse(z.t || 0, 0.8);
              cue.style.display = '';
              attrs(cue, { x: z.src.x - p, y: z.src.y - p, width: z.src.w + 2 * p, height: z.src.h + 2 * p });
            } else cue.style.display = 'none';
            return;
          }
          cue.style.display = 'none';
          layer.style.display = '';
          var f = Math.min(1, z.f), src = z.src;
          for (k in panels) panels[k].g.style.display = k === z.name ? '' : 'none';
          var P = panels[z.name].g;
          var s = util.lerp(Math.min(src.w / PANEL.w, src.h / PANEL.h), 1, f);
          var cx = util.lerp(src.x + src.w / 2, cx0, f), cy = util.lerp(src.y + src.h / 2, cy0, f);
          P.setAttribute('transform', 'translate(' + cx.toFixed(1) + ',' + cy.toFixed(1) + ') scale(' + s.toFixed(4) + ') translate(' + (-cx0) + ',' + (-cy0) + ')');
          P.style.opacity = f < 1 ? (0.25 + 0.75 * f).toFixed(3) : '';
          base.forEach(function (n) { n.style.opacity = f >= 1 ? '0' : (1 - f).toFixed(3); });
        }
      };
    },
    /* 段階に入って t0 秒後に開く板（0.7 秒で開き切る）。動きを止めているときは、最初から開き切った姿（settled） */
    one: function (ctx, name, src, t0) {
      if (!motion.playing) return { name: name, src: src, f: 1, u: 99, settled: true };
      return { name: name, src: src, f: util.ease.out(util.prog(ctx.ts, t0, 0.7)), u: Math.max(0, ctx.ts - t0 - 0.7), settled: false, t: ctx.ts };
    },
    /* 毎フレーム: 開閉を描き、開いていれば板の frame(u, settled) を呼ぶ（u は開き切ってからの秒） */
    run: function (Z, z) { Z.apply(z); if (z && z.f > 0) Z.panel(z.name).frame(z.u, !!z.settled); }
  };

  /* ---------------------------------------------------------------
     掘り下げ（YT.drill）：図の要素に「下の層へ」の印を付け、押すと場面の上に板を重ねて下の層を見せる。
     板の中身は、部品（assets/parts/<名前>.js。YT.parts.define で登録した小さな場面）か、下の章の場面の埋め込み
     （?embed=1 の iframe）。板は積み重なり、Esc で 1 段ずつ戻る。段階や場面が変わると全部閉じる。
     埋め込みの中の印は親に頼み、親が板を積む（板はいつも一番外のページに置く）。設計は docs/layers-plan.md §3 P2、
     書き方は docs/authoring.md「掘り下げ」
     --------------------------------------------------------------- */
  var TO_RE = /^(\d\d)-[a-z0-9-]+\.html(?:#s(\d+)(?:\.(\d+))?)?$/;
  function parseTo(to) {
    var m = TO_RE.exec(String(to || ''));
    return m ? { file: String(to).split('#')[0], ch: Number(m[1]), sc: m[2] ? Number(m[2]) : 0, st: m[3] ? Number(m[3]) : 0 } : null;
  }
  /* 印を付けた要素の場面（章の場面の ctx か、板の中の部品の ctx） */
  function hostOf(node) {
    var pn = node && node.closest && node.closest('.drill-panel');
    if (pn && pn.__ctx) return pn.__ctx;
    var sec = node && node.closest && node.closest('section.scene');
    var i = sec ? scenes.indexOf(sec) : -1;
    return i >= 0 ? ctxs[i] : null;
  }
  /* 印の行き先の名前（一覧と読み上げに使う）。short は一覧の札（段階を省く） */
  function markTarget(o, short) {
    if (o.part) {
      var d = PARTS[o.part];
      return (d && d.def.title ? d.def.title : '部品') + (o.step && !short ? ' 段階' + o.step : '');
    }
    var p = parseTo(o.to);
    return p ? '第' + p.ch + '章 場面' + p.sc + (p.st && !short ? ' 段階' + p.st : '') : String(o.to || '');
  }
  function plainMark(o) {
    return { to: o.to || null, part: o.part || null, step: o.step || 0, params: o.params || null, bridge: o.bridge || '', label: o.label || '' };
  }
  /* 印を付ける。o = { to: '07-shuuhen.html#s3.4' | part: '名前', step: 部品の段階（1 始まり）, params, bridge: つなぎの一文（60 字まで）,
     label: 上の要素の名前（一覧に出す）, steps: [印を出す段階（1 始まり）。省くと全段階], at: [x, y]（札の位置。省くと要素の右上） } */
  function addMark(host, node, o) {
    o = o || {};
    if (!host || !node) { console.error('[YT] 掘り下げの印: 場面の中の要素に付ける', o.to || o.part); return null; }
    if (!o.part && !parseTo(o.to)) { console.error('[YT] 掘り下げの印: 行き先の書き方が正しくない', o.to); return null; }
    var m = { id: 'dm' + (++markSeq), el: node, o: o, host: host, badge: null };
    (host.marks || (host.marks = [])).push(m);
    MARKS.push(m);
    var svgEl = node.ownerSVGElement || (node.tagName === 'svg' ? node : null);
    if (svgEl) {
      var lay = svgEl.__drillLay || (svgEl.__drillLay = el('g', { cls: 'drill-badges' }, svgEl));
      var b = el('g', { cls: 'drill-badge', tabindex: 0, role: 'button', style: { display: 'none' } }, lay);
      el('rect', { x: -13, y: -11, width: 26, height: 22, rx: 5 }, b);
      el('text', { x: 0, y: 5, text: '↓' }, b);
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openMark(m, b); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openMark(m, b); } });
      m.badge = b;
    }
    if (o.part) loadPart(o.part).then(function () { renderMarks(host); }, function () { /* 開くときに知らせる */ });
    renderMarks(host);
    return m;
  }
  /* 札を要素の右上（o.at があればそこ）に置く。図の外へは出さない。測れなければ false */
  function placeBadge(m) {
    var b = m.badge, svgEl = b && b.ownerSVGElement;
    if (!svgEl) return false;
    var x, y;
    if (m.o.at) { x = m.o.at[0]; y = m.o.at[1]; }
    else {
      try {
        var bb = m.el.getBBox(), a = svgEl.getScreenCTM(), c = m.el.getScreenCTM();
        if (!a || !c || !(bb.width + bb.height > 0)) return false;
        var pt = svgEl.createSVGPoint();
        pt.x = bb.x + bb.width; pt.y = bb.y;
        pt = pt.matrixTransform(a.inverse().multiply(c));
        x = pt.x + 6; y = pt.y - 4;
      } catch (e) { return false; }
    }
    var vb = svgEl.viewBox && svgEl.viewBox.baseVal, W = (vb && vb.width) || 960, H = (vb && vb.height) || 560;
    b.setAttribute('transform', 'translate(' + util.clamp(x, 15, W - 15).toFixed(1) + ',' + util.clamp(y, 13, H - 13).toFixed(1) + ')');
    return true;
  }
  /* いまの段階の印だけを出し、説明欄の下の一覧を作り直す */
  function renderMarks(host) {
    if (!host || !host.marks) return;
    var no = (host.steps ? host.step : 0) + 1;
    var vis = host.marks.filter(function (m) { return !m.o.steps || m.o.steps.indexOf(no) >= 0; });
    host.marks.forEach(function (m) {
      if (!m.badge) return;
      var on = vis.indexOf(m) >= 0 && placeBadge(m);
      m.badge.style.display = on ? '' : 'none';
      m.badge.setAttribute('aria-label', '掘り下げ：' + (m.o.label ? m.o.label + ' → ' : '') + markTarget(m.o));
    });
    if (vis.length && vis[0].badge) { var lay = vis[0].badge.parentNode; lay.parentNode.appendChild(lay); }   // 札はいつも図の一番上
    var list = host.ui && host.ui.drill;
    if (!list) return;
    list.innerHTML = '';
    list.hidden = !vis.length;
    if (!vis.length) return;
    var hd = document.createElement('span');
    hd.className = 'dl-head';
    hd.textContent = '下の層へ';
    list.appendChild(hd);
    vis.forEach(function (m) {
      var bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'drill-item';
      bt.innerHTML = '<span class="dl-arrow" aria-hidden="true">↓</span>' + (m.o.label ? '<span class="dl-label">' + esc(m.o.label) + '</span><span class="dl-to">' : '<span class="dl-to solo">') + esc(markTarget(m.o, true)) + '</span>';
      bt.title = (m.o.bridge ? m.o.bridge + '\n' : '') + '→ ' + markTarget(m.o);
      bt.addEventListener('click', function () { openMark(m, m.badge && m.badge.style.display !== 'none' ? m.badge : bt, bt); });
      list.appendChild(bt);
    });
  }
  /* 印を押した。埋め込みの中なら親に頼む。from は広がり始める位置の要素、back は閉じた後に戻すフォーカス */
  function openMark(m, from, back) {
    var r = (from || m.el).getBoundingClientRect();
    if (EMBED && window.parent !== window) { toParent({ type: 'open', mark: plainMark(m.o), rect: { x: r.left, y: r.top, w: r.width, h: r.height } }); return; }
    var depth = m.host && m.host.__depth != null ? m.host.__depth + 1 : 0;
    drillOpen(plainMark(m.o), { x: r.left, y: r.top, w: r.width, h: r.height }, depth, back || from);
  }

  /* ---------- 板 ---------- */
  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'drill-layer';
    layer.hidden = true;
    ($('.scenes') || document.body).appendChild(layer);
    return layer;
  }
  function chapterNo() { var m = /(?:^|\/)(\d\d)-[a-z0-9-]+\.html$/.exec(location.pathname); return m ? Number(m[1]) : 0; }
  function sceneTitle(sec) { var h = sec && sec.querySelector('.sh h2'); if (!h) return ''; var c = h.cloneNode(true); var n = c.querySelector('.n'); if (n) n.remove(); return c.textContent.replace(/\s+/g, ' ').trim(); }
  function baseLabel(short) {
    var ch = chapterNo(), t = short ? '' : sceneTitle(scenes[curScene]);
    return (ch ? '第' + ch + '章 ' : '') + '場面' + curScene + (t ? ' ' + t : '');
  }
  function panelLabel(p, short) {
    if (p.kind === 'part') { var d = PARTS[p.o.part]; return d && d.def.title ? d.def.title : p.o.part; }
    var s = p.state, t = parseTo(p.o.to);
    if (s) return '第' + s.ch + '章 場面' + s.scene + (short || !s.sceneTitle ? '' : ' ' + s.sceneTitle);
    return t ? '第' + t.ch + '章 場面' + t.sc : '';
  }
  function panelHref(p) {
    if (p.kind === 'part') { var d = PARTS[p.o.part]; return d && d.def.home ? urlIn(d.def.home, CHAPTERS_URL) : null; }
    var s = p.state, t = parseTo(p.o.to);
    if (s) return urlIn(s.file + '#s' + s.scene + (s.step > 0 ? '.' + (s.step + 1) : ''), CHAPTERS_URL);
    return t ? urlIn(p.o.to, CHAPTERS_URL) : null;
  }
  /* 板の上端: 道筋（押すとその深さまで戻る）・つなぎの一文・章を開く・閉じる */
  function syncHead(p, k) {
    var nav = p.el.querySelector('.dp-crumbs');
    nav.innerHTML = '';
    var add = function (label, depth) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dp-crumb';
      b.textContent = label;
      b.title = depth < 0 ? '掘り下げを全部閉じて、この場面に戻る' : 'ここまで戻る';
      b.addEventListener('click', function () { drillClose(depth + 1); });
      nav.appendChild(b);
      var sp = document.createElement('span');
      sp.className = 'dp-sep';
      sp.setAttribute('aria-hidden', 'true');
      sp.textContent = '›';
      nav.appendChild(sp);
    };
    add(baseLabel(k > 0), -1);
    for (var j = 0; j < k; j++) add(panelLabel(stack[j], true), j);
    var cur = document.createElement('b');
    cur.id = p.el.id + '-t';
    cur.className = 'dp-cur';
    cur.textContent = panelLabel(p, false) + (p.kind === 'part' ? '（部品）' : '');
    nav.appendChild(cur);
    nav.scrollLeft = nav.scrollWidth;   // 縦読み版の 1 行の道筋は、いまの板（右端）を見せる
    p.el.querySelector('.dp-bridge').textContent = p.o.bridge || '';
    var a = p.el.querySelector('.dp-open'), href = panelHref(p);
    if (href) { a.href = href; a.hidden = false; } else a.hidden = true;
  }
  function syncHeads() { stack.forEach(syncHead); }
  function buildPanel(p) {
    var sec = document.createElement('section');
    sec.className = 'drill-panel ' + (p.kind === 'part' ? 'dp-part' : 'dp-frame');
    sec.id = 'dp' + (++panelSeq);
    sec.setAttribute('role', 'dialog');
    sec.setAttribute('aria-modal', 'true');
    sec.setAttribute('aria-labelledby', sec.id + '-t');
    sec.tabIndex = -1;
    sec.innerHTML =
      '<header class="dp-head">' +
        '<nav class="dp-crumbs" aria-label="掘り下げの道筋"></nav>' +
        '<div class="dp-acts"><a class="dp-open" href="#">章を開く ↗</a><button type="button" class="dp-close">閉じる<span class="dp-esc">（Esc）</span></button></div>' +
        '<p class="dp-bridge"></p>' +
      '</header>' +
      '<div class="dp-body"></div>';
    sec.querySelector('.dp-close').addEventListener('click', function () { drillClose(stack.indexOf(p)); });
    var body = sec.querySelector('.dp-body');
    if (p.kind === 'part') {
      body.innerHTML =
        '<div class="dp-left">' +
          '<div class="panel">' +
            '<div class="narr" aria-live="polite"><p class="where"></p><h3></h3><p class="txt"></p></div>' +
            '<div class="drill-list" hidden></div>' +
            '<div class="dp-ctrls"><button type="button" class="btn dp-prev">← 前へ</button><span class="counter"></span><button type="button" class="btn primary dp-next">次へ →</button></div>' +
          '</div>' +
          '<p class="note dp-note"></p>' +
        '</div>' +
        '<figure class="anim-fig dp-fig"><div class="fig-scroll" data-scroll-x><svg viewBox="0 0 960 560" role="img"></svg></div><figcaption></figcaption></figure>';
    } else {
      var f = document.createElement('iframe');
      var t = parseTo(p.o.to);
      f.className = 'dp-iframe';
      f.title = t ? '第' + t.ch + '章 場面' + t.sc + ' の埋め込み' : '章の埋め込み';
      var parts = String(p.o.to).split('#');
      f.src = urlIn(parts[0], CHAPTERS_URL) + '?embed=1' + (parts[1] ? '#' + parts[1] : '');
      body.appendChild(f);
      p.frame = f;
    }
    return sec;
  }
  /* 板を開く。o は印（plainMark）、rect は広がり始める位置（画面の座標）、depth は積む深さ（0 が一番下） */
  function drillOpen(o, rect, depth, back) {
    if (EMBED) return;
    if (!o.part && !parseTo(o.to)) { console.error('[YT] 掘り下げ: 行き先が正しくない', o.to); return; }
    ensureLayer();
    if (stack.length > depth) drillClose(depth, true);
    var p = { o: o, depth: stack.length, kind: o.part ? 'part' : 'frame', ready: false, state: null, back: back || document.activeElement, ctx: null, frame: null };
    p.el = buildPanel(p);
    layer.appendChild(p.el);
    stack.push(p);
    armHistory();
    layer.hidden = false;
    root.classList.add('drill-on');
    scenes.forEach(function (s) { s.inert = true; });
    syncHeads();
    syncPager();
    growFrom(p, rect);
    if (p.kind === 'part') {
      loadPart(o.part).then(function (d) { if (stack.indexOf(p) >= 0) mountPart(p, d); }, function (err) {
        console.error('[YT] 掘り下げ: ' + (err && err.message ? err.message : err));
        p.el.querySelector('.dp-body').insertAdjacentHTML('beforeend', '<p class="anim-err">部品を読み込めない: ' + esc(o.part) + '</p>');
      });
    } else {
      var fr = p.el.querySelector('.dp-iframe');
      fr.addEventListener('load', function () { if (stack[stack.length - 1] === p) fr.focus({ preventScroll: true }); });
    }
  }
  /* 印の位置から板いっぱいへ広げる（YT.zoom と同じ動き）。広がり切ったら下の板を隠す */
  function growFrom(p, rect) {
    var below = stack.slice(0, stack.length - 1);
    var done = function () { below.forEach(function (q) { if (stack.indexOf(q) >= 0) q.el.hidden = true; }); p.el.style.transform = ''; p.el.style.opacity = ''; p.el.style.transition = ''; };
    if (!rect || !motion.playing || reduced.matches || !isFit()) { done(); if (p.kind === 'part') p.el.focus({ preventScroll: true }); return; }
    var L = p.el.getBoundingClientRect(), s = L.width / (p.el.offsetWidth || L.width) || 1;
    var w = rect.w / s, h = rect.h / s, W = p.el.offsetWidth, H = p.el.offsetHeight;
    var k = Math.max(0.02, Math.min(w / W, h / H));
    var cx = (rect.x + rect.w / 2 - L.left) / s, cy = (rect.y + rect.h / 2 - L.top) / s;
    p.el.style.transformOrigin = '0 0';
    p.el.style.transition = 'none';
    p.el.style.transform = 'translate(' + (cx - W * k / 2).toFixed(1) + 'px,' + (cy - H * k / 2).toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
    p.el.style.opacity = '0.25';
    void p.el.offsetWidth;
    p.el.style.transition = 'transform 0.45s cubic-bezier(.2,.7,.2,1), opacity 0.3s ease-out';
    p.el.style.transform = 'none';
    p.el.style.opacity = '1';
    var fin = false;
    var end = function () { if (fin) return; fin = true; done(); if (p.kind === 'part') p.el.focus({ preventScroll: true }); };
    p.el.addEventListener('transitionend', function te(e) { if (e.target === p.el && e.propertyName === 'transform') { p.el.removeEventListener('transitionend', te); end(); } });
    setTimeout(end, 600);
  }
  /* depth より上の板を全部閉じる（0 で全部）。quiet ならフォーカスを戻さない */
  function drillClose(depth, quiet) {
    depth = Math.max(0, depth || 0);
    if (stack.length <= depth) return;
    var gone = stack.splice(depth);
    gone.forEach(function (p) {
      if (p.ctx && p.ctx.def.leave) safe(p.ctx, function () { p.ctx.def.leave(p.ctx); });
      p.el.remove();
    });
    var top = stack[stack.length - 1];
    if (top) { top.el.hidden = false; if (top.kind === 'part' && top.ctx) settleP(top.ctx); }
    else {
      layer.hidden = true;
      root.classList.remove('drill-on');
      scenes.forEach(function (s) { s.inert = false; });
      if (active) settle(active);
      disarmHistory();
    }
    syncHeads();
    syncPager();
    if (!quiet) {
      var b = gone[0].back;
      if (b && b.isConnected && b.getClientRects().length) { try { b.focus({ preventScroll: true }); } catch (e) { /* 無視 */ } }
      else if (top) (top.frame || top.el).focus({ preventScroll: true });
    }
  }
  function drillTopStep() {
    var p = stack[stack.length - 1];
    if (!p) return null;
    if (p.ctx && p.ctx.steps) return { step: p.ctx.step, n: p.ctx.steps.length };
    if (p.state) return { step: p.state.step, n: p.state.n };
    return null;
  }
  function drillStep(d) {
    var p = stack[stack.length - 1];
    if (!p) return false;
    if (p.ctx) partStep(p.ctx, p.ctx.step + d);
    else if (p.frame) toChild(p.frame, { type: 'step', d: d });
    return true;
  }
  /* 止める・速さを板に知らせる */
  function drillMotion() {
    stack.forEach(function (p) {
      if (p.ctx) settleP(p.ctx);
      if (p.frame) toChild(p.frame, { type: 'motion', playing: motion.playing, speed: motion.speed });
    });
  }

  /* ---------- 部品 ---------- */
  function loadPart(name) {
    if (PARTS[name]) return Promise.resolve(PARTS[name]);
    if (partWait[name]) return partWait[name];
    if (!/^[a-z0-9-]+$/.test(String(name))) return Promise.reject(new Error('部品の名前が正しくない: ' + name));
    partWait[name] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = PARTS_URL + name + '.js';
      s.onload = function () { if (PARTS[name]) res(PARTS[name]); else rej(new Error('部品 ' + name + ' が YT.parts.define を呼んでいない')); };
      s.onerror = function () { rej(new Error('部品 ' + name + ' を読み込めない（assets/parts/' + name + '.js）')); };
      document.head.appendChild(s);
    });
    partWait[name].catch(function (err) { console.error('[YT] ' + (err && err.message ? err.message : err)); });
    return partWait[name];
  }
  var parts = {
    /* 部品を登録する（assets/parts/<名前>.js の中で呼ぶ）。def = { title, layer, home: '06-cpu.html#s3', caption, note,
       steps: [ { title, text, where } ] か (params) => [...], setup(ctx), onStep(ctx, i, prev), frame(ctx, t, dt), leave(ctx) }。
       ctx は章の場面と同じ形（svg・steps・step・t・ts・state・goStep…）に、params（印から渡す値）と mark(el, o)（部品の中の印）を足したもの */
    define: function (name, def) { PARTS[name] = { name: name, def: def || {} }; },
    get: function (name) { return PARTS[name] || null; },
    load: loadPart
  };
  function mountPart(p, d) {
    var def = d.def, o = p.o, sec = p.el;
    var steps = typeof def.steps === 'function' ? def.steps(o.params || {}) : def.steps;
    var pc = {
      id: 'part:' + o.part, part: o.part, root: sec, svg: sec.querySelector('.dp-fig svg'), def: def, params: o.params || {},
      steps: steps && steps.length ? steps : null, step: 0, t: 0, ts: 0, state: {}, ready: false, marks: [], __depth: p.depth,
      ui: { where: sec.querySelector('.narr .where'), title: sec.querySelector('.narr h3'), text: sec.querySelector('.narr .txt'), drill: sec.querySelector('.drill-list'),
        count: sec.querySelector('.dp-ctrls .counter'), prev: sec.querySelector('.dp-prev'), next: sec.querySelector('.dp-next') },
      $: function (s) { return sec.querySelector(s); },
      $$: function (s) { return $$(s, sec); }
    };
    pc.goStep = function (n) { partStep(pc, n); };
    pc.next = function () { partStep(pc, pc.step + 1); };
    pc.prev = function () { partStep(pc, pc.step - 1); };
    pc.settle = function () { settleP(pc); };
    pc.mark = function (node, mo) { return addMark(pc, node, mo); };
    sec.__ctx = pc;
    p.ctx = pc;
    if (def.title) pc.svg.setAttribute('aria-label', def.title);
    sec.querySelector('.dp-fig figcaption').textContent = def.caption || '';
    var note = sec.querySelector('.dp-note');
    note.innerHTML = def.note ? rich(def.note) : '';
    note.hidden = !def.note;
    pc.ui.prev.addEventListener('click', pc.prev);
    pc.ui.next.addEventListener('click', pc.next);
    safe(pc, function () { if (def.setup) def.setup(pc); });
    pc.ready = true;
    partStep(pc, o.step ? o.step - 1 : 0, true);
    p.ready = true;
    sec.dataset.ready = '1';
    syncHeads();
  }
  function partStep(pc, n, first) {
    var N = pc.steps ? pc.steps.length : 1;
    n = util.clamp(n, 0, N - 1);
    if (!first && n === pc.step) return;
    var prev = first ? -1 : pc.step;
    pc.step = n;
    pc.ts = 0;
    var st = pc.steps ? pc.steps[n] : {}, u = pc.ui;
    u.where.textContent = st.where || '';
    u.title.textContent = st.title || '';
    u.text.innerHTML = rich(st.text || '');
    u.count.textContent = (n + 1) + ' / ' + N;
    u.prev.disabled = n === 0;
    u.next.disabled = n === N - 1;
    if (pc.ready) {
      safe(pc, function () { if (st.enter) st.enter(pc, prev); if (pc.def.onStep) pc.def.onStep(pc, n, prev); });
      settleP(pc);
      renderMarks(pc);
    }
    if (stack.length && stack[stack.length - 1].ctx === pc) syncPager();
  }
  function settleP(pc) {
    if (!pc.ready || !pc.def.frame) return;
    safe(pc, function () { pc.def.frame(pc, pc.t, 0); });
  }

  /* ---------- 埋め込みと親の通知（同じオリジンの親子だけ） ---------- */
  var ORIGIN = location.origin && location.origin !== 'null' ? location.origin : '*';
  function okOrigin(e) { return e.origin === location.origin || (ORIGIN === '*' && e.origin === 'null'); }
  function toParent(msg) {
    if (!EMBED || window.parent === window) return;
    msg.yt = 'drill';
    try { window.parent.postMessage(msg, ORIGIN); } catch (e) { /* 無視 */ }
  }
  function toChild(frame, msg) {
    msg.yt = 'drill';
    try { frame.contentWindow.postMessage(msg, ORIGIN); } catch (e) { /* 無視 */ }
  }
  /* 埋め込みの側: いまの章・場面・段階を親に知らせる（道筋・章を開く・‹ › の可否に使う） */
  function embedReport() {
    var c = ctxs[curScene], meta = DEF.meta || {};
    toParent({ type: 'state', ch: chapterNo(), chTitle: meta.title || '', file: (/[^/]+$/.exec(location.pathname) || [''])[0], scene: curScene,
      sceneTitle: sceneTitle(scenes[curScene]), step: c && c.steps ? c.step : 0, n: c && c.steps ? c.steps.length : 1, stepTitle: c && c.steps ? c.steps[c.step].title || '' : '' });
  }
  function fromParent(e) {
    var d = e.data;
    if (!d || d.yt !== 'drill' || e.source !== window.parent || !okOrigin(e)) return;
    if (d.type === 'step') { var c = ctxs[curScene]; if (c && c.steps) goStep(c, c.step + (d.d > 0 ? 1 : -1)); }
    else if (d.type === 'motion') {
      motion.playing = !!d.playing;
      if ([0, 0.5, 1, 2].indexOf(Number(d.speed)) >= 0) motion.speed = Number(d.speed);
      syncPlay();
      if (active) settle(active);
    }
  }
  /* 縦読み版では、板が開いている間だけ履歴を 1 つ積み、ブラウザの「戻る」（スマートフォンの戻る操作）で板を 1 段閉じる
     （まだ板が残れば積み直す）。1画面版は URL の末尾を書き換えて履歴を増やさない方針なので積まない（閉じるのは Esc・閉じる・道筋）。
     閉じるボタンなどで全部閉じたときは、積んだ分を自分で戻す（その popstate は skipPop で読み飛ばす） */
  function armHistory() {
    if (EMBED || armed || isFit()) return;
    try { history.pushState({ ytDrill: 1 }, ''); armed = true; } catch (e) { /* 無視 */ }
  }
  function disarmHistory() {
    if (!armed) return;
    armed = false;
    skipPop++;
    try { history.back(); } catch (e) { skipPop--; }
  }
  window.addEventListener('popstate', function () {
    if (EMBED) return;
    if (skipPop > 0) { skipPop--; return; }
    if (!armed) return;
    armed = false;
    if (stack.length) { drillClose(stack.length - 1); if (stack.length) armHistory(); }
  });
  /* 一番外のページの側: 板の iframe からの通知 */
  function fromChild(e) {
    var d = e.data;
    if (!d || d.yt !== 'drill' || !okOrigin(e)) return;
    var k = -1;
    stack.forEach(function (p, j) { if (p.frame && p.frame.contentWindow === e.source) k = j; });
    if (k < 0) return;
    var p = stack[k];
    if (d.type === 'state') {
      p.state = { ch: Number(d.ch) || 0, chTitle: String(d.chTitle || ''), file: String(d.file || ''), scene: Number(d.scene) || 0, sceneTitle: String(d.sceneTitle || ''), step: Number(d.step) || 0, n: Number(d.n) || 1, stepTitle: String(d.stepTitle || '') };
      if (!parseTo(p.state.file)) p.state.file = String(p.o.to).split('#')[0];
      if (!p.ready) { p.ready = true; p.el.dataset.ready = '1'; }
      if (k < stack.length - 1) drillClose(k + 1, true);   // 下の板の段階が変わったら、その上は閉じる
      syncHeads();
      if (k === stack.length - 1) syncPager();
    } else if (d.type === 'open' && d.mark && k === stack.length - 1) {
      var fr = p.frame.getBoundingClientRect(), s = fr.width / (p.frame.clientWidth || fr.width) || 1, r = d.rect || {};
      drillOpen(plainMark(d.mark), { x: fr.left + (Number(r.x) || 0) * s, y: fr.top + (Number(r.y) || 0) * s, w: (Number(r.w) || 0) * s, h: (Number(r.h) || 0) * s }, k + 1, p.frame);
    } else if (d.type === 'key') {
      if (d.key === 'Escape') drillClose(stack.length - 1);
      else if (d.key === ' ') setPlaying(!motion.playing);
    } else if (d.type === 'error') {
      console.error('[YT] 埋め込み ' + p.o.to + ' でエラー: ' + String(d.msg || '').slice(0, 300));
    }
  }

  /* 計測（tools/verify.mjs --drill）と章のスクリプトから使う入口 */
  var drillApi = {
    /* 場面 n（省くといま）の印。steps は印を出す段階（1 始まり、null は全段階） */
    marks: function (n) {
      var c = n == null ? ctxs[curScene] : ctxs[n];
      return ((c && c.marks) || []).map(function (m) { return { id: m.id, to: m.o.to || null, part: m.o.part || null, step: m.o.step || 0, steps: m.o.steps || null, label: m.o.label || '', bridge: m.o.bridge || '', shown: !!(m.badge && m.badge.style.display !== 'none') }; });
    },
    /* 印 id を開く（板の中の部品の印も） */
    open: function (id) { var m = MARKS.filter(function (x) { return x.id === id; })[0]; if (m) openMark(m, m.badge && m.badge.style.display !== 'none' ? m.badge : m.el); return !!m; },
    close: function (depth) { drillClose(depth || 0, true); },
    stack: function () { return stack.map(function (p) { return { kind: p.kind, part: p.o.part, to: p.o.to, ready: !!p.ready, state: p.state, step: p.ctx ? p.ctx.step : (p.state ? p.state.step : null), n: p.ctx && p.ctx.steps ? p.ctx.steps.length : (p.state ? p.state.n : null), label: panelLabel(p, false) }; }); },
    /* 一番上の板の部品の ctx（無ければ null）と、板の iframe */
    top: function () { var p = stack[stack.length - 1]; return p && p.ctx ? p.ctx : null; },
    frame: function () { var p = stack[stack.length - 1]; return p && p.frame ? p.frame : null; },
    panel: function () { var p = stack[stack.length - 1]; return p ? p.el : null; }
  };
  var drill = {
    /* 図の要素 el に印を付ける（章の場面の setup か、部品の setup の中で）。o は addMark の説明 */
    mark: function (node, o) { return addMark(hostOf(node), node, o); },
    open: function (o) { drillOpen(plainMark(o || {}), null, stack.length); },
    close: function () { drillClose(0); }
  };

  window.YT = { util: util, svg: svg, anim: anim, zoom: zoom, drill: drill, parts: parts, chapter: chapter, motion: motion, rich: rich, esc: esc };
})();
