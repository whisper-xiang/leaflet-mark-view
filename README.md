# Leaflet Mark View

[![Release](https://img.shields.io/github/v/release/whisper-xiang/leaflet-mark-view?label=release)](https://github.com/whisper-xiang/leaflet-mark-view/releases/latest)

在 Chrome 里，安静地读你的 Markdown。

> 本地文件夹、单篇文章、GitHub 远程仓库，拖进来就能读。本地渲染为主，不上传任何文件。

**[下载最新版](https://github.com/whisper-xiang/leaflet-mark-view/releases/latest)** — 获取 `leaflet-mark-view.zip`，解压后在 Chrome 扩展页加载（见下方「快速开始」）。


## 截图

### 阅读器

浅色 / 深色主题，侧边栏树形目录、全文搜索、大纲导航、KaTeX 公式、代码高亮、任务清单一应俱全。

<p align="center">
  <img src="public/image-1782547092964.jpg" alt="阅读器浅色主题" width="720">
  <br><br>
  <img src="public/image-1782547131784.jpg" alt="阅读器深色主题" width="720">
</p>

### 数学公式与流程图

Mermaid 流程图、LaTeX 公式均在本地渲染，无需联网。

<p align="center">
  <img src="public/image-1782547105837.jpg" alt="流程图与数学公式" width="720">
</p>

### 转 Confluence

设置 → **转换为 Confluence**，左侧可编辑 Markdown，右侧实时生成 Wiki Markup，支持复制与导出。

<p align="center">
  <img src="public/image-1782547099281.jpg" alt="Markdown 转 Confluence 弹框" width="720">
</p>


## 快速开始

### 安装（开发者模式）

**方式 A：下载 Release（推荐）**

1. 打开 [Releases](https://github.com/whisper-xiang/leaflet-mark-view/releases/latest)，下载 `leaflet-mark-view.zip`
2. 解压到任意目录
3. Chrome 打开 `chrome://extensions/`
4. 右上角开启 **开发者模式**
5. 点击 **加载已解压的扩展程序**，选择解压后的目录

**方式 B：克隆源码**

1. 下载 / 克隆本仓库
2. Chrome 打开 `chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择项目根目录

### 必须开启：允许访问文件网址

扩展详情页 → **允许访问文件网址**（Allow access to file URLs）

不开启则无法拦截本地 `.md` 文件，也无法读取同目录下的其他文件。

### 设置双击 `.md` 文件直接用本扩展打开

原理：将 Chrome 设为 `.md` 文件的默认应用，系统双击时会以 `file://` 路径在 Chrome 中打开，扩展自动拦截并渲染。

**macOS**

1. 在 Finder 中找到任意一个 `.md` 文件
2. 右键 → **显示简介**（或 `⌘I`）
3. 展开 **打开方式**，在下拉列表中选择 **Google Chrome**
4. 点击 **全部更改…** → 确认

之后双击任何 `.md` 文件，Chrome 会打开该文件的 `file://` URL，扩展自动跳转到阅读器。

**Windows**

1. 右键任意 `.md` 文件 → **打开方式** → **选择其他应用**
2. 选择 **Google Chrome**，勾选 **始终使用此应用打开 .md 文件**
3. 确认

**前提**：扩展已安装，且已开启 **允许访问文件网址**（见上方安装说明）。


## 使用

### 打开方式

| 方式 | 操作 |
|------|------|
| 文件夹 | 主页点击 **Open → Open Folder**，递归扫描全部 `.md` 文件 |
| 单文件 | 主页点击 **Open → Open File** |
| 远程链接 | 主页点击 **Open → Open URL**，粘贴 GitHub 仓库 / 文件页 / `.md` 直链 |
| 拖拽 | 把文件夹或 `.md` 文件拖到主页，松手即开 |
| 直接打开 | 在浏览器地址栏输入 `file://` 路径，扩展自动跳转渲染 |
| 继续阅读 | 再次打开时点击 **继续阅读**，打开最近读过的文件或文件夹 |

> **远程访问按需授权**：GitHub（`raw.githubusercontent.com` / `api.github.com`）已内置。打开其他网站的 `.md` 直链时，首次会弹出授权框，仅授予你确认的那个域名——扩展默认不持有「访问所有网站」的权限。

### 阅读器操作

| 操作 | 快捷键 / 位置 |
|------|--------------|
| 切换源码 / 预览 | `Ctrl+E` 或 Header 右上角代码图标 |
| 保存文件 | `Ctrl+S`（或 `⌘S`） |
| 切换主题 | Header 右上角月亮图标 |
| 字体大小 / 内容宽度 / 大纲 | Header 右上角设置齿轮 |
| 固定文件夹 | 侧栏顶部图钉按钮，固定后顶栏出现快捷分类 Tab |
| 侧边栏搜索 | 支持文件名 + 全文内容搜索 |
| 文档内跳转 | 点指向其他 `.md` 的相对链接，在阅读器内直接打开；脚注 / 页内锚点同页平滑滚动 |
| 转 Confluence | 设置齿轮 → **转换为 Confluence**，弹框展示 Wiki Markup，可一键复制 / 导出 `.txt` |
| 浏览器打开 | 设置齿轮 → **浏览器打开**，在新标签页以原生方式查看当前 Markdown |
| 回到主页 | 点击左上角 **Leaflet Mark View** Logo |


## 功能一览

- **全屏主页** — 水墨风背景，鼠标移入淡出操作区
- **文件夹浏览** — 递归扫描、树形展开，文件夹 / 文件 Tab 切换
- **远程 GitHub** — 粘贴仓库链接打开 README，侧栏列出仓库内全部 `.md`
- **全文搜索** — 搜索框同时匹配文件名与正文内容，命中片段高亮
- **GFM 渲染** — 管道表格与 HTML `<table>`、任务列表、删除线、脚注、emoji 短名、YAML front matter 卡片
- **数学公式** — `$…$` / `$$…$$` 由 KaTeX 本地渲染，无网络请求
- **流程图** — ` ```mermaid ` 代码块由 Mermaid 渲染，支持深浅主题
- **代码高亮** — 内置 JS / TS / Python / Go / Java / Bash / CSS / SQL 等
- **站内跳转** — 文件夹内 `.md` 相对链接、脚注、页内锚点都在阅读器内导航，不另开标签页
- **转 Confluence** — 一键把当前文档转成 Confluence Wiki Markup，弹框内可复制 / 导出
- **大纲导航** — 自动生成目录，滚动跟随高亮，点击平滑定位，侧栏宽度可拖拽调节
- **固定快捷入口** — 将常用文件夹固定到顶栏，一键切换子目录
- **源码编辑** — 原地编辑 Markdown，实时预览，支持保存回写
- **最近阅读** — 自动记录打开过的文件与文件夹，主页一键继续
- **阅读记忆** — 记住每个文件的滚动位置，下次打开自动恢复
- **深 / 浅色主题** — 带视图过渡动画的主题切换


## 安装要求

- Google Chrome（或 Chromium 内核浏览器，如 Edge）116+
- 需要浏览器支持 File System Access API（`showDirectoryPicker`）

---

作者：轻语 · [Releases](https://github.com/whisper-xiang/leaflet-mark-view/releases)
