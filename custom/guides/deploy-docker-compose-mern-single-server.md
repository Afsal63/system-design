---
title: "Running MERN with Docker Compose Locally and on a Single Server"
description: "Compose services for api, web, Mongo, Postgres, Redis and Nginx with volumes, networks, env files, healthchecks, and when Compose is enough."
createdAt: "2026-10-31"
sort: 2
categories:
  - deployment-production
  - devops-cicd
tags:
  - "Docker Compose"
  - "MERN"
  - "Self-hosting"
---

Once you have good images, you need something to run them together. A MERN app in practice is rarely just Mongo, Express, React and Node: there is usually Redis for sessions or queues, sometimes Postgres for billing or reporting, and a reverse proxy in front. Docker Compose describes all of that in one YAML file, gives every developer the same stack with one command, and is a perfectly reasonable way to run a small production system on a single VM. This guide shows a realistic `compose.yaml`, explains the parts that trip people up, and draws the line where Compose stops being enough.

## How it works

Compose creates a private bridge network per project. Each service gets a DNS name equal to its service name, so the API connects to `mongodb://mongo:27017`, not `localhost`. Named volumes persist data outside container lifecycles. `depends_on` with `condition: service_healthy` delays startup until a dependency's healthcheck passes. Only the services that publish ports are reachable from the host.

```mermaid
flowchart LR
  U["Browser"] -->|"443"| N["nginx"]
  subgraph FE["frontend network"]
    N
    W["web<br/>static React"]
    A["api<br/>Express"]
  end
  subgraph BE["backend network"]
    M["mongo"]
    P["postgres"]
    R["redis"]
  end
  N --> W
  N -->|"/api"| A
  A --> M
  A --> P
  A --> R
```

## A production-shaped compose.yaml

```yaml
name: shop

services:
  nginx:
    image: nginx:1.27-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - certs:/etc/letsencrypt:ro
    depends_on:
      api: { condition: service_healthy }
      web: { condition: service_started }
    networks: [frontend]
    restart: unless-stopped

  web:
    image: ghcr.io/acme/shop-web:${TAG:-latest}
    networks: [frontend]
    restart: unless-stopped

  api:
    image: ghcr.io/acme/shop-api:${TAG:-latest}
    env_file: [.env.api]
    environment:
      MONGO_URL: mongodb://mongo:27017/shop?replicaSet=rs0
      DATABASE_URL: postgres://app:${POSTGRES_PASSWORD}@postgres:5432/shop
      REDIS_URL: redis://redis:6379
    depends_on:
      mongo: { condition: service_healthy }
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 15s
    networks: [frontend, backend]
    restart: unless-stopped

  mongo:
    image: mongo:7
    command: ["--replSet", "rs0", "--bind_ip_all"]
    volumes: [mongo-data:/data/db]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}).ok }"]
      interval: 10s
      retries: 10
      start_period: 20s
    networks: [backend]
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: shop
    volumes: [pg-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d shop"]
      interval: 5s
      retries: 10
    networks: [backend]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redis-data:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
    networks: [backend]
    restart: unless-stopped

volumes:
  mongo-data:
  pg-data:
  redis-data:
  certs:

networks:
  frontend:
  backend:
```

### Why each piece is there

- **Single-node replica set for Mongo.** Transactions and change streams require a replica set, even with one member. The healthcheck initiates it on first boot.
- **No published ports on databases.** Only Nginx exposes ports. A surprisingly common incident is a Mongo or Redis container published on `0.0.0.0` with no auth, found by internet scanners within hours. Docker's port publishing also bypasses `ufw` rules on many Linux setups, so do not rely on the host firewall.
- **Two networks.** The database tier is not reachable from Nginx or the static web container. This is cheap defence in depth.
- **`depends_on` with healthchecks.** Plain `depends_on` only waits for the container to start, not for Postgres to accept connections. Even with healthchecks, your app should retry connections, because dependencies can restart later.
- **`${POSTGRES_PASSWORD:?}`** fails fast if the variable is missing rather than starting a database with an empty password.

## Env files and overrides

Compose reads `.env` in the project directory for variable substitution inside the YAML, while `env_file:` injects variables into the container. They are different mechanisms, which confuses people. Keep `.env*` files out of git and out of images.

For local development, add a `compose.override.yaml`, which Compose merges automatically:

```yaml
services:
  api:
    build: ./api
    command: ["npm", "run", "dev"]
    volumes: ["./api/src:/app/src"]
    ports: ["3000:3000", "9229:9229"]
  mongo:
    ports: ["27017:27017"]
```

On the server, run `docker compose -f compose.yaml up -d` so the override is ignored.

## Deploying to a single VM

A minimal, honest production flow:

```bash
ssh deploy@app.example.com
cd /srv/shop
export TAG=3f9c2ab
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
```

Compose recreates only containers whose image or config changed. There will be a brief gap while the API container restarts; Nginx returns 502 for those seconds unless you run two API replicas and reload between them. Add automated backups of the named volumes (or better, logical dumps, see the backups guide), log rotation for the Docker json-file driver (`max-size`, `max-file`), and unattended OS security updates.

## When Compose is enough

Compose on one well-sized VM (say 4 vCPU, 16 GB) comfortably serves many thousands of daily users for a typical CRUD app. It is enough when:

- Some downtime during deploys and host maintenance is acceptable.
- You can tolerate restoring from backup if the VM dies (RTO in hours).
- One team owns the whole stack and traffic is predictable.

You outgrow it when you need multiple hosts, automatic failover, rolling deploys with zero downtime, autoscaling, or when databases need replication across machines. At that point move databases to managed services first, then move stateless containers to ECS, Cloud Run or Kubernetes.

## Trade-offs and pitfalls

- **Databases on the same VM as the app** means one disk failure takes everything. Managed databases are often the first upgrade.
- **Bind-mounting code in production** couples the server to a git checkout and drifts from what CI tested. Ship images.
- **Unbounded logs** fill the disk; configure the logging driver.
- **`restart: always` hides crash loops.** Monitor restarts.
- **Docker Swarm** exists as a multi-host step up, but its ecosystem is small; most teams jump straight to a managed orchestrator.

## Interview angle

- For an early-stage design, proposing a single VM with Compose and managed databases is a credible, cost-aware answer, as long as you state its availability limits.
- Explain service discovery by DNS name and network isolation as the reason databases are never published.
- Be ready to describe the migration path from one box to an orchestrator as load or availability needs grow.

## Key takeaways

- Compose gives you a reproducible multi-service stack with service-name DNS, named volumes and isolated networks.
- Use healthchecks with `depends_on`, but still build connection retries into the app.
- Never publish database ports; expose only the reverse proxy.
- Separate dev overrides from the production file and deploy pinned image tags.
- Compose on one VM is valid production for small systems; know its single point of failure.
