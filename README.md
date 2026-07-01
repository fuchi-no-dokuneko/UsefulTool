# UsefulTool

UsefulTool is a Cloudflare Pages-ready static tool collection. It is designed as a private, portable browser toolkit: pages use browser APIs and pinned local dependencies, and do not send user data to any API.

## Pages

- `index.html` - Intro and navigation.
- `image-converter.html` - JPG/PNG converter with canvas background removal and manual alpha mask brushing.
- `calculator.html` - Scientific calculator with trig functions and Simpson-rule definite integration.
- `unit-converter.html` - Offline converter covering 18 common, scientific, mechanical, and digital measurement categories.
- `metadata-lab.html` - Local file or Base64 JPEG/PNG/WebP/GIF/TIFF/BMP/HEIF/AVIF/MP4/WebM inspection with EXIF/GPS, XMP, ICC, IPTC, text metadata, and privacy-risk decoding.
- `base64-converter.html` - UTF-8/file Base64 encoder and standard, URL-safe, or Data URI decoder.
- `file-diff.html` - Side-by-side line diff and unified patch export using vendored jsdiff.
- `word-count.html` - Live word, character, sentence, paragraph, line, reading-time, and frequency analysis.
- `rot-cipher.html` - Caesar/ROT13/ROT47 transformer, all-shift analysis, and random password input generation.
- `lan-chat.html` - Manual-signaling WebRTC room for direct peer text and image transfer.
- `image-editor.html` - Multi-image Fabric.js canvas with layer transforms and quality-controlled export.
- `pdf-merge.html` - Ordered PDF and selected-page merge using pdf-lib.
- `images-to-pdf.html` - Ordered image-to-PDF conversion with page, margin, caption, DPI, and quality controls.

Advanced tools load browser builds from `vendor/`; they never use runtime CDNs. Licenses and pinned versions are documented in `vendor/README.md`.
Every page links to a generated self-contained copy in `offline/`, so one downloaded HTML file includes the local styles and JavaScript it needs.

## Local Run

```bash
./serve-local.sh
```

The script serves the project on `http://0.0.0.0:8083`.

## Cloudflare Pages

Use these settings:

- Build command: leave empty
- Build output directory: `.`
- Root directory: leave empty when this repo is published by itself

The app is static-only. Runtime security headers are in `_headers`, and the pages include a restrictive Content Security Policy with `connect-src 'none'`.

## CI/CD

`.github/workflows/cloudflare-pages.yml` validates that the app has no obvious external runtime endpoints. It can deploy to Cloudflare Pages when these GitHub secrets and variables are set:

- Secret: `CLOUDFLARE_API_TOKEN`
- Secret: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `CLOUDFLARE_PROJECT_NAME`

If those values are not configured, the workflow still performs static validation and skips deployment.

## Credits

See [CREDITS.md](CREDITS.md) and `vendor/` for third-party library attribution and license texts.
