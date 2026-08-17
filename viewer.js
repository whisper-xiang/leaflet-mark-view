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
  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
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
let viewingBuiltinReadme = false; // extension-bundled README.md (no FS handle)
let urlModalApi = { openUrlModal() {}, closeUrlModal() {} };

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
  applyStoredReadingFont();
  applyStoredBgImage();
  syncOutlineToggleLabel();
  urlModalApi = RemoteMD.bindUrlModal();

  const params = new URLSearchParams(location.search);
  const pendingKey = params.get("pending");
  const src = params.get("src") || "";
  const filePath = params.get("path") || "";
  const pick = params.get("pick") || "";
  const builtinReadme =
    params.get("builtin") === "readme" || LMV.isProjectReadmeUrl(src);
  await setupStartState();
  // `pending` is a one-shot key (consumed on first open); `src` is the durable
  // file:// URL that survives refresh. Either one means "open this file".
  if (pendingKey || src) {
    await tryOpenPending(
      pendingKey,
      params.get("name") || "untitled.md",
      src,
      { builtinReadme, filePath },
    );
  } else if (pick === "folder" || pick === "file" || pick === "url") {
    consumePickParam();
    if (pick === "folder") await selectFolder();
    else if (pick === "file") await selectFile();
    else urlModalApi.openUrlModal();
  } else if (!params.has("start")) {
    await tryRestoreFolder();
  }

  await buildFeedTabs();
});

function bindUI() {
  bindOpenMenus();
  bindLightbox();
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (isLightboxOpen()) {
        e.preventDefault();
        closeLightbox();
      } else if (document.getElementById("urlModal")?.classList.contains("open")) {
        e.preventDefault();
        urlModalApi.closeUrlModal();
      } else if (
        document.getElementById("htmlModal")?.classList.contains("open")
      ) {
        e.preventDefault();
        closeHtmlExportModal();
      } else if (
        document.getElementById("docxModal")?.classList.contains("open")
      ) {
        e.preventDefault();
        closeDocxExportModal();
      } else if (
        document.getElementById("searchModal").classList.contains("open")
      ) {
        e.preventDefault();
        closeSearchModal();
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearchModal();
    }
  });
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
    .getElementById("fontSizeToggle")
    .addEventListener("click", cycleFontSize);
  document
    .getElementById("readingThemeToggle")
    .addEventListener("click", cycleReadingTheme);
  document
    .getElementById("readingFontToggle")
    .addEventListener("click", cycleReadingFont);
  document
    .getElementById("outlineToggle")
    .addEventListener("click", toggleOutline);
  document.getElementById("bgToggle").addEventListener("click", toggleBgImage);
  bindBgChooser();
  bindBrowserRender();
  bindPinFolder();
  bindConfluenceModal();
  bindHtmlExportModal();
  bindDocxExportModal();
  bindDragDrop();
  bindOutlineResize();
  document
    .getElementById("searchTrigger")
    .addEventListener("click", openSearchModal);
  document
    .getElementById("searchModalInput")
    .addEventListener("input", onModalSearch);
  document.getElementById("searchModalClear").addEventListener("click", () => {
    const inp = document.getElementById("searchModalInput");
    if (inp.value) {
      inp.value = "";
      inp.focus();
      onModalSearch();
    } else {
      closeSearchModal();
    }
  });
  document
    .getElementById("searchBackdrop")
    .addEventListener("click", closeSearchModal);
  document.getElementById("searchModal").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeSearchModal();
  });
  document
    .getElementById("searchModalInput")
    .addEventListener("keydown", onModalKey);
  document.getElementById("homeBtn").addEventListener("click", goHome);
  document.querySelectorAll("[data-start-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.startAction === "folder") selectFolder();
      else if (button.dataset.startAction === "url") urlModalApi.openUrlModal();
      else selectFile();
    });
  });

  bindTreeContextMenu();

  // Remember reading position per file (throttled; skip the programmatic restore).
  let scrollSaveTimer;
  document.getElementById("contentArea").addEventListener(
    "scroll",
    () => {
      if (restoringScroll || !currentFileNode) return;
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

async function setupStartState() {
  const section = document.getElementById("startRecents");
  const list = document.getElementById("startRecentsList");
  const refresh = async () => {
    const recents = await LMV.listRecents();
    section.hidden = recents.length === 0;
    if (recents.length) await LMV.renderRecentsList(list, { onChange: refresh });
  };
  await refresh();
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
      else if (item.dataset.action === "url") urlModalApi.openUrlModal();
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

function syncOutlineToggleLabel() {
  const on = !document.getElementById("outline").classList.contains("collapsed");
  document.getElementById("outlineToggleLabel").textContent = on ? "开" : "关";
}

function toggleOutline() {
  document.getElementById("outline").classList.toggle("collapsed");
  syncOutlineToggleLabel();
}

// ── Theme ──────────────────────────────────────────────────────────
const READING_THEMES = [
  { id: "light", label: "默认", dark: false },
  { id: "sepia", label: "羊皮纸", dark: false },
  { id: "sage", label: "青纸", dark: false },
  { id: "dark", label: "深色", dark: true },
  { id: "ink", label: "夜墨", dark: true },
];

function themeMeta(id) {
  return READING_THEMES.find((t) => t.id === id) || READING_THEMES[0];
}

function isDarkTheme(id) {
  return !!themeMeta(id).dark;
}

function applyStoredTheme() {
  const theme = localStorage.getItem("lmv-theme") || "light";
  setTheme(theme);
}

function setTheme(theme) {
  const meta = themeMeta(theme);
  const root = document.documentElement;
  root.setAttribute("data-theme", meta.id);
  root.setAttribute("data-scheme", meta.dark ? "dark" : "light");
  const toggle = document.getElementById("themeToggle");
  toggle.innerHTML = meta.dark ? ICON.sun : ICON.moon;
  toggle.title = meta.dark ? "切换到浅色主题" : "切换到深色主题";
  const label = document.getElementById("readingThemeLabel");
  if (label) label.textContent = meta.label;
  localStorage.setItem(
    meta.dark ? "lmv-theme-dark" : "lmv-theme-light",
    meta.id,
  );
}

function cycleReadingTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const i = Math.max(
    0,
    READING_THEMES.findIndex((t) => t.id === current),
  );
  const next = READING_THEMES[(i + 1) % READING_THEMES.length];
  setTheme(next.id);
  localStorage.setItem("lmv-theme", next.id);
}

const READING_FONTS = [
  { id: "sans", label: "黑体" },
  { id: "serif", label: "宋体" },
];

function applyStoredReadingFont() {
  setReadingFont(localStorage.getItem("lmv-font") || "sans");
}

function setReadingFont(id) {
  const font = READING_FONTS.find((f) => f.id === id) || READING_FONTS[0];
  document.documentElement.setAttribute("data-font", font.id);
  const label = document.getElementById("readingFontLabel");
  if (label) label.textContent = font.label;
}

function cycleReadingFont() {
  const current = document.documentElement.getAttribute("data-font") || "sans";
  const i = Math.max(
    0,
    READING_FONTS.findIndex((f) => f.id === current),
  );
  const next = READING_FONTS[(i + 1) % READING_FONTS.length];
  setReadingFont(next.id);
  localStorage.setItem("lmv-font", next.id);
}

function toggleTheme(event) {
  const current = document.documentElement.getAttribute("data-theme");
  const next = isDarkTheme(current)
    ? localStorage.getItem("lmv-theme-light") || "light"
    : localStorage.getItem("lmv-theme-dark") || "dark";

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
        { clipPath: isDarkTheme(next) ? [...clipPath].reverse() : clipPath },
        {
          duration: 300,
          easing: "ease-in",
          pseudoElement: `::view-transition-${isDarkTheme(next) ? "old" : "new"}(root)`,
        },
      );
    });
}

