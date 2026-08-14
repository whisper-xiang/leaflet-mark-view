// Markdown → 可粘贴 HTML 文章。
// 从源码走 parseMarkdown，再剥阅读器 chrome、套固定浅色内联样式。
// 导出面不消费阅读主题变量。

(function (root) {
  const ARTICLE_STYLE =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.75;color:#222;max-width:100%";

  const STYLE_RULES = [
    ["h1", "font-size:22px;font-weight:600;margin:1.4em 0 .55em;color:#1a1a1a;line-height:1.35"],
    ["h2", "font-size:18px;font-weight:600;margin:1.3em 0 .5em;color:#1a1a1a;line-height:1.4;border-bottom:1px solid #eee;padding-bottom:.3em"],
    ["h3", "font-size:16px;font-weight:600;margin:1.2em 0 .4em;color:#1a1a1a"],
    ["h4,h5,h6", "font-size:15px;font-weight:600;margin:1.1em 0 .35em;color:#1a1a1a"],
    ["p", "margin:0.75em 0;line-height:1.75;color:#333"],
    ["a", "color:#576b95;text-decoration:none"],
    ["blockquote", "margin:1em 0;padding:4px 0 4px 12px;border-left:3px solid #c9c0b6;color:#666;background:transparent"],
    ["ul,ol", "margin:0.75em 0;padding-left:1.6em"],
    ["li", "margin:0.25em 0;line-height:1.7"],
    ["code", "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#f5f5f5;padding:1px 4px;border-radius:3px;color:#c7254e"],
    ["pre", "margin:1em 0;padding:12px 14px;background:#f6f6f6;border-radius:4px;overflow:auto;font-size:13px;line-height:1.6"],
    ["pre code", "background:transparent;padding:0;color:#333;font-size:13px"],
    ["table", "border-collapse:collapse;width:100%;margin:1em 0;table-layout:auto"],
    ["th", "border:1px solid #d9d9d9;padding:8px 12px;background:#f5f5f5;font-weight:600;text-align:left;overflow-wrap:break-word;word-break:normal"],
    ["td", "border:1px solid #d9d9d9;padding:8px 12px;overflow-wrap:break-word;word-break:normal;vertical-align:top"],
    ["img", "max-width:100%;height:auto;display:block;margin:12px 0"],
    ["hr", "border:none;border-top:1px solid #e6e6e6;margin:1.6em 0"],
    ["strong,b", "font-weight:600"],
  ];

  function decodeAttr(s) {
    return String(s)
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  function prepareExportHtml(html) {
    let s = String(html || "");
    s = s.replace(/\s*<a class="header-anchor"[^>]*>[\s\S]*?<\/a>/gi, "");
    s = s.replace(
      /<pre class="(?:mermaid|plantuml)">([\s\S]*?)<\/pre>/gi,
      (_, body) => `<pre><code>${body}</code></pre>`,
    );
    s = s.replace(
      /<(span|div) class="math-(?:inline|block)"[^>]*data-tex="([^"]*)"[^>]*>[\s\S]*?<\/\1>/gi,
      (_, _tag, tex) => `<code>${decodeAttr(tex)}</code>`,
    );
    return s;
  }

  function wrapArticle(inner) {
    return (
      `<article class="lmv-export-article" style="${ARTICLE_STYLE}">` +
      inner +
      `</article>`
    );
  }

  function mdToExportHtml(src) {
    const parse =
      typeof root.parseMarkdown === "function"
        ? root.parseMarkdown
        : typeof parseMarkdown === "function"
          ? parseMarkdown
          : null;
    const raw = parse ? parse(String(src || ""), true) : "";
    return wrapArticle(prepareExportHtml(raw));
  }

  function inlineExportHtml(html) {
    if (typeof DOMParser === "undefined") return html;
    const doc = new DOMParser().parseFromString(
      `<div id="lmv-export-root">${html}</div>`,
      "text/html",
    );
    const rootEl = doc.getElementById("lmv-export-root");
    if (!rootEl) return html;
    STYLE_RULES.forEach(([sel, css]) => {
      rootEl.querySelectorAll(sel).forEach((el) => {
        if (sel === "code" && el.closest("pre")) return;
        const prev = el.getAttribute("style") || "";
        el.setAttribute("style", prev ? prev.replace(/;?$/, ";") + css : css);
      });
    });
    return rootEl.innerHTML;
  }

  function exportPlainText(src) {
    return String(src || "")
      .replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "")
      .trim();
  }

  root.mdToExportHtml = mdToExportHtml;
  root.inlineExportHtml = inlineExportHtml;
  root.prepareExportHtml = prepareExportHtml;
  root.exportPlainText = exportPlainText;
  root.LMV_EXPORT_ARTICLE_STYLE = ARTICLE_STYLE;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      mdToExportHtml,
      inlineExportHtml,
      prepareExportHtml,
      exportPlainText,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
