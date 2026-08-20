# Test instructions（给审核员，用英文）

后台：Developer Dashboard → **Test instructions / 审核说明**。

```
How to test Leaflet Mark View (no account required).

A) Remote GitHub (fastest — does not need file:// access)

1. Install the extension.
2. Click the toolbar icon to open the viewer.
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

Notes
- No login, no sample credentials.
- Math / Mermaid / PlantUML engines are bundled; they do not call plantuml.com.
- Optional host permission https://*/* is requested only if you paste a non-GitHub https .md URL.
```
