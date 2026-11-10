---
title: "PostgreSQL Full-Text Search: tsvector, Ranking, Trigrams and When to Leave"
description: "Build product and document search in PostgreSQL with tsvector, GIN, weighted ranking, websearch_to_tsquery, highlighting, pg_trgm fuzzy matching and unaccent, and know when a dedicated engine is worth it."
createdAt: "2026-11-03"
sort: 12
categories:
  - postgresql
  - database-and-storage
tags:
  - "PostgreSQL"
  - "Full-Text Search"
  - "GIN"
  - "pg_trgm"
---

The first version of search in most apps is `WHERE title ILIKE '%' || $1 || '%'`. It works on 10,000 rows, ignores word forms ("running" does not match "run"), has no ranking, and turns into a 3-second sequential scan at a few million rows. PostgreSQL ships a real full-text search engine with stemming, stop words, weighted ranking and an inverted index, plus the `pg_trgm` extension for typo-tolerant matching. For a large class of products (SaaS apps, admin panels, catalogs up to tens of millions of rows) it is enough, and it keeps search transactionally consistent with your data with zero extra infrastructure.

## How it works

Text is converted into a `tsvector`: a sorted list of normalized **lexemes** with their positions. A search string becomes a `tsquery`: lexemes combined with `&` (and), `|` (or), `!` (not) and `<->` (followed by). The `@@` operator tests whether a vector matches a query.

```sql
SELECT to_tsvector('english', 'The quick foxes were running');
-- 'fox':3 'quick':2 'run':5

SELECT to_tsquery('english', 'running & fox');
-- 'run' & 'fox'

SELECT to_tsvector('english', 'The quick foxes were running')
       @@ to_tsquery('english', 'running & fox');   -- true
```

The first argument is a **text search configuration** (`regconfig`). `english` lowercases, drops stop words like "the" and "were", and stems with the Snowball stemmer. `simple` only lowercases, which suits names, SKUs and mixed-language content. Run `\dF` in psql to list the roughly 30 built-in configurations. Always pass the configuration explicitly; relying on `default_text_search_config` makes indexes and queries silently disagree when the setting differs between environments.

A GIN index stores each lexeme once with a posting list of matching rows, so a query for three words intersects three lists instead of scanning the table.

```mermaid
flowchart LR
  U["User types: postgres vacuum -mysql"] --> W["websearch_to_tsquery"]
  W --> Q["tsquery: postgr AND vacuum AND NOT mysql"]
  Q --> G["GIN index on search_vector"]
  G -->|"candidate ctids"| H["Heap: recheck and fetch rows"]
  H --> R["ts_rank and ORDER BY"]
  R --> L["LIMIT 20"]
  L --> HL["ts_headline on 20 rows only"]
  HL --> OUT["JSON response"]
```

## Schema: generated tsvector column plus GIN

Indexing an expression works, but a stored generated column is easier to query, lets you combine several columns with weights, and avoids recomputing `to_tsvector` during rechecks:

```sql
ALTER TABLE articles ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tags_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'D')
  ) STORED;

CREATE INDEX CONCURRENTLY idx_articles_search
  ON articles USING gin (search_vector);
```

The two-argument form of `to_tsvector` is immutable, which generated columns require. `coalesce` matters: concatenating a NULL makes the whole vector NULL. Adding a stored generated column rewrites the table, so on a large table add a plain `tsvector` column, backfill it in batches, and maintain it with a trigger, or do it in a maintenance window. Note the limits: a `tsvector` cannot exceed 1 MB and positions cap at 16,383, so for very long documents index the first portion or split into chunks.

## Parsing user input safely

`to_tsquery` expects operator syntax and throws on input like `node js (beta`. For a search box use `websearch_to_tsquery`, which accepts Google-style syntax and never raises a syntax error:

```sql
SELECT websearch_to_tsquery('english', '"connection pool" postgres -mysql or pgbouncer');
-- 'connect' <-> 'pool' & 'postgr' & !'mysql' | 'pgbouncer'
```

Quoted phrases become `<->`, a leading minus becomes NOT, and `or` becomes `|`. Use `plainto_tsquery` if you want every word ANDed with no syntax at all. For prefix search as the user types, build a query with `:*`, for example `to_tsquery('simple', 'postg:*')`.

## Ranking

`ts_rank` scores by term frequency weighted by the A/B/C/D labels (defaults 1.0, 0.4, 0.2, 0.1). `ts_rank_cd` also rewards terms that appear close together. Normalization flag `32` maps scores into 0 to 1, and flag `1` divides by document length so long bodies do not win simply by being long.

```js
// node-postgres search endpoint
const { rows } = await pool.query(
  `SELECT id, title,
          ts_rank(search_vector, q, 1|32) AS rank,
          ts_headline('english', body, q,
            'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=25, MinWords=10') AS snippet
   FROM (
     SELECT id, title, body, search_vector, q
     FROM articles, websearch_to_tsquery('english', $1) AS q
     WHERE search_vector @@ q AND published
     ORDER BY ts_rank(search_vector, q, 1|32) DESC, published_at DESC
     LIMIT 20
   ) top`,
  [term]
);
```

