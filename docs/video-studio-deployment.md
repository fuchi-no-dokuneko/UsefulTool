# Build and run Timeline Video Studio

The editor is a static browser application. No media upload, server renderer, account, microphone permission, or framework runtime is required. Its files are isolated under `assets/pages/video-studio/` and `assets/pages/video-editor.js`.

## Existing UsefulTool Pages site

Serve `video-editor.html` and its referenced assets with the existing static site. Build the downloadable offline copy with:

```sh
npm ci --prefix tests/video-studio
node scripts/build-video-codecs.mjs
node scripts/build-video-studio.mjs
```

The codec builder bundles pinned local Mediabunny and SoundTouchJS dependencies, retaining their license text and source-package links. The studio builder updates only `offline/video-editor.html` and that page's checksum in `offline/manifest.json`. It also produces a separate `build/video-studio/` directory containing only the studio. Runtime use does not contact a CDN.

## Standalone Cloudflare Worker

The separate `wrangler.video-studio.jsonc` configuration uses [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) and [asset headers](https://developers.cloudflare.com/workers/static-assets/headers/). It requires no Worker script or binding for media storage. To preview with an installed Wrangler CLI:

```sh
wrangler dev --config wrangler.video-studio.jsonc
```

To publish when ready:

```sh
wrangler deploy --config wrangler.video-studio.jsonc
```

The configuration passed `wrangler deploy --dry-run --config wrangler.video-studio.jsonc` using Wrangler 4.131.1 on September 13, 2026. No deployment is performed by the build or test commands. The standalone entry point is `/`, with the same editor at `/video-editor`.

## Offline and project recovery

Download `offline/video-editor.html` and open it directly in a browser. JavaScript and styles are embedded. Media files are still chosen locally. Saving a `.utvproj` stores the edit, while imported files are cached in IndexedDB for refresh recovery in the same tab session. Reloading offers **Continue last project**. A missing or browser-evicted file has a **Relink file** action and must match its name, size and SHA-256. Browser restart recovery is not guaranteed.

Exports use a fixed project clock and WebCodecs encoding. Every composed frame is submitted with its timestamp; processing may take longer than playback without reducing the output frame rate. Quick, Standard and Original quality presets share the preview compositor and audio mapping/gain/limiter rules. Available WebM VP9/Opus, WebM VP8/Opus and MP4 H.264/AAC choices depend on actual encoder support. A browser without both video and audio WebCodecs encoders can still edit, but cannot export through this path.

Imported videos start with linked original sounds. All simultaneously audible original sounds and music count toward a three-source limit. A conflicting timeline offers **Review overlapping sounds** and **Mute extra sounds**; moving, trimming or muting a sound resolves the conflict without discarding its source. **Separate sound** retains independent audio speed and repeat editing.

## Video-only checks

```sh
npm ci --prefix acceptance
npm ci --prefix tests/video-studio
node scripts/build-video-codecs.mjs
node scripts/build-video-studio.mjs
npm test --prefix tests/video-studio
npm run --prefix tests/video-studio check:help
npm run --prefix tests/video-studio test:browser
npm run --prefix tests/video-studio test:long-playback
npm run --prefix tests/video-studio test:release
```

Browser checks use the repository's Selenium dependency in `acceptance/`, FFmpeg-generated local fixtures, Chromium and a matching ChromeDriver. `CHROME_BINARY` and `CHROMEDRIVER_PATH` can override the executables. Reports and screenshots are written to `build/reports/video-studio/`.

The release command retains `release-standard.webm`, browser/download evidence in `release.json`, and independent FFprobe/FFmpeg results in `release-export-verification.json`. See [the release gate](video-studio-release-gate.md) for thresholds and the original-media limitation. Generated fixtures and exported movies are local test artifacts, not repository assets.

The existing Cloudflare Pages workflow calls the reusable Video Studio acceptance workflow. Deployment requires both the shared-site/coverage job and the full video release gate, including the 113.3-second exported-file verification, to succeed. The video workflow can also be run manually.
