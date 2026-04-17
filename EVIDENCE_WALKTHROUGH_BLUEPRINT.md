# Blueprint: In-App Evidence Walkthrough

## Overview

A swipeable card-based walkthrough built into the app that presents the historical benchmark results. Designed for 1:1 demos — hand your phone to an attending or nurse and say "swipe through this." Accessed from the RoleSelection screen via a prominent button.

**Design principles:**
- Mobile-first, one concept per card, no scrolling within a card
- Visual-first: big numbers, simple bar visuals, minimal text
- Definitions available via tappable ℹ️ icons (bottom sheet or tooltip)
- Matches existing app style: `dashboard-bg`, `glass-card`, Tailwind, dark mode support, blue accent gradients, `rounded-xl`
- Swipe left/right to navigate (plus dot indicators and back/next buttons)
- Total: ~10 cards, under 90 seconds to swipe through

---

## Entry Point

On the `RoleSelection` screen, add a button below the "Take a Guided Tour" button:

```
[ See the Evidence ]
  4 months of real data, 1,541 encounters
```

Style: `bg-gradient-to-r from-emerald-600 to-teal-600` (differentiates from the blue tour button). Same `rounded-xl`, `min-h-[56px]`, `font-semibold` pattern.

State: `const [showEvidence, setShowEvidence] = useState(false);`
When true, render `<EvidenceWalkthrough onBack={() => setShowEvidence(false)} />`.

---

## Component: `EvidenceWalkthrough.tsx`

### Structure

```tsx
export default function EvidenceWalkthrough({ onBack }: { onBack: () => void }) {
  const [currentCard, setCurrentCard] = useState(0);
  // ... swipe handling, dot indicators, navigation
}
```

Use touch event handlers for swipe (touchstart/touchend delta) or a lightweight swipe hook. Include:
- Dot indicators at the bottom (current dot filled, others outlined)
- Tappable left/right arrows on the sides (for non-swipe users)
- Card number indicator: "3 / 10"
- Back button (top-left) to return to RoleSelection

### Info Popover Component

A reusable `<InfoTip term="Gini Coefficient" definition="A 0-to-1 scale..." />` component:
- Renders a small ℹ️ icon inline next to the term
- On tap, shows a bottom sheet (mobile) or tooltip (desktop) with the definition
- Tap outside or swipe down to dismiss
- Style: semi-transparent backdrop, rounded card at bottom with `glass-card` styling

---

## Card-by-Card Specification

All data below uses 4:2:1 weight results. Each card has: hero visual, headline text, optional subtext, and optional info tips.

---

### Card 1: "The Study"
**Purpose:** Establish credibility — this is real data, not a simulation.

**Visual:** Large number center screen.

```
         1,541
    real patient encounters

Dec 2025 – Mar 2026 · 121 days
Teams 1, 2, and 3 · A-side only
```

**Subtext (smaller, below):**
"We replayed every A-side patient assignment using your actual schedules and real arrival times. Three methods compared side by side: what actually happened, what the formula would have done, and simple round-robin."

**Info tips:** None needed.

---

### Card 2: "The Current Process"
**Purpose:** Reframe the status quo as random. This is the most important card.

**Visual:** One massive number, centered.

```
        31.7%
  of the time, the current process
  assigned to the highest-capacity team

  Random chance with 3 teams: 33.3%
```

**Subtext:**
"The current assignment process shows zero capacity awareness. It performs no better than drawing a team name out of a hat."

**Info tips:**
- ℹ️ **Capacity Ratio**: "A team's total provider strength divided by their current patient load. Higher = more bandwidth to take a new patient."

---

### Card 3: "Slams"
**Purpose:** The visceral metric — everyone's been slammed.

**Visual:** Two rows, each with a large number and an arrow showing reduction.

```
  SLAMS
  2+ patients to one team within 1 hour

  Current     →     Formula
   2.2/day            1.2/day
        ↓ 45% reduction

  128 fewer slams over 4 months
```

