// Same-Wi-Fi share. Chrome extensions cannot listen on a port, so the toggle
// talks to a local native-messaging host that serves the open document.
var LanShare = (function () {
  var HOST = "com.leaflet.markview.lan";
  var CHUNK = 100000;
  var active = false;
  var starting = false;
  var generation = 0;
  var timer = 0;
  var port = null;
  var token = "";
  var pageSeq = 0;
  var urls = [];
  var hostSource = "";

  function platformKind() {
    var name = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (/Mac/i.test(name)) return "mac";
    if (/Win/i.test(name)) return "win";
    return "linux";
  }

  function articleRoot() {
    var body = document.getElementById("markdownBody");
    if (!body || body.style.display === "none") return null;
    if (body.querySelector(".loading")) return null;
    if (!body.textContent.trim() && !body.querySelector("img, svg, table, pre")) return null;
    return body;
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function inlineLocalImages(root) {
    var images = [...root.querySelectorAll("img")];
    var used = 0;
    for (var img of images) {
      var src = img.getAttribute("src") || "";
      img.removeAttribute("srcset");
      if (!src || src.startsWith("data:") || /^https?:/i.test(src)) continue;
      try {
        var response = await fetch(src);
        if (!response.ok) throw new Error("image");
        var blob = await response.blob();
        if (blob.size > 1500000 || used + blob.size > 6000000) throw new Error("large");
        used += blob.size;
        img.setAttribute("src", await blobToDataUrl(blob));
      } catch (_) {
        img.removeAttribute("src");
        var alt = img.getAttribute("alt") || "图片";
        img.setAttribute("alt", alt + "（仅在开启分享的这台电脑上能看到）");
      }
    }
  }

  function cleanClone(root) {
    var clone = root.cloneNode(true);
    clone.querySelectorAll(
      "script, iframe, object, embed, link, .code-copy, .diagram-toolbar"
    ).forEach(function (node) { node.remove(); });
    clone.querySelectorAll(".heading-fold-body").forEach(function (node) {
      node.hidden = false;
      node.style.removeProperty("display");
    });
    clone.querySelectorAll("*").forEach(function (el) {
      [...el.attributes].forEach(function (attr) {
        var name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc") el.removeAttribute(attr.name);
      });
      if (el.hasAttribute("href") && /^\s*javascript:/i.test(el.getAttribute("href"))) {
        el.removeAttribute("href");
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON") {
        if (el.tagName === "INPUT" && el.type === "checkbox") el.disabled = true;
      }
    });
    return clone;
  }

  function articleTitle(root) {
    var heading = root.querySelector("h1, h2");
    if (!heading) return "未命名文档";
    var copy = heading.cloneNode(true);
    copy.querySelectorAll(".header-anchor, .heading-fold").forEach(function (node) { node.remove(); });
    var text = copy.textContent.replace(/\s+/g, " ").trim();
    return text.slice(0, 80) || "未命名文档";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  // The guest page reuses the reader shell. These rules only cover the
  // read-only notes and in-document search hits.
  var SHARE_LAYOUT = [
    ".share-note { margin: 0 0 20px; font-family: var(--font-ui); font-size: 13px; line-height: 1.6; color: var(--text-muted); }",
    ".doc-main > .share-note:last-child { margin: 28px 0 0; }",
    ".share-hit { background: color-mix(in srgb, var(--accent) 35%, transparent); color: inherit; }",
    ".share-search-hit { display: block; width: 100%; text-align: left; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--text); font: inherit; cursor: pointer; }",
    ".share-search-hit:hover, .share-search-hit.active { background: var(--surface-hover); }",
  ].join("\n");

  var readerCssPromise = null;
  var katexCssPromise = null;

  function loadText(path) {
    return fetch(chrome.runtime.getURL(path)).then(function (res) {
      if (!res.ok) throw new Error(path);
      return res.text();
    });
  }

  function readerCss() {
    if (!readerCssPromise) {
      readerCssPromise = loadText("viewer.css").catch(function () { return ""; });
    }
    return readerCssPromise;
  }

  async function currentBackground() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue("--bg-image").trim();
    var match = raw.match(/url\((?:"|')?([^"')]+)(?:"|')?\)/);
    if (!match) return "";
    var src = match[1];
    if (src.startsWith("data:")) return src;
    try {
      if (!/^(https?:|blob:|chrome-extension:|file:)/.test(src)) src = chrome.runtime.getURL(src);
      var res = await fetch(src);
      if (!res.ok) return "";
      var blob = await res.blob();
      if (blob.size > 2500000) return "";
      return await blobToDataUrl(blob);
    } catch (_) {
      return "";
    }
  }

  function katexCss() {
    if (!katexCssPromise) {
      katexCssPromise = (async function () {
        var css = await loadText("vendor/katex/katex.min.css");
        var names = [...new Set([...css.matchAll(/url\(fonts\/([^)]+\.woff2)\)/g)].map(function (item) {
          return item[1];
        }))];
        var fonts = {};
        await Promise.all(names.map(async function (name) {
          try {
            var res = await fetch(chrome.runtime.getURL("vendor/katex/fonts/" + name));
            if (!res.ok) return;
            fonts[name] = await blobToDataUrl(await res.blob());
          } catch (_) {}
        }));
        css = css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, function (_, name) {
          return fonts[name] ? 'url("' + fonts[name] + '")' : "url(fonts/" + name + ")";
        });
        return css.replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\)/g, "");
      })().catch(function () { return ""; });
    }
    return katexCssPromise;
  }

  function styleText(css) {
    return String(css || "").replace(/<\/style/gi, "<\\/style");
  }

  async function sharedStyles(clone) {
    var css = await readerCss();
    var background = await currentBackground();
    if (background) {
      css = css.replace(/url\((["']?)public\/bg\.png\1\)/g, 'url("' + background + '")');
    }
    if (clone.querySelector(".katex")) css += "\n" + await katexCss();
    return css + "\n" + SHARE_LAYOUT;
  }

  function outlineMarkup() {
    var outline = document.getElementById("outline");
    var root = document.getElementById("outlineRoot");
    if (!outline || outline.classList.contains("empty") || !root || !root.children.length) return "";
    var clone = root.cloneNode(true);
    clone.querySelectorAll(".is-section-collapsed").forEach(function (item) {
      item.classList.remove("is-section-collapsed");
    });
    clone.querySelectorAll(".is-folded-away").forEach(function (link) {
      link.classList.remove("is-folded-away");
    });
    var width = parseFloat(outline.style.width);
    var sized = width ? " style=\"width:" + width + "px;flex-basis:" + width + "px\"" : "";
    return "<div class=\"outline-resizer\" id=\"outlineResizer\"></div>" +
      "<aside class=\"outline\" id=\"outline\"" + sized + "><nav class=\"outline-nav\" aria-label=\"页面目录\">" +
      "<div class=\"outline-content\"><div class=\"outline-marker\" id=\"outlineMarker\"></div>" +
      "<div class=\"outline-title\">目录</div>" + clone.outerHTML + "</div></nav></aside>";
  }

  var LEAF_ICON = '<svg class="leaf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>';
  var FOLDER_ICON = '<svg class="loc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
  var PANEL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>';
  var SEARCH_ICON = '<svg class="topbar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
  var MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  var SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var GEAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var SCROLL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v18m-4-4 4 4 4-4M15 5h6m-6 5h6m-6 5h6"/></svg>';

  function sidebarMarkup() {
    var loc = document.querySelector("#locLabel .loc-name");
    var locName = loc && loc.textContent.trim() ? loc.textContent.trim() : "当前文档";
    var tree = document.getElementById("fileTree");
    var treeHtml = '<div class="sidebar-empty">当前文档</div>';
    if (tree && tree.children.length) {
      var copy = tree.cloneNode(true);
      copy.querySelectorAll("script, button, input, textarea, a").forEach(function (node) { node.remove(); });
      copy.querySelectorAll("[title], [data-path]").forEach(function (node) {
        node.removeAttribute("title");
        node.removeAttribute("data-path");
      });
      if (copy.innerHTML.trim()) treeHtml = copy.innerHTML;
    }
    return '<div class="sidebar-slot" id="sidebarSlot"><aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-header"><span class="topbar-logo">' + LEAF_ICON + "Leaflet Mark View</span>" +
      '<button type="button" class="btn-icon sidebar-collapse" id="sidebarCollapse" title="收起侧边栏" aria-label="收起侧边栏">' + PANEL_ICON + "</button></div>" +
      '<div class="sidebar-inner"><div class="sidebar-nav"><span class="sidebar-loc">' + FOLDER_ICON +
      '<span class="loc-name">' + escapeHtml(locName) + "</span></span></div>" +
      '<div class="file-tree" id="fileTree">' + treeHtml + "</div></div></aside></div>" +
      '<div class="sidebar-handle" id="sidebarHandle" role="separator" aria-orientation="vertical" aria-label="拖动以收起侧边栏"></div>';
  }

  function headerMarkup() {
    var html = document.documentElement;
    var theme = html.getAttribute("data-theme") || "light";
    var dark = html.getAttribute("data-scheme") === "dark";
    var font = html.getAttribute("data-font") === "serif" ? "宋体" : "黑体";
    var size = document.getElementById("contentArea")?.dataset.fontsize || "medium";
    var sizeLabel = { small: "小", medium: "中", large: "大", xlarge: "特大" }[size] || "中";
    var themeLabel = { light: "默认", sepia: "羊皮纸", sage: "青纸", dark: "深色", ink: "夜墨" }[theme] || "默认";
    var outlineRoot = document.getElementById("outlineRoot");
    var outlineEl = document.getElementById("outline");
    var outlineOn = !!(outlineEl && outlineRoot && !outlineEl.classList.contains("empty") && outlineRoot.children.length);
    var bgOn = !document.body.classList.contains("bg-off");
    return '<header class="topbar">' +
      '<button class="btn-icon sidebar-expand" id="sidebarExpand" title="展开侧边栏" type="button" aria-label="展开侧边栏">' + PANEL_ICON + "</button>" +
      '<button type="button" class="topbar-search-wrap" id="searchTrigger" title="搜索正文 (⌘K)">' + SEARCH_ICON +
      '<span class="topbar-search-placeholder">搜索正文…</span><kbd class="topbar-search-kbd">⌘K</kbd></button>' +
      '<div class="topbar-fill"></div><div class="topbar-actions">' +
      '<div class="auto-scroll-control"><button class="btn-icon" id="autoScrollTrigger" type="button" title="自动滚动" aria-label="自动滚动" aria-expanded="false" aria-controls="autoScrollPanel">' + SCROLL_ICON + "</button>" +
      '<section class="auto-scroll-panel" id="autoScrollPanel" aria-label="自动滚动设置" hidden><strong>自动滚动</strong>' +
      '<span id="autoScrollStatus" role="status">已暂停</span>' +
      '<label for="autoScrollSpeed">速度 <output id="autoScrollSpeedLabel" for="autoScrollSpeed">35 像素/秒</output></label>' +
      '<input id="autoScrollSpeed" type="range" min="5" max="200" step="5" value="35">' +
      '<label class="auto-scroll-loop"><input id="autoScrollLoop" type="checkbox">到底后循环阅读</label>' +
      '<button id="autoScrollToggle" type="button" aria-pressed="false">开始滚动</button></section></div>' +
      '<button class="btn-icon" id="themeToggle" type="button" title="' + (dark ? "切换到浅色主题" : "切换到深色主题") + '">' + (dark ? SUN_ICON : MOON_ICON) + "</button>" +
      '<div class="settings-menu"><button class="btn-icon" id="settingsTrigger" type="button" title="设置" aria-haspopup="true">' + GEAR_ICON + "</button>" +
      '<div class="settings-list" role="menu"><div class="settings-submenu">' +
      '<button class="settings-item settings-submenu-trigger" type="button" role="menuitem" aria-haspopup="true" aria-expanded="false"><span class="settings-label">主题</span></button>' +
      '<div class="settings-submenu-list" role="menu" aria-label="主题">' +
      '<button class="settings-item" id="fontSizeToggle" type="button" role="menuitem"><span class="settings-label">字体大小</span><span class="settings-val" id="fontSizeLabel">' + sizeLabel + "</span></button>" +
      '<button class="settings-item" id="readingThemeToggle" type="button" role="menuitem"><span class="settings-label">阅读主题</span><span class="settings-val" id="readingThemeLabel">' + themeLabel + "</span></button>" +
      '<button class="settings-item" id="readingFontToggle" type="button" role="menuitem"><span class="settings-label">正文字体</span><span class="settings-val" id="readingFontLabel">' + font + "</span></button>" +
      "</div></div>" +
      '<button class="settings-item" id="outlineToggle" type="button" role="menuitem"><span class="settings-label">大纲</span><span class="settings-val" id="outlineToggleLabel">' + (outlineOn ? "开" : "关") + "</span></button>" +
      '<button class="settings-item" id="bgToggle" type="button" role="menuitem"><span class="settings-label">背景图</span><span class="settings-val" id="bgToggleLabel">' + (bgOn ? "开" : "关") + "</span></button>" +
      "</div></div></div></header>";
  }

  function searchModalMarkup() {
    return '<div class="search-backdrop" id="searchBackdrop"></div>' +
      '<div class="search-modal" id="searchModal" role="dialog" aria-modal="true" aria-label="搜索正文">' +
      '<div class="search-modal-box"><div class="search-modal-head">' + SEARCH_ICON.replace("topbar-search-icon", "search-modal-icon") +
      '<input class="search-modal-input" id="searchModalInput" placeholder="搜索正文…" autocomplete="off" spellcheck="false">' +
      '<button class="search-modal-clear" id="searchModalClear" type="button" title="清除">×</button></div>' +
      '<div class="search-modal-results" id="searchModalResults"></div></div></div>';
  }

  function guestChromeScript() {
    return [
      "const slot=document.getElementById('sidebarSlot');",
      "function sidebarFull(){const sidebar=document.getElementById('sidebar');if(!sidebar)return 272;const cs=getComputedStyle(sidebar);return parseFloat(cs.minWidth)||parseFloat(cs.flexBasis)||parseFloat(cs.width)||272;}",
      "function clearSidebarInline(){const sidebar=document.getElementById('sidebar');if(slot)slot.style.width='';if(sidebar)sidebar.style.transform='';}",
      "function setSidebarCollapsed(collapsed){const sidebar=document.getElementById('sidebar');if(!sidebar||!slot)return;sidebar.classList.toggle('collapsed',collapsed);slot.classList.toggle('collapsed',collapsed);sidebar.toggleAttribute('inert',collapsed);clearSidebarInline();}",
      "document.getElementById('sidebarCollapse')?.addEventListener('click',()=>setSidebarCollapsed(true));",
      "document.getElementById('sidebarExpand')?.addEventListener('click',()=>setSidebarCollapsed(false));",
      "const sidebarHandle=document.getElementById('sidebarHandle');",
      "if(sidebarHandle&&slot){const applyOffset=(visible,full)=>{const sidebar=document.getElementById('sidebar');const v=Math.min(full,Math.max(0,visible));slot.style.width=v+'px';if(sidebar)sidebar.style.transform='translateX('+(v-full)+'px)';return v;};",
      "sidebarHandle.addEventListener('mousedown',e=>{if(e.button!==0)return;e.preventDefault();const sidebar=document.getElementById('sidebar');const full=sidebarFull();const startX=e.clientX;const startVisible=slot.getBoundingClientRect().width;slot.classList.add('dragging');sidebarHandle.classList.add('dragging');document.body.style.cursor='ew-resize';document.body.style.userSelect='none';",
      "const onMove=ev=>applyOffset(startVisible+(ev.clientX-startX),full);",
      "const onUp=ev=>{const visible=applyOffset(startVisible+(ev.clientX-startX),full);document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);slot.classList.remove('dragging');sidebarHandle.classList.remove('dragging');document.body.style.cursor='';document.body.style.userSelect='';const v=Math.min(full,Math.max(0,visible));if(v<=1)setSidebarCollapsed(true);else if(v>=full-1)setSidebarCollapsed(false);else{sidebar.classList.remove('collapsed');slot.classList.remove('collapsed');sidebar.removeAttribute('inert');}};",
      "document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);});",
      "sidebarHandle.addEventListener('dblclick',()=>{const sidebar=document.getElementById('sidebar');if(sidebar)setSidebarCollapsed(!sidebar.classList.contains('collapsed'));});}",
      "const outlineResizer=document.getElementById('outlineResizer');const outlinePane=document.getElementById('outline');",
      "if(outlineResizer&&outlinePane){const setOutlineWidth=w=>{outlinePane.style.width=w+'px';outlinePane.style.flexBasis=w+'px';};",
      "outlineResizer.addEventListener('mousedown',e=>{e.preventDefault();outlineResizer.classList.add('dragging');document.body.style.cursor='col-resize';document.body.style.userSelect='none';const startX=e.clientX;const startW=outlinePane.getBoundingClientRect().width||272;",
      "const onMove=ev=>{const w=Math.min(480,Math.max(160,startW+(startX-ev.clientX)));setOutlineWidth(w);};",
      "const onUp=()=>{outlineResizer.classList.remove('dragging');document.body.style.cursor='';document.body.style.userSelect='';document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);};",
      "document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);});}",
      "document.getElementById('fileTree')?.addEventListener('click',e=>{const header=e.target.closest('.tree-dir-header');if(header)header.parentElement.classList.toggle('open');});",
      "const THEMES=[{id:'light',label:'默认',dark:false},{id:'sepia',label:'羊皮纸',dark:false},{id:'sage',label:'青纸',dark:false},{id:'dark',label:'深色',dark:true},{id:'ink',label:'夜墨',dark:true}];",
      "const SUN=" + JSON.stringify(SUN_ICON) + ";const MOON=" + JSON.stringify(MOON_ICON) + ";",
      "let lightTheme='light',darkTheme='dark';",
      "function paintTheme(id){const meta=THEMES.find(t=>t.id===id)||THEMES[0];const root=document.documentElement;",
      "root.setAttribute('data-theme',meta.id);root.setAttribute('data-scheme',meta.dark?'dark':'light');",
      "if(meta.dark)darkTheme=meta.id;else lightTheme=meta.id;",
      "const toggle=document.getElementById('themeToggle');if(toggle){toggle.innerHTML=meta.dark?SUN:MOON;toggle.title=meta.dark?'切换到浅色主题':'切换到深色主题';}",
      "const label=document.getElementById('readingThemeLabel');if(label)label.textContent=meta.label;}",
      "paintTheme(document.documentElement.getAttribute('data-theme')||'light');",
      "document.getElementById('themeToggle')?.addEventListener('click',()=>{const dark=document.documentElement.getAttribute('data-scheme')==='dark';paintTheme(dark?lightTheme:darkTheme);});",
      "document.getElementById('readingThemeToggle')?.addEventListener('click',()=>{const cur=document.documentElement.getAttribute('data-theme');const i=Math.max(0,THEMES.findIndex(t=>t.id===cur));paintTheme(THEMES[(i+1)%THEMES.length].id);});",
      "const SIZES=['small','medium','large','xlarge'];const SIZE_LABEL={small:'小',medium:'中',large:'大',xlarge:'特大'};",
      "document.getElementById('fontSizeToggle')?.addEventListener('click',()=>{const area=document.getElementById('contentArea');if(!area)return;const i=Math.max(0,SIZES.indexOf(area.dataset.fontsize||'medium'));const next=SIZES[(i+1)%SIZES.length];area.dataset.fontsize=next;const label=document.getElementById('fontSizeLabel');if(label)label.textContent=SIZE_LABEL[next];});",
      "document.getElementById('readingFontToggle')?.addEventListener('click',()=>{const root=document.documentElement;const serif=root.getAttribute('data-font')==='serif';root.setAttribute('data-font',serif?'sans':'serif');const label=document.getElementById('readingFontLabel');if(label)label.textContent=serif?'黑体':'宋体';});",
      "document.getElementById('outlineToggle')?.addEventListener('click',()=>{const outline=document.getElementById('outline');if(!outline)return;outline.classList.toggle('collapsed');const label=document.getElementById('outlineToggleLabel');if(label)label.textContent=outline.classList.contains('collapsed')?'关':'开';});",
      "document.getElementById('bgToggle')?.addEventListener('click',()=>{document.body.classList.toggle('bg-off');const label=document.getElementById('bgToggleLabel');if(label)label.textContent=document.body.classList.contains('bg-off')?'关':'开';});",
      "const backdrop=document.getElementById('searchBackdrop');const modal=document.getElementById('searchModal');const searchInput=document.getElementById('searchModalInput');const searchResults=document.getElementById('searchModalResults');",
      "function clearHits(){document.querySelectorAll('mark.share-hit').forEach(mark=>{mark.replaceWith(document.createTextNode(mark.textContent));});document.getElementById('markdownBody')?.normalize();}",
      "function closeSearch(){backdrop?.classList.remove('open');modal?.classList.remove('open');clearHits();if(searchResults)searchResults.innerHTML='';}",
      "function openSearch(){backdrop?.classList.add('open');modal?.classList.add('open');searchInput?.focus();}",
      "function runSearch(query){clearHits();if(!searchResults)return;searchResults.innerHTML='';const q=query.trim();if(!q)return;const article=document.getElementById('markdownBody');if(!article)return;",
      "const nodes=[];const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))nodes.push(node);const lower=q.toLowerCase();let count=0;",
      "nodes.forEach(textNode=>{if(count>=30)return;const value=textNode.nodeValue||'';const start=value.toLowerCase().indexOf(lower);if(start<0)return;",
      "const mark=document.createElement('mark');mark.className='share-hit';mark.id='share-hit-'+count;const after=textNode.splitText(start);after.nodeValue=after.nodeValue.slice(q.length);mark.textContent=value.slice(start,start+q.length);after.parentNode.insertBefore(mark,after);",
      "const button=document.createElement('button');button.type='button';button.className='share-search-hit';button.dataset.hit=mark.id;button.textContent=value.slice(Math.max(0,start-16),Math.min(value.length,start+q.length+16)).replace(/\\s+/g,' ').trim();searchResults.appendChild(button);count+=1;});",
      "if(!count)searchResults.innerHTML='<div class=\"search-modal-empty\">没有匹配结果</div>';}",
      "document.getElementById('searchTrigger')?.addEventListener('click',openSearch);",
      "searchInput?.addEventListener('input',()=>runSearch(searchInput.value));",
      "document.getElementById('searchModalClear')?.addEventListener('click',()=>{if(searchInput)searchInput.value='';runSearch('');searchInput?.focus();});",
      "backdrop?.addEventListener('click',closeSearch);",
      "searchResults?.addEventListener('click',e=>{const button=e.target.closest('.share-search-hit');if(!button||!scroller)return;const mark=document.getElementById(button.dataset.hit);if(!mark)return;expandTo(mark);const top=mark.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-80;scroller.scrollTo({top:Math.max(0,top),behavior:'smooth'});closeSearch();});",
      "document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}else if(e.key==='Escape')closeSearch();});",
      "const area=document.getElementById('contentArea');const scrollTrigger=document.getElementById('autoScrollTrigger');const scrollPanel=document.getElementById('autoScrollPanel');const scrollToggle=document.getElementById('autoScrollToggle');const scrollSpeed=document.getElementById('autoScrollSpeed');const scrollLoop=document.getElementById('autoScrollLoop');const scrollStatus=document.getElementById('autoScrollStatus');",
      "let scrollFrame=null,scrollRunning=false,scrollPrev=null,scrollPos=0;",
      "function scrollStop(message){if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);scrollFrame=null;scrollPrev=null;scrollRunning=false;if(scrollToggle){scrollToggle.textContent='开始滚动';scrollToggle.setAttribute('aria-pressed','false');}scrollTrigger?.classList.remove('is-running');if(scrollStatus)scrollStatus.textContent=message||'已暂停';}",
      "function scrollTick(time){if(!scrollRunning||!area)return;const max=area.scrollHeight-area.clientHeight;if(max<=0)return scrollStop('正文无需滚动');if(scrollPrev!==null)scrollPos+=Number(scrollSpeed.value||35)*Math.min(time-scrollPrev,100)/1000;scrollPrev=time;if(scrollPos>=max){area.scrollTop=max;if(!scrollLoop?.checked)return scrollStop('已读到底部');scrollPos=0;}area.scrollTop=scrollPos;scrollFrame=requestAnimationFrame(scrollTick);}",
      "function syncSpeed(){const label=document.getElementById('autoScrollSpeedLabel');if(label&&scrollSpeed)label.textContent=scrollSpeed.value+' 像素/秒';}",
      "scrollSpeed?.addEventListener('input',syncSpeed);syncSpeed();",
      "scrollTrigger?.addEventListener('click',()=>{if(!scrollPanel||!scrollTrigger)return;scrollPanel.hidden=!scrollPanel.hidden;scrollTrigger.setAttribute('aria-expanded',String(!scrollPanel.hidden));});",
      "scrollToggle?.addEventListener('click',()=>{if(scrollRunning)return scrollStop('已暂停');if(!area)return;const max=area.scrollHeight-area.clientHeight;if(max<=0)return scrollStop('正文无需滚动');scrollPos=area.scrollTop>=max-1?0:area.scrollTop;scrollPrev=null;scrollRunning=true;scrollToggle.textContent='暂停滚动';scrollToggle.setAttribute('aria-pressed','true');scrollTrigger?.classList.add('is-running');if(scrollStatus)scrollStatus.textContent='正在滚动';if(scrollPanel)scrollPanel.hidden=true;scrollFrame=requestAnimationFrame(scrollTick);});",
      "area?.addEventListener('wheel',()=>{if(scrollRunning)scrollStop('已暂停');},{passive:true});",
    ].join("");
  }

  function guestPage(title, articleHtml, seq, css) {
    var html = document.documentElement;
    var theme = html.getAttribute("data-theme") || "light";
    var scheme = html.getAttribute("data-scheme") || "light";
    var font = html.getAttribute("data-font") || "sans";
    var size = document.getElementById("contentArea")?.dataset.fontsize || "medium";
    var bodyClass = document.body.classList.contains("bg-off") ? "bg-off" : "";
    return "<!doctype html><html lang=\"zh\" data-theme=\"" + escapeHtml(theme) +
      "\" data-scheme=\"" + escapeHtml(scheme) + "\" data-font=\"" + escapeHtml(font) + "\">" +
      "<head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<meta name=\"referrer\" content=\"no-referrer\">" +
      "<title>" + escapeHtml(title) + "</title><style>" + styleText(css) + "</style></head>" +
      "<body class=\"" + bodyClass + "\">" +
      "<div class=\"read-progress\"></div>" +
      "<div class=\"app-shell\">" + sidebarMarkup() + "<div class=\"main-col\">" + headerMarkup() +
      "<div class=\"doc-viewport\" id=\"contentArea\" data-fontsize=\"" + escapeHtml(size) + "\">" +
      "<div class=\"doc-viewport-row\"><div class=\"doc-scroll-body\"><main class=\"content-area\">" +
      "<div class=\"doc-layout\"><div class=\"doc-main\">" +
      "<p class=\"share-note\">Leaflet 局域网分享 · 只读</p>" +
      articleHtml +
      "<p class=\"share-note\" id=\"lmv-share-state\">同一 Wi-Fi 只读。关闭分享后，这里会停在最后一版。</p>" +
      "</div></div></main></div>" + outlineMarkup() +
      "</div></div></div></div>" + searchModalMarkup() + "<script>const seq=" + JSON.stringify(String(seq)) + ";" +
      "let misses=0;async function tick(){try{const res=await fetch(location.pathname,{method:'HEAD',cache:'no-store'});" +
      "if(!res.ok)throw new Error('closed');misses=0;const next=res.headers.get('X-LMV-Seq');" +
      "if(next&&next!==seq)location.reload();}catch(e){misses+=1;if(misses>=2){" +
      "const el=document.getElementById('lmv-share-state');if(el)el.textContent='分享已关闭，当前是最后一版。';}}}" +
      "setInterval(tick,2000);" +
      "const scroller=document.getElementById('contentArea');" +
      "const links=[...document.querySelectorAll('.outline-link')];" +
      "const marker=document.getElementById('outlineMarker');" +
      "const panel=document.querySelector('.outline-content');" +
      "function linkId(a){return a.dataset.target||decodeURIComponent((a.getAttribute('href')||'').replace(/^#/,''));}" +
      "function foldName(heading){const title=heading.querySelector(':scope > .heading-fold-title');" +
      "return ((title||heading).textContent||'').replace(/\\u200B/g,'').replace(/\\s+/g,' ').trim();}" +
      "function foldedAway(el){let node=el&&el.parentElement;while(node){" +
      "if(node.classList.contains('heading-fold-body')){const head=node.previousElementSibling;" +
      "if(head&&head.classList.contains('is-collapsed'))return true;}node=node.parentElement;}return false;}" +
      "function syncFolds(){const root=document.getElementById('outlineRoot');if(!root)return;" +
      "root.querySelectorAll('.outline-link').forEach(a=>{const heading=document.getElementById(linkId(a));if(!heading)return;" +
      "a.classList.toggle('is-folded-away',foldedAway(heading));" +
      "a.closest('li')?.classList.toggle('is-section-collapsed',heading.classList.contains('is-collapsed'));});}" +
      "function setFold(heading,collapsed){heading.classList.toggle('is-collapsed',collapsed);" +
      "const btn=heading.querySelector(':scope > .heading-fold');if(btn){btn.setAttribute('aria-expanded',collapsed?'false':'true');" +
      "const label=(collapsed?'展开':'收起')+'「'+foldName(heading)+'」';btn.title=label;btn.setAttribute('aria-label',label);}" +
      "syncFolds();}" +
      "function expandTo(heading){let node=heading&&heading.parentElement;while(node){" +
      "if(node.classList.contains('heading-fold-body')){const head=node.previousElementSibling;" +
      "if(head&&head.classList.contains('is-collapsed'))setFold(head,false);}node=node.parentElement;}}" +
      "document.addEventListener('click',e=>{const btn=e.target.closest&&e.target.closest('.heading-fold');" +
      "if(btn){const heading=btn.closest('.is-foldable');if(!heading)return;e.preventDefault();" +
      "setFold(heading,!heading.classList.contains('is-collapsed'));scroller&&scroller.dispatchEvent(new Event('scroll'));return;}" +
      "const link=e.target.closest&&e.target.closest('.outline-link');if(!link||!scroller)return;" +
      "const heading=document.getElementById(linkId(link));if(!heading)return;e.preventDefault();expandTo(heading);" +
      "const top=heading.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-20;" +
      "scroller.scrollTo({top:Math.max(0,top),behavior:'smooth'});});" +
      "function spy(){if(!links.length||!scroller)return;const paneTop=scroller.getBoundingClientRect().top;" +
      "const visible=links.filter(a=>{const h=document.getElementById(linkId(a));return h&&!foldedAway(h);});" +
      "let current=visible[0]||links[0];" +
      "for(const a of visible){const h=document.getElementById(linkId(a));if(h&&h.getBoundingClientRect().top-paneTop<=100)current=a;}" +
      "if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4)current=visible[visible.length-1]||current;" +
      "links.forEach(a=>a.classList.toggle('active',a===current));" +
      "if(marker&&panel&&current){marker.style.top=(current.getBoundingClientRect().top-panel.getBoundingClientRect().top+7)+'px';marker.style.opacity='1';}}" +
      "scroller&&scroller.addEventListener('scroll',()=>requestAnimationFrame(spy),{passive:true});syncFolds();spy();" +
      guestChromeScript() +
      "</script></body></html>";
  }

  async function buildPage(gen) {
    var root = articleRoot();
    if (!root) return null;
    var clone = cleanClone(root);
    var title = articleTitle(clone);
    await inlineLocalImages(clone);
    if (!active || gen !== generation) return null;
    var css = await sharedStyles(clone);
    if (!active || gen !== generation) return null;
    pageSeq += 1;
    return guestPage(title, clone.outerHTML, pageSeq, css);
  }

  function sendPage(html) {
    if (!port) return;
    var parts = [];
    for (var i = 0; i < html.length; i += CHUNK) parts.push(html.slice(i, i + CHUNK));
    if (!parts.length) parts.push("");
    try {
      parts.forEach(function (chunk, index) {
        port.postMessage({
          type: "page",
          seq: pageSeq,
          part: index,
          parts: parts.length,
          chunk: chunk,
        });
      });
    } catch (_) {
      failSession("分享内容没有送出去");
    }
  }

  async function publish(gen) {
    if (!active || gen !== generation) return;
    var html = null;
    try {
      html = await buildPage(gen);
    } catch (_) {
      toast("无法准备分享页面");
      return;
    }
    if (!html || !active || gen !== generation) return;
    sendPage(html);
  }

  function refresh() {
    if (!active) return;
    var gen = ++generation;
    clearTimeout(timer);
    timer = setTimeout(function () { publish(gen); }, 400);
  }

  function setLabel(text) {
    var label = document.getElementById("lanShareToggleLabel");
    var button = document.getElementById("lanShareToggle");
    if (label) label.textContent = text;
    if (button) button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function showBar() {
    var bar = document.getElementById("lanShareBar");
    var link = document.getElementById("lanShareUrl");
    var alt = document.getElementById("lanShareAlt");
    if (!bar || !link) return;
    var primary = urls[0] || "";
    link.textContent = primary;
    link.href = primary || "#";
    if (alt) {
      var rest = urls.slice(1);
      alt.hidden = rest.length === 0;
      alt.textContent = rest.length ? "如果打不开，换这个地址：" + rest.join("  ") : "";
    }
    bar.hidden = false;
  }

  function hideBar() {
    var bar = document.getElementById("lanShareBar");
    if (bar) bar.hidden = true;
  }

  function newToken() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function addresses(msg) {
    var portNo = msg.port;
    var hosts = []
      .concat(msg.ips || [])
      .concat(msg.hosts || []);
    if (!hosts.length) hosts = ["127.0.0.1"];
    return hosts.map(function (host) {
      return "http://" + host + ":" + portNo + "/s/" + token;
    });
  }

  function failSession(message) {
    active = false;
    starting = false;
    setLabel("关");
    hideBar();
    dropPort();
    if (message) toast(message);
  }

  function dropPort() {
    var current = port;
    port = null;
    if (!current) return;
    current._lmvClosed = true;
    try { current.disconnect(); } catch (_) {}
  }

  function onStarted(msg) {
    starting = false;
    active = true;
    urls = addresses(msg);
    setLabel("开");
    showBar();
    toast(urls[0].indexOf("127.0.0.1") === 0
      ? "没有发现局域网地址，其他电脑可能打不开"
      : "如果系统询问是否允许 Python 接受网络连接，请选择允许");
    refresh();
  }

  function explainDisconnect(message) {
    var text = message || "";
    if (/not found/i.test(text)) return "还没有安装本机组件。安装一次后，同一 Wi-Fi 的电脑就能打开分享链接。";
    if (/forbidden/i.test(text)) return "本机组件还不是为当前这个扩展安装的。请重新安装一次。";
    if (/exited|disconnected/i.test(text)) return "本机组件退出了。请重新安装后再打开分享。";
    return "暂时连不上本机组件。可以重新安装后再试。";
  }

  function openInstallModal(reason) {
    var modal = document.getElementById("lanShareModal");
    var lead = document.getElementById("lanShareLead");
    var command = document.getElementById("lanShareCommand");
    var download = document.getElementById("lanShareDownload");
    var copy = document.getElementById("lanShareCopyCommand");
    var steps = document.getElementById("lanShareSteps");
    if (!modal) return;
    var kind = platformKind();
    if (lead) lead.textContent = reason;
    if (kind === "win") {
      if (steps) steps.textContent = "Windows 上还不能由这个开关自动启动本机组件。请在 macOS 或 Linux 上的 Chrome 里使用局域网分享。";
      if (command) command.textContent = "";
      if (download) download.hidden = true;
      if (copy) copy.hidden = true;
    } else {
      var file = kind === "mac" ? "启用局域网分享.command" : "enable-lan-share.sh";
      if (steps) {
        steps.innerHTML = "<li>下载安装文件。</li>" +
          "<li>打开终端，粘贴下面的命令并回车。看到「已安装」后可以关闭终端。</li>" +
          "<li>回到这里，再点一次「局域网分享」。</li>";
      }
      if (command) command.textContent = 'bash "$HOME/Downloads/' + file + '"';
      if (download) download.hidden = false;
      if (copy) copy.hidden = false;
    }
    modal.hidden = false;
    prefetchHost();
  }

  function closeModal() {
    var modal = document.getElementById("lanShareModal");
    if (modal) modal.hidden = true;
  }

  async function prefetchHost() {
    var download = document.getElementById("lanShareDownload");
    if (download) download.disabled = true;
    try {
      var response = await fetch(chrome.runtime.getURL("lan-host/host.py"));
      if (!response.ok) throw new Error("missing");
      hostSource = await response.text();
      if (download) download.disabled = false;
    } catch (_) {
      hostSource = "";
      toast("找不到本机组件文件");
    }
  }

  function bytesToBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function installerText() {
    var id = chrome.runtime.id || "";
    if (!/^[a-p]{32}$/.test(id)) throw new Error("扩展编号无效");
    if (!hostSource.includes("serve_native")) throw new Error("组件文件不完整");
    var b64 = bytesToBase64(hostSource);
    return "#!/bin/bash\n" +
      "set -euo pipefail\n" +
      "if ! command -v python3 >/dev/null 2>&1; then\n" +
      "  echo \"需要先安装 Python 3。\"\n" +
      "  exit 1\n" +
      "fi\n" +
      "python3 - << 'PY'\n" +
      "import base64, json, pathlib, sys\n" +
      "ext_id = \"" + id + "\"\n" +
      "host = base64.b64decode(\"" + b64 + "\")\n" +
      "home = pathlib.Path.home()\n" +
      "name = \"com.leaflet.markview.lan\"\n" +
      "manifest_name = name + \".json\"\n" +
      "if sys.platform == \"darwin\":\n" +
      "    app = home / \"Library/Application Support/leaflet-mark-view\"\n" +
      "    base = home / \"Library/Application Support\"\n" +
      "    browsers = [\"Google/Chrome\", \"Google/Chrome Canary\", \"Google/Chrome Beta\", \"Google/Chrome for Testing\", \"Google/ChromeForTesting\", \"Chromium\", \"Microsoft Edge\", \"BraveSoftware/Brave-Browser\", \"Vivaldi\", \"Arc\"]\n" +
      "    required = {\"Google/Chrome\"}\n" +
      "elif sys.platform.startswith(\"linux\"):\n" +
      "    app = home / \".local/share/leaflet-mark-view\"\n" +
      "    base = home / \".config\"\n" +
      "    browsers = [\"google-chrome\", \"google-chrome-beta\", \"chromium\", \"microsoft-edge\", \"BraveSoftware/Brave-Browser\"]\n" +
      "    required = {\"google-chrome\"}\n" +
      "else:\n" +
      "    raise SystemExit(\"当前安装包支持 macOS 和 Linux。\")\n" +
      "app.mkdir(parents=True, exist_ok=True)\n" +
      "script = app / \"lan-host.py\"\n" +
      "script.write_bytes(host)\n" +
      "script.chmod(0o755)\n" +
      "manifest = {\"name\": name, \"description\": \"Leaflet Mark View same-Wi-Fi share\", \"path\": str(script), \"type\": \"stdio\", \"allowed_origins\": [\"chrome-extension://%s/\" % ext_id]}\n" +
      "written = 0\n" +
      "for rel in browsers:\n" +
      "    root = base / rel\n" +
      "    if rel not in required and not root.exists():\n" +
      "        continue\n" +
      "    dest = root / \"NativeMessagingHosts\"\n" +
      "    dest.mkdir(parents=True, exist_ok=True)\n" +
      "    (dest / manifest_name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + \"\\n\", encoding=\"utf-8\")\n" +
      "    written += 1\n" +
      "if written == 0:\n" +
      "    raise SystemExit(\"没有找到 Chrome 的配置目录。\")\n" +
      "print(\"已安装。回到 Leaflet，再打开一次「局域网分享」。\")\n" +
      "PY\n" +
      "echo \"按回车关闭。\"\n" +
      "read -r _\n";
  }

  function downloadInstaller() {
    var kind = platformKind();
    if (kind === "win") return;
    var text = "";
    try {
      text = installerText();
    } catch (_) {
      toast("无法生成安装文件");
      return;
    }
    var name = kind === "mac" ? "启用局域网分享.command" : "enable-lan-share.sh";
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function copyCommand() {
    var command = document.getElementById("lanShareCommand");
    var text = command ? command.textContent : "";
    if (!text) return;
    copyText(text).then(function (ok) {
      toast(ok ? "已复制安装命令" : "复制失败");
    });
  }

  function copyUrl() {
    var url = urls[0];
    if (!url) return;
    copyText(url).then(function (ok) {
      toast(ok ? "已复制分享地址" : "复制失败");
    });
  }

  function stop() {
    active = false;
    starting = false;
    generation += 1;
    clearTimeout(timer);
    setLabel("关");
    hideBar();
    urls = [];
    if (port) {
      try { port.postMessage({ type: "stop" }); } catch (_) {}
    }
    dropPort();
  }

  function start() {
    if (!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.connectNative)) {
      toast(location.protocol === "chrome-extension:"
        ? "请先在 chrome://extensions 重新加载本扩展，再打开局域网分享"
        : "请从 Chrome 工具栏的 Leaflet 图标进入阅读页");
      return;
    }
    if (!articleRoot()) {
      toast("请先打开一篇文档");
      return;
    }
    if (starting) return;
    starting = true;
    token = newToken();
    var nativePort;
    try {
      nativePort = chrome.runtime.connectNative(HOST);
    } catch (err) {
      starting = false;
      openInstallModal(explainDisconnect(err && err.message));
      return;
    }
    port = nativePort;
    var settled = false;
    nativePort.onMessage.addListener(function (msg) {
      if (!msg || port !== nativePort) return;
      if (msg.type === "started" && msg.ok) {
        settled = true;
        onStarted(msg);
        return;
      }
      if (msg.ok === false && msg.error) {
        settled = true;
        failSession(msg.error);
      }
    });
    nativePort.onDisconnect.addListener(function () {
      var message = chrome.runtime.lastError && chrome.runtime.lastError.message;
      if (nativePort._lmvClosed) return;
      if (port === nativePort) port = null;
      if (!settled) {
        starting = false;
        setLabel("关");
        openInstallModal(explainDisconnect(message));
        return;
      }
      if (active) failSession("局域网分享已断开");
    });
    try {
      nativePort.postMessage({ type: "start", token: token, port: 47821 });
    } catch (err) {
      settled = true;
      failSession("无法启动局域网分享");
    }
    setTimeout(function () {
      if (!settled && starting && port === nativePort) {
        settled = true;
        failSession("本机组件没有响应");
      }
    }, 8000);
  }

  function toggle() {
    if (active || starting) stop();
    else start();
  }

  function bind() {
    document.getElementById("lanShareToggle")?.addEventListener("click", toggle);
    document.getElementById("lanShareCopy")?.addEventListener("click", copyUrl);
    document.getElementById("lanShareStop")?.addEventListener("click", stop);
    document.getElementById("lanShareDownload")?.addEventListener("click", downloadInstaller);
    document.getElementById("lanShareCopyCommand")?.addEventListener("click", copyCommand);
    document.getElementById("lanShareModalClose")?.addEventListener("click", closeModal);
    document.getElementById("lanShareBackdrop")?.addEventListener("click", closeModal);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  return {
    toggle: toggle,
    stop: stop,
    refresh: refresh,
    copy: copyUrl,
    closeModal: closeModal,
  };
})();
