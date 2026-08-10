// Regression tests for plantuml.js helpers.
// Run with: node tests/plantuml.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "plantuml.js"), "utf8");
const ctx = {
  chrome: undefined,
  location: { href: "file:///tmp/viewer.html" },
  document: undefined,
  Promise,
  setTimeout,
  clearTimeout,
  Math,
  Date,
  Error,
};
vm.createContext(ctx);
vm.runInContext(
  src + "\nthis.plantumlNormalizeSource = plantumlNormalizeSource;",
  ctx,
);

let pass = 0;
let fail = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    return;
  }
  fail++;
  console.log("✗ " + name + (detail ? " — " + detail : ""));
}

ok(
  "normalize wraps bare source",
  ctx.plantumlNormalizeSource("Alice -> Bob") ===
    "@startuml\nAlice -> Bob\n@enduml",
);
ok(
  "normalize keeps existing @startuml",
  ctx.plantumlNormalizeSource("@startuml\nA->B\n@enduml").includes("@startuml"),
);
ok("normalize empty stays empty", ctx.plantumlNormalizeSource("  ") === "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
