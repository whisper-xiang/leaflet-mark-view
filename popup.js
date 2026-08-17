LMV.applyBgImage();
if (localStorage.getItem("lmv-bg-show") === "off") {
  document.body.classList.add("bg-off");
}

function openViewer(query = "") {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html" + query) });
  window.close();
}

const FILE_PICKER_TYPES = [
  {
    description: "Markdown",
    accept: { "text/markdown": [".md", ".markdown", ".mdown", ".mkd"] },
  },
];

const openMenu = document.getElementById("openMenu");
const openBtn = document.getElementById("openBtn");
const openMenuList = document.getElementById("openMenuList");
const recentsSection = document.getElementById("recents");
const urlPanel = document.getElementById("urlPanel");
const urlInput = document.getElementById("urlInput");
const urlError = document.getElementById("urlError");

function setOpenMenu(open) {
  openMenu.classList.toggle("open", open);
  openBtn.setAttribute("aria-expanded", String(open));
}

function showUrlError(msg) {
  if (!msg) {
    urlError.textContent = "";
    urlError.hidden = true;
    return;
  }
  urlError.textContent = msg;
  urlError.hidden = false;
}

function setUrlPanel(open) {
  urlPanel.hidden = !open;
  if (open) {
    recentsSection.hidden = true;
    urlInput.value = "";
    urlInput.disabled = false;
    showUrlError("");
    setOpenMenu(false);
    requestAnimationFrame(() => urlInput.focus());
  } else {
    showUrlError("");
    renderRecents();
  }
}

let hideTimer;
openMenu.addEventListener("mouseenter", () => {
  clearTimeout(hideTimer);
  setOpenMenu(true);
});
openMenu.addEventListener("mouseleave", () => {
  hideTimer = setTimeout(() => setOpenMenu(false), 120);
});
openBtn.addEventListener("click", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!urlPanel.hidden) {
    setUrlPanel(false);
    return;
  }
  setOpenMenu(false);
});

async function pickFolder() {
  if (typeof window.showDirectoryPicker !== "function") {
    openViewer("?pick=folder");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    await LMV.storeHandle(handle);
    await LMV.addRecent(handle);
    openViewer();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function pickFile() {
  if (typeof window.showOpenFilePicker !== "function") {
    openViewer("?pick=file");
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: FILE_PICKER_TYPES,
    });
    if (!handle) return;
    await LMV.storeHandle(handle);
    await LMV.addRecent(handle);
    try {
      const file = await handle.getFile();
      await LMV.setLastFileSnapshot(handle.name, await file.text());
    } catch (_) {}
    openViewer();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function openRemoteFromPopup(raw) {
  const result = await RemoteMD.resolve(raw);
  await LMV.addRecentRemote(
    result.srcUrl,
    result.displayName || result.name,
  );
  let query =
    "?name=" + encodeURIComponent(result.name) +
    "&src=" + encodeURIComponent(result.srcUrl);
  if (result.path && result.path !== result.name) {
    query += "&path=" + encodeURIComponent(result.path);
  }
  if (result.text != null) {
    const key = "lmv-remote-" + Date.now();
    await chrome.storage.session.set({ [key]: result.text });
    query += "&pending=" + encodeURIComponent(key);
  }
  openViewer(query);
}

let openingUrl = false;
urlInput.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    setUrlPanel(false);
    return;
  }
  if (e.key !== "Enter" || openingUrl) return;
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    showUrlError("请输入链接");
    return;
  }
  openingUrl = true;
  urlInput.disabled = true;
  showUrlError("");
  try {
    await openRemoteFromPopup(url);
  } catch (err) {
    showUrlError(err.message || "无法打开链接");
    openingUrl = false;
    urlInput.disabled = false;
    urlInput.focus();
  }
});

openMenuList.querySelectorAll("[data-pick]").forEach((item) => {
  item.addEventListener("click", () => {
    const pick = item.dataset.pick;
    setOpenMenu(false);
    if (pick === "folder") pickFolder();
    else if (pick === "file") pickFile();
    else setUrlPanel(true);
  });
});

async function openRecentInTab(recent) {
  if (!recent) return;
  if (recent.kind === "remote" && recent.url) {
    openViewer(
      "?src=" + encodeURIComponent(recent.url) +
      "&name=" + encodeURIComponent(recent.name || recent.url),
    );
    return;
  }
  if (recent.handle) {
    await LMV.storeHandle(recent.handle);
    openViewer();
  }
}

async function renderRecents() {
  if (!urlPanel.hidden) return;
  const list = document.getElementById("recentsList");
  const recents = (await LMV.listRecents()).slice(0, 4);

  if (!recents.length) {
    recentsSection.hidden = true;
    return;
  }

  recentsSection.hidden = false;
  list.innerHTML = recents.map((r) => `
    <li>
      <button type="button" class="recent" data-id="${LMV.escHtml(r.id)}">
        <span class="recent-icon">${LMV.entryIcon(r.kind)}</span>
        <span class="recent-name">${LMV.escHtml(r.name)}</span>
      </button>
    </li>
  `).join("");

  list.querySelectorAll(".recent").forEach((btn) => {
    btn.addEventListener("click", () => {
      openRecentInTab(recents.find((x) => x.id === btn.dataset.id));
    });
  });
}

renderRecents();
