# "Anatomia strony WWW" — Plan & Specification

An educational web app that makes the invisible visible: a learner pastes **any** website
URL and sees two things side by side — **how much the page weighs** (real numbers from
Google) and **what the page is actually made of** (the same page re-rendered with CSS / JS /
images / fonts switched off). The two halves are deliberately independent and use different
techniques, because each is good at a different job.

> **Interface language: Polish only.** All user-facing copy is in Polish (see §6 for the
> string dictionary). This engineering spec is in English for the build team; the *product*
> a learner sees is entirely Polish. Working product name: **„Anatomia strony WWW".**

---

## 1. Learning goals

By the end of a session, a learner should understand that:

1. **A "page" is not one file.** A single URL pulls down dozens of resources — HTML, CSS,
   JS, images, fonts.
2. **Each layer has a job.** HTML = structure/content, CSS = presentation, JS = behaviour,
   images/fonts = assets. The app proves it by *removal*: strip CSS and the content is still
   all there, just unstyled.
3. **Everything has a weight.** More files and more bytes = slower loads, especially on weak
   connections. The size panel makes the cost concrete and per-type.
4. **Modern pages lean on JavaScript.** Turn JS off on a React/Vue site and it's nearly blank
   — a vivid lesson in how much work the browser does after the HTML arrives.
5. **Progressive enhancement.** HTML alone carries the content; CSS and JS *enhance* it.

**Target audience:** non-technical / early-technical Polish learners — web-literacy classes,
intro courses, "jak działa internet" executive sessions.

---

## 2. Core architecture — two independent panels

The single most important design decision: **split "weight" from "appearance"** and let each
use the technique it's actually good at. One URL bar feeds both panels; neither depends on the
other (if one fails, the other still works).

```
                        ┌─────────────────────────────────────┐
                        │  Adres:  [ https://… ]  [ Analizuj ] │
                        └─────────────────────────────────────┘
                                  │                    │
                 ┌────────────────┘                    └────────────────┐
                 ▼                                                       ▼
   ┌──────────────────────────────┐                  ┌──────────────────────────────┐
   │  PANEL A — WAGA STRONY        │                  │  PANEL B — WYGLĄD STRONY      │
   │  (size / weight)              │                  │  (appearance)                 │
   │                               │                  │                               │
   │  source: PageSpeed Insights   │                  │  source: CORS-proxy + srcdoc  │
   │  real numbers, any URL        │                  │  re-render with layers off    │
   │  → requests, KB, by type      │                  │  → CSS / JS / Obrazy / Czcionki│
   │  READ-ONLY (toggles do NOT    │                  │  toggles change APPEARANCE     │
   │  change these numbers)        │                  │  ONLY — never the numbers      │
   └──────────────────────────────┘                  └──────────────────────────────┘
```

Why split:

- **Weight** needs *real measured bytes* of an arbitrary site — only achievable server-side.
  Google's PageSpeed Insights already does that and exposes it via a free API, so Panel A
  needs no backend of our own. But PSI returns a *report*, not a page you can manipulate.
- **Appearance** needs a page whose markup we can *strip layers from*. We fetch the raw HTML
  through a proxy and re-render it ourselves — but this can't measure sizes reliably. That's
  fine: **Panel B never shows sizes, only appearance** (per the design decision — toggling
  CSS/JS off changes how it looks, not any number).

**Recommended stack:** plain **HTML + CSS + vanilla JS**, no build step. For a tool *about*
how the web works, readable View Source is itself a lesson. No backend required for the MVP.

---

## 3. Panel A — Page weight (PageSpeed Insights API)

**Endpoint (GET, callable straight from the browser):**

```
https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<URL>&strategy=mobile&locale=pl
```

- Works **without an API key** for light use; add a key later if classroom volume hits quotas.
- `locale=pl` returns Lighthouse strings in Polish where applicable.
- The audit we care about is **`resource-summary`** — a per-type table of request count and
  transfer size, plus a `total` row. That *is* the size panel.

**Reading it:**

