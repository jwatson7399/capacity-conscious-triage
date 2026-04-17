# Evidence Walkthrough Visual Improvements Brief

**File:** `src/components/EvidenceWalkthrough.tsx`

Make the following visual improvements to the Evidence Walkthrough slides. All changes are CSS/JSX only — no data or copy changes. Preserve all existing content, info tips, and navigation.

## 1. Bigger comparison bars (CardCapacityBalance, CardAcuityBalance)

The horizontal comparison bars are currently h-5/h-6 (~20-24px) — way too thin for a full-screen card. Increase bar height to h-8 or h-10. Consider embedding the value label inside the filled portion of the bar (right-aligned within the colored area) so the bar itself carries the data, not a separate text element beside it.

## 2. Add horizontal bar gauge to CardSafetyFloor

Currently just two big numbers (18 and 32) floating side by side — it's the only data slide with no graphic. Replace or supplement with a horizontal gauge/bar visual showing capacity ratio from 0 to ~40. Show Current (18) as an amber bar and Formula (32) as a blue bar, so the 2× improvement is visually obvious. Keep the "2× the breathing room" text.

## 3. Standardize Current = amber-500 everywhere

Right now the "Current" value color is inconsistent:
- CardSlams: amber-500 ✓
- CardDangerStacking: **red-500** ← change to amber-500
- CardCapacityBalance: amber-500 ✓
- CardAcuityBalance: amber-500 ✓
- CardSafetyFloor: **slate-600** ← change to amber-500

The Formula side is consistently blue-500 everywhere (good). Make Current consistently amber-500 so the visual language is: amber = status quo, blue = formula.

Note: The CardDangerStacking reduction callout box should stay red-themed (bg-red-50, text-red-600, etc.) since that slide is about danger. Only the big "0.7" number should change from red-500 to amber-500.

## 4. CSS entrance animations

Add subtle entrance animations so data doesn't just appear:
- Hero numbers: fade-in + slight scale-up when the slide is visible
- Comparison bars: grow from 0 to target width
- Callout cards: fade-in with slight upward translate

Use CSS transitions/animations only — no JS animation libraries. You can track which slide is currently visible via the `currentCard` state that already exists in the parent component. A simple approach: pass the card index and current index to each card component, and apply animation classes when `index === currentCard`.

## 5. Differentiate CardAcuityBalance from CardCapacityBalance visually

These two slides are now structurally identical (both have horizontal comparison bars + callout card). Make them visually distinct so swiping from one to the other doesn't feel like the same card. Options:

- Use a **diverging bar** for Acuity Balance (center-anchored, current extends left, formula extends right)
- Use a **vertical bar pair** for Acuity Balance (two columns side by side, height = value)
- Use **stacked dot/icon visualization** for one of them

Pick whichever looks cleanest and most readable on mobile. The key constraint: it needs to immediately communicate "this number got smaller" just like the horizontal bars do.

## 6. Bump minimum text size on CardFairnessScore

The fairness score card uses `text-[10px]` for dimension labels, weights, and scores. On mobile this is at the legibility threshold. Bump to `text-[11px]` or `text-xs` (12px). The row layout may need slight width adjustments to accommodate.

## Design constraints

- Mobile-first (iPhone SE width = 375px is the baseline)
- Must work in both light and dark mode (the component already has dark: variants throughout)
- Keep total vertical content within viewport — no scrolling within a card
- Preserve all existing info tips, dimension tags, and data values
- Match existing style: Tailwind utilities, blue-500 for formula, glass-card aesthetic
