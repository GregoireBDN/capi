# Runbook — the project's routines

Scheduled tasks of the Claude project that keep Capi moving without the owner writing a message (2026-11-28, after #601). Each one wakes the project's coordinator, which starts **one thread** for the run (the work stays out of the project chat) and posts at most one short message. The owner's only job is to answer decision cards: **yes or no to a task**, a visual direction, a merge. He keeps proposing ideas himself whenever he wants; they go through the same `prêt` label.

## The week

| When (Europe/Paris) | Routine                           | Produces                                                                     |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Mon–Fri 6:52        | Morning: start ready tickets      | up to 3 threads ([morning routine](morning-routine.md))                      |
| Mon–Fri 21:37       | GitHub up to date                 | issues, labels, milestones, roadmap fixed; nothing to decide                 |
| Mon 20:23           | Security audit                    | `fix` / `chore` proposals, one card each                                     |
| Wed 20:41           | Maintainability audit (for an AI) | refactor proposals, one card each                                            |
| Fri 20:17           | Product proposals                 | 2–3 evolution ideas, one card each                                           |
| Sun 19:33           | Weekly review and artifacts       | the week in one message, artifacts updated, stale ones proposed for deletion |

Evening runs land after the day's work and before the next morning run, so a « Oui » given in the evening starts the next weekday morning.

## How a proposal becomes work

```text
audit thread ── finds something ──> GitHub issue (template, type + area labels, milestone)
                                    + label `proposition`, never `prêt`
                                    + one decision card to the owner
owner's card:  « Oui »        → `proposition` → `prêt`   (starts on a morning run)
               « Plus tard »  → stays `proposition`       (re-offered at most once, after 4 weeks)
               « Non »        → issue closed as not planned, label kept (never proposed again)
```

- **At most 3 cards per audit run**, the most valuable first; the rest stays in the run's report. Fewer is better than noise: a run with nothing worth doing says so in one line.
- **No duplicates**: before filing, the thread searches open and closed issues (including the ones closed « Non »).
- **Small and clear**: each proposal is one ticket a thread can finish (Context / Scope / Acceptance criteria / Out of scope), with its cost in a word (petit, moyen, gros) and why now.
- A finding that is a **live security risk** (a secret in the repo, a high or critical advisory with no allow-list entry, an exposed port) is reported to the owner at once, in the run's thread, not batched.

## The routines

### GitHub up to date (daily, weekday evenings)

Keeps GitHub the single source of truth, so threads and the owner never work from a stale backlog. Decides alone, asks nothing:

- closes issues whose PR merged without closing them; closes epics whose sub-issues are all closed;
- removes `en-cours` from issues no thread works on any more (thread done, failed or stopped) and tells the owner in the weekly review;
- every open issue has a type label, an `area:*` label and a milestone (picks the obvious one, else leaves it for the weekly review);
- checkboxes of an issue's acceptance criteria ticked from its merged PR;
- open PRs: red CI or a conflict with no thread on it is listed for the next morning message;
- updates the « Roadmap Capi » page (statuses, merged items) and the project memory when they drifted.

### Security audit (weekly, Monday)

Reads, never changes production. Inputs: the week's `security.yml` and `container-scan.yml` runs, Dependabot alerts and PRs, the audit allow-list (`.github/security/audit-allowlist.json`: every entry still has its `fix` issue and its reason still holds), the code merged this week against the [ASVS checklist](../security/asvs-l2-checklist.md) and the [threat model](../security/threat-model.md) (new routes and their guards, `@TokenAccess`, logging of private data, CSP, secrets), and `CLAUDE.md`'s privacy rules. Dependabot PRs that are green and not `à-valider` follow the auto-merge rule. Proposals: `fix` issues (area `area:security`).

### Maintainability audit for an AI (weekly, Wednesday)

What makes the next thread faster and safer: files and functions that grew too big, duplicated logic, dead code and unused exports, tests missing around domain rules, `CLAUDE.md` and `docs/domain/` that drifted from the code or grew past what a session reads, `TODO` without an issue, slow or flaky tests. One area per run, rotating (API, web, MCP, packages, docs), so a run stays short. Proposals: `chore` refactor issues, each behaviour-preserving with the tests that prove it.

### Product proposals (weekly, Friday)

Claude proposes evolutions itself: from the roadmap and its milestones, what the merged work now makes possible, gaps between the app, the MCP and the Skill, the mobile audit conventions, and the owner's recurring asks in the project chat. Never from real financial data. 2–3 ideas per run, each with a one-line why and, for a visual idea, the note that it will start with 2–3 mockups. Proposals: `feat` issues.

### Weekly review and artifacts (weekly, Sunday)

- One message: merged this week, started, waiting for the owner, `proposition` cards still open, what the next week's mornings will start.
- Every artifact of the project is read: one that drifted from the code or the roadmap is updated in place (same link); one that no longer serves (a decision taken and recorded elsewhere, a duplicate, a finished test protocol) is **proposed for deletion on one card** with its replacement. Deletion only after the owner's « Oui » on that card.
- Project memory: wrong or stale entries fixed.

## Change or stop a routine

Ask the coordinator: the scheduled tasks are named « Routine … Capi ». The owner can pause one, change its day or time, or ask for a run now.