// ── Background image ────────────────────────────────────────────────
function applyStoredBgImage() {
  LMV.applyBgImage();
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

function bindBgChooser() {
  const choose = document.getElementById("bgChoose");
  const reset = document.getElementById("bgReset");
  const input = document.getElementById("bgFileInput");

  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    await LMV.setCustomBg(file);
    LMV.applyBgImage();
    setBgVisible(true);
    toast("背景已更新");
  });
  reset.addEventListener("click", async () => {
    await LMV.clearCustomBg();
    LMV.applyBgImage();
    toast("已恢复默认背景");
  });
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
            const entry = item.webkitGetAsEntry?.();
            await openSingleFile(handle);
            if (entry) tryLoadSiblingsFromEntry(entry, handle.name);
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

function bindOutlineResize() {
  const resizer = document.getElementById("outlineResizer");
  const MIN = 160;
  const MAX = 480;
  const STORAGE_KEY = "lmv-outline-width";

  const outline = document.getElementById("outline");

  const setWidth = (w) => {
    outline.style.width = w + "px";
    outline.style.flexBasis = w + "px";
  };

  const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (saved && saved >= MIN && saved <= MAX) setWidth(saved);

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const startW = outline.getBoundingClientRect().width || 272;

    const onMove = (e) => {
      const w = Math.min(MAX, Math.max(MIN, startW + (startX - e.clientX)));
      setWidth(w);
    };

    const onUp = () => {
      resizer.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem(STORAGE_KEY, Math.round(outline.getBoundingClientRect().width)); } catch (_) {}
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
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
// Name of the level currently listed (file name in single-file view, else folder).
function currentLocationLabel() {
  if (fileOnlyView && currentFileNode) return currentFileNode.name;
  if (!currentDir) return rootLabel || "未选择";
  return currentDir.replace(/\/$/, "").split("/").pop();
}

// Update location icon and label.
function renderNav() {
  const loc = document.getElementById("locLabel");
  loc.querySelector(".loc-name").textContent = currentLocationLabel();
  const showFile = fileOnlyView && currentFileNode;
  loc.querySelector(".loc-icon").innerHTML = showFile
    ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>'
    : '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>';
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
    await LMV.addRecent(handle);
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
    await LMV.addRecent(handle);
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
  if (autoOpen) {
    LMV.addRecent(handle);
    showMarkdownBody();
    await openFile(node);
  }
}

// After dropping a single .md file, use the legacy FileEntry API to enumerate
// sibling .md files in the same directory so the doc-footer pager can work.
async function tryLoadSiblingsFromEntry(entry, currentName) {
  try {
    const parent = await new Promise((res, rej) => entry.getParent(res, rej));
    const reader = parent.createReader();
    // readEntries returns up to 100 entries per call; one batch is enough for
    // typical daily-feed folders.
    const entries = await new Promise((res, rej) => reader.readEntries(res, rej));
    const mdEntries = entries
      .filter((e) => e.isFile && isMarkdown(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (mdEntries.length <= 1) return; // no siblings worth showing

    // Build lazy nodes: read each file's text only when actually opened.
    const nodes = mdEntries.map((e) => ({
      kind: "file",
      name: e.name,
      path: e.name,
      handle: {
        kind: "file",
        name: e.name,
        getFile: () => new Promise((res, rej) => e.file(res, rej)),
      },
    }));

    allFiles = nodes;
    window._cachedTree = nodes;
    // Re-point currentFileNode at the matching node in the new list.
    currentFileNode = nodes.find((n) => n.name === currentName) ?? currentFileNode;
    fileOnlyView = false;
    renderSidebarTree();
    renderPager();
  } catch (_) {}
}

// Retrieve content stored by the content script redirect and open it.
// The stashed text is consumed once; on a page refresh it's gone, so we fall
// back to re-reading the file directly from its file:// URL (kept in `src`).
async function tryOpenPending(
  key,
  name,
  srcUrl,
  { builtinReadme = false, filePath = "" } = {},
) {
  try {
    let text = null;
    if (key) {
      const result = await chrome.storage.session.get(key);
      text = result[key];
      await chrome.storage.session.remove(key);
    }
    if (text == null && srcUrl) {
      const r = await fetch(srcUrl);
      if (!r.ok && r.status !== 0) {
        throw new Error(`无法获取文件 (${r.status})`);
      }
      text = await r.text();
    }
    if (text != null) {
      const path = filePath || name;
      await openDirectContent(name, text, srcUrl, {
        autoOpen: true,
        builtinReadme: builtinReadme || LMV.isProjectReadmeUrl(srcUrl),
        filePath: path,
      });
      if (/^https?:/.test(srcUrl)) {
        LMV.addRecentRemote(srcUrl, name);
      }
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
  { autoOpen = true, builtinReadme = false, filePath = "" } = {},
) {
  viewingBuiltinReadme = builtinReadme;
  rootHandle = null;
  singleFileHandle = null;
  const path = filePath || name;
  const isRemote = /^https?:/.test(srcUrl || "");
  scopeKey = builtinReadme
    ? "builtin:readme"
    : isRemote
      ? "remote:" + srcUrl
      : "dir:" + (srcUrl ? srcUrl.slice(0, srcUrl.lastIndexOf("/") + 1) : name);
  searchIndexBuilt = false;

  const node = {
    kind: "file",
    name,
    path,
    url: srcUrl || null,
    handle: memHandle(name, text),
    __text: text,
  };
  allFiles = [node];
  window._cachedTree = [node];

  currentDir = "";
  fileOnlyView = true;
  setRootLabel(builtinReadme ? "Leaflet Mark View" : name);
  if (autoOpen) currentFileNode = node;
  renderSidebarTree();
  if (autoOpen) {
    showMarkdownBody();
    await openFile(node);
  } else {
    clearFileUrlParams();
  }

  if (builtinReadme) return;

  if (isRemote && srcUrl.includes("raw.githubusercontent.com")) {
    try {
      const { label, nodes } = await RemoteMD.loadGithubSiblings(
        srcUrl,
        path,
        text,
        memHandle,
        urlHandle,
      );
      allFiles = flattenFiles(nodes);
      window._cachedTree = nodes;
      searchIndexBuilt = false;
      fileOnlyView = false;
      if (autoOpen) {
        const oldNode = currentFileNode;
        currentFileNode =
          allFiles.find((n) => n.path === path) ||
          allFiles.find((n) => n.name === name) ||
          currentFileNode;
        if (currentFileNode !== oldNode && oldNode?.__text != null) {
          currentFileNode.__text = oldNode.__text;
        }
      }
      setRootLabel(label);
      renderSidebarTree();
      return;
    } catch (e) {
      console.warn("[Leaflet Mark View] 无法列出 GitHub 仓库文件:", e);
    }
  }

  // Discover the other .md files sitting next to this one (fills the Folder tab).
  if (srcUrl && !isRemote) {
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
      renderSidebarTree();
      return;
    } catch (e) {
      console.warn(
        "[Leaflet Mark View] 无法列出同目录文件，回退到手动选择:",
        e,
      );
    }
  }
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


async function tryRestoreFolder() {
  try {
    const handle = await LMV.getStoredHandle();
    if (handle) {
      let perm = "prompt";
      try {
        perm = await handle.queryPermission({ mode: "read" });
      } catch (_) {}
      if (perm === "granted") {
        await restoreHandle(handle);
        return;
      }
      // File handles typically lose permission on reload; fall back to the
      // last local snapshot so the document is still there after refresh.
      if (handle.kind === "file" && (await restoreFileSnapshot(handle.name))) {
        return;
      }
      if (perm === "prompt") showReconnectBanner(handle);
      return;
    }
    await restoreFileSnapshot();
  } catch (_) {
    /* ignore */
  }
}

async function restoreFileSnapshot(expectedName) {
  const snap = await LMV.getLastFileSnapshot();
  if (!snap?.name || snap.text == null) return false;
  if (expectedName && snap.name !== expectedName) return false;
  await openDirectContent(snap.name, snap.text, null, { autoOpen: true });
  return true;
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
}

// ── Directory scanning ──────────────────────────────────────────────
async function loadFolder(
  dirHandle,
  preferName = null,
  { autoOpen = true } = {},
) {
  viewingBuiltinReadme = false;
  LMV.clearLastFileSnapshot();
  if (autoOpen) {
    LMV.addRecent(dirHandle);
    showMarkdownBody();
    setContent(
      `<div class="loading"><div class="spinner"></div>正在扫描文件夹…</div>`,
    );
  }
  setRootLabel(dirHandle.name);

  scopeKey = "folder:" + dirHandle.name;
  searchIndexBuilt = false;

  const tree = await scanDir(dirHandle, "");
  window._cachedTree = tree;
  allFiles = flattenFiles(tree);

  currentDir = "";
  fileOnlyView = false;
  renderSidebarTree();

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

  updatePinLabel();
}

function showMarkdownBody() {
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("markdownBody").style.display = "block";
  clearStartParam();
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
    header.innerHTML = `<span class="tree-dir-name" title="${escHtml(node.path || node.name)}">${escHtml(node.name)}</span>${ICON.chevron}`;
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

// ── Intra-document links (relative .md links open inside the viewer) ──

// Resolve a relative path against a base file path (POSIX-style, handles . / ..).
function resolveRelPath(basePath, rel) {
  const baseDir = basePath.includes("/")
    ? basePath.slice(0, basePath.lastIndexOf("/"))
    : "";
  const stack = rel.startsWith("/") ? [] : baseDir ? baseDir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

// Given a raw (un-DOM-resolved) href, return { node, hash } when it points at a
// known local .md file or an in-page anchor; otherwise null (leave it external).
function resolveMdLinkTarget(rawHref) {
  if (!rawHref) return null;
  // Any explicit scheme other than file: (http, https, mailto, …) is external.
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawHref) && !/^file:/i.test(rawHref)) return null;
  if (rawHref.startsWith("//")) return null;

  const hashIdx = rawHref.indexOf("#");
  const pathPart = hashIdx >= 0 ? rawHref.slice(0, hashIdx) : rawHref;
  const hash = hashIdx >= 0 ? rawHref.slice(hashIdx + 1) : "";

  // Pure in-page anchor → scroll within the current document.
  if (!pathPart) return hash ? { node: currentFileNode, hash } : null;

  const cleanPath = pathPart.split("?")[0];
  if (!/\.(md|markdown|mdown|mkd)$/i.test(cleanPath)) return null;
  if (!currentFileNode) return null;

  let node = null;
  if (currentFileNode.url) {
    try {
      const resolved = new URL(decodeURIComponent(cleanPath), currentFileNode.url).href;
      node = allFiles.find((f) => f.url === resolved) || null;
    } catch (_) {}
  } else {
    const resolved = resolveRelPath(currentFileNode.path, decodeURIComponent(cleanPath));
    node = allFiles.find((f) => f.path === resolved) || null;
  }
  return node ? { node, hash } : null;
}

// Open the linked .md (if different) and scroll to its anchor (if any).
async function navigateToMdTarget({ node, hash }) {
  if (node && node !== currentFileNode) await openFile(node);
  if (!hash) return;
  const body = document.getElementById("markdownBody");
  const id = decodeURIComponent(hash);
  const h =
    body.querySelector("#" + CSS.escape(id)) ||
    body.querySelector("#" + CSS.escape(slugify(id)));
  if (h) scrollToHeading(h);
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

// Resolve image src values so local paths display correctly.
// chrome-extension:// pages cannot render file:// img srcs directly,
// so we fetch each local URL and swap in a blob URL instead.
function fixImageSrcs(body, fileUrl) {
  const dirUrl = fileUrl
    ? fileUrl.slice(0, fileUrl.lastIndexOf("/") + 1)
    : null;

  body.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;
    // Already a safe URL (http/https/data/blob)
    if (/^(https?:|data:|blob:)/.test(src)) {
      img.addEventListener(
        "error",
        () => showImageFallback(img, "图片无法加载", src),
        { once: true },
      );
      return;
    }
    if (src.startsWith("//")) return;

    let fileHref = null;
    let httpHref = null;
    if (/^file:\/\//.test(src)) {
      fileHref = src;
    } else if (src.startsWith("/")) {
      fileHref = "file://" + src;
    } else if (dirUrl) {
      try {
        const resolved = new URL(src, dirUrl).href;
        if (/^https?:/.test(resolved)) {
          httpHref = resolved;
        } else if (resolved.startsWith("file://")) {
          fileHref = resolved;
        }
      } catch (_) {}
    }

    if (httpHref) {
      img.src = httpHref;
      img.addEventListener(
        "error",
        () => showImageFallback(img, "图片无法加载", src),
        { once: true },
      );
      return;
    }
    if (!fileHref) {
      showImageFallback(img, "图片无法加载", src);
      return;
    }

    // Fetch the local file and replace src with a blob URL so Chrome renders it.
    fetch(fileHref)
      .then((r) => (r.ok || r.status === 0 ? r.blob() : Promise.reject(r.status)))
      .then((blob) => {
        img.src = URL.createObjectURL(blob);
        img.addEventListener(
          "error",
          () => showImageFallback(img, "图片无法加载", src),
          { once: true },
        );
      })
      .catch(() => showImageFallback(img, "本地图片无法读取", src));
  });
}

// ── Lazy asset loading (KaTeX / Mermaid are vendored & loaded on demand) ──
const _assetPromises = {};
function loadScriptOnce(src) {
  if (_assetPromises[src]) return _assetPromises[src];
  _assetPromises[src] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("failed to load " + src));
    document.head.appendChild(s);
  });
  return _assetPromises[src];
}
function loadCssOnce(href) {
  if (_assetPromises[href]) return;
  _assetPromises[href] = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

// Render TeX math via KaTeX. Inline spans + block divs carry the raw TeX in
// data-tex; we only pull in the library/stylesheet when a document uses math.
async function renderMath(body) {
  const els = body.querySelectorAll(".math-inline, .math-block");
  if (!els.length) return;
  loadCssOnce("vendor/katex/katex.min.css");
  try {
    await loadScriptOnce("vendor/katex/katex.min.js");
  } catch (_) {
    els.forEach((el) => {
      const tex = el.getAttribute("data-tex") || "";
      showMediaFallback(el, "公式引擎未能加载", tex);
    });
    return;
  }
  els.forEach((el) => {
    const tex = el.getAttribute("data-tex") || "";
    try {
      window.katex.render(tex, el, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
      });
    } catch (_) {
      showMediaFallback(el, "公式无法渲染", tex);
    }
  });
}

// Shared shell for Mermaid / PlantUML: preview ↔ source toggle + copy.
function createDiagramBlock(kind, source, label) {
  const block = document.createElement("div");
  block.className = "diagram-block";
  block.dataset.kind = kind;

  const toolbar = document.createElement("div");
  toolbar.className = "diagram-toolbar";

  const kindTag = document.createElement("span");
  kindTag.className = "diagram-kind";
  kindTag.textContent = label || kind;

  const actions = document.createElement("div");
  actions.className = "diagram-actions";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "diagram-tool-btn diagram-toggle";
  toggle.innerHTML = ICON.code;
  toggle.title = "查看源码";
  toggle.setAttribute("aria-label", "查看源码");

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "diagram-tool-btn diagram-copy";
  copyBtn.innerHTML = ICON.copy;
  copyBtn.title = "复制源码";
  copyBtn.setAttribute("aria-label", "复制源码");

  const preview = document.createElement("div");
  preview.className = "diagram-preview";

  const sourcePre = document.createElement("pre");
  sourcePre.className = "diagram-source";
  sourcePre.hidden = true;
  const code = document.createElement("code");
  code.textContent = source;
  sourcePre.appendChild(code);

  const setMode = (mode) => {
    const showSource = mode === "source";
    block.classList.toggle("show-source", showSource);
    sourcePre.hidden = !showSource;
    preview.hidden = showSource;
    toggle.innerHTML = showSource ? ICON.eye : ICON.code;
    toggle.title = showSource ? "查看预览" : "查看源码";
    toggle.setAttribute("aria-label", toggle.title);
  };

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMode(block.classList.contains("show-source") ? "preview" : "source");
  });
  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(source);
    if (!ok) return;
    copyBtn.classList.add("copied");
    copyBtn.innerHTML = ICON.check;
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      copyBtn.innerHTML = ICON.copy;
    }, 1500);
  });
  toolbar.addEventListener("click", (e) => e.stopPropagation());

  actions.append(toggle, copyBtn);
  toolbar.append(kindTag, actions);
  block.append(toolbar, preview, sourcePre);
  return { block, preview, sourcePre, setMode };
}

