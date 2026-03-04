## ER Triage Tool Summary — For Literature Search

**What it is:** A formula-driven ED patient assignment tool (React PWA) that replaces round-robin team assignment with capacity-weighted scoring. Designed for use in a multi-team emergency department.

**Core formula:** `Capacity Ratio = Team Capacity / Patient Load` — the team with the highest ratio gets the next patient.

### Team Capacity
- Each provider type has a **supervisory capacity weight**: Attending (17.5), Senior Resident PGY3-4 (15.0), PA (10.0), Junior Resident PGY-2 (7.5), Intern PGY-1 (5.0), Rotator (1.0)
- Weights are multiplied by **status**: Active (1.0), Taking Signout (0.5), In Procedure (0.25), Off Floor (0.0)

### Patient Load (Acuity-Weighted Demand with Time Decay)
- **Tier 1 / Red (Critical Action):** Cardiac arrest, unstable arrhythmia, anaphylaxis, intubation needed — weight 5, decays to 3 at 60 min, 1 at 120 min, 0 at 240 min
- **Tier 2 / Yellow (Emergent):** Sepsis, AMS, stable GIB, EtOH withdrawal — weight 3, decays to 1 at 90 min, 0 at 240 min
- **Tier 3 / Purple (Soft A-Side):** Sedated EDP on monitoring, stable overdose — weight 1, decays to 0 at 120 min

Decay is a **step function** mirroring clinical stabilization trajectory, not gradual.

### Fairness Mechanisms
- **Buffer system:** After assignment, teams get temporary immunity (35 min for Tier 1, 25 for Tier 2, 15 for Tier 3). Buffers stack additively to prevent back-to-back critical patients.
- **All-buffered fallback:** When every team is buffered, algorithm switches from highest-capacity to least-recent-assignment to force fair rotation.
- **Tiebreakers:** Equal capacity ratio → least recent assignment → lowest team ID.

### Key Design Choices
1. **Supervisory capacity model** — weights reflect independent patient management ability, not headcount
2. **Time-decaying demand** — acknowledges that a code patient's marginal supervisory burden drops as they stabilize
3. **Additive buffer stacking** — prevents sequential high-acuity dumps on one team
4. **Dynamic tiebreaker switching** — changes sorting logic when all teams are simultaneously loaded
5. **Clinical override always available** — algorithm recommends, clinician decides
6. **Trauma team (Team 4) excluded from auto-assignment** — manual only

### Simulation Results
Built-in Monte Carlo simulator comparing formula vs. round-robin across 1,000 simulated shifts. Measures 5 fairness dimensions: capacity balance, acuity balance, overwhelm avoidance (assignments when ratio < 2.0), minimum ratio maintenance, and stress equity. Formula outperformed round-robin ~75% of the time.

### Comparable Research Areas to Search
- Acuity-based ED patient assignment / workload balancing
- Alternatives to round-robin triage in emergency departments
- Capacity-weighted team assignment in EDs
- Dynamic workload distribution in emergency medicine
- Provider workload scoring systems in EDs
- Nurse-to-patient ratio optimization by acuity
- Queuing theory applications in emergency department flow
- ED throughput and load balancing algorithms
- ESI (Emergency Severity Index) extensions for team assignment
- Simulation-based ED staffing and assignment optimization
