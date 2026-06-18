// ── IndexedDB handle storage (shared with viewer.js via same origin) ──
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('lmv-db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles', { keyPath: 'id' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
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
    return new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('root');
      req.onsuccess = () => res(req.result?.handle ?? null);
      req.onerror = () => res(null);
    });
  } catch (_) { return null; }
}

// ── Theme & background (sync visual state with viewer) ────────────────
function applyStoredTheme() {
  const theme = localStorage.getItem('lmv-theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function applyStoredBgImage() {
  const stored = localStorage.getItem('lmv-bg');
  if (stored) {
    document.documentElement.style.setProperty('--bg-image', `url("${stored}")`);
  }
}

// ── Open actions ──────────────────────────────────────────────────────
async function selectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await storeHandle(handle);
    location.href = 'viewer.html';
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

async function selectFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] } }],
    });
    if (!handle) return;
    await storeHandle(handle);
    location.href = 'viewer.html';
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

// ── Open dropdown menu ────────────────────────────────────────────────
function bindOpenMenu() {
  const menu = document.querySelector('.open-menu');
  const trigger = menu.querySelector('.open-trigger');
  const list = menu.querySelector('.open-menu-list');

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    trigger.setAttribute('aria-expanded', open);
  });

  document.getElementById('openFolderBtn').addEventListener('click', () => {
    menu.classList.remove('open');
    selectFolder();
  });
  document.getElementById('openFileBtn').addEventListener('click', () => {
    menu.classList.remove('open');
    selectFile();
  });

  document.addEventListener('click', () => {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') menu.classList.remove('open');
  });
}

// ── Resume button (shown if a previous session exists) ───────────────
async function setupResumeBtn() {
  const handle = await getStoredHandle();
  if (!handle) return;
  const btn = document.getElementById('resumeBtn');
  btn.style.display = '';
  btn.addEventListener('click', () => { location.href = 'viewer.html'; });
}

// ── Bootstrap ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  applyStoredBgImage();
  bindOpenMenu();
  setupResumeBtn();
});
