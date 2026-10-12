# Plan: unloading prototype for siding operators

*Written 12 Oct 2026. Research behind this is in `docs/01`–`03`. This is the build plan for a clickable prototype, not the full product spec.*

## 1. What we are building and for whom

A prototype we can put in front of the people who run rail sidings at power, steel and cement plants. It has to make one point in under five minutes:

> **Every rake has a meter running in rupees. This shows the meter, tells you which rake to unload first, and checks the railway's bill.**

**Decisions already made**

| Decision | Choice |
|---|---|
| Direction | Unloading (inbound rakes) first |
| Data | Mocked. One simulated plant and one simulated day |
| Stack | Static HTML, CSS and plain JavaScript. No framework, no build step, no server logic |
| Screens | Two, plus one drawer |

"HTML/CSS only" is read here as *no framework and no backend*. The clock, the simulation and the train artwork need JavaScript, which the current app already uses.

**Not in the prototype:** real FOIS/ULIP data, logins, saving anything, loading (outbound), cameras, multi-plant view, mobile layout.

## 2. The demo story

The mock data is built to tell this story, in this order.

1. **It is 06:10 at a 2-tippler power plant.** One rake is unloading and inside free time. The meter reads ₹0 and counts down.
2. **Three more rakes are forecast to arrive within 90 minutes of each other.** A bunching warning appears.
3. **The plan.** Unloading in arrival order costs ₹X in demurrage. The suggested order costs ₹Y. The difference is shown before anything happens.
4. **Scrub time forward.** A rake crosses its free time. The meter starts stepping ₹8,700 at a time. The next step is 14 minutes away: finish now and save it.
5. **Open Money.** Last month's bills, recomputed. Two don't match our records. One rake arrived bunched and the 3-hour allowance was never claimed. One waiver deadline is in 3 days.
6. **The total.** Charged, avoidable, recoverable: three numbers for the month.

If an operator only remembers step 3 and step 5, the prototype has done its job.

## 3. Screens

Two screens. The header's seven icons shrink to two, plus the existing search, alerts and settings.

### Screen 1 · Yard (the current screen, re-purposed)

> **Superseded for layout and density by `design.md` §11**, which keeps each region as quiet as it is today and moves detail behind hover. The table below remains as the list of features the screen must carry, not as what is visible by default.

The layout stays. What each region means changes.

| Region today | Becomes | Features it carries |
|---|---|---|
| Bottom strip of flatcar cards | **Today's rakes**, one card per rake, ordered by time. Each card shows a mini train, commodity, status, and its meter | Live clock, arrival forecast |
| Centre stage with one flatcar | **The selected rake** as a train of open wagons at the tippler. Loaded wagons show coal; tipped wagons are empty. Selecting a rake rolls it in with the existing animation | Live clock (progress), wagon view |
| `+` button on the stage | Removed. Replaced by a progress label: "31 of 58 tipped" | — |
| Prev / next arrows | Step between rakes | — |
| Left panel "Flatcar Details" | **Rake details and the meter**: FNR, origin, wagons, tonnes, placed at, free until, charge so far, next step in mm:ss | Rulebook engine, live clock |
| Left panel dot chart | **Cost curve**: charge against time for this rake, with "now" marked and the stepped rate visible | Rulebook engine |
| Right panel, top card | **Plan**: which tippler and line this rake is assigned to, its place in the queue, and the saving against arrival order | Yard plan |
| Right panel, bottom card | **Owed to you**: allowances this rake qualifies for (bunching, shunting, tarpaulin) and whether they've been applied | Allowance claims |
| Zoom slider | **Time scrubber** for the simulated day, with play/pause | Demo control |
| Bottom-right grid button | Toggles the centre stage between **Train view** and **Board view** | Yard plan |
| Bottom-right search, settings | Find a rake by FNR; open the rules drawer | — |

**Board view** replaces the centre stage only. It is a timeline: one row per tippler/line, one bar per rake, free-time limit drawn on each bar, the part past free time in orange. A switch flips between "arrival order" and "suggested order" and the total at the top changes. Everything around it stays put, so it is a mode, not a screen.

### Screen 2 · Money

Same header and the same three-column grid, so it reads as the same product.

