# NIRNAY — Shutdown Window Decision Engine
### Product Requirements Document v2.0

| | |
|---|---|
| **Client (case)** | Tata Motors Passenger Vehicles — Pune plant, Body Shop, Line 2 |
| **Course deliverable** | DTAI Capstone, vibe coded application (40% of grade) |
| **Strategy linkage** | AI Use Case #1 · Priority Initiatives quadrant · Roadmap Phase 1 |
| **Supersedes** | v1.0 (*Sanket*, asset-risk dashboard) |
| **Owner** | Application Lead, build shared across all six |

**Why the rename.** v1 predicted which asset would fail. That is the instruction sheet's own worked example for manufacturing, and it is the app every manufacturing team will bring. v2 answers a different question: given a six-hour shutdown window and three crews, which jobs go in? *Nirnay* means decision. The prediction is an input now, not the product.

---

## 1. What changed from v1, and why

| v1 | v2 | Reason |
|---|---|---|
| Ranks assets by failure probability | Ranks assets by **expected production loss** | Failure probability alone is the wrong ranking. An asset behind a 40-minute buffer and an asset feeding a starved station are not the same problem |
| "Logistic model trained on synthetic data" | Transparent weighted index, weights published on screen | A model fitted to data you generated only rediscovers your own generator. Saying so is stronger than hiding it |
| LLM writes an action card | LLM **allocates the shutdown window** under constraints and classifies technician notes | AI now drives the core output instead of narrating it |
| 40 assets, 4 shops, 4 screens | 14 assets, 1 shop, 2 screens + 1 drawer | Narrow beats broad, and the deadline is today |
| Value model with one big assumption | Loss model derived per asset from MTTR and buffer coverage | Survives a CFO who asks where the number comes from |

---

## 2. The one-sentence use case

> This application predicts expected production-loss exposure for each body shop asset and allocates the next shutdown window across competing jobs, so the maintenance planner can protect the most output with the crew-hours actually available.

---

## 3. Problem

Every plant already knows some assets are degrading. The constraint is not knowledge, it is the window.

A body shop shutdown is six hours on a Sunday with three crews. That is eighteen crew-hours against twelve to fifteen candidate jobs that would consume forty. The planner picks by seniority of the complaint, by which technician shouted loudest, and by which spare happens to be on the shelf. Nobody computes what each job protects.

Two failures with the same probability:

- Weld gun WG-07, 45-minute MTTR, sits behind a 40-minute downstream buffer. If it fails, the line barely notices.
- Robot RB-03, 180-minute MTTR, feeds a station with 25 minutes of buffer. If it fails, the line loses two and a half hours and paint starves behind it.

Ranked by failure risk, WG-07 goes first. Ranked by what it protects, it should not be in the window at all. That inversion is the whole product.

The second problem is that the reasoning evaporates. A technician fixes RB-03, writes "gearbox noise, replaced bearing" in the CMMS, and that note never becomes data. The three people who can hear a gun going bad are retiring, and their judgment is leaving with them.

---

## 4. Users

| User | Decision they own | What Nirnay gives them |
|---|---|---|
| **Maintenance Planner** (primary) | What enters Sunday's window | A costed, constrained job set with the rejections explained |
| **Shift Supervisor** | What to check this shift | Ranked exposure list, plain language |
| **Manufacturing Head** | Whether to fund more window time | Avoided loss to date, and loss carried forward on deferred jobs |
| **Board demo (CDO seat)** | — | Two screens, one counterintuitive ranking, one constrained allocation |

---

## 5. Scope

**In (v2 build)**

1. Exposure board — 14 body shop assets ranked by expected production loss, with a risk drawer for explainability
2. Window Planner — set the window, get an allocated job set with accept/override, and see what was deferred and why
3. Feedback loop — technician note in free text, classified into a failure-mode taxonomy, precision tracked

**Out — say it before the Board asks**

- Not a CMMS. Recommends into SAP PM, does not replace it
- No auto-executed work orders. Planner approves everything
- No live PLC or historian connection. Synthetic telemetry, real decision logic
- One shop, one line. Scaling is a Phase 2 question and the answer is "the model is per-asset-class, the constraints are per-line"
- Not quality inspection, not supplier risk

---

## 6. The decision model

### 6.1 Risk index — stated plainly, not dressed up as ML

Weighted feature index, weights set by reliability-engineering judgment and shown on screen.

