# Chrome 网上应用店提交清单

扩展代码已经按上架要求收过一版。下面按顺序做**你必须亲手完成**的账号与上传步骤。文案和图都在本目录，直接粘贴 / 上传即可。

## 0. 生成图片（改截图后重跑）

在项目根目录：

```bash
python3 store/make-assets.py
```

会写出：

| 文件 | 用途 | 尺寸 |
|------|------|------|
| `store/icon-128.png` | 商店图标 | 128×128 |
| `store/screenshots/01-reader-light.png` | 截图 | 1280×800 |
| `store/screenshots/02-reader-dark.png` | 截图 | 1280×800 |
| `store/screenshots/03-math-diagrams.png` | 截图 | 1280×800 |
| `store/screenshots/04-confluence.png` | 截图 | 1280×800 |
| `store/promo/tile-440x280.png` | 小宣传图（必传） | 440×280 |
| `store/promo/marquee-1400x560.png` | 大横幅（可选） | 1400×560 |

这些文件**不要**打进扩展 zip。`./build.sh` 已按白名单打包，不会带上 `store/`。

## 1. 开发者账号（一次性）

1. 打开 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 同意协议，支付 **$5**
3. Google 账号开启 [两步验证](https://myaccount.google.com/signinoptions/two-step-verification)
4. 按提示完成身份核验（证件）
5. 免费个人扩展：Trader 选 **Non-trader**

## 2. 先把隐私政策推到 GitHub

商店要一个公网 HTTPS 链接。把本仓库（含根目录 `PRIVACY.md`）推到 `main` 后使用：

```
https://github.com/whisper-xiang/leaflet-mark-view/blob/main/PRIVACY.md
```

未推送之前不要提交审核。

## 3. 打 zip

```bash
./build.sh
```

得到项目根目录的 `leaflet-mark-view.zip`。不要把整个源码文件夹压进去。

## 4. 后台填表

New item → 上传 zip，然后按标签页填：

| 标签 | 打开这份稿 |
|------|------------|
| Store listing（中文） | [`listing-zh.md`](listing-zh.md) |
| Store listing（英文，可选） | [`listing-en.md`](listing-en.md) |
| Privacy | [`privacy-practices.md`](privacy-practices.md) |
| Distribution | 公开、免费；见 `listing-zh.md` 底部 |
| Test instructions | [`test-instructions.md`](test-instructions.md) |

Listing 图片上传：

1. 图标：`store/icon-128.png`
2. 截图（按文件名顺序，最多 5 张）：`store/screenshots/`
3. Small promotional tile：`store/promo/tile-440x280.png`
4. Marquee（可选）：`store/promo/marquee-1400x560.png`

## 5. 提交

点 **Submit for Review**。建议勾选审核通过后再手动 Publish，方便你先自己装一遍商店版。

首次审核常见几天到两周。`file://` 和可选 `https://*/*` 可能走人工审，把 Test instructions 填完整会快很多。

## 发布之后

1. 把 Chrome 商店链接补进根目录 `README.md`
2. GitHub Release 里同时挂 `leaflet-mark-view.zip` 与商店地址
3. 以后改版本：先改 `manifest.json` 的 `version`，再 `./build.sh`，后台上传新 zip
