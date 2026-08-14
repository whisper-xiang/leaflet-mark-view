// HTML <table> block extractor + grid model.
// Shared by Confluence export and HTML copy. No DOM — works in Node tests.
//
// Exposed as global `HtmlTable`.

(function (root) {
  function isLineStart(src, i) {
    return i === 0 || src[i - 1] === "\n" || src[i - 1] === "\r";
  }

  function matchFence(src, i) {
    let j = i;
    let spaces = 0;
    while (j < src.length && src[j] === " " && spaces < 3) {
      j++;
      spaces++;
    }
    const ch = src[j];
    if (ch !== "`" && ch !== "~") return null;
    let len = 0;
    while (src[j + len] === ch) len++;
    if (len < 3) return null;
    let k = j + len;
    while (k < src.length && src[k] !== "\n") k++;
    return { char: ch, len, end: k < src.length ? k + 1 : k };
  }

  function findTableEnd(src, start) {
    const re = /<\/?table\b[^>]*>/gi;
    re.lastIndex = start;
    let depth = 0;
    let m;
    while ((m = re.exec(src))) {
      if (/^<\//.test(m[0])) {
        depth--;
        if (depth === 0) return m.index + m[0].length;
      } else {
        depth++;
      }
    }
    return -1;
  }

  function extractBlocks(src) {
    src = String(src || "");
    const blocks = [];
    const n = src.length;
    let i = 0;
    let fence = null;

    while (i < n) {
      if (isLineStart(src, i)) {
        const f = matchFence(src, i);
        if (f) {
          if (!fence) fence = f;
          else if (f.char === fence.char && f.len >= fence.len) fence = null;
          i = f.end;
          continue;
        }
      }
      if (fence) {
        i++;
        continue;
      }

      if (
        src.slice(i, i + 6).toLowerCase() === "<table" &&
        /[\s>/]/.test(src[i + 6] || ">")
      ) {
        const end = findTableEnd(src, i);
        if (end > i) {
          blocks.push({ start: i, end, html: src.slice(i, end) });
          i = end;
          continue;
        }
      }
      i++;
    }
    return blocks;
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
        String.fromCharCode(parseInt(n, 16)),
      );
  }

  function attrInt(tag, name) {
    const m = tag.match(new RegExp(name + "\\s*=\\s*[\"']?(\\d+)", "i"));
    const n = m ? parseInt(m[1], 10) : 1;
    return n > 0 ? n : 1;
  }

  function stripTags(html) {
    return decodeEntities(String(html).replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function htmlInlineToCf(html) {
    let s = String(html);
    s = s.replace(/<br\s*\/?>/gi, "\\\\ ");
    s = s.replace(/<\/p>\s*<p\b[^>]*>/gi, "\\\\ ");
    s = s.replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, "*$1*");
    s = s.replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "*$1*");
    s = s.replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "_$1_");
    s = s.replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, "_$1_");
    s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "{{$1}}");
    s = s.replace(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, text) =>
        href.startsWith("#") ? text : `[${stripTags(text) || href}|${href}]`,
    );
    const text = stripTags(s);
    return text || " ";
  }

  // Inner nested tables would leak their td/th into the parent row parser.
  function maskNestedTables(html) {
    return html.replace(/<table\b[\s\S]*?<\/table>/gi, "<!--nested-table-->");
  }

  function rowInThead(inner, rowIndex) {
    const before = inner.slice(0, rowIndex).toLowerCase();
    const thead = before.lastIndexOf("<thead");
    const theadClose = before.lastIndexOf("</thead");
    const tbody = before.lastIndexOf("<tbody");
    return thead > theadClose && thead > tbody;
  }

  function parse(html) {
    html = String(html || "");
    const outer = html.match(/<table\b[^>]*>([\s\S]*)<\/table>/i);
    let inner = outer ? outer[1] : html;
    inner = maskNestedTables(inner);

    const rowHtmls = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const parsedRows = rowHtmls.map((rowMatch) => {
      const chunk = rowMatch[1];
      const inThead = rowInThead(inner, rowMatch.index);
      const cells = [
        ...chunk.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi),
      ].map((m) => ({
        header: m[1].toLowerCase() === "th" || inThead,
        rowspan: attrInt(m[2], "rowspan"),
        colspan: attrInt(m[2], "colspan"),
        html: m[3],
        text: stripTags(m[3]),
        cf: htmlInlineToCf(m[3]),
      }));
      return { cells };
    });

    // Fallback: no <tr> but there are cells (rare malformed tables).
    if (!parsedRows.length) {
      const cells = [
        ...inner.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi),
      ].map((m) => ({
        header: m[1].toLowerCase() === "th",
        rowspan: attrInt(m[2], "rowspan"),
        colspan: attrInt(m[2], "colspan"),
        html: m[3],
        text: stripTags(m[3]),
        cf: htmlInlineToCf(m[3]),
      }));
      if (cells.length) parsedRows.push({ cells });
    }

    const grid = [];
    let r = 0;
    for (const row of parsedRows) {
      grid[r] = grid[r] || [];
      let c = 0;
      for (const cell of row.cells) {
        while (grid[r][c]) c++;
        cell.row = r;
        cell.col = c;
        for (let dr = 0; dr < cell.rowspan; dr++) {
          grid[r + dr] = grid[r + dr] || [];
          for (let dc = 0; dc < cell.colspan; dc++) {
            grid[r + dr][c + dc] =
              dr === 0 && dc === 0 ? cell : { occupied: true };
          }
        }
        c += cell.colspan;
      }
      r++;
    }

    const colCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
    return { rows: parsedRows, grid, colCount, html };
  }

  function formatRow(gridRow, asHeader) {
    const sep = asHeader ? "||" : "|";
    let s = sep;
    for (const slot of gridRow) {
      if (!slot || slot.occupied) continue;
      const bits = [];
      if (slot.colspan > 1) bits.push("colspan=" + slot.colspan);
      if (slot.rowspan > 1) bits.push("rowspan=" + slot.rowspan);
      const body = String(slot.cf || slot.text || " ").replace(/\|/g, "\\|");
      if (bits.length) s += bits.join(",") + "|" + body + sep;
      else s += " " + body + " " + sep;
    }
    return s;
  }

  function toConfluence(model) {
    if (!model || !model.grid || !model.grid.length) {
      const raw = (model && model.html) || "";
      return raw ? "{code:html}\n" + raw.trim() + "\n{code}" : "";
    }
    const lines = [];
    model.grid.forEach((gridRow, r) => {
      const origins = gridRow.filter((s) => s && !s.occupied);
      const asHeader =
        origins.length > 0 && origins.every((s) => s.header) && r === 0;
      lines.push(formatRow(gridRow, asHeader));
    });
    return lines.join("\n");
  }

  root.HtmlTable = {
    extractBlocks,
    parse,
    toConfluence,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.HtmlTable;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
