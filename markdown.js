// Markdown to HTML parser — GFM compatible

// Footnote state for the current top-level parse: id → definition text, plus
// the order ids are first referenced (drives numbering). Set on the root call,
// torn down when it returns, so nested parses (blockquotes, list items) share it.
let _footnoteDefs = null;
let _footnoteOrder = null;

// Common emoji shortnames (:smile: → 😄). Intentionally a curated subset of the
// shortnames people actually type in notes — unknown ones are left as literal text.
const EMOJI = {
  smile: "😄", smiley: "😃", grin: "😁", laughing: "😆", joy: "😂", rofl: "🤣",
  wink: "😉", blush: "😊", heart_eyes: "😍", thinking: "🤔", neutral_face: "😐",
  smirk: "😏", unamused: "😒", sob: "😭", cry: "😢", angry: "😠", rage: "😡",
  sunglasses: "😎", confused: "😕", sweat_smile: "😅", scream: "😱", fearful: "😨",
  yum: "😋", relieved: "😌", sleeping: "😴", mask: "😷", innocent: "😇",
  heart: "❤️", broken_heart: "💔", sparkling_heart: "💖", "+1": "👍", thumbsup: "👍",
  "-1": "👎", thumbsdown: "👎", ok_hand: "👌", clap: "👏", pray: "🙏", muscle: "💪",
  wave: "👋", point_right: "👉", point_left: "👈", point_up: "☝️", point_down: "👇",
  raised_hands: "🙌", handshake: "🤝", fire: "🔥", star: "⭐", star2: "🌟",
  sparkles: "✨", zap: "⚡", boom: "💥", tada: "🎉", confetti_ball: "🎊",
  rocket: "🚀", bulb: "💡", warning: "⚠️", x: "❌", o: "⭕", heavy_check_mark: "✔️",
  white_check_mark: "✅", question: "❓", exclamation: "❗", bangbang: "‼️",
  100: "💯", eyes: "👀", brain: "🧠", skull: "💀", ghost: "👻", robot: "🤖",
  poop: "💩", thought_balloon: "💭", speech_balloon: "💬", lock: "🔒", key: "🔑",
  gear: "⚙️", wrench: "🔧", hammer: "🔨", bug: "🐛", package: "📦", memo: "📝",
  pencil: "✏️", book: "📖", books: "📚", bookmark: "🔖", clipboard: "📋",
  calendar: "📅", chart_with_upwards_trend: "📈", computer: "💻", iphone: "📱",
  email: "📧", link: "🔗", pushpin: "📌", paperclip: "📎", mag: "🔍", hourglass: "⏳",
  alarm_clock: "⏰", coffee: "☕", beer: "🍺", pizza: "🍕", check: "✅", cross: "❌",
  sun: "☀️", cloud: "☁️", rainbow: "🌈", snowflake: "❄️", earth_asia: "🌏",
  seedling: "🌱", herb: "🌿", four_leaf_clover: "🍀", maple_leaf: "🍁",
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Keep CJK (U+4E00–U+9FFF) so Chinese headings get real anchors instead of
// collapsing to empty. MUST stay in sync with slugFromText() in viewer.js,
// otherwise in-document links like [x](#中文标题) won't match heading ids.
function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .trim()
      .replace(/[^\w一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

// VitePress vp-doc heading: id + tabindex + hover-reveal header-anchor
function renderHeading(level, rawText, id) {
  const tag = `h${level}`;
  const safeId = escapeHtml(id);
  const plain = rawText.trim();
  const label = escapeHtml(plain).replace(/"/g, "&quot;");
  const anchor = `<a class="header-anchor" href="#${safeId}" aria-label="Permalink to &quot;${label}&quot;">&#8203;</a>`;
  return `<${tag} id="${safeId}" tabindex="-1">${parseInline(plain)} ${anchor}</${tag}>\n`;
}

function parseInline(text) {
  // Protect code spans first
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\x02C${codes.length - 1}\x02`;
  });

  // Protect inline math ($…$) next, so its TeX isn't mangled by escaping or
  // emphasis. Guarded to avoid currency: no space just inside the delimiters,
  // and a closing $ can't be followed by a digit (so "$5 and $10" is left alone).
  const maths = [];
  text = text.replace(
    /(?<![\\$\d])\$(?!\s)((?:\\.|[^$\\])+?)(?<![\s\\])\$(?![\d$])/g,
    (_, tex) => {
      maths.push(`<span class="math-inline" data-tex="${escapeHtml(tex)}"></span>`);
      return `\x02M${maths.length - 1}\x02`;
    },
  );

  // Escape HTML in the non-code parts
  text = escapeHtml(text);

  // Footnote references: [^id] → superscript link (only for ids that have a
  // matching definition; unknown ones are left as literal text).
  if (_footnoteDefs) {
    text = text.replace(/\[\^([^\]]+)\]/g, (m, id) => {
      if (!(id in _footnoteDefs)) return m;
      let idx = _footnoteOrder.indexOf(id);
      if (idx === -1) idx = _footnoteOrder.push(id) - 1;
      const s = slugify(id);
      return `<sup class="footnote-ref"><a href="#fn-${s}" id="fnref-${s}">${idx + 1}</a></sup>`;
    });
  }

  // Emoji shortnames: :smile: → 😄 (unknown names left as literal text).
  text = text.replace(/:([a-z0-9_+-]+):/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(EMOJI, name) ? EMOJI[name] : m,
  );

  // Images (before links) — allow optional whitespace around the URL.
  // The URL may contain balanced parentheses (e.g. Wikipedia links).
  text = text.replace(
    /!\[([^\]]*)\]\(\s*((?:\([^()]*\)|[^()\s"])+)\s*(?:"([^"]*)")?\s*\)/g,
    (_, alt, src, title) => {
      let img = `<img src="${src}" alt="${alt}"`;
      if (title) img += ` title="${title}"`;
      return img + ">";
    },
  );

  // Links. In-document anchors (#…) stay in-page so they scroll to the heading;
  // everything else opens in a new tab.
  text = text.replace(
    /\[([^\]]+)\]\(((?:\([^()]*\)|[^()\s])+)(?:\s+"([^"]*)")?\)/g,
    (_, t, href, title) => {
      let a = `<a href="${href}"`;
      if (title) a += ` title="${title}"`;
      if (href.startsWith("#")) return a + `>${t}</a>`;
      return a + ` target="_blank" rel="noopener noreferrer">${t}</a>`;
    },
  );

  // Bold + italic (order matters: longest first)
  // Asterisk emphasis works anywhere; underscore emphasis only at word
  // boundaries, so identifiers like snake_case_var and underscores inside
  // URLs are left intact (GFM behavior).
  text = text.replace(/\*{3}(.+?)\*{3}/gs, "<strong><em>$1</em></strong>");
  text = text.replace(/(?<!\w)_{3}(.+?)_{3}(?!\w)/gs, "<strong><em>$1</em></strong>");
  text = text.replace(/\*{2}(.+?)\*{2}/gs, "<strong>$1</strong>");
  text = text.replace(/(?<!\w)_{2}(.+?)_{2}(?!\w)/gs, "<strong>$1</strong>");
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  text = text.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Line break (two trailing spaces)
  text = text.replace(/  \n/g, "<br>\n");

  // Restore protected inline math, then code spans
  text = text.replace(/\x02M(\d+)\x02/g, (_, i) => maths[+i]);
  text = text.replace(/\x02C(\d+)\x02/g, (_, i) => codes[+i]);

  return text;
}

function parseMarkdown(src, isRoot = false) {
  src = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let prefix = "";
  // YAML front matter: only at the very top of a document (not inside blockquotes,
  // which re-enter parseMarkdown without isRoot).
  if (isRoot) {
    const fm = src.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (fm) {
      prefix = renderFrontMatter(fm[1]);
      src = src.slice(fm[0].length);
    }
    // Pull footnote definitions (`[^id]: text`) out of the body up front so
    // references can resolve regardless of where the definition sits.
    _footnoteDefs = {};
    _footnoteOrder = [];
    src = src.replace(/^\[\^([^\]]+)\]:[ \t]*(.*)$/gm, (_, id, text) => {
      _footnoteDefs[id] = text;
      return "";
    });
  }
  const lines = src.split("\n");
  let out = prefix + parseBlocks(lines, 0, lines.length);
  if (isRoot) {
    out += renderFootnotes();
    _footnoteDefs = null;
    _footnoteOrder = null;
  }
  return out;
}

// Render the footnote list (in reference order) once the body is parsed.
function renderFootnotes() {
  if (!_footnoteOrder || !_footnoteOrder.length) return "";
  const items = _footnoteOrder
    .map((id) => {
      const s = slugify(id);
      const body = parseInline(_footnoteDefs[id] || "");
      return `<li id="fn-${s}">${body} <a href="#fnref-${s}" class="footnote-backref" aria-label="返回正文">↩</a></li>`;
    })
    .join("\n");
  return `<hr class="footnotes-sep">\n<section class="footnotes"><ol>\n${items}\n</ol></section>\n`;
}

// Render a leading YAML block as a compact metadata card. This is a deliberately
// small YAML subset (key: value, plus `- item` lists and inline [a, b] arrays) —
// enough for the front matter people actually write in notes.
function renderFrontMatter(yaml) {
  const rows = [];
  let curKey = null,
    listVals = null;
  const flushList = () => {
    if (curKey && listVals && listVals.length) {
      rows.push([curKey, listVals.join("、")]);
    }
    curKey = null;
    listVals = null;
  };
  const clean = (v) => v.trim().replace(/^["']|["']$/g, "");

  for (const raw of yaml.split("\n")) {
    if (raw.trim() === "") continue;
    const item = raw.match(/^\s*-\s+(.*)$/);
    if (item && curKey) {
      (listVals = listVals || []).push(clean(item[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    flushList();
    const key = kv[1];
    let val = kv[2].trim();
    if (val === "") {
      curKey = key;
      listVals = [];
      continue;
    } // value on following list lines
    const arr = val.match(/^\[(.*)\]$/);
    val = arr
      ? arr[1].split(",").map(clean).filter(Boolean).join("、")
      : clean(val);
    rows.push([key, val]);
  }
  flushList();
  if (!rows.length) return "";

  const body = rows
    .map(
      ([k, v]) =>
        `<div class="fm-row"><span class="fm-key">${escapeHtml(k)}</span><span class="fm-val">${escapeHtml(v)}</span></div>`,
    )
    .join("");
  return `<div class="front-matter">${body}</div>\n`;
}

function parseBlocks(lines, start, end) {
  let html = "";
  let i = start;

  while (i < end) {
    const line = lines[i];

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    const fenceM = line.match(/^(`{3,}|~{3,})([\w-]*)/);
    if (fenceM) {
      const fence = fenceM[1],
        lang = fenceM[2] || "";
      let code = "";
      i++;
      while (i < end && !lines[i].startsWith(fence)) {
        code += lines[i] + "\n";
        i++;
      }
      i++; // closing fence
      const body = code.replace(/\n$/, "");
      // Mermaid diagrams: keep the raw source for the renderer (no highlighting).
      if (lang.toLowerCase() === "mermaid") {
        html += `<pre class="mermaid">${escapeHtml(body)}</pre>\n`;
        continue;
      }
      const cls = lang ? ` class="language-${lang}"` : "";
      const highlighted = lang
        ? syntaxHighlight(escapeHtml(body), lang)
        : escapeHtml(body);
      html += `<pre><code${cls}>${highlighted}</code></pre>\n`;
      continue;
    }

    // Block math: $$ … $$ (single line or fenced across lines).
    if (line.trim().startsWith("$$")) {
      const t = line.trim();
      const single = t.match(/^\$\$([\s\S]+?)\$\$$/);
      if (single) {
        html += `<div class="math-block" data-tex="${escapeHtml(single[1].trim())}"></div>\n`;
        i++;
        continue;
      }
      if (t === "$$") {
        let tex = "";
        i++;
        while (i < end && lines[i].trim() !== "$$") {
          tex += lines[i] + "\n";
          i++;
        }
        i++; // closing $$
        html += `<div class="math-block" data-tex="${escapeHtml(tex.replace(/\n$/, ""))}"></div>\n`;
        continue;
      }
    }

    // Custom container (VitePress style): ::: tip / info / warning / danger / details
    const contM = line.match(
      /^:::\s*(tip|info|warning|danger|details)\s*(.*)$/i,
    );
    if (contM) {
      const type = contM[1].toLowerCase();
      const title = contM[2].trim();
      const inner = [];
      i++;
      while (i < end && !/^:::\s*$/.test(lines[i])) {
        inner.push(lines[i]);
        i++;
      }
      i++; // closing :::
      const body = parseMarkdown(inner.join("\n"));
      const defaultTitles = {
        tip: "TIP",
        info: "INFO",
        warning: "WARNING",
        danger: "DANGER",
        details: "详情",
      };
      const label = title || defaultTitles[type];
      if (type === "details") {
        html += `<details class="details custom-block"><summary>${parseInline(label)}</summary>\n${body}</details>\n`;
      } else {
        html += `<div class="${type} custom-block"><p class="custom-block-title">${parseInline(label)}</p>\n${body}</div>\n`;
      }
      continue;
    }

    // ATX heading
    const hM = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (hM) {
      const level = hM[1].length;
      const text = hM[2].trim();
      html += renderHeading(level, text, slugify(text));
      i++;
      continue;
    }

    // Setext heading
    if (i + 1 < end) {
      if (/^=+\s*$/.test(lines[i + 1])) {
        html += renderHeading(1, line, slugify(line));
        i += 2;
        continue;
      }
      if (/^-{2,}\s*$/.test(lines[i + 1]) && !/^\s*[-*+]\s/.test(line)) {
        html += renderHeading(2, line, slugify(line));
        i += 2;
        continue;
      }
    }

    // Horizontal rule
    if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(line.trim())) {
      html += "<hr>\n";
      i++;
      continue;
    }

    // Raw HTML blocks (GFM allows block-level HTML; READMEs often use <table>).
    const htmlBlock = tryParseHtmlBlock(lines, i, end);
    if (htmlBlock) {
      html += htmlBlock.html;
      i = htmlBlock.next;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines = [];
      while (
        i < end &&
        (lines[i].startsWith(">") ||
          (lines[i].trim() !== "" && quoteLines.length > 0))
      ) {
        if (lines[i].startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
        } else if (lines[i].trim() === "") {
          quoteLines.push("");
        } else {
          break;
        }
        i++;
      }
      html += `<blockquote>\n${parseMarkdown(quoteLines.join("\n"))}</blockquote>\n`;
      continue;
    }

    // List
    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const r = parseList(lines, i, end);
      html += r.html;
      i = r.next;
      continue;
    }

    // Table
    if (
      line.includes("|") &&
      i + 1 < end &&
      /^\s*\|?[\s:-]+\|/.test(lines[i + 1])
    ) {
      const r = parseTable(lines, i, end);
      html += r.html;
      i = r.next;
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (i < end) {
      const ln = lines[i];
      if (ln.trim() === "") break;
      if (/^#{1,6}\s/.test(ln) || /^(`{3,}|~{3,})/.test(ln)) break;
      if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(ln.trim()))
        break;
      if (ln.startsWith(">")) break;
      if (/^\s*[-*+]\s/.test(ln) || /^\s*\d+\.\s/.test(ln)) break;
      if (
        ln.includes("|") &&
        i + 1 < end &&
        /^\s*\|?[\s:-]+\|/.test(lines[i + 1])
      )
        break;
      paraLines.push(ln);
      i++;
    }
    if (paraLines.length > 0) {
      html += `<p>${parseInline(paraLines.join("\n"))}</p>\n`;
    }
  }

  return html;
}

