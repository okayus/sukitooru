/* ============================================================
   部品 nic-rx（NIC の受信と送信）— assets/parts/nic-rx.js

   第9章 場面3 の recvfrom が受け取る 1,452 B の断片が、NIC に届いてからソケットの受信キューに入るまで。
   ドライバが空きバッファを受信リングに並べて RDT を書く → DMA エンジンが PCIe の書き込みで 256 B ずつ書く →
   3 フレーム分の DD を束ねる間隔の後にまとめて書き戻して MSI-X を 1 回 → ハンドラが NAPI の poll を予約し、poll が sk_buff にする → data を 14・40・8 進めて
   層を上がる → fd 23 の受信キューにつないで待つタスクを起こす。図は左が CPU で動くもの、中央がメモリ、右が NIC。
   params（印から渡す値。parts.html では ?part=nic-rx&dir=read）:
     dir: 'rx'（既定）  受信（装置がメモリへ書く向き）
          'read'        送信（装置がメモリを読む向き）。第9章 場面6 段階5 の sendto(23, buf, 1250) の 1,312 B のフレームを、
                        NIC が読み出しの要求と完了で取ってきて送り、DD を書き戻し、poll が回収する。段階の数は 6 でそろえる
   使う所: 第9章 場面2 段階4・場面3 段階3・場面5 段階5・場面6 段階2〜5、第7章 場面3 段階6・場面4 段階3〜4・場面6 段階2・4、
   第8章 場面3 段階1・場面6 段階2（dir: 'read'）、第25章 場面4 段階5。印の張り替えの表は docs/log/2026-11-18-p5-nic-rx.md。
   値: 第9章 場面3・6（fd 23、PID 4133、UDP 51234 番、受け取る 1,452 B = 1,500 − 40 − 8、sendto の 1,250 B、受信リング 8 個）、
   第7章 場面2（NIC のレジスタ 0xFEB0_0000 から）、場面3（ベクタ 34 = 表の NIC）、場面4（1 回 128〜512 B、束ねた割り込み）。
   レジスタの位置（RDH 0xC010・RDT 0xC018・TDH 0xE010・TDT 0xE018）とディスクリプタの形は Intel I210・I225 の例。
   事実は Intel Ethernet Controller I210 Datasheet rev 3.7（表 1-11・1-12 の送受の流れ、3.1.4 の PCIe の要求の種類と大きさ・
   順序、7.1.4 の受信ディスクリプタ、7.1.4.4・7.2.2.6 の書き戻し（WTHRESH 個溜まるか EITR が切れたとき）、7.3.5 の束ね、
   8.10・8.12 のレジスタ）、Intel 8254x SDM（3.2.3・3.2.6 の DD と RDH・RDT）と、
   Linux（2026-11-18 の master。Documentation/networking/napi.rst、include/linux/netdevice.h の NAPI_POLL_WEIGHT、
   include/linux/skbuff.h の __skb_pull、net/ethernet/eth.c と etherdevice.h の eth_type_trans、net/ipv6/ip6_input.c、
   net/ipv6/udp.c と include/net/udp.h の udp_csum_pull_header、net/ipv4/udp.c の __udp_enqueue_schedule_skb、
   net/core/sock.c の sock_def_readable、fs/eventpoll.c、drivers/net/ethernet/intel/igc と e1000e、
   Documentation/PCI/msi-howto.rst、arch/x86/include/asm/msi.h）で確かめた（2026-11-18）。
   仕上げ確認（2026-11-18）: igc.h の IGC_RXDCTL_WTHRESH 4・送信の WTHRESH 16（igc_main.c）から、完了の印の書き戻しを
   束ねる間隔の後にまとめた。部品の中の「割り込みハンドラ」の印は部品 irq-entry の段階1 へ。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;

  /* 段階の文（1 段階 1 行。params の dir で選ぶ。段階の数は 6 でそろえる） */
  var STEPS_RX = [
    { title: 'ドライバが空きバッファを並べ、RDT を書く', text: 'ドライバは空きバッファの番地をディスクリプタに書いて受信リングに並べ、渡す範囲の次の番号 7 を NIC のレジスタ **RDT** に MMIO で書く。NIC は RDT の変化を見て、ディスクリプタを読み出して控える。RDH = RDT は「空」の意味なので、8 個のうち 1 個は空けておく。' },
    { title: 'DMA エンジンが 256 B ずつ書く', text: 'MAC が FCS を検算して外したフレームが受信 FIFO に揃うと、DMA エンジンは控えた番地 0x1000 を番地のレジスタに入れ、PCIe の書き込みを 1 回 256 B（Max Payload Size）ずつ出し、そのたびに番地を進める。1,514 B は 6 回。書き込みは返事を待たない。' },
    { title: '完了の印を書き戻し、割り込みは 1 回', text: '続く 2 フレームも 1・2 番のバッファへ書く。完了の印（長さ 1,514 と **DD** = 1）は NIC の中に溜め、束ねる間隔が過ぎると 3 個まとめて書き戻して RDH を 3 に進め、MSI-X で 1 回だけ割り込む。MSI-X も PCIe の書き込みで、先に出した書き込みを追い越さない。' },
    { title: 'ハンドラが poll を予約し、poll が取り出す', text: 'ベクタ 34 のハンドラは、NIC の割り込みを止めたまま NAPI の poll を予約して戻る。poll（ソフト割り込み）は DD = 1 を順に見て、バッファを `sk_buff` にして上へ渡す（1 回 64 個まで）。最後に空いた所へ新しいバッファを付けて RDT を 2 に進め、割り込みを再び許す。' },
    { title: 'data を進めて層を上がる', text: '`sk_buff` の data はフレームの先頭を指す。Ethernet はタイプ 0x86DD を見て data を 14 進め、IPv6 は次ヘッダ 17（UDP）を見て 40、UDP は宛先ポート 51234 でソケットを探して 8 進める。バイトは写さず、len が 1,514 から 1,452 に減る。' },
    { title: '受信キューにつなぎ、待つタスクを起こす', text: 'UDP は `sk_buff` を fd 23 のソケットの受信キューの末尾につなぎ、sk_data_ready で待ち行列のタスクを起こす。`epoll_wait` で待っていたネットワークサービス（PID 4133）は実行可能に戻り、走り出すと `recvfrom` で 1,452 B を写す（第9章 場面3）。' }
  ];
  var STEPS_READ = [
    { title: 'ヘッダを前に書き、送信リングに載せる', text: '`sendto(23, buf, 1250)` の 1,250 B の前の余白へ、UDP 8・IPv6 40・Ethernet 14 のヘッダを書き、data を先頭へ移して 1,312 B のフレームにする。ドライバは番地 0x6000 と長さを送信ディスクリプタ 0 番に書き、**TDT** に 1 を MMIO で書く。' },
    { title: 'NIC がディスクリプタを読む', text: 'DMA エンジンは TDT の変化を見て、PCIe の読み出し要求を出す。メモリはディスクリプタ 0 番の 16 B を完了（Completion）にして返す。書き込みは出せば終わりだが、読み出しは要求と完了の往復になり、中身が届くまで待つ。' },
    { title: 'フレームを 512 B ずつ読み出す', text: '読み出しの要求は 1 回 Max Read Request Size まで（既定は 512 B）。0x6000・0x6200・0x6400 の 3 回で 1,312 B を頼み、完了で届いた中身を送信 FIFO に溜める。第8章の表示や音の回路も、自分で番地を出してメモリを読む（つなぐ道は装置ごとに違う）。' },
    { title: 'MAC が FCS を足して送り出す', text: 'フレームが FIFO に揃うと、MAC が末尾に FCS 4 B を、先頭にプリアンブルを足し、PHY がビットを電線の信号にして送る（第7章 場面6）。送るのは NIC で、CPU はその間ほかの仕事をしている。' },
    { title: '完了の印を書き戻し、割り込む', text: '受信と同じく束ねる間隔が過ぎると、読み終えたディスクリプタに **DD** = 1 を書き戻して TDH を 1 に進め（TDH = TDT は「全部済み」）、MSI-X で割り込む。DD は「バッファを読み終えたので返してよい」の印で、送り終えた印ではない。' },
    { title: 'poll が使い終えたバッファを返す', text: 'ハンドラが予約した poll は、送信リングの DD = 1 を見て `sk_buff` を解放し、0 番を空きに戻す。送信の後始末は、受信の 64 個の予算と別に済ませる。`sendto` はフレームを渡した時点で戻っているので、アプリはこの待ちを知らない。' }
  ];

  /* 値（第9章 場面3・6、第7章 場面2〜4 と同じ。番地は例） */
  var V = { frame: 1514, mps: 256, buf: 0x1000, gap: 0x800, txFrame: 1312, mrrs: 512, txBuf: 0x6000 };
  var CH_RX = [256, 256, 256, 256, 256, 234];   // 1,514 B を Max Payload Size 256 B で分けた書き込み（256 × 5 ＋ 234）
  var CH_TX = [512, 512, 288];                  // 1,312 B を Max Read Request Size 512 B で分けた読み出し（512 × 2 ＋ 288）
  var OFF = [0, 14, 54, 62];                    // data の位置（フレームの先頭から。Ethernet 14・IPv6 40・UDP 8）
  var hx = function (n) { return '0x' + n.toString(16).toUpperCase(); };
  var cm = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  /* 図の寸法 */
  var BX = 330, BW = 286, BSC = BW / 2048;      // バッファの帯（2 KiB を 286 px に）
  var ZX = 330, ZSC = 240 / 62;                 // 先頭 62 B の拡大（240 px）
  var ROW0 = 82, ROWH = 21;                     // リングの行
  var zx = function (off) { return ZX + off * ZSC; };
  var rowY = function (k) { return ROW0 + k * ROWH; };
  /* 段階の中の場面（ph）の長さ（秒）。最後は止めたときの姿と同じ「決まった姿」 */
  var DUR_RX = [[1.8, 1.4, 1.6, 2.2], [1.4, 3.6, 2.2], [1.6, 1.0, 1.2, 1.2, 2.2], [1.2, 2.4, 1.6, 2.2], [0.8, 1.2, 1.2, 1.2, 2.2], [1.2, 1.4, 2.2]];
  var DUR_RD = [[0.8, 1.2, 1.2, 1.2, 1.2, 1.4, 2.2], [1.2, 1.2, 2.2], [1.4, 1.4, 1.4, 2.2], [1.2, 1.6, 2.2], [1.0, 1.0, 1.2, 2.2], [1.2, 1.6, 2.2]];
  /* リングの行の色（種類ごと） */
  var ROWCLS = { none: 'f-none s-rule w1 dash', drv: 'f-sf s-mid w1', nic: 'f-d-soft s-d w1', cur: 'f-d-soft s-x w2', done: 'f-x-soft s-x w1', used: 'f-in s-rule w1' };

  /* 書き換えは値が変わったときだけ（毎フレーム呼んでも DOM に触れない） */
  function txt(el, s) { if (el.__t !== s) { el.__t = s; el.textContent = s; } }
  function cls(el, c) { if (el.__c !== c) { el.__c = c; el.setAttribute('class', c); } }

  YT.parts.define('nic-rx', {
    title: 'NIC の受信と送信',
    layer: 'io',
    home: '07-shuuhen.html#s4',
    lead: 'NIC に届いたフレームが、DMA・割り込み・NAPI の poll を経てソケットの受信キューに入るまで。第9章 場面3 の recvfrom の 1,452 B のまま、第9章 場面6 と第7章 場面4 から掘る。',
    caption: '図　左は CPU で動くカーネルとアプリ、中央はメモリ、右は NIC。リングは 8 個に縮め、番地と 1 回の大きさは例。NIC とメモリの間のルートコンプレックスは省いた。',
    note: 'レジスタの位置とディスクリプタの形は Intel I210・I225（Linux の igb・igc）の例、ベクタ 34 は第7章 場面3 の例。IOMMU（第7章 場面4 段階5）と、送信でチェックサムを NIC に任せる指示のディスクリプタは省き、番地は物理アドレスで書いた。',
    steps: function (p) { return p && p.dir === 'read' ? STEPS_READ : STEPS_RX; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state, rd = st.rd = !!(ctx.params && ctx.params.dir === 'read');
      st.box = {};
      st.base = {};
      var box = function (key, x, y, w, h, base) {
        st.base[key] = base || 'f-sf s-rule w1';
        st.box[key] = S.rect(x, y, w, h, { rx: 5, cls: st.base[key] }, svg);
        return st.box[key];
      };
      var t = function (x, y, s, c) { return S.text(x, y, s, { cls: c }, svg); };

      // ---------- 左：CPU で動くもの（ユーザー空間とカーネル） ----------
      box('user', 14, 14, 286, 62, 'f-sf s-rule w1');
      t(26, 29, 'ユーザー空間', 't-xs t-dim');
      t(26, 47, 'ネットワークサービス（PID 4133）', 't-sm t-b');
      st.chip = S.rect(214, 34, 76, 18, { rx: 4, cls: 'f-in s-rule w1' }, svg);
      st.chipT = t(252, 47, '', 't-c t-xs t-b');
      st.call = t(26, 66, '', 't-xs t-mono');
      S.rect(14, 86, 286, 420, { rx: 8, cls: 'f-in s-fg w15' }, svg);
      t(26, 104, 'カーネル', 't-sm t-b');
      box('sock', 24, 112, 266, 52);
      t(34, 129, 'ソケット fd 23', 't-sm t-b');
      t(282, 129, rd ? 'UDP 51234 番（送る側）' : 'UDP 51234 番の受信キュー', 't-xs t-dim t-end');
      st.slots = [0, 1, 2].map(function (k) {
        return { r: S.rect(34 + k * 58, 138, 52, 20, { rx: 3, cls: 'f-none s-rule w1 dash' }, svg), t: t(60 + k * 58, 152, '', 't-c t-xs t-sf t-b t-mono') };
      });
      st.sockNote = t(34, 152, rd ? 'sendto の 1,250 B を UDP へ渡す' : '', 't-xs');
      if (rd) st.slots.forEach(function (s) { s.r.style.display = 'none'; s.t.style.display = 'none'; });
      var layer = function (key, y, name, sub) { box(key, 24, y, 266, 36); t(34, y + 15, name, 't-sm t-b'); t(34, y + 30, sub, 't-xs t-dim'); };
      layer('udp', 172, 'UDP', rd ? 'ポートと長さの 8 B を前に書く' : '宛先ポート 51234 でソケットを探す・8 B');
      layer('ip6', 214, 'IPv6', rd ? '経路表で出口を決め、40 B を前に書く' : '宛先は自分か、次ヘッダ 17（UDP）・40 B');
      layer('eth', 256, 'Ethernet', rd ? '宛先 MAC の 14 B を前に書く' : 'タイプ 0x86DD（IPv6）を見る・14 B');
      box('drv', 24, 300, 266, 52);
      t(34, 317, 'ドライバ', 't-sm t-b');
      st.drv1 = t(34, 333, '', 't-xs');
      st.drv2 = t(34, 346, '', 't-xs t-dim');
      box('irq', 24, 362, 200, 42);
      t(34, 379, '割り込みハンドラ', 't-sm t-b');
      t(34, 396, 'ベクタ 34：poll を予約して戻る', 't-xs t-dim');
      box('apic', 24, 412, 200, 42);
      t(34, 429, '割り込みコントローラ', 't-sm t-b');
      t(34, 446, '0xFEE0_0000 への書き込みを受ける', 't-xs t-dim');

      // ---------- 中央：メモリ（リング・バッファ・sk_buff） ----------
      S.rect(316, 14, 312, 426, { rx: 8, cls: 'f-sf s-fg w15' }, svg);
      t(330, 38, 'メモリ（DRAM）', 't-b t-md');
      t(614, 38, '番地は例', 't-xs t-dim t-end');
      st.ringT = t(330, 62, rd ? '送信リング（ディスクリプタ 8 個）' : '受信リング（ディスクリプタ 8 個）', 't-sm t-b');
      t(392, 76, '番', 't-c t-xs t-dim');
      t(408, 76, 'バッファの番地', 't-xs t-dim');
      t(524, 76, '長さ', 't-xs t-dim');
      t(598, 76, 'DD', 't-c t-xs t-dim');
      st.rows = [];
      for (var k = 0; k < 8; k++) {
        var y = rowY(k);
        st.rows.push({ bg: S.rect(380, y, 236, 19, { rx: 3, cls: ROWCLS.none }, svg), n: t(392, y + 14, String(k), 't-c t-xs t-mono t-dim'),
          a: t(408, y + 14, '', 't-xs t-mono'), l: t(524, y + 14, '', 't-xs t-mono'), d: t(598, y + 14, '', 't-c t-xs t-mono t-b') });
      }
      st.ringBox = S.rect(380, ROW0, 236, rowY(8) - ROW0 - 2, { cls: 'f-none s-none' }, svg);   // 印を付ける先（リング全体）
      st.tagH = t(376, 0, '', 't-xs t-mono t-b t-end');
      st.tagT = t(376, 0, '', 't-xs t-mono t-b t-end');
      // バッファの帯（2 KiB）と、書き込み・読み出しの区切り
      t(330, 272, rd ? '送るフレーム（番地 0x6000 から 1,312 B）' : 'バッファ（番地 0x1000 から 2 KiB）', 't-xs t-b');
      st.bar = S.rect(BX, 280, BW, 18, { rx: 2, cls: 'f-in s-rule w1' }, svg);
      var ch = rd ? CH_TX : CH_RX, acc = 0;
      st.chunks = ch.map(function (n) {
        var x0 = BX + acc * BSC, w = n * BSC;
        acc += n;
        return { r: S.rect(x0, 280, w, 18, { cls: 'f-none' }, svg), t: t(x0 + w / 2, 293, String(n), 't-c t-xs t-mono t-sf') };
      });
      // 先頭 62 B の拡大（ヘッダ 3 つ）と data の位置
      st.zoom = S.g({ cls: 'fade hide' }, svg);
      S.line(BX, 298, ZX, 326, { cls: 's-dim w1 dash' }, st.zoom);
      S.line(BX + 62 * BSC, 298, zx(62), 326, { cls: 's-dim w1 dash' }, st.zoom);
      st.segs = [['Ethernet', 0, 14], ['IPv6 ヘッダ 40 B', 14, 54], ['UDP', 54, 62]].map(function (s) {
        var x0 = zx(s[1]), w = zx(s[2]) - x0;
        return { r: S.rect(x0, 326, w, 18, { cls: 'f-in s-mid w1' }, st.zoom), t: S.text(x0 + w / 2, 339, s[0], { cls: 't-c t-xs t-b' }, st.zoom) };
      });
      S.rect(zx(62), 326, 616 - zx(62), 18, { cls: 'f-d' }, st.zoom);
      S.text((zx(62) + 616) / 2, 339, rd ? '1,250 B' : '1,452 B', { cls: 't-c t-xs t-b t-sf t-mono' }, st.zoom);
      st.ptr = S.g({}, st.zoom);
      S.polygon([[0, 348], [-6, 358], [6, 358]], { cls: 'f-x' }, st.ptr);
      S.text(0, 370, 'data', { cls: 't-c t-xs t-x t-b t-mono' }, st.ptr);
      // sk_buff
      st.skb = S.g({ cls: 'fade hide' }, svg);
      st.skbBox = S.rect(330, 378, 286, 52, { rx: 5, cls: 'f-sf s-rule w1' }, st.skb);
      S.text(342, 396, 'sk_buff', { cls: 't-sm t-b t-mono' }, st.skb);
      S.text(604, 396, 'フレームを指す構造体', { cls: 't-xs t-dim t-end' }, st.skb);
      st.skbD = S.text(342, 419, '', { cls: 't-xs t-mono' }, st.skb);
      st.skbL = S.text(604, 419, '', { cls: 't-sm t-mono t-b t-end' }, st.skb);
      // いまの動作
      S.rect(316, 448, 312, 54, { rx: 6, cls: 'f-sf s-rule w1' }, svg);
      st.s1 = t(328, 469, '', 't-xs t-b');
      st.s2 = t(328, 489, '', 't-xs t-dim');

      // ---------- 右：NIC ----------
      S.rect(704, 14, 242, 406, { rx: 8, cls: 'f-sf s-fg w15' }, svg);
      t(718, 38, 'NIC', 't-b t-md');
      t(936, 38, 'Intel I210・I225 の例', 't-xs t-dim t-end');
      st.wire = S.path('M934,70 H960', { cls: 'f-none s-dim w2' }, svg);
      box('phy', 716, 50, 218, 40);
      t(726, 66, 'PHY・MAC', 't-sm t-b');
      t(726, 83, rd ? 'FCS を足して電線へ送る' : '回線から受け、FCS を検算して外す', 't-xs t-dim');
      box('fifo', 716, 98, 218, 30);
      t(726, 117, rd ? '送信 FIFO' : '受信 FIFO', 't-xs t-b');
      S.rect(800, 106, 126, 14, { rx: 2, cls: 'f-in s-rule w1' }, svg);
      st.fifo = S.rect(800, 106, 0, 14, { rx: 2, cls: 'f-d' }, svg);
      box('dma', 716, 136, 218, 100);
      t(726, 154, 'DMA エンジン', 't-sm t-b');
      [['番地', 176], ['残り', 198], [rd ? '読み出し' : '書き込み', 220]].forEach(function (r) { t(726, r[1], r[0], 't-xs t-dim'); });
      st.dmaV = [176, 198, 220].map(function (y) { return t(924, y, '', 't-sm t-mono t-b t-end'); });
      box('cache', 716, 244, 218, 44);
      t(726, 262, 'ディスクリプタの控え', 't-xs t-b');
      st.cache = t(726, 280, '', 't-xs t-mono');
      box('regs', 716, 296, 218, 62);
      t(726, 314, 'レジスタ（MMIO）', 't-xs t-b');
      st.regH = t(726, 332, '', 't-xs t-mono t-b');
      st.regT = t(726, 350, '', 't-xs t-mono t-b');
      t(924, 332, rd ? '0xFEB0_E010' : '0xFEB0_C010', 't-xs t-mono t-dim t-end');
      t(924, 350, rd ? '0xFEB0_E018' : '0xFEB0_C018', 't-xs t-mono t-dim t-end');
      box('msix', 716, 366, 218, 46);
      t(726, 384, 'MSI-X', 't-xs t-b');
      st.msixS = t(924, 384, '', 't-xs t-b t-end');
      t(726, 402, '0xFEE0_0000 に 34 を書く', 't-xs t-mono');

      // ---------- 道：NIC ⇄ メモリ（PCIe）、CPU → NIC（MMIO）、NIC → CPU（MSI-X） ----------
      S.path('M716,186 H648 M648,88 V292', { cls: 'f-none s-rule w6 round' }, svg);
      t(676, 171, 'PCIe', 't-c t-xs t-dim');
      st.pRow = [];
      for (var j = 0; j < 8; j++) st.pRow.push(S.path('M682,186 H648 V' + (rowY(j) + 9.5), { cls: 'f-none s-none' }, svg));
      st.pBuf = S.path('M682,186 H648 V289', { cls: 'f-none s-none' }, svg);
      st.pMmio = S.path('M270,368 V524 H684 V327', { cls: 'f-none s-rule w1 dash' }, svg);
      st.pMsi = S.path('M826,412 V542 H124 V462', { cls: 'f-none s-rule w1 dash' }, svg);
      S.path('M270,352 V368 M684,327 H716 M124,462 V454', { cls: 'f-none s-rule w1 dash' }, svg);   // 道の端から箱まで（動く札はその手前で止まる・その先から出る）
      t(480, 513, 'MMIO の書き込み（CPU → NIC）', 't-c t-xs t-dim');
      t(480, 556, 'MSI-X の書き込み（NIC → CPU）', 't-c t-xs t-dim');
      var token = function (w) {
        var g = S.g({ style: { display: 'none' } }, svg);
        S.rect(-w / 2, -10, w, 20, { rx: 4, cls: 'f-d' }, g);
        var tx = S.text(0, 4, '', { cls: 't-c t-xs t-b t-sf' }, g);
        g.put = function (s, pathEl, f) { if (s == null) { if (g.style.display !== 'none') g.style.display = 'none'; return; } txt(tx, s); g.style.display = ''; S.place(g, pathEl, f); };
        return g;
      };
      st.tok = token(68);
      st.mmio = token(60);
      st.dot = S.circle(0, 0, 6, { cls: 'f-e glow', style: { display: 'none' } }, svg);

      // ---------- 部品の中の印（さらに下の層へ） ----------
      if (!rd) ctx.mark(st.box.regs, { to: '07-shuuhen.html#s2.3', label: 'RDT への store', at: [922, 300], steps: [1, 4], bridge: 'RDT への store も装置のレジスタへの書き込み。値が変わった瞬間に NIC の回路が動く' });
      if (rd) ctx.mark(st.box.regs, { to: '07-shuuhen.html#s2.3', label: 'TDT への store', at: [922, 300], steps: [1], bridge: 'TDT への store も装置のレジスタへの書き込み。値が変わった瞬間に NIC の回路が動く' });
      if (!rd) ctx.mark(st.ringBox, { to: '27-algorithm.html#s5.2', label: '受信リング', at: [616, 56], steps: [1, 4], bridge: '受信リングは、書く位置と読む位置の番号だけを進めるリングバッファ' });
      if (rd) ctx.mark(st.ringBox, { to: '27-algorithm.html#s5.2', label: '送信リング', at: [616, 56], steps: [1, 5], bridge: '送信リングも、書く位置と読む位置の番号だけを進めるリングバッファ' });
      if (!rd) ctx.mark(st.box.dma, { to: '06-cpu.html#s3.2', label: 'DMA エンジンの番地', at: [922, 146], steps: [2], bridge: '番地のレジスタを 256 ずつ進めるのは、PC が加算器で 1 ずつ進むのと同じ形' });
      if (rd) ctx.mark(st.box.dma, { to: '06-cpu.html#s3.2', label: 'DMA エンジンの番地', at: [922, 146], steps: [3], bridge: '番地のレジスタを 512 ずつ進めるのは、PC が加算器で 1 ずつ進むのと同じ形' });
      if (!rd) ctx.mark(st.bar, { to: '05-kioku.html#s5.2', label: '受信バッファ（DRAM）', at: [616, 268], steps: [2], bridge: 'DMA の書き込みも、最後は DRAM のセルのコンデンサをビット線の電圧で充放電すること' });
      if (rd) ctx.mark(st.bar, { to: '05-kioku.html#s5.3', label: '送るフレーム（DRAM）', at: [616, 268], steps: [3], bridge: 'DMA の読み出しも、最後は DRAM のセルの電荷をセンスアンプで増幅して取り出すこと' });
      if (!rd) ctx.mark(st.box.phy, { to: '13-ethernet.html#s3.6', label: 'MAC（FCS の検算）', at: [922, 58], steps: [2], bridge: 'MAC が検算する FCS は、宛先から中身までの全ビットから計算した CRC-32' });
      if (rd) ctx.mark(st.box.phy, { to: '13-ethernet.html#s3.6', label: 'MAC（FCS を足す）', at: [922, 58], steps: [4], bridge: 'MAC が足す FCS は、宛先から中身までの全ビットから計算した CRC-32' });
      if (!rd) ctx.mark(st.box.apic, { to: '07-shuuhen.html#s3.3', label: '割り込みコントローラ', at: [232, 420], steps: [3], bridge: 'MSI-X の書き込みは割り込みコントローラが受け、ベクタ番号で CPU に伝える' });
      if (rd) ctx.mark(st.box.apic, { to: '07-shuuhen.html#s3.3', label: '割り込みコントローラ', at: [232, 420], steps: [5], bridge: 'MSI-X の書き込みは割り込みコントローラが受け、ベクタ番号で CPU に伝える' });
      if (!rd) ctx.mark(st.box.irq, { part: 'irq-entry', step: 1, label: '割り込みハンドラ', at: [232, 370], steps: [4], bridge: 'ベクタ 34 の入口へ飛ぶ手順は、キーボードのベクタ 33 と同じ。下の例はキーボード' });
      if (rd) ctx.mark(st.box.irq, { part: 'irq-entry', step: 1, label: '割り込みハンドラ', at: [232, 370], steps: [6], bridge: 'ベクタ 34 の入口へ飛ぶ手順は、キーボードのベクタ 33 と同じ。下の例はキーボード' });
      if (!rd) ctx.mark(st.segs[0].r, { to: '13-ethernet.html#s3.4', label: 'Ethernet ヘッダ', at: [357, 312], steps: [5], bridge: 'Ethernet ヘッダの最後の 2 バイトがタイプ。0x86DD なら中身を IPv6 の処理へ渡す' });
      if (!rd) ctx.mark(st.segs[1].r, { to: '18-ip.html#s3.5', label: 'IPv6 ヘッダ', at: [461, 312], steps: [5], bridge: 'IPv6 ヘッダは 40 バイトの固定長。次ヘッダ 17 は、中身が UDP だという印' });
      if (!rd) ctx.mark(st.segs[2].r, { to: '19-tcp.html#s5.1', label: 'UDP ヘッダ', at: [555, 312], steps: [5], bridge: 'UDP ヘッダの 8 バイトは、送信元と宛先のポート・長さ・チェックサム' });
      if (!rd) ctx.mark(st.box.user, { to: '09-os.html#s5.5', label: '待つタスクを起こす', at: [288, 22], steps: [6], bridge: '起こされたタスクは実行可能になってランキューに戻り、すぐに選ばれる' });
    },
    onStep: function (ctx) {
      draw(ctx.state, view(ctx));   // 段階の見た目は view が段階と時刻から全部決める
    },
    frame: function (ctx) {
      draw(ctx.state, view(ctx));
    }
  });

  /* ---------- 段階と時刻から見た目を決める ---------- */
  function view(ctx) {
    var st = ctx.state, i = ctx.step, run = YT.motion.playing;
    var D = (st.rd ? DUR_RD : DUR_RX)[i];
    var q = U.seq(ctx.ts, D, true);
    var ph = run ? q.i : D.length - 1, f = run ? q.f : 1;   // 止めているときは最後の場面（決まった姿）
    return st.rd ? viewRead(i, ph, f) : viewRx(i, ph, f);
  }
  function base(rd) {
    return {
      hl: {}, user: rd ? ['S', 'sendto = 1250 の後、epoll_wait で待つ'] : ['S', 'epoll_wait(5, …) で待つ'], slots: 0,
      drv: rd ? ['start_xmit：送るときに書く', 'NAPI の poll：読み終えた分を回収'] : ['NAPI の poll（ソフト割り込み）', 'DD = 1 を取り出す（1 回 64 個まで）'],
      rows: null, tag: [0, 0], chunks: null, split: true, zoom: false, segs: [0, 0, 0], off: 0, offT: null, len: '', skb: false, skbHl: false,
      fifo: 0, wire: false, dma: ['—', '—', '—'], cache: '—', msix: '許可', status: ['', ''], tok: null, mmio: null, msi: -1
    };
  }
  /* 受信リング: stage と数 n から 8 行の [番地, 長さ, DD, 種類] */
  function ringRx(stage, n) {
    var rows = [];
    for (var k = 0; k < 8; k++) {
      var a = hx(V.buf + V.gap * k);
      if (stage === 'init') rows.push(k < n ? [a, '—', '0', 'drv'] : ['—', '—', '—', 'none']);
      else if (stage === 'refill') {
        var na = { 7: 0x4800, 0: 0x5000, 1: 0x5800 }[k];
        rows.push(k === 2 ? ['（空けておく）', '—', '—', 'none'] : [hx(na || V.buf + V.gap * k), '—', '0', 'nic']);
      } else if (k === 7) rows.push(['（空けておく）', '—', '—', 'none']);
      else if (stage === 'pend') rows.push([a, '—', '0', k < n ? 'cur' : 'nic']);   // NIC が使った（完了の印は NIC の中）
      else if (stage === 'wb' && k < n) rows.push([a, '1514', '1', 'done']);
      else if (stage === 'poll' && k < 3) rows.push([a, '1514', '1', k < n ? 'used' : k === n ? 'cur' : 'done']);
      else rows.push([a, '—', '0', stage === 'cur' && k === 0 ? 'cur' : 'nic']);
    }
    return rows;
  }
  /* 送信リング: 0 番だけを使う */
  function ringRd(stage) {
    var rows = [];
    for (var k = 0; k < 8; k++) {
      if (k !== 0 || stage === 'empty' || stage === 'freed') { rows.push(['—', '—', '—', 'none']); continue; }
      var a = hx(V.txBuf), l = '1312';
      rows.push(stage === 'w' ? [a, l, '0', 'drv'] : stage === 'cur' ? [a, l, '0', 'cur'] : stage === 'done' ? [a, l, '1', 'done'] : [a, l, '0', 'nic']);
    }
    return rows;
  }
  var fill = function (n, total, cur) { var a = []; for (var k = 0; k < total; k++) a.push(k < n ? 1 : k === cur ? 2 : 0); return a; };

  function viewRx(i, ph, f) {
    var v = base(false), last = DUR_RX[i].length - 1;
    v.rows = ringRx('given');
    v.tag = [0, 7];
    v.chunks = fill(6, 6);
    v.cache = '0〜6 番の 7 個';
    if (i === 0) {
      v.chunks = fill(0, 6);
      v.drv = ['準備：ディスクリプタに番地を書き、', 'RDT に store する（起動時と poll の後）'];
      v.hl.drv = ph <= 1;
      if (ph === 0) {
        var n = Math.min(7, Math.floor(f * 8));
        v.rows = ringRx('init', n); v.tag = [0, 0]; v.cache = '—';
        v.status = ['ドライバ：空きバッファの番地を 0〜6 番に書く', 'まだ NIC には渡していない（RDH = RDT = 0）'];
      } else if (ph === 1) {
        var arr = f > 0.92;
        v.rows = arr ? ringRx('given') : ringRx('init', 7); v.tag = [0, arr ? 7 : 0]; v.cache = '—';
        v.mmio = arr ? null : ['store 7', f / 0.92];
        v.hl.regs = arr;
        v.status = ['store 7 → RDT（0xFEB0_C018）', '0〜6 番を NIC に渡す。7 番は空けておく'];
      } else if (ph === 2) {
        v.hl.dma = true;
        v.cache = f > 0.9 ? '0〜6 番の 7 個' : '—';
        v.tok = f < 0.45 ? ['要求', 0, f / 0.45, false] : f < 0.9 ? ['112 B', 0, (f - 0.45) / 0.45, true] : null;
        v.status = ['NIC：RDT の変化を見て、0〜6 番を読み出す', f < 0.45 ? '読み出しの要求を出す' : '完了で 7 個（112 B）が返る'];
      } else {
        v.hl.regs = true;
        v.status = ['RDT = 7：0〜6 番の 7 個を NIC に渡した', 'NIC は 7 個の番地を控えた'];
      }
    } else if (i === 1) {
      v.rows = ringRx('cur');
      v.cache = '0 番を使う（残り 6 個）';
      if (ph === 0) {
        v.chunks = fill(0, 6); v.wire = true; v.fifo = f; v.hl.phy = true;
        v.status = ['MAC：届いたフレームの FCS 4 B を検算して外す', '1,514 B が受信 FIFO に揃うのを待つ'];
      } else if (ph === 1) {
        var w = Math.min(5, Math.floor(f * 6)), sub = f * 6 - w;
        v.chunks = fill(w, 6); v.fifo = 1 - w / 6; v.hl.dma = true;
        v.dma = [hx(V.buf + V.mps * w), cm(V.frame - V.mps * w) + ' B', (w + 1) + ' / 6 回'];
        v.tok = [CH_RX[w] + ' B', -1, sub, false];
        v.status = ['書き込み ' + (w + 1) + ' 回め：' + hx(V.buf + V.mps * w) + ' から ' + CH_RX[w] + ' B', '番地のレジスタを ' + CH_RX[w] + ' 進める（返事は待たない）'];
      } else {
        v.dma = [hx(V.buf + V.frame), '0 B', '6 / 6 回']; v.hl.dma = true;
        v.status = ['1,514 B を 6 回で書いた（256 B × 5 ＋ 234 B）', 'まだ DD = 0。ドライバは書き終わりを知らない'];
      }
    } else if (i === 2) {
      // 完了の印は束ねる間隔が過ぎてから 3 個まとめて書き戻す（I210 7.1.4.4。igc の WTHRESH は 4 なので 3 個では溜めたまま）
      var nd = ph === 0 ? 1 + (f > 0.45 ? 1 : 0) + (f > 0.9 ? 1 : 0) : 3;   // 書き終えたフレームの数
      var wb = ph > 2 || (ph === 2 && f > 0.9);                               // 書き戻した後か
      v.rows = wb ? ringRx('wb', 3) : ringRx('pend', Math.min(3, nd + (ph === 0 ? 1 : 0)));
      v.tag = [wb ? 3 : 0, 7];
      v.dma = [hx(V.buf + V.gap * (nd - 1) + V.frame), '0 B', '6 / 6 回'];   // 最後に書いたフレームの終わり
      v.cache = wb ? '3〜6 番の 4 個' : (nd === 1 ? '0 番' : '0〜' + (nd - 1) + ' 番') + '：書き戻し待ち';
      if (ph === 0) {
        v.wire = true; v.fifo = 0.5; v.hl.phy = true; v.hl.dma = true;
        v.status = ['続く 2 フレームも 1 番・2 番のバッファへ書く', '完了の印は NIC の中に溜め、まだ書き戻さない'];
      } else if (ph === 1) {
        v.hl.msix = true; v.hl.cache = true; v.msix = '束ねる間隔を待つ';
        v.status = ['束ねる：前の割り込みから一定の間隔を待つ', 'igc では約 14〜250 µs。メモリの DD はまだ 0'];
      } else if (ph === 2) {
        v.tok = f <= 0.9 ? ['DD = 1 ×3', 1, f / 0.9, false] : null; v.hl.dma = true;
        v.status = ['間隔が過ぎた：0〜2 番に長さ 1,514 と DD = 1 を書く', '割り込みの直前に 3 個まとめて書き戻し、RDH を 3 に'];
      } else if (ph === 3) {
        v.msi = f; v.hl.msix = f < 0.85; v.hl.apic = f >= 0.85; v.msix = '送る';
        v.status = ['MSI-X：0xFEE0_0000 にベクタ 34 を書く', 'この書き込みは先の書き込みを追い越さない'];
      } else {
        v.hl.apic = true; v.msix = '止めた（自動）';
        v.status = ['割り込みは 1 回。3 個とも DD = 1', 'NIC はこの割り込みを止めた（自動）'];
      }
    } else if (i === 3) {
      v.tag = [3, 7];
      v.cache = '3〜6 番の 4 個';
      v.msix = '止めた（自動）';
      v.zoom = ph >= 1; v.skb = ph >= 1; v.off = 0; v.len = '1,514';
      if (ph === 0) {
        v.rows = ringRx('wb', 3); v.hl.irq = true;
        v.status = ['ハンドラ：NIC の割り込みは止めたまま', 'NAPI の poll を予約して戻る'];
      } else if (ph === 1) {
        var c = Math.min(2, Math.floor(f * 3));
        v.rows = ringRx('poll', c); v.hl.drv = true; v.skbHl = c === 0;
        v.status = ['poll：' + c + ' 番の DD = 1 を見て sk_buff にする', '上の層へ渡す（1 回 64 個まで。ここは 3 個）'];
      } else if (ph === 2) {
        var ar = f > 0.92;
        v.rows = ar ? ringRx('refill') : ringRx('poll', 3); v.hl.drv = true;
        v.mmio = ar ? null : ['store 2', f / 0.92];
        v.tag = [3, ar ? 2 : 7]; v.hl.regs = ar;
        if (ar) { v.msix = '許可'; v.cache = '3〜7・0・1 番の 7 個'; }
        v.status = ['7・0・1 番に新しいバッファを付ける', 'store 2 → RDT。終われば割り込みを許す'];
      } else {
        v.rows = ringRx('refill'); v.tag = [3, 2]; v.msix = '許可'; v.cache = '3〜7・0・1 番の 7 個'; v.hl.regs = true; v.hl.drv = true;
        v.status = ['3 個を取り出し、RDT を 2 に進めた', '空けておく番は 7 から 2 へ移る'];
      }
    } else if (i === 4) {
      v.rows = ringRx('refill'); v.tag = [3, 2]; v.cache = '3〜7・0・1 番の 7 個';
      v.zoom = true; v.skb = true;
      var lay = ph === 0 ? -1 : Math.min(2, ph - 1), mv = ph >= 1 && ph <= 3 ? U.ease.inOut(f) : 0;
      if (ph === last) { v.off = 62; v.segs = [2, 2, 2]; v.len = '1,452'; v.hl.udp = true; v.hl.sock = true; }
      else if (lay < 0) { v.off = 0; v.len = '1,514'; v.hl.drv = true; }
      else {
        v.off = U.lerp(OFF[lay], OFF[lay + 1], mv);
        v.offT = OFF[mv > 0.5 ? lay + 1 : lay];   // data は一度に進む（札は動きの半ばで書き換える）
        v.segs = [0, 1, 2].map(function (k) { return k < lay ? 2 : k === lay ? 1 : 0; });
        v.len = cm([1514, 1500, 1460, 1452][mv > 0.5 ? lay + 1 : lay]);
        v.hl[['eth', 'ip6', 'udp'][lay]] = true;
      }
      v.status = [['data はフレームの先頭（Ethernet ヘッダ）', 'Ethernet：タイプ 0x86DD = IPv6', 'IPv6：宛先は自分、次ヘッダ 17 = UDP', 'UDP：宛先ポート 51234 → fd 23', 'data は中身 1,452 B の先頭へ'][ph],
        ['len = 1,514', 'data を 14 進める → len 1,500', 'data を 40 進める → len 1,460', 'data を 8 進める → len 1,452', 'バイトは写さず、ヘッダは前の余白に残る'][ph]];
    } else {
      v.rows = ringRx('refill'); v.tag = [3, 2]; v.cache = '3〜7・0・1 番の 7 個';
      v.zoom = true; v.skb = true; v.off = 62; v.segs = [2, 2, 2]; v.len = '1,452';
      if (ph === 0) {
        v.slots = Math.min(3, 1 + Math.floor(f * 3)); v.hl.sock = true; v.skbHl = true;
        v.status = ['UDP：sk_buff を受信キューの末尾につなぐ', '3 個がつながる（1,452 B ずつ）'];
      } else if (ph === 1) {
        var up = f > 0.3;
        v.slots = 3; v.hl.user = true; v.user = [up ? 'RR' : 'S', up ? 'epoll_wait(5, …) から起こされた' : 'epoll_wait(5, …) で待つ'];
        v.status = ['sk_data_ready：待ち行列のタスクを起こす', 'PID 4133 は待ち（S）から実行可能（R）へ'];
      } else {
        v.slots = 3; v.hl.user = true; v.user = ['RR', 'epoll_wait(5, …) から起こされた'];
        v.status = ['受信キューに 1,452 B が 3 個', 'PID 4133 は実行可能（R）に戻った'];
      }
    }
    return v;
  }

  function viewRead(i, ph, f) {
    var v = base(true), last = DUR_RD[i].length - 1;
    v.rows = ringRd('given');
    v.tag = [0, 1];
    v.chunks = fill(3, 3);
    v.zoom = true; v.skb = true; v.off = 0; v.segs = [2, 2, 2]; v.len = '1,312';
    v.cache = '0 番：0x6000・1,312 B';
    v.split = i >= 2;   // 読み出しの区切り（512・512・288）は段階3 から
    if (i === 0) {
      v.cache = '—';
      v.user = ['R', 'sendto(23, buf, 1250, …)'];
      if (ph <= 3) {
        var lay = ph - 1, mv = ph >= 1 ? U.ease.inOut(f) : 0;
        v.rows = ringRd('empty'); v.tag = [0, 0];
        v.off = lay < 0 ? 62 : U.lerp(OFF[3 - lay], OFF[2 - lay], mv);
        v.offT = lay < 0 ? 62 : OFF[mv > 0.5 ? 2 - lay : 3 - lay];
        v.segs = [0, 1, 2].map(function (k) { var a = 2 - k; return lay < 0 || a > lay ? 0 : a === lay ? 1 : 2; });
        v.len = cm([1250, 1258, 1298, 1312][lay < 0 ? 0 : mv > 0.5 ? lay + 1 : lay]);
        if (lay < 0) v.hl.sock = true; else v.hl[['udp', 'ip6', 'eth'][lay]] = true;
        v.status = [['sendto：1,250 B を sk_buff に写す', 'UDP：ポートと長さの 8 B を前に書く', 'IPv6：経路表で出口を決め、40 B を前に書く', 'Ethernet：宛先 MAC の 14 B を前に書く'][ph],
          ['data は中身の先頭、len = 1,250', 'data を 8 戻す → len 1,258', 'data を 40 戻す → len 1,298', 'data を 14 戻す → len 1,312（フレーム全体）'][ph]];
      } else if (ph === 4) {
        v.rows = ringRd('w'); v.tag = [0, 0]; v.hl.drv = true;
        v.status = ['start_xmit：0 番に番地 0x6000 と長さ 1,312 を書く', 'まだ NIC には渡していない（TDH = TDT = 0）'];
      } else if (ph === 5) {
        var arr = f > 0.92;
        v.rows = arr ? ringRd('given') : ringRd('w'); v.tag = [0, arr ? 1 : 0]; v.hl.drv = !arr; v.hl.regs = arr;
        v.mmio = arr ? null : ['store 1', f / 0.92];
        v.status = ['store 1 → TDT（0xFEB0_E018）', '0 番を NIC に渡す'];
      } else {
        v.user = ['R', 'sendto(…) = 1250 で戻る']; v.hl.regs = true;
        v.status = ['TDT = 1：0 番を NIC に渡した', 'sendto はここで戻る'];
      }
    } else if (i === 1) {
      v.rows = ringRd(ph === last ? 'given' : 'cur');
      v.cache = ph === last || (ph === 1 && f > 0.9) ? '0 番：0x6000・1,312 B' : '—';
      v.hl.dma = ph < last; v.hl.cache = ph === last;
      if (ph === 0) {
        v.tok = ['要求', 0, f, false];
        v.status = ['NIC：TDT の変化を見て、0 番を読む要求を出す', '読み出しには返事（完了）が要る'];
      } else if (ph === 1) {
        v.tok = f <= 0.9 ? ['16 B', 0, f / 0.9, true] : null;
        v.status = ['メモリが 0 番の 16 B を完了で返す', '要求から完了までは往復の時間がかかる'];
      } else v.status = ['NIC は 0 番の番地と長さを控えた', '要求を出して完了を待つ往復が 1 回'];
    } else if (i === 2) {
      v.hl.dma = true;
      if (ph < last) {
        var w = ph, back = f >= 0.45;
        v.chunks = [0, 1, 2].map(function (k) { return k === w ? 2 : 1; });
        v.fifo = (w + (back ? (f - 0.45) / 0.55 : 0)) / 3;
        v.dma = [hx(V.txBuf + V.mrrs * w), cm(V.txFrame - V.mrrs * w) + ' B', (w + 1) + ' / 3 回'];
        v.tok = back ? [CH_TX[w] + ' B', -1, (f - 0.45) / 0.55, true] : ['要求 ' + CH_TX[w] + ' B', -1, f / 0.45, false];
        v.status = ['読み出し ' + (w + 1) + ' 回め：' + hx(V.txBuf + V.mrrs * w) + ' から ' + CH_TX[w] + ' B', back ? '完了で中身が返り、送信 FIFO に溜まる' : '要求を出す。中身は完了で返る'];
      } else {
        v.fifo = 1; v.dma = [hx(V.txBuf + V.txFrame), '0 B', '3 / 3 回'];
        v.status = ['1,312 B を 3 回の読み出しで受け取った', '512 B × 2 ＋ 288 B'];
      }
    } else if (i === 3) {
      v.dma = [hx(V.txBuf + V.txFrame), '0 B', '3 / 3 回'];
      v.cache = '0 番：書き戻し待ち';   // 中身が全部届いた時点で、NIC の中の控えに読み終えた印を付ける（I210 表 1-11 の 12）
      if (ph === 0) { v.fifo = 1; v.hl.phy = true; v.status = ['MAC：末尾に FCS 4 B、先頭にプリアンブルを足す', '宛先から FCS までで 1,316 B']; }
      else if (ph === 1) { v.fifo = 1 - f; v.wire = true; v.hl.phy = true; v.status = ['PHY：ビットを電線の信号にして送る', 'CPU はその間ほかの仕事をしている']; }
      else { v.hl.phy = true; v.status = ['送り終えた。メモリの DD はまだ 0', '読み終えた印は NIC の中で書き戻しを待つ']; }
    } else if (i === 4) {
      // 書き戻しは束ねる間隔が過ぎたとき（I210 7.2.2.6。igc の送信の WTHRESH は 16 なので 1 個では溜めたまま）
      v.dma = [hx(V.txBuf + V.txFrame), '0 B', '3 / 3 回'];
      var wb = ph > 1 || (ph === 1 && f > 0.9);
      v.rows = ringRd(wb ? 'done' : 'given'); v.tag = [wb ? 1 : 0, 1];
      v.cache = wb ? '—' : '0 番：書き戻し待ち';
      if (ph === 0) { v.hl.msix = true; v.hl.cache = true; v.msix = '束ねる間隔を待つ'; v.status = ['束ねる：受信と同じく、一定の間隔を待つ', '読み終えた印は NIC の中。メモリの DD はまだ 0']; }
      else if (ph === 1) { v.tok = f <= 0.9 ? ['DD = 1', 0, f / 0.9, false] : null; v.hl.dma = true; v.status = ['間隔が過ぎた：0 番に DD = 1 を書き戻す', 'TDH を 1 に進める（TDH = TDT）']; }
      else if (ph === 2) { v.msi = f; v.hl.msix = f < 0.85; v.hl.apic = f >= 0.85; v.msix = '送る'; v.status = ['MSI-X：0xFEE0_0000 にベクタ 34 を書く', '書き戻しを追い越さない']; }
      else { v.hl.apic = true; v.msix = '止めた（自動）'; v.status = ['割り込みは 1 回', 'NIC はこの割り込みを止めた（自動）']; }
    } else {
      var freed = ph === last || (ph === 1 && f > 0.5);
      v.rows = ringRd(freed ? 'freed' : 'done'); v.tag = [1, 1];
      v.skb = !freed; v.zoom = !freed;
      v.chunks = freed ? [3, 3, 3] : fill(3, 3);
      v.cache = '—';
      v.msix = ph === last ? '許可' : '止めた（自動）';
      if (ph === 0) { v.hl.irq = true; v.status = ['ハンドラ：poll を予約して戻る', '割り込みは止めたまま']; }
      else if (ph === 1) { v.hl.drv = true; v.status = ['poll：0 番の DD = 1 を見る', 'sk_buff を解放し、0 番を空きに戻す']; }
      else { v.hl.drv = true; v.status = ['送信の後始末が終わった', '割り込みを再び許す']; }
    }
    return v;
  }

  /* ---------- 描く ---------- */
  function draw(st, v) {
    Object.keys(st.box).forEach(function (k) { cls(st.box[k], v.hl[k] ? 'f-sf s-x w2' : st.base[k]); });
    // ユーザー空間
    var us = v.user[0];
    cls(st.chip, us === 'R' ? 'f-x-soft s-x w15' : us === 'RR' ? 'f-sf s-fg w1' : 'f-in s-rule w1');
    txt(st.chipT, us === 'R' ? 'R 実行中' : us === 'RR' ? 'R 実行可能' : 'S 待ち');
    cls(st.chipT, 't-c t-xs t-b' + (us === 'R' ? ' t-x' : us === 'S' ? ' t-dim' : ''));
    txt(st.call, v.user[1]);
    // ソケットの受信キュー
    if (!st.rd) st.slots.forEach(function (s, k) { var on = k < v.slots; cls(s.r, on ? 'f-d' : 'f-none s-rule w1 dash'); txt(s.t, on ? '1452' : ''); });
    txt(st.drv1, v.drv[0]);
    txt(st.drv2, v.drv[1]);
    // リング
    st.rows.forEach(function (r, k) {
      var s = v.rows[k], dim = s[3] === 'none' || s[3] === 'used';
      cls(r.bg, ROWCLS[s[3]]);
      txt(r.a, s[0]); txt(r.l, s[1]); txt(r.d, s[2]);
      cls(r.a, 't-xs t-mono' + (dim ? ' t-dim' : ''));
      cls(r.l, 't-xs t-mono' + (dim ? ' t-dim' : ''));
      cls(r.d, 't-c t-xs t-mono t-b' + (s[2] === '1' ? ' t-x' : dim ? ' t-dim' : ''));
    });
    var hn = st.rd ? 'TDH' : 'RDH', tn = st.rd ? 'TDT' : 'RDT', same = v.tag[0] === v.tag[1];
    txt(st.tagH, same ? hn + '=' + tn + ' ▸' : hn + ' ▸');
    txt(st.tagT, same ? '' : tn + ' ▸');
    st.tagH.setAttribute('y', rowY(v.tag[0]) + 14);
    st.tagT.setAttribute('y', rowY(v.tag[1]) + 14);
    cls(st.tagT, 't-xs t-mono t-b t-end' + (v.hl.regs ? ' t-x' : ''));
    txt(st.regH, hn + ' = ' + v.tag[0]);
    txt(st.regT, tn + ' = ' + v.tag[1]);
    cls(st.regT, 't-xs t-mono t-b' + (v.hl.regs ? ' t-x' : ''));
    // バッファの区切り（0 まだ、1 中身あり、2 いま、3 解放した）
    st.chunks.forEach(function (c, k) {
      var s = v.chunks[k];
      cls(c.r, s === 1 ? 'f-d' : s === 2 ? 'f-x-soft s-x w15' : s === 3 ? 'f-soft' : 'f-none');
      cls(c.t, 't-c t-xs t-mono' + (s === 1 ? ' t-sf' : s === 2 ? ' t-x t-b' : ' t-dim'));
      txt(c.t, s === 0 || !v.split ? '' : c.t.__n || (c.t.__n = String((st.rd ? CH_TX : CH_RX)[k])));
    });
    // 拡大と sk_buff
    S.fade(st.zoom, v.zoom);
    S.fade(st.skb, v.skb);
    st.segs.forEach(function (s, k) {
      var m = v.segs[k];
      if (st.rd) cls(s.r, m === 0 ? 'f-none s-rule w1 dash' : m === 1 ? 'f-x-soft s-x w15' : 'f-in s-mid w1');
      else cls(s.r, m === 0 ? 'f-in s-mid w1' : m === 1 ? 'f-x-soft s-x w15' : 'f-none s-rule w1 dash');
      var faint = st.rd ? m === 0 : m === 2;
      cls(s.t, 't-c t-xs t-b' + (m === 1 ? ' t-x' : faint ? ' t-dim' : ''));
    });
    st.ptr.setAttribute('transform', 'translate(' + zx(v.off).toFixed(1) + ',0)');
    txt(st.skbD, 'data = 先頭 + ' + (v.offT != null ? v.offT : Math.round(v.off)));
    txt(st.skbL, 'len ' + v.len);
    cls(st.skbBox, v.skbHl ? 'f-sf s-x w2' : 'f-sf s-rule w1');
    // NIC
    cls(st.wire, v.wire ? 'f-none s-e w4' : 'f-none s-dim w2');
    st.fifo.setAttribute('width', (126 * U.clamp(v.fifo, 0, 1)).toFixed(1));
    st.dmaV.forEach(function (e, k) { txt(e, v.dma[k]); });
    txt(st.cache, v.cache);
    txt(st.msixS, v.msix);
    cls(st.msixS, 't-xs t-b t-end' + (v.msix === '許可' ? ' t-dim' : ' t-x'));
    // 状態の 2 行
    txt(st.s1, v.status[0]);
    txt(st.s2, v.status[1]);
    // 動く札（PCIe の道・MMIO）と MSI-X の点
    if (v.tok) {
      var p = v.tok[1] < 0 ? st.pBuf : st.pRow[v.tok[1]];
      st.tok.put(v.tok[0], p, v.tok[3] ? 1 - v.tok[2] : v.tok[2]);
    } else st.tok.put(null);
    if (v.mmio) st.mmio.put(v.mmio[0], st.pMmio, v.mmio[1]); else st.mmio.put(null);
    if (v.msi >= 0) {
      var pt = S.along(st.pMsi, v.msi);
      st.dot.setAttribute('cx', pt.x.toFixed(1));
      st.dot.setAttribute('cy', pt.y.toFixed(1));
      if (st.dot.style.display) st.dot.style.display = '';
    } else if (st.dot.style.display !== 'none') st.dot.style.display = 'none';
  }
})();
