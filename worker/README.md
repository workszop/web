# Worker proxy — „Anatomia strony WWW"

A tiny Cloudflare Worker that fetches an arbitrary public page **server-side** and
returns its HTML with CORS headers, so the app's **Panel B (Wygląd strony)** can
re-render any site reliably — including ones the free public proxies choke on
(Wikipedia, redirecting domains like `wikipedia.com`, etc.).

It's free on Cloudflare's plan (100k requests/day) and only touches Panel B.
Panel A (Waga) still uses the PageSpeed Insights API + your API key — unrelated.

---

## Deploy — option A: Cloudflare dashboard (no tooling)

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it e.g. `anatomia-proxy`, click **Deploy**, then **Edit code**.
3. Delete the starter code, paste the entire contents of [`worker.js`](worker.js), **Save and deploy**.
4. Copy the Worker URL shown, e.g. `https://anatomia-proxy.YOURNAME.workers.dev`.

## Deploy — option B: Wrangler CLI

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Wrangler prints the URL, e.g. `https://anatomia-proxy.YOURNAME.workers.dev`.

---

## Connect the app

Open `../index.html`, find this line in the `<script>`:

```js
const PROXY_WORKER_URL = "";
```

Paste your Worker URL between the quotes:

```js
const PROXY_WORKER_URL = "https://anatomia-proxy.YOURNAME.workers.dev";
```

That's it. The app now tries **your Worker first** for every URL and falls back to
the public proxies only if the Worker is unreachable.

> Prefer not to edit the file? You can instead set it at runtime in the browser
> console: `localStorage.setItem('anatomia.proxyWorker', 'https://...workers.dev')`.
> The localStorage value overrides the constant.

## Test it

Open this in a browser — you should see Wikipedia's raw HTML:

```
https://anatomia-proxy.YOURNAME.workers.dev/?url=https://www.wikipedia.org
```

## Lock it down (recommended)

By default the Worker answers any origin. To stop others borrowing it, edit
`ALLOWED_ORIGINS` at the top of `worker.js` to your own site(s) and redeploy:

```js
const ALLOWED_ORIGINS = ["https://edulab.dev", "http://localhost:8753"];
```
