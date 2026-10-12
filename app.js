// ---------------------------------------------------------------- data
// Today's rakes come from the simulated day in sim.js. Each rake object is refreshed in
// place as the clock runs, so the cards, the left panel and the stage all read the same
// thing. Wagon colour carries state: orange = on site, grey = not here yet, no coal = unloaded.
// `livery` is the colour a rake's wagons wear once they are on site.
const LIVERIES = ["orange", "oxide", "cobalt", "forest", "ochre"];
// Mostly orange, a little blue, the others rare. Grey is never a livery: it is the look of a
// rake that has not arrived, so the two still on their way supply the grey.
const FLEET = { S615: "oxide", S616: "cobalt" };
const RAKES = Sim.plan(Sim.RAKES.map((r, i) => ({ ...r, seed: i + 1, livery: FLEET[r.slot] || "orange" })));
{ const pick = (new URLSearchParams(location.search).get("livery") || "").split(",").filter((n) => LIVERIES.includes(n)); if (pick.length) RAKES.forEach((r, i) => (r.livery = pick[i % pick.length])); }   // dev hook: ?livery=oxide,cobalt
const WAGONS = Sim.WAGONS;

// The original flatcars and their containers. Not shown on the Yard screen, but kept
// working: open the page with ?vehicle=flatcar to see them on the stage again.
const FLATCAR_LOADS = [
  [{ id: "FCSU423201", paint: "white" }, { id: "FSCU423207", paint: "white" }],
  [{ id: "FSCU423227", paint: "orange" }, { id: "FSCU423220", paint: "white" }],
  [{ id: "FCSU423210", paint: "white" }, { id: "FSCU423234", paint: "white" }],
  [{ id: "FSCU423231", paint: "orange" }, { id: "FSCU423225", paint: "white" }],
  [{ id: "FSCU423256", paint: "orange" }, { id: "FSCU423242", paint: "white" }],
  [{ id: "FSCU423198", paint: "orange" }],
  [{ id: "FSCU423682", paint: "grey" }],
  [{ id: "FSCU423705", paint: "grey" }],
];
RAKES.forEach((r, i) => (r.load = FLATCAR_LOADS[i].map((b, j) => ({ ...b, seed: i * 10 + j + 1 }))));

// dev hooks: ?car=3  ?t=10:45  ?speed=0  ?board  ?view=bills  ?step=-2  ?livery=oxide,cobalt  ?frame=pos,velocity  ?peek=rake,fraction,velocity  ?sink=0.5  ?vehicle=flatcar
const QUERY = new URLSearchParams(location.search);
const FLATCAR = QUERY.get("vehicle") === "flatcar";
const START = Math.max(0, Math.min(RAKES.length - 1, QUERY.has("car") ? +QUERY.get("car") : 3));

// ---------------------------------------------------------------- the clock
// The day starts at 09:24 and runs at 30 simulated seconds a second, so a wagon is
// tipped roughly every six seconds of watching.
const DAY_START = (() => { const m = /^(\d+):(\d+)$/.exec(QUERY.get("t") || ""); return m ? +m[1] * 60 + +m[2] : 9 * 60 + 24; })();
const FROZEN = QUERY.has("frame") || QUERY.has("peek") || QUERY.has("sink");
const SPEED = FROZEN ? 0 : QUERY.has("speed") ? +QUERY.get("speed") : 30;
const T_MIN = -150, T_MAX = 18 * 60 + 30;                     // the stretch of day the clock can reach
const inDay = (t) => Math.max(T_MIN, Math.min(T_MAX, t));
let clockBase = DAY_START, clockAt = performance.now(), held = 0;   // held while the clock is being dragged or stepped
const simNow = () => inDay(clockBase + (held || !SPEED ? 0 : ((performance.now() - clockAt) / 1000) * (SPEED / 60)));
const setClock = (t) => { clockBase = inDay(t); clockAt = performance.now(); };
const hold = () => { setClock(simNow()); held++; };
const release = () => { held = Math.max(0, held - 1); clockAt = performance.now(); };
const refresh = (t) => RAKES.forEach((r) => { Object.assign(r, Sim.state(r, t)); if (r.paint !== "grey") r.paint = r.livery; });
refresh(DAY_START);