function markDiagramZoomable(preview) {
  if (!preview) return;
  preview.classList.add("diagram-zoomable");
  preview.setAttribute("role", "button");
  preview.setAttribute("tabindex", "0");
  preview.setAttribute("aria-label", "点击放大预览");
  preview.title = "点击放大预览";
}

// Render Mermaid diagrams from <pre class="mermaid"> blocks, theme-aware.
async function renderMermaid(body) {
  const els = [...body.querySelectorAll("pre.mermaid")];
  if (!els.length) return;
  try {
    await loadScriptOnce("vendor/mermaid.min.js");
  } catch (_) {
    els.forEach((el) => {
      showMediaFallback(el, "Mermaid 引擎未能加载", (el.textContent || "").trim());
    });
    return;
  }
  const dark = isDarkTheme(document.documentElement.getAttribute("data-theme"));
  const jobs = [];
  els.forEach((el) => {
    const source = el.textContent || "";
    const { block, preview } = createDiagramBlock("mermaid", source, "Mermaid");
    const host = document.createElement("pre");
    host.className = "mermaid";
    host.textContent = source;
    preview.appendChild(host);
    el.replaceWith(block);
    jobs.push({ host, preview, source });
  });
  try {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
    });
  } catch (_) {}
  for (const job of jobs) {
    try {
      await window.mermaid.run({ nodes: [job.host] });
      if (!job.host.querySelector("svg")) {
        showDiagramError(job.preview, "Mermaid 未返回图形", job.source);
        continue;
      }
      markDiagramZoomable(job.host.closest(".diagram-preview"));
    } catch (err) {
      showDiagramError(
        job.preview,
        "Mermaid 渲染失败" + (err && err.message ? "：" + err.message : ""),
        job.source,
      );
    }
  }
}

