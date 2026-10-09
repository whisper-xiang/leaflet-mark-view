// Static, script-free policy page generated from the extension's source policy.
// Run from the repository root: node scripts/build-privacy.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('markdown.js', root), 'utf8'), context);
const source = readFileSync(new URL('PRIVACY.md', root), 'utf8').replaceAll('<br>', '');
const content = context.parseMarkdown(source, true).replace(/<a class="header-anchor"[^>]*>[\s\S]*?<\/a>/g, '');
writeFileSync(new URL('docs/privacy.html', root), `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>隐私政策 / Privacy Policy — Leaflet Mark View</title>
<meta name="description" content="Leaflet Mark View 隐私政策：网页正文在本机处理，权限、存储、保留与删除说明。">
<link rel="canonical" href="https://whisper-xiang.github.io/leaflet-mark-view/privacy.html">
<link rel="stylesheet" href="info.css">
</head><body>
<header><a class="brand" href="zh-CN/">Leaflet Mark View</a><nav aria-label="导航"><a href="support.html">支持 / Support</a><a href="privacy.html">隐私 / Privacy</a></nav></header>
<main>${content}</main>
<footer>Leaflet Mark View · <a href="support.html">联系与支持 / Contact and support</a></footer>
</body></html>\n`);
