#!/usr/bin/env node
//
// download.mjs · downloads everything a collections manifest lists into a local archive
//
//   - one file per item id: `videos/{id}.mp4` exists once even if it sits in several collections
//   - H.264, requested from yt-dlp (no transcoding). TikTok serves most videos as HEVC by default,
//     which Chrome on Windows often can't play
//   - photo posts (slideshows) as images plus their audio, in `photos/{id}/`
//   - a local cover per item in `covers/{id}.jpg`, since TikTok's CDN cover URLs expire
//   - incremental: whatever is already on disk is never requested again
//   - failures in `failed.json`, one entry per item with a one-line reason
//
// Cookies come from a Netscape cookies.txt export (e.g. the "Get cookies.txt LOCALLY" extension).
// `_waftokenid` is dropped before handing them to yt-dlp: it is bound to the browser, and with it
// TikTok answers 403 to everything. The filtered copy lives in the OS temp dir and is deleted on exit.
//
//   node download.mjs <manifest.json> --cookies <cookies.txt> [--archive ./archive] [--only "<collection>"] [--threads 3]
//
// When it finishes (and every five minutes while it runs) it rebuilds the viewer with build.mjs.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let archive = resolve('archive'), cookies = '', threads = 3;
const only = [], inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--archive') archive = resolve(args[++i]);
  else if (args[i] === '--cookies') cookies = args[++i];
  else if (args[i] === '--only') only.push(args[++i]);
  else if (args[i] === '--threads') threads = Math.max(1, +args[++i]);
  else inputs.push(args[i]);
}
if (inputs.length !== 1 || !cookies) {
  console.error('Usage: node download.mjs <manifest.json> --cookies <cookies.txt> [--archive ./archive] [--only "<collection>"] [--threads 3]');
  process.exit(1);
}

