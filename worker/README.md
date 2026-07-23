# Legacy Worker proxy

> Archived component: the current Web Anatomy experience is self-contained in
> `../index.html` and does not call this Worker. Do not deploy it for the current
> app.

This directory remains as a reference for the previous real-site analyzer. That
version fetched a public HTML document through Cloudflare so a browser could
read the response across origins.

## Security model

The Worker now rejects requests whose `Origin` is not listed in
`ALLOWED_ORIGINS` (with localhost allowed for development), validates every
redirect target, rejects private and loopback literal addresses, accepts only
HTML responses, and streams upstream bodies instead of buffering them.

An `Origin` allowlist is an abuse-reduction measure, not authentication: custom
HTTP clients can spoof the header. A future public deployment should add real
authorization, rate limiting, and monitoring. DNS-based private-address
resolution also requires protection outside this basic example.

## Historical deployment

Only deploy this component when intentionally restoring the legacy analyzer:

```bash
cd worker
npx wrangler deploy
```

Before deploying, update `ALLOWED_ORIGINS` in `worker.js`. Test with an explicit
allowed origin because requests without an `Origin` header are rejected:

```bash
curl -H 'Origin: https://workszop.github.io' \
  'https://YOUR-WORKER.workers.dev/?url=https://example.com'
```
