/* ============================================================
   台本の部品 boxes（箱と線）— assets/parts/boxes.js

   ニュースのノートの台本（```anim boxes）を描く。box を 4 列 × 3 行の升目に置き（@ 列,行）、line で結ぶ。
   send は線に沿って流れる粒と札（その段階だけ。線の札はその間隠れる）。機械・プロセス・サービスの間の流れ、
   配布の経路、問い合わせの順に使う。
   台本の書き方は news/README.md「動きの場面（台本）」、読み方は assets/anim-script.js、共通の道具は assets/anim.js。
   見本の台本は第17章 場面3（名前解決の 10 回のやりとり）の例の値。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var X0 = 32, CW = 224, Y0 = 60, RH = 160, BW = 184;

  YT.parts.define('boxes', {
    generic: true,
    title: '箱と線',
    use: '機械・サービスの間の流れ',
    lead: '機械やサービスの箱を線で結び、段階ごとに線に沿ってデータを流して見せる台本の部品。配布の経路や問い合わせの順のニュースに使う。見本は第17章 場面3 の例。',
    caption: '図　箱が機械やサービス、線がつながり。流れる粒と札が、その段階で送るもの。x はその段階の箱と線。',
    note: 'box は「札 | 小さい札 @ 列,行」（列 1〜4、行 1〜3）、line は「a -> b: 札」か「a -- b」で宣言する。',
    sample: [
      'title: 名前解決のやりとり（第17章 場面3 の例）',
      'caption: www.youtube.com の番号を引く。PC はルーターに聞くだけで、フルリゾルバがルート・com・権威サーバーを順にたどる。',
      'box pc: PC | スタブリゾルバ @ 1,2',
      'box rt: ルーター | 192.168.1.1 @ 2,2',
      'box full: フルリゾルバ | ISP の 198.51.100.53 @ 3,2',
      'box root: ルートサーバー | a〜m @ 4,1',
      'box com: com のサーバー | a.gtld-servers.net @ 4,2',
      'box auth: 権威サーバー | ns1.google.com @ 4,3',
      'line l1: pc -- rt',
      'line l2: rt -- full',
      'line l3: full -- root',
      'line l4: full -- com',
      'line l5: full -- auth',
      'step: PC はルーターに 1 回聞くだけ',
      'PC のスタブリゾルバは、DHCP で教わった DNS サーバー 192.168.1.1 の 53 番に、RD ビットを 1 にした問い合わせを送る。最後の答えだけを返してほしいという意味。',
      'send: pc -> rt: RD=1 で問い合わせ',
      'x: pc rt',
      'down: rt -> 14-router.html#s2.2: 問い合わせる先 192.168.1.1 は、DHCP でルーターから教わった',
      'step: ルーターがフルリゾルバへ転送する',
      'ルーターは自分のキャッシュに答えが無いので、WAN 側から ISP のフルリゾルバ 198.51.100.53 へ、自分の ID を付けて同じ質問を送り直す。',
      'send: rt -> full: 同じ質問',
      'x: rt full',
      'step: ルートは com の担当を紹介する',
      '何も覚えていないフルリゾルバは、まずルートに聞く。ルートは答えを持たず、「com はこの 13 台が担当」という NS と番号を返す。これが紹介（リフェラル）。',
      'send: root -> full: com の担当',
      'x: root full',
      'step: com は youtube.com の担当を紹介する',
      '次に com のサーバーへ聞くと、「youtube.com は ns1〜ns4.google.com が担当」という紹介が返る。番号も付いているので、すぐ次へ聞ける。',
      'send: com -> full: ns1〜ns4',
      'x: com full',
      'step: 権威サーバーが答える',
      'ns1.google.com は youtube.com のゾーンの持ち主なので、AA ビットを立てて A 142.250.196.110、TTL 300 秒を返す。ここで初めて答えが出る。',
      'send: auth -> full: A 142.250.196.110',
      'x: auth full',
      'step: 答えが PC まで戻る',
      'フルリゾルバは RA=1、AA=0（受け売り）でルーターへ答え、ルーターは ID を PC の問い合わせの ID に戻して返す。途中の答えは、それぞれが TTL の間覚える。',
      'send: full -> rt: 答え（AA=0）',
      'send: rt -> pc: 答え',
      'x: full rt pc'
    ].join('\n'),
    steps: function (p) { return YT_ANIM.steps(p); },
    setup: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, svg = ctx.svg;
      A.head(ctx);
      st.mk = S.markers(svg);
      st.gLine = S.g({}, svg);
      st.box = {};
      A.kinds(p, 'box').forEach(function (it) {
        var cx = X0 + CW * (it.col - 0.5), c = A.card(svg, cx - BW / 2, 0, BW, A.variants(p, it.id), { minH: 40 });
        var cy = Y0 + RH * (it.row - 0.5);
        c.y = cy - c.h / 2;
        c.g.setAttribute('transform', 'translate(0,' + c.y.toFixed(1) + ')');
        c.g.classList.add('fade');
        st.box[it.id] = c;
      });
      var rectOf = function (c) { return { x: c.x, y: c.y, w: c.w, h: c.h }; };
      st.line = {};
      A.kinds(p, 'line').forEach(function (it) {
        var a = st.box[it.from], b = st.box[it.to];
        var pa = A.edgePoint(rectOf(a), b.x + b.w / 2, b.y + b.h / 2, 2), pb = A.edgePoint(rectOf(b), a.x + a.w / 2, a.y + a.h / 2, it.dir ? 5 : 2);
        var path = S.path('M' + pa[0].toFixed(1) + ',' + pa[1].toFixed(1) + ' L' + pb[0].toFixed(1) + ',' + pb[1].toFixed(1), { cls: 'f-none s-mid w15' }, st.gLine);
        // 札は線の真ん中の、横向きの線なら上、縦向きの線なら右
        var mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, horiz = Math.abs(pb[0] - pa[0]) >= Math.abs(pb[1] - pa[1]);
        var lx = horiz ? mx : mx + 10, ly = horiz ? my - 13 : my;
        var seg = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), lift = Math.max(a.h, b.h) / 2 + 11;
        st.line[it.id] = { it: it, path: path, pa: pa, pb: pb, lx: lx, ly: ly, horiz: horiz, seg: seg, lift: lift, tag: A.tag(svg, lx, ly, '', { cls: 't-sm', anchor: horiz ? 'c' : 'l' }) };
      });
      // 線の札の位置（線の上の t の所。既定は真ん中）。横向きの短い線（同じ行の隣の箱）の札が線より長ければ、箱の上の縁より上へ出す
      // （箱の題に重ねない）。横向きの札は図の中に収め、縦・斜めの線の札が図の右へ出るなら線の左に置く
      st.pos = function (l, text, cls, t) {
        t = t == null ? 0.5 : t;
        var w = text ? A.measure(svg, cls, text) : 0, mx = l.pa[0] + (l.pb[0] - l.pa[0]) * t, my = l.pa[1] + (l.pb[1] - l.pa[1]) * t;
        var x = l.horiz ? mx : mx + 10, y = l.horiz ? my - 13 : my, an = l.horiz ? 'c' : 'l';
        if (l.horiz) {
          if (w + 12 > l.seg && Math.abs(l.pb[1] - l.pa[1]) < 1) y = l.pa[1] - l.lift;   // 持ち上げるのは真横の線だけ（斜めの線は線の上の位置を試す）
          x = Math.max(8 + w / 2, Math.min(952 - w / 2, x));
        } else if (x + w > 952) { an = 'r'; x = mx - 10; }
        return { x: x, y: y, w: w, an: an };
      };
      // 段階 s で線 l に出る札（その線を send が通るなら send の札）
      st.text = function (l, s, q) {
        var o = (s.send || []).filter(function (x) { return (l.it.from === x.a && l.it.to === x.b) || (l.it.from === x.b && l.it.to === x.a); })[0];
        return o ? [o.label, 't-sm t-b t-d'] : [q.v ? q.l || '' : '', 't-sm' + (q.x ? ' t-b' : ' t-mid')];
      };
      // 段階 s の線の札を宣言の順に置く。先に置いた札か見えている箱に重なるなら、線の上の 32%・68% の所を試す（どこも重なれば真ん中）
      var box4 = function (q) { var x0 = q.an === 'l' ? q.x : q.an === 'r' ? q.x - q.w : q.x - q.w / 2; return [x0 - 4, q.y - 8, x0 + q.w + 4, q.y + 8]; };
      var hit = function (a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; };
      st.layout = function (s) {
        var out = {}, taken = [];
        Object.keys(st.box).forEach(function (id) { var q = s.st[id], c = st.box[id]; if (q && q.v) taken.push([c.x, c.y, c.x + c.w, c.y + c.h]); });
        Object.keys(st.line).forEach(function (id) {
          var l = st.line[id], tx = st.text(l, s, s.st[id] || {}), best = null;
          if (tx[0]) {
            [0.5, 0.32, 0.68].some(function (t) {
              var q = st.pos(l, tx[0], tx[1], t), free = !taken.some(function (r) { return hit(r, box4(q)); });
              if (!best || free) best = q;
              return free;
            });
            taken.push(box4(best));
          } else best = { x: l.lx, y: l.ly, w: 0, an: 'c' };
          best.text = tx[0]; best.cls = tx[1];
          out[id] = best;
        });
        return out;
      };
      st.sends = [0, 1].map(function () { return { path: S.path('M0,0', { cls: 'f-none s-none' }, st.gLine), dots: A.flowDots(svg, 3, 'f-d') }; });
      Object.keys(st.line).forEach(function (id) { svg.appendChild(st.line[id].tag.g); });   // 線の札（send の札も）は流れる粒より上
      // 掘り下げの印の札: 箱は下の右の角の外（2 つ目は下の左の角の外、3 つ目は右の縁の上。線の札・send の札に重ねない）、線はその段階の札の右
      st.anchor = function (id, s, k) {
        var c = st.box[id], l = st.line[id];
        if (c) {
          var pt = [[c.x + c.w + 4, c.y + c.h - 4], [c.x - 4, c.y + c.h - 4], [c.x + c.w + 4, c.y + 8]][Math.min(k || 0, 2)];
          return { el: c.rect, x: pt[0], y: pt[1], dx: 0, dy: 0 };
        }
        if (!l) return null;
        var q = st.layout(s || A.at(ctx))[id];
        if (!q.w) return { el: l.path, x: l.lx + 16, y: l.ly, dx: 30 };
        var left = q.an === 'r' || (q.an === 'c' && q.x + q.w / 2 + 18 + 30 * (k || 0) > 945);
        var x = q.an === 'l' ? q.x + q.w + 18 : q.an === 'r' ? q.x - q.w - 18 : left ? q.x - q.w / 2 - 18 : q.x + q.w / 2 + 18;
        return { el: l.path, x: x, y: q.y, dx: left ? -30 : 30 };
      };
    },
    onStep: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx);
      Object.keys(st.box).forEach(function (id) {
        var s = now.st[id] || {}, c = st.box[id];
        c.set(s.l, s.s, s);
        c.g.classList.toggle('hide', !s.v);
      });
      // その段階の send が通る線は、線の札の代わりに send の札を出す
      var via = {};
      now.send.forEach(function (o, k) {
        Object.keys(st.line).forEach(function (id) { var it = st.line[id].it; if ((it.from === o.a && it.to === o.b) || (it.from === o.b && it.to === o.a)) via[id] = { o: o, k: k }; });
      });
      var lay = st.layout(now);
      Object.keys(st.line).forEach(function (id) {
        var s = now.st[id] || {}, l = st.line[id], v = via[id], hot = s.x || !!v, q = lay[id];
        l.path.style.display = s.v ? '' : 'none';
        l.path.setAttribute('class', A.lineCls('ref', { x: hot, b: s.b }));
        if (l.it.dir) l.path.setAttribute('marker-end', st.mk(hot ? 'x' : 'mid'));
        else l.path.removeAttribute('marker-end');
        l.tag.set(q.text, q.cls, q.x, q.y, q.an);
      });
      st.sends.forEach(function (sd, k) {
        var o = now.send[k];
        sd.on = !!o;
        if (!o) return;
        var id = Object.keys(via).filter(function (q) { return via[q].k === k; })[0], l = st.line[id];
        var fwd = l.it.from === o.a, p0 = fwd ? l.pa : l.pb, p1 = fwd ? l.pb : l.pa;
        sd.path.setAttribute('d', 'M' + p0[0].toFixed(1) + ',' + p0[1].toFixed(1) + ' L' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1));
      });
    },
    frame: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx), f = A.growth(ctx);
      Object.keys(st.line).forEach(function (id) { A.grow(st.line[id].path, now.fresh.indexOf(id) >= 0 ? f : 1); });
      st.sends.forEach(function (sd) { sd.dots.update(ctx, sd.path, sd.on, 80); });
    }
  });
})();
