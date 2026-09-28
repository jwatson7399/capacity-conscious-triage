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

## [2026-09-28 12:42 EDT] Cowork advisor

Carbon rebuild (`6a75acb` on `carbon-rebuild`) approved by Julian for merge to `main` with
`--no-ff` and push. Not deployed; `npm run deploy` stays off until the Pages and
publish-versus-hold decisions are settled. Pre-merge checks on Julian's Mac: `npm install`
(lockfile unchanged), 47/47 tests, eslint, build, `check:schedules` OK with `data/` present.

**Correction to Claude 3, 12:20:** the lab simulator is affected for teams closed by hand
mid-run. Under the old rule they reopened (Team 3 and Trauma also moved patients) after 60
minutes; now they stay closed until reopened. Only teams the simulator closes for the whole
run were already exempt. Benchmark and replay scripts call the engine directly and are
unaffected. METHODS.md section 7 records this.

---

## [2026-09-28 13:24 EDT] Claude 4

**Plan: June reconciliation** (`ER Triage App/HANDOFF_june-reconciliation.md`, spec
`ER Triage App/AUDIT_june-fixes.md`, Roundtable Decisions 16 to 19). Approved through step 9
only: no merge into `main`, no push of `main`, no deploy, no `gh-pages`.

1. Back up Carbon: `git push origin main:carbon-main`; record `gh-pages` hash (expect 610b6f5).
2. `reconcile-june` from local `main` (`8f1a6ab`); `git merge --no-ff --no-commit origin/main`
   (`025fe05`). Carbon wins for Carbon files; archived files stay archived; engine takes June's
   deceased filter (Decision 17); June's survey averaging and skip-ahead lines not taken as written.
3. Topic commits: deceased model/TeamDetail/Help; reducer TICK + chronological skip-ahead
   (respects round-robin); one survey missingness policy (blank = non-response, 0 valid);
   versioned fairness (legacy 5:3:1 kept, corrected 4:2:1 added, individual helpers);
   `OVERWHELM_THRESHOLD` -> `RED_ZONE_THRESHOLD` (8.5, old JSON fields readable); lab UI items;
   benchmark script + per-metric report page (no winner headline, NYU notice, no em dashes);
   Real Week Backtest dated label; favicon; June PNGs to `docs/reviews/2026-06-11/`.
4. Tests for all of the above. 5. Reruns in scratch copies of `f0f5bd4`, `8f1a6ab`, branch;
   nothing written into `data/`. 6. Lint, build, `check:schedules`, screenshots. 7. CLAUDE.md,
   METHODS sections 8 and 9, dated notes on two results docs. 8. Push `reconcile-june` only.

Not in scope: the shared simulation/replay status-ordering repair (open item 12). If anything
does not match the handoff or audit, I stop and report. Please do not touch `main` or these
files while this runs.

---

## [2026-09-28 14:20 EDT] Claude 4

**June reconciliation done through step 8, on `reconcile-june`. Not merged into `main`, `main`
not pushed, nothing deployed.** Backup `carbon-main` = `8f1a6ab`; `gh-pages` = `610b6f5`.

Commits: merge `b7e50bb` (parents `8f1a6ab`, `025fe05`); `e468438` deceased zero load (Decision 17);
`4b3c549` lab reducer skip-ahead chronological + round-robin; `10e9739` survey missing values;
`d2287d4` composite v1 (5:3:1) / v2 (4:2:1); `6c841b3` red-zone rename (JSON fields kept);
`a4da317` lab panels, no win tally; `602dd94` ten-metric benchmark + rebuilt report page
(Decision 18); `bf9eea7` backtest labeled dated (Decision 19); `cd4e296` favicon; `754b45a`
June PNGs to `docs/reviews/2026-06-11/`; `d8e0d2c` METHODS 8 and 9, CLAUDE.md.

Checks: 70/70 tests (23 new), eslint, build, `check:schedules` OK. Reruns in scratch copies:
pre-Carbon = Carbon byte-identical; Carbon vs branch differs only in `acuityBalance`,
`composite`, `fairness`; branch with composite v1 = Carbon byte-identical.

**For anyone running the replay:** the cohort gap (1,541/417 on the Mac vs 1,540/418 in
METHODS 6) is the time zone. `excelDateToMs` uses a local-time 1899 epoch; on America/New_York
arrivals are skewed (about -4 min before 2026-03-08, about +56 min after). Run with `TZ=UTC`;
Carbon under UTC reproduces the September record byte for byte. Same code in
`decay-schedule-benchmark.ts` and `extract-worked-example.ts`. Not fixed (open item).

---

## [2026-09-28 14:23 EDT] Claude 4

**Census time-zone fix on branch `fix-timezone`, pushed; not merged, not deployed.** Commits:
`b45b7ab` shared helper `scripts/lib/census-time.ts` (Excel serials as wall-clock time held in
UTC ms, UTC getters only) used by historical-replay, decay-schedule-benchmark and
extract-worked-example (and, untracked, buffer-duration, comprehensive, dispo-stats);
`f5503af` replay prints the two-team combined score as numbers, no advice; `0062797` corrected
comments + DST near-midnight test; `7f07b50` METHODS 10, CLAUDE.md, dated notes.

**Correction to my 14:20 post:** the skew is not "-4 min / +56 min". New York is EST in 1899
in the tz database, so the old code read arrivals before 2026-03-08 correctly and arrivals
from 2026-03-08 on exactly one hour late. Weekday labels from `new Date('YYYY-MM-DD').getDay()`
were one day early on the Mac.

Checks: 74/74 tests. Branch output identical under UTC and America/New_York for all six
scripts (only run stamps, paths, timing differ) and equal to the `0ac3878` UTC baseline.
Records: every April result (replay JSONs, buffer, decay, their Markdown, WORKED_EXAMPLE,
LOAD_MINUTES) is a New York run; only the 2026-09-27 replay files are UTC. The filed paper
and IDF use the New York reading (1,541; load-minutes 211 vs 91; Actual Gini 0.141).

---
