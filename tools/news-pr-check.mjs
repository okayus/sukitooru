#!/usr/bin/env node
/* ============================================================
   日刊のノートのプルリクエストを検査する (tools/news-pr-check.mjs)

   毎朝の自動の実行（docs/daily-news.md）が出すプルリクエストを、マージの前に検査する。
   .github/workflows/news-pr.yml が、main の側のこのファイルを使って呼ぶ
   （プルリクエストの側のファイルは実行しない）。

   使い方:
     node tools/news-pr-check.mjs <作業ツリー>
       <作業ツリー> は、main を取り出し、プルリクエストの先頭を
       `git merge --no-commit --no-ff` で取り込んだ所（まだコミットしていない）。
       main との差（= マージで main に入る変更）を `git diff --cached` で読む。

   確かめること:
     ・変わるのは news/ の直下のふつうのファイルだけ。消すファイルが無い
     ・足す .md はちょうど 1 つで、日刊のノート（名前の形、<!-- kind: daily --> の印）
     ・既にあるノートの .md を変えていない（変えてよい .md は、一覧の表を持つ news/README.md だけ）
     ・ほかに変わるのは news/ の .html だけ（tools/build-news.mjs が作るファイル）
     ・ノートの中身: 大きさ、題と「要点」と場面の数、日付が未来でない、
       リンクが https:// か http:// だけ、章の場面へのリンクが 2 つ以上の場面にある
   .html と README.md が build-news.mjs の出力と一致するか、ページが 1 画面に収まるかは、
   ワークフローがこの後に build-news.mjs と verify.mjs を走らせて確かめる。

   通ったら、環境変数 GITHUB_OUTPUT のファイルに note（ノートのページ）と month（月のページ）を書く。
   終了コード: 1 つでも外れたら 1
   ============================================================ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 16000;
const SITE = 'https://okayus.github.io/youtube-ga-mieru-made/';
const work = process.argv[2];
if (!work || !fs.existsSync(path.join(work, '.git'))) { console.error('usage: node tools/news-pr-check.mjs <作業ツリー>'); process.exit(2); }

const errors = [];
const bad = (msg) => errors.push(msg);

/* ---------- 変わるファイル ---------- */
const diff = execFileSync('git', ['-C', work, '-c', 'core.quotePath=false', 'diff', '--cached', '--name-status', '--no-renames'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).map((l) => { const [status, ...rest] = l.split('\t'); return { status, file: rest.join('\t') }; });
if (!diff.length) bad('main との差が無い');

const RE_NOTE = /^news\/\d{4}-\d\d-\d\d-[a-z0-9-]+\.md$/;
const added = [];
for (const { status, file } of diff) {
  if (!/^news\/[^/]+$/.test(file)) { bad(`news/ の直下でないファイルを変えている: ${file}`); continue; }
  if (status === 'D') { bad(`ファイルを消している: ${file}`); continue; }
  if (status !== 'A' && status !== 'M') { bad(`読めない変更の種類 ${status}: ${file}`); continue; }
  if (!fs.lstatSync(path.join(work, file)).isFile()) { bad(`ふつうのファイルでない（シンボリックリンクなど）: ${file}`); continue; }
  if (file.endsWith('.md')) {
    if (status === 'A' && RE_NOTE.test(file)) added.push(file);
    else if (status === 'A') bad(`ノートの名前の形（YYYY-MM-DD-題.md。題は英小文字・数字・ハイフン）でない: ${file}`);
    else if (file !== 'news/README.md') bad(`既にあるノートを変えている: ${file}`);
  } else if (!/^news\/[0-9a-z-]+\.html$/.test(file)) bad(`ノートでもページでもないファイル: ${file}`);
}
if (added.length !== 1) bad(`足すノートは 1 つだけ（今は ${added.length} つ: ${added.join('、') || 'なし'}）`);

/* ---------- ノートの中身 ---------- */
const note = added[0];
if (note && added.length === 1) {
  const buf = fs.readFileSync(path.join(work, note));
  const src = buf.toString('utf8');
  if (buf.length > MAX_BYTES) bad(`ノートが大きい: ${buf.length} バイト（${MAX_BYTES} バイトまで）`);
  if (!/^<!--\s*kind:\s*daily\s*-->\s*$/m.test(src)) bad('日刊の印 <!-- kind: daily --> の行が無い');

  const heads = src.split('\n').filter((l) => /^#{1,2}\s/.test(l)).map((l) => l.replace(/<!--[\s\S]*?-->/g, '').trim());
  if (!/^#\s/.test(src)) bad('1 行目が題（# …）でない');
  if (heads.filter((h) => /^#\s/.test(h)).length !== 1) bad('題（# …）は 1 つだけ');
  if (!heads.includes('## 要点')) bad('「## 要点」が無い');
  const scenes = heads.filter((h) => /^##\s/.test(h) && h !== '## 要点').length;
  if (scenes < 2 || scenes > 4) bad(`場面（要点のほかの ##）は 2〜4 つ（今は ${scenes} つ）`);

  /* 日付はニュースが出た日。日本時間の今日より先にはならない */
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const date = note.slice(5, 15);
  if (Number.isNaN(Date.parse(date))) bad(`名前の日付が日付でない: ${date}`);
  else if (date > today) bad(`名前の日付が未来: ${date}（今日は ${today}）`);

  /* リンクの行き先。[文字](URL) と、参照の定義 [名前]: URL */
  const urls = [...src.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).concat([...src.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(\S+)\s*$/gm)].map((m) => m[1]));
  for (const u of new Set(urls)) if (!/^https?:\/\//.test(u)) bad(`https:// か http:// で始まらないリンク: ${u}`);
  const RE_SCENE = new RegExp('^' + SITE.replace(/[.]/g, '\\.') + 'chapters/\\d\\d-[a-z0-9-]+\\.html#s\\d+$');
  const scenesLinked = new Set(urls.filter((u) => RE_SCENE.test(u)));
  if (scenesLinked.size < 2) bad(`章の場面へのリンク（…/chapters/NN-名前.html#sK）は 2 つ以上の場面に張る（今は ${scenesLinked.size} つ）`);
}

/* ---------- 結果 ---------- */
if (errors.length) {
  console.error('✗ 日刊のノートのプルリクエストとして受け取れない:');
  for (const e of errors) console.error('  ・' + e);
  process.exit(1);
}
const page = note.replace(/\.md$/, '.html');
const month = `news/${note.slice(5, 12)}.html`;
console.log(`✓ 変わるファイル ${diff.length} つ、足すノート ${note}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `note=${page}\nmonth=${month}\n`);