// Render PlantUML locally via vendored @plantuml/core (no network).
async function renderPlantuml(body) {
  const els = [...body.querySelectorAll("pre.plantuml")];
  if (!els.length) return;

  // Serialize: engine overwrites in-flight renders if called in parallel.
  for (const el of els) {
    const source = el.textContent || "";
    const { block, preview } = createDiagramBlock(
      "plantuml",
      source,
      "PlantUML",
    );
    preview.innerHTML = `<div class="plantuml-loading">正在加载 PlantUML 引擎…</div>`;
    el.replaceWith(block);

    const dark = isDarkTheme(
      document.documentElement.getAttribute("data-theme"),
    );
    try {
      preview.innerHTML = `<div class="plantuml-loading">正在渲染 PlantUML…</div>`;
      const svg = await plantumlRenderSvg(source, loadScriptOnce, { dark });
      if (!svg || !svg.includes("<svg")) {
        showPlantumlError(preview, "PlantUML 未返回有效图形");
        continue;
      }
      preview.innerHTML = svg;
      markDiagramZoomable(preview);
    } catch (err) {
      showPlantumlError(
        preview,
        "PlantUML 渲染失败" + (err && err.message ? "：" + err.message : ""),
      );
    }
  }
}

function showPlantumlError(preview, message) {
  showDiagramError(preview, message);
}

function showDiagramError(preview, message, detail) {
  preview.classList.remove("diagram-zoomable");
  preview.removeAttribute("role");
  preview.removeAttribute("tabindex");
  preview.removeAttribute("aria-label");
  preview.title = "";
  preview.innerHTML = mediaFallbackHtml(message, detail);
}

