document.getElementById('openBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('home.html') });
  window.close();
});
