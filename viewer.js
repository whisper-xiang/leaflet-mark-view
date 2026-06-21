// Brand color driven by @keyframes rainbow-brand in viewer.css (60s cycle).

// ── Icons (inline stroke SVG, feather-style 1.6) ────────────────────
const ICON = {
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  chevron: `<svg class="tree-dir-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  folder: `<svg class="tree-dir-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
  file: `<svg class="tree-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
};

// ── State ──────────────────────────────────────────────────────────
let rootHandle = null;
let allFiles = []; // flat list: { name, path, handle }
let activeEl = null; // currently highlighted sidebar item
let spyHandler = null; // scroll-spy for the outline
let singleFileHandle = null; // held when in single-file mode, used to expand to folder
let currentDir = ""; // directory path shown in the breadcrumb/list ('' = root)
let rootLabel = ""; // label for the root breadcrumb segment (folder/file name)
let fileOnlyView = false; // true right after a single file opens: list shows only it
let currentFileNode = null; // the file currently open in the reading pane
let scopeKey = ""; // identifies the current folder/file set, for per-scope memory
let searchIndexBuilt = false; // whether every file's text has been read for full-text search
let restoringScroll = false; // guard so programmatic scroll restore doesn't overwrite saved pos
let editMode = false; // true = source editor shown, false = rendered preview
let viewingBuiltinReadme = false; // extension-bundled README.md (no FS handle)

// Prose font-size presets
const FONT_SIZES = ["small", "medium", "large", "xlarge"];
const FONT_SIZE_LABELS = {
  small: "小",
  medium: "中",
  large: "大",
  xlarge: "特大",
};

// ── Bootstrap ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  applyStoredTheme();
  applyStoredFontSize();
  applyStoredBgImage();
  updateEditAvailability();

  const params = new URLSearchParams(location.search);
  const pendingKey = params.get("pending");
  const src = params.get("src") || "";
  const builtinReadme =
    params.get("builtin") === "readme" || LMV.isProjectReadmeUrl(src);
  // `pending` is a one-shot key (consumed on first open); `src` is the durable
  // file:// URL that survives refresh. Either one means "open this file".
  if (pendingKey || src) {
    await tryOpenPending(
      pendingKey,
      params.get("name") || "untitled.md",
      src,
      { builtinReadme },
    );
  } else {
    await tryRestoreFolder();
  }
});

function bindUI() {
  bindOpenMenus();
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document
    .getElementById("editToggle")
    .addEventListener("click", toggleSourceMode);
  document
    .getElementById("saveFile")
    .addEventListener("click", saveCurrentFile);
  document
    .getElementById("sourceEditor")
    .addEventListener("input", () => refreshDirtyState());
  // Cmd/Ctrl+S saves while editing; Ctrl+E toggles source/preview.
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      if (editMode) {
        e.preventDefault();
        saveCurrentFile();
      }
    } else if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "e") {
      if (currentFileNode) {
        e.preventDefault();
        toggleSourceMode();
      }
    } else if (
      e.key === "Escape" &&
      document.getElementById("searchModal").classList.contains("open")
    ) {
      e.preventDefault();
      closeSearchModal();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearchModal();
    }
  });
  document.getElementById("upLevel").addEventListener("click", goUp);
  document
    .getElementById("pagerPrev")
    .addEventListener("click", () => navFile(-1));
  document
    .getElementById("pagerNext")
    .addEventListener("click", () => navFile(1));
  document
    .getElementById("docPrev")
    .addEventListener("click", () => navFile(-1));
  document
    .getElementById("docNext")
    .addEventListener("click", () => navFile(1));
  document
    .getElementById("sidebarExpand")
    .addEventListener("click", toggleSidebar);
  document
    .getElementById("addFavoriteBtn")
    .addEventListener("click", addCurrentToFavorites);
  document
    .getElementById("fontSizeToggle")
    .addEventListener("click", cycleFontSize);
  document
    .getElementById("outlineToggle")
    .addEventListener("click", toggleOutline);
  document.getElementById("bgToggle").addEventListener("click", toggleBgImage);
  bindDragDrop();
  document
    .getElementById("searchTrigger")
    .addEventListener("click", openSearchModal);
  document
    .getElementById("searchModalInput")
    .addEventListener("input", onModalSearch);
  document.getElementById("searchModalClear").addEventListener("click", () => {
    document.getElementById("searchModalInput").value = "";
    document.getElementById("searchModalInput").focus();
    onModalSearch();
  });
  document
    .getElementById("searchBackdrop")
    .addEventListener("click", closeSearchModal);
  document
    .getElementById("searchModalInput")
    .addEventListener("keydown", onModalKey);
  document.getElementById("homeBtn").addEventListener("click", goHome);

  bindTreeContextMenu();

  // Remember reading position per file (throttled; skip the programmatic restore).
  let scrollSaveTimer;
  document.getElementById("contentArea").addEventListener(
    "scroll",
    () => {
      if (restoringScroll || editMode || !currentFileNode) return;
      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(() => {
        if (currentFileNode)
          saveScroll(
            currentFileNode,
            document.getElementById("contentArea").scrollTop,
          );
      }, 200);
    },
    { passive: true },
  );
}

// ── Per-scope reading memory (last file + scroll position) ──────────
function lastFileKey() {
  return "lmv-last:" + scopeKey;
}
function scrollKey(node) {
  return "lmv-pos:" + scopeKey + ":" + node.path;
}

function saveLastFile(node) {
  if (scopeKey) {
    try {
      localStorage.setItem(lastFileKey(), node.path);
    } catch (_) {}
  }
}
function saveScroll(node, top) {
  if (scopeKey) {
    try {
      localStorage.setItem(scrollKey(node), String(Math.round(top)));
    } catch (_) {}
  }
}
function getSavedScroll(node) {
  if (!scopeKey) return 0;
  const v = localStorage.getItem(scrollKey(node));
  return v ? Number(v) || 0 : 0;
}

// ── "Open" dropdown menus (sidebar footer + empty state) ────────────
function bindOpenMenus() {
  document.querySelectorAll(".open-trigger").forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOpenMenu(trigger.closest(".open-menu"));
    });
  });
  document.querySelectorAll(".open-menu [data-action]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      closeOpenMenus();
      if (item.dataset.action === "folder") selectFolder();
      else selectFile();
    });
  });
  document.addEventListener("click", closeOpenMenus);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOpenMenus();
  });
}

function toggleOpenMenu(menu) {
  const isOpen = menu.classList.contains("open");
  closeOpenMenus();
  if (!isOpen) {
    menu.classList.add("open");
    menu.querySelector(".open-trigger").setAttribute("aria-expanded", "true");
  }
}

function closeOpenMenus() {
  document.querySelectorAll(".open-menu.open").forEach((menu) => {
    menu.classList.remove("open");
    menu.querySelector(".open-trigger").setAttribute("aria-expanded", "false");
  });
}

// ── Prose font size ─────────────────────────────────────────────────
function applyStoredFontSize() {
  setFontSize(localStorage.getItem("lmv-fontsize") || "medium");
}

function setFontSize(s) {
  if (!FONT_SIZES.includes(s)) s = "medium";
  document.getElementById("contentArea").dataset.fontsize = s;
  document.getElementById("fontSizeLabel").textContent = FONT_SIZE_LABELS[s];
}

function cycleFontSize() {
  const cur =
    document.getElementById("contentArea").dataset.fontsize || "medium";
  const next = FONT_SIZES[(FONT_SIZES.indexOf(cur) + 1) % FONT_SIZES.length];
  setFontSize(next);
  localStorage.setItem("lmv-fontsize", next);
}

function toggleOutline() {
  document.getElementById("outline").classList.toggle("collapsed");
}

// ── Theme ──────────────────────────────────────────────────────────
function applyStoredTheme() {
  const theme = localStorage.getItem("lmv-theme") || "light";
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("themeToggle");
  toggle.innerHTML = theme === "dark" ? ICON.sun : ICON.moon;
  toggle.title = theme === "dark" ? "切换到浅色主题" : "切换到深色主题";
}

function toggleTheme(event) {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";

  const canTransition =
    "startViewTransition" in document &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

  if (!canTransition) {
    setTheme(next);
    localStorage.setItem("lmv-theme", next);
    return;
  }

  const x = event?.clientX ?? window.innerWidth / 2;
  const y = event?.clientY ?? window.innerHeight / 2;
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );
  const clipPath = [
    `circle(0px at ${x}px ${y}px)`,
    `circle(${radius}px at ${x}px ${y}px)`,
  ];

  document
    .startViewTransition(async () => {
      setTheme(next);
      localStorage.setItem("lmv-theme", next);
    })
    .ready.then(() => {
      document.documentElement.animate(
        { clipPath: next === "dark" ? [...clipPath].reverse() : clipPath },
        {
          duration: 300,
          easing: "ease-in",
          pseudoElement: `::view-transition-${next === "dark" ? "old" : "new"}(root)`,
        },
      );
    });
}

// ── Background image ────────────────────────────────────────────────
function applyStoredBgImage() {
  // Restore custom image (set by home.js)
  const stored = localStorage.getItem("lmv-bg");
  if (stored) {
    document.documentElement.style.setProperty(
      "--bg-image",
      `url("${stored}")`,
    );
  }
  // Restore on/off preference — default OFF for the flat VitePress-style reading view.
  const show = localStorage.getItem("lmv-bg-show") === "on";
  setBgVisible(show, /* save */ false);
}

function setBgVisible(on, save = true) {
  document.body.classList.toggle("bg-off", !on);
  document.getElementById("bgToggleLabel").textContent = on ? "开" : "关";
  if (save) localStorage.setItem("lmv-bg-show", on ? "on" : "off");
}

function toggleBgImage() {
  const isOn = !document.body.classList.contains("bg-off");
  setBgVisible(!isOn);
}

// ── Drag & drop (open a folder or file by dropping it anywhere) ──────
function bindDragDrop() {
  const overlay = document.getElementById("dragOverlay");
  let depth = 0; // balance nested dragenter/dragleave pairs

  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    depth++;
    overlay.classList.add("visible");
  });
  document.addEventListener("dragleave", () => {
    depth--;
    if (depth <= 0) {
      depth = 0;
      overlay.classList.remove("visible");
    }
  });
  document.addEventListener("dragover", (e) => e.preventDefault());

  document.addEventListener("drop", async (e) => {
    e.preventDefault();
    depth = 0;
    overlay.classList.remove("visible");

    const items = [...(e.dataTransfer?.items ?? [])];
    for (const item of items) {
      if (item.kind !== "file") continue;

      // Prefer FileSystemHandle: preserves folder structure and stays re-readable.
      if (typeof item.getAsFileSystemHandle === "function") {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (!handle) continue;
          if (handle.kind === "directory") {
            rootHandle = handle;
            singleFileHandle = null;
            await LMV.storeHandle(handle);
            await loadFolder(handle);
            return;
          }
          if (isMarkdown(handle.name)) {
            await LMV.storeHandle(handle);
            await openSingleFile(handle);
            return;
          }
          continue; // unsupported file type — try the next dropped item
        } catch (_) {}
      }

      // Fallback: plain File → render its text directly.
      const file = item.getAsFile();
      if (!file || !isMarkdown(file.name)) continue;
      try {
        const text = await file.text();
        await openDirectContent(file.name, text, null, { autoOpen: true });
      } catch (_) {}
      return;
    }
  });
}

// ── Sidebar ─────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

// ── Sidebar location + "up one level" navigation ────────────────────
// Set the root label (folder or single-file name) and refresh the nav row.
function setRootLabel(label) {
  rootLabel = label || "";
  renderNav();
}

function stripExt(name) {
  return name.replace(/\.(md|markdown|mdown|mkd)$/i, "");
}

// path of the directory containing `filePath` (dir paths keep trailing '/').
function parentDir(filePath) {
  const i = filePath.lastIndexOf("/");
  return i >= 0 ? filePath.slice(0, i + 1) : "";
}

// One directory level up: "a/b/" → "a/", "a/" → "".
function parentDirOfDir(dir) {
  const parts = dir.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.length ? parts.join("/") + "/" : "";
}

// Walk the cached nested tree down to `dir` and return its child nodes.
function subtreeFor(dir) {
  let nodes = window._cachedTree || [];
  if (!dir) return nodes;
  for (const part of dir.replace(/\/$/, "").split("/")) {
    const found = nodes.find((n) => n.kind === "dir" && n.name === part);
    if (!found) return nodes; // path no longer exists — fall back to current level
    nodes = found.children || [];
  }
  return nodes;
}

// Climb one level toward the root; bounded at the opened folder's top.
function goUp() {
  if (fileOnlyView) {
    // From a single file → show its containing folder (all .md under it).
    const tree = window._cachedTree || [];
    const hasSiblings = tree.length > 1 || tree.some((n) => n.kind === "dir");
    if (!hasSiblings && singleFileHandle) {
      expandToFolder(singleFileHandle); // no siblings loaded → pick the real folder
      return;
    }
    fileOnlyView = false;
    currentDir = currentFileNode ? parentDir(currentFileNode.path) : "";
    renderSidebarTree();
  } else if (currentDir) {
    currentDir = parentDirOfDir(currentDir);
    renderSidebarTree();
  }
}

// Name of the level currently listed (file name in single-file view, else folder).
function currentLocationLabel() {
  if (fileOnlyView && currentFileNode) return currentFileNode.name;
  if (!currentDir) return rootLabel || "未选择";
  return currentDir.replace(/\/$/, "").split("/").pop();
}

// Tooltip for the sidebar "up" button — reflects what goUp() will do next.
function upLevelTooltip() {
  if (fileOnlyView) {
    return "查看所在文件夹的全部 .md 文件";
  }
  if (currentDir) {
    return "返回上一级目录";
  }
  return "已在根目录";
}

// Update the "up" button enabled state, location icon and label.
function renderNav() {
  const upBtn = document.getElementById("upLevel");
  upBtn.disabled = !(fileOnlyView || !!currentDir);
  const tip = upLevelTooltip();
  upBtn.dataset.tooltip = tip;
  upBtn.setAttribute("aria-label", tip);
  const loc = document.getElementById("locLabel");
  loc.querySelector(".loc-name").textContent = currentLocationLabel();
  const showFile = fileOnlyView && currentFileNode;
  loc.querySelector(".loc-icon").innerHTML = showFile
    ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>'
    : '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>';
}

function getCurrentFavoriteHandle() {
  return rootHandle || singleFileHandle;
}

async function refreshFavoriteBtn() {
  const btn = document.getElementById("addFavoriteBtn");
  if (!btn) return;
  if (viewingBuiltinReadme) {
    btn.disabled = false;
    const isFav = !LMV.isReadmeFavoriteDismissed();
    btn.classList.toggle("active", isFav);
    btn.title = isFav ? "已收藏" : "收藏";
    return;
  }
  const handle = getCurrentFavoriteHandle();
  if (!handle) {
    btn.disabled = true;
    btn.classList.remove("active");
    btn.title = "收藏";
    return;
  }
  btn.disabled = false;
  const favorites = await LMV.listFavorites();
  const isFav = favorites.some(
    (f) => f.name === handle.name && f.kind === handle.kind,
  );
  btn.classList.toggle("active", isFav);
  btn.title = isFav ? "已收藏" : "收藏";
}

async function addCurrentToFavorites() {
  if (viewingBuiltinReadme) {
    if (LMV.isReadmeFavoriteDismissed()) {
      LMV.restoreProjectReadmeFavorite();
      toast("已加入收藏");
    } else {
      await LMV.removeFavorite(LMV.README_FAV_ID);
      toast("已取消收藏");
    }
    refreshFavoriteBtn();
    return;
  }
  const handle = getCurrentFavoriteHandle();
  if (!handle) return;
  const result = await LMV.addFavorite(handle);
  if (result.added) {
    toast("已加入收藏");
  } else if (result.reason === "duplicate") {
    toast("已在收藏列表中");
  } else {
    toast("收藏失败");
  }
  refreshFavoriteBtn();
}

// ── Prev/next file pager (bottom-right) ─────────────────────────────
// Index of the open file within the flat list (drives the pager order).
function currentFileIndex() {
  return currentFileNode
    ? allFiles.findIndex((f) => f.path === currentFileNode.path)
    : -1;
}

// Open the file `delta` positions away in the flat list, if any.
function navFile(delta) {
  const i = currentFileIndex();
  if (i < 0) return;
  const next = allFiles[i + delta];
  if (next) openFile(next);
}

// Populate the inline doc-footer prev/next cards (VitePress-style, bottom of content).
function renderPager() {
  const i = currentFileIndex();
  const footer = document.getElementById("docFooter");
  const show = i >= 0 && allFiles.length > 1;
  footer.style.display = show ? "" : "none";
  if (!show) return;

  const prev = allFiles[i - 1],
    next = allFiles[i + 1];

  const prevBtn = document.getElementById("docPrev");
  const nextBtn = document.getElementById("docNext");
  prevBtn.style.visibility = prev ? "" : "hidden";
  nextBtn.style.visibility = next ? "" : "hidden";
  if (prev)
    document.getElementById("docPrevTitle").textContent = stripExt(prev.name);
  if (next)
    document.getElementById("docNextTitle").textContent = stripExt(next.name);
}

// Render #fileTree for the current directory (or search results).
function renderSidebarTree() {
  const container = document.getElementById("fileTree");
  if (fileOnlyView)
    renderTree(currentFileNode ? [currentFileNode] : [], container);
  else renderTree(subtreeFor(currentDir), container);
  renderNav();
  if (currentFileNode) highlightSidebar(currentFileNode);
}

// ── Folder selection ────────────────────────────────────────────────
async function selectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    rootHandle = handle;
    await LMV.storeHandle(handle);
    await loadFolder(handle);
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function selectFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Markdown",
          accept: { "text/markdown": [".md", ".markdown", ".mdown", ".mkd"] },
        },
      ],
    });
    if (!handle) return;
    await LMV.storeHandle(handle);
    await openSingleFile(handle);
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

// Open a single .md file with no surrounding folder.
async function openSingleFile(handle, { autoOpen = true } = {}) {
  viewingBuiltinReadme = false;
  rootHandle = null;
  singleFileHandle = handle;
  scopeKey = "file:" + handle.name;
  searchIndexBuilt = false;
  const node = { kind: "file", name: handle.name, path: handle.name, handle };
  allFiles = [node];
  window._cachedTree = [node];

  currentDir = "";
  fileOnlyView = true;
  setRootLabel(handle.name);
  if (autoOpen) currentFileNode = node;
  renderSidebarTree();
  refreshFavoriteBtn();
  if (autoOpen) {
    showMarkdownBody();
    showExpandHint(() => expandToFolder(handle));
    await openFile(node);
  }
}

// Retrieve content stored by the content script redirect and open it.
// The stashed text is consumed once; on a page refresh it's gone, so we fall
// back to re-reading the file directly from its file:// URL (kept in `src`).
async function tryOpenPending(
  key,
  name,
  srcUrl,
  { builtinReadme = false } = {},
) {
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
      await openDirectContent(name, text, srcUrl, {
        autoOpen: true,
        builtinReadme: builtinReadme || LMV.isProjectReadmeUrl(srcUrl),
      });
    } else if (!builtinReadme) {
      await tryRestoreFolder();
    }
  } catch (e) {
    console.error(e);
    if (!builtinReadme && !LMV.isProjectReadmeUrl(srcUrl)) {
      await tryRestoreFolder();
    }
  }
}

// Open markdown content that arrived via the content-script redirect.
// We only have the raw text + the file's file:// URL (no FS Access handle), so
// we render immediately, then try to enumerate sibling .md files by fetching the
// parent directory listing. If that fails, fall back to a manual folder picker.
async function openDirectContent(
  name,
  text,
  srcUrl,
  { autoOpen = true, builtinReadme = false } = {},
) {
  viewingBuiltinReadme = builtinReadme;
  rootHandle = null;
  singleFileHandle = null;
  scopeKey = builtinReadme
    ? "builtin:readme"
    : "dir:" + (srcUrl ? srcUrl.slice(0, srcUrl.lastIndexOf("/") + 1) : name);
  searchIndexBuilt = false;

  const node = {
    kind: "file",
    name,
    path: name,
    handle: memHandle(name, text),
    __text: text,
  };
  allFiles = [node];
  window._cachedTree = [node];

  currentDir = "";
  fileOnlyView = true;
  setRootLabel(builtinReadme ? "Leaflet Mark View" : name);
  document.getElementById("fileStats").textContent = "";
  if (autoOpen) currentFileNode = node;
  renderSidebarTree();
  refreshFavoriteBtn();
  if (autoOpen) {
    showMarkdownBody();
    await openFile(node);
  } else {
    clearFileUrlParams();
  }

  if (builtinReadme) return;

  // Discover the other .md files sitting next to this one (fills the Folder tab).
  if (srcUrl) {
    try {
      const { dirUrl, nodes } = await loadSiblingsFromUrl(srcUrl, name, text);
      allFiles = nodes;
      window._cachedTree = nodes;
      searchIndexBuilt = false;
      if (autoOpen) {
        const oldNode = currentFileNode;
        currentFileNode = nodes.find((n) => n.name === name) || currentFileNode;
        // openFile() set __text on the old node; carry it over to the replacement.
        if (currentFileNode !== oldNode && oldNode?.__text != null) {
          currentFileNode.__text = oldNode.__text;
        }
      }
      const dirName =
        decodeURIComponent(dirUrl.replace(/\/+$/, "").split("/").pop()) ||
        dirUrl;
      setRootLabel(dirName);
      // document.getElementById("fileStats").textContent = `${nodes.length} `;
      renderSidebarTree();
      return;
    } catch (e) {
      console.warn(
        "[Leaflet Mark View] 无法列出同目录文件，回退到手动选择:",
        e,
      );
    }
  }
  if (autoOpen) showExpandHint(() => selectFolder());
}

// Synthetic handle backed by in-memory text (the file we already have).
function memHandle(name, text) {
  return {
    kind: "file",
    name,
    getFile: () => Promise.resolve({ text: () => Promise.resolve(text), name }),
  };
}

// Synthetic handle that lazily fetches a file:// URL's text when opened.
function urlHandle(fileUrl, name) {
  return {
    kind: "file",
    name,
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
  const dirUrl = srcUrl.slice(0, srcUrl.lastIndexOf("/") + 1);
  // file:// responses report status 0 even on success — read the body regardless.
  const res = await fetch(dirUrl);
  const html = await res.text();
  if (!html) throw new Error("目录响应为空（可能被浏览器拦截）");

  const entries = parseDirListing(html).filter((e) => isMarkdown(e.name));
  if (entries.length === 0)
    throw new Error(
      "目录中没有 Markdown 文件（已读到 " + html.length + " 字节）",
    );

  entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
  const nodes = entries.map((e) => ({
    kind: "file",
    name: e.name,
    path: e.name,
    url: dirUrl + e.href, // file:// URL, used to keep the address bar in sync
    // Reuse the text we already have for the current file; fetch the rest on demand.
    handle:
      e.name === currentName
        ? memHandle(e.name, currentText)
        : urlHandle(dirUrl + e.href, e.name),
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
    if (m[3] === "1") continue; // directory
    out.push({ name: decodeJsString(m[1]), href: decodeJsString(m[2]) });
  }
  return out;
}

function decodeJsString(s) {
  return s
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\(.)/g, "$1");
}

// Footer button that opens a manual directory picker (fallback).
function showExpandHint(onClick) {
  const statsEl = document.getElementById("fileStats");
  statsEl.innerHTML = "";
  const hint = document.createElement("button");
  hint.className = "expand-folder-hint";
  hint.title = "打开所在文件夹查看其他 .md 文件";
  hint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>查看所在文件夹`;
  hint.addEventListener("click", onClick);
  statsEl.appendChild(hint);
}

