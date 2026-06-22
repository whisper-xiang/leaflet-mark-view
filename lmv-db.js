// Shared IndexedDB: last-open handle + favorites (FileSystemHandle).
const LMV = (() => {
  const DB_NAME = 'lmv-db';
  const DB_VERSION = 2;
  const README_FAV_ID = '__readme__';
  const README_DISMISS_KEY = 'lmv-readme-fav-dismissed';
  const PROJECT_README_NAME = 'README.md';
  const BUILTIN_BG_IMAGES = ['public/1.png', 'public/2.png', 'public/3.png'];

  function applyRandomBgImage() {
    const path = BUILTIN_BG_IMAGES[Math.floor(Math.random() * BUILTIN_BG_IMAGES.length)];
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
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  function isReadmeFavoriteDismissed() {
    return localStorage.getItem(README_DISMISS_KEY) === '1';
  }

  function getProjectReadmeUrl() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(PROJECT_README_NAME);
    }
    return new URL(PROJECT_README_NAME, location.href).href;
  }

  function projectReadmeFavorite() {
    return {
      id: README_FAV_ID,
      name: PROJECT_README_NAME,
      kind: 'builtin',
      pinned: true,
      addedAt: 0,
    };
  }

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

  async function listFavoritesFromDB() {
    try {
      const db = await openDB();
      return new Promise(res => {
        const tx = db.transaction('favorites', 'readonly');
        const req = tx.objectStore('favorites').getAll();
        req.onsuccess = () => res(req.result ?? []);
        req.onerror = () => res([]);
      });
    } catch (_) { return []; }
  }

  async function listFavorites() {
    const items = await listFavoritesFromDB();
    items.sort((a, b) => b.addedAt - a.addedAt);
    if (!isReadmeFavoriteDismissed()) {
      items.unshift(projectReadmeFavorite());
    }
    return items;
  }

  async function upsertFavorite(entry) {
    const db = await openDB();
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').put(entry);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  }

  async function addFavorite(handle) {
    const favorites = await listFavoritesFromDB();
    if (favorites.some(f => f.name === handle.name && f.kind === handle.kind)) {
      return { added: false, reason: 'duplicate' };
    }
    const entry = {
      id: crypto.randomUUID(),
      name: handle.name,
      kind: handle.kind,
      handle,
      pinned: false,
      addedAt: Date.now(),
    };
    try {
      await upsertFavorite(entry);
      return { added: true, entry };
    } catch (_) {
      return { added: false, reason: 'error' };
    }
  }

  async function removeFavorite(id) {
    if (id === README_FAV_ID) {
      localStorage.setItem(README_DISMISS_KEY, '1');
      return;
    }
    try {
      const db = await openDB();
      const tx = db.transaction('favorites', 'readwrite');
      tx.objectStore('favorites').delete(id);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (_) {}
  }

  function isProjectReadmeUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.protocol === 'chrome-extension:' && /\/README\.md$/i.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  function restoreProjectReadmeFavorite() {
    localStorage.removeItem(README_DISMISS_KEY);
  }

  function openProjectReadmeInViewer() {
    const src = getProjectReadmeUrl();
    location.href = 'viewer.html'
      + '?name=' + encodeURIComponent(PROJECT_README_NAME)
      + '&src=' + encodeURIComponent(src)
      + '&builtin=readme';
  }

  async function openHandleInViewer(handle) {
    await storeHandle(handle);
    location.href = 'viewer.html';
  }

  async function openFavorite(fav) {
    if (!fav) return;
    if (fav.kind === 'builtin') {
      openProjectReadmeInViewer();
      return;
    }
    if (fav.handle) await openHandleInViewer(fav.handle);
  }

  function favoriteIcon(kind) {
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

  async function renderFavoritesList(container, { onChange } = {}) {
    const favorites = await listFavorites();
    if (!favorites.length) {
      container.innerHTML = '<li class="favorites-empty">暂无收藏</li>';
      return;
    }

    container.innerHTML = favorites.map(f => `
      <li class="favorites-row${f.pinned ? ' is-pinned' : ''}">
        <button type="button" class="favorites-item" data-id="${escHtml(f.id)}">
          <span class="favorites-item-icon">${favoriteIcon(f.kind === 'directory' ? 'directory' : 'file')}</span>
          <span class="favorites-item-name">${escHtml(f.name)}</span>
        </button>
        <button type="button" class="favorites-remove" data-id="${escHtml(f.id)}" aria-label="取消收藏" title="取消收藏">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </li>
    `).join('');

    container.querySelectorAll('.favorites-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fav = favorites.find(x => x.id === btn.dataset.id);
        await openFavorite(fav);
      });
    });

    container.querySelectorAll('.favorites-remove').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await removeFavorite(btn.dataset.id);
        await renderFavoritesList(container, { onChange });
        onChange?.();
      });
    });
  }

  return {
    README_FAV_ID,
    BUILTIN_BG_IMAGES,
    applyRandomBgImage,
    storeHandle,
    getStoredHandle,
    listFavorites,
    addFavorite,
    removeFavorite,
    isReadmeFavoriteDismissed,
    isProjectReadmeUrl,
    restoreProjectReadmeFavorite,
    openProjectReadmeInViewer,
    openHandleInViewer,
    openFavorite,
    renderFavoritesList,
  };
})();
