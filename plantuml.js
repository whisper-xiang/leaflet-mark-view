// Local PlantUML rendering via vendored @plantuml/core (TeaVM + Viz.js).
// No network: diagrams never leave the browser.

let _plantumlApi = null;
let _plantumlQueue = Promise.resolve();

function plantumlNormalizeSource(src) {
  const text = (src || "").trim();
  if (!text) return "";
  if (/@startuml/i.test(text)) return text;
  return "@startuml\n" + text + "\n@enduml";
}

async function plantumlEnsureEngine(loadScriptOnce) {
  if (_plantumlApi) return _plantumlApi;
  await loadScriptOnce("vendor/plantuml/viz-global.js");
  const url =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL("vendor/plantuml/plantuml.js")
      : new URL("vendor/plantuml/plantuml.js", location.href).href;
  _plantumlApi = await import(url);
  return _plantumlApi;
}

// Serialize renders — @plantuml/core shares internal state and overwrites
// in-flight results if multiple renderToString calls overlap.
function plantumlRenderSvg(source, loadScriptOnce, options = {}) {
  const normalized = plantumlNormalizeSource(source);
  if (!normalized) {
    return Promise.reject(new Error("空的 PlantUML 源码"));
  }
  const lines = normalized.split(/\r\n|\r|\n/);
  const dark = !!options.dark;

  const job = _plantumlQueue.then(async () => {
    const api = await plantumlEnsureEngine(loadScriptOnce);
    if (dark && typeof api.render === "function") {
      return plantumlRenderDark(api, lines);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("PlantUML 渲染超时")),
        60000,
      );
      try {
        api.renderToString(
          lines,
          (svg) => {
            clearTimeout(timer);
            resolve(svg);
          },
          (err) => {
            clearTimeout(timer);
            reject(new Error(err || "PlantUML 渲染失败"));
          },
        );
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  });

  // Keep the queue alive even when a job fails.
  _plantumlQueue = job.then(
    () => {},
    () => {},
  );
  return job;
}

function plantumlRenderDark(api, lines) {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.id =
      "lmv-puml-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    host.style.cssText =
      "position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none";
    document.body.appendChild(host);

    let settled = false;
    let observer = null;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (observer) observer.disconnect();
      host.remove();
      fn(arg);
    };

    const timer = setTimeout(
      () => finish(reject, new Error("PlantUML 渲染超时")),
      60000,
    );

    observer = new MutationObserver(() => {
      if (!host.querySelector("svg")) return;
      finish(resolve, host.innerHTML);
    });
    observer.observe(host, { childList: true, subtree: true });

    try {
      api.render(lines, host.id, { dark: true });
    } catch (e) {
      finish(reject, e);
    }
  });
}
