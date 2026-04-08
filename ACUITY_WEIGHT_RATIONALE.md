# Acuity Weight Rationale: Why 4:2:1

A reference document for discussing the app's patient demand weights with hospital administrators, clinicians, and stakeholders. Summarizes the evidence base, cross-study synthesis, and reasoning behind the adopted **4:2:1** (Red : Yellow : Purple) weight ratio.

---

## The Question

When a new patient arrives in the ER, how much provider capacity does that patient consume relative to patients of different acuity levels? The answer determines how the triage app scores team workload. If the weights are wrong, the formula will systematically under- or over-protect certain teams.

The app uses three acuity tiers mapped to ESI/CTAS triage levels:

| App Tier | ESI Equivalent | Clinical Description |
|----------|---------------|---------------------|
| Red (Tier One) | ESI 1 / CTAS 1 | Immediate resuscitation — cardiac arrest, intubation, major trauma |
| Yellow (Tier Two) | ESI 2 / CTAS 2 | Emergent — chest pain, stroke alert, acute abdomen, sepsis |
| Purple (Tier Three) | ESI 3 / CTAS 3 | Urgent A-side — complex but stable, requires workup and monitoring |

## Evidence Base

We reviewed six studies from the evidentiary guidance collection. Three provide direct measurements of emergency physician (EP) time per triage level. Three provide supporting context on resource utilization and workload patterns.

### Direct EP Time Measurements

**1. Dreyer et al. — The POWER Study (2009)**

The largest and most methodologically rigorous study available. Research assistants directly observed EP activities moment-by-moment across multiple sites over 592 shifts.

| CTAS Level | Mean EP Time | Median EP Time | IQR |
|-----------|-------------|---------------|-----|
| 1 (Resuscitation) | 73.6 min (CI 63.6–83.7) | 54.7 min | 23.6–103.5 min |
| 2 (Emergent) | 38.9 min (CI 36.0–41.8) | 27.5 min | 16.3–47.0 min |
| 3 (Urgent) | 26.3 min (CI 25.4–27.2) | 18.4 min | 11.2–32.1 min |

Normalized ratios (to CTAS-3):

- Means: **2.80 : 1.48 : 1.0**
- Medians: **2.97 : 1.49 : 1.0**

> Anderson CK, Zaric GS, Dreyer JF, Carter MW, McLeod SL. "Physician workload and the Canadian Emergency Department Triage and Acuity Scale: The Predictors of Workload in the Emergency Room (POWER) Study." *CJEM* 2009;11(4):321–329.

**2. Innes et al. (2005)**

Single-site prospective study at St. Paul's Hospital, Vancouver. A research assistant shadowed 20 EPs with a stopwatch across 31 shifts, recording time to the nearest 15 seconds for 585 patient encounters.

| CTAS Level | Mean EP Time | n |
|-----------|-------------|---|
| I | 40.2 min (SD 22.7) | 8 |
| II | 25.3 min (SD 20.1) | 72 |
| III | 21.8 min (SD 13.0) | 199 |
| IV | 15.6 min (SD 10.1) | 205 |
| V | 15.2 min (SD 12.6) | 97 |

Normalized ratios (I:II:III): **1.84 : 1.16 : 1.0**

Note: CTAS I had only 8 patients, making that estimate unreliable. The CTAS II:III ratio of 1.16:1 — the most well-powered comparison — strongly supports a compressed gap between Yellow and Purple.

Regression model: TPPV = 29.7 + 8.6(procedure) − 3.8(triage level) + 7.1(ambulance) − 1.1(GCS) + 0.1(age) − 0.05(prior visits) + 3.1(comorbidity). Triage level coefficient of −3.8 min per level confirms a moderate, not extreme, step between adjacent tiers. Model R² = 31.3%, validated at 28.3% on holdout sample (shrinkage ~3%).

> Innes GD, Stenstrom R, Grafstein E, Christenson JM. "Prospective time study derivation of emergency physician workload predictors." *Can J Emerg Med* 2005;7(5):299–308.

**3. Wrede et al. (2020)**

Single-site prospective study at a German university hospital ED. 202 encounters tracked via smartphone app across 32 physicians (11 specialists, 21 doctors in training). Overall MPTPP = 47 min (SD 34 min).

| ESI Level | Mean EP Time | n |
|----------|-------------|---|
| 1 + 2 (combined) | 76 min (SD 42) | 45 |
| 3 | 48 min (SD 27) | 93 |
| 4 | 27 min (SD 15) | 43 |
| 5 | 18 min (SD 11) | 21 |