// Upgrade from single-file mode: open a directory picker starting in the same
// directory, then load the full folder and re-select the file we had open.
async function expandToFolder(fileHandle) {
  try {
    const dirHandle = await window.showDirectoryPicker({
      startIn: fileHandle,
      mode: "read",
    });
    singleFileHandle = null;
    rootHandle = dirHandle;
    await LMV.storeHandle(dirHandle);
    // After scanning, auto-open the file that was already rendered
    await loadFolder(dirHandle, fileHandle.name);
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function tryRestoreFolder() {
  try {
    const handle = await LMV.getStoredHandle();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: "read" });
    if (perm === "granted") {
      await restoreHandle(handle);
    } else if (perm === "prompt") {
      // Show a banner offering to reconnect
      showReconnectBanner(handle);
    }
  } catch (_) {
    /* ignore */
  }
}

// Restore either a directory or a single file, depending on the handle kind.
// autoOpen reopens the last-read file (defaulting to README) and highlights it.
async function restoreHandle(handle) {
  if (handle.kind === "file") {
    await openSingleFile(handle, { autoOpen: true });
  } else {
    rootHandle = handle;
    await loadFolder(handle, null, { autoOpen: true });
  }
}

function showReconnectBanner(handle) {
  const banner = document.createElement("div");
  banner.className = "reconnect-banner";
  banner.innerHTML = `<span class="dot"></span><span>重新连接到 <strong>${escHtml(handle.name)}</strong></span>${ICON.arrowRight}`;
  banner.addEventListener("click", async () => {
    try {
      await handle.requestPermission({ mode: "read" });
      await restoreHandle(handle);
    } catch (_) {}
    banner.remove();
  });
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

// ── Directory scanning ──────────────────────────────────────────────
async function loadFolder(
  dirHandle,
  preferName = null,
  { autoOpen = true } = {},
) {
  viewingBuiltinReadme = false;
  if (autoOpen) {
    showMarkdownBody();
    setContent(
      `<div class="loading"><div class="spinner"></div>正在扫描文件夹…</div>`,
    );
  }
  setRootLabel(dirHandle.name);
  document.getElementById("fileStats").textContent = "";

  scopeKey = "folder:" + dirHandle.name;
  searchIndexBuilt = false;

  const tree = await scanDir(dirHandle, "");
  window._cachedTree = tree;
  allFiles = flattenFiles(tree);

  currentDir = "";
  fileOnlyView = false;
  renderSidebarTree();
  document.getElementById("fileStats").textContent = `${allFiles.length} `;

  refreshFavoriteBtn();

  if (allFiles.length > 0) {
    if (autoOpen) {
      // Explicit request → last-read file → README → first file.
      const lastPath = localStorage.getItem(lastFileKey());
      const target =
        (preferName && allFiles.find((f) => f.name === preferName)) ||
        (lastPath && allFiles.find((f) => f.path === lastPath)) ||
        allFiles.find((f) =>
          /^readme\.(md|markdown|mdown|mkd)$/i.test(f.name),
        ) ||
        allFiles[0];
      openFile(target);
    }
  } else if (autoOpen) {
    clearOutline();
    setContent('<div class="loading">未找到 Markdown 文件</div>');
  }
}

function showMarkdownBody() {
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("markdownBody").style.display = "block";
}

async function scanDir(dirHandle, prefix) {
  const items = [];
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith(".")) continue; // skip hidden
      if (handle.kind === "directory") {
        const children = await scanDir(handle, prefix + name + "/");
        if (children.length > 0)
          items.push({
            kind: "dir",
            name,
            path: prefix + name + "/",
            handle,
            children,
          });
      } else if (isMarkdown(name)) {
        items.push({ kind: "file", name, path: prefix + name, handle });
      }
    }
  } catch (e) {
    console.warn("Cannot read directory:", e);
  }
  // Dirs first, then files, both alphabetical
  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function isMarkdown(name) {
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

function flattenFiles(nodes) {
  const result = [];
  for (const n of nodes) {
    if (n.kind === "file") result.push(n);
    else if (n.children) result.push(...flattenFiles(n.children));
  }
  return result;
}

// ── File tree rendering ─────────────────────────────────────────────
function renderTree(nodes, container) {
  container.innerHTML = "";
  if (nodes.length === 0) {
    container.innerHTML = '<div class="sidebar-empty">没有找到 .md 文件</div>';
    return;
  }
  nodes.forEach((n) => container.appendChild(createNode(n)));
}

function createNode(node) {
  if (node.kind === "dir") {
    const wrap = document.createElement("div");
    wrap.className = "tree-dir open";
    wrap.dataset.path = node.path;

    const header = document.createElement("div");
    header.className = "tree-dir-header";
    // VitePress style: name on left, chevron on right
    header.innerHTML = `<span class="tree-dir-name">${escHtml(node.name)}</span>${ICON.chevron}`;
    header.addEventListener("click", () => wrap.classList.toggle("open"));

    const children = document.createElement("div");
    children.className = "tree-dir-children";
    node.children.forEach((c) => children.appendChild(createNode(c)));

    wrap.appendChild(header);
    wrap.appendChild(children);
    return wrap;
  }

  const el = document.createElement("div");
  el.className = "tree-file";
  el.dataset.path = node.path;
  const displayName = node.name.replace(/\.(md|markdown|mdown|mkd)$/i, "");
  // VitePress style: plain text only, no file icon
  el.innerHTML = `<span class="tree-file-name" title="${escHtml(node.path)}">${escHtml(displayName)}</span>`;
  el.addEventListener("click", () => openFile(node));
  return el;
}

// ── File tree context menu ───────────────────────────────────────────
let treeContextNode = null;

function findNodeByPath(path) {
  function walk(nodes) {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(window._cachedTree || []);
}

async function resolveDirHandle(node) {
  if (node.kind === "dir") {
    return node.handle?.kind === "directory" ? node.handle : null;
  }
  if (!rootHandle || !node.path) return null;
  const parts = node.path.split("/").filter(Boolean);
  if (parts.length <= 1) return rootHandle;
  parts.pop();
  try {
    let h = rootHandle;
    for (const p of parts) {
      h = await h.getDirectoryHandle(p);
    }
    return h;
  } catch (_) {
    return null;
  }
}

function isRealFsHandle(handle) {
  if (!handle) return false;
  if (handle.kind === "directory") {
    return typeof handle.entries === "function";
  }
  if (handle.kind === "file") {
    return (
      typeof handle.isSameEntry === "function" ||
      typeof handle.createWritable === "function"
    );
  }
  return false;
}

async function openNodeInSystemFolder(node) {
  if (!node || viewingBuiltinReadme) return;

  if (node.url) {
    const dirUrl =
      node.kind === "file"
        ? node.url.slice(0, node.url.lastIndexOf("/") + 1)
        : node.url.endsWith("/")
          ? node.url
          : node.url.slice(0, node.url.lastIndexOf("/") + 1);
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: dirUrl });
    } else {
      window.open(dirUrl, "_blank", "noopener");
    }
    return;
  }

  const startIn =
    node.kind === "dir" && node.handle?.kind === "directory"
      ? node.handle
      : node.kind === "file" && isRealFsHandle(node.handle)
        ? node.handle
        : await resolveDirHandle(node);

  if (!startIn) {
    toast("无法打开本地文件夹");
    return;
  }

  try {
    await window.showDirectoryPicker({ startIn, mode: "read" });
  } catch (e) {
    if (e.name !== "AbortError") toast("无法打开文件夹");
  }
}

