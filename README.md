# TikTok archive x collections

**Back up every video you saved on TikTok, organized by the collections you made, and browse it
offline in a viewer where you decide what stays.**

[Leer en español](README.es.md)

TikTok lets you save videos into collections, but gives you no way to export them. Its official data
download lists your favorites as bare links, without the collections. This tool fills that gap:

- **Collections stay collections.** Each item is stored once by its id, and the viewer shows every
  collection it belongs to.
- **Videos come down in H.264.** TikTok serves most videos as HEVC by default, and Chrome on Windows
  often can't play HEVC.
- **Slideshows (photo posts) are included**, as their images plus their audio. Most downloaders skip
  them.
- **Covers are stored locally**, because TikTok's CDN cover URLs expire within days.
- **Runs are incremental.** Run it again in six months and it only downloads what's new.
- **Each failure is one line** in `failed.json`, with its reason.
- **The viewer is a single html file** that works offline with a double click. It has a star and a
  trash button per item, keyboard navigation, search, and an export of your decisions.

## How it works

```
 your browser (logged in)          your terminal                         any browser
┌──────────────────────┐    ┌─────────────────────────────────┐    ┌────────────────────┐
│ extract.js           │──▶ │ download.mjs                    │──▶ │ archive/viewer.html│
│ lists collections +  │json│ yt-dlp (H.264) + photos + covers│    │ star · trash ·     │
│ items via TikTok API │    │ → archive/                      │    │ export decisions   │
└──────────────────────┘    └─────────────────────────────────┘    └────────────────────┘
                                                                     │ decisions.json
                                        build.mjs --apply  ◀─────────┘
                                        trashed items → archive/trash/
```

The collection list has to come from a browser tab. From a terminal, TikTok's firewall answers its
API with a JavaScript challenge or an empty body, because each call needs a signature that TikTok's
own page script adds. Inside a tiktok.com tab that script signs every `fetch()`, so `extract.js`
simply calls the same API the site uses.

## Requirements

