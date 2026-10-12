// A mocked day at one siding. Pure functions of time: given the minute of the day, say
// where every rake is, how far through unloading it is, and what its meter reads.
// Nothing here touches the page.
const Sim = (() => {
  const WAGONS = 58;
  const TIP = 60 / 19;            // minutes per wagon at 19 tips an hour
  const FORM = 25;                // minutes to form up and release once the last wagon is tipped
  const FREE = 7 * 60;            // free time, mechanised unloading of open wagons
  const RATE = 150;               // rupees per wagon per hour, or part of an hour
  const SLABS = [[6, 1], [12, 1.1], [24, 1.25], [48, 1.5], [72, 2], [Infinity, 3]];   // hours over -> multiplier

  const at = (h, m) => h * 60 + m;
  // eta: reaches the gate · placed: free time starts · ready: the earliest it can be tipped
  const RAKES = [
    { slot: "S615", id: "BNSF270663", from: "Dipka", tonnes: 4104, eta: at(-3, 25), placed: at(-2, 10), ready: at(-1, 15), tippler: 1, line: 1 },
    { slot: "S616", id: "BNSF270664", from: "Gevra", tonnes: 4121, eta: at(0, 0), placed: at(0, 30), ready: at(1, 44), tippler: 2, line: 2 },
    { slot: "S617", id: "BNSF270665", from: "Kusmunda", tonnes: 4096, eta: at(0, 20), placed: at(0, 55), ready: at(6, 49), tippler: 1, line: 3 },
    { slot: "S618", id: "BNSF270666", from: "Gevra", tonnes: 4118, eta: at(3, 15), placed: at(3, 49), ready: at(8, 14.5), tippler: 2, line: 4 },
    { slot: "S619", id: "BNSF270667", from: "Dipka", tonnes: 4109, eta: at(6, 0), placed: at(6, 34), ready: at(10, 2), tippler: 1, line: 3 },
    { slot: "S620", id: "BNSF270668", from: "Korba", tonnes: 4127, eta: at(8, 25), placed: at(8, 59), ready: at(11, 28), tippler: 2, line: 4 },
    { slot: "S621", id: "BNSF270669", from: "Gevra", tonnes: 4113, eta: at(11, 40), placed: at(12, 10), ready: at(13, 15), tippler: 1, line: 3 },
    { slot: "S622", id: "BNSF270670", from: "Kusmunda", tonnes: 4102, eta: at(13, 5), placed: at(13, 35), ready: at(14, 41), tippler: 2, line: 4 },
  ];
  // Extra free time a rake is entitled to but has not been given. Bunching: it arrived on
  // top of others, beyond what the siding can handle, so the rules allow three more hours.
  const BUNCHED = { S617: 1, S620: 1, S621: 1, S622: 1 };
  for (const r of RAKES) r.owed = BUNCHED[r.slot] ? { rule: "Bunching", minutes: 180 } : null;

  // The day's plan. A tippler takes its rakes one at a time in the order they become ready,
  // with ten minutes between them to clear the line. Free time is the standard seven hours,
  // plus any allowance that has actually been applied. Everything else follows from this, so
  // moving a rake to the other tippler or holding it back re-times every rake behind it.
  //   hold   minutes the rake is deliberately kept back once the tippler is free
  //   claim  "none" | "filed" | "applied", for the allowance it is owed
  function plan(rakes) {
    for (const r of rakes) { r.wagons = WAGONS; r.hold = r.hold || 0; r.claim = r.owed ? r.claim || "none" : "none"; }
    for (const tippler of new Set(rakes.map((r) => r.tippler))) {
      let clear = -Infinity;
      for (const r of rakes.filter((x) => x.tippler === tippler).sort((a, b) => a.ready - b.ready)) {
        r.start = Math.max(r.ready, clear) + r.hold;          // a hold counts from the earliest it could have started
        r.done = r.start + WAGONS * TIP;
        r.released = r.done + FORM;
        clear = r.done + 10;
      }
    }
    for (const r of rakes) r.freeUntil = r.placed + FREE + (r.claim === "applied" ? r.owed.minutes : 0);
    return rakes;
  }
  plan(RAKES);
  // The rakes sharing a tippler, in the order they are tipped.
  const queue = (rakes, tippler) => rakes.filter((r) => r.tippler === tippler).sort((a, b) => a.start - b.start);

  // Demurrage for a whole number of hours past free time. Each hour is charged at the rate
  // of the band it falls in (assumed; to be confirmed against a real bill).
  function charge(hours, wagons = WAGONS) {
    let total = 0;
    for (let h = 1; h <= hours; h++) total += RATE * wagons * SLABS.find(([upTo]) => h <= upTo)[1];
    return Math.round(total);
  }
  const hoursOver = (minutes) => (minutes > 0 ? Math.ceil(minutes / 60 - 1e-9) : 0);

  const clock = (min) => { const m = ((Math.floor(min) % 1440) + 1440) % 1440; return String((m / 60) | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  const span = (min) => { const m = Math.max(0, Math.floor(min)); return m >= 60 ? `${(m / 60) | 0}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`; };
  const rupees = (n) => "₹" + n.toLocaleString("en-IN");

  // Everything the interface needs to know about rake `r` at minute `t`.
  function state(r, t) {
    const status = t < r.eta ? "enroute" : t < r.placed ? "placing" : t < r.start ? "waiting" : t < r.done ? "unloading" : t < r.released ? "forming" : "released";
    const here = status !== "enroute";
    const tipped = Math.max(0, Math.min(WAGONS, Math.floor((t - r.start) / TIP + 1e-9)));
    const until = Math.min(t, r.released);                       // the meter stops at release
    const over = here ? Math.max(0, until - r.freeUntil) : 0, hours = hoursOver(over), cost = charge(hours);
    const left = r.freeUntil - t;
    const s = {
      status, tipped, over, hours, cost, left,
      paint: here ? "orange" : "grey",
      loaded: tipped < WAGONS,
      // which vehicle of the rake stands on the stage: -1 the locomotive, WAGONS the brake van
      view: status === "enroute" || status === "placing" ? -1 : status === "forming" || status === "released" ? WAGONS : Math.min(tipped, WAGONS - 1),
      due: cost > 0 && status !== "released",
      // what the meter would read had the allowance been applied
      costIfClaimed: charge(hoursOver(over - (r.owed && r.claim !== "applied" ? r.owed.minutes : 0))),
    };
    s.label = { enroute: "On the way", placing: "Being placed", waiting: "Waiting", unloading: "Unloading", forming: "Forming up", released: "Released" }[status];
    s.where = status === "enroute" ? `${Math.max(1, Math.round((r.eta - t) * 0.63))} km out` : status === "placing" ? "At the gate"
      : status === "waiting" ? `Line ${r.line}` : status === "unloading" ? `Tippler ${r.tippler}` : status === "forming" ? `Tippler ${r.tippler}`
      : cost ? `${rupees(cost)} paid` : "No charge";
    s.fact = status === "enroute" ? `ETA ${clock(r.eta)}` : status === "placing" ? "Being placed" : status === "released" ? `Released ${clock(r.released)}`
      : cost ? rupees(cost) : `${span(left)} left`;
    return s;
  }

  return { RAKES, WAGONS, TIP, FREE, RATE, charge, hoursOver, plan, state, queue, clock, span, rupees };
})();

if (typeof module !== "undefined") module.exports = Sim;
