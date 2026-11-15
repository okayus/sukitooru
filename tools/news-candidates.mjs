#!/usr/bin/env node
/* ============================================================
   日刊のノートの候補を集める (tools/news-candidates.mjs)

   話題になっている tech の記事を 3 か所から取り、1 つの表にして出す。
     ・Hacker News の front page（Algolia の検索 API）
     ・はてなブックマークの人気エントリー「テクノロジー」（RSS）
     ・Lobsters の hottest（JSON）
   同じ URL は 1 件にまとめ、news/ のノートに既に出てくる URL は除く。
   並びは、それぞれの場所での順位を足したもの（複数の場所に出た記事が上に来る）。
   「投稿」は、話題になった場所に最初に出た日（記事が出た日ではない）。
   最後に、直近の日刊のノートの題と、リンクしている章を出す。
   どれを選ぶかはこの道具では決めない。選び方は docs/daily-news.md。

   使い方:
     node tools/news-candidates.mjs            表で出す（上から 40 件）
       --limit N      出す件数
       --json         JSON で出す
   終了コード: 3 か所とも取れなければ 1

   取得には curl を使う（クラウドの実行環境は外向きの通信をプロキシに通す。
   curl は環境変数のプロキシに従うが、Node.js の fetch は既定では従わない）。
   ============================================================ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'news');
const args = process.argv.slice(2);
const opt = { limit: 40, json: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') opt.limit = Number(args[++i]) || opt.limit;
  else if (args[i] === '--json') opt.json = true;
  else { console.error('usage: node tools/news-candidates.mjs [--limit N] [--json]'); process.exit(2); }
}

const get = (url) => execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '25', '-A', 'news-candidates/1.0', url], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/* XML の文字参照を戻す */
const unxml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml); return m ? unxml(m[1]).trim() : ''; };

const SOURCES = [
  {
    name: 'Hacker News', unit: '点',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40',
    read: (text) => JSON.parse(text).hits.map((h) => {
      const discuss = `https://news.ycombinator.com/item?id=${h.objectID}`;
      return { title: h.title, url: h.url || discuss, score: h.points, comments: h.num_comments, discuss, date: h.created_at, tags: [] };
    })
  },
  {
    name: 'はてなブックマーク', unit: 'users',
    url: 'https://b.hatena.ne.jp/hotentry/it.rss',
    read: (text) => [...text.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m) => {
      const x = m[0];
      const url = tag(x, 'link');
      return {
        title: tag(x, 'title'), url, score: Number(tag(x, 'hatena:bookmarkcount')) || 0, comments: null,
        discuss: tag(x, 'hatena:bookmarkCommentListPageUrl') || `https://b.hatena.ne.jp/entry/${url.replace(/^https:\/\//, 's/').replace(/^http:\/\//, '')}`,
        date: tag(x, 'dc:date'), tags: [...x.matchAll(/<dc:subject>([\s\S]*?)<\/dc:subject>/g)].map((s) => unxml(s[1]).trim())
      };
    })
  },
  {
    name: 'Lobsters', unit: '点',
    url: 'https://lobste.rs/hottest.json',
    read: (text) => JSON.parse(text).map((h) => ({ title: h.title, url: h.url || h.short_id_url, score: h.score, comments: h.comment_count, discuss: h.short_id_url, date: h.created_at, tags: h.tags || [] }))
  }
];

/* 同じ記事かを比べるための形。スキーム・www・末尾の /・追跡用の引数・# 以降を落とす */
function norm(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|ref$|ref_|fbclid$|gclid$|source$)/i.test(k)) x.searchParams.delete(k);
    return x.host.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + (x.searchParams.size ? '?' + x.searchParams.toString() : '');
  } catch (e) { return u; }
}

/* ---------- news/ のノートに既に出てくる URL と、直近の日刊のノート ---------- */
const known = new Set();
const recent = [];
for (const f of fs.readdirSync(NEWS).filter((f) => /^\d{4}-\d\d-\d\d-[a-z0-9-]+\.md$/.test(f)).sort().reverse()) {
  const src = fs.readFileSync(path.join(NEWS, f), 'utf8');
  for (const m of src.matchAll(/https?:\/\/[^\s)>\]"'`]+/g)) known.add(norm(m[0]));
  if (/^<!--\s*kind:\s*daily\s*-->\s*$/m.test(src) && recent.length < 30) {
    const chapters = [...new Set([...src.matchAll(/chapters\/(\d\d)-[a-z0-9-]+\.html/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    recent.push({ date: f.slice(0, 10), title: (/^#\s+(.*)$/m.exec(src) || [, f])[1].replace(/\s*（\d{4}-\d\d-\d\d）$/, ''), chapters });
  }
}

/* ---------- 集める ---------- */
const got = [];
const byUrl = new Map();
let dropped = 0;
for (const s of SOURCES) {
  let items;
  try { items = s.read(get(s.url)).filter((x) => x.title && x.url); } catch (e) { got.push(`${s.name} 取れなかった（${String(e.message).split('\n')[0].slice(0, 120)}）`); continue; }
  got.push(`${s.name} ${items.length} 件`);
  items.forEach((x, i) => {
    const key = norm(x.url);
    if (known.has(key)) { dropped++; return; }
    if (!byUrl.has(key)) byUrl.set(key, { title: x.title, url: x.url, rank: 0, tags: [], seen: [] });
    const c = byUrl.get(key);
    c.rank += 1 - i / items.length;
    c.tags = [...new Set(c.tags.concat(x.tags))];
    c.seen.push({ source: s.name, position: i + 1, score: x.score, unit: s.unit, comments: x.comments, discuss: x.discuss, date: x.date });
  });
}
if (!byUrl.size) { console.error('候補を 1 件も取れなかった: ' + got.join('、')); process.exit(1); }
const list = [...byUrl.values()].sort((a, b) => b.rank - a.rank).slice(0, opt.limit);
/* 話題になった場所に最初に出た日（記事が出た日ではない） */
for (const c of list) c.posted = c.seen.map((s) => String(s.date || '').slice(0, 10)).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort()[0] || '';

/* ---------- 出す ---------- */
if (opt.json) {
  console.log(JSON.stringify({ fetched: new Date().toISOString(), sources: got, dropped, candidates: list, recentDaily: recent }, null, 2));
} else {
  console.log(`# 日刊の候補（${new Date().toISOString()} に取得）`);
  console.log(`${got.join('、')}。ノートに既に出てくる URL を ${dropped} 件除いた。上から ${list.length} 件。\n`);
  list.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${c.title}`);
    console.log(`    ${c.url}`);
    console.log(`    ${c.posted ? `投稿 ${c.posted} ／ ` : ''}` + c.seen.map((s) => `${s.source} ${s.position} 位・${s.score} ${s.unit}${s.comments == null ? '' : `・コメント ${s.comments}`}（${s.discuss}）`).join(' ／ ') + (c.tags.length ? ` [${c.tags.join(', ')}]` : ''));
  });
  console.log('\n## 直近の日刊のノート（同じ話題は選ばない）');
  console.log(recent.length ? recent.map((r) => `- ${r.date} ${r.title}（章 ${r.chapters.join('・') || 'なし'}）`).join('\n') : '- まだ無い');
}
