/**
 * "Anatomia strony WWW" — CORS proxy (Cloudflare Worker)
 * ------------------------------------------------------
 * Archived proxy for the previous real-site analyzer. Fetches a public page
 * server-side and returns its HTML to an explicitly allowed browser origin.
 *
 * Historical endpoint: GET https://<your-worker>/?url=https://example.com
 *
 * Deploy: see README.md (dashboard paste, or `npx wrangler deploy`).
 */

// This Worker is retained for the legacy analyzer only. The current Web Anatomy
// experience does not call it. GitHub Pages sends Origin = scheme+host only, so
// this entry covers every repo under workszop.github.io.
const ALLOWED_ORIGINS = [
  "https://workszop.github.io",
];
const MAX_REDIRECTS = 5;

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
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

// Refuse loopback, private, unspecified, and link-local literal hosts.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::" || h === "::1") return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(f[cd]|fe[89ab])/i.test(h)) return true;
  if (h.startsWith("::ffff:")) {
    return isBlockedHost(h.slice("::ffff:".length));
  }
  return false;
}

function parsePublicHttpUrl(value, base) {
  let parsed;
  try { parsed = new URL(value, base); } catch (e) {
    throw new Error("Nieprawidłowy adres URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Dozwolone tylko http(s)");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("Adres zablokowany");
  }
  return parsed;
}

async function fetchPublicHtml(initialUrl) {
  let current = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const upstream = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml;q=0.9",
        "Accept-Language": "pl,en;q=0.8",
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("Location");
      if (!location) return { upstream, finalUrl: current };
      if (redirectCount === MAX_REDIRECTS) {
        await upstream.body?.cancel();
        throw new Error("Zbyt wiele przekierowań");
      }
      await upstream.body?.cancel();
      current = parsePublicHttpUrl(location, current);
      continue;
    }

    return { upstream, finalUrl: current };
  }

  throw new Error("Zbyt wiele przekierowań");
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin)) {
      return new Response("Forbidden", { status: 403, headers: { "Vary": "Origin" } });
    }

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
    try { parsed = parsePublicHttpUrl(target); } catch (e) {
      return new Response((e && e.message) || "Nieprawidłowy adres URL", { status: 400, headers: cors });
    }

    try {
      const { upstream, finalUrl } = await fetchPublicHtml(parsed);
      const contentType = upstream.headers.get("Content-Type") || "";
      if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) {
        await upstream.body?.cancel();
        return new Response("Odpowiedź nie jest dokumentem HTML", { status: 415, headers: cors });
      }

      const headers = new Headers(cors);
      headers.set("Content-Type", contentType);
      headers.set("X-Proxy-Status", String(upstream.status));
      headers.set("X-Proxy-Final-Url", finalUrl.toString());
      // 200 on success; 502 if the site itself errored, so the app fails over.
      return new Response(upstream.body, { status: upstream.ok ? 200 : 502, headers });
    } catch (e) {
      return new Response("Nie udało się pobrać strony: " + ((e && e.message) || e),
        { status: 502, headers: cors });
    }
  },
};
