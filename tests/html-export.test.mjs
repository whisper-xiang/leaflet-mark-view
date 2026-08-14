// Markdown → export HTML (structure only; inlining needs DOMParser).
// Run: node tests/html-export.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(
  readFileSync(join(here, "..", "markdown.js"), "utf8") +
    "\nthis.parseMarkdown = parseMarkdown;",
  ctx,
);
vm.runInContext(readFileSync(join(here, "..", "md-to-html.js"), "utf8"), ctx);

const { mdToExportHtml, prepareExportHtml } = ctx;

let pass = 0;
let fail = 0;
function t(name, cond, extra) {
  if (cond) {
    pass++;
    return;
  }
  fail++;
  console.log("✗ " + name);
  if (extra !== undefined) console.log("   ", extra);
}

const html = mdToExportHtml("# Hi\n\nHello **x**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n");
t("wraps article", html.startsWith("<article class=\"lmv-export-article\""));
t("keeps heading", html.includes("<h1"));
t("keeps strong", html.includes("<strong>x</strong>"));
t("keeps markdown table", html.includes("<table>") && html.includes("<th"));
t("strips header-anchor", !html.includes("header-anchor"), html);
t("fixed light color", html.includes("color:#222"));

const rawTable = mdToExportHtml(
  "before\n\n<table><tr><th>H</th></tr><tr><td>v</td></tr></table>\n",
);
t("keeps html table", rawTable.includes("<table>") && rawTable.includes("<td>v</td>"));

const mermaid = prepareExportHtml(
  '<pre class="mermaid">graph TD; A-->B</pre>',
);
t("mermaid becomes code", mermaid.includes("<pre><code>") && mermaid.includes("graph TD"));
t("mermaid class gone", !mermaid.includes('class="mermaid"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
