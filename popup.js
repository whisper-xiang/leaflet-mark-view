// Explicit open from the popup always shows the home page, even when the
// new-tab takeover is turned off — ?open=1 bypasses the gate in home.html.
document.getElementById('openBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('home.html?open=1') });
  window.close();
});

// ── New-tab home toggle ──────────────────────────────────────────────
// Shared with home.html via same-origin localStorage. Default: on ('1').
const NEWTAB_KEY = 'lmv-newtab-home';
const newtabToggle = document.getElementById('newtabToggle');

function isNewtabHomeOn() {
  return localStorage.getItem(NEWTAB_KEY) !== '0';
}

function syncNewtabToggle() {
  newtabToggle.classList.toggle('on', isNewtabHomeOn());
  newtabToggle.setAttribute('aria-checked', String(isNewtabHomeOn()));
}

newtabToggle.addEventListener('click', () => {
  localStorage.setItem(NEWTAB_KEY, isNewtabHomeOn() ? '0' : '1');
  syncNewtabToggle();
});

syncNewtabToggle();
