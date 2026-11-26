/* ============================================================
   苔むすへの記録の導線 (assets/kokemusu.js)

   ニュースのノートのページに「苔むすに積む」を置く。押すと、苔むす（okayus/kokemusu）の積むダイアログが、渡した中身の入った状態で開く。
   渡すのは、ノートの題とリンク（本文）、出所の石「透き通る」と内容のタグ（石）、向き input、読んだ日（押した日。日本時間）。
   入口は苔むすの「リンクで渡す」（/積む#post=…。中身は # の後ろにあり、サーバーに届かない）。積むを押すまで記録されない。
   契約は苔むすの docs/senders.md「リンクで渡す」と、その schema の写し contracts/kokemusu/posts.schema.json。上限やキーはここに写さない。
   中身が契約に合うかは、tools/kokemusucheck.mjs が作ったページから読んで確かめる。

   公開のサイトなので、導線は持ち主の端末だけに出す。出す端末で、ニュースのページを一度 ?kokemusu=on を付けて開く
   （localStorage の ytm-kokemusu に残る。?kokemusu=off で消す。どちらも開いた後に URL から外す）。
   1画面版は上部バーのボタン（収まらなければ表紙の下のリンクの並び）、縦読み版（上部バーが無い）はページの終わりに置く。

   tools/build-news.mjs が post で中身を作ってノートのページに埋め、ページが mount を呼ぶ。ニュースのページはどれもこのファイルを読む
   （?kokemusu= をどのページでも受けるため）。ブラウザでは window.YT_KOKEMUSU、Node では module.exports。
   ============================================================ */
(function () {
  'use strict';
  var K = {
    ORIGIN: 'https://kokemusu.shiraoka.workers.dev',   // 持ち主の苔むす
    SOURCE: '透き通る',   // 出所の石（苔むすには送り側の欄が無く、送り側は石で名乗る）
    FLAG: 'ytm-kokemusu'   // この端末に導線を出す印（localStorage）
  };

  /* 渡す中身のうち、読んだ日を除いたもの。note: { title（ノートの # の題。Markdown）, url（公開版のページ）, tags（内容のタグの正規の名前） }。
     題はリンクの文字にするので、[ ] \ を外す記号にする */
  K.post = function (note) {
    var text = String(note.title).replace(/[\\[\]]/g, '\\$&');
    return { body: '[' + text + '](' + note.url + ')', tags: [K.SOURCE].concat(note.tags), kind: 'input' };
  };
  /* 時刻（ミリ秒）の日本時間の暦日 YYYY-MM-DD。苔むすの「日」は日本時間で、端末の時間帯によらない */
  K.day = function (ms) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); };
  /* 積むダイアログを開く URL。post に、時刻 ms の日を読んだ日（firstDay）として足す */
  K.href = function (post, ms) {
    var p = {};
    for (var k in post) p[k] = post[k];
    p.firstDay = K.day(ms);
    return K.ORIGIN + '/積む#post=' + encodeURIComponent(JSON.stringify(p));
  };

  if (typeof module === 'object' && module.exports) { module.exports = K; return; }
  window.YT_KOKEMUSU = K;

  /* ?kokemusu=on / off で、この端末の印を付ける・消す。問い合わせは URL から外す（再読み込みやリンクの共有で付け直さない） */
  var q = new URLSearchParams(location.search), v = q.get('kokemusu');
  if (v !== null) {
    try {
      if (v === 'on') localStorage.setItem(K.FLAG, '1');
      else if (v === 'off') localStorage.removeItem(K.FLAG);
    } catch (e) { /* 無視 */ }
    q.delete('kokemusu');
    var rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }
  K.on = function () { try { return localStorage.getItem(K.FLAG) === '1'; } catch (e) { return false; } };

  var TITLE = 'このノートを苔むすの積むダイアログで開く（新しいタブ）。題とリンク、石（「' + K.SOURCE + '」と内容のタグ）、向き（インプット）、読んだ日を渡す。積むを押すまで記録されない';

  /* ノートのページが YT.chapter の後に呼ぶ。持ち主の端末なら、上部バーか表紙の下（1画面版）と、ページの終わり（縦読み版）に置く。
     URL は押すときに作り直す（ページを開いたまま日付が変わっても、押した日を渡す） */
  K.mount = function (post) {
    if (!K.on() || /(?:^|&)embed=1(?:&|$)/.test(location.search.slice(1))) return;
    function link(cls) {
      var a = document.createElement('a');
      if (cls) a.className = cls;
      a.href = K.href(post, Date.now());
      a.target = '_blank';
      a.rel = 'noreferrer';   // 苔むすのログに、このサイトのオリジンも残さない（苔むすの docs/senders.md の例と同じ）
      a.title = TITLE;
      a.textContent = '苔むすに積む';
      var renew = function () { a.href = K.href(post, Date.now()); };
      a.addEventListener('pointerdown', renew);
      a.addEventListener('click', renew);
      return a;
    }
    var main = document.querySelector('main.scenes');
    if (main) {
      var end = document.createElement('p');
      end.className = 'nw-koke';
      end.appendChild(link(''));
      end.appendChild(document.createElement('span')).textContent = '読み終えたら、題とリンク、石（「' + K.SOURCE + '」と内容のタグ）を苔むすに渡す。積むを押すまで記録されない。';
      main.appendChild(end);
    }
    // 1画面版は上部バーに置く。収まらないとき（タブの多いノートを狭い画面で開いたとき）は、右端の ‹ › を押し出さないよう、
    // 上部バーから外して表紙の下のリンクの並びに置く。上部バーは engine.js が DOMContentLoaded で作る。YT.chapter が先に待っているので、
    // ここで待てば作った後に動く。resize も engine.js の後に測る（どちらも次の描画の前に動き、登録の順に動く）
    function put() {
      var bar = document.querySelector('.topbar'), acts = bar && bar.querySelector('.topbar-acts'), nav = document.querySelector('.cover-foot .chnav');
      if (!acts || !nav) return;
      var top = acts.insertBefore(link('act'), acts.firstChild), alt = nav.appendChild(link(''));
      function fit() {
        top.style.display = '';
        var over = bar.lastElementChild.getBoundingClientRect().right > bar.getBoundingClientRect().right + 0.5;
        top.style.display = over ? 'none' : '';
        alt.style.display = over ? '' : 'none';
      }
      fit();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
      var raf = 0;
      window.addEventListener('resize', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; fit(); }); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put);
    else put();
  };
})();
