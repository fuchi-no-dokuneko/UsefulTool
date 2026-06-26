# UsefulTool

UsefulTool is a Cloudflare Pages-ready static tool collection. It is designed as a private, portable set of single-file HTML tools: every page keeps its CSS and JavaScript inline, uses browser APIs only, and does not send user data to any API.

## Pages

- `index.html` - Intro and navigation.
- `image-converter.html` - JPG/PNG converter with canvas background removal and manual alpha mask brushing.
- `calculator.html` - Scientific calculator with trig functions and Simpson-rule definite integration.
- `unit-converter.html` - Offline unit converter for common measurement categories.
- `metadata-lab.html` - Image/video metadata inspection, erasing, and controlled injection for supported formats.

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
