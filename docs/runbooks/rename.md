# Runbook — renaming the infrastructure to Capi (#464, phase 3)

Phases 1 (what the owner sees, #465) and 2 (packages `@capi/*`, MCP variables, storage keys, service worker cache) changed only code. What still says `finances` is infrastructure: the GitHub repository, the images, the compose projects and volumes, the server folders, the domains and the databases. Renaming one of them can sign the owner out, break the passkeys or lose data if done carelessly, so this runbook lists every item, says what renaming it costs and recommends **rename** or **keep**. The owner decided each row on 2026-11-25 (the **Decision** column: every recommendation taken), and the work is done in the order of [The plan](#the-plan).

## What still says `finances`

| #   | Item                                 | Where                                                                                                                                                                                                  | Cost of renaming                                                                                                                                                          | Recommendation                                                                           | Decision                 |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| 1   | GitHub repository                    | `GregoireBDN/finances`                                                                                                                                                                                 | Low: GitHub redirects the old URLs, git remotes and API calls; rulesets, environments, secrets, variables, issues and Dependabot follow the repository.                   | **Rename** to `GregoireBDN/capi`                                                         | Rename                   |
| 2   | Images                               | `ghcr.io/gregoirebdn/finances-{api,web,mcp}`: `release.yml`, `staging.yml`, `container-scan.yml` (cache scopes), `docker-compose.prod.yml`, `docker-compose.build.yml`                                 | Low: new packages are created on the first push. A rollback to a version built before the rename needs the old name (see [Rolling back](#rolling-back-after-the-rename)). | **Rename** to `capi-*`, keep the old packages until a release has run under the new name | Rename                   |
| 3   | Compose project names                | `name: finances` (prod and dev), `finances-staging`, `-p finances-staging` in `deploy.sh`                                                                                                              | **Data loss risk**: the project name prefixes the volume (`finances_db_data`). Renamed carelessly, the new project starts on an **empty** database.                       | **Rename**, with the volumes pinned to their current names (`name:`), no data copied     | Rename                   |
| 4   | Service and network aliases          | service `finances-mcp`, aliases `finances-web`, `finances-staging-web`, `finances-mcp` on `proxy` (Caddy upstreams in `infra`), `PRODUCTION_WEB_ALIAS` in `deploy.sh`                                  | Low if both names are served for one release (see the plan).                                                                                                              | **Rename** to `capi-web`, `capi-staging-web`, `capi-mcp`                                 | Rename                   |
| 5   | Server folders                       | `/srv/finances`, `/srv/finances-staging` (`RELEASE_DIR`, `STAGING_DIR` in the workflows), restic paths in `infra`                                                                                      | Medium: a `mv` while the stack is down, the backup paths and the workflows in the same window.                                                                            | **Rename** to `/srv/capi`, `/srv/capi-staging`                                           | Rename                   |
| 6   | Variables                            | `FINANCES_VERSION` (`.env`, compose, `deploy.sh`, `test-deploy.sh`), `FINANCES_DIR`                                                                                                                    | Low: `deploy.sh` reads the old name when the new one is unset, like the MCP variables in phase 2.                                                                         | **Rename** to `CAPI_VERSION`, `CAPI_DIR`, old names read as a fallback                   | Rename                   |
| 7   | Domains                              | `finances.gbodin.cloud`, `finances-staging.gbodin.cloud`, `finances-mcp.gbodin.cloud`: Caddy and DNS (`infra`), `APP_URL`, `WEBAUTHN_*`, `REMOTE_MCP_PUBLIC_URL`, `STAGING_URL`, the workflows' `url:` | **High** for the owner, see [Changing the domains](#changing-the-domains).                                                                                                | **Rename**, in its own window, the old hosts kept as redirects for 3 months              | Rename                   |
| 8   | Database names                       | `finances` (prod), `finances_staging`, `finances_test`, `finances_demo`, the demo guard (`demo/guard.ts`), `DEMO_STAGING_DATABASE`, `ci.yml`                                                           | High: a dump and restore of production for a name nobody sees; the demo guard refuses `finances` by name.                                                                 | **Keep**                                                                                 | Keep                     |
| 9   | `EMAIL_FROM` default                 | `noreply@finances.app` in `docker-compose.prod.yml`                                                                                                                                                    | None: it is a default, the real value is in `.env` and must be an address the SMTP provider accepts.                                                                      | **Rename** the default to `noreply@capi.app`                                             | Rename                   |
| 10  | Repository folder on the owner's Mac | `~/workspace/finances`                                                                                                                                                                                 | Medium: Claude Code's project memory is keyed by the path, and the worktrees under `.claude/worktrees/` point at it.                                                      | **Keep**                                                                                 | Keep                     |
| 11  | MCP client key                       | `"finances"` in the Claude Desktop and Claude Code config, so `/mcp__finances__revue_du_mois`                                                                                                          | Low, on the owner's machine only; the « Accès Claude » page still writes `finances`.                                                                                      | **Keep** (or rename by hand in the config, then in `mcp-setup.ts`)                       | Keep                     |
| 12  | Token prefixes                       | `fin_pat_`, `fin_oat_`, `fin_ort_`, `fin_oac_`                                                                                                                                                         | Existing tokens and the gitleaks rules rely on them.                                                                                                                      | **Keep** (out of scope of #464)                                                          | Keep                     |
| 13  | Drive folder default                 | « Finances » in `investments-prompt.ts`                                                                                                                                                                | It is the owner's Drive folder, not the app's name.                                                                                                                       | **Keep** (out of scope of #464)                                                          | Keep                     |
| 14  | Test fixtures and docs examples      | `finances.example.test`, `finances-mcp.example.com`, `usertest@finances.test`, `finances_scratch`, `finances-local`, `finances-audit`                                                                  | None, but the demo account's email is printed by `pnpm db:demo` and typed by hand.                                                                                        | **Rename** with the code PR, except the demo email (**keep**: muscle memory)             | Rename (demo email kept) |

After phase 3, `git grep -i finances` must list only the rows kept above; each kept row's reason is this table.

## The plan

Four steps, each one deployable alone: A and C need no window, B and D each need a short one.

### A. One PR: both names work (no window, no visible change) — done in #464's phase 3 PR

Everything except the compose project names, their volumes and the server folders, which move together in step B.

- Workflows (`release.yml`, `staging.yml`, `container-scan.yml`): images `capi-*`, cache scopes `capi-*`; a manual rollback run checks the images the tag's own compose file names (`finances-*` before #464). **The owner pushes this part** (or commits it from the GitHub editor): the Claude GitHub App has no `workflows` permission.
- `docker-compose.prod.yml` / `docker-compose.staging.yml` / `docker-compose.build.yml`: images `capi-*` pinned by `CAPI_VERSION`, service `capi-mcp`, and on `proxy` **both** aliases (`capi-web` and `finances-web`, `capi-staging-web` and `finances-staging-web`, `capi-mcp` and `finances-mcp`), so Caddy works before and after its change. The `.env` templates name `CAPI_VERSION`.
- `deploy.sh` / `test-deploy.sh`: `CAPI_VERSION` **and** `FINANCES_VERSION` written to `.env` with the same value (a compose file before #464, used by a rollback, reads the old name), the running version read from `FINANCES_VERSION` first (a `deploy.sh` before #464 only rewrites that one), the adapter found as `capi-mcp` or `finances-mcp`, `CAPI_DIR` read before `FINANCES_DIR`, the staging check refusing both production aliases.
- `EMAIL_FROM` default `noreply@capi.app`, docs and test fixtures (rows 9 and 14).

A release of A changes nothing visible: same project, same volume, same folder, Caddy still on the old aliases. **After that release**, switch the Caddy upstreams to `capi-web:3000`, `capi-staging-web:3000` and `capi-mcp:4100` (`infra`) and reload: the old aliases then only serve a rollback.

### B. Projects and folders (one release, about 15 minutes of downtime)

**Two Postgres must never run on the same volume.** As soon as the project name changes, `docker compose` no longer sees the old containers: a deploy that starts `capi` while `finances` still runs would start a second database on the same data directory. So the project rename ships with a `deploy.sh` that, before the migrations, stops the project it replaces (`docker compose -p finances down`, **never** `-v`) and, on rollback, stops `capi` before starting the previous compose file. `test-deploy.sh` covers both, plus the staging pair. The PR:

- `name: capi` / `capi-staging`; `deploy.sh` defaults `/srv/capi`, `/srv/capi-staging` and its `LEGACY_PROJECT=finances` / `finances-staging`;
- the volume keeps its name, given by `.env` so that no other stack built from this file (a local `-p capi-local`, the `finances-audit` pentest stack) can open production's data by default:

  ```yaml
  volumes:
    db_data:
      name: ${DB_VOLUME:?set DB_VOLUME in .env} # finances_db_data: created by the `finances` project
  ```

  `DB_VOLUME=finances_db_data` in `/srv/capi/.env`, `finances-staging_db_data` in staging's, the templates and `deploy.sh` (it refuses to run without it). Compose may warn that the volume "was created for project finances": expected, the data is the point;

- `docker-compose.yml` (dev): `name: capi`, `postgres_data` named `finances_postgres_data`, so the owner's local database stays;
- the workflows' `RELEASE_DIR` / `STAGING_DIR` under `/srv/capi*` (owner push again).

Merging it deploys staging at once (its data is rebuilt anyway), so first, on the server: `sudo mv /srv/finances-staging /srv/capi-staging`. For production, in one window:

1. Backup (#423): run the restic job by hand and check the snapshot (`infra` backups runbook).
2. `cd /srv/finances && docker compose -p finances down` (no `-v`), then `sudo mv /srv/finances /srv/capi`.
3. `infra`: the restic paths now under `/srv/capi`; Caddy is unchanged (it already targets `capi-*`).
4. Tag the release; `deploy.sh` runs in `/srv/capi` under the project `capi`, on the pinned volume.
5. Check: `docker volume ls` shows **no** new `capi_db_data`; `https://finances.gbodin.cloud/api/health` answers `200`; sign in; a page with data.

### C. Repository rename (any time after B)

GitHub → Settings → General → Repository name: `capi`. Then on the Mac: `git remote set-url origin git@github.com:GregoireBDN/capi.git`; README badges and links in the docs (a search-and-replace PR). The Claude project's repository setting and the GHCR packages' repository link follow the rename by themselves; check the packages' « Manage Actions access » still lists the repository.

### D. Domains (own window, see below), then cleanup

After a month with no rollback: remove the `finances-*` aliases and the `FINANCES_*` fallbacks, delete the old GHCR packages, then `git grep -i finances` matches only the kept rows.

## Changing the domains

New hosts `capi.gbodin.cloud`, `capi-staging.gbodin.cloud`, `capi-mcp.gbodin.cloud`. A new host is a new origin, so:

- **Passkeys stop working**: they are bound to the relying party id (the host). Sign in with the **password** (have it at hand), add a new passkey on each device, then delete the old ones (Profil → Passkeys).
- **Every session ends**: the `__Host-` cookies belong to the old host.
- **The PWA must be reinstalled** on the iPhone: delete the home-screen icon, open the new address in Safari, Share → Sur l'écran d'accueil. Settings kept in the browser (forecast threshold, theme, MCP server path) start empty on the new origin.
- **The Claude connector** (remote MCP, only if it was enabled) must be removed and added again with the new URL; `REMOTE_MCP_REDIRECT_URIS` doesn't change. Personal access tokens keep working, but the MCP config's `CAPI_API_URL` must point at the new host.
- Staging: only `STAGING_URL` and its Caddy block; demo data is rebuilt anyway.

Steps: DNS records and Caddy site blocks for the new hosts (`infra`, TLS issued on first request), then in `/srv/capi/.env` `APP_URL`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` (or empty to follow `APP_URL`), `REMOTE_MCP_PUBLIC_URL`; the workflows' `url:`; redeploy; then the old hosts become `redir https://capi.gbodin.cloud{uri} permanent` in Caddy for 3 months. The tailnet ACLs name the server, not the host, so they don't change.

## Rolling back after the rename

- Rolling back within step A: nothing to do, the project and the volume are unchanged.
- Rolling back across step B (to a version whose compose file says `finances`): `deploy.sh` stops `capi` before it starts the old project, on the same volume, so the data follows; but an old `deploy.sh` looks for `/srv/finances`, so run it by hand from `/srv/capi` with `FINANCES_DIR=/srv/capi`. Images built before step A exist only as `finances-*`, which is why the old packages are kept.
- A failed step B is undone by moving the folder back and redeploying the previous tag; nothing in B writes to the database except the release's own migrations.

## Not changed by this runbook

The database names (row 8), the token prefixes, the Drive folder, the Mac folder and the MCP client key, unless the owner decides otherwise above.
