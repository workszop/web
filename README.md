# How a browser loads a web page

An interactive educational website showing how a browser moves from a URL and
HTTP responses to parsing, resource discovery, layout, and paint.

The lab lets a learner control whether the server returns `200` or `404` for
HTML, CSS, JavaScript, and an image; inspect a step-by-step loading log; replay
or step through the sequence; compare the rendered result; and read the exact
source of every simulated resource. After the first manual load, changing any
resource updates the preview and log automatically. Each completed log entry is
clickable and reveals the HTTP request, response body, or local processing
result for that step.

## Run locally

The experience is a dependency-free static page. Serve the project directory with any static web server:

```bash
python3 -m http.server 5000
```

Then open <http://localhost:5000>.

The legacy `worker/` and `sample/` directories remain in the repository for reference, but the current experience is self-contained in `index.html` and does not require either of them.
