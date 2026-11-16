/* ============================================================
   層の登録簿 (assets/layers.js)

   教材の層（24 個）、層の上下（down: その層が使う下の層）、全章の場面がどの層か、を手で書く正本。
   ニュースのタグとグラフ（tools/build-news.mjs・assets/news-graph.js）と、章の札（engine.js）が読む。
   設計は docs/layers-plan.md §4。直したら node tools/layercheck.mjs で、全場面が層を持つか確かめる。

   - layers の col は図の列、row は列の中の高さ（0 が下。横断の列だけは左からの順）。
     同じ row の層は、だいたい同じ高さの抽象（例: OS と TCP・UDP・QUIC）。
   - 場面の層は、章の既定（chapters）と、既定から外れる場面（scenes。'章-場面'）で書く。場面は層を 1 つ以上持つ。
     表紙・まとめと、場面を指さない章へのリンクは、章の既定になる。
   ブラウザでは window.YT_LAYERS、Node では module.exports。
   ============================================================ */
(function () {
  'use strict';
  var L = {
    cols: [
      { id: 'pc', name: '計算機の中' },
      { id: 'net', name: '通信' },
      { id: 'media', name: '配信と動画' },
      { id: 'cross', name: '横断' }
    ],
    layers: [
      { id: 'denshi', name: '電子と電気', col: 'pc', row: 0, home: '01-denshi.html', down: [] },
      { id: 'handoutai', name: '半導体', col: 'pc', row: 1, home: '02-handoutai.html', down: ['denshi'] },
      { id: 'transistor', name: 'トランジスタ', col: 'pc', row: 2, home: '03-transistor.html', down: ['handoutai'] },
      { id: 'ronri', name: '論理回路', col: 'pc', row: 3, home: '04-ronri.html', down: ['transistor'] },
      { id: 'kioku', name: '記憶', col: 'pc', row: 4, home: '05-kioku.html', down: ['ronri', 'transistor'] },
      { id: 'cpu', name: 'CPU', col: 'pc', row: 5, home: '06-cpu.html', down: ['kioku', 'ronri'] },
      { id: 'io', name: '入出力', col: 'pc', row: 6, home: '07-shuuhen.html', down: ['cpu', 'kioku'] },
      { id: 'display', name: '画面と音', col: 'pc', row: 7, home: '08-display.html', down: ['io', 'kioku', 'handoutai'] },
      { id: 'os', name: 'OS', col: 'pc', row: 8, home: '09-os.html', down: ['cpu', 'io', 'kioku'] },
      { id: 'runtime', name: '言語処理系', col: 'pc', row: 9, home: '10-browser.html#s5', down: ['os', 'cpu'] },
      { id: 'browser', name: 'ブラウザ', col: 'pc', row: 10, home: '10-browser.html', down: ['runtime', 'os', 'http'] },
      { id: 'player', name: '動画の再生', col: 'pc', row: 11, home: '24-streaming.html#s4', down: ['codec', 'display', 'browser'] },
      { id: 'phy', name: '伝送（電波・銅線・光）', short: '伝送', col: 'net', row: 2, home: '12-wifi.html#s1', down: ['denshi', 'handoutai'] },
      { id: 'link', name: 'リンク（Wi-Fi・Ethernet・PON）', short: 'リンク', col: 'net', row: 6, home: '13-ethernet.html#s3', down: ['phy', 'io'] },
      { id: 'ip', name: 'IP と経路', col: 'net', row: 7, home: '18-ip.html', down: ['link'] },
      { id: 'transport', name: 'TCP・UDP・QUIC', col: 'net', row: 8, home: '19-tcp.html', down: ['ip', 'os'] },
      { id: 'tls', name: 'TLS', col: 'net', row: 9, home: '20-tls.html', down: ['transport'] },
      { id: 'http', name: 'HTTP と DNS', col: 'net', row: 10, home: '21-http.html', down: ['tls', 'transport'] },
      { id: 'codec', name: '動画の圧縮', col: 'media', row: 6, home: '23-codec.html', down: ['cpu'] },
      { id: 'delivery', name: '配信（CDN・負荷分散）', short: '配信', col: 'media', row: 9, home: '22-server.html', down: ['http', 'ip'] },
      { id: 'streaming', name: 'ストリーミング', col: 'media', row: 10, home: '24-streaming.html', down: ['http', 'codec'] },
      { id: 'type', name: '型とメモリ', col: 'cross', row: 0, home: '26-kata.html', down: ['kioku', 'cpu'] },
      { id: 'algo', name: 'データ構造とアルゴリズム', short: 'データ構造', col: 'cross', row: 1, home: '27-algorithm.html', down: ['kioku'] },
      { id: 'compiler', name: 'コンパイラ', col: 'cross', row: 2, home: '28-compiler.html', down: ['cpu', 'type'] }
    ],
    chapters: {
      1: ['denshi'], 2: ['handoutai'], 3: ['transistor'], 4: ['ronri'], 5: ['kioku'], 6: ['cpu'], 7: ['io'], 8: ['display'],
      9: ['os'], 10: ['browser'], 11: ['ip'], 12: ['link'], 13: ['link'], 14: ['ip'], 15: ['link'], 16: ['ip'],
      17: ['http'], 18: ['ip'], 19: ['transport'], 20: ['tls'], 21: ['http'], 22: ['delivery'], 23: ['codec'], 24: ['streaming'],
      25: ['streaming'], 26: ['type'], 27: ['algo'], 28: ['compiler'], 29: ['type'], 30: ['os'],
      31: ['browser', 'http'], 32: ['browser'], 33: ['browser'], 34: ['browser'], 35: ['browser'], 36: ['runtime']
    },
    // 第11章（層モデル）・第25章（通しで見る）・第30章（エミュレータの外側）は、場面ごとに扱う層へ振り分ける
    scenes: {
      '7-6': ['io', 'link'],
      '9-6': ['os', 'transport'],
      '10-5': ['runtime'], '10-6': ['player'],
      '11-1': ['phy', 'link', 'ip'], '11-2': ['phy', 'link', 'ip', 'transport', 'http'], '11-3': ['phy', 'link', 'ip', 'transport', 'http'],
      '11-4': ['link', 'ip', 'transport', 'http'], '11-5': ['ip'], '11-6': ['phy', 'link', 'ip'],
      '12-1': ['phy'], '12-2': ['phy'], '12-3': ['phy'],
      '13-1': ['phy'], '13-2': ['phy'],
      '14-4': ['ip', 'transport'], '14-5': ['ip', 'transport'],
      '15-1': ['phy'], '15-2': ['phy'], '15-6': ['phy'],
      '16-4': ['phy'], '16-6': ['delivery'],
      '19-6': ['transport', 'tls'],
      '22-1': ['delivery', 'codec'],
      '24-4': ['player'], '24-5': ['player'], '24-6': ['player', 'streaming'],
      '25-1': ['io', 'os', 'browser'], '25-2': ['http', 'transport', 'tls'], '25-3': ['phy', 'link', 'ip'],
      '25-4': ['transport', 'ip'], '25-5': ['player', 'browser'], '25-6': ['browser', 'streaming'],
      '30-2': ['cpu', 'os'], '30-3': ['io'], '30-4': ['display'], '30-5': ['display'], '30-6': ['os', 'io'],
      '31-1': ['browser'], '31-2': ['browser'],
      '36-5': ['runtime', 'browser'], '36-6': ['runtime', 'browser']
    }
  };

  L.byId = {};
  L.layers.forEach(function (x) { L.byId[x.id] = x; });
  /* 章 ch・場面 sc（0 や無しは章の既定）の層 */
  L.of = function (ch, sc) { return (sc && L.scenes[ch + '-' + sc]) || L.chapters[ch] || []; };
  /* 章へのリンク（…chapters/09-os.html#s3.2 など）を { ch: 9, sc: 3 } にする。章へのリンクでなければ null */
  L.parse = function (href) {
    var m = /(?:^|\/)(\d\d)-[a-z0-9-]+\.html(?:#s(\d+)(?:\.\d+)?)?(?:[#?].*)?$/.exec(String(href || ''));
    return m ? { ch: Number(m[1]), sc: m[2] ? Number(m[2]) : 0 } : null;
  };
  L.label = function (id) { var x = L.byId[id]; return x ? (x.short || x.name) : id; };

  if (typeof module === 'object' && module.exports) module.exports = L;
  else window.YT_LAYERS = L;
})();