function hideTreeContextMenu() {
  const menu = document.getElementById("treeContextMenu");
  if (!menu) return;
  menu.hidden = true;
  menu.classList.remove("open");
  treeContextNode = null;
}

function showTreeContextMenu(x, y, node) {
  const menu = document.getElementById("treeContextMenu");
  const btn = document.getElementById("treeContextReveal");
  if (!menu || !btn) return;

  treeContextNode = node;
  btn.textContent =
    node.kind === "dir" ? "打开文件夹" : "打开所在文件夹";

  menu.hidden = false;
  menu.classList.add("open");

  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - pad) {
    left = window.innerWidth - rect.width - pad;
  }
  if (top + rect.height > window.innerHeight - pad) {
    top = window.innerHeight - rect.height - pad;
  }
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;
}

function bindTreeContextMenu() {
  const tree = document.getElementById("fileTree");
  const menu = document.getElementById("treeContextMenu");
  const revealBtn = document.getElementById("treeContextReveal");
  if (!tree || !menu || !revealBtn) return;

  tree.addEventListener("contextmenu", (e) => {
    const fileEl = e.target.closest(".tree-file");
    const dirHeader = e.target.closest(".tree-dir-header");
    if (!fileEl && !dirHeader) return;

    const path = fileEl
      ? fileEl.dataset.path
      : dirHeader.closest(".tree-dir")?.dataset.path;
    if (!path) return;

    const node = findNodeByPath(path);
    if (!node) return;

    e.preventDefault();
    showTreeContextMenu(e.clientX, e.clientY, node);
  });

  revealBtn.addEventListener("click", () => {
    if (treeContextNode) openNodeInSystemFolder(treeContextNode);
    hideTreeContextMenu();
  });

  document.addEventListener("click", hideTreeContextMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTreeContextMenu();
  });
  tree.addEventListener("scroll", hideTreeContextMenu, { passive: true });
}

