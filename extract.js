//
// extract.js · lists every TikTok collection of the logged-in account, with each item and its metadata
//
// WHY IN THE BROWSER: from a terminal, TikTok's WAF answers /api/ calls with a JavaScript challenge
// or an empty body, because every request needs a signature that TikTok's own script adds. Inside a
// tiktok.com tab that script patches fetch() and signs for you, so plain fetch() calls just work.
//
// HOW TO RUN: open https://www.tiktok.com while logged in, open DevTools > Console, paste this whole
// file and press Enter (or let an agent run it through Claude in Chrome). It downloads
// `tiktok-collections-YYYY-MM-DD.json`, which is what `download.mjs` reads. Progress is printed per
// collection and also exposed as `window.__tiktokProgress`, so an agent can poll it.
//
// Photo-post (slideshow) image and audio URLs are signed and expire within days: run `download.mjs`
// soon after extracting.

(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = async (route, params) => {
    const q = new URLSearchParams({ aid: '1988', app_name: 'tiktok_web', device_platform: 'web_pc', ...params });
    for (let attempt = 1; attempt <= 4; attempt++) {
      const r = await fetch(`/api/${route}/?${q}`, { credentials: 'include' });
      const text = await r.text();
      if (r.ok && text) return JSON.parse(text);
      await wait(1500 * attempt);
    }
    throw new Error(`/api/${route} did not answer: ${JSON.stringify(params)}`);
  };

  // The logged-in account, not whatever profile the tab happens to show
  const data = JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__')?.textContent || '{}');
  const me = data.__DEFAULT_SCOPE__?.['webapp.app-context']?.user;
  if (!me?.secUid) throw new Error('No logged-in session in this tab');

  const collections = [];
  for (let cursor = '0', more = true; more; ) {
    const d = await api('user/collection_list', { secUid: me.secUid, count: '30', cursor });
    collections.push(...(d.collectionList || []));
    more = !!d.hasMore; cursor = String(d.cursor ?? 0);
    await wait(400);
  }

  const bestImage = (u) => (u?.urlList || []).find((x) => /jpe?g/i.test(x)) || u?.urlList?.[0] || '';
  const item = (v) => ({
    id: v.id,
    author: v.author?.uniqueId || '',
    nickname: v.author?.nickname || '',
    text: v.desc || '',
    created: v.createTime ? Number(v.createTime) : null,
    duration: v.video?.duration || null,
    likes: v.stats?.diggCount ?? null,
    views: v.stats?.playCount ?? null,
    comments: v.stats?.commentCount ?? null,
    saves: v.stats?.collectCount ?? null,
    cover: v.video?.originCover || v.video?.cover || '',
    type: v.imagePost ? 'photos' : 'video',
    photos: v.imagePost ? v.imagePost.images.map((i) => bestImage(i.imageURL)) : undefined,
    audio: v.imagePost ? (v.music?.playUrl || '') : undefined,
    music: v.music ? `${v.music.title || ''} · ${v.music.authorName || ''}` : '',
  });

  const out = { account: me.uniqueId, extracted: new Date().toISOString(), collections: [] };
  for (const c of collections) {
    const items = [];
    for (let cursor = '0', more = true; more; ) {
      const d = await api('collection/item_list', { collectionId: c.collectionId, count: '30', cursor, sourceType: '113' });
      items.push(...(d.itemList || []).map(item));
      more = !!d.hasMore; cursor = String(d.cursor ?? 0);
      await wait(400);
    }
    out.collections.push({ id: c.collectionId, name: c.name, total: c.total, items });
    console.log(`${c.name}: ${items.length} of ${c.total}`);
    window.__tiktokProgress = `${out.collections.length}/${collections.length} collections`;
  }

  const name = `tiktok-collections-${new Date().toISOString().slice(0, 10)}.json`;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' })),
    download: name,
  });
  document.body.appendChild(a); a.click(); a.remove();

  const result = {
    file: name,
    collections: out.collections.length,
    items: out.collections.reduce((n, c) => n + c.items.length, 0),
    summary: out.collections.map((c) => `${c.name}: ${c.items.length}/${c.total}`),
  };
  window.__tiktokResult = result;
  return result;
})();
