// Mock books for the Bills and Savings screens: the month's railway bills beside our own
// record of each stay, and six months of totals. Pure data and arithmetic; no page code.
// Clock times are minutes after midnight on the day the rake was placed.
const Ledger = (() => {
  const at = (h, m) => h * 60 + m;
  const TODAY = 13;                                   // 13 October
  // `ours` is what our gate and tippler logs say; `billed` is what the railway charged on.
  // `owed` is extra free time the rules allow that the bill ignores. `released` is the day
  // of the month the stay ended (negative for last month), which starts the ten-day window.
  const BILLS = [
    { no: "DC/1029", date: "28 Sep", day: -2, rake: "BNSF270598", from: "Dipka", ours: [at(1, 10), at(11, 5)], billed: [at(1, 10), at(11, 5)], owed: { rule: "Bunching", minutes: 180 }, claim: "none" },
    { no: "DC/1038", date: "02 Oct", day: 2, rake: "BNSF270611", from: "Gevra", ours: [at(2, 15), at(8, 25)], billed: [at(2, 15), at(8, 25)], claim: "none" },
    { no: "DC/1041", date: "04 Oct", day: 4, rake: "BNSF270624", from: "Korba", ours: [at(5, 40), at(15, 2)], billed: [at(5, 40), at(15, 2)], claim: "none" },
    { no: "DC/1044", date: "05 Oct", day: 5, rake: "BNSF270630", from: "Gevra", ours: [at(3, 49), at(11, 42)], billed: [at(3, 15), at(11, 42)], wrong: "placed", proof: "Gate log", claim: "filed" },
    { no: "DC/1047", date: "07 Oct", day: 7, rake: "BNSF270638", from: "Kusmunda", ours: [at(0, 55), at(11, 35)], billed: [at(0, 55), at(11, 35)], owed: { rule: "Bunching", minutes: 180 }, claim: "none" },
    { no: "DC/1049", date: "08 Oct", day: 8, rake: "BNSF270641", from: "Dipka", ours: [at(9, 5), at(15, 40)], billed: [at(9, 5), at(15, 40)], claim: "none" },
    { no: "DC/1052", date: "09 Oct", day: 9, rake: "BNSF270645", from: "Gevra", ours: [at(5, 15), at(13, 5)], billed: [at(5, 15), at(14, 10)], wrong: "released", proof: "Tippler log", claim: "none" },
    { no: "DC/1055", date: "11 Oct", day: 11, rake: "BNSF270652", from: "Korba", ours: [at(4, 20), at(12, 10)], billed: [at(3, 30), at(12, 10)], wrong: "placed", proof: "Gate log", claim: "won" },
  ];

  // Everything that follows from one bill: both sums, the gap, and what can still be done.
  function audit(b) {
    const stay = (p) => p[1] - p[0], over = (p) => Math.max(0, stay(p) - Sim.FREE);
    const hours = Sim.hoursOver(over(b.ours)), billedHours = Sim.hoursOver(over(b.billed));
    const fair = Sim.charge(hours), billed = Sim.charge(billedHours);
    const withAllowance = b.owed ? Sim.charge(Sim.hoursOver(over(b.ours) - b.owed.minutes)) : fair;
    const overcharged = billed - fair, claimable = fair - withAllowance, back = overcharged + claimable;
    const lastDay = b.day + 10, left = lastDay - TODAY;            // first application within ten days
    const kind = !billed ? "clean" : overcharged ? "overcharged" : claimable ? "allowance" : "matches";
    const state = !back ? "none" : b.claim === "won" ? "won" : b.claim === "filed" ? "filed" : left < 0 ? "missed" : "open";
    // what the stay should cost once everything owed is counted, and the free time that gives it
    const free = Sim.FREE + (b.owed ? b.owed.minutes : 0), dueHours = Sim.hoursOver(stay(b.ours) - free);
    return { stay: stay(b.ours), billedStay: stay(b.billed), hours, billedHours, fair, billed, overcharged, claimable, back, due: billed - back, dueHours, free, lastDay, left, kind, state };
  }

  // Six months of the siding's demurrage. `baseline` is what the same traffic would have
  // cost handled the old way; the difference is split into what planning avoided and what
  // claims brought back. The product went in during July.
  const MONTHS = [
    { id: "MAY 2026", name: "May", rakes: 118, baseline: 2862000, avoided: 0, recovered: 0 },
    { id: "JUN 2026", name: "June", rakes: 124, baseline: 3010000, avoided: 0, recovered: 0 },
    { id: "JUL 2026", name: "July", rakes: 121, baseline: 2934000, avoided: 357000, recovered: 139000 },
    { id: "AUG 2026", name: "August", rakes: 126, baseline: 3045000, avoided: 922000, recovered: 331000 },
    { id: "SEP 2026", name: "September", rakes: 119, baseline: 2880000, avoided: 1218000, recovered: 400000 },
    { id: "OCT 2026", name: "October", rakes: 51, baseline: 1235000, avoided: 566000, recovered: 174000, partial: "to 13 Oct" },
  ];
  // Where the charges that were still paid came from, as shares.
  const CAUSES = [["Bunching", 0.46], ["Tippler down", 0.27], ["Late crew", 0.17], ["Other", 0.1]];
  const LEVEL = 1300000;                               // a level load of coal stands for this much; more piles up higher
  for (const m of MONTHS) { m.saved = m.avoided + m.recovered; m.paid = m.baseline - m.saved; m.level = m.paid / LEVEL; m.outline = m.baseline / LEVEL; }

  // ₹12,50,000 reads better as ₹12.5 L at this size
  const lakh = (n) => (n >= 100000 ? "₹" + (n / 100000).toFixed(n >= 1000000 ? 1 : 2).replace(/\.?0+$/, "") + " L" : Sim.rupees(n));

  return { TODAY, BILLS, MONTHS, CAUSES, audit, lakh };
})();