```js
async function getWeight(targetUrl) {
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  const res = await fetch(`${api}?url=${encodeURIComponent(targetUrl)}&strategy=mobile&locale=pl`);
  if (!res.ok) throw new Error("PSI_FAILED");
  const json = await res.json();

  const items = json.lighthouseResult.audits["resource-summary"].details.items;
  // items example:
  // [{resourceType:"total",      requestCount:53, size:1020688},
  //  {resourceType:"script",     requestCount:13, size:585116},
  //  {resourceType:"font",       requestCount:7,  size:170608},
  //  {resourceType:"image",      requestCount:18, size:149111},
  //  {resourceType:"stylesheet", requestCount:3,  size:68805},
  //  {resourceType:"document",   requestCount:2,  size:25169},
  //  {resourceType:"other",      requestCount:10, size:21879}]

  const total  = items.find(i => i.resourceType === "total");
  const byType = items.filter(i => i.resourceType !== "total");
  return { requests: total.requestCount, bytes: total.size, byType };
}
```

**Resource-type → Polish label map:**

| PSI `resourceType` | Polish label        |
|--------------------|---------------------|
| `document`         | Dokument (HTML)     |
| `stylesheet`       | Style (CSS)         |
| `script`           | Skrypty (JS)        |
| `image`            | Obrazy              |
| `font`             | Czcionki            |
| `media`            | Multimedia          |
| `third-party`/`other` | Inne / zewnętrzne|
| `total`            | Razem               |

**What Panel A renders:** big total (requests + KB), then a bar / table breakdown by type in
Polish, and a "największe kategorie" highlight.

**Honest caveat (annotate in the UI, see §6):** these are *lab* numbers. PSI loads the page on
a simulated mid-tier phone / emulated desktop under fixed network conditions on Google's
servers — so figures reflect that environment, not the learner's own browser, cache, or
connection. PSI also can't analyse pages behind a login, uses simulated throttling, and is
subject to usage quotas. A real Lighthouse run takes several seconds → show a loading state.

---

## 4. Panel B — Appearance (proxy fetch + `srcdoc`, layers off)

This panel re-renders an arbitrary page with chosen layers removed. It does **not** iframe the
live URL (no DOM control; many sites block framing). Instead it fetches the HTML as a string
we own, transforms it, and renders the string.

**Pipeline:**

1. **Fetch raw HTML through a CORS proxy** (public service such as allorigins / corsproxy for
   the MVP; a tiny self-hosted Cloudflare Worker if reliability matters later).
2. **Parse + transform with `DOMParser`:**
   - Inject `<base href="<original-site>">` so the page's *relative* links to CSS/images still
     resolve to the real domain. (Loading cross-origin assets is allowed — only *reading their
     bytes* is blocked, which is exactly why this panel does no sizes.)
   - **CSS off** → remove `<link rel="stylesheet">` and `<style>`.
   - **JS off** → remove `<script>` (and drop `allow-scripts` from the sandbox).
   - **Obrazy off** → remove `<img>` / `<picture>` (or replace with a placeholder block).
   - **Czcionki off** → remove `@font-face` / web-font `<link>` → system fallback.
3. **Render via `iframe.srcdoc`** with a `sandbox` attribute. Because it's *our* string, we
   control exactly what's in it.

```js
function renderAppearance(rawHtml, originalUrl, layers, iframe) {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.head.prepend(Object.assign(doc.createElement("base"), { href: originalUrl }));

  if (!layers.css)   doc.querySelectorAll('link[rel="stylesheet"], style').forEach(n => n.remove());
  if (!layers.js)    doc.querySelectorAll('script').forEach(n => n.remove());
  if (!layers.img)   doc.querySelectorAll('img, picture, svg[role="img"]').forEach(n => n.remove());
  if (!layers.fonts) doc.querySelectorAll('link[rel="preload"][as="font"]').forEach(n => n.remove());

  iframe.sandbox = layers.js ? "allow-scripts" : "";
  iframe.srcdoc  = "<!doctype html>" + doc.documentElement.outerHTML;
}
```

**Key point per the design decision:** toggling here changes *only what you see*. The numbers
in Panel A stay put. The two panels answer two different questions — „ile waży?" vs „z czego
się składa wizualnie?" — and stay decoupled.

---

## 5. Toggle behaviour (appearance only)