// ---------------------------------------------------------------- artboard scaling
const stageEl = document.getElementById("stage");
let fitScale = 1;
// The artboard is 1920 wide and always fills the window's width. Height follows: a taller
// window shows more of the strip cards, a shorter one scrolls.
function fit() {
  const vw = document.documentElement.clientWidth;
  fitScale = vw / 1920;
  const tall = Math.max(1080, Math.ceil(window.innerHeight / fitScale));
  stageEl.style.height = tall + "px";
  stageEl.style.transform = `scale(${fitScale})`;
  stageEl.parentElement.style.setProperty("--board-h", Math.round(1080 * fitScale) + "px");
}
fit();
const pixelScale = () => Math.max(1, Math.min(3, fitScale * (window.devicePixelRatio || 1)));

// Size a canvas for the current pixel density and draw into it in artboard units.
function paint(canvas, w, h, draw) {
  const k = pixelScale();
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  draw(ctx);
}
const $ = (id) => document.getElementById(id);
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// ---------------------------------------------------------------- rake strip
const WAG = Art.GEO.WAGON;
const THUMB = { scale: FLATCAR ? 0.178 : 0.231, cx: 98, rail: 93 };
const strip = $("strip");
const cardY = (units) => (38 + THUMB.rail + units * THUMB.scale).toFixed(1);   // card y for a height above the rail
const flatPills = (r) => { const box = Art.GEO.C53; return r.load.map((b, s) => `<em class="pill pill-${b.paint}" style="top:${cardY(-84 - box.h / 2 - (box.h + Art.GEO.GAP) * s)}px">${b.id}</em>`).join(""); };
strip.innerHTML = RAKES.map((r, i) => {
  // One pill with the fact that matters. The rail the wagon stands on is the progress line.
  // Count and place wait behind the two codes and swap in over them on hover.
  const inner = FLATCAR ? flatPills(r)
    : `<i class="rail"><u></u></i><em class="pill" style="top:${cardY((WAG.TOP + WAG.FLOOR) / 2)}px"></em>`;
  const more = FLATCAR ? "" : `<div class="car-more"><small></small><small></small></div>`;
  return `<article class="car${FLATCAR ? "" : " has-more"}" role="button" tabindex="0" data-i="${i}" style="left:${66 + i * 238}px"><b>${r.slot}</b><span>${r.id}</span><div class="car-art"><canvas></canvas>${inner}</div>${more}</article>`;
}).join("");
const cards = [...strip.children];

function paintThumb(i) {
  const r = RAKES[i], el = cards[i];
  el.dataset.look = r.paint + r.loaded;
  paint(el.querySelector("canvas"), 200, 104, (ctx) => {
    ctx.translate(THUMB.cx, THUMB.rail); ctx.scale(THUMB.scale, THUMB.scale);
    if (FLATCAR) { Art.track(ctx, -500, 500, { simple: true }); Art.car(ctx, r); return; }
    Art.wagonCar(ctx, r);
  });
}
function renderCard(i) {
  const r = RAKES[i], el = cards[i];
  el.setAttribute("aria-label", `Rake ${r.id}, ${r.fact}`);
  if (FLATCAR) return;
  if (el.dataset.look !== r.paint + r.loaded) paintThumb(i);
  const pill = el.querySelector(".pill"), [count, where] = el.querySelectorAll(".car-more small");
  setText(pill, r.fact);
  pill.className = "pill " + (r.due ? "pill-due" : ["orange", "grey", "ochre"].includes(r.paint) ? "pill-" + r.paint : "pill-tint");
  el.classList.toggle("done", r.tipped >= WAGONS);
  el.querySelector(".rail u").style.width = ((r.tipped / WAGONS) * 100).toFixed(1) + "%";
  setText(count, r.status === "enroute" ? `${WAGONS} wagons` : `${r.tipped} / ${WAGONS} tipped`);
  setText(where, r.where);
}

function paintThumbs() {
  cards.forEach((_, i) => paintThumb(i));
  detailCache = [];
  paintDetailThumb(stage ? stage.sel : START);
  queueKey = owedKey = "";
}

// The wagon picture in the left panel follows the selection. Each look is drawn once and
// kept, so switching rakes only copies an image and never stalls the train.
let detailCache = [];
function paintDetailThumb(i) {
  const r = RAKES[i], key = [i, r.paint, r.loaded, pixelScale()].join();
  let src = detailCache.find((c) => c.key === key);
  if (!src) {
    src = document.createElement("canvas");
    paint(src, 323, 100, (ctx) => {
      ctx.translate(161.5, 88);
      if (FLATCAR) { ctx.translate(0, -21); ctx.scale(0.333, 0.333); Art.track(ctx, -485, 485, { simple: true }); Art.car(ctx, { id: r.id, load: [] }); return; }
      ctx.scale(0.32, 0.32);
      ctx.save(); ctx.beginPath(); ctx.rect(-410, -10, 820, 60); ctx.clip(); Art.track(ctx, -410, 410, { simple: true }); ctx.restore();
      Art.wagonCar(ctx, { ...r, detail: true });
    });
    src.key = key; detailCache.push(src);
  }
  const el = $("flatcarThumb");
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.width = src.width; el.height = src.height; el.style.width = "323px"; el.style.height = "100px";
  el.getContext("2d").drawImage(src, 0, 0);
}

