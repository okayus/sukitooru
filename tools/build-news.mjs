#!/usr/bin/env node
/* ============================================================
   ニュースのページを作る (tools/build-news.mjs)

   news/*.md（README.md を除く）を、場面に分けたページ news/<同じ名前>.html にし、
   一覧のページ news/index.html、月ごとのページ news/YYYY-MM.html、ノートのデータ news/news-data.js、
   news/README.md の一覧の表（印の行の間）を作り直す。
   ノートを足したり直したりしたら走らせる:  node tools/build-news.mjs
   news/ の .html と news-data.js はすべてこの道具が作る（手で置かない。元のノートが無い .html は消す）。
   ノートの書き方（どの見出しが場面になるか）は news/README.md。

   一覧のページは、層の地図（assets/news-graph.js が描く）、新着（新しい順の PER_SCENE 件）、月ごと（月のページへのリンク）、
   詳しいノート（日刊でないノート）、教材に無い（ノートが挙げた、教材に無い概念）。月のページにも、その月の層の地図を置く。
   日刊のノート（毎朝 1 件を自動で書くノート。行だけの印 <!-- kind: daily --> を持つ）は、新着と月のページに出る。

   ノートの層（assets/layers.js の id）は、章へのリンクと、要点の最初の文の「第N章」の層の和。中心の層は、
   行だけの印 <!-- tags: id, id --> の先頭。無ければ、要点の最初の文に出る章で最も多い層（同数は「層」の場面の表で多い方）、
   それも無ければ「層」の場面の表で最も多い層。教材に無い概念は <!-- missing: 名前、名前 --> に書く。
   近い場面は、その名前（「（」より前）と「教材に無い」を含む表の行・箇条書き・段落の、章の場面へのリンクから拾う。

   読める Markdown は、ノートで使う分だけ: 見出し（# ## ###）、段落、箇条書き（入れ子は 1 段）、
   表、`コード`、**太字**、[リンク](URL) と [リンク][参照]・参照の定義、> 引用、``` で囲んだコード。
   公開版の URL（https://okayus.github.io/youtube-ga-mieru-made/…）へのリンクは、ページから見た相対パスに直す。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = createRequire(import.meta.url)('../assets/layers.js');
const NEWS = path.join(ROOT, 'news');
const SITE = 'https://okayus.github.io/youtube-ga-mieru-made/';
const REPO = 'https://github.com/okayus/youtube-ga-mieru-made/blob/main/news/';
const PER_SCENE = 6;   // 一覧の 1 場面に並べるノートの数（1画面版で収まる数）
const PER_MONTHS = 24;   // 「月ごと」の 1 場面に並べる月の数（4 列 × 6 行）
const PER_MISSING = 24;   // 「教材に無い」の 1 場面に並べる概念の数（3 列 × 8 行）
const CANDIDATE = 3;   // この数のノートに出た「教材に無い」概念は、章の候補として印を付ける
const CARD_LAYERS = 5;   // 一覧のカードに出す層の札の数（ほかは「ほか N」）
const RE_DAILY = /^<!--\s*kind:\s*daily\s*-->\s*$/m;   // 日刊のノートの印（行だけの注釈。本文には出ない）
const RE_TAGS = /^<!--\s*tags:\s*([^>]*?)\s*-->\s*$/m;   // 層の指定。先頭が中心の層
const RE_MISSING = /^<!--\s*missing:\s*([^>]*?)\s*-->\s*$/m;   // 教材に無い概念（「、」で区切る）

/* ---------- 章の一覧（帯に使う） ---------- */
const PARTS = [['I', '電気'], ['II', '計算機'], ['III', 'ソフト'], ['IV', 'つながる'], ['V', '約束ごと'], ['VI', 'YouTube'], ['VII', '横断'], ['VIII', ''], ['IX', 'ブラウザ']];
const chapters = fs.readdirSync(path.join(ROOT, 'chapters')).filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f)).sort().map((file) => {
  const html = fs.readFileSync(path.join(ROOT, 'chapters', file), 'utf8');
  const title = (html.match(/<title>([^<]*)/) || [, ''])[1].replace(/\s*—.*$/, '').trim();
  const part = (/第([IVX]+)部/.exec((html.match(/eyebrow:\s*'([^']*)'/) || [, ''])[1]) || [, ''])[1];
  return { n: Number(file.slice(0, 2)), file, title, part };
});

/* ---------- Markdown ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = (s) => s.replace(/`([^`]+)`/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1');
/* 行をつなぐ。英数字どうしの間だけ空白を入れる（日本語の行は詰める） */
const joinLines = (ls) => ls.reduce((a, l) => (a && /[A-Za-z0-9.,)]$/.test(a) && /^[A-Za-z0-9(]/.test(l) ? a + ' ' + l : a + l), '');

/* リンク先を news/ のページから見た場所にする。ノートどうしのリンク（.md）は .html に */
function href(url) {
  if (url.startsWith(SITE)) return '../' + url.slice(SITE.length);
  if (!/^[a-z]+:/i.test(url) && !url.startsWith('#')) return url.replace(/\.md(?=#|$)/, '.html');
  return url;
}

function inline(s, refs) {
  const keep = [];
  const hold = (h) => '\u0000' + (keep.push(h) - 1) + '\u0000';
  const fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/`([^`]+)`/g, (_, c) => hold('<code>' + esc(c) + '</code>'));
  s = s.replace(/\[([^\]]+)\](?:\(([^)\s]+)\)|\[([^\]]*)\])/g, (m, text, url, ref) => {
    const u = url !== undefined ? url : refs.get((ref || text).toLowerCase());
    if (u === undefined) return m;
    const h = href(u);
    const attr = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : /(^|\/)chapters\/\d\d-/.test(h) ? ' class="nw-ch"' : '';
    return hold(`<a href="${esc(h)}"${attr}>${fmt(text)}</a>`);
  });
  s = fmt(s);
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
  return s;
}

/* 表の行をセルに分ける（`…` の中の | では分けない） */
function cells(row) {
  let s = row.trim().replace(/^\|/, '');
  if (/[^\\]\|$/.test(s)) s = s.slice(0, -1);
  const out = [];
  let cur = '', code = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (c === '`') code = !code;
    if (c === '|' && !code) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const RE_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const RE_START = /^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s|\s*\|)/;

function parse(src) {
  const refs = new Map();
  const lines = [];
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)\s*$/.exec(raw);
    if (m) refs.set(m[1].toLowerCase(), m[2]);
    else lines.push(raw);
  }
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if (/^\s*<!--/.test(l)) {   // 行だけの注釈は読み飛ばす
      while (i < lines.length && !/-->/.test(lines[i])) i++;
      i++;
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      const tab = /<!--\s*tab:\s*(.*?)\s*-->/.exec(m[2]);
      blocks.push({ t: 'h', level: m[1].length, text: m[2].replace(/<!--[\s\S]*?-->/g, '').trim(), tab: tab ? tab[1] : '' });
      i++;
    } else if (/^```/.test(l)) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      blocks.push({ t: 'code', text: body.join('\n') });
    } else if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      blocks.push({ t: 'table', head: rows[0], rows: rows.slice(2) });
    } else if (RE_ITEM.test(l)) {
      const items = [];
      for (; i < lines.length && lines[i].trim(); i++) {
        const mm = RE_ITEM.exec(lines[i]);
        const last = items[items.length - 1];
        if (mm && mm[1].length < 2) items.push({ text: mm[3], sub: [], subTag: 'ul' });
        else if (mm && last) { last.sub.push(mm[3]); last.subTag = /\d/.test(mm[2]) ? 'ol' : 'ul'; }
        else if (last) { if (last.sub.length) last.sub[last.sub.length - 1] = joinLines([last.sub[last.sub.length - 1], lines[i].trim()]); else last.text = joinLines([last.text, lines[i].trim()]); }
        else break;
      }
      blocks.push({ t: /\d/.test(RE_ITEM.exec(l)[2]) ? 'ol' : 'ul', items });
    } else if (/^>/.test(l)) {
      const body = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) body.push(lines[i].replace(/^>\s?/, '').trim());
      blocks.push({ t: 'quote', text: joinLines(body) });
    } else {
      const body = [];
      for (; i < lines.length && lines[i].trim() && !RE_START.test(lines[i]); i++) body.push(lines[i].trim());
      blocks.push({ t: 'p', text: joinLines(body) });
    }
  }
  return { blocks, refs };
}

function render(bs, refs) {
  return bs.map((b) => {
    if (b.t === 'p') return `<p>${inline(b.text, refs)}</p>`;
    if (b.t === 'ul' || b.t === 'ol') {
      return `<${b.t}>${b.items.map((it) => `<li>${inline(it.text, refs)}${it.sub.length ? `<${it.subTag}>${it.sub.map((x) => `<li>${inline(x, refs)}</li>`).join('')}</${it.subTag}>` : ''}</li>`).join('')}</${b.t}>`;
    }
    if (b.t === 'table') {
      const head = b.head.map((h) => `<th>${inline(h, refs)}</th>`).join('');
      const rows = b.rows.map((r) => `<tr>${r.map((c, k) => `<td data-label="${esc(plain(b.head[k] || ''))}">${inline(c, refs)}</td>`).join('')}</tr>`).join('\n');
      return `<div class="tbl-wrap"><table class="plain stack nw-tbl"><thead><tr>${head}</tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
    }
    if (b.t === 'quote') return `<blockquote>${inline(b.text, refs)}</blockquote>`;
    // 長い行は pre の中で横に送る（.nw-body pre の overflow-x: auto）。data-scroll-x は、verify.mjs がその中身を縦読み版のはみ出しに数えない印
    if (b.t === 'code') return `<pre data-scroll-x><code>${esc(b.text)}</code></pre>`;
    const lv = Math.min(6, b.level);   // 場面の中の #### 以下
    return `<h${lv}>${inline(b.text, refs)}</h${lv}>`;
  }).join('\n');
}

