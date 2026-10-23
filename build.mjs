#!/usr/bin/env node
//
// build.mjs · builds the viewer from the archive: the collections, every item and its decision
//
// The viewer is one html file with a star and a trash button per item. Marks live in the browser
// (localStorage), and "Export decisions" downloads them as json. The data goes to `data.js` next to
// the files and the viewer loads it with a <script> tag, so it works from file:// with a double click.
//
//   node build.mjs [--archive ./archive] [--out <viewer.html>]
//   node build.mjs --apply "<decisions.json>"
//
// Without --out, the viewer is written as `viewer.html` inside the archive. With --out somewhere
// else, it points to the archive with an absolute file:// URL.
//
// --apply takes the json from "Export decisions". Trashed items move to `trash/` inside the archive
// and leave the viewer; starred ones keep their star. Nothing is ever deleted here: emptying `trash/`
// is up to you.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname, basename, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, 'template.html');

const args = process.argv.slice(2);
let archive = resolve('archive'), out = '';
const apply = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--archive') archive = resolve(args[++i]);
  else if (args[i] === '--out') out = resolve(args[++i]);
  else if (args[i] === '--apply') apply.push(args[++i]);
}
out ||= join(archive, 'viewer.html');

// The newest manifest wins: it is the state of the collections today
const manifestsDir = join(archive, 'manifests');
const manifests = existsSync(manifestsDir) ? readdirSync(manifestsDir).filter((f) => f.endsWith('.json')).sort() : [];
if (!manifests.length) { console.error(`No manifests in ${manifestsDir}: run download.mjs first`); process.exit(1); }
const manifest = JSON.parse(readFileSync(join(manifestsDir, manifests.at(-1)), 'utf8'));

const decisionsPath = join(archive, 'decisions.json');
const decisions = existsSync(decisionsPath) ? JSON.parse(readFileSync(decisionsPath, 'utf8')) : { starred: [], trashed: [] };
const failed = existsSync(join(archive, 'failed.json')) ? JSON.parse(readFileSync(join(archive, 'failed.json'), 'utf8')) : {};

for (const a of apply) {
  const dec = JSON.parse(readFileSync(a, 'utf8'));
  const trash = join(archive, 'trash');
  let moved = 0;
  for (const id of dec.trashed || []) {
    for (const [dir, name] of [['videos', `${id}.mp4`], ['covers', `${id}.jpg`], ['photos', id]]) {
      const from = join(archive, dir, name);
      if (!existsSync(from)) continue;
      mkdirSync(join(trash, dir), { recursive: true });
      renameSync(from, join(trash, dir, name));
      moved++;
    }
  }
  const s = new Set([...decisions.starred, ...(dec.starred || [])]);
  const t = new Set([...decisions.trashed, ...(dec.trashed || [])]);
  for (const id of t) s.delete(id);
  decisions.starred = [...s]; decisions.trashed = [...t];
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 1));
  console.log(`${basename(a)}: ${dec.starred?.length || 0} starred, ${dec.trashed?.length || 0} trashed (${moved} files moved to trash/)`);
}

const trashed = new Set(decisions.trashed);
const items = {};
const collections = manifest.collections.map((c) => ({
  name: c.name,
  ids: c.items.map((it) => it.id).filter((id) => !trashed.has(id)),
}));
for (const c of manifest.collections) for (const it of c.items) {
  if (trashed.has(it.id) || items[it.id]) continue;
  const onDisk = it.type === 'photos'
    ? (existsSync(join(archive, 'photos', it.id)) ? readdirSync(join(archive, 'photos', it.id)) : [])
    : (existsSync(join(archive, 'videos', `${it.id}.mp4`)) ? ['video'] : []);
  items[it.id] = {
    a: it.author, n: it.nickname, t: it.text, c: it.created, d: it.duration,
    l: it.likes, v: it.views, k: it.comments, m: it.music,
    type: it.type,
    p: it.type === 'photos' ? onDisk.filter((f) => f.endsWith('.jpg')).length : undefined,
    audio: it.type === 'photos' ? onDisk.includes('audio.mp3') : undefined,
    state: onDisk.length ? 'ok' : failed[it.id] ? 'failed' : 'pending',
    reason: failed[it.id]?.reason,
  };
}

// Relative when the viewer sits inside the archive, so the folder can be moved or shared as is
const outDir = dirname(out);
const inside = !relative(archive, outDir).startsWith('..');
const base = inside ? (relative(outDir, archive).replace(/\\/g, '/') || '.') + '/' : pathToFileURL(archive).href + '/';

// The base lives in each viewer, not in data.js, so viewers in different places can share one archive
const data = { account: manifest.account, extracted: manifest.extracted, built: new Date().toISOString(), collections, items, starred: decisions.starred };
writeFileSync(join(archive, 'data.js'), `window.TIKTOK = ${JSON.stringify(data)};\n`);

mkdirSync(outDir, { recursive: true });
writeFileSync(out, readFileSync(TEMPLATE, 'utf8').replaceAll('__BASE__', base));

const all = Object.values(items);
const count = (s) => all.filter((x) => x.state === s).length;
console.log(`viewer: ${collections.length} collections, ${all.length} items (${count('ok')} on disk, ${count('failed')} failed, ${count('pending')} pending), at ${out}`);
