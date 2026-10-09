importScripts("lmv-db.js");

// Background service worker: handles tab navigation from content scripts.
// Content scripts can't navigate file:// → chrome-extension:// directly.

// chrome.storage.session defaults to TRUSTED_CONTEXTS only, which excludes
// content scripts. Open it up so content.js can stash the raw markdown before
// redirecting to the viewer.
function allowSessionAccess() {
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
  });
}
chrome.runtime.onInstalled.addListener(allowSessionAccess);
chrome.runtime.onStartup.addListener(allowSessionAccess);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'lmv-open' && sender.tab?.id) {
    chrome.tabs.update(sender.tab.id, { url: msg.url });
  }
});

async function openReader() {
  const viewerUrl = chrome.runtime.getURL("viewer.html");
  const existing = await chrome.tabs.query({ url: viewerUrl + "*" });
  const tab = existing[0];
  if (tab?.id != null) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: viewerUrl + "?start=1" });
}

// Only our popup may request active-tab extraction or open the reader.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.url !== chrome.runtime.getURL("popup.html")) return;
  if (!["lmv-capture-page", "lmv-open-reader"].includes(message.type)) return;
  const task = message.type === "lmv-open-reader" ? openReader() : capturePage(message.tabId);
  task.then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
  return true;
});

async function capturePage(tabId) {
  if (!Number.isInteger(tabId)) throw new Error("无法读取当前标签页。");
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || "")) throw new Error("请在普通网页上使用此功能。");
  let result;
  try {
    // One injection prevents navigation between loading the libraries and extraction.
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: ["vendor/readability/Readability.js", "vendor/turndown/turndown.js", "webpage-capture.js"],
    });
    result = results[0]?.result;
  } catch {
    throw new Error("无法读取此网页。浏览器内置页面、扩展商店及受保护页面不支持转换，请打开普通文章后重试。");
  }
  if (!result?.ok) throw new Error(result?.error || "未能提取正文，请等待网页加载完成后重试。");
  const captureId = await LMV.saveWebCapture(result.article);
  await chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") + "?capture=" + encodeURIComponent(captureId) });
}