function mediaFallbackHtml(title, detail) {
  const d = detail
    ? `<div class="media-fallback-detail">${escHtml(String(detail).slice(0, 240))}</div>`
    : "";
  return `<div class="media-fallback"><div class="media-fallback-title">${escHtml(title)}</div>${d}</div>`;
}

function showMediaFallback(el, title, detail) {
  const box = document.createElement("div");
  box.className = "media-fallback";
  box.innerHTML =
    `<div class="media-fallback-title">${escHtml(title)}</div>` +
    (detail
      ? `<div class="media-fallback-detail">${escHtml(String(detail).slice(0, 240))}</div>`
      : "");
  el.replaceWith(box);
}

function showImageFallback(img, title, detail) {
  if (!img || !img.parentNode) return;
  const alt = (img.getAttribute("alt") || "").trim();
  showMediaFallback(img, alt ? `${title}（${alt}）` : title, detail);
}

// Mark markdown images as zoomable (skip tiny icons inside links if desired —
// here every content image can be previewed).
function enableImageZoom(body) {
  body.querySelectorAll("img").forEach((img) => {
    if (img.closest(".diagram-block")) return;
    img.classList.add("diagram-zoomable");
    if (!img.title) img.title = "点击放大预览";
  });
}

// ── Lightbox (image / Mermaid / PlantUML preview) ────────────────────
let lightboxScale = 1;
let lightboxX = 0;
let lightboxY = 0;
let lightboxDragging = false;
let lightboxDragStart = null;

function isLightboxOpen() {
  const el = document.getElementById("lightbox");
  return el && !el.hasAttribute("hidden");
}

function bindLightbox() {
  const box = document.getElementById("lightbox");
  const stage = document.getElementById("lightboxStage");
  const closeBtn = document.getElementById("lightboxClose");
  const mdBody = document.getElementById("markdownBody");
  if (!box || !stage || !closeBtn) return;

  closeBtn.addEventListener("click", closeLightbox);
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target === stage) closeLightbox();
  });

  stage.addEventListener(
    "wheel",
    (e) => {
      if (!isLightboxOpen()) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      setLightboxScale(lightboxScale + delta);
    },
    { passive: false },
  );

  stage.addEventListener("pointerdown", (e) => {
    if (!isLightboxOpen()) return;
    if (e.target === stage) return;
    lightboxDragging = true;
    lightboxDragStart = {
      x: e.clientX,
      y: e.clientY,
      ox: lightboxX,
      oy: lightboxY,
    };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("dragging");
  });
  stage.addEventListener("pointermove", (e) => {
    if (!lightboxDragging || !lightboxDragStart) return;
    lightboxX = lightboxDragStart.ox + (e.clientX - lightboxDragStart.x);
    lightboxY = lightboxDragStart.oy + (e.clientY - lightboxDragStart.y);
    applyLightboxTransform();
  });
  stage.addEventListener("pointerup", (e) => {
    lightboxDragging = false;
    lightboxDragStart = null;
    stage.classList.remove("dragging");
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });
  stage.addEventListener("pointercancel", () => {
    lightboxDragging = false;
    lightboxDragStart = null;
    stage.classList.remove("dragging");
  });

  if (mdBody) bindDiagramZoom(mdBody);
}

function setLightboxScale(next) {
  lightboxScale = Math.min(8, Math.max(0.2, next));
  applyLightboxTransform();
}

function applyLightboxTransform() {
  const content = document.querySelector("#lightboxStage .lightbox-content");
  if (!content) return;
  content.style.transform = `translate(${lightboxX}px, ${lightboxY}px) scale(${lightboxScale})`;
}

function openLightboxFrom(source) {
  const box = document.getElementById("lightbox");
  const stage = document.getElementById("lightboxStage");
  if (!box || !stage || !source) return;

  let content = null;
  if (source.tagName === "IMG") {
    content = document.createElement("img");
    content.src = source.currentSrc || source.src;
    content.alt = source.alt || "";
  } else {
    const svg = source.querySelector("svg");
    const img = source.querySelector("img");
    if (svg) {
      content = svg.cloneNode(true);
    } else if (img) {
      content = document.createElement("img");
      content.src = img.currentSrc || img.src;
      content.alt = img.alt || "";
    }
  }
  if (!content) return;

  content.classList.add("lightbox-content");
  stage.innerHTML = "";
  stage.appendChild(content);
  lightboxScale = 1;
  lightboxX = 0;
  lightboxY = 0;
  applyLightboxTransform();
  box.removeAttribute("hidden");
  box.classList.add("open");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  const box = document.getElementById("lightbox");
  const stage = document.getElementById("lightboxStage");
  if (!box) return;
  box.classList.remove("open");
  box.setAttribute("hidden", "");
  document.body.classList.remove("lightbox-open");
  if (stage) stage.innerHTML = "";
  lightboxDragging = false;
  lightboxDragStart = null;
}

function bindDiagramZoom(body) {
  body.addEventListener("click", (e) => {
    if (e.target.closest(".diagram-toolbar, .diagram-source")) return;
    const img = e.target.closest("img.diagram-zoomable");
    if (img && body.contains(img) && !img.closest(".diagram-block")) {
      e.preventDefault();
      openLightboxFrom(img);
      return;
    }
    const diagram = e.target.closest(".diagram-preview.diagram-zoomable");
    if (diagram && body.contains(diagram)) {
      if (diagram.closest(".diagram-block.show-source")) return;
      e.preventDefault();
      openLightboxFrom(diagram);
    }
  });
  body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const diagram = e.target.closest(".diagram-preview.diagram-zoomable");
    if (!diagram || !body.contains(diagram)) return;
    if (diagram.closest(".diagram-block.show-source")) return;
    e.preventDefault();
    openLightboxFrom(diagram);
  });
}

// Parse markdown into `body` and wire up links + heading anchors + outline.
function renderMarkdownInto(body, text, fileUrl) {
  closeLightbox();
  body.innerHTML = parseMarkdown(text, true);

  fixImageSrcs(body, fileUrl);
  enableImageZoom(body);

  // Relative .md links (and in-page anchors) navigate inside the viewer instead
  // of opening a new file:// tab. Read the raw href, not the DOM-resolved one.
  body.querySelectorAll("a[href]").forEach((a) => {
    const target = resolveMdLinkTarget(a.getAttribute("href"));
    if (!target) return;
    a.classList.add("internal-link");
    a.removeAttribute("target");
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToMdTarget(target);
    });
  });

  // Open remaining external links safely
  body.querySelectorAll('a[target="_blank"]').forEach((a) => {
    a.setAttribute("rel", "noopener noreferrer");
  });

  // Permalink anchors on headings (VitePress header-anchor)
  body.querySelectorAll(".header-anchor").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      const h = body.querySelector("#" + CSS.escape(id));
      if (h) scrollToHeading(h);
    });
  });

  // Code blocks: VitePress-style language label + copy button.
  body.querySelectorAll("pre").forEach(decorateCodeBlock);

  // Tables: draggable column widths.
  body.querySelectorAll("table").forEach(setupResizableTable);

  buildOutline(body);

  // Math + diagrams — vendored libraries, lazy-loaded only when present.
  renderMath(body);
  renderMermaid(body);
  renderPlantuml(body);
}