// ---------------------------------------------------------------- left panel
const meterSvg = $("radarGrid"), meterPill = $("meterPill");
let meterKey = "", meterMark = null, probing = null;

// The pill is the only tooltip: at rest it reads the meter, and over the chart it reads
// whatever moment the pointer is on.
function placePill(point, html, pill = meterPill) {
  if (pill.innerHTML !== html) pill.innerHTML = html;
  const w = pill.offsetWidth, px = 151 + point.x, py = 531 + point.y;
  let left = px + 15;
  if (left + w > 438) left = px - 15 - w;                       // flip to the other side rather than leave the panel
  pill.style.left = Math.max(12, left) + "px";
  pill.style.top = py - 36 + "px";
}
function renderPanel(i) {
  const r = RAKES[i];
  setText($("flatcarId"), r.id);
  paintDetailThumb(i);
  setText($("fFrom"), r.from + " mines");
  setText($("fLoad"), r.tonnes.toLocaleString("en-IN") + " t coal");
  setText($("fStatus"), r.label);
  setText($("fTipped"), `${r.tipped} / ${WAGONS}`);
  const coming = r.status === "enroute";
  setText($("fFreeLabel"), coming ? "Expected" : r.status === "placing" ? "Free time starts" : "Free time ends");
  setText($("fFree"), coming ? `${Sim.clock(r.eta)} · ${r.where}` : r.status === "placing" ? Sim.clock(r.placed) : `${Sim.clock(r.freeUntil)} · placed ${Sim.clock(r.placed)}`);
  setText($("axFree"), coming || r.status === "placing" ? "Free time" : "Free until " + Sim.clock(r.freeUntil));
  setText($("stageTitle"), boardOn ? "Today, rake by rake" : r.status === "released" ? "Departed" : r.where);

  const placed = !coming && r.status !== "placing", t = Math.min(now, r.released);
  const plan = Sim.hoursOver(r.released - r.freeUntil);
  const free = r.freeUntil - r.placed;
  const key = [i, placed, free, Math.floor(((t - r.placed) / free) * 14 * 3), r.hours, plan].join();
  if (key !== meterKey) {
    meterKey = key;
    meterMark = Meter.draw(meterSvg, { placed, free, elapsed: t - r.placed, over: r.over, hours: r.hours, plan });
  }
  if (probing) return;
  const html = !placed ? `<span class="up idle">→</span> Arrives <span class="num">${Sim.clock(r.eta)}</span>`
    : r.cost ? `<span class="up over">↑</span> <span class="num">${Sim.rupees(r.cost)}</span> - ${r.hours} h over`
    : r.status === "released" ? `<span class="up">✓</span> <span class="num">No charge</span> - released ${Sim.clock(r.released)}`
    : `<span class="up">✓</span> <span class="num">${Sim.span(r.left)}</span> - of free time left`;
  placePill(meterMark || { x: 79 - 14 * 5.27, y: 76 }, html);
}
// Hovering the chart reads off any moment: the time, and what the meter would say by then.
meterSvg.addEventListener("mousemove", (e) => {
  const box = meterSvg.getBoundingClientRect(), r = RAKES[stage ? stage.sel : START];
  const p = Meter.probe(((e.clientX - box.left) / box.width) * 162, r.freeUntil - r.placed);
  probing = p;
  placePill(p, p.hours ? `<span class="up over">↑</span> <span class="num">${Sim.rupees(p.cost)}</span> - if still here at ${Sim.clock(r.placed + p.minutes)}`
    : `<span class="up">✓</span> <span class="num">${Sim.clock(r.placed + p.minutes)}</span> - inside free time`);
});
meterSvg.addEventListener("mouseleave", () => { probing = null; if (stage) renderPanel(stage.sel); });

