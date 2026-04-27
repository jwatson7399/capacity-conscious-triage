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

  ````markdown
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
  ````

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
