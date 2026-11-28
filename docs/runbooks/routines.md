# Runbook — the project's routines

Scheduled tasks of the Claude project that keep Capi moving without the owner writing a message (2026-11-28, after #601). Each one wakes the project's coordinator, which starts **one thread** for the run (the work stays out of the project chat) and posts at most one short message. The owner's only job is to answer decision cards: **yes or no to a task**, a visual direction, a merge. He keeps proposing ideas himself whenever he wants; they go through the same `prêt` label.

## The week

The owner's week starts on **Friday**, when his weekly usage limit resets, and **Monday and Tuesday are rest days**: no routine runs, so a limit nearly spent by then is not used up by automation. Audits run early in the week, while the limit is full; the review closes it on Thursday. Round hours only.

| When (Europe/Paris)   | Routine                                        | Produces                                                                                         |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Wed–Sun 6:00          | Morning: GitHub up to date, then ready tickets | backlog fixed, up to 3 threads ([morning routine](morning-routine.md))                           |
| Fri 20:00             | Security audit                                 | up to 2 proposals, one card each                                                                 |
| Sat 20:00             | Maintainability audit (for an AI)              | up to 2 refactor proposals, one card each                                                        |
| Sun 20:00             | Product proposals                              | 2 evolution ideas (3 if the audits left room), one card each                                     |
| Thu 20:00             | Weekly review and artifacts                    | the week in one message, artifacts updated, stale ones proposed for deletion, a release proposed |
| 1st of the month 9:00 | Month-end reminder                             | one message: import the statements, then « Bilan du mois »                                       |

Evening runs land after the day's work and before the next morning run, so a « Oui » given in the evening starts the next morning (Sunday evening's starts on Wednesday).

## Every run leaves its recap on « Routines Capi »

