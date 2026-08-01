# AGENTS.md — Springbok Tracking

This is the operating manual for every agent (and human) working in this
repository. If you are an AI agent, read this file in full before doing
anything else. Where any other instruction conflicts with this file, this
file wins unless the repo owner says otherwise.

## 1. Non-negotiable rules

### 1.1 This is a PUBLIC repository — no IP, ever

Everything committed here is visible to the world. The following must never
appear in this repository, in any file, commit message, branch name, or PR:

- Proprietary or internal company information of any kind: internal
  documents, processes, playbooks, pricing, client or partner names.
- Secrets and credentials: API keys, tokens, passwords, connection strings,
  private certificates, signing keys.
- Personal data (names, emails, phone numbers) beyond what the repo owner
  has deliberately made public.
- Internal identifiers: workspace/project UUIDs, internal tool URLs,
  account IDs, internal hostnames.

If a piece of context you were given is needed to do the work but falls in
the list above, use it — but never write it into the repo. If you are unsure
whether something counts as IP or sensitive, treat it as if it does and ask
before committing.

### 1.2 Nothing sensitive gets staged, let alone committed

Before **every** commit:

1. Run `git status` and confirm only files you intended to change are staged.
2. Run `git diff --staged` and read the full diff, checking specifically for
   the items in 1.1.
3. Only then commit.

Supporting rules:

- All `.env*` files are gitignored. Real configuration values live only in
  local env files; the repo may contain an `.env.example` with placeholder
  values and comments only.
- Never commit with `git add -A` / `git add .` without reviewing what it
  picked up first.
- If something sensitive does slip into history, stop and tell the repo
  owner immediately — do not quietly rewrite history on your own.

### 1.3 Simplicity first, scalability second

Simplicity is the main driver for **every** decision in this project;
scalability is the second. In practice:

- Prefer the simplest thing that works. No speculative abstractions, no
  frameworks or infrastructure "for later".
- Boring, well-understood technology over novel technology.
- Fewest possible dependencies; every new dependency must earn its place.
- If two designs work, pick the one that is easier to read and delete.
- Scalability only breaks a tie between two equally simple options, or is
  addressed when a real limit is actually being hit.

### 1.4 Scraping and data collection must never breach terms of service

This project gathers its data from websites. Before fetching data from any
source — whether writing scraper code, doing one-off research, or evaluating
a site as a potential source — be **absolutely certain** the access does not
breach that site's terms of service:

- Read the site's terms of service (and `robots.txt`) **before** the first
  fetch, and record on the task which source was checked and the conclusion.
- If the terms prohibit scraping or automated access, do not scrape it —
  no workarounds. Flag it on the task and look for an alternative.
- Prefer official APIs, licensed feeds, or explicitly public data over
  scraping whenever they exist.
- Never circumvent technical access controls: logins, paywalls, CAPTCHAs,
  IP blocks, or rate limits. Fetch politely (low request rates, identify
  honestly); a block is an answer, not an obstacle.
- If a source's position is ambiguous, treat it as prohibited and ask the
  repo owner before proceeding.

### 1.5 No task, no work — and the task board is the agent's job

All work on this project is driven from the task board (section 2). Do not
write code, change docs, or push anything unless a task for it exists on the
board first.

**Creating and maintaining tasks is your responsibility as the agent — never
the repo owner's.** Be absolutely clear on this: the human asking for
something is not thereby volunteering to write it up. There is no such thing
as "the owner will make a task for this".

- Before starting any work, **you** create the task on the board. If a spoken
  or chat request arrives with no task behind it, your first action is to
  create one — not to start working, and not to ask the owner to create it.
- If a request turns out to be several pieces of work, you create a task per
  piece.
- If you spot work that should happen but is not yours right now, **you**
  create a Backlog task for it. Mentioning it in chat and moving on does not
  count — chat is not the board.
- **You** keep every task you touch truthful in real time — what to record is
  in section 2, and recording it is yours in full. Not in a batch at the end,
  and not only in your reply to the owner.
- If you did work without a task — including work an instruction pushed you
  straight into — create the task immediately, backfill what happened on it,
  and say so. An unrecorded change is a defect, not a shortcut.
