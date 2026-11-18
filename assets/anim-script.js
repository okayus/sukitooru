/* ============================================================
   ニュースの台本の読み方 (assets/anim-script.js)

   ノート（news/*.md）の ```anim <部品> のブロック（台本）を読み、形を確かめ、段階ごとの姿に直す。
   tools/build-news.mjs（ページを作る）と tools/news-pr-check.mjs（日刊の検査）が Node で、
   parts.html（台本の部品の見本）がブラウザで使う。ブラウザでは window.YT_ANIM_SCRIPT、Node では module.exports。
   台本の書き方は news/README.md「動きの場面（台本）」、設計は docs/layers-plan.md §3 P6。

   台本は 3 つの部分からなる（行ごとに読む。空行は読み飛ばす）。
     見出しの行   title: 図の題 ／ caption: 図の説明 ／ note: 図の右上の注記（任意）／ 部品ごとの見出し（mem の left・right）
     登場する物   <種類> <id>: <中身>（種類と中身の形は部品ごと。下の SCHEMA）
     段階         step: 段階の題 で始め、続く行が本文（160 字まで）と操作の行
   操作の行（段階の中）
     show: id …   その段階から出す（どこかの段階の show に出る物は、その段階まで隠れている。出ない物は最初から出ている）
     hide: id …   その段階から隠す
     x: id …      その段階だけ x（注目）にする。x: - は注目なし。書かなければ、その段階で出た物・変わった物が x になる
     bad: id …    その段階から壊れた物（破線）にする。ok: id … で戻す
     set: id = 札 | 小さい札    その段階から札を替える（| が無ければ小さい札はそのまま、| - で消す）
     point: p -> b             （mem）ポインタ p の指す先を b にする（- で何も指さない）
     send: a -> b: 札           a から b へ流れる粒と札（mem・stack・boxes・tree。その段階だけ。同じ 2 つの間は 1 段階に 1 つ。
                               boxes は line、tree は親子の枝か edge で結んだ 2 つの間だけで、その line・edge がその段階で見えていること）
     down: id -> 19-tcp.html#s2.1: つなぎの一文   id に掘り下げの印（その段階だけ。章の場面を板に開く。行き先は公開版の URL でもよい）
   本文は Markdown の `コード`・**太字**・[リンク](URL) が使える（ページでは tools/build-news.mjs が HTML にする）。
   章の簡易マークアップ（[[…]]・{e|…}）は本文にも caption にも使えない（ニュースのページでは記号のまま出る）。
   段階の中の「英小文字の語: id …」の形の行は操作として読む（綴りの違う操作は本文にせず、誤りにする）。
   title と note は図の上の 1 行に並ぶので、title の幅 × 1.3 ＋ note の幅 を 78 までにする（幅は units）。
   boxes の line は箱の真ん中どうしを結ぶ直線なので、途中の升目にある箱の上を通る line は誤りにする。
   文字は文字としてだけ扱う（部品は SVG の文字に入れ、HTML として挿し込まない）。
   ============================================================ */
