// ── Icons (inline stroke SVG, feather-style 1.6) ────────────────────
const ICON = {
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  chevron: `<svg class="tree-dir-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  folder: `<svg class="tree-dir-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
  file: `<svg class="tree-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
};

// ── State ──────────────────────────────────────────────────────────
let rootHandle = null;
let allFiles = [];   // flat list: { name, path, handle }
let activeEl = null; // currently highlighted sidebar item
let spyHandler = null; // scroll-spy for the outline
let singleFileHandle = null; // held when in single-file mode, used to expand to folder
let activeTab = 'file';      // 'folder' = sibling tree, 'file' = current file only
let currentFileNode = null;  // the file currently open in the reading pane
let scopeKey = '';           // identifies the current folder/file set, for per-scope memory
let searchIndexBuilt = false; // whether every file's text has been read for full-text search
let restoringScroll = false;  // guard so programmatic scroll restore doesn't overwrite saved pos
let editMode = false;         // true = source editor shown, false = rendered preview

// Content width presets
const WIDTHS = ['narrow', 'medium', 'wide', 'full'];
const WIDTH_LABELS = { narrow: '窄', medium: '中', wide: '宽', full: '全宽' };

// Prose font-size presets
const FONT_SIZES = ['small', 'medium', 'large', 'xlarge'];
const FONT_SIZE_LABELS = { small: '小', medium: '中', large: '大', xlarge: '特大' };

// ── Bootstrap ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  applyStoredTheme();
  applyStoredWidth();
  applyStoredFontSize();
  updateEditAvailability();

  const params = new URLSearchParams(location.search);
  const pendingKey = params.get('pending');
  const src = params.get('src') || '';
  // `pending` is a one-shot key (consumed on first open); `src` is the durable
  // file:// URL that survives refresh. Either one means "open this file".
  if (pendingKey || src) {
    await tryOpenPending(pendingKey, params.get('name') || 'untitled.md', src);
  } else {
    await tryRestoreFolder();
  }
});

function bindUI() {
  bindOpenMenus();
  document.querySelectorAll('.sb-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
  });
  // Sync search visibility to the initial tab without clobbering the welcome text.
  document.querySelector('.sidebar-search').style.display = activeTab === 'folder' ? '' : 'none';
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('editToggle').addEventListener('click', toggleSourceMode);
  document.getElementById('saveFile').addEventListener('click', saveCurrentFile);
  document.getElementById('sourceEditor').addEventListener('input', () => refreshDirtyState());
  // Cmd/Ctrl+S saves while editing; Ctrl+E toggles source/preview.
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      if (editMode) { e.preventDefault(); saveCurrentFile(); }
    } else if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'e') {
      if (currentFileNode) { e.preventDefault(); toggleSourceMode(); }
    }
  });
  document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarExpand').addEventListener('click', toggleSidebar);
  document.getElementById('widthToggle').addEventListener('click', cycleWidth);
  document.getElementById('fontSizeToggle').addEventListener('click', cycleFontSize);
  document.getElementById('outlineToggle').addEventListener('click', toggleOutline);
  document.getElementById('searchInput').addEventListener('input', onSearch);
  document.getElementById('homeBtn').addEventListener('click', goHome);

  // Remember reading position per file (throttled; skip the programmatic restore).
  let scrollSaveTimer;
  document.getElementById('contentArea').addEventListener('scroll', () => {
    if (restoringScroll || editMode || !currentFileNode) return;
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
      if (currentFileNode) saveScroll(currentFileNode, document.getElementById('contentArea').scrollTop);
    }, 200);
  }, { passive: true });
}

// ── Per-scope reading memory (last file + scroll position) ──────────
function lastFileKey() { return 'lmv-last:' + scopeKey; }
function scrollKey(node) { return 'lmv-pos:' + scopeKey + ':' + node.path; }

function saveLastFile(node) {
  if (scopeKey) { try { localStorage.setItem(lastFileKey(), node.path); } catch (_) {} }
}
function saveScroll(node, top) {
  if (scopeKey) { try { localStorage.setItem(scrollKey(node), String(Math.round(top))); } catch (_) {} }
}
function getSavedScroll(node) {
  if (!scopeKey) return 0;
  const v = localStorage.getItem(scrollKey(node));
  return v ? Number(v) || 0 : 0;
}

// ── "Open" dropdown menus (sidebar footer + empty state) ────────────
function bindOpenMenus() {
  document.querySelectorAll('.open-trigger').forEach(trigger => {
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      toggleOpenMenu(trigger.closest('.open-menu'));
    });
  });
  document.querySelectorAll('.open-menu [data-action]').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      closeOpenMenus();
      if (item.dataset.action === 'folder') selectFolder();
      else selectFile();
    });
  });
  document.addEventListener('click', closeOpenMenus);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOpenMenus(); });
}

function toggleOpenMenu(menu) {
  const isOpen = menu.classList.contains('open');
  closeOpenMenus();
  if (!isOpen) {
    menu.classList.add('open');
    menu.querySelector('.open-trigger').setAttribute('aria-expanded', 'true');
  }
}

function closeOpenMenus() {
  document.querySelectorAll('.open-menu.open').forEach(menu => {
    menu.classList.remove('open');
    menu.querySelector('.open-trigger').setAttribute('aria-expanded', 'false');
  });
}

// ── Content width ───────────────────────────────────────────────────
function applyStoredWidth() {
  setWidth(localStorage.getItem('lmv-width') || 'medium');
}

function setWidth(w) {
  if (!WIDTHS.includes(w)) w = 'medium';
  document.getElementById('contentArea').dataset.width = w;
  document.getElementById('widthLabel').textContent = WIDTH_LABELS[w];
}

function cycleWidth() {
  const cur = document.getElementById('contentArea').dataset.width || 'medium';
  const next = WIDTHS[(WIDTHS.indexOf(cur) + 1) % WIDTHS.length];
  setWidth(next);
  localStorage.setItem('lmv-width', next);
}

// ── Prose font size ─────────────────────────────────────────────────
function applyStoredFontSize() {
  setFontSize(localStorage.getItem('lmv-fontsize') || 'medium');
}

function setFontSize(s) {
  if (!FONT_SIZES.includes(s)) s = 'medium';
  document.getElementById('contentArea').dataset.fontsize = s;
  document.getElementById('fontSizeLabel').textContent = FONT_SIZE_LABELS[s];
}

function cycleFontSize() {
  const cur = document.getElementById('contentArea').dataset.fontsize || 'medium';
  const next = FONT_SIZES[(FONT_SIZES.indexOf(cur) + 1) % FONT_SIZES.length];
  setFontSize(next);
  localStorage.setItem('lmv-fontsize', next);
}

function toggleOutline() {
  document.getElementById('outline').classList.toggle('collapsed');
}

// ── Theme ──────────────────────────────────────────────────────────
function applyStoredTheme() {
  const theme = localStorage.getItem('lmv-theme') || 'light';
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('themeToggle');
  toggle.innerHTML = theme === 'dark' ? ICON.sun : ICON.moon;
  toggle.title = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  localStorage.setItem('lmv-theme', next);
}

// ── Sidebar ─────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// ── Sidebar tabs (Folder = sibling tree, File = current file only) ──
function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.sb-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  // Search only applies to the folder listing.
  document.querySelector('.sidebar-search').style.display = tab === 'folder' ? '' : 'none';
  renderSidebarTree();
}

// Render #fileTree according to the active tab and current search query.
function renderSidebarTree() {
  const container = document.getElementById('fileTree');
  if (activeTab === 'file') {
    renderTree(currentFileNode ? [currentFileNode] : [], container);
  } else {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    if (q) renderSearchResults(q, container);
    else renderTree(buildTree(), container);
  }
  if (currentFileNode) highlightSidebar(currentFileNode);
}

// ── Folder selection ────────────────────────────────────────────────
async function selectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    rootHandle = handle;
    await storeHandle(handle);
    await loadFolder(handle);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

async function selectFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: 'Markdown',
        accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] },
      }],
    });
    if (!handle) return;
    await storeHandle(handle);
    await openSingleFile(handle);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

// Open a single .md file with no surrounding folder.
async function openSingleFile(handle) {
  rootHandle = null;
  singleFileHandle = handle;
  scopeKey = 'file:' + handle.name;
  searchIndexBuilt = false;
  const node = { kind: 'file', name: handle.name, path: handle.name, handle };
  allFiles = [node];
  window._cachedTree = [node];

  showMarkdownBody();
  document.getElementById('folderNameText').textContent = handle.name;
  showExpandHint(() => expandToFolder(handle));

  setActiveTab('file');
  await openFile(node);
}

// Retrieve content stored by the content script redirect and open it.
// The stashed text is consumed once; on a page refresh it's gone, so we fall
// back to re-reading the file directly from its file:// URL (kept in `src`).
async function tryOpenPending(key, name, srcUrl) {
  try {
    let text = null;
    if (key) {
      const result = await chrome.storage.session.get(key);
      text = result[key];
      await chrome.storage.session.remove(key);
    }
    if (text == null && srcUrl) {
      const r = await fetch(srcUrl); // status 0 on file://, body still readable
      text = await r.text();
    }
    if (text != null) {
      await openDirectContent(name, text, srcUrl);
    } else {
      await tryRestoreFolder();
    }
  } catch (e) {
    console.error(e);
    await tryRestoreFolder();
  }
}

// Open markdown content that arrived via the content-script redirect.
// We only have the raw text + the file's file:// URL (no FS Access handle), so
// we render immediately, then try to enumerate sibling .md files by fetching the
// parent directory listing. If that fails, fall back to a manual folder picker.
async function openDirectContent(name, text, srcUrl) {
  rootHandle = null;
  singleFileHandle = null;
  // Scope memory to the containing directory so it stays stable when siblings load.
  scopeKey = 'dir:' + (srcUrl ? srcUrl.slice(0, srcUrl.lastIndexOf('/') + 1) : name);
  searchIndexBuilt = false;

  const node = { kind: 'file', name, path: name, handle: memHandle(name, text) };
  allFiles = [node];
  window._cachedTree = [node];

  showMarkdownBody();
  document.getElementById('folderNameText').textContent = name;
  document.getElementById('fileStats').textContent = '';
  setActiveTab('file'); // default to the File tab on direct open
  await openFile(node);

  // Discover the other .md files sitting next to this one (fills the Folder tab).
  if (srcUrl) {
    try {
      const { dirUrl, nodes } = await loadSiblingsFromUrl(srcUrl, name, text);
      allFiles = nodes;
      window._cachedTree = nodes;
      searchIndexBuilt = false;
      const oldNode = currentFileNode;
      currentFileNode = nodes.find(n => n.name === name) || currentFileNode;
      // openFile() set __text on the old node; carry it over to the replacement.
      if (currentFileNode !== oldNode && oldNode?.__text != null) {
        currentFileNode.__text = oldNode.__text;
      }
      const dirName = decodeURIComponent(dirUrl.replace(/\/+$/, '').split('/').pop()) || dirUrl;
      document.getElementById('folderNameText').textContent = dirName;
      document.getElementById('fileStats').textContent = `${nodes.length} 个 Markdown 文件`;
      renderSidebarTree(); // stays on File tab; Folder tab now has the siblings
      return;
    } catch (e) {
      console.warn('[Leaflet Mark View] 无法列出同目录文件，回退到手动选择:', e);
    }
  }
  showExpandHint(() => selectFolder());
}

// Synthetic handle backed by in-memory text (the file we already have).
function memHandle(name, text) {
  return { kind: 'file', name, getFile: () => Promise.resolve({ text: () => Promise.resolve(text), name }) };
}

// Synthetic handle that lazily fetches a file:// URL's text when opened.
function urlHandle(fileUrl, name) {
  return {
    kind: 'file', name,
    getFile: async () => {
      // file:// responses report status 0 even on success — don't gate on r.ok.
      const r = await fetch(fileUrl);
      const t = await r.text();
      return { text: () => Promise.resolve(t), name };
    },
  };
}

// Fetch the parent directory's file:// listing and build nodes for each .md file.
// Requires "Allow access to file URLs" + the file:///* host permission.
async function loadSiblingsFromUrl(srcUrl, currentName, currentText) {
  const dirUrl = srcUrl.slice(0, srcUrl.lastIndexOf('/') + 1);
  // file:// responses report status 0 even on success — read the body regardless.
  const res = await fetch(dirUrl);
  const html = await res.text();
  if (!html) throw new Error('目录响应为空（可能被浏览器拦截）');

  const entries = parseDirListing(html).filter(e => isMarkdown(e.name));
  if (entries.length === 0) throw new Error('目录中没有 Markdown 文件（已读到 ' + html.length + ' 字节）');

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  const nodes = entries.map(e => ({
    kind: 'file',
    name: e.name,
    path: e.name,
    url: dirUrl + e.href, // file:// URL, used to keep the address bar in sync
    // Reuse the text we already have for the current file; fetch the rest on demand.
    handle: e.name === currentName ? memHandle(e.name, currentText) : urlHandle(dirUrl + e.href, e.name),
  }));
  return { dirUrl, nodes };
}

// Parse Chromium's auto-generated file:// directory listing. Each entry is emitted
// as `addRow("display-name","encoded-href",isDir,...)` inside inline <script> tags.
function parseDirListing(html) {
  const out = [];
  const re = /addRow\("((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)",(\d)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] === '1') continue; // directory
    out.push({ name: decodeJsString(m[1]), href: decodeJsString(m[2]) });
  }
  return out;
}

function decodeJsString(s) {
  return s
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1');
}

// Footer button that opens a manual directory picker (fallback).
function showExpandHint(onClick) {
  const statsEl = document.getElementById('fileStats');
  statsEl.innerHTML = '';
  const hint = document.createElement('button');
  hint.className = 'expand-folder-hint';
  hint.title = '打开所在文件夹查看其他 .md 文件';
  hint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>查看所在文件夹`;
  hint.addEventListener('click', onClick);
  statsEl.appendChild(hint);
}

