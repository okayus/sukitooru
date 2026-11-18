/* ============================================================
   部品 line-code（ビットを信号に）— assets/parts/line-code.js

   送る側がビット列をシンボル（電圧の段階・光の強弱・I と Q の点）に写して線・光・電波に出し、受け手が前段で電圧に戻し、
   拍を再生して、シンボルの真ん中でしきい値と比べてシンボルに戻し、ビットに戻すまで。媒体は印の params.medium で選ぶ
   （'pam5' が既定で 1000BASE-T、'light' は GE-PON の上り、'qam' は Wi-Fi の 16-QAM）。段階の数はどの媒体も 5。
   使う所: 第11章 場面1 段階6・場面3 段階5、第13章 場面2 段階2〜5、第15章 場面2 段階1・5、第12章 場面2 段階4、
   第16章 場面4 段階5（張り替えの表は docs/log/2026-11-18-p5-line-code.md）。
   値: ビットは第11章 場面3 段階5 のフレーム（プリアンブル 8 バイトの後）の先頭 6 バイト＝宛先 MAC 02:11:22:33:44:01
   （docs/plan.md「共通の例の値」）。どの媒体も同じビットで描く（実際は区間ごとにヘッダが替わる）。
   PAM-5 の 5 段階（−1, −0.5, 0, +0.5, +1 V）・4 本のしきい値・1 拍 8 ns は第13章 場面2、上り 1310 nm・1.25 G ボーは第15章 場面2、
   16-QAM の格子（I・Q とも 4 段）は第12章 場面2 段階4 と同じ。PAM-5 の 4 対の組は例（実物はスクランブラの状態で変わる）。
   事実の確かめ（2026-11-18）: 1000BASE-T は UNH-IOL の Clause 40 の資料（PMA・PCS）と Microchip の KSZ9031RNX のデータシート
   （DS00002117F）、8B/10B は Franaszek・Widmer の特許 US4486739 の表、GE-PON の受信の整定は IEEE P802.3bk/D3.0 の Table 60-8e、
   LD ドライバは Lightwave の記事「Interfacing laser-driver circuits with laser diodes」（Maxim の技術者）、TIA は TI の SBOA122、
   CDR は Xilinx の XAPP250、16-QAM の並びは IEEE 802.11-99/074 で確かめた。
   仕上げ確認（2026-11-18）: 1000BASE-T の受信のアナログのハイブリッド（エコーを減らしてから ADC へ）は KSZ9031RNX の §3.2.1・§3.2.5、
   部分応答の 17 通り（1/8 V 刻み）と対ごとの拍の位相は UNH-IOL の PMA の資料、113 通りを制御に使うことは UNH-IOL の PCS の資料、
   GE-PON の受信の整定と拍の同期がそれぞれ 400 ns 以内なのは IEEE 802.3 の 60.7.13.1（P802.3bh の草案の写し）で確かめ直した。
   ============================================================ */
