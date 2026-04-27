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
