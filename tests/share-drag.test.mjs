// Share-page sidebar and outline drag handles. Run: node tests/share-drag.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "lan-share.js"), "utf8").replace(
  "return {\n    toggle: toggle,",
  "return {\n    page: guestPage,\n    toggle: toggle,",
);

function hostDom() {
  return new JSDOM(
    `<!doctype html><html data-theme="light" data-scheme="light"><body>
      <div class="sidebar-slot" id="sidebarSlot"><aside class="sidebar" id="sidebar"></aside></div>
      <span id="locLabel"><span class="loc-name">我的笔记</span></span>
      <div id="fileTree"><div class="tree-file active"><span class="tree-file-name">说明</span></div></div>
      <div id="contentArea" data-fontsize="medium"></div>
      <aside class="outline" id="outline" style="width:300px">
        <ul id="outlineRoot"><li><a class="outline-link" href="#a">章节</a></li></ul>
      </aside>
      <article id="markdownBody">正文</article>
    </body></html>`,
    { runScripts: "dangerously", url: "https://share.local/s/token" },
  );
}

function mouse(window, type, x, target) {
  target.dispatchEvent(new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    button: 0,
  }));
}

const host = hostDom();
host.window.chrome = { runtime: {} };
const script = host.window.document.createElement("script");
script.textContent = src;
host.window.document.body.appendChild(script);

const html = host.window.LanShare.page("说明", "<p>正文</p>", 1, "");
assert.match(html, /id="sidebarHandle"/);
assert.match(html, /id="outlineResizer"/);
assert.match(html, /width:300px/);
assert.doesNotMatch(html, /localStorage/);

const guest = new JSDOM(html, { runScripts: "dangerously", url: "https://share.local/s/token" });
const { window } = guest;
const { document } = window;
const slot = document.getElementById("sidebarSlot");
const sidebar = document.getElementById("sidebar");
const handle = document.getElementById("sidebarHandle");
const outline = document.getElementById("outline");
const resizer = document.getElementById("outlineResizer");
slot.getBoundingClientRect = () => ({ width: 272, height: 800, top: 0, left: 0, right: 272, bottom: 800, x: 0, y: 0, toJSON() { return {}; } });
outline.getBoundingClientRect = () => ({ width: 300, height: 800, top: 0, left: 0, right: 300, bottom: 800, x: 0, y: 0, toJSON() { return {}; } });

mouse(window, "mousedown", 272, handle);
mouse(window, "mousemove", 120, document);
mouse(window, "mouseup", 120, document);
assert.equal(slot.style.width, "120px");
assert.equal(sidebar.style.transform, "translateX(-152px)");
assert.equal(slot.classList.contains("collapsed"), false);

mouse(window, "mousedown", 272, handle);
mouse(window, "mousemove", 0, document);
mouse(window, "mouseup", 0, document);
assert.equal(slot.classList.contains("collapsed"), true);
assert.equal(slot.style.width, "");
assert.equal(sidebar.hasAttribute("inert"), true);

handle.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
assert.equal(slot.classList.contains("collapsed"), false);
assert.equal(sidebar.hasAttribute("inert"), false);

mouse(window, "mousedown", 400, resizer);
mouse(window, "mousemove", 300, document);
mouse(window, "mouseup", 300, document);
assert.equal(outline.style.width, "400px");
assert.equal(outline.style.flexBasis, "400px");

mouse(window, "mousedown", 200, resizer);
mouse(window, "mousemove", 600, document);
mouse(window, "mouseup", 600, document);
assert.equal(outline.style.width, "160px");

guest.window.close();
host.window.close();
