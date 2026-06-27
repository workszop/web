# WebLab

Edukacyjna aplikacja pokazująca jak przeglądarka pobiera i renderuje stronę internetową.
Całość działa jako statyczny HTML/CSS/JavaScript w pliku `index.html`.

## Struktura repozytorium

| Ścieżka | Opis |
| --- | --- |
| `index.html` | Główna aplikacja — cały interfejs i logika w jednym pliku statycznym. |
| `worker/` | Cloudflare Worker pełniący rolę serwerowego proxy dla panelu „Wygląd strony". |
| `sample/` | Przykładowe strony WWW używane do demonstracji renderowania. |

## Worker (`worker/`)

Niewielki Cloudflare Worker, który pobiera dowolną publiczną stronę **po stronie serwera** i zwraca jej HTML z nagłówkami CORS. Dzięki temu **Panel Wygląd strony** potrafi wyrenderować dowolny serwis — także takie, na których darmowe publiczne proxy zawodzą (Wikipedia, domeny z przekierowaniami itp.).
Działa w darmowym planie Cloudflare (100 tys. żądań/dobę).

Panel Waga strony korzysta niezależnie z PageSpeed Insights API.

**Wdrożenie (Wrangler CLI):**

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Po wdrożeniu wklej adres Workera do `index.html`:

```js
const PROXY_WORKER_URL = "https://anatomia-proxy.TWOJANAZWA.workers.dev";
```

Pełna instrukcja (wdrożenie przez panel Cloudflare, zabezpieczenie origin, testy) znajduje się w [`worker/README.md`](worker/README.md).

## Przykładowe strony (`sample/`)

Gotowe strony WWW do prezentowania kolejnych etapów renderowania w aplikacji:

- `sample/rogalik/` — „Rogalik": strona rozbita na osobne pliki `index.html`, `styles.css` i `script.js`, ilustrująca rozdział treści (HTML), wyglądu (CSS) i zachowania (JS).

## Uruchomienie lokalnie

To statyczna aplikacja — wystarczy otworzyć `index.html` w przeglądarce lub podać ją dowolnym serwerem plików statycznych, np.:

```bash
python3 -m http.server 5000
```

a następnie otworzyć <http://localhost:5000>.