// Livery swatches behind the left panel's cog: repaint the selected rake's wagons.
const swatches = $("swatches"), liveryBtn = $("liveryBtn");
swatches.innerHTML = LIVERIES.map((n) => `<button data-livery="${n}" aria-label="${n}" style="background:${Art.PAINTS[n].base}"></button>`).join("");
liveryBtn.addEventListener("click", (e) => { e.stopPropagation(); liveryBtn.setAttribute("aria-expanded", swatches.classList.toggle("open")); });
document.addEventListener("click", (e) => { if (!swatches.contains(e.target)) { swatches.classList.remove("open"); liveryBtn.setAttribute("aria-expanded", "false"); } });
swatches.addEventListener("click", (e) => {
  const n = e.target.dataset.livery;
  if (!n || !stage) return;
  RAKES[stage.sel].livery = n;
  refresh(now);
  cards.forEach((_, i) => renderCard(i));
  reflect(stage.sel, false);
  stage.sync();
});

// ---------------------------------------------------------------- right cards
// Card A: the rake's place in its tippler's queue, drawn with the same wagons as the stage.
const DOT = { ok: "#6f8d00", warn: "#f5752e", idle: "#8c8c8c", ink: "#111", info: "#1677e6" };
let queueKey = "", owedKey = "";
function renderPlan(i) {
  const r = RAKES[i], q = Sim.queue(RAKES, r.tippler), n = q.indexOf(r), three = [q[n - 1], r, q[n + 1]];
  setText($("planTitle"), `Tippler ${r.tippler} · 19 tips an hour`);
  setText($("planLabel"), r.status === "released" ? "Cleared at:" : "Clear by:");
  setText($("planValue"), Sim.clock(r.released));
  setText($("planA"), "Tippler " + r.tippler); $("planDotA").style.background = DOT.ink;
  setText($("planB"), Sim.clock(r.start)); $("planDotB").style.background = r.released > r.freeUntil ? DOT.warn : DOT.ok;
  for (const key of ["planA", "planB"]) selectFor(key).classList.toggle("locked", now >= r.start);   // once tipping starts the plan is fixed
  const word = (x) => (x.status === "released" || x.status === "forming" ? "done" : x.status === "unloading" ? "now" : Sim.clock(x.start));
  const key = three.map((x) => (x ? x.slot + x.paint + x.loaded + word(x) : "-")).join() + pixelScale();
  if (key === queueKey) return;
  queueKey = key;
  paint($("queueCanvas"), 402, 72, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(0, 60, 402, 2); ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(0, 62, 402, 1);
    three.forEach((x, k) => {
      if (!x) return;
      ctx.save(); ctx.translate(67 + k * 134, 60); ctx.scale(0.15, 0.15); Art.wagonCar(ctx, x); ctx.restore();
      if (k !== 1) { ctx.fillStyle = "rgba(225,225,225,.6)"; ctx.fillRect(k * 134, 0, 134, 59.5); }      // the others stand back
    });
  });
  $("queueCaps").innerHTML = three.map((x, k) => (x ? `<span class="${k === 1 ? "on" : ""}" style="left:${67 + k * 134}px">${x.slot} · ${word(x)}</span>` : "")).join("");
}