| Feature | Weight | Why |
|---|---|---|
| Vibration RMS slope, 7-day, normalised | 0.28 | Leading indicator for bearing and gearbox wear |
| Motor current drift vs asset's own baseline | 0.20 | Mechanical binding, load anomaly |
| Cycles since service ÷ rated interval | 0.18 | Wear proxy where sensing is thin |
| Fault code rate 72h vs 30-day median | 0.14 | Nuisance codes cluster ahead of hard failures |
| Temperature rise vs baseline | 0.10 | Lubrication loss |
| Running hours ÷ MTBF | 0.06 | Age |
| Failures in last 90 days | 0.04 | Repeat offenders stay offenders |

**Say this in the demo, in these words:** we did not train a model on synthetic data, because a model fitted to data we generated would only rediscover our own generator. The weights are engineering judgment, published on screen, and every one of them is falsifiable against real history. The production version trains on 18–24 months of historian and work order data, and the first thing it will do is move these weights.

That answer beats a fabricated accuracy figure at every seat on the panel.

### 6.2 Exposure model — the differentiator

```
buffer_shortfall  = max(0, MTTR_minutes − downstream_buffer_minutes)
expected_stop_min = risk_index × buffer_shortfall
₹ exposure        = (expected_stop_min ÷ 60) × cost_per_downtime_hour
```

Worked, with the demo's two assets:

| Asset | Risk | MTTR | Buffer | Shortfall | Expected stop | Exposure @ ₹1.2L/h |
|---|---|---|---|---|---|---|
| WG-07 weld gun | 0.81 | 45 min | 40 min | 5 min | 4.1 min | ₹8,200 |
| RB-03 robot axis | 0.58 | 180 min | 25 min | 155 min | 89.9 min | ₹1,79,800 |

The lower-risk asset carries twenty-two times the exposure. Lead the demo with this table.

### 6.3 Window allocation — where the AI earns its 25%

Constraints the planner actually faces:

- Window duration and crew count → total crew-hours
- Job duration and crew requirement per job
- Spare availability, including parts in transit with an ETA
- Isolation batching — jobs sharing a lockout point are cheaper together
- Crew skill mix — robot programming is not weld maintenance

**Two-stage, and the split matters for the AI Understanding mark:**

A greedy knapsack on exposure-per-crew-hour computes a baseline in TypeScript. That part is optimisation, not AI, and calling it AI would be the kind of overclaim §3.2 warns against.

Claude then adjusts the baseline for the soft constraints a solver cannot encode — a spare landing Tuesday, two jobs that share an isolation, a crew that has done this gearbox before — and explains the trade-off in language a planner will act on. It must return the deferred jobs with reasons and the exposure carried forward.

**Output contract (strict JSON):**
```json
{
  "selected": [{"job_id":"", "asset":"", "crew_hours":0, "exposure_protected":0, "rationale":""}],
  "deferred": [{"job_id":"", "asset":"", "reason":"", "exposure_carried":0}],
  "batched": [{"jobs":[""], "shared_isolation":"", "hours_saved":0}],
  "window_utilisation_pct": 0,
  "total_exposure_protected": 0,
  "planner_warning": "",
  "confidence": "high | medium | low"
}
```

System prompt: JSON only, no preamble, no fences. Strip fences before parsing anyway. If parsing fails, render the knapsack baseline with a visible "optimiser only, advisory unavailable" badge. Never a blank screen.

### 6.4 Failure-mode classification — the second AI task

Technician types a free-text note after the job. Claude extracts:

```json
{
  "failure_mode": "one of a fixed 12-item taxonomy",
  "root_cause": "",
  "prediction_was_correct": true,
  "unlogged_symptom": ""
}
```

This is the tribal-knowledge capture, and it is what makes the app improve rather than just run. It also feeds the precision counter honestly — a flagged asset the technician found healthy is logged as a false positive, on screen, in front of the Board.

### 6.5 Cost of being wrong

| | Consequence | Design response |
|---|---|---|
| False positive | Crew-hours spent on a healthy asset, one job displaced from the window | Displaced job's carried exposure is shown, so the cost is visible not hidden |
| False negative | Unplanned stop, downstream starvation | Threshold tuned toward recall; exposure ranking surfaces high-MTTR assets even at moderate risk |

Asymmetric by design. Say it as a design choice when the CFO asks about accuracy.

---

## 7. Screens