**Visual treatment:** The "2.2" in amber/orange, the "1.2" in blue. Arrow between them. "128 fewer" in bold below.

**Subtext:**
"A slam is when a team gets back-to-back patients before they've stabilized the first one. Orders get held. Workups start late."

**Info tips:**
- ℹ️ **Slam**: "When a team receives 2 or more new A-side patients within a 1-hour window."

---

### Card 4: "Danger Stacking"
**Purpose:** The scary version of slams — high-acuity specifically.

**Visual:** Same layout as Card 3 but with red/warning styling.

```
  BACK-TO-BACK HIGH ACUITY
  Two ESI 1-2 patients to one team within 30 min

  Current     →     Formula
   0.7/day            0.1/day
        ↓ 85% reduction

  66 fewer over 4 months
```

**Visual treatment:** "0.7" in red, "0.1" in blue. Warning icon (⚠️ or shield) at top.

**Subtext:**
"Not all slams are equal. When both patients are high-acuity, you're splitting attention between two patients who can both decompensate. The formula nearly eliminates this."

**Info tips:**
- ℹ️ **Back-to-back HA**: "Same team receives two ESI 1 or ESI 2 patients within 30 minutes of each other."

---

### Card 5: "Patient Distribution"
**Purpose:** Show the count balance improvement + acuity balance improvement together.

**Visual:** Two paired bar chart groups showing the spread reduction.

```
  PATIENT COUNT GAP
  Busiest team vs. lightest team per day

  ┌─────────────────────┐
  │ Current:  ████████  2.5 patients
  │ Formula:  ████      1.2 patients
  └─────────────────────┘

  SEVERITY GAP
  Heaviest acuity load vs. lightest per day

  ┌─────────────────────┐
  │ Current:  ██████████  5.0 acuity pts
  │ Formula:  █████       2.4 acuity pts
  └─────────────────────┘
```

**Visual treatment:** Horizontal bars — amber for Current, blue for Formula. Simple, no axis labels needed. The number at the end of each bar.

**Subtext:**
"The formula doesn't just spread patients more evenly — it spreads the sickest patients more evenly. A gap of 2.4 acuity points is roughly one extra ESI-2 patient."

**Info tips:**
- ℹ️ **Acuity Points**: "Each patient's severity converted to a number using evidence-based weights: Tier One (ESI 1) = 4, Tier Two (ESI 2) = 2, Tier Three (ESI 3+) = 1. Based on the POWER study (n=11,716) and five supporting studies."
- ℹ️ **Gini Coefficient**: "A 0-to-1 scale economists use to measure inequality. 0 = perfectly equal, 1 = completely unequal. The patient count Gini halved from 0.141 to 0.062. The acuity-weighted Gini halved from 0.151 to 0.074."

---

### Card 6: "Safety Floor"
**Purpose:** The formula doesn't just improve averages — it raises the worst case.

**Visual:** Two large numbers side by side with a "floor" visual metaphor (a horizontal line representing the threshold).

```
  WORST MOMENT OF A TYPICAL DAY
  Lowest capacity ratio at time of assignment

  Current          Formula
    18               32

  ──────── Red Zone: 3.75 ────────

  Both well above danger, but the formula
  provides nearly 2× the margin.
```

**Visual treatment:** The numbers large and bold. The Red Zone line rendered as a colored horizontal rule at the bottom with a subtle red glow. The gap between the numbers and the line visually communicates "margin."

**Subtext:**
"This is the team that was most stretched at their worst moment over a typical day. The formula nearly doubles the breathing room."

**Info tips:**
- ℹ️ **Capacity Ratio**: (same as Card 2)
- ℹ️ **Red Zone (3.75)**: "The threshold below which a team is genuinely resource-strained. Derived from the 5th percentile of 23,193 empirical capacity observations. No team hit this threshold during the study period."

---

### Card 7: "The Fairness Score"
**Purpose:** Reveal the composite — the audience has already seen each ingredient.

**Visual:** A stacked/layered visual showing the five components feeding into one number.

