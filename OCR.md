# Local slip OCR

`/api/split-slip` first scans the image locally with jsQR, then reads printed text using the existing Tesseract.js (Thai + English) and sharp pipeline. Images are processed in memory on the Node.js server. No OpenAI, Gemini, or bank verification API is called, and no API key is needed.

QR support is conservative: extract a THB amount from a CRC-valid EMV payment QR when present. Bank slip QR codes often contain only a verification reference or URL; those are never fetched or treated as an amount, so OCR reads the printed slip instead. QR amounts are suggestions to review, not proof of a completed transfer. If QR and OCR amounts conflict, the response includes a warning and the user must check the editable amount.

Start with `npm.cmd start`. The language files are installed in `ocr-data/`. To restore them on another machine, run `npm.cmd run setup:ocr` once with internet access. After that, reading slips works offline. Keep these files with the project.

Upload JPEG, PNG or WebP up to 10 MB. Images over 20 million pixels or damaged images are rejected. At most two OCR requests run concurrently; each recognition has a 90-second time limit.

The endpoint returns `fields` with only detected values (`amount`, `date`, `time`, `sender`, `recipient`), `rawText`, `confidence`, `needsManualAmount`, `source`, `qrDetected`, optional `warning`/`qrNotice`, and the existing `aiResult` text for compatibility. Missing language data or OCR failure preserves any QR fields and allows manual entry. Invalid uploads remain errors, but the frontend opens its existing manual amount card so users can continue. Always review the extracted values against the original slip before confirming the split.

`npm.cmd test` starts the actual server and tests the endpoint with QR images, QR-to-OCR fallback, generated text images, empty images and invalid uploads while external fetch is blocked. It also tests all four existing budget goals and upload/manual-review/split UI handlers. The `qrcode` development dependency generates test images only.
