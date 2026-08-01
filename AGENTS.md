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

### 1.4 No task, no work

All work on this project is driven from the task board (section 2). Do not
write code, change docs, or push anything unless a task for it exists on the
board first. If you spot work that should happen, create a task for it (or
ask the repo owner to) — then pick it up.

## 2. Task workflow (Warroom)

The board lives in Warroom, project **Springbok Tracker**. Agents interact
with it through the Warroom MCP tools (look the project up by name).

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
  and verification results before handing over for review.
- One task = one branch. Reference the task number (e.g. `#53`) in commits
  and PRs.

## 3. Git conventions

- Branch per task, named descriptively (e.g. `feat/team-fixtures-page`),
  unless a branch has been assigned to you — then use that one.
- Small, focused commits with clear messages: what changed and why.
- Never force-push a shared branch; never rewrite published history.
- Push only to the branch you were asked to work on. Do not open a pull
  request unless one was asked for.

## 4. Project state

- **Code:** none yet — this repo currently holds only its agent setup.
- **Stack:** not yet decided. When it is, record the decision and the local
  build/test/lint commands here so every future agent inherits them.
- **Keeping this file alive:** when a convention changes or a new one is
  adopted, update AGENTS.md in the same commit as the change it describes.