**Screen 1 — Exposure Board.** 14 assets ranked by ₹ exposure, not by risk. A toggle switches the sort to failure probability and the order visibly scrambles — that toggle is the demo. Each row: asset, risk band, MTTR, buffer, exposure. Clicking opens a drawer with the seven feature contributions and the sensor trend, so explainability exists without costing a route.

**Screen 2 — Window Planner.** Planner sets window hours and crew count. Twelve candidate jobs load with duration, crew need, spare status. **Allocate** returns the selected set, the deferred set with reasons, batching suggestions, utilisation, and total exposure protected. Planner can override any line with a reason, and the override is logged.

**Feedback panel** sits under Screen 2. Pick a completed job, type what was actually found, get the classified failure mode and the precision counter updating live.

Two routes. One drawer. That is the whole build.

---

## 8. Data

**Prototype.** 14 assets, 30 days hourly telemetry, fixed random seed so the board renders identically every load. Six assets carry degradation ramps starting between day 12 and day 22. Buffer minutes and MTTR are per-asset fields drawn from the line layout — these two fields do the differentiating work, so set them deliberately, not randomly.

| Table | Fields |
|---|---|
| `assets` | id, name, station, asset_type, criticality, mttr_minutes, downstream_buffer_minutes, mtbf_hours, last_service, rated_interval |
| `telemetry` | asset_id, ts, vibration_rms, motor_current, temp_c, cycle_count, fault_code_count |
| `jobs` | id, asset_id, description, est_hours, crew_required, skill, spare_status, isolation_point |
| `decisions` | ts, window_id, selected[], deferred[], planner_overrides[], reason |
| `feedback` | job_id, technician_note, classified_mode, prediction_correct |

**What production needs that this does not have** — this is the Board's Data Readiness row, put it on a slide:

- OPC-UA or MQTT feed from the SCADA historian
- 18–24 months of SAP PM work orders and failure history, to replace the judgment weights with fitted ones
- MES downtime reason codes, to link asset events to actual line stoppages
- Live spares inventory and PO status
- **Buffer and MTTR master data per station** — most plants do not maintain this cleanly, and without it the exposure model degrades to a risk ranking. Flag this as the real data dependency, because it is

---

## 9. KPIs

| Layer | Metric | Direction |
|---|---|---|
| **Business** | Unplanned downtime minutes per line per month | ↓ |
| Business | Exposure protected per shutdown window (₹) | ↑ |
| Business | Planned maintenance ratio | ↑ |
| Business | Window utilisation | ↑ toward 85–90%, not 100% |
| Business | Emergency spares spend | ↓ |
| **Model** | Precision on flagged assets, from technician feedback | ↑ |
| Model | Advance warning lead time | ↑ |
| Model | Planner override rate | ↓ over time — the adoption signal |
| **Adoption** | Windows planned in Nirnay vs by hand | ↑ |

Screens 1 and 2 display exposure protected, precision and override rate live.

### Value model

Every figure below is a placeholder. Replace or label before the deck goes in — §10 of the instruction sheet requires it.

| Variable | Illustrative | Source |
|---|---|---|
| Body shop shutdown windows per year | 48 | Weekly, team assumption |
| Crew-hours per window | 18 | 6h × 3 crews |
| Exposure protected per window, current manual planning | ₹2.4 lakh | **Estimate — validate** |
| Exposure protected under allocation | ₹3.6 lakh | Modelled, 50% uplift from better selection |
| Uplift per window | ₹1.2 lakh | Derived |
| **Annual, one line** | **₹57.6 lakh** | Derived |

The CFO's attack is the 50% uplift and they are right to make it. Two defences, use both. First, the uplift comes from reordering the same crew-hours, not from adding any — there is no capex in the number. Second, offer to floor it at 20%, which still lands at ₹23 lakh a year per line for an application that costs an API bill to run. A case that survives being halved is worth more than a case that needs its assumptions.

Do not value downtime at full contribution margin per vehicle. Most lost units get recovered on overtime, and a team that volunteers that distinction gains more credibility than the inflated figure buys.

---

## 10. Governance and risk

Ranked by likelihood × impact, per §5.

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | Buffer/MTTR master data is wrong or missing in production | H | H | Phase 1 workstream is a 4-week data cleanse before rollout; app shows a data-quality flag per asset |
| 2 | Planner overrides everything and the app becomes shelfware | M | H | Override reason is mandatory and reviewed monthly; override rate is a tracked KPI, not a hidden one |
| 3 | LLM invents a part number or a constraint | M | M | Parts validated against master; unmatched render as unverified. Deferral reasons must cite a constraint present in the input |
| 4 | Judgment weights never get replaced with fitted ones | M | M | Retraining gate written into the Phase 2 exit criteria |
| 5 | Model drift after line rebalancing changes buffers | M | M | Buffer changes trigger revalidation; monthly precision review |
| 6 | Read as technician surveillance | L | H | Asset-level scoring only. No technician-level metric exists in the schema, by design |
| 7 | API key exposure | L | H | Server-side route handler. Never `NEXT_PUBLIC_` |