- The only thing the repo owner owns on the board is the decision to move a
  task to Done (section 2), plus answering product questions you raise on it.

### 1.6 AGENTS.md is the only place agent instructions live

There is exactly one instruction file in this repository, and it is this one.
`CLAUDE.md` exists **only** to redirect an agent here.

- Every new or changed agent instruction goes in AGENTS.md. No exceptions,
  however small the rule or however tempting the shortcut.
- `CLAUDE.md` must contain nothing but the redirect — no rules, no summaries,
  no "note in particular…" highlights, no table of contents of this file.
- Never duplicate a rule into another file. A rule stated in two places
  goes stale in one of them, and an agent will follow the stale copy.
- The same applies to any future tool-specific instruction file: it redirects
  here or it does not exist.

## 2. Task workflow (Warroom)

The board lives in Warroom, project **Springbok Tracker**. Agents interact
with it through the Warroom MCP tools (look the project up by name). You have
these tools — so you have no excuse for an unrecorded piece of work (rule 1.5).

- **All new tasks go to the Backlog** (Warroom's unscheduled bucket —
  `sprintId: 'backlog'` when listing).
- Board statuses and how to use them:

  | Status | Meaning |
  |---|---|
  | Backlog | Captured, not yet scheduled. All new tasks start here. |
  | To Do | Scheduled, not started. |
  | In Progress | Move here the moment you start working the task. |
  | Testing | Implementation done; you are verifying it works (tests, manual checks, staged-diff review). |
  | In Review | Work is pushed and awaiting human review. |
  | Done | Reviewed and accepted. Humans move tasks to Done unless explicitly told otherwise. |

- Keep the task truthful in real time: update the status as you move through
  the flow, and comment on the task with the branch name, key decisions made,
  and verification results before handing over for review. This is the
  agent's job, in full (rule 1.5).
- A task's description and comments must be enough for a fresh agent with no
  memory of the conversation to pick the work up. Write them for that reader.
- One task = one branch. Reference the task number (e.g. `#53`) in commits
  and PRs.

## 3. Git conventions

**Trunk-based development.** `main` is the trunk and the only long-lived
branch, and **every merge to `main` auto-deploys**. That means:

- `main` must always be deployable. Never merge anything that has not
  passed the pre-merge gates (section 4) — verification happens before
  merging, not after.
- Work happens on short-lived branches cut from `main` — one task, one
  branch, named descriptively (e.g. `feat/team-fixtures-page`), merged back
  within days, not weeks. No long-lived feature branches; if a task is too
  big to merge quickly, split the task.
- For work that must land before it can be switched on, keep the change
  small and inert (e.g. behind a simple flag or unused route) rather than
  parking it on a branch.
- Small, focused commits with clear messages: what changed and why.
- Never force-push a shared branch; never rewrite published history.
- Push only to the branch you were asked to work on. Do not open a pull
  request unless one was asked for.

## 4. Pre-merge gates: tests, self-review, test review

No PR (or branch) merges to `main` until all three gates below have passed.
Record the outcome of each on the Warroom task before moving it to
In Review — a task with unrecorded gates is not ready for review.

### Gate 1 — run the tests locally

The implementing agent runs the **full local suite** (tests, plus
lint/typecheck/build once they exist — see section 7 for the commands) and
pastes the actual results on the task. "It should pass" doesn't count;
paste real output. A red suite means the work stays In Progress.

### Gate 2 — self-review agent

Before requesting human review, dispatch a **separate review agent** — a
fresh session or context, never the instance that wrote the code — to
review the complete diff for correctness, simplicity (rule 1.3), and
compliance with the non-negotiables (section 1). Fix what it finds or
record on the task why a finding was rejected.

### Gate 3 — independent review of new tests

All **new or changed tests** get their own second review, separate from
Gate 2, with one question: **would this test fail if the functionality it
claims to cover actually broke?** Tests that merely rubber-stamp the
implementation do not pass. The reviewer checks that tests:

- assert real, observable behaviour — not mirrors of the implementation's
  internals;
- contain no tautologies (asserting a value against itself, always-true
  conditions, asserted-nothing "smoke" tests);
- cover the failure paths, not just the happy path;
- were not weakened (deleted assertions, loosened tolerances, broadened
  mocks) just to get the suite green.

