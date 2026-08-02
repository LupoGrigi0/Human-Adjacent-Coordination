# Downloading Named Images from Instagram via Claude Browser Automation

**Author:** Claude Opus 4.7 (via browser extension)
**Date:** 2026-04-24
**Context:** Wolf & Squirrel (wolfsquirrel.cl) asset collection for a website build
**Collaborator:** LupoGrigi0

---

## The Goal

Given a set of open Instagram post tabs and a CSV with SEO-friendly filenames, download the primary image from each post saved with the descriptive filename (e.g. `gorra-celeste-floral-profile-WSGQCEJoo1.jpg`) instead of the CDN garbage name Instagram assigns (e.g. `670641333_18050693012535312_n.jpg`).

This note is written for future Claude instances (and human collaborators) who hit the same problem.

---

## What Did Not Work

### 1. gif_creator tool for named downloads
Tried start_recording -> screenshot -> stop_recording -> export with `download: true`. The tool consistently reported "0 frames captured" across multiple attempts. The recording system did not register screenshot tool calls as frames in this environment.

**Lesson:** gif_creator records user-interaction frames (clicks, navigation) for animated walkthroughs. It is not a general "save this screenshot as a named file" tool.

### 2. JavaScript anchor + data URL (no fetch)
Created an `<a>` element with `href = data:...`, `download = filename`, and clicked it programmatically. The click fired but no download appeared. Likely suppressed because Chrome requires a real user gesture for some programmatic download paths, or intercepted silently by the extension.

**Lesson:** Programmatic `a.click()` without a user gesture is unreliable.

### 3. External script injection (html2canvas)
Tried to inject `html2canvas` via a `<script src="...">` tag to render the page to canvas. Instagram's Content Security Policy blocked it — script failed to load.

**Lesson:** Instagram (and most major platforms) enforce strict CSP. You cannot pull in external libraries from a CDN at runtime on these domains.

### 4. fetch() with credentialed CORS mode
`fetch(imgSrc, { mode: 'cors', credentials: 'include' })` from a cold JavaScript context returned "Failed to fetch" against the `cdninstagram.com` domain.

**Lesson:** A cold cross-origin credentialed fetch to the CDN fails CORS.

### 5. fetch() with no-cors mode
`fetch(imgSrc, { mode: 'no-cors' })` returned an opaque response (blob size: 0). Useless for downloading.

**Lesson:** `no-cors` produces opaque blobs that cannot be read or saved.

### 6. Canvas drawImage from DOM element
Drew the already-loaded `<img>` element onto a `<canvas>` and called `toDataURL()`. It produced a ~370KB data URL, but the download was still silent (no visible save). Cross-origin images also risk tainting the canvas depending on crossorigin attribute handling.

**Lesson:** Canvas is a workable fallback, but it re-encodes (quality loss) and did not solve the silent-download issue.

### 7. Ctrl+S (Save Page As)
Sent `ctrl+s` to trigger the native Save dialog. Nothing happened — the dialog never appeared. The extension context appears to intercept or swallow this shortcut.

**Lesson:** Native browser keyboard shortcuts that open OS dialogs are unreliable from the browser automation extension.

---

## What Worked

### Same-site fetch() from within the Instagram tab

**The key insight:** Instagram's CDN images DO have permissive CORS headers — but only when the request originates from the `instagram.com` origin. Since the browser tab is already on `instagram.com` (and logged in), a `fetch()` executed inside that tab via the `javascript_tool` effectively runs from `instagram.com` and is permitted.

Working snippet:

```javascript
async function downloadFirstLargeImage(filename) {
  const imgs = Array.from(document.querySelectorAll('img'));
    const mainImg = imgs.find(img =>
        img.naturalWidth >= 1000 && img.alt && img.alt.length > 5
          );
            if (!mainImg) return 'no image found';

              const response = await fetch(mainImg.src);
                const blob = await response.blob();

                  const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                      a.href = url;
                        a.download = filename;
                          document.body.appendChild(a);
                            a.click();
                              document.body.removeChild(a);
                                setTimeout(() => URL.revokeObjectURL(url), 2000);

                                  return 'done: ' + filename + ' (' + blob.size + ' bytes)';
                                  }
                                  ```

                                  **Why it works:**
                                  - The JS runs from the `instagram.com` page context (same-site).
                                  - Instagram's CDN replies with permissive CORS headers for authenticated sessions.
                                  - The resulting blob is same-origin, so an `<a download>` click is honored by Chrome.
                                  - The file saves silently to the user's default Downloads folder with the exact filename set by `a.download`.

                                  **Image-selection heuristic:**
                                  `imgs.find(img => img.naturalWidth >= 1000 && img.alt && img.alt.length > 5)` reliably picks the main post image (1440px wide on Instagram) while skipping profile avatars, icons, and suggested-post thumbnails.

                                  ---

                                  ## Results

                                  All 9 target images downloaded as full-resolution originals (not re-encoded screenshots):

                                  - maxi-scrunchie-pink-teal-top.jpg — 226 KB
                                  - diseno-con-proposito-tropical-cap-OR.jpg — 242 KB
                                  - gorra-cerditos-pink-lanyard-WSGQTPPoo1.jpg — 163 KB
                                  - gorra-celeste-floral-profile-WSGQCEJoo1.jpg — 130 KB
                                  - lanyards-colorful-display-chair.jpg — 503 KB
                                  - gorra-mapa-nautico-navy-WSCLIMPJoo1.jpg — 98 KB
                                  - gorra-catrina-skull-dark-WSGQCAJoo1.jpg — 205 KB
                                  - visualiza-esto-ad-tropical-cap-OR.jpg — 191 KB
                                  - procedimientos-consulta-scrunchie-lanyard.jpg — 156 KB

                                  A companion CSV `wolfsquirrel-instagram-images.csv` in this same directory maps each filename to its description and original Instagram post URL for cross-referencing and back-linking.

                                  ---

                                  ## Takeaways for Future Instances

                                  1. **Same-site fetch is the unlock.** If you need media from a platform, run `fetch()` from inside a tab already on that domain. Session cookies and CORS both line up naturally.

                                  2. **gif_creator is for walkthroughs, not file exports.** Do not try to bend it into a screenshot-to-named-file pipeline.

                                  3. **Silent downloads are often successful downloads.** Chrome saves `a.download` files straight to the Downloads folder with no UI. Absence of a visible dialog is not failure — verify by checking the folder.

                                  4. **CSP blocks external scripts on Instagram.** Work with what is already on the page. No html2canvas, no jsPDF injection.

                                  5. **`alt` text plus `naturalWidth >= 1000` is a reliable main-image selector on Instagram post pages.**

                                  6. **Always `await` the fetch.** Fire-and-forget async calls can produce partial or zero-byte blobs.

                                  7. **The collaboration model worked.** Claude handled the automation logic and filename orchestration; the human kept tabs open, monitored the Downloads folder, and flipped from Haiku to Opus when the task got gnarly. Neither side could have done it as efficiently alone.

                                  ---

                                  ## Related Files in This Directory

                                  - `wolfsquirrel-instagram-images.csv` — per-image descriptions and back-links for the website build
                                  - `browser-mcp.html`, `Continuance.html`, `index.html` — prior instance discoveries

                                  *Filed under `public/discoveries/` so it deploys to smoothcurves.nexus for the whole team.*
                                  