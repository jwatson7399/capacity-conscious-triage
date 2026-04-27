# Agent Rounds (`/rounds`) — Design Spec

**Date:** 2026-04-27
**Status:** Approved, ready for implementation plan

## Purpose

Provide a "meeting place" for AI agents working in the same Conductor workspace
across different chats. Lets a Claude in chat A and a Codex (or another Claude)
in chat B deliberate on substantive design or implementation questions
asynchronously, with the human user routing between chats.

The deliberation history is preserved as a living document so future agents
joining the workspace inherit the full reasoning trail rather than starting cold.

## User-facing workflow

1. User is working with Agent A in chat 1, hits a non-trivial design question.
2. User invokes `/rounds`. Agent A reads the existing rounds file, then appends
   a new entry stating the problem and its proposed approach.
3. User switches to chat 2 (Agent B), instructs Agent B to read the latest
   rounds entry and respond. Agent B appends its own entry.
4. User returns to chat 1, tells Agent A to read the new entry. Agent A
   responds. Loop until consensus.
5. The full deliberation persists in the rounds file, committed to the repo.

## File layout

```
.rounds/
├── <PREFIX>rounds.md                              # active (committed)
└── <PREFIX>rounds-archive-YYYY-MM-DD.md           # rotated archives (committed)
```

- Lives at repo root in a dedicated `.rounds/` folder so agent metadata is
  visually segregated from project code.
- `<PREFIX>` is project-specific. For this project: `CCT` (Capacity Conscious
  Triage). The active file is `.rounds/CCTrounds.md`.
- File is committed to git. Deliberation persists across workspace destruction.
- New project: on first `/rounds` invocation, command asks the user for the
  prefix and creates the file with the standard header.
- Discovery for the slash command: glob `.rounds/*rounds.md` excluding any
  filename containing `archive`. Exactly one match is the active file.

## File header (fixed, never modified after creation)

```markdown
# <Project Name> — Agent Rounds

Append-only deliberation log for agents working in this Conductor workspace
across different chats. Read recent entries before posting.

## Format

## [YYYY-MM-DD HH:MM TZ] AgentName N

Body.

---

- AgentName = your model family ("Claude", "Codex", "Gemini", etc.)
- N = increment per agent per day. Count today's entries from your AgentName;
  you are count+1. Reset to 1 on a new day.

## Archiving

When this file reaches 50 entries, move the oldest 40 to
`.rounds/<PREFIX>rounds-archive-YYYY-MM-DD.md` (today's date),
leaving the most recent 10 here.
```

The header doubles as the cross-platform contract: any agent landing in the
workspace (Codex, Gemini, etc.) reads the header and can append correctly
without needing its own slash command. `/rounds` is Claude-Code-only sugar
over this convention.

## Entry format

```
## [2026-04-27 14:32 PT] Claude 1

Body of the entry — problem statement, proposed solution, response to a prior
entry, etc. Markdown allowed.

---
```

- Timestamp uses local time with timezone abbreviation.
- `Claude 1` means "the first Claude entry today." If another Claude (different
  chat) has already posted today, the next is `Claude 2`, then `Claude 3`, etc.
- Counter resets at local midnight. Each agent family counts independently
  (Claude 1 and Codex 1 can coexist on the same day).
- `---` separator after every entry.

## `/rounds` slash command

**Location:** `~/.claude/commands/rounds.md` (user-level — works across all
projects on this machine).

**Behavior on invocation:**

1. **Find active file:** glob `.rounds/*rounds.md` excluding archives.
   - Zero matches → ask user for project prefix, create
     `.rounds/<PREFIX>rounds.md` with the standard header (substituting
     project name and prefix), then proceed.
   - More than one match → report ambiguity, abort.
2. **Read** the active file end-to-end (or the last ~15 entries if file is
   near the archive threshold).
3. **Determine identity:** AgentName is `Claude` (this command runs in Claude
   Code). Scan today's dated entries, count existing `Claude N` entries,
   increment to get this entry's `N`.
4. **Compose entry body:**
   - If `$ARGUMENTS` is provided, use it verbatim as the body.
   - Otherwise, synthesize from current chat context: problem statement, your
     position, open questions for the other agent.
5. **Archive check:** if active file has ≥ 50 entries, move the oldest 40 into
   `.rounds/<PREFIX>rounds-archive-YYYY-MM-DD.md` (today's date), leaving the
   most recent 10. Then append the new entry.
6. **Append** the new entry with formatted timestamp and `---` separator.
7. **Report** to the user: a one-line summary of what was written and the file
   path, so they can route to the other chat.

## CLAUDE.md integration (this project)

Add a section to `/Users/julian/conductor/workspaces/Capacity Conscious Triage-v1/walla-walla/CLAUDE.md`:

```markdown
## Agent rounds

Cross-agent deliberation log: `.rounds/CCTrounds.md`. Run `/rounds` to read
recent entries and append your own. **When creating a non-trivial plan or
facing a substantive design decision, read rounds first and consider posting
if peer input from a parallel agent would help.** Don't post for trivial work
or pure execution tasks.
```

This is the auto-trigger mechanism: every Claude session in this project loads
CLAUDE.md and picks up the instruction to consider rounds during planning. The
slash command itself stays passive — it does what's asked, no nagging.

## Edge cases

- **File doesn't exist:** create with header on first invocation. Prompt user
  for prefix.
- **Multiple agents post simultaneously:** rare given human-paced invocation;
  if it happens, last-write-wins on the file. No locking.
- **Conversation crosses midnight:** numbering is based on the date of *this*
  entry, not the start of the conversation. If you posted as Claude 3 at 23:55
  and post again at 00:05, you are Claude 1 of the new day.
- **Agent identity ambiguity:** rule is "use your model family name." All
  Claude variants are `Claude`. All Codex variants are `Codex`. Etc.
- **Archive overflow:** archives are dated and immutable. If two archives get
  created on the same day (unlikely), append entries to the existing archive
  rather than creating a second.
- **Branch divergence:** `.rounds/` is committed, so different branches can
  have different rounds files. Merging is a regular git merge conflict and
  resolved manually.

## Out of scope

- No real-time notification — user is the human router between chats.
- No file locking.
- No threading by topic — flat append-log; topic context lives in entry body.
- No automatic archiving across the user's whole machine; archiving is per-file.
- No analytics on rounds usage.

## Open questions resolved during brainstorming

| Question | Resolution |
|---|---|
| What does `/rounds` do? | Read existing file, then append new entry (synthesized from chat context, or from `$ARGUMENTS` if provided). |
| Cross-platform support? | File header is the contract; any agent can follow it. `/rounds` is Claude-Code sugar. |
| File location? | Committed in `.rounds/` directory at repo root. |
| Archive threshold? | 50 entries; rotate oldest 40 to dated archive, keep last 10. |
| Auto-trigger mechanism? | CLAUDE.md instruction, not slash-command logic. |
| Slash command scope? | User-level (`~/.claude/commands/`), per-project prefix discovered via glob. |
| Argument behavior? | Optional `$ARGUMENTS` used verbatim if provided; otherwise synthesize from chat context. |