// Make a rendered table's columns drag-resizable. Wraps the table in a
// horizontal-scroll container, locks it to a fixed layout sized from the
// current column widths, and adds a grip on each header cell's right edge.
// Double-clicking a grip auto-fits all columns back to their content width.
const MIN_COL_W = 48;
function setupResizableTable(table) {
  if (table.dataset.resizable) return;

  const headRow = (table.tHead && table.tHead.rows[0]) || table.rows[0];
  if (!headRow) return;
  const cells = Array.from(headRow.cells);
  if (cells.length < 2) return; // single column: nothing to resize

  table.dataset.resizable = "1";

  // Wrap for horizontal overflow once columns exceed the content width.
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  table.parentNode.insertBefore(wrap, table);
  wrap.appendChild(table);

  // Snapshot current widths, then lock the layout so <col> widths take effect.
  const colW = cells.map((c) => c.getBoundingClientRect().width);
  const colgroup = document.createElement("colgroup");
  colW.forEach((w) => {
    const col = document.createElement("col");
    col.style.width = w + "px";
    colgroup.appendChild(col);
  });
  table.insertBefore(colgroup, table.firstChild);
  const cols = Array.from(colgroup.children);

  const applyWidths = () => {
    cols.forEach((c, i) => (c.style.width = colW[i] + "px"));
    table.style.width = colW.reduce((a, b) => a + b, 0) + "px";
  };
  table.style.tableLayout = "fixed";
  applyWidths();

  // Last column has no grip: resizing the others grows the scroll area.
  cells.forEach((cell, i) => {
    if (i === cells.length - 1) return;
    cell.style.position = "relative";

    const grip = document.createElement("span");
    grip.className = "col-resizer";
    cell.appendChild(grip);

    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = colW[i];
      grip.setPointerCapture(e.pointerId);
      grip.classList.add("dragging");

      const onMove = (ev) => {
        colW[i] = Math.max(MIN_COL_W, startW + (ev.clientX - startX));
        applyWidths();
      };
      const onUp = () => {
        grip.classList.remove("dragging");
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
    });

    // Double-click: re-fit every column to its content.
    grip.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      table.style.tableLayout = "auto";
      table.style.width = "";
      cols.forEach((c) => (c.style.width = ""));
      cells.forEach((c, j) => (colW[j] = c.getBoundingClientRect().width));
      table.style.tableLayout = "fixed";
      applyWidths();
    });
  });
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

// ── Confluence export ────────────────────────────────────────────────
let cfScrollLock = false;

// Proportional scroll sync — MD and Wiki markup differ in length.
function syncCfPaneScroll(fromEl, toEl) {
  if (cfScrollLock || !fromEl || !toEl) return;
  cfScrollLock = true;

  const maxFromY = Math.max(0, fromEl.scrollHeight - fromEl.clientHeight);
  const maxToY = Math.max(0, toEl.scrollHeight - toEl.clientHeight);
  const maxFromX = Math.max(0, fromEl.scrollWidth - fromEl.clientWidth);
  const maxToX = Math.max(0, toEl.scrollWidth - toEl.clientWidth);

  toEl.scrollTop = maxFromY ? (fromEl.scrollTop / maxFromY) * maxToY : 0;
  toEl.scrollLeft = maxFromX ? (fromEl.scrollLeft / maxFromX) * maxToX : 0;

  cfScrollLock = false;
}

function bindCfScrollSync() {
  const source = document.getElementById("cfSource");
  const target = document.getElementById("cfText");
  source.addEventListener("scroll", () => syncCfPaneScroll(source, target), {
    passive: true,
  });
  target.addEventListener("scroll", () => syncCfPaneScroll(target, source), {
    passive: true,
  });
}

// Re-convert the (editable) source pane into the Confluence pane.
function renderConfluence() {
  const srcEl = document.getElementById("cfSource");
  const cfEl = document.getElementById("cfText");
  const src = srcEl.value;
  try {
    cfEl.value = mdToConfluence(src);
  } catch (_) {
    cfEl.value = "";
  }
  requestAnimationFrame(() => syncCfPaneScroll(srcEl, cfEl));
}

function openConfluenceModal() {
  const text = currentFileNode?.__text;
  if (text == null) {
    toast("请先打开一个文档");
    return;
  }
  document.getElementById("cfSource").value = text;
  renderConfluence();
  const srcEl = document.getElementById("cfSource");
  const cfEl = document.getElementById("cfText");
  srcEl.scrollTop = cfEl.scrollTop = 0;
  srcEl.scrollLeft = cfEl.scrollLeft = 0;
  document.getElementById("cfBackdrop").classList.add("open");
  document.getElementById("cfModal").classList.add("open");
}

function closeConfluenceModal() {
  document.getElementById("cfBackdrop").classList.remove("open");
  document.getElementById("cfModal").classList.remove("open");
}

function latestExportHtml() {
  const src = document.getElementById("htmlSource").value;
  const raw = mdToExportHtml(src);
  return typeof inlineExportHtml === "function" ? inlineExportHtml(raw) : raw;
}

function renderHtmlExport() {
  const preview = document.getElementById("htmlPreview");
  try {
    preview.innerHTML = latestExportHtml();
  } catch (_) {
    preview.innerHTML = '<p style="color:#c00">HTML 生成失败</p>';
  }
}

function openHtmlExportModal() {
  const text = currentFileNode?.__text;
  if (text == null) {
    toast("请先打开一个文档");
    return;
  }
  document.getElementById("htmlSource").value = text;
  renderHtmlExport();
  document.getElementById("htmlSource").scrollTop = 0;
  document.getElementById("htmlPreview").scrollTop = 0;
  document.getElementById("htmlBackdrop").classList.add("open");
  document.getElementById("htmlModal").classList.add("open");
}

function closeHtmlExportModal() {
  document.getElementById("htmlBackdrop").classList.remove("open");
  document.getElementById("htmlModal").classList.remove("open");
}

function bindHtmlExportModal() {
  document.getElementById("htmlExport").addEventListener("click", openHtmlExportModal);
  document.getElementById("htmlClose").addEventListener("click", closeHtmlExportModal);
  document.getElementById("htmlBackdrop").addEventListener("click", closeHtmlExportModal);
  document.getElementById("htmlSource").addEventListener("input", renderHtmlExport);

  document.getElementById("htmlCopy").addEventListener("click", async () => {
    const html = latestExportHtml();
    const plain =
      typeof exportPlainText === "function"
        ? exportPlainText(document.getElementById("htmlSource").value)
        : document.getElementById("htmlSource").value;
    const ok = await copyHtml(html, plain);
    toast(ok ? "已复制 HTML" : "复制失败");
  });

  document.getElementById("htmlDownload").addEventListener("click", () => {
    const html = latestExportHtml();
    const base = (currentFileNode?.name || "document").replace(
      /\.(md|markdown|mdown|mkd)$/i,
      "",
    );
    const doc =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      escHtml(base) +
      "</title></head><body>" +
      html +
      "</body></html>";
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = base + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.getElementById("htmlModal").classList.contains("open")
    ) {
      closeHtmlExportModal();
    }
  });
}