// ── Search modal ─────────────────────────────────────────────────────
let smActiveIdx = -1;

function openSearchModal() {
  document.getElementById("searchBackdrop").classList.add("open");
  document.getElementById("searchModal").classList.add("open");
  const inp = document.getElementById("searchModalInput");
  inp.value = "";
  inp.focus();
  smActiveIdx = -1;
  renderModalResults("");
}

function closeSearchModal() {
  document.getElementById("searchBackdrop").classList.remove("open");
  document.getElementById("searchModal").classList.remove("open");
}

function onModalKey(e) {
  const items = document.querySelectorAll(".sm-result");
  if (!items.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    smActiveIdx = Math.min(smActiveIdx + 1, items.length - 1);
    updateModalActive(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    smActiveIdx = Math.max(smActiveIdx - 1, 0);
    updateModalActive(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const active = items[smActiveIdx >= 0 ? smActiveIdx : 0];
    if (active) active.click();
  } else if (e.key === "Escape") {
    closeSearchModal();
  }
}

function updateModalActive(items) {
  items.forEach((el, i) => el.classList.toggle("active", i === smActiveIdx));
  if (smActiveIdx >= 0) items[smActiveIdx].scrollIntoView({ block: "nearest" });
}

async function onModalSearch() {
  const q = document
    .getElementById("searchModalInput")
    .value.trim()
    .toLowerCase();
  smActiveIdx = -1;
  renderModalResults(q);
  if (q.length >= 2) {
    await ensureSearchIndex();
    if (
      document.getElementById("searchModalInput").value.trim().toLowerCase() ===
      q
    ) {
      renderModalResults(q);
    }
  }
}

function renderModalResults(q) {
  const container = document.getElementById("searchModalResults");
  if (!q) {
    container.innerHTML = "";
    return;
  }

  const results = [];
  for (const f of allFiles) {
    const nameHit =
      f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    const text = f.__text || "";
    const idx = text.toLowerCase().indexOf(q);
    if (nameHit || idx >= 0) {
      results.push({
        node: f,
        snippet: idx >= 0 ? makeSnippet(text, idx, q.length) : "",
      });
    }
  }

  if (results.length === 0) {
    container.innerHTML = `<div class="search-modal-empty">没有匹配结果</div>`;
    return;
  }

  container.innerHTML = "";
  results.forEach((r) => {
    const el = document.createElement("div");
    el.className = "sm-result";

    // Build breadcrumb from path segments
    const rawName = r.node.name.replace(/\.(md|markdown|mdown|mkd)$/i, "");
    const segs = r.node.path.split("/");
    segs[segs.length - 1] = rawName; // strip extension from last segment
    const crumbHtml = segs
      .map((s, i) => {
        const hl = highlightMatch(escHtml(s), q);
        return (
          (i === 0 ? "" : '<span class="sm-crumb-sep">›</span>') +
          `<span>${hl}</span>`
        );
      })
      .join("");

    const snippet = r.snippet
      ? `<div class="sm-snippet">${highlightMatch(escHtml(r.snippet), q)}</div>`
      : "";

    el.innerHTML = `<div class="sm-result-body">
      <div class="sm-crumb"><span class="sm-crumb-hash">#</span>${crumbHtml}</div>
      ${snippet}
    </div>`;
    el.addEventListener("click", () => {
      closeSearchModal();
      openFile(r.node);
    });
    container.appendChild(el);
  });
}

// ── Legacy sidebar search (kept for renderSidebarTree compatibility) ──
async function onSearch() {}

// Read every file's text once so searches can scan content. Idempotent; reset
// to false whenever the file set changes.
async function ensureSearchIndex() {
  if (searchIndexBuilt) return;
  await Promise.all(
    allFiles.map(async (f) => {
      if (f.__text != null) return;
      try {
        f.__text = await (await f.handle.getFile()).text();
      } catch (_) {
        f.__text = "";
      }
    }),
  );
  searchIndexBuilt = true;
}

// Build sidebar results matching on filename OR file content. Content matches
// get a snippet preview. Uses cached __text if present; missing text just means
// the content pass is skipped for that file until the index finishes loading.
function renderSearchResults(q, container) {
  const results = [];
  for (const f of allFiles) {
    const nameHit =
      f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    const text = f.__text || "";
    const idx = text.toLowerCase().indexOf(q);
    if (nameHit || idx >= 0) {
      results.push({
        node: f,
        snippet: idx >= 0 ? makeSnippet(text, idx, q.length) : "",
      });
    }
  }
  container.innerHTML = "";
  if (results.length === 0) {
    container.innerHTML = '<div class="sidebar-empty">没有匹配结果</div>';
    return;
  }
  results.forEach((r) => container.appendChild(createSearchNode(r, q)));
}

function createSearchNode(r, q) {
  const el = document.createElement("div");
  el.className = "tree-file search-result";
  el.dataset.path = r.node.path;
  const displayName = r.node.name.replace(/\.(md|markdown|mdown|mkd)$/i, "");
  const head = `<div class="sr-head"><span class="tree-file-name" title="${escHtml(r.node.path)}">${highlightMatch(displayName, q)}</span></div>`;
  const snippet = r.snippet
    ? `<div class="sr-snippet">${highlightMatch(r.snippet, q)}</div>`
    : "";
  el.innerHTML = head + snippet;
  el.addEventListener("click", () => openFile(r.node));
  return el;
}

// Plain-text excerpt around the match (collapsed whitespace, ellipses at edges).
function makeSnippet(text, idx, len) {
  const start = Math.max(0, idx - 24);
  const end = Math.min(text.length, idx + len + 48);
  const core = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + core + (end < text.length ? "…" : "");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Escape for HTML, then wrap query occurrences in <mark> (case-insensitive).
function highlightMatch(text, q) {
  const esc = escHtml(text);
  if (!q) return esc;
  return esc.replace(
    new RegExp(escapeRe(escHtml(q)), "gi"),
    (m) => `<mark>${m}</mark>`,
  );
}

// Parse markdown into `body` and wire up links + heading anchors + outline.
// Shared by file opening and the source-editor's preview toggle.
function renderMarkdownInto(body, text) {
  body.innerHTML = parseMarkdown(text, true);

  // Open external links safely
  body.querySelectorAll('a[target="_blank"]').forEach((a) => {
    a.setAttribute("rel", "noopener noreferrer");
  });

  // Permalink anchors on headings (VitePress header-anchor)
  body.querySelectorAll(".header-anchor").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      const h = body.querySelector("#" + CSS.escape(id));
      if (!h) return;
      h.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#" + id);
    });
  });

  // Code blocks: VitePress-style language label + copy button.
  body.querySelectorAll("pre").forEach(decorateCodeBlock);

  buildOutline(body);
}

