# Chrome 网上应用店 · Privacy 页粘贴稿

后台路径：Developer Dashboard → 你的扩展 → **Privacy**。

隐私政策 URL（GitHub Pages 从 main /docs 发布成功后使用）：

```
https://whisper-xiang.github.io/leaflet-mark-view/privacy.html
```

---

## Single purpose（单一用途）

```
A local-first Markdown reader for Chrome. Users open a local folder, a local .md file, a GitHub / HTTPS Markdown URL, or explicitly convert the active webpage to Markdown and read it in a dedicated viewer, with optional export to HTML, Word, or Confluence wiki markup. There is no account and no cloud sync.
```

中文备忘（不必贴到英文框，供你对照）：

> 在 Chrome 里本地阅读 Markdown。用户打开本地文件夹、本地文件或 GitHub / HTTPS 链接，在阅读器中阅读，并可导出 HTML、Word 或 Confluence。无账号、无云同步。

---

## Permission justifications（每个权限一段，用英文）

### `storage`

```
Stores reading preferences and a short-lived copy of Markdown text on the device (chrome.storage.session / IndexedDB / localStorage) so the viewer can restore the last file, theme, and scroll position. This data never leaves the browser.
```

### `activeTab`

```
Provides temporary access to the current tab only after the user explicitly requests webpage reading through the toolbar popup, webpage context menu, or keyboard shortcut. The extension reads the article title, URL, and loaded page content to convert it to Markdown locally and open it in the reader. Captures stay on the device. It does not continuously monitor browsing or upload captured content.
```

### `contextMenus`

```
Adds a Read current webpage with Leaflet item to the context menu on HTTP/HTTPS pages. Conversion runs only when the user chooses it; the item captures the current page, not the target of a clicked link.
```

### `scripting`

```
Runs bundled Mozilla Readability, Turndown, and the conversion script in the active tab's isolated world after the user explicitly requests webpage conversion. No remote code is downloaded or executed.
```

### Host permission `file:///*`

```
Used only when the user opens a local Markdown file in Chrome (file://). A content script detects .md files, hands the text to the extension viewer, and resolves relative images next to that file. The user must also enable “Allow access to file URLs” on the extension details page. The extension does not scan the filesystem in the background.
```

### Host permission `https://raw.githubusercontent.com/*`

```
Fetches raw Markdown (and sibling files in a GitHub repo) when the user pastes a GitHub blob, tree, repo, or raw URL into “Open remote link”.
```

### Host permission `https://api.github.com/*`

```
Calls the GitHub API to list Markdown files in a repository after the user opens a GitHub repo or folder URL, so the sidebar can show the file tree. No GitHub token is stored; unauthenticated public API is used.
```

### Optional host permission `https://*/*`

```
Requested at runtime only when the user pastes a Markdown URL that is not GitHub. Chrome’s permission prompt is shown for that host. The extension does not have access to all websites by default and does not run on arbitrary browsing.
```

---

## Remote code

选：**No, I am not using remote code.**

说明（若出现文本框）：

```
Mozilla Readability, Turndown, KaTeX, Mermaid, and PlantUML are bundled under vendor/ and execute locally. The extension does not load scripts from the network.
```

---

## Data usage / certification（勾选）

网页转换会处理 **Website content（网站内容）**，最近阅读还会保存用户主动打开的来源网址。不得仅因为数据只保存在本机，就将「收集或使用数据」一律填为 No 或全部不勾选。

按后台当前定义披露网站内容以及实际保存的来源网址 / 最近阅读数据；明确用途为用户主动发起的阅读、转换和本地历史恢复，不上传给开发者，不用于广告或画像。不要宣称读取完整浏览历史，扩展并无 history 权限。

Google 官方说明：即使数据仅在本机处理或保存，也要披露处理方式：
https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/

认证声明全部勾选同意（Limited Use、不出售、不用于无关目的等）。以后台当前英文原文为准。

---

## 其他 Privacy 常见项

- **Justify permissions that are not obvious**：见上面各段。
- **Host permissions disclosure**：商店详情里会自动带上；描述中已写明 GitHub 与按需授权。

## 支持网址

```
https://whisper-xiang.github.io/leaflet-mark-view/support.html
```

修改根目录 PRIVACY.md 后运行 `node scripts/build-privacy.mjs`，再提交 docs/privacy.html，以保持在线政策与源码一致。
