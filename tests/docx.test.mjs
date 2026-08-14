// Markdown → .docx 回归测试。Run: node tests/docx.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {
  module: { exports: {} },
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Uint32Array,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(
  readFileSync(join(here, "..", "markdown.js"), "utf8") +
    "\nthis.parseMarkdown = parseMarkdown;",
  ctx,
);
vm.runInContext(readFileSync(join(here, "..", "html-table.js"), "utf8"), ctx);
vm.runInContext(readFileSync(join(here, "..", "md-to-docx.js"), "utf8"), ctx);

const { mdToDocx, mdToDocxXml, mdToDocxSummary, mdToDocxPreviewHtml } = ctx;

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

const xml = mdToDocxXml("# 标题\n\n正文 **加粗** 与 *斜体*\n");
t("heading style", xml.includes('w:pStyle w:val="Heading1"') && xml.includes("标题"));
t("star-wrap is highlighted", xml.includes('w:highlight w:val="yellow"') && xml.includes("加粗"));
t("star markers stripped", !xml.includes("**加粗**") && !xml.includes(">**") && !xml.includes("**<"));
t("italic", xml.includes("<w:i/>") && xml.includes("斜体"));
t("body text", xml.includes("正文"));
t("black heading color", xml.includes('w:color w:val="000000"') || xml.includes("Heading1"));

const tableXml = mdToDocxXml("| H1 | H2 |\n|---|---|\n| a | b |\n");
t("markdown table", tableXml.includes("<w:tbl>") && tableXml.includes("H1") && tableXml.includes(">a<"));

const htmlXml = mdToDocxXml(
  "intro\n\n<table><tr><th colspan=\"2\">Name</th></tr><tr><td>a</td><td>b</td></tr></table>\n",
);
t("html table gridSpan", htmlXml.includes('w:gridSpan w:val="2"') && htmlXml.includes("Name"));
t("html table cells", htmlXml.includes(">a<") && htmlXml.includes(">b<"));
t("token not leaked", !htmlXml.includes("LMV_DOCX_TABLE"));

const fenced = mdToDocxXml("```html\n<table><tr><td>secret</td></tr></table>\n```\n");
t("fenced table is code not tbl", fenced.includes("secret") && !fenced.includes("<w:tbl>"));

const codeXml = mdToDocxXml("```js\nconst x = 1\n```\n");
t("code block", codeXml.includes("const x = 1") && codeXml.includes("Consolas"));

const linkXml = mdToDocxXml("see [docs](https://a.com)\n");
t("hyperlink", linkXml.includes("hyperlink") && linkXml.includes("docs"));

const bytes = mdToDocx("# Hi\n");
t("zip signature", bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
t("contains document.xml", new TextDecoder().decode(bytes).includes("word/document.xml"));
t("contains styles", new TextDecoder().decode(bytes).includes("word/styles.xml"));

const sum = mdToDocxSummary("# A\n## B\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```\n\n![pic](a.png)\n");
t("summary headings", sum.headings.length === 2 && sum.headings[0] === "A");
t("summary tables", sum.tables === 1);
t("summary code", sum.codeBlocks === 1);
t("summary images", sum.images === 1);

const listXml = mdToDocxXml("- one\n- two\n");
t("list items", listXml.includes("one") && listXml.includes("two") && listXml.includes("•"));

const markInTable = mdToDocxXml("| H |\n|---|\n| **重点** |\n");
t("table star-wrap highlighted", markInTable.includes("重点") && markInTable.includes('w:highlight w:val="yellow"'));
t("table star markers stripped", !markInTable.includes("**重点**"));

const aigc = mdToDocxXml(
  `---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 538d19676c29de4852adb42c5924bde8_78d83c89780e11f1a7da5254006c9bbf
    ReservedCode1: /0J+zO3oeBxOmPbzUDXxibfpVKi1AWILndz5tyqMp7HIqRW9C2rog6kAY1v4fkT39LQmbfrGIynBX1lqv8XyQHmLRv6k65Yb+EiH9EHPHV5y21rmLZlvgPo4kDfFjH6JSq0s2Uk54FAdgWJAv8MRtM2r3IIgI0cFb8s9/teoqfUv84J3GJGZwaH8cQA=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 538d19676c29de4852adb42c5924bde8_78d83c89780e11f1a7da5254006c9bbf
    ReservedCode2: /0J+zO3oeBxOmPbzUDXxibfpVKi1AWILndz5tyqMp7HIqRW9C2rog6kAY1v4fkT39LQmbfrGIynBX1lqv8XyQHmLRv6k65Yb+EiH9EHPHV5y21rmLZlvgPo4kDfFjH6JSq0s2Uk54FAdgWJAv8MRtM2r3IIgI0cFb8s9/teoqfUv84J3GJGZwaH8cQA=
---

# 正文标题

段落内容
`,
);
t("skips AIGC front matter keys", !aigc.includes("ContentProducer") && !aigc.includes("ReservedCode"));
t("skips AIGC payload", !aigc.includes("001191440300708461136T1XGW3"));
t("skips 文档信息 label", !aigc.includes("文档信息"));
t("keeps body after AIGC", aigc.includes("正文标题") && aigc.includes("段落内容"));

const preview = mdToDocxPreviewHtml("**重点** 与普通\n\n# 标题\n");
t("preview wraps sheet", preview.includes('class="docx-sheet"'));
t("preview highlights stars", preview.includes('class="docx-hl"') && preview.includes("重点"));
t("preview strips strong", !preview.includes("<strong>"));
const previewAigc = mdToDocxPreviewHtml(
  "---\nAIGC:\n    ContentProducer: SECRETPROD\n---\n\n可见正文\n",
);
t("preview skips AIGC", !previewAigc.includes("SECRETPROD") && previewAigc.includes("可见正文"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
