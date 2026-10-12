# 01 · Market evaluation and verdict

*Desk research, October 2026. Figures are from public sources linked at the bottom; anything marked **(vendor claim)** or **(unverified)** has not been independently confirmed.*

## Verdict

**Worth pursuing, on two conditions:**

1. The customer is **private industry with its own rail siding**, not Indian Railways.
2. The product is about **rake turnaround and loading cost at bulk sidings**, not container stacking.

If we cannot get five to eight operations people at such plants to talk to us within a few weeks, treat it as a portfolio project. That inability would itself be the signal that selling will be too slow.

## Why the market is real

| Fact | Figure |
|---|---|
| Indian Railways freight loaded, FY2025-26 (provisional) | ~1,670 million tonnes, a record |
| Freight earnings, FY2025-26 | ~₹1.78 lakh crore |
| Largest commodity | Coal, ~51% of tonnage; iron ore ~11%; cement ~9% |
| Official ambition | 3,000 million tonnes by 2030 (needs ~12–13% growth a year from here) |
| Gati Shakti Cargo Terminals commissioned | 142, handling 146 million tonnes in FY2025-26 |
| Further terminals approved in principle | 310 |
| Private investment in those terminals | ~₹10,000 crore |
| CONCOR share of container rail | ~54%, down from ~74% in FY2019-20 |

The volume is in bulk goods moved in full trainloads ("rakes"), loaded and unloaded at private sidings owned by power, steel, cement, mining and port companies. Containers are a small, concentrated segment with a handful of buyers.

## Why Indian Railways is the wrong customer

- Its IT arm, CRIS, already runs FOIS, the national freight system: rake tracking, terminal booking, receipts, payments. 95% of demands and 97–98% of railway receipts are already electronic.
- Railways announced its own live freight tracking app in February 2026.
- The startup route in ("StartUps for Railways") is a matched grant of up to ₹1.5 crore; 23 projects have been awarded. It is a prototype programme, not a market.

## Who pays, and for what

Private siding owners carry three costs that the railway bills them for and that software can reduce:

1. **Demurrage** — a per-wagon, per-hour charge when a rake overstays its free time.
2. **Punitive charges for overloading** — a multiple of freight on excess weight.
3. **Idle freight from underloading** — freight is charged on the wagon's rated capacity, so every tonne not loaded is freight paid for nothing.

Detail and worked numbers are in `02-customers-and-pitch.md`.

## For and against

**For**
- Large, growing market with measurable, itemised costs. The railway sends the customer a bill, so savings can be proved line by line.
- Hundreds of private sidings, most still coordinated by radio, registers and spreadsheets.
- Incumbent tools are weak on interface and on the commercial side (bills, disputes), which is where a software-first team can win.

**Against**
- The original design is a container-stacking screen, the smallest segment. The bulk opportunity is a different product.
- Heavy industry buys slowly and through relationships.
- We would be a fast follower. Helious launched Rake Guard in May 2026; Fretron sells a rake module.
- Rake data access runs through ULIP, the government's logistics data gateway, which exposes FOIS by FNR to approved companies (register, submit a use case, sign an NDA, pass an integration demo). The exact fields returned are not public, so whether it includes placement and release times is still unknown. *(Corrected 12 Oct 2026; an earlier version said no programmatic route existed.)*

## What we don't know

- No national total for demurrage collected was found.
- Current punitive-charge multipliers (2022 amendment) could not be read from a primary source.
- Competitor pricing is unpublished everywhere.
- Which FOIS fields ULIP actually returns (wagon list, weights, placement/release times), and how long approval takes. A vendor guide says 7–14 working days for sandbox access **(unverified)**.

## Sources

- [Indian Railways sets new freight record in FY26 (Maritime Gateway)](https://www.maritimegateway.com/indian-railways-sets-new-freight-record-in-fy26-with-1670-mt-cargo)
- [Is Mission 3000 MT achievable? (Maritime Gateway)](https://www.maritimegateway.com/is-indian-railways-ambitious-mission-3000-mt-achievable/)
- [Roadblocks to Mission 3,000 MT (TERI)](https://www.teriin.org/index.php/research-paper/roadblocks-indian-railways-mission-3000-mt)
- [Demand for Grants 2025-26: Railways (PRS)](https://prsindia.org/files/budget/budget_parliament/2025/DFG_Analysis_2025-26_Railways.pdf)
- [142 Gati Shakti Cargo Terminals operational (NBM&CW)](https://www.nbmcw.com/news/logistics-ports-waterways/142-gati-shakti-cargo-terminals-operational-attract-rs-10-000-crore-private-investment.html)
- [CONCOR rating rationale (ICRA)](https://www.icra.in/Rating/GetRationalReportFilePdf?id=138264)
- [CONCOR company data (Screener)](https://www.screener.in/company/CONCOR)
- [Indian Railways' freight IT system (Global Railway Review)](https://www.globalrailwayreview.com/article/131478/indian-railways-freight-it-system-digitally-integrated-value-chain/)
- [Freight trains to get live tracking (The Hitavada)](https://www.thehitavada.com/Encyc/2026/2/6/freight-trains-to-get-passenger-like-live-tracking-facility-.html)
- [StartUps for Railways awards (India Infra Hub)](https://indiainfrahub.com/?p=30562)
- [Unified Logistics Interface Platform overview (Vikaspedia)](https://en.vikaspedia.in/viewcontent/e-governance/online-citizen-services/government-to-business-services-g2b/unified-logistics-interface-platform?lgn=en)
- [ULIP: NDA and data access process (PIB)](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1864095&reg=48&lang=2)
- [ULIP and FOIS integration (Intugine)](https://www.intugine.com/blog-detail/unified-logistics-interface-platform-revolutionising-indian-logistics-with-transparency-accessibility-and-lower-costs)
- [Helious launches Rake Guard (ANI)](https://aninews.in/news/business/helious-launches-indias-first-ai-native-agentic-platform-for-rake-management20260508142943/)
