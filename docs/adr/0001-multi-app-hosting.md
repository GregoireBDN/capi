# ADR 0001 — Multi-app hosting on a single VPS

- **Status**: Accepted
- **Date**: 2026-11-07
- **Issue**: #86 (epic #38, milestone M6 Deployment)

## Context

Finances is the first of several personal apps that will run on one VPS. Hosting, ingress, backups, deploys and access must therefore be designed once, per server, and each app must plug into that setup as an isolated stack.

Constraints:

- **Single user.** No public sign-up, no multi-tenancy; the owner reaches the apps from a laptop and a phone (PWA).
- **Private by default.** Every app is reachable only through Tailscale. The only planned exception is the remote MCP endpoint of Finances (#78, M7), which must be reachable by Anthropic's servers.
- **Low maintenance.** One person maintains it in spare time: few moving parts, nothing that needs its own upgrade routine unless it pays for itself.
- **Reproducible.** The server can be rebuilt from scratch from versioned config plus the off-site backups.
- **EU hosting** for financial data.
- **Budget**: a small VPS (2–4 vCPU, 8 GB RAM) is enough for several Node + Postgres apps.

## Decision

### 1. Orchestration: plain Docker Compose per app + one server-level Caddy

Each app runs as its own Compose project (its `docker-compose.prod.yml`, kept in the app's repo). One Caddy container, owned by the server (infra repo), is the only ingress. Apps join a shared external Docker network named **`proxy`**; only the service the browser talks to (for Finances: `web`) is attached to it. Databases and internal services stay on the app's private Compose network.

**Rejected: self-hosted PaaS (Coolify, Dokploy).** They bring a UI, deploy webhooks and backup helpers, but:

- they are a large, privileged service (Docker socket, web UI, own database) to keep patched — a bigger attack surface than the apps they host;
- ~0.5–1 GB of RAM and background jobs on a small VPS;
- app config lives in their database instead of git, which conflicts with "rebuild from versioned config";
- what they offer that we need (TLS, deploys, backups) is a few dozen lines of Caddyfile, a GitHub Actions workflow and a restic script.

### 2. Server config lives in a separate private `infra` repo

A new private repo **`infra`** owns everything shared by the apps:

- bootstrap script and runbooks (provision, harden, rebuild from scratch, recover access);
- the Caddy stack (Caddyfile with one site block per app, the `proxy` network);
- the portal config;
- the backup scripts, schedules and restore runbooks;
- Tailscale ACL policy (as a reference copy of the tailnet policy file).

Each **app repo** keeps what is specific to it: Dockerfiles, `docker-compose.prod.yml`, `.env.example` for production, the release/deploy workflow, and app-level runbooks (migrations, rollback). Adding an app to the server = one Caddy site block + one portal entry + one backup entry in `infra`.

**Rejected: server config inside this repo.** It would couple the server's lifecycle to Finances and make the next app depend on this repo.

### 3. Ingress and TLS: own domain, records on the tailnet, Caddy with DNS-01

- Buy a domain (≈ €10/year) and host its DNS at a provider with an API supported by a Caddy DNS plugin (**Cloudflare**, free plan, `caddy-dns/cloudflare`).
- A wildcard record `*.<base>` (e.g. `*.home.example.com`, placeholder) points to the server's **Tailscale IP** (`100.x.y.z`). The name resolves publicly but the address is only routable inside the tailnet.
- Caddy obtains a wildcard Let's Encrypt certificate through the **DNS-01 challenge** (no inbound port needed) with a token scoped to that DNS zone, stored in the server's `.env`.
- Caddy publishes `443` (and `80` for redirects) **bound to the Tailscale IP only** (`100.x.y.z:443:443`); `docker.service` gets a drop-in ordering it `After=tailscaled.service` so the address exists when Docker binds.
- Hostnames: `finances.<base>` for Finances, `<base>` (or `home.<base>`) for the portal.

Why not Tailscale-only names (`<host>.<tailnet>.ts.net` + `tailscale serve`)?

- One node gets one hostname; several apps would have to share it by port or path (paths break apps that assume `/`), or each need a Tailscale Service — more Tailscale-specific config, harder to move.
- Real certificates on a real domain are provider-independent: switching VPN or VPS doesn't change URLs, PWA installs or cookies.
- The public MCP endpoint (#78) can later be a single extra hostname (e.g. `mcp.<base>`) pointing to the public IP with its own Caddy site block, firewall rule and rate limits, without touching the private apps. (Tailscale Funnel remains an option there; decided in #78.)

Consequence: the domain's DNS is the one external dependency of ingress. If Cloudflare is down, existing certificates keep working (renewal retries for weeks).

### 4. Databases: one Postgres container per app

Each app's Compose project has its own `postgres:<major>-alpine` service with a named volume, on the app's internal network only, never published.

- Apps upgrade Postgres majors independently; a misbehaving app can't exhaust another's connections or disk.
- Backup and restore are per app (`docker compose exec db pg_dump`), so restoring Finances never touches other apps.
- Cost: ~30–50 MB of RAM per idle Postgres — negligible at this size.

**Rejected: one shared Postgres with a database and role per app.** Cheaper in RAM but couples upgrades and failure domains, and needs a shared admin credential on the server.

### 5. Images: built in GitHub Actions, pushed to GHCR

- A release tag `vX.Y.Z` runs lint, types, tests, then builds `ghcr.io/<owner>/finances-api` and `ghcr.io/<owner>/finances-web` (private), tagged with the version and `sha-<commit>`.
- The server only pulls (read-only token, `read:packages`), with tags pinned in the deployed `.env` (`FINANCES_VERSION=vX.Y.Z`).
- Building on the server would need the full monorepo toolchain there, use RAM/CPU on the box that serves the apps, and make "what is running" depend on the server's checkout rather than an immutable image.

### 6. Deploys: GitHub Actions over Tailscale

- The deploy job joins the tailnet as an **ephemeral node tagged `tag:ci`** (Tailscale GitHub Action, OAuth client), SSHes to a restricted `deploy` user, and runs the app's deploy script: pull the new images, run migrations from the new API image (a compiled migrate script using Drizzle's migrator, since `drizzle-kit` is not in the production image — added in #28), `docker compose up -d`, poll the health endpoint, and on failure re-deploy the previous tag.
- Tailscale ACLs allow `tag:ci` to reach only the server's SSH port; the owner's devices reach the server's 443 and SSH.
- A GitHub `production` environment with required approval holds the secrets.

### 7. Backups: restic to off-site object storage, outside the VPS provider

- Nightly per-app `pg_dump --format=custom` into a local staging dir, then `restic backup` (encrypted, deduplicated) of the dumps and any app volume to an **S3-compatible bucket in the EU at another provider** than the VPS (e.g. Scaleway Object Storage or Backblaze B2 EU — final choice in #30).
- Retention: 7 daily, 4 weekly, 12 monthly (`restic forget --prune`).
- The restic password and bucket credentials are stored in the owner's password manager; the server only holds them in a root-only env file.
- Each run pings a dead-man's-switch monitor (healthchecks.io-style); a missed or failed run alerts the owner.
- Adding an app = one entry (Compose project + database name) in the backup config.

### 8. Portal: Homepage

A [Homepage](https://gethomepage.dev) container behind Caddy at the root hostname, configured from YAML files in the `infra` repo: one tile per app with a server-side health check on its health endpoint (Finances: `/api/health` through `web`), plus links to server tools (backup monitor). Adding an app = one entry in `services.yaml`. A tiny static page was considered, but live health status from the browser would need CORS on every app; Homepage checks server-side.

### 9. Provider and size: Hostinger KVM 2, EU datacenter, prepaid 12 months

- **Hostinger KVM 2** (2 vCPU, 8 GB RAM, NVMe, ~8 TB traffic) in an **EU datacenter** (France or another EU location, chosen at order time), Debian/Ubuntu LTS image.
- **Prepaid 12 months**, **auto-renew off**, with a reminder a month before the term ends to compare the renewal price (Hostinger's renewal is notably higher than the first term).
- Hostinger's API (and the Hostinger MCP plugin) lets us script provisioning, the provider firewall and snapshots.

Alternatives considered:

| Provider                     | Pros                                                             | Cons                                                        |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| **Hostinger KVM 2** (chosen) | Cheap prepaid, 8 GB RAM, EU datacenters, API + provider firewall | Renewal price jump, prepaid lock-in, support quality varies |
| OVHcloud VPS-2               | French company, monthly billing, good price                      | Slower console/support, provider firewall less convenient   |
| Hetzner Cloud (CX/CPX)       | Best price/perf, hourly billing, excellent API and firewall      | Account approval can be hard to obtain                      |

The choice is cheap to reverse: the server is rebuilt from the `infra` repo and the off-site backups, and URLs don't change (own domain).

## Consequences

- **Security surface**: no inbound port on the public interface. Docker-published ports bypass `ufw`, so the rule is: no app publishes ports at all; only Caddy publishes, bound to the Tailscale IP. The Hostinger firewall denies all inbound as a second layer (the public MCP endpoint, if any, will be an explicit exception in #78).
- **Recovery** depends on Tailscale: if the tailnet is unreachable, access goes through the Hostinger browser console (documented in the hardening runbook).
- **Two repos to keep in sync**: the shared network name (`proxy`) and each app's upstream (`<project>-web-1:3000` or a service alias) are the contract between `infra` and app repos, documented in both.
- **Costs**: VPS (prepaid), domain (~€10/year), object storage for backups (a few €/year at this volume). Cloudflare DNS, Tailscale (personal plan), GHCR (private images within the free quota) and Homepage are free.
- **More work than a PaaS** up front (Caddyfile, deploy script, backup script), but each piece is small, versioned and replaceable.

## Impact on M6 issues

- **#87 Provision**: order Hostinger KVM 2 (EU, 12 months, auto-renew off); create the `infra` repo with the bootstrap script and rebuild runbook; Docker drop-in `After=tailscaled.service`.
- **#29 Hardening**: Hostinger firewall deny-all inbound + `ufw` on the host; only Caddy publishes ports, on the Tailscale IP; ACLs with `tag:ci` for deploys; recovery via the Hostinger console.
- **#88 Portal**: Homepage, config in `infra`, at the root hostname.
- **#28 Production stack**: no host ports; `web` joins the external `proxy` network; own Postgres container; images from GHCR with pinned tags; compiled `migrate` script in the API image; `APP_URL=https://finances.<base>`.
- **#49 Trust proxy**: the API trusts `X-Forwarded-For` only from the Compose network (web → API), and `web` trusts it only from Caddy on the `proxy` network.
- **#31 Deploy pipeline**: GHCR images on `vX.Y.Z`, Tailscale ephemeral `tag:ci` node + SSH to a `deploy` user, migrate → up → health check → rollback.
- **#30 Backups**: restic to an EU S3-compatible bucket outside Hostinger, healthchecks-style alerting, config and runbooks in `infra`.
- **#85 Real-device checks**: unchanged, run against `https://finances.<base>` once deployed.
- **New prerequisite**: buy the domain and move its DNS to Cloudflare (part of #87).

## Amendments

Factual updates made while implementing the decision; the decision itself is unchanged.

- **2026-11-07 (#87)**: the VPS was ordered as a Hostinger KVM 2 in the **Paris** datacenter, prepaid **24 months** instead of 12, on plain Ubuntu 24.04 LTS. Auto-renew is off; it expires on 2028-11-07, with a calendar reminder a month before. The domain is `gbodin.cloud`, registered at Hostinger with auto-renew on; its DNS is at Cloudflare as decided in §3. The server joined the tailnet as `vps` (`tag:server`), and public inbound traffic is blocked by both `ufw` and the Hostinger firewall. Setup and runbooks are in the `infra` repo.