| Region | Content | Features |
|---|---|---|
| Left panel | Month totals: charged, avoidable, recoverable, recovered. Small bar chart by week | Savings ledger |
| Centre | Table of rakes for the month: date, FNR, hours over, billed, our figure, difference, status | Bill audit |
| Right panel, top | **This bill, recomputed**: placement, release, free time, allowances, slab-by-slab charge, and where it differs from the railway's bill | Bill audit, rulebook engine |
| Right panel, bottom | **Claim**: grounds, evidence checklist, days left to file, a "Draft application" button that shows a pre-filled letter | Waiver and allowance claims |
| Bottom strip | Open claims as cards, ordered by deadline | Claims |

### Drawer · Rules

Opens from any settings cog. Shows the free-time table, the rate slabs and the allowances actually in force for this siding, with the circular each comes from. No editing in the prototype. Its purpose is trust: every number on screen can be traced to a rule.

### Where every planned feature lands

| # | Feature | Prototype? | Where |
|---|---|---|---|
| 1 | Rulebook engine | Yes | Under everything; visible in the meter, cost curve, bill recompute and Rules drawer |
| 2 | Live rake clock | Yes | Yard: left panel and rake cards |
| 3 | Savings ledger | Yes | Money: left panel |
| 4 | Bill audit | Yes (mock bills) | Money: table and top-right card |
| 5 | Waiver and allowance claims | Yes (static draft) | Yard: "Owed to you"; Money: claim card |
| 6 | Arrival forecast | Yes (scripted) | Yard: rake cards and bunching banner |
| 7 | Yard plan | Yes | Yard: Plan card and Board view |
| 8 | Loading plan | No | Later: wagon detail on the Yard stage |
| 9 | Group view | No | Later: a third screen |
| 10 | Camera reading | No | Later: feeds data, adds no screen |

## 4. Mock data

One file, `data.js`, describing a plant and a day.

**Plant** — "Kalinga Thermal, Siding A" (invented).
- Private siding, mechanised unloading, open wagons: **7 h free time**, plus 2 h shunting allowance.
- 2 wagon tipplers at 19 tips an hour (industry sources put real-world rates at 18–20), so a 58-wagon rake takes about 3 h 05 of tipping. Add 35 min placement and 25 min release.
- Handling capacity 4 rakes a day (for the bunching rule).

**Rakes** — 6 for the simulated day, each with: FNR, origin, commodity, wagon type (BOXNHL), wagon count (58), tonnes (~4,100), forecast arrival, actual arrival, placement, and per-wagon tip times derived from the plan.

**Scripted events**
- 3 rakes arriving within 90 minutes (bunching).
- Tippler 2 down for 40 minutes mid-morning.
- One rake with a wagon that jams, holding the whole rake.

**Last month** — about 90 rakes with billed amounts. Seeded so that:
- 2 bills use a wrong placement time;
- 5 bunched rakes were never given the allowance;
- 1 waiver is filed, 1 is due in 3 days, 1 was missed.

All numbers are generated from the rules engine plus the seeded errors, so the screens stay consistent with each other.

## 5. Logic

Everything here is plain arithmetic or a small search. No machine learning in the prototype.

### 5.1 Rules engine (`rules.js`)

Pure functions over tables copied from the Railway Board compendium (as on 03.04.2024).

```
freeTime(siding, wagonType, operation, mechanised)      → minutes
allowances(rake, siding, dayContext)                     → [{rule, minutes, applied}]
charge(placedAt, releasedAt, freeMinutes, wagons)        → {hoursOver, slabs[], total}
nextStep(now, placedAt, freeMinutes, wagons)             → {at, amount}
```

- Base rate ₹150 per wagon per hour **or part of an hour**; the rake is one unit.
- Slabs: base to 6 h over, +10% to 12 h, +25% to 24 h, +50% to 48 h, 2× to 72 h, 3× beyond.
- Allowances: bunching 3 h, shunting 2 h, tarpaulin 1 h, placement gaps over 2 h.
- Each rule carries its source reference for the Rules drawer.

**To confirm before showing to operators:** whether a higher slab applies only to the hours inside it (assumed) or to the whole overstay. Check against a real bill.

### 5.2 Simulation (`sim.js`)

A function of time, not a running loop: `stateAt(t)` returns every rake's status, wagons tipped, and meter. The scrubber just changes `t`. This makes the demo repeatable and lets us jump straight to any moment.

### 5.3 Yard plan (`plan.js`)

- Input: rakes with arrival times, tipplers with availability.
- Try every order of rakes across the tipplers (6 rakes, 2 tipplers is a few thousand cases) and score each by total charge using the rules engine.
- Output: best order, its cost, and the cost of arrival order for comparison.
- An exact search is fine at this size. A scheduling solver only becomes necessary beyond roughly 10 rakes.

### 5.4 Forecast

