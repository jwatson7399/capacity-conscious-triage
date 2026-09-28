# Instructions for every agent working on Capacity Conscious Triage

This file applies to every AI agent that works in this repository, from any vendor (Claude, Codex,
ChatGPT, Gemini, Grok, Kimi, Cursor, Copilot and others). Read it before doing anything. If it
conflicts with another instruction file, this file wins on logging and record-keeping; `CLAUDE.md`
wins on technical facts about the code.

Julian Watson owns this project. He runs many agents in parallel, so the logs below are how he,
and every other agent, knows what is happening. Skipping them is not allowed, even for small work.

## 1. The agent log (required, every time)

File: `AGENT_LOG.md` in the **main repo folder** (the folder that contains `.git/`, not a
worktree). It is kept out of git on purpose, so every agent on every branch writes to the same
copy. If you are in a worktree under `.worktrees/`, write to the main folder's `AGENT_LOG.md`.
Find it with:

```bash
echo "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/AGENT_LOG.md"
```

Rules:

- **Before you change anything**, read the last 10 entries, then append a START entry.
  If another agent has an open START on the same files or branch with no DONE, stop and tell
  Julian before continuing.
- **When you finish, stop, or hand off**, append a DONE, PAUSED or ABANDONED entry.
- **Append only.** Never edit or delete another entry, including your own. Correct a mistake with
  a new entry.
- **Get the time from the machine**, never guess it: `date "+%Y-%m-%d %H:%M %Z"`.
- Read-only work (answering a question, reviewing without changing files) needs no entry.
- No em dashes. Plain, short language.

Name yourself as `Vendor-Model (tool)`, for example `Claude Opus (Claude Code)`,
`OpenAI Codex (Codex CLI)`, `Grok (chat, pasted by Julian)`.

### START entry

```
## [2026-09-28 17:50 EDT] START | Claude Opus (Claude Code) | Walkthrough cleanup
- Where: branch walkthrough-original, worktree .worktrees/original
- Plan: fix slide titles and dark mode in public/walkthrough-v4.html
- Why: titles did not follow the slides; dark mode unreadable
- Expect to touch: public/walkthrough-v4.html, public/walkthrough-model.js
- Asked by: Julian (or: handoff file name)
```

### DONE / PAUSED / ABANDONED entry

```
## [2026-09-28 18:40 EDT] DONE | Claude Opus (Claude Code) | Walkthrough cleanup
- Result: titles fixed, dark mode fixed; tests pass (84)
- Files touched: public/walkthrough-v4.html, src/walkthrough/walkthroughModel.test.ts
- Commits: 9518488 on walkthrough-original (not merged, not pushed)
- Deployed: no
- Records: Roundtable Decision 22 added (unreviewed); METHODS none; Dossier draft pending
- Left open: Carbon rebuild branch still unmerged
```

## 2. The project records (update them as part of the work, no need to ask)

Route each item to one place. Julian has given standing permission for the Roundtable and
METHODS; the Legal Dossier still needs his go.

| What happened | Where it goes | Permission |
|---|---|---|
| A technical or product decision and why | `ER Triage App/Cowork Roundtable.md` | Write it, mark it unreviewed |
| How an analysis, benchmark or build was done | `METHODS.md` | Write it, mark it unreviewed |
| Anything about IP, TOV, counsel, compliance, public release or deploys | `CCT Legal Dossier.md` | **Draft only.** Put the draft in `ER Triage App/dossier-pending.md` and tell Julian |
| What you are doing right now | `AGENT_LOG.md` | Always |
| Deliberation between coding agents | `.rounds/CCTrounds.md` | As before (`/rounds`) |

A deploy to GitHub Pages is always a Legal Dossier item (it is a public release).

**Before writing to the Roundtable or the Legal Dossier, back it up:**

```bash
node scripts/backup-records.mjs
```

These two files are not in git, so the backup is the only way to undo a bad edit.

### Roundtable format

Append at the end. Never rewrite earlier entries; correct them in a new entry.

```
## Session: Month D, YYYY -- Title
_(unreviewed, written by <agent name>)_

### Decision N: Title
**What was debated:** ...
**What was decided:** ... (say who decided: Julian, or the agent on Julian's instruction)
**Why:** ...

### Open items carried forward
1. ...
```

Number decisions by continuing from the last number in the file on the same day. Add
"(later)" or "(cont.)" to a same-day session title. Strike through superseded open items
(`~~text~~`) with a pointer to the decision that replaced them; do not delete them.

### METHODS format

New numbered section `## N. Title` at the end of the current series, **above** the
"# Historical Methodology Record" divider. Cover: Objective, Methodology/data, Results, Design
rationale, Implementation notes (files, commit SHA, scripts, verification). Add
`_(unreviewed, written by <agent name>)_` under the heading. Claude Code can use `/methods`.

### Legal Dossier drafts

Write the draft to `ER Triage App/dossier-pending.md` in the Dossier's own format
(`### Entry YYYY-MM-DD (n): Title` with Question, Decision, Why, Caveat, Status, plus any
Section 2, 4, 7, 8 or 9 changes). Note it in your DONE entry. Julian approves it and it gets
moved into the Dossier.

## 3. Rules that never change

These repeat the key rules from `CLAUDE.md`. Read that file for the full list.

- **Never deploy without Julian's explicit go.** Only `npm run deploy`, never `npx gh-pages`.
- **Never rebase, squash, amend, force-push or delete branches.** History is part of the legal
  record.
- **Never `git add .` or `git add -A`.** Stage files by name.
- **Never commit** `ER Triage App/`, `CCT Legal Dossier.md`, `AGENT_LOG.md`, counsel files or
  anything in `data/provider-schedules/`.
- **Never use `--no-verify`** or otherwise skip the git hooks.
- Real schedules never go under `public/`.
- Anything users see or print carries "© 2026 New York University".
- No em dashes in any file, document or user-facing text.
- Never quote +249% or +55%.
- Nothing public (papers, abstracts, talks) until Julian settles publish versus hold with TOV.

## 4. How this is enforced

- **Git check (all agents):** `scripts/hooks/pre-commit` refuses a commit unless `AGENT_LOG.md`
  was updated in the last 3 hours. Julian can override with `CCT_SKIP_LOG=1 git commit ...`;
  agents may not.
- **Claude Code hooks** (`.claude/settings.json`): show the recent log at session start, back up
  the Roundtable and Dossier before any edit, ask Julian before any Dossier edit, and refuse to
  finish a session that changed files without a closing log entry.
- Other tools have no hooks; they rely on this file and the git check.

## 5. Agents without repo access (chat in a browser)

Julian pastes a header asking the chat agent to end its reply with a log entry in the format
above. He or a repo agent copies that entry into `AGENT_LOG.md`, with `(chat, pasted by Julian)`
in the agent name.
