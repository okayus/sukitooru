/* ============================================================
   台本の部品 seq（やりとりの列）— assets/parts/seq.js

   ニュースのノートの台本（```anim seq）を描く。送り手と受け手（actor）を列にし、下へ時間が進む。
   msg は送り手から受け手への矢印（宣言の順に 1 行ずつ下へ）、note は列の上の箱（状態やその場の処理）。
   段階で msg を出すと、矢印が送り手から伸び、x の msg には粒が流れ続ける。
   台本の書き方は news/README.md「動きの場面（台本）」、読み方は assets/anim-script.js、共通の道具は assets/anim.js。
   見本の台本は第19章 場面2（3 ウェイハンドシェイク）の例の値。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var X0 = 32, XW = 896, TOP = 50, BOT = 542;

  YT.parts.define('seq', {
    generic: true,
    title: 'やりとりの列',
    use: 'プロトコルのやりとり・攻撃の流れ',
    lead: '送り手と受け手の間のメッセージを、時間の順に 1 本ずつ出していく台本の部品。プロトコルのやりとりや、攻撃の手順のニュースに使う。見本は第19章 場面2 の例。',
    caption: '図　列が通信の両端で、下へ時間が進む。矢印 1 本がメッセージ 1 つ、列の上の箱はその場の状態。x はその段階で出た物。',
    note: 'actor（2〜5 列）を宣言し、msg「a -> b: 札」と note「a: 札」を時間の順に書く（合わせて 10 行まで）。',
    sample: [
      'title: TCP の 3 ウェイハンドシェイク（第19章 場面2 の例）',
      'caption: 列が PC とサーバーで、下へ時間が進む。矢印 1 本がセグメント 1 個、箱はその時点の接続の状態。',
      'actor pc: PC | 51235 番',
      'actor srv: サーバー | 443 番',
      'msg m1: pc -> srv: SYN（ISN x、MSS 1,460）',
      'note n1: pc: SYN_SENT',
      'msg m2: srv -> pc: SYN/ACK（ISN y、ACK x＋1）',
      'note n2: srv: SYN_RECV',
      'msg m3: pc -> srv: ACK（y＋1）',
      'note n3: pc: ESTABLISHED',
      'note n4: srv: ESTABLISHED',
      'msg m4: pc -> srv: TLS の ClientHello',
      'step: SYN：番号の始まりを知らせる',
      'PC は 443 番へ SYN を送る。データは無く、自分の初期シーケンス番号（ISN）x と、1 個で受け取れる最大の量（MSS、1,460 バイト）などを載せる。PC の状態は SYN_SENT になる。',
      'show: m1 n1',
      'down: m1 -> 18-ip.html#s5.5: SYN の MSS 1,460 は、MTU 1,500 から IP と TCP のヘッダ 40 バイトを引いた値',
      'step: SYN/ACK：受け取りの印と相手の番号',
      'サーバーは自分の ISN y を載せた SYN と、「x＋1 番から待つ」という ACK を 1 個にまとめて返す。SYN はデータが無くても番号を 1 つ使うので、受け取りの印は x＋1 になる。',
      'show: m2 n2',
      'step: ACK：両端が ESTABLISHED に',
      'PC が y＋1 への ACK を返すと、両端とも ESTABLISHED になる。PC は SYN から 1 往復で ESTABLISHED に入り、この ACK に続けてデータを送れる。',
      'show: m3 n3 n4',
      'step: 要求までに 2 往復',
      'YouTube の通信は暗号化するので、TCP の 1 往復のあとに TLS 1.3 の 1 往復が続き、HTTP の要求は 2 往復目の後になる。往復 10 ms なら 20 ms。',
      'show: m4'
    ].join('\n'),
    steps: function (p) { return YT_ANIM.steps(p); },
    setup: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, svg = ctx.svg;
      A.head(ctx);
      st.mk = S.markers(svg);
      var actors = A.kinds(p, 'actor'), n = actors.length, lw = XW / n;
      var rows = p.items.filter(function (it) { return it.kind === 'msg' || it.kind === 'note'; });
      st.cx = {};
      actors.forEach(function (a, k) { st.cx[a.id] = X0 + lw * (k + 0.5); });
      var gLife = S.g({}, svg);
      // 列の頭の箱（高さは段階を通した札が入る高さ）
      var w = Math.min(lw - 20, 210);
      st.actor = {};
      var hh = 0;
      actors.forEach(function (a) {
        var c = A.card(svg, st.cx[a.id] - w / 2, TOP, w, A.variants(p, a.id), { minH: 36 });
        st.actor[a.id] = c;
        c.g.classList.add('fade');
        hh = Math.max(hh, c.h);
      });
      st.life = {};
      actors.forEach(function (a) { st.life[a.id] = S.line(st.cx[a.id], TOP + st.actor[a.id].h, st.cx[a.id], BOT, { cls: 's-rule w15 dash' }, gLife); });
      // 行: msg は矢印と札、note は列の上の箱
      var top = TOP + hh + 16, rh = Math.min(56, (BOT - top) / Math.max(1, rows.length));
      st.row = {};
      st.gArrow = S.g({}, svg);
      rows.forEach(function (it, r) {
        var y = top + rh * (r + 0.5) + 6;
        if (it.kind === 'msg') {
          var x1 = st.cx[it.from], x2 = st.cx[it.to], dir = x2 > x1 ? 1 : -1;
          var path = S.path('M' + (x1 + dir * 5) + ',' + y.toFixed(1) + ' H' + (x2 - dir * 7), { cls: 'f-none s-d w15' }, st.gArrow);
          var tag = A.tag(svg, (x1 + x2) / 2, y - 12, '', { cls: 't-sm' });
          st.row[it.id] = { it: it, y: y, path: path, tag: tag, dot: S.circle(0, 0, 4.5, { cls: 'f-d', style: { display: 'none' } }, svg), x1: x1, x2: x2 };
        } else {
          // 箱は 1 行の札が入る幅（列の幅より広くてよい。行に置くのはこの箱だけ）。図の外へは出さない
          var need = A.variants(p, it.id).reduce(function (m, v) { return Math.max(m, A.measure(svg, 't-sm t-b', v[0])); }, 0) + 20;
          var cw = Math.min(XW, Math.max(Math.min(lw - 28, 190), Math.min(need, 2 * lw - 40)));
          var cx0 = Math.max(X0, Math.min(X0 + XW - cw, st.cx[it.on] - cw / 2));
          var c = A.card(svg, cx0, 0, cw, A.variants(p, it.id), { lcls: 't-sm', lines: 1, minH: 26, rx: 4, pad: 8 });
          var cy = y - 6 - c.h / 2;
          c.g.setAttribute('transform', 'translate(0,' + cy.toFixed(1) + ')');
          c.y = cy;
          c.g.classList.add('fade');
          st.row[it.id] = { it: it, y: y, card: c };
        }
      });
      // 矢印の札の中心: 矢印の真ん中。幅 w の札が図の外へ出るなら内へ寄せる
      st.mid = function (r, w) { return Math.max(8 + w / 2, Math.min(952 - w / 2, (r.x1 + r.x2) / 2)); };
      // 掘り下げの印の札: 箱は上の縁の右（2 つ目からは左へ。箱の文字は上の縁から 9px より下なので隠さない）。
      // 矢印は札の右か左（k 番目は 30 ずつ外へ）で、矢じり（受け手の列の手前 6〜19px）と図の外を避ける。矢じりは文字でないので --overlap は拾わない
      st.anchor = function (id, s, k) {
        var a = st.actor[id] || (st.row[id] && st.row[id].card), r = st.row[id];
        if (a) return { el: a.rect, x: a.x + a.w - 14, y: a.y - 4, dx: -30 };
        if (!r) return null;
        var q = A.stOf(ctx, s, id), half = A.measure(svg, 't-sm' + (q.x ? ' t-b' : ''), q.l || r.it.label) / 2, mid = st.mid(r, half * 2);
        var head = r.x2 - (r.x2 > r.x1 ? 12.5 : -12.5), n = k || 0;
        var xs = [mid + half + 20 + 30 * n, mid - half - 20 - 30 * n].filter(function (x) { return x >= 15 && x <= 945 && Math.abs(x - head) >= 22; });
        return xs.length ? { el: r.path, x: xs[0], y: r.y - 12, dx: 0 } : { el: r.path, x: mid, y: r.y - 34, dx: 0 };
      };
    },
    onStep: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx);
      Object.keys(st.actor).forEach(function (id) {
        var s = now.st[id] || {}, c = st.actor[id];
        c.set(s.l, s.s, s);
        c.g.classList.toggle('hide', !s.v);
        st.life[id].style.display = s.v ? '' : 'none';
      });
      Object.keys(st.row).forEach(function (id) {
        var s = now.st[id] || {}, r = st.row[id];
        if (r.card) { r.card.set(s.l, s.s, s); r.card.g.classList.toggle('hide', !s.v); return; }
        r.path.style.display = s.v ? '' : 'none';
        r.path.setAttribute('class', A.lineCls('data', s));
        r.path.setAttribute('marker-end', st.mk(A.lineColor('data', s)));
        var cls = 't-sm' + (s.x ? ' t-b' : '') + (s.b && !s.x ? ' t-mid' : ''), text = s.v ? s.l : '';
        r.tag.set(text, cls, st.mid(r, A.measure(ctx.svg, cls, text)), r.y - 12);
      });
    },
    frame: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx), f = A.growth(ctx), run = YT.motion.playing;
      Object.keys(st.row).forEach(function (id) {
        var r = st.row[id], s = now.st[id] || {};
        if (r.card) return;
        var fresh = now.fresh.indexOf(id) >= 0;
        A.grow(r.path, fresh ? f : 1);
        // 粒: 伸びている間は矢印の先に、伸び切った後は x の矢印を 2.4 秒ごとに流れる（止めているときは出さない）
        var on = run && s.v && (fresh && f < 1 || s.x), u = fresh && f < 1 ? f : YT.util.cycle(ctx.ts, 2.4);
        r.dot.style.display = on ? '' : 'none';
        if (on) { r.dot.setAttribute('cx', (r.x1 + (r.x2 - r.x1) * u).toFixed(1)); r.dot.setAttribute('cy', r.y.toFixed(1)); }
      });
    }
  });
})();
