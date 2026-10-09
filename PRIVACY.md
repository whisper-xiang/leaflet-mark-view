# Leaflet Mark View 隐私政策

生效日期：2026-10-09<br>
开发者：轻语  
扩展主页：https://github.com/whisper-xiang/leaflet-mark-view  
联系：请通过 [GitHub Issues](https://github.com/whisper-xiang/leaflet-mark-view/issues) 联系。

Leaflet Mark View（「本扩展」）是一款在 Chrome 中阅读 Markdown 的工具。本政策说明本扩展如何处理数据。

## 我们收集什么

**本扩展会在本机处理用户主动打开的文档与网页正文，但不将这些内容收集到开发者服务器，不上传或出售用户的个人数据。**

没有账号系统，没有分析 SDK，没有广告，也没有开发者服务器。Markdown 解析、数学公式、Mermaid、PlantUML 均在你的浏览器本地完成。

## 仅保存在本机的数据

以下信息只写在你的浏览器里，不会发送给开发者或其他方：

- 最近打开的文件夹 / 文件 / 远程链接记录，以及主动转换的网页标题、来源网址与 Markdown 正文（IndexedDB，最近阅读最多 20 条；移除或自动清理记录时同步删除网页摘录）
- 固定文件夹、自定义背景图（IndexedDB）
- 主题、字体、字号、大纲开关、阅读位置（localStorage）
- 打开某个文件时的临时文本缓存（`chrome.storage.session`，关闭浏览器即清除）

你可以随时通过 Chrome 的「清除网站数据」或移除扩展来删除这些数据。

## 何时会访问网络

只有在你主动操作时才会发网络请求：

1. **打开 GitHub 链接**  
   向 `api.github.com` 和/或 `raw.githubusercontent.com` 请求仓库目录或 Markdown 正文。
2. **打开其他网站的 `.md` 直链**  
   首次使用时 Chrome 会弹出授权，仅授予你确认的那个域名。扩展默认不拥有「访问所有网站」的权限。
3. **GitHub 仓库的 README 徽章等远程图片**  
   若文档本身引用了 `https` 图片，浏览器会按图片地址加载。

打开本地文件夹或本地文件时，内容不会上传。

## 网页正文转换

通过扩展弹框、网页右键菜单或快捷键主动使用「阅读当前网页」时，扩展通过 `activeTab` 临时权限读取当前标签页已加载的正文，在本机提取文章并转换为 Markdown。不自动读取其他标签页，不上传正文，也不调用在线转换服务。转换后的文档保存在最近阅读中；阅读时，原文中的远程图片可能按原地址加载。

## 本地文件访问

本扩展申请 `file://` 主机权限，用于：

- 当你用 Chrome 直接打开本地 `.md` 文件时，拦截并在阅读器中渲染
- 读取 Markdown 同目录下的相对路径图片

Chrome 仍要求你在扩展详情页额外开启 **「允许访问文件网址」**。未开启时，本地 `file://` 拦截不会生效；你仍可用阅读器内的「打开文件夹 / 打开文件」。

## 权限摘要

| 权限 | 用途 |
|------|------|
| `storage` | 在本机保存临时文本与偏好 |
| `activeTab` | 主动点击扩展后临时读取当前网页正文 |
| `scripting` | 主动转换时运行本地打包的正文提取和 Markdown 转换脚本 |
| `contextMenus` | 在普通网页右键菜单中提供「用 Leaflet 阅读当前网页」入口 |
| `file:///*` | 拦截并阅读本地 Markdown 及同目录图片 |
| `raw.githubusercontent.com` / `api.github.com` | 打开 GitHub 仓库或文件 |
| 可选 `https://*/*` | 仅在你粘贴其他站点的 `.md` 链接并同意后，访问该域名 |

## 数据分享与保留

不与第三方分享用户数据。没有云端副本，因此也没有「从开发者服务器删除」的流程；卸载扩展或清除浏览器数据即可。

## 数据用途限制

本扩展遵循 Chrome 网上应用店用户数据政策，包括 Limited Use 要求。读取的文档、网页正文与来源网址仅用于用户主动使用的阅读、转换、导出和最近阅读功能，不用于广告或用户画像。开发者不接收或人工查看这些内容。

## 儿童

本扩展不面向 13 岁以下儿童，也不故意收集儿童信息。

## 政策变更

若处理方式发生变化，会更新本页并调整「生效日期」。继续使用即表示你了解更新后的政策。

---

# Privacy Policy (English)

Effective date: 9 October 2026<br>
Developer: 轻语 (Qingyu)  
Homepage: https://github.com/whisper-xiang/leaflet-mark-view  
Contact: [GitHub Issues](https://github.com/whisper-xiang/leaflet-mark-view/issues)

Leaflet Mark View (the “Extension”) is a Chrome Markdown reader. This policy describes how data is handled.

## What we collect

**The Extension processes documents and webpage content that the user chooses to open on their device. It does not collect that content on developer servers, upload it, or sell personal data.**

There is no account system, analytics SDK, advertising, or developer backend. Markdown parsing, math (KaTeX), Mermaid, and PlantUML all run locally in your browser.

## Data stored only on your device

The following stays in your browser and is never sent to the developer:

- Recent folders / files / remote URLs and explicitly captured webpage titles, source URLs, and Markdown text (IndexedDB; shared limit of 20 recent entries; removing or trimming an entry deletes its capture)
- Pinned folders and a custom background image (IndexedDB)
- Theme, font, font size, outline, and reading position (localStorage)
- Temporary file text while opening a document (`chrome.storage.session`, cleared when the browser session ends)

You can delete this data by clearing site data for the Extension or by uninstalling it.

## When the network is used

Network requests happen only after you take an action:

1. **Opening a GitHub URL** — requests to `api.github.com` and/or `raw.githubusercontent.com`.
2. **Opening a `.md` URL on another site** — Chrome prompts you the first time; only the host you approve is granted. The Extension does not ship with access to all websites.
3. **Remote images referenced by a document** — the browser loads `https` image URLs that appear in the Markdown itself.

Local folders and local files are not uploaded.

## Webpage conversion

When you choose “阅读当前网页” (Read current webpage) through the popup, webpage context menu, or keyboard shortcut, temporary `activeTab` access allows the Extension to read the loaded page. The `contextMenus` permission provides the webpage right-click entry. Bundled scripts run via `scripting` to extract and convert its article locally. It does not automatically read other tabs, upload article text, or use an online conversion service. Captures are saved in recent documents. Remote images may be loaded from their original URLs while reading.

## Local file access

The `file://` host permission is used to:

- Intercept a local `.md` file opened in Chrome and render it in the viewer
- Load images next to that Markdown file

Chrome still requires **“Allow access to file URLs”** on the extension details page. If that toggle is off, `file://` interception is disabled; you can still use Open Folder / Open File inside the viewer.

## Data sharing and retention

User data is not shared with third parties. There is no cloud copy, so there is no server-side deletion request. Uninstalling the Extension or clearing browser data removes local records.

## Limited use

The Extension adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Documents, webpage content, and source URLs are used only for user-initiated reading, conversion, export, and recent-document features, not advertising or user profiling. The developer does not receive or manually review that content.

## Children

The Extension is not directed at children under 13 and does not knowingly collect their information.

## Changes

If this policy changes, we will update this page and the effective date.