// Tag a <pre> with its language and add a hover copy button.
function decorateCodeBlock(pre) {
  const code = pre.querySelector("code");
  if (!code) return;
  const m = (code.className || "").match(/language-([\w-]+)/);
  if (m) pre.dataset.lang = m[1];

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "code-copy";
  btn.setAttribute("aria-label", "复制代码");
  btn.innerHTML = ICON.copy;
  btn.addEventListener("click", async () => {
    const ok = await copyText(code.textContent);
    if (!ok) return;
    btn.classList.add("copied");
    btn.innerHTML = ICON.check;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = ICON.copy;
    }, 1500);
  });
  pre.appendChild(btn);
}

// Clipboard write with a legacy fallback for file:// / restricted contexts.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }
}

// ── Source editor (source ↔ preview toggle) ────────────────────────
// A real FileSystemFileHandle exposes createWritable(); the synthetic handles
// used for file:// direct-open (memHandle/urlHandle) do not, so those are read-only.
function isWritable(node) {
  return !!(
    node &&
    node.handle &&
    typeof node.handle.createWritable === "function"
  );
}

function isDirty() {
  if (!editMode || !currentFileNode) return false;
  return (
    document.getElementById("sourceEditor").value !==
    (currentFileNode.__text ?? "")
  );
}

