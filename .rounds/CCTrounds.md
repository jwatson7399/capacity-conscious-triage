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

## [2026-08-03 15:35 EDT] Claude 1

**GitHub exposure remediation.** Worked `CLAUDE_CODE_HANDOFF_github-exposure-remediation.md`.
Context for anyone touching `public/`, the deploy path, or the Delphi weights.

**What was actually exposed.** The repo is private, but a GitHub Pages site serves publicly
regardless of repo visibility. From 2026-03-11 (first `gh-pages` commit, `c6a1708`) to
2026-08-03 — ~145 days — 11 real NYU BK departmental schedules and the six Delphi weights
were publicly downloadable. Verified live, not inferred: both returned HTTP 200 at session
start. Three handoff facts were wrong and are corrected here: last deploy was `b0628cf`
2026-06-12 (not `bb82588` 2026-04-25), the live bundle was `index-DmcoEIPj.js` (not
`index-BKlD-X9g.js`), and 11 schedules were deployed (not 18 — 18 are in `public/schedules/`,
the June build predates 7).

**P0 was not solvable as documented.** `DELETE /repos/.../pages` returns 422 "Deactivating
GitHub pages for this repository is not allowed" (reproducible), and `public=false` returns
422 "Current plan does not support private GitHub Pages" — the account has no paid plan.
**There is no API route to unpublish this site.** Julian unpublished it via the Settings →
Pages UI button, which works where the API refuses. Content is now 404 (cache-busted).

**Trap for future agents:** `gh api /repos/.../pages` still returns `"status":"built"` with
the stale June build. The config record survives unpublishing. Do **not** use that API as
your test for whether the site is exposed — curl the URL. And because the record survives,
`npx gh-pages -d dist` would resurrect the whole site with no settings change.

**P1, implemented (uncommitted).** Mechanism confirmed: no `publicDir` override, so Vite
copies `public/` → `dist/` → `gh-pages`. Only **one** runtime reference to a real schedule
existed — `RoleSelection.tsx:117` — which parsed it and rendered real colleague names into
the UI. Everything else under `scripts/` is Node-only tooling. So the fix was narrow:
one synthetic file in `public/schedules/demo-week-schedule.xlsx`, all real schedules removed
from `public/` (byte-identical duplicates of `data/provider-schedules/`, verified by SHA-256
before deleting — nothing lost), `real-schedule-benchmark.ts` repointed to `data/`, and a
`predeploy` guard.

De-identification rewrites only the leading name token per cell, preserving layout, shift
times, annotations and the PGY table, so the file stays parse-equivalent: 7 days, 211
providers, 20 PGY entries, identical per-day team/type/shift signatures. At byte level, of
190 distinct strings in the original the 63 surviving are all structural; 127 name strings
dropped, zero real names survive.

**Two findings the handoff would have missed, both caught by the guard rather than by
reading code:**

1. **`demo-schedule.xlsx` is not a demo file.** It contains 120 real provider names,
   including WATSON. It was published at `/demo-schedule.xlsx` the entire time. The
   handoff's proposed option B — "ship the demo with `demo-schedule.xlsx` only" — would
   have left the exposure fully intact. It now lives only under `data/`. Nothing in `src/`
   ever loaded it.
2. **A stale `dist/` on disk still held all 18 real schedules.** Gitignored, so never
   committed, but it is exactly what `npx gh-pages -d dist` publishes. A deploy without a
   rebuild would have re-exposed everything.

Generalisable lesson: a filename-pattern guard would have passed both. The content check —
open every shipped `.xlsx` and compare leading name tokens against the real corpus — is what
caught them. It is negative-tested: a real schedule renamed `harmless-sample.xlsx` is still
blocked, exit 1.

**P2 audit.** 13 repos, 7 public (handoff said 8/6). CCT is the only *private* repo with
Pages enabled. No spreadsheets and no CCT material in any public repo. `triage-tally` is
clean on names — initials only, entered at runtime; its sheet is 401 to anonymous and its
`doGet` returns a health check. Its only residual is unauthenticated POST, an integrity not
confidentiality risk.

**The one that stays open, deliberately.** The Delphi Apps Script endpoint
(`VITE_DELPHI_SHEETS_URL` in `.env`) is deployed "Anyone with the link" and unauthenticated.
A plain GET returns all 35 raw survey rows; their means — 15.15, 10.85, 6.65, 2.30 —
reproduce the shipped weights. That discloses the *derivation*, not just the values, and
disabling Pages does nothing to it. `.env` is correctly gitignored and the URL is **not** in
the deployed bundle, but Vite inlines `VITE_*` at build time, so any future deploy made with
`.env` present publishes the URL. **Julian's call, made twice: leave it, and leave the
weights in `constants.ts` alone** — his reasoning is the weights are NYU-specific and not
portable. Not a gap anyone should silently "fix"; raise it with him if it becomes relevant,
don't unilaterally change it.

Also noted and left alone: `constants.ts:4` hardcodes the Delphi averages as fallbacks (the
comment says so), so they ship in any build. Relevant only if the app is deployed publicly
again. Worth remembering that in a client-side app the weights must reach the browser — the
only real protection is server-side scoring, which `CLAUDE.md` already lists as the next
step. Bundle obfuscation would be theater.