/* ---------- 層（assets/layers.js） ---------- */
const keyOf = (p) => (p.sc ? `${p.ch}-${p.sc}` : `${p.ch}`);
const byKey = (a, b) => { const [a1, a2 = 0] = a.split('-').map(Number), [b1, b2 = 0] = b.split('-').map(Number); return a1 - b1 || a2 - b2; };
const sceneName = (k) => { const [ch, sc] = k.split('-'); return `第${ch}章` + (sc ? ` 場面${sc}` : ''); };
const sceneHref = (k) => { const [ch, sc] = k.split('-').map(Number); const c = chapters.find((x) => x.n === ch); return c ? `../chapters/${c.file}${sc ? '#s' + sc : ''}` : ''; };
const layerName = (id) => L.byId[id].name;

/* Markdown の文の中の、章へのリンク（{ ch, sc }） */
const RE_LINK = /\[([^\]]+)\](?:\(([^)\s]+)\)|\[([^\]]*)\])/g;
function linksIn(text, refs) {
  const out = [];
  for (const m of text.matchAll(RE_LINK)) {
    const u = m[2] !== undefined ? m[2] : refs.get((m[3] || m[1]).toLowerCase());
    const p = u && L.parse(href(u));
    if (p) out.push(p);
  }
  return out;
}
/* 文が指す章: リンクと、リンクの外の「第N章」「第N章 場面K」「第N・M章」 */
function sentenceRefs(text, refs) {
  const out = linksIn(text, refs);
  for (const m of text.replace(RE_LINK, ' ').matchAll(/第(\d+(?:[・、]\d+)*)章(?:\s*場面\s*(\d+))?/g)) {
    const chs = m[1].split(/[・、]/).map(Number);
    chs.forEach((ch, k) => { if (L.chapters[ch]) out.push({ ch, sc: k === chs.length - 1 && m[2] ? Number(m[2]) : 0 }); });
  }
  return out;
}
const layersOf = (ps) => new Set(ps.flatMap((p) => L.of(p.ch, p.sc)));
/* 層ごとに、いくつの集まり（表の行・文の参照）に出たかと、最初に出た位置 */
function tally(sets) {
  const c = new Map();
  sets.forEach((s, k) => s.forEach((id) => { const x = c.get(id); if (x) x.n++; else c.set(id, { n: 1, k }); }));
  return c;
}
/* 最も多く出た層。同数なら tie（別の数え）で多い方、それも同じなら先に出た方 */
function top(c, tie) {
  const n = (m, id) => (m && m.get(id) ? m.get(id).n : 0);
  return [...c.keys()].sort((a, b) => n(c, b) - n(c, a) || n(tie, b) - n(tie, a) || c.get(a).k - c.get(b).k)[0];
}
/* 教材に無い概念の近い場面: 名前（「（」より前）を含み「教材に無い」とも書いた行・項目・段落の、章の場面へのリンク。
   そういう所が無ければ、名前を含む所のリンク */