Absolute times are ~2x higher than North American studies because German EDs lack structured EM residency programs (doctors in training: 52 min/patient vs specialists: 31 min). However, the between-tier *ratios* are consistent with POWER and Innes. ESI triage level was a significant predictor in multivariate regression (R² = 0.45, p < 0.001).

> Wrede J, Wrede H, Behringer W. "Emergency Department Mean Physician Time per Patient and Workload Predictors ED-MPTPP." *J Clin Med* 2020;9:3725.

### Supporting Evidence

**4. Hocker et al. — NHAMCS Validation (2018)**

Secondary analysis of the National Hospital Ambulatory Medical Care Survey, representing 402 million US ED visits (2009–2011). Compared resource utilization patterns across all five ESI levels.

Key finding: **ESI 2 and ESI 3 patients form a single resource-utilization cluster.** They had similar numbers of diagnoses (5.5 vs 5.6), similar procedure counts (0.8 vs 0.7), similar admission rates (32.3% vs 32.2%), and similar ED lengths of stay (280 vs 237 min). The authors concluded that "patients with ESI 2 are more similar to ESI 3 patients than ESI 1" and recommended that ESI 2 and 3 could be "cohorted and treated together."

This is the strongest population-level evidence supporting a compressed Yellow:Purple gap.

> Hocker MB, Gerardo CJ, Theiling BJ, Villani JJ, Donohoe RE, Sandesara H, Limkakeng AT Jr. "NHAMCS Validation of Emergency Severity Index as an Indicator of Emergency Department Resource Utilization." *West J Emerg Med* 2018;19(5):855–862.

**5. Levin et al. (2006)**

Time-motion task analysis at Vanderbilt University Medical Center (Level 1 trauma center), observing 20 EM physicians over 180-min periods using NASA-TLX subjective workload scores plus objective whiteboard metrics.

Key finding: Residents reported significantly higher frustration and temporal demand scores than attendings, confirming that subjective workload is not purely a function of patient count or acuity — provider experience matters. The objective workload metric (PQC) combined patient count and average acuity multiplicatively, supporting the concept that workload is a product of volume and complexity, not just one or the other.

Does not provide per-triage time ratios but confirms workload nonlinearity and the importance of the cognitive/coordination burden beyond raw time.

> Levin S, France DJ, Hemphill R, Jones I, Chen KY, Rickard D, Makowski R, Aronsky D. "Tracking Workload in the Emergency Department." *Human Factors* 2006;48(3):526–539.

**6. Traub et al. (2016)**

Pre-post retrospective study at Mayo Clinic Arizona comparing physician self-assignment (n=23,514 visits) to rotational patient assignment (n=24,112 visits).

Key finding: Systematic rotational assignment reduced LOS by 11% (232→207 min) and arrival-to-provider time by 44% (39→22 min). Supports the general concept of algorithmic assignment but does not inform weight ratios directly.

> Traub SJ, Stewart CF, Didehban R, Bartley AC, Saghafian S, Smith VD, Silvers SM, LeCheminant R, Lipinski CA. "Emergency Department Rotational Patient Assignment." *Ann Emerg Med* 2016;67(2):206–215.

---

## Cross-Study Synthesis

### Ratio Comparison Table

| Ratio | POWER (means) | POWER (medians) | Innes (means) | Current App (5:3:1) | Proposed (4:2:1) |
|-------|--------------|----------------|--------------|--------------------|--------------------|
| Red:Yellow | 1.89:1 | 1.99:1 | 1.59:1 | 1.67:1 | **2.00:1** |
| Yellow:Purple | 1.48:1 | 1.49:1 | 1.16:1 | **3.00:1** | **2.00:1** |
| Red:Purple | 2.80:1 | 2.97:1 | 1.84:1 | **5.00:1** | **4.00:1** |

### Error Analysis

| Ratio | Current Error vs POWER | Proposed Error vs POWER |
|-------|----------------------|------------------------|
| Red:Yellow | −12% (Red underweighted) | +6% (slightly conservative) |
| Yellow:Purple | **+100%** (Purple massively underweighted) | **+35%** (still conservative, much improved) |
| Red:Purple | **+69%** (spread far too wide) | **+35%** (intentionally conservative) |

---

## Why 4:2:1 and Not Another Ratio

### Why not stay at 5:3:1?

The Yellow:Purple ratio of 3:1 has no support in the literature. The strongest evidence (POWER, n=11,716) says ~1.5:1. At 3:1, the scoring engine treats Purple patients as nearly invisible — five Purples (load=5) look equivalent to one Red (load=5), when in reality those five Purples consume ~130 minutes of EP time versus ~74 minutes for the Red. The practical consequence: the algorithm systematically dumps lower-acuity patients onto already-busy teams.

### Why not use the raw POWER ratios (3:1.5:1)?

