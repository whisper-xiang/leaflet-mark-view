// Regression tests for the Markdown → Confluence Wiki Markup converter.
// No dependencies — run with:  node tests/confluence.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "md-to-confluence.js"), "utf8");
const ctx = { module: { exports: {} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const C = ctx.mdToConfluence;

let pass = 0;
let fail = 0;
function t(name, md, has) {
  const out = C(md);
  const missing = [].concat(has).filter((s) => !out.includes(s));
  if (!missing.length) {
    pass++;
    return;
  }
  fail++;
  console.log("✗ " + name);
  console.log("   missing: " + JSON.stringify(missing));
  console.log("   got: " + JSON.stringify(out));
}

t("headings", "# Title\n## Sub", ["h1. Title", "h2. Sub"]);
t("bold uses single asterisk", "**bold**", "*bold*");
t("italic uses underscore", "*italic* and _em_", ["_italic_", "_em_"]);
t("bold italic", "***x***", "*_x_*");
t("strikethrough", "~~x~~", "-x-");
t("inline code", "use `npm i`", "{{npm i}}");
t("link", "[docs](https://a.com)", "[docs|https://a.com]");
t("image", "![alt](pic.png)", "!pic.png!");
t("in-page anchor keeps text only", "[top](#intro)", "top");
t("fenced code with language", "```js\nconst x=1\n```", ["{code:js}", "const x=1", "{code}"]);
t("unordered list", "- a\n- b", ["* a", "* b"]);
t("nested list deepens the bullet", "- a\n  - b", ["* a", "** b"]);
t("ordered list", "1. one\n2. two", ["# one", "# two"]);
t("task list uses emoticons", "- [x] done\n- [ ] todo", ["* (/) done", "* (x) todo"]);
t("table header + rows", "| H1 | H2 |\n|---|---|\n| a | b |", ["|| H1 || H2 ||", "| a | b |"]);
t("horizontal rule", "---", "----");
t("blockquote", "> quoted", ["{quote}", "quoted", "{quote}"]);
t("front matter becomes an info panel", "---\ntitle: X\n---\n\nbody", ["{info}", "title: X"]);
t("intra-word underscore is preserved", "snake_case_var", "snake_case_var");
t("link nested inside bold", "**[t](u)**", "*[t|u]*");
t("escaped pipe stays in a table cell", "| a | b |\n|---|---|\n| x \\| y | z |", "x | y");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