| Warstwa (toggle) | Co znika z podglądu                                              | Czego uczy                                          |
|------------------|-----------------------------------------------------------------|-----------------------------------------------------|
| **HTML**         | (baza — zawsze włączona)                                         | To szkielet i cała treść strony.                    |
| **CSS**          | Strona traci układ i style — zostaje surowa, „goła" treść.       | CSS odpowiada tylko za wygląd, nie za treść.        |
| **JavaScript**   | Znika interaktywność; strony-aplikacje robią się niemal puste.   | JS „ożywia" stronę; nowoczesne aplikacje bez niego nie istnieją wizualnie. |
| **Obrazy**       | W miejscu zdjęć pojawiają się puste pola.                        | Ile miejsca na stronie zajmują obrazy.              |
| **Czcionki**     | Tekst wraca do czcionek systemowych.                            | Czcionki to też osobne pliki do pobrania.           |

---

## 6. Polish interface — string dictionary

All copy ships in Polish. Keep strings in one `pl.js` dictionary so they're easy to review and
extend. Suggested baseline:

```js
const PL = {
  appName:        "Anatomia strony WWW",
  tagline:        "Zobacz, z czego naprawdę zbudowana jest strona internetowa.",
  urlPlaceholder: "Wklej adres strony, np. https://www.gov.pl",
  analyze:        "Analizuj",
  loading:        "Google ładuje i mierzy stronę… to potrwa kilka sekund.",

  // Panel A — waga
  weightTitle:    "Waga strony",
  requests:       "Liczba żądań (plików)",
  transferred:    "Rozmiar pobrany",
  total:          "Razem",
  byType:         "Podział na typy",
  biggest:        "Największe kategorie",
  types: {
    document: "Dokument (HTML)", stylesheet: "Style (CSS)", script: "Skrypty (JS)",
    image: "Obrazy", font: "Czcionki", media: "Multimedia", other: "Inne / zewnętrzne",
  },

  // Panel B — wygląd
  appearTitle:    "Wygląd strony",
  layersHint:     "Wyłączaj warstwy, aby zobaczyć, z czego zbudowana jest strona.",
  layerCss:       "CSS — wygląd",
  layerJs:        "JavaScript — interakcja",
  layerImg:       "Obrazy",
  layerFonts:     "Czcionki",

  // annotations (the honest imperfections, framed as teaching)
  noteWeight:     "Dane o wadze pochodzą z Google PageSpeed Insights — pomiar wykonano na serwerach Google w warunkach symulowanych, więc liczby mogą różnić się od tego, co pobierze Twoja przeglądarka.",
  noteRender:     "To przybliżona rekonstrukcja strony — część elementów może się nie wczytać.",
  noteSpaNoJs:    "Ta strona to aplikacja JavaScript — bez JS pozostaje niemal pusta. Tak wygląda nowoczesna strona, zanim uruchomi się jej kod.",
  noteDecoupled:  "Wyłączanie warstw zmienia tylko wygląd po prawej — liczby po lewej (waga z Google) pozostają bez zmian.",

  // errors
  errFetch:       "Nie udało się pobrać strony. Spróbuj innego adresu.",
  errAuth:        "Ta strona wymaga logowania lub blokuje analizę.",
  errPsi:         "Nie udało się pobrać danych o wadze strony.",
};
```

> Note for the build team: the engineering spec stays in English, but **every visible label,
> button, tooltip, error and lesson line must come from `PL`** — no hard-coded English in the
> UI.

---

