// HTML table extractor / grid model / Confluence conversion.
// Run: node tests/html-table.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "html-table.js"), "utf8");
const ctx = { module: { exports: {} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const T = ctx.HtmlTable;

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

const simple = `<table>
<tr><th>A</th><th>B</th></tr>
<tr><td>1</td><td>2</td></tr>
</table>`;

const model = T.parse(simple);
ok("simple colCount", model.colCount === 2, model.colCount);
ok("simple two rows", model.rows.length === 2, model.rows.length);
ok("header cells", model.rows[0].cells.every((c) => c.header));
ok("body text", model.rows[1].cells[0].text === "1");

const cf = T.toConfluence(model);
ok("cf header row", cf.includes("|| A ||") && cf.includes("|| B ||"), cf);
ok("cf body row", cf.includes("| 1 |") && cf.includes("| 2 |"), cf);

const spanned = `<table>
<tr><th colspan="2">Title</th></tr>
<tr><td rowspan="2">L</td><td>a</td></tr>
<tr><td>b</td></tr>
</table>`;
const sm = T.parse(spanned);
ok("span colCount", sm.colCount === 2, sm.colCount);
ok("colspan parsed", sm.rows[0].cells[0].colspan === 2);
ok("rowspan parsed", sm.rows[1].cells[0].rowspan === 2);
const scf = T.toConfluence(sm);
ok("cf colspan attr", /colspan=2/.test(scf), scf);
ok("cf rowspan attr", /rowspan=2/.test(scf), scf);

const md = "intro\n\n" + simple + "\n\n```\n<table><tr><td>skip</td></tr></table>\n```\n";
const blocks = T.extractBlocks(md);
ok("extract one real table", blocks.length === 1, blocks.length);
ok("extract keeps real table", blocks[0].html.includes("<th>A</th>"));
ok("extract skips fenced table", !blocks[0].html.includes("skip"));

const nested = `<table><tr><td>outer<table><tr><td>inner</td></tr></table></td><td>x</td></tr></table>`;
const nm = T.parse(nested);
ok("nested does not steal sibling cell", nm.rows[0].cells.length === 2, nm.rows[0].cells.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