// Pass through common block-level HTML (tables, anchor targets, etc.).
function tryParseHtmlBlock(lines, startI, endI) {
  const trimmed = lines[startI].trim();
  if (!trimmed.startsWith("<")) return null;

  // Single-line anchor: <a id="..."></a>
  if (/^<a\s[\s\S]*>\s*<\/a>\s*$/i.test(trimmed)) {
    return { html: trimmed + "\n", next: startI + 1 };
  }

  const openM = trimmed.match(/^<([a-z][\w-]*)\b/i);
  if (!openM) return null;

  const rootTag = openM[1].toLowerCase();
  const blockTags = new Set([
    "table",
    "div",
    "section",
    "article",
    "details",
    "figure",
  ]);
  if (!blockTags.has(rootTag)) return null;

  let html = "";
  let depth = 0;
  let i = startI;
  const openRe = new RegExp(`<${rootTag}(?:\\s[^>]*)?>`, "gi");
  const closeRe = new RegExp(`</${rootTag}>`, "gi");

  while (i < endI) {
    const ln = lines[i];
    html += ln + "\n";
    depth += [...ln.matchAll(openRe)].length;
    depth -= [...ln.matchAll(closeRe)].length;
    i++;
    if (depth <= 0) break;
  }

  if (depth > 0) return null;
  return { html, next: i };
}