function renderDocxSummary() {
  const src = document.getElementById("docxSource").value;
  const preview = document.getElementById("docxPreview");
  try {
    preview.innerHTML = mdToDocxPreviewHtml(src);
  } catch (_) {
    preview.innerHTML = '<p style="color:#c00;padding:24px">无法生成 Word 预览</p>';
  }
}

function openDocxExportModal() {
  const text = currentFileNode?.__text;
  if (text == null) {
    toast("请先打开一个文档");
    return;
  }
  document.getElementById("docxSource").value = text;
  renderDocxSummary();
  document.getElementById("docxSource").scrollTop = 0;
  document.getElementById("docxPreview").scrollTop = 0;
  document.getElementById("docxBackdrop").classList.add("open");
  document.getElementById("docxModal").classList.add("open");
}

function closeDocxExportModal() {
  document.getElementById("docxBackdrop").classList.remove("open");
  document.getElementById("docxModal").classList.remove("open");
}

function bindDocxExportModal() {
  document.getElementById("docxExport").addEventListener("click", openDocxExportModal);
  document.getElementById("docxClose").addEventListener("click", closeDocxExportModal);
  document.getElementById("docxBackdrop").addEventListener("click", closeDocxExportModal);
  document.getElementById("docxSource").addEventListener("input", () => {
    clearTimeout(renderDocxSummary._t);
    renderDocxSummary._t = setTimeout(renderDocxSummary, 120);
  });

  document.getElementById("docxDownload").addEventListener("click", () => {
    const src = document.getElementById("docxSource").value;
    let bytes;
    try {
      bytes = mdToDocx(src);
    } catch (e) {
      toast("导出失败");
      return;
    }
    const base = (currentFileNode?.name || "document").replace(
      /\.(md|markdown|mdown|mkd)$/i,
      "",
    );
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = base + ".docx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("已导出 Word");
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.getElementById("docxModal").classList.contains("open")
    ) {
      closeDocxExportModal();
    }
  });
}

function bindBrowserRender() {
  document.getElementById("browserRender").addEventListener("click", () => {
    const text = currentFileNode?.__text;
    if (text == null) {
      toast("请先打开一个文档");
      return;
    }
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  });
}

// ── Pin folder (快捷入口) ──────────────────────────────────────────────

async function updatePinLabel() {
  if (!rootHandle) return;
  const existing = await LMV.getPinByName(rootHandle.name);
  const btn = document.getElementById("pinFolderToggle");
  if (btn) btn.classList.toggle("pinned", !!existing);
}

function bindPinFolder() {
  document.getElementById("pinFolderToggle").addEventListener("click", async () => {
    if (!rootHandle) {
      toast("请先打开一个文件夹");
      return;
    }
    const id = "pin:" + rootHandle.name;
    const existing = await LMV.getPinByName(rootHandle.name);
    if (existing) {
      await LMV.removePin(id);
      toast("已取消固定「" + rootHandle.name + "」");
    } else {
      await LMV.addPin(rootHandle);
      toast("已固定「" + rootHandle.name + "」为快捷入口");
    }
    await updatePinLabel();
    await buildFeedTabs();
  });
}

// ── Feed tabs (header 快捷分类 dropdown) ──────────────────────────────

async function buildFeedTabs() {
  const container = document.getElementById("feedTabs");
  if (!container) return;
  container.innerHTML = "";

  const pins = await LMV.listPins();
  if (!pins.length) return;

  for (const pin of pins) {
    // Permission check — silently skip if folder is unavailable on this machine
    try {
      const perm = await pin.handle.queryPermission({ mode: "read" });
      if (perm !== "granted") continue;
    } catch (_) { continue; }

    // Scan first-level subdirectories
    const subdirs = [];
    try {
      for await (const [name, handle] of pin.handle.entries()) {
        if (handle.kind === "directory" && !name.startsWith(".")) {
          subdirs.push({ name, handle });
        }
      }
    } catch (_) { continue; }

    subdirs.sort((a, b) => a.name.localeCompare(b.name));

    const tab = buildFeedTab(pin, subdirs);
    container.appendChild(tab);
  }
}

function buildFeedTab(pin, subdirs) {
  const hasSubdirs = subdirs.length > 0;
  const wrap = document.createElement("div");
  wrap.className = "feed-menu";

  // ── Trigger button ──
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "feed-trigger" + (hasSubdirs ? "" : " feed-trigger--flat");
  trigger.textContent = pin.label || pin.name;
  wrap.appendChild(trigger);

  // ── Rename input (hidden, shown via context menu) ──
  const renameInput = document.createElement("input");
  renameInput.type = "text";
  renameInput.className = "feed-rename-input";
  renameInput.style.display = "none";
  wrap.appendChild(renameInput);

  // ── Context menu ──
  const ctxMenu = document.createElement("div");
  ctxMenu.className = "feed-ctx-menu";
  ctxMenu.innerHTML = `
    <button class="feed-ctx-item" data-action="rename">重命名</button>
    <button class="feed-ctx-item" data-action="remove">移除固定</button>
  `;
  document.body.appendChild(ctxMenu);

  const closeCtx = () => ctxMenu.classList.remove("open");

  trigger.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu.style.left = e.clientX + "px";
    ctxMenu.style.top = e.clientY + "px";
    ctxMenu.classList.add("open");
  });

  ctxMenu.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    closeCtx();
    if (action === "rename") {
      trigger.style.display = "none";
      renameInput.value = pin.label || pin.name;
      renameInput.style.display = "";
      renameInput.style.width = Math.max(80, trigger.offsetWidth) + "px";
      renameInput.focus();
      renameInput.select();
    } else if (action === "remove") {
      await LMV.removePin(pin.id);
      wrap.remove();
      ctxMenu.remove();
    }
  });

  document.addEventListener("click", closeCtx, { capture: true });
  document.addEventListener("contextmenu", (e) => {
    if (!trigger.contains(e.target)) closeCtx();
  }, { capture: true });

  const commitRename = async () => {
    const newLabel = renameInput.value.trim() || pin.name;
    pin.label = newLabel;
    await LMV.updatePinLabel(pin.id, newLabel);
    trigger.textContent = newLabel;
    renameInput.style.display = "none";
    trigger.style.display = "";
  };

  renameInput.addEventListener("blur", commitRename);
  renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); renameInput.blur(); }
    if (e.key === "Escape") {
      renameInput.value = pin.label || pin.name;
      renameInput.blur();
    }
  });

  // ── No subdirs: plain button that loads latest .md directly ──
  if (!hasSubdirs) {
    trigger.addEventListener("click", async () => {
      const files = [];
      try {
        for await (const [name, handle] of pin.handle.entries()) {
          if (handle.kind === "file" && /\.(md|markdown|mdown|mkd)$/i.test(name)) {
            files.push({ name, handle });
          }
        }
      } catch (_) {}
      files.sort((a, b) => b.name.localeCompare(a.name));
      if (!files.length) { toast("该文件夹暂无 Markdown 文件"); return; }
      rootHandle = pin.handle;
      await LMV.storeHandle(pin.handle);
      await loadFolder(pin.handle, files[0].name);
    });
    return wrap;
  }

  // ── Has subdirs: dropdown ──
  const list = document.createElement("div");
  list.className = "feed-list";
  list.setAttribute("role", "menu");

  for (const subdir of subdirs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "feed-file-btn";
    btn.setAttribute("role", "menuitem");
    btn.textContent = subdir.name;
    btn.addEventListener("click", async () => {
      closeFeedMenus();
      const files = [];
      try {
        for await (const [name, handle] of subdir.handle.entries()) {
          if (handle.kind === "file" && /\.(md|markdown|mdown|mkd)$/i.test(name)) {
            files.push({ name, handle });
          }
        }
      } catch (_) {}
      files.sort((a, b) => b.name.localeCompare(a.name));
      if (!files.length) { toast("该文件夹暂无 Markdown 文件"); return; }
      const targetPath = subdir.name + "/" + files[0].name;
      rootHandle = pin.handle;
      await LMV.storeHandle(pin.handle);
      await LMV.addRecent(pin.handle);
      // Load pin root (rebuilds sidebar), then open the specific file by path
      await loadFolder(pin.handle, null, { autoOpen: false });
      const targetNode = allFiles.find(f => f.path === targetPath)
        || allFiles.find(f => f.name === files[0].name);
      if (targetNode) { showMarkdownBody(); await openFile(targetNode); }
    });
    list.appendChild(btn);
  }

  wrap.appendChild(list);

  let hideTimer;
  wrap.addEventListener("mouseenter", () => {
    clearTimeout(hideTimer);
    wrap.classList.add("open");
  });
  wrap.addEventListener("mouseleave", () => {
    hideTimer = setTimeout(() => wrap.classList.remove("open"), 150);
  });

  return wrap;
}

