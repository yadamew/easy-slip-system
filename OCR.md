# Local slip OCR

`/api/split-slip` first scans the image locally with jsQR, then reads printed text using the existing Tesseract.js (Thai + English) and sharp pipeline. Images are processed in memory on the Node.js server. No OpenAI, Gemini, or bank verification API is called, and no API key is needed.

QR support is conservative: extract a THB amount from a CRC-valid EMV payment QR when present. Bank slip QR codes often contain only a verification reference or URL; those are never fetched or treated as an amount, so OCR reads the printed slip instead. QR amounts are suggestions to review, not proof of a completed transfer. If QR and OCR amounts conflict, the response includes a warning and the user must check the editable amount.

Start with `npm.cmd start`. The language files are installed in `ocr-data/`. To restore them on another machine, run `npm.cmd run setup:ocr` once with internet access. After that, reading slips works offline. Keep these files with the project.

Upload JPEG, PNG or WebP up to 10 MB. Images over 20 million pixels or damaged images are rejected. One bilingual OCR request runs at a time; simultaneous requests receive the existing busy response and can use manual entry. Each OCR job has a 90-second time limit.

The endpoint returns `fields` with only detected values (`amount`, `date`, `time`, `sender`, `recipient`), `rawText`, `confidence`, `needsManualAmount`, `source`, `qrDetected`, optional `warning`/`qrNotice`, and the existing `aiResult` text for compatibility. Missing language data or OCR failure preserves any QR fields and allows manual entry. Invalid uploads remain errors, but the frontend opens its existing manual amount card so users can continue. Always review the extracted values against the original slip before confirming the split.

`npm.cmd test` starts the actual server and tests the endpoint with QR images, QR-to-OCR fallback, generated text images, empty images and invalid uploads while external fetch is blocked. It also tests all four existing budget goals and upload/manual-review/split UI handlers. The `qrcode` development dependency generates test images only.

## Multi-format improvements

`slip-parser.js` separates Thai/English amounts, validated numeric/Thai/English dates, time, labelled sender/recipient names and references. `dateISO` normalizes BE/CE dates without replacing the displayed source date. Recent two-digit years 40–99 are interpreted as BE and 00–39 as CE; ambiguous or unusual dates require review.

The OCR pipeline flattens transparency, applies EXIF rotation, bounds resolution, enlarges small images, detects dark backgrounds, normalizes contrast and sharpens. If the first pass has no amount or low confidence, it tries thresholding and sparse-text segmentation. Conflicting OCR amounts require manual entry. Results always require user review and never certify a genuine transfer.

The context-aware extractor in `slip-amount.js` fixes Thai NFKC `ำ` decomposition, spaced digit groups and punctuation. It scores labels, nearby labels, currency and standalone decimals, excludes account/phone/reference/fee/balance/date/time context around each token, and compares candidates rather than taking the largest value. Scores are deterministic heuristics, **not calibrated probabilities**. `slip-result.js` reconciles OCR passes: a materially stronger labelled reading can survive a weak alternative, while similarly credible conflicts or QR/text conflicts omit the amount and request manual correction. No missing amount is replaced with zero.

The manual warning is `ไม่สามารถยืนยันยอดเงินอัตโนมัติ กรุณาตรวจสอบและกรอกยอดเงิน`. The response adds `amountConfidence` and diagnostic `amountCandidates`; the existing review/edit UI remains unchanged.

`slip-formats.test.mjs` contains synthetic OCR transcripts labelled K PLUS, SCB, Krungthai, Bangkok Bank, Krungsri, GSB, TrueMoney and generic wallet. These test extraction rules, not real bank screenshot recognition. No actual K PLUS new-layout image has been supplied, so support for that layout is **not verified**. Provide redacted real screenshots for each layout before claiming coverage.

Coverage also includes ttb and BAAC synthetic transcripts. `slip-regression.test.mjs` preserves previously readable formats and tests mixed amount contexts, normalization, low-confidence readings and conflicting passes. Endpoint tests perform actual OCR on generated synthetic PNG/JPEG/WebP images, dark/small images and blank images. Generated image OCR is distinct from testing genuine bank screenshots; none have been supplied here.

Run `bash verify-linux.sh` on Linux (or WSL) for an isolated fresh Node/dependency installation and actual QR/OCR endpoint tests. It copies only listed app files and assets, never `.env`. This checks Linux compatibility, not the deployed Render service's memory limits or performance.

The Linux check also runs `verify-ocr-memory.mjs`, a synthetic sequential-request resource probe. OCR preprocessing is capped at 1600×2400, sharp cache at 16 MiB, and concurrency at one OCR worker. This reduces peak RAM but cannot guarantee staying below Render Free's limit for every 20-megapixel upload or operating-system workload. Test actual workload on Render before claiming production readiness.
