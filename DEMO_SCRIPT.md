# ER Triage Tool — Demo Script

Open **http://localhost:4000/** in your browser before starting.

---

## 1. The Problem (30 seconds)

> "Right now we rotate A-side patients round-robin across Teams 1 through 3. That means:
>
> - A team with a senior resident and two juniors gets the same number of patients as a team with just a rotating off-service intern.
> - A cardiac arrest and a sedated EDP needing end-tidal CO2 monitoring both count as one A-side patient.
> - There's no way to know if one team is already overwhelmed compared to the others.
>
> This tool fixes that."

---

## 2. Load the Demo (15 seconds)

1. Click **"Load Demo Shift"** — this populates a realistic mid-shift scenario with randomized teams, providers, and patients
2. Point out: "Every time you load the demo it's different — randomized names, team compositions, and patient assignments"

---

## 3. Walk Through a Team Card (30 seconds)

Pick the **recommended team** (blue border, "Recommended" badge):

- **Big number** = Capacity Ratio — higher means more room
- **Status label** (Ready / Stable / Manageable / Very Busy / High Load) — plain English summary
- **Capacity** = total provider strength based on who's on the team and their current status
- **Load** = total patient weight on that team right now
- Tap **Providers** to expand — "Each provider type has a different weight. An attending contributes more capacity than a junior resident. If someone is in a procedure, their contribution drops to 25%."

---

## 4. Explain the Scoring (20 seconds)

> "The formula is simple: **Capacity divided by Load**. The team with the highest ratio is recommended. This means a strong team with few patients gets recommended over a weaker team that's already loaded up."

---

## 5. Assign a Patient (30 seconds)

1. Tap **"+ Assign Patient"** (blue button, bottom right)
2. Select **Tier One** — "This is your ACLS, intubation, STEMI — critical action patients"
3. Select **Critical** as source
4. Tap the **recommended team** — patient assigned instantly
5. Point out: "Notice a buffer bar appeared on that team. This prevents us from stacking patients on the same team back-to-back. The buffer lasts 35 minutes for a Tier One."

---

## 6. Show the Override Flow (20 seconds)

1. Tap **"+ Assign Patient"** again
2. Select **Tier Two**, keep Critical
3. This time tap a **non-recommended team**
4. "It asks for a reason — attending request, charge nurse decision, etc. Every override is logged so we can review patterns later."
5. Cancel out (or confirm to show it works)

---

## 7. Key Features to Mention

- **Patient load decays over time** — "A tier-one patient starts at weight 5, but after an hour it drops to 3, and after two hours it drops to 1. This reflects that the acute phase passes and the team frees up."
- **Provider statuses** — "If someone goes into a procedure or steps off the floor, their capacity contribution drops automatically. It auto-expires back to active after 15-30 minutes."
- **Buffer stacking** — "If you assign three patients rapidly to the same team, the buffer stacks — three tier-one patients means over an hour and a half of buffer, not just 35 minutes."
- **Team 4 (Trauma)** — "Trauma is always visible but never auto-recommended. You can only assign there manually."

---

## 8. Close (15 seconds)

> "The goal isn't to replace clinical judgment — you can always override. The goal is to give triage and charge nurses a real-time view of which team is best positioned for the next patient, based on who's actually available and what they're already carrying."

---

## If Asked...

**"What happens if all teams are overwhelmed?"**
— The tool still ranks them and picks the least-bad option. The status will show "High Load" or "Overwhelmed" in red.

**"Can multiple people use this at once?"**
— "That's the next phase — adding a shared backend so triage, charge, and attendings all see the same live view on their phones."

**"Can we change the weights or timers?"**
— "Yes, all the numbers are configurable — provider weights, decay schedules, buffer durations. We can tune them based on how it performs."

**"What about B-side patients?"**
— "This is scoped to A-side for now. B-side could be added as a separate workflow."
