// Markdown to HTML parser — GFM compatible

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

  // Escape HTML in the non-code parts
  text = escapeHtml(text);

  // Images (before links) — allow optional whitespace around the URL
  text = text.replace(
    /!\[([^\]]*)\]\(\s*([^)\s"]+)\s*(?:"([^"]*)")?\s*\)/g,
    (_, alt, src, title) => {
      let img = `<img src="${src}" alt="${alt}"`;
      if (title) img += ` title="${title}"`;
      return img + ">";
    },
  );

  // Links. In-document anchors (#…) stay in-page so they scroll to the heading;
  // everything else opens in a new tab.
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, t, href, title) => {
      let a = `<a href="${href}"`;
      if (title) a += ` title="${title}"`;
      if (href.startsWith("#")) return a + `>${t}</a>`;
      return a + ` target="_blank" rel="noopener noreferrer">${t}</a>`;
    },
  );

  // Bold + italic (order matters: longest first)
  text = text.replace(/\*{3}(.+?)\*{3}/gs, "<strong><em>$1</em></strong>");
  text = text.replace(/_{3}(.+?)_{3}/gs, "<strong><em>$1</em></strong>");
  text = text.replace(/\*{2}(.+?)\*{2}/gs, "<strong>$1</strong>");
  text = text.replace(/_{2}(.+?)_{2}/gs, "<strong>$1</strong>");
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  text = text.replace(/_([^_\n]+)_/g, "<em>$1</em>");

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Line break (two trailing spaces)
  text = text.replace(/  \n/g, "<br>\n");

  // Restore code spans
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
  }
  const lines = src.split("\n");
  return prefix + parseBlocks(lines, 0, lines.length);
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
      const cls = lang ? ` class="language-${lang}"` : "";
      const highlighted = lang
        ? syntaxHighlight(escapeHtml(code.replace(/\n$/, "")), lang)
        : escapeHtml(code.replace(/\n$/, ""));
      html += `<pre><code${cls}>${highlighted}</code></pre>\n`;
      continue;
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

function parseList(lines, startI, endI) {
  const firstLine = lines[startI];
  const baseIndent = (firstLine.match(/^(\s*)/) || ["", ""])[1].length;
  const isOrdered = /^\s*\d+\.\s/.test(firstLine);
  const tag = isOrdered ? "ol" : "ul";

  let html = `<${tag}>\n`;
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

      // Split inline content vs nested lists
      let nestedStart = -1;
      for (let k = 1; k < itemLines.length; k++) {
        if (
          /^\s*[-*+]\s/.test(itemLines[k]) ||
          /^\s*\d+\.\s/.test(itemLines[k])
        ) {
          nestedStart = k;
          break;
        }
      }

      let itemHtml;
      if (nestedStart > 0) {
        const textPart = parseInline(
          itemLines.slice(0, nestedStart).join(" ").trim(),
        );
        const nestedLines = itemLines.slice(nestedStart);
        const nr = parseList(nestedLines, 0, nestedLines.length);
        itemHtml = textPart + "\n" + nr.html;
      } else {
        itemHtml = parseInline(itemLines.join(" ").trim());
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
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
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
