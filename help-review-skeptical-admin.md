# Help Section Review: Skeptical Junior Admin MD Perspective

"We've been doing round-robin for years and it works fine. Why are we spending money/time on this?"

## Is this persuasive enough?

**No.** The help section assumes buy-in and jumps to mechanism. A skeptic needs to be convinced first, and the current content doesn't make the case.

## Problems identified

1. **Title "How It Works" assumes buy-in.** A skeptic needs "Why This Exists" before "How It Works." The section leads with mechanism, not motivation.

2. **The round-robin critique is abstract, not visceral.** Three bullet points about theoretical shortcomings. No concrete scenario. No "remember when Team 2 got three codes in a row while Team 1 sat idle?" A skeptic dismisses abstract arguments — they need to *feel* the problem.

3. **The formula looks like overkill.** Weighted providers, decay curves, buffer stacking, sigma notation — this reads like an overengineered solution to a problem that "clinical judgment already handles." The help section doesn't justify why the complexity is needed.

4. **The benchmark comparison is buried at the very bottom.** "See how formula compares to round-robin →" is the ONLY thing that might convince a skeptic, and it's the last item on the page. A skeptic won't scroll that far. Lead with evidence, not mechanism.

5. **Provider weights have no justification.** Attending = 17.5, Senior = 15.0, PA = 10.0 — who decided this? A skeptic will immediately poke at these: "My PAs are better than your juniors." Without any calibration note, the numbers undermine credibility.

6. **Buffer durations feel arbitrary.** Red = 35 min, Yellow = 25 min, Purple = 15 min — based on what data? No explanation provided. A skeptic sees made-up numbers.

7. **No outcomes evidence.** Zero mention of results — simulated or real. Even "in simulation, formula-based assignment reduced max team overload by 40% vs round-robin" would help enormously.

8. **Doesn't address transition cost.** Everyone knows round-robin. This requires learning new concepts (buffers, decay, capacity scores). The help section never says: "You assign patients the same way — the app just suggests a smarter order."

9. **"Every recommendation can be overridden" is good but needs stronger framing.** A skeptic needs to hear: "This is a suggestion, not a mandate. Your judgment comes first. The system learns from overrides."

10. **The tool doesn't address the political question.** "Who's accountable when the algorithm sends a bad recommendation?" This isn't in the help section and it should be — even a brief note about override logging and human final authority.

## What would actually persuade this person

1. **Lead with a concrete scenario** — not bullets about theoretical problems, but a recognizable shift gone wrong under round-robin
2. **Show the benchmark early** — put the comparison link (or a summary stat) in the intro, not the footer
3. **Minimize perceived complexity** — "You assign patients the same way. The app just recommends a smarter order based on who has bandwidth."
4. **Acknowledge the transition** — "No new workflow. Same assign flow, better suggestions."
5. **Brief calibration note on weights** — "Weights based on departmental consensus and iterative simulation testing"
6. **Any outcomes data** — even simulated
