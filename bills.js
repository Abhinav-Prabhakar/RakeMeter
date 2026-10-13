// The Bills screen: a month of railway bills, kept by the backend.
//
// The month's statement is the cover sheet of its stack. On the stage the months hang as
// receipts from a rail: a receipt is as long as what was paid, and what was saved is the
// piece torn off below it. Behind the cover, each bill is one sheet of paper that is
// checked in front of you: a pencil tick down each line that agrees with our record, an
// orange marker and a pen note on any that does not, then the stamp.
// Every panel has two faces, one for the month and one for a bill.
const Bills = (() => {
  let months = [], mi = 0;                 // the months on the books, and the one in view
  const stacks = new Map();                // month id -> its bills, fetched once
  let bills = [], sel = 0;                 // sel 0 is the month's statement; n is bill n - 1
  let cause = 0, ready = false, loaded = false, busy = 0, asked = 0, drawSlider = () => {}, railKey = "";
  const screen = $("screenBills"), paper = $("paper"), strip = $("bStrip"), tip = $("billTip"), rail = $("mRail");
  const INK = { orange: "#d9540f", ink: "#33363c", faint: "#9a968c", blue: "#1677e6" };
  const R = Yard.rupees, L = Yard.lakh, FREE = Yard.rules.freeMinutes;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const short = (iso) => `${iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;          // 2026-10-17 -> 17 Oct
  const month = () => months[mi], bill = () => bills[sel - 1];
  const share = (m) => (m.baseline ? m.saved / m.baseline : 0);

  // What the stamp, the card pill and the cards on the right say about a bill.
  function verdict(b) {
    const a = b.audit, sum = R(a.back);
    if (a.kind === "clean") return { stamp: ["Nothing", "to pay"], ink: "faint", pill: "No charge" };
    if (a.state === "none") return { stamp: ["Checked", "Correct"], ink: "ink", pill: "Correct" };
    if (a.state === "won") return { stamp: ["Refunded", sum], ink: "ink", pill: "Refunded" };
    if (a.state === "filed") return { stamp: ["Claim filed", sum], ink: "orange", pill: "Filed" };
    if (a.state === "missed") return { stamp: ["Too late", sum], ink: "faint", pill: "Missed" };
    return { stamp: [a.kind === "overcharged" ? "Overcharged" : "Allowance due", sum], ink: "orange", pill: `${sum} back`, due: true };
  }

  // ================================================================ a bill
  // ---------------------------------------------------------------- the sheet of paper
  const FLAG = `<span class="p-flag"><svg viewBox="8 2 24 16"><g fill="none" stroke="#f4f1e8" stroke-width="2.7"><path d="M15.6 3 9 10l6.6 7M24.4 3 31 10l-6.6 7M11 10h18M20 3v14"/></g></svg></span>`;
  const TICK = `<svg class="tick" viewBox="0 0 15 13"><path d="M1.5 7.2 5.4 11 13.4 1.6"/></svg>`;
  function sheet(b) {
    const a = b.audit, v = verdict(b), W = Yard.rules.wagons;
    // each printed line: what the bill says, whether we agree, and what pointing at it explains
    const wrongAt = (k) => b.wrong === k;
    const lines = [
      ["Placed", Yard.clock(b.billed[0]), wrongAt("placed") && `our ${b.proof.toLowerCase()} says ${Yard.clock(b.ours[0])}`, "Free time starts the moment the rake is placed"],
      ["Released", Yard.clock(b.billed[1]), wrongAt("released") && `our ${b.proof.toLowerCase()} says ${Yard.clock(b.ours[1])}`, "The meter stops when the last wagon is released"],
      ["Detained", Yard.span(a.billedStay), false, "Released, less placed"],
      ["Free time", Yard.span(FREE), b.owed && a.claimable > 0 && `+${b.owed.minutes / 60} h ${b.owed.rule.toLowerCase()} not given`, "Seven hours: open wagons, unloaded by machine"],
      ["Hours charged", String(a.billedHours), false, "Every hour past free time, or part of one"],
      ["Rate", `₹${Yard.rules.rate} × ${W}`, false, `₹${Yard.rules.rate} a wagon an hour, and the whole rake counts as one`],
    ];
    let n = 0;
    const rows = lines.map(([label, value, note, why]) => {
      const row = `<div class="p-line${note ? " bad noted" : ""}" style="--n:${n}" data-why="${note ? "The bill and our record differ here" : why}"><span>${label}</span><i></i><b>${value}</b>${note ? `<span class="p-note">${note}</span>` : TICK}</div>`;
      n++;
      return row;
    }).join("");
    return `<div class="paper-in">
      <div class="p-head">${FLAG}<b>SBB Cargo</b><em>Demurrage bill</em></div>
      <div class="p-meta"><span>No. ${b.no}</span><span>${b.date} ${b.released.slice(0, 4)}</span></div>
      <div class="p-meta"><span>Rake ${b.rake}</span><span>${W} BOXNHL · coal</span></div>
      <div class="p-rule"></div>
      ${rows}
      <div class="p-rule"></div>
      <div class="p-total${a.back ? " bad" : ""}" style="--n:${n}" data-why="${a.billedHours ? `${a.billedHours} h past free time: ${R(a.billed)}` : "Released inside free time"}"><span>Amount due</span><b>${R(a.billed)}</b></div>
      <div class="stamp ${v.ink === "orange" ? "" : v.ink}">${v.stamp[0]}<b>${v.stamp[1]}</b></div>
    </div>`;
  }
  const calmly = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Put a bill on the stage. With a direction, the old sheet is slid off and the new one
  // slid on from the other side; without one, it is simply there.
  function lay(b, dir) {
    const token = ++busy, calm = !dir || calmly(), away = /away-/.test(paper.className);
    const land = () => {
      if (token !== busy) return;
      paper.innerHTML = sheet(b);
      if (calm) { paper.className = "paper checked"; return; }
      paper.className = "paper jump " + (dir > 0 ? "away-right" : "away-left");      // waiting just off stage
      void paper.offsetWidth;
      paper.className = "paper";
      setTimeout(() => { if (token === busy) paper.classList.add("checked"); }, 260);   // the checking starts as it settles
    };
    if (calm || away) return land();
    paper.classList.remove("checked");
    paper.classList.add(dir > 0 ? "away-left" : "away-right");
    setTimeout(land, 250);
  }
  // Take the sheet off the stage: the month's statement is showing instead.
  function clear() {
    ++busy;
    paper.classList.remove("checked");
    paper.classList.add("away-right");
  }
  // pointing at a printed line, or a receipt, explains it
  const pointAt = (e, text) => {
    tip.classList.toggle("on", !!text);
    if (!text) return;
    if (tip.textContent !== text) tip.textContent = text;
    const box = paper.parentElement.getBoundingClientRect();
    tip.style.left = Math.max(12, Math.min((e.clientX - box.left) / fitScale + 16, TrainStage.W - tip.offsetWidth - 14)) + "px";
    tip.style.top = (e.clientY - box.top) / fitScale - 40 + "px";
  };
  paper.addEventListener("mousemove", (e) => { const row = e.target.closest("[data-why]"); pointAt(e, row && row.dataset.why); });
  paper.addEventListener("mouseleave", () => tip.classList.remove("on"));

  // ---------------------------------------------------------------- left: our record
  // The stay as a small train on a rail: black for free time, orange for what ran over.
  function drawStay(b) {
    const a = b.audit, x0 = 26, x1 = 364, w = x1 - x0, n = Math.max(5, Math.min(9, Math.round(a.stay / 62)));
    const s = w / (n * Art.GEO.WAGON.PITCH), veh = w / n, xf = x0 + Math.min(1, a.free / a.stay) * w;
    const tipping = Yard.rules.wagons * BOOT.day.plant.tipMinutes;
    paint($("bStay"), 390, 72, (ctx) => {
      ctx.fillStyle = "rgba(0,0,0,.1)"; ctx.fillRect(0, 58, 390, 2);
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x0, 57.6, xf - x0, 2.8);
      if (a.stay > a.free) { ctx.fillStyle = "#fc7f37"; ctx.fillRect(xf, 57.3, x1 - xf, 3.4); }
      const start = a.stay - BOOT.day.plant.formMinutes - tipping;       // roughly when tipping began: a picture, not a record
      for (let j = 0; j < n; j++) {
        const cx = x0 + veh * (j + 0.5), t = ((j + 0.5) / n) * a.stay;
        ctx.save(); ctx.translate(cx, 58); ctx.scale(s, s);
        if (j === 0) Art.vanCar(ctx); else if (j === n - 1) Art.locoCar(ctx);
        else Art.wagonCar(ctx, { paint: "orange", seed: 4, fill: t <= start ? 1 : Math.max(0, 1 - (t - start) / tipping) });
        ctx.restore();
      }
    });
    const over = a.stay > a.free, mid = Math.max(x0 + 70, Math.min(x1 - 70, xf));
    $("bStayCaps").innerHTML = `<span style="left:${x0 + 14}px">${Yard.clock(b.ours[0])}</span>`
      + (over ? `<span class="hot" style="left:${mid}px">free until ${Yard.clock(b.ours[0] + a.free)}</span>` : "")
      + `<span class="on" style="left:${x1 - 14}px">${Yard.clock(b.ours[1])}</span>`;
  }
  function renderRecord(b) {
    const a = b.audit;
    setText($("bRake"), b.rake);
    drawStay(b);
    setText($("bPlaced"), `${Yard.clock(b.ours[0])} · ${b.date}`);
    setText($("bReleased"), Yard.clock(b.ours[1]));
    setText($("bOnSite"), Yard.span(a.stay));
    setText($("bFree"), b.owed ? `${FREE / 60} h + ${b.owed.minutes / 60} h owed` : `${FREE / 60} h`);
    setText($("bProof"), b.wrong ? b.proof : b.owed ? "Arrival register" : "Gate and tippler logs");
    setText($("bAxFree"), "Free until " + Yard.clock(b.ours[0] + a.free));
    setText($("bAxOver"), "+7 h");
    const over = Math.max(0, a.stay - a.free);
    const mark = Meter.draw($("bMeter"), { placed: true, free: a.free, elapsed: a.stay, over, hours: a.dueHours, plan: a.dueHours });
    placePill(mark, a.due ? `<span class="up over">↑</span> <span class="num">${R(a.due)}</span> - ${a.dueHours} h over` : `<span class="up">✓</span> <span class="num">No charge</span> - ${Yard.span(a.free - a.stay)} to spare`, $("bMeterPill"));
  }

  // ---------------------------------------------------------------- right: difference and claim
  function renderDifference(b) {
    const a = b.audit;
    setText($("bDiffTitle"), `Bill ${b.no} · ${b.date}`);
    setText($("bDiffLabel"), a.kind === "overcharged" ? "Overcharged by:" : a.kind === "allowance" ? "Allowance not given:" : a.kind === "clean" ? "Charged:" : "Difference:");
    setText($("bDiffValue"), a.back ? R(a.back) : a.kind === "clean" ? "Nothing" : "None");
    setText($("bSelA"), b.wrong ? (b.wrong === "placed" ? "Placed" : "Released") : a.claimable ? "Free time" : "None");
    $("bDotA").style.background = a.back ? "#f5752e" : "#8c8c8c";
    setText($("bSelB"), b.wrong ? b.proof : a.claimable ? "Arrival register" : "Not needed");
    $("bDotB").style.background = a.back ? "#111" : "#8c8c8c";
    // two clocks on one scale: the bill's above, ours below, with the gap between them in orange
    const lo = Math.min(b.billed[0], b.ours[0]) - 25, hi = Math.max(b.billed[1], b.ours[1]) + 25, x = (t) => 64 + ((t - lo) / (hi - lo)) * 322;
    const row = (y, p, name) => `<text x="0" y="${y + 3.6}" font-size="10.4" font-weight="600" letter-spacing=".7" fill="#444">${name}</text>`
      + `<rect x="${x(p[0])}" y="${y - 1.2}" width="${x(p[1]) - x(p[0])}" height="2.4" rx="1.2" fill="rgba(0,0,0,.5)"/>`
      + `<circle cx="${x(p[0])}" cy="${y}" r="3.4" fill="#111"/><circle cx="${x(p[1])}" cy="${y}" r="3.4" fill="#111"/>`;
    let gap = "";
    if (b.wrong) {
      const k = b.wrong === "placed" ? 0 : 1, xa = x(Math.min(b.billed[k], b.ours[k])), xb = x(Math.max(b.billed[k], b.ours[k]));
      gap = `<rect x="${xa}" y="14.2" width="${xb - xa}" height="3.6" rx="1.8" fill="#fc7f37"/><circle cx="${x(b.billed[k])}" cy="16" r="4.4" fill="#fc7f37"/>`
        + `<path d="M${x(b.ours[k])} 22v18" stroke="#fc7f37" stroke-width="1" stroke-dasharray="1.5 3" stroke-linecap="round"/>`;
    }
    const free = b.owed && a.claimable ? `<rect x="${x(b.ours[0] + FREE)}" y="44.2" width="${x(b.ours[0] + FREE + b.owed.minutes) - x(b.ours[0] + FREE)}" height="3.6" rx="1.8" fill="#fc8a48" opacity=".55"/>` : "";
    $("bVersusSvg").innerHTML = row(16, b.billed, "Bill") + row(46, b.ours, "Ours") + gap + free;
    const k = b.wrong === "placed" ? 0 : 1, mins = b.wrong ? Math.abs(b.billed[k] - b.ours[k]) : 0;
    $("bVersusTip").innerHTML = b.wrong ? `The bill ${b.wrong === "placed" ? "starts the clock" : "stops the clock"} <span class="num">${mins} min</span> ${b.wrong === "placed" ? "early" : "late"}`
      : a.claimable ? `<span class="num">${b.owed.minutes / 60} h</span> of ${b.owed.rule.toLowerCase()} allowance was left out` : "The bill and our record agree";
  }
  const CLAIM = { none: ["Nothing to file", "#8c8c8c"], open: ["Not filed", "#f5752e"], filed: ["Filed", "#1677e6"], won: ["Won", "#6f8d00"], missed: ["Missed", "#8c8c8c"] };
  function renderClaim(b) {
    const a = b.audit, open = a.state === "open", days = Yard.rules.claimDays;
    const [label, value] = a.state === "none" ? ["Claim:", "None"] : open ? ["File by:", short(a.deadline)] : a.state === "filed" ? ["Filed, reply awaited:", R(a.back)]
      : a.state === "won" ? ["Won back:", R(a.back)] : ["Window closed on:", short(a.deadline)];
    setText($("bClaimLabel"), label); setText($("bClaimValue"), value);
    setText($("bSelC"), CLAIM[a.state][0]); $("bDotC").style.background = CLAIM[a.state][1];
    document.querySelector('.select[data-menu="billClaim"]').classList.toggle("locked", a.state === "none" || a.state === "missed");
    // the days there are to apply, a dot each: gone in black, still to come in orange
    const gone = Math.max(0, Math.min(days, days - a.left)), step = 30, x0 = (402 - (days - 1) * step) / 2;
    let dots = "";
    for (let d = 0; d < days; d++) {
      const x = x0 + d * step;
      dots += d < gone ? `<circle cx="${x}" cy="18" r="3.1" fill="${a.state === "none" ? "#9a9a9a" : "#111"}" opacity="${a.state === "none" ? 0.6 : 1}"/>`
        : open ? `<circle cx="${x}" cy="18" r="3.5" fill="#fc7f37"/>` : `<circle cx="${x}" cy="18" r="2" fill="#9a9a9a" opacity=".7"/>`;
    }
    $("bDays").innerHTML = dots;
    const cap = (id, text, d) => { const el = $(id); setText(el, text); el.style.left = x0 + d * step + "px"; };
    cap("bDaysA", "released " + b.date, 0.6);
    cap("bDaysB", open ? (a.left ? `${a.left} day${a.left === 1 ? "" : "s"} left` : "last day") : a.state === "missed" ? "closed" : "", 8.4);
    $("bDaysTip").innerHTML = a.state === "none" ? "Nothing on this bill to claim"
      : open ? `Apply by <span class="num">${short(a.deadline)}</span>, with proof the bill was paid`
      : a.state === "filed" ? "Filed in time - the division replies within the month" : a.state === "won" ? "Refund credited against the next bill" : `The ten days ran out: <span class="num">${R(a.back)}</span> stays paid`;
  }
  // Filing or winning a claim is saved by the backend, which sends back the bill and its month.
  MENUS.billClaim = () => ({
    options: () => { const c = bill().claim; return [{ v: "none", label: "Not filed", dot: "#f5752e", on: c === "none" }, { v: "filed", label: "Filed", dot: "#1677e6", on: c === "filed", note: "awaiting reply" }, { v: "won", label: "Won", dot: "#6f8d00", on: c === "won", note: "refunded" }]; },
    send: async (v) => {
      const out = await Api.setBill(bill().id, { claim: v });
      bills[sel - 1] = out.bill;
      months[mi] = out.month;
    },
    after: () => { render(); lay(bill(), 0); },
  });

  // ================================================================ the month
  // ---------------------------------------------------------------- stage: receipts on a rail
  function drawRail() {
    const key = months.map((m) => [m.baseline, m.paid, m.avoided, m.recovered].join()).join("|");
    if (key !== railKey) {
      const first = !railKey;
      railKey = key;
      const scale = 430 / Math.max(...months.map((m) => m.baseline)), pitch = 140, x0 = (TrainStage.W - (months.length - 1) * pitch - 108) / 2;
      rail.innerHTML = months.map((m, i) => {
        const paid = Math.max(92, m.paid * scale), off = m.saved * scale, small = off < 52;
        const torn = m.saved ? `<div class="rcpt-off${small ? " small" : ""}" style="height:${Math.max(26, off).toFixed(1)}px"><span>saved <b>${L(m.saved)}</b></span></div>` : `<div class="rcpt-note">paid in full</div>`;
        return `<div class="rcpt" data-i="${i}" role="button" tabindex="0" aria-label="${m.name}: ${L(m.paid)} paid, ${L(m.saved)} saved" style="left:${(x0 + i * pitch).toFixed(1)}px">`
          + `<div class="rcpt-paid" style="height:${paid.toFixed(1)}px"><b>${m.name.slice(0, 3).toUpperCase()}</b><small>${m.partial || m.id.slice(0, 4)}</small><em>Paid</em><strong>${L(m.paid)}</strong></div>${torn}</div>`;
      }).join("");
      if (first && !calmly()) {                                      // the saved pieces drop away from their receipts
        rail.classList.remove("hung");
        void rail.offsetWidth;
        setTimeout(() => rail.classList.add("hung"), 60);
      } else rail.classList.add("hung");
    }
    [...rail.children].forEach((el, i) => el.classList.toggle("on", i === mi));
  }
  rail.addEventListener("click", (e) => { const el = e.target.closest(".rcpt"); if (el) setMonth(+el.dataset.i); });
  rail.addEventListener("keydown", (e) => { const el = e.target.closest(".rcpt"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setMonth(+el.dataset.i); } });
  rail.addEventListener("mousemove", (e) => {
    const el = e.target.closest(".rcpt"), m = el && months[+el.dataset.i];
    pointAt(e, m && (m.saved ? `${m.name}: ${L(m.paid)} paid of the ${L(m.baseline)} it would have cost` : `${m.name}: ${L(m.paid)} paid, and no bill was checked`));
  });
  rail.addEventListener("mouseleave", () => tip.classList.remove("on"));

  // ---------------------------------------------------------------- left: the month
  function renderMonth(m) {
    setText($("mSaved"), m.saved ? L(m.saved) : "Nothing");
    // the month on its side: what was paid, then the two pieces that were not
    const w = 362, part = (v) => (v ? Math.max(7, (v / m.baseline) * w) : 0), paid = part(m.paid), avoided = part(m.avoided), won = part(m.recovered);
    const fit = w / (paid + avoided + won || 1);
    $("mTape").innerHTML = `<i class="paid" style="width:${(paid * fit).toFixed(1)}px"></i>` + (avoided ? `<i class="off" style="width:${(avoided * fit).toFixed(1)}px"></i>` : "") + (won ? `<i class="off won" style="width:${(won * fit).toFixed(1)}px"></i>` : "");
    $("mTape").setAttribute("aria-label", `${L(m.paid)} paid, ${L(m.avoided)} avoided, ${L(m.recovered)} won back`);
    const edge = paid * fit, mid = Math.max(edge + 46, Math.min(340, edge + (w - edge) / 2 + 8));
    $("mTapeCaps").innerHTML = `<span class="on" style="left:${Math.max(38, Math.min(edge - 44, edge / 2)).toFixed(0)}px">paid ${L(m.paid)}</span>` + (m.saved ? `<span class="hot" style="left:${mid.toFixed(0)}px">not paid ${L(m.saved)}</span>` : "");
    setText($("mBaseline"), L(m.baseline) + (m.partial ? ` · ${m.partial}` : ""));
    setText($("mRakes"), String(m.rakes));
    setText($("mAvoided"), m.avoided ? L(m.avoided) : "Nothing yet");
    setText($("mRecovered"), m.recovered ? L(m.recovered) : "Nothing yet");
    setText($("mPaid"), L(m.paid));
    drawTrend();
  }
  // The share saved each month, in the house dot matrix: a column a month, orange for the
  // one in view.
  const TREND = { OX: 79, OY: 76, STEP: 5.27, FLOOR: 11, ROWS: 22, WIDE: 3, GAP: 2 };
  const trendCol = (i) => -Math.floor((months.length * (TREND.WIDE + TREND.GAP) - TREND.GAP) / 2) + i * (TREND.WIDE + TREND.GAP);
  function drawTrend() {
    const { OX, OY, STEP, FLOOR, ROWS, WIDE } = TREND, filled = new Map();
    months.forEach((m, i) => {
      const rows = Math.round(share(m) * ROWS);
      for (let c = 0; c < WIDE; c++) for (let r = 0; r < Math.max(1, rows); r++) filled.set(`${trendCol(i) + c},${FLOOR - r}`, rows ? (i === mi ? "on" : "ink") : i === mi ? "on" : "floor");
    });
    let out = "";
    for (let j = -14; j <= 14; j++) for (let i = -15; i <= 15; i++) {
      const x = (OX + i * STEP).toFixed(2), y = (OY + j * STEP).toFixed(2), kind = filled.get(`${i},${j}`);
      out += kind === "on" ? `<circle cx="${x}" cy="${y}" r="1.95" fill="#fc7f37"/>` : kind === "ink" ? `<circle cx="${x}" cy="${y}" r="1.45" fill="#111"/>`
        : kind === "floor" ? `<circle cx="${x}" cy="${y}" r="1.1" fill="#8a8a8a"/>` : `<circle cx="${x}" cy="${y}" r=".62" fill="#9a9a9a" opacity=".5"/>`;
    }
    $("mTrend").innerHTML = out;
    const m = month();
    placePill({ x: OX + (trendCol(mi) + WIDE) * STEP, y: OY - 9 * STEP },            // above the columns, clear of the axis labels
      m.saved ? `<span class="up">↓</span> <span class="num">${Math.round(share(m) * 100)}%</span> - less than it would have cost` : `<span class="up idle">→</span> Nothing saved - no one was checking`, $("mTrendPill"));
    setText($("mAxFirst"), months[0].name.slice(0, 3)); setText($("mAxLast"), months[months.length - 1].name.slice(0, 3));
    setText($("mAxSince"), `In use since ${MONTH[+BOOT.day.plant.since.slice(5, 7) - 1]}`);
  }
  $("mTrend").addEventListener("click", (e) => {
    const box = $("mTrend").getBoundingClientRect(), col = ((e.clientX - box.left) / box.width * 162 - TREND.OX) / TREND.STEP;
    const i = months.findIndex((_, n) => col >= trendCol(n) - 1 && col <= trendCol(n) + TREND.WIDE);
    if (i >= 0) setMonth(i);
  });

  // ---------------------------------------------------------------- right: why, and the claims
  // A dot for every rake that was charged, in a row for each reason it ran over.
  function renderCauses(m) {
    const C = m.causes, box = $("mCauses");
    cause = Math.min(cause, Math.max(0, C.length - 1));
    setText($("mCauseTitle"), `${m.charged} of ${m.rakes} rakes were charged`);
    const c = C[cause];
    setText($("mCauseLabel"), c ? `${c.name}:` : "Charged:"); setText($("mCauseValue"), c ? L(c.amount) : "Nothing");
    setText($("mSelCause"), c ? c.name : "None"); setText($("mCauseRakes"), c ? `${c.rakes} of ${m.charged}` : "None");
    const most = Math.max(1, ...C.map((x) => x.rakes)), step = Math.min(8.6, 268 / most);
    const rows = C.map((x, n) => {
      let dots = "";
      for (let d = 0; d < x.rakes; d++) dots += `<circle cx="${(4 + d * step).toFixed(1)}" cy="11" r="${n === cause ? 2.9 : 2.4}"/>`;
      return `<div class="cause-row${n === cause ? " on" : ""}" data-n="${n}"><span>${x.name}</span><svg width="298" height="22">${dots}<text x="${(4 + (x.rakes - 1) * step + 9).toFixed(1)}" y="14.6">${x.rakes}</text></svg></div>`;
    }).join("");
    box.querySelectorAll(".cause-row").forEach((el) => el.remove());
    box.insertAdjacentHTML("afterbegin", rows);
    $("mCauseTip").innerHTML = c ? `<span class="num">${c.rakes}</span> rake${c.rakes === 1 ? "" : "s"} ran over for ${c.name.toLowerCase()}: <span class="num">${L(c.amount)}</span> billed` : "No rake ran over this month";
  }
  $("mCauses").addEventListener("click", (e) => { const el = e.target.closest(".cause-row"); if (el) { cause = +el.dataset.n; renderCauses(month()); } });
  MENUS.cause = () => ({
    options: () => month().causes.map((c, i) => ({ v: i, label: c.name, dot: i === cause ? "#f5752e" : "#111", on: i === cause, note: `${c.rakes} rake${c.rakes === 1 ? "" : "s"}` })),
    send: (v) => { cause = v; },
    after: () => renderCauses(month()),
  });
  // The month's claims, a slip each, in the order they need attention.
  const GROUPS = [["open", "to file", "orange", "hot"], ["filed", "filed", "blue", "on"], ["won", "won", "ink", "on"], ["missed", "missed", "faint", ""]];
  function renderClaims(m) {
    const c = m.claims, box = $("mClaims"), total = GROUPS.reduce((s, [k]) => s + c[k].count, 0), shown = GROUPS.filter(([k]) => c[k].count);
    setText($("mClaimsTitle"), `Claims on ${m.name}'s bills`);
    const [label, value] = c.won.count ? ["Won back by claims:", L(c.won.amount)] : c.missed.count ? ["Never claimed:", L(c.missed.amount)] : ["Claims:", "None"];
    setText($("mClaimsLabel"), label); setText($("mClaimsValue"), value);
    let html = "";
    const slip = (k, ink, x, y, d) => `<i class="slip ${k}" data-k="${k}" style="left:${x.toFixed(1)}px;top:${y}px;--ink:${INK[ink]};transform:rotate(${((d * 37 + k.length * 11) % 9) - 4}deg)"></i>`;
    if (total <= 13) {
      // a few: each kind stands apart with its count beneath
      const gap = 34, step = Math.min(27, (398 - 24 * shown.length - gap * Math.max(0, shown.length - 1)) / Math.max(1, total - shown.length));
      let x = 0;
      for (const [k, word, ink, tone] of shown) {
        const from = x, n = c[k].count;
        for (let d = 0; d < n; d++) html += slip(k, ink, from + d * step, 4, d);
        x = from + (n - 1) * step + 24;
        html += `<span class="cap ${tone}" data-k="${k}" style="left:${((from + x) / 2).toFixed(1)}px">${n} ${word}</span>`;
        x += gap;
      }
    } else {
      // many: two rows, kind after kind, and the counts in one line beneath
      const perRow = Math.ceil(total / 2), step = Math.min(22, (398 - 20) / (perRow - 1));
      let d = 0;
      for (const [k, , ink] of shown) for (let n = 0; n < c[k].count; n++, d++) html += slip(k + " many", ink, (d % perRow) * step, d < perRow ? 0 : 27, d);
      html += `<span class="cap line">${shown.map(([k, word, , tone]) => `<span class="${tone}" data-k="${k}">${c[k].count} ${word}</span>`).join(" · ")}</span>`;
    }
    box.querySelectorAll(".slip, .cap").forEach((el) => el.remove());
    box.insertAdjacentHTML("afterbegin", html);
    setText($("mOpenClaims"), c.open.count ? `${c.open.count} · ${R(c.open.amount)}` : "Nothing");
    $("mOpenDot").style.background = c.open.count ? "#f5752e" : "#8c8c8c";
    const next = nextBill();
    setText($("mNextLabel"), next >= 0 ? bills[next].no : "No bills");
    $("mNextBill").classList.toggle("locked", next < 0);
    $("mClaimsTip").innerHTML = total ? shown.map(([k, word]) => `<span class="num">${c[k].count}</span> ${word}`).join(" · ") : "No bill this month had anything to claim";
  }
  $("mClaims").addEventListener("mousemove", (e) => {
    const el = e.target.closest("[data-k]"), c = month().claims;
    if (!el) return;
    const k = el.dataset.k, sum = `<span class="num">${L(c[k].amount)}</span>`;
    $("mClaimsTip").innerHTML = k === "open" ? `${sum} can still be claimed, if filed in time` : k === "filed" ? `${sum} filed and awaiting a reply` : k === "won" ? `${sum} refunded on ${c[k].count} claim${c[k].count === 1 ? "" : "s"}` : `${sum} stays paid: the ten days ran out`;
  });
  // The bill to open first: one that can still be claimed, else the first on the stack.
  const nextBill = () => { const open = bills.findIndex((b) => b.audit.state === "open"); return open >= 0 ? open : bills.length ? 0 : -1; };
  $("mNextBill").addEventListener("click", () => { const n = nextBill(); if (n >= 0) select(n + 1); });

  // ================================================================ strip, slider and selection
  function buildStrip() {
    const m = month();
    const cover = `<article class="car has-more is-month" role="button" tabindex="0" data-i="0" style="left:66px"><b>${m.name.slice(0, 3).toUpperCase()}</b><span>${m.id.slice(0, 4)}</span><div class="car-art"><i class="slip"></i><em class="pill"></em></div><div class="car-more"><small></small><small></small></div></article>`;
    strip.innerHTML = cover + bills.map((b, i) => `<article class="car has-more is-bill" role="button" tabindex="0" data-i="${i + 1}" style="left:${66 + (i + 1) * 238}px"><b>${b.no}</b><span>${b.rake}</span><div class="car-art"><i class="slip"></i><em class="pill"></em></div><div class="car-more"><small></small><small></small></div></article>`).join("");
  }
  function renderCards() {
    const m = month();
    [...strip.children].forEach((el, i) => {
      const pill = el.querySelector(".pill"), [a, b] = el.querySelectorAll(".car-more small");
      el.classList.toggle("active", i === sel);
      if (!i) {
        setText(pill, m.saved ? `${L(m.saved)} saved` : "Nothing saved"); pill.className = "pill " + (m.saved ? "pill-orange" : "pill-white");
        setText(a, `paid ${L(m.paid)}`); setText(b, `of ${L(m.baseline)}`);
        el.setAttribute("aria-label", `${m.name} statement`);
        return;
      }
      const bl = bills[i - 1], v = verdict(bl);
      el.querySelector(".slip").style.setProperty("--ink", INK[v.ink]);
      setText(pill, v.pill); pill.className = "pill " + (v.due ? "pill-due" : "pill-white");
      setText(a, bl.date); setText(b, "billed " + R(bl.audit.billed));
      el.setAttribute("aria-label", `Bill ${bl.no}, ${v.pill}`);
    });
  }
  function render() {
    if (!loaded) return;
    const m = month(), b = bill();
    screen.classList.toggle("is-month", !b);
    setText($("bStageTitle"), b ? "Railway bill" : `Statement · ${m.name} ${m.id.slice(0, 4)}${m.partial ? " · " + m.partial : ""}`);
    renderCards();
    drawRail(); renderMonth(m); renderCauses(m); renderClaims(m);
    if (b) { renderRecord(b); renderDifference(b); renderClaim(b); }
    screen.querySelector(".arrow.prev").disabled = sel === 0;
    screen.querySelector(".arrow.next").disabled = sel === bills.length;
    // the stack is longer than the strip: keep the sheet in hand in view
    strip.style.transform = `translateX(${-Math.max(0, sel - 6) * 238}px)`;
    drawSlider();
  }
  function select(i) {
    if (!loaded) return;
    i = Math.max(0, Math.min(bills.length, i));
    if (i === sel) return;
    const dir = i > sel ? 1 : -1;
    sel = i;
    tip.classList.remove("on");
    render();
    if (bill()) lay(bill(), dir); else clear();
  }
  // Another month: fetch its stack of bills the first time, and open at its statement.
  async function setMonth(i) {
    i = Math.max(0, Math.min(months.length - 1, i));
    if (i === mi && loaded) { if (sel) select(0); return; }
    const ask = ++asked, id = months[i].id;
    try {
      if (!stacks.has(id)) stacks.set(id, (await Api.bills(id)).bills);
    } catch (e) { return complain(e); }
    if (ask !== asked) return;
    mi = i; bills = stacks.get(id); sel = 0; cause = 0; loaded = true;
    clear(); buildStrip(); render();
  }
  function build() {
    strip.addEventListener("click", (e) => { const el = e.target.closest(".car"); if (el) select(+el.dataset.i); });
    strip.addEventListener("keydown", (e) => { const el = e.target.closest(".car"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(+el.dataset.i); } });
    screen.querySelector(".arrow.prev").addEventListener("click", () => select(sel - 1));
    screen.querySelector(".arrow.next").addEventListener("click", () => select(sel + 1));
  }
  // First shown: ask the backend for the months, then open the latest at its statement.
  let opening = null;
  function show(redraw) {
    if (!ready) {
      ready = true; build();
      opening = Api.months().then((list) => {
        months = list;
        drawSlider = listSlider("b", months.length, () => mi, setMonth, () => month().name.slice(0, 3));
        return setMonth(months.length - 1);
      }).catch(complain);
    } else if (redraw) render();
    return opening;
  }
  return { show, step: (d) => select(sel + d), get selected() { return sel; }, get month() { return month(); }, get bills() { return bills; }, setMonth };
})();
