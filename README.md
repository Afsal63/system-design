# system-design

System Design Atlas: an offline study app with 536 system design guides and 43 animated lessons, including Database Design (22 guides: modelling, normalisation, keys, constraints, schema patterns, indexing, storage engines, concurrency, NoSQL and warehouse modelling, migrations, and full e-commerce, SaaS and social schemas), System Design Essentials (a 46-guide curriculum: design method, fundamentals, building blocks, architecture patterns, 17 case studies, a complete end-to-end YouTube design and a design review checklist) and a MERN-focused track (Node/Express/React, MongoDB, PostgreSQL, deployment).

## Run

Open `index.html` in a browser, or serve the folder (for example with VS Code Live Server). No build step is needed to view it.

## Host on GitHub Pages

In the repository settings, open **Pages** and set the source to **GitHub Actions**. The workflow at `.github/workflows/deploy-pages.yml` publishes this folder whenever a commit is pushed to `main`; the live URL will appear in the workflow run and the Pages settings.

## Content

- `data.js`: generated guide data. Regenerate with `node build-data.mjs [path-to-system-design-101/data]` (defaults to `../system-design-101/data`, a clone of ByteByteGoHq/system-design-101).
- `custom/`: original guides and categories merged in by the build. See `custom/README.md`.
- `app.js` + `lessons-mern.js`: animated lessons.
