# Runbook — releasing and deploying Finances

How a version reaches the server, how to set the pipeline up once, and how to roll back. Decisions: [ADR 0001](../adr/0001-multi-app-hosting.md) §5–6. The production stack itself (`docker-compose.prod.yml`, `/srv/finances/.env`, first start) is described in the production stack runbook (#28).

## How it works

```text
git push tag vX.Y.Z
  └─ .github/workflows/release.yml
       ├─ version   validate vX.Y.Z, check the tagged commit is on main
       ├─ ci        the CI workflow (lint, types, tests, build), called as a reusable workflow
       ├─ images    build, Trivy, push ghcr.io/gregoirebdn/finances-{api,web,mcp}:{vX.Y.Z, sha-<short>}
       └─ deploy    environment `production`
            ├─ join the tailnet as an ephemeral `tag:ci` node (Tailscale OAuth client)
            ├─ upload deploy/deploy.sh + docker-compose.prod.yml of the tag to /srv/finances/releases/vX.Y.Z/
            └─ ssh deploy@vps → deploy.sh vX.Y.Z <compose file>
```

`deploy/deploy.sh` (also copied to `/srv/finances/deploy.sh` for manual use), under a `flock` so two deploys never overlap:

1. installs the release's `docker-compose.prod.yml` (the previous one is kept until the deploy succeeds);
2. records the current `FINANCES_VERSION` from `/srv/finances/.env` and sets the new one;
3. `docker compose pull api web`, plus `finances-mcp` when the release's compose file has it and its profile is on (`COMPOSE_PROFILES=remote-mcp` in `.env`, #328; with the profile on and `REMOTE_MCP_ENABLED` not `true` the deploy stops here, since the adapter would refuse to start);
4. runs the migrations, then the seed (idempotent), from the **new** API image (`docker compose run --rm api node dist/database/{migrate,seed}.js`);
5. `docker compose up -d --remove-orphans`;
6. polls `http://localhost:3000/api/health` from inside the `web` container (web → API → database and SMTP), and with the adapter on `http://localhost:4100/.well-known/oauth-protected-resource` from inside `finances-mcp`, every 5 s for 3 minutes;
7. on any failure: puts back the previous compose file and `FINANCES_VERSION`, runs `up -d --remove-orphans` again if containers were already restarted (the adapter goes back to the previous image too, or is removed when the previous compose file has no `finances-mcp`), waits for health, and exits non-zero, so the workflow run fails.

Every run is appended to `/srv/finances/deploy.log`. A dropped SSH connection (e.g. a cancelled workflow run) doesn't interrupt the script.

The previous version stays up while the images are pulled and the migrations run; containers are only recreated at step 5. If the pull or the migrations fail, nothing that was running is touched. Drizzle applies pending migrations in one transaction, so a failed migration leaves the schema unchanged.

## One-time setup

All of this is done by the owner; nothing in the repo holds a secret.

### 1. `deploy` user on the server

As `ops`:

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 750 /srv/finances
# If /srv/finances already exists (stack runbook, #28):
sudo chown -R deploy:deploy /srv/finances
sudo chmod 600 /srv/finances/.env
```

- `deploy` must own `/srv/finances` and be able to read and rewrite `.env` (only the `FINANCES_VERSION` line is changed; the file stays mode `600`).
- No password and no `authorized_keys` are needed with Tailscale SSH.
- Membership of the `docker` group is root-equivalent on the host: what keeps this account restricted is that only the `tag:ci` node can reach it (ACLs below), and only from this workflow.
- `flock` (util-linux), `timeout` and `tee` (coreutils) ship with Ubuntu.

### 2. Pull access to GHCR

The images are private. Create a **classic** personal access token with only the `read:packages` scope (GHCR doesn't accept fine-grained tokens), named e.g. `vps-ghcr-read`, then on the server:

```bash
sudo -iu deploy
docker login ghcr.io -u GregoireBDN --password-stdin   # paste the token, then Ctrl-D
```

The credential is stored in `~deploy/.docker/config.json`. If the token has an expiry, add a reminder: deploys fail at the pull step (and keep the running version) once it expires.

The `finances-api` and `finances-web` packages are created by the first release, private and linked to this repository (OCI `source` label), so the workflow can push to them and read them with its own `GITHUB_TOKEN`.

### 3. Tailscale

- Enable Tailscale SSH on the server: `sudo tailscale set --ssh`.
- In the tailnet policy file (keep the reference copy in the `infra` repo in sync), the `tag:ci` node may only SSH to the server as `deploy`:

  ```jsonc
  "tagOwners": {
    "tag:ci":     ["autogroup:admin"],
    "tag:server": ["autogroup:admin"],
  },
  "grants": [
    // CI runners reach only the server's SSH port.
    { "src": ["tag:ci"], "dst": ["tag:server"], "ip": ["tcp:22"] },
  ],
  "ssh": [
    // ...and log in only as `deploy`, without a browser check.
    { "action": "accept", "src": ["tag:ci"], "dst": ["tag:server"], "users": ["deploy"] },
  ],
  ```

  Make sure no other rule (e.g. a catch-all `*` grant) gives `tag:ci` more.

- Create an OAuth client (admin console › Settings › OAuth clients) with the **Auth Keys: write** scope and the tag **`tag:ci`**. The GitHub Action uses it to create an ephemeral, pre-approved auth key for each run; the node is logged out at the end of the job.

Fallback if the server only runs OpenSSH (no Tailscale SSH): generate an `ed25519` key pair, put the public key in `~deploy/.ssh/authorized_keys`, and store the private key in the `DEPLOY_SSH_KEY` secret. The workflow uses it when the secret is set. The grant on `tcp:22` is still required; the `ssh` rule isn't.

### 4. GitHub

Secrets (Settings › Secrets and variables › Actions):

| Name                 | Kind               | Value                                                    |
| -------------------- | ------------------ | -------------------------------------------------------- |
| `TS_OAUTH_CLIENT_ID` | secret             | Tailscale OAuth client id                                |
| `TS_OAUTH_SECRET`    | secret             | Tailscale OAuth client secret                            |
| `DEPLOY_SSH_KEY`     | secret, optional   | only for the OpenSSH fallback above                      |
| `DEPLOY_HOST`        | variable, optional | server's tailnet name if not `vps` (MagicDNS name or IP) |

The deploy job runs in the GitHub environment **`production`**. The repository is **public** (since 2026-11-17), so on GitHub Free the environment enforces:

- **Required reviewer**: the owner, "Prevent self-review" **off** (single user, otherwise nobody can approve) and admins can't bypass. Every deploy waits for the owner's approval in the Actions run (Review deployments).
- **Deployment branches and tags**: the tag pattern `v*` and the branch `main` (the manual redeploy runs from `main`); nothing else can deploy.
- **Secrets**: keep `TS_OAUTH_*` (and `DEPLOY_SSH_KEY` if used) as **environment** secrets of `production`, not repository secrets, so only the approved deploy job can read them.

Fork pull requests from outside contributors need approval before their workflows run (Settings › Actions › "Require approval for all external contributors"); `pull_request` runs from forks never see secrets.

The workflow reads `secrets.TS_OAUTH_*` the same way in every case: environment secrets win over repository secrets when both exist.

## Releasing

From an up-to-date `main` whose CI is green:

```bash
git switch main && git pull
git tag v1.2.3
git push origin v1.2.3        # or: git push --tags
```

Then follow the **Release** run in GitHub Actions (CI → images → deploy). Tags must be `vX.Y.Z` on a commit of `main`; anything else fails in the first job, before building.

If the release adds variables to the production `.env`, add them on the server **before** pushing the tag (see #28's runbook); `deploy.sh` only changes `FINANCES_VERSION`.

After a successful deploy, open the installed PWA on the phone: the service worker picks up the new build and the **"Nouvelle version disponible"** toast appears (on launch or when the app comes back to the foreground, at most hourly); "Recharger" switches to the new version. Check it on a real device as part of #85.

## Rolling back

### Automatic

If the health check fails (or the pull, migrations or seed fail), `deploy.sh` restores the previous version itself and the run fails. Read the run log or `/srv/finances/deploy.log` to see which step failed.

### Redeploy an earlier version

GitHub › Actions › **Release** › **Run workflow** (branch `main`), `version` = the tag to go back to, e.g. `v1.2.2`. Nothing is rebuilt: the run checks that the images exist in GHCR (`finances-mcp` too for a tag whose compose file has the adapter, #328), then deploys that tag with its own `deploy.sh` and `docker-compose.prod.yml`. The same works with the CLI:

```bash
gh workflow run release.yml -f version=v1.2.2
```

Without GitHub (as `deploy` on the server, over Tailscale): `/srv/finances/releases/v1.2.2/deploy/deploy.sh v1.2.2 /srv/finances/releases/v1.2.2/docker-compose.prod.yml` (each deployed version's files stay under `releases/`).

### When a migration must be undone

Rolling back the images does **not** roll back the database: the previous version then runs against the newer schema. Keep migrations backward compatible (add columns/tables first, remove them in a later release) so that this is safe. If a migration really has to be undone, restore the database from the last backup taken before the deploy, following the backups runbook in the `infra` repo (restic, `pg_dump` per app, #30), then redeploy the previous tag as above.

## Troubleshooting

- **`another deploy is already running`**: a deploy holds `/srv/finances/.deploy.lock`. Wait for it; the lock is released when its process exits.
- **Tailscale step fails**: check the OAuth client (scope, tag `tag:ci`) and that `tag:ci` is in `tagOwners`.
- **SSH: `Permission denied` / `tailscale: tailnet policy does not permit you to SSH`**: the `ssh` rule or the `tcp:22` grant is missing, or Tailscale SSH isn't enabled on the server.
- **Pull fails (`denied` / `unauthorized`)**: the server's GHCR token expired or lacks `read:packages`; log in again as `deploy`.
- **Health check never passes**: `docker compose -f docker-compose.prod.yml logs --tail=100 api web` in `/srv/finances`; `/api/health` also fails when SMTP is unreachable.