- **Node.js 18+**
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**, kept up to date, because TikTok changes often
- **[ffmpeg](https://ffmpeg.org/)**
- **A Chromium browser** where you're logged in to TikTok
- **A cookies.txt exporter**, such as [Get cookies.txt LOCALLY](https://github.com/kairi003/Get-cookies.txt-LOCALLY)
  (Chrome/Edge) or [cookies.txt](https://addons.mozilla.org/firefox/addon/cookies-txt/) (Firefox)

```bash
# Windows
winget install yt-dlp.yt-dlp Gyan.FFmpeg
# macOS
brew install yt-dlp ffmpeg
```

## Step by step

### 1. Export your cookies

Some videos are age-restricted or only visible when logged in, so yt-dlp needs your session.

1. Open https://www.tiktok.com, logged in.
2. Click the extension, then **Export** for the current site.
3. Save the file somewhere **outside any repo or synced folder**, for example
   `~/Downloads/www.tiktok.com_cookies.txt`.

> **This file is your logged-in session.** Anyone who has it is logged in as you. Don't share it,
> don't commit it, and delete it when the run is done. `.gitignore` here excludes `*cookies*.txt`
> just in case.

### 2. Extract the manifest

Open https://www.tiktok.com/explore, logged in. Any regular page works, but the account data
`extract.js` needs isn't on every page. Open DevTools (F12), then **Console**. Paste the whole
content of [`extract.js`](extract.js) and press Enter. If Chrome asks, type `allow pasting` first.

It prints one line per collection and then downloads `tiktok-collections-YYYY-MM-DD.json`. It takes
a while: about 20 minutes for 50 collections and 9,000 items.

> **Run step 3 the same day.** Slideshow image and audio URLs in the manifest are signed and expire
> within days.

### 3. Download

```bash
# Try a small collection first
node download.mjs ~/Downloads/tiktok-collections-2026-10-23.json --cookies ~/Downloads/www.tiktok.com_cookies.txt --only "my small collection"

# Then everything
node download.mjs ~/Downloads/tiktok-collections-2026-10-23.json --cookies ~/Downloads/www.tiktok.com_cookies.txt --threads 6
```

Everything goes to `./archive` unless you pass `--archive <folder>`. While it runs, the viewer is
rebuilt every five minutes, so you can start browsing before it's done.

**When it ends, run the exact same command again.** Most failures on the first pass
(`Your IP address is blocked from accessing this post`, `Video not available`) are TikTok
rate-limiting, not missing videos. In a real run of 7,856 items, 35 failed the first time and all 35
came down on the second pass.

### 4. Browse and decide

Open `archive/viewer.html`.

| Key | Does |
|---|---|
| ↑ ↓ / mouse wheel | Next or previous item |
| ← → | Next or previous photo in a slideshow |
| Space | Pause or play |
| S | Star |
| D | Trash |
| Esc | Close |

Your marks are saved in the browser. **Export decisions** downloads them as
`tiktok-decisions-YYYY-MM-DD.json`.

### 5. Apply your decisions

```bash
node build.mjs --apply ~/Downloads/tiktok-decisions-2026-10-23.json
```

Trashed items move to `archive/trash/` and leave the viewer, and starred ones keep their star.
**Nothing is deleted.** Emptying `trash/` is up to you.

## The archive

```
archive/
├── viewer.html          the viewer (open this)
├── data.js              everything the viewer shows, rebuilt by build.mjs
├── videos/{id}.mp4      one file per video, H.264
├── photos/{id}/         01.jpg, 02.jpg, … and audio.mp3 for each slideshow
├── covers/{id}.jpg      one cover per item
├── manifests/           every manifest you ran with; the newest one defines the collections
├── failed.json          what didn't come down, and why
├── decisions.json       what --apply has applied so far
└── trash/               what you trashed, waiting for you to delete it
```

To put the viewer somewhere else, for example in a notes vault while the videos stay on a big disk:

```bash
node build.mjs --archive "D:/tiktok/archive" --out "~/notes/tiktok viewer.html"
```

## Doing it with an AI agent

Every step was designed to be run by an agent, and that's how it was first run: with
[Claude Code](https://claude.com/claude-code) plus [Claude in Chrome](https://claude.com/chrome),
which lets the agent act in your real, logged-in Chrome.

- **The agent runs `extract.js` in your tab.** It can launch it without waiting and poll
  `window.__tiktokProgress` until `window.__tiktokResult` appears.
- **It runs `download.mjs` in the background**, re-runs it for the failures, and verifies the
  archive against the manifest.
- **The cookies export stays a human step.** The agent never needs to see the file: it only passes
  its path.

A prompt that works:

> Back up my TikTok collections with tiktok-archive-x-collections. My cookies are at
> `~/Downloads/www.tiktok.com_cookies.txt`. Run extract.js in a tiktok.com tab through Claude in
> Chrome, test download.mjs on the smallest collection with slideshows, then run everything with 6
> threads in the background, re-run the failures, and verify every item of the manifest is on disk.

## What we learned, so you don't have to

- **`_waftokenid` breaks yt-dlp.** With the full cookies export, TikTok returned 403 to everything.
  That one cookie is a firewall token bound to the browser. `download.mjs` drops it from a temp copy
  of your cookies.
- **Collections report more items than they return.** TikTok keeps counting deleted and
  now-private videos. In one account, 8,990 declared became 8,185 real items.
- **TikTok's pagination lies sometimes.** It can answer `hasMore: false` long before the end: one
  extraction got 77 of 236 items in a collection, and 240 of 410 in another. `extract.js` reads each
  collection again until a pass adds nothing new.
- **Two manifests from the same day are fine.** `build.mjs` picks the newest by the extraction date
  inside each file, not by filename.
- **Threads.** 3 threads gave about 25 videos a minute, and 6 gave about 75. The bottleneck is
  TikTok's per-request latency, not bandwidth. Going far beyond 6 risks real blocks.
- **Size.** H.264 is heavier than HEVC. The average was about 11.5 MB per item, so plan around 90 GB
  per 8,000 items.
- **Cloud drives.** If the archive lives in Google Drive, OneDrive or Dropbox in streaming mode, mark
  the folder as available offline, or the viewer waits for every file to sync down.
- **Some posts come as audio only.** yt-dlp leaves an `.mp3`, and `download.mjs` turns it into an
  mp4 with the cover as a still frame.

## Scope and fair use

This is a tool for keeping a **personal backup of what you saved**, for your own viewing. The videos
belong to their creators, so don't republish them. Automated access may go against TikTok's terms.
Use it at your own risk, at a polite pace. Not affiliated with TikTok or ByteDance.

## License

[MIT](LICENSE)
