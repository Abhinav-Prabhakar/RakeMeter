// ---------------------------------------------------------------- data
// Today's rakes come from the simulated day in sim.js. Each rake object is refreshed in
// place as the clock runs, so the cards, the left panel and the stage all read the same
// thing. Wagon colour carries state: orange = on site, grey = not here yet, no coal = unloaded.
const RAKES = Sim.RAKES.map((r, i) => ({ ...r, seed: i + 1 }));
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

// dev hooks: ?car=3  ?t=10:45  ?speed=0  ?frame=pos,velocity  ?peek=rake,fraction,velocity  ?vehicle=flatcar
const QUERY = new URLSearchParams(location.search);
const FLATCAR = QUERY.get("vehicle") === "flatcar";
const START = Math.max(0, Math.min(RAKES.length - 1, QUERY.has("car") ? +QUERY.get("car") : 3));

// ---------------------------------------------------------------- the clock
// The day starts at 09:24 and runs at 30 simulated seconds a second, so a wagon is
// tipped roughly every six seconds of watching.
const DAY_START = (() => { const m = /^(\d+):(\d+)$/.exec(QUERY.get("t") || ""); return m ? +m[1] * 60 + +m[2] : 9 * 60 + 24; })();
const FROZEN = QUERY.has("frame") || QUERY.has("peek");
const SPEED = FROZEN ? 0 : QUERY.has("speed") ? +QUERY.get("speed") : 30;
const bootedAt = performance.now();
const simNow = () => DAY_START + ((performance.now() - bootedAt) / 1000) * (SPEED / 60);
const refresh = (t) => RAKES.forEach((r) => Object.assign(r, Sim.state(r, t)));
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
  // one pill with the fact that matters; progress and place stay tucked away until hover
  const inner = FLATCAR ? flatPills(r)
    : `<em class="pill" style="top:${cardY((WAG.TOP + WAG.FLOOR) / 2)}px"></em>`;
  const more = FLATCAR ? "" : `<div class="car-more"><i class="bar"><u></u></i><small></small><small></small></div>`;
  return `<article class="car${FLATCAR ? "" : " has-more"}" role="button" tabindex="0" data-i="${i}" style="left:${66 + i * 238}px"><b>${r.slot}</b><span>${r.id}</span><div class="car-art"><canvas></canvas>${inner}</div>${more}</article>`;
}).join("");
const cards = [...strip.children];

function paintThumb(i) {
  const r = RAKES[i], el = cards[i];
  el.dataset.look = r.paint + r.loaded;
  paint(el.querySelector("canvas"), 200, 104, (ctx) => {
    ctx.translate(THUMB.cx, THUMB.rail); ctx.scale(THUMB.scale, THUMB.scale);
    if (FLATCAR) { Art.track(ctx, -500, 500, { simple: true }); Art.car(ctx, r); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(-400, -10, 800, 60); ctx.clip(); Art.track(ctx, -400, 400, { simple: true }); ctx.restore();
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
  pill.className = "pill " + (r.due ? "pill-due" : "pill-" + r.paint);
  el.querySelector(".bar u").style.width = Math.round((r.tipped / WAGONS) * 100) + "%";
  setText(count, r.status === "enroute" ? `${WAGONS} wagons` : `${r.tipped} / ${WAGONS} tipped`);
  setText(where, r.where);
}

function paintThumbs() {
  cards.forEach((_, i) => paintThumb(i));
  detailCache = [];
  paintDetailThumb(stage ? stage.sel : START);
  const tray = (id, g, type, dims, serial, seed) => paint($(id), g.w * g.s, g.h * g.s, (ctx) => {
    ctx.scale(g.s, g.s);
    Art.container(ctx, { w: g.w, h: g.h, paint: "orange", id: serial, type, dims, seed, detail: true });
  });
  tray("tray40", { ...Art.GEO.C40, s: 242 / Art.GEO.C40.w }, "40CN", "12.192 x 2.438 x 2.591 mm", "MSKU793315", 71);
  tray("tray53", { ...Art.GEO.C53, s: 280 / Art.GEO.C53.w }, "53CN", "16.154 x 2.591 x 2.896 mm", "FSCU423311", 72);
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
function placePill(point, html) {
  if (meterPill.innerHTML !== html) meterPill.innerHTML = html;
  const w = meterPill.offsetWidth, px = 151 + point.x, py = 531 + point.y;
  let left = px + 15;
  if (left + w > 438) left = px - 15 - w;                       // flip to the other side rather than leave the panel
  meterPill.style.left = Math.max(12, left) + "px";
  meterPill.style.top = py - 36 + "px";
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
  setText($("stageTitle"), r.status === "released" ? "Departed" : r.where);

  const placed = !coming && r.status !== "placing", t = Math.min(now, r.released);
  const plan = Sim.hoursOver(r.released - r.freeUntil);
  const key = [i, placed, Math.floor(((t - r.placed) / Sim.FREE) * 14 * 3), r.hours].join();
  if (key !== meterKey) {
    meterKey = key;
    meterMark = Meter.draw(meterSvg, { placed, elapsed: t - r.placed, over: r.over, hours: r.hours, plan });
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
  const p = Meter.probe(((e.clientX - box.left) / box.width) * 162);
  probing = p;
  placePill(p, p.hours ? `<span class="up over">↑</span> <span class="num">${Sim.rupees(p.cost)}</span> - if still here at ${Sim.clock(r.placed + p.minutes)}`
    : `<span class="up">✓</span> <span class="num">${Sim.clock(r.placed + p.minutes)}</span> - inside free time`);
});
meterSvg.addEventListener("mouseleave", () => { probing = null; if (stage) renderPanel(stage.sel); });

// ---------------------------------------------------------------- selection
const panel = document.querySelector(".panel-center");
const prevBtn = document.querySelector(".arrow.prev"), nextBtn = document.querySelector(".arrow.next");
let stage = null, now = DAY_START;

function reflect(sel, moving) {
  cards.forEach((el, i) => el.classList.toggle("active", i === sel));
  renderPanel(sel);
  panel.classList.toggle("is-moving", moving);
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
  if (e.key === "ArrowLeft") go(stage.sel - 1);
  else if (e.key === "ArrowRight") go(stage.sel + 1);
});

// Once a moment: move the clock on, and let everything that changed catch up.
function beat() {
  now = simNow();
  const sel = stage.sel, before = [RAKES[sel].view, RAKES[sel].tipped, RAKES[sel].paint].join();
  refresh(now);
  cards.forEach((_, i) => renderCard(i));
  renderPanel(sel);
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
  if (QUERY.has("peek")) { const [i, u, v] = QUERY.get("peek").split(",").map(Number); stage.debugSwitch(i, u, v || 0); }
  if (SPEED > 0) setInterval(beat, 200);
}
start();

let resizeTimer = 0;
window.addEventListener("resize", () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (stage) { stage.build(pixelScale()); paintThumbs(); meterKey = ""; renderPanel(stage.sel); } }, 160);
});
