// Markdown → Confluence Wiki Markup converter.
//
// Produces the lightweight markup you paste into Confluence via
// "+ Insert → Markup → Confluence Wiki". Operates on the raw Markdown source
// (not the rendered HTML) so code blocks, tables and lists survive intact.
//
// Exposed as a global `mdToConfluence(src)` for the viewer; also importable in
// Node for tests (no DOM / browser globals used).

(function (root) {
  // ── Inline spans ──────────────────────────────────────────────────
  function inline(text) {
    const stash = [];
    const hold = (s) => `\x00${stash.push(s) - 1}\x00`;

    // Inline code → {{code}} (protected first so its content isn't touched).
    text = text.replace(/`([^`]+)`/g, (_, c) => hold(`{{${c}}}`));

    // Images → !src!  (before links).
    text = text.replace(
      /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g,
      (_, _alt, src) => hold(`!${src}!`),
    );

    // Links → [text|url]; in-page anchors keep just their text.
    text = text.replace(
      /\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g,
      (_, t, url) => (url.startsWith("#") ? hold(t) : hold(`[${t}|${url}]`)),
    );

    // Emphasis. Confluence: *bold*, _italic_, *_bold italic_*, -strike-.
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, (_, c) => hold(`*_${c}_*`));
    text = text.replace(/(?<!\w)___(.+?)___(?!\w)/g, (_, c) => hold(`*_${c}_*`));
    text = text.replace(/\*\*(.+?)\*\*/g, (_, c) => hold(`*${c}*`));
    text = text.replace(/(?<!\w)__(.+?)__(?!\w)/g, (_, c) => hold(`*${c}*`));
    text = text.replace(/\*(.+?)\*/g, (_, c) => hold(`_${c}_`));
    text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, (_, c) => hold(`_${c}_`));
    text = text.replace(/~~(.+?)~~/g, (_, c) => hold(`-${c}-`));

    // Restore protected spans. Tokens can nest (e.g. a link inside bold), and a
    // single replace pass doesn't re-scan its own output, so loop until stable.
    let guard = 0;
    while (/\x00\d+\x00/.test(text) && guard++ < 50) {
      text = text.replace(/\x00(\d+)\x00/g, (_, i) => stash[+i] ?? "");
    }
    return text;
  }

  function splitRow(line) {
    return line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, "|"));
  }

  // ── Block structure ───────────────────────────────────────────────
  function mdToConfluence(src) {
    src = src.replace(/\r\n?/g, "\n");
    const out = [];

    // YAML front matter → an {info} panel of key/value lines.
    const fm = src.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (fm) {
      const meta = fm[1].split("\n").filter((l) => l.trim());
      if (meta.length) out.push(`{info}\n${meta.join("\n")}\n{info}`, "");
      src = src.slice(fm[0].length);
    }

    const L = src.split("\n");
    let i = 0;

    while (i < L.length) {
      const line = L[i];

      if (!line.trim()) {
        out.push("");
        i++;
        continue;
      }

      // Fenced code block → {code:lang} … {code}
      let m = line.match(/^\s*(`{3,}|~{3,})(\w*)/);
      if (m) {
        const lang = m[2];
        i++;
        const buf = [];
        while (i < L.length && !/^\s*(`{3,}|~{3,})\s*$/.test(L[i])) {
          buf.push(L[i]);
          i++;
        }
        i++; // closing fence
        out.push(lang ? `{code:${lang}}` : "{code}");
        out.push(buf.join("\n"));
        out.push("{code}");
        continue;
      }

      // ATX heading → h1. … h6.
      m = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
      if (m) {
        out.push(`h${m[1].length}. ${inline(m[2].trim())}`);
        i++;
        continue;
      }

      // Setext headings
      if (i + 1 < L.length && /^=+\s*$/.test(L[i + 1])) {
        out.push(`h1. ${inline(line.trim())}`);
        i += 2;
        continue;
      }
      if (
        i + 1 < L.length &&
        /^-{2,}\s*$/.test(L[i + 1]) &&
        !/^\s*[-*+]\s/.test(line)
      ) {
        out.push(`h2. ${inline(line.trim())}`);
        i += 2;
        continue;
      }

      // Horizontal rule
      if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
        out.push("----");
        i++;
        continue;
      }

      // Blockquote → {quote} … {quote}
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < L.length && /^\s*>/.test(L[i])) {
          buf.push(L[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        out.push("{quote}", inline(buf.join("\n")), "{quote}");
        continue;
      }

      // Table → || header || + | rows |
      if (
        line.includes("|") &&
        i + 1 < L.length &&
        /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(L[i + 1])
      ) {
        out.push("|| " + splitRow(line).map(inline).join(" || ") + " ||");
        i += 2; // header + separator
        while (i < L.length && L[i].includes("|") && L[i].trim()) {
          out.push(
            "| " +
              splitRow(L[i])
                .map((c) => inline(c) || " ")
                .join(" | ") +
              " |",
          );
          i++;
        }
        continue;
      }

      // Lists (ordered/unordered/task). Confluence nests by repeating the
      // bullet/number char: *, **, ***  /  #, ##, ###
      if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
        while (i < L.length && /^\s*([-*+]|\d+\.)\s/.test(L[i])) {
          const lm = L[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
          const depth = Math.floor(lm[1].length / 2) + 1;
          const ordered = /\d+\./.test(lm[2]);
          let content = lm[3];
          const task = content.match(/^\[([ xX])\]\s+(.*)$/);
          if (task) {
            // Confluence emoticons: (/) checked, (x) unchecked.
            content = (task[1].toLowerCase() === "x" ? "(/) " : "(x) ") + task[2];
            out.push(`${"*".repeat(depth)} ${inline(content)}`);
          } else {
            out.push(`${(ordered ? "#" : "*").repeat(depth)} ${inline(content)}`);
          }
          i++;
        }
        continue;
      }

      // Paragraph
      const buf = [];
      while (
        i < L.length &&
        L[i].trim() &&
        !/^(#{1,6}\s|\s*>|\s*(`{3,}|~{3,}))/.test(L[i]) &&
        !/^\s*([-*+]|\d+\.)\s/.test(L[i])
      ) {
        buf.push(L[i]);
        i++;
      }
      out.push(inline(buf.join("\n")));
    }

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  root.mdToConfluence = mdToConfluence;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { mdToConfluence };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