// Card B: free time used and free time owed, half an hour a dot.
function renderOwed(i) {
  const r = RAKES[i], owed = r.owed ? r.owed.minutes : 0, placed = now >= r.placed, applied = r.claim === "applied";
  const elapsed = placed ? Math.min(now, r.released) - r.placed : -1;
  const free = (r.freeUntil - r.placed) / 30, extra = applied ? 0 : owed / 30;      // once applied, the allowance is simply free time
  setText($("owedValue"), owed ? `+${owed / 60} h` : "0 h");
  setText($("owedA"), owed ? r.owed.rule : "None"); $("owedDotA").style.background = owed ? (applied ? DOT.ok : DOT.warn) : DOT.idle;
  const claim = CLAIMS.find((c) => c.v === r.claim);
  setText($("owedB"), owed ? claim.label : "Nothing to file"); $("owedDotB").style.background = owed ? claim.dot : DOT.idle;
  selectFor("owedB").classList.toggle("locked", !owed);
  const saved = r.cost - r.costIfClaimed;
  const tip = !owed ? "No allowance applies to this rake"
    : applied ? `Applied - free time now runs to <span class="num">${Sim.clock(r.freeUntil)}</span>`
    : saved > 0 ? `Applying it takes <span class="num">${Sim.rupees(saved)}</span> off the meter`
    : `Applied, it would cover this rake until <span class="num">${Sim.clock(r.freeUntil + owed)}</span>`;
  if ($("owedTip").innerHTML !== tip) $("owedTip").innerHTML = tip;
  const key = [i, Math.floor(elapsed / 30), owed, r.claim].join();
  if (key === owedKey) return;
  owedKey = key;
  const N = 22, step = 16.6, x0 = (402 - (N - 1) * step - (extra ? 16 : 8)) / 2, at = (n) => x0 + n * step + (n >= free ? 8 : 0) + (extra && n >= free + extra ? 8 : 0);
  let dots = "";
  for (let n = 0; n < N; n++) {
    const used = n * 30 < elapsed, x = at(n).toFixed(1);
    dots += n < free ? (used ? `<circle cx="${x}" cy="18" r="3.1" fill="#111"/>` : `<circle cx="${x}" cy="18" r="2" fill="#9a9a9a" opacity=".75"/>`)
      : n < free + extra ? (used ? `<circle cx="${x}" cy="18" r="3.5" fill="#fc7f37"/>` : `<circle cx="${x}" cy="18" r="2.7" fill="#fc8a48" opacity=".5"/>`)
      : used ? `<circle cx="${x}" cy="18" r="3.5" fill="#fc7f37"/>` : `<circle cx="${x}" cy="18" r="1" fill="#9a9a9a" opacity=".5"/>`;
  }
  $("owedDots").innerHTML = dots;
  const label = (id, text, a, b) => { const el = $(id); setText(el, text); el.style.left = (at(a) + at(b)) / 2 + "px"; };
  label("owedAxA", placed ? `${free / 2} h free · until ${Sim.clock(r.freeUntil)}` : `${free / 2} h free`, 0, free - 1);
  label("owedAxB", extra ? `+${owed / 60} h ${r.owed.rule.toLowerCase()}` : "", free, free + Math.max(extra, 1) - 1);
  label("owedAxC", elapsed > (free + extra) * 30 ? "charged" : "", free + extra, N - 1);
}

// ---------------------------------------------------------------- the pills' menus
// Each pill on the right-hand cards opens the same small menu. Choosing something re-plans
// the day (sim.js), and everything on screen follows from the new plan.
const CLAIMS = [
  { v: "none", label: "Not filed", dot: DOT.warn },
  { v: "filed", label: "Filed", dot: DOT.info, note: "awaiting reply" },
  { v: "applied", label: "Applied", dot: DOT.ok },
];
const ALLOWANCES = [{ rule: "Bunching", minutes: 180 }, { rule: "Shunting", minutes: 120 }, { rule: "Tarpaulin", minutes: 60 }];
const HOLDS = [[0, "Earliest"], [30, "30 min later"], [60, "1 h later"], [120, "2 h later"]];
const MENUS = {
  planA: (r) => ({
    options: [1, 2].map((t) => ({ v: t, label: "Tippler " + t, dot: DOT.ink, on: r.tippler === t, note: t === r.tippler ? "" : "starts " + Sim.clock(trial(r, { tippler: t }).start) })),
    pick: (v) => { r.tippler = v; r.ready = Math.max(r.ready, Math.ceil(now)); },
  }),
  planB: (r) => ({
    options: HOLDS.map(([m, label]) => ({ v: m, label, dot: DOT.idle, on: r.hold === m, note: Sim.clock(trial(r, { hold: m }).start) })),
    pick: (v) => { r.hold = v; },
  }),
  owedA: (r) => ({
    options: [...ALLOWANCES.map((a) => ({ v: a, label: a.rule, dot: DOT.warn, on: !!r.owed && r.owed.rule === a.rule, note: `+${a.minutes / 60} h` })), { v: null, label: "None", dot: DOT.idle, on: !r.owed }],
    pick: (v) => { r.owed = v; if (!v) r.claim = "none"; },
  }),
  owedB: (r) => ({
    options: CLAIMS.map((c) => ({ ...c, on: r.claim === c.v })),
    pick: (v) => { r.claim = v; },
  }),
};
// What the plan would be for rake `r` with a change applied, without committing to it.
function trial(r, change) {
  const copy = RAKES.map((x) => (x === r ? { ...x, ...change, ready: change.tippler ? Math.max(x.ready, Math.ceil(now)) : x.ready } : { ...x }));
  return Sim.plan(copy)[RAKES.indexOf(r)];
}
const menu = $("menu"), selectFor = (key) => document.querySelector(`.select[data-menu="${key}"]`);
let menuFor = null;
function closeMenu() {
  if (!menuFor) return;
  menuFor.setAttribute("aria-expanded", "false");
  menu.classList.remove("open");
  menuFor = null;
}
function openMenu(btn) {
  const m = MENUS[btn.dataset.menu](RAKES[stage.sel]);
  menu.innerHTML = m.options.map((o, n) => `<button role="option" data-n="${n}" aria-selected="${!!o.on}"><i style="background:${o.dot}"></i>${o.label}${o.note ? `<small>${o.note}</small>` : ""}</button>`).join("");
  menu.onclick = (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    m.pick(m.options[+el.dataset.n].v);
    closeMenu();
    (m.after || replan)();
  };
  // sit just under the pill, or just over it when there is no room below
  const a = stageEl.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const x = (b.left - a.left) / fitScale, y = (b.top - a.top) / fitScale, h = m.options.length * 34 + 14, up = y > 600;
  menu.style.left = x + "px";
  menu.style.top = (up ? y - h - 6 : y + 46) + "px";
  menu.style.transformOrigin = up ? "50% 100%" : "50% 0";
  menuFor = btn;
  btn.setAttribute("aria-expanded", "true");
  menu.classList.add("open");
  const current = menu.querySelector('[aria-selected="true"]');
  if (current) current.focus({ preventScroll: true });
}
document.querySelectorAll(".select[data-menu]").forEach((btn) => btn.addEventListener("click", (e) => {
  e.stopPropagation();
  const again = menuFor === btn;
  closeMenu();
  if (!again && stage && !btn.classList.contains("locked")) openMenu(btn);
}));
document.addEventListener("click", (e) => { if (!menu.contains(e.target)) closeMenu(); });
window.addEventListener("keydown", (e) => {
  if (!menuFor) return;
  if (e.key === "Escape") { const btn = menuFor; closeMenu(); btn.focus(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); e.stopPropagation();
    const items = [...menu.children], at = items.indexOf(document.activeElement);
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
  }
}, true);
// The plan has changed: re-time the day, then let every part of the screen catch up.
function replan() {
  Sim.plan(RAKES);
  queueKey = owedKey = meterKey = "";
  refresh(now);
  cards.forEach((_, i) => renderCard(i));
  reflect(stage.sel, false);
  stage.sync();
}