Two performance facts drive this shape. Ranking is **not** index-assisted: PostgreSQL must compute `ts_rank` for every matching row before it can sort, so a query matching 400,000 rows is slow even with a perfect GIN index. And `ts_headline` re-parses the original text, which is expensive, so it runs only on the final 20 rows in the outer query. If common terms match huge sets, add filters (tenant, date range) or cap the candidate set with an inner `LIMIT` before ranking.

## Fuzzy matching with pg_trgm

Full-text search matches words, not typos. "postgers" stems to nothing useful. The `pg_trgm` extension splits strings into three-character sequences and measures overlap, which handles misspellings, partial words and `ILIKE '%term%'`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops);

-- Substring search that now uses the index
SELECT id, name FROM products WHERE name ILIKE '%wireles%';

-- Typo tolerance: % uses pg_trgm.similarity_threshold (default 0.3)
SELECT name, similarity(name, 'wireles hedphones') AS sim
FROM products
WHERE name % 'wireles hedphones'
ORDER BY sim DESC LIMIT 10;
```

GIN trigram indexes are best for filtering; GiST trigram indexes additionally support `ORDER BY name <-> 'term'` nearest-neighbour ordering. Patterns shorter than three characters cannot use the index effectively. A practical design: run full-text search first, and if it returns zero rows, fall back to a trigram "did you mean" query on a short column like title or product name.

## Accents and languages

Users type "cafe" and expect "café". The `unaccent` extension strips diacritics, but the `unaccent()` function is only `STABLE`, so it cannot appear directly in an index expression or generated column. The clean approach is a custom configuration:

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE TEXT SEARCH CONFIGURATION english_unaccent (COPY = english);
ALTER TEXT SEARCH CONFIGURATION english_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, english_stem;
```

Use `english_unaccent` in both the column definition and the query. For multilingual content, store a `language regconfig` column per row and call `to_tsvector(language, body)`; that two-argument form with a column is still immutable. Languages without word boundaries, like Chinese or Japanese, need an extension such as `pgroonga` or a dedicated engine.

## When to move to a search engine

Stay in PostgreSQL when the corpus is under roughly 10 to 50 million rows, queries filter heavily by tenant or status, and "good relevance" is enough. Move to Elasticsearch, OpenSearch, Meilisearch or Typesense when you need:

- BM25 relevance tuning, synonyms management, per-field boosting UIs and learning-to-rank.
- Faceted navigation with counts over millions of matches in milliseconds.
- Typo tolerance and instant search-as-you-type across all fields by default (Meilisearch and Typesense shine here).
- Search load isolated from the transactional primary.

The price is a second system to sync, usually via CDC or an outbox, and results that lag writes by a second or more. Extensions such as ParadeDB's `pg_search` bring BM25 into PostgreSQL itself and are worth evaluating before adding a cluster.

## Hybrid search with pgvector

Semantic search finds "laptop won't turn on" for a document titled "power failure troubleshooting", which keywords miss. With `pgvector`, store an embedding next to the `tsvector`:

```sql
ALTER TABLE articles ADD COLUMN embedding vector(1536);
CREATE INDEX ON articles USING hnsw (embedding vector_cosine_ops);
```

Run the keyword query and the `ORDER BY embedding <=> $1 LIMIT 50` query separately, then merge with reciprocal rank fusion: score each result `1 / (60 + rank)` from each list and sum. Hybrid usually beats either method alone, and both indexes live in one transactional database.

## Trade-offs and pitfalls

- **Config mismatch** between index and query (`english` vs `simple`) means the index is never used and results are wrong.
- **Ranking large match sets** is a full computation; filter first, rank second.
- **`ts_headline` on every row** is a common cause of slow search endpoints.
- **GIN write cost**: heavy update rates on the indexed text grow the pending list; tune `gin_pending_list_limit` or rely on autovacuum.
- **Stop words** mean searching for "the who" may return nothing with `english`.

## Interview angle

- Explain tsvector, tsquery, stemming and why a GIN inverted index makes it fast.
- Show weighted ranking across title and body with `setweight`.
- Contrast full-text search and trigram search, and when you would combine them.
- Give concrete criteria for introducing Elasticsearch, including the sync cost.

## Key takeaways

- Use a stored generated `tsvector` column with weights and a GIN index.
- Parse user input with `websearch_to_tsquery`; never pass raw input to `to_tsquery`.
- Rank only what you must, and highlight only the final page.
- Add `pg_trgm` for typos and substring matching, `unaccent` via a custom configuration.
- Postgres search covers most apps; move out for facets, heavy relevance tuning or scale isolation.
