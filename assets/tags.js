/* ============================================================
   タグの語彙 (assets/tags.js)

   ニュースのノート（news/*.md）に付けるタグの正本と、ノートのタグの印の読み方。
   tools/build-news.mjs（ページ）、tools/news-pr-check.mjs（日刊の検査。main の側のこのファイルを読む）、
   tools/tagcheck.mjs（語彙の検査と一覧）が読む。ブラウザでは window.YT_TAGS、Node では module.exports。
   書き方は news/README.md「タグ」、設計は docs/plans/learning-loop.md §6 P3。直したら node tools/tagcheck.mjs で確かめる。

   ノートの印（行だけの注釈。「、」で区切る）
     <!-- tags: 名前、名前 -->            内容のタグ。ノートが何の話か
     <!-- prereqs: 名前、名前 -->         前提のタグ。読むのに要る知識のうち、ノートの層（層の札）より細かいもの
     <!-- tag-candidates: 名前、名前 -->  語彙に無い語。語彙に足すと（name か alias）、そのノートの内容のタグになる
   語彙の 1 つ（tags の 1 行）
     id     タグのページ news/tag-<id>.html の名前。英小文字・数字・ハイフン
     name   正規の名前。ノートにはこれを書く。mazuoboeru のタグ・kokemusu の石とは key（下の key()）で突き合わせる。
            mazuoboeru に同じ概念のタグがあれば、使われた数の多い形にする（kokemusu で同じ石に積もる）。
            key は大文字と小文字を分けないので、略語は大文字で書く（mazuoboeru の tls → TLS）。key は空白を残すので、英字と仮名の間は
            mazuoboeru の形（空白なし。Web開発）にそろえ、空白を入れた形を別名に置く。30 字まで（mazuoboeru の上限）
     alias  同じ概念の別の形（mazuoboeru で割れている形、表記の揺れ）。候補を突き合わせ、ページを作るときは正規の名前に読み替える
     layer  対応する層（assets/layers.js の id）。層をまたぐ語には書かない
   ignore は、候補に出たが語彙に入れないと決めた語（ノートの候補から消える）。
   ============================================================ */