function parseList(lines, startI, endI) {
  const firstLine = lines[startI];
  const baseIndent = (firstLine.match(/^(\s*)/) || ["", ""])[1].length;
  const isOrdered = /^\s*\d+\.\s/.test(firstLine);
  const tag = isOrdered ? "ol" : "ul";

  // Honour a non-1 starting number on ordered lists (e.g. `3.` → <ol start="3">).
  let openTag = `<${tag}>`;
  if (isOrdered) {
    const startNum = parseInt(firstLine.match(/^\s*(\d+)\.\s/)[1], 10);
    if (startNum !== 1) openTag = `<ol start="${startNum}">`;
  }

  let html = `${openTag}\n`;
  let i = startI;

  while (i < endI) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (indent < baseIndent) break;

    const ulM = line.match(/^\s*[-*+]\s+(.*)/);
    const olM = line.match(/^\s*\d+\.\s+(.*)/);

    if (indent === baseIndent && (ulM || olM)) {
      const rawContent = (ulM || olM)[1];
      const taskM = rawContent.match(/^\[([ xX])\]\s+(.*)/);
      const content = taskM ? taskM[2] : rawContent;

      // Collect continuation and nested lines
      const itemLines = [content];
      i++;
      while (i < endI) {
        const nl = lines[i];
        if (nl.trim() === "") {
          // Continue only if next non-empty is indented deeper
          let j = i + 1;
          while (j < endI && lines[j].trim() === "") j++;
          if (j < endI) {
            const ni = (lines[j].match(/^(\s*)/) || ["", ""])[1].length;
            if (ni > baseIndent) {
              i++;
              continue;
            }
          }
          break;
        }
        const ni = (nl.match(/^(\s*)/) || ["", ""])[1].length;
        if (
          ni <= baseIndent &&
          (/^\s*[-*+]\s/.test(nl) || /^\s*\d+\.\s/.test(nl))
        )
          break;
        if (ni > baseIndent) {
          itemLines.push(nl);
          i++;
        } else break;
      }

      // Render the item body. A bare single-line item is just inline content;
      // anything with continuation lines (nested lists, fenced code, …) is
      // dedented and run through the block parser so structure survives.
      let itemHtml;
      const rest = itemLines.slice(1);
      if (!rest.some((l) => l.trim() !== "")) {
        itemHtml = parseInline(itemLines[0].trim());
      } else {
        const cut = Math.min(
          ...rest
            .filter((l) => l.trim() !== "")
            .map((l) => (l.match(/^(\s*)/) || ["", ""])[1].length),
        );
        const dedented = rest.map((l) =>
          l.length >= cut ? l.slice(cut) : l.replace(/^\s+/, ""),
        );
        const src = itemLines[0].trim() + "\n" + dedented.join("\n");
        itemHtml = parseMarkdown(src).trim();

        // Keep tight-list rendering: drop the paragraph wrapper around the
        // item's leading text so simple items don't gain block spacing.
        if (
          itemHtml.startsWith("<p>") &&
          itemHtml.endsWith("</p>") &&
          itemHtml.indexOf("</p>") === itemHtml.length - 4 &&
          itemHtml.indexOf("<p>", 3) === -1
        ) {
          itemHtml = itemHtml.slice(3, -4);
        } else if (itemHtml.startsWith("<p>")) {
          const end = itemHtml.indexOf("</p>");
          itemHtml =
            itemHtml.slice(3, end) + "\n" + itemHtml.slice(end + 4).replace(/^\s+/, "");
        }
      }

      if (taskM) {
        const checked = taskM[1].toLowerCase() === "x" ? " checked" : "";
        html += `<li class="task-item"><input type="checkbox"${checked} disabled> ${itemHtml}</li>\n`;
      } else {
        html += `<li>${itemHtml}</li>\n`;
      }
    } else if (indent > baseIndent) {
      i++; // orphaned nested line, skip
    } else {
      break;
    }
  }

  html += `</${tag}>\n`;
  return { html, next: i };
}

