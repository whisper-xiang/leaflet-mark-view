// Nested heading folds. Run: node tests/heading-fold.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "viewer.js"), "utf8");
const start = src.indexOf("function chooseFoldLevel");
const end = src.indexOf("// Make a rendered table");
if (start < 0 || end < 0) throw new Error("heading fold functions not found");

function mount(html) {
  const dom = new JSDOM(`<!doctype html><body><div id="markdownBody">${html}</div></body>`, {
    runScripts: "dangerously",
  });
  const { window } = dom;
  const script = window.document.createElement("script");
  script.textContent = src.slice(start, end);
  window.document.body.appendChild(script);
  const body = window.document.getElementById("markdownBody");
  window.setupHeadingFolds(body);
  return { window, body };
}

function foldBody(heading) {
  const next = heading.nextElementSibling;
  if (!next || !next.classList.contains("heading-fold-body")) {
    throw new Error(heading.id + " has no fold body");
  }
  return next;
}

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

const nested = mount(`
  <h1 id="a">甲</h1>
  <p id="a-intro">甲引言</p>
  <h2 id="a1">甲一</h2>
  <p id="a1-body">甲一正文</p>
  <h2 id="a2">甲二</h2>
  <p id="a2-body">甲二正文</p>
  <h1 id="b">乙</h1>
  <h2 id="b1">乙一</h2>
  <p id="b1-body">乙一正文</p>
`);
const { window, body } = nested;
const byId = (id) => body.querySelector("#" + id);

ok("both chapter headings fold", byId("a").classList.contains("is-foldable") && byId("b").classList.contains("is-foldable"));
ok("second-level headings fold", ["a1", "a2", "b1"].every((id) => byId(id).classList.contains("is-foldable")));
ok("a section stops at the next chapter", foldBody(byId("a")).contains(byId("a2")) && !foldBody(byId("a")).contains(byId("b")));
ok("a subsection keeps its own body", foldBody(byId("a1")).contains(byId("a1-body")) && !foldBody(byId("a1")).contains(byId("a2")));
ok("chapter body still holds the subsection", foldBody(byId("a")).contains(byId("a1")));

byId("a1").querySelector(".heading-fold").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
ok("collapsing a subsection marks only that heading", byId("a1").classList.contains("is-collapsed") && !byId("a2").classList.contains("is-collapsed") && !byId("a").classList.contains("is-collapsed"));

byId("a").querySelector(".heading-fold").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
ok("collapsing a chapter leaves the subsection collapsed inside it", byId("a").classList.contains("is-collapsed") && foldBody(byId("a")).contains(byId("a1")));

const chapters = mount(`
  <h1 id="title">标题</h1>
  <h2 id="c1">章一</h2>
  <p id="c1-body">章一正文</p>
  <h3 id="s1">节</h3>
  <p id="s1-body">节正文</p>
  <h2 id="c2">章二</h2>
  <p id="c2-body">章二正文</p>
`);
const doc = chapters.body;
const id = (name) => doc.querySelector("#" + name);
ok("a lone document title stays open", !id("title").classList.contains("is-foldable"));
ok("chapters under a lone title fold", id("c1").classList.contains("is-foldable") && id("c2").classList.contains("is-foldable"));
ok("the next level under those chapters folds", id("s1").classList.contains("is-foldable"));
ok("a chapter section stops at the next chapter", foldBody(id("c1")).contains(id("s1")) && !foldBody(id("c1")).contains(id("c2")));
ok("a lower heading keeps its own body", foldBody(id("s1")).contains(id("s1-body")) && !foldBody(id("s1")).contains(id("c2")));

const preface = mount(`
  <h2 id="pre">前言</h2>
  <p id="pre-body">前言正文</p>
  <h1 id="main">正篇</h1>
  <p id="main-body">正篇正文</p>
  <h1 id="more">续篇</h1>
  <p id="more-body">续</p>
`);
const pre = preface.body;
ok("a leading second-level heading does not swallow the next chapter",
  foldBody(pre.querySelector("#pre")).contains(pre.querySelector("#pre-body")) &&
  !foldBody(pre.querySelector("#pre")).contains(pre.querySelector("#main")));
ok("the following chapter still folds on its own",
  pre.querySelector("#main").classList.contains("is-foldable") &&
  foldBody(pre.querySelector("#main")).contains(pre.querySelector("#main-body")) &&
  !foldBody(pre.querySelector("#main")).contains(pre.querySelector("#more")));

console.log(fail ? `${pass} passed, ${fail} failed` : `${pass} passed`);
process.exit(fail ? 1 : 0);
