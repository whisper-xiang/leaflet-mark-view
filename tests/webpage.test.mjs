import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const captureScripts = ['vendor/readability/Readability.js', 'vendor/turndown/turndown.js', 'webpage-capture.js'].map(read);
const paragraph = '<p>这是一篇关于阅读与技术的文章，保留清晰的标题、正文和例子，让读者专注理解。我们希望转换后仍能阅读段落、查看图片，并跟随链接继续探索。</p>';
function capture(body, { url = 'https://example.com/articles/one', head = '' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><title>测试文章</title>${head}</head><body>${body}</body></html>`, { url, runScripts: 'outside-only' });
  const before = dom.window.document.documentElement.outerHTML;
  let result;
  for (const code of captureScripts) result = dom.window.eval(code);
  assert.equal(dom.window.document.documentElement.outerHTML, before, 'the original page must be unchanged');
  return { result, dom };
}
test('extracts article, retains headings, lists, code, tables, images and absolute URLs', () => {
  const { result, dom } = capture(`<nav>导航噪音</nav><article><h1>测试文章</h1>${paragraph.repeat(4)}<h2>实践</h2><ul><li>第一条</li><li>第二条</li></ul><pre><code class="language-js">const value = 42;</code></pre><p><a href="../next?q=hello">下一篇</a><img data-src="../photo.png" alt="示例图"></p><table><tr><th>名称</th><th>数量</th></tr><tr><td>笔记</td><td>2</td></tr></table></article><aside>侧栏噪音</aside>`);
  assert.equal(result.ok, true, result.error);
  const md = result.article.markdown;
  for (const text of ['# 测试文章', '## 实践', '第一条', '```js', 'const value = 42;', '| 名称 | 数量 |', '| 笔记 | 2 |', 'https://example.com/next?q=hello', 'https://example.com/photo.png', 'https://example.com/articles/one']) assert.ok(md.includes(text), text + '\n' + md);
  assert.ok(!md.includes('导航噪音') && !md.includes('侧栏噪音'));
  assert.equal((md.match(/^# 测试文章$/gm) || []).length, 1);
  // Re-injection into the same page must also work.
  for (const code of captureScripts) dom.window.eval(code);
  dom.window.close();
});
test('resolves base URLs and drops executable links, scripts and hidden/input contents', () => {
  const { result, dom } = capture(`<article>${paragraph.repeat(4)}<p><a href="javascript:alert(1)">危险链接</a><a href="next(a).html">安全链接</a><img src="javascript:alert(1)" alt="安全替代"></p><script>BAD_SCRIPT</script><p hidden>HIDDEN_SECRET</p><form><textarea>INPUT_SECRET</textarea></form></article>`, { head: '<base href="https://cdn.example.com/docs/">' });
  assert.equal(result.ok, true);
  assert.match(result.article.markdown, /https:\/\/cdn.example.com\/docs\/next%28a%29.html/);
  assert.doesNotMatch(result.article.markdown, /javascript:|BAD_SCRIPT|HIDDEN_SECRET|INPUT_SECRET/);
  dom.window.close();
});
test('literal HTML cannot turn into raw executable HTML in the existing reader', () => {
  const { result, dom } = capture(`<article>${paragraph.repeat(4)}<p>&lt;img src=x onerror=alert(1)&gt;</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></article>`);
  assert.equal(result.ok, true);
  dom.window.eval(read('markdown.js'));
  const rendered = dom.window.parseMarkdown(result.article.markdown, true);
  assert.doesNotMatch(rendered, /<script|<img src=x/i);
  dom.window.close();
});
test('empty and unsupported pages return actionable errors', () => {
  for (const [body, options] of [['<nav>首页</nav>', {}], [paragraph, { url: 'file:///tmp/page.html' }]]) {
    const { result, dom } = capture(body, options);
    assert.equal(result.ok, false); assert.ok(result.error); dom.window.close();
  }
});
function database(indexedDB = new IDBFactory()) {
  const context = vm.createContext({ indexedDB, crypto: webcrypto, window: { dispatchEvent() {} }, CustomEvent: class {}, location: {} });
  vm.runInContext(read('lmv-db.js') + '\nthis.db = LMV;', context);
  return { db: context.db, context, indexedDB };
}
test('capture survives a new reader context, reopens from recents, and removal deletes snapshot', async () => {
  const first = database();
  const id = await first.db.saveWebCapture({ title: '网页标题', sourceUrl: 'https://example.com/post', markdown: '# Saved\n\n正文' });
  const next = database(first.indexedDB);
  const entry = await next.db.getWebCapture(id);
  assert.equal(entry.text, '# Saved\n\n正文');
  assert.equal(entry.kind, 'webpage');
  await next.db.openRecent(entry);
  assert.equal(next.context.location.href, 'viewer.html?capture=' + encodeURIComponent(id));
  await next.db.removeRecent(id);
  assert.equal(await next.db.getWebCapture(id), null);
});
test('web snapshots obey the existing 20-document recent limit', async () => {
  const { db } = database();
  for (let i = 0; i < 22; i++) await db.saveWebCapture({ title: 'Article ' + i, sourceUrl: 'https://example.com/' + i, markdown: 'text' });
  assert.equal((await db.listRecents()).length, 20);
});
function background({ injectionError = false, captureError = false } = {}) {
  const listeners = [], created = [], injections = [], saved = [];
  const chrome = {
    runtime: { getURL: path => 'chrome-extension://test/' + path, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { listeners.push(fn); } } },
    storage: { session: { setAccessLevel() {} } },
    tabs: { async get() { return { url: 'https://example.com/post' }; }, async create(args) { created.push(args); }, async query() { return []; } },
    scripting: { async executeScript(args) { injections.push(args); if (injectionError) throw Error('denied'); return [{ result: captureError ? { ok: false, error: '没有正文' } : { ok: true, article: { title: 'Title', sourceUrl: 'https://example.com/post', markdown: '# Body' } } }]; } },
  };
  const context = vm.createContext({ chrome, importScripts() {}, LMV: { async saveWebCapture(article) { saved.push(article); return 'webpage:123'; } } });
  vm.runInContext(read('background.js'), context);
  return { listeners, created, injections, saved };
}
test('popup capture runs isolated bundled scripts and opens a saved reader without replacing original', async () => {
  const b = background();
  const response = await new Promise(resolve => b.listeners[1]({ type: 'lmv-capture-page', tabId: 7 }, { url: 'chrome-extension://test/popup.html' }, resolve));
  assert.equal(response.ok, true);
  assert.equal(b.injections[0].target.tabId, 7);
  assert.equal(b.injections[0].world, 'ISOLATED');
  assert.equal(b.saved.length, 1);
  assert.equal(b.created[0].url, 'chrome-extension://test/viewer.html?capture=webpage%3A123');
  assert.equal(b.listeners[1]({ type: 'lmv-capture-page', tabId: 7 }, { url: 'https://example.com' }, () => { throw Error('unexpected reply'); }), undefined);
});
test('capture failures reach the popup and do not create empty documents', async () => {
  for (const options of [{ injectionError: true }, { captureError: true }]) {
    const b = background(options);
    const response = await new Promise(resolve => b.listeners[1]({ type: 'lmv-capture-page', tabId: 7 }, { url: 'chrome-extension://test/popup.html' }, resolve));
    assert.equal(response.ok, false); assert.ok(response.error); assert.equal(b.created.length, 0); assert.equal(b.saved.length, 0);
  }
});
