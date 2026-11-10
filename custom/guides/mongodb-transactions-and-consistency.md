---
title: "MongoDB Transactions and Consistency"
description: "Multi-document ACID transactions, sessions in the Node driver and Mongoose, retryable writes, and designing schemas that rarely need transactions."
createdAt: "2026-10-31"
sort: 4
categories:
  - mongodb
  - database-and-storage
tags:
  - "MongoDB"
  - "Transactions"
  - "Consistency"
  - "Mongoose"
---

For years "MongoDB has no transactions" was a standard objection. That has not been true since 4.0 (replica sets) and 4.2 (sharded clusters). MongoDB supports **multi-document ACID transactions** with snapshot isolation. The more useful question is not "can I use a transaction?" but "does this operation need one, or can the data model make it a single atomic write?"

## How it works

Every single-document write in MongoDB is already atomic, including updates to nested arrays and subdocuments. A transaction extends that guarantee across multiple documents and collections. It runs inside a **client session**, reads from a consistent snapshot, buffers its writes, and makes them visible all at once on commit.

```mermaid
sequenceDiagram
  participant A as Node app
  participant P as Primary
  participant S as Secondaries
  A->>P: startSession and startTransaction
  A->>P: debit wallet A with session
  A->>P: credit wallet B with session
  A->>P: insert ledger entry with session
  A->>P: commitTransaction
  P->>S: replicate as one oplog entry group
  S-->>P: acknowledge majority
  P-->>A: commit ok
```

Transactions require a replica set or sharded cluster, because they rely on the oplog. A standalone `mongod` does not support them, which is why local Docker setups often run a single-node replica set.

## Transactions in the Node driver

`session.withTransaction()` is the recommended API because it automatically retries on transient errors (such as a write conflict or a primary election) and retries the commit on unknown commit results.

```javascript
const session = client.startSession();
try {
  await session.withTransaction(
    async () => {
      const wallets = client.db('pay').collection('wallets');
      const res = await wallets.updateOne(
        { _id: fromId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { session }
      );
      if (res.modifiedCount !== 1) throw new Error('Insufficient funds');
      await wallets.updateOne({ _id: toId }, { $inc: { balance: amount } }, { session });
      await client.db('pay').collection('ledger').insertOne(
        { fromId, toId, amount, at: new Date() },
        { session }
      );
    },
    {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    }
  );
} finally {
  await session.endSession();
}
```

The key detail: **every operation must pass `{ session }`**. An operation without it runs outside the transaction and commits immediately, which is a silent and common bug.

## Transactions in Mongoose

Mongoose wraps the same mechanism. `connection.transaction()` calls `withTransaction` and also resets document state if the transaction is retried.

```javascript
await mongoose.connection.transaction(async (session) => {
  const order = await Order.create([{ userId, items, total }], { session });
  await Inventory.updateOne(
    { sku, qty: { $gte: 1 } },
    { $inc: { qty: -1 } },
    { session }
  );
  await User.updateOne({ _id: userId }, { $push: { orderIds: order[0]._id } }, { session });
});
```

Note that `Model.create()` requires an array as its first argument when you pass options. Mongoose 8 can also propagate the session automatically through `AsyncLocalStorage` if you enable `mongoose.set('transactionAsyncLocalStorage', true)`, which removes the risk of forgetting `{ session }`.

Keep side effects out of the callback. If it may be retried, an email sent or an HTTP call made inside it can happen twice.

## Retryable writes

Retryable writes are a separate, lighter feature. With `retryWrites=true` (the default in modern drivers and in Atlas connection strings), the driver automatically retries a single eligible write once if it fails with a network error or a primary step-down. The server uses a transaction number on the session to ensure the write is applied only once.

```text
mongodb+srv://app:***@cluster0.example.mongodb.net/shop?retryWrites=true&w=majority
```

Retryable writes cover `insertOne`, `updateOne`, `deleteOne`, `findOneAndUpdate` and `bulkWrite` with only those operations. Multi-document `updateMany` and `deleteMany` are not retryable, so design those to be idempotent.

## Avoiding transactions through schema design

Transactions carry real costs: extra round trips, held resources on the primary, a default 60-second lifetime limit (`transactionLifetimeLimitSeconds`), and abort-and-retry on write conflicts. Many "I need a transaction" cases disappear with a better model.

| Need | Transaction-free design |
|---|---|
| Order and its line items | Embed line items in the order document |
| Decrement stock only if available | Conditional update `{ qty: { $gte: n } }` with `$inc` |
| Update a counter and append history | Both fields in one document; one `updateOne` with `$inc` and `$push` |
| Optimistic concurrency | Version field: update where `version: v`, set `version: v + 1` |
| Cross-service workflow | Saga with compensating actions, or the outbox pattern |

The conditional update pattern is particularly powerful:

```javascript
const res = await Product.updateOne(
  { _id: productId, stock: { $gte: qty } },
  { $inc: { stock: -qty } }
);
if (res.modifiedCount === 0) throw new Error('Out of stock');
```

This is atomic, race-free and needs no session. Reach for a transaction when you genuinely must change several independent documents together, such as moving money between two accounts plus writing a ledger entry.

## Consistency knobs that interact with transactions

- **Write concern** `w: 'majority'` on commit ensures the transaction survives a failover.
- **Read concern** `snapshot` gives the transaction a consistent view across documents.
- **Causal consistency** in a session guarantees you read your own writes even when reading from secondaries.

These are covered in depth in the replica sets guide.

## Trade-offs and pitfalls

- **Forgetting `{ session }`** on one operation silently breaks atomicity.
- **Long transactions** hold WiredTiger snapshots and cache pressure. Keep them short and do no slow I/O inside them.
- **Write conflicts** between concurrent transactions abort one of them. `withTransaction` retries, but hot documents (a single global counter) will thrash.
- **Cross-shard transactions** involve two-phase commit across shards and are notably slower than single-shard ones.
- **Large transactions** that modify tens of thousands of documents should be split into batches instead.
- **Transactions are not a substitute for idempotency** in APIs; clients still retry HTTP requests.

## Interview angle

- When asked about payments or inventory, say MongoDB supports ACID transactions, then explain you would first try to make the operation a single-document conditional update.
- Distinguish retryable writes (one write, retried once by the driver) from transactions (multiple documents, all or nothing).
- Mention `withTransaction` for automatic retries and the need for `w: 'majority'` to survive failover.
- For cross-service consistency, bring up sagas and the outbox pattern instead of distributed transactions.

## Key takeaways

- Single-document writes are always atomic; design to exploit that first.
- Multi-document transactions need a replica set and a session passed to every operation.
- Use `withTransaction` or Mongoose `connection.transaction()` to get automatic retries.
- Retryable writes handle transient failures for single writes, not multi-step logic.
- Keep transactions short, small and free of external side effects.