function refreshDirtyState() {
  document.getElementById("saveFile").classList.toggle("dirty", isDirty());
}

// Reflect whether the open file can be edited/saved on the toolbar buttons.
function updateEditAvailability() {
  const editBtn = document.getElementById("editToggle");
  editBtn.disabled = !currentFileNode;
  editBtn.classList.toggle("active", editMode);
  // Save is always available while editing — read-only sources fall back to Save As.
  document.getElementById("saveFile").style.display = editMode ? "" : "none";
  document.getElementById("readonlyHint").style.display =
    editMode && !isWritable(currentFileNode) ? "" : "none";
}

function toggleSourceMode() {
  if (!currentFileNode) return;
  if (editMode) previewFromSource();
  else enterSourceMode();
}

function enterSourceMode() {
  editMode = true;
  const editor = document.getElementById("sourceEditor");
  const ca = document.getElementById("contentArea");

  // Capture preview scroll ratio before switching views.
  const previewRatio =
    ca.scrollHeight > ca.clientHeight
      ? ca.scrollTop / (ca.scrollHeight - ca.clientHeight)
      : 0;

  editor.value = currentFileNode.__text ?? "";
  editor.style.display = "block";
  document.getElementById("markdownBody").style.display = "none";
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
  const editor = document.getElementById("sourceEditor");
  // Capture source scroll ratio before re-render destroys the editor's layout.
  const sourceRatio =
    editor.scrollHeight > editor.clientHeight
      ? editor.scrollTop / (editor.scrollHeight - editor.clientHeight)
      : 0;

  renderMarkdownInto(document.getElementById("markdownBody"), editor.value);
  exitSourceMode();

  // Apply ratio to the re-rendered preview.
  const ca = document.getElementById("contentArea");
  requestAnimationFrame(() => {
    const maxScroll = ca.scrollHeight - ca.clientHeight;
    if (maxScroll > 0) {
      restoringScroll = true;
      ca.scrollTop = sourceRatio * maxScroll;
      requestAnimationFrame(() => {
        restoringScroll = false;
      });
    }
  });
}

