// Regression tests for the Markdown parser (markdown.js).
// No dependencies — run with:  node tests/markdown.test.mjs
//
// markdown.js is a browser script (global functions, no exports), so we load it
// into an isolated VM context and pull the two entry points off of it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "markdown.js"), "utf8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + "\nthis.parseMarkdown = parseMarkdown;", ctx);
const parseMarkdown = ctx.parseMarkdown;

let pass = 0;
let fail = 0;

// Assert the rendered HTML contains every `has` string and none of the `lacks`.
function t(name, md, has, lacks = []) {
  const out = parseMarkdown(md, true);
  const missing = [].concat(has).filter((s) => !out.includes(s));
  const present = [].concat(lacks).filter((s) => out.includes(s));
  if (!missing.length && !present.length) {
    pass++;
    return;
  }
  fail++;
  console.log("✗ " + name);
  if (missing.length) console.log("   missing: " + JSON.stringify(missing));
  if (present.length) console.log("   unexpected: " + JSON.stringify(present));
  console.log("   got: " + out.replace(/\n/g, "⏎").slice(0, 320));
}

// Assert exact HTML equality.
function eq(name, md, expected) {
  const out = parseMarkdown(md, true);
  if (out === expected) {
    pass++;
    return;
  }
  fail++;
  console.log("✗ " + name);
  console.log("   expected: " + JSON.stringify(expected));
  console.log("   got:      " + JSON.stringify(out));
}

// ── Inline links / emphasis ─────────────────────────────────────────
t("link URL may contain balanced parens",
  "[wiki](https://en.wikipedia.org/wiki/Foo_(bar))",
  '<a href="https://en.wikipedia.org/wiki/Foo_(bar)"');
t("image URL may contain balanced parens",
  "![alt](https://h.com/a_(b).png)",
  '<img src="https://h.com/a_(b).png"');
t("intra-word underscore is not emphasis",
  "use snake_case_var here",
  "snake_case_var", ["<em>"]);
t("underscore inside a link URL is not emphasis",
  "see [x](https://a.com/b_c_d.md)",
  "b_c_d.md", ["<em>"]);
t("real underscore emphasis still works",
  "this is _emphasis_ ok",
  "<em>emphasis</em>");
t("double underscore strong still works",
  "this is __strong__ ok",
  "<strong>strong</strong>");
t("asterisk emphasis is unaffected",
  "a*b*c and **bold**",
  ["<em>b</em>", "<strong>bold</strong>"]);

// ── Lists ───────────────────────────────────────────────────────────
eq("simple tight list unchanged",
  "- one\n- two",
  "<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n");
eq("ordered list unchanged",
  "1. one\n2. two",
  "<ol>\n<li>one</li>\n<li>two</li>\n</ol>\n");
t("ordered list honours start number",
  "3. three\n4. four",
  '<ol start="3">');
t("ordered list start=1 omits attribute",
  "1. one\n2. two",
  "<ol>", ['start="1"']);
t("task list checkboxes",
  "- [x] done\n- [ ] todo",
  ['type="checkbox" checked disabled', 'class="task-item"']);
t("nested list still nests",
  "- a\n  - a1\n  - a2\n- b",
  ["<li>a\n<ul>", "<li>a1</li>"]);
t("fenced code block survives inside a list item",
  "- item\n  ```js\n  const x = 1\n  ```\n- next",
  ['<pre><code class="language-js">', "tok-kw"],
  ["<code>js"]);

// ── Tables ──────────────────────────────────────────────────────────
t("table alignment",
  "| h1 | h2 |\n|:--:|--:|\n| a | b |",
  ['align="center"', 'align="right"']);
t("escaped pipe stays inside one table cell",
  "| a | b |\n|---|---|\n| x \\| y | z |",
  "x | y");

// ── Footnotes ───────────────────────────────────────────────────────
t("footnote reference becomes a numbered superscript link",
  "claim[^1].\n\n[^1]: explanation.",
  ['<sup class="footnote-ref">', '<a href="#fn-1" id="fnref-1">1</a>']);
t("footnote definitions move into a footnotes section",
  "claim[^1].\n\n[^1]: explanation.",
  ['<section class="footnotes">', '<li id="fn-1">explanation.'],
  ["[^1]: explanation"]);
t("footnotes are numbered in reference order",
  "a[^x] b[^y].\n\n[^y]: Y\n[^x]: X",
  ['href="#fn-x" id="fnref-x">1</a>', 'href="#fn-y" id="fnref-y">2</a>']);
t("unknown footnote reference is left as literal text",
  "see [^missing] here",
  "[^missing]", ["footnote-ref"]);
t("document without footnotes has no footnotes section",
  "# Hi\n\nplain text",
  "<p>plain text</p>", ["footnotes"]);

// ── Emoji shortnames ────────────────────────────────────────────────
t("known emoji shortnames are substituted",
  "I :heart: this :rocket: :+1:",
  "I ❤️ this 🚀 👍");
t("unknown emoji shortname is left literal",
  "hello :notarealemoji: world",
  ":notarealemoji:");
t("emoji shortname inside code span is untouched",
  "`:heart:` vs :heart:",
  ["<code>:heart:</code>", "❤️"]);

// ── Math (KaTeX placeholders) ───────────────────────────────────────
t("inline math becomes a katex placeholder carrying raw TeX",
  "mass is $E=mc^2$ ok",
  '<span class="math-inline" data-tex="E=mc^2">');
t("inline math leaves underscores intact",
  "$a_b_c$",
  'data-tex="a_b_c"');
t("dollar amounts are not treated as math",
  "it costs $5 and $10 total",
  ["$5", "$10"], ["math-inline"]);
t("single-line block math",
  "$$E = mc^2$$",
  '<div class="math-block" data-tex="E = mc^2">');
t("fenced block math across lines",
  "$$\n\\int_0^1 x\\,dx\n$$",
  'data-tex="\\int_0^1 x\\,dx"');

// ── Mermaid ─────────────────────────────────────────────────────────
t("mermaid fence yields a raw mermaid pre (no highlighting)",
  "```mermaid\ngraph TD\nA-->B\n```",
  '<pre class="mermaid">graph TD\nA--&gt;B</pre>',
  ["language-mermaid", "tok-"]);

// ── Regression: core blocks ─────────────────────────────────────────
t("heading and bold",
  "# Title\n\nhello **world**",
  ["<h1", "<strong>world</strong>"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