## 7. UI / layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Anatomia strony WWW                                                        │
│  Adres:  [ https://www.gov.pl                    ]   [ Analizuj ]           │
├──────────────────────────────────┬─────────────────────────────────────────┤
│  WAGA STRONY (Google)            │  WYGLĄD STRONY                           │
│                                  │   Warstwy:  [✔] CSS  [✔] JS              │
│   ┌────────┐  ┌────────────┐     │             [✔] Obrazy  [✔] Czcionki     │
│   │  53    │  │  997 KB     │     │  ┌───────────────────────────────────┐   │
│   │ żądań  │  │  pobrane    │     │  │                                   │   │
│   └────────┘  └────────────┘     │  │   <iframe srcdoc> — podgląd       │   │
│                                  │  │   strony z wybranymi warstwami    │   │
│   Podział na typy:               │  │                                   │   │
│    ▇▇▇▇ Skrypty (JS)   585 KB    │  │                                   │   │
│    ▇▇   Czcionki       170 KB    │  └───────────────────────────────────┘   │
│    ▇▇   Obrazy         149 KB    │   ⓘ Wyłączanie warstw zmienia tylko      │
│    ▇    Style (CSS)     69 KB    │     wygląd — liczby po lewej zostają.    │
│    ▇    Dokument        25 KB    │                                          │
│                                  │                                          │
│   ⓘ Dane z Google PageSpeed…     │   ⓘ Przybliżona rekonstrukcja strony.    │
└──────────────────────────────────┴─────────────────────────────────────────┘
```

- Left = real weight (read-only). Right = manipulable appearance.
- The decoupling note (`noteDecoupled`) sits between them so no one expects the left numbers to
  move when they toggle on the right.

---

## 8. Owned sample page — guaranteed-working fallback

Public proxies and PSI can both fail on a given site (CSP, auth, timeouts, rate limits). Ship
**one owned sample page** (hosted with the app) as a „Pokaż przykład" button so a class is
never blocked: it renders flawlessly with toggles, and you can hard-code its PSI-style numbers
so Panel A also works offline. This is a safety net, not the main mode.

---

## 9. Honest imperfections → teaching annotations

These aren't bugs to hide; surface them as one-line Polish notes:

- **Weight is lab data, not your download** (`noteWeight`). Different device/network/cache.
- **The render is a reconstruction** (`noteRender`). Some assets 404; layout isn't pixel-perfect.
- **JS-heavy sites go blank with JS off** (`noteSpaNoJs`). This is the best lesson in the app —
  point it at a modern SPA on purpose.
- **The two panels are independent** (`noteDecoupled`). Toggles ≠ size changes, by design.
- **Login-walled / intranet pages won't work** (`errAuth`). Expected.

---

## 10. Roadmap / phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| **1 (MVP)** | URL bar → Panel A (PSI weight, by type, Polish labels) + Panel B (proxy fetch, srcdoc, CSS/JS/Obrazy/Czcionki toggles). Owned-sample fallback. | working bilingual-free, Polish-only app |
| **2** | Bar-chart breakdown, „największe kategorie", loading/empty/error states, mobile layout, polished annotations. | classroom-ready |
| **3** | Guided „lekcja" mode (krok po kroku: HTML → +CSS → +JS), tooltips „dlaczego to ważne?", a few curated example URLs (gov.pl, a news site, an SPA) as one-tap demos. | teaching flow |
| **4 (optional)** | Self-hosted proxy Worker for reliability; optional API key for PSI quota; „co by było, gdyby…" what-if subtraction on the weight side (kept clearly separate from the appearance toggles). | hardened / advanced |

---

## 11. Cross-cutting considerations

- **Accessibility:** toggles are real `<input type="checkbox">` with `<label>`; annotations and
  results announced via `aria-live`; chart data also available as a table; full keyboard use.
- **Language:** Polish only — single `PL` dictionary, no hard-coded UI strings (§6).
- **Hosting:** static files; deployable to edulab.dev / GitHub Pages. PSI and the proxy are
  the only network calls; both are plain `fetch`.
- **Reliability:** wrap PSI and proxy calls in `try/catch`, show the Polish error strings, and
  fall back to the owned sample on failure.
- **Performance of the tool itself:** keep it tiny and readable — practise what it preaches.

---

## 12. Definition of done (MVP / Phase 1)

- [ ] One URL bar drives both panels.
- [ ] Panel A shows real PSI weight for any public URL: total requests, total KB, breakdown by
      type, all labelled in Polish.
- [ ] Panel B re-renders the same URL via proxy + `srcdoc`, with working CSS / JS / Obrazy /
      Czcionki toggles that change appearance only.
- [ ] Toggling Panel B never alters Panel A's numbers (and a note says so).
- [ ] Honest annotations present in Polish (lab-data note, reconstruction note).
- [ ] Owned sample page works as a guaranteed fallback.
- [ ] Entire interface is in Polish. No backend required.