// yt-dlp and ffmpeg from PATH; on Windows, winget doesn't always leave its alias on the PATH of an
// already-open shell, so its package folder is searched too
function tool(name) {
  const exe = platform() === 'win32' ? `${name}.exe` : name;
  const r = spawnSync(platform() === 'win32' ? 'where' : 'which', [exe], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
  if (platform() === 'win32') {
    const search = (dir, depth) => {
      for (const e of existsSync(dir) ? readdirSync(dir) : []) {
        const p = join(dir, e);
        if (e.toLowerCase() === exe) return p;
        if (depth > 0 && statSync(p).isDirectory()) { const h = search(p, depth - 1); if (h) return h; }
      }
      return null;
    };
    const found = search(join(homedir(), 'AppData/Local/Microsoft/WinGet/Packages'), 4);
    if (found) return found;
  }
  console.error(`Can't find ${name}. Install it (Windows: winget install ${name === 'yt-dlp' ? 'yt-dlp.yt-dlp' : 'Gyan.FFmpeg'}; macOS: brew install ${name}).`);
  process.exit(1);
}
const YTDLP = tool('yt-dlp');
const FFMPEG = tool('ffmpeg');

const manifest = JSON.parse(readFileSync(inputs[0], 'utf8'));
const collections = manifest.collections.filter((c) => !only.length || only.includes(c.name));
if (!collections.length) { console.error('No collection matches --only'); process.exit(1); }

for (const d of ['videos', 'photos', 'covers', 'manifests']) mkdirSync(join(archive, d), { recursive: true });
copyFileSync(inputs[0], join(archive, 'manifests', basename(inputs[0])));

const items = new Map();
for (const c of collections) for (const it of c.items) items.set(it.id, it);
const done = (it) => it.type === 'photos'
  ? existsSync(join(archive, 'photos', it.id, '01.jpg'))
  : existsSync(join(archive, 'videos', `${it.id}.mp4`));
const pending = [...items.values()].filter((it) => !done(it));
const videos = pending.filter((it) => it.type === 'video');
const photos = pending.filter((it) => it.type === 'photos');
console.log(`${collections.length} collections, ${items.size} items, ${pending.length} to download (${videos.length} videos, ${photos.length} slideshows)`);

const failedPath = join(archive, 'failed.json');
const failed = existsSync(failedPath) ? JSON.parse(readFileSync(failedPath, 'utf8')) : {};
const fail = (it, reason) => { failed[it.id] = { author: it.author, link: `https://www.tiktok.com/@${it.author}/video/${it.id}`, reason, when: new Date().toISOString() }; };

// The cookies copy without _waftokenid
const filteredCookies = join(tmpdir(), `tiktok-cookies-${process.pid}.txt`);
writeFileSync(filteredCookies, readFileSync(cookies, 'utf8').split(/\r?\n/)
  .filter((l) => l.startsWith('#') || !l.trim() || l.split('\t')[5] !== '_waftokenid').join('\n') + '\n');
const cleanup = () => { try { rmSync(filteredCookies); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

// One yt-dlp per thread, each with its slice of the list; errors are read from stderr, one per id
function runYtdlp(batch, n) {
  return new Promise((done_) => {
    if (!batch.length) return done_();
    const list = join(tmpdir(), `tiktok-list-${process.pid}-${n}.txt`);
    writeFileSync(list, batch.map((it) => `https://www.tiktok.com/@${it.author || '_'}/video/${it.id}`).join('\n') + '\n');
    const p = spawn(YTDLP, [
      '--cookies', filteredCookies, '--ffmpeg-location', FFMPEG,
      '-S', 'vcodec:h264,res,acodec:aac', '--merge-output-format', 'mp4',
      '-o', join(archive, 'videos', '%(id)s.%(ext)s'),
      '--write-thumbnail', '--convert-thumbnails', 'jpg', '-o', `thumbnail:${join(archive, 'covers', '%(id)s.%(ext)s')}`,
      '--no-overwrites', '--ignore-errors', '--no-warnings', '--no-progress', '--quiet',
      '--retries', '5', '--sleep-requests', '0.5', '--print', 'after_move:OK %(id)s',
      '-a', list,
    ]);
    let ok = 0;
    const read = (buf, err) => {
      for (const l of buf.toString().split(/\r?\n/)) {
        if (l.startsWith('OK ')) { ok++; delete failed[l.slice(3).trim()]; if (ok % 25 === 0) console.log(`  thread ${n}: ${ok}/${batch.length}`); }
        const m = err && /^ERROR: \[[^\]]+\] (\d{15,}): (.*)$/.exec(l);
        if (m) { const it = items.get(m[1]); if (it) fail(it, m[2].slice(0, 200)); }
      }
    };
    p.stdout.on('data', (b) => read(b, false));
    p.stderr.on('data', (b) => read(b, true));
    p.on('close', () => { rmSync(list, { force: true }); console.log(`  thread ${n}: finished, ${ok} of ${batch.length}`); done_(); });
  });
}

async function fetchFile(url, dest) {
  const r = await fetch(url, { headers: { Referer: 'https://www.tiktok.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

// Slideshows: images and audio come in the manifest, as signed URLs
async function downloadPhotos(it) {
  const dir = join(archive, 'photos', it.id);
  mkdirSync(dir, { recursive: true });
  try {
    for (let i = 0; i < it.photos.length; i++) {
      const raw = join(dir, `${String(i + 1).padStart(2, '0')}.orig`);
      const final = raw.replace(/\.orig$/, '.jpg');
      if (existsSync(final)) continue;
      await fetchFile(it.photos[i], raw);
      // Some arrive as webp or heic even when jpeg is asked for: ffmpeg normalizes them
      const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, final]);
      rmSync(raw, { force: true });
      if (r.status !== 0) throw new Error(`image ${i + 1} could not be converted`);
    }
    if (it.audio && !existsSync(join(dir, 'audio.mp3'))) await fetchFile(it.audio, join(dir, 'audio.mp3')).catch(() => {});
    if (!existsSync(join(archive, 'covers', `${it.id}.jpg`))) copyFileSync(join(dir, '01.jpg'), join(archive, 'covers', `${it.id}.jpg`));
    delete failed[it.id];
  } catch (e) {
    fail(it, `slideshow: ${e.message}`);
    rmSync(dir, { recursive: true, force: true });
  }
}

// The viewer is rebuilt every five minutes, so what's already down can be browsed during a run
// that takes hours
const rebuild = () => spawn(process.execPath, [join(HERE, 'build.mjs'), '--archive', archive], { stdio: 'ignore' });
const clock = setInterval(rebuild, 5 * 60 * 1000);

const batches = Array.from({ length: threads }, (_, n) => videos.filter((_, i) => i % threads === n));
await Promise.all([
  ...batches.map((b, n) => runYtdlp(b, n + 1)),
  (async () => { for (const [i, it] of photos.entries()) { await downloadPhotos(it); if ((i + 1) % 25 === 0) console.log(`  slideshows: ${i + 1}/${photos.length}`); } })(),
]);

clearInterval(clock);

// Some posts are served as audio only and yt-dlp leaves an .mp3: they become an mp4 with the cover
// as a still frame, so the viewer plays them like any other
for (const it of videos) {
  const mp3 = join(archive, 'videos', `${it.id}.mp3`), cover = join(archive, 'covers', `${it.id}.jpg`);
  if (!existsSync(mp3) || done(it)) continue;
  const source = existsSync(cover) ? ['-loop', '1', '-i', cover] : ['-f', 'lavfi', '-i', 'color=c=black:s=720x1280'];
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...source, '-i', mp3, '-shortest', '-c:v', 'libx264', '-tune', 'stillimage',
    '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', join(archive, 'videos', `${it.id}.mp4`)]);
  if (r.status === 0) { rmSync(mp3); delete failed[it.id]; }
}

// Whatever yt-dlp neither downloaded nor reported is a failure too
for (const it of pending) if (!done(it) && !failed[it.id]) fail(it, 'not downloaded, and yt-dlp gave no reason');
writeFileSync(failedPath, JSON.stringify(failed, null, 1));

const left = pending.filter((it) => !done(it)).length;
console.log(`Downloaded ${pending.length - left} of ${pending.length}. Failed in total: ${Object.keys(failed).length} (failed.json)`);
if (left) console.log('Run the same command again: most failures ("IP address is blocked", "Video not available") are TikTok rate-limiting, and succeed on a second pass.');

spawnSync(process.execPath, [join(HERE, 'build.mjs'), '--archive', archive], { stdio: 'inherit' });