```
  FAIRNESS SCORE

  We combined five dimensions into one composite:

  ┌──────────────────────────────────────┐
  │  Capacity Balance         25%   0.84 │
  │  Acuity Balance           15%   0.84 │
  │  Stress Equity            15%   0.90 │
  │  Overwhelm Avoidance      30%   1.00 │
  │  Safety Floor             15%   1.00 │
  └──────────────────────────────────────┘
              ↓
           92.2 / 100
```

**Visual treatment:** Each row is a small horizontal bar showing the formula's sub-score (0 to 1 scale). The bars are filled proportionally. The composite "92.2" is large and blue at the bottom. Show "Actual: 85.7" in smaller gray text for comparison.

**Subtext:**
"Weighted toward safety — 30% of the score is overwhelm avoidance, which all methods passed. The formula's edge comes from distributing workload more proportionally to team capacity."

**Info tips:**
- ℹ️ **Capacity Balance**: "Are teams getting patients proportional to their staffing strength? A strong team with an attending + senior resident should handle more than a team with one intern."
- ℹ️ **Acuity Balance**: "Is patient severity spread evenly, or does one team get all the high-acuity patients?"
- ℹ️ **Stress Equity**: "Did all teams experience similar levels of strain throughout the day, or did one team get consistently hammered while another coasted?"
- ℹ️ **Overwhelm Avoidance**: "What fraction of assignments landed above the Red Zone threshold? All three methods scored perfect — 1.00."
- ℹ️ **Safety Floor**: "How bad was the worst single moment? Both methods stayed well above the Red Zone. Score is capped at 1.00 once the worst moment exceeds the threshold."

---

### Card 8: "78% of Days"
**Purpose:** The capstone — the formula wins 4 out of 5 days.

**Visual:** Large percentage with a day-of-week breakdown below it.

```
              77.7%
    of days, the formula produced
    a fairer distribution than
    the current process

  Mon  Tue  Wed  Thu  Fri  Sat  Sun
  67%  76%  82%  76%  88%  65%  89%
  ───  ───  ───  ───  ───  ───  ───
   ✓    ✓    ✓    ✓    ✓    ✓    ✓
         all 7 days significant
```

**Visual treatment:** The "77.7%" is huge, emerald/green. The day-of-week row uses small vertical bar fills proportional to win %. Green checkmarks below each day. "all 7 days significant" in a subtle badge.

**Subtext:**
"Tested on every day of the week, all four months. Not simulated — your patients, your teams, your schedules. The formula won on Mondays. It won on Fridays. It won on Sundays. No exceptions."

**Info tips:**
- ℹ️ **Statistically Significant**: "The improvement is unlikely to be due to chance. Every day of the week individually reached p < 0.05 — the standard threshold in medical research."
- ℹ️ **Cohen's d = 0.84**: "A measure of how large the effect is. 0.2 = small, 0.5 = medium, 0.8 = large. Ours is 0.84 — a large effect. It means if you picked a random day from each method, the formula's day would be better about 79% of the time."

---

### Card 9: "What Changes"
**Purpose:** Explain why — the formula changes 2/3 of assignments because the current process isn't aiming.

**Visual:** A simple donut or pie chart showing 33.6% agreement / 66.4% different.

```
         66.4%
    of assignments would change

  ┌─────────────────────────────┐
  │  ██████████████░░░░░        │
  │  Changed (66.4%)  Same      │
  └─────────────────────────────┘

  The formula isn't aggressive.
  The current process isn't aiming.
```

**Subtext:**
"The formula agreed with the actual assignment only 1 in 3 times. That sounds like a lot of change — until you remember the current process is statistically indistinguishable from random. When you go from zero capacity awareness to full capacity awareness, most assignments change."

**Info tips:** None needed — this card is self-explanatory given everything before it.

---

### Card 10: "Summary"
**Purpose:** Leave them with the headline.

**Visual:** Clean, centered text. No charts.

