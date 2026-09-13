# Build and run Timeline Video Studio

The editor is a static browser application. No media upload, server renderer, account, microphone permission, or framework runtime is required. Its files are isolated under `assets/pages/video-studio/` and `assets/pages/video-editor.js`.

## Existing UsefulTool Pages site

Serve `video-editor.html` and its referenced assets with the existing static site. Build the downloadable offline copy with:

```sh
node scripts/build-video-studio.mjs
```

This command updates only `offline/video-editor.html` and that page's checksum in `offline/manifest.json`. It also produces a separate `build/video-studio/` directory containing only the studio.

## Standalone Cloudflare Worker

The separate `wrangler.video-studio.jsonc` configuration uses [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) and [asset headers](https://developers.cloudflare.com/workers/static-assets/headers/). It requires no Worker script or binding for media storage. To preview with an installed Wrangler CLI:

```sh
wrangler dev --config wrangler.video-studio.jsonc
```

To publish when ready:

```sh
wrangler deploy --config wrangler.video-studio.jsonc
```

No deployment is performed by the build or test commands. The standalone entry point is `/`, with the same editor at `/video-editor`.

## Offline and project recovery

Download `offline/video-editor.html` and open it directly in a browser. JavaScript and styles are embedded. Media files are still chosen locally. Saving a `.utvproj` stores the edit, while imported files are cached in IndexedDB for refresh recovery in the same tab session. Reloading offers **Continue last project**. A missing or browser-evicted file has a **Relink file** action and must match its name, size and SHA-256. Browser restart recovery is not guaranteed.

Exports use the browser's supported MediaRecorder formats, in real time. WebM duration is finalized for seeking. Quick, Standard and Original quality presets share the preview renderer and stereo mix. MP4 appears only when the browser can record it.

## Video-only checks

```sh
npm ci --prefix tests/video-studio
npm test --prefix tests/video-studio
npm run --prefix tests/video-studio check:help
npm run --prefix tests/video-studio test:browser
```

Browser checks use the repository's Selenium dependency in `acceptance/`, FFmpeg-generated local fixtures, Chromium and a matching ChromeDriver. `CHROME_BINARY` and `CHROMEDRIVER_PATH` can override the executables. Reports and screenshots are written to `build/reports/video-studio/`.
