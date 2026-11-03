# Custom guides

Guides and categories here are merged with the upstream System Design 101 data by `node build-data.mjs`, so they survive upstream re-syncs.

- `categories/<id>.md`: frontmatter `title`, `description`, `sort` (lower sorts first).
- `guides/<id>.md`: frontmatter `title`, `description`, `createdAt`, `sort` (reading order in the series), `categories` (first one is primary), `tags`. No `image`. Body is Markdown with `##` headings and optional ```mermaid blocks (flowchart or sequenceDiagram, labels as `A["text"]`).

After adding or editing a file, run `node build-data.mjs` from the project root and reload `index.html`.