**Governance canvas, short form.** Decision rights stay with the Maintenance Planner. Risk tier medium. Human-in-the-loop mandatory at allocation and at work order release. Audit trail is the `decisions` table with override reasons. Escalation to Manufacturing Head when deferred exposure crosses a threshold two windows running.

---

## 11. Framework hooks for the deck

**AI Opportunity Matrix.** Nirnay sits top-right. Four candidates were assessed:

| Use case | Business value | Feasibility | Verdict |
|---|---|---|---|
| **Shutdown window allocation** | High — protects output with existing crew-hours | High — data mostly exists, no capex | **Priority Initiative** |
| Visual weld defect detection | High | Low — needs vision hardware, labelled defect sets, line-side compute | Phase 3 |
| Supplier shortage prediction | Medium | Medium — depends on tier-2 visibility nobody has | Phase 2 |
| Paint shop energy optimisation | Medium | High | Quick win, not Phase 1 |

Say why it won: highest value at the lowest data and capex burden, and it moves a KPI the plant head is already measured on.

**Enterprise AI Canvas.** Nirnay is the named entry in the Use Cases box. Prediction = production-loss exposure. Judgment = window allocation under constraint. Action = the approved job set. Feedback = classified technician notes. Value = exposure protected per window.

**Roadmap.** Phase 1, months 0–6, one body shop line. Phase 2 scales across shops once buffer/MTTR master data is clean. Phase 3 is vision-based quality.

**Business Value Framework.** Value is created by reallocation of a fixed resource, not by adding capacity. That is the cleanest kind of business case and it should be stated in exactly those terms.

---

## 12. Mapping to the §6.2 scorecard

| Dimension | Weight | How this build earns it |
|---|---|---|
| Problem–Solution Fit | 25% | The exposure inversion is a real planner problem, and the app solves the allocation, not just the detection |
| AI Capability Integration | 25% | Two working AI tasks driving core output — constrained allocation with reasoning, and free-text classification. Optimisation is labelled optimisation, not AI |
| Functionality & UX | 20% | Two routes, board-facing language, cached fallback so nothing renders blank |
| Live Deployment | 15% | Vercel, tested on a second device and on mobile data, rollback path rehearsed |
| Business Impact Articulation | 15% | Exposure protected per window in rupees, with the assumption stack visible and a floor case ready |

---

## 13. Architecture

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router + TypeScript |
| UI | Tailwind, Recharts in the drawer only |
| Scoring & knapsack | TypeScript, `/lib` |
| Generative | Claude API via `/app/api/allocate` and `/app/api/classify` |
| Data | Seeded JSON in `/data`, in-memory decision log |
| Hosting | Vercel |

```
/app
  page.tsx                     → Exposure Board
  window/page.tsx              → Window Planner + feedback panel
  api/allocate/route.ts        → constrained allocation
  api/classify/route.ts        → technician note classification
/lib
  scoring.ts   exposure.ts   knapsack.ts   seed.ts
/data
  assets.json  telemetry.json  jobs.json  cached-allocation.json
```

`cached-allocation.json` is the demo insurance. If the API is unreachable the screen renders the cached plan with a visible badge.

---

## 14. Build order — deadline is today

Each step ends in something that runs. Stop at any point and you still have a demo.

1. Seed data, with buffer and MTTR set deliberately so the inversion is stark
2. `scoring.ts` + `exposure.ts`, verified against the WG-07 / RB-03 numbers in §6.2
3. Screen 1 with the sort toggle. **This alone demos.**
4. Knapsack baseline
5. `/api/allocate` + Screen 2. Test on five different window configurations
6. Cache a good allocation to `cached-allocation.json`
7. Deploy. Test on a phone, on mobile data, on someone else's laptop
8. Record the backup video
9. `/api/classify` + feedback panel — the first thing to cut if the clock beats you

Steps 1–3 and 7–8 are non-negotiable. Step 9 is the honest sacrifice.

---

## 15. Deployment

**Environment**

