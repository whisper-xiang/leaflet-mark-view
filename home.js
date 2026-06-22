// ── Theme & background (sync visual state with viewer) ────────────────
function applyStoredTheme() {
  const theme = localStorage.getItem('lmv-theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function applyStoredBgImage() {
  LMV.applyRandomBgImage();
}

// ── Open actions ──────────────────────────────────────────────────────
async function selectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await LMV.storeHandle(handle);
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
    await LMV.storeHandle(handle);
    location.href = 'viewer.html';
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

// ── Open dropdown menu (hover) ────────────────────────────────────────
function bindOpenMenu() {
  const menu = document.querySelector('.open-menu');
  const trigger = menu.querySelector('.open-trigger');
  let hideTimer;

  menu.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  });
  menu.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => {
      menu.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }, 120);
  });

  document.getElementById('openFolderBtn').addEventListener('click', () => {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    selectFolder();
  });
  document.getElementById('openFileBtn').addEventListener('click', () => {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    selectFile();
  });

  trigger.addEventListener('click', e => e.preventDefault());

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      menu.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Resume + favorites popover ────────────────────────────────────────
async function setupResumeArea() {
  const handle = await LMV.getStoredHandle();
  const favorites = await LMV.listFavorites();
  if (!handle && !favorites.length) return;

  const wrap = document.getElementById('resumeWrap');
  const btn = document.getElementById('resumeBtn');
  wrap.style.display = '';

  if (handle) {
    btn.addEventListener('click', () => { location.href = 'viewer.html'; });
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      收藏`;
    btn.addEventListener('click', e => e.preventDefault());
  }

  bindFavoritesPopover();
}

function bindFavoritesPopover() {
  const wrap = document.getElementById('resumeWrap');
  const popover = document.getElementById('favoritesPopover');
  const list = document.getElementById('favoritesList');
  let hideTimer;

  async function refresh() {
    await LMV.renderFavoritesList(list, {
      onChange: updateResumeWrapVisibility,
    });
  }

  async function updateResumeWrapVisibility() {
    const handle = await LMV.getStoredHandle();
    const favorites = await LMV.listFavorites();
    wrap.style.display = handle || favorites.length ? '' : 'none';
  }

  wrap.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    popover.classList.add('open');
    popover.setAttribute('aria-hidden', 'false');
    refresh();
  });
  wrap.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => {
      popover.classList.remove('open');
      popover.setAttribute('aria-hidden', 'true');
    }, 120);
  });
  popover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popover.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => {
      popover.classList.remove('open');
      popover.setAttribute('aria-hidden', 'true');
    }, 120);
  });
}

// ── Drag & drop ───────────────────────────────────────────────────────
function bindDragDrop() {
  const overlay = document.getElementById('dragOverlay');
  let depth = 0;

  document.addEventListener('dragenter', e => {
    e.preventDefault();
    depth++;
    overlay.classList.add('visible');
  });
  document.addEventListener('dragleave', () => {
    depth--;
    if (depth <= 0) { depth = 0; overlay.classList.remove('visible'); }
  });
  document.addEventListener('dragover', e => e.preventDefault());

  document.addEventListener('drop', async e => {
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('visible');

    const items = [...(e.dataTransfer?.items ?? [])];
    for (const item of items) {
      if (item.kind !== 'file') continue;

      if (typeof item.getAsFileSystemHandle === 'function') {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (!handle) continue;
          const isDir = handle.kind === 'directory';
          const isMd  = /\.(md|markdown|mdown|mkd)$/i.test(handle.name);
          if (isDir || isMd) {
            await LMV.storeHandle(handle);
            location.href = 'viewer.html';
            return;
          }
          continue;
        } catch (_) {}
      }

      const file = item.getAsFile();
      if (!file || !/\.(md|markdown|mdown|mkd)$/i.test(file.name)) continue;
      try {
        const text = await file.text();
        const key  = 'lmv-direct-' + Date.now();
        await chrome.storage.session.set({ [key]: text });
        location.href = 'viewer.html'
          + '?pending=' + encodeURIComponent(key)
          + '&name='    + encodeURIComponent(file.name);
      } catch (_) {}
      return;
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  applyStoredBgImage();
  bindOpenMenu();
  setupResumeArea();
  bindDragDrop();
});