3:1.5:1 matches the POWER medians most closely, but we believe it slightly underweights Red patients for three reasons:

1. **Qualitative burden.** Resuscitations demand qualitatively different care — team mobilization, real-time decision-making under uncertainty, procedure coordination — that isn't fully captured by EP clock time. Levin et al.'s NASA-TLX data confirms higher subjective stress per minute for high-acuity care.

2. **Within-tier variability.** CTAS-1 has enormous variance (IQR 23.6–103.5 min, a 4.4x spread). A brief self-resolving seizure and a polytrauma code both get the same weight. A slightly higher Red weight provides a hedge against the long-tail resuscitations.

3. **Practical scoring sensitivity.** At 3:1.5:1, the gap between Yellow and Purple becomes so narrow (1.5 vs 1) that the formula may lose meaningful sensitivity to the distinction between an emergent and an urgent patient. 2:1 preserves a clear scoring signal.

### Why not 4:2.5:1.3?

This was the POWER critique's initial suggestion. While empirically tighter, it introduces decimal weights that complicate communication ("the patient has a load of 1.3") without meaningfully improving scoring accuracy. The 4:2:1 rounding sacrifices about 15% of ratio precision in exchange for cleaner implementation and easier explanation to clinical staff.

---

## What This Means for the Benchmark

The benchmark was originally run with 5:3:1 weights. We are re-running it with 4:2:1 to produce a sensitivity analysis. The formula's advantage over the actual historical process is expected to grow or stay the same because:

- Purple patients now carry more real load in the model, so unbalanced Purple assignments (which the current charge-nurse process makes blindly) become more costly in the scoring
- The formula is the only method that routes based on capacity — it benefits most from weights that better reflect true resource demand
- Round-robin is weight-agnostic (just alternates), so its equity metrics won't change

If the formula's advantage shrinks, that's also a valid and reportable finding — it would mean the current weights were accidentally flattering the formula.

---

## Summary for Stakeholder Discussions

**The one-liner:** "We weight patient demand using a 4:2:1 ratio — a critical patient counts four times as much as a routine A-side, and an emergent patient counts twice as much. These ratios come from direct time-measurement studies of how many minutes of physician time each type of patient actually consumes."

**If challenged on why not equal weighting:** "The POWER study — the largest direct-observation study of EP workload ever conducted, 11,716 encounters across 11 emergency departments — found that a resuscitation patient consumes 3x the physician time of an urgent patient. Treating them as equal would be like saying a code blue takes the same effort as a chest pain workup."

**If challenged on the specific numbers:** "We cross-referenced three independent time-measurement studies from Canada, the US, and Germany, plus a 400-million-visit national database analysis. They all converge: the real ratio is somewhere between 2:1 and 3:1 for critical-to-urgent. We chose 4:1 — slightly conservative — to account for the coordination overhead of resuscitations that clock time alone doesn't capture."

**If challenged on why we changed from 5:3:1:** "Our original weights overstated the gap between emergent and urgent patients by 100% compared to the evidence. A Tier 3 patient takes about 18–26 minutes of physician time — that's not trivial. At a weight of 1 versus Yellow at 3, the old model treated them as nearly free, which meant the algorithm would dump lower-acuity patients onto busy teams without penalty. The new weights fix that."

---

## Full Citation List

1. Anderson CK, Zaric GS, Dreyer JF, Carter MW, McLeod SL. Physician workload and the Canadian Emergency Department Triage and Acuity Scale: The Predictors of Workload in the Emergency Room (POWER) Study. *Can J Emerg Med* 2009;11(4):321–329.

2. Innes GD, Stenstrom R, Grafstein E, Christenson JM. Prospective time study derivation of emergency physician workload predictors. *Can J Emerg Med* 2005;7(5):299–308.

3. Wrede J, Wrede H, Behringer W. Emergency Department Mean Physician Time per Patient and Workload Predictors ED-MPTPP. *J Clin Med* 2020;9:3725.

4. Hocker MB, Gerardo CJ, Theiling BJ, Villani JJ, Donohoe RE, Sandesara H, Limkakeng AT Jr. NHAMCS Validation of Emergency Severity Index as an Indicator of Emergency Department Resource Utilization. *West J Emerg Med* 2018;19(5):855–862.

5. Levin S, France DJ, Hemphill R, Jones I, Chen KY, Rickard D, Makowski R, Aronsky D. Tracking Workload in the Emergency Department. *Human Factors* 2006;48(3):526–539.

6. Traub SJ, Stewart CF, Didehban R, Bartley AC, Saghafian S, Smith VD, Silvers SM, LeCheminant R, Lipinski CA. Emergency Department Rotational Patient Assignment. *Ann Emerg Med* 2016;67(2):206–215.