function nearScenes(name, units, refs) {
  const key = name.split('（')[0].trim().toLowerCase();
  const has = units.filter((u) => plain(u).toLowerCase().includes(key));
  const said = has.filter((u) => u.includes('教材に無い'));
  return [...new Set((said.length ? said : has).flatMap((u) => linksIn(u, refs)).filter((p) => p.sc).map(keyOf))].sort(byKey);
}

/* ---------- ノート 1 件 ---------- */
/* # が題、## 要点 は表紙のリード、ほかの ## が場面 1 つ、場面の中の ### が 1画面版の列 1 つ */
function readNote(file) {
  const src = fs.readFileSync(path.join(NEWS, file), 'utf8');
  const { blocks, refs } = parse(src);
  const n = { file, slug: file.replace(/\.md$/, ''), date: file.slice(0, 10), month: file.slice(0, 7), daily: RE_DAILY.test(src), title: '', head: [], lead: [], scenes: [] };
  let into = n.head;
  for (const b of blocks) {
    if (b.t === 'h' && b.level === 1 && !n.title) n.title = b.text.replace(/\s*（\d{4}-\d\d-\d\d）$/, '');
    else if (b.t === 'h' && b.level === 2 && b.text === '要点') into = n.lead;
    else if (b.t === 'h' && b.level === 2) {
      const sc = { title: b.text, tab: b.tab || b.text, groups: [{ title: '', blocks: [] }] };
      n.scenes.push(sc);
      into = sc.groups[0].blocks;
    } else if (b.t === 'h' && b.level === 3 && n.scenes.length) {
      const sc = n.scenes[n.scenes.length - 1];
      if (!sc.groups[0].blocks.length && !sc.groups[0].title) sc.groups.shift();
      sc.groups.push({ title: b.text, blocks: [] });
      into = sc.groups[sc.groups.length - 1].blocks;
    } else into.push(b);
  }
  const first = n.lead.find((b) => b.t === 'p');
  n.leadFirst = first ? (first.text.match(/^.*?。/) || [first.text])[0] : '';
  n.refs = refs;
  /* ノートがリンクしている章（帯に印を付ける） */
  const all = [...refs.values(), ...[...src.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])];
  n.chapters = [...new Set(all.map((u) => /chapters\/(\d\d)-[a-z0-9-]+\.html/.exec(href(u))).filter(Boolean).map((m) => Number(m[1])))].sort((a, b) => a - b);

  /* 層と中心の層 */
  const links = all.map((u) => L.parse(href(u))).filter(Boolean);
  n.sceneKeys = [...new Set(links.map(keyOf))].sort(byKey);
  const layerScene = n.scenes.find((s) => s.tab === '層');
  const table = layerScene && layerScene.groups.flatMap((g) => g.blocks).find((b) => b.t === 'table');
  const tableCount = tally(table ? table.rows.map((r) => layersOf(linksIn(r.join(' | '), refs))) : []);
  const leadRefs = sentenceRefs(n.leadFirst, refs);
  const leadCount = tally(leadRefs.map((p) => layersOf([p])));
  n.tags = (RE_TAGS.exec(src) || [, ''])[1].split(/[、,\s]+/).filter(Boolean);
  for (const id of n.tags) if (!L.byId[id]) throw new Error(`news/${file}: tags の ${id} は assets/layers.js に無い`);
  const set = new Set([...layersOf(links), ...layersOf(leadRefs), ...n.tags]);
  n.center = n.tags[0] || top(leadCount, tableCount) || top(tableCount) || [...set][0] || '';
  const order = (id) => L.layers.indexOf(L.byId[id]);
  const cnt = (m, id) => (m.get(id) ? m.get(id).n : 0);
  n.layers = [...set].sort((a, b) => (b === n.center) - (a === n.center) || cnt(tableCount, b) - cnt(tableCount, a) || cnt(leadCount, b) - cnt(leadCount, a) || order(a) - order(b));

  /* 教材に無い概念 */
  const units = [];
  const put = (bs) => bs.forEach((b) => {
    if (b.t === 'table') b.rows.forEach((r) => units.push(r.join(' | ')));
    else if (b.t === 'ul' || b.t === 'ol') b.items.forEach((it) => { units.push(it.text); it.sub.forEach((x) => units.push(x)); });
    else if (b.t === 'p' || b.t === 'quote') units.push(b.text);
  });
  put(n.head); put(n.lead); n.scenes.forEach((s) => s.groups.forEach((g) => put(g.blocks)));
  n.missing = (RE_MISSING.exec(src) || [, ''])[1].split('、').map((s) => s.trim()).filter(Boolean).map((name) => ({ name, near: nearScenes(name, units, refs) }));
  return n;
}

/* 全章の帯。リンクしている章に印を付け、その章へのリンクにする */
function strip(on, label) {
  const set = new Set(on);
  const groups = PARTS.map(([p, name]) => {
    const cs = chapters.filter((c) => c.part === p);
    const cellsHtml = cs.map((c) => set.has(c.n)
      ? `<a class="nw-cell on" href="../chapters/${esc(c.file)}" title="第${c.n}章 ${esc(c.title)}">${c.n}</a>`
      : `<span class="nw-cell" title="第${c.n}章 ${esc(c.title)}">${c.n}</span>`).join('');
    return `<div class="nw-grp" style="--n:${cs.length}"><span class="nw-part">${p} ${esc(name)}</span><div class="nw-cells">${cellsHtml}</div></div>`;
  }).join('');
  const names = on.map((k) => { const c = chapters.find((x) => x.n === k); return c ? `第${k}章 ${c.title}` : `第${k}章`; });
  return `<div class="nw-strip" role="group" aria-label="${esc(label)}: ${esc(names.join('、') || 'なし')}">${groups}</div>`;
}

/* 層の札。中心の層を先頭に太字で。札は一覧の層の地図（場面 1）をその層で絞るリンク。max があれば残りは「ほか N」 */
function layerChips(n, max) {
  const shown = max ? n.layers.slice(0, max) : n.layers;
  const more = n.layers.length - shown.length;
  return `<p class="nw-layers" aria-label="層（先頭が中心の層）">${shown.map((id) => `<a class="chip nw-lc${id === n.center ? ' c' : ''}" href="index.html?layer=${id}#s1" title="${esc(layerName(id))}${id === n.center ? '（中心の層）' : ''}">${esc(L.label(id))}</a>`).join('')}${more > 0 ? `<span class="chip nw-more" title="${esc(n.layers.slice(shown.length).map(layerName).join('、'))}">ほか ${more}</span>` : ''}</p>`;
}

