/* ============================================================
   台本の部品 stack（層の積み重ね）— assets/parts/stack.js

   ニュースのノートの台本（```anim stack）を描く。layer を宣言の順に上から積み、左に札、右に小さい札を出す。
   send は層から層へ流れる粒と札（右の道を通る。1 段階に 1 つ）。どの層で何が起きたか、データがどの層を通るかに使う。
   台本の書き方は news/README.md「動きの場面（台本）」、読み方は assets/anim-script.js、共通の道具は assets/anim.js。
   見本の台本は第11章 場面3（要求文を包んでフレームにする）の例の値。
   ============================================================ */
(function () {
  'use strict';
  var S = YT.svg;
  var X0 = 32, BW = 624, LANE = 720, TOP = 64, BOT = 538;

  YT.parts.define('stack', {
    generic: true,
    title: '層の積み重ね',
    use: '欠陥のある層・データが通る層',
    lead: '上から積んだ層のどこで何が起きるかを、段階ごとに光らせ、層から層へデータを流して見せる台本の部品。見本は第11章 場面3 の例。',
    caption: '図　上の層ほど利用者に近い。右の道は層から層へ渡るデータで、札はその大きさや中身。x はその段階の層。',
    note: 'layer は「札 | 小さい札」で上から順に宣言する（2〜7 層）。send「a -> b: 札」は 1 段階に 1 つ。',
    sample: [
      'title: 要求文を包んでフレームにする（第11章 場面3 の例）',
      'caption: 上の層が作ったデータに、下の層が自分のヘッダを付けて渡す。右の札は渡すときの大きさ。',
      'layer app: アプリケーション層 | 要求文（例 300 バイト）',
      'layer tcp: トランスポート層 | TCP ヘッダ 20 バイト',
      'layer ip: インターネット層 | IP ヘッダ 20 バイト',
      'layer link: リンク層 | Ethernet ヘッダ 14 ＋ FCS 4 バイト',
      'layer phy: 物理層 | プリアンブル 8 バイト',
      'step: 中身を作る',
      'ブラウザは `GET /watch?v=… HTTP/1.1` と `Host: www.youtube.com` などのヘッダを並べた要求文（ここでは 300 バイトとする）を作る。',
      'x: app',
      'step: ポート番号と順番を付ける',
      'OS は要求文の前に TCP ヘッダ 20 バイトを付ける。送信元ポート（OS が選ぶ、例 51235）、宛先ポート 443、シーケンス番号などで、どのプロセスの何番目のデータかが分かる。',
      'send: app -> tcp: 300 バイト',
      'x: tcp',
      'step: 宛先 IP を付ける',
      'さらに外側に IP ヘッダ 20 バイト。送信元 192.168.1.10、宛先 142.250.196.110、TTL 64、中身の種類 6（TCP）。ここまで包んだものをパケットと呼ぶ。',
      'send: tcp -> ip: 320 バイト',
      'x: ip',
      'step: 隣の機器の MAC を付ける',
      'OS が Ethernet ヘッダ 14 バイトを付け、NIC が末尾に FCS 4 バイトを足してフレームにする。宛先 MAC は YouTube ではなくホームルーターの MAC。',
      'send: ip -> link: 340 バイト',
      'x: link',
      'down: link -> 13-ethernet.html#s3.1: リンク層が付けるヘッダと FCS は、Ethernet のフレームの欄になる',
      'step: ビット列を信号にする',
      '先頭に同期用のプリアンブル 8 バイトを付け、フレーム 358 バイト＝2,864 ビットを電圧・電波・光の信号に変えて送る。',
      'send: link -> phy: 358 バイト',
      'x: phy'
    ].join('\n'),
    steps: function (p) { return YT_ANIM.steps(p); },
    setup: function (ctx) {
      var A = YT_ANIM, p = ctx.params, st = ctx.state, svg = ctx.svg;
      A.head(ctx);
      st.mk = S.markers(svg);
      var layers = A.kinds(p, 'layer'), n = layers.length, gap = 10;
      var h = Math.min(58, (BOT - TOP - gap * (n - 1)) / n), y0 = TOP + Math.max(0, (BOT - TOP - n * h - gap * (n - 1)) / 2);
      st.gPath = S.g({}, svg);
      st.bar = {};
      layers.forEach(function (it, k) {
        var y = y0 + k * (h + gap), g = S.g({ cls: 'fade' }, svg);
        var r = S.rect(X0, y, BW, h, { rx: 5, cls: 'f-sf s-mid w15' }, g);
        var lt = S.text(X0 + 16, y + h / 2 + 5, '', { cls: 't-md t-b' }, g);
        var sub = S.text(X0 + BW - 16, y + h / 2 + 4, '', { cls: 't-sm t-mid t-end' }, g);
        st.bar[it.id] = { g: g, r: r, lt: lt, sub: sub, y: y, h: h };
      });
      // send: 層の右の縁から右の道へ出て、行き先の層の右の縁へ入る
      st.send = { path: S.path('M0,0', { cls: 'f-none s-d w15' }, st.gPath), dots: A.flowDots(svg, 3, 'f-d'), tag: A.tag(svg, 0, 0, '', { cls: 't-sm t-b t-d', anchor: 'l' }) };
      st.anchor = function (id) { var b = st.bar[id]; return b ? { el: b.r, x: X0 + BW + 18, y: b.y + 11, dx: 30 } : null; };   // 層の右（send の道より上）
    },
    onStep: function (ctx) {
      var A = YT_ANIM, st = ctx.state, now = A.at(ctx), svg = ctx.svg;
      Object.keys(st.bar).forEach(function (id) {
        var s = now.st[id] || {}, b = st.bar[id];
        b.g.classList.toggle('hide', !s.v);
        A.fill(b.lt, s.l);
        A.fill(b.sub, s.s);
        // 札（左）と小さい札（右）が 1 行に並ばなければ、小さい札を札の下の行に左寄せで置く
        var two = s.s && A.measure(svg, 't-md t-b', s.l) + A.measure(svg, 't-sm', s.s) + 24 > BW - 32, cy = b.y + b.h / 2;
        S.attrs(b.lt, { y: (two ? cy - 3 : cy + 5).toFixed(1) });
        S.attrs(b.sub, { x: two ? X0 + 16 : X0 + BW - 16, y: (two ? cy + 14 : cy + 4).toFixed(1) });
        b.r.setAttribute('class', s.x ? 'f-x-soft s-x w2' + (s.b ? ' dash' : '') : 'f-sf s-mid w15' + (s.b ? ' dash' : ''));
        b.lt.setAttribute('class', 't-md t-b' + (s.b && !s.x ? ' t-mid' : ''));
        b.sub.setAttribute('class', 't-sm t-mid' + (two ? '' : ' t-end'));
      });
      var o = now.send[0], sd = st.send;
      sd.on = !!o;
      sd.path.style.display = o ? '' : 'none';
      if (!o) { sd.tag.set(''); return; }
      var a = st.bar[o.a], b = st.bar[o.b], ya = a.y + a.h / 2, yb = b.y + b.h / 2, xe = X0 + BW;
      sd.path.setAttribute('d', 'M' + (xe + 2) + ',' + ya.toFixed(1) + ' H' + LANE + ' V' + yb.toFixed(1) + ' H' + (xe + 6));
      sd.path.setAttribute('marker-end', st.mk('d'));
      // 札は道の右。図の右へ出るなら左へ寄せる（道の縦の線は札の下地の下になる）
      sd.tag.set(o.label, 't-sm t-b t-d', Math.min(LANE + 14, 952 - A.measure(ctx.svg, 't-sm t-b', o.label)), (ya + yb) / 2);
    },
    frame: function (ctx) {
      var st = ctx.state;
      st.send.dots.update(ctx, st.send.path, st.send.on, 70);
    }
  });
})();
