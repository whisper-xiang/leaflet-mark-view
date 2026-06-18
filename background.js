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
