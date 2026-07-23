# Web Anatomy

An interactive educational website showing how separate files travel from a web server and are assembled by a browser.

The lab lets a learner independently enable or disable HTML, CSS, JavaScript, and image resources, replay the HTTP delivery, inspect the resulting page, and read each file's source.

## Run locally

The experience is a dependency-free static page. Serve the project directory with any static web server:

```bash
python3 -m http.server 5000
```

Then open <http://localhost:5000>.

The legacy `worker/` and `sample/` directories remain in the repository for reference, but the current experience is self-contained in `index.html` and does not require either of them.