```
  4 months. 1,541 encounters. Your data.

  ✓  128 fewer slams
  ✓  66 fewer high-acuity pileups
  ✓  Patient gap halved (2.5 → 1.2)
  ✓  Severity gap halved (5.0 → 2.4)
  ✓  Safety margin nearly doubled (18 → 32)
  ✓  Wins 78% of days — every day of the week

  ───────────────────────────────────
  "The question isn't whether the formula
   is perfect. It's whether it's better
   than a coin flip. It is."
  ───────────────────────────────────
```

**Visual treatment:** Checkmarks in emerald green. The quote at the bottom in italic, slightly dimmed. A "Back to app" button below.

**Info tips:** None.

---

## Technical Notes

### File Location
`src/components/EvidenceWalkthrough.tsx`

### Routing
No React Router needed. Use the same pattern as `RealScheduleBenchmarkReport` — a state flag in `RoleSelection` that conditionally renders the component.

### Swipe Implementation
Use touch events:
```tsx
const touchStartX = useRef(0);
const handleTouchStart = (e: TouchEvent) => touchStartX.current = e.touches[0].clientX;
const handleTouchEnd = (e: TouchEvent) => {
  const delta = e.changedTouches[0].clientX - touchStartX.current;
  if (delta > 50) prev();
  if (delta < -50) next();
};
```

### Data
All data is hardcoded in the component — these are historical benchmark results, not live calculations. Use a `const CARDS` array with the content for each card.

### Responsive
- Cards should fill viewport height minus dot indicators and nav
- Text sizes should use `clamp()` or responsive Tailwind classes
- Test on iPhone SE (smallest common screen) through iPad

### Dark Mode
Follow existing pattern — all components already support `dark:` variants. Use the same color pairs as `RealScheduleBenchmarkReport`.

### Info Tips
Create a reusable `InfoTip` component:
```tsx
function InfoTip({ term, children }: { term: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-0.5 text-blue-500">
        <span className="text-xs">ℹ️</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-t-2xl p-5 max-w-lg w-full shadow-xl border-t border-slate-200 dark:border-white/10" onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-slate-900 dark:text-white mb-2">{term}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
```

### Accessibility
- All info tips keyboard-accessible (button element, not span)
- Swipe supplemented with arrow buttons and keyboard arrows
- Sufficient contrast ratios in both light/dark modes
- Progress indicators announced to screen readers

---

## Definitions Reference (all info tips)

| Term | Definition |
|------|-----------|
| Capacity Ratio | A team's total provider strength divided by their current patient load. Higher = more bandwidth to take a new patient. |
| Slam | When a team receives 2 or more new A-side patients within a 1-hour window. |
| Back-to-back HA | Same team receives two ESI 1 or ESI 2 patients within 30 minutes of each other. |
| Acuity Points | Each patient's severity converted to a number: Tier One (ESI 1) = 4, Tier Two (ESI 2) = 2, Tier Three (ESI 3+) = 1. Based on the POWER study (n=11,716) and five supporting studies. |
| Gini Coefficient | A 0-to-1 scale measuring inequality. 0 = perfectly equal, 1 = completely unequal. Used by economists for income inequality; here applied to patient distribution across teams. |
| Red Zone (3.75) | The capacity ratio threshold below which a team is genuinely resource-strained. Derived from the 5th percentile of 23,193 empirical observations. |
| Statistically Significant | The improvement is unlikely due to chance (p < 0.05 — the standard threshold in medical research). |
| Cohen's d | A measure of effect size. 0.2 = small, 0.5 = medium, 0.8 = large. Ours is 0.84 — large. Means the formula's day beats the current process's day about 79% of the time. |
| Capacity Balance | Are teams getting patients proportional to their staffing strength? |
| Acuity Balance | Is patient severity spread evenly across teams? |
| Stress Equity | Did all teams experience similar strain throughout the day? |
| Overwhelm Avoidance | What fraction of assignments stayed above the Red Zone? All methods scored 1.00 (perfect). |
| Safety Floor | How bad was the worst moment? Scored against the Red Zone threshold. Capped at 1.00 once the worst moment exceeds the threshold. |
