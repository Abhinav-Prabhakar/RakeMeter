// Plays the day the backend planned. A rake arrives as a track: the moments its status
// changes and the moments its meter steps. Reading a track at one minute needs no rules
// and no round trip, which is what lets the day be scrubbed. `Player.at` is the same sum
// as the backend's timeline.at, and is checked against it.
const Player = (() => {
  // { status, here, tipped, loaded, view, over, hours, cost, left, due, costIfClaimed }
  function at(track, t) {
    const status = t < track.eta ? "enroute" : t < track.placed ? "placing" : t < track.start ? "waiting" : t < track.done ? "unloading" : t < track.released ? "forming" : "released";
    const here = status !== "enroute", wagons = track.wagons;
    const tipped = Math.max(0, Math.min(wagons, Math.floor((t - track.start) / track.tip + 1e-9)));
    const until = Math.min(t, track.released);                       // the meter stops at release
    // the meter reads the last step whose minute has passed
    const read = (steps) => { let s = null; if (here) for (const x of steps) { if (x.at < until) s = x; else break; } return s; };
    const step = read(track.steps), claimed = read(track.stepsIfClaimed);
    const cost = step ? step.total : 0;
    return {
      status, here, tipped, loaded: tipped < wagons,
      // which vehicle of the rake stands on the stage: -1 the locomotive, `wagons` the brake van
      view: status === "enroute" || status === "placing" ? -1 : status === "forming" || status === "released" ? wagons : Math.min(tipped, wagons - 1),
      over: here ? Math.max(0, until - track.freeUntil) : 0,
      hours: step ? step.hours : 0, cost,
      left: track.freeUntil - t,
      due: cost > 0 && status !== "released",
      costIfClaimed: claimed ? claimed.total : 0,
    };
  }
  return { at };
})();

// What the page knows about the yard: the rulebook the backend sent, how to say a time or
// a sum of money, and how to put a rake's state into words. No arithmetic of its own
// beyond that.
const Yard = (() => {
  let rules = { wagons: 58, freeMinutes: 420, rate: 150, charges: [0], allowances: [], holds: [0], liveries: [], causes: [] };
  const clock = (min) => { const m = ((Math.floor(min) % 1440) + 1440) % 1440; return String((m / 60) | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  const span = (min) => { const m = Math.max(0, Math.floor(min)); return m >= 60 ? `${(m / 60) | 0}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`; };
  const rupees = (n) => "₹" + n.toLocaleString("en-IN");
  // ₹12,50,000 reads better as ₹12.5 L at this size
  const lakh = (n) => (n >= 100000 ? "₹" + (n / 100000).toFixed(n >= 1000000 ? 1 : 2).replace(/\.?0+$/, "") + " L" : rupees(n));
  // The bill for a whole number of hours over, from the backend's table.
  const charge = (hours) => rules.charges[Math.max(0, Math.min(rules.charges.length - 1, hours))];

  // Everything the interface says about rake `r` at minute `t`.
  function state(r, t) {
    const s = Player.at(r, t), status = s.status;
    s.paint = s.here ? "orange" : "grey";
    s.label = { enroute: "On the way", placing: "Being placed", waiting: "Waiting", unloading: "Unloading", forming: "Forming up", released: "Released" }[status];
    s.where = status === "enroute" ? `${Math.max(1, Math.round((r.eta - t) * 0.63))} km out` : status === "placing" ? "At the gate"
      : status === "waiting" ? `Line ${r.line}` : status === "unloading" ? `Tippler ${r.tippler}` : status === "forming" ? `Tippler ${r.tippler}`
      : s.cost ? `${rupees(s.cost)} paid` : "No charge";
    s.fact = status === "enroute" ? `ETA ${clock(r.eta)}` : status === "placing" ? "Being placed" : status === "released" ? `Released ${clock(r.released)}`
      : s.cost ? rupees(s.cost) : `${span(s.left)} left`;
    return s;
  }
  // The rakes sharing a tippler, in the order they are tipped.
  const queue = (rakes, tippler) => rakes.filter((r) => r.tippler === tippler).sort((a, b) => a.start - b.start);

  return { get rules() { return rules; }, use: (r) => { rules = r; }, clock, span, rupees, lakh, charge, state, queue };
})();
