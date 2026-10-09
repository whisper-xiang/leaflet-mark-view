const captureButton = document.getElementById("capturePage");
const readerButton = document.getElementById("openReader");
const status = document.getElementById("captureStatus");
let activeTab;
const ready = chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  activeTab = tab;
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) {
    captureButton.disabled = true;
    status.textContent = "请先打开一篇普通网页文章，再点击扩展图标。";
  }
}).catch(() => {
  captureButton.disabled = true;
  status.textContent = "无法读取当前标签页，请重新打开扩展菜单。";
});
captureButton.addEventListener("click", async () => {
  await ready;
  if (!activeTab?.id || captureButton.disabled) return;
  captureButton.disabled = true;
  readerButton.disabled = true;
  status.textContent = "正在提取正文并转换…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "lmv-capture-page", tabId: activeTab.id });
    if (!result?.ok) throw new Error(result?.error || "转换失败，请重试。");
    window.close();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    captureButton.disabled = false;
    readerButton.disabled = false;
  }
});
readerButton.addEventListener("click", async () => {
  try {
    const result = await chrome.runtime.sendMessage({ type: "lmv-open-reader" });
    if (!result?.ok) throw new Error(result?.error || "无法打开阅读器。");
    window.close();
  } catch (error) { status.textContent = error.message; }
});

// Show the actual binding, including user changes or an unassigned shortcut.
chrome.commands.getAll().then(commands => {
  const shortcut = commands.find(command => command.name === "capture-page")?.shortcut;
  document.getElementById("shortcutHint").textContent = shortcut
    ? `快捷键：${shortcut} · 也可在网页中右键打开`
    : "可在 chrome://extensions/shortcuts 设置快捷键，也可在网页中右键打开";
}).catch(() => {});
