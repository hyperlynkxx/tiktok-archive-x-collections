#!/usr/bin/env node
//
// make-demo.mjs · builds the public demo in docs/: two collections, three videos and three
// slideshows, all generated with ffmpeg
//
// The demo never uses real TikTok videos: publishing them would republish other people's work.
// Every file here is a gradient with a label and a soft chord, laid out exactly like a real
// archive, and the viewer is the same one build.mjs writes for a real run.
//
//   node demo/make-demo.mjs
//
// Then commit docs/. GitHub Pages serves it from main /docs.

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { platform, homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');

function ffmpegPath() {
  const r = spawnSync(platform() === 'win32' ? 'where' : 'which', [platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
  const winget = join(homedir(), 'AppData/Local/Microsoft/WinGet/Packages');
  const found = spawnSync('cmd', ['/c', 'dir', '/s', '/b', join(winget, 'ffmpeg.exe')], { encoding: 'utf8' });
  if (found.status === 0) return found.stdout.split(/\r?\n/)[0].trim();
  console.error('ffmpeg not found'); process.exit(1);
}
const FFMPEG = ffmpegPath();
const FONT = ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
  .find((f) => existsSync(f));
// In a filter string the drive colon has to be escaped
const font = FONT ? `fontfile='${FONT.replace(/:/g, '\\:')}':` : '';

const ff = (args) => {
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
};
const label = (big, small) =>
  `drawtext=${font}text='${big}':fontcolor=white:fontsize=72:x=(w-tw)/2:y=(h-th)/2-40:shadowcolor=black@0.35:shadowx=2:shadowy=2,` +
  `drawtext=${font}text='${small}':fontcolor=white@0.85:fontsize=34:x=(w-tw)/2:y=(h-th)/2+60`;
const chord = (a, b, c, seconds) =>
  ['-f', 'lavfi', '-t', String(seconds), '-i', `aevalsrc=0.12*sin(${a}*2*PI*t)+0.09*sin(${b}*2*PI*t)+0.07*sin(${c}*2*PI*t):s=44100`];

rmSync(OUT, { recursive: true, force: true });
for (const d of ['videos', 'photos', 'covers', 'manifests']) mkdirSync(join(OUT, d), { recursive: true });

const now = Math.floor(Date.now() / 1000);
const items = [];

const videos = [
  { id: '7000000000000000001', colors: '0x0f3d3e:0x3fa796', title: 'Sample video 1', sub: 'a calm loop', notes: [220, 277, 330] },
  { id: '7000000000000000002', colors: '0x3b1f5e:0xd96c8b', title: 'Sample video 2', sub: 'another saved clip', notes: [196, 247, 294] },
  { id: '7000000000000000003', colors: '0x14213d:0xfca311', title: 'Sample video 3', sub: 'in both collections', notes: [262, 330, 392] },
];
for (const [i, v] of videos.entries()) {
  const mp4 = join(OUT, 'videos', `${v.id}.mp4`);
  ff(['-f', 'lavfi', '-t', '8', '-i', `gradients=s=720x1280:c0=${v.colors.split(':')[0]}:c1=${v.colors.split(':')[1]}:speed=0.02:r=30`,
    ...chord(...v.notes, 8), '-vf', label(v.title, v.sub), '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', mp4]);
  ff(['-ss', '1', '-i', mp4, '-frames:v', '1', '-q:v', '4', join(OUT, 'covers', `${v.id}.jpg`)]);
  items.push({ id: v.id, author: 'sample.creator', nickname: 'Sample Creator', text: `${v.title}: ${v.sub}. Generated for the demo, not a real TikTok. #demo #archive`,
    created: now - 86400 * (30 + i * 9), duration: 8, likes: 12400 * (i + 1), views: 98000 * (i + 2), comments: 310 * (i + 1), saves: 900 * (i + 1),
    cover: '', type: 'video', music: 'original sound · Sample Creator' });
}

const slideshows = [
  { id: '7000000000000000011', title: 'Slideshow 1', palette: ['0x264653', '0x2a9d8f', '0xe9c46a', '0xf4a261'], notes: [220, 262, 330] },
  { id: '7000000000000000012', title: 'Slideshow 2', palette: ['0x22223b', '0x4a4e69', '0x9a8c98', '0xc9ada7'], notes: [196, 247, 294] },
  { id: '7000000000000000013', title: 'Slideshow 3', palette: ['0x780000', '0xc1121f', '0xfdf0d5', '0x669bbc'], notes: [247, 311, 370] },
];
for (const [i, s] of slideshows.entries()) {
  const dir = join(OUT, 'photos', s.id);
  mkdirSync(dir, { recursive: true });
  s.palette.forEach((c, k) => {
    const next = s.palette[(k + 1) % s.palette.length];
    ff(['-f', 'lavfi', '-i', `gradients=s=750x1000:c0=${c}:c1=${next}:x0=0:y0=0:x1=750:y1=1000`, '-frames:v', '1',
      '-vf', label(`${s.title}`, `photo ${k + 1} of ${s.palette.length}`), '-q:v', '4', join(dir, `${String(k + 1).padStart(2, '0')}.jpg`)]);
  });
  ff([...chord(...s.notes, 12), '-c:a', 'libmp3lame', '-b:a', '64k', join(dir, 'audio.mp3')]);
  ff(['-i', join(dir, '01.jpg'), '-q:v', '4', join(OUT, 'covers', `${s.id}.jpg`)]);
  items.push({ id: s.id, author: 'sample.photos', nickname: 'Sample Photos', text: `${s.title}: ${s.palette.length} photos with audio. Use ← → to flip through them. #demo #slideshow`,
    created: now - 86400 * (12 + i * 7), duration: null, likes: 5300 * (i + 1), views: 41000 * (i + 1), comments: 120 * (i + 1), saves: 640 * (i + 1),
    cover: '', type: 'photos', photos: [], audio: '', music: 'demo chord · Sample Photos' });
}

const byId = Object.fromEntries(items.map((it) => [it.id, it]));
const manifest = {
  account: 'demo',
  extracted: new Date().toISOString(),
  collections: [
    { id: '1', name: '🎞️ things to rewatch', total: 4, items: ['7000000000000000001', '7000000000000000002', '7000000000000000003', '7000000000000000011'].map((id) => byId[id]) },
    { id: '2', name: '📸 slideshows i loved', total: 4, items: ['7000000000000000012', '7000000000000000013', '7000000000000000003', '7000000000000000011'].map((id) => byId[id]) },
  ],
};
writeFileSync(join(OUT, 'manifests', 'tiktok-collections-demo.json'), JSON.stringify(manifest, null, 1));

const r = spawnSync(process.execPath, [join(ROOT, 'build.mjs'), '--archive', OUT, '--out', join(OUT, 'index.html')], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);

// A strip on top that says what this is, so nobody takes it for a real archive
const html = readFileSync(join(OUT, 'index.html'), 'utf8').replace('<body>', `<body>
<div style="background:#111;color:#eee;font:13px/1.5 Inter,system-ui,sans-serif;padding:10px 16px;text-align:center">
  Demo of <a href="https://github.com/hyperlynkxx/tiktok-archive-x-collections" style="color:#fff">tiktok-archive-x-collections</a>, with generated sample media, not real TikToks. Click a cover; ↑ ↓ to move, ← → for slideshow photos, S to star, D to trash.
</div>`);
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`demo ready in ${OUT}`);