// Pure view switch back to the rendered preview (no re-render).
function exitSourceMode() {
  editMode = false;
  document.getElementById("sourceEditor").style.display = "none";
  document.getElementById("markdownBody").style.display = "block";
  updateEditAvailability();
}

async function ensureWritable(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

async function saveCurrentFile() {
  if (!editMode || !currentFileNode) return;
  const node = currentFileNode;
  const text = document.getElementById("sourceEditor").value;
  try {
    // Real handles write in place; synthetic ones (file:// direct open) can't —
    // fall back to a Save As picker and adopt the chosen handle for later saves.
    let handle = isWritable(node) ? node.handle : null;
    if (!handle) {
      if (!window.showSaveFilePicker) {
        toast("当前环境不支持保存");
        return;
      }
      handle = await window.showSaveFilePicker({
        suggestedName: node.name,
        types: [
          {
            description: "Markdown",
            accept: { "text/markdown": [".md", ".markdown"] },
          },
        ],
      });
      node.handle = handle; // subsequent saves go straight to disk
    }
    if (!(await ensureWritable(handle))) {
      toast("未获得写入权限");
      return;
    }
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    node.__text = text; // keep search index + dirty baseline in sync
    refreshDirtyState();
    updateEditAvailability(); // node may have just become writable
    toast("已保存");
  } catch (e) {
    if (e.name === "AbortError") return; // user cancelled the picker
    toast("保存失败：" + e.message);
  }
}

// Transient bottom-center notice.
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById("lmvToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "lmvToast";
    el.className = "lmv-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

function clearFileUrlParams() {
  const u = new URL(location.href);
  u.searchParams.delete("pending");
  u.searchParams.delete("name");
  u.searchParams.delete("src");
  history.replaceState(null, "", u.pathname + u.search);
}

// Return to the home page.
function goHome() {
  if (
    editMode &&
    isDirty() &&
    !confirm("当前文件有未保存的修改，确定放弃并返回主页？")
  )
    return;
  location.href = "home.html";
}

// ── File opening ────────────────────────────────────────────────────
async function openFile(node) {
  // Guard against losing unsaved source edits when switching files.
  if (
    editMode &&
    isDirty() &&
    !confirm("当前文件有未保存的修改，确定放弃并切换？")
  )
    return;
  exitSourceMode(); // always return to preview when opening a file

  currentFileNode = node;
  saveLastFile(node);
  // The listing (folder tree vs single file) is set by the entry action and the
  // "up one level" button — opening a file just moves the highlight + nav label.
  highlightSidebar(node);
  renderNav();
  renderPager();

  // Direct (file://) mode: keep the address bar pointed at the open file so a
  // refresh reopens it instead of the file we first arrived on.
  if (node.url) {
    const u = new URL(location.href);
    u.searchParams.delete("pending");
    u.searchParams.set("name", node.name);
    u.searchParams.set("src", node.url);
    history.replaceState(null, "", u);
  }

  showMarkdownBody();
  setContent(`<div class="loading"><div class="spinner"></div>加载中…</div>`);

  try {
    const file = await node.handle.getFile();
    const text = await file.text();
    node.__text = text; // cache for full-text search

    renderMarkdownInto(document.getElementById("markdownBody"), text);
    updateEditAvailability();
    // Restore the previous reading position for this file (default: top).
    restoringScroll = true;
    document.getElementById("contentArea").scrollTop = getSavedScroll(node);
    requestAnimationFrame(() => {
      restoringScroll = false;
    });
  } catch (e) {
    clearOutline();
    setContent(
      `<p style="color:#e55;padding:32px">无法读取文件：${escHtml(e.message)}</p>`,
    );
  }
}

// Highlight a file in the sidebar tree and scroll it into view.
function highlightSidebar(node) {
  if (activeEl) activeEl.classList.remove("active");
  const el = document.querySelector(
    `.tree-file[data-path="${CSS.escape(node.path)}"]`,
  );
  if (el) {
    el.classList.add("active");
    el.scrollIntoView({ block: "nearest" });
    activeEl = el;
  }
}

// ── Outline (table of contents) ─────────────────────────────────────
function buildOutline(body) {
  const outline = document.getElementById("outline");
  const root = document.getElementById("outlineRoot");
  root.innerHTML = "";

  const headings = [...body.querySelectorAll("h2, h3, h4")];
  if (headings.length < 2) {
    clearOutline();
    return;
  }

  const used = new Set();
  headings.forEach((h) => {
    const base = slugFromText(h.textContent);
    let id = base,
      n = 1;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
    // Keep header-anchor href in sync when ids are deduped
    const anchor = h.querySelector(".header-anchor");
    if (anchor) anchor.setAttribute("href", "#" + id);
  });

  let currentH2Li = null;

  headings.forEach((h) => {
    const level = Number(h.tagName[1]);
    const a = document.createElement("a");
    a.className = "outline-link";
    if (level >= 3) a.classList.add("nested");
    a.href = "#" + h.id;
    a.dataset.target = h.id;
    a.textContent = h.textContent.replace(/\u200B/g, "").trim();
    a.title = a.textContent;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#" + h.id);
    });

    const li = document.createElement("li");

    if (level === 2) {
      li.appendChild(a);
      root.appendChild(li);
      currentH2Li = li;
    } else if (level === 3 || level === 4) {
      li.appendChild(a);
      if (currentH2Li) {
        let nested = currentH2Li.querySelector(":scope > ul.outline-nested");
        if (!nested) {
          nested = document.createElement("ul");
          nested.className = "outline-nested";
          currentH2Li.appendChild(nested);
        }
        nested.appendChild(li);
      } else {
        root.appendChild(li);
      }
    }
  });

  outline.classList.remove("empty");
  setupScrollSpy(headings);
}

