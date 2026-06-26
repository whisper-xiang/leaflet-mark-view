// ── Theme & background (sync visual state with viewer) ────────────────
function applyStoredTheme() {
  const theme = localStorage.getItem('lmv-theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function applyStoredBgImage() {
  LMV.applyBgImage();
}

// ── Open actions ──────────────────────────────────────────────────────
async function selectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await LMV.storeHandle(handle);
    await LMV.addRecent(handle);
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
    await LMV.addRecent(handle);
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

// ── Background image customisation (top-right tools) ──────────────────
function bindBgTools() {
  const menu = document.getElementById('bgMenu');
  const trigger = document.getElementById('bgTriggerBtn');
  const chooseBtn = document.getElementById('bgChooseBtn');
  const resetBtn = document.getElementById('bgResetBtn');
  const fileInput = document.getElementById('bgFileInput');
  let hideTimer;

  const close = () => {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  };

  menu.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  });
  menu.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(close, 120);
  });
  trigger.addEventListener('click', e => e.preventDefault());

  chooseBtn.addEventListener('click', () => {
    close();
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // allow re-picking the same file later
    if (!file || !file.type.startsWith('image/')) return;
    await LMV.setCustomBg(file);
    LMV.applyBgImage();
  });

  resetBtn.addEventListener('click', async () => {
    close();
    await LMV.clearCustomBg();
    LMV.applyBgImage();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });
}

// ── Resume + recents popover ──────────────────────────────────────────
async function setupResumeArea() {
  const recents = await LMV.listRecents();
  if (!recents.length) return;

  const wrap = document.getElementById('resumeWrap');
  const btn = document.getElementById('resumeBtn');
  wrap.style.display = '';

  // Click "继续阅读" → open the most recently opened entry (first in list).
  btn.addEventListener('click', async () => {
    await LMV.openRecent(recents[0]);
  });

  bindRecentsPopover();
}

function bindRecentsPopover() {
  const wrap = document.getElementById('resumeWrap');
  const popover = document.getElementById('favoritesPopover');
  const list = document.getElementById('favoritesList');
  let hideTimer;

  async function refresh() {
    await LMV.renderRecentsList(list, {
      onChange: updateResumeWrapVisibility,
    });
  }

  async function updateResumeWrapVisibility() {
    const recents = await LMV.listRecents();
    wrap.style.display = recents.length ? '' : 'none';
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
            await LMV.addRecent(handle);
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
let urlModalApi = { openUrlModal() {}, closeUrlModal() {} };

document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  applyStoredBgImage();
  bindOpenMenu();
  bindBgTools();
  urlModalApi = RemoteMD.bindUrlModal();
  document.getElementById('openUrlBtn').addEventListener('click', () => {
    document.querySelector('.open-menu').classList.remove('open');
    urlModalApi.openUrlModal();
  });
  setupResumeArea();
  bindDragDrop();
});