/* ---------- ページの骨組み ---------- */
const STYLE = `<style>
  /* ニュースのページだけのスタイル（tools/build-news.mjs が書く） */
  .sc-nw { grid-template-areas: "sh" "text"; }
  .fit .sc-nw { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "sh" "text"; }
  .nw-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.15rem; align-content: start; }
  .fit .nw-body { grid-template-columns: var(--cols, minmax(0, 1fr)); column-gap: 40px; }
  .fit .nw-body.nw-narrow { max-width: 60em; }
  .nw-body h3 { font-family: var(--display); font-weight: 700; font-size: 1.05rem; line-height: 1.5; }
  .nw-body h4 { font-weight: 600; font-size: 0.95rem; }
  .nw-body ul, .nw-body ol { padding-left: 1.3em; display: grid; gap: 0.35rem; }
  .nw-body li > ul, .nw-body li > ol { margin-top: 0.3rem; }
  .nw-body blockquote { border-left: 3px solid var(--rule); padding-left: 0.9rem; color: var(--fg-mid); }
  .nw-body pre { background: var(--inset); border-radius: 4px; padding: 0.6rem 0.8rem; overflow-x: auto; font-size: 0.8rem; }
  .nw-tbl b { font-weight: 600; }
  table.nw-tbl td[data-label]::before { border-left: 0; padding-left: 0; }   /* 縦読み版の見出しの色見本（章の表で使う）は出さない */
  a.nw-ch { white-space: nowrap; text-decoration: underline dotted; text-decoration-color: var(--fg-dim); text-underline-offset: 0.22em; }
  a.nw-ch:hover { text-decoration-style: solid; text-decoration-color: var(--fg); }
  .nw-meta { list-style: none; padding: 0; margin-top: 1rem; display: grid; gap: 0.2rem; font-size: 0.84rem; line-height: 1.7; color: var(--fg-mid); }
  .fit .nw-meta { margin-top: 18px; }
  .nw-meta li { padding-left: 1em; text-indent: -1em; }
  .nw-meta li::before { content: "・"; }

  /* 全章の帯 */
  .nw-strip { display: flex; flex-wrap: wrap; gap: 6px 6px; margin-top: 1rem; }
  .nw-grp { flex: var(--n) 1 calc(var(--n) * 17px); min-width: 0; display: grid; gap: 2px; }
  .nw-part { font-size: 0.68rem; line-height: 1.5; color: var(--fg-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 2px solid var(--rule); padding-left: 3px; }
  .nw-cells { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px; }
  .nw-cell { font-family: var(--mono); font-size: 0.68rem; line-height: 1.75rem; text-align: center; border-radius: 3px; background: var(--inset); color: var(--fg-dim); text-decoration: none; }
  a.nw-cell.on { background: var(--fg); color: var(--surface); font-weight: 600; }
  a.nw-cell.on:hover { outline: 2px solid var(--fg-dim); outline-offset: 1px; }

  /* 一覧 */
  .sc-nwlist { grid-template-areas: "sh" "tbl"; }
  .fit .sc-nwlist { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "sh" "tbl"; }
  .nw-cards { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.9rem; align-content: start; }
  .fit .nw-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; }
  .nw-card { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 0.75rem 0.95rem 0.8rem; display: grid; gap: 0.35rem; align-content: start; }
  .nw-card .nw-date, .nw-month .nw-date { font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.06em; color: var(--fg-dim); }
  .nw-card h3 { font-family: var(--display); font-weight: 700; font-size: 1.02rem; line-height: 1.5; }
  .nw-card h3 a { text-decoration: none; }
  .nw-card h3 a:hover { text-decoration: underline; text-underline-offset: 0.2em; }
  .nw-card .nw-lead, .nw-month .nw-lead { font-size: 0.86rem; line-height: 1.7; color: var(--fg-mid); }
  .nw-card .nw-strip { margin-top: 0.35rem; }

  /* 月ごと */
  .nw-months { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.6rem; align-content: start; }
  .fit .nw-months { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 16px; }
  .nw-month { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 0.6rem 0.9rem 0.65rem; display: grid; gap: 0.1rem; align-content: start; color: var(--fg); text-decoration: none; }
  .nw-month:hover { border-color: var(--fg-dim); }
  .nw-month b { font-family: var(--display); font-weight: 700; font-size: 1.02rem; line-height: 1.5; }

  /* 層の札（中心の層は太字） */
  .nw-layers { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .nw-card .nw-layers { margin-top: 0.2rem; }
  .nw-eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 1rem; margin-bottom: 0.9rem; }
  .nw-eyebrow .eyebrow { margin-bottom: 0; }
  a.nw-lc { text-decoration: none; }
  a.nw-lc:hover { border-color: var(--fg-dim); color: var(--fg); }
  a.nw-lc.c { color: var(--fg); border-color: var(--fg); font-weight: 600; }
  .nw-more { color: var(--fg-dim); border-style: dashed; }

  /* 層の地図（assets/news-graph.js が中身を入れる） */
  .sc-nwmap { grid-template-areas: "sh" "left" "fig"; }
  .fit .sc-nwmap { grid-template-columns: 31fr 69fr; grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "sh sh" "left fig"; }
  .fit .sc-nwmap .a-left { align-self: stretch; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .nwg-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; font-size: 0.8rem; color: var(--fg-mid); }
  .nwg-seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; }
  .nwg-seg button { font: inherit; padding: 0.15rem 0.65rem; background: var(--surface); color: var(--fg-mid); border: 0; cursor: pointer; }
  .nwg-seg button + button { border-left: 1px solid var(--rule); }
  .nwg-seg button[aria-pressed="true"] { background: var(--fg); color: var(--surface); }
  .nwg-chip { display: inline-flex; align-items: center; border: 1px solid var(--fg); border-radius: 3px; padding-left: 0.45rem; color: var(--fg); }
  .nwg-chip button { font: inherit; border: 0; background: none; cursor: pointer; color: var(--fg-mid); padding: 0 0.4rem; }
  .nwg-list { list-style: none; padding: 0; margin-top: 0.7rem; display: grid; gap: 0.25rem; align-content: start; }
  .fit .nwg-list { overflow-y: auto; min-height: 0; padding-right: 4px; }
  .nwg-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.6rem; border-left: 3px solid transparent; padding: 0.3rem 0.5rem 0.35rem 0.6rem; border-radius: 0 4px 4px 0; }
  .nwg-list li.on { border-left-color: var(--c-x); background: var(--inset); }
  .nwg-list li.nwg-none { display: block; color: var(--fg-dim); font-size: 0.86rem; }
  .nwg-pick { font: inherit; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; color: var(--fg); display: grid; gap: 0.05rem; min-width: 0; }
  .nwg-pick .d { font-family: var(--mono); font-size: 0.7rem; color: var(--fg-dim); }
  .nwg-pick b { font-weight: 600; font-size: 0.88rem; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .nwg-pick .c { font-size: 0.74rem; color: var(--fg-mid); }
  .nwg-list a { font-size: 0.8rem; white-space: nowrap; }
  .nwg-foot { font-size: 0.78rem; line-height: 1.6; color: var(--fg-dim); margin-top: 0.6rem; }
  .nwg-box { cursor: pointer; }
  .nwg-box:focus-visible { outline: none; }
  .nwg-box:focus-visible rect { stroke: var(--fg); stroke-width: 2.5; }

  /* 教材に無い */
  .nw-miss { list-style: none; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.55rem 1.4rem; align-content: start; }
  .fit .nw-miss { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 28px; }
  .nw-miss li { display: grid; gap: 0.1rem; border-left: 2px dashed var(--rule); padding-left: 0.7rem; }
  .nw-miss li.cand { border-left: 2px solid var(--c-x); }
  .nw-miss b { font-weight: 600; }
  .nw-miss .nw-n { font-family: var(--mono); font-size: 0.78rem; color: var(--fg-mid); margin-left: 0.4rem; }
  .nw-miss .cand-mark { color: var(--c-x); border-color: var(--c-x); margin-left: 0.4rem; }
  .nw-miss small { font-size: 0.8rem; line-height: 1.6; color: var(--fg-mid); }
</style>`;