// ---------------------------------------------------------------- stage overlays
// The badge: wagons tipped inside a ring that closes as the rake is unloaded. Before the
// rake is in, and after it is done, it carries a glyph instead. The rest is in its pill.
const badge = $("badge");
function renderBadge(i) {
  const r = RAKES[i], coming = r.status === "enroute" || r.status === "placing", done = r.status === "forming" || r.status === "released";
  badge.classList.toggle("coming", coming);
  badge.classList.toggle("done", done);
  setText($("badgeNum"), String(r.tipped));
  $("badgeArc").style.strokeDasharray = `${((r.tipped / WAGONS) * 194.8).toFixed(1)} 195`;
  const tons = Math.round((r.tonnes * (WAGONS - r.tipped)) / WAGONS).toLocaleString("en-IN");
  const html = r.status === "enroute" ? `Arrives <span class="num">${Sim.clock(r.eta)}</span> - ${r.where}`
    : r.status === "placing" ? `Being placed - free time starts <span class="num">${Sim.clock(r.placed)}</span>`
    : r.status === "waiting" ? `<span class="num">${WAGONS}</span> wagons waiting - tipping starts ${Sim.clock(r.start)}`
    : r.status === "unloading" ? `<span class="num">${r.tipped}</span> of ${WAGONS} tipped - ${tons} t to go`
    : r.status === "forming" ? `All <span class="num">${WAGONS}</span> tipped - forming up to leave`
    : `Released <span class="num">${Sim.clock(r.released)}</span> - ${r.where.toLowerCase()}`;
  const tip = $("badgeTip");
  if (tip.innerHTML !== html) tip.innerHTML = html;
  badge.setAttribute("aria-label", tip.textContent);
}

// ---------------------------------------------------------------- selection
const panel = document.querySelector(".panel-center");
const prevBtn = document.querySelector(".arrow.prev"), nextBtn = document.querySelector(".arrow.next");
let stage = null, now = DAY_START, boardOn = false;