**P3.** No account audit log (404, personal accounts lack it) and zero Internet Archive
captures for either URL, so no third-party evidence of the public window exists. Build
history is the stronger record: 34 builds, schedules present from the very first `gh-pages`
commit.

**Residual, per the standing no-history-rewrite instruction:** the schedules remain in
`main` and `gh-pages` history. Fine while private; recoverable if the repo is ever made
public.

**Open questions for the next agent:**
- Should `git ls-files public/` gain a CI check, or is the local `predeploy` guard enough
  given deployment is manual and there is no Actions workflow?
- The 422 on `DELETE /pages` is anomalous for a personal repo. Worth a GitHub Support
  ticket? As it stands Julian has a Pages site he cannot disable via API.
- Nobody should run `npm run deploy` without confirming with Julian first — Pages is
  intentionally down.

---

## [2026-09-28 03:55 EDT] Claude 1

**Starting the Carbon rebuild** (`ER Triage App/HANDOFF_carbon-rebuild.md`, Roundtable
2026-09-28 Decisions 4 to 10). Branch `carbon-rebuild`; `main` untouched; no deploy.

Plan: new interface on the unchanged engine. `src/engine/*`, `src/constants.ts`,
`src/types.ts`, `src/uid.ts`, `scheduleParser` and `scripts/` are not edited. The core
reducer in `ShiftContext.tsx` keeps every action as is; a thin session layer wraps it to add
the activity event list plus a few UI-only actions (hydrate a sample shift, remove provider,
reopen team, demo arrivals on/off). Weights frozen at `CAPACITY_WEIGHTS` (the provider no
longer calls `useSurveyWeights`). Live shift, demo and tour each get their own provider
instance so demo/tour can never touch a live shift. Research tools move to `?lab` (old
Dashboard kept there for simulations). Fonts self-hosted via @fontsource.

Check: historical replay run before and after on this machine; outputs must match.

Astra's team-detail and shift-setup mockups are marked "not yet reviewed" in the
Roundtable; building from them anyway and flagging for Julian's review.

---

## [2026-09-28 04:40 EDT] Claude 2

**Carbon rebuild built on `carbon-rebuild`, uncommitted.** A stale `.git/index.lock`
(0 bytes, 00:02 EDT, predates this session) blocks staging; I did not remove it. If you are
the process holding it, finish; otherwise Julian decides.

Verified: `src/engine`, `constants.ts`, `types.ts`, `uid.ts`, `utils/`, `scripts/` unchanged
vs HEAD; historical replay output byte-identical before and after; build, 40/40 tests,
eslint and the schedule guard pass (run in a Linux copy with fresh node_modules; the Mac's
node_modules still needs `npm install` for the two @fontsource packages).

For anyone touching state: new actions go in `src/context/session.ts`, not the core reducer.
Reducer quirks surfaced, not changed: `SIGNOUT_PATIENTS` deletes the closure of the
from-team; closed Teams 1/2 reopen on their own after 60 min.

---

## [2026-09-28 12:20 EDT] Claude 3

**Carbon audit fixes done** (`ER Triage App/HANDOFF_carbon-audit-fixes.md`, Roundtable
2026-09-28 Carbon Rebuild Audit, Decisions 11 to 14). Committed with the rebuild on
`carbon-rebuild` as one commit. No deploy.

Shift-logic changes in the core reducer (`ShiftContext.tsx`), scoring untouched:
- Closed teams stay closed until Reopen. The 60-minute auto-transfer/auto-reopen is gone for
  every team; `SIGNOUT_PATIENTS` no longer deletes the closure. `TEAM_CLOSE_TRANSFER_*`
  constants left in `constants.ts` (unreferenced by the app now). The lab TeamCard countdown
  was replaced by "Closed until reopened" plus a Reopen button; permanently closed sim teams
  were already skipped by the old rule, so the lab simulator is unaffected.
- `REASSIGN_PATIENT` keeps `assignedAt` and `upgradedAt`.
- `UPGRADE_PATIENT` takes optional `toTier` (any higher color, default Red; a non-higher
  target is a no-op) and restarts at full weight via `upgradedAt`. `types.ts` changed for this.

**Replay and benchmarks: confirmed unaffected, explicitly.** The scripts call the engine
directly and never dispatch reducer actions. Run in clean Linux copies of HEAD (`f0f5bd4`)
and of the working tree against the same `data/`: `historical-replay`, `benchmark`,
`benchmark-load-range`, `real-schedule-benchmark` byte-identical; `decay-schedule-benchmark`
identical `results` and `pairwise` (only run date, timing and output paths differ).

UI: undo is now a session-level `undoable` bound to the assign event id (`UNDO_ASSIGN`),
cleared by any later action on that patient and by HYDRATE/RESET/START_SHIFT. Float primary
counts as not counted. Deceased tag on the gauge. Focus trapped in sheets and the drawer with
the tour card as a focus companion. Assign panel height published as `--keys-h`.
`public/walkthrough-v4.html` and `EvidenceWalkthrough.tsx` archived.

Checks: 47/47 tests (21 session tests), eslint, build, `check:schedules` with `data/` present.
The stale `.git/index.lock` was removed with Julian's approval. My verification run of the
decay benchmark wrote two JSONs into `data/decay-benchmark-runs/` through a symlink; both
deleted.

---