/* graph があるページは、層の地図（assets/news-graph.js）を場面 graph.k に描く。graph.opts はその場面の絞り込み */
function page({ title, description, body, meta, graph }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="data:,">
<!-- このページは tools/build-news.mjs が news/ の Markdown から作る（手で直さない） -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ja_JP">
<meta property="og:site_name" content="YouTubeが見えるまで">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+JP:wght@400;500;600&family=Zen+Kaku+Gothic+New:wght@700&display=swap">
<link rel="stylesheet" href="../assets/base.css">
<script src="../assets/engine.js"></script>
${graph ? '<script src="../assets/layers.js"></script>\n<script src="news-data.js"></script>\n<script src="../assets/news-graph.js"></script>\n' : ''}${STYLE}
</head>
<body>
<div class="app">
<main class="scenes">

${body}

</main>
</div>

<script>
${graph ? `YT_NEWS_GRAPH.mount(document.getElementById('s${graph.k}'), ${JSON.stringify(graph.opts)});\n` : ''}YT.chapter({ meta: ${JSON.stringify(meta).replace(/</g, '\\u003c')} });
</script>
</body>
</html>
`;
}

const KEYS = '上のタブで場面を選ぶ。<kbd>↓</kbd><kbd>↑</kbd>（または右上の <kbd>‹</kbd><kbd>›</kbd>）で場面を移る。';

function notePage(n) {
  const head = n.head.map((b) => (b.t === 'ul' || b.t === 'ol' ? b.items.map((it) => `<li>${inline(it.text, n.refs)}</li>`).join('') : `<li>${inline(b.text || '', n.refs)}</li>`)).join('');
  const lead = n.lead.map((b) => (b.t === 'p' ? `<p class="standfirst">${inline(b.text, n.refs)}</p>` : render([b], n.refs))).join('\n');
  const toc = n.scenes.map((s, i) => `<li><a href="#s${i + 1}" data-go="${i + 1}"><span class="n">${i + 1}</span>${inline(s.title, n.refs)}</a></li>`).join('\n      ');
  const scenes = n.scenes.map((s, i) => {
    const k = i + 1;
    // 列の幅は、表のある列を 3、ない列を 2 の割合にする。表の無い 1 列だけの場面は、行が長くなりすぎないよう幅を絞る
    const hasTable = s.groups.map((g) => g.blocks.some((b) => b.t === 'table'));
    const cols = s.groups.length > 1 ? hasTable.map((t) => (t ? '3fr' : '2fr')).join(' ') : '';
    const narrow = s.groups.length === 1 && !hasTable[0] ? ' nw-narrow' : '';
    const groups = s.groups.map((g) => `<div class="col">${g.title ? `<h3>${inline(g.title, n.refs)}</h3>\n` : ''}${render(g.blocks, n.refs)}</div>`).join('\n');
    return `<!-- ================= ${k} ${esc(s.title)} ================= -->
<section class="scene sc-nw" id="s${k}" data-tab="${esc(s.tab)}" aria-labelledby="h-s${k}">
  <header class="sh a-sh">
    <h2 id="h-s${k}"><span class="n">${k}</span>${inline(s.title, n.refs)}</h2>
  </header>
  <div class="nw-body a-text${narrow}"${cols ? ` style="--cols: ${cols}"` : ''}>
${groups}
  </div>
</section>`;
  }).join('\n\n');
  const eyebrow = `ニュースから層へ ／ ${n.daily ? '日刊 ／ ' : ''}${n.date}`;
  const body = `<!-- ================= 表紙 ================= -->
<section class="scene sc-cover on" id="s0" data-tab="表紙" aria-labelledby="h-s0">
  <div class="a-main">
    <div class="nw-eyebrow"><p class="eyebrow">${esc(eyebrow)}</p>${layerChips(n, CARD_LAYERS)}</div>
    <h1 id="h-s0">${inline(n.title, n.refs)}</h1>
    ${lead}
    <ul class="nw-meta">${head}</ul>
    ${strip(n.chapters, 'このノートがリンクしている章')}
    <p class="keys fit-only">${KEYS}上の札はこのノートの層（太字が中心の層。押すと層の地図で絞る）、帯の塗りつぶした番号はリンクしている章。</p>
  </div>
  <nav class="toc a-toc" aria-labelledby="h-toc">
    <h2 id="h-toc">構成</h2>
    <ol>
      ${toc}
    </ol>
  </nav>
  <footer class="cover-foot a-foot">
    <nav class="chnav" aria-label="移動"><a class="next" href="#s1" data-go="1">読む ›</a><a href="index.html">ニュースの一覧</a><a href="${esc(n.month)}.html">${esc(monthLabel(n.month))}</a><a href="../index.html">目次</a><a href="../glossary.html">用語索引</a></nav>
    <p>元のノート: <a href="${REPO}${esc(n.file)}" target="_blank" rel="noopener">news/${esc(n.file)}</a>（このページは <code>node tools/build-news.mjs</code> で作る）</p>
  </footer>
</section>

${scenes}`;
  return page({
    title: `${n.title} — ニュースから層へ`,
    description: plain(n.leadFirst),
    body,
    meta: { eyebrow, title: n.title, home: 'index.html', actions: [{ href: 'index.html', label: 'ニュースの一覧' }] }
  });
}

/* ---------- 一覧のカードと、カードを並べた場面 ---------- */
const monthLabel = (m) => `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`;
const card = (n) => `<article class="nw-card">
  <p class="nw-date">${esc(n.date)}${n.daily ? ' ／ 日刊' : ''}</p>
  <h3><a href="${esc(n.slug)}.html">${inline(n.title, n.refs)}</a></h3>
  <p class="nw-lead">${inline(n.leadFirst, n.refs)}</p>
  ${layerChips(n, CARD_LAYERS)}
  ${strip(n.chapters, 'リンクしている章')}
</article>`;
const span = (ns) => (!ns.length ? 'まだ無い' : ns[0].date === ns[ns.length - 1].date ? ns[0].date : `${ns[ns.length - 1].date} 〜 ${ns[0].date}`);
const tocItem = (s) => `<li><a href="#s${s.k}" data-go="${s.k}"><span class="n">${s.k}</span>${esc(s.label)}</a><p>${esc(s.note)}</p></li>`;

/* ノート（新しい順）を PER_SCENE 件ずつ場面にする。k0 は最初の場面の番号。2 つ以上に分かれたら、名前に番号を付ける */
function cardScenes(notes, k0, name) {
  const chunks = [];
  for (let i = 0; i < notes.length; i += PER_SCENE) chunks.push(notes.slice(i, i + PER_SCENE));
  if (!chunks.length) chunks.push([]);
  return chunks.map((ns, i) => {
    const k = k0 + i;
    const label = name + (chunks.length > 1 ? ` ${i + 1}` : '');
    return {
      k, label, note: ns.length ? `${span(ns)} の ${ns.length} 件` : 'まだ無い',
      html: `<!-- ================= ${k} ${esc(label)} ================= -->
<section class="scene sc-nwlist" id="s${k}" data-tab="${esc(label)}" aria-labelledby="h-s${k}">
  <header class="sh a-sh">
    <h2 id="h-s${k}"><span class="n">${k}</span>${esc(name)} — 新しい順</h2>
    <p class="sh-meta"><span class="chip">${esc(span(ns))}</span><span class="chip">塗りつぶした番号 = ノートがリンクしている章</span></p>
  </header>
  <div class="nw-cards a-tbl">
${ns.map(card).join('\n')}
  </div>
</section>`
    };
  });
}

/* 層の地図の場面。左の一覧と図の中身は assets/news-graph.js が入れる */
function graphScene(k, what) {
  return {
    k, label: '層の地図', note: `${what}を、教材の層の上に置いた図`,
    html: `<!-- ================= ${k} 層の地図 ================= -->
<section class="scene sc-nwmap" id="s${k}" data-tab="層の地図" aria-labelledby="h-s${k}">
  <header class="sh a-sh">
    <h2 id="h-s${k}"><span class="n">${k}</span>層の地図 — どの層のニュースか</h2>
    <p class="sh-meta"><span class="chip">数 = その層に触れたノート</span><span class="chip">線の太さ = 両方の層に触れたノートの数</span></p>
  </header>
  <div class="nwg-side a-left"></div>
  <figure class="nwg-fig anim-fig a-fig">
    <div class="fig-scroll" data-scroll-x><svg viewBox="0 0 960 560" role="img" aria-label="教材の 24 の層を、計算機の中・通信・配信と動画・横断の列に並べ、層ごとのノートの数と、選んだノートの層を線で結んだ図"></svg></div>
    <figcaption>図1　列の中は、下ほど電子に近い層。x の枠が選んだノートの層で、線は中心の層（塗った札）から引く。下の破線の札は、そのノートが挙げた教材に無い概念。</figcaption>
  </figure>
</section>`
  };
}

/* 教材に無い概念を、出たノートの数が多い順（同数は新しい順）に PER_MISSING 個ずつ場面にする */
function missingScenes(notes, k0) {
  const map = new Map();
  for (const n of notes) {
    for (const m of n.missing) {
      if (!map.has(m.name)) map.set(m.name, { name: m.name, notes: [], near: new Set() });
      const x = map.get(m.name);
      x.notes.push(n);
      m.near.forEach((k) => x.near.add(k));
    }
  }
  const xs = [...map.values()].sort((a, b) => b.notes.length - a.notes.length || (a.notes[0].date < b.notes[0].date ? 1 : a.notes[0].date > b.notes[0].date ? -1 : 0) || a.name.localeCompare(b.name, 'ja'));
  const chunks = [];
  for (let i = 0; i < xs.length; i += PER_MISSING) chunks.push(xs.slice(i, i + PER_MISSING));
  if (!chunks.length) chunks.push([]);
  const cand = xs.filter((x) => x.notes.length >= CANDIDATE).length;
  return chunks.map((ys, i) => {
    const k = k0 + i;
    const label = '教材に無い' + (chunks.length > 1 ? ` ${i + 1}` : '');
    const item = (x) => `<li${x.notes.length >= CANDIDATE ? ' class="cand"' : ''}><span><b>${esc(x.name)}</b><span class="nw-n">${x.notes.length} 件</span>${x.notes.length >= CANDIDATE ? '<span class="chip cand-mark">章の候補</span>' : ''}</span>`
      + `<small>近い場面: ${x.near.size ? [...x.near].sort(byKey).map((s) => `<a class="nw-ch" href="${esc(sceneHref(s))}">${esc(sceneName(s))}</a>`).join('・') : 'なし'}</small>`
      + `<small>ノート: ${x.notes.map((n) => `<a href="${esc(n.slug)}.html" title="${esc(plain(n.title))}">${esc(n.date)}</a>`).join('・')}</small></li>`;
    return {
      k, label, note: ys.length ? `${xs.length} 個のうち ${i * PER_MISSING + 1}〜${i * PER_MISSING + ys.length} 個目${cand ? `。章の候補 ${cand} 個` : ''}` : 'まだ無い',
      html: `<!-- ================= ${k} ${esc(label)} ================= -->
<section class="scene sc-nwlist" id="s${k}" data-tab="${esc(label)}" aria-labelledby="h-s${k}">
  <header class="sh a-sh">
    <h2 id="h-s${k}"><span class="n">${k}</span>教材に無い — ノートが前提にした、教材に無い概念</h2>
    <p class="sh-meta"><span class="chip">出たノートの数が多い順</span><span class="chip">${CANDIDATE} 件のノートに出たら章の候補</span></p>
  </header>
  <ul class="nw-miss a-tbl">
${ys.map(item).join('\n')}
  </ul>
</section>`
    };
  });
}

/* ニュースが出た月ごとにまとめる。新しい月から */
function byMonth(notes) {
  const map = new Map();
  for (const n of notes) { if (!map.has(n.month)) map.set(n.month, []); map.get(n.month).push(n); }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([m, ns]) => ({ m, notes: ns, daily: ns.filter((n) => n.daily).length }));
}
const monthCount = (x) => [x.daily ? `日刊 ${x.daily} 件` : '', x.notes.length - x.daily ? `詳しいノート ${x.notes.length - x.daily} 件` : ''].filter(Boolean).join('・');

/* 月のページへのリンクを PER_MONTHS 個ずつ場面にする */
function monthScenes(ms, k0) {
  const chunks = [];
  for (let i = 0; i < ms.length; i += PER_MONTHS) chunks.push(ms.slice(i, i + PER_MONTHS));
  if (!chunks.length) chunks.push([]);
  return chunks.map((xs, i) => {
    const k = k0 + i;
    const label = '月ごと' + (chunks.length > 1 ? ` ${i + 1}` : '');
    const range = !xs.length ? 'まだ無い' : xs.length === 1 ? xs[0].m : `${xs[xs.length - 1].m} 〜 ${xs[0].m}`;
    return {
      k, label, note: xs.length ? `${range} の ${xs.length} か月分` : 'まだ無い',
      html: `<!-- ================= ${k} ${esc(label)} ================= -->
<section class="scene sc-nwlist" id="s${k}" data-tab="${esc(label)}" aria-labelledby="h-s${k}">
  <header class="sh a-sh">
    <h2 id="h-s${k}"><span class="n">${k}</span>月ごと — ニュースが出た月</h2>
    <p class="sh-meta"><span class="chip">${esc(range)}</span><span class="chip">日刊 = 毎朝 1 件を自動で選んで書いたノート</span></p>
  </header>
  <div class="nw-months a-tbl">
${xs.map((x) => `<a class="nw-month" href="${esc(x.m)}.html"><span class="nw-date">${esc(x.m)}</span><b>${x.notes.length} 件</b><span class="nw-lead">${esc(monthCount(x))}</span></a>`).join('\n')}
  </div>
</section>`
    };
  });
}

function indexPage(notes, ms) {
  const graph = graphScene(1, `全 ${notes.length} 件のノート`);
  const fresh = cardScenes(notes.slice(0, PER_SCENE), 2, '新着');
  const mon = monthScenes(ms, 2 + fresh.length);
  const deep = cardScenes(notes.filter((n) => !n.daily), 2 + fresh.length + mon.length, '詳しいノート');
  const miss = missingScenes(notes, 2 + fresh.length + mon.length + deep.length);
  const all = [graph, ...fresh, ...mon, ...deep, ...miss];
  const body = `<!-- ================= 表紙 ================= -->
<section class="scene sc-cover on" id="s0" data-tab="表紙" aria-labelledby="h-s0">
  <div class="a-main">
    <p class="eyebrow">ニュースから層へ ／ ${notes.length} 件</p>
    <h1 id="h-s0">ニュースから層へ</h1>
    <p class="standfirst">tech ニュースを 1 件ずつ調べ、この教材のどの層の話かを、章と場面へのリンクで示したノート。各ノートは、層ごとに何が起きるかを表にする。脆弱性と事故のノートは確かなことと確かでないことを、更新のノートは解決することと前提知識を書き分ける。日刊のノートは、毎朝 1 件を自動で選んで書いた短いノートで、人は確かめていない。</p>
    <p class="keys fit-only">${KEYS}一覧の札はそのノートの層（太字が中心の層）、帯は全 ${chapters.length} 章を部ごとに並べたもので、塗りつぶした番号がリンクしている章。</p>
  </div>
  <nav class="toc a-toc" aria-labelledby="h-toc">
    <h2 id="h-toc">構成</h2>
    <ol>
      ${all.map(tocItem).join('\n      ')}
    </ol>
  </nav>
  <footer class="cover-foot a-foot">
    <nav class="chnav" aria-label="移動"><a class="next" href="#s1" data-go="1">層の地図 ›</a><a href="#s2" data-go="2">新着</a><a href="../index.html">目次</a><a href="../glossary.html">用語索引</a></nav>
    <p>ノートの元は news/ の Markdown（書き方は <a href="${REPO}README.md" target="_blank" rel="noopener">news/README.md</a>）。このページは <code>node tools/build-news.mjs</code> で作る。</p>
  </footer>
</section>

${all.map((s) => s.html).join('\n\n')}`;
  return page({
    title: 'ニュースから層へ — YouTubeが見えるまで',
    description: 'tech ニュースを 1 件ずつ調べ、教材「YouTubeが見えるまで」のどの層（章・場面）の話かに結びつけたノートの一覧。',
    body,
    meta: { eyebrow: 'ニュースから層へ', title: 'ニュースの一覧', home: '../index.html', actions: [{ href: '../index.html', label: '教材の目次' }] },
    graph: { k: 1, opts: { period: true } }
  });
}

/* 月のページ。x はその月、older・newer は前後の月（ノートのある月。無ければ undefined） */
function monthPage(x, older, newer) {
  const label = monthLabel(x.m);
  const scenes = [graphScene(1, `${label}のノート ${x.notes.length} 件`), ...cardScenes(x.notes, 2, '一覧')];
  const near = (y, word) => (y ? `<a href="${esc(y.m)}.html"><small>${word}</small> ${esc(monthLabel(y.m))}</a>` : '');
  const body = `<!-- ================= 表紙 ================= -->
<section class="scene sc-cover on" id="s0" data-tab="表紙" aria-labelledby="h-s0">
  <div class="a-main">
    <p class="eyebrow">ニュースから層へ ／ ${esc(x.m)} ／ ${x.notes.length} 件</p>
    <h1 id="h-s0">${esc(label)}のニュース</h1>
    <p class="standfirst">${esc(label)}に出たニュースのノート ${x.notes.length} 件（${esc(monthCount(x))}）を、新しい順に並べる。日付はニュースが出た日で、ノートを書いた日ではない。</p>
    <p class="keys fit-only">${KEYS}一覧の札はそのノートの層（太字が中心の層）、帯は全 ${chapters.length} 章を部ごとに並べたもので、塗りつぶした番号がリンクしている章。</p>
  </div>
  <nav class="toc a-toc" aria-labelledby="h-toc">
    <h2 id="h-toc">構成</h2>
    <ol>
      ${scenes.map(tocItem).join('\n      ')}
    </ol>
  </nav>
  <footer class="cover-foot a-foot">
    <nav class="chnav" aria-label="移動"><a class="next" href="#s1" data-go="1">層の地図 ›</a><a href="#s2" data-go="2">一覧</a>${near(newer, '次の月')}${near(older, '前の月')}<a href="index.html">ニュースの一覧</a><a href="../index.html">目次</a></nav>
    <p>ノートの元は news/ の Markdown（書き方は <a href="${REPO}README.md" target="_blank" rel="noopener">news/README.md</a>）。このページは <code>node tools/build-news.mjs</code> で作る。</p>
  </footer>
</section>

${scenes.map((s) => s.html).join('\n\n')}`;
  return page({
    title: `${label}のニュース — ニュースから層へ`,
    description: `${label}に出た tech ニュースを、教材「YouTubeが見えるまで」のどの層（章・場面）の話かに結びつけたノート ${x.notes.length} 件の一覧。`,
    body,
    meta: { eyebrow: `ニュースから層へ ／ ${x.m}`, title: `${label}のニュース`, home: 'index.html', actions: [{ href: 'index.html', label: 'ニュースの一覧' }] },
    graph: { k: 1, opts: { month: x.m } }
  });
}

/* ---------- ノートのデータ（news/news-data.js） ---------- */
/* 層の地図（assets/news-graph.js）、章の札（engine.js）、目次の表紙の「最新のニュース」が読む。新しい順に 1 行 1 件 */
function dataFile(notes) {
  const rows = notes.map((n) => JSON.stringify({ slug: n.slug, date: n.date, title: plain(n.title), daily: n.daily, center: n.center, layers: n.layers, scenes: n.sceneKeys, missing: n.missing.map((m) => m.name) }));
  return `/* このファイルは tools/build-news.mjs が news/ の Markdown から作る（手で直さない）。
   ノートごとに slug・日付・題・日刊か・中心の層・層（assets/layers.js の id。中心が先頭）・リンクしている章の場面（'章-場面'、場面を指さないリンクは '章'）・教材に無い概念 */
window.YT_NEWS = [
${rows.join(',\n')}
];
`;
}

/* ---------- README の一覧の表（印の行の間を作り直す） ---------- */
/* news-list は詳しいノート（日刊でないノート）、news-months は月のページ */
function updateReadme(notes, ms) {
  const file = path.join(NEWS, 'README.md');
  let src = fs.readFileSync(file, 'utf8');
  const put = (name, lines) => {
    const A = `<!-- ${name}:start -->`, B = `<!-- ${name}:end -->`;
    if (!src.includes(A) || !src.includes(B)) { console.warn(`news/README.md に ${name} の印が無いので、その表は書かない`); return; }
    src = src.replace(new RegExp(`${A}[\\s\\S]*?${B}`), () => `${A}\n${lines.join('\n')}\n${B}`);
  };
  put('news-list', ['| ニュースの日付 | ノート | 中心の層 | リンクしている章 |', '|---|---|---|---|',
    ...notes.filter((n) => !n.daily).map((n) => `| ${n.date} | [${n.title}](${n.file}) | ${n.center ? layerName(n.center) : '—'} | ${n.chapters.join('・') || '—'} |`)]);
  put('news-months', ['| 月 | ノート | うち日刊 |', '|---|---|---|',
    ...ms.map((x) => `| [${x.m}](${SITE}news/${x.m}.html) | ${x.notes.length} 件 | ${x.daily} 件 |`)]);
  fs.writeFileSync(file, src);
}

/* ---------- 実行 ---------- */
const notes = fs.readdirSync(NEWS).filter((f) => /^\d{4}-\d\d-\d\d-[a-z0-9-]+\.md$/.test(f)).sort().reverse().map(readNote);
const ms = byMonth(notes);
const wanted = new Set(notes.map((n) => n.slug + '.html').concat(ms.map((x) => x.m + '.html'), 'index.html'));
for (const f of fs.readdirSync(NEWS)) {
  // ノートを消したり名前を変えたりしたときに残る古いページを消す
  if (f.endsWith('.html') && !wanted.has(f)) { fs.unlinkSync(path.join(NEWS, f)); console.log(`消した: news/${f}`); }
}
for (const n of notes) {
  fs.writeFileSync(path.join(NEWS, n.slug + '.html'), notePage(n));
  console.log(`news/${n.slug}.html: ${n.title} — ${n.daily ? '日刊、' : ''}場面 ${n.scenes.length}、章 ${n.chapters.join('・') || 'なし'}、`
    + `中心の層 ${n.center || 'なし'}${n.tags.length ? '（tags）' : ''}、層 ${n.layers.join('・') || 'なし'}、教材に無い ${n.missing.length}`);
}
fs.writeFileSync(path.join(NEWS, 'news-data.js'), dataFile(notes));
ms.forEach((x, i) => {   // ms は新しい月から並ぶ。前の月は i + 1、次の月は i - 1
  fs.writeFileSync(path.join(NEWS, x.m + '.html'), monthPage(x, ms[i + 1], ms[i - 1]));
  console.log(`news/${x.m}.html: ${x.notes.length} 件（${monthCount(x)}）`);
});
fs.writeFileSync(path.join(NEWS, 'index.html'), indexPage(notes, ms));
updateReadme(notes, ms);
console.log(`→ news/index.html（${notes.length} 件、${ms.length} か月分）、news/news-data.js、news/README.md の一覧`);
