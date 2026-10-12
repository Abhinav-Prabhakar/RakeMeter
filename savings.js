// The Savings screen. The year is one train and each month is a wagon. The coal in a wagon
// is what demurrage cost that month; the dashed outline above it is what it would have
// cost, so the gap between the two is the saving. Walking down the train is the trend.
const Savings = (() => {
  const M = Ledger.MONTHS.map((m, i) => ({ ...m, paint: "orange", seed: 20 + i }));
  let sel = M.length - 1, ready = false, train = null, cause = 0, drawSlider = () => {};
  const strip = $("sStrip"), L = Ledger.lakh;
  const share = (m) => (m.baseline ? m.saved / m.baseline : 0);

  // ---------------------------------------------------------------- left: the month
  // Two wagons side by side: the load it would have carried, and the load it did.
  function drawPair(m) {
    paint($("sPair"), 390, 76, (ctx) => {
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(0, 62, 390, 2); ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(0, 64, 390, 1);
      [[104, m.outline, "grey"], [286, m.level, "orange"]].forEach(([cx, fill, paint], k) => {
        ctx.save(); ctx.translate(cx, 62); ctx.scale(0.2, 0.2); Art.wagonCar(ctx, { paint, rise: fill, seed: m.seed }); ctx.restore();
        if (!k) { ctx.fillStyle = "rgba(225,225,225,.5)"; ctx.fillRect(0, 0, 195, 61.5); }   // what did not happen stands back
      });
    });
    $("sPairCaps").innerHTML = `<span style="left:104px">without · ${L(m.baseline)}</span><span class="on" style="left:286px">charged · ${L(m.paid)}</span>`;
  }
  // The month as dots, ₹5,000 each: what was paid filling from the left in black, what
  // was saved after it in orange (claims paler), and the rest of the grid left quiet.
  function drawDots(m) {
    const OX = 79, OY = 76, STEP = 5.27, COLS = 31, ROWS = 29, unit = 5000;
    const paid = Math.round(m.paid / unit), avoided = Math.round(m.avoided / unit), back = Math.round(m.recovered / unit);
    let out = "", n = 0, edge = OX - 15 * STEP;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++, n++) {
        const x = (OX + (c - 15) * STEP).toFixed(2), y = (OY + (14 - r) * STEP).toFixed(2);
        if (n < paid) { out += `<circle cx="${x}" cy="${y}" r="1.3" fill="#111"/>`; edge = +x; }
        else if (n < paid + avoided) out += `<circle cx="${x}" cy="${y}" r="1.9" fill="#fc7f37"/>`;
        else if (n < paid + avoided + back) out += `<circle cx="${x}" cy="${y}" r="1.7" fill="#fc8a48" opacity=".5"/>`;
        else out += `<circle cx="${x}" cy="${y}" r=".62" fill="#9a9a9a" opacity=".5"/>`;
      }
    }
    $("sDots").innerHTML = out;
    const pct = Math.round(share(m) * 100);
    placePill({ x: edge + 4, y: OY - 52 }, m.saved ? `<span class="up">↓</span> <span class="num">${pct}%</span> - less than without` : `<span class="up idle">→</span> Before the product went in`, $("sDotsPill"));
    setText($("sDotsCap"), `${L(m.baseline)} without`);
  }
  function renderMonth(m) {
    setText($("sSaved"), m.saved ? L(m.saved) : "₹0");
    drawPair(m); drawDots(m);
    setText($("sPaid"), L(m.paid)); setText($("sRakes"), String(m.rakes));
    setText($("sAvoided"), m.avoided ? L(m.avoided) : "Nothing yet"); setText($("sRecovered"), m.recovered ? L(m.recovered) : "Nothing yet");
    setText($("sBaseline"), L(m.baseline) + (m.partial ? ` · ${m.partial}` : ""));
    setText($("sTitle"), `${m.name} 2026${m.partial ? " · " + m.partial : ""}`);
    // the badge: how much smaller the load is than it would have been
    const pct = Math.round(share(m) * 100);
    setText($("sBadgeNum"), pct + "%");
    $("sBadgeArc").style.strokeDasharray = `${(share(m) * 194.8).toFixed(1)} 195`;
    const tip = m.saved ? `<span class="num">${L(m.saved)}</span> less coal than the outline: that is the saving` : "The load matches the outline: nothing was saved yet";
    if ($("sBadgeTip").innerHTML !== tip) $("sBadgeTip").innerHTML = tip;
  }

  // ---------------------------------------------------------------- right: causes and claims
  function renderCause(m) {
    const C = Ledger.CAUSES, total = 22, counts = C.map(([, s]) => Math.max(1, Math.round(s * total)));
    setText($("sCauseLabel"), C[cause][0] + ":"); setText($("sCauseValue"), L(Math.round((m.paid * C[cause][1]) / 1000) * 1000));
    setText($("sSelCause"), C[cause][0]);
    const step = 15.4, gap = 12, width = (counts.reduce((a, b) => a + b) - 1) * step + (C.length - 1) * gap;
    let x = (402 - width) / 2, dots = "", caps = "";
    counts.forEach((n, g) => {
      const from = x;
      for (let d = 0; d < n; d++, x += step) dots += g === cause ? `<circle cx="${x.toFixed(1)}" cy="18" r="3.5" fill="#fc7f37"/>` : `<circle cx="${x.toFixed(1)}" cy="18" r="2.9" fill="#111"/>`;
      caps += `<span class="${g === cause ? "on" : ""}" style="left:${((from + x - step) / 2).toFixed(1)}px">${C[g][0]}</span>`;
      x += gap;
    });
    $("sCauseDots").innerHTML = dots; $("sCauseCaps").innerHTML = caps;
    $("sCauseTip").innerHTML = `<span class="num">${Math.round(C[cause][1] * 100)}%</span> of what was still charged in ${m.name}`;
  }
  MENUS.cause = () => ({
    options: Ledger.CAUSES.map(([name, s], i) => ({ v: i, label: name, dot: i === cause ? "#f5752e" : "#111", on: i === cause, note: Math.round(s * 100) + "%" })),
    pick: (v) => { cause = v; },
    after: () => renderCause(M[sel]),
  });
  function renderClaims(m) {
    const live = sel === M.length - 1, open = Bills.audits.filter((a) => a.state === "open" || a.state === "filed");
    setText($("sClaimsTitle"), `Claims decided in ${m.name}`);
    setText($("sClaimsValue"), m.recovered ? L(m.recovered) : "₹0");
    setText($("sOpenClaims"), live && open.length ? `${open.length} · ${Sim.rupees(open.reduce((s, a) => s + a.back, 0))}` : "None");
    $("sSlips").innerHTML = m.recovered ? ["#33363c", "#d9540f", "#33363c"].map((ink) => `<i class="slip" style="--ink:${ink}"></i>`).join("") : `<i class="slip" style="--ink:#9a968c;left:198px;top:6px;opacity:.55"></i>`;
  }

  // ---------------------------------------------------------------- strip and stage
  function build() {
    strip.innerHTML = M.map((m, i) => `<article class="car has-more" role="button" tabindex="0" data-i="${i}" style="left:${66 + i * 238}px"><b>${m.name.slice(0, 3).toUpperCase()}</b><span>2026</span><div class="car-art"><canvas></canvas><i class="rail"><u></u></i><em class="pill" style="top:${(38 + 93 + ((Art.GEO.WAGON.TOP + Art.GEO.WAGON.FLOOR) / 2) * 0.231).toFixed(1)}px"></em></div><div class="car-more"><small></small><small></small></div></article>`).join("");
    strip.addEventListener("click", (e) => { const el = e.target.closest(".car"); if (el) select(+el.dataset.i); });
    strip.addEventListener("keydown", (e) => { const el = e.target.closest(".car"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(+el.dataset.i); } });
    const screen = $("screenSavings");
    screen.querySelector(".arrow.prev").addEventListener("click", () => select(sel - 1));
    screen.querySelector(".arrow.next").addEventListener("click", () => select(sel + 1));
    $("sOpenBills").addEventListener("click", () => window.show("bills"));
    drawSlider = listSlider("s", M.length, () => sel, select, () => M[sel].name.slice(0, 3));
    train = new TrainStage.Stage($("monthsCanvas"), M, { vehicle: "months", selected: sel, onState: ({ moving }) => screen.querySelector(".panel-center").classList.toggle("is-moving", moving) });
  }
  function paintCards() {
    [...strip.children].forEach((el, i) => {
      const m = M[i];
      paint(el.querySelector("canvas"), 200, 104, (ctx) => { ctx.translate(98, 93); ctx.scale(0.231, 0.231); Art.wagonCar(ctx, { paint: "orange", rise: m.level, ghost: m.saved ? m.outline : 0, seed: m.seed }); });
      el.querySelector(".rail u").style.width = (share(m) * 100).toFixed(1) + "%";
      const pill = el.querySelector(".pill"), [a, b] = el.querySelectorAll(".car-more small");
      setText(pill, m.saved ? `${L(m.saved)} saved` : "Before"); pill.className = "pill pill-orange";
      setText(a, `paid ${L(m.paid)}`); setText(b, `of ${L(m.baseline)}`);
      el.setAttribute("aria-label", `${m.name}, ${m.saved ? L(m.saved) + " saved" : "before the product"}`);
    });
  }
  function render() {
    const m = M[sel], screen = $("screenSavings");
    [...strip.children].forEach((el, i) => el.classList.toggle("active", i === sel));
    renderMonth(m); renderCause(m); renderClaims(m);
    screen.querySelector(".arrow.prev").disabled = sel === 0;
    screen.querySelector(".arrow.next").disabled = sel === M.length - 1;
    drawSlider();
  }
  function select(i) {
    i = Math.max(0, Math.min(M.length - 1, i));
    if (i === sel) return;
    sel = i;
    train.select(i);                                  // the same roll as the Yard: the train moves on to that month's wagon
    render();
  }
  function show(redraw) {
    if (!ready) { ready = true; build(); train.build(pixelScale()); paintCards(); render(); }
    else if (redraw) { train.build(pixelScale()); paintCards(); render(); }
  }
  return { show, step: (d) => select(sel + d) };
})();
