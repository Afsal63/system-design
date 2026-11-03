---
title: "CI/CD for MERN Apps with GitHub Actions"
description: "Lint, test and build jobs, Mongo and Postgres service containers, caching, pushing SHA-tagged images, and gated deploys with environments."
createdAt: "2026-10-31"
sort: 4
categories:
  - deployment-production
  - devops-cicd
tags:
  - "GitHub Actions"
  - "CI/CD"
  - "Docker"
  - "Testing"
---

Manual deploys work until the day someone ships from a branch with uncommitted changes, or forgets to run migrations, or deploys a build that never passed tests. A pipeline turns every merge into the same repeatable sequence: verify the code, produce an immutable artifact, and promote that exact artifact through environments. GitHub Actions is the default choice for teams already on GitHub, and this guide builds a full pipeline for an Express API and React frontend backed by MongoDB and Postgres.

## How it works

A workflow is a YAML file in `.github/workflows/`. It contains jobs that run on fresh runners, in parallel unless linked with `needs`. Pull requests run checks only. Merges to `main` additionally build images tagged with the commit SHA, deploy automatically to staging, and wait for a human approval before production.

```mermaid
flowchart LR
  PR["Push or PR"] --> L["lint and typecheck"]
  PR --> T["test with Mongo and Postgres services"]
  L --> B["build and push images<br/>tag = git SHA"]
  T --> B
  B --> S["deploy staging"]
  S --> G["approval gate"]
  G --> P["deploy production"]
```

## The workflow

```yaml
name: ci-cd

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:7
        ports: ["27017:27017"]
        options: >-
          --health-cmd "mongosh --quiet --eval 'db.runCommand({ping:1})'"
          --health-interval 5s --health-retries 10
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: app_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 5s --health-retries 10
    env:
      MONGO_URL: mongodb://localhost:27017/app_test
      DATABASE_URL: postgres://test:test@localhost:5432/app_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run db:migrate
      - run: npm test -- --coverage

  build:
    if: github.event_name == 'push'
    needs: [lint, test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        app: [api, web]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./${{ matrix.app }}
          push: true
          tags: ghcr.io/${{ github.repository }}-${{ matrix.app }}:${{ github.sha }}
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh staging ${{ github.sha }}
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh production ${{ github.sha }}
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
```

## The pieces that matter

### Service containers

`services:` starts real Mongo and Postgres containers next to the job, so integration tests hit the same engines as production rather than mocks or an in-memory server that behaves slightly differently. The `--health-cmd` options make the runner wait until the databases are ready before steps start. If your code uses Mongo transactions, you need a replica set; either run `mongod --replSet` via a custom container or use a test library that starts one.

### Caching

`setup-node` with `cache: npm` caches the npm download cache keyed by the lockfile hash, which typically cuts install time substantially. For Docker, `type=gha` stores BuildKit layers in the Actions cache, so unchanged dependency layers are not rebuilt. Scope the cache per image to stop the api and web builds evicting each other.

### Immutable SHA tags

Tag every image with `github.sha`. The same image built once is deployed to staging and then production; nothing is rebuilt between environments. Rollback is just redeploying the previous SHA. Avoid relying on `latest`: you cannot tell what it pointed at during an incident. You can add semver or `main` tags as convenience aliases, but deploy by SHA or by image digest.

### Environments and approvals

`environment: production` links the job to a GitHub Environment where you configure required reviewers, a wait timer, and branch restrictions (only `main` may deploy). Secrets stored on the environment are only exposed to jobs targeting it, so a PR workflow can never read production credentials.

### Authenticating to the cloud without long-lived keys

Instead of storing AWS access keys as secrets, use OpenID Connect. GitHub issues a short-lived token per job, and an IAM role trusts tokens from your repo and environment:

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/gha-deploy-prod
      aws-region: us-east-1
  - run: aws ecs update-service --cluster prod --service api --force-new-deployment
```

Scope the role's trust policy to `repo:acme/shop:environment:production` so only the gated job can assume it.

### Migrations in the pipeline

Run schema migrations as an explicit step before the new app version rolls out, and only write migrations that are backward compatible with the currently running version (see the zero-downtime guide). A one-off task (`ecs run-task`, a Kubernetes Job, or `docker compose run api npm run migrate`) is cleaner than running migrations on app startup, where several replicas race each other.

## Trade-offs and pitfalls

- **Flaky tests destroy trust.** Once people re-run red builds by reflex, the pipeline stops protecting you. Quarantine flakes quickly.
- **Monorepo waste.** Use `paths:` filters or a tool like Turborepo so a README change does not rebuild everything.
- **Third-party actions are supply-chain risk.** Pin them to a commit SHA for sensitive workflows, and keep `permissions:` minimal at the top level.
- **`pull_request_target`** runs with secrets on code from forks; misused, it leaks credentials. Avoid it unless you understand it fully.
- **Slow pipelines** encourage batching changes. Aim for PR checks under 10 minutes by parallelising tests and caching aggressively.
- **Frontend env vars** are baked in at build time, so building one web image per environment breaks the build-once rule. Inject runtime config instead.

## Interview angle

- Describe build once, promote many: one immutable artifact moves through environments, which makes rollback trivial.
- Mention testing against real databases in CI and where contract or end-to-end tests fit.
- Security follow-ups: OIDC instead of static keys, environment-scoped secrets, least-privilege tokens.
- Explain how migrations are sequenced relative to deploys so a rollout never breaks the running version.

## Key takeaways

- Split lint, test, build and deploy into jobs with clear dependencies and run PR checks fast.
- Use service containers to test against real Mongo and Postgres.
- Tag images with the git SHA and deploy the same image everywhere.
- Gate production with GitHub Environments, required reviewers and OIDC-based cloud credentials.
- Run migrations as a separate, backward-compatible step before the rollout.
