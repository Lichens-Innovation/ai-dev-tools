# PDF rendering inside a sandbox

Read this when `scripts/render-pdf.sh` exits `3`. Fix what is listed, tell the user what is missing, and do not widen the sandbox yourself. Package installs never fit the sandbox: ask the user to run them with `!`.

| Symptom | Cause | Fix |
|---|---|---|
| Chrome exits at once, no PDF, "Operation not permitted" | Chrome's own sandbox cannot nest inside Seatbelt or a container | The script already retries with `--no-sandbox` (safe: the page is the local file it generated) |
| Chrome fails writing its profile | Default profile dir is not writable | The script uses `--user-data-dir` in `$TMPDIR`; keep the HTML and PDF paths writable too |
| No page numbers, margins ignored | Chrome older than 131, or the Playwright fallback was used (it ignores `@page` margins) | Content is still correct; tell the user the footer or margins differ, or have them upgrade Chrome |
| Backgrounds or colours missing | A renderer that ignores `print-color-adjust: exact` | Use Chrome; the template already sets the property |
| Images missing in the PDF | Image `src` not next to the HTML, or the file is empty | Re-extract the PNG; check it is non-empty |
| `google-chrome` not found though installed (macOS) | The binary is inside the `.app` bundle, not on `PATH` | The user sets `CHROME_BIN` to the bundle's `Contents/MacOS/Google Chrome`, or symlinks it onto `PATH` |

Last resort: leave the finished HTML at `$TMPDIR/release-report/report.html`, tell the user its path, and suggest opening it in a browser and printing to PDF.
