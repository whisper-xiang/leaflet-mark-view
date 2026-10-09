import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
async function setup() {
  const dom = new JSDOM(read('viewer.html'), { url: 'https://reader.example/viewer.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const run = code => vm.runInContext(code, dom.getInternalVMContext());
  await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  run(read('auto-scroll.js'));
  run(read('viewer.js'));
  const area = window.document.getElementById('contentArea');
  Object.defineProperties(area, { scrollHeight: { value: 2000 }, clientHeight: { value: 600 } });
  window.document.querySelector('.settings-list').style.visibility = 'hidden';
  run(`autoScroller = bindAutoScroll();
    urlModalApi.closeUrlModal = () => document.getElementById('urlModal').classList.remove('open');
    document.addEventListener('keydown', handleReaderEscape, { capture: true });
    autoScroller.start();`);
  return {
    window, document: window.document, close: () => window.close(),
    running: () => run('autoScroller.running'),
    escape(target = window.document.body, repeat = false) {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, repeat }));
    },
  };
}
test('Escape closes auto-scroll panel first, then stops on the next press', async () => {
  const s = await setup();
  try {
    s.document.getElementById('autoScrollTrigger').click();
    s.escape();
    assert.equal(s.document.getElementById('autoScrollPanel').hidden, true);
    assert.equal(s.document.getElementById('autoScrollTrigger').getAttribute('aria-expanded'), 'false');
    assert.equal(s.running(), true);
    s.escape(s.document.body, true);
    assert.equal(s.running(), true, 'holding Escape must not perform a second action');
    s.escape();
    assert.equal(s.running(), false);
  } finally { s.close(); }
});
test('Escape in modal input closes only the modal and preserves scrolling', async () => {
  for (const id of ['searchModal', 'urlModal', 'htmlModal', 'docxModal', 'cfModal']) {
    const s = await setup();
    try {
      const modal = s.document.getElementById(id);
      modal.classList.add('open');
      const input = modal.querySelector('input, textarea') || modal;
      let targetHandlerRan = false;
      input.addEventListener('keydown', () => { targetHandlerRan = true; modal.classList.remove('open'); });
      s.escape(input);
      assert.equal(modal.classList.contains('open'), false, id);
      assert.equal(s.running(), true, id);
      assert.equal(targetHandlerRan, false, 'capture-phase routing prevents double handling');
      s.escape();
      assert.equal(s.running(), false, id);
    } finally { s.close(); }
  }
});
test('image preview and settings menu consume Escape before auto-scroll', async () => {
  const s = await setup();
  try {
    const box = s.document.getElementById('lightbox');
    box.hidden = false; box.classList.add('open');
    s.escape(); assert.equal(box.hidden, true); assert.equal(s.running(), true);
    const menu = s.document.querySelector('.settings-menu');
    menu.querySelector('.settings-list').style.visibility = 'visible';
    s.escape(); assert.ok(menu.classList.contains('escape-dismissed')); assert.equal(s.running(), true);
    s.escape(); assert.equal(s.running(), false);
  } finally { s.close(); }
});
test('open and recent menus close without stopping; Escape without popups stops', async () => {
  const s = await setup();
  try {
    const menu = s.document.querySelector('.open-menu');
    menu.classList.add('open');
    s.document.getElementById('recentsMenu').classList.add('open');
    s.escape();
    assert.equal(menu.classList.contains('open'), false);
    assert.equal(s.document.getElementById('recentsMenu').classList.contains('open'), false);
    assert.equal(s.running(), true);
    s.escape(); assert.equal(s.running(), false);
  } finally { s.close(); }
});
