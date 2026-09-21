# UsefulTool

A static browser toolkit for Cloudflare Pages and self-contained offline HTML. Files and text are processed locally; tools do not upload user data. Dependencies and their licenses are bundled in `vendor/`.

## Pages

- `index.html`: tool navigation.
- `image-converter.html`: conversion, background removal and alpha masks.
- `calculator.html`: scientific calculation and numerical integration.
- `unit-converter.html`: unit conversions.
- `metadata-lab.html`: image/video metadata inspection, erasure and injection.
- `base64-converter.html`: text/file Base64 conversion.
- `file-diff.html`: text comparison and patches.
- `word-count.html`: text editor, independent saved drafts, formatting and counts.
- `text-transfer.html`: text upload/download and editor handoff.
- `rot-cipher.html`: ROT ciphers and password generation.
- `lan-chat.html`: direct WebRTC text and image exchange.
- `image-editor.html`: layered image editing.
- `pdf-merge.html`: ordered PDF/page merging.
- `images-to-pdf.html`: image pages and Unicode filename captions.
- `pdf-to-text.html`: embedded text extraction with page ranges, without OCR.
- `video-editor.html`: layered timelines, linked picture/sound, Undo/Redo, desktop L/R routing and waveforms. Interval exports stream into one `<project>-segments.zip` containing numbered WebM files, with progress and cancellation.

## Run and build

The existing local entry is `./serve-local.sh` (port 8083). Each page's Download HTML link provides its standalone `offline/` copy.

```sh
node scripts/build-offline.mjs
node scripts/verify-hosted.mjs
node scripts/verify-offline.mjs
npm test --prefix tests/video-studio
npm run test:browser --prefix tests/video-studio
npm run test:stereo-segments --prefix tests/video-studio
```

Acceptance servers use IPv4 and a generated self-signed HTTPS certificate in `build/test-tls/`. Browser and Node V8 measurements feed the existing 95% coverage gate. See [acceptance evidence](docs/video-studio-stereo-segments-uat.md) and [licenses](CREDITS.md).

## Deployment

Cloudflare Pages settings remain: empty build command, output directory `.`, empty root directory. Runtime headers are in `_headers`. CI tests the generated artifact before deployment using the existing Cloudflare account/project configuration.

繁體中文：靜態工具在瀏覽器本機處理檔案，提供獨立離線 HTML。桌面影片編輯支援左右聲道、連接淡化及單一分段 ZIP。入口及部署方式保持不變；本次未部署。驗收及授權見上方連結。

简体中文：静态工具在浏览器本地处理文件，提供独立离线 HTML。桌面视频编辑支持左右声道、连接淡化及单一分段 ZIP。入口及部署方式保持不变；本次未部署。验收及许可证见上方链接。
