/**
 * "Anatomia strony WWW" — CORS proxy (Cloudflare Worker)
 * ------------------------------------------------------
 * Fetches an arbitrary public page SERVER-SIDE and returns its raw HTML with
 * permissive CORS, so the browser app can re-render it (Panel B — Wygląd).
 * Unlike free public proxies, this one is yours: it follows redirects
 * (e.g. wikipedia.com -> www.wikipedia.org), isn't a shared/blocked IP, and
 * won't randomly rate-limit you.
 *
 * Usage from the app:  GET https://<your-worker>/?url=https://example.com
 *
 * Deploy: see README.md (dashboard paste, or `npx wrangler deploy`).
 */

// Who may call this proxy. Locked to our own site(s) so others can't borrow the
// Worker. (GitHub Pages sends Origin = scheme+host only, no path — so this one
// entry covers every repo under workszop.github.io.) Add more production
// origins here, e.g. "https://edulab.dev".
const ALLOWED_ORIGINS = [
  "https://workszop.github.io",
];

// Any local-dev origin is also allowed — localhost / 127.0.0.1 on ANY port,
// so it doesn't matter which port your dev server uses.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

// A browser-like UA — some sites reject the default Worker fetch agent.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function corsHeaders(origin) {
  // Echo the origin when allowed; otherwise return a non-matching value so the
  // browser blocks the cross-origin read.
  const allow = isAllowedOrigin(origin) ? origin : (ALLOWED_ORIGINS[0] || "null");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

// Basic SSRF guard: refuse loopback / private / link-local literal hosts.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return new Response("Brak parametru ?url=", { status: 400, headers: cors });
    }

    let parsed;
    try { parsed = new URL(target); } catch (e) {
      return new Response("Nieprawidłowy adres URL", { status: 400, headers: cors });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Dozwolone tylko http(s)", { status: 400, headers: cors });
    }
    if (isBlockedHost(parsed.hostname)) {
      return new Response("Adres zablokowany", { status: 403, headers: cors });
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pl,en;q=0.8",
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      const body = await upstream.text();
      const headers = new Headers(cors);
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("X-Proxy-Status", String(upstream.status));
      headers.set("X-Proxy-Final-Url", upstream.url || parsed.toString());
      // 200 on success; 502 if the site itself errored, so the app fails over.
      return new Response(body, { status: upstream.ok ? 200 : 502, headers });
    } catch (e) {
      return new Response("Nie udało się pobrać strony: " + ((e && e.message) || e),
        { status: 502, headers: cors });
    }
  },
};
