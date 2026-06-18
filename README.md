# Leaflet Mark View

一款 Chrome 扩展，用于在浏览器中浏览和预览本地 Markdown 文件。支持文件夹浏览、GFM 渲染、代码高亮、大纲导航与深浅色主题。

## 功能特性

- **文件夹浏览** — 通过 File System Access API 选择本地文件夹，递归扫描并展示所有 `.md` / `.markdown` / `.mdown` / `.mkd` 文件
- **单文件打开** — 直接选择单个 Markdown 文件阅读
- **自动拦截** — 在 Chrome 中直接打开 `file://` 协议的 Markdown 文件时，自动跳转到阅读器渲染
- **GFM 兼容** — 支持表格、任务列表、引用、删除线、图片与链接等常见语法
- **代码高亮** — 内置 JavaScript、TypeScript、Python、Go、Java、Bash、CSS、SQL 等语言的语法高亮
- **大纲导航** — 根据标题自动生成目录，支持滚动定位
- **阅读体验** — 四种内容宽度（窄 / 中 / 宽 / 全宽）、深色 / 浅色主题切换、侧边栏搜索过滤
- **会话记忆** — 记住上次打开的文件夹，下次启动时可快速恢复

## 安装

### 从源码加载（开发者模式）

1. 克隆或下载本仓库到本地
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择项目根目录

### 重要：启用文件 URL 访问

安装后，在扩展详情页开启 **允许访问文件网址**（Allow access to file URLs）。

此项为必需设置，否则以下功能无法正常工作：

- 在浏览器中直接打开本地 `.md` 文件时的自动拦截
- 通过 `file://` 路径读取同目录下的其他 Markdown 文件

## 使用方式

### 方式一：扩展弹窗

点击工具栏中的 Leaflet Mark View 图标，选择 **打开阅读器**，在阅读器页面中：

- **Open Folder** — 选择文件夹，浏览其中所有 Markdown 文件
- **Open File** — 选择单个 Markdown 文件

### 方式二：直接打开本地文件

在文件管理器中双击 `.md` 文件，或在 Chrome 地址栏输入 `file://` 路径打开。扩展会自动拦截原始文本页面，跳转到阅读器进行渲染。

### 方式三：阅读器内操作

| 操作 | 说明 |
|------|------|
| 侧边栏文件树 | 点击文件切换阅读内容，点击文件夹展开 / 折叠 |
| 搜索框 | 按文件名过滤侧边栏列表 |
| 大纲面板 | 点击标题快速跳转，当前章节高亮跟随滚动 |
| 宽度按钮 | 循环切换内容区域宽度 |
| 主题按钮 | 切换深色 / 浅色主题 |
| 侧边栏 / 大纲按钮 | 显示或隐藏对应面板 |

## 项目结构

```
leaflet-mark-view/
├── manifest.json      # Chrome 扩展清单（Manifest V3）
├── background.js      # Service Worker，处理 tab 跳转
├── content.js         # 内容脚本，拦截 file:// 下的 .md 页面
├── markdown.js        # Markdown 解析器（GFM）与语法高亮
├── viewer.html        # 阅读器主页面
├── viewer.js          # 阅读器逻辑（文件树、主题、大纲等）
├── viewer.css         # 阅读器样式
├── popup.html         # 扩展弹窗页面
├── popup.js           # 弹窗逻辑
└── icons/             # 扩展图标（16 / 48 / 128）
```

## 技术说明

- **Manifest V3** — 使用 Service Worker 作为后台脚本
- **File System Access API** — 读取本地文件夹与文件（需用户授权）
- **chrome.storage.session** — 在内容脚本跳转时暂存 Markdown 原文
- **零外部依赖** — Markdown 解析与语法高亮均为自研实现，无需 npm 构建

## 浏览器兼容性

仅支持 **Google Chrome**（及基于 Chromium 的浏览器，如 Edge）。

需要浏览器支持：

- Manifest V3 扩展
- File System Access API（`showDirectoryPicker` / `showOpenFilePicker`）
- `chrome.storage.session`

## 作者

轻语

## 版本

v1.0.0
