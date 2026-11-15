#!/usr/bin/env node
/* ============================================================
   ニュースのページを作る (tools/build-news.mjs)

   news/*.md（README.md を除く）を、場面に分けたページ news/<同じ名前>.html にし、
   一覧のページ news/index.html、月ごとのページ news/YYYY-MM.html、
   news/README.md の一覧の表（印の行の間）を作り直す。
   ノートを足したり直したりしたら走らせる:  node tools/build-news.mjs
   news/ の .html はすべてこの道具が作る（手で置かない。元のノートが無い .html は消す）。
   ノートの書き方（どの見出しが場面になるか）は news/README.md。

   一覧のページは、新着（新しい順の PER_SCENE 件）、月ごと（月のページへのリンク）、詳しいノート（日刊でないノート）。
   日刊のノート（毎朝 1 件を自動で書くノート。行だけの印 <!-- kind: daily --> を持つ）は、新着と月のページに出る。

   読める Markdown は、ノートで使う分だけ: 見出し（# ## ###）、段落、箇条書き（入れ子は 1 段）、
   表、`コード`、**太字**、[リンク](URL) と [リンク][参照]・参照の定義、> 引用、``` で囲んだコード。
   公開版の URL（https://okayus.github.io/youtube-ga-mieru-made/…）へのリンクは、ページから見た相対パスに直す。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'news');
const SITE = 'https://okayus.github.io/youtube-ga-mieru-made/';
const REPO = 'https://github.com/okayus/youtube-ga-mieru-made/blob/main/news/';
const PER_SCENE = 6;   // 一覧の 1 場面に並べるノートの数（1画面版で収まる数）
const PER_MONTHS = 24;   // 「月ごと」の 1 場面に並べる月の数（4 列 × 6 行）
const RE_DAILY = /^<!--\s*kind:\s*daily\s*-->\s*$/m;   // 日刊のノートの印（行だけの注釈。本文には出ない）

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
</style>`;

function page({ title, description, body, meta }) {
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
${STYLE}
</head>
<body>
<div class="app">
<main class="scenes">

${body}

</main>
</div>

<script>
YT.chapter({ meta: ${JSON.stringify(meta).replace(/</g, '\\u003c')} });
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
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h1 id="h-s0">${inline(n.title, n.refs)}</h1>
    ${lead}
    <ul class="nw-meta">${head}</ul>
    ${strip(n.chapters, 'このノートがリンクしている章')}
    <p class="keys fit-only">${KEYS}帯の塗りつぶした番号は、このノートがリンクしている章。</p>
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
  const fresh = cardScenes(notes.slice(0, PER_SCENE), 1, '新着');
  const mon = monthScenes(ms, 1 + fresh.length);
  const deep = cardScenes(notes.filter((n) => !n.daily), 1 + fresh.length + mon.length, '詳しいノート');
  const all = [...fresh, ...mon, ...deep];
  const body = `<!-- ================= 表紙 ================= -->
<section class="scene sc-cover on" id="s0" data-tab="表紙" aria-labelledby="h-s0">
  <div class="a-main">
    <p class="eyebrow">ニュースから層へ ／ ${notes.length} 件</p>
    <h1 id="h-s0">ニュースから層へ</h1>
    <p class="standfirst">tech ニュースを 1 件ずつ調べ、この教材のどの層の話かを、章と場面へのリンクで示したノート。各ノートは、層ごとに何が起きるかを表にする。脆弱性と事故のノートは確かなことと確かでないことを、更新のノートは解決することと前提知識を書き分ける。日刊のノートは、毎朝 1 件を自動で選んで書いた短いノートで、人は確かめていない。</p>
    <p class="keys fit-only">${KEYS}一覧の帯は全 ${chapters.length} 章を部ごとに並べたもので、塗りつぶした番号がそのノートのリンクしている章。</p>
  </div>
  <nav class="toc a-toc" aria-labelledby="h-toc">
    <h2 id="h-toc">構成</h2>
    <ol>
      ${all.map(tocItem).join('\n      ')}
    </ol>
  </nav>
  <footer class="cover-foot a-foot">
    <nav class="chnav" aria-label="移動"><a class="next" href="#s1" data-go="1">新着 ›</a><a href="../index.html">目次</a><a href="../glossary.html">用語索引</a></nav>
    <p>ノートの元は news/ の Markdown（書き方は <a href="${REPO}README.md" target="_blank" rel="noopener">news/README.md</a>）。このページは <code>node tools/build-news.mjs</code> で作る。</p>
  </footer>
</section>

${all.map((s) => s.html).join('\n\n')}`;
  return page({
    title: 'ニュースから層へ — YouTubeが見えるまで',
    description: 'tech ニュースを 1 件ずつ調べ、教材「YouTubeが見えるまで」のどの層（章・場面）の話かに結びつけたノートの一覧。',
    body,
    meta: { eyebrow: 'ニュースから層へ', title: 'ニュースの一覧', home: '../index.html', actions: [{ href: '../index.html', label: '教材の目次' }] }
  });
}

/* 月のページ。x はその月、older・newer は前後の月（ノートのある月。無ければ undefined） */
function monthPage(x, older, newer) {
  const label = monthLabel(x.m);
  const scenes = cardScenes(x.notes, 1, '一覧');
  const near = (y, word) => (y ? `<a href="${esc(y.m)}.html"><small>${word}</small> ${esc(monthLabel(y.m))}</a>` : '');
  const body = `<!-- ================= 表紙 ================= -->
<section class="scene sc-cover on" id="s0" data-tab="表紙" aria-labelledby="h-s0">
  <div class="a-main">
    <p class="eyebrow">ニュースから層へ ／ ${esc(x.m)} ／ ${x.notes.length} 件</p>
    <h1 id="h-s0">${esc(label)}のニュース</h1>
    <p class="standfirst">${esc(label)}に出たニュースのノート ${x.notes.length} 件（${esc(monthCount(x))}）を、新しい順に並べる。日付はニュースが出た日で、ノートを書いた日ではない。</p>
    <p class="keys fit-only">${KEYS}一覧の帯は全 ${chapters.length} 章を部ごとに並べたもので、塗りつぶした番号がそのノートのリンクしている章。</p>
  </div>
  <nav class="toc a-toc" aria-labelledby="h-toc">
    <h2 id="h-toc">構成</h2>
    <ol>
      ${scenes.map(tocItem).join('\n      ')}
    </ol>
  </nav>
  <footer class="cover-foot a-foot">
    <nav class="chnav" aria-label="移動"><a class="next" href="#s1" data-go="1">一覧 ›</a>${near(newer, '次の月')}${near(older, '前の月')}<a href="index.html">ニュースの一覧</a><a href="../index.html">目次</a></nav>
    <p>ノートの元は news/ の Markdown（書き方は <a href="${REPO}README.md" target="_blank" rel="noopener">news/README.md</a>）。このページは <code>node tools/build-news.mjs</code> で作る。</p>
  </footer>
</section>

${scenes.map((s) => s.html).join('\n\n')}`;
  return page({
    title: `${label}のニュース — ニュースから層へ`,
    description: `${label}に出た tech ニュースを、教材「YouTubeが見えるまで」のどの層（章・場面）の話かに結びつけたノート ${x.notes.length} 件の一覧。`,
    body,
    meta: { eyebrow: `ニュースから層へ ／ ${x.m}`, title: `${label}のニュース`, home: 'index.html', actions: [{ href: 'index.html', label: 'ニュースの一覧' }] }
  });
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
  put('news-list', ['| ニュースの日付 | ノート | リンクしている章 |', '|---|---|---|',
    ...notes.filter((n) => !n.daily).map((n) => `| ${n.date} | [${n.title}](${n.file}) | ${n.chapters.join('・') || '—'} |`)]);
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
  console.log(`news/${n.slug}.html: ${n.title} — ${n.daily ? '日刊、' : ''}場面 ${n.scenes.length}、章 ${n.chapters.join('・') || 'なし'}`);
}
ms.forEach((x, i) => {   // ms は新しい月から並ぶ。前の月は i + 1、次の月は i - 1
  fs.writeFileSync(path.join(NEWS, x.m + '.html'), monthPage(x, ms[i + 1], ms[i - 1]));
  console.log(`news/${x.m}.html: ${x.notes.length} 件（${monthCount(x)}）`);
});
fs.writeFileSync(path.join(NEWS, 'index.html'), indexPage(notes, ms));
updateReadme(notes, ms);
console.log(`→ news/index.html（${notes.length} 件、${ms.length} か月分）、news/README.md の一覧`);