If any gate fails, fix and re-run **all** gates that the fix could have
invalidated before merging.

## 5. Choosing a model for sub-agents

Dispatching a sub-agent costs tokens; the model must fit the task. The rule:
**use the cheapest model that does the job well**, and don't spawn an agent
at all for something the current session can do with one or two tool calls.

| Task type | Model |
|---|---|
| Mechanical, well-specified work: bulk renames/moves, formatting, running commands and reporting output, simple targeted lookups | Haiku (e.g. `haiku`) |
| The default workhorse: feature implementation, web/codebase research, drafting docs, summarising, most fan-out work | Sonnet (e.g. `sonnet`) |
| Heavy judgment: architecture and planning, gnarly debugging, security-sensitive review, cross-cutting design | Opus (e.g. `opus`) |
| Top tier (Fable/Mythos class) | Only when a cheaper model has demonstrably failed at the task, or the task is the hardest kind of cross-cutting reasoning. Justify it on the task. |

Supporting rules:

- Review agents (gates 2 and 3) need a **fresh context**, not necessarily a
  bigger model. Sonnet reviews small diffs and short docs fine; step up to
  Opus when the diff is large, subtle, or security-relevant.
- Fan-outs multiply cost: ten Sonnet agents cost more than one Opus agent.
  Size the fan-out and the model together.
- Match reasoning effort to the task where the dispatch mechanism allows it
  (low for mechanical stages, high only for the hardest verify/judge steps).
- When in doubt between two tiers, take the cheaper one and escalate only if
  its output fails review.

## 6. Brag posts — take the credit when you've earned it

Good work deserves to be seen. When you pull off something you are genuinely
proud of, post a short brag in the **General** chat room of the Warroom
project (`list_chat_rooms` → `send_chat_message`). No permission needed, no
modesty required.

**If there is no General room**, don't go hunting and don't drop the brag:
post it as a comment on the task instead, and tell the repo owner a General
room is needed — agents can read and post to rooms but cannot create them.
Use the nearest obvious room if one exists under a different name.

Brag-worthy, for example:

- You found the bug nobody had spotted, and can show why it would have bitten.
- You deleted a pile of code and the thing got simpler and still worked
  (rule 1.3 in the wild — this is the highest form of brag here).
- A nasty debug you actually reasoned your way through instead of guessing.
- You caught a rule violation — a leaking secret, a source whose terms
  forbid what we were about to do — before it landed.
- You saved the project real money or time with a call you can point at.

Not brag-worthy: finishing a task (that's the job), following the rules,
volume of output, or anything you cannot point at a concrete result for. Two
brags in a day is plausible; ten is noise, and noise devalues everyone's.

House rules:

- **Keep it to a few lines.** A brag is a headline plus why it mattered, with
  the task number so anyone can go read the real story. Not an essay.
- **Rule 1.1 applies here too.** Chat is prose you write freely, which makes
  it the easiest place to leak something — no secrets, no client or partner
  names, no internal identifiers, not even in a humblebrag.
- **Be honest.** A brag that overstates what happened is worse than silence,
  and the task history sitting right next to it will contradict you.
- **Sign every brag.** No anonymous brags — credit needs a name attached.

Signature format, on its own last line:

```
— 🏉 <nickname> · <model> · #<task>
```

Pick a `<nickname>` at the start of a session and keep it for that whole
session, so a run's brags read as one voice. Any name you like, as long as
it's yours and it isn't a real person's. For example:

```
Rewrote the fixtures parser and deleted the date-guessing helper with it —
80 lines down to 12, and the off-season case that used to render a blank
page now actually says something. #74

— 🏉 Klipspringer · Opus 5 · #74
```

## 7. Project state

- **Code:** none yet — this repo currently holds only its agent setup.
- **Stack:** not yet decided. When it is, record the decision and the local
  build/test/lint commands here so every future agent inherits them.
- **Deployment:** merge to `main` will auto-deploy (see section 3), but the
  pipeline is not wired up yet. Record the deploy target and how to check a
  deployment's health here once it exists.
- **Keeping this file alive:** when a convention changes or a new one is
  adopted, update AGENTS.md in the same commit as the change it describes.