(function () {
  'use strict';
  var U = YT.util, S = YT.svg;
  var MI = '−';   // 数のマイナス（−）

  /* ---------- 値 ---------- */
  var BYTES = [0x02, 0x11, 0x22, 0x33, 0x44, 0x01];   // 宛先 MAC（第11章 場面3）
  var hx = function (n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); };
  var bin = function (n, lsbFirst) { var s = ''; for (var k = 0; k < 8; k++) s += lsbFirst ? (n >> k) & 1 : (n >> (7 - k)) & 1; return s; };
  var sgn = function (v) { var a = Math.abs(v), s = String(Math.round(a * 100) / 100); return v > 0 ? '+' + s : v < 0 ? MI + s : '0'; };
  var hash = function (n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  var wob = function (u, seed) { return Math.sin(u * 9.7 + seed) * 0.6 + Math.sin(u * 23.3 + seed * 1.7) * 0.4; };   // 決まった揺れ（−1..1）

  /* PAM-5（1000BASE-T）: 1 バイトが 1 拍で 4 対の段階の組になる。単位は 0.5 V（−2..+2）。組は例 */
  var PAM = [[2, -1, 0, 1], [-1, 2, -2, 0], [0, 1, 1, -2], [1, -2, 0, 2], [-2, 0, -1, 1], [1, 1, 2, -1]];
  /* 8B/10B（GE-PON）: 先頭の 2 バイト。直前の RD が − のとき（特許 US4486739 の表） */
  var B10 = [
    { b: 0x02, name: 'D2.0', lo: '00010', hi: '000', six: '101101', four: '0100', d: ['101101 は 1 が 4 個（RD は + になる）', '→ 次の 4 ビットは 1 が 1 個の 0100'] },
    { b: 0x11, name: 'D17.0', lo: '10001', hi: '000', six: '100011', four: '1011', d: ['100011 は 1 と 0 が 3 個ずつ（RD は − のまま）', '→ 4 ビットは RD − の列の 1011'] }
  ];
  var LBITS = (B10[0].six + B10[0].four + B10[1].six + B10[1].four).split('').map(Number);
  /* 16-QAM（802.11 のグレイ符号）: 前の 2 ビット → I、後の 2 ビット → Q。00 → −3、01 → −1、11 → +1、10 → +3 */
  var GRAY = { '00': -3, '01': -1, '11': 1, '10': 3 };
  var QB = [], QI = [], QQ = [];
  BYTES.forEach(function (b) { var s = bin(b, true); [s.slice(0, 4), s.slice(4)].forEach(function (q) { QB.push(q); QI.push(GRAY[q.slice(0, 2)]); QQ.push(GRAY[q.slice(2)]); }); });
  var near = function (v) { return v < -2 ? -3 : v < 0 ? -1 : v < 2 ? 1 : 3; };
  var grayOf = function (v) { return { '-3': '00', '-1': '01', '1': '11', '3': '10' }[String(v)]; };

  /* 区間 k の値 vals[k] を、境目の前後 hw（区間の幅を 1 として）でなめらかにつなぐ */
  var mix = function (a, b, t) { var s = t * t * (3 - 2 * t); return a + (b - a) * s; };
  function smooth(vals, u, hw) {
    var n = vals.length, k = Math.max(0, Math.min(n - 1, Math.floor(u))), f = u - Math.floor(u);
    if (u <= 0) return vals[0];
    if (u >= n) return vals[n - 1];
    if (f < hw && k > 0) return mix(vals[k - 1], vals[k], 0.5 + f / (2 * hw));
    if (f > 1 - hw && k < n - 1) return mix(vals[k], vals[k + 1], (f - (1 - hw)) / (2 * hw));
    return vals[k];
  }

  /* ---------- 図の寸法 ---------- */
  var X0 = 470, X1 = 936;   // 時間の流れの欄の横の範囲
  var Y = { ah: 152, ab: 167, b: 193, c: 241, d: 350, dI: 320, dQ: 386, k0: 427, k1: 441, e: 466, f: 494, note: 528 };
  var BLK = [[14, 140], [166, 140], [480, 140], [632, 140], [784, 162]];   // 鎖の箱（写す・送信回路・前段・拍・判定）

  var STEPS_PAM5 = [
    { title: '1 バイトを 4 対の段階の組に写す', text: 'PHY は MAC から 1 バイトずつ受け取る。疑似乱数のビットと XOR を取り（スクランブル）、トレリス符号の 1 ビットを足した 9 ビットを、規格の表で 4 対の段階の組（5 の 4 乗 = 625 通りのうち 512 通り）に写す。図の組は例で、実物はスクランブラの状態で変わる。' },
    { title: '送信回路が段階の電圧を線に出す', text: '対ごとの送信回路（ラインドライバ）は、段階の値に比例した電圧を作り（D/A 変換）、2 本の線に半分ずつ逆向きにかけて、2 本の差を段階の電圧にする。4 対とも同じ拍で、8 ns（毎秒 1 億 2,500 万回）ごとに次の段階へ移る。' },
    { title: '受け手はエコーと漏れを引いて整える', text: '受け手の線の電圧には、相手の送信に、自分の送信の分（エコー）と隣の 3 対からの漏れが重なる。受信回路は 2 本の差を取って外のノイズを消し、ハイブリッド回路でエコーを減らす。ADC で数値にした後、残りのエコーと漏れを引き算で除き、100 m で弱まってなまった波形を等化で整える。' },
    { title: '届いた波形から拍を再生する', text: '受け手は、届いた波形から自分の拍の時刻のずれを測り、ずれの向きに合わせて発振器を少し速め、遅らせる（CDR）。合うと、拍の立ち上がりが各シンボルの真ん中に来る。1000BASE-T では、スレーブの PHY がマスターの拍を再生し、その拍で送り返す。' },
    { title: 'シンボルの真ん中でしきい値と比べ、バイトに戻す', text: '拍の立ち上がり（各シンボルの真ん中）の電圧を 4 本の{x|しきい値}（±0.25 V・±0.75 V）と比べ、上回った本数で 5 段階のどれかを決める。4 対の組を表で 9 ビットに戻し、スクランブルを解くと 02 に戻る。実物は前後の組をまとめて判定し（ビタビ復号）、読み違えの多くを直す。' }
  ];
  var STEPS_LIGHT = [
    { title: '8 ビットを 10 ビットに写す（8B/10B）', text: '8 ビットを下位 5 ビットと上位 3 ビットに分け、表でそれぞれ 6 ビットと 4 ビットに置き換える。1 と 0 の数の差は 0 か ±2 で、差のある符号には逆向きの 2 通りがある。それまでの傾き（ランニングディスパリティ）を戻す側を選ぶので、1 と 0 の数がそろい、同じ値は 5 個までしか続かない。' },
    { title: 'ドライバが LD の電流を切り替える', text: 'ドライバは、LD のしきい値を少し超えるバイアス電流を流し続け、1 のときだけ変調電流を足す。変調電流は 2 つのトランジスタ（差動対）が振り分け、1 なら LD へ、0 なら脇の道へ流れる。光は 1 で強く 0 で弱くなり、1 ビット 0.8 ns（1.25 G ボー）で変わる。' },
    { title: 'PD と TIA が光を電圧に戻す', text: '局舎の OLT では、フォトダイオード（PD）が届いた光の強さに比例した電流（数〜数十 µA）を流す。TIA（トランスインピーダンス増幅器）はこの電流を帰還抵抗で電圧に変えて増幅する。抵抗 1 本でも電流は電圧になるが、得られる倍率は速さ（帯域）などで限られる。TIA は増幅器の帰還でこの制限を緩める。' },
    { title: '光の塊ごとに、しきい値と拍を合わせる', text: '受け手は、電圧の変化の時刻と自分の拍を比べて発振器を速め、遅らせ、拍を再生する（CDR）。上りの光は ONU ごとに強さも届く時刻も違うので、OLT は光の塊（バースト）の頭の同期の時間に、しきい値と拍を合わせ直す。' },
    { title: 'しきい値で 1 と 0 を読み、8 ビットに戻す', text: 'シンボルの真ん中の電圧が、{x|しきい値}（強い光と弱い光の電圧の中間）より上なら 1、下なら 0 と読む。読んだ 10 ビットを表で逆に引くと 8 ビットに戻る。表に無い 10 ビットや、RD の向きに合わない符号が来たら、途中で化けたと分かる。' }
  ];
  var STEPS_QAM = [
    { title: '4 ビットで I と Q を選ぶ（16-QAM）', text: 'ビットを 4 個ずつ区切り、前の 2 ビットで I（cos 波の大きさ）、後の 2 ビットで Q（sin 波の大きさ）を −3、−1、+1、+3 から選ぶ。Wi-Fi の表は隣の点と 1 ビットだけ違う並び（グレイ符号）で、隣の点と取り違えても化けるのは 1 ビットで済む。' },
    { title: 'DAC と掛け算で電波の波形を作る', text: '2 つの DAC が I と Q の数値を電圧にし、それぞれを同じ周波数の cos 波と sin 波に掛けて足す。I·cos ＋ Q·sin の波は、点の位置で決まる振幅と位相を持つ。これを増幅してアンテナに流すと電波として出る。' },
    { title: 'cos と sin を掛けて I と Q を取り出す', text: '受け手は、届いた波に自分で作った cos と sin を掛ける。cos × cos は平均すると 1/2、sin × cos は平均すると 0 なので、cos を掛けて高い周波数を除くと I/2 だけが残り、sin の側には Q/2 が残る。2 つの ADC がこれを一定の間隔で数値にする。' },
    { title: '頭の決まった波形で区切りと位相を合わせる', text: '受け手の cos と sin の位相が送り手とずれると、取り出した (I, Q) は星座図の上で回ってしまう。Wi-Fi はフレームの頭に決まった波形（プリアンブル）を送り、受け手はそれでシンボルの区切りと、周波数・位相のずれを測って合わせる。' },
    { title: 'いちばん近い点を選び、ビットに戻す', text: 'シンボルの真ん中の I と Q を、それぞれ 3 本の{x|しきい値}（−2、0、+2）と比べると、いちばん近い点が決まる。点を表で逆に引くと 4 ビットに戻る。実物の Wi-Fi は、このあと誤り訂正の符号で化けたビットを直す。' }
  ];

  YT.parts.define('line-code', {
    title: 'ビットを信号に',
    layer: 'phy',
    home: '13-ethernet.html#s2',
    lead: 'ビットを電圧・光・電波のシンボルに写して送り、受け手が拍を再生し、しきい値でシンボルを読んでビットに戻すまで。第11章 場面3 のフレームの先頭のまま、第11〜13・15・16章の伝送の場面から掘る。',
    caption: '図　上は送る側から受ける側への回路の並び、左下は段階ごとの回路の拡大、右下は同じビットがシンボルと信号を経てビットに戻る時間の流れ。媒体（銅線・光・電波）は印が選ぶ。',
    note: 'ビットはどの媒体も第11章 場面3 のフレームの先頭（宛先 MAC 02:11:22:33:44:01）にした。実際は区間ごとにヘッダが替わる。誤り訂正の符号と、Wi-Fi の OFDM・スクランブルは省いた。',
    steps: function (p) { return p && p.medium === 'light' ? STEPS_LIGHT : p && p.medium === 'qam' ? STEPS_QAM : STEPS_PAM5; },
    setup: function (ctx) {
      var svg = ctx.svg, st = ctx.state;
      var M = ctx.params && (ctx.params.medium === 'light' || ctx.params.medium === 'qam') ? ctx.params.medium : 'pam5';
      st.M = M;
      model(st);
      buildFrame(svg, st);
      if (M === 'pam5') buildPam5(svg, st);
      else if (M === 'light') buildLight(svg, st);
      else buildQam(svg, st);
      buildTime(svg, st);
      // ---------- 部品の中の印（さらに下の層へ） ----------
      ctx.mark(st.blk[3].rect, { to: '04-ronri.html#s1.4', label: 'シンボルの真ん中で読む', at: [759, 96], steps: [4], bridge: 'シンボルの真ん中で読むのは、電圧の切り替わりの途中では値が決まらないから' });
      ctx.mark(st.blk[4].rect, { to: '04-ronri.html#s1.2', label: 'しきい値と比べる', at: [933, 96], steps: [5], bridge: 'しきい値と比べてシンボルを決めるのは、論理回路の入力が 0 と 1 を読むのと同じ判定' });
      if (M === 'pam5') ctx.mark(st.blk[1].rect, { to: '08-display.html#s6.2', label: 'D/A 変換', at: [293, 96], steps: [2], bridge: '段階の電圧を作る D/A 変換も、音の DAC と同じく、数値に比例した電圧を出す' });
      if (M === 'pam5') ctx.mark(st.pairs, { to: '13-ethernet.html#s1.2', label: 'より対線（差動）', at: [440, 88], steps: [2], bridge: '2 本の線に逆向きの電圧をかけるのは、2 本の差で送る差動信号にするため' });
      if (M === 'light') ctx.mark(st.q1, { to: '03-transistor.html#s3.3', label: '差動対のトランジスタ', at: [104, 236], steps: [2], bridge: '差動対で変調電流を振り分けるのも、ゲートの電圧でチャネルができるトランジスタのスイッチ' });
      if (M === 'light') ctx.mark(st.ld, { to: '02-handoutai.html#s6.5', label: 'LD', at: [106, 186], steps: [2], bridge: 'LD の電流がしきい値を超えると、再結合の光が誘導放出で増え、そろった光になる' });
      if (M === 'light') ctx.mark(st.pd, { to: '02-handoutai.html#s6.3', label: 'PD', at: [106, 182], steps: [3], bridge: 'PD の電流は、光子が作った電子正孔対が空乏層の電場で引き離されて流れるもの' });
      if (M === 'light') ctx.mark(st.tia, { to: '03-transistor.html#s2.4', label: 'TIA（増幅器）', at: [180, 302], steps: [3], bridge: 'TIA が増幅できるのは、中のトランジスタがゲートの電圧で電流を連続的に変えられるから' });
      if (M === 'qam') ctx.mark(st.dacI, { to: '08-display.html#s6.2', label: 'DAC', at: [144, 158], steps: [2], bridge: 'I と Q の数値を電圧にする DAC は、音の DAC と同じく、数値に比例した電圧を出す' });
      if (M === 'qam') ctx.mark(st.antT, { to: '12-wifi.html#s1.1', label: '送信アンテナ', at: [300, 158], steps: [2], bridge: 'アンテナに流した I·cos ＋ Q·sin の電流も、往復する電子が電場を揺らして電波になる' });
      if (M === 'qam') ctx.mark(st.antR, { to: '12-wifi.html#s1.4', label: '受信アンテナ', at: [62, 158], steps: [3], bridge: '受けた波の電流は、届いた電波の電場が受信アンテナの電子を揺らして生まれる' });
      if (M === 'qam') ctx.mark(st.adcI, { to: '08-display.html#s6.1', label: 'ADC', at: [304, 158], steps: [3], bridge: 'ADC が I と Q を一定の間隔で数値にするのは、音を PCM にする標本化と同じ' });
    },
    onStep: function (ctx, i) {
      var st = ctx.state;
      st.dp.forEach(function (g, k) { S.fade(g, k === i); });
      if (st.qc) S.fade(st.qc, i === 0 || i === 3 || i === 4);
      st.blk.forEach(function (b, k) { b.rect.setAttribute('class', k === i ? 'f-x-soft s-x w2' : 'f-sf s-rule w1'); });
      // 時間の流れの行: いまの段階の行を濃く、済んだ行を薄く、まだの行は隠す
      var op = [
        [1, 1, 0, 0, 0, 0, 0],
        [0.45, 0.45, 1, 0, 0, 0, 0],
        [0.35, 0.35, 0.45, 1, 0, 0, 0],
        [0.35, 0.35, 0.35, 1, 1, 0, 0],
        [1, 0.45, 0.35, 1, 0.7, 1, 1]
      ][i];
      st.rows.forEach(function (r, k) { r.g.style.opacity = String(op[k]); r.lab.style.opacity = op[k] ? '1' : '0.35'; });
      st.thr.style.opacity = i === 4 || (st.M === 'light' && i === 3) ? '1' : '0';
      st.key = '';   // frame が段階の中の見た目を描き直す
    },
    frame: function (ctx, t) {
      var st = ctx.state, i = ctx.step, run = YT.motion.playing, ts = ctx.ts;
      var N = st.N, W = st.W;
      var cur = 0, sweep = 1, a = 0;
      if (i === 0) {
        cur = run ? Math.floor(U.mod(ts, st.units * st.unitDur) / st.unitDur) : 0;
      } else if (i === 1 || i === 2 || i === 4) {
        var q = U.seq(ts, [6, 1.6], true);
        sweep = run ? (q.i === 0 ? q.f : 1) : 1;
        cur = run ? Math.min(N - 1, Math.floor(sweep * N)) : 0;
      } else {
        var q4 = U.seq(ts, [3.2, 1.8], true);
        a = run ? (q4.i === 0 ? Math.exp(-q4.t / 0.7) : 0) : 0;   // ずれの残り（1 → 0）
      }
      var phi = 0.38 * a, th = 25 * a;
      var xc = X0 + sweep * (X1 - X0);
      // ---------- 毎フレーム（位置・波形） ----------
      st.cursor.style.opacity = run && (i === 1 || i === 2 || i === 4) && sweep < 1 ? '1' : '0';
      st.cursor.setAttribute('x1', xc.toFixed(1)); st.cursor.setAttribute('x2', xc.toFixed(1));
      st.txPath.setAttribute('d', st.tx(i === 1 ? xc : X1));
      st.rxDraw(i === 2 ? xc : X1, i === 3 ? th : 0);
      st.clk.setAttribute('d', clockPath(st, i === 3 ? phi : 0));
      // 拍の立ち上がりで測る点（段階4 はずれたまま動き、段階5 は中央で順に）
      st.dots.forEach(function (d, k) {
        var u = k + 0.5 + (i === 3 ? phi : 0), on = i === 3 ? u < N : i === 4 && (!run || X0 + (k + 0.5) * W <= xc);
        d.forEach(function (c, j) { c.style.opacity = on ? '1' : '0'; if (on) { c.setAttribute('cx', (X0 + u * W).toFixed(1)); c.setAttribute('cy', st.rxY(u, j, i === 3 ? th : 0).toFixed(1)); } });
      });
      if (st.M === 'light') { var ty = Y.d + (i === 3 ? 0.6 * a : 0) * 40; st.thrLine.setAttribute('y1', ty.toFixed(1)); st.thrLine.setAttribute('y2', ty.toFixed(1)); st.thrLab.setAttribute('y', (ty + 4).toFixed(1)); }
      if (i === 3) st.cdr(phi, th, a);
      // ---------- 区間が変わったときだけ（文字・色） ----------
      var done = 0;
      if (i === 4) for (var k = 0; k < N; k++) if (!run || X0 + (k + 0.5) * W <= xc) done = k + 1;
      var key = i + ':' + cur + ':' + done + ':' + (run ? 1 : 0);
      if (st.key === key) return;
      st.key = key;
      st.re.forEach(function (e, k) { e.style.opacity = i === 4 && k < done ? '1' : '0'; });
      st.rf.forEach(function (e) { e.style.opacity = i === 4 && done >= e.__need ? '1' : '0'; });
      var u0 = st.unitOf(cur);
      st.uhl.setAttribute('x', (X0 + u0[0] * W + 1).toFixed(1));
      st.uhl.setAttribute('width', (u0[1] * W - 2).toFixed(1));
      st.uhl.style.opacity = i === 0 ? '1' : '0';
      st.note.textContent = i === 4 && done >= N ? st.doneNote : '';
      st.show(i, cur, done, run);
    }
  });

  /* ---------- 媒体ごとの値（区間の数・シンボル・送る信号・受けた信号） ---------- */
  function model(st) {
    var M = st.M;
    if (M === 'pam5') {
      st.N = 6; st.units = 6; st.unitDur = 1.4;
      st.unitOf = function (k) { return [k, 1]; };
      st.lv = PAM.map(function (p) { return p[0] / 2; });   // 対1 の電圧（V）
      st.rx = function (u) { return smooth(st.lv, u, 0.2) + 0.045 * wob(u, 1.3); };
    } else if (M === 'light') {
      st.N = 20; st.units = 2; st.unitDur = 3.2;
      st.unitOf = function (k) { return k < 10 ? [0, 10] : [10, 10]; };
      st.lv = LBITS.map(function (b) { return b ? 1 : -1; });   // TIA の電圧（しきい値を 0 とした高・低）
      st.rx = function (u) { return smooth(st.lv, u, 0.26) + 0.09 * wob(u, 2.1); };
    } else {
      st.N = 12; st.units = 12; st.unitDur = 0.9;
      st.unitOf = function (k) { return [k, 1]; };
      st.rxIQ = function (u, th) {
        var i = smooth(QI, u, 0.22) + 0.22 * wob(u, 0.7), q = smooth(QQ, u, 0.22) + 0.22 * wob(u, 3.9);
        var r = th * Math.PI / 180;
        return [i * Math.cos(r) + q * Math.sin(r), -i * Math.sin(r) + q * Math.cos(r)];
      };
    }
    st.W = (X1 - X0) / st.N;
  }

  /* ---------- 共通の枠: 上の回路の並び（鎖）、左下の拡大の板、右下の時間の流れの枠 ---------- */
  function buildFrame(svg, st) {
    var M = st.M, mk = S.markers(svg);
    S.text(14, 24, '送る側', { cls: 't-sm t-b t-dim' }, svg);
    S.text(480, 24, '受ける側', { cls: 't-sm t-b t-dim' }, svg);
    S.text(946, 24, { pam5: '1000BASE-T：銅線 4 対・PAM-5・1 Gbps', light: 'GE-PON の上り：光・8B/10B・1.25 G ボー', qam: 'Wi-Fi：電波・16-QAM（1 本の搬送波の模式）' }[M], { cls: 't-sm t-b t-end' }, svg);
    var names = {
      pam5: [['写す', '1 バイト → 4 対の組'], ['送信回路', 'D/A 変換・逆向きに'], ['前段', '差・引き算・等化'], ['拍の再生', 'CDR'], ['判定', 'しきい値 4 本・表']],
      light: [['写す', '8B/10B'], ['送信回路', 'ドライバと LD'], ['前段', 'PD と TIA'], ['拍の再生', 'CDR・しきい値'], ['判定', 'しきい値・10B/8B']],
      qam: [['写す', '4 ビット → (I, Q)'], ['送信回路', 'DAC・× cos と sin'], ['前段', '× cos と sin・ADC'], ['区切りと位相', 'プリアンブル'], ['判定', '近い点 → 4 ビット']]
    }[M];
    st.blk = BLK.map(function (b, k) {
      var r = S.rect(b[0], 36, b[1], 60, { rx: 6, cls: 'f-sf s-rule w1' }, svg);
      S.text(b[0] + b[1] / 2, 61, names[k][0], { cls: 't-c t-sm t-b' }, svg);
      S.text(b[0] + b[1] / 2, 79, names[k][1], { cls: 't-c t-xs t-dim' }, svg);
      return { rect: r };
    });
    S.arrow(svg, 155, 66, 164, 66, 'd', { cls: 's-d w2' });
    S.arrow(svg, 621, 66, 630, 66, 'e', { cls: 's-e w2' });
    S.arrow(svg, 773, 66, 782, 66, 'e', { cls: 's-e w2' });
    // 媒体
    if (M === 'pam5') {
      st.pairs = S.g({}, svg);
      [52, 60, 68, 76].forEach(function (y) { S.line(306, y, 476, y, { cls: 's-e w15' }, st.pairs); });
      S.text(393, 46, 'より対線 4 対', { cls: 't-c t-xs t-b t-e' }, svg);
      S.text(393, 92, '1 拍 8 ns', { cls: 't-c t-xs t-dim' }, svg);
    } else if (M === 'light') {
      S.line(306, 66, 476, 66, { cls: 's-p w4' }, svg);
      S.text(393, 54, '光ファイバー（上り 1310 nm）', { cls: 't-c t-xs t-b t-p' }, svg);
      S.text(393, 86, '強い光 = 1、弱い光 = 0', { cls: 't-c t-xs t-dim' }, svg);
    } else {
      [318, 468].forEach(function (x) { S.line(x, 86, x, 50, { cls: 's-fg w2' }, svg); S.circle(x, 48, 3, { cls: 'f-fg' }, svg); });
      [0, 1, 2].forEach(function (k) { S.path('M' + (336 + k * 40) + ',52 q8,14 0,28', { cls: 'f-none s-r w2' }, svg); });
      S.text(393, 46, '電波', { cls: 't-c t-xs t-b t-r' }, svg);
      S.text(393, 96, 'I·cos ＋ Q·sin', { cls: 't-c t-xs t-dim t-mono' }, svg);
    }
    S.arrow(svg, 470, 66, 478, 66, M === 'light' ? 'p' : 'e', { cls: 's-' + (M === 'light' ? 'p' : 'e') + ' w2' });
    if (M === 'qam') S.arrow(svg, 306, 66, 314, 66, 'e', { cls: 's-e w2' });
    // 左下の板と右下の枠
    S.rect(14, 110, 318, 436, { rx: 8, cls: 'f-sf s-rule w1' }, svg);
    S.rect(344, 110, 602, 436, { rx: 8, cls: 'f-sf s-rule w1' }, svg);
    st.mk = mk;
  }

  /* ---------- 右下: 時間の流れ（バイト・シンボル・送る信号・受けた信号・拍・読んだシンボル・戻したビット） ---------- */
  function buildTime(svg, st) {
    var M = st.M, N = st.N, W = st.W;
    var xc = function (k) { return X0 + (k + 0.5) * W; };
    S.text(356, 132, { pam5: '6 バイト ＝ 対1 の 6 拍（1 拍 8 ns）', light: '先頭の 2 バイト ＝ 20 ビット（1 ビット 0.8 ns）', qam: '6 バイト ＝ 16-QAM の 12 シンボル' }[M], { cls: 't-sm t-b' }, svg);
    // いまの単位の印（段階1）。文字より先に描いて下に敷く
    st.uhl = S.rect(X0, 140, W, 64, { rx: 3, cls: 'f-x-soft', style: { opacity: 0 } }, svg);
    var labs = {
      pam5: [['バイト', '1 拍に 1 つ'], ['シンボル', '対1 の段階'], ['送る電圧', '対1 の差'], ['受けた電圧', '整えた後'], ['拍', ''], ['読んだ段階', ''], ['戻したバイト', '']],
      light: [['バイト', '符号の名前'], ['シンボル', '送る 10 ビット'], ['LD の光', ''], ['TIA の電圧', ''], ['拍', ''], ['読んだビット', ''], ['戻したバイト', '']],
      qam: [['ビット', '送る順'], ['シンボル', '(I, Q)'], ['電波', 'I·cos＋Q·sin'], ['I と Q', '取り出した値'], ['区切り', ''], ['近い点', ''], ['戻したビット', '']]
    }[M];
    var ly = [158, 192, 238, 320, 437, 469, 497];
    st.rows = labs.map(function (l, k) {
      var lab = S.g({ cls: 'fade' }, svg);
      S.text(354, ly[k], l[0], { cls: 't-xs t-b' }, lab);
      if (l[1]) S.text(354, ly[k] + 13, l[1], { cls: 't-xs t-dim' + (k === 2 && M === 'qam' ? ' t-mono' : '') }, lab);
      return { g: S.g({ cls: 'fade' }, svg), lab: lab };
    });
    var R = st.rows.map(function (r) { return r.g; });
    // 区切りの縦の点線（シンボルの境目）
    var grid = S.g({}, R[0]);
    for (var k = 0; k <= N; k++) if (M !== 'light' || k % 10 === 0) S.line(X0 + k * W, 142, X0 + k * W, 202, { cls: 's-rule w1 dash2' }, grid);
    // a: バイト・ビット
    if (M === 'pam5') {
      BYTES.forEach(function (b, k) { S.text(xc(k), Y.ah, hx(b), { cls: 't-c t-sm t-b t-mono t-d' }, R[0]); S.text(xc(k), Y.ab, bin(b, false).replace(/(....)(....)/, '$1 $2'), { cls: 't-c t-xs t-mono t-d' }, R[0]); });
      PAM.forEach(function (p, k) { S.text(xc(k), Y.b, sgn(p[0] / 2) + ' V', { cls: 't-c t-sm t-mono t-b' }, R[1]); });
    } else if (M === 'light') {
      B10.forEach(function (c, j) {
        S.text(X0 + (j * 10 + 5) * W, Y.ah, hx(c.b) + ' → ' + c.name, { cls: 't-c t-sm t-b t-mono t-d' }, R[0]);
        'abcdeifghj'.split('').forEach(function (ch, m) { S.text(xc(j * 10 + m), Y.ab, ch, { cls: 't-c t-xs t-mono t-dim' }, R[0]); });
      });
      LBITS.forEach(function (b, k) { S.text(xc(k), Y.b, String(b), { cls: 't-c t-sm t-mono t-b t-d' }, R[1]); });
      [6, 16].forEach(function (k) { S.line(X0 + k * W, 182, X0 + k * W, 198, { cls: 's-rule w1' }, R[1]); });
    } else {
      BYTES.forEach(function (b, j) { S.text(X0 + (j * 2 + 1) * W, Y.ah, hx(b), { cls: 't-c t-sm t-b t-mono t-d' }, R[0]); });
      QB.forEach(function (s, k) { S.text(xc(k), Y.ab, s, { cls: 't-c t-xs t-mono t-d' }, R[0]); S.text(xc(k), Y.b, sgn(QI[k]).replace('+', '') + ',' + sgn(QQ[k]).replace('+', ''), { cls: 't-c t-xs t-mono t-b' }, R[1]); });
    }
    // c: 送る信号
    if (M === 'pam5') {
      [-1, 1].forEach(function (v) { S.text(466, Y.c - v * 26 + 4, sgn(v), { cls: 't-xs t-mono t-dim t-end' }, R[2]); });
      S.line(X0, Y.c, X1, Y.c, { cls: 's-soft w1' }, R[2]);
      st.tx = function (xe) { return stairs(st.lv.map(function (v) { return Y.c - v * 26; }), xe); };
    } else if (M === 'light') {
      S.line(X0, Y.c + 26, X1, Y.c + 26, { cls: 's-rule w1 dash2' }, R[2]);
      S.text(466, Y.c - 18, '強', { cls: 't-xs t-dim t-end' }, R[2]);
      S.text(466, Y.c + 14, '弱', { cls: 't-xs t-dim t-end' }, R[2]);
      S.text(466, Y.c + 30, '消灯', { cls: 't-xs t-dim t-end' }, R[2]);
      st.tx = function (xe) { return stairs(LBITS.map(function (b) { return b ? Y.c - 22 : Y.c + 10; }), xe); };
    } else {
      S.line(X0, Y.c, X1, Y.c, { cls: 's-soft w1' }, R[2]);
      st.tx = function (xe) {
        var d = '';
        for (var x = X0; x <= xe + 0.01; x += 1) {
          var u = (x - X0) / W, k = Math.min(N - 1, Math.floor(u)), s = QI[k] * Math.cos(2 * Math.PI * 3 * u) + QQ[k] * Math.sin(2 * Math.PI * 3 * u);
          d += (x === X0 ? 'M' : 'L') + x + ',' + (Y.c - s * 6.2).toFixed(1);
        }
        return d;
      };
    }
    st.txPath = S.path('', { cls: 'f-none round ' + (M === 'light' ? 's-p w2' : M === 'qam' ? 's-r w15' : 's-e w2') }, R[2]);
    // d: 受けた信号（しきい値は段階5、光は段階4 から）
    st.thr = S.g({ cls: 'fade' }, R[3]);
    if (M === 'pam5') {
      [-1, -0.5, 0, 0.5, 1].forEach(function (v) { S.text(466, Y.d - v * 56 + 4, sgn(v), { cls: 't-xs t-mono t-dim t-end' }, R[3]); });
      [-0.75, -0.25, 0.25, 0.75].forEach(function (v) { S.line(X0, Y.d - v * 56, X1, Y.d - v * 56, { cls: 's-x w1 dash' }, st.thr); });
      S.text(X1, Y.d - 56 - 10, 'しきい値 4 本（点線）', { cls: 't-xs t-x t-b t-end' }, st.thr);
      st.rxY = function (u) { return Y.d - st.rx(u) * 56; };
    } else if (M === 'light') {
      S.text(466, Y.d - 36, '高', { cls: 't-xs t-dim t-end' }, R[3]);
      S.text(466, Y.d + 44, '低', { cls: 't-xs t-dim t-end' }, R[3]);
      st.thrLine = S.line(X0, Y.d, X1, Y.d, { cls: 's-x w15 dash' }, st.thr);
      st.thrLab = S.text(466, Y.d + 4, 'しきい値', { cls: 't-xs t-x t-b t-end' }, st.thr);
      st.rxY = function (u) { return Y.d - st.rx(u) * 40; };
    } else {
      [['I', Y.dI], ['Q', Y.dQ]].forEach(function (r) {
        S.text(466, r[1] + 4, r[0], { cls: 't-sm t-b t-mono t-end' }, R[3]);
        S.line(X0, r[1], X1, r[1], { cls: 's-soft w1' }, R[3]);
        [-2, 0, 2].forEach(function (v) { S.line(X0, r[1] - v * 7.5, X1, r[1] - v * 7.5, { cls: 's-x w1 dash' }, st.thr); });
      });
      S.text(X1, Y.dI - 37, 'しきい値 −2・0・+2（点線）', { cls: 't-xs t-x t-b t-end' }, st.thr);
      st.rxY = function (u, j, th) { return (j ? Y.dQ : Y.dI) - st.rxIQ(u, th)[j] * 7.5; };
    }
    if (M === 'qam') {
      st.rxP = [S.path('', { cls: 'f-none s-e w15 round' }, R[3]), S.path('', { cls: 'f-none s-e w15 round dash' }, R[3])];
      st.rxDraw = function (xe, th) {
        [0, 1].forEach(function (j) {
          var d = '';
          for (var x = X0; x <= xe + 0.01; x += 2) d += (x === X0 ? 'M' : 'L') + x + ',' + st.rxY((x - X0) / W, j, th).toFixed(1);
          st.rxP[j].setAttribute('d', d);
        });
      };
    } else {
      st.rxP = [S.path('', { cls: 'f-none s-e w2 round' }, R[3])];
      st.rxDraw = function (xe) {
        var d = '';
        for (var x = X0; x <= xe + 0.01; x += 2) d += (x === X0 ? 'M' : 'L') + x + ',' + st.rxY((x - X0) / W).toFixed(1);
        st.rxP[0].setAttribute('d', d);
      };
    }
    // 拍（拍の立ち上がりで測る）
    st.clk = S.path('', { cls: 'f-none s-e w15' }, R[4]);
    // 測る点（拍の立ち上がりの時刻の、受けた信号の上）
    st.dots = [];
    for (var j = 0; j < N; j++) st.dots.push((M === 'qam' ? [0, 1] : [0]).map(function () { return S.circle(0, 0, 3.6, { cls: 'f-x', style: { opacity: 0 } }, svg); }));
    // e: 読んだシンボル、f: 戻したビット
    st.re = []; st.rf = [];
    for (var k2 = 0; k2 < N; k2++) {
      var lab = M === 'pam5' ? sgn(near5(st.rx(k2 + 0.5))) : M === 'light' ? (st.rx(k2 + 0.5) > 0 ? '1' : '0') : (function (v) { return sgn(near(v[0])).replace('+', '') + ',' + sgn(near(v[1])).replace('+', ''); })(st.rxIQ(k2 + 0.5, 0));
      st.re.push(S.text(xc(k2), Y.e, lab, { cls: 't-c ' + (M === 'light' ? 't-sm' : 't-xs') + ' t-mono t-b', style: { opacity: 0 } }, R[5]));
    }
    var rf = function (x, s, need) { var e = S.text(x, Y.f, s, { cls: 't-c t-sm t-mono t-b t-d', style: { opacity: 0 } }, R[6]); e.__need = need; st.rf.push(e); };
    if (M === 'pam5') BYTES.forEach(function (b, k) { rf(xc(k), hx(b), k + 1); });
    else if (M === 'light') B10.forEach(function (c, j) { rf(X0 + (j * 10 + 5) * W, c.six + ' ' + c.four + ' → ' + hx(c.b), j * 10 + 10); });
    else QB.forEach(function (s, k) { var v = st.rxIQ(k + 0.5, 0); rf(xc(k), grayOf(near(v[0])) + grayOf(near(v[1])), k + 1); });
    st.note = S.text(356, Y.note, '', { cls: 't-sm t-b t-d' }, svg);
    st.doneNote = { pam5: '読んだ 02 11 22 33 44 01 は、送ったバイトと同じ', light: '読んだ 02 11 は、送ったバイトと同じ（先頭の 2 バイト）', qam: '読んだ 48 ビット（6 バイト）は、送ったビットと同じ' }[M];
    // 動く縦の線（送る・届く・読む位置）
    st.cursor = S.line(X0, 140, X0, 506, { cls: 's-x w15 dash', style: { opacity: 0 } }, svg);
  }
  function near5(v) { return Math.max(-1, Math.min(1, Math.round(v * 2) / 2)); }
  /* 階段の道（区間ごとの y）。xe より右は描かない */
  function stairs(ys, xe) {
    var n = ys.length, W = (X1 - X0) / n, d = 'M' + X0 + ',' + ys[0].toFixed(1);
    for (var k = 0; k < n; k++) {
      var xa = X0 + k * W, xb = Math.min(xe, xa + W);
      if (xa > xe) break;
      if (k) d += 'V' + ys[k].toFixed(1);
      d += 'H' + xb.toFixed(1);
    }
    return d;
  }
  /* 拍の波形: 立ち上がりが区間の中央（＋ずれ phi 区間）に来る矩形波 */
  function clockPath(st, phi) {
    var W = st.W, d = '', prev = null;
    for (var x = X0; x <= X1; x += 1) {
      var hi = U.mod((x - X0) / W - 0.5 - phi, 1) < 0.5;
      var y = hi ? Y.k0 : Y.k1;
      if (prev === null) d = 'M' + x + ',' + y;
      else if (prev !== y) d += 'H' + x + 'V' + y;
      prev = y;
    }
    return d + 'H' + X1;
  }

  /* ---------- 左下の板: 拍の再生（CDR）。銅線と光で同じ形 ---------- */
  function buildCdr(g, st) {
    var mk = st.mk, M = st.M;
    S.text(26, 132, '拍の再生（CDR）', { cls: 't-sm t-b' }, g);
    S.text(26, 154, '届いた波形', { cls: 't-xs t-dim' }, g);
    S.path('M60,160 V172', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.rect(26, 176, 132, 44, { rx: 5, cls: 'f-in s-rule w1' }, g);
    S.text(92, 195, '位相比較', { cls: 't-c t-sm t-b' }, g);
    S.text(92, 211, M === 'light' ? '変化の時刻と拍を比べる' : '波形から拍のずれを測る', { cls: 't-c t-xs t-dim' }, g);
    S.path('M158,198 H184', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.rect(188, 176, 132, 44, { rx: 5, cls: 'f-in s-rule w1' }, g);
    S.text(254, 195, '発振器', { cls: 't-c t-sm t-b' }, g);
    S.text(254, 211, '拍を速め・遅らせる', { cls: 't-c t-xs t-dim' }, g);
    S.path('M254,220 V246 H92 V224', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.text(262, 240, '再生した拍', { cls: 't-xs t-e t-b' }, g);
    st.cdrA = S.text(26, 278, '', { cls: 't-sm t-b' }, g);
    st.cdrB = S.text(26, 298, '', { cls: 't-xs' }, g);
    var notes = M === 'light'
      ? ['GE-PON の規格では、受信回路が整うまでと、', '拍が合うまでが、それぞれ 400 ns 以内。']
      : ['4 対の受信は同じ拍を使い、', '対ごとの遅れの違いに合わせて、', '測る時刻を対ごとにずらせる。'];
    S.lines(26, 336, notes, { cls: 't-xs t-dim' }, g, 17);
    st.cdr = function (phi, th, a) {
      st.cdrA.textContent = a > 0.02 ? 'ずれ ' + phi.toFixed(2) + ' 拍：測る時刻が遅れている' : 'ずれ 0：拍がシンボルの真ん中に来た';
      st.cdrB.textContent = a > 0.02 ? (M === 'light' ? '→ 発振器を少し速め、しきい値も中間へ動かす' : '→ 発振器を少し速める') : '→ 拍の立ち上がり（シンボルの真ん中）で電圧を測る';
    };
  }

  /* ---------- 左下の板: 1000BASE-T ---------- */
  function buildPam5(svg, st) {
    var mk = st.mk, D = st.dp = [], g;
    var cols = [56, 124, 174, 224, 274];
    // 段階1: 写す
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, '1 バイト → 4 対の段階の組（例）', { cls: 't-sm t-b' }, g);
    S.lines(26, 154, ['8 ビット（1 拍に 1 バイト）', '→ スクランブル（疑似乱数と XOR）', '→ トレリス符号の 1 ビットを足して 9 ビット', '→ 規格の表で 4 対の段階の組へ'], { cls: 't-xs' }, g, 16);
    st.p5row = S.rect(26, 0, 294, 22, { rx: 3, cls: 'f-x-soft' }, g);
    ['バイト', '対1', '対2', '対3', '対4'].forEach(function (h, k) { S.text(cols[k], 232, h, { cls: 't-c t-xs t-b t-dim' }, g); });
    S.line(26, 238, 320, 238, { cls: 's-rule w1' }, g);
    PAM.forEach(function (p, r) {
      var y = 256 + r * 22;
      S.text(cols[0], y, hx(BYTES[r]), { cls: 't-c t-sm t-b t-mono t-d' }, g);
      p.forEach(function (q, c) { S.text(cols[c + 1], y, sgn(q / 2), { cls: 't-c t-sm t-mono' }, g); });
    });
    S.text(320, 392, '単位 V', { cls: 't-xs t-dim t-end' }, g);
    S.lines(26, 414, ['625 − 512 ＝ 113 通りは、制御のシンボル', '（フレームの始まり・終わりの印など）に使う。'], { cls: 't-xs t-dim' }, g, 16);
    // 段階2: 送信回路
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, '対1 の送信回路（ラインドライバ）', { cls: 't-sm t-b' }, g);
    S.text(26, 154, 'PCS から：段階の値', { cls: 't-xs t-dim' }, g);
    st.p5in = S.text(26, 174, '', { cls: 't-md t-b' }, g);
    S.path('M60,180 V194', { cls: 'f-none s-d w15', 'marker-end': mk('d') }, g);
    S.rect(26, 198, 110, 50, { rx: 5, cls: 'f-in s-rule w1' }, g);
    S.text(81, 219, 'D/A 変換', { cls: 't-c t-sm t-b' }, g);
    S.text(81, 236, '数値 → 電圧', { cls: 't-c t-xs t-dim' }, g);
    S.line(136, 210, 316, 210, { cls: 's-e w2' }, g);
    S.line(136, 236, 316, 236, { cls: 's-e w2' }, g);
    st.p5a = S.text(146, 203, '', { cls: 't-xs t-e t-b' }, g);
    st.p5b = S.text(146, 252, '', { cls: 't-xs t-e t-b' }, g);
    S.text(316, 227, '→ 対1', { cls: 't-xs t-dim t-end' }, g);
    st.p5d = S.text(146, 274, '', { cls: 't-sm t-b' }, g);
    S.text(26, 302, 'A 線と B 線（6 拍、中点から）', { cls: 't-xs t-dim' }, g);
    st.p5hl = S.rect(60, 310, 42, 76, { rx: 3, cls: 'f-x-soft' }, g);
    S.text(48, 334, 'A', { cls: 't-xs t-b t-mono t-end' }, g);
    S.text(48, 370, 'B', { cls: 't-xs t-b t-mono t-end' }, g);
    var ya = PAM.map(function (p) { return 330 - p[0] / 4 * 24; }), yb = PAM.map(function (p) { return 366 + p[0] / 4 * 24; });
    S.path(miniStairs(ya, 60, 42), { cls: 'f-none s-e w2' }, g);
    S.path(miniStairs(yb, 60, 42), { cls: 'f-none s-e w2', style: { opacity: 0.55 } }, g);
    S.lines(26, 414, ['実物は前のシンボルの 1/4 を混ぜる整形（部分応答）', 'もかけ、線の電圧は 1/8 V 刻みの 17 通りになる', '（図では省いた）。'], { cls: 't-xs t-dim' }, g, 16);
    // 段階3: 受信の前段（アナログのハイブリッドでエコーを減らしてから ADC へ。KSZ9031RNX §3.2.1・§3.2.5）
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, '対1 の受信回路', { cls: 't-sm t-b' }, g);
    [['線の電圧', '相手 ＋ 自分の送信 ＋ 3 対の漏れ'], ['ハイブリッド', '2 本の差を取り、エコーを減らす'], ['ADC', '電圧を 8 ns ごとに数値にする'], ['引き算', '残りのエコーと 3 対の漏れを除く'], ['等化', '100 m で弱まり、なまった形を戻す'], ['整った電圧', '→ 拍の再生と判定へ']].forEach(function (r, k) {
      var y = 146 + k * 44;
      S.rect(26, y, 294, 30, { rx: 5, cls: k === 5 ? 'f-e-soft s-e w1' : 'f-in s-rule w1' }, g);
      S.text(36, y + 20, r[0], { cls: 't-sm t-b' }, g);
      S.text(118, y + 20, r[1], { cls: 't-xs t-dim' }, g);
      if (k < 5) S.path('M50,' + (y + 31) + ' V' + (y + 42), { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    });
    S.lines(26, 422, ['ADC より後は数値の計算（DSP）で行う。', '自分の送信を引く考えは第13章 場面2 段階4 と同じ。'], { cls: 't-xs t-dim' }, g, 16);
    // 段階4: 拍の再生
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    buildCdr(g, st);
    // 段階5: 判定
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, 'しきい値 4 本で段階を決める（対1）', { cls: 't-sm t-b' }, g);
    st.p5v = S.text(26, 156, '', { cls: 't-sm t-b' }, g);
    S.text(40, 178, 'しきい値', { cls: 't-xs t-dim' }, g);
    S.text(200, 178, '上回ったか', { cls: 't-c t-xs t-dim' }, g);
    st.p5cmp = [0.75, 0.25, -0.25, -0.75].map(function (v, k) {
      var y = 198 + k * 26;
      S.text(40, y + 4, sgn(v) + ' V', { cls: 't-sm t-mono t-x' }, g);
      return YT.zoom.bit(g, 200, y, 26, 20, 12);
    });
    st.p5cnt = S.text(26, 316, '', { cls: 't-sm t-b' }, g);
    S.text(26, 342, '4 対の組（同じ拍）', { cls: 't-xs t-dim' }, g);
    st.p5grp = S.text(26, 360, '', { cls: 't-sm t-mono t-b' }, g);
    S.lines(26, 382, ['→ 表を逆に引いて 9 ビット', '→ スクランブルを解いて 8 ビット'], { cls: 't-xs' }, g, 16);
    st.p5byte = S.text(26, 424, '', { cls: 't-md t-b t-mono t-d' }, g);
    st.show = function (i, cur, done, run) {
      var k = i === 4 ? (run && done ? done - 1 : 0) : cur;
      var L = PAM[k][0] / 2;
      st.p5row.setAttribute('y', 256 + k * 22 - 15);
      st.p5in.textContent = sgn(L) + ' V（' + hx(BYTES[k]) + ' の対1）';
      st.p5a.textContent = 'A 線 ' + sgn(L / 2) + ' V';
      st.p5b.textContent = 'B 線 ' + sgn(-L / 2) + ' V';
      st.p5d.textContent = '差 A − B ＝ ' + sgn(L) + ' V';
      st.p5hl.setAttribute('x', 60 + k * 42);
      var v = st.rx(k + 0.5), n = 0;
      st.p5v.textContent = 'シンボルの真ん中の電圧：' + sgn(Math.round(v * 100) / 100) + ' V（' + hx(BYTES[k]) + '）';
      st.p5cmp.forEach(function (b, j) { var on = v > [0.75, 0.25, -0.25, -0.75][j] ? 1 : 0; n += on; b.set(on); });
      st.p5cnt.textContent = '上回った本数 ' + n + ' → ' + sgn(-1 + n / 2) + ' V';
      st.p5grp.textContent = '(' + PAM[k].map(function (q) { return sgn(q / 2); }).join(', ') + ')';
      st.p5byte.textContent = '＝ ' + hx(BYTES[k]) + '（' + bin(BYTES[k], false).replace(/(....)(....)/, '$1 $2') + '）';
    };
  }
  function miniStairs(ys, x0, w) {
    var d = 'M' + x0 + ',' + ys[0];
    ys.forEach(function (y, k) { if (k) d += 'V' + y; d += 'H' + (x0 + (k + 1) * w); });
    return d;
  }

  /* ---------- 左下の板: GE-PON の上り（光） ---------- */
  function buildLight(svg, st) {
    var mk = st.mk, D = st.dp = [], g;
    // 段階1: 8B/10B
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, '8B/10B：1 バイト → 10 ビット', { cls: 't-sm t-b' }, g);
    st.l1a = S.text(26, 158, '', { cls: 't-md t-b t-mono t-d' }, g);
    S.text(26, 178, '上位 3 ビット HGF と下位 5 ビット EDCBA に分ける', { cls: 't-xs' }, g);
    S.rect(26, 190, 142, 76, { rx: 5, cls: 'f-in s-rule w1' }, g);
    S.rect(178, 190, 142, 76, { rx: 5, cls: 'f-in s-rule w1' }, g);
    S.text(36, 208, '5 → 6 ビット', { cls: 't-xs t-b' }, g);
    S.text(188, 208, '3 → 4 ビット', { cls: 't-xs t-b' }, g);
    st.l1x = S.text(36, 232, '', { cls: 't-sm t-mono t-b' }, g);
    st.l1y = S.text(188, 232, '', { cls: 't-sm t-mono t-b' }, g);
    st.l1xs = S.text(36, 254, '', { cls: 't-xs t-dim' }, g);
    st.l1ys = S.text(188, 254, '', { cls: 't-xs t-dim' }, g);
    st.l1r = S.text(26, 292, '', { cls: 't-sm t-b t-d' }, g);
    st.l1d = S.text(26, 320, '', { cls: 't-xs t-b' }, g);
    st.l1d2 = S.text(26, 336, '', { cls: 't-xs t-b' }, g);
    S.lines(26, 368, ['a ビット（下位の A から作るビット）から順に送る。', '1 Gbps × 10/8 ＝ 1.25 G ボー。', '図は直前の RD が − のとき。'], { cls: 't-xs t-dim' }, g, 16);
    // 段階2: LD ドライバ（バイアスは左、差動対の Q1 は LD 側、Q2 は脇の道）
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, 'LD ドライバ（直接変調）', { cls: 't-sm t-b' }, g);
    st.l2p1 = S.path('M130,158 V286 V300 H185 V352', { cls: 'f-none s-e w6 round', style: { opacity: 0.25 } }, g);
    st.l2p0 = S.path('M240,158 V286 V300 H185 V352', { cls: 'f-none s-e w6 round', style: { opacity: 0.25 } }, g);
    S.path('M130,158 V236 H34 V352', { cls: 'f-none s-e w3 round', style: { opacity: 0.25 } }, g);
    S.line(26, 158, 300, 158, { cls: 's-fg w2' }, g);
    S.text(300, 152, '電源', { cls: 't-xs t-dim t-end' }, g);
    S.line(26, 352, 300, 352, { cls: 's-fg w2' }, g);
    S.text(300, 368, '0 V', { cls: 't-xs t-dim t-end' }, g);
    // LD（ダイオード）
    st.ld = S.g({}, g);
    S.line(130, 158, 130, 178, { cls: 's-fg w15' }, st.ld);
    S.polygon([[118, 178], [142, 178], [130, 198]], { cls: 'f-sf s-fg w15' }, st.ld);
    S.line(118, 198, 142, 198, { cls: 's-fg w2' }, st.ld);
    S.line(130, 198, 130, 236, { cls: 's-fg w15' }, st.ld);
    S.text(150, 176, 'LD', { cls: 't-sm t-b' }, g);
    st.l2light = S.g({}, g);
    [[148, 192, 186, 184], [148, 204, 186, 196]].forEach(function (p) { S.path('M' + p[0] + ',' + p[1] + ' L' + p[2] + ',' + p[3], { cls: 'f-none s-p w2', 'marker-end': mk('p') }, st.l2light); });
    S.text(192, 196, '光', { cls: 't-xs t-p t-b' }, st.l2light);
    S.circle(130, 236, 3, { cls: 'f-fg' }, g);
    // バイアス電流（いつも流す）
    S.line(130, 236, 34, 236, { cls: 's-fg w15' }, g);
    S.line(34, 236, 34, 262, { cls: 's-fg w15' }, g);
    S.circle(34, 276, 14, { cls: 'f-sf s-fg w15' }, g);
    S.path('M34,268 V284', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.line(34, 290, 34, 352, { cls: 's-fg w15' }, g);
    S.text(56, 300, 'バイアス', { cls: 't-xs t-b' }, g);
    S.text(56, 314, '（いつも）', { cls: 't-xs t-dim' }, g);
    // 差動対
    var fet = function (x, side) {
      var t = S.g({}, g);
      S.line(x, 246, x, 278, { cls: 's-fg w3' }, t);
      S.line(x + side * 8, 250, x + side * 8, 274, { cls: 's-fg w2' }, t);
      S.line(x + side * 8, 262, x + side * 30, 262, { cls: 's-fg w15' }, t);
      return t;
    };
    S.line(130, 236, 130, 246, { cls: 's-fg w15' }, g);
    S.line(240, 158, 240, 246, { cls: 's-fg w15' }, g);
    st.q1 = fet(130, -1);
    st.q2 = fet(240, 1);
    S.path('M130,278 V300 H240 V278', { cls: 'f-none s-fg w15' }, g);
    S.line(185, 300, 185, 312, { cls: 's-fg w15' }, g);
    S.circle(185, 326, 14, { cls: 'f-sf s-fg w15' }, g);
    S.path('M185,318 V334', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.line(185, 340, 185, 352, { cls: 's-fg w15' }, g);
    S.text(206, 330, '変調電流', { cls: 't-xs t-b' }, g);
    st.l2g1 = S.text(56, 258, '', { cls: 't-xs t-b t-mono' }, g);
    st.l2g2 = S.text(274, 258, '', { cls: 't-xs t-b t-mono' }, g);
    S.text(56, 272, 'データ', { cls: 't-xs t-dim' }, g);
    S.text(274, 272, '反転', { cls: 't-xs t-dim' }, g);
    S.text(252, 196, '脇の道', { cls: 't-xs t-dim' }, g);
    st.l2r1 = S.text(26, 392, '1：バイアス ＋ 変調 → 強い光', { cls: 't-sm' }, g);
    st.l2r0 = S.text(26, 412, '0：バイアスだけ → 弱い光（しきい値より上）', { cls: 't-sm' }, g);
    S.text(26, 444, '上り 1310 nm の LD は ONU の中にある。', { cls: 't-xs t-dim' }, g);
    // 段階3: PD と TIA
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, 'PD と TIA（局舎の OLT）', { cls: 't-sm t-b' }, g);
    st.l3light = S.g({}, g);
    [[28, 198, 66, 210], [28, 214, 66, 226]].forEach(function (p) { S.path('M' + p[0] + ',' + p[1] + ' L' + p[2] + ',' + p[3], { cls: 'f-none s-p w2', 'marker-end': mk('p') }, st.l3light); });
    S.text(28, 190, '光', { cls: 't-xs t-p t-b' }, st.l3light);
    // PD は陽極（上）を負の電圧に、陰極（下）を TIA の入力につなぐ（逆向きの電圧）。光の電流は入力から PD へ流れ出るので、
    // TIA の出力は ＋電流 × R になり、強い光ほど高い電圧になる
    S.text(92, 156, '逆向きの電圧（負）', { cls: 't-xs t-dim' }, g);
    st.pd = S.g({}, g);
    S.line(82, 162, 82, 206, { cls: 's-fg w15' }, st.pd);
    S.polygon([[70, 206], [94, 206], [82, 226]], { cls: 'f-sf s-fg w15' }, st.pd);
    S.line(70, 226, 94, 226, { cls: 's-fg w2' }, st.pd);
    S.line(82, 226, 82, 260, { cls: 's-fg w15' }, st.pd);
    S.text(102, 222, 'PD', { cls: 't-sm t-b' }, g);
    S.path('M82,260 H138', { cls: 'f-none s-e w2' }, g);
    S.path('M124,270 H98', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.text(96, 286, '電流', { cls: 't-xs t-e' }, g);
    st.tia = S.g({}, g);
    S.polygon([[150, 232], [150, 288], [210, 260]], { cls: 'f-sf s-fg w15' }, st.tia);
    S.text(156, 254, '−', { cls: 't-xs t-b' }, st.tia);
    S.text(164, 270, 'TIA', { cls: 't-xs t-b' }, st.tia);
    S.path('M138,260 H150', { cls: 'f-none s-fg w15' }, g);
    S.path('M138,260 V214 H166', { cls: 'f-none s-fg w15' }, g);
    S.rect(166, 206, 36, 16, { rx: 2, cls: 'f-sf s-fg w15' }, g);
    S.text(184, 218, 'R', { cls: 't-c t-xs t-b t-mono' }, g);
    S.path('M202,214 H226 V260', { cls: 'f-none s-fg w15' }, g);
    S.path('M210,260 H306', { cls: 'f-none s-e w2', 'marker-end': mk('e') }, g);
    S.text(306, 252, '電圧', { cls: 't-xs t-e t-end' }, g);
    S.text(184, 200, '帰還抵抗', { cls: 't-c t-xs t-dim' }, g);
    st.l3a = S.text(26, 330, '', { cls: 't-sm t-b' }, g);
    S.text(26, 354, '電圧 ＝ 電流 × 帰還抵抗 R', { cls: 't-sm' }, g);
    S.text(26, 384, 'TIA の後で振幅をそろえ、拍の再生と判定へ。', { cls: 't-xs t-dim' }, g);
    // 段階4: 拍の再生
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    buildCdr(g, st);
    // 段階5: 判定と 10B/8B
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, 'しきい値で 1 と 0 → 8 ビット', { cls: 't-sm t-b' }, g);
    S.text(26, 156, '比較器が電圧としきい値を比べ、拍の立ち上がりで取り込む', { cls: 't-xs' }, g);
    S.polygon([[40, 170], [40, 214], [84, 192]], { cls: 'f-sf s-fg w15' }, g);
    S.text(46, 186, '+', { cls: 't-xs t-b' }, g);
    S.text(46, 206, '−', { cls: 't-xs t-b' }, g);
    S.path('M84,192 H118', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.rect(122, 172, 76, 40, { rx: 4, cls: 'f-in s-rule w1' }, g);
    S.text(160, 190, '取り込む', { cls: 't-c t-xs t-b' }, g);
    S.text(160, 204, '拍の立ち上がり', { cls: 't-c t-xs t-dim' }, g);
    S.path('M198,192 H226', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    st.l5bit = YT.zoom.bit(g, 248, 192, 28, 22, 13);
    st.l5v = S.text(26, 240, '', { cls: 't-sm t-b' }, g);
    st.l5reg = [];
    for (var k = 0; k < 10; k++) st.l5reg.push(YT.zoom.bit(g, 38 + k * 28 + (k >= 6 ? 6 : 0), 266, 24, 20, 11));
    st.l5d1 = S.text(26, 304, '', { cls: 't-sm t-mono' }, g);
    st.l5d2 = S.text(26, 324, '', { cls: 't-sm t-mono' }, g);
    st.l5d3 = S.text(26, 350, '', { cls: 't-md t-b t-mono t-d' }, g);
    st.show = function (i, cur, done, run) {
      var k = i === 4 ? (run && done ? done - 1 : 0) : cur, by = i === 0 ? cur : (k < 10 ? 0 : 1), c = B10[by], bit = LBITS[k];
      st.l1a.textContent = hx(c.b) + ' ＝ ' + bin(c.b, false).replace(/(....)(....)/, '$1 $2');
      st.l1x.textContent = c.lo + ' → ' + c.six;
      st.l1y.textContent = c.hi + ' → ' + c.four;
      st.l1xs.textContent = c.name.split('.')[0] + '（直前の RD が −）';
      st.l1ys.textContent = '.' + c.name.split('.')[1] + '（直前の RD が ' + (by === 0 ? '+' : '−') + '）';
      st.l1r.textContent = '送る 10 ビット：' + c.six + ' ' + c.four;
      st.l1d.textContent = c.d[0];
      st.l1d2.textContent = c.d[1];
      st.l2p1.style.opacity = bit ? '0.55' : '0.12';
      st.l2p0.style.opacity = bit ? '0.12' : '0.55';
      st.l2light.style.opacity = bit ? '1' : '0.35';
      st.l2g1.textContent = 'ゲート ' + bit;
      st.l2g2.textContent = 'ゲート ' + (1 - bit);
      st.l2r1.setAttribute('class', 't-sm' + (bit ? ' t-b t-x' : ''));
      st.l2r0.setAttribute('class', 't-sm' + (bit ? '' : ' t-b t-x'));
      st.l3light.style.opacity = bit ? '1' : '0.35';
      st.l3a.textContent = bit ? '強い光 → 電流 大 → 電圧 高（1）' : '弱い光 → 電流 小 → 電圧 低（0）';
      var v = st.rx(k + 0.5);
      st.l5bit.set(v > 0 ? 1 : 0);
      st.l5v.textContent = 'シンボルの真ん中の電圧はしきい値より' + (v > 0 ? '上 → 1' : '下 → 0');
      var g0 = k < 10 ? 0 : 10, upto = i === 4 && run ? k - g0 : 9;
      st.l5reg.forEach(function (b, m) { b.set(m <= upto ? LBITS[g0 + m] : '?'); });
      var c5 = B10[g0 / 10], full = upto >= 9;
      st.l5d1.textContent = full ? c5.six + ' → ' + c5.name.split('.')[0] + '（RD − の列）' : '';
      st.l5d2.textContent = full ? c5.four + ' → .' + c5.name.split('.')[1] + '（RD ' + (g0 ? '−' : '+') + ' の列）' : '';
      st.l5d3.textContent = full ? '→ ' + c5.name + ' ＝ ' + hx(c5.b) : '';
    };
  }

  /* ---------- 左下の板: Wi-Fi（16-QAM と I/Q） ---------- */
  function buildQam(svg, st) {
    var mk = st.mk, D = st.dp = [], g;
    var CX = 176, CY = 336, UQ = 28;   // 回した角の点（半径 4.24）も枠（±120）に収まる
    var px = function (i) { return CX + i * UQ; }, py = function (q) { return CY - q * UQ; };
    // 星座図（段階1・4・5 で共用）
    var qc = st.qc = S.g({ cls: 'fade hide' }, svg);
    S.rect(56, 216, 240, 240, { rx: 4, cls: 'f-in s-rule w1' }, qc);
    S.line(60, CY, 292, CY, { cls: 's-rule w1' }, qc);
    S.line(CX, 220, CX, 452, { cls: 's-rule w1' }, qc);
    S.text(290, CY - 6, 'I', { cls: 't-xs t-b t-mono t-end' }, qc);
    S.text(CX + 6, 230, 'Q', { cls: 't-xs t-b t-mono' }, qc);
    [-3, -1, 1, 3].forEach(function (v) {
      S.text(px(v), 472, grayOf(v), { cls: 't-c t-xs t-mono t-d' }, qc);
      S.text(px(v), 486, sgn(v), { cls: 't-c t-xs t-mono t-dim' }, qc);
      S.text(48, py(v) + 4, grayOf(v), { cls: 't-xs t-mono t-d t-end' }, qc);
      S.text(300, py(v) + 4, sgn(v), { cls: 't-xs t-mono t-dim' }, qc);
      [-3, -1, 1, 3].forEach(function (w) { S.circle(px(v), py(w), 4, { cls: 'f-d' }, qc); });
    });
    S.text(CX, 504, '下: I の 2 ビットと値　左: Q の 2 ビット', { cls: 't-c t-xs t-dim' }, qc);
    st.qRing = S.circle(0, 0, 9, { cls: 'f-none s-x w2' }, qc);
    st.qBound = S.g({}, qc);
    [-2, 0, 2].forEach(function (v) { S.line(px(v), 220, px(v), 452, { cls: 's-x w1 dash' }, st.qBound); S.line(60, py(v), 292, py(v), { cls: 's-x w1 dash' }, st.qBound); });
    st.qRot = [];
    for (var k = 0; k < 12; k++) st.qRot.push(S.circle(0, 0, 3.2, { cls: 'f-x' }, qc));
    st.qPt = S.circle(0, 0, 4, { cls: 'f-x' }, qc);
    st.qTxt1 = S.text(26, 156, '', { cls: 't-xs t-b' }, qc);
    st.qTxt2 = S.text(26, 176, '', { cls: 't-xs' }, qc);
    st.qTxt3 = S.text(26, 196, '', { cls: 't-xs t-dim' }, qc);
    st.qTitle = S.text(26, 132, '', { cls: 't-sm t-b' }, qc);
    // 段階1・4・5 の板は星座図に重ねる（中身は show が書く）
    D.push(S.g({}, svg));
    // 段階2: I/Q 変調器
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, 'I/Q 変調器（送る側）', { cls: 't-sm t-b' }, g);
    st.q2i = S.text(26, 180, '', { cls: 't-sm t-b t-mono' }, g);
    st.q2q = S.text(26, 260, '', { cls: 't-sm t-b t-mono' }, g);
    st.dacI = S.rect(92, 162, 52, 28, { rx: 4, cls: 'f-in s-rule w1' }, g);
    S.rect(92, 242, 52, 28, { rx: 4, cls: 'f-in s-rule w1' }, g);
    S.text(118, 180, 'DAC', { cls: 't-c t-xs t-b' }, g);
    S.text(118, 260, 'DAC', { cls: 't-c t-xs t-b' }, g);
    S.path('M144,176 H172', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.path('M144,256 H172', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    [176, 256].forEach(function (y) { S.circle(186, y, 12, { cls: 'f-sf s-fg w15' }, g); S.text(186, y + 4, '×', { cls: 't-c t-sm t-b' }, g); });
    S.rect(156, 204, 60, 24, { rx: 4, cls: 'f-in s-rule w1' }, g);
    S.text(186, 220, '発振器', { cls: 't-c t-xs t-b' }, g);
    S.path('M186,204 V190', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.path('M186,228 V242', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.text(194, 199, 'cos', { cls: 't-xs t-mono t-dim' }, g);
    S.text(194, 240, 'sin', { cls: 't-xs t-mono t-dim' }, g);
    S.path('M198,176 H250 V204', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.path('M198,256 H250 V228', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.circle(250, 216, 12, { cls: 'f-sf s-fg w15' }, g);
    S.text(250, 220, '+', { cls: 't-c t-sm t-b' }, g);
    S.path('M262,216 H272', { cls: 'f-none s-e w15' }, g);
    S.polygon([[272, 204], [272, 228], [292, 216]], { cls: 'f-sf s-fg w15' }, g);
    st.antT = S.g({}, g);
    S.path('M292,216 H302 V176', { cls: 'f-none s-fg w15' }, st.antT);
    S.circle(302, 174, 3, { cls: 'f-fg' }, st.antT);
    S.path('M309,166 q6,8 0,16', { cls: 'f-none s-r w15' }, st.antT);
    S.text(282, 246, '増幅', { cls: 't-c t-xs t-dim' }, g);
    S.text(26, 300, 'いまのシンボルの波（I·cos ＋ Q·sin）', { cls: 't-xs t-dim' }, g);
    S.line(40, 352, 312, 352, { cls: 's-soft w1' }, g);
    st.q2w = S.path('', { cls: 'f-none s-e w2' }, g);
    st.q2w2 = S.text(312, 404, '', { cls: 't-xs t-mono t-end' }, g);
    // 段階3: I/Q 復調器
    g = S.g({ cls: 'fade hide' }, svg); D.push(g);
    S.text(26, 132, 'I/Q 復調器（受ける側）', { cls: 't-sm t-b' }, g);
    st.antR = S.g({}, g);
    S.path('M40,216 V172', { cls: 'f-none s-fg w15' }, st.antR);
    S.circle(40, 170, 3, { cls: 'f-fg' }, st.antR);
    S.path('M33,160 q-6,8 0,16', { cls: 'f-none s-r w15' }, st.antR);
    S.path('M40,216 H50', { cls: 'f-none s-e w15' }, g);
    S.polygon([[50, 204], [50, 228], [70, 216]], { cls: 'f-sf s-fg w15' }, g);
    S.path('M70,216 H84 V176 H110', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    S.path('M84,216 V256 H110', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
    [176, 256].forEach(function (y) { S.circle(124, y, 12, { cls: 'f-sf s-fg w15' }, g); S.text(124, y + 4, '×', { cls: 't-c t-sm t-b' }, g); });
    S.rect(98, 204, 52, 24, { rx: 4, cls: 'f-in s-rule w1' }, g);
    S.text(124, 220, '発振器', { cls: 't-c t-xs t-b' }, g);
    S.path('M124,204 V190', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.path('M124,228 V242', { cls: 'f-none s-fg w15', 'marker-end': mk('fg') }, g);
    S.text(132, 199, 'cos', { cls: 't-xs t-mono t-dim' }, g);
    S.text(132, 240, 'sin', { cls: 't-xs t-mono t-dim' }, g);
    [176, 256].forEach(function (y, j) {
      S.path('M136,' + y + ' H156', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
      S.rect(160, y - 12, 56, 24, { rx: 4, cls: 'f-in s-rule w1' }, g);
      S.text(188, y + 4, 'フィルタ', { cls: 't-c t-xs t-b' }, g);
      S.path('M216,' + y + ' H246', { cls: 'f-none s-e w15', 'marker-end': mk('e') }, g);
      S.text(231, y - 6, j ? 'Q/2' : 'I/2', { cls: 't-c t-xs t-mono t-e' }, g);
      var r = S.rect(250, y - 12, 44, 24, { rx: 4, cls: 'f-in s-rule w1' }, g);
      if (!j) st.adcI = r;
      S.text(272, y + 4, 'ADC', { cls: 't-c t-xs t-b' }, g);
    });
    S.lines(26, 300, ['(I·cos ＋ Q·sin)·cos ＝ I/2 ＋ 2 倍の周波数の波', '(I·cos ＋ Q·sin)·sin ＝ Q/2 ＋ 2 倍の周波数の波'], { cls: 't-xs t-mono' }, g, 18);
    S.text(26, 346, 'フィルタが 2 倍の周波数の波を除く。2 倍して I と Q へ。', { cls: 't-xs t-dim' }, g);
    st.q3a = S.text(26, 380, '', { cls: 't-sm t-b' }, g);
    st.q3b = S.text(26, 400, '', { cls: 't-xs t-dim' }, g);
    // 段階4・5 は星座図に重ねる
    D.push(S.g({}, svg));
    D.push(S.g({}, svg));
    st.cdr = function (phi, th, a) {
      var r = th * Math.PI / 180;
      st.qRot.forEach(function (c, k) {
        var v = st.rxIQ(k + 0.5, 0), x = v[0] * Math.cos(r) + v[1] * Math.sin(r), y = -v[0] * Math.sin(r) + v[1] * Math.cos(r);
        c.setAttribute('cx', px(x).toFixed(1)); c.setAttribute('cy', py(y).toFixed(1));
      });
      st.qTxt1.textContent = a > 0.02 ? '位相のずれ ' + Math.round(th) + '°：点が ' + Math.round(th) + '° 回っている' : '位相のずれ 0°：点が格子の上に戻った';
      st.qTxt2.textContent = a > 0.02 ? '区切りのずれ ' + phi.toFixed(2) + ' シンボル' : '区切りもシンボルの真ん中に合った';
    };
    st.show = function (i, cur, done, run) {
      var k = i === 4 ? (run && done ? done - 1 : 0) : cur, I = QI[k], Q = QQ[k];
      st.qTitle.textContent = ['16-QAM の星座図（グレイ符号）', '', '', '受け手の位相のずれ', 'いちばん近い点を選ぶ'][i];
      S.show(st.qRing, i !== 3);
      S.show(st.qBound, i === 4);
      S.show(st.qPt, i === 4);
      st.qRot.forEach(function (c) { S.show(c, i === 3); });
      st.qTxt3.textContent = '';
      if (i === 0) {
        st.qRing.setAttribute('cx', px(I)); st.qRing.setAttribute('cy', py(Q));
        st.qTxt1.textContent = QB[k] + ' → 前の ' + QB[k].slice(0, 2) + ' で I ＝ ' + sgn(I) + '、後の ' + QB[k].slice(2) + ' で Q ＝ ' + sgn(Q);
        st.qTxt2.textContent = '4 ビットは送る順（各バイトの下位ビットから）';
        st.qTxt3.textContent = '値は規格の表のまま（送るときは 1/√10 倍する）';
      } else if (i === 4) {
        var v = st.rxIQ(k + 0.5, 0), ni = near(v[0]), nq = near(v[1]);
        st.qPt.setAttribute('cx', px(v[0]).toFixed(1)); st.qPt.setAttribute('cy', py(v[1]).toFixed(1));
        st.qRing.setAttribute('cx', px(ni)); st.qRing.setAttribute('cy', py(nq));
        st.qTxt1.textContent = '受けた (' + sgn(Math.round(v[0] * 10) / 10) + ', ' + sgn(Math.round(v[1] * 10) / 10) + ') → 近い点 (' + sgn(ni) + ', ' + sgn(nq) + ') → ' + grayOf(ni) + grayOf(nq);
        st.qTxt2.textContent = '点線はしきい値（−2・0・+2）';
      }
      st.q2i.textContent = 'I ＝ ' + sgn(I);
      st.q2q.textContent = 'Q ＝ ' + sgn(Q);
      var d = '';
      for (var x = 40; x <= 312; x += 2) { var u = (x - 40) / 272 * 3; d += (x === 40 ? 'M' : 'L') + x + ',' + (352 - (I * Math.cos(2 * Math.PI * u) + Q * Math.sin(2 * Math.PI * u)) * 9).toFixed(1); }
      st.q2w.setAttribute('d', d);
      st.q2w2.textContent = '振幅 √(I² ＋ Q²) ＝ ' + Math.sqrt(I * I + Q * Q).toFixed(2);
      var w = st.rxIQ(k + 0.5, 0);
      st.q3a.textContent = 'I ＝ ' + sgn(Math.round(w[0] * 10) / 10) + '、Q ＝ ' + sgn(Math.round(w[1] * 10) / 10);
      st.q3b.textContent = '送ったのは (' + sgn(I) + ', ' + sgn(Q) + ')。雑音で少しずれる';
    };
  }
})();
