# Chrome 网上应用店 · Privacy 页粘贴稿

后台路径：Developer Dashboard → 你的扩展 → **Privacy**。

隐私政策 URL（推送 `PRIVACY.md` 到 GitHub 后即可用）：

```
https://github.com/whisper-xiang/leaflet-mark-view/blob/main/PRIVACY.md
```

---

## Single purpose（单一用途）

```
A local-first Markdown reader for Chrome. Users open a local folder, a local .md file, or a GitHub / HTTPS Markdown URL and read it in a dedicated viewer, with optional export to HTML, Word, or Confluence wiki markup. There is no account and no cloud sync.
```

中文备忘（不必贴到英文框，供你对照）：

> 在 Chrome 里本地阅读 Markdown。用户打开本地文件夹、本地文件或 GitHub / HTTPS 链接，在阅读器中阅读，并可导出 HTML、Word 或 Confluence。无账号、无云同步。

---

## Permission justifications（每个权限一段，用英文）

### `storage`

```
Stores reading preferences and a short-lived copy of Markdown text on the device (chrome.storage.session / IndexedDB / localStorage) so the viewer can restore the last file, theme, and scroll position. This data never leaves the browser.
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
KaTeX, Mermaid, and PlantUML are bundled under vendor/ and execute locally. The extension does not load scripts from the network.
```

---

## Data usage / certification（勾选）

**Does this item collect or use any user data?**  
若后台问「是否收集」，选 **No**（数据只留在用户设备，开发者收不到）。

若必须勾类别，保持全部不勾：

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity

认证声明全部勾选同意（Limited Use、不出售、不用于无关目的等）。以后台当前英文原文为准。

---

## 其他 Privacy 常见项

- **Justify permissions that are not obvious**：见上面各段。
- **Host permissions disclosure**：商店详情里会自动带上；描述中已写明 GitHub 与按需授权。
