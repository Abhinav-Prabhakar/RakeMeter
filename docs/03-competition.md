# 03 · Competition

*No competitor publishes prices. Price figures here are either benchmarks from adjacent products or our own estimates, and are labelled as such.*

## 1. The field at a glance

| Who | What it is | Covers | Doesn't cover | Model |
|---|---|---|---|---|
| **Helious Rake Guard** | Plant automation for inbound rakes, launched May 2026 | FOIS tracking by FNR, arrival alerts, tippler allocation and PLC automation, camera-based wagon inspection, person detection, demurrage countdown, weight reconciliation | Outbound loading, overload prevention, bill audit and waivers, multi-plant planning | Project sale with hardware; quote only |
| **Fretron** | Multimodal transport management system | Freight procurement, dispatch, tracking, billing; a rake composition and wagon allocation module | Siding operations, free-time clock, yard sequencing | Enterprise SaaS; quote only |
| **FOIS / FBD portal** | The railway's own customer portal | Indents, track and trace by FNR, payments due, GST invoices | Anything inside the plant gate; no cost view | Free |
| **ULIP** | Government data gateway to FOIS and ~40 other systems | FNR-based rail data through an API for approved companies | It is plumbing, not a product; competitors (Intugine, reportedly Helious) already use it | Free to register |
| **ERP + spreadsheets + radio** | What most plants actually use | Recording bills after the fact | Planning, prediction, disputes | Sunk cost |
| **Indian logistics control towers** (FreightFox, FarEye, Shipsy) | Road-first visibility and TMS | Trucks, carriers, invoices | Rail siding rules | Enterprise SaaS |
| **Overseas rail shipper tools** (RSI Rail Command, Railinc TransmetriQ, Kaleris, Railserve) | Railcar tracking and demurrage management for North America | Tariff interpretation, demurrage calculation, dispute support, yard inventory | Indian rules, FOIS, rake-as-one-unit logic | SaaS; quote only |
| **Equipment vendors** (in-motion weighbridges, pre-weigh rapid loading systems, tippler makers) | Hardware | Accurate weighing and fast loading | Planning and commercial layer | Capital purchase |

## 2. Closest competitor: Helious Rake Guard

**What they say they do** (all vendor claims)
- Track the rake through FOIS using the FNR and give 2–6 hours' warning.
- Allocate wagons to tipplers by sequence, material and wagon type; reroute if a tippler fails.
- Automate the tippler, side-arm charger and hopper feeder through the plant's PLC.
- Inspect wagons by camera for bulged walls and faulty locks; lock out the charger zone if a person is detected.
- Show a demurrage dashboard with free-time countdowns.
- Reconcile net weights against FOIS and sync to ERP.

**Their numbers** (vendor claims)
- 10–25% cut in rake turnaround.
- Positive return in 6–12 months for a mid-to-large plant.
- Deployment in 8–16 weeks.
- 15+ plant deployments cited for the company overall. Their listed reference plants are for the truck product, not Rake Guard. No named Rake Guard customer was found.

**How to read this**
- It is an **automation project**: cameras, PLC integration, a safety interlock. That is why payback is quoted in months and deployment in quarters.
- It is **inbound and tippler-centred**. Loading, weighing strategy and the commercial side are absent.
- A 6–12 month payback against savings in the low crores suggests a project price somewhere in the tens of lakhs to low crores. **This is our inference, not a quoted price.**

## 3. Fretron

- Founded 2017, Gurugram, roughly 64 employees.
- Claims 100+ enterprise clients including Tata Steel, JSW, Jindal Steel; ₹10,000 crore of freight managed; ₹400 crore saved (vendor claims).
- Rake module claims 10–20% better wagon utilisation and 5–10% cost savings (vendor claims).
- It is a transport management system that has added rail, so it approaches a rake as a shipment to be planned, not as a clock running in a yard.
- **Threat:** already inside the biggest accounts, and could extend into siding operations.

## 4. What overseas tools teach us

North American shippers have had demurrage software for years. The mature products do three things Indian tools don't yet:

1. **Encode the tariff.** Kaleris lets users load tariff agreements and computes charges from them.
2. **Predict the bill.** Railinc's TransmetriQ added a module in 2024 that estimates demurrage from terminal capacity before it is incurred.
3. **Support disputes.** Kaleris ties empty-car orders to demurrage disputes; Railserve lets the user check the railroad's charge against its own calculation.

None of them work with FOIS or Indian rules, where the rake is charged as one unit and free time depends on wagon type, mechanisation and terminal category. That rulebook is our moat if we encode it properly first.

## 5. Pricing

### What we know