The owner reads his routines on a page, not in conversations. Every run, whatever the routine, ends by writing **one document** to the database of the « Routines Capi » artifact (https://claude.ai/artifact/Q11jKVYRX3E4bPekevPLzz), with the `ArtifactData` tool: `set` in the collection `runs`, `doc_id` `<routine>-<YYYY-MM-DD>` (rewriting the same day's document if it runs again, pinned with `if_version`):

```json
{
  "routine": "matin | securite | maintenabilite | propositions | revue | bilan",
  "at": "2026-11-29T06:00:00+01:00",
  "summary": "one or two short French sentences",
  "items": [
    {
      "label": "few words",
      "url": "https://…",
      "status": "attente | alerte | demarre | fusionne | info"
    }
  ]
}
```

`attente` items (a decision card, a preview to test, a PR to read) and `alerte` items (a live risk) appear at the top of the page under « T'attend »; the page shows each routine's latest run. At most 5 items, links to GitHub, threads or artifacts only, French, no amounts, labels or other financial data. A message in the project chat stays short and points to the page.

## How a proposal becomes work

```text
audit thread ── finds something ──> GitHub issue (template, type + area labels, milestone)
                                    + label `proposition`, never `prêt`
                                    + one decision card to the owner
owner's card:  « Oui »        → `proposition` → `prêt`   (starts on a morning run)
               « Plus tard »  → stays `proposition`       (re-offered at most once, after 4 weeks)
               « Non »        → issue closed as not planned, label kept (never proposed again)
```

- **At most 6 cards a week for all audits**: 2 for security, 2 for maintainability, 2 for proposals (which may use what the other two left, 3 at most), the most valuable first; the rest stays in the run's report. With at most 3 tickets in progress, more would pile up. Fewer is better than noise: a run with nothing worth doing says so in one line.
- **No duplicates**: before filing, the thread searches open and closed issues (including the ones closed « Non »).
- **Small and clear**: each proposal is one ticket a thread can finish (Context / Scope / Acceptance criteria / Out of scope), with its cost in a word (petit, moyen, gros) and why now.
- A finding that is a **live security risk** (a secret in the repo, a high or critical advisory with no allow-list entry, an exposed port) is reported to the owner at once, in the run's thread, not batched.

## The routines

### GitHub up to date (first step of every morning run)

Keeps GitHub the single source of truth, so threads and the owner never work from a stale backlog. Decides alone, asks nothing:

- closes issues whose PR merged without closing them; closes epics whose sub-issues are all closed;
- removes `en-cours` from issues no thread works on any more (thread done, failed or stopped) and tells the owner in the weekly review;
- every open issue has a type label, an `area:*` label and a milestone (picks the obvious one, else leaves it for the weekly review);
- checkboxes of an issue's acceptance criteria ticked from its merged PR;
- open PRs: red CI or a conflict with no thread on it is listed for the next morning message;
- updates the « Roadmap Capi » page (statuses, merged items) and the project memory when they drifted.

### Security audit (weekly, Friday)

Reads, never changes production. Inputs: the week's `security.yml` and `container-scan.yml` runs, Dependabot alerts and PRs, the audit allow-list (`.github/security/audit-allowlist.json`: every entry still has its `fix` issue and its reason still holds), the code merged this week against the [ASVS checklist](../security/asvs-l2-checklist.md) and the [threat model](../security/threat-model.md) (new routes and their guards, `@TokenAccess`, logging of private data, CSP, secrets), and `CLAUDE.md`'s privacy rules. Dependabot PRs that are green and not `à-valider` follow the auto-merge rule. Proposals: `fix` issues (area `area:security`).

### Maintainability audit for an AI (weekly, Saturday)

What makes the next thread faster and safer: files and functions that grew too big, duplicated logic, dead code and unused exports, tests missing around domain rules, `CLAUDE.md` and `docs/domain/` that drifted from the code or grew past what a session reads, `TODO` without an issue, slow or flaky tests. One area per run, rotating (API, web, MCP, packages, docs), so a run stays short. Proposals: `chore` refactor issues, each behaviour-preserving with the tests that prove it.

### Product proposals (weekly, Sunday)

Claude proposes evolutions itself: from the roadmap and its milestones, what the merged work now makes possible, gaps between the app, the MCP and the Skill, the mobile audit conventions, and the owner's recurring asks in the project chat. Never from real financial data. 2–3 ideas per run, each with a one-line why and, for a visual idea, the note that it will start with 2–3 mockups. Proposals: `feat` issues.

Mostly the app, and **at most one proposal a week on the owner's workflow around Capi**: the routines themselves, how Claude projects are split, tooling and CI, as an issue in `capi` with `area:ci`. The server and the `infra` repository (Caddy, the portal, backups, Tailscale) belong to the separate « Serveur gbodin.cloud » Claude project since 2026-11-28, which has its own routines: Capi's proposals never cover them. Every proposal says what the owner would have to do himself. A proposal may also be **a new artifact** that would help him understand or follow something; « Oui » makes it.

### Weekly review and artifacts (weekly, Thursday)

- One message: merged this week, started, waiting for the owner, `proposition` cards still open, what the next week's mornings will start.
- Every artifact of the project is read: one that drifted from the code or the roadmap is updated in place (same link); one that no longer serves (a decision taken and recorded elsewhere, a duplicate, a finished test protocol) is **proposed for deletion on one card** with its replacement. Deletion only after the owner's « Oui » on that card.
- Project memory: wrong or stale entries fixed.
- **Release proposal**: when `main` has commits the latest `v*` tag does not and the latest staging deploy is green, one card « Mettre en prod vX.Y.Z ? » with the changes in plain words and the link to Actions › Staging. The owner tags and approves; no routine ever creates a tag.

### Month-end reminder (monthly, the 1st)

One message: import the month's statements in Capi, then ask Claude for the « Bilan du mois » (Skill `capi`). With the Capi tools, it names the accounts still to import by type only, never amounts or labels; it imports, categorizes and closes nothing. After the re-import (#483) it will propose replacing the owner's separate Drive-based monthly task.

### The server is another project's

Server health (disk, certificate, backups, server ≟ `infra` `main`) is checked by the « Serveur gbodin.cloud » Claude project, not here (#613 closed). What stays in `capi` is what runs from this repository: previews (`deploy/preview.sh`), staging and production deploys.

## Change or stop a routine

Ask the coordinator: the scheduled tasks are named « Routine … Capi ». The owner can pause one, change its day or time, or ask for a run now.
