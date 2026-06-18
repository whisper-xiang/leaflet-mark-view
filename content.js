// Content script: intercept .md file:// navigations and redirect to the full viewer.
// Requires "Allow access to file URLs" in chrome://extensions.

(function () {
  if (window !== window.top) return;
  const path = location.pathname;
  if (!/\.(md|markdown|mdown|mkd)$/i.test(path)) return;

  const pre = document.querySelector('body > pre');
  if (!pre) return;

  const raw = pre.textContent;
  const filename = decodeURIComponent(path.split('/').pop());
  const key = 'lmv-direct-' + Date.now();

  // Store the raw text in session storage, then redirect to the viewer.
  // chrome.storage.session is cleared when the browser session ends.
  chrome.storage.session.set({ [key]: raw }).then(() => {
    const url = chrome.runtime.getURL('viewer.html')
      + '?pending=' + encodeURIComponent(key)
      + '&name='    + encodeURIComponent(filename)
      + '&src='     + encodeURIComponent(location.href);
    // location.replace is blocked for file:// → chrome-extension:// navigations;
    // ask the background service worker to update the tab instead.
    chrome.runtime.sendMessage({ type: 'lmv-open', url });
  }).catch((err) => {
    console.error('[Leaflet Mark View] failed to stash markdown:', err);
  });
})();
