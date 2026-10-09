// Executed in the active tab's ISOLATED world after the bundled libraries.
// Work on clones so extraction never changes the source page.
(() => {
  try {
    if (!/^https?:$/.test(location.protocol)) {
      throw new Error("请在普通 HTTP / HTTPS 网页上使用此功能。");
    }
    if (!document.body || !/html/i.test(document.contentType)) {
      throw new Error("此页面不是可转换的 HTML 网页。");
    }
    const sourceUrl = location.href;
    const clone = document.cloneNode(true);
    const originals = document.querySelectorAll("img");
    clone.querySelectorAll("img").forEach((image, index) => {
      const original = originals[index];
      const lazy = original.getAttribute("data-src") || original.getAttribute("data-original");
      const src = lazy || original.currentSrc || original.getAttribute("src");
      if (src) image.setAttribute("src", src);
      image.removeAttribute("srcset");
    });
    clone.querySelectorAll("script, style, noscript, template, iframe, object, embed, form, input, textarea, select, button, nav, aside, [hidden], [aria-hidden='true']").forEach(el => el.remove());
    const fallback = clone.querySelector("article, main, [role='main']")?.cloneNode(true);
    const article = new Readability(clone, { charThreshold: 80, maxElemsToParse: 50000, keepClasses: true }).parse();
    const root = document.createElement("div");
    if (article?.content && article.textContent.trim()) root.innerHTML = article.content;
    else if (fallback?.textContent.trim()) root.append(fallback.cloneNode(true));
    else throw new Error("没有找到可阅读的正文。请打开具体文章，等待内容加载完成后重试。");

    const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
    const escape = service.escape.bind(service);
    // Literal HTML in a text node must not become a raw HTML block in Markdown.
    service.escape = text => escape(text).replace(/</g, "\\<").replace(/>/g, "\\>");
    const safeUrl = (raw, image = false) => {
      try {
        const url = new URL(raw, document.baseURI);
        if (!(image ? ["http:", "https:"] : ["http:", "https:", "mailto:", "tel:"]).includes(url.protocol)) return "";
        return url.href.replace(/[<>"()\\\s]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase());
      } catch { return ""; }
    };
    // Strip all executable/interactive content even when Readability kept it.
    service.remove(["script", "style", "noscript", "iframe", "object", "embed", "form", "input", "textarea", "select", "button", "svg", "math"]);
    service.addRule("safeLinks", {
      filter: "a",
      replacement(content, node) {
        const href = node.getAttribute("href");
        const url = href ? safeUrl(href) : "";
        return url && content.trim() ? `[${content}](${url})` : content;
      },
    });
    service.addRule("safeImages", {
      filter: "img",
      replacement(_content, node) {
        const raw = node.getAttribute("src");
        const src = raw ? safeUrl(raw, true) : "";
        const alt = service.escape((node.getAttribute("alt") || "图片").replace(/[\r\n]+/g, " "));
        return src ? `![${alt}](${src})` : alt;
      },
    });
    service.addRule("strikethrough", { filter: ["del", "s", "strike"], replacement: content => `~~${content}~~` });
    service.addRule("tables", {
      filter: "table",
      replacement(_content, node) {
        const rows = [...node.rows].map(row => [...row.cells].map(cell =>
          service.turndown(cell.innerHTML).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim(),
        ));
        if (!rows.length) return "";
        const width = Math.max(...rows.map(row => row.length));
        const line = row => `| ${Array.from({ length: width }, (_, i) => row[i] || "").join(" | ")} |`;
        return `\n\n${line(rows[0])}\n${line(Array(width).fill("---"))}\n${rows.slice(1).map(line).join("\n")}\n\n`;
      },
    });
    const title = (article?.title || document.title || "网页摘录").replace(/\s+/g, " ").trim();
    const heading = root.querySelector("h1, h2");
    if (heading?.textContent.trim() === title) heading.remove();
    const body = service.turndown(root).trim();
    if (!body) throw new Error("没有找到可转换的正文。");
    const markdown = `# ${service.escape(title)}\n\n> 来源：[原网页](${safeUrl(sourceUrl)})\n\n${body}\n`;
    if (markdown.length > 2000000) throw new Error("正文过大，请选择较短的文章后重试。");
    return { ok: true, article: { title, sourceUrl, markdown } };
  } catch (error) {
    return { ok: false, error: error.message || "网页转换失败，请重试。" };
  }
})();