Scripted: each rake has a forecast arrival that tightens as it approaches. Bunching is flagged when arrivals in a calendar day exceed handling capacity. The real version starts from historical averages per route.

### 5.5 Bill audit (`audit.js`)

For each of last month's rakes: recompute the charge from our timestamps and applicable allowances, compare with the billed amount, and classify the difference as *timestamp mismatch*, *allowance not applied*, or *matches*. Claim deadlines are 10 days from accrual, or the end of the following month for large sidings.

## 6. Artwork changes

The existing renderer (`art.js`) and animation (`train.js`, `motion.js`) stay. Additions:

| Item | Notes |
|---|---|
| Open wagon (BOXNHL) | New body on the existing bogies and couplers: boxy open top, side stanchions, end doors. Two states: loaded with a coal heap, and empty |
| Coal load | Irregular heap with highlights; slightly different per wagon |
| Tippler | A simple portal frame the train passes through at the stage centre. It marks which wagon is being tipped. No rotating animation in the prototype |
| Rake length | 58 wagons at a shorter pitch than the flatcar. Only the visible few are drawn each frame, which the engine already does |
| Thumbnails | Rake cards show a short train with a fill bar for progress, rather than 58 tiny wagons |

The container art is kept in the file for the later loading/containers module.

## 7. Files

```
index.html        Yard screen
money.html        Money screen
styles.css        shared tokens and layout (existing, extended)
app.js            Yard wiring (existing, reworked)
money.js          Money wiring
data.js           mock plant, day and month
rules.js          rules engine
sim.js            state of the yard at time t
plan.js           yard sequencing
audit.js          bill recomputation
art.js            artwork (existing, plus open wagon and tippler)
train.js          stage engine (existing, generalised from flatcars to rakes)
motion.js         motion maths (existing, unchanged)
```

Two HTML files sharing one stylesheet keeps it static and simple. `rules.js`, `plan.js` and `audit.js` have no DOM code, so they can be checked from the command line.

## 8. Build order

Each step ends with something that can be looked at or run.

| # | Step | Done when |
|---|---|---|
| 1 | Rules engine | Command-line checks reproduce the worked table in `docs/02` (1 h = ₹8,700; 10 h = ₹90,480; 24 h = ₹2,40,120) |
| 2 | Mock data and simulation | `stateAt(t)` gives a sensible yard at five chosen times; totals are consistent |
| 3 | Yard screen, data only | Left panel, rake cards and right cards show live values from the simulation; scrubber works |
| 4 | Open wagon art and rake on the stage | Selected rake rolls in; loaded/empty wagons match the simulation; still 60 fps |
| 5 | Yard plan and Board view | Suggested order beats arrival order on the seeded day, and the saving shown equals the difference in computed charges |
| 6 | Money screen | Table, recompute card and claim card agree with `audit.js` to the rupee |
| 7 | Rules drawer and polish | Every figure on screen can be traced to a rule; demo story runs start to finish without dead ends |
| 8 | Dry run | Walk the six-step demo story on a laptop at 1440×900 and at 1920×1080 |

Steps 1–2 carry the credibility. Steps 3–5 are the first demo. Step 6 is the second half of the pitch.

## 9. What changes from the current app

- Branding: the SBB mark and the Swiss/BNSF names came from the reference mock-up. Replace with a neutral product name and Indian wagon numbering before showing anyone. **Name to be decided.**
- "Flatcar ID", container cards, the `+` slot and the 40CN/53CN tray go.
- The typo "Oprerator" in the header gets fixed.
- The avatar is still a crop from the mock-up and needs replacing.

## 10. Risks and open questions

| Item | Why it matters | Action |
|---|---|---|
| Slab interpretation | Changes every charge over 6 h | Get one real demurrage bill |
| Free time at the target plant | 7 h vs 5 h (zonal reductions for coal and ore) vs engine-on-load terms | Make it a siding setting; ask in the first interview |
| When the clock really starts | We assume placement; plants may see it differently in practice | Ask who records placement and how often records disagree |
| Whether operators can re-order rakes | The plan's value depends on it | Ask before leaning on step 3 of the demo |
| ULIP data fields | Decides whether the live version needs manual entry | Register on ULIP and read the FOIS catalogue |
| Too much on one screen | Operators may be on small or shared monitors | Test at 1440×900 in step 8 |

## 11. After the prototype

If operators respond: write `spec.md` for the real product (data capture, ULIP feed, accounts, the claims workflow), then add loading with per-wagon weight targets, then the group view.