function clearOutline() {
  detachScrollSpy();
  const root = document.getElementById("outlineRoot");
  if (root) root.innerHTML = "";
  document.getElementById("outline").classList.add("empty");
}

function detachScrollSpy() {
  if (spyHandler) {
    document
      .getElementById("contentArea")
      .removeEventListener("scroll", spyHandler);
    spyHandler = null;
  }
}

// Highlight the heading nearest the top of the reading pane as the user scrolls.
// Passive + rAF-throttled listener on the content container (not the window),
// so it does no per-frame layout/animation work.
function setupScrollSpy(headings) {
  detachScrollSpy();
  const ca = document.getElementById("contentArea");
  const root = document.getElementById("outlineRoot");
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
    root.querySelectorAll(".outline-link").forEach((a) => {
      const on = a.dataset.target === current.id;
      a.classList.toggle("active", on);
      if (on) activeItem = a;
    });
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
      const marker = document.getElementById("outlineMarker");
      const content = document.querySelector(".outline-content");
      if (marker && content) {
        const itemRect = activeItem.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        marker.style.top = itemRect.top - contentRect.top + 7 + "px";
        marker.style.opacity = "1";
      }
    }
  };

  spyHandler = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  ca.addEventListener("scroll", spyHandler, { passive: true });
  update();
}

function slugFromText(text) {
  return (
    (text || "section")
      .trim()
      .toLowerCase()
      .replace(/[^\w一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function setContent(html) {
  document.getElementById("markdownBody").innerHTML = html;
}

// ── Utils ────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