function closeFeedMenus() {
  document.querySelectorAll(".feed-menu.open").forEach(m => m.classList.remove("open"));
}

function bindConfluenceModal() {
  document
    .getElementById("confluenceExport")
    .addEventListener("click", openConfluenceModal);
  document.getElementById("cfClose").addEventListener("click", closeConfluenceModal);
  document
    .getElementById("cfBackdrop")
    .addEventListener("click", closeConfluenceModal);

  // Live re-render as the source pane is edited.
  document.getElementById("cfSource").addEventListener("input", renderConfluence);
  bindCfScrollSync();

  document.getElementById("cfCopy").addEventListener("click", async () => {
    const ok = await copyText(document.getElementById("cfText").value);
    toast(ok ? "已复制 Confluence 标记" : "复制失败");
  });

  document.getElementById("cfDownload").addEventListener("click", () => {
    const text = document.getElementById("cfText").value;
    const base = (currentFileNode?.name || "document").replace(
      /\.(md|markdown|mdown|mkd)$/i,
      "",
    );
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = base + ".confluence.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.getElementById("cfModal").classList.contains("open")
    ) {
      closeConfluenceModal();
    }
  });
}

// Clipboard write with a legacy fallback for file:// / restricted contexts.
async function copyHtml(html, plain) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain || html], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch (_) {}
  return copyText(html);
}

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

function clearStartParam() {
  const u = new URL(location.href);
  if (!u.searchParams.has("start")) return;
  u.searchParams.delete("start");
  history.replaceState(null, "", u.pathname + u.search + u.hash);
}

function consumePickParam() {
  const u = new URL(location.href);
  if (!u.searchParams.has("pick")) return;
  u.searchParams.delete("pick");
  history.replaceState(null, "", u.pathname + u.search + u.hash);
}

function clearFileUrlParams() {
  const u = new URL(location.href);
  u.searchParams.delete("pending");
  u.searchParams.delete("name");
  u.searchParams.delete("src");
  u.searchParams.delete("path");
  u.searchParams.delete("start");
  u.searchParams.delete("pick");
  history.replaceState(null, "", u.pathname + u.search);
}

// Return to the reader's start state without restoring a previous document.
function goHome() {
  location.href = "viewer.html?start=1";
}

// ── File opening ────────────────────────────────────────────────────
async function openFile(node) {
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
    u.searchParams.delete("start");
    u.searchParams.set("name", node.name);
    u.searchParams.set("src", node.url);
    if (node.path && node.path !== node.name) {
      u.searchParams.set("path", node.path);
    } else {
      u.searchParams.delete("path");
    }
    history.replaceState(null, "", u);
    if (/^https?:/.test(node.url)) {
      LMV.addRecentRemote(node.url, node.path || node.name);
    }
  }

  showMarkdownBody();
  setContent(`<div class="loading"><div class="spinner"></div>加载中…</div>`);

  try {
    const file = await node.handle.getFile();
    const text = await file.text();
    node.__text = text; // cache for full-text search
    if (fileOnlyView && !viewingBuiltinReadme && !node.url) {
      await LMV.setLastFileSnapshot(node.name, text);
    }

    renderMarkdownInto(document.getElementById("markdownBody"), text, node.url);
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

// Scroll contentArea so that heading `h` sits near the top.
// Uses offsetTop traversal (reliable; unaffected by current scroll/viewport).
// Defers hash update so Chrome doesn't trigger its own anchor-scroll first.
function scrollToHeading(h) {
  const ca = document.getElementById("contentArea");
  let top = 0;
  let el = h;
  while (el && el !== ca) {
    top += el.offsetTop;
    el = el.offsetParent;
  }
  ca.scrollTo({ top: Math.max(0, top - 20), behavior: "smooth" });
  // Defer replaceState so it doesn't race with Chrome's native anchor scroll.
  requestAnimationFrame(() => {
    history.replaceState(null, "", "#" + h.id);
  });
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
      scrollToHeading(h);
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
      // Keep the active link visible by scrolling ONLY the outline panel.
      // Element.scrollIntoView() walks every scrollable ancestor (it can nudge
      // the window / main pane), which fights the click-triggered smooth scroll
      // and shows up as page jitter. Containing it to #outline avoids that.
      revealInOutline(activeItem);
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

// Scroll the outline panel (and only it) so `item` is visible. Mutating
// panel.scrollTop directly never bubbles to ancestor scrollers.
function revealInOutline(item) {
  const panel = document.getElementById("outline");
  if (!panel) return;
  const pad = 8;
  const pr = panel.getBoundingClientRect();
  const ir = item.getBoundingClientRect();
  if (ir.top < pr.top + pad) {
    panel.scrollTop += ir.top - pr.top - pad;
  } else if (ir.bottom > pr.bottom - pad) {
    panel.scrollTop += ir.bottom - pr.bottom + pad;
  }
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