| Reference | Price | Relevance |
|---|---|---|
| Peripass yard management (Europe) | €1,299 per site per month, billed annually, entry tier | Per-site SaaS for yards; published |
| Indian enterprise logistics SaaS (FarEye / Shipsy tier) | ₹25 lakh+ a year **(unverified, from a third-party guide)** | Order of magnitude for an Indian enterprise contract |
| Helious, Fretron, all overseas rail tools | Quote only | — |

### What the customer's savings can bear

From `02-customers-and-pitch.md`: a siding taking three rakes a day with a two-hour average overstay pays about ₹1.9 crore a year in demurrage alone.

### Proposed pricing (ours, to test)

| Tier | For | Price | Logic |
|---|---|---|---|
| Audit | Any prospect | Free | Our sales tool |
| Pilot | One siding, 8–12 weeks | ₹3–5 lakh fixed, or 20% of measured savings | Low enough to sign without a tender |
| Standard | Per siding, per year | ₹15–30 lakh, by rakes per day | Under 15% of typical exposure |
| Group | 3+ sidings | Volume discount plus network planning | Where Fretron-style buyers sit |

Software only, so no capital approval is needed on the customer's side. That is a deliberate contrast with an automation project.

## 6. Where we can be better

| Gap in the market | What we do | Why it wins |
|---|---|---|
| Nobody shows the cost in rupees, live | Every rake carries a running charge and the time of the next step | The decision-maker thinks in rupees, not hours |
| Nobody audits the railway's bill | Recompute every bill from our own timestamps and the rulebook | Finds money without changing operations at all |
| Nobody automates waivers | Evidence pack and application generated inside the 10-day window | Waivers are common and deadline-bound |
| Allowances go unclaimed | Bunching, shunting, tarpaulin and placement-gap rules applied automatically | Pure rulebook; no competitor mentions it |
| Outbound loading is ignored | Per-wagon load targets from weighbridge history | Punitive charges and idle freight are both large |
| Deployment takes a quarter | Phone, browser and data import; no PLC | Live in two to four weeks |
| Proof is a vendor claim | A savings ledger against the audit baseline, per rake | "The numbers speak for themselves" becomes a product feature |
| Tools stop at one plant | Group view: which siding should take which rake | Needed by multi-plant groups and terminal operators |

We should **not** compete on tippler automation, camera inspection or safety interlocks. Helious is ahead there, it needs hardware and site engineering, and it is complementary: a plant can run both.

## 7. Risks from competitors

- Helious adds bill audit and loading. Likely within a year if it sells; our lead is the rulebook depth and speed of deployment.
- Fretron bundles a siding module into existing contracts at large groups. Avoid those accounts at first.
- Railways extends its own portal to show free-time clocks. Possible, but it will never audit its own bills or plan a private yard.
- Data access through ULIP needs approval and its FOIS fields are undocumented publicly. Design so the product is useful with manual and imported data from day one, and treat the feed as an upgrade.

## Sources

- [Helious launches Rake Guard (ANI)](https://aninews.in/news/business/helious-launches-indias-first-ai-native-agentic-platform-for-rake-management20260508142943/)
- [Rake Guard: rake-to-tippler system (Helious)](https://www.helioustech.ai/blogs/rake-guard-indias-first-fully-automated-rake-to-tippler-system)
- [How to reduce coal rake turnaround time (Helious)](https://www.helioustech.ai/blogs/how-to-reduce-coal-rake-turnaround-time-by-1025-a-practical-guide)
- [Live rake tracking and FNR verification (Helious)](https://www.helioustech.ai/solutions/live-rake-tracking-fnr-verification)
- [Rake composition and wagon allocation planning (Fretron)](https://www.fretron.com/levers/rake-composition-wagon-allocation-planning/)
- [About Fretron](https://fretron.com/about)
- [Fretron company information](https://www.fretron.com/llm-info/)
- [Freight Business Development portal (Global Railway Review)](https://www.globalrailwayreview.com/article/117833/indian-railways-freight-business-development-portal/)
- [FOIS project page (CRIS)](https://cris.org.in/loadpage?page=proFOIS)
- [FreightFox seed round (Dealroom)](https://app.dealroom.co/news/note/freightfox-raises-50m-seed-to-scale-freight-intelligence-platform)
- [TransmetriQ demurrage solution (AJOT)](https://www.ajot.com/news/transmetriq-empowers-rail-shippers-to-control-fees-with-new-demurrage-solution)
- [Reduce rail demurrage fees (RSI Logistics)](https://www.rsilogistics.com/?p=12610)
- [Advanced Car Management (Kaleris)](https://kaleris.com/?p=2128)
- [Yard Tracker (Railserve)](https://railserve.com/?p=760)
- [Peripass pricing (rfp.wiki)](https://www.rfp.wiki/supply-chain-logistics-transportation/warehouse-management-systems/yard-management-software/yard-management-solutions/peripass)
- [Logistics software cost in India, 2026 (CodingClave)](https://codingclave.com/guides/logistics-management-software-cost-india-2026)