(function () {
  'use strict';
  var T = {
    tags: [
      // 計算機の中（ハードウェアと OS）。mazuoboeru の数は 2026-11-25 の手元の quizzes/*.json（85 件）で数えた
      { id: 'semiconductor', name: '半導体', layer: 'handoutai' },
      { id: 'transistor', name: 'トランジスタ', layer: 'transistor' },
      { id: 'ic', name: '集積回路', layer: 'transistor', alias: ['IC'] },
      { id: 'logic-circuit', name: '論理回路', layer: 'ronri', alias: ['論理ゲート'] },
      { id: 'memory', name: 'メモリ', layer: 'kioku', alias: ['memory', 'DRAM'] },
      { id: 'cpu', name: 'CPU', layer: 'cpu', alias: ['プロセッサ'] },
      { id: 'os', name: 'OS', layer: 'os' },   // mazuoboeru: os 6
      { id: 'kernel', name: 'kernel', layer: 'os', alias: ['カーネル'] },   // mazuoboeru: kernel 13
      { id: 'rcu', name: 'RCU', layer: 'os', alias: ['Read-Copy-Update'] },
      { id: 'kernel-module', name: 'カーネルモジュール', layer: 'os', alias: ['kernel module'] },
      { id: 'linux', name: 'Linux', layer: 'os' },   // mazuoboeru: Linux・linux 21
      { id: 'macos', name: 'macOS', layer: 'os', alias: ['OS X'] },
      { id: 'virtualization', name: '仮想化', layer: 'os', alias: ['仮想マシン', 'ハイパーバイザ'] },
      { id: 'container', name: 'container', layer: 'os', alias: ['コンテナ'] },   // mazuoboeru: container 7・コンテナ 5
      { id: 'docker', name: 'Docker', layer: 'os' },   // mazuoboeru: Docker・docker 15
      { id: 'concurrency', name: '並行処理', alias: ['concurrency'] },   // mazuoboeru: 並行処理 3
      { id: 'parallelism', name: '並列処理', alias: ['parallelism'] },   // 並行（同時に進む）と並列（同時に実行する）は分ける

      // 言語と処理系
      { id: 'compiler', name: 'コンパイラ', layer: 'compiler', alias: ['compiler'] },
      { id: 'type', name: '型', layer: 'type', alias: ['型システム'] },
      { id: 'type-inference', name: '型推論', layer: 'type' },
      { id: 'fp', name: '関数型', layer: 'fp', alias: ['関数型プログラミング'] },
      { id: 'memory-safety', name: 'メモリ安全', layer: 'type', alias: ['メモリ安全性', 'memory safety'] },
      { id: 'integer-overflow', name: '整数オーバーフロー', layer: 'type', alias: ['整数のあふれ', 'integer overflow'] },
      { id: 'ownership', name: '所有権', layer: 'type', alias: ['ownership', '所有と借用'] },
      { id: 'use-after-free', name: '解放後の使用', layer: 'type', alias: ['use-after-free', 'UAF'] },
      { id: 'buffer-overflow', name: 'バッファオーバーフロー', layer: 'type', alias: ['buffer overflow', 'ヒープオーバーフロー', 'ヒープのあふれ'] },
      { id: 'deserialization', name: 'デシリアライズ', layer: 'type', alias: ['deserialization', '逆シリアル化'] },
      { id: 'gc', name: 'ガベージコレクション', layer: 'runtime', alias: ['GC'] },
      { id: 'transpiler', name: 'トランスパイラ', layer: 'compiler', alias: ['transpiler'] },
      { id: 'smt-solver', name: 'SMTソルバ', layer: 'compiler', alias: ['SMT ソルバ', 'SMT solver'] },
      { id: 'formal-verification', name: '形式検証', layer: 'compiler', alias: ['formal verification'] },
      { id: 'contracts', name: '契約プログラミング', alias: ['契約', 'contracts'] },
      { id: 'language-server', name: '言語サーバー', layer: 'compiler', alias: ['LSP', 'Language Server Protocol'] },
      { id: 'package-manager', name: 'パッケージ管理', alias: ['パッケージマネージャ', 'パッケージレジストリ'] },
      { id: 'standards', name: '標準化', alias: ['標準規格'] },
      { id: 'cpp', name: 'C++', alias: ['cpp'] },
      { id: 'rust', name: 'Rust' },
      { id: 'go', name: 'Go', alias: ['golang'] },   // mazuoboeru: Go 4・golang 3
      { id: 'python', name: 'Python' },   // mazuoboeru: python 3
      { id: 'ruby', name: 'Ruby' },
      { id: 'php', name: 'PHP' },   // mazuoboeru: PHP 1
      { id: 'javascript', name: 'JavaScript', alias: ['JS', 'ECMAScript'] },
      { id: 'typescript', name: 'TypeScript' },   // mazuoboeru: TypeScript・typescript 9
      { id: 'nodejs', name: 'Node.js', alias: ['nodejs'] },   // mazuoboeru: Node.js 2
      { id: 'elixir', name: 'Elixir' },
      { id: 'erlang', name: 'Erlang', alias: ['Erlang/OTP'] },
      { id: 'moonbit', name: 'MoonBit' },
      { id: 'wasm', name: 'WebAssembly', alias: ['Wasm'] },
      { id: 'jsx', name: 'JSX', alias: ['TSX'] },
      { id: 'react', name: 'React' },   // mazuoboeru: React 2
      { id: 'npm', name: 'npm' },   // mazuoboeru: npm 2

      // 通信
      { id: 'network', name: 'ネットワーク' },   // mazuoboeru: ネットワーク 6
      { id: 'wifi', name: 'Wi-Fi', layer: 'link', alias: ['WiFi', '無線LAN', '無線 LAN'] },
      { id: 'ethernet', name: 'Ethernet', layer: 'link', alias: ['イーサネット'] },
      { id: 'ip', name: 'IP', layer: 'ip', alias: ['IPv4'] },
      { id: 'ipv6', name: 'IPv6', layer: 'ip' },
      { id: 'routing', name: '経路制御', layer: 'ip', alias: ['ルーティング'] },
      { id: 'tcp', name: 'TCP', layer: 'transport' },   // mazuoboeru: tcp 2
      { id: 'udp', name: 'UDP', layer: 'transport' },
      { id: 'quic', name: 'QUIC', layer: 'transport' },
      { id: 'tls', name: 'TLS', layer: 'tls', alias: ['SSL', 'SSL/TLS'] },   // mazuoboeru: tls 4
      { id: 'certificate', name: '証明書', layer: 'tls', alias: ['サーバー証明書', 'X.509'] },   // mazuoboeru: 証明書 1
      { id: 'ca', name: '認証局', layer: 'tls', alias: ['CA'] },
      { id: 'revocation', name: '証明書の失効', layer: 'tls', alias: ['失効', 'CRL'] },
      { id: 'certificate-transparency', name: 'Certificate Transparency', layer: 'tls', alias: ['CT'] },
      { id: 'crypto', name: '暗号', layer: 'tls', alias: ['公開鍵暗号', 'cryptography'] },
      { id: 'http', name: 'HTTP', layer: 'http' },   // mazuoboeru: http・HTTP 8
      { id: 'http2', name: 'HTTP/2', layer: 'http', alias: ['h2'] },
      { id: 'http3', name: 'HTTP/3', layer: 'http', alias: ['h3'] },
      { id: 'dns', name: 'DNS', layer: 'http' },   // mazuoboeru: dns 3
      { id: 'url', name: 'URL', layer: 'http', alias: ['URI'] },   // mazuoboeru: URL 1
      { id: 'web-server', name: 'Webサーバー', layer: 'delivery', alias: ['Web サーバー', 'HTTPサーバー', 'HTTP サーバー'] },
      { id: 'nginx', name: 'nginx', layer: 'delivery' },
      { id: 'cdn', name: 'CDN', layer: 'delivery' },
      { id: 'atproto', name: 'AT Protocol', alias: ['ATProto'] },
      { id: 'did', name: 'DID', alias: ['分散識別子'] },

      // ブラウザと Web
      { id: 'browser', name: 'ブラウザ', layer: 'browser', alias: ['Webブラウザ', 'Web ブラウザ'] },   // mazuoboeru: ブラウザ 2
      { id: 'html', name: 'HTML', layer: 'browser' },   // mazuoboeru: HTML 3
      { id: 'css', name: 'CSS', layer: 'browser' },   // mazuoboeru: CSS 3
      { id: 'dom', name: 'DOM', layer: 'browser' },   // mazuoboeru: dom 1
      { id: 'cors', name: 'CORS', layer: 'browser' },   // mazuoboeru: cors・CORS 9
      { id: 'csp', name: 'CSP', layer: 'browser', alias: ['Content Security Policy'] },   // mazuoboeru: csp 1
      { id: 'xss', name: 'XSS', layer: 'browser', alias: ['クロスサイトスクリプティング'] },   // mazuoboeru: xss 5

      // セキュリティ（層をまたぐ）
      { id: 'security', name: 'セキュリティ', alias: ['security', '脆弱性'] },   // mazuoboeru: セキュリティ 13・security 4
      { id: 'supply-chain', name: 'サプライチェーン', alias: ['サプライチェーン攻撃'] },   // mazuoboeru: サプライチェーン 2
      { id: 'auth', name: '認証', alias: ['auth', 'authentication'] },   // mazuoboeru: 認証 9・auth 1
      { id: 'rce', name: 'リモートコード実行', alias: ['RCE', 'remote code execution'] },
      { id: 'reverse-engineering', name: 'リバースエンジニアリング', alias: ['reverse engineering'] },

      // 配信と動画、データ構造
      { id: 'video-codec', name: '動画コーデック', layer: 'codec', alias: ['コーデック', '動画の圧縮'] },
      { id: 'streaming', name: 'ストリーミング', layer: 'streaming', alias: ['動画配信'] },
      { id: 'algorithm', name: 'アルゴリズム', layer: 'algo' },   // mazuoboeru: アルゴリズム 1
      { id: 'data-structure', name: 'データ構造', layer: 'algo' }
    ],
    ignore: []
  };

  T.MAX_LEN = 30;   // 正規の名前と候補の字数（key で数える）。mazuoboeru の MAX_TAG_LEN と同じ
  T.LIMITS = { daily: { tags: [1, 5], prereqs: 4, candidates: 3 }, note: { tags: [0, 8], prereqs: 8, candidates: 8 } };

  /* 突き合わせの key。mazuoboeru（normalizeTag）と同じ: NFKC・前後の空白を取る・続く空白を 1 つ・小文字。
     kokemusu（normalizeTagName）は続く空白をまとめないが、語彙の名前は空白を続けないので同じになる */
  T.key = function (s) { return String(s).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); };
  T.byId = {};
  T.byName = {};
  T.byKey = {};
  T.tags.forEach(function (t) {
    T.byId[t.id] = t;
    T.byName[t.name] = t;
    [t.name].concat(t.alias || []).forEach(function (a) { if (!T.byKey[T.key(a)]) T.byKey[T.key(a)] = t; });
  });
  T.ignored = {};
  T.ignore.forEach(function (s) { T.ignored[T.key(s)] = true; });
  /* 名前か別名から語彙の 1 つ（無ければ null） */
  T.find = function (s) { return T.byKey[T.key(s)] || null; };

  /* 行だけの印 <!-- name: a、b --> の中身を「、」で分ける。無ければ []。2 行あるか 1 行に書いていなければ errors に足す */
  function marker(src, name, errors) {
    var re = new RegExp('^<!--\\s*' + name + ':\\s*([^>]*?)\\s*-->\\s*$', 'gm');
    var found = [], m;
    while ((m = re.exec(src))) found.push(m[1]);
    if (found.length > 1) errors.push('<!-- ' + name + ': … --> の行は 1 つだけ');
    if (!found.length && new RegExp('<!--\\s*' + name + ':').test(src)) errors.push('<!-- ' + name + ': … --> は 1 行に書く');
    return found.length ? found[0].split('、').map(function (s) { return s.trim(); }) : [];
  }

  /* ノートのタグの印を読む。
     opt.daily: 日刊の数の決まり（T.LIMITS.daily）。opt.strict: 日刊の検査。数の決まりを確かめ、別名と、語彙にある候補・外した候補を誤りにする
     （ページを作るときは strict にしない。別名は正規の名前に読み替えて warnings に、語彙に入った候補は promoted に、外した候補は ignored に出す）。
     opt.isLayer(s): 層の id なら true（層の id を tags に書いた誤りに、印の名前を添える）。
     返す値: { tags, prereqs（語彙の 1 つの並び）, candidates（語彙に無い語）, promoted（語彙に入った候補: { name, tag }）, ignored, errors, warnings } */
  T.checkNote = function (src, opt) {
    opt = opt || {};
    var lim = opt.daily ? T.LIMITS.daily : T.LIMITS.note;
    var errors = [], warnings = [], seen = {};
    var out = { tags: [], prereqs: [], candidates: [], promoted: [], ignored: [], errors: errors, warnings: warnings };
    function pick(what) {
      var res = [];
      marker(src, what, errors).forEach(function (s) {
        if (!s) { errors.push(what + ' に空の名前がある（「、」が続いているか、中身が無い）'); return; }
        var t = T.byName[s];
        if (!t) {
          var f = T.find(s), layer = opt.isLayer && opt.isLayer(s) ? '層の id なら <!-- layer: ' + s + ' --> に書く' : '';
          if (f && !opt.strict) { warnings.push(what + ' の「' + s + '」を正規の名前「' + f.name + '」に読み替えた'); t = f; }
          else {
            if (f) errors.push(what + ' の「' + s + '」は正規の名前「' + f.name + '」で書く' + (layer ? '（' + layer + '）' : ''));
            else if (layer) errors.push(what + ' の「' + s + '」は語彙に無い。' + layer);
            else errors.push(what + ' の「' + s + '」は語彙（assets/tags.js）に無い。語彙は node tools/tagcheck.mjs --list で見る。語彙に無い語は tag-candidates に書く');
            return;
          }
        }
        if (seen[t.id]) { errors.push('「' + t.name + '」が 2 回ある（' + seen[t.id] + ' と ' + what + '）'); return; }
        seen[t.id] = what;
        res.push(t);
      });
      return res;
    }
    out.tags = pick('tags');
    out.prereqs = pick('prereqs');
    var cands = marker(src, 'tag-candidates', errors), keys = {};
    cands.forEach(function (s) {
      if (!s) { errors.push('tag-candidates に空の名前がある（「、」が続いているか、中身が無い）'); return; }
      var k = T.key(s);
      if (k.length > T.MAX_LEN) { errors.push('tag-candidates の「' + s + '」が長い（' + T.MAX_LEN + ' 字まで）'); return; }
      if (keys[k]) { errors.push('tag-candidates に同じ語が 2 回ある: ' + s); return; }
      keys[k] = true;
      var t = T.byKey[k];
      if (t) {
        if (opt.strict) errors.push('tag-candidates の「' + s + '」は語彙にある。' + (seen[t.id] ? '候補から消す' : 'tags か prereqs に「' + t.name + '」と書く'));
        else if (!seen[t.id]) { seen[t.id] = 'tag-candidates'; out.promoted.push({ name: s, tag: t }); }
      } else if (T.ignored[k]) {
        if (opt.strict) errors.push('tag-candidates の「' + s + '」は、語彙に入れないと決めた語（assets/tags.js の ignore）');
        else out.ignored.push(s);
      } else out.candidates.push(s);
    });
    if (opt.strict) {
      if (out.tags.length < lim.tags[0] || out.tags.length > lim.tags[1]) errors.push('tags（内容のタグ）は ' + lim.tags[0] + '〜' + lim.tags[1] + ' 個（今は ' + out.tags.length + ' 個）');
      if (out.prereqs.length > lim.prereqs) errors.push('prereqs（前提のタグ）は ' + lim.prereqs + ' 個まで（今は ' + out.prereqs.length + ' 個）');
      if (cands.length > lim.candidates) errors.push('tag-candidates は ' + lim.candidates + ' 個まで（今は ' + cands.length + ' 個）');
    }
    return out;
  };

  if (typeof module === 'object' && module.exports) module.exports = T;
  else window.YT_TAGS = T;
})();
