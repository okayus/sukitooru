/* ============================================================
   台本の部品 timeline（時間の軸）— assets/parts/timeline.js

   ニュースのノートの台本（```anim timeline）を描く。上から下へ時間が進む軸に、出来事（event）を宣言の順に等しい間隔で並べ、
   左に時刻、右に札と小さい札を出す。間があいた所は gap（軸を切った印と、あいた長さ）で示す。軸の濃い線は、
   いま見えている最後の出来事まで伸びる。間隔は時間に比例しない（時刻の文字で読む）。
   台本の書き方は news/README.md「動きの場面（台本）」、読み方は assets/anim-script.js、共通の道具は assets/anim.js。
   見本の台本は第17章 場面6 と第20章 場面6 の年（DNS と名前を隠す仕組み）。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var AX = 204, TOP = 76, BOT = 534;

  YT.parts.define('timeline', {
    generic: true,
    title: '時間の軸',
    use: '事故の経緯・仕様と実装の年表',
    lead: '出来事を時刻の順に並べ、段階ごとに出していく台本の部品。事故が見つかってから止まるまでの経緯や、仕様と実装の年表に使う。見本は第17・20章の年。',
    caption: '図　上から下へ時間が進む。間隔は時間に比例しない。軸を切った印は間があいた所。x はその段階で出た出来事。',
    note: 'event は「時刻 | 札 | 小さい札」で宣言する（10 個まで）。gap は軸を切る印で、あいた長さを札に書く。',
    sample: [
      'title: DNS と TLS の名前の扱いの年表（第17・20章）',
      'caption: 上から下へ時間が進む（間隔は年に比例しない）。DoT・DoH・ECH は途中の第三者に名前を読ませない仕組み。HTTPS レコードは接続のしかたを DNS で配る。',
      'event dot: 2016 年 | DoT（DNS over TLS） | TCP の 853 番で TLS の接続を張り、その中で DNS をやり取りする',
      'event doh: 2018 年 | DoH（RFC 8484） | DNS のメッセージを HTTPS の要求に入れ、443 番で送る',
      'event https: 2023 年 | HTTPS レコード（RFC 9460） | 接続のしかた（alpn="h3" など）も DNS で引く',
      'event chrome: 2023 年 | Chrome が ECH に対応する',
      'event ech: 2026 年 | ECH（RFC 9849） | 本当の ClientHello を、DNS で配る公開鍵で暗号化する',
      'event yt: 2026-10-12 | www.youtube.com の SNI は平文 | ECH の鍵を公開していなかった',
      'step: DoT：TLS で包む',
      'DoT は、TCP の 853 番で TLS の接続を張り、その中で DNS をやり取りする。中身は読めないが、853 番なので DNS だとは分かり、止めることもできる。',
      'show: dot',
      'down: dot -> 20-tls.html#s6.1: DoT は、DNS のメッセージを TLS のレコードに入れて運ぶ',
      'step: DoH：HTTPS に混ぜる',
      'DoH は DNS のメッセージをそのまま HTTPS の要求に入れ、443 番で送る。ふつうの Web の通信と見分けにくい。',
      'show: doh',
      'step: 接続のしかたも引く',
      'HTTPS レコード（type 65）は接続のしかたを知らせる。動画の配信元の名前には alpn="h3" が載っていて、ブラウザは最初から QUIC で接続を始められる。',
      'show: https',
      'step: ECH：名前も隠す',
      'DoT・DoH で隠れるのは、PC からリゾルバまでの区間だけで、名前は TLS の SNI にも出る。ECH は本当の ClientHello を、DNS で配る公開鍵で暗号化する。',
      'show: chrome ech',
      'step: YouTube はまだ平文',
      'Chrome は 2023 年から ECH に対応しているが、www.youtube.com は ECH の鍵を公開しておらず、SNI は平文だった（2026 年 10 月 12 日）。',
      'show: yt'
    ].join('\n'),
    steps: function (p) { return YT_ANIM.steps(p); },
    setup: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, svg = ctx.svg;
      A.head(ctx);
      var rows = p.items.filter(function (it) { return it.kind === 'event' || it.kind === 'gap'; });
      // 行の間隔（単位 unit）: 出来事どうしは 1、gap の前後は 0.8。先頭が gap なら 0.3 下げて始める。全体を TOP〜BOT の真ん中に置く
      var step = function (k) { return rows[k].kind === 'gap' || rows[k - 1].kind === 'gap' ? 0.8 : 1; };
      var lead = rows[0] && rows[0].kind === 'gap' ? 0.3 : 0, span = lead;
      for (var j = 1; j < rows.length; j++) span += step(j);
      var unit = Math.min(60, (BOT - TOP) / Math.max(1, span));
      var y = TOP + (BOT - TOP - unit * span) / 2 + unit * lead;
      st.base = S.line(AX, 0, AX, 0, { cls: 's-rule w2' }, svg);
      st.done = S.line(AX, 0, AX, 0, { cls: 's-fg w2 round' }, svg);
      st.row = {};
      st.order = [];
      rows.forEach(function (it, k) {
        if (k) y += step(k) * unit;
        var g = S.g({ cls: 'fade' }, svg), r = { it: it, y: y, g: g };
        if (it.kind === 'event') {
          r.dot = S.circle(AX, y, 6, { cls: 'f-fg' }, g);
          r.time = S.text(AX - 18, y + 4, it.time, { cls: 't-sm t-mono t-end' }, g);
          r.label = S.text(AX + 20, y + 4, '', { cls: 't-md' }, g);
          r.sub = S.text(AX + 20, y + 13, '', { cls: 't-sm t-mid' }, g);
        } else {
          // 軸を切る印（2 本の斜めの線）と、あいた長さ
          r.cut = S.g({}, g);
          S.rect(AX - 10, y - 6, 20, 12, { cls: 'f-sf' }, r.cut);
          S.line(AX - 9, y - 1, AX + 9, y - 7, { cls: 's-mid w15' }, r.cut);
          S.line(AX - 9, y + 7, AX + 9, y + 1, { cls: 's-mid w15' }, r.cut);
          r.label = S.text(AX + 20, y + 4, '', { cls: 't-sm t-mid' }, g);
        }
        st.row[it.id] = r;
        st.order.push(r);
      });
      st.y0 = st.order.length ? st.order[0].y : TOP;
      st.y1 = st.order.length ? st.order[st.order.length - 1].y : TOP;
      S.attrs(st.base, { y1: st.y0, y2: st.y1 });
      // 札の大きさ: 出来事は t-md（注目は太字）、gap は t-sm。軸の右（AX + 20 から 952 まで）に入らなければ 1 段ずつ小さくする
      st.size = function (z0, rest, text) {
        var zs = ['t-md', 't-sm', 't-xs'].slice(['t-md', 't-sm', 't-xs'].indexOf(z0));
        for (var i = 0; i < zs.length; i++) if (A.measure(svg, zs[i] + rest, text) <= 952 - (AX + 20)) return zs[i] + rest;
        return 't-xs' + rest;
      };
      // 掘り下げの印の札: その段階の札の右（札を set で替えた段階では、替えた札の幅で）。小さい札があれば札の行の高さに上げる
      st.anchor = function (id, s) {
        var r = st.row[id];
        if (!r) return null;
        var q = A.stOf(ctx, s, id), ev = r.it.kind === 'event', text = q.l || r.it.label, w = A.measure(svg, st.size(ev ? 't-md' : 't-sm', q.x ? ' t-b' : '', text), text);
        return { el: r.dot || r.label, x: Math.min(940, AX + 20 + w + 20), y: r.y - (ev && q.s ? 7 : 1), dx: 30 };
      };
    },
    onStep: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx);
      st.last = null;
      st.order.forEach(function (r) {
        var s = now.st[r.it.id] || {};
        r.g.classList.toggle('hide', !s.v);
        if (r.it.kind === 'event') {
          A.fill(r.label, s.l);
          A.fill(r.sub, s.s);
          r.label.setAttribute('y', (r.y + (s.s ? -2 : 4)).toFixed(1));
          r.sub.setAttribute('y', (r.y + 14).toFixed(1));
          r.label.setAttribute('class', st.size('t-md', s.x ? ' t-b' : '', s.l) + (s.b && !s.x ? ' t-mid' : ''));
          r.sub.setAttribute('class', st.size('t-sm', '', s.s) + ' t-mid');
          r.time.setAttribute('class', 't-sm t-mono t-end' + (s.x ? ' t-b t-x' : ''));
          r.dot.setAttribute('r', s.x ? 7 : 6);
          r.dot.setAttribute('class', s.b ? 'f-sf ' + (s.x ? 's-x' : 's-mid') + ' w2 dash' : s.x ? 'f-x' : 'f-fg');
          if (s.v) st.last = r;
        } else {
          A.fill(r.label, s.l);
          r.label.setAttribute('class', st.size('t-sm', s.x ? ' t-b' : '', s.l) + (s.x ? ' t-x' : ' t-mid'));
        }
      });
      st.fresh = now.fresh.length > 0;
    },
    frame: function (ctx) {
      var A = YT_ANIM, st = ctx.state;
      // 濃い軸は、前の段階の最後の出来事から、いまの最後の出来事まで伸びる
      if (!st.last) { st.done.style.display = 'none'; return; }
      var prev = null, now = A.at(ctx), before = ctx.step > 0 ? ctx.params.steps[ctx.step - 1] : null;
      if (before) st.order.forEach(function (r) { if (r.it.kind === 'event' && before.st[r.it.id] && before.st[r.it.id].v) prev = r; });
      var from = prev ? prev.y : st.y0, f = st.fresh && now ? A.growth(ctx) : 1;
      st.done.style.display = '';
      S.attrs(st.done, { y1: st.y0, y2: (from + (st.last.y - from) * f).toFixed(1) });
    }
  });
})();
