/* ============================================================
   部品 encap（カプセル化）— assets/parts/encap.js

   視聴ページの要求（GET /watch）に、外側へヘッダが付いてビット列になるまでを、足したバイト数と欄の値で見せる。
   第11章 場面3（TLS を省いた 300 B の要求文の例）の、TLS を省かない姿。掘り下げの板（YT.drill）に出す。
   使う所（案）: 第11章 場面3 段階1〜4、第10章 場面6 段階6、第20章 場面1 段階5・場面6 段階1・4・6、第21章 場面1 段階5・
   場面3 段階3・場面4 段階1、第22章 場面3 段階3、第19章 場面1 段階1、第9章 場面6 段階5（張り替えの表は
   docs/log/2026-11-18-p5-encap.md）。
   params（印から渡す値。parts.html では ?part=encap&via=quic&gre=1）:
     via: 'tcp'（既定）  HTTP/2 → TLS 1.3 → TCP 51235 → IPv4 → Ethernet → ビット列
          'quic'         同じ要求を HTTP/3 → QUIC → UDP 51234 → IPv4 → Ethernet → ビット列
     gre: 1              段階5・6 を、第22章 場面3 の Maglev の GRE と GFE での取り外しにする（via と組み合わせる）
   値: 共通の例の値（docs/plan.md）。HEADERS の HPACK 450 B と見出し 9 B は第21章 場面3、TLS のレコード（見出し 5 B・
   種別 1 B・タグ 16 B）は第20章 場面6、TCP 20 B・IP 20 B・Ethernet 14 B・FCS 4 B・プリアンブル 8 B は第11章 場面3、
   UDP 8 B は第19章 場面5、IPv4 の欄は第18章 場面1、NAT の後の 203.0.113.5:40002（QUIC は 40001）と TTL 55 は
   第25章 場面3・第14章 場面4。HTTP/3 の QPACK の 450 B は HTTP/2 に合わせた例、接続 ID 8 B は quiche の既定の長さ、
   パケット番号 1 B は接続の初めの長さの例。Maglev と GFE の番号は非公開なので私設アドレスの例。
   事実は RFC 9113 §4.1・§6.2、RFC 8446 §5.2、RFC 5116 §5.1、RFC 9293 §3.1、RFC 768、RFC 791、RFC 9000 §14・§16・
   §17.3.1・§19.8、RFC 9001 §5.3・§5.4、RFC 9114 §7.1・§7.2、RFC 9204 §4.5.1、RFC 2784、IEEE 802.3 §3.3 の送る順
   （第13章 場面3）、Maglev の論文（NSDI 2016）§2.1・§3.1 で確かめた（2026-11-18）。
   仕上げ確認（2026-11-18、別の担当）: 1000BASE-T がフレームの間も IDLE の記号を送り続けること（無音ではない）は、
   UNH-IOL の 1000BASE-T の PCS の解説（IEEE 802.3ab D4.2 の Figure 40-12「IDLE → SSD → DATA → csreset → ESD → IDLE」）で確かめた。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;

  /* 段階の文（1 段階 1 行。params で選ぶ。段階の数は 6 でそろえる） */
  var STEPS_TCP = [
    { title: 'HTTP/2：要求を HEADERS フレームにする', text: 'ブラウザは GET /watch の要求を HTTP/2 の HEADERS フレーム（Ethernet のフレームとは別）にする。要求行は擬似ヘッダ（:method・:path など）になり、ヘッダは HPACK で縮める（第21章）。第11章 場面3 の 300 B は、HTTP/1.1 の要求文に仮に置いた値。' },
    { title: 'TLS 1.3：レコードにして暗号化する', text: 'TLS はフレームを暗号化してレコードに入れる。本当の種別は暗号文の中に入れ、見出しの種別はいつも 23（データ）と書くので、途中からはデータか握手の続きかも見分けられない（第20章 場面6）。HTTP/2 と TLS はブラウザの中で動き、下の層は暗号文を運ぶだけ。' },
    { title: 'TCP：ポートとバイトの番号を付ける', text: 'ブラウザがレコードをソケットに書くと、OS の TCP がヘッダを付けてセグメントにする。TCP はレコードの区切りを知らず、バイトの流れとして番号を振る。TLS の握手で送ったバイトの続きなので、第11章の例と違い、番号は相対で 1 ではない。オプションを付けるとヘッダは最大 60 B。' },
    { title: 'IP：端から端までの番号を付ける', text: 'IP の層がヘッダを付けてパケットにする。受け取った側はプロトコルの欄を見て、中身を TCP の処理へ渡す。宛先の番号は Google まで変わらないが、送信元は家のルーターが NAT で書き換え、TTL はルーターごとに 1 減る（第14章）。途中のルーターが読むのはここまで。' },
    { title: 'Ethernet：隣の機器の MAC を付ける', text: 'Ethernet のヘッダは OS が、末尾の FCS は NIC が付ける。宛先 MAC は次に渡す機器のもの。Google の番号は LAN の外なので、PC は経路表に従ってルーター 192.168.1.1 に渡し、その MAC を ARP で引く。Wi-Fi なら 802.11 のヘッダに替わる。' },
    { title: 'ビット列：プリアンブルを付けて送り出す', text: 'NIC は前にプリアンブル 7 B と SFD 1 B を付け、フレームをビットの列にして送る。SFD の最後の 11 が本体の始まりの印。MAC の決まりで各バイトを下位のビットから並べるので、宛先 MAC の「1 台宛てかグループ宛てか」の印が列の先頭に来る。ビットを電圧などの形に変えるのは PHY の仕事。' }
  ];
  var STEPS_QUIC = [
    { title: 'HTTP/3：要求を HEADERS フレームにする', text: 'Alt-Svc で HTTP/3 を知った後は（第21章 場面4）、以後の GET /watch を HTTP/3 の HEADERS フレームで送る。要求ごとに QUIC のストリームを 1 本使うので、フレームの見出しは種類と長さだけで済む。ヘッダは QPACK で縮め、大きさは HTTP/2 の例と同じとした。' },
    { title: 'QUIC：パケットにして暗号化する', text: 'QUIC は TLS のレコードを使わず、TLS の握手で作った鍵でパケットを 1 つずつ暗号化する。ACK やストリームの位置の欄も暗号の中に入り、パケット番号と先頭 1 B の一部は別の鍵で隠すので、途中から読めるのは接続 ID まで（第19章 場面6）。QUIC はブラウザの中で動く。' },
    { title: 'UDP：ポートと長さだけを付ける', text: 'ブラウザがパケットをソケットに書くと、OS の UDP がヘッダを付ける。順番・再送・輻輳制御は QUIC がブラウザの中で済ませているので、カーネルの UDP はポートで受け取り手を示すだけでよく、ヘッダは TCP より 12 B 少ない。' },
    { title: 'IP：端から端までの番号を付ける', text: 'IP の層がヘッダを付けてパケットにする。QUIC は IP の層で分けられないよう、DF を 1 にして送る決まり（RFC 9000）。受け取った側はプロトコルの欄を見て、中身を UDP の処理へ渡す。宛先は TCP の場合と同じサーバーで、途中のルーターが読むのはここまで。' },
    { title: 'Ethernet：隣の機器の MAC を付ける', text: 'Ethernet のヘッダは OS が、末尾の FCS は NIC が付ける。宛先 MAC は次に渡す機器のもの。Google の番号は LAN の外なので、PC は経路表に従ってルーター 192.168.1.1 に渡し、その MAC を ARP で引く。Wi-Fi なら 802.11 のヘッダに替わる。' },
    { title: 'ビット列：プリアンブルを付けて送り出す', text: 'NIC は前にプリアンブル 7 B と SFD 1 B を付け、フレームをビットの列にして送る。SFD の最後の 11 が本体の始まりの印。MAC の決まりで各バイトを下位のビットから並べるので、宛先 MAC の「1 台宛てかグループ宛てか」の印が列の先頭に来る。ビットを電圧などの形に変えるのは PHY の仕事。' }
  ];
  var GRE_TCP = [
    { title: 'GRE：Maglev が GFE 宛てにもう 1 枚包む', text: 'Maglev は 5 つ組のハッシュで GFE を選び、届いたパケットを中を変えずに GRE で包んで、外側に GFE 2 宛ての IP ヘッダを付ける。中の宛先 142.250.196.110 は多くの GFE が共通に受ける番号（VIP）なので、どの GFE へ運ぶかは外側の宛先で決める。' },
    { title: 'GFE：外側を外して受け取る', text: 'GFE は外側を外したパケットを自分宛てとして受け取り、TCP と TLS を終端して要求を読む。応答は Maglev を通らずに直接返すので（DSR）、大きい応答の負荷が Maglev にかからない。PC から見た相手は最初から最後まで同じ番号で、途中で包んだことは見えない。' }
  ];
  var GRE_QUIC = [
    { title: 'GRE：Maglev が GFE 宛てにもう 1 枚包む', text: 'Maglev は 5 つ組のハッシュで GFE を選び、届いたパケットを中を変えずに GRE で包んで、外側に GFE 2 宛ての IP ヘッダを付ける。中の宛先 142.250.196.110 は多くの GFE が共通に受ける番号（VIP）なので、どの GFE へ運ぶかは外側の宛先で決める。' },
    { title: 'GFE：外側を外して受け取る', text: 'GFE は外側を外したパケットを自分宛てとして受け取り、QUIC を終端して要求を読む。応答は Maglev を通らずに直接返すので（DSR）、大きい応答の負荷が Maglev にかからない。PC から見た相手は最初から最後まで同じ番号で、途中で包んだことは見えない。' }
  ];

  /* params から姿を決める（via: 'tcp' | 'quic'、gre: 1） */
  var kindOf = function (p) { p = p || {}; return { quic: p.via === 'quic', gre: !!p.gre && p.gre !== '0' }; };
  var stepsOf = function (p) {
    var v = kindOf(p), base = v.quic ? STEPS_QUIC : STEPS_TCP;
    return v.gre ? base.slice(0, 4).concat(v.quic ? GRE_QUIC : GRE_TCP) : base;
  };
  var num = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

  /* 図の寸法: 行 k の上端、枠の高さ、枠の始まり */
  var X0 = 152, GAP = 3, BH = 38;
  var rowY = function (k) { return 28 + k * 54; };
  /* 枠の種類ごとの色（ヘッダ・平文・暗号文・タグ・外したもの・その段階で足したもの） */
  var KIND = {
    hdr: ['f-in s-mid w15', '', 't-dim'],
    plain: ['f-sf s-d w15', '', 't-dim'],
    cipher: ['f-d-soft s-d w15', '', 't-dim'],
    tag: ['f-d s-d w15', 't-sf', 't-sf'],
    ghost: ['f-none s-x w15 dash', 't-x', 't-x'],
    fresh: ['f-x-soft s-x w15', '', '']
  };

  /* 下の欄の中身（段階ごと。[欄, 値, 16 進]。16 進が空の欄は接続ごとに変わる値） */
  var IP_ROWS = function (q) {
    return [['版・ヘッダ長', '4・5（× 4 B ＝ 20 B）', '45'], ['DSCP・ECN', '0', '00'], ['全長', q ? '509' : '521', q ? '01 FD' : '02 09'], ['識別子', 'パケットの番号（分けたときに使う）', ''], ['フラグ・断片位置', 'DF ＝ 1・0', '40 00'],
      ['TTL', '64', '40'], ['プロトコル', q ? '17 ＝ UDP' : '6 ＝ TCP', q ? '11' : '06'], ['チェックサム', 'ヘッダだけから計算', ''], ['送信元', '192.168.1.10（PC）', 'C0 A8 01 0A'], ['宛先', '142.250.196.110', '8E FA C4 6E']];
  };
  var ETH = { t: 'Ethernet ヘッダ 14 B と FCS 4 B', rows: [['宛先 MAC', '02:11:22:33:44:01（ルーター）', ''], ['送信元 MAC', '3C:4D:5E:6F:70:81（PC の NIC）', ''], ['タイプ', '0x0800 ＝ 中身は IPv4', '08 00'], ['FCS', '宛先から中身までの CRC-32', '']] };
  var PANEL_TCP = [
    { t: 'HTTP/2 の HEADERS フレーム', rows: [['長さ', '450（中身のバイト数）', '00 01 C2'], ['種類', '1 ＝ HEADERS', '01'], ['フラグ', 'ヘッダの終わり・ストリームの終わり', '05'], ['ストリーム番号', '1（この接続で最初の要求）', '00 00 00 01'], ['中身', ':method GET・:path /watch?v=… など 17 個', ''], ['縮める前', '文字にすると 682 B', '']] },
    { t: 'TLS のレコード：見出し 5 B・種別 1 B・タグ 16 B を足す', rows: [['種別', '23 ＝ データ', '17'], ['版', '0x0303（TLS 1.2 の番号のまま）', '03 03'], ['長さ', '476 ＝ 暗号文 460 ＋ タグ 16', '01 DC'], ['暗号文', 'フレーム 459 B と本当の種別 1 B（AES-128-GCM）', ''], ['タグ', '見出しと暗号文から計算', '']] },
    { t: 'TCP ヘッダ 20 B', rows: [['送信元ポート', '51235（OS が選ぶ）', 'C8 23'], ['宛先ポート', '443（HTTPS）', '01 BB'], ['シーケンス番号', '中身の先頭バイトの番号', ''], ['確認応答番号', '次に受け取りたいバイトの番号', ''],
      ['ヘッダ長・フラグ', '5（× 4 B）・ACK と PSH', '50 18'], ['ウィンドウ', 'まだ受け取れる量', ''], ['チェックサム', '擬似ヘッダ・ヘッダ・中身から', ''], ['緊急ポインタ', '0', '00 00']] },
    { t: 'IPv4 ヘッダ 20 B', rows: IP_ROWS(false) },
    ETH
  ];
  var PANEL_QUIC = [
    { t: 'HTTP/3 の HEADERS フレーム', rows: [['種類', '1 ＝ HEADERS（可変長の整数 1 B）', '01'], ['長さ', '450（可変長の整数 2 B）', '41 C2'], ['中身', 'QPACK で縮めた 17 個のヘッダ（450 B は例）', '']] },
    { t: 'QUIC のパケット：見出し 10 B・STREAM フレーム 2 B・タグ 16 B を足す', rows: [['先頭 1 B', '0（短い形）・1・スピン。残り 5 ビットは隠す', ''], ['宛先の接続 ID', '8 B（例。長さと値はサーバーが選ぶ）', ''], ['パケット番号', '1 B（1〜4 B。隠す）', ''], ['STREAM フレーム', '種類 0x09（終わりの印）・ストリーム 0', '09 00'], ['暗号文', 'STREAM フレームと HTTP/3 のフレーム（AES-128-GCM）', ''], ['タグ', '見出しと暗号文から計算', '']] },
    { t: 'UDP ヘッダ 8 B', rows: [['送信元ポート', '51234（OS が選ぶ）', 'C8 22'], ['宛先ポート', '443（QUIC も 443）', '01 BB'], ['長さ', '489 ＝ 8 ＋ 481', '01 E9'], ['チェックサム', '擬似ヘッダ・ヘッダ・中身から', '']] },
    { t: 'IPv4 ヘッダ 20 B', rows: IP_ROWS(true) },
    ETH
  ];
  var GRE_PANEL = function (q) {
    return [
      { t: 'Maglev 2：GRE ヘッダ 4 B と外側の IPv4 ヘッダ 20 B を足す', rows: [['中の 5 つ組', q ? 'UDP 203.0.113.5:40001 → 142.250.196.110:443' : 'TCP 203.0.113.5:40002 → 142.250.196.110:443', ''], ['中の TTL', '55（途中のルーター 9 台で減った）', ''], ['GRE', 'C 0・版 0・種類 0x0800 ＝ 中は IPv4', '00 00 08 00'], ['外側の全長', q ? '533' : '545', q ? '02 15' : '02 21'], ['外側のプロトコル', '47 ＝ GRE', '2F'], ['外側の送信元', 'Maglev 2（例 10.0.0.2）', ''], ['外側の宛先', 'GFE 2（例 10.0.1.2）', '']] },
      { t: 'GFE 2：外側の 24 B を外して受け取る', rows: [['外す', '外側の IP ヘッダ 20 B と GRE 4 B', ''], ['受け取る宛先', '142.250.196.110（中のまま）', ''], ['終端する', q ? 'QUIC（中の HTTP の要求を読む）' : 'TCP と TLS（中の HTTP の要求を読む）', ''], ['応答の送信元', '142.250.196.110（DSR）', ''], ['応答の宛先', q ? '203.0.113.5:40001（Maglev を通らない）' : '203.0.113.5:40002（Maglev を通らない）', '']] }
    ];
  };
  /* 段階6 のビット列（送る順。各バイトは下位のビットから） */
  var BITS = [['10101010 ×7', 'プリアンブル'], ['10101011', 'SFD'], ['01000000', '02'], ['10001000', '11'], ['01000100', '22'], ['11001100', '33'], ['00100010', '44'], ['10000000', '01']];

  YT.parts.define('encap', {
    title: 'カプセル化',
    layer: 'link',
    home: '11-sou.html#s3',
    lead: '要求に TLS・TCP（QUIC・UDP）・IP・Ethernet のヘッダが外側から付き、ビット列になるまでを、足したバイト数と欄の値で見る。第11章 場面3（TLS を省いた例）や第19〜22章の場面から掘る。',
    caption: '図　1 行が 1 つの層。外側に足した部分が x の枠（TLS・QUIC は中身も暗号化する）。幅はバイト数に比例しない。接続ごとに変わる欄は、値の代わりに中身を書いた。',
    note: 'TCP はオプションの無い 20 B、QUIC は接続後の短いヘッダ（パケット番号 1 B）で描いた。HTTP/3 のヘッダ 450 B は HTTP/2 に合わせた例。接続の最初の SETTINGS などは省いた。Maglev と GFE の番号は非公開なので例の私設アドレス。',
    steps: stepsOf,
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, v = st.v = kindOf(ctx.params), q = v.quic;
      // ---------- 枠の場所（左から送る順）。GRE の外側の IP と GRE は、IP の左（プリアンブル・Ethernet の場所）に置く ----------
      var w = q ? { pre: 70, eth: 62, ip: 62, l4: 62, sh: 56, sf: 30, ah: 44, ab: 170, tag: 54, fcs: 44 } : { pre: 70, eth: 62, ip: 62, l4: 62, sh: 50, ah: 50, ab: 170, ty: 28, tag: 54, fcs: 44 };
      var x = {}, cx = X0;
      (q ? ['pre', 'eth', 'ip', 'l4', 'sh', 'sf', 'ah', 'ab', 'tag', 'fcs'] : ['pre', 'eth', 'ip', 'l4', 'sh', 'ah', 'ab', 'ty', 'tag', 'fcs']).forEach(function (k) { x[k] = cx; cx += w[k] + GAP; });
      w.gr = 46; x.gr = x.ip - GAP - w.gr;
      w.og = 62; x.og = x.gr - GAP - w.og;
      x.cs = q ? x.sf : x.ah; w.cs = (q ? x.ab + w.ab : x.ty + w.ty) - x.cs;   // 暗号文（QUIC は STREAM フレームから、TLS は HTTP/2 の見出しから種別まで）
      // ---------- 各行の枠 [場所, 名前, バイト数, 種類] ----------
      var app = [['ah', '見出し', q ? '3 B' : '9 B', 'hdr'], ['ab', q ? 'QPACK のヘッダ' : 'HPACK のヘッダ', '450 B', 'plain']];
      var sec = [['sh', q ? 'QUIC' : 'TLS', q ? '10 B' : '5 B', 'hdr'], ['cs', q ? '暗号文（STREAM フレーム＋HTTP/3）' : '暗号文（HTTP/2 のフレーム＋種別）', q ? '455 B' : '460 B', 'cipher'], ['tag', 'タグ', '16 B', 'tag']];
      var l4 = [['l4', q ? 'UDP' : 'TCP', q ? '8 B' : '20 B', 'hdr']], ip = [['ip', 'IPv4', '20 B', 'hdr']];
      var spec = [
        { segs: app, fresh: ['ah'] },
        { segs: sec, fresh: ['sh', 'tag'] },
        { segs: l4.concat(sec), fresh: ['l4'] },
        { segs: ip.concat(l4, sec), fresh: ['ip'] },
        v.gre ? { segs: [['og', '外側の IP', '20 B', 'hdr'], ['gr', 'GRE', '4 B', 'hdr']].concat(ip, l4, sec), fresh: ['og', 'gr'] }
          : { segs: [['eth', 'Ethernet', '14 B', 'hdr']].concat(ip, l4, sec, [['fcs', 'FCS', '4 B', 'hdr']]), fresh: ['eth', 'fcs'] },
        v.gre ? { segs: [['og', '外側の IP', '20 B', 'ghost'], ['gr', 'GRE', '4 B', 'ghost']].concat(ip, l4, sec), fresh: [] }
          : { segs: [['pre', 'プリアンブル', '8 B', 'hdr'], ['eth', 'Ethernet', '14 B', 'hdr']].concat(ip, l4, sec, [['fcs', 'FCS', '4 B', 'hdr']]), fresh: ['pre'] }
      ];
      var LBL = q ? [['HTTP/3', 'HEADERS フレーム'], ['QUIC', 'パケット'], ['UDP', 'データグラム'], ['IPv4', 'パケット'], ['Ethernet', 'フレーム'], ['物理層へ', 'ビット列']]
        : [['HTTP/2', 'HEADERS フレーム'], ['TLS 1.3', 'レコード'], ['TCP', 'セグメント'], ['IPv4', 'パケット'], ['Ethernet', 'フレーム'], ['物理層へ', 'ビット列']];
      var TOT = q ? [453, 481, 489, 509, 527, 535] : [459, 481, 501, 521, 539, 547];
      if (v.gre) { LBL[4] = ['GRE', 'Maglev 2 が包む']; LBL[5] = ['GFE 2', '外して受け取る']; TOT[4] = TOT[3] + 24; TOT[5] = TOT[3]; }
      st.TOT = TOT;

      // ---------- 題 ----------
      S.text(16, 18, (q ? 'GET /watch の要求 1 つ（QUIC、HTTP/3）' : 'GET /watch の要求 1 つ（TCP ＋ TLS 1.3、HTTP/2）') + (v.gre ? '：拠点の中で GRE' : ''), { cls: 't-sm t-b' }, svg);
      S.text(944, 18, 'PC → www.youtube.com', { cls: 't-xs t-dim t-end' }, svg);
      // ---------- 境目（ブラウザと OS。GRE は PC と Google の拠点） ----------
      st.edge1 = S.g({ cls: 'fade hide' }, svg);
      S.text(X0, rowY(2) - 4, '↑ ブラウザの中　↓ OS（カーネル）の中', { cls: 't-xs t-dim' }, st.edge1);
      S.line(352, rowY(2) - 8, 944, rowY(2) - 8, { cls: 's-dim w1 dash' }, st.edge1);
      st.edge2 = S.g({ cls: 'fade hide' }, svg);
      if (v.gre) {
        S.text(X0, rowY(4) - 4, '↑ PC が作ったパケット　↓ Google の拠点の中（家と途中の区間のリンクの包みは省いた）', { cls: 't-xs t-dim' }, st.edge2);
        S.line(610, rowY(4) - 8, 944, rowY(4) - 8, { cls: 's-dim w1 dash' }, st.edge2);
      }
      // ---------- 行 ----------
      st.rows = spec.map(function (sp, k) {
        var y = rowY(k), g = S.g({ cls: 'fade hide' }, svg), b = {};
        S.text(16, y + 16, LBL[k][0], { cls: 't-sm t-b' }, g);
        S.text(16, y + 31, LBL[k][1], { cls: 't-xs t-dim' }, g);
        sp.segs.forEach(function (s) {
          var bg = S.g({}, g), K = KIND[s[3]];
          var r = S.rect(x[s[0]], y, w[s[0]], BH, { rx: 4, cls: K[0] }, bg);
          var t1 = S.text(x[s[0]] + w[s[0]] / 2, y + 16, s[1], { cls: 't-c t-xs t-b ' + K[1] }, bg);
          var t2 = S.text(x[s[0]] + w[s[0]] / 2, y + 30, s[2], { cls: 't-c t-xs t-mono ' + K[2] }, bg);
          b[s[0]] = { g: bg, r: r, t1: t1, t2: t2, kind: s[3] };
        });
        var tot = S.text(944, y + 16, num(TOT[k]) + ' B', { cls: 't-sm t-mono t-b t-end' }, g);
        var d = k ? TOT[k] - TOT[k - 1] : 0;
        var add = S.text(944, y + 31, k ? (d > 0 ? '＋' : '−') + Math.abs(d) + ' B' : '', { cls: 't-xs t-mono t-end' }, g);
        return { g: g, b: b, fresh: sp.fresh, tot: tot, add: add };
      });
      st.ghost = v.gre ? [st.rows[5].b.og.g, st.rows[5].b.gr.g] : [];
      // 段階6 の送る順のカーソル（ビット列の行。時間はバイト数に比例させる）
      st.order = [['pre', 8], ['eth', 14], ['ip', 20], ['l4', q ? 8 : 20], ['sh', q ? 10 : 5], ['cs', q ? 455 : 460], ['tag', 16], ['fcs', 4]].map(function (o) { return { x: x[o[0]], w: w[o[0]], n: o[1] }; });
      st.cursor = S.line(X0, rowY(5) - 4, X0, rowY(5) + BH + 4, { cls: 's-x w3 round', style: { display: 'none' } }, svg);

      // ---------- 下の欄（その段階で足したヘッダの欄と値） ----------
      S.rect(16, 348, 928, 200, { rx: 6, cls: 'f-sf s-rule w1' }, svg);
      st.pTitle = S.text(32, 370, '', { cls: 't-sm t-b' }, svg);
      st.fields = [];
      for (var k = 0; k < 10; k++) st.fields.push({ n: S.text(0, 0, '', { cls: 't-sm t-b' }, svg), v: S.text(0, 0, '', { cls: 't-sm' }, svg), h: S.text(0, 0, '', { cls: 't-sm t-mono t-d' }, svg) });
      st.bitsG = S.g({ style: { display: 'none' } }, svg);
      var bx = 32;
      st.bitTok = S.g({}, st.bitsG);
      BITS.forEach(function (bt, n) {
        var tw = bt[0].length * 6.7;
        S.text(bx, 398, bt[0], { cls: 't-sm t-mono t-d' + (n < 2 ? '' : ' t-b') }, st.bitTok);
        S.text(bx, 414, bt[1], { cls: 't-xs t-dim' + (n < 2 ? '' : ' t-mono') }, st.bitsG);
        bx += tw + 14;
      });
      S.text(bx, 398, '…', { cls: 't-sm t-mono t-d' }, st.bitTok);
      var m0 = 32 + 11 * 6.7 + 14 + 8 * 6.7 + 14, m1 = bx - 14;   // 宛先 MAC の 6 B の範囲
      S.path('M' + m0 + ',420 V425 H' + m1 + ' V420', { cls: 'f-none s-dim w1' }, st.bitsG);
      S.text((m0 + m1) / 2, 438, '宛先 MAC', { cls: 't-c t-xs t-dim' }, st.bitsG);
      st.bitLines = [0, 1].map(function (n) { return S.text(32, 466 + n * 26, '', { cls: 't-sm' }, st.bitsG); });

      // ---------- 部品の中の印（さらに下の層へ）。段階1〜4 は via で、段階5・6 は gre で替わる ----------
      if (!q) ctx.mark(st.rows[0].b.ah.g, { to: '21-http.html#s3.3', label: 'HTTP/2 のフレーム', at: [459, 47], steps: [1], bridge: '見出し 9 B の値は第21章の例と同じ。ストリーム番号 1 で、ほかの要求のフレームと見分ける' });
      if (!q) ctx.mark(st.rows[0].b.ab.g, { to: '21-http.html#s3.4', label: 'HPACK', at: [710, 47], steps: [1], bridge: 'HPACK の 450 B は 1 回目に送った量。動的表はまだ空なので、静的表の番号とハフマン符号で縮める' });
      if (!q) ctx.mark(st.rows[1].b.sh.g, { to: '20-tls.html#s6.1', label: 'TLS のレコード', at: [406, 101], steps: [2], bridge: '481 B のレコードも第20章の 46 B の例も、見出し 5 B・暗号文・タグ 16 B の同じ作り' });
      if (!q) ctx.mark(st.rows[1].b.tag.g, { to: '20-tls.html#s6.3', label: 'タグ', at: [798, 101], steps: [2], bridge: 'タグ 16 B の計算には、平文の見出し 5 B も入る。暗号文と同じく、変えれば受け手が気づく' });
      if (!q) ctx.mark(st.rows[2].b.l4.g, { to: '19-tcp.html#s3.1', label: 'TCP ヘッダ', at: [341, 155], steps: [3], bridge: '481 B のレコードは MSS 1,460 B より小さいので、1 個のセグメントに収まる' });
      if (q) ctx.mark(st.rows[0].b.ah.g, { to: '21-http.html#s4.1', label: 'HTTP/3 のフレーム', at: [498, 47], steps: [1], bridge: '見出し 3 B に番号が無くても、乗っている QUIC のストリーム 0 で要求を見分ける' });
      if (q) ctx.mark(st.rows[0].b.ab.g, { to: '21-http.html#s4.3', label: 'QPACK', at: [743, 47], steps: [1], bridge: 'QPACK の 450 B は HPACK に合わせた例。表の作りが違うので、実際の大きさは変わる' });
      if (q) ctx.mark(st.rows[1].b.sh.g, { to: '19-tcp.html#s6.5', label: 'QUIC の見出し', at: [406, 101], steps: [2], bridge: '見出し 10 B のうち途中から読めるのは、接続 ID 8 B と先頭 1 B の上位 3 ビットだけ' });
      if (q) ctx.mark(st.rows[1].b.tag.g, { to: '20-tls.html#s6.6', label: 'パケットごとに包む', at: [800, 101], steps: [2], bridge: 'タグ 16 B の作り方は TLS のレコードと同じ AEAD。包む単位がパケットに替わる' });
      if (q) ctx.mark(st.rows[2].b.l4.g, { to: '19-tcp.html#s5.1', label: 'UDP ヘッダ', at: [341, 155], steps: [3], bridge: 'UDP ヘッダ 8 B の形は中身によらない。第19章の例は DNS の問い合わせ（長さ 41）' });
      ctx.mark(st.rows[3].b.ip.g, { to: '18-ip.html#s1.1', label: 'IPv4 ヘッダ', at: [276, 209], steps: [4], bridge: 'IPv4 ヘッダ 20 B の欄の並びはどれも同じ。第18章の例は最初の QUIC のパケット（全長 1,278）' });
      if (!v.gre && !q) ctx.mark(st.rows[4].b.eth.g, { to: '13-ethernet.html#s3.1', label: 'Ethernet ヘッダ', at: [211, 263], steps: [5], bridge: 'フレームの長さは宛先から FCS までの 539 B。次の段階で付くプリアンブルは数えない' });
      if (!v.gre && q) ctx.mark(st.rows[4].b.eth.g, { to: '13-ethernet.html#s3.1', label: 'Ethernet ヘッダ', at: [211, 263], steps: [5], bridge: 'フレームの長さは宛先から FCS までの 527 B。次の段階で付くプリアンブルは数えない' });
      if (!v.gre && !q) ctx.mark(st.rows[4].b.fcs.g, { to: '13-ethernet.html#s3.6', label: 'FCS', at: [845, 263], steps: [5], bridge: 'FCS の 4 B は、宛先から中身までの 535 B 全体から計算した値' });
      if (!v.gre && q) ctx.mark(st.rows[4].b.fcs.g, { to: '13-ethernet.html#s3.6', label: 'FCS', at: [847, 263], steps: [5], bridge: 'FCS の 4 B は、宛先から中身までの 523 B 全体から計算した値' });
      if (!v.gre) ctx.mark(st.rows[5].b.pre.g, { to: '13-ethernet.html#s3.2', label: 'プリアンブルと SFD', at: [138, 317], steps: [6], bridge: '10101010 ×7 と 10101011 は、16 進の 55 ×7 と D5 を下位のビットから並べた形' });
      if (!v.gre) ctx.mark(st.bitTok, { part: 'line-code', step: 1, label: 'ビット列 → 信号', at: [622, 394], steps: [6], bridge: 'このビット列は、1 Gbps の銅線では 8 ビットずつ 1 拍 8 ns で 4 対の段階の組になる' });
      if (v.gre) ctx.mark(st.rows[4].b.og.g, { to: '18-ip.html#s1.1', label: '外側の IP ヘッダ', at: [162, 263], steps: [5], bridge: '外側の IP ヘッダも同じ 20 B の形。プロトコルの欄の 47 が、中身が GRE の印' });
      if (v.gre) ctx.mark(st.fields[0].v, { to: '14-router.html#s4.2', label: 'NAT の後の送信元', at: [490, 390], steps: [5], bridge: '送信元の 203.0.113.5 とポートは、家のルーターが出るときに書き換えた値' });
      if (v.gre) ctx.mark(st.fields[3].v, { to: '18-ip.html#s1.6', label: '応答の送信元', at: [352, 456], steps: [6], bridge: '応答の IP ヘッダの送信元の欄に、GFE は 142.250.196.110 を書いて直接出す' });
    },
    onStep: function (ctx, i) {
      var st = ctx.state, v = st.v;
      S.fade(st.edge1, i >= 1);
      S.fade(st.edge2, i >= 4);
      st.rows.forEach(function (r, k) {
        S.fade(r.g, k <= i);
        r.g.style.opacity = k < i ? 0.45 : '';
        Object.keys(r.b).forEach(function (s) {
          var b = r.b[s], K = KIND[k === i && r.fresh.indexOf(s) >= 0 ? 'fresh' : b.kind];
          b.r.setAttribute('class', K[0]);
          b.t1.setAttribute('class', 't-c t-xs t-b ' + K[1]);
          b.t2.setAttribute('class', 't-c t-xs t-mono ' + K[2]);
        });
        r.add.setAttribute('class', 't-xs t-mono t-end ' + (k === i ? 't-x t-b' : 't-dim'));
      });
      // 下の欄
      var bits = i === 5 && !v.gre;
      var P = i === 5 || (i === 4 && v.gre) ? (v.gre ? GRE_PANEL(v.quic)[i - 4] : null) : (v.quic ? PANEL_QUIC : PANEL_TCP)[i];
      st.bitsG.style.display = bits ? '' : 'none';
      if (bits) {
        var T = st.TOT[5];
        st.pTitle.textContent = 'ビット列：送る順に左から（x の線が送っている所。枠を通る時間はバイト数に比例）';
        st.bitLines[0].textContent = '02 ＝ 0000 0010 は下位から 0・1 の順に並ぶ。0 は 1 台宛て（I/G）、1 はローカル管理（U/L）の印。FCS だけは上位のビットから';
        st.bitLines[1].textContent = num(T * 8) + ' ビット。1 Gbps なら ' + (T * 8 / 1000).toFixed(1) + ' µs。次のフレームまで最小 12 B 分の間（IFG）を空け、1000BASE-T はその間も IDLE の記号を送る';
      } else st.pTitle.textContent = P.t;
      var rows = bits ? [] : P.rows, two = rows.length > 7;
      st.fields.forEach(function (f, k) {
        var r = rows[k];
        if (!r) { f.n.textContent = f.v.textContent = f.h.textContent = ''; return; }
        var col = two && k >= Math.ceil(rows.length / 2) ? 1 : 0, row = two ? k - col * Math.ceil(rows.length / 2) : k;
        var y = two ? 396 + row * 24 : 394 + row * 22, x0 = col ? 490 : 32;
        S.attrs(f.n, { x: x0, y: y }); S.attrs(f.v, { x: x0 + (two ? 128 : 150), y: y }); S.attrs(f.h, { x: two ? x0 + 330 : 600, y: y });
        f.n.textContent = r[0]; f.v.textContent = r[1]; f.h.textContent = r[2];
      });
      st.cursor.style.display = 'none';
      st.ghost.forEach(function (g) { g.removeAttribute('transform'); g.style.opacity = ''; });
    },
    frame: function (ctx) {
      var st = ctx.state, v = st.v, i = ctx.step, run = YT.motion.playing, ts = ctx.ts;
      if (i === 5 && !v.gre) {
        // 送る順のカーソル: 5 秒で端から端へ。時間はバイト数に比例（ヘッダは一瞬、ほとんどは暗号文）
        // 止めているときは、プリアンブルと SFD を送り終えて本体（宛先 MAC）に入る所に置く
        var q = U.seq(ts, [5, 1.2], true), n = run ? (q.i === 0 ? q.f : 1) * st.TOT[5] : 8, x = st.order[st.order.length - 1].x + st.order[st.order.length - 1].w;
        for (var k = 0; k < st.order.length; k++) { var o = st.order[k]; if (n <= o.n) { x = o.x + o.w * n / o.n; break; } n -= o.n; }
        S.attrs(st.cursor, { x1: x, x2: x });
        st.cursor.style.display = '';
      } else if (i === 5 && v.gre) {
        // 外した外側の IP と GRE が持ち上がって消える（止めているときは外した枠を破線で残す）
        var g = 0;
        if (run) { var p = U.seq(ts, [1.4, 1.0, 1.2], true); g = p.i === 0 ? 0 : p.i === 1 ? U.ease.inOut(p.f) : 1; }
        st.ghost.forEach(function (el) { el.setAttribute('transform', 'translate(0,' + (-12 * g).toFixed(1) + ')'); el.style.opacity = String(1 - g); });
      }
    }
  });
})();
