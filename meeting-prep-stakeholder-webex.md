# Meeting Prep: ER Triage Tool — Stakeholder Webex

## Context
Julian is meeting with the department head of informatics, chief of service, and nursing operations managers to discuss his ER triage assignment tool. The tool replaces round-robin patient-to-team assignment with formula-driven scoring (capacity/load ratio). The email from leadership signals they're open but want specifics — analytics needs, nursing workflow realities, and Epic integration scope.

---

## Anticipated Questions by Stakeholder

### From Informatics (Department Head)
1. **Data architecture** — Where does this data live? Is it client-only or does it persist? (Answer: currently all client-side, no PHI, no backend)
2. **Epic integration** — Can this pull provider schedules from AMION/ShiftAdmin/Epic? Can it push assignments back? (Answer: not yet, but the engine is pure-function and API-ready)
3. **Security/HIPAA** — Does it store patient identifiers? (Answer: no — patients are anonymous C-### / F-### IDs, no PHI touches the app)
4. **Infrastructure** — Where would this be hosted? IT-managed server vs cloud vs local device?
5. **Interoperability** — Can it read ADT feeds or track board data for real-time census?
6. **Authentication** — Who can access it? Role-based access?
7. **Audit trail** — Are overrides and assignments logged persistently?

### From Chief of Service
1. **Clinical validity** — How were provider weights derived? (Answer: literature-informed defaults + built-in Delphi survey for department consensus)
2. **Does it actually improve outcomes?** — What metrics prove this is better than round-robin? (Answer: simulation mode benchmarks fairness scores, overwhelm events, capacity ratios side-by-side)
3. **Trauma exclusion** — Why is Team 4 excluded? Is that configurable? (Answer: yes, intentional — trauma patients are routed manually; configurable in constants)
4. **Acuity decay** — Who validated the decay timelines (e.g., critical patient weight drops from 5→3 at 60min)? Is this tunable?
5. **Edge cases** — What happens when all teams are overwhelmed? When a provider leaves mid-shift?
6. **Attending buy-in** — Will attendings feel micromanaged by an algorithm?

### From Nursing Operations Managers
1. **Workflow disruption** — How does this change what triage/charge nurses actually do minute-to-minute?
2. **Training burden** — How long to learn? (Answer: guided tour built in, demo mode for practice)
3. **Failure mode** — What if the iPad dies, WiFi drops, or the app crashes? (Answer: currently no offline persistence beyond the session)
4. **Back-dating** — Can a nurse enter a patient who arrived 20 minutes ago? (Answer: not currently — assignment is real-time only)
5. **Editability** — Can assignments be corrected after the fact? (Answer: patients can be reassigned, but no "undo" of a logged assignment)
6. **Speed under pressure** — Is the UI fast enough for a triage nurse during a surge? (Answer: 2-tap assignment flow, mobile-optimized)
7. **Paper backup** — What's the fallback? Can this coexist with the paper workflow during transition?
8. **Multi-user** — If charge nurse and triage nurse both have the app open, do they see the same state? (Answer: not yet — no real-time sync)

---

## List of Asks for Successful Implementation

### Analytics Asks (from Informatics/Data Team)
1. **Historical A-side census data** — by day of week, shift, hour, broken down by team assignment over the last 6-12 months. This calibrates the simulation parameters (arrival rate, acuity distribution) to match your actual volume.
2. **Provider composition by shift** — typical attending/resident/PA/intern mix per team per shift type (day/evening/night). Needed to validate default provider weights.
3. **Acuity distribution** — what % of A-side patients are ESI 1-2 (maps to Tier 1), ESI 3 (Tier 2), and lower-acuity A-side (Tier 3)? Validates the simulation's acuity sliders.
4. **Code/vent/pressor frequency** — how often per shift does a team get a critical event? Informs whether Tier 1 decay timelines are realistic.
5. **Override/reassignment frequency** — how often does the charge nurse currently deviate from round-robin? Establishes a baseline for measuring override rates with the new tool.
6. **Turnaround/dispo times by acuity** — validates the decay model (do critical patients really stabilize within 60-120 min?).

### Nursing Workflow Asks
7. **Shadow shift observation** — request 2-3 shifts where someone observes the charge nurse workflow in real time to identify pain points the tool should address and moments where the tool might slow things down.
8. **Charge nurse focus group** — 3-5 charge nurses to test the demo mode and give feedback on the assignment flow, override reasons, and whether the capacity terms (Ready/Stable/Manageable/Very Busy/High Demand/Overwhelmed) match their mental model.
9. **Define the paper fallback protocol** — agree on what happens when the tool is unavailable. The tool should complement, not replace, clinical judgment.
10. **Back-dating and correction requirements** — clarify whether nurses need to log patients retroactively (e.g., "this patient arrived 15 min ago but I'm just now entering them"). If yes, this is a feature to build.
11. **Multi-device sync priority** — confirm whether charge + triage need simultaneous access on separate devices. If yes, this moves real-time sync up the roadmap.

### Epic / Integration Asks
12. **AMION or ShiftAdmin API access** — auto-populate the shift setup screen with that day's provider assignments instead of manual entry. This is the single highest-impact integration for reducing setup friction.
13. **ADT feed feasibility** — could the tool receive real-time admit/discharge/transfer events to auto-track census? (May be out of scope for v1, but worth asking about)
14. **Epic read-only dashboard** — could assignment data display in an Epic tab for attending awareness without requiring them to use the tool directly?
15. **Clarify Epic governance** — what's the approval pathway if this were ever to touch Epic data? Understanding the timeline and requirements early prevents surprises.

### Institutional / Go-Live Asks
16. **Pilot scope agreement** — request approval for a 2-4 week pilot on a single shift type (e.g., day shift) with 2-3 trained charge nurses running the tool alongside the existing paper workflow.
17. **Success metrics definition** — agree upfront on what "success" looks like: fairness score improvement? Fewer overwhelm events? Charge nurse satisfaction? Reduced complaints about unfair assignments?
18. **Device provision** — will the department provide a dedicated iPad/tablet at triage, or is this BYOD? Needs to be decided before pilot.
19. **Champion identification** — ask each stakeholder to nominate 1-2 people from their group to be early adopters/feedback conduits.
20. **Delphi survey participation** — request that attendings and senior residents complete the built-in Delphi survey to calibrate provider weights to your department's consensus (not just defaults).

---

## Key Talking Points to Lead With

- **No PHI** — the tool never stores patient names, MRNs, or any identifiable data. Patients are anonymous numbered entries. This drastically simplifies compliance.
- **Complements, doesn't replace** — the charge nurse always has final say. The tool recommends; overrides are logged, not blocked.
- **Already benchmarkable** — the simulation mode lets you run your department's actual staffing patterns and arrival rates to see formula vs round-robin outcomes before going live.
- **Tunable** — every weight, decay rate, and buffer duration is configurable. The Delphi survey lets the department set provider weights by consensus.
- **Zero infrastructure needed for pilot** — it's a static web app that runs on any browser. No servers, no installs, no IT tickets for v1.
