# SAGARNETRA — Research Dossier

**Smart India Hackathon 2026 · Problem Statement SIH26143**
*Leveraging satellite imagery to determine oil spills at sea along with AIS data correlations to identify vessel responsible for the spill*

Team **AZIMUTH** · Theme: Space Technology · Category: Software

---

## What this document is

A citation-backed research dossier for the SAGARNETRA concept, produced by a multi-agent deep-research pass: **5 search angles → 24 sources fetched → 120 candidate claims extracted → 25 claims put through 3-vote adversarial verification → 18 confirmed, 7 refuted.**

Every load-bearing statement below is tagged with its evidential status. **Read the [Evidence Integrity](#7-evidence-integrity--what-this-research-does-not-establish) section before using anything here in a pitch.** Several things the team currently believes are either unverified or were actively refuted.

**Method note:** a claim was killed if 2 of 3 independent verifiers — each prompted to *refute* it — succeeded. Confirmed claims below are marked with their vote (e.g. `3-0 ✓`).

---

## Table of contents

1. [Executive summary — the one thing that changes the pitch](#1-executive-summary--the-one-thing-that-changes-the-pitch)
2. [The problem: real, chronic, and largely unattributed](#2-the-problem-real-chronic-and-largely-unattributed)
3. [Prior art: SkyTruth Cerulean is SAGARNETRA, already deployed](#3-prior-art-skytruth-cerulean-is-sagarnetra-already-deployed)
4. [The evidentiary reality: satellite evidence is not how MARPOL is enforced](#4-the-evidentiary-reality-satellite-evidence-is-not-how-marpol-is-enforced)
5. [Unresolved technical challenges](#5-unresolved-technical-challenges)
6. [Where genuine novelty survives — the recommended repositioning](#6-where-genuine-novelty-survives--the-recommended-repositioning)
7. [Evidence integrity — what this research does NOT establish](#7-evidence-integrity--what-this-research-does-not-establish)
8. [Refuted claims — do not cite these](#8-refuted-claims--do-not-cite-these)
9. [Open research questions](#9-open-research-questions)
10. [Source bibliography](#10-source-bibliography)
11. [Action checklist for the team](#11-action-checklist-for-the-team)

---

## 1. Executive summary — the one thing that changes the pitch

Two findings dominate everything else.

### Finding A — The pipeline is prior art, not a novel contribution

The full SAGARNETRA pipeline (Sentinel-1 SAR → U-Net segmentation → spatial DB → AIS trajectory correlation → ranked explainable vessel shortlist) **already exists as a globally deployed operational system: SkyTruth's Cerulean**, live since December 2023. The match is component-for-component, not merely conceptual. Nine independently verified claims converge on this, all unanimous 3-0.

> **Consequence:** residual novelty must be argued from **latency, region-specific physics, evidentiary packaging, or coast-guard workflow integration** — never from the pipeline concept itself. A judge who knows Cerulean will otherwise sink the pitch.

### Finding B — The project is aimed at the wrong end of the enforcement chain

Real MARPOL Annex I prosecutions of foreign-flag vessels **do not use satellite evidence at all.** They are built on Oil Record Book falsification discovered by port-state boarding, because the high-seas discharge itself is outside the prosecuting state's jurisdiction. The one published SAR+AIS accountability framework requires physical boarding inspection as a **co-equal third component**.

> **Consequence — the recommended reframing:** SAGARNETRA is an **inspection-targeting and triage system**, not an evidence-generation system. Its output tells a Coast Guard *which arriving vessel to board*. That plugs into the enforcement mechanism that demonstrably works, and it turns the "risk of wrongly implicating a vessel" weakness into a design principle rather than a caveat.

---

## 2. The problem: real, chronic, and largely unattributed

The good news for the team: the *problem* is well-evidenced and remains genuinely open. It is the *solution framing* that needs work.

### 2.1 A decade of Sentinel-1 over one corridor: 355 spills, 6,244 km², zero attribution `3-0 ✓`

**Source:** Elshahat et al., *"Ten years of oil pollution detection in the Eastern Mediterranean shipping lanes opposite the Egyptian coast using remote sensing techniques"*, **Scientific Reports** (5 Aug 2024) — [PMC11300899](https://pmc.ncbi.nlm.nih.gov/articles/PMC11300899/) · [Nature](https://www.nature.com/articles/s41598-024-67983-x)

| Metric | Value |
|---|---|
| Sentinel-1 scenes investigated | > 1,000 (2014–2023) |
| Oil spill events detected | **355** |
| Total affected area | **6,244.14 km²** (10-year cumulative) |
| Peak years | 2017 and 2019 — 58 spills each |
| Peak annual area | 1,096.42 km² (2017) |
| Vessels attributed | **0** |

Verbatim findings: slicks "primarily exhibit elongated patterns aligned with the navigation routes" and cluster "around areas with the highest traffic density." "The northern entrance of the Suez Canal and the area north of the Nile Delta emerge as the most impacted regions." The paper attributes the bulk to routine operations rather than accidents — "intentional oil spills from operational discharges occurring more frequently than accidents."

Critically, **the paper uses no AIS at all.** AIS appears only in its own forward recommendations ("integrating oil spill data with the ships' AIS data for efficient tracking") — making this a clean, author-stated declaration of the attribution gap.

> ⚠️ **Measurement caveats (important — do not overstate this dataset):**
> - The 355 events are **SAR-detected *suspected*** spills with **no in-situ ground truth**.
> - The ~1,000 scenes were **pre-screened as "highly suspected"**, not a systematic census — so **355/1,000 is NOT a base rate**.
> - 6,244.14 km² is a **10-year cumulative sum**, not a contiguous area.
> - **Partly circular:** the study area is *defined* as shipping lanes, so "spills occur in shipping lanes" is partly a design artifact. The real finding is the **non-uniform clustering within** that area.
> - Read co-location as a **spatial prior** that AIS-correlation exploits, **not** as per-slick attribution. Co-location is necessary but not sufficient — and dense traffic actively degrades it.

### 2.2 Slick–traffic co-location is the geometric basis attribution rests on `3-0 ✓`

Detected slicks are spatially co-located with, and elongated along, shipping lanes and port approaches. This is the physical premise that makes AIS correlation viable at all.

*Interpretive note: the phrase "the geometric basis on which AIS attribution rests" is our inference — the Egypt paper itself performs no attribution.*

### 2.3 Attribution is the acknowledged hard part `3-0 ✓`

Liu et al. (2021) state that associating a spill with the responsible vessel **"is the most difficult issue"** with illegal discharge detection, and that dense traffic makes tracing **"extremely challenging"** using spaceborne SAR alone.

---

## 3. Prior art: SkyTruth Cerulean is SAGARNETRA, already deployed

**Primary sources:** [skytruth.org/cerulean/methods](https://skytruth.org/cerulean/methods) · [skytruth.org/cerulean/why](https://skytruth.org/cerulean/why) · [skytruth.org/faq/cerulean-questions](https://skytruth.org/faq/cerulean-questions) · [Skylight integration](https://www.skylight.global/news/skytruth-integration) · [Cerulean launch, Dec 2023](https://skytruth.org/2023/12/cerulean-is-now-live/) · EGU 2024 abstract `2024EGUGA..2613480R`

### 3.1 Component-by-component comparison `3-0 ✓`

| SAGARNETRA proposal | Cerulean (in production) |
|---|---|
| U-Net segmentation | **ResNet34-based U-Net** |
| Sentinel-1 SAR (primary) | Sentinel-1 **VV polarization**, scaled to **80 m**, split into overlapping **512×512 tiles** |
| Spill polygon · centroid · area | "Merged oil slick rasters... processed to create instances of **vectorized polygons**" |
| PostGIS spill layer | inserted into a **cloud-based Postgres database**, where "polygon area, length, perimeter, and other geometric properties are computed" |
| AIS correlation window | **all AIS intersecting each scene, −8 h to +6 h** of image timestamp |
| Vessel Association Score (6 weights) | **parity + proximity + temporality** scores — fully automated since 2022 |
| Ranked vessel shortlist | **ranked top-5 candidate vessels** |
| Explainable evidence trail | **"Source Profiles"** — see §3.3 |
| Human-in-the-loop review | **"Verified Slicks"**, shipped Oct 2025 |
| *(not in proposal)* | **dark-vessel SAR matching** — live June 2025 |
| *(not in proposal)* | **fixed-infrastructure source scoring** |

Verbatim from the methods page: *"Cerulean analyzes the shape and location of oil slicks alongside vessel tracking data to identify likely sources."*

Deployment is third-party corroborated: launched Dec 2023, "used by journalists and advocates around the world," fully integrated into the Allen Institute's **Skylight** platform, and presented at **EGU 2024** as a "Public Database of Near-Real-Time Oil Detections."

### 3.2 The "Vessel Association Score" is already productised and decomposed `3-0 ✓`

Cerulean scores candidate AIS vessels on three named, human-readable metrics — verbatim from the methods page:

- **Parity score** — *"computed by comparing the length of the slick to its projected length along an AIS track"*
- **Proximity score** — *"computed by examining the distance from the head of the slick to the nearest point along a vessel's AIS track"*
- **Temporal score** — *"computed by considering the timestamp of the AIS broadcast that is spatially proximal to the head of the slick"*

These are **genuinely trajectory-based** (projection along track, nearest point on track) — not naïve radius proximity. The ranking is surfaced in the UI: the public map carries a **"Slick-source match"** filter (Weak/Strong), and the largest frontend update to date was "aimed at answering one question: **Who's most likely responsible for this slick?**" via **Source Profiles**.

**Reported accuracy** (SkyTruth, 2022):

| Metric | Value |
|---|---|
| Correct vessel in top-5 | **92%** |
| Correct vessel ranked #1 | **76%** |

> ⚠️ **Vendor-reported, not independently benchmarked.** These figures come from SkyTruth's own reporting on a **self-selected "known coincident vessels" test set**. Treat accordingly.

> ✅ **Genuine opening left here:** the ranking is **geometric/heuristic** (parity + proximity + temporality, plus distance decay for infrastructure) — **not a learned association model** — and the methods page publishes **no single fused composite score and no score thresholds**. A *calibrated, formally explainable composite score* remains legitimate open engineering space.

### 3.3 Attribution output is already an evidence dossier, and dark vessels are already handled `3-0 ✓`

**Per-vessel "Cerulean Source Profile"** includes *"a complete oil slick history, suspicious behavior patterns such as AIS off events, pollution within marine protected areas and national waters, and known detention records"* — structurally an explainable evidence bundle, i.e. the same idea as SAGARNETRA's "Explainable Evidence" pillar.

**Dark vessels (AIS-off):** *"Cerulean detects oil slicks that appear without a corresponding AIS signal and can match them to dark vessel remote sensing detections."* Concrete parameters:
- restricted to objects **> 30 m** estimated length,
- detected with high confidence **within 50 km** of the oil,
- scored by **distance from the slick** and **angular deviation from the predicted path**.

Live since **June 2025** via collaboration with Global Fishing Watch.

**Fixed infrastructure** is a third source branch, scoring *"the probability that a nearby point is the terminus or origin of the slick"* with a **distance decay** (optimized decay = **4.0**, tuned on **61** verified ground-truth slick geometries, using the SAR Fixed Infrastructure dataset).

> ✅ **Critical residual gap the team CAN target:** dark-vessel matching **does not yield identity**. SkyTruth states plainly: *"Dark vessels don't broadcast their identity. Even if the same dark vessel polluted 75 times, we still wouldn't be able to identify it or know if it's the same vessel."* Only pixel-estimated length is available — no flag, type, origin or destination — and detection rates vary significantly by region.

### 3.4 The operator itself disclaims proof — and is moving *toward* human review `3-0 ✓`

This is the most useful finding for de-risking the SAGARNETRA pitch, because the market leader has already conceded the epistemic limits.

Verbatim from the methods page:

> *"It is not possible to definitively identify oil slicks using synthetic aperture radar (SAR) satellite data alone. All Cerulean-detected oil slicks should be considered **potential** oil slicks, not definitive oil slicks."*

And on scoring: slick confidence *"should not be interpreted as definitive proof of oil or source attribution."*

The FAQ adds that Cerulean *"cannot confirm — and does not provide any warranties or conclusions — that a particular slick is the result of actions by a specific vessel or platform"*, that attributions *"are only as good as the AIS data supplied to the model"*, and that expected false positives include **whitecaps, small icebergs and rock islands**.

This is a **physics-grounded limit, not a transient engineering gap** — SAR measures surface-roughness dampening, which biogenic slicks, low-wind zones and algal blooms mimic.

**Direction of travel confirms it:** in Oct 2025 SkyTruth shipped **"Verified Slicks"** because users' most common request was human confirmation, conceding automation *"cannot replace the expertise of a trained human analyst."* One Greenpeace Bulgaria case was refined to **170 confirmed slicks** after human review.

> ✅ **Two implications:** (1) SAGARNETRA's human-in-the-loop element is **correct design, not a compromise** — say so confidently, and cite Cerulean's Oct 2025 move as vindication. (2) Any "automated attribution" language should be reframed as **triage/prioritisation**, never as evidence generation.

### 3.5 Published SAR+AIS academic precedent `3-0 ✓`

**Source:** Liu Bingxin, Zhang Wan, Han Junsong, Li Ying, *"Tracing illegal oil discharges from vessels using SAR and AIS in Bohai Sea of China"*, **Ocean & Coastal Management** 211:105783 (Oct 2021), DOI [10.1016/j.ocecoaman.2021.105783](https://www.sciencedirect.com/science/article/abs/pii/S0964569121002660)

A verbatim Highlights bullet: *"It is the first time that **China** used SAR and AIS to pursue accountability for ships that illegally discharge oily sewage"* (the abstract hedges with "As far as we know").

The same abstract concedes the maturity gap directly: *"However, China has not yet established a mature and effective oil spill supervision system based on SAR and AIS."*

**Crucially, the framework is three-part.** It *"proposes a framework for oil spill detection and accountability using the combination of SAR, AIS **and boarding inspection**"*, demonstrated on one Bohai Sea illegal-discharge case. The paper notes additional evidence — tampering tools, navigation and oil record book entries, on-site findings — is needed to hold a vessel accountable.

> ⚠️ **Scoping notes:** this is a **China-first, not a world-first**. And the paper reports "accountability" and boarding inspection **without documenting a resulting prosecution, fine or judgment** — our earlier phrasing "pursue *legal* accountability" overstates it; the paper says "pursue accountability."

### 3.6 OceanMind is not an incumbent in this space `3-0 ✓` *(medium confidence)*

**Source:** [oceanmind.global/products-services/precision-regulation](https://oceanmind.global/products-services/precision-regulation/)

OceanMind's products are scoped entirely to **IUU fishing and fisheries MCS** (monitoring, control and surveillance). A site-wide fetch found the product line to be Precision Regulation, PSMART, OMRRA, LRI and FIAAS, with focus areas Enforcement (IUU fishing, labour/human rights), Emissions, Ecosystems, Economic Intel and ESG. **No mention of oil spills, discharges, MARPOL or marine pollution anywhere.** The one near-miss, "Emissions," is explicitly atmospheric (CO₂e, black carbon, PM2.5, SOx, NOx) — not marine oil discharge.

> Cite OceanMind as a **relevant AIS vessel-behaviour risk-scoring analogue from the IUU domain**, not as an oil-spill attribution incumbent.
>
> ⚠️ Medium confidence: this is an **absence claim from marketing pages** — it establishes *advertised scope*, not technical incapability.

---

## 4. The evidentiary reality: satellite evidence is not how MARPOL is enforced

This section is the strategic core of the dossier.

### 4.1 US MARPOL prosecutions run on record falsification, not on discharge detection `3-0 ✓`

**Sources:** [DOJ — Gremex Shipping press release](https://www.justice.gov/usao-ndfl/pr/ship-management-company-fined-175m-failing-maintain-accurate-oil-record-book-concealed) · [DOJ ENRD case page](https://www.justice.gov/enrd/case/united-states-v-gremex-shipping-sa-de-cv) · *US v. Ionia Management S.A.* (2d Cir.) · USCG Office of Maritime and International Law, Oil Record Book Violation Cases digest

**Case: *United States v. Gremex Shipping S.A. de C.V.*** — M/V *Suhar*, 7,602 GT Panama-flag bulker on a routine Tampico–Pensacola cement run.

The company *"pleaded guilty... for creating and providing **false records** to the U.S. Coast Guard to conceal its illegal discharge of oily bilge waste into the ocean, which is a felony violation of the Act to Prevent Pollution from Ships (APPS)."*

| | |
|---|---|
| Fine | **$1.75 M** |
| Probation | 4 years |
| Additional | Environmental compliance plan |
| **Charged offence** | **The false record.** The discharge is background. |
| **Detection method** | **Physical boarding**, Pensacola, 25 Aug 2023 |
| **Satellite / SAR / aerial evidence** | **None anywhere in the case** |
| **Slick located** | **Never** |

After boarding, *"Coast Guard personnel determined that the vessel's crew had regularly discharged untreated oily bilge water into sea in a manner that **bypassed onboard pollution control equipment**, and then **falsified the ship's oil record book** to conceal these discharges"* — the bypass-plus-falsified-records pattern the industry calls a **"magic pipe."**

**The doctrine is settled.** US courts hold the gravamen of an APPS ORB violation is *"not the pollution itself, or even the Oil Record Book violation occurring on the high seas, but **the misrepresentation in port**."*

**The pattern is current, not historical:** a second 2026 DOJ case (**MSC Samira III**, false ORB presented to USCG at the Port of Philadelphia, Jan 2025) carries the same mechanism and the same $1.75 M figure.

> ⚠️ **Jurisdictional scope — do not over-generalise.** This finding is specific to **US APPS enforcement against foreign-flag vessels for HIGH-SEAS discharges.** Where a discharge occurs in **US navigable waters**, Clean Water Act and discharge counts *do* apply, and APPS cases frequently add obstruction and 18 U.S.C. §1001 counts. **Do not claim "satellite evidence is never probative anywhere."**
>
> ⚠️ *"Magic pipe"* is industry terminology, not DOJ's words. DOJ never quantifies discharge volumes, so "small discharges" is our inference.

### 4.2 The strategic implication

The highest-value framing is **not** "replace prosecution evidence" but **"target port-state inspection resources."**

A ranked shortlist that tells a coast guard **which arriving vessel to board** is directly actionable within the enforcement mechanism that actually works — and it is a claim SAGARNETRA can fully defend, because it never asserts guilt.

```
CURRENT PITCH (fragile)
  spill detected → AIS correlated → "this vessel did it" → ⚠️ wrongful implication risk
                                                          ⚠️ SAR cannot confirm oil
                                                          ⚠️ evidence inadmissible anyway

RECOMMENDED PITCH (defensible)
  spill detected → AIS correlated → ranked boarding-priority list
       → port-state control officer boards vessel on arrival
       → Oil Record Book + bypass equipment inspected
       → prosecution built on falsification evidence (the mechanism that works)
```

---

## 5. Unresolved technical challenges

> ⚠️ **Evidence status:** this section is **qualitatively** evidenced. **No verified claim in this research establishes quantitative** look-alike false-positive rates, drift-model accuracy, or revisit-vs-slick-lifetime tradeoffs. Do not present numbers here that are not in this dossier.

### 5.1 SAR look-alike discrimination — a physics limit, not an engineering gap

SAR measures **surface-roughness dampening**. Biogenic slicks, low-wind zones and algal blooms produce the same signature as oil. The market leader's own disclaimer (§3.4) is the strongest available statement of this limit. Cerulean's stated expected false positives: **whitecaps, small icebergs, rock islands**.

### 5.2 AIS latency vs. slick lifetime — the sharpest identified gap `3-0 ✓` *(medium confidence)*

| | |
|---|---|
| Cerulean AIS feed delay | **~72 hours** |
| Live attribution availability | **explicitly unavailable** — geometry-based slick confidence score only, for the first ~72 h |
| Slick persistence | **order of hours** (SkyTruth FAQ) |
| **Net effect** | the enforcement-relevant window and the attribution-available window **barely overlap** |

SkyTruth verbatim: its *"AIS feed operates with a 72-hour delay, so live attribution of oil slicks to potential vessel sources is not currently available."*

> ⚠️ **Medium confidence, and time-sensitive.** These are **engineering constraints under active change** — SkyTruth shipped near-real-time confidence-score work as recently as **Mar 2026**. A novelty pitch built on the 72-hour figure **needs re-verification immediately before use.**

### 5.3 AIS gaps and deliberate shutoff structurally exclude the worst offenders

Attribution is AIS-dependent, which excludes the most likely deliberate offenders. SkyTruth concedes "the actual polluter" may be *"a so-called 'dark' vessel that was not broadcasting an AIS signal."* And dark-vessel detection cannot name anyone (§3.3).

This validates SAGARNETRA's "AIS Gap Awareness" pillar — but note it must remain, as the slide correctly says, *"an investigative signal, never proof of wrongdoing."*

### 5.4 Drift / back-trajectory modelling — an unevidenced hypothesis

Cerulean's *"predicted path"* is a **geometric slick-orientation inference, not a physical oil-transport model.**

> ⚠️ **Zero supporting evidence in this evidence base.** Whether physically-modelled drift (wind + current oil transport, e.g. via INCOIS or MOSSEA) measurably outperforms geometric heuristics at ranking candidate vessels is **an open hypothesis, not an established gap.** It also needs a **validation strategy**, since ground-truth attributed slicks are scarce — SkyTruth tuned its infrastructure decay on just **61** verified geometries.

### 5.5 Sensor resolution and revisit gaps

Qualitatively established (Cerulean operates at 80 m; dark-vessel detection is limited to objects > 30 m). **No verified quantitative claim** on minimum detectable discharge size or revisit-gap impact. The SAGARNETRA slide's commitment to stating minimum detectable size transparently is the right posture.

---

## 6. Where genuine novelty survives — the recommended repositioning

Ranked by defensibility, based on the verified evidence.

| # | Differentiator | Status | Notes |
|---|---|---|---|
| **1** | **Inspection-targeting framing** — output feeds port-state boarding decisions rather than claiming attribution | **Strongly evidenced** | Follows directly from §4. Costs nothing to adopt; substantially de-risks the pitch. |
| **2** | **Region-specific look-alike discrimination** for Arabian Sea / Bay of Bengal | **Credible, unevidenced** | Cerulean's model and most training data originate in Mediterranean / North Sea conditions. Monsoon low-wind zones and tropical algal blooms differ materially. A region-specific result would be genuinely novel. |
| **3** | **Physically-modelled drift back-trajectory** (INCOIS / MOSSEA coupling) | **Hypothesis only** | Most credible *technical* differentiator found, but currently zero supporting evidence. Needs a validation strategy. |
| **4** | **Single calibrated, fused association score** with published thresholds | **Genuine gap** | Cerulean publishes three separate heuristic metrics, no fused composite, no thresholds, and no *learned* association model. |
| **5** | **Latency / near-real-time attribution** | **Time-sensitive gap** | The ~72 h figure is real but may be a **licensing** rather than engineering constraint — see [Open Question 2](#9-open-research-questions). Verify before pitching. |
| **6** | **Identity resolution for non-broadcasting vessels** | **Hard open problem** | SkyTruth explicitly cannot solve it. Very high value; also very hard — treat with humility. |
| **7** | Indian EEZ / Coast Guard workflow integration, NOSDCP alignment | **Unevidenced but plausible** | Localisation and agency-workflow fit are legitimate contributions even when the algorithm is not novel. |

> ❌ **What is NOT a differentiator:** the pipeline concept, U-Net segmentation, Sentinel-1 SAR choice, PostGIS storage, AIS spatio-temporal filtering, trajectory intersection scoring, ranked shortlists, explainable evidence trails, or human-in-the-loop review. **All are shipped in Cerulean.**

---

## 7. Evidence integrity — what this research does NOT establish

**Read this before using anything above in a submission.**

### 7.1 Source concentration

The 18 verified claims are heavily weighted toward two source families: **SkyTruth/Cerulean's own documentation (9 claims)** and a small number of primary case/paper sources.

**Why the Cerulean findings are still usable despite being operator-published:**
1. The load-bearing technical details are **specific and falsifiable** (ResNet34 backbone, 512×512 tiles at 80 m, −8 h/+6 h AIS window, > 30 m dark objects within 50 km, decay = 4.0).
2. The same operator publishes **strong self-limiting disclaimers**, which argues against promotional inflation.
3. **Third parties corroborate deployment** — Skylight integration, EGU 2024 abstract, Development Seed.

**But:** the headline accuracy figures (92% top-5, 76% first) are **vendor-reported on a self-selected test set** — not independently benchmarked.

### 7.2 Topics the research brief asked for but did NOT establish

| Topic | Status |
|---|---|
| **EMSA CleanSeaNet** | ❌ **All six candidate claims REFUTED (0-3).** This dossier contains **no verified statements** about CleanSeaNet's detection method, its use of SAR, or whether it automates AIS correlation. **The current SAGARNETRA slide cites CleanSeaNet as validating precedent — that citation is currently unsupported.** Re-research directly at `emsa.europa.eu` or omit. |
| Windward | ❌ Entirely unevidenced |
| Orbital EOS | ❌ Entirely unevidenced |
| MarineTraffic / Spire | ❌ Entirely unevidenced |
| NOAA ORR | ❌ Entirely unevidenced |
| SkyTruth Alerts | ❌ Entirely unevidenced |
| Academic SAR lineage — Krestenitis, Topouzelis, Solberg, Zhang DeepLabV3+ | ❌ Entirely unevidenced *(all are cited on the SAGARNETRA references slide — they are real papers, but this research pass verified nothing about them)* |
| Quantitative look-alike false-positive rates | ❌ Not established — qualitative only |
| Drift-model accuracy | ❌ Not established |
| Revisit-time vs. slick-lifetime tradeoff | ❌ Not established quantitatively |

**One unverified lead worth chasing** (surfaced only inside verifier commentary, therefore **UNVERIFIED**):
- EMSA's own case page on **"Satellite images as primary evidence in UK court" — *Maersk Kiera*, Feb 2012**. If real, this is the **strongest available counterexample** to "satellite evidence is never probative." → [emsa.europa.eu case page](https://emsa.europa.eu/csn-menu/csn-service/oil-spill-detection-examples/286-oil-spill-detection-examples/1873-oil-spill-detection-examples-maersk-kiera-february-2012.html)
- A CleanSeaNet validation set of **226 confirmed spills against 4,670 look-alikes**. Needs sourcing — if genuine, it is the best available real-world look-alike false-positive statistic.

### 7.3 Interpretive clauses that are our analysis, not sourced fact

- "The geometric basis on which AIS attribution rests" — our inference; the Egypt paper uses no AIS.
- "Directly relevant to MARPOL admissibility" — our framing, not a SkyTruth assertion.
- "Magic pipe" — industry terminology, not DOJ's words.
- "Small discharges" in the DOJ context — inferred; DOJ never quantifies volumes.
- "Pursue **legal** accountability" (Liu et al.) — overstates the paper, which says "pursue accountability."

### 7.4 Time sensitivity

Cerulean is under **active development**:

| Date | Release |
|---|---|
| Dec 2023 | Cerulean launch |
| 2022 | Attribution algorithm reached full automation |
| Jan 2025 | Stationary-polluter algorithm |
| Jun 2025 | Dark-vessel feature live (via Global Fishing Watch) |
| Oct 2025 | "Verified Slicks" human-in-the-loop |
| Mar 2026 | Near-real-time confidence score |

> **The gaps this dossier identifies as SAGARNETRA's residual novelty space — above all the ~72-hour AIS latency — are engineering limitations SkyTruth could close at any time**, and the near-real-time confidence-score work suggests they are already moving in that direction. **Re-check `skytruth.org/cerulean/methods` and their blog before committing to a novelty pitch.**

---

## 8. Refuted claims — do not cite these

Each of these was killed by 2+ of 3 independent verifiers. **Several were plausible-sounding claims that would have weakened the submission if used.**

| Claim | Vote | Source |
|---|---|---|
| **CleanSeaNet is an already-deployed operational EU service performing both oil spill AND vessel detection, explicitly listing polluter identification among its objectives** | **0-3** ✗ | emsa.europa.eu |
| **CleanSeaNet detection is based on SAR, chosen for day/night all-weather coverage** | **0-3** ✗ | emsa.europa.eu |
| **CleanSeaNet fuses AIS + vessel detection with SAR but correlation is done by human operators, not an automated ranked score — locating SAGARNETRA's novelty in automating the correlation step** | **0-3** ✗ | emsa.europa.eu |
| Liu et al. is a single illustrative case study, leaving automated explainable ranked vessel-association scoring as an open gap | **0-3** ✗ | ScienceDirect S0964569121002660 |
| The Egypt study performed SAR detection only and explicitly did not attribute, evidencing that AIS-to-spill attribution remains an unsolved gap in the literature | **0-3** ✗ | PMC11300899 |
| Egypt spills dominated by small operational discharges, **191 of 355 events under 10 km²** | **1-2** ✗ | PMC11300899 |
| Cerulean's dominant target is operational bilge discharge containing lead and arsenic, dumped despite MARPOL prohibition | **1-2** ✗ | skytruth.org/cerulean/why |

> ⚠️ **The three CleanSeaNet refutations are the most consequential.** The third one in particular is a *very* attractive argument — "the novelty is automating what CleanSeaNet does manually" — and it did **not** survive verification. Do not use it without doing primary research on EMSA first.
>
> ⚠️ **The "191 of 355 under 10 km²" figure must not be cited.**

---

## 9. Open research questions

**1. What does EMSA CleanSeaNet actually do, and how automated is its AIS correlation?**
Every claim about CleanSeaNet was refuted at verification, leaving a hole in the single most important comparison point for an EU-operational baseline. Needs direct primary research on `emsa.europa.eu`: detection method; whether SAR+AIS correlation is algorithmic or analyst-driven; documented look-alike/false-positive rates (the 226-confirmed-vs-4,670-look-alikes figure needs sourcing); and the *Maersk Kiera* (Feb 2012, UK court) case where SAR imagery was reportedly admitted as primary evidence.

**2. Is Cerulean's ~72-hour AIS latency a licensing/commercial constraint or a technical one — and can a hackathon team plausibly do better?**
If the delay stems from **AIS data licensing terms** (Spire / ORBCOMM / exactEarth commercial feeds), then near-real-time attribution is a **procurement problem, not an engineering one, and the entire latency-based novelty pitch collapses.** Also unresolved: what AIS access an Indian team can actually obtain, at what latency and cost — terrestrial vs. satellite AIS, and whether Indian Coast Guard / NCVTS feeds are available.

**3. Does physically-modelled drift back-trajectory measurably outperform Cerulean's geometric parity/proximity/temporality heuristics at ranking candidate vessels?**
No verified source addresses drift-model accuracy for back-trajectory attribution. This is the most credible technical differentiator identified, but it is currently **a hypothesis with zero supporting evidence** — and it needs a validation strategy, since ground-truth attributed slicks are scarce (SkyTruth tuned on just 61 verified geometries).

**4. What are the actual operational look-alike false-positive rates for U-Net SAR segmentation in tropical Indian Ocean conditions?**
And does the published academic lineage (Krestenitis, Topouzelis, Solberg, Zhang DeepLabV3+) offer benchmarks transferable to the Arabian Sea and Bay of Bengal? Monsoon low-wind zones and algal blooms differ materially from the Mediterranean and North Sea conditions where most training data — and Cerulean's model — originate. **A region-specific look-alike discrimination result would be genuinely novel and is unaddressed here.**

---

## 10. Source bibliography

### Primary — operational systems
- [skytruth.org/cerulean/methods](https://skytruth.org/cerulean/methods) — Cerulean technical methods *(load-bearing source)*
- [skytruth.org/cerulean/why](https://skytruth.org/cerulean/why)
- [skytruth.org/faq/cerulean-questions](https://skytruth.org/faq/cerulean-questions)
- [skytruth.org/2023/12/cerulean-is-now-live/](https://skytruth.org/2023/12/cerulean-is-now-live/)
- [skytruth.org/2025/01/leveling-up-ceruleans-ability-to-reveal-stationary-polluters/](https://skytruth.org/2025/01/leveling-up-ceruleans-ability-to-reveal-stationary-polluters/)
- [skytruth.org/blog/dark-vessels-qa-bringing-transparency-to-hidden-ocean-pollution](https://skytruth.org/blog/dark-vessels-qa-bringing-transparency-to-hidden-ocean-pollution)
- [skytruth.org/blog/bilge-dumping-at-sea-how-can-this-be-happening](https://skytruth.org/blog/bilge-dumping-at-sea-how-can-this-be-happening)
- [skylight.global/news/skytruth-integration](https://www.skylight.global/news/skytruth-integration) — third-party deployment corroboration
- EGU 2024 abstract `2024EGUGA..2613480R` — "Public Database of Near-Real-Time Oil Detections"
- [emsa.europa.eu/csn-menu.html](https://www.emsa.europa.eu/csn-menu.html) — ⚠️ *all extracted claims refuted; needs re-research*
- [emsa.europa.eu — Maersk Kiera, Feb 2012](https://emsa.europa.eu/csn-menu/csn-service/oil-spill-detection-examples/286-oil-spill-detection-examples/1873-oil-spill-detection-examples-maersk-kiera-february-2012.html) — ⚠️ *unverified lead, high value*
- [oceanmind.global/products-services/precision-regulation/](https://oceanmind.global/products-services/precision-regulation/)

### Primary — peer-reviewed research
- Liu B., Zhang W., Han J., Li Y. (2021). *Tracing illegal oil discharges from vessels using SAR and AIS in Bohai Sea of China.* **Ocean & Coastal Management** 211:105783. [DOI](https://www.sciencedirect.com/science/article/abs/pii/S0964569121002660)
- Elshahat et al. (2024). *Ten years of oil pollution detection in the Eastern Mediterranean shipping lanes opposite the Egyptian coast using remote sensing techniques.* **Scientific Reports.** [PMC11300899](https://pmc.ncbi.nlm.nih.gov/articles/PMC11300899/)
- *Combining SAR and AIS to track oil discharge vessels using the improved U-Net.* **SPIE Earth Observing Systems XXIX** (2024). [DOI 10.1117/12.3027230](https://www.spiedigitallibrary.org/conference-proceedings-of-spie/13143/1314313/Combining-SAR-and-AIS-to-track-oil-discharge-vessels-using/10.1117/12.3027230.short) — ⚠️ *closest published prior art to the SAGARNETRA concept; surfaced in search but no claims verified — read this paper*
- [ScienceDirect S0025326X24007859](https://www.sciencedirect.com/science/article/abs/pii/S0025326X24007859) · [S0025326X1500510X](https://www.sciencedirect.com/science/article/abs/pii/S0025326X1500510X) — Marine Pollution Bulletin
- [arxiv.org/pdf/2006.13575](https://arxiv.org/pdf/2006.13575) · [arxiv.org/pdf/2206.00897](https://arxiv.org/pdf/2206.00897) — SAR segmentation
- [PMC10844276](https://pmc.ncbi.nlm.nih.gov/articles/PMC10844276/) — *The evidentiary challenges of using satellite technologies to enforce ship-source marine pollution standards*

### Primary — legal and enforcement
- [DOJ — Ship management company fined $1.75M (Gremex / M/V Suhar)](https://www.justice.gov/usao-ndfl/pr/ship-management-company-fined-175m-failing-maintain-accurate-oil-record-book-concealed)
- [DOJ ENRD — United States v. Gremex Shipping S.A. de C.V.](https://www.justice.gov/enrd/case/united-states-v-gremex-shipping-sa-de-cv)
- *US v. Ionia Management S.A.* (2d Cir.) — APPS ORB doctrine
- USCG Office of Maritime and International Law — Oil Record Book Violation Cases digest
- [UNODC — Maritime Domain Awareness and Digital Evidence manual](https://www.unodc.org/documents/Maritime_crime/AnnexD_MANUAL_MARITIME_DOMAIN_AWARENESS_AND_DIGITAL_EVIDENCE.pdf)
- [Manchester Student Law Review — Szepes](https://hummedia.manchester.ac.uk/schools/law/main/research/MSLR_Vol2_5(Szepes).pdf)
- [ScienceDirect S2405844024011721](https://www.sciencedirect.com/science/article/pii/S2405844024011721)

### Secondary / trade
- [CLS Maritime Intelligence — A victory for the oceans: marine pollution legal precedent](https://maritime-intelligence.groupcls.com/a-victory-for-the-oceans-marine-pollution-legal-precedent/)
- [LMI — MARPOL evasion: top strategies for collecting evidence](https://lmitac.com/articles/marpol-evasion-top-strategies-for-collecting-evidence)

### Policy framework (from original submission, not independently verified in this pass)
- MARPOL 73/78 Annex I (IMO) — `imo.org`
- NOSDCP — Indian Coast Guard National Oil Spill Disaster Contingency Plan — `indiancoastguard.gov.in`

---

## 11. Action checklist for the team

**Immediate — before any further slide work**

- [ ] **Read `skytruth.org/cerulean/methods` end to end.** It is effectively your competitor's design doc, and it is public.
- [ ] **Read the SPIE 2024 paper** "Combining SAR and AIS to track oil discharge vessels using the improved U-Net" — closest published prior art; this pass surfaced it but verified nothing from it.
- [ ] **Re-verify Cerulean's ~72 h AIS latency** and check their blog for changes since Mar 2026. Your best latency argument may already be closed.
- [ ] **Do primary research on EMSA CleanSeaNet.** Your references slide cites it as validating precedent and that citation is currently unsupported. Chase the *Maersk Kiera* case and the 226-vs-4,670 look-alike figure.

**Pitch changes**

- [ ] **Reframe from "identify the responsible vessel" to "prioritise which vessel to board."** This is the single highest-leverage change (§4.2).
- [ ] **Stop claiming the pipeline as innovation.** Cite Cerulean as prior art yourself — pre-empting the judge's objection is far stronger than being caught by it.
- [ ] **Keep and strengthen human-in-the-loop.** Cite SkyTruth's Oct 2025 "Verified Slicks" release as independent vindication of the design choice.
- [ ] **Move "Innovation & Uniqueness" to:** region-specific look-alike discrimination · physically-modelled drift back-trajectory · calibrated fused score with published thresholds · Indian EEZ / NOSDCP workflow integration.
- [ ] **Remove OceanMind** from any competitive landscape slide (it does IUU fishing, not oil spills) — or reposition it explicitly as an AIS risk-scoring analogue.
- [ ] **Delete the "191 of 355 events under 10 km²" figure** if it appears anywhere. Refuted.

**Technical scoping**

- [ ] Decide whether drift back-trajectory is in scope. It is the most credible technical differentiator **and** currently a hypothesis with no supporting evidence — scope it as a research contribution with a stated validation plan, not a feature.
- [ ] Establish what AIS you can actually obtain, at what latency and cost (terrestrial vs. satellite; ICG / NCVTS availability). This determines whether the latency pitch is viable at all.
- [ ] Plan for ground-truth scarcity. SkyTruth tuned on 61 verified geometries. Any accuracy claim needs an honest denominator.

---

## Research provenance

| | |
|---|---|
| Method | Multi-agent deep research — fan-out search → source fetch → claim extraction → 3-vote adversarial verification → synthesis |
| Search angles | 5 (problem scale · operational systems · academic novelty gap · technical limitations · legal/evidentiary) |
| Sources fetched | 24 (3 URL duplicates removed, 3 dropped on budget) |
| Claims extracted | 120 |
| Claims verified | 25 |
| **Confirmed** | **18** |
| **Refuted** | **7** |
| Unverified | 0 |
| Findings after synthesis merge | 9 |
| Agent calls | 106 |
| Verification rule | a claim was killed if ≥2 of 3 independent refutation-prompted verifiers succeeded |

*Research pass completed 7 September 2026. Cerulean is under active development — re-verify time-sensitive claims (§7.4) before submission.*