(function () {
  'use strict';

  var GENERIC = ['seq', 'mem', 'stack', 'boxes', 'tree', 'timeline'];
  var MIN_STEPS = 2, MAX_STEPS = 6, MAX_TEXT = 160, MAX_STEP_TITLE = 30, MAX_CAPTION = 120, MAX_BRIDGE = 60, MAX_DOWN = 3;
  var RE_ID = /^[a-z][a-z0-9_]{0,15}$/;
  var RE_PART = /^[a-z][a-z0-9-]{0,23}$/;
  var RE_TO = /^(\d\d-[a-z0-9-]+\.html)#s(\d+)(?:\.(\d+))?$/;
  var SITE_CH = 'https://okayus.github.io/youtube-ga-mieru-made/chapters/';
  var OPS = ['show', 'hide', 'x', 'bad', 'ok', 'set', 'point', 'send', 'down'];
  var RE_OP = new RegExp('^(' + OPS.join('|') + ')\\s*:\\s*(.*)$');
  var RE_OP_WIDE = new RegExp('^(' + OPS.join('|') + ')\\s*：');
  var RE_OP_LIKE = /^([a-z]+)\s*:\s*(?:-|[a-z][a-z0-9_]*(?:[\s,、]+[a-z][a-z0-9_]*)*|[a-z][a-z0-9_]*\s*(?:->|=).*)$/;
  /* down: の行き先。章の場面（#sN か #sN.K で終わる。公開版の URL も）を先に取り、つなぎの一文の前の : と分ける */
  var RE_DOWN = /^([a-z][a-z0-9_]*)\s*->\s*(\S*?#s\d+(?:\.\d+)?|(?:https?:\/\/)?\S+?)\s*(?::\s*(.*))?$/;
  var MAX_HEAD = 78;   // 図の上の 1 行: title の幅 × 1.3 ＋ note の幅（title は 12.5px の太字、note は 10px）

  /* 札の幅の目安（字の幅の単位。漢字・かな・全角の記号は 1、英数字と半角の記号は 0.56） */
  function units(s) {
    var u = 0;
    String(s || '').replace(/`/g, '').split('').forEach(function (ch) {
      var c = ch.charCodeAt(0);
      if (c >= 0xdc00 && c <= 0xdfff) return;   // サロゲートの後半は前半と合わせて 1 字
      u += c >= 0x2000 ? 1 : c >= 0x20 ? 0.56 : 0;
    });
    return Math.round(u * 10) / 10;
  }
  /* Markdown の記号を外した文字（字数を数える・「自動で進む」の時間に使う） */
  function plain(s) {
    return String(s || '').replace(/`([^`]+)`/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1');
  }
  function chars(s) { return Array.from ? Array.from(plain(s)).length : plain(s).length; }
  /* 行をつなぐ。英数字どうしの間だけ空白を入れる（tools/build-news.mjs の joinLines と同じ） */
  function joinLines(ls) {
    return ls.reduce(function (a, l) { return a && /[A-Za-z0-9.,)]$/.test(a) && /^[A-Za-z0-9(]/.test(l) ? a + ' ' + l : a + l; }, '');
  }
  /* 「札 | 小さい札」を分ける */
  function labelSub(s) {
    var k = s.indexOf('|');
    if (k < 0) return { label: s.trim(), sub: '' };
    return { label: s.slice(0, k).trim(), sub: s.slice(k + 1).trim() };
  }
  /* 章の場面の行き先（19-tcp.html#s2.1 か公開版の URL）を 19-tcp.html#s2.1 の形にする。読めなければ null */
  function chapterTo(s) {
    s = String(s || '').trim();
    if (s.indexOf(SITE_CH) === 0) s = s.slice(SITE_CH.length);
    s = s.replace(/^(\.\.\/)?chapters\//, '');
    return RE_TO.test(s) ? s : null;
  }

  /* ---------- 部品ごとの形 ----------
     kinds: 種類ごとの { form: 中身の形, n: [最少, 最多], max: [札, 小さい札] の幅（units） }
       form   'label'      札 | 小さい札
              'ptr'        札 | 小さい札 -> 区画の id（-> は省ける）
              'link'       a -> b: 札（--: 向きの無い線。札は省ける。msg は -> と札が要る）
              'on'         a: 札（seq の note。actor の上に置く箱）
              'box'        札 | 小さい札 @ 列,行（boxes。列 1〜4、行 1〜3）
              'node'       札 | 小さい札 < 親の id（tree。< は省ける＝根）
              'event'      時刻 | 札 | 小さい札（timeline）
     ends: link の両端の種類。heads: 部品ごとの見出しの行（幅の上限）。send: send の両端の種類（無ければ send を使えない） */
  var SCHEMA = {
    seq: {
      name: 'やりとりの列',
      kinds: {
        actor: { form: 'label', n: [2, 5], max: [11, 15] },
        msg: { form: 'link', n: [0, 10], max: [22], ends: ['actor'], needLabel: true, dir: true },
        note: { form: 'on', n: [0, 10], max: [16], on: ['actor'] }
      },
      rows: { kinds: ['msg', 'note'], n: [1, 10] }
    },
    mem: {
      name: 'メモリの区画',
      heads: { left: 20, right: 20 },
      kinds: {
        ptr: { form: 'ptr', n: [1, 5], max: [18, 22], to: ['block'] },
        block: { form: 'label', n: [1, 5], max: [22, 28] }
      },
      send: { ends: ['ptr', 'block'], max: 16, n: 2 },
      point: true
    },
    stack: {
      name: '層の積み重ね',
      kinds: { layer: { form: 'label', n: [2, 7], max: [18, 30] } },
      send: { ends: ['layer'], max: 14, n: 1 }
    },
    boxes: {
      name: '箱と線',
      kinds: {
        box: { form: 'box', n: [2, 9], max: [13, 16] },
        line: { form: 'link', n: [0, 12], max: [12], ends: ['box'] }
      },
      send: { ends: ['box'], max: 12, n: 2, via: 'line' }
    },
    tree: {
      name: '木',
      kinds: {
        node: { form: 'node', n: [2, 12], max: [16, 16] },
        edge: { form: 'link', n: [0, 3], max: [10], ends: ['node'] }
      },
      send: { ends: ['node'], max: 12, n: 2, via: 'tree' },
      tree: { depth: 4, leaves: 6, roots: 3 }
    },
    timeline: {
      name: '時間の軸',
      kinds: {
        event: { form: 'event', n: [2, 10], max: [12, 40, 52] },
        gap: { form: 'label', n: [0, 3], max: [16] }
      }
    }
  };

  /* ---------- 台本 1 つを読む ----------
     src は ```anim の中身（フェンスの行を除く）。opt.line0 は 1 行目の行番号（ノートの中の位置。誤りの知らせに使う）、
     opt.chapterOk(to) は章の場面が在るかを確かめる関数（誤りの文を返す。Node の道具が渡す）。
     部品が GENERIC に無いとき（news/anim/<名前>.js の手書きの部品）は、種類と操作の形を確かめずに読む（opt.custom が真のときだけ）。
     返す値: { script, errors }。script は部品が描く形（段階ごとの姿まで決めたもの） */
  function parse(part, src, opt) {
    opt = opt || {};
    var line0 = opt.line0 || 1, errors = [];
    var at = function (k) { return (line0 + k) + ' 行目: '; };
    var bad = function (k, msg) { errors.push((k == null ? '' : at(k)) + msg); };
    var schema = SCHEMA[part] || null;
    if (!RE_PART.test(part || '')) { bad(null, '部品の名前「' + part + '」が正しくない（```anim seq のように書く）'); return { script: null, errors: errors }; }
    if (!schema && !opt.custom) { bad(null, '部品「' + part + '」は無い（使えるのは ' + GENERIC.join('・') + '）'); return { script: null, errors: errors }; }
    var sc = { part: part, title: '', caption: '', note: '', head: {}, items: [], steps: [] };
    var byId = {}, cur = null;
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');

    lines.forEach(function (raw, k) {
      var l = raw.replace(/\s+$/, '');
      if (!l.trim()) return;
      var m;
      // 全角のコロンは知らせたうえで、半角として読み続ける（その行の物や段階が抜けて、後の誤りが連なって出ないように）
      if (/^step\s*：/.test(l) || (!cur && /^[a-z]+(\s+[a-z][a-z0-9_]*)?\s*：/.test(l)) || (cur && RE_OP_WIDE.test(l))) {
        bad(k, 'コロンが全角（：）になっている。半角の : で書く');
        l = l.replace('：', ':');
      }
      if ((m = /^step\s*:\s*(.*)$/.exec(l))) {
        cur = { title: m[1].trim(), lines: [], ops: [], line: k };
        sc.steps.push(cur);
        if (!cur.title) bad(k, '段階の題が無い（step: 題）');
        return;
      }
      if (!cur) {
        // 見出しの行か、登場する物
        if ((m = /^([a-z]+)\s*:\s*(.*)$/.exec(l))) {
          var key = m[1], val = m[2].trim();
          if (key === 'title' || key === 'caption' || key === 'note') { if (sc[key]) bad(k, key + ' が 2 つある'); sc[key] = val; return; }
          if (schema && schema.heads && key in schema.heads) { sc.head[key] = val; if (units(val) > schema.heads[key]) bad(k, key + ' が長い（幅 ' + units(val) + '、' + schema.heads[key] + ' まで）'); return; }
          bad(k, '読めない見出しの行「' + key + ':」（title・caption・note' + (schema && schema.heads ? '・' + Object.keys(schema.heads).join('・') : '') + '）。登場する物は「種類 id: 中身」、段階は「step: 題」で始める');
          return;
        }
        if ((m = /^([a-z]+)\s+(\S+)\s*:\s*(.*)$/.exec(l))) { decl(m[1], m[2], m[3].trim(), k); return; }
        bad(k, '読めない行（見出し「title: …」、登場する物「種類 id: 中身」、段階「step: 題」のどれでもない）');
        return;
      }
      if ((m = RE_OP.exec(l))) { cur.ops.push({ op: m[1], arg: m[2].trim(), line: k }); return; }
      if (opt.custom && (m = /^([a-z][a-z0-9_]*)\s*:\s*(.*)$/.exec(l)) && !/\s/.test(m[1])) { cur.ops.push({ op: m[1], arg: m[2].trim(), line: k, custom: true }); return; }
      // 操作の形をした行（英小文字の語と : の後が id の並び・a -> b・a = …）は、綴り違いの操作として拒む（本文に紛れ込ませない）
      if ((m = RE_OP_LIKE.exec(l))) { bad(k, '読めない操作の行「' + m[1] + ':」（段階の中で使える操作は ' + OPS.join('・') + '。見出しと登場する物は最初の step: より前に書く）'); return; }
      cur.lines.push(l.trim());
    });

    function decl(kind, id, rest, k) {
      var spec = schema ? schema.kinds[kind] : { form: 'raw' };
      if (!spec) { bad(k, '部品 ' + part + ' に種類「' + kind + '」は無い（' + Object.keys(schema.kinds).join('・') + '）'); return; }
      if (!RE_ID.test(id)) { bad(k, 'id「' + id + '」は英小文字で始め、英小文字・数字・_ で 16 字まで'); return; }
      if (byId[id]) { bad(k, 'id「' + id + '」が 2 回ある'); return; }
      var it = { id: id, kind: kind, label: '', sub: '', line: k }, m, ls;
      // 形が読めないときの手がかり（全角の記号）
      var hint = /：/.test(rest) ? '。全角のコロン「：」は半角の : にする' : /[→＞－]/.test(rest) ? '。矢印は半角の -> で書く' : /[＠，]/.test(rest) ? '。@ と , は半角で書く' : '';
      if (spec.form === 'raw') { ls = labelSub(rest); it.label = ls.label; it.sub = ls.sub; it.raw = rest; }
      else if (spec.form === 'label') { ls = labelSub(rest); it.label = ls.label; it.sub = ls.sub; }
      else if (spec.form === 'ptr') {
        m = /^(.*?)(?:\s*->\s*([a-z][a-z0-9_]*|-))?$/.exec(rest);
        ls = labelSub(m[1]); it.label = ls.label; it.sub = ls.sub; it.to = m[2] && m[2] !== '-' ? m[2] : '';
      } else if (spec.form === 'link') {
        m = /^([a-z][a-z0-9_]*)\s*(->|--)\s*([a-z][a-z0-9_]*)\s*(?::\s*(.*))?$/.exec(rest);
        if (!m) { bad(k, kind + ' の形は「' + kind + ' ' + id + ': a -> b: 札」' + (spec.dir ? '' : '（向きが無ければ a -- b）') + hint); return; }
        it.from = m[1]; it.to = m[3]; it.dir = m[2] === '->'; it.label = (m[4] || '').trim();
        if (spec.dir && !it.dir) bad(k, kind + ' は向きのある -> で書く');
        if (spec.needLabel && !it.label) bad(k, kind + ' には札が要る（a -> b: 札）');
        if (it.from === it.to) bad(k, kind + ' の両端が同じ「' + it.from + '」');
      } else if (spec.form === 'on') {
        m = /^([a-z][a-z0-9_]*)\s*:\s*(.+)$/.exec(rest);
        if (!m) { bad(k, kind + ' の形は「' + kind + ' ' + id + ': 置く所の id: 札」' + hint); return; }
        it.on = m[1]; it.label = m[2].trim();
      } else if (spec.form === 'box') {
        m = /^(.*?)\s*@\s*(\d+)\s*,\s*(\d+)$/.exec(rest);
        if (!m) { bad(k, 'box の形は「box ' + id + ': 札 | 小さい札 @ 列,行」（列 1〜4、行 1〜3）' + hint); return; }
        ls = labelSub(m[1]); it.label = ls.label; it.sub = ls.sub; it.col = Number(m[2]); it.row = Number(m[3]);
        if (it.col < 1 || it.col > 4 || it.row < 1 || it.row > 3) bad(k, 'box の場所は列 1〜4、行 1〜3（今は ' + it.col + ',' + it.row + '）');
      } else if (spec.form === 'node') {
        m = /^(.*?)(?:\s+<\s*([a-z][a-z0-9_]*))?$/.exec(rest);
        ls = labelSub(m[1]); it.label = ls.label; it.sub = ls.sub; it.parent = m[2] || '';
      } else if (spec.form === 'event') {
        var ps = rest.split('|').map(function (s) { return s.trim(); });
        if (ps.length < 2 || ps.length > 3 || !ps[0] || !ps[1]) { bad(k, 'event の形は「event ' + id + ': 時刻 | 札 | 小さい札」（小さい札は省ける）'); return; }
        it.time = ps[0]; it.label = ps[1]; it.sub = ps[2] || '';
      }
      if (!it.label && spec.form !== 'link') bad(k, '札が無い（' + kind + ' ' + id + ': 札）');
      if (spec.max) {
        var lim = spec.form === 'event' ? [['time', 0], ['label', 1], ['sub', 2]] : [['label', 0], ['sub', 1]];
        lim.forEach(function (p) { var w = units(it[p[0]]), mx = spec.max[p[1]]; if (mx != null && w > mx) bad(k, (p[0] === 'sub' ? '小さい札' : p[0] === 'time' ? '時刻' : '札') + '「' + it[p[0]] + '」が長い（幅 ' + w + '、' + mx + ' まで。漢字・かなは 1、英数字は 0.56）'); });
      }
      sc.items.push(it);
      byId[id] = it;
    }

    if (!sc.title) bad(null, 'title: が無い（図の題）');
    else if (units(sc.title) > 40) bad(null, 'title が長い（幅 ' + units(sc.title) + '、40 まで）');
    if (!sc.caption) bad(null, 'caption: が無い（図の説明）');
    else if (chars(sc.caption) > MAX_CAPTION) bad(null, 'caption が長い（' + chars(sc.caption) + ' 字、' + MAX_CAPTION + ' 字まで）');
    if (/\[\[|\{[ehprdx]\|/.test(sc.caption)) bad(null, 'caption に [[…]] や {e|…} は使えない');
    if (sc.note && units(sc.note) > 40) bad(null, 'note が長い（幅 ' + units(sc.note) + '、40 まで）');
    else if (sc.note && sc.title && units(sc.title) <= 40) {
      var hw = Math.round((units(sc.title) * 1.3 + units(sc.note)) * 10) / 10;
      if (hw > MAX_HEAD) bad(null, 'title と note が図の上の 1 行に並ばない（title の幅 × 1.3 ＋ note の幅 = ' + hw + '、' + MAX_HEAD + ' まで）');
    }
    if (sc.steps.length < MIN_STEPS || sc.steps.length > MAX_STEPS) bad(null, '段階は ' + MIN_STEPS + '〜' + MAX_STEPS + ' つ（今は ' + sc.steps.length + ' つ）');

    /* 種類ごとの数と、つながりの行き先 */
    var of = function (kind) { return sc.items.filter(function (it) { return it.kind === kind; }); };
    if (schema) {
      Object.keys(schema.kinds).forEach(function (kind) {
        var n = of(kind).length, r = schema.kinds[kind].n;
        if (n < r[0] || n > r[1]) bad(null, kind + ' は ' + r[0] + '〜' + r[1] + ' 個（今は ' + n + ' 個）');
      });
      if (schema.rows) {
        var nr = sc.items.filter(function (it) { return schema.rows.kinds.indexOf(it.kind) >= 0; }).length;
        if (nr < schema.rows.n[0] || nr > schema.rows.n[1]) bad(null, schema.rows.kinds.join('・') + ' は合わせて ' + schema.rows.n[0] + '〜' + schema.rows.n[1] + ' 行（今は ' + nr + ' 行）');
      }
      var kindIs = function (id, kinds) { return byId[id] && kinds.indexOf(byId[id].kind) >= 0; };
      sc.items.forEach(function (it) {
        var spec = schema.kinds[it.kind];
        if (spec.form === 'link') {
          [it.from, it.to].forEach(function (e) { if (!kindIs(e, spec.ends)) bad(it.line, it.kind + ' ' + it.id + ' の端「' + e + '」は ' + spec.ends.join('・') + ' の id ではない'); });
        }
        if (spec.form === 'on' && !kindIs(it.on, spec.on)) bad(it.line, it.kind + ' ' + it.id + ' を置く所「' + it.on + '」は ' + spec.on.join('・') + ' の id ではない');
        if (spec.form === 'ptr' && it.to && !kindIs(it.to, spec.to)) bad(it.line, 'ptr ' + it.id + ' の指す先「' + it.to + '」は ' + spec.to.join('・') + ' の id ではない');
        if (spec.form === 'node' && it.parent && !kindIs(it.parent, ['node'])) bad(it.line, 'node ' + it.id + ' の親「' + it.parent + '」は node の id ではない');
      });
      if (part === 'boxes') {
        var cells = {};
        of('box').forEach(function (b) { var c = b.col + ',' + b.row; if (cells[c]) bad(b.line, 'box ' + b.id + ' の場所 ' + c + ' は ' + cells[c] + ' と同じ'); cells[c] = b.id; });
        var pairs = {};
        of('line').forEach(function (ln) {
          var p = [ln.from, ln.to].sort().join(' ');
          if (pairs[p]) bad(ln.line, 'line ' + ln.id + ' は ' + pairs[p] + ' と同じ 2 つの箱を結ぶ');
          pairs[p] = ln.id;
          // 線は箱の真ん中どうしを結ぶので、途中の升目の真ん中を通るとき、そこにある箱を横切る
          var a = byId[ln.from], b = byId[ln.to];
          if (!a || !b || a.kind !== 'box' || b.kind !== 'box') return;
          var dc = b.col - a.col, dr = b.row - a.row, g = gcd(Math.abs(dc), Math.abs(dr));
          for (var j = 1; j < g; j++) {
            var on = cells[(a.col + dc / g * j) + ',' + (a.row + dr / g * j)];
            if (on) bad(ln.line, 'line ' + ln.id + ' が箱 ' + on + ' の上を通る（間に箱の無い 2 つを結ぶか、箱の場所を変える）');
          }
        });
      }
      if (part === 'tree') treeShape(sc, schema.tree, bad);
    }

    /* 段階ごとの姿 */
    var shownSomewhere = {};   // 誤りは段階ごとに読むときに知らせる（ここでは数えない）
    sc.steps.forEach(function (st) { st.ops.forEach(function (o) { if (o.op === 'show') o.arg.split(/[\s,、]+/).forEach(function (id) { if (byId[id]) shownSomewhere[id] = 1; }); }); });
    var state = {};
    sc.items.forEach(function (it) { state[it.id] = { v: shownSomewhere[it.id] ? 0 : 1, b: 0, l: it.label, s: it.sub, t: it.kind === 'ptr' ? it.to : undefined }; });

    function ids(o) {
      if (o.arg === '-' && o.op === 'x') return [];
      var xs = o.arg.split(/[\s,、]+/).filter(Boolean);
      if (!xs.length) bad(o.line, o.op + ': の後に id が無い');
      return xs.filter(function (id) { if (!byId[id]) { bad(o.line, o.op + ': の id「' + id + '」は登場する物に無い'); return false; } return true; });
    }

    sc.steps = sc.steps.map(function (st, i) {
      var changed = {}, grown = {}, xs = null, send = [], down = [], sets = {}, custom = {};
      var text = joinLines(st.lines);
      if (!text) bad(st.line, '段階 ' + (i + 1) + '「' + st.title + '」の本文が無い');
      else if (chars(text) > MAX_TEXT) bad(st.line, '段階 ' + (i + 1) + '「' + st.title + '」の本文が ' + chars(text) + ' 字（' + MAX_TEXT + ' 字まで）');
      if (chars(st.title) > MAX_STEP_TITLE) bad(st.line, '段階の題が ' + chars(st.title) + ' 字（' + MAX_STEP_TITLE + ' 字まで）');
      if (/\[\[/.test(text)) bad(st.line, '本文に [[…]] は使えない（章へのリンクは [文字](URL) か down:）');
      // 章の簡易マークアップの色の語は、ニュースのページ（tools/build-news.mjs の inline）では記号のまま出る
      if (/\{[ehprdx]\|/.test(text)) bad(st.line, '本文に {e|…} などの色の語は使えない（強調は **太字**）');
      st.ops.forEach(function (o) {
        var m;
        if (o.custom) { (custom[o.op] || (custom[o.op] = [])).push(o.arg); return; }
        if (o.op === 'show') ids(o).forEach(function (id) { if (!state[id].v) changed[id] = grown[id] = 1; state[id].v = 1; });
        else if (o.op === 'hide') ids(o).forEach(function (id) { state[id].v = 0; });
        else if (o.op === 'bad') ids(o).forEach(function (id) { if (!state[id].b) changed[id] = 1; state[id].b = 1; });
        else if (o.op === 'ok') ids(o).forEach(function (id) { if (state[id].b) changed[id] = 1; state[id].b = 0; });
        else if (o.op === 'x') { if (xs) bad(o.line, 'x: が 2 行ある'); xs = ids(o); }
        else if (o.op === 'set') {
          m = /^([a-z][a-z0-9_]*)\s*=\s*(.+)$/.exec(o.arg);
          if (!m || !byId[m[1]]) { bad(o.line, 'set の形は「set: id = 札 | 小さい札」' + (m ? '（id「' + m[1] + '」が無い）' : '')); return; }
          var it = byId[m[1]], ls = labelSub(m[2]), spec = schema && schema.kinds[it.kind];
          if (sets[m[1]]) bad(o.line, 'set: ' + m[1] + ' が同じ段階に 2 行ある');
          sets[m[1]] = 1;
          state[m[1]].l = ls.label;
          if (m[2].indexOf('|') >= 0) state[m[1]].s = ls.sub === '-' ? '' : ls.sub;
          if (!ls.label) bad(o.line, 'set の札が空');
          if (spec && spec.max) {
            var off = spec.form === 'event' ? 1 : 0;
            if (units(ls.label) > spec.max[off]) bad(o.line, 'set の札「' + ls.label + '」が長い（幅 ' + units(ls.label) + '、' + spec.max[off] + ' まで）');
            if (spec.max[off + 1] != null && units(state[m[1]].s) > spec.max[off + 1]) bad(o.line, 'set の小さい札「' + state[m[1]].s + '」が長い（幅 ' + units(state[m[1]].s) + '、' + spec.max[off + 1] + ' まで）');
          }
          changed[m[1]] = 1;
        } else if (o.op === 'point') {
          if (!schema || !schema.point) { bad(o.line, 'point: は部品 mem だけで使える'); return; }
          m = /^([a-z][a-z0-9_]*)\s*->\s*([a-z][a-z0-9_]*|-)$/.exec(o.arg);
          if (!m) { bad(o.line, 'point の形は「point: ポインタ -> 区画」（何も指さないなら -）'); return; }
          if (!byId[m[1]] || byId[m[1]].kind !== 'ptr') { bad(o.line, 'point: の「' + m[1] + '」は ptr の id ではない'); return; }
          if (m[2] !== '-' && (!byId[m[2]] || byId[m[2]].kind !== 'block')) { bad(o.line, 'point: の指す先「' + m[2] + '」は block の id ではない'); return; }
          var to = m[2] === '-' ? '' : m[2];
          if (state[m[1]].t !== to) changed[m[1]] = grown[m[1]] = 1;
          state[m[1]].t = to;
        } else if (o.op === 'send') {
          if (!schema || !schema.send) { bad(o.line, 'send: は部品 ' + part + ' では使えない（mem・stack・boxes・tree）'); return; }
          m = /^([a-z][a-z0-9_]*)\s*->\s*([a-z][a-z0-9_]*)\s*(?::\s*(.*))?$/.exec(o.arg);
          if (!m) { bad(o.line, 'send の形は「send: a -> b: 札」'); return; }
          var sd = schema.send;
          [m[1], m[2]].forEach(function (e) { if (!byId[e] || sd.ends.indexOf(byId[e].kind) < 0) bad(o.line, 'send: の端「' + e + '」は ' + sd.ends.join('・') + ' の id ではない'); });
          if (m[1] === m[2]) bad(o.line, 'send: の両端が同じ');
          var pair = [m[1], m[2]].sort().join(' ');
          if (send.some(function (s) { return [s.a, s.b].sort().join(' ') === pair; })) bad(o.line, 'send: の ' + m[1] + ' と ' + m[2] + ' の間は 1 段階に 1 つ（行きと帰りは段階を分ける）');
          var lab = (m[3] || '').trim();
          if (units(lab) > sd.max) bad(o.line, 'send の札「' + lab + '」が長い（幅 ' + units(lab) + '、' + sd.max + ' まで）');
          send.push({ a: m[1], b: m[2], label: lab, line: o.line });
        } else if (o.op === 'down') {
          m = RE_DOWN.exec(o.arg);
          if (!m) { bad(o.line, 'down の形は「down: id -> 19-tcp.html#s2.1: つなぎの一文」'); return; }
          var t2 = chapterTo(m[2]);
          if (!byId[m[1]]) { bad(o.line, 'down: の id「' + m[1] + '」は登場する物に無い'); return; }
          if (!t2) { bad(o.line, 'down: の行き先「' + m[2] + '」は章の場面（19-tcp.html#s2 か #s2.1、または公開版の URL）ではない'); return; }
          var why = opt.chapterOk ? opt.chapterOk(t2) : null;
          if (why) bad(o.line, 'down: の行き先 ' + t2 + ': ' + why);
          // 日刊のノートは段階の番号を書かない（章を開いて確かめるのは場面まで。news/README.md「動きの場面（台本）」）
          else if (opt.noStep && /\.\d+$/.test(t2)) bad(o.line, 'down: の行き先に段階の番号を書かない（日刊のノート。' + t2.replace(/\.\d+$/, '') + ' と書く）');
          var br = (m[3] || '').trim();
          if (chars(br) > MAX_BRIDGE) bad(o.line, 'down のつなぎの一文が ' + chars(br) + ' 字（' + MAX_BRIDGE + ' 字まで）');
          down.push({ id: m[1], to: t2, bridge: br || st.title, line: o.line });
        }
      });
      if (down.length > MAX_DOWN) bad(st.line, '段階 ' + (i + 1) + ' の down: は ' + MAX_DOWN + ' つまで（今は ' + down.length + ' つ）');
      if (schema && schema.send && send.length > schema.send.n) bad(st.line, '段階 ' + (i + 1) + ' の send: は ' + schema.send.n + ' つまで');
      // 注目: 書いていなければ、この段階で出た物・変わった物
      if (xs === null) xs = Object.keys(changed).filter(function (id) { return state[id].v; });
      var snap = {};
      Object.keys(state).forEach(function (id) {
        var s = state[id], o = { v: s.v, x: xs.indexOf(id) >= 0 ? 1 : 0, b: s.b, l: s.l, s: s.s };
        if (s.t !== undefined) o.t = s.t;
        snap[id] = o;
      });
      var vis = function (id) { return snap[id] && snap[id].v; };
      xs.forEach(function (id) { if (!vis(id)) bad(st.line, '段階 ' + (i + 1) + ' で x の「' + id + '」が隠れている'); });
      send.forEach(function (s) {
        [s.a, s.b].forEach(function (e) { if (byId[e] && !vis(e)) bad(s.line, 'send: の端「' + e + '」がこの段階で隠れている'); });
        if (!schema || !schema.send || !schema.send.via || !byId[s.a] || !byId[s.b]) return;
        var js = joined(sc, schema.send.via, s.a, s.b);
        if (!js.length) bad(s.line, 'send: の ' + s.a + ' と ' + s.b + ' を結ぶ' + (schema.send.via === 'line' ? ' line ' : '枝（親子か edge）') + 'が無い');
        else if (!js.some(function (id) { return id === '' || vis(id); })) bad(s.line, 'send: の ' + s.a + ' と ' + s.b + ' を結ぶ ' + js.join('・') + ' がこの段階で隠れている');
      });
      down.forEach(function (d) { if (!vis(d.id)) bad(d.line, 'down: の「' + d.id + '」がこの段階で隠れている'); });
      // 見えている物の行き先が隠れていないか
      if (schema) sc.items.forEach(function (it) {
        if (!vis(it.id)) return;
        var need = [];
        if (it.kind === 'msg' || it.kind === 'line' || it.kind === 'edge') need = [it.from, it.to];
        else if (it.kind === 'note') need = [it.on];
        else if (it.kind === 'node' && it.parent) need = [it.parent];
        else if (it.kind === 'ptr' && snap[it.id].t) need = [snap[it.id].t];
        need.forEach(function (e) { if (byId[e] && !vis(e)) bad(st.line, '段階 ' + (i + 1) + ' で ' + it.kind + ' ' + it.id + ' は見えているが、つながる「' + e + '」が隠れている'); });
      });
      // fresh: この段階で出た物と、指す先が変わったポインタ（部品が線を伸ばして見せる）
      var out = { title: st.title, text: text, plain: plain(text), st: snap, fresh: Object.keys(grown).filter(function (id) { return snap[id].v; }), send: send.map(function (s) { return { a: s.a, b: s.b, label: s.label }; }), down: down.map(function (d) { return { id: d.id, to: d.to, bridge: d.bridge }; }) };
      if (Object.keys(custom).length) out.ops = custom;
      return out;
    });
    sc.items.forEach(function (it) { delete it.line; });
    // 誤りは行の順に（行番号の無い誤り＝台本全体の誤りは後ろ）。同じ行は見つけた順
    var lineOf = function (e) { var m = /^(\d+) 行目/.exec(e); return m ? Number(m[1]) : Infinity; };
    errors = errors.map(function (e, i) { return [lineOf(e), i, e]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return x[2]; });
    return { script: errors.length ? null : sc, errors: errors };
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  /* boxes の line・tree の枝で a と b を結ぶ物の id の並び（親子の枝は ''。結ぶ物が無ければ空） */
  function joined(sc, via, a, b) {
    return sc.items.filter(function (it) {
      if (via === 'line') return it.kind === 'line' && ((it.from === a && it.to === b) || (it.from === b && it.to === a));
      if (it.kind === 'edge') return (it.from === a && it.to === b) || (it.from === b && it.to === a);
      return it.kind === 'node' && ((it.id === a && it.parent === b) || (it.id === b && it.parent === a));
    }).map(function (it) { return it.kind === 'node' ? '' : it.id; });
  }
  /* tree: 輪が無く、深さ・葉・根の数が収まるか */
  function treeShape(sc, lim, bad) {
    var nodes = sc.items.filter(function (it) { return it.kind === 'node'; }), by = {};
    nodes.forEach(function (n) { by[n.id] = n; });
    var depth = function (n, seen) { if (!n.parent || !by[n.parent]) return 1; if (seen[n.id]) return 99; seen[n.id] = 1; return 1 + depth(by[n.parent], seen); };
    var roots = nodes.filter(function (n) { return !n.parent; });
    var leaves = nodes.filter(function (n) { return !nodes.some(function (c) { return c.parent === n.id; }); });
    var d = Math.max.apply(null, nodes.map(function (n) { return depth(n, {}); }).concat([0]));
    if (d >= 99) bad(null, 'node の親をたどると輪になる');
    else if (d > lim.depth) bad(null, '木の深さは ' + lim.depth + ' 段まで（今は ' + d + ' 段）');
    if (!roots.length) bad(null, '根（< の無い node）が無い');
    if (roots.length > lim.roots) bad(null, '根（< の無い node）は ' + lim.roots + ' つまで（今は ' + roots.length + ' つ）');
    if (leaves.length > lim.leaves) bad(null, '葉（子の無い node）は ' + lim.leaves + ' つまで（今は ' + leaves.length + ' つ）');
  }

  /* ---------- ノート 1 件の台本を集めて確かめる ----------
     md はノートの Markdown。台本は ## の場面の中に 1 つまで。その場面は ### の列に分けない。「要点」と「層」の場面には置かない。
     箇条書きの直後（空行なし）の ```anim は誤り（tools/build-news.mjs は箇条書きを空行まで読むので、台本が箇条書きの文になる）。
     opt.daily: 日刊のノート（台本は 1 つまで、部品は GENERIC だけ、down: の行き先に段階の番号を書かない）。opt.custom(name): news/anim/<name>.js が在るか。
     opt.chapterOk(to): 章の場面が在るか（誤りの文を返す）。
     返す値: { blocks: [{ line, part, src, script, scene }], errors }。line はフェンスの行（1 始まり） */
  function checkNote(md, opt) {
    opt = opt || {};
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n'), errors = [], blocks = [];
    var scene = null, fence = null, scenes = [], inList = false;
    lines.forEach(function (l, k) {
      if (fence) {
        if (/^```\s*$/.test(l)) {
          if (fence.anim) blocks.push(fence.anim);
          fence = null;
        } else if (fence.anim) fence.anim.body.push(l);
        else if (scene) note(scene, l, true);
        return;
      }
      var m;
      if ((m = /^```\s*(.*)$/.exec(l))) {
        var info = m[1].trim(), a = null;
        if (/^anim(\s|$)/.test(info)) {
          var part = info.slice(4).trim();
          a = { line: k + 1, part: part, body: [], scene: scene };
          if (!scene) errors.push((k + 1) + ' 行目: 台本は ## の場面の中に置く');
          else { (scene.anims || (scene.anims = [])).push(a); a.lead = scene.pre; scene.pre = null; a.after = []; scene.post = a; }
          // 箇条書きは空行まで続く（tools/build-news.mjs）ので、すぐ後の ``` は箇条書きの文に読まれる
          if (inList) errors.push((k + 1) + ' 行目: 台本の ``` の前に空行を置く（箇条書きの続きに読まれる）');
        }
        if (!a && scene) note(scene, l, true);
        fence = { anim: a };
        inList = false;
        return;
      }
      if (!l.trim() || /^#/.test(l)) inList = false;
      else if (/^\s*([-*]|\d+\.)\s+/.test(l)) inList = true;
      if ((m = /^##\s+(.*)$/.exec(l))) {
        var tab = /<!--\s*tab:\s*(.*?)\s*-->/.exec(m[1]);
        scene = { title: m[1].replace(/<!--[\s\S]*?-->/g, '').trim(), tab: tab ? tab[1] : '', line: k + 1, cols: 0, pre: [], post: null };
        scenes.push(scene);
      } else if (/^#\s/.test(l)) scene = null;
      else if (/^###\s/.test(l) && scene) scene.cols++;
      else if (scene) note(scene, l, false);
    });
    /* 場面の行を、台本の前（lead）か後（after）に集める。code は ``` の中の行（段落でない印） */
    function note(sc, l, code) {
      var to = sc.post ? sc.post.after : sc.pre;
      if (to) to.push(code ? { code: 1 } : l);
    }
    /* 台本の前と後の文: 段落だけ（箇条書き・表・引用・コードを置かない）。返す: { paras: [字数], bad: 段落でない行があるか } */
    function paras(ls) {
      var out = [], cur = [], badKind = false;
      (ls || []).forEach(function (l) {
        if (typeof l !== 'string') { badKind = true; return; }
        if (/^\s*<!--.*-->\s*$/.test(l)) return;
        if (!l.trim()) { if (cur.length) { out.push(cur); cur = []; } return; }
        if (/^\s*([-*]|\d+\.)\s|^\s*\||^>/.test(l)) badKind = true;
        cur.push(l.trim());
      });
      if (cur.length) out.push(cur);
      return { paras: out.map(function (p) { return chars(joinLines(p)); }), bad: badKind };
    }
    if (fence && fence.anim) errors.push(fence.anim.line + ' 行目: 台本の ``` が閉じていない');
    scenes.forEach(function (s) {
      if (!s.anims) return;
      if (s.anims.length > 1) errors.push(s.line + ' 行目: 場面「' + s.title + '」に台本が ' + s.anims.length + ' つある（1 つの場面に 1 つ）');
      if (s.cols) errors.push(s.line + ' 行目: 台本のある場面「' + s.title + '」は ### の列に分けない');
      if (s.title === '要点') errors.push(s.line + ' 行目: 「要点」（表紙）に台本は置けない');
      if ((s.tab || s.title) === '層') errors.push(s.line + ' 行目: 「層」の場面（層の歩き）に台本は置けない');
      if (s.anims.length !== 1) return;
      // 左の列に説明欄と並ぶので、台本の前の文（リード）は 110 字まで、後の文（補足）は 1 段落 140 字・2 段落まで（docs/authoring.md §2 の章と同じ）
      var a = s.anims[0], ld = paras(a.lead), af = paras(a.after);
      var total = ld.paras.reduce(function (x, y) { return x + y; }, 0);
      if (ld.bad || af.bad) errors.push(s.line + ' 行目: 台本のある場面「' + s.title + '」の文は段落だけにする（箇条書き・表・引用・コードは別の場面へ）');
      if (total > 110) errors.push(s.line + ' 行目: 場面「' + s.title + '」の台本より前の文（リード）が ' + total + ' 字（110 字まで。記号を外して数える）');
      if (af.paras.length > 2) errors.push(s.line + ' 行目: 場面「' + s.title + '」の台本より後の文（補足）が ' + af.paras.length + ' 段落（2 段落まで）');
      af.paras.forEach(function (n, j) { if (n > 140) errors.push(s.line + ' 行目: 場面「' + s.title + '」の台本より後の文（補足）の ' + (j + 1) + ' 段落目が ' + n + ' 字（140 字まで）'); });
      if (opt.daily && af.paras.length) errors.push(s.line + ' 行目: 日刊のノートの動きの場面には、台本より後の文（補足）を置かない');
    });
    if (opt.daily && blocks.length > 1) errors.push('日刊のノートの台本は 1 つまで（今は ' + blocks.length + ' つ）');
    blocks.forEach(function (b) {
      var generic = GENERIC.indexOf(b.part) >= 0;
      if (opt.daily && !generic) { errors.push(b.line + ' 行目: 日刊のノートで使える部品は ' + GENERIC.join('・') + ' だけ（「' + b.part + '」）'); return; }
      var custom = !generic && !!(opt.custom && opt.custom(b.part));
      if (!generic && !custom && RE_PART.test(b.part)) { errors.push(b.line + ' 行目: 部品「' + b.part + '」は無い（' + GENERIC.join('・') + '、または news/anim/' + b.part + '.js）'); return; }
      var r = parse(b.part, b.body.join('\n'), { line0: b.line + 1, chapterOk: opt.chapterOk, custom: custom, noStep: !!opt.daily });
      r.errors.forEach(function (e) { errors.push((/^\d+ 行目/.test(e) ? '' : b.line + ' 行目の台本: ') + e); });
      b.src = b.body.join('\n');
      b.script = r.script;
      b.scene = b.scene ? { title: b.scene.title, tab: b.scene.tab } : null;
      delete b.body;
    });
    return { blocks: blocks, errors: errors };
  }

  var API = { GENERIC: GENERIC, SCHEMA: SCHEMA, MAX_STEPS: MAX_STEPS, MAX_TEXT: MAX_TEXT, parse: parse, checkNote: checkNote, units: units, plain: plain, chars: chars, chapterTo: chapterTo };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else window.YT_ANIM_SCRIPT = API;
})();
