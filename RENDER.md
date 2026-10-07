# Render Web Service

This project is ready for a Node.js/Express Web Service. No deployment or GitHub changes have been performed.

## Service settings

- Runtime: Node
- Build command: `npm ci --omit=dev && npm run setup:ocr`
- Start command: `npm start`
- Health check path: `/`
- Environment: `NODE_ENV=production`
- Node version: `.node-version` specifies the tested Node 24.21.0.

Let Render provide `PORT`. The existing Express server binds `0.0.0.0` and defaults to port 3000 locally. API requests use relative paths, and Express serves `public/` relative to `server.js`.

No OpenAI or Gemini key is required for any website function. Do not upload `.env` or paste keys into source files. The optional `check:openai` diagnostic script is separate from the web service and is not run during build/start.

## OCR assets and dependencies

Runtime dependencies include `tesseract.js`, `sharp`, and `jsqr`. Install optional dependencies normally: sharp needs its Linux native packages on Render. Do not use `--omit=optional` or copy Windows `node_modules` onto Render.

The build runs the existing `setup:ocr` script to ensure `ocr-data/tha.traineddata` and `ocr-data/eng.traineddata` exist before start. Internet access is needed at build time if those files are absent; uploaded slips are subsequently processed locally on the Render server without AI/bank API calls. The production install omits only development dependencies; `qrcode` is used solely to generate test images.

Before uploading the source, include all application files, `package-lock.json`, the complete `public/` directory (including fonts and license), OCR modules, `lan-network.js`, `.node-version`, and the setup script. Several files in this workspace are currently untracked; they must be included in the source uploaded for deployment. Do not include `.env`, `node_modules`, or runtime logs.

## History and validation

History remains in browser localStorage. Data saved on localhost does not automatically appear on a Render domain or a different browser. Opening history displays the stored plan without making a new calculation.

Local checks: `npm test` and `node --test lan-network.test.mjs` after installing development dependencies. Start locally with `npm start` (`npm.cmd start` in Windows PowerShell).

Hosting compatibility has been checked locally; actual Linux/Render build and resource limits still need confirmation during deployment. No deploy, commit, push, database, or UI changes are part of this preparation.

References: https://render.com/docs/deploy-node-express-app and https://render.com/docs/node-version