| Key | Where | Note |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.local` local, Vercel dashboard production | Server-side only. No `NEXT_PUBLIC_` prefix |

`.env.local` into `.gitignore` before the first commit. A key in git history stays a disclosure problem after you delete the file.

**Local**
```bash
npm install
cp .env.example .env.local
npm run dev
npm run build          # run this before pushing — Vercel fails on type errors dev tolerates
```

**GitHub**
```bash
git init && git add . && git commit -m "Nirnay v2"
git branch -M main
git remote add origin https://github.com/<user>/nirnay.git
git push -u origin main
```
Repo link is a submission item. Public, or private with instructor access granted.

**Vercel**
1. Sign in with the GitHub account holding the repo
2. **Add New → Project**, import it
3. Next.js preset auto-detects. Leave build settings alone
4. **Environment Variables** → add `ANTHROPIC_API_KEY`, tick **Production**, **Preview** and **Development**. Missing the Production tick is the most common cause of "works local, 500 live"
5. **Deploy**. Two to three minutes
6. Settings → Domains, rename to something sayable in a boardroom

Rollback: **Deployments → previous build → Promote to Production**. Seconds, and worth rehearsing once.

**Pre-demo checklist**
- [ ] Public URL on a phone, on mobile data, not campus wifi
- [ ] Fresh incognito window on a different laptop
- [ ] Allocate five times across different window sizes — watch for JSON parse failures
- [ ] Sort toggle produces a visibly different order on load
- [ ] Cached fallback verified by killing the key locally
- [ ] Backup video recorded, downloaded, plays offline
- [ ] URL open in a tab before the slot starts

**Expected failures**

| Symptom | Cause |
|---|---|
| Local fine, 500 in production | Env var not scoped to Production |
| Allocation empty | Claude wrapped JSON in fences — strip before parsing |
| Route times out | Cold start plus long generation. Cap `max_tokens`, tighten the prompt |
| Drawer charts blank on mobile | Recharts needs explicit container height |

---

## 16. Demo script — 3 minutes, opens at slide 8

| Time | Action | Say |
|---|---|---|
| 0:00 | Screen 1, sorted by risk | "Ranked by failure probability. WG-07 is our riskiest asset." |
| 0:20 | Hit the sort toggle | "Now ranked by what it protects. WG-07 drops to eleventh. It sits behind a forty-minute buffer — if it fails, the line barely notices. RB-03, lower risk, carries twenty-two times the exposure." |
| 0:50 | Open the drawer | "Seven weighted factors, all visible. We did not train a model on synthetic data — a model fitted to data we generated would only rediscover our own generator. These weights are engineering judgment, and the production version replaces them with eighteen months of your own failure history." |
| 1:20 | Screen 2, set 6 hours / 3 crews | "Eighteen crew-hours. Twelve candidate jobs worth forty." |
| 1:40 | Allocate | "Seven jobs selected, ₹3.4 lakh of exposure protected, 91% utilisation. Two batched on a shared isolation. And here is what it refused — with the exposure it is carrying into next week." |
| 2:20 | Override one line | "The planner overrules it. The reason is logged. Override rate is on our KPI list, because if it stays high the app is wrong, not the planner." |
| 2:45 | Feedback panel | "Technician's note, classified, precision counter updates. That is how the weights get replaced." |

---

## 17. Board Q&A — prepared answers by seat

**CEO — strategic fit.** This does not add capacity, it reallocates crew-hours you already pay for. That is why it is Phase 1: it needs no capex approval to prove itself.

**CFO — where is the number from.** Exposure per asset is MTTR minus buffer, times risk, times your downtime rate. Only the downtime rate is an assumption and we have floored the case at a 20% uplift, which still returns ₹23 lakh a year on one line.

**CFO — accuracy.** The weights are judgment, published on screen, and falsifiable. We deliberately did not fabricate an accuracy figure from synthetic data.

**CDO — replicable in a weekend?** The dashboard is. The exposure model depends on buffer and MTTR master data per station, which most plants do not maintain, and the allocation logic encodes constraints specific to your shutdown practice. The moat is the data cleanse, and we have scoped it at four weeks in Phase 1.

**CDO — why an LLM and not a solver?** The knapsack is a solver, and we call it that. The LLM handles what a solver cannot encode — a spare landing Tuesday, two jobs sharing an isolation, a crew that has seen this gearbox before — and explains the trade-off in terms a planner will accept. Explanation is what gets it used.

**Independent Director — risk.** No personal data, no regulated decision, human approval at allocation and at work order release, full audit trail with override reasons. The risk we take most seriously is that it reads as technician surveillance, so there is no technician-level field in the schema at all.

**Independent Director — what if it is wrong?** A false positive costs crew-hours and displaces one job, and we show the displaced job's carried exposure so the cost is visible rather than hidden.

---

## 18. Team split — six people

| Role | Owns | Deck section |
|---|---|---|
| Engagement Partner | Narrative, open and close, hardest questions | 1, 17 |
| Lead Strategist | Industry analysis, opportunity matrix, why this beat three alternatives | 3, 5, 11 |
| Operating Model Lead | Roadmap, operating model, data and tech architecture | 9, 10, 11, 15 |
| Risk & Governance Lead | Governance canvas, risk matrix, ROI and assumptions | 12, 13, 14 |
| Application Lead | Build, deploy, live demo | 8 |
| Application Co-lead | Seed data, exposure model, backup video, second device test | 8 |

Every member must be able to deliver §6.1's "we did not train a model on synthetic data" answer unprompted. The instruction sheet says every member should be able to explain the AI logic, and that is the answer the panel is most likely to probe.

---

## Appendix A — Application Brief (one page, submission item)

**Use case.** Predicts expected production-loss exposure for 14 body shop assets at Tata Motors' Pune PV plant, and allocates the next maintenance shutdown window across competing jobs under crew, spare and duration constraints.

**AI capability.** Two working components. Claude performs constrained window allocation — selecting a job set from a knapsack baseline, adjusting for soft constraints a solver cannot encode, and returning both selections and rejections with reasons. Claude also classifies free-text technician notes into a twelve-mode failure taxonomy and extracts whether the original prediction held. Risk scoring is a transparent weighted-feature index with published weights; it is not represented as a trained model, because fitting one on synthetic data would only recover the generator.

**Data inputs.** Seeded hourly telemetry for 14 assets over 30 days — vibration RMS, motor current, temperature, cycle count, fault code frequency — plus asset master with MTTR and downstream buffer minutes, a candidate job list, and free-text technician notes. Production requires an OPC-UA historian feed, 18–24 months of SAP PM work orders, MES downtime codes, live spares status, and clean buffer/MTTR master data per station.

**Key output.** Assets ranked by rupee exposure rather than failure probability, and an allocated shutdown job set with utilisation, exposure protected, and deferred jobs with carried exposure.

**Business KPI.** Unplanned downtime minutes per line per month, and exposure protected per shutdown window. Secondary: planned maintenance ratio, window utilisation, planner override rate.

**Known limitations.** Risk weights are engineering judgment, not fitted. Telemetry is synthetic. The exposure model depends on buffer and MTTR data most plants do not maintain cleanly, and degrades to a plain risk ranking without it. LLM-suggested parts are validated against a master but should be checked before requisition. The application recommends; it does not release work orders.

**AI disclosure.** Application code generated with an AI coding assistant and reviewed by the team, per the academic integrity note in §10 of the instruction sheet.

---

## Appendix B — Submission checklist (§7, §10)

- [ ] Strategy deck, 20–30 slides, submitted as **both** PDF and PPTX
- [ ] Live application URL, confirmed working on a second device
- [ ] GitHub repository link, instructor access confirmed
- [ ] One-page Application Brief (Appendix A)
- [ ] AI-generated code disclosed
- [ ] Market, financial and competitive claims sourced or marked as estimates
- [ ] Every rupee figure in this document replaced or labelled illustrative
- [ ] Backup demo video

---

## Appendix C — Synthetic data notes

Fixed random seed, always. The board must render identically on every load or the demo becomes a coin flip.

Set `mttr_minutes` and `downstream_buffer_minutes` by hand, not randomly — these two fields produce the exposure inversion that the entire demo rests on. Target the distribution so that at least three assets in the top five by risk fall outside the top five by exposure.

Telemetry: baseline per asset type with Gaussian noise around 3% of baseline. Eight assets stay flat. Six carry ramps beginning between day 12 and day 22 — vibration RMS climbing 40–70% by day 30, motor current 8–15%, temperature 6–12°C, fault code rate rising through the final 96 hours. Two ramps hard enough to land above 0.75 risk.

Jobs list: twelve candidates totalling roughly 40 crew-hours against an 18 crew-hour window, with two sharing an isolation point and one blocked on a spare arriving Tuesday. Those two details are what give the allocator something interesting to say.
