# Test instructions（给审核员，用英文）

后台：Developer Dashboard → **Test instructions / 审核说明**。

```
How to test Leaflet Mark View (no account required).

A) Remote GitHub (fastest — does not need file:// access)

1. Install the extension.
2. Click the toolbar icon, then choose 打开阅读器 (Open reader).
3. Open → 打开远程链接 (Open remote link).
4. Paste this public repo URL and press Enter:
   https://github.com/whisper-xiang/leaflet-mark-view
5. The viewer should open the project README, with screenshots, headings, and the file tree if the GitHub API is reachable.

B) Local folder (File System Access picker)

1. In the viewer, Open → 打开文件夹 (Open folder).
2. Choose any folder that contains .md files.
3. Click a file in the sidebar; the document should render.

C) Optional: local file:// interception

This requires the reviewer to enable “Allow access to file URLs” on chrome://extensions → Leaflet Mark View.
Without that toggle, A and B still work. The permission is only for opening disk .md files in Chrome.

D) Webpage capture (activeTab + scripting + contextMenus)

1. Open a normal HTTP/HTTPS article and wait for its text to load.
2. Right-click the page and choose 用 Leaflet 阅读当前网页 (Read current webpage with Leaflet).
3. The original tab stays open. A new reader tab displays Markdown with a source link.
4. Return to the article and press Alt+Shift+M (Option+Shift+M on macOS). The same conversion runs. Customize at chrome://extensions/shortcuts if the default key is occupied.
5. The toolbar popup also provides 阅读当前网页 (Read current webpage).
6. Reload the reader or reopen the capture via 最近阅读 (Recent documents); the saved Markdown is restored locally.
7. Protected browser pages, extension store pages, PDFs, and empty pages are unsupported and show an explanatory message.

E) Auto-scroll

1. Open a long document and click the auto-scroll icon in the reader toolbar.
2. Adjust the speed slider and start scrolling. The panel closes and the document scrolls.
3. Scroll manually to pause. Esc closes an open panel first; without a panel it pauses scrolling.
4. Enable loop to restart at the top when reaching the bottom. Without loop the reader stops at the bottom.

Notes
- No login, no sample credentials.
- Math / Mermaid / PlantUML engines are bundled; they do not call plantuml.com.
- Optional host permission https://*/* is requested only if you paste a non-GitHub https .md URL.
```
