# UI Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile layout defects, copy bugs, and UX gaps found in the 2026-06-11 UI review (header overflow, badge/text collisions, walkthrough dark-mode readability, stale copy, sandbox color spread, capacity term labels).

**Architecture:** All changes are presentational — React component JSX/Tailwind classes, two CSS files, and the self-contained walkthrough HTML in `public/`. No engine, state-shape, or scoring changes. The walkthrough fixes touch both the React shell (`EvidenceWalkthrough.tsx`) and the embedded `public/walkthrough-v4.html` (its own CSS/JS).

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + Vite. App lives at the repo root.

**Testing note:** This project has unit tests only for the schedule parser (`npx vitest run`); there is no component-test infrastructure, and these are CSS/layout changes where DOM-less tests would not catch the regressions anyway. Each task therefore verifies with (a) `npm run build` (type-check + production build must pass) and (b) a concrete visual check in the dev server at a stated viewport. Run `npm run dev` once and leave it running; the app is at `http://localhost:5173/capacity-conscious-triage/`. Mobile checks use a 390×844 viewport (Chrome DevTools device toolbar, or Playwright `browser_resize`).

**Branch:** Create `ui-review-fixes` from `main` before Task 1:

```bash
git checkout main && git pull && git checkout -b ui-review-fixes
```

---

### Task 1: Mobile header overflow (highest priority)

The header's right-side icon cluster (compact / dark / legend / Help) extends to x≈459 on a 390px viewport. The Help button is half off-screen and tapping it horizontally scrolls the whole app. The left-side pill row ("DEMO · Charge / Triage Nurse · ↻ Reshuffle · Main Menu") doesn't wrap, which forces the total width. The role pill also wraps internally into 3 lines.

**Files:**
- Modify: `src/components/Dashboard.tsx` (header block, lines ~58–172)

- [ ] **Step 1: Add a horizontal-clip backstop to the page root**

In `src/components/Dashboard.tsx`, change the root div (line ~58):

```tsx
// BEFORE
    <div className="dashboard-bg pb-24">
// AFTER
    <div className="dashboard-bg pb-24 overflow-x-clip">
```

`overflow-x-clip` (not `-hidden`) clips without creating a scroll container, so sticky headers keep working.

- [ ] **Step 2: Let the pill row wrap and keep pills on one line each**

Change the pills row container (line ~68) and the role pill (line ~75):

```tsx
// BEFORE
          <div className="flex items-center gap-2">
            {isSandbox && (
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">DEMO</span>
            )}
// AFTER
          <div className="flex items-center gap-2 flex-wrap">
            {isSandbox && (
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">DEMO</span>
            )}
```

```tsx
// BEFORE
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">{roleLabel}</span>
// AFTER
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{roleLabel}</span>
```

Also add `whitespace-nowrap` to the Reshuffle and Main Menu buttons' className strings (lines ~79 and ~92) so they wrap as units, not mid-word:

```tsx
              className="text-xs text-amber-300 hover:text-amber-200 font-medium whitespace-nowrap"
```
```tsx
              className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
```

- [ ] **Step 3: Let the left block shrink and pin the icon cluster's size**

Change the left wrapper (line ~64) and the right cluster (line ~98):

```tsx
// BEFORE
        <div>
          <h1 className="text-xl font-bold text-white">
// AFTER
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white">
```

```tsx
// BEFORE
        <div className="flex items-center gap-2">
          <div className="relative">
// AFTER
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="relative">
```

- [ ] **Step 4: Shrink the icon buttons on mobile and make Help icon-only below `sm`**

The three circular buttons (compact ~line 102, dark mode ~line 151, legend ~line 158) each change `w-10 h-10` → `w-9 h-9 sm:w-10 sm:h-10`:

```tsx
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg ${compactMode ? 'ring-2 ring-blue-400' : ''}`}
```
```tsx
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg"
```
```tsx
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-sm font-medium"
```

Help button (line ~163–171): hide the text label below `sm` and tighten padding:

```tsx
          <button
            onClick={() => setShowHelp(v => !v)}
            className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-full bg-white/20 border border-white/30 flex items-center justify-center gap-1.5 text-white/90 font-medium text-sm"
            aria-label="Help"
            data-tour="help-button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
            <span className="hidden sm:inline">Help</span>
          </button>
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 6: Visual verification at 390×844**

