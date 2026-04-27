# Agent Rounds (`/rounds`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/rounds` slash command that lets parallel agents in the same Conductor workspace deliberate asynchronously via a shared markdown file.

**Architecture:** A user-level slash command (`~/.claude/commands/rounds.md`) is a prompt that walks Claude through reading and appending to `.rounds/<PREFIX>rounds.md` in the current project. The rounds file is committed to the repo so deliberation persists. A standardized header at the top of the file documents the append format so non-Claude agents (Codex, Gemini, etc.) can follow the same convention without their own slash command. CLAUDE.md gets a one-liner that prompts agents to consider rounds during planning.

**Tech Stack:** Markdown files only. No code, no test framework — verification is manual invocation in Claude Code.

---

## File Structure

Files this plan creates or modifies:

| Path | Purpose |
|---|---|
| `.rounds/CCTrounds.md` | Active deliberation log for this project. Committed. |
| `~/.claude/commands/rounds.md` | The `/rounds` slash command prompt. User-level, NOT committed to this repo. |
| `CLAUDE.md` | Add "Agent rounds" section with one-liner pointer + planning instruction. |

---

## Task 1: Create the rounds file for this project

**Files:**
- Create: `.rounds/CCTrounds.md`

- [ ] **Step 1: Create the `.rounds/` directory**

Run: `mkdir -p .rounds`

- [ ] **Step 2: Create `.rounds/CCTrounds.md` with the standard header**

Write the file with exactly this content:

```markdown
# Capacity Conscious Triage — Agent Rounds

Append-only deliberation log for agents working in this Conductor workspace
across different chats. Read recent entries before posting.

## Format

```
## [YYYY-MM-DD HH:MM TZ] AgentName N

Body.

---
```

- AgentName = your model family ("Claude", "Codex", "Gemini", etc.)
- N = increment per agent per day. Count today's entries from your AgentName;
  you are count+1. Reset to 1 on a new day.
- Timestamp uses local time with a timezone abbreviation (e.g., `PT`, `ET`, `UTC`).

## Archiving

When this file reaches 50 entries, move the oldest 40 to
`.rounds/CCTrounds-archive-YYYY-MM-DD.md` (today's date),
leaving the most recent 10 here.

---
```

- [ ] **Step 3: Verify the file exists and contains the header**

Run: `head -5 .rounds/CCTrounds.md`
Expected output starts with: `# Capacity Conscious Triage — Agent Rounds`

- [ ] **Step 4: Commit**

```bash
git add .rounds/CCTrounds.md
git commit -m "Add empty rounds deliberation log for cross-agent coordination"
```

---

## Task 2: Create the `/rounds` slash command

**Files:**
- Create: `~/.claude/commands/rounds.md` (user-level, outside this repo)

- [ ] **Step 1: Ensure `~/.claude/commands/` exists**

Run: `mkdir -p ~/.claude/commands`

- [ ] **Step 2: Write the slash command file**

Create `~/.claude/commands/rounds.md` with exactly this content:

````markdown
---
description: Read project rounds file and append your entry for cross-agent deliberation
argument-hint: "[optional message body — if omitted, synthesize from chat context]"
---

You are appending to a per-project deliberation log used by parallel AI agents working in the same Conductor workspace across different chats. Follow these steps exactly.

## Step 1: Find the active rounds file

Run a glob for `.rounds/*rounds.md` and exclude any path containing `archive`.

- **Exactly one match:** that's the active file. Proceed to Step 2.
- **Zero matches:** the project has no rounds file yet. Ask the user:
  > "No rounds file found. What prefix should I use for this project? (e.g., 'CCT' → `.rounds/CCTrounds.md`) And what's the project's display name for the file header?"
  
  Then `mkdir -p .rounds` and create `.rounds/<PREFIX>rounds.md` with this header (substitute `<Project Name>` and `<PREFIX>`):
  
  ```markdown
  # <Project Name> — Agent Rounds
  
  Append-only deliberation log for agents working in this Conductor workspace
  across different chats. Read recent entries before posting.
  
  ## Format
  
  ```
  ## [YYYY-MM-DD HH:MM TZ] AgentName N
  
  Body.
  
  ---
  ```
  
  - AgentName = your model family ("Claude", "Codex", "Gemini", etc.)
  - N = increment per agent per day. Count today's entries from your AgentName;
    you are count+1. Reset to 1 on a new day.
  - Timestamp uses local time with a timezone abbreviation.
  
  ## Archiving
  
  When this file reaches 50 entries, move the oldest 40 to
  `.rounds/<PREFIX>rounds-archive-YYYY-MM-DD.md` (today's date),
  leaving the most recent 10 here.
  
  ---
  ```
  
  Then proceed to Step 2.
- **More than one match:** report the ambiguity to the user and stop. Do not guess.

## Step 2: Read the active file

Read the entire file. If it has more than 30 entries (count `^## \[` heading occurrences), at minimum read the last 15 entries — you need recent deliberation in your context to write a useful response.

## Step 3: Determine your entry number for today

- Get today's local date in `YYYY-MM-DD` form.
- Scan the file for headings matching `^## \[<today's date>` and ending with `Claude N` (where N is any integer).
- Count those headings. Your entry's `N` is `count + 1`.
- If today's date doesn't appear at all yet, your `N` is `1`.

