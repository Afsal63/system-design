---
title: "MongoDB Aggregation Pipeline"
description: "Core aggregation stages, how MongoDB optimizes pipelines, allowDiskUse and memory limits, and when to precompute results instead."
createdAt: "2026-10-31"
sort: 3
categories:
  - mongodb
  - database-and-storage
tags:
  - "MongoDB"
  - "Aggregation"
  - "Analytics"
---

`find()` covers filtering, projection, sorting and paging. As soon as you need totals per category, a join with another collection, a dashboard with several breakdowns, or reshaped output for an API, you reach for the **aggregation pipeline**. It runs on the server, close to the data, and replaces the anti-pattern of pulling thousands of documents into Node and looping over them in JavaScript.

## How it works

A pipeline is an ordered array of stages. Documents flow through each stage, which filters, transforms, groups or joins them, and passes the result on.

```mermaid
flowchart LR
  A["orders collection"] --> B["$match<br/>uses index"]
  B --> C["$lookup<br/>join users"]
  C --> D["$unwind<br/>flatten array"]
  D --> E["$group<br/>sum per country"]
  E --> F["$sort"]
  F --> G["$project<br/>shape output"]
  G --> H["Result to Node app"]
```

Only the beginning of the pipeline can use indexes. Once a stage like `$group` or `$unwind` reshapes documents, later stages work on in-memory results. That one fact drives most pipeline design decisions.

## The stages you will use most

| Stage | Purpose |
|---|---|
| `$match` | Filter documents; uses indexes when early in the pipeline |
| `$project` / `$set` | Include, exclude, rename or compute fields |
| `$group` | Aggregate by key with `$sum`, `$avg`, `$min`, `$max`, `$push`, `$addToSet` |
| `$sort`, `$limit`, `$skip` | Ordering and paging |
| `$lookup` | Left outer join with another collection in the same database |
| `$unwind` | Emit one document per array element |
| `$facet` | Run several sub-pipelines over the same input in one pass |
| `$merge` / `$out` | Write results to a collection |

### Revenue by country for the last 30 days

```javascript
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

const rows = await Order.aggregate([
  { $match: { status: 'paid', createdAt: { $gte: since } } },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
      pipeline: [{ $project: { country: 1 } }],
    },
  },
  { $unwind: '$user' },
  { $group: { _id: '$user.country', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
  { $sort: { revenue: -1 } },
  { $limit: 10 },
  { $project: { _id: 0, country: '$_id', revenue: 1, orders: 1 } },
]);
```

Notes: `Model.aggregate()` in Mongoose does not cast types, so pass real `ObjectId` and `Date` values, not strings. The `pipeline` option inside `$lookup` alongside `localField`/`foreignField` (MongoDB 5.0+) lets you project only needed fields from the joined collection, which keeps intermediate documents small. Make sure `users._id` (always indexed) or whatever `foreignField` you use is indexed; otherwise each lookup is a collection scan.

### One request, many breakdowns with $facet

A product search page needs results plus counts per brand and per price band. `$facet` does it in one round trip:

```javascript
db.products.aggregate([
  { $match: { category: 'laptops', inStock: true } },
  {
    $facet: {
      results: [{ $sort: { price: 1 } }, { $limit: 20 }, { $project: { name: 1, price: 1 } }],
      byBrand: [{ $group: { _id: '$brand', n: { $sum: 1 } } }, { $sort: { n: -1 } }],
      priceBands: [
        { $bucket: { groupBy: '$price', boundaries: [0, 500, 1000, 2000, 100000], default: 'other' } },
      ],
    },
  },
]);
```

Sub-pipelines inside `$facet` cannot use indexes, so the `$match` before it must do the heavy filtering. The `$facet` output is a single document and is subject to the 16MB limit.

## Pipeline optimization

MongoDB rewrites pipelines automatically. For example, it moves a `$match` ahead of a `$project` when safe, merges adjacent `$sort` and `$limit` into a top-k sort, and coalesces `$lookup` with a following `$unwind`. You should still write pipelines in the efficient order yourself:

1. **`$match` first**, on indexed fields, to shrink the input.
2. **`$sort` early** if it can use an index, followed by `$limit`.
3. **`$project` to drop large fields** before `$lookup`, `$unwind` or `$group`.
4. **`$lookup` after filtering and limiting**, so you join 20 documents, not 2 million.

Check the result with explain:

```javascript
db.orders.explain('executionStats').aggregate(pipeline);
```

Look for an `IXSCAN` under the initial `$cursor` stage and confirm how many documents entered the pipeline.

## Memory limits and allowDiskUse

Blocking stages such as `$group` and `$sort` have a per-stage memory limit of 100MB. Beyond that, the stage must spill to temporary files on disk. Since MongoDB 6.0, `allowDiskUse` defaults to true for most deployments, while older versions required opting in:

```javascript
await Order.aggregate(pipeline).allowDiskUse(true);
```

Spilling works but is slow. If a request-path pipeline spills, that is a sign the pipeline is processing too much data per request.

## When to precompute

Aggregation on every page view is fine for small inputs. It stops being fine when a dashboard query scans millions of documents and many users load that dashboard. Options, cheapest first:

- **Computed fields** updated on write (`$inc` counters on the parent document).
- **Materialized views with `$merge`**, refreshed by a scheduled job:

```javascript
db.orders.aggregate([
  { $match: { createdAt: { $gte: ISODate('2026-10-30'), $lt: ISODate('2026-10-31') } } },
  {
    $group: {
      _id: { day: { $dateTrunc: { date: '$createdAt', unit: 'day' } }, country: '$country' },
      revenue: { $sum: '$total' },
    },
  },
  { $merge: { into: 'daily_revenue', whenMatched: 'replace', whenNotMatched: 'insert' } },
]);
```

- **Change stream consumers** that update summary documents incrementally in near real time.
- **Dedicated analytics stores** (a warehouse or Atlas analytics nodes) for heavy, ad hoc reporting.

## Trade-offs and pitfalls

- **`$lookup` is not a cheap relational join.** It works per input document. Joining large, unfiltered sets is slow, and `$lookup` into a sharded collection has extra overhead. If you join on every request, revisit the data model.
- **`$unwind` multiplies documents.** Unwinding an array of 1,000 items turns one document into 1,000. Use `preserveNullAndEmptyArrays` when you need left-join semantics.
- **Running analytics on the primary** competes with OLTP traffic. Send heavy pipelines to a secondary or analytics node with an appropriate read preference.
- **`$skip` with a large offset** in a pipeline still processes all skipped documents.
- **Result size**: a pipeline returns a cursor, but any single output document is still capped at 16MB.

## Interview angle

- For "build an admin dashboard", explain that you would compute live aggregates only over small indexed slices and precompute daily rollups with `$merge` or change streams.
- Show you know stage ordering: filter and limit before joining and unwinding.
- Mention `$facet` for search pages with filter counts, and its single-document limit.
- Discuss isolating analytical load from transactional load (secondaries, analytics nodes, or a warehouse).

## Key takeaways

- Indexes only help the leading `$match` and `$sort` stages, so put them first.
- Project away unneeded fields before `$lookup`, `$unwind` and `$group`.
- Blocking stages have a 100MB memory limit per stage; spilling to disk is a warning sign on hot paths.
- Precompute repeated heavy aggregations with computed fields, `$merge` rollups or change streams.
