// Last-column resize grip. Run: node tests/table-resize.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "viewer.js"), "utf8");
const start = src.indexOf("const MIN_COL_W");
const end = src.indexOf("function decorateCodeBlock");
if (start < 0 || end < 0) throw new Error("setupResizableTable not found");

const dom = new JSDOM(`<!doctype html><body>
  <table>
    <thead><tr><th>甲</th><th>乙</th><th>丙</th></tr></thead>
    <tbody>
      <tr><td>一</td><td>二</td><td>三</td></tr>
      <tr><td>四</td><td>五</td><td>六</td></tr>
    </tbody>
  </table>
</body>`, { runScripts: "dangerously" });
const { window } = dom;
const table = window.document.querySelector("table");
const widths = [90, 140, 200];
table.querySelectorAll("th").forEach((cell, i) => {
  const w = widths[i];
  cell.getBoundingClientRect = () => ({
    width: w, height: 32, top: 0, left: 0, right: w, bottom: 32, x: 0, y: 0,
    toJSON() { return {}; },
  });
});
window.HTMLElement.prototype.setPointerCapture = function () {};

const script = window.document.createElement("script");
script.textContent = src.slice(start, end);
window.document.body.appendChild(script);
window.setupResizableTable(table);

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    return;
  }
  fail++;
  console.log("✗ " + name);
  if (extra !== undefined) console.log("   ", extra);
}

const grips = window.document.querySelectorAll(".col-resizer");
const edge = window.document.querySelector(".col-resizer.is-edge");
const cols = table.querySelectorAll("col");
ok("one grip per column", grips.length === 3, grips.length);
ok("right edge grip exists", !!edge);
ok("edge grip lives on the scroll wrap", edge && edge.parentElement.classList.contains("table-wrap"));
ok("edge grip tracks the table's right side", edge && edge.style.left === table.offsetLeft + table.offsetWidth - 9 + "px", edge && edge.style.left);

function pointer(type, x) {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  e.clientX = x;
  e.pointerId = 1;
  return e;
}
function drag(grip, from, to) {
  grip.dispatchEvent(pointer("pointerdown", from));
  grip.dispatchEvent(pointer("pointermove", to));
  grip.dispatchEvent(pointer("pointerup", to));
}

const before = cols[2].style.width;
drag(edge, 300, 380);
ok("dragging the right edge widens the last column", cols[2].style.width === "280px", cols[2].style.width);
ok("other columns stay put", cols[0].style.width === "90px" && cols[1].style.width === "140px", [cols[0].style.width, cols[1].style.width]);
ok("table width follows the columns", table.style.width === "510px", table.style.width);
ok("edge grip follows the new width", edge.style.left === table.offsetLeft + table.offsetWidth - 9 + "px");

drag(edge, 400, 40);
ok("last column does not shrink below the minimum", cols[2].style.width === "48px", cols[2].style.width);

const mid = grips[0];
drag(mid, 100, 160);
ok("an inner grip still resizes its own column", cols[0].style.width === "150px", cols[0].style.width);
ok("inner grip leaves the last column alone", cols[2].style.width === "48px");

edge.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
ok("double-click refits the last column from content", cols[2].style.width === before, cols[2].style.width);

console.log(fail ? `${pass} passed, ${fail} failed` : `${pass} passed`);
process.exit(fail ? 1 : 0);
