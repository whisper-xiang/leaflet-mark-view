// Shared IndexedDB: last-open handle + recents (recently opened FileSystemHandles).
const LMV = (() => {
  const DB_NAME = 'lmv-db';
  const DB_VERSION = 3;
  const MAX_RECENTS = 20;
  const BUILTIN_BG_IMAGES = ['public/1.png', 'public/2.png', 'public/3.png'];

  function applyRandomBgImage() {
    const path = 'public/2.png';
    document.documentElement.style.setProperty('--bg-image', `url("${path}")`);
    return path;
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
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
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

      // Trim to MAX_RECENTS by removing oldest entries.
      const all = await listRecents();
      if (all.length > MAX_RECENTS) {
        const toDelete = all.slice(MAX_RECENTS);
        const tx2 = db.transaction('recents', 'readwrite');
        toDelete.forEach(r => tx2.objectStore('recents').delete(r.id));
        await new Promise((res, rej) => { tx2.oncomplete = res; tx2.onerror = rej; });
      }
    } catch (_) {}
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
    if (!recent?.handle) return;
    await openHandleInViewer(recent.handle);
  }

  // ── UI helpers ────────────────────────────────────────────────────

  function entryIcon(kind) {
    if (kind === 'directory') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
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
    applyRandomBgImage,
    storeHandle,
    getStoredHandle,
    addRecent,
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
