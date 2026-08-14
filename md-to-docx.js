// Markdown → .docx（OOXML）。从源码转换，不走渲染 HTML。
// 无第三方依赖：ZIP 使用 STORE（无压缩），Word / WPS / Pages 均可打开。
//
// 导出：mdToDocx(src) → Uint8Array
//       mdToDocxXml(src) → word/document.xml（测试用）
//       mdToDocxSummary(src) → { headings, tables, codeBlocks, images }

(function (root) {
  function utf8(str) {
    str = String(str);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(str, "utf8"));
    const out = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return Uint8Array.from(out);
  }

  function xml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function wt(text) {
    const t = String(text);
    const space = /^\s|\s$/.test(t) ? ' xml:space="preserve"' : "";
    return `<w:t${space}>${xml(t)}</w:t>`;
  }

  // ── ZIP STORE ────────────────────────────────────────────────────
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) {
      c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    return [n & 0xff, (n >>> 8) & 0xff];
  }
  function u32(n) {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  }

  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = utf8(f.name);
      const data = f.data instanceof Uint8Array ? f.data : utf8(f.data);
      const crc = crc32(data);
      const local = [
        0x50, 0x4b, 0x03, 0x04,
        20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(name.length),
        0, 0,
      ];
      const localU8 = new Uint8Array(local.length + name.length + data.length);
      localU8.set(local, 0);
      localU8.set(name, local.length);
      localU8.set(data, local.length + name.length);
      locals.push(localU8);

      const central = [
        0x50, 0x4b, 0x01, 0x02,
        20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(name.length),
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ...u32(offset),
      ];
      const centralU8 = new Uint8Array(central.length + name.length);
      centralU8.set(central, 0);
      centralU8.set(name, central.length);
      centrals.push(centralU8);
      offset += localU8.length;
    }
    const centralSize = centrals.reduce((n, x) => n + x.length, 0);
    const eocd = new Uint8Array([
      0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0,
      ...u16(files.length),
      ...u16(files.length),
      ...u32(centralSize),
      ...u32(offset),
      0, 0,
    ]);
    const out = new Uint8Array(offset + centralSize + eocd.length);
    let p = 0;
    for (const x of locals) {
      out.set(x, p);
      p += x.length;
    }
    for (const x of centrals) {
      out.set(x, p);
      p += x.length;
    }
    out.set(eocd, p);
    return out;
  }

  // ── Runs ─────────────────────────────────────────────────────────
  function run(text, opts) {
    if (text == null || text === "") return "";
    const pr = [];
    if (opts && opts.bold) pr.push("<w:b/><w:bCs/>");
    if (opts && opts.italic) pr.push("<w:i/><w:iCs/>");
    if (opts && opts.strike) pr.push("<w:strike/>");
    if (opts && opts.highlight) {
      pr.push(`<w:highlight w:val="${opts.highlight}"/>`);
    }
    if (opts && opts.code) {
      pr.push(
        '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/>',
      );
      pr.push('<w:sz w:val="20"/><w:szCs w:val="20"/>');
      pr.push('<w:shd w:val="clear" w:fill="F5F5F5"/>');
    }
    if (opts && opts.color) pr.push(`<w:color w:val="${opts.color}"/>`);
    if (opts && opts.underline) pr.push('<w:u w:val="single"/>');
    const rPr = pr.length ? `<w:rPr>${pr.join("")}</w:rPr>` : "";
    return `<w:r>${rPr}${wt(text)}</w:r>`;
  }

  function hyperlink(text, rid) {
    return (
      `<w:hyperlink r:id="${rid}" w:history="1">` +
      run(text, { color: "0563C1", underline: true }) +
      `</w:hyperlink>`
    );
  }

  function inlineRuns(text, rels) {
    const stash = [];
    const hold = (xmlFrag) => {
      stash.push(xmlFrag);
      return `\x00${stash.length - 1}\x00`;
    };

    let s = String(text);
    s = s.replace(/`([^`]+)`/g, (_, c) => hold(run(c, { code: true })));
    s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, alt, src) => {
      rels.images++;
      const label = alt ? `图片：${alt}` : "图片";
      if (/^https?:/i.test(src)) {
        const id = rels.add(src);
        return hold(run(label + " ") + hyperlink(src, id));
      }
      return hold(run(`${label}（${src}）`));
    });
    s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, t, url) => {
      if (url.startsWith("#")) return hold(run(t));
      if (/^https?:/i.test(url)) return hold(hyperlink(t, rels.add(url)));
      return hold(run(t));
    });
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, (_, c) =>
      hold(run(c, { highlight: "yellow", italic: true })),
    );
    s = s.replace(/\*\*([^*]+)\*\*/g, (_, c) =>
      hold(run(c, { highlight: "yellow" })),
    );
    s = s.replace(/\uFF0A\uFF0A([^\uFF0A]+)\uFF0A\uFF0A/g, (_, c) =>
      hold(run(c, { highlight: "yellow" })),
    );
    s = s.replace(/(?<!\w)__(.+?)__(?!\w)/g, (_, c) => hold(run(c, { bold: true })));
    s = s.replace(/\*(.+?)\*/g, (_, c) => hold(run(c, { italic: true })));
    s = s.replace(/(?<!\w)_(.+?)_(?!\w)/g, (_, c) => hold(run(c, { italic: true })));
    s = s.replace(/~~(.+?)~~/g, (_, c) => hold(run(c, { strike: true })));

    const out = [];
    const re = /\x00(\d+)\x00/g;
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(run(s.slice(last, m.index)));
      out.push(stash[+m[1]] || "");
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push(run(s.slice(last)));
    return out.join("") || run("");
  }

  function p(runs, style, extraPr) {
    const pPr =
      `<w:pPr>` +
      (style ? `<w:pStyle w:val="${style}"/>` : "") +
      (extraPr || "") +
      `</w:pPr>`;
    return `<w:p>${pPr}${runs}</w:p>`;
  }

  // ── Tables ───────────────────────────────────────────────────────
  function cellOrigin(grid, r, c) {
    const slot = grid[r] && grid[r][c];
    if (!slot) return null;
    if (!slot.occupied) return slot;
    for (let rr = r; rr >= 0; rr--) {
      const row = grid[rr];
      if (!row) continue;
      for (let cc = 0; cc <= c; cc++) {
        const s = row[cc];
        if (
          s &&
          !s.occupied &&
          rr + s.rowspan > r &&
          cc + s.colspan > c
        ) {
          return s;
        }
      }
    }
    return null;
  }

  function tcXml(innerP, opts) {
    const tcPr = [];
    if (opts.gridSpan > 1) tcPr.push(`<w:gridSpan w:val="${opts.gridSpan}"/>`);
    if (opts.vMerge === "restart") tcPr.push('<w:vMerge w:val="restart"/>');
    else if (opts.vMerge === "continue") tcPr.push("<w:vMerge/>");
    tcPr.push(
      `<w:tcBorders>` +
        `<w:top w:val="single" w:sz="4" w:color="BFBFBF"/>` +
        `<w:left w:val="single" w:sz="4" w:color="BFBFBF"/>` +
        `<w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/>` +
        `<w:right w:val="single" w:sz="4" w:color="BFBFBF"/>` +
        `</w:tcBorders>`,
    );
    if (opts.header) {
      tcPr.push('<w:shd w:val="clear" w:fill="F5F5F5"/>');
    }
    return `<w:tc><w:tcPr>${tcPr.join("")}</w:tcPr>${innerP}</w:tc>`;
  }

  function tableXmlFromGrid(model, rels) {
    const colCount = model.colCount || 0;
    if (!colCount || !model.grid.length) return "";
    const gridCols = Array.from(
      { length: colCount },
      () => `<w:gridCol w:w="${Math.floor(9000 / colCount)}"/>`,
    ).join("");
    const rows = model.grid.map((gridRow, r) => {
      const tcs = [];
      for (let c = 0; c < colCount; c++) {
        const origin = cellOrigin(model.grid, r, c);
        if (origin && origin.col !== c) continue;
        if (!origin) {
          tcs.push(tcXml(p(run(" ")), { gridSpan: 1, header: false }));
          continue;
        }
        let vMerge = null;
        if (origin.rowspan > 1) vMerge = origin.row === r ? "restart" : "continue";
        const inner = p(inlineRuns(origin.text || " ", rels));
        tcs.push(
          tcXml(inner, {
            gridSpan: origin.colspan || 1,
            vMerge,
            header: origin.header && origin.row === r,
          }),
        );
      }
      return `<w:tr>${tcs.join("")}</w:tr>`;
    });
    return (
      `<w:tbl>` +
      `<w:tblPr>` +
      `<w:tblW w:w="5000" w:type="pct"/>` +
      `<w:tblBorders>` +
      `<w:top w:val="single" w:sz="4" w:color="BFBFBF"/>` +
      `<w:left w:val="single" w:sz="4" w:color="BFBFBF"/>` +
      `<w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/>` +
      `<w:right w:val="single" w:sz="4" w:color="BFBFBF"/>` +
      `<w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/>` +
      `<w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>` +
      `</w:tblBorders>` +
      `</w:tblPr>` +
      `<w:tblGrid>${gridCols}</w:tblGrid>` +
      rows.join("") +
      `</w:tbl>` +
      `<w:p/>`
    );
  }

  function splitRow(line) {
    return line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, "|"));
  }

  function markdownTableModel(header, rows) {
    const colCount = header.length;
    const parsed = [
      {
        cells: header.map((text, i) => ({
          header: true,
          rowspan: 1,
          colspan: 1,
          text,
          row: 0,
          col: i,
        })),
      },
      ...rows.map((cols, ri) => ({
        cells: cols.map((text, i) => ({
          header: false,
          rowspan: 1,
          colspan: 1,
          text: text || " ",
          row: ri + 1,
          col: i,
        })),
      })),
    ];
    const grid = parsed.map((row) => {
      const g = [];
      row.cells.forEach((cell) => {
        g[cell.col] = cell;
      });
      while (g.length < colCount) {
        g.push({
          header: false,
          rowspan: 1,
          colspan: 1,
          text: " ",
          row: row.cells[0] ? row.cells[0].row : 0,
          col: g.length,
        });
      }
      return g;
    });
    return { rows: parsed, grid, colCount };
  }

  function htmlTableXml(html, rels) {
    const api = root.HtmlTable;
    if (!api) return p(run("[表格]"));
    return tableXmlFromGrid(api.parse(html), rels);
  }

  // ── Block convert ────────────────────────────────────────────────
  function makeRels() {
    const links = [];
    return {
      images: 0,
      add(url) {
        const id = "rId" + (links.length + 2); // rId1 = styles
        links.push({ id, url });
        return id;
      },
      links,
    };
  }

  // 文首 YAML / AIGC 水印不写入 Word。
  const AIGC_LINE =
    /^\s*(AIGC|Label|ContentProducer|ProduceID|ReservedCode\d*|ContentPropagator|PropagateID)\s*:/;

  function stripExportMeta(src) {
    src = String(src || "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
    src = src.replace(/^(\s*\n)*---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
    src = src.replace(
      /(?:^|\n)---[ \t]*\nAIGC:[\s\S]*?\n---[ \t]*(?:\n|$)/g,
      "\n",
    );
    return src;
  }

  function convertBlocks(src, rels, summary) {
    src = stripExportMeta(src);
    const out = [];

    const L = src.split("\n");
    let i = 0;

    while (i < L.length) {
      const line = L[i];
      if (!line.trim()) {
        i++;
        continue;
      }

      let m = line.match(/^\s*(`{3,}|~{3,})(\w*)/);
      if (m) {
        const lang = m[2] || "";
        i++;
        const buf = [];
        while (i < L.length && !/^\s*(`{3,}|~{3,})\s*$/.test(L[i])) {
          buf.push(L[i]);
          i++;
        }
        i++;
        summary.codeBlocks++;
        const label = lang ? `代码（${lang}）` : "代码";
        out.push(p(run(label, { italic: true })));
        buf.forEach((row) =>
          out.push(
            p(run(row || " ", { code: true }), null, '<w:ind w:left="240"/>'),
          ),
        );
        continue;
      }

      m = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
      if (m) {
        const level = m[1].length;
        summary.headings.push(m[2].trim());
        out.push(p(inlineRuns(m[2].trim(), rels), "Heading" + level));
        i++;
        continue;
      }

      if (i + 1 < L.length && /^=+\s*$/.test(L[i + 1])) {
        summary.headings.push(line.trim());
        out.push(p(inlineRuns(line.trim(), rels), "Heading1"));
        i += 2;
        continue;
      }
      if (
        i + 1 < L.length &&
        /^-{2,}\s*$/.test(L[i + 1]) &&
        !/^\s*[-*+]\s/.test(line)
      ) {
        summary.headings.push(line.trim());
        out.push(p(inlineRuns(line.trim(), rels), "Heading2"));
        i += 2;
        continue;
      }

      if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
        out.push(
          p(
            "",
            null,
            `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>`,
          ),
        );
        i++;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < L.length && /^\s*>/.test(L[i])) {
          buf.push(L[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        out.push(
          p(
            inlineRuns(buf.join(" "), rels),
            null,
            `<w:ind w:left="420"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="C9C0B6"/></w:pBdr>`,
          ),
        );
        continue;
      }

      if (
        line.includes("|") &&
        i + 1 < L.length &&
        /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(L[i + 1])
      ) {
        const header = splitRow(line);
        i += 2;
        const rows = [];
        while (i < L.length && L[i].includes("|") && L[i].trim()) {
          rows.push(splitRow(L[i]));
          i++;
        }
        summary.tables++;
        out.push(tableXmlFromGrid(markdownTableModel(header, rows), rels));
        continue;
      }

      if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
        while (i < L.length && /^\s*([-*+]|\d+\.)\s/.test(L[i])) {
          const lm = L[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
          const depth = Math.floor(lm[1].length / 2);
          const ordered = /\d+\./.test(lm[2]);
          let content = lm[3];
          const task = content.match(/^\[([ xX])\]\s+(.*)$/);
          if (task) {
            content = (task[1].toLowerCase() === "x" ? "☑ " : "☐ ") + task[2];
          }
          const mark = ordered ? lm[2] + " " : "• ";
          const left = 360 + depth * 360;
          out.push(
            p(
              run(mark) + inlineRuns(content, rels),
              null,
              `<w:ind w:left="${left}" w:hanging="360"/>`,
            ),
          );
          i++;
        }
        continue;
      }

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
      if (buf.length && AIGC_LINE.test(buf[0])) continue;
      out.push(p(inlineRuns(buf.join(" "), rels)));
    }

    return out.join("");
  }

  function withHtmlTables(src, rels, summary) {
    const api = root.HtmlTable;
    if (!api || typeof api.extractBlocks !== "function") {
      return convertBlocks(src, rels, summary);
    }
    const blocks = api.extractBlocks(src);
    if (!blocks.length) return convertBlocks(src, rels, summary);
    let rewritten = "";
    let last = 0;
    const rendered = [];
    let serial = 0;
    blocks.forEach((b) => {
      rewritten += src.slice(last, b.start);
      let token;
      do {
        token = `@@LMV_DOCX_TABLE_${serial++}@@`;
      } while (src.includes(token));
      rewritten += `\n\n${token}\n\n`;
      last = b.end;
      summary.tables++;
      rendered.push({ token, xml: htmlTableXml(b.html, rels) });
    });
    rewritten += src.slice(last);
    let body = convertBlocks(rewritten, rels, summary);
    rendered.forEach(({ token, xml: table }) => {
      const wrapped = p(run(token));
      if (body.includes(wrapped)) body = body.split(wrapped).join(table);
      else body = body.split(token).join(table);
    });
    return body;
  }

  function headingStyle(level, size, before, after) {
    return (
      `<w:style w:type="paragraph" w:styleId="Heading${level}">` +
      `<w:name w:val="heading ${level}"/>` +
      `<w:basedOn w:val="Normal"/>` +
      `<w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="${after}"/></w:pPr>` +
      `<w:rPr>` +
      `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="黑体"/>` +
      `<w:b/><w:bCs/>` +
      `<w:color w:val="000000"/>` +
      `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
      `</w:rPr></w:style>`
    );
  }

  function stylesXml() {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:docDefaults><w:rPrDefault><w:rPr>` +
      `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>` +
      `<w:sz w:val="24"/><w:szCs w:val="24"/>` +
      `<w:color w:val="000000"/>` +
      `</w:rPr></w:rPrDefault>` +
      `<w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="160"/></w:pPr></w:pPrDefault>` +
      `</w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
      headingStyle(1, 32, 360, 160) +
      headingStyle(2, 28, 280, 120) +
      headingStyle(3, 24, 240, 100) +
      headingStyle(4, 24, 200, 80) +
      headingStyle(5, 22, 160, 80) +
      headingStyle(6, 22, 160, 80) +
      `</w:styles>`
    );
  }

  function contentTypesXml() {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `</Types>`
    );
  }

  function rootRelsXml() {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
    );
  }

  function documentRelsXml(rels) {
    const items = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    ];
    rels.links.forEach((l) => {
      items.push(
        `<Relationship Id="${l.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(l.url)}" TargetMode="External"/>`,
      );
    });
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      items.join("") +
      `</Relationships>`
    );
  }

  function documentXml(body) {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${body}` +
      `<w:sectPr>` +
      `<w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>` +
      `</w:sectPr></w:body></w:document>`
    );
  }

  function emptySummary() {
    return { headings: [], tables: 0, codeBlocks: 0, images: 0 };
  }

  function build(src) {
    const rels = makeRels();
    const summary = emptySummary();
    const body = withHtmlTables(String(src || ""), rels, summary);
    summary.images = rels.images;
    return { xml: documentXml(body), rels, summary };
  }

  function decodeAttr(s) {
    return String(s)
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  function mdToDocxPreviewHtml(src) {
    src = stripExportMeta(src);
    const parse =
      typeof root.parseMarkdown === "function"
        ? root.parseMarkdown
        : typeof parseMarkdown === "function"
          ? parseMarkdown
          : null;
    let html = parse ? parse(src, true) : "";
    html = html.replace(/\s*<a class="header-anchor"[^>]*>[\s\S]*?<\/a>/gi, "");
    html = html.replace(/<div class="front-matter">[\s\S]*?<\/div>\n?/gi, "");
    html = html.replace(
      /<pre class="(?:mermaid|plantuml)">([\s\S]*?)<\/pre>/gi,
      (_, body) => `<pre><code>${body}</code></pre>`,
    );
    html = html.replace(
      /<(span|div) class="math-(?:inline|block)"[^>]*data-tex="([^"]*)"[^>]*>[\s\S]*?<\/\1>/gi,
      (_, _tag, tex) => `<code>${xml(decodeAttr(tex))}</code>`,
    );
    html = html.replace(
      /<img\b([^>]*)>/gi,
      (tag) => {
        const alt = ((tag.match(/\balt="([^"]*)"/i) || [])[1] || "").trim();
        const url = ((tag.match(/\bsrc="([^"]*)"/i) || [])[1] || "").trim();
        const label = alt ? "图片：" + alt : "图片";
        return `<p class="docx-img">${xml(label)}${url ? "（" + xml(url) + "）" : ""}</p>`;
      },
    );
    html = html.replace(
      /<(strong|b)>([\s\S]*?)<\/\1>/gi,
      '<mark class="docx-hl">$2</mark>',
    );
    return `<article class="docx-sheet">${html}</article>`;
  }

  function mdToDocxXml(src) {
    return build(src).xml;
  }

  function mdToDocxSummary(src) {
    return build(src).summary;
  }

  function mdToDocx(src) {
    const { xml, rels } = build(src);
    return zipStore([
      { name: "[Content_Types].xml", data: contentTypesXml() },
      { name: "_rels/.rels", data: rootRelsXml() },
      { name: "word/document.xml", data: xml },
      { name: "word/styles.xml", data: stylesXml() },
      { name: "word/_rels/document.xml.rels", data: documentRelsXml(rels) },
    ]);
  }

  root.mdToDocx = mdToDocx;
  root.mdToDocxXml = mdToDocxXml;
  root.mdToDocxSummary = mdToDocxSummary;
  root.mdToDocxPreviewHtml = mdToDocxPreviewHtml;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      mdToDocx,
      mdToDocxXml,
      mdToDocxSummary,
      mdToDocxPreviewHtml,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