function reflect(sel, moving) {
  cards.forEach((el, i) => el.classList.toggle("active", i === sel));
  renderPanel(sel);
  renderBadge(sel);
  renderPlan(sel);
  renderOwed(sel);
  swatches.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.livery === RAKES[sel].livery));
  panel.classList.toggle("is-moving", moving);
  panel.classList.toggle("flatcar", FLATCAR);
  panel.classList.toggle("has-slot", FLATCAR && RAKES[sel].load.length < 2);
  prevBtn.disabled = sel === 0;
  nextBtn.disabled = sel === RAKES.length - 1;
}
const go = (i) => stage && stage.select(i);

strip.addEventListener("click", (e) => { const el = e.target.closest(".car"); if (el) go(+el.dataset.i); });
strip.addEventListener("keydown", (e) => {
  const el = e.target.closest(".car");
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(+el.dataset.i); }
});
prevBtn.addEventListener("click", () => go(stage.sel - 1));
nextBtn.addEventListener("click", () => go(stage.sel + 1));
window.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const d = e.key === "ArrowLeft" ? -1 : 1;
  if (view === "yard") go(stage.sel + d); else SCREENS[view].step(d);
});

// ---------------------------------------------------------------- screens
// Yard, Bills and Savings share the artboard and cross-fade. The other two live in their
// own files and are set up the first time they are shown.
let view = "yard";
const SCREENS = { get bills() { return Bills; }, get savings() { return Savings; } };
function show(name) {
  if (!document.getElementById("screen" + name[0].toUpperCase() + name.slice(1))) return;
  view = name;
  closeMenu();
  document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("on", el.id.toLowerCase() === "screen" + name));
  document.querySelectorAll(".mainnav .cbtn").forEach((b) => { b.classList.toggle("active", b.dataset.view === name); b.setAttribute("aria-current", b.dataset.view === name ? "page" : "false"); });
  if (name !== "yard") SCREENS[name].show();
}
document.querySelectorAll(".mainnav .cbtn").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

// A slider that stands for a place in a short list: drag the knob, or step with the buttons.
function listSlider(pre, count, current, choose, label) {
  const track = $(pre + "Track"), knob = $(pre + "Knob");
  const pickAt = (e) => { const box = track.getBoundingClientRect(); choose(Math.round(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * (count - 1))); };
  track.addEventListener("pointerdown", (e) => { track.setPointerCapture(e.pointerId); track.classList.add("held"); pickAt(e); });
  track.addEventListener("pointermove", (e) => { if (track.classList.contains("held")) pickAt(e); });
  for (const type of ["pointerup", "pointercancel"]) track.addEventListener(type, () => track.classList.remove("held"));
  $(pre + "Back").addEventListener("click", () => choose(current() - 1));
  $(pre + "Fwd").addEventListener("click", () => choose(current() + 1));
  return () => { knob.style.left = ((current() / (count - 1)) * 85).toFixed(1) + "px"; setText($(pre + "KnobLabel"), label()); };
}

// ---------------------------------------------------------------- the clock's slider
// Drag the knob to scrub through the day; the two round buttons step half an hour.
const clockTrack = $("clockTrack"), clockKnob = $("clockKnob");
function renderClock() {
  clockKnob.style.left = (((now - T_MIN) / (T_MAX - T_MIN)) * 85).toFixed(1) + "px";
  setText($("clockLabel"), Sim.clock(now));
  clockTrack.setAttribute("aria-valuetext", Sim.clock(now));
}
const scrubTo = (e) => { const box = clockTrack.getBoundingClientRect(); setClock(T_MIN + Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * (T_MAX - T_MIN)); beat(); };
clockTrack.addEventListener("pointerdown", (e) => { clockTrack.setPointerCapture(e.pointerId); clockTrack.classList.add("held"); hold(); scrubTo(e); });
clockTrack.addEventListener("pointermove", (e) => { if (clockTrack.classList.contains("held")) scrubTo(e); });
const letGo = () => { if (clockTrack.classList.contains("held")) { clockTrack.classList.remove("held"); release(); } };
clockTrack.addEventListener("pointerup", letGo);
clockTrack.addEventListener("pointercancel", letGo);
// A step glides rather than jumps, so the yard can be seen rolling to the new moment.
function stepClock(minutes) {
  const from = simNow(), to = inDay(from + minutes), t0 = performance.now();
  hold();
  (function glide() {
    const u = Math.min(1, (performance.now() - t0) / 480), e = u * u * (3 - 2 * u);
    setClock(from + (to - from) * e); beat();
    if (u < 1) requestAnimationFrame(glide); else release();
  })();
}
$("clockBack").addEventListener("click", () => stepClock(-30));
$("clockFwd").addEventListener("click", () => stepClock(30));
clockTrack.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.stopPropagation(); stepClock(e.key === "ArrowLeft" ? -30 : 30); } });