Open the Sandbox demo at 390×844. Verify: (a) `document.documentElement.scrollWidth === 390` in the console (was 459), (b) the Help button is fully visible, (c) tapping Help does not shift the page sideways, (d) the role pill renders on one line (the pill row may wrap to two rows — that's intended).

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "fix: mobile header no longer overflows the viewport"
```

---

### Task 2: Recommendation badge covers Strength · Load text (TeamCard)

The `Recommended` / `2nd Choice` / `Closed` badges are absolutely positioned `top-2 right-2` and sit on top of the "Strength 44.6 · Load 3.5" text at phone width. Reserve space for the badge in the header's flowing content.

**Files:**
- Modify: `src/components/TeamCard.tsx` (lines ~189–199)

- [ ] **Step 1: Reserve right padding on the title row when a badge is shown**

In `src/components/TeamCard.tsx`, the team-info block (line ~189) currently reads:

```tsx
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
```

Change to (the badge cluster is rendered whenever `recommendationRank || isClosed` — see line ~80):

```tsx
            <div className="flex flex-col min-w-0">
              <div className={`flex items-baseline gap-2 flex-wrap ${(recommendationRank || isClosed) ? 'pr-24' : ''}`}>
```

`pr-24` (96px) clears the widest badge ("Recommended"). With `flex-wrap` already present, the Strength · Load span now wraps below the team name instead of running under the badge.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Visual verification at 390×844**

In the Sandbox, on the card marked "Recommended": the full "Strength NN.N · Load N.N" text must be readable (it may sit on its own line under the team name). Repeat for the "2nd Choice" card. At desktop width (≥768px) confirm nothing regressed: title, strength, and badge all on comfortable lines.

- [ ] **Step 4: Commit**

```bash
git add src/components/TeamCard.tsx
git commit -m "fix: recommendation badge no longer covers strength/load text"
```

---

### Task 3: Patient IDs wrap mid-ID ("C-" / "003")

**Files:**
- Modify: `src/index.css` (`.patient-id` rule, line ~12)

- [ ] **Step 1: Add nowrap to the shared `.patient-id` class**

```css
/* BEFORE */
.patient-id {
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.05em;
}
/* AFTER */
.patient-id {
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build` → `✓ built`. At 390×844 in the Sandbox, every patient badge shows its ID on one line ("C-003", never "C-" / "003").

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "fix: patient IDs never wrap mid-ID"
```

---

### Task 4: FAB covers tappable controls in expanded patient panels

The fixed "+ New Patient" FAB (bottom-right) floats over the Float Coverage buttons when a patient panel is expanded near the bottom. Give the page enough bottom clearance that the user can always scroll content above the FAB.

**Files:**
- Modify: `src/components/Dashboard.tsx` (root div, line ~58)

- [ ] **Step 1: Increase bottom padding**

The root div from Task 1 Step 1 becomes:

```tsx
    <div className="dashboard-bg pb-36 overflow-x-clip">
```

(`pb-36` = 144px, comfortably more than the FAB's 56px height + 24px offset.)

- [ ] **Step 2: Build and verify**

Run: `npm run build` → `✓ built`. At 390×844, expand the last patient on the last team card and scroll to the bottom: the Float Coverage / Reassign buttons can be scrolled fully clear of the FAB.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "fix: bottom clearance so FAB cannot trap controls"
```

---

### Task 5: Copy fixes — decay brackets, stale sim-setup copy, favicon

**Files:**
- Modify: `src/components/PatientBadge.tsx:21`
- Modify: `src/components/SimulationSetup.tsx:293`
- Modify: `index.html`
- Create: `public/favicon.svg`

- [ ] **Step 1: Remove the literal brackets from the decay label**

`src/components/PatientBadge.tsx` line 21:

```tsx
// BEFORE
  return { label: `current load ${currentWeight.toFixed(1)}; stabilizes in [${formatDuration(mins)}]`, decaying: true };
// AFTER
  return { label: `current load ${currentWeight.toFixed(1)}; stabilizes in ${formatDuration(mins)}`, decaying: true };
```

- [ ] **Step 2: Fix the stale "buffers" copy in simulation setup**

`src/components/SimulationSetup.tsx` line 293:

```tsx
// BEFORE
              <div className="text-xs opacity-70 mt-0.5">Capacity ratio + buffers</div>
// AFTER
              <div className="text-xs opacity-70 mt-0.5">Capacity-ratio scoring</div>
```

- [ ] **Step 3: Add a favicon**

Create `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#dc2626"/>
  <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#ffffff"/>
</svg>
```

In `index.html`, add inside `<head>` (after the `<title>` line):

```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

(Vite rewrites root-absolute URLs in `index.html` with the configured `base`, so this resolves to `/capacity-conscious-triage/favicon.svg` in both dev and production.)

- [ ] **Step 4: Build and verify**

Run: `npm run build` → `✓ built`. In dev: (a) expand a non-stabilized patient — the note reads "stabilizes in 2hrs 4mins" with no square brackets; (b) Simulation Setup's Formula-Driven card no longer mentions buffers; (c) browser console shows no favicon 404 on reload and the tab shows the red-cross icon.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatientBadge.tsx src/components/SimulationSetup.tsx index.html public/favicon.svg
git commit -m "fix: decay label brackets, stale buffer copy, missing favicon"
```

---

### Task 6: Summary card per-team patients row wraps at 390px

The "12 | 12 | 8" strings in `SimSummaryCard` use `text-sm` in ~120px columns and wrap ("11 | 11 |" / "10").

**Files:**
- Modify: `src/components/SimSummaryCard.tsx` (Patients context row, lines ~143–147)

- [ ] **Step 1: Tighten the patients row**

```tsx
// BEFORE
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-white/5">
          <span className="text-right font-mono text-sm text-slate-300">{liveCountStr}</span>
          <span className="text-[10px] text-slate-500 font-medium w-28 text-center">Patients</span>
          <span className="text-left font-mono text-sm text-slate-300">{shadowCountStr}</span>
        </div>
// AFTER
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-white/5">
          <span className="text-right font-mono text-xs whitespace-nowrap text-slate-300">{liveCountStr}</span>
          <span className="text-[10px] text-slate-500 font-medium w-28 text-center">Patients</span>
          <span className="text-left font-mono text-xs whitespace-nowrap text-slate-300">{shadowCountStr}</span>
        </div>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build` → `✓ built`. Run a short simulation (2h duration, skip through arrivals, 400x to the end) at 390×844: the per-team counts render on one line on both sides of the summary card.

- [ ] **Step 3: Commit**

```bash
git add src/components/SimSummaryCard.tsx
git commit -m "fix: summary card team counts no longer wrap on mobile"
```

---

### Task 7: Walkthrough — nav button contrast, dark-mode card readability, embedded chrome

Three root causes confirmed in `public/walkthrough-v4.html`:
1. `nav.controls button` (line ~254) sets `background: var(--surface)` but no `color`, so button text uses the UA default (black) — invisible on the dark surface.
2. `.formula-card, .group-card` (line ~500) hardcodes a white gradient while inner text uses `var(--ink)` (near-white in dark mode) — white-on-white on slides 2, 3, etc.
3. The app's "← Back" chip overlays the iframe's own header title, and the iframe shows its own dark-mode toggle even though the app already passes `?dark=`.

**Files:**
- Modify: `public/walkthrough-v4.html` (CSS ~lines 254–266, ~500–508; JS ~lines 3174–3188)
- Modify: `src/components/EvidenceWalkthrough.tsx:2`

- [ ] **Step 1: Give nav buttons an explicit text color**

In the `nav.controls button` rule (line ~254), add one declaration:

```css
  nav.controls button {
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    transition: all 0.15s;
  }
```

- [ ] **Step 2: Add dark-mode overrides for the white card gradient**

Immediately after the `.formula-card { padding: 56px 80px; }` rule (line ~509), add:

```css
  body.dark .formula-card, body.dark .group-card {
    background: linear-gradient(180deg, #1e293b 0%, #16202f 100%);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25);
  }
```

- [ ] **Step 3: Add embedded mode (hide duplicate toggle, clear the Back chip)**

In the JS init block (line ~3174, the section starting `// dark-mode preference`), extend it:

```js
// dark-mode preference — query-param wins (set by parent app), then localStorage.
const urlParams = new URLSearchParams(window.location.search);
const queryDark = urlParams.get('dark');
const storedDark = localStorage.getItem('walkthrough-dark');
const initialDark = queryDark != null ? queryDark === '1' : storedDark === '1';
if (initialDark) document.body.classList.add('dark');
const modeToggle = document.getElementById('modeToggle');
const syncToggleIcon = () => { modeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙'; };
syncToggleIcon();
modeToggle.addEventListener('click', () => {
  const on = document.body.classList.toggle('dark');
  localStorage.setItem('walkthrough-dark', on ? '1' : '0');
  syncToggleIcon();
});

// Embedded inside the app: theme comes from the parent (?dark=), so hide the
// duplicate toggle, and pad the header so the app's floating "← Back" chip
// doesn't cover the title.
if (urlParams.get('embedded') === '1') {
  modeToggle.style.display = 'none';
  document.querySelector('header').style.paddingLeft = '96px';
}
```

- [ ] **Step 4: Pass the embedded flag from the React shell**

`src/components/EvidenceWalkthrough.tsx` line 2:

```tsx
// BEFORE
  const src = `${import.meta.env.BASE_URL}walkthrough-v4.html?dark=${darkMode ? '1' : '0'}`;
// AFTER
  const src = `${import.meta.env.BASE_URL}walkthrough-v4.html?dark=${darkMode ? '1' : '0'}&embedded=1`;
```

- [ ] **Step 5: Build and verify**

Run: `npm run build` → `✓ built`. In dev at 390×844, toggle the app to dark mode, open "How It Works": (a) the header title is not covered by the "← Back" chip and there is no duplicate sun/moon toggle inside the walkthrough; (b) "Next →" is clearly legible (light text on dark); (c) advance to slide 2 ("All teams are not equal") — the three team cards now sit on a dark panel with legible light text; (d) click through to at least slide 6 in dark mode checking every panel stays legible; (e) switch the app to light mode and reopen — light theme intact.

- [ ] **Step 6: Commit**

```bash
git add public/walkthrough-v4.html src/components/EvidenceWalkthrough.tsx
git commit -m "fix: walkthrough dark-mode readability and embedded chrome"
```

---

### Task 8: Show the calibrated capacity term on team cards

The six empirically calibrated labels (Comfortable / Manageable / Busy / Very Busy / High Demand / Red Zone) only appear in the legend. Show the current term under the battery so the meaning is visible where decisions happen (also helps color-blind users).

**Files:**
- Modify: `src/components/TeamCard.tsx` (imports line 4; battery widget column lines ~172–185)

- [ ] **Step 1: Import `getCapacityTerm`**

Line 4 of `src/components/TeamCard.tsx`:

```tsx
// BEFORE
import { ACUITY_DECAY, PROVIDER_TYPE_LABELS, TRAUMA_TEAM_ID, TEAM_CLOSE_TRANSFER_MS, TEAM_CLOSE_TRANSFER_TARGETS, getCapacityColor, capacityFillPercent } from '../constants';
// AFTER
import { ACUITY_DECAY, PROVIDER_TYPE_LABELS, TRAUMA_TEAM_ID, TEAM_CLOSE_TRANSFER_MS, TEAM_CLOSE_TRANSFER_TARGETS, getCapacityColor, capacityFillPercent, getCapacityTerm } from '../constants';
```

- [ ] **Step 2: Render the term under the CAPACITY label**

In the battery widget column, directly after the `Capacity` label div (the block ending `>Capacity</div>` at line ~177) and before the `showNextUp` block, insert:

```tsx
              {useCapacityStyling && (
                <div
                  className="mt-0.5 font-semibold uppercase"
                  style={{ color: capColor, fontSize: 9, letterSpacing: '0.05em', opacity: 0.85 }}
                >
                  {getCapacityTerm(ratio).label}
                </div>
              )}
```

(`getCapacityTerm` already handles `Infinity` → "Comfortable". `useCapacityStyling` is already in scope and excludes empty/inactive-trauma cards.)

- [ ] **Step 3: Build and verify**

Run: `npm run build` → `✓ built`. In the Sandbox: each staffed team card shows a term like "VERY BUSY" under "CAPACITY", colored to match the number; inactive Trauma (no patients) shows no term. Cross-check one card against the legend thresholds (e.g. ratio 12.5 → "Very Busy"; ratio ≥ 50 → "Comfortable").

- [ ] **Step 4: Commit**

```bash
git add src/components/TeamCard.tsx
git commit -m "feat: show calibrated capacity term on team cards"
```

---

### Task 9: Sandbox demo opens with everything red — seed a color spread

`LOAD_DEMO` generates 4–8 patients all within the last 90 minutes, which lands every team at ratio ~8–13 (red). Fewer patients over a wider window (decay has 180-min runway) gives the demo a realistic spread so the color scale and capacity terms are actually demonstrated.

**Files:**
- Modify: `src/context/ShiftContext.tsx` (`LOAD_DEMO` case, the patient-generation block)

- [ ] **Step 1: Widen the arrival window and lower the count**

In the `LOAD_DEMO` case of `src/context/ShiftContext.tsx`, find:

```tsx
      const patientCount = randInt(4, 8);
      // Generate arrival times spread over the last 90 minutes, sorted oldest first
      const arrivalTimes = Array.from({ length: patientCount }, () => demoNow - randInt(3, 90) * min)
        .sort((a, b) => a - b);
```

Replace with:

```tsx
      const patientCount = randInt(3, 6);
      // Spread arrivals over the last 150 minutes (decay runs 180) so reshuffles
      // show a range of capacity colors instead of uniformly red cards.
      const arrivalTimes = Array.from({ length: patientCount }, () => demoNow - randInt(3, 150) * min)
        .sort((a, b) => a - b);
```

- [ ] **Step 2: Build and verify**

Run: `npm run build` → `✓ built`. Open the Sandbox and press "↻ Reshuffle" ~5 times: most layouts should now show at least one team in the yellow/green range alongside busier red teams (it's random — judge across reshuffles, not a single roll).

- [ ] **Step 3: Commit**

```bash
git add src/context/ShiftContext.tsx
git commit -m "feat: sandbox demo seeds a spread of capacity states"
```

---

### Task 10: Hide the floating sim mini-controls while the top bar is visible

`SimulationControls` renders a fixed bottom-left mini control cluster that duplicates the top bar and covers patient rows even when the top bar is on screen.

**Files:**
- Modify: `src/components/SimulationControls.tsx` (imports already include `useState`/`useEffect`; the mini-controls block is the `fixed bottom-6 left-6` div)

- [ ] **Step 1: Track scroll position**

Inside the `SimulationControls` component body (after the existing `useState` declarations near the top of the component):

```tsx
  const [scrolledPastBar, setScrolledPastBar] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolledPastBar(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
```

- [ ] **Step 2: Gate the mini controls on it**

Find the floating cluster:

```tsx
      {/* Floating mini controls */}
      <div className="fixed bottom-6 left-6 z-20 flex items-center gap-1.5 bg-slate-800/90 backdrop-blur rounded-2xl px-3 py-2 shadow-lg border border-white/10">
```

Wrap it in the condition (and close the brace after its closing `</div>`):

```tsx
      {/* Floating mini controls — only once the top control bar has scrolled away */}
      {scrolledPastBar && (
      <div className="fixed bottom-6 left-6 z-20 flex items-center gap-1.5 bg-slate-800/90 backdrop-blur rounded-2xl px-3 py-2 shadow-lg border border-white/10">
        ...existing children unchanged...
      </div>
      )}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build` → `✓ built`. Start a simulation at 390×844: at the top of the page only the top control bar shows; scroll down past the team cards and the mini cluster fades in; scroll back up and it disappears. Pause/play still works from both.

- [ ] **Step 4: Commit**

```bash
git add src/components/SimulationControls.tsx
git commit -m "feat: sim mini-controls only show when top bar is off-screen"
```

---

### Task 11: Full regression pass and PR

- [ ] **Step 1: Run the whole suite**

```bash
npm run build && npx vitest run
```
Expected: `✓ built`, `26 passed`.

- [ ] **Step 2: End-to-end visual sweep at 390×844 and 1280×800**

Walk: role selection → Sandbox (header, cards, badges, expand patient, assign + override, Help, legend) → dark mode toggle → How It Works (dark + light, slides 1–6) → Start Simulation (compare panel, skip to end, summary card). Confirm no horizontal scroll anywhere (`document.documentElement.scrollWidth === window.innerWidth`).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin ui-review-fixes
gh pr create --base main --title "UI review fixes: mobile layout, walkthrough dark mode, copy polish" --body "Fixes from the 2026-06-11 UI review: header overflow, badge/text collision, patient-ID wrap, FAB clearance, walkthrough dark-mode readability + embedded chrome, decay-label brackets, stale buffer copy, favicon, summary-card wrap, capacity terms on cards, sandbox color spread, sim mini-control auto-hide.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Out of scope (explicitly deferred)

- Walkthrough mobile dead space / vertical centering — cosmetic, low value relative to risk of disturbing 32 slides of bespoke layout.
- Replacing the Strength·Load layout wholesale or redesigning the battery widget.
- Component-test infrastructure (vitest + testing-library) — worth doing, but as its own project, not piggybacked on CSS fixes.