// Upgrade from single-file mode: open a directory picker starting in the same
// directory, then load the full folder and re-select the file we had open.
async function expandToFolder(fileHandle) {
  try {
    const dirHandle = await window.showDirectoryPicker({ startIn: fileHandle, mode: 'read' });
    singleFileHandle = null;
    rootHandle = dirHandle;
    await storeHandle(dirHandle);
    // After scanning, auto-open the file that was already rendered
    await loadFolder(dirHandle, fileHandle.name);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

async function tryRestoreFolder() {
  try {
    const handle = await getStoredHandle();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      await restoreHandle(handle);
    } else if (perm === 'prompt') {
      // Show a banner offering to reconnect
      showReconnectBanner(handle);
    }
  } catch (_) { /* ignore */ }
}

// Restore either a directory or a single file, depending on the handle kind.
async function restoreHandle(handle) {
  if (handle.kind === 'file') {
    await openSingleFile(handle);
  } else {
    rootHandle = handle;
    await loadFolder(handle);
  }
}

function showReconnectBanner(handle) {
  const banner = document.createElement('div');
  banner.className = 'reconnect-banner';
  banner.innerHTML = `<span class="dot"></span><span>重新连接到 <strong>${escHtml(handle.name)}</strong></span>${ICON.arrowRight}`;
  banner.addEventListener('click', async () => {
    try {
      await handle.requestPermission({ mode: 'read' });
      await restoreHandle(handle);
    } catch (_) {}
    banner.remove();
  });
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

// ── Directory scanning ──────────────────────────────────────────────
async function loadFolder(dirHandle, preferName = null) {
  showMarkdownBody();
  setContent(`<div class="loading"><div class="spinner"></div>正在扫描文件夹…</div>`);
  document.getElementById('folderNameText').textContent = dirHandle.name;
  document.getElementById('fileStats').textContent = '';

  scopeKey = 'folder:' + dirHandle.name;
  searchIndexBuilt = false;

  const tree = await scanDir(dirHandle, '');
  window._cachedTree = tree;
  allFiles = flattenFiles(tree);

  setActiveTab('folder'); // folder picker → default to the Folder tab
  document.getElementById('fileStats').textContent = `${allFiles.length} 个 Markdown 文件`;

  if (allFiles.length > 0) {
    // Prefer an explicit request, then the file open last time in this folder.
    const lastPath = localStorage.getItem(lastFileKey());
    const target = (preferName && allFiles.find(f => f.name === preferName))
      || (lastPath && allFiles.find(f => f.path === lastPath))
      || allFiles[0];
    openFile(target);
  } else {
    clearOutline();
    setContent('<div class="loading">未找到 Markdown 文件</div>');
  }
}

function setHomeMode(on) {
  document.body.classList.toggle('is-home', on);
}

function showMarkdownBody() {
  setHomeMode(false);
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('markdownBody').style.display = 'block';
}

async function scanDir(dirHandle, prefix) {
  const items = [];
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue; // skip hidden
      if (handle.kind === 'directory') {
        const children = await scanDir(handle, prefix + name + '/');
        if (children.length > 0) items.push({ kind: 'dir', name, path: prefix + name + '/', handle, children });
      } else if (isMarkdown(name)) {
        items.push({ kind: 'file', name, path: prefix + name, handle });
      }
    }
  } catch (e) {
    console.warn('Cannot read directory:', e);
  }
  // Dirs first, then files, both alphabetical
  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

function isMarkdown(name) {
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

function flattenFiles(nodes) {
  const result = [];
  for (const n of nodes) {
    if (n.kind === 'file') result.push(n);
    else if (n.children) result.push(...flattenFiles(n.children));
  }
  return result;
}

// ── File tree rendering ─────────────────────────────────────────────
function renderTree(nodes, container) {
  container.innerHTML = '';
  if (nodes.length === 0) {
    container.innerHTML = '<div class="sidebar-empty">没有找到 .md 文件</div>';
    return;
  }
  nodes.forEach(n => container.appendChild(createNode(n)));
}

function createNode(node) {
  if (node.kind === 'dir') {
    const wrap = document.createElement('div');
    wrap.className = 'tree-dir open';
    wrap.dataset.path = node.path;

    const header = document.createElement('div');
    header.className = 'tree-dir-header';
    header.innerHTML = `${ICON.chevron}${ICON.folder}<span class="tree-dir-name">${escHtml(node.name)}</span>`;
    header.addEventListener('click', () => wrap.classList.toggle('open'));

    const children = document.createElement('div');
    children.className = 'tree-dir-children';
    node.children.forEach(c => children.appendChild(createNode(c)));

    wrap.appendChild(header);
    wrap.appendChild(children);
    return wrap;
  }

  const el = document.createElement('div');
  el.className = 'tree-file';
  el.dataset.path = node.path;
  const displayName = node.name.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  el.innerHTML = `${ICON.file}<span class="tree-file-name" title="${escHtml(node.path)}">${escHtml(displayName)}</span>`;
  el.addEventListener('click', () => openFile(node));
  return el;
}

// ── Search (filename + full text) ───────────────────────────────────
async function onSearch() {
  // Searching always operates on the folder listing.
  if (activeTab !== 'folder') setActiveTab('folder'); // renders filename matches at once
  else renderSidebarTree();

  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  // Filename results are instant above; load file bodies once, then add content hits.
  if (q.length >= 2) {
    await ensureSearchIndex();
    if (document.getElementById('searchInput').value.trim().toLowerCase() === q) {
      renderSidebarTree();
    }
  }
}

// Read every file's text once so searches can scan content. Idempotent; reset
// to false whenever the file set changes.
async function ensureSearchIndex() {
  if (searchIndexBuilt) return;
  await Promise.all(allFiles.map(async f => {
    if (f.__text != null) return;
    try { f.__text = await (await f.handle.getFile()).text(); }
    catch (_) { f.__text = ''; }
  }));
  searchIndexBuilt = true;
}

// Build sidebar results matching on filename OR file content. Content matches
// get a snippet preview. Uses cached __text if present; missing text just means
// the content pass is skipped for that file until the index finishes loading.
function renderSearchResults(q, container) {
  const results = [];
  for (const f of allFiles) {
    const nameHit = f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    const text = f.__text || '';
    const idx = text.toLowerCase().indexOf(q);
    if (nameHit || idx >= 0) {
      results.push({ node: f, snippet: idx >= 0 ? makeSnippet(text, idx, q.length) : '' });
    }
  }
  container.innerHTML = '';
  if (results.length === 0) {
    container.innerHTML = '<div class="sidebar-empty">没有匹配结果</div>';
    return;
  }
  results.forEach(r => container.appendChild(createSearchNode(r, q)));
}

function createSearchNode(r, q) {
  const el = document.createElement('div');
  el.className = 'tree-file search-result';
  el.dataset.path = r.node.path;
  const displayName = r.node.name.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  const head = `<div class="sr-head">${ICON.file}<span class="tree-file-name" title="${escHtml(r.node.path)}">${highlightMatch(displayName, q)}</span></div>`;
  const snippet = r.snippet ? `<div class="sr-snippet">${highlightMatch(r.snippet, q)}</div>` : '';
  el.innerHTML = head + snippet;
  el.addEventListener('click', () => openFile(r.node));
  return el;
}

// Plain-text excerpt around the match (collapsed whitespace, ellipses at edges).
function makeSnippet(text, idx, len) {
  const start = Math.max(0, idx - 24);
  const end = Math.min(text.length, idx + len + 48);
  const core = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + core + (end < text.length ? '…' : '');
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Escape for HTML, then wrap query occurrences in <mark> (case-insensitive).
function highlightMatch(text, q) {
  const esc = escHtml(text);
  if (!q) return esc;
  return esc.replace(new RegExp(escapeRe(escHtml(q)), 'gi'), m => `<mark>${m}</mark>`);
}

function buildTree() {
  return window._cachedTree || [];
}

// Parse markdown into `body` and wire up links + heading anchors + outline.
// Shared by file opening and the source-editor's preview toggle.
function renderMarkdownInto(body, text) {
  body.innerHTML = parseMarkdown(text, true);

  // Open external links safely
  body.querySelectorAll('a[target="_blank"]').forEach(a => {
    a.setAttribute('rel', 'noopener noreferrer');
  });

  // Anchor click on headings
  body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    h.addEventListener('click', () => {
      h.scrollIntoView({ behavior: 'smooth' });
      history.replaceState(null, '', '#' + h.id);
    });
  });

  buildOutline(body);
}

// ── Source editor (source ↔ preview toggle) ────────────────────────
// A real FileSystemFileHandle exposes createWritable(); the synthetic handles
// used for file:// direct-open (memHandle/urlHandle) do not, so those are read-only.
function isWritable(node) {
  return !!(node && node.handle && typeof node.handle.createWritable === 'function');
}

function isDirty() {
  if (!editMode || !currentFileNode) return false;
  return document.getElementById('sourceEditor').value !== (currentFileNode.__text ?? '');
}

function refreshDirtyState() {
  document.getElementById('saveFile').classList.toggle('dirty', isDirty());
}

// Reflect whether the open file can be edited/saved on the toolbar buttons.
function updateEditAvailability() {
  const editBtn = document.getElementById('editToggle');
  editBtn.disabled = !currentFileNode;
  editBtn.classList.toggle('active', editMode);
  // Save is always available while editing — read-only sources fall back to Save As.
  document.getElementById('saveFile').style.display = editMode ? '' : 'none';
  document.getElementById('readonlyHint').style.display =
    editMode && !isWritable(currentFileNode) ? '' : 'none';
}

function toggleSourceMode() {
  if (!currentFileNode) return;
  if (editMode) previewFromSource();
  else enterSourceMode();
}

function enterSourceMode() {
  editMode = true;
  const editor = document.getElementById('sourceEditor');
  const ca = document.getElementById('contentArea');

  // Capture preview scroll ratio before switching views.
  const previewRatio = ca.scrollHeight > ca.clientHeight
    ? ca.scrollTop / (ca.scrollHeight - ca.clientHeight) : 0;

  editor.value = currentFileNode.__text ?? '';
  editor.style.display = 'block';
  document.getElementById('markdownBody').style.display = 'none';
  updateEditAvailability();
  refreshDirtyState();

  restoringScroll = true;
  ca.scrollTop = 0;
  editor.focus({ preventScroll: true });

  // Apply ratio to the editor after its layout is known.
  requestAnimationFrame(() => {
    const maxScroll = editor.scrollHeight - editor.clientHeight;
    if (maxScroll > 0) editor.scrollTop = previewRatio * maxScroll;
    restoringScroll = false;
  });
}

// Render the editor's current text into the preview, then leave source mode.
// Edits stay in memory (and the preview reflects them) until explicitly saved.
function previewFromSource() {
  const editor = document.getElementById('sourceEditor');
  // Capture source scroll ratio before re-render destroys the editor's layout.
  const sourceRatio = editor.scrollHeight > editor.clientHeight
    ? editor.scrollTop / (editor.scrollHeight - editor.clientHeight) : 0;

  renderMarkdownInto(document.getElementById('markdownBody'), editor.value);
  exitSourceMode();

  // Apply ratio to the re-rendered preview.
  const ca = document.getElementById('contentArea');
  requestAnimationFrame(() => {
    const maxScroll = ca.scrollHeight - ca.clientHeight;
    if (maxScroll > 0) {
      restoringScroll = true;
      ca.scrollTop = sourceRatio * maxScroll;
      requestAnimationFrame(() => { restoringScroll = false; });
    }
  });
}

// Pure view switch back to the rendered preview (no re-render).
function exitSourceMode() {
  editMode = false;
  document.getElementById('sourceEditor').style.display = 'none';
  document.getElementById('markdownBody').style.display = 'block';
  updateEditAvailability();
}

async function ensureWritable(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

async function saveCurrentFile() {
  if (!editMode || !currentFileNode) return;
  const node = currentFileNode;
  const text = document.getElementById('sourceEditor').value;
  try {
    // Real handles write in place; synthetic ones (file:// direct open) can't —
    // fall back to a Save As picker and adopt the chosen handle for later saves.
    let handle = isWritable(node) ? node.handle : null;
    if (!handle) {
      if (!window.showSaveFilePicker) { toast('当前环境不支持保存'); return; }
      handle = await window.showSaveFilePicker({
        suggestedName: node.name,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
      });
      node.handle = handle; // subsequent saves go straight to disk
    }
    if (!(await ensureWritable(handle))) { toast('未获得写入权限'); return; }
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    node.__text = text; // keep search index + dirty baseline in sync
    refreshDirtyState();
    updateEditAvailability(); // node may have just become writable
    toast('已保存');
  } catch (e) {
    if (e.name === 'AbortError') return; // user cancelled the picker
    toast('保存失败：' + e.message);
  }
}

// Transient bottom-center notice.
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('lmvToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lmvToast';
    el.className = 'lmv-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// Return to the welcome home screen (clear open file, keep folder sidebar).
function goHome() {
  if (editMode && isDirty() && !confirm('当前文件有未保存的修改，确定放弃并返回主页？')) return;
  exitSourceMode();
  currentFileNode = null;

  setHomeMode(true);
  document.getElementById('emptyState').style.display = '';
  document.getElementById('markdownBody').style.display = 'none';
  document.getElementById('markdownBody').innerHTML = '';
  document.getElementById('sourceEditor').style.display = 'none';
  document.getElementById('sourceEditor').value = '';
  document.getElementById('filePath').textContent = '未打开文件';
  clearOutline();
  updateEditAvailability();

  if (activeEl) {
    activeEl.classList.remove('active');
    activeEl = null;
  }
  if (activeTab === 'file') renderSidebarTree();

  const u = new URL(location.href);
  u.searchParams.delete('pending');
  u.searchParams.delete('name');
  u.searchParams.delete('src');
  history.replaceState(null, '', u.pathname + u.search);
  document.getElementById('contentArea').scrollTop = 0;
}

// ── File opening ────────────────────────────────────────────────────
async function openFile(node) {
  // Guard against losing unsaved source edits when switching files.
  if (editMode && isDirty() && !confirm('当前文件有未保存的修改，确定放弃并切换？')) return;
  exitSourceMode(); // always return to preview when opening a file

  currentFileNode = node;
  saveLastFile(node);
  // In file-tab view the list shows only the open file, so re-render to reflect
  // the switch; otherwise just move the highlight within the folder tree.
  if (activeTab === 'file') renderSidebarTree();
  else highlightSidebar(node);

  // Direct (file://) mode: keep the address bar pointed at the open file so a
  // refresh reopens it instead of the file we first arrived on.
  if (node.url) {
    const u = new URL(location.href);
    u.searchParams.delete('pending');
    u.searchParams.set('name', node.name);
    u.searchParams.set('src', node.url);
    history.replaceState(null, '', u);
  }

  document.getElementById('filePath').textContent = node.path;
  showMarkdownBody();
  setContent(`<div class="loading"><div class="spinner"></div>加载中…</div>`);

  try {
    const file = await node.handle.getFile();
    const text = await file.text();
    node.__text = text; // cache for full-text search

    renderMarkdownInto(document.getElementById('markdownBody'), text);
    updateEditAvailability();
    // Restore the previous reading position for this file (default: top).
    restoringScroll = true;
    document.getElementById('contentArea').scrollTop = getSavedScroll(node);
    requestAnimationFrame(() => { restoringScroll = false; });
  } catch (e) {
    clearOutline();
    setContent(`<p style="color:#e55;padding:32px">无法读取文件：${escHtml(e.message)}</p>`);
  }
}

// Highlight a file in the sidebar tree and scroll it into view.
function highlightSidebar(node) {
  if (activeEl) activeEl.classList.remove('active');
  const el = document.querySelector(`.tree-file[data-path="${CSS.escape(node.path)}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest' });
    activeEl = el;
  }
}

// ── Outline (table of contents) ─────────────────────────────────────
function buildOutline(body) {
  const outline = document.getElementById('outline');
  const list = document.getElementById('outlineList');
  list.innerHTML = '';

  const headings = [...body.querySelectorAll('h1, h2, h3, h4')];
  // Need at least 2 headings for an outline to be worthwhile
  if (headings.length < 2) { clearOutline(); return; }

  // Assign clean, unique ids here (the markdown slugifier drops CJK, so Chinese
  // headings would otherwise collide). This is the authoritative anchor source.
  const used = new Set();
  headings.forEach(h => {
    const base = slugFromText(h.textContent);
    let id = base, n = 1;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;

    const level = Number(h.tagName[1]);
    const a = document.createElement('a');
    a.className = `outline-item lvl-${level}`;
    a.href = '#' + h.id;
    a.dataset.target = h.id;
    a.textContent = h.textContent;
    a.title = h.textContent;
    a.addEventListener('click', e => {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + h.id);
    });
    list.appendChild(a);
  });

  outline.classList.remove('empty');
  setupScrollSpy(headings);
}

function clearOutline() {
  detachScrollSpy();
  document.getElementById('outlineList').innerHTML = '';
  document.getElementById('outline').classList.add('empty');
}

function detachScrollSpy() {
  if (spyHandler) {
    document.getElementById('contentArea').removeEventListener('scroll', spyHandler);
    spyHandler = null;
  }
}

// Highlight the heading nearest the top of the reading pane as the user scrolls.
// Passive + rAF-throttled listener on the content container (not the window),
// so it does no per-frame layout/animation work.
function setupScrollSpy(headings) {
  detachScrollSpy();
  const ca = document.getElementById('contentArea');
  const list = document.getElementById('outlineList');
  let ticking = false;

  const update = () => {
    ticking = false;
    const paneTop = ca.getBoundingClientRect().top;
    const activeLine = 100; // a heading within 100px of the pane top is "current"
    let current = headings[0];
    for (const h of headings) {
      if (h.getBoundingClientRect().top - paneTop <= activeLine) current = h;
      else break;
    }
    // At the bottom, the last headings can never reach the line: pin the last.
    if (ca.scrollTop + ca.clientHeight >= ca.scrollHeight - 4) {
      current = headings[headings.length - 1];
    }

    let activeItem = null;
    list.querySelectorAll('.outline-item').forEach(a => {
      const on = a.dataset.target === current.id;
      a.classList.toggle('active', on);
      if (on) activeItem = a;
    });
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  };

  spyHandler = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  ca.addEventListener('scroll', spyHandler, { passive: true });
  update();
}

function slugFromText(text) {
  return (text || 'section').trim().toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function setContent(html) {
  document.getElementById('markdownBody').innerHTML = html;
}

// ── IndexedDB handle persistence ────────────────────────────────────
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

// ── Utils ────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