// ---------------------------------------------------------------- the day view
// The stage's second face: every rake on its own track, with time along it (board.js).
const boardCanvas = $("boardCanvas"), boardTip = $("boardTip"), viewBtn = $("viewBtn");
let boardHover = -1, boardRaf = 0;
function boardFrame() {
  boardRaf = 0;
  if (!boardOn || !stage) return;
  Board.draw(boardCanvas, { now: simNow(), rakes: RAKES, sel: stage.sel, hover: boardHover, k: pixelScale() });
  boardRaf = requestAnimationFrame(boardFrame);
}
function setBoard(on) {
  boardOn = on;
  panel.classList.toggle("board", on);
  viewBtn.classList.toggle("active", on);
  viewBtn.setAttribute("aria-pressed", on);
  boardTip.classList.remove("on");
  if (stage) renderPanel(stage.sel);
  if (on && !boardRaf) boardFrame();
}
viewBtn.addEventListener("click", () => setBoard(!boardOn));
// Pointing anywhere on a track reads off that rake at that moment.
boardCanvas.addEventListener("mousemove", (e) => {
  const box = boardCanvas.getBoundingClientRect(), x = (e.clientX - box.left) / fitScale, y = (e.clientY - box.top) / fitScale;
  const p = Board.probe(x, y, simNow(), RAKES.length);
  boardHover = p.row;
  boardTip.classList.toggle("on", p.row >= 0);
  if (p.row < 0) return;
  const r = RAKES[p.row], s = Sim.state(r, p.time);
  const html = `<span class="num">${r.slot}</span> at ${Sim.clock(p.time)} - ${s.label.toLowerCase()}${s.status === "released" || s.status === "enroute" ? "" : ", " + s.fact}`;
  if (boardTip.innerHTML !== html) boardTip.innerHTML = html;
  boardTip.style.left = Math.max(12, Math.min(x + 16, TrainStage.W - boardTip.offsetWidth - 12)) + "px";
  boardTip.style.top = y - 42 + "px";
});
boardCanvas.addEventListener("mouseleave", () => { boardHover = -1; boardTip.classList.remove("on"); });
boardCanvas.addEventListener("click", () => { if (boardHover >= 0) go(boardHover); });

// Once a moment: move the clock on, and let everything that changed catch up.
function beat() {
  now = simNow();
  const sel = stage.sel, before = [RAKES[sel].view, RAKES[sel].tipped, RAKES[sel].paint].join();
  refresh(now);
  cards.forEach((_, i) => renderCard(i));
  renderPanel(sel);
  renderBadge(sel);
  renderPlan(sel);
  renderOwed(sel);
  renderClock();
  if (before !== [RAKES[sel].view, RAKES[sel].tipped, RAKES[sel].paint].join()) stage.sync();
}

async function start() {
  // the liveries are typeset on the canvas, so the faces must be ready first
  const faces = ["700 18px Inter", "600 9px Inter"].map((f) => document.fonts.load(f, "SBB 0123"));
  await Promise.race([Promise.all(faces), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  stage = new TrainStage.Stage($("trainCanvas"), RAKES, {
    selected: START,
    vehicle: FLATCAR ? "flatcar" : "wagon",
    onState: ({ moving, selected }) => reflect(selected, moving),
  });
  stage.build(pixelScale());
  paintThumbs();
  cards.forEach((_, i) => renderCard(i));
  reflect(START, false);
  if (QUERY.has("frame")) { const [p, v] = QUERY.get("frame").split(",").map(Number); stage.debugFrame(p, v || 0); }
  if (QUERY.has("sink")) { stage.items.find((it) => it.idx === stage.at).fill = +QUERY.get("sink"); stage.render(0, 0); }
  if (QUERY.has("peek")) { const [i, u, v] = QUERY.get("peek").split(",").map(Number); stage.debugSwitch(i, u, v || 0); }
  if (QUERY.has("board")) setBoard(true);
  if (QUERY.has("view")) { show(QUERY.get("view")); if (QUERY.has("step") && view !== "yard") SCREENS[view].step(+QUERY.get("step")); }
  beat();
  if (!FROZEN) setInterval(beat, 200);
}
start();

let resizeTimer = 0;
window.addEventListener("resize", () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (stage) { stage.build(pixelScale()); paintThumbs(); meterKey = ""; reflect(stage.sel, false); if (view !== "yard") SCREENS[view].show(true); } }, 160);
});