function parseTable(lines, startI, endI) {
  let i = startI;

  const headers = splitTableRow(lines[i]);
  i++;
  const aligns = splitTableRow(lines[i]).map((c) => {
    c = c.trim();
    if (c.startsWith(":") && c.endsWith(":")) return "center";
    if (c.endsWith(":")) return "right";
    return "left";
  });
  i++;

  let html = "<table>\n<thead>\n<tr>";
  headers.forEach((h, idx) => {
    html += `<th align="${aligns[idx] || "left"}">${parseInline(h)}</th>`;
  });
  html += "</tr>\n</thead>\n<tbody>\n";

  while (i < endI && lines[i].trim() !== "" && lines[i].includes("|")) {
    const cells = splitTableRow(lines[i]);
    html += "<tr>";
    cells.forEach((c, idx) => {
      html += `<td align="${aligns[idx] || "left"}">${parseInline(c)}</td>`;
    });
    html += "</tr>\n";
    i++;
  }

  html += "</tbody>\n</table>\n";
  return { html, next: i };
}

function splitTableRow(line) {
  // Split on unescaped pipes only; a `\|` is a literal pipe inside a cell.
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

// Basic syntax highlighting for common languages
function syntaxHighlight(code, lang) {
  const l = lang.toLowerCase();

  const keywords = {
    js: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|async|await|try|catch|finally|typeof|instanceof|null|undefined|true|false|void|delete|in|of|throw)\b/g,
    ts: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|async|await|try|catch|finally|typeof|instanceof|null|undefined|true|false|void|delete|in|of|throw|interface|type|enum|implements|declare|namespace|module|abstract|readonly|private|protected|public)\b/g,
    py: /\b(def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|with|lambda|None|True|False|pass|break|continue|raise|yield|async|await|global|nonlocal|del)\b/g,
    go: /\b(func|package|import|var|const|type|struct|interface|return|if|else|for|range|switch|case|default|break|continue|defer|go|chan|map|nil|true|false|make|new|len|cap|append|delete|panic|recover)\b/g,
    java: /\b(public|private|protected|static|final|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|import|package|void|null|true|false|this|super|abstract|native|synchronized|volatile|transient)\b/g,
    bash: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|echo|read|local|export|source|cd|pwd|ls|mkdir|rm|cp|mv)\b/g,
    css: /\b(important)\b/g,
    sql: /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|DATABASE|SCHEMA|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|NOT|NULL|DEFAULT|AS|AND|OR|IN|EXISTS|LIKE|BETWEEN|LIMIT|OFFSET|UNION|ALL)\b/gi,
  };

  const langMap = {
    javascript: "js",
    jsx: "js",
    typescript: "ts",
    tsx: "ts",
    python: "py",
    golang: "go",
    shell: "bash",
    sh: "bash",
  };
  const key = langMap[l] || l;

  if (!keywords[key]) return code;

  // `code` arrives HTML-escaped, so `"` is `&quot;`, `<` is `&lt;`, etc.
  // Protect strings and comments behind placeholders BEFORE running the
  // number/keyword passes — otherwise a keyword like `class` matches inside
  // the `<span class="tok-…">` tags we insert and corrupts the markup.
  // Placeholders are single Private-Use-Area code points so the number and
  // keyword passes (which key off `\b` and `\d`) can never match inside them.
  const stash = [];
  const protect = (html) => String.fromCharCode(0xe000 + stash.push(html) - 1);

  // Strings: single-quoted, backtick, and escaped double-quoted (&quot;…&quot;)
  code = code.replace(
    /(&quot;)((?:\\.|(?!&quot;).)*?)(&quot;)|(['`])((?:\\.|(?!\4).)*?)\4/g,
    (m) => protect(`<span class="tok-str">${m}</span>`),
  );

  // Block comments
  code = code.replace(/(\/\*[\s\S]*?\*\/)/g, (m) =>
    protect(`<span class="tok-cmt">${m}</span>`),
  );

  // Line comments — `//` everywhere; `#` only for py/bash
  code = code.replace(/\/\/[^\n]*/g, (m) =>
    protect(`<span class="tok-cmt">${m}</span>`),
  );
  if (key === "py" || key === "bash") {
    code = code.replace(/#[^\n]*/g, (m) =>
      protect(`<span class="tok-cmt">${m}</span>`),
    );
  }

  // Numbers (protected so the keyword pass can't match `class` inside the
  // inserted span), then keywords last.
  code = code.replace(/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, (m) =>
    protect(`<span class="tok-num">${m}</span>`),
  );
  code = code.replace(keywords[key], '<span class="tok-kw">$1</span>');

  // Restore protected regions
  return code.replace(
    /[\uE000-\uF8FF]/g,
    (ch) => stash[ch.charCodeAt(0) - 0xe000],
  );
}
