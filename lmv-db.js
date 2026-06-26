// Shared IndexedDB: last-open handle + recents (recently opened FileSystemHandles).
const LMV = (() => {
  const DB_NAME = 'lmv-db';
  const DB_VERSION = 4;
  const MAX_RECENTS = 20;
  const BUILTIN_BG_IMAGES = ['public/1.png', 'public/2.png', 'public/3.png'];
  const DEFAULT_BG = 'public/2.png';

  function setBgVar(value) {
    document.documentElement.style.setProperty('--bg-image', value);
  }

  // Apply the background image. Sets the built-in default synchronously (so the
  // page never flashes a blank background), then swaps in the user's custom
  // image if one is stored. Used by both the home page and the viewer.
  function applyBgImage() {
    setBgVar(`url("${DEFAULT_BG}")`);
    getCustomBg()
      .then(blob => { if (blob) setBgVar(`url("${URL.createObjectURL(blob)}")`); })
      .catch(() => {});
    return DEFAULT_BG;
  }

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recents')) {
          db.createObjectStore('recents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('prefs')) {
          db.createObjectStore('prefs', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // ── Custom background image (stored as a Blob) ──────────────────────

  async function setCustomBg(blob) {
    try {
      const db = await openDB();
      const tx = db.transaction('prefs', 'readwrite');
      tx.objectStore('prefs').put({ id: 'custom-bg', blob });
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (_) {}
  }

  async function getCustomBg() {
    try {
      const db = await openDB();
      return new Promise(res => {
        const tx = db.transaction('prefs', 'readonly');
        const req = tx.objectStore('prefs').get('custom-bg');
        req.onsuccess = () => res(req.result?.blob ?? null);
        req.onerror = () => res(null);
      });
    } catch (_) { return null; }
  }

  async function clearCustomBg() {
    try {
      const db = await openDB();
      const tx = db.transaction('prefs', 'readwrite');
      tx.objectStore('prefs').delete('custom-bg');
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (_) {}
  }

  // ── Last-opened handle (used by reconnect banner) ───────────────────

  async function storeHandle(handle) {
    try {
      const db = await openDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put({ id: 'root', handle });
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (_) {}
  }

  async function getStoredHandle() {
    try {
      const db = await openDB();
      return new Promise(res => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('root');
        req.onsuccess = () => res(req.result?.handle ?? null);
        req.onerror = () => res(null);
      });
    } catch (_) { return null; }
  }

  // ── Recents ────────────────────────────────────────────────────────

  // Upsert a handle into recents; bump its openedAt timestamp.
  async function addRecent(handle) {
    if (!handle) return;
    try {
      const db = await openDB();
      const id = handle.name + ':' + handle.kind;
      const entry = { id, name: handle.name, kind: handle.kind, handle, openedAt: Date.now() };
      const tx = db.transaction('recents', 'readwrite');
      tx.objectStore('recents').put(entry);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });

      await trimRecents();
    } catch (_) {}
  }

  async function addRecentRemote(url, name) {
    if (!url) return;
    try {
      const db = await openDB();
      const id = 'remote:' + url;
      const entry = { id, name: name || url, kind: 'remote', url, openedAt: Date.now() };
      const tx = db.transaction('recents', 'readwrite');
      tx.objectStore('recents').put(entry);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });

      await trimRecents();
    } catch (_) {}
  }

  async function trimRecents() {
    const all = await listRecents();
    if (all.length <= MAX_RECENTS) return;
    const db = await openDB();
    const toDelete = all.slice(MAX_RECENTS);
    const tx = db.transaction('recents', 'readwrite');
    toDelete.forEach(r => tx.objectStore('recents').delete(r.id));
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  }

  async function listRecents() {
    try {
      const db = await openDB();
      const items = await new Promise(res => {
        const tx = db.transaction('recents', 'readonly');
        const req = tx.objectStore('recents').getAll();
        req.onsuccess = () => res(req.result ?? []);
        req.onerror = () => res([]);
      });
      items.sort((a, b) => b.openedAt - a.openedAt);
      return items;
    } catch (_) { return []; }
  }

  async function removeRecent(id) {
    try {
      const db = await openDB();
      const tx = db.transaction('recents', 'readwrite');
      tx.objectStore('recents').delete(id);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (_) {}
  }

  // ── Navigation helpers ─────────────────────────────────────────────

  function isProjectReadmeUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.protocol === 'chrome-extension:' && /\/README\.md$/i.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  function openProjectReadmeInViewer() {
    const name = 'README.md';
    const src = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL(name)
      : new URL(name, location.href).href;
    location.href = 'viewer.html'
      + '?name=' + encodeURIComponent(name)
      + '&src=' + encodeURIComponent(src)
      + '&builtin=readme';
  }

  async function openHandleInViewer(handle) {
    await storeHandle(handle);
    location.href = 'viewer.html';
  }

  async function openRecent(recent) {
    if (!recent) return;
    if (recent.kind === 'remote' && recent.url) {
      location.href = 'viewer.html'
        + '?src=' + encodeURIComponent(recent.url)
        + '&name=' + encodeURIComponent(recent.name);
      return;
    }
    if (recent.handle) await openHandleInViewer(recent.handle);
  }

  // ── UI helpers ────────────────────────────────────────────────────

  function entryIcon(kind) {
    if (kind === 'directory') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
    }
    if (kind === 'remote') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function renderRecentsList(container, { onChange } = {}) {
    const recents = await listRecents();
    if (!recents.length) {
      container.innerHTML = '<li class="favorites-empty">暂无最近打开记录</li>';
      return;
    }

    container.innerHTML = recents.map(r => `
      <li class="favorites-row">
        <button type="button" class="favorites-item" data-id="${escHtml(r.id)}">
          <span class="favorites-item-icon">${entryIcon(r.kind)}</span>
          <span class="favorites-item-name">${escHtml(r.name)}</span>
        </button>
        <button type="button" class="favorites-remove" data-id="${escHtml(r.id)}" aria-label="从列表移除" title="从列表移除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </li>
    `).join('');

    container.querySelectorAll('.favorites-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const recent = recents.find(x => x.id === btn.dataset.id);
        await openRecent(recent);
      });
    });

    container.querySelectorAll('.favorites-remove').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await removeRecent(btn.dataset.id);
        await renderRecentsList(container, { onChange });
        onChange?.();
      });
    });
  }

  return {
    BUILTIN_BG_IMAGES,
    applyBgImage,
    setCustomBg,
    getCustomBg,
    clearCustomBg,
    storeHandle,
    getStoredHandle,
    addRecent,
    addRecentRemote,
    listRecents,
    removeRecent,
    openRecent,
    isProjectReadmeUrl,
    openProjectReadmeInViewer,
    openHandleInViewer,
    renderRecentsList,
    escHtml,
  };
})();
