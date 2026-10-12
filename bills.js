// The Bills screen. Our record of a stay on the left, the railway's bill as a sheet of
// paper in the middle, and what to do about any difference on the right.
// When a bill lands it is checked in front of you: a pencil tick down each line that
// agrees, an orange marker and a pen note on any that does not, then the stamp.
const Bills = (() => {
  const B = Ledger.BILLS, A = B.map(Ledger.audit);
  let sel = Math.max(0, B.findIndex((b) => b.no === "DC/1044")), ready = false, busy = 0, drawSlider = () => {};
  const paper = $("paper"), strip = $("bStrip"), tip = $("billTip");
  const day = (n) => (n > 0 ? `${String(n).padStart(2, "0")} Oct` : `${30 + n} Sep`);
  const INK = { orange: "#d9540f", ink: "#33363c", faint: "#9a968c" };

  // What the stamp, the card pill and the cards on the right say about a bill.
  function verdict(i) {
    const a = A[i], sum = Sim.rupees(a.back);
    if (a.kind === "clean") return { stamp: ["Nothing", "to pay"], ink: "faint", pill: "No charge" };
    if (a.kind === "matches") return { stamp: ["Checked", "Correct"], ink: "ink", pill: "Correct" };
    if (a.state === "won") return { stamp: ["Refunded", sum], ink: "ink", pill: "Refunded" };
    if (a.state === "filed") return { stamp: ["Claim filed", sum], ink: "orange", pill: "Filed" };
    if (a.state === "missed") return { stamp: ["Too late", sum], ink: "faint", pill: "Missed" };
    return { stamp: [a.kind === "overcharged" ? "Overcharged" : "Allowance due", sum], ink: "orange", pill: `${sum} back`, due: true };
  }

  // ---------------------------------------------------------------- the sheet of paper
  const FLAG = `<span class="p-flag"><svg viewBox="8 2 24 16"><g fill="none" stroke="#f4f1e8" stroke-width="2.7"><path d="M15.6 3 9 10l6.6 7M24.4 3 31 10l-6.6 7M11 10h18M20 3v14"/></g></svg></span>`;
  const TICK = `<svg class="tick" viewBox="0 0 15 13"><path d="M1.5 7.2 5.4 11 13.4 1.6"/></svg>`;
  function sheet(i) {
    const b = B[i], a = A[i], v = verdict(i);
    // each printed line: what the bill says, whether we agree, and what pointing at it explains
    const wrongAt = (k) => b.wrong === k;
    const lines = [
      ["Placed", Sim.clock(b.billed[0]), wrongAt("placed") && `our ${b.proof.toLowerCase()} says ${Sim.clock(b.ours[0])}`, "Free time starts the moment the rake is placed"],
      ["Released", Sim.clock(b.billed[1]), wrongAt("released") && `our ${b.proof.toLowerCase()} says ${Sim.clock(b.ours[1])}`, "The meter stops when the last wagon is released"],
      ["Detained", Sim.span(a.billedStay), false, "Released, less placed"],
      ["Free time", "7h 00m", b.owed && a.claimable > 0 && `+${b.owed.minutes / 60} h ${b.owed.rule.toLowerCase()} not given`, "Seven hours: open wagons, unloaded by machine"],
      ["Hours charged", String(a.billedHours), false, "Every hour past free time, or part of one"],
      ["Rate", "₹150 × 58", false, "₹150 a wagon an hour, and the whole rake counts as one"],
    ];
    let n = 0;
    const rows = lines.map(([label, value, note, why]) => {
      const row = `<div class="p-line${note ? " bad noted" : ""}" style="--n:${n}" data-why="${note ? "The bill and our record differ here" : why}"><span>${label}</span><i></i><b>${value}</b>${note ? `<span class="p-note">${note}</span>` : TICK}</div>`;
      n++;
      return row;
    }).join("");
    return `<div class="paper-in">
      <div class="p-head">${FLAG}<b>SBB Cargo</b><em>Demurrage bill</em></div>
      <div class="p-meta"><span>No. ${b.no}</span><span>${b.date} 2026</span></div>
      <div class="p-meta"><span>Rake ${b.rake}</span><span>58 BOXNHL · coal</span></div>
      <div class="p-rule"></div>
      ${rows}
      <div class="p-rule"></div>
      <div class="p-total${a.back ? " bad" : ""}" style="--n:${n}" data-why="${a.billedHours ? `${a.billedHours} h at ₹8,700 an hour` : "Released inside free time"}"><span>Amount due</span><b>${Sim.rupees(a.billed)}</b></div>
      <div class="stamp ${v.ink === "orange" ? "" : v.ink}">${v.stamp[0]}<b>${v.stamp[1]}</b></div>
    </div>`;
  }
  // Put a bill on the stage. With a direction, the old sheet is slid off and the new one
  // slid on from the other side; without one, it is simply there.
  function lay(i, dir) {
    const token = ++busy, calm = !dir || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    const land = () => {
      if (token !== busy) return;
      paper.innerHTML = sheet(i);
      paper.classList.remove("checked");
      if (calm) { paper.className = "paper checked"; return; }
      paper.className = "paper jump " + (dir > 0 ? "away-right" : "away-left");      // waiting just off stage
      void paper.offsetWidth;
      paper.className = "paper";
      setTimeout(() => { if (token === busy) paper.classList.add("checked"); }, 260);   // the checking starts as it settles
    };
    if (calm) return land();
    paper.classList.remove("checked");
    paper.classList.add(dir > 0 ? "away-left" : "away-right");
    setTimeout(land, 250);
  }
  // pointing at a printed line explains it
  paper.addEventListener("mousemove", (e) => {
    const row = e.target.closest("[data-why]");
    tip.classList.toggle("on", !!row);
    if (!row) return;
    if (tip.textContent !== row.dataset.why) tip.textContent = row.dataset.why;
    const box = paper.parentElement.getBoundingClientRect();
    tip.style.left = Math.min((e.clientX - box.left) / fitScale + 16, TrainStage.W - tip.offsetWidth - 14) + "px";
    tip.style.top = (e.clientY - box.top) / fitScale - 40 + "px";
  });
  paper.addEventListener("mouseleave", () => tip.classList.remove("on"));

  // ---------------------------------------------------------------- left: our record
  // The stay as a small train on a rail: black for free time, orange for what ran over.
  function drawStay(i) {
    const b = B[i], a = A[i], x0 = 26, x1 = 364, w = x1 - x0, n = Math.max(5, Math.min(9, Math.round(a.stay / 62)));
    const s = w / (n * Art.GEO.WAGON.PITCH), veh = w / n, xf = x0 + Math.min(1, a.free / a.stay) * w;
    paint($("bStay"), 390, 72, (ctx) => {
      ctx.fillStyle = "rgba(0,0,0,.1)"; ctx.fillRect(0, 58, 390, 2);
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x0, 57.6, xf - x0, 2.8);
      if (a.stay > a.free) { ctx.fillStyle = "#fc7f37"; ctx.fillRect(xf, 57.3, x1 - xf, 3.4); }
      const start = a.stay - 25 - Sim.WAGONS * Sim.TIP;                // minutes into the stay that tipping began
      for (let j = 0; j < n; j++) {
        const cx = x0 + veh * (j + 0.5), t = ((j + 0.5) / n) * a.stay;
        ctx.save(); ctx.translate(cx, 58); ctx.scale(s, s);
        if (j === 0) Art.vanCar(ctx); else if (j === n - 1) Art.locoCar(ctx);
        else Art.wagonCar(ctx, { paint: "orange", seed: 4, fill: t <= start ? 1 : Math.max(0, 1 - (t - start) / (Sim.WAGONS * Sim.TIP)) });
        ctx.restore();
      }
    });
    const over = a.stay > a.free, mid = Math.max(x0 + 70, Math.min(x1 - 70, xf));
    $("bStayCaps").innerHTML = `<span style="left:${x0 + 14}px">${Sim.clock(b.ours[0])}</span>`
      + (over ? `<span class="hot" style="left:${mid}px">free until ${Sim.clock(b.ours[0] + a.free)}</span>` : "")
      + `<span class="on" style="left:${x1 - 14}px">${Sim.clock(b.ours[1])}</span>`;
  }
  function renderRecord(i) {
    const b = B[i], a = A[i];
    setText($("bRake"), b.rake);
    drawStay(i);
    setText($("bPlaced"), `${Sim.clock(b.ours[0])} · ${b.date}`);
    setText($("bReleased"), Sim.clock(b.ours[1]));
    setText($("bOnSite"), Sim.span(a.stay));
    setText($("bFree"), b.owed ? `7 h + ${b.owed.minutes / 60} h owed` : "7 h");
    setText($("bProof"), b.wrong ? b.proof : b.owed ? "Arrival register" : "Gate and tippler logs");
    setText($("bAxFree"), "Free until " + Sim.clock(b.ours[0] + a.free));
    const over = Math.max(0, a.stay - a.free);
    const mark = Meter.draw($("bMeter"), { placed: true, free: a.free, elapsed: a.stay, over, hours: a.dueHours, plan: a.dueHours });
    placePill(mark, a.due ? `<span class="up over">↑</span> <span class="num">${Sim.rupees(a.due)}</span> - ${a.dueHours} h over` : `<span class="up">✓</span> <span class="num">No charge</span> - ${Sim.span(a.free - a.stay)} to spare`, $("bMeterPill"));
  }

  // ---------------------------------------------------------------- right: difference and claim
  function renderDifference(i) {
    const b = B[i], a = A[i];
    setText($("bDiffTitle"), `Bill ${b.no} · ${b.date}`);
    setText($("bDiffLabel"), a.kind === "overcharged" ? "Overcharged by:" : a.kind === "allowance" ? "Allowance not given:" : a.kind === "clean" ? "Charged:" : "Difference:");
    setText($("bDiffValue"), a.back ? Sim.rupees(a.back) : a.kind === "clean" ? "Nothing" : "None");
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
    const free = b.owed && a.claimable ? `<rect x="${x(b.ours[0] + Sim.FREE)}" y="44.2" width="${x(b.ours[0] + Sim.FREE + b.owed.minutes) - x(b.ours[0] + Sim.FREE)}" height="3.6" rx="1.8" fill="#fc8a48" opacity=".55"/>` : "";
    $("bVersusSvg").innerHTML = row(16, b.billed, "Bill") + row(46, b.ours, "Ours") + gap + free;
    const mins = b.wrong ? Math.abs(b.billed[b.wrong === "placed" ? 0 : 1] - b.ours[b.wrong === "placed" ? 0 : 1]) : 0;
    $("bVersusTip").innerHTML = b.wrong ? `The bill ${b.wrong === "placed" ? "starts the clock" : "stops the clock"} <span class="num">${mins} min</span> ${b.wrong === "placed" ? "early" : "late"}`
      : a.claimable ? `<span class="num">${b.owed.minutes / 60} h</span> of ${b.owed.rule.toLowerCase()} allowance was left out` : "The bill and our record agree";
  }
  function renderClaim(i) {
    const b = B[i], a = A[i], open = a.state === "open";
    const [label, value] = a.state === "none" ? ["Claim:", "None"] : open ? ["File by:", day(a.lastDay)] : a.state === "filed" ? ["Filed, reply awaited:", Sim.rupees(a.back)]
      : a.state === "won" ? ["Won back:", Sim.rupees(a.back)] : ["Window closed on:", day(a.lastDay)];
    setText($("bClaimLabel"), label); setText($("bClaimValue"), value);
    const c = { none: ["Nothing to file", "#8c8c8c"], open: ["Not filed", "#f5752e"], filed: ["Filed", "#1677e6"], won: ["Won", "#6f8d00"], missed: ["Missed", "#8c8c8c"] }[a.state];
    setText($("bSelC"), c[0]); $("bDotC").style.background = c[1];
    document.querySelector('.select[data-menu="billClaim"]').classList.toggle("locked", a.state === "none" || a.state === "missed");
    // ten days to apply, a dot each: gone in black, still to come in orange
    const gone = Math.max(0, Math.min(10, Ledger.TODAY - b.day)), live = open, step = 30, x0 = (402 - 9 * step) / 2;
    let dots = "";
    for (let d = 0; d < 10; d++) {
      const x = x0 + d * step;
      dots += d < gone ? `<circle cx="${x}" cy="18" r="3.1" fill="${a.state === "none" ? "#9a9a9a" : "#111"}" opacity="${a.state === "none" ? 0.6 : 1}"/>`
        : live ? `<circle cx="${x}" cy="18" r="3.5" fill="#fc7f37"/>` : `<circle cx="${x}" cy="18" r="2" fill="#9a9a9a" opacity=".7"/>`;
    }
    $("bDays").innerHTML = dots;
    const cap = (id, text, d) => { const el = $(id); setText(el, text); el.style.left = x0 + d * step + "px"; };
    cap("bDaysA", "released " + day(b.day), 0.6);
    cap("bDaysB", open ? `${a.left} day${a.left === 1 ? "" : "s"} left` : a.state === "missed" ? "closed" : "", 8.4);
    $("bDaysTip").innerHTML = a.state === "none" ? "Nothing on this bill to claim"
      : open ? `Apply by <span class="num">${day(a.lastDay)}</span>, with proof the bill was paid`
      : a.state === "filed" ? "Filed in time - the division replies within the month" : a.state === "won" ? "Refund credited against the next bill" : `The ten days ran out: <span class="num">${Sim.rupees(a.back)}</span> stays paid`;
  }
  MENUS.billClaim = () => ({
    options: [{ v: "none", label: "Not filed", dot: "#f5752e", on: B[sel].claim === "none" }, { v: "filed", label: "Filed", dot: "#1677e6", on: B[sel].claim === "filed", note: "awaiting reply" }, { v: "won", label: "Won", dot: "#6f8d00", on: B[sel].claim === "won", note: "refunded" }],
    pick: (v) => { B[sel].claim = v; A[sel] = Ledger.audit(B[sel]); },
    after: () => { render(); lay(sel, 0); },
  });

  // ---------------------------------------------------------------- strip
  function build() {
    strip.innerHTML = B.map((b, i) => `<article class="car has-more is-bill" role="button" tabindex="0" data-i="${i}" style="left:${66 + i * 238}px"><b>${b.no}</b><span>${b.rake}</span><div class="car-art"><i class="slip"></i><em class="pill"></em></div><div class="car-more"><small></small><small></small></div></article>`).join("");
    strip.addEventListener("click", (e) => { const el = e.target.closest(".car"); if (el) select(+el.dataset.i); });
    strip.addEventListener("keydown", (e) => { const el = e.target.closest(".car"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(+el.dataset.i); } });
    const screen = $("screenBills");
    screen.querySelector(".arrow.prev").addEventListener("click", () => select(sel - 1));
    screen.querySelector(".arrow.next").addEventListener("click", () => select(sel + 1));
    drawSlider = listSlider("b", B.length, () => sel, select, () => B[sel].date);
  }
  function renderCards() {
    [...strip.children].forEach((el, i) => {
      const v = verdict(i), pill = el.querySelector(".pill"), [a, b] = el.querySelectorAll(".car-more small");
      el.classList.toggle("active", i === sel);
      el.querySelector(".slip").style.setProperty("--ink", INK[v.ink]);
      setText(pill, v.pill); pill.className = "pill " + (v.due ? "pill-due" : "pill-white");
      setText(a, B[i].date); setText(b, "billed " + Sim.rupees(A[i].billed));
      el.setAttribute("aria-label", `Bill ${B[i].no}, ${v.pill}`);
    });
  }

  function render() {
    renderCards(); renderRecord(sel); renderDifference(sel); renderClaim(sel);
    const screen = $("screenBills");
    screen.querySelector(".arrow.prev").disabled = sel === 0;
    screen.querySelector(".arrow.next").disabled = sel === B.length - 1;
    drawSlider();
  }
  function select(i) {
    i = Math.max(0, Math.min(B.length - 1, i));
    if (i === sel) return;
    const dir = i > sel ? 1 : -1;
    sel = i;
    render(); lay(i, dir);
  }
  function show(redraw) {
    if (!ready) { ready = true; build(); render(); lay(sel, 0); paper.classList.remove("checked"); void paper.offsetWidth; setTimeout(() => paper.classList.add("checked"), 240); }
    else if (redraw) render();
  }
  return { show, step: (d) => select(sel + d), get selected() { return sel; }, bills: B, audits: A };
})();