Other agent families (Codex, Gemini) have their own counters — only count entries whose AgentName is `Claude`.

## Step 4: Compose the entry body

- If the user provided arguments (`$ARGUMENTS`), use those as the body verbatim — do not editorialize or expand.
- Otherwise, synthesize a body from the current chat context. Include:
  - **Problem statement** — what is being deliberated (concise, with file paths or specific decisions referenced)
  - **Your position or proposal** — what you think and why
  - **Open questions** — what you want the other agent's input on
  
  Be concrete. Do not dump the entire chat. Distill.

## Step 5: Archive if needed

Count total entries in the active file (`^## \[` heading occurrences).

- If count is < 50: skip to Step 6.
- If count is ≥ 50:
  1. Get today's date in `YYYY-MM-DD`.
  2. The archive file path is `.rounds/<PREFIX>rounds-archive-YYYY-MM-DD.md` (use the same `<PREFIX>` as the active file).
  3. If the archive file exists, append entries to it; if not, create it with the same standard header (modified to indicate it's an archive).
  4. Move entries `1` through `count - 10` (oldest) into the archive file.
  5. Leave the most recent 10 entries in the active file (preserve the file's top header).

## Step 6: Append your new entry

Append to the end of the active file:

```
## [YYYY-MM-DD HH:MM TZ] Claude N

<body>

---
```

Use the actual current local time, the date you computed in Step 3, your computed `N`, and your composed body.

## Step 7: Report to the user

Output a brief confirmation in this exact form:

> Appended to `.rounds/<PREFIX>rounds.md` as **Claude N** at HH:MM TZ.
> 
> Summary: <one-line summary of what you wrote>
> 
> Ready when the other agent has responded — let me know.

## Notes

- Do NOT modify the file's top header section. Only append below it (or rotate during archiving).
- Do NOT alter prior entries. The log is append-only.
- If the file's format header has drifted from the spec (e.g., older syntax), follow what the file currently uses for consistency.
````

- [ ] **Step 3: Verify the slash command file exists**

Run: `head -5 ~/.claude/commands/rounds.md`
Expected: starts with `---` and contains `description: Read project rounds file`

---

## Task 3: Add CLAUDE.md "Agent rounds" section

**Files:**
- Modify: `CLAUDE.md` (insert new section near the end, before `## Next Step`)

- [ ] **Step 1: Read the current CLAUDE.md to find insertion point**

Look for the heading `## Next Step: Real-Time Backend`. The new section goes immediately before it.

- [ ] **Step 2: Insert the "Agent rounds" section**

Insert this exact block before `## Next Step: Real-Time Backend`:

```markdown
## Agent rounds

Cross-agent deliberation log: `.rounds/CCTrounds.md`. Run `/rounds` to read recent entries and append your own. **When creating a non-trivial plan or facing a substantive design decision, read rounds first and consider posting if peer input from a parallel agent would help.** Don't post for trivial work or pure execution tasks.

```

- [ ] **Step 3: Verify the insertion**

Run: `grep -n "## Agent rounds" CLAUDE.md`
Expected: one match, line number above the `## Next Step` heading.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Document /rounds command and planning-time peer-input prompt in CLAUDE.md"
```

---

## Task 4: Manual verification

**Files:** none modified

- [ ] **Step 1: Reload Claude Code so the new slash command is registered**

Tell the user to type `/rounds` in any active chat to confirm the command appears in the slash command list. If it doesn't appear, the user may need to restart Claude Code.

- [ ] **Step 2: Test invocation with no arguments**

Have the user invoke `/rounds` (no arguments) in a fresh chat OR in this chat after telling Claude what to write about. Expected behavior:
- Reads `.rounds/CCTrounds.md` (currently only header).
- Identifies as `Claude 1` (no entries yet today).
- Synthesizes a body from chat context.
- Appends a properly-formatted entry.
- Reports the file path and summary.

- [ ] **Step 3: Test invocation with arguments**

Have the user invoke `/rounds Test message body` in a chat. Expected:
- Same as Step 2 but body is `Test message body` verbatim.
- Entry number increments to `Claude 2` (same day).

- [ ] **Step 4: Verify file contents**

Run: `cat .rounds/CCTrounds.md`
Expected: header intact at top, two new entries appended below with correct format.

- [ ] **Step 5: Optional — back out test entries**

If the test entries are noise rather than useful first entries, revert them:

```bash
git checkout .rounds/CCTrounds.md
```

Otherwise leave them as the first real rounds entries.

---

## Self-review summary

**Spec coverage:**
- File layout (`.rounds/<PREFIX>rounds.md`, archive pattern) → Task 1, Task 2 (in command instructions)
- File header format → Task 1, Task 2 (in command instructions for new projects)
- Slash command behavior (find, read, identify, compose, archive, append, report) → Task 2
- CLAUDE.md integration (one-liner + planning prompt) → Task 3
- Manual verification → Task 4

**Out of scope reminders (intentional non-tasks):**
- No automated tests (no test framework for slash commands).
- No notification mechanism — user is the human router.
- No file locking.
- No threading by topic.
