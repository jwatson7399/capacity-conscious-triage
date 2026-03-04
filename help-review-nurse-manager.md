# Help Section Review: Nurse Manager Perspective

## Context
The help section ("How It Works") is thorough but overwhelming for a nurse manager opening it for the first time. As a first-time user, you see a wall of text in the intro, then 8 collapsed sections that are hard to distinguish in priority. There's redundancy (Trauma exclusion mentioned 3 times, buffer behavior explained twice across two sections), the header button is a cryptic "?" that blends in, and it's not clear what you *need* to know vs. what's reference detail.

## Problems identified

1. **Header "?" button is invisible** — small, unstyled, no label. A nurse manager wouldn't know this is where to learn the system.
2. **Intro is too long** — 5 paragraphs before any collapsible section. The round-robin critique is backstory, not instruction. A nurse manager wants to know *what this does* and *what to do*, not why the old system was bad.
3. **Redundancy across sections:**
   - "Team 4 excluded from recommendations" appears in intro, "How Recommendations Work", AND "Overrides & Trauma"
   - Buffer behavior is explained in "The Buffer System" AND re-explained in step 2 of "How Recommendations Work"
   - "Overrides can be overridden / logged" in intro AND "Overrides & Trauma"
4. **"The Core Formula" and "Team Strength" overlap** — both explain Capacity = Strength / Demand with formulas. A nurse manager doesn't need to see the sigma notation.
5. **"How Recommendations Work" is buried as section 5** — this is the most actionable section (what actually happens when you assign) but it's deep in the list.
6. **"Patient Nomenclature" is niche** — C-### and F-### labels are explained on the badges themselves; this section is reference-only.
7. **No quick-start path** — a busy nurse manager wants: "higher number = more room, tap + New Patient, pick the highlighted team, done."

## Proposed restructure

### Tier 1: Always-visible quick start (replaces the long intro)
A concise 3-4 line summary:
- "Each team gets a **capacity** score (higher = more room). The app recommends the team with the highest capacity."
- "Tap **+ New Patient**, pick an acuity color, and assign to the recommended team — or override with a reason."
- "Colored bars are cooldown buffers — the team is temporarily skipped after receiving a patient."
- "Every recommendation can be overridden. The final call is always yours."

### Tier 2: Collapsible detail sections (consolidated from 8 → 5)

| New Section | Sources | What changes |
|---|---|---|
| **Reading the Dashboard** | "Core Formula" callout box + capacity terms from legend | What the big number means, what Strength/Demand show, capacity color scale. Drop the sigma formula. |
| **Acuity Colors & Decay** | "Patient Demand & Decay" | Keep the 3-row table + clinical examples. Cut the "decay reflects clinical reality" paragraph (the table is self-explanatory). |
| **Buffers & Recommendations** | "The Buffer System" + "How Recommendations Work" | Merge into one section. Buffer = team skipped temporarily. Duration table. Then the 5-step recommendation logic. "All buffered" callout stays. Eliminates the redundant buffer explanation in both. |
| **Actions & Controls** | "Available Actions" + "Overrides & Trauma" | Merge. One list of everything you can do. Overrides and Trauma are actions, not a separate concept. |
| **Reference** | "Team Strength" tables + "Patient Nomenclature" | Provider weight table, status multiplier table, C-###/F-### labels. Clearly labeled as reference — you don't need this day-to-day. |

### What gets cut entirely
- The 3-bullet round-robin critique (intro paragraphs 1-2) — move to a single sentence if needed: "Replaces round-robin with formula-driven scoring."
- Duplicate Trauma exclusion mentions (keep only in Buffers & Recommendations step 1)
- Duplicate override mentions (keep only in Actions & Controls)
- The `Strength = Σ(ProviderWeight × StatusMultiplier)` formula (the table is enough)
- The `Capacity = Team Strength / Patient Demand` pre block (the quick-start already says "higher = more room")

### Header button
- Replace the plain "?" circle with a labeled button: text "Help" with a question-mark-circle icon
- Give it a slightly different treatment so it reads as a primary action, not decoration
