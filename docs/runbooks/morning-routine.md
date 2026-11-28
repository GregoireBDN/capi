# Runbook — the morning routine

Every morning from Wednesday to Sunday (#601; Monday and Tuesday are rest days, see [routines](routines.md)), a scheduled task of the Claude project starts the next tickets the owner marked ready, one development thread per ticket, at most 3 at once. The owner never has to write a message for a ticket to start: he labels it, then answers decision cards and tests previews from the phone. Nothing runs on the server or on the owner's Mac (the agents stay in Claude Code's cloud; previews run on the server, [previews runbook](previews.md)).

## The two labels

| Label      | Who sets it                          | Meaning                                                              |
| ---------- | ------------------------------------ | -------------------------------------------------------------------- |
| `prêt`     | the owner, only him                  | ready to start: scope and acceptance criteria are what he wants      |
| `en-cours` | the routine, when it starts a thread | a thread works on it; counts towards the 3 until the issue is closed |

- **Nothing starts without `prêt`.** An issue without it is never picked, whatever its milestone or priority. A thread never adds `prêt`, to its own issue or another.
- On start the routine **replaces** `prêt` with `en-cours` on the issue (so a ticket is never started twice).
- **At most 3**: the routine counts the **open** issues labelled `en-cours`. Closing the issue (its PR's `Closes #n`) frees the slot. A thread that stops without closing it (the owner says stop, the ticket is split or abandoned) removes `en-cours` itself, and puts `prêt` back only if the owner asks.
- 3 is the number of previews the server keeps (`preview.sh`, at most 3), so every visual PR in progress has its preview.

## The run

At 6:00 Europe/Paris, Wednesday to Sunday, the scheduled task wakes the project's coordinator, which:

1. brings GitHub up to date first ([routines](routines.md#github-up-to-date-first-step-of-every-morning-run)): closed issues, `en-cours` left behind, labels, milestones, the roadmap page;
1. counts the open `en-cours` issues; `3 − count` slots are free (none: nothing starts);
1. lists the open `prêt` issues and orders them **by the « Roadmap Capi » page** (its order of chantiers and lots), then by milestone, then oldest issue first;
1. skips an issue that depends on an open issue (« after #n », « needs #n » in its body) or that needs a database migration while another thread holds one (one migration at a time, see the multi-user rule in `CLAUDE.md`), and takes the next;
1. for each issue taken: `prêt` → `en-cours`, then starts a thread named after the issue's goal, with the issue number and a link to this page;
1. posts **one short morning message** in the project chat: started today, waiting for the owner (a decision card or a preview to test, with links), merged since the last run. Nothing to report: no message.

The task fires into the coordinator's session; the coordinator is the only one that starts threads.

## Decision rules

What a development thread decides alone, and what goes to the owner. When in doubt, ask.

**Decides alone**

- How to build what the issue says: code layout, names, tests, refactors inside the ticket's scope.
- Following `CLAUDE.md` and `docs/domain/` (they win over the issue's wording when they conflict on a domain rule; the thread says so).
- Fixing its own failing checks, review comments from bots, rebases on `main`.
- Splitting off follow-up work as a **new issue without `prêt`** (the owner decides when it starts).
- A non-visual PR (no `visuel` / `à-valider` label): enables auto-merge (squash) as soon as the labels workflow has run (`CLAUDE.md` › Auto-merge, #600). The four required checks gate it.

**Asks the owner, with a decision card (2–4 options, one recommended)**

- **A visual direction** (a new page, a redesigned screen, anything the owner will see): 2–3 mockups first, shown as images on the card, before writing the screen. The thread keeps working on the recommended one while it waits.
- **A visual PR ready** (`visuel`): the preview link `https://capi-pr-<n>.gbodin.cloud` and a card « Fusionner · Corriger ». The owner tests on the phone; « Corriger » comes with what to change. The thread never merges a `visuel` PR without the owner's choice.
- **A PR labelled `à-valider`** (migration, auth, workflows, deploy, compose): the PR link and what to read; the owner reviews and merges.
- A choice that changes the ticket's goal or scope, a product question the issue doesn't settle, or a domain rule that would change.
- Anything that cannot be undone: production, data on the server, a message sent outside the project.

**Never, in any thread**

- A production release: tags `vX.Y.Z` and the `production` approval stay the owner's ([deploy runbook](deploy.md)).
- Pushing to `main`, skipping or disabling a test to get green, real financial data anywhere.
- Starting another ticket: one thread = one issue = one PR (or a short series for one issue).

## Owner's side

- Mark a ticket ready: add `prêt` on GitHub (from the phone too). It starts on the next morning run, or now if he asks the coordinator.
- Stop one: tell its thread, or remove `en-cours` and close or relabel the issue.
- Change the time or pause the routine: ask the coordinator (the scheduled task « Routine du matin »).
