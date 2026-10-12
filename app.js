// ---------------------------------------------------------------- data
// Today's rakes, in the order they reach the siding. Wagon colour carries state:
// orange = on site, grey = not here yet, no coal = unloaded. `note` is placeholder
// copy for the card pill until the rake cards are designed.
const RAKES = [
  { slot: "S615", id: "BNSF270663", paint: "orange", loaded: false, note: "Released" },
  { slot: "S616", id: "BNSF270664", paint: "orange", loaded: false, note: "Released" },
  { slot: "S617", id: "BNSF270665", paint: "orange", loaded: true, note: "Unloading" },
  { slot: "S618", id: "BNSF270666", paint: "orange", loaded: true, note: "Unloading" },
  { slot: "S619", id: "BNSF270667", paint: "orange", loaded: true, note: "Waiting" },
  { slot: "S620", id: "BNSF270668", paint: "orange", loaded: true, note: "Waiting" },
  { slot: "S621", id: "BNSF270669", paint: "grey", loaded: true, note: "En route" },
  { slot: "S622", id: "BNSF270670", paint: "grey", loaded: true, note: "En route" },
];
RAKES.forEach((r, i) => (r.seed = i + 1));                    // each wagon wears differently

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
const QUERY = new URLSearchParams(location.search);          // dev hooks: ?car=3  ?frame=pos,velocity  ?vehicle=flatcar
const FLATCAR = QUERY.get("vehicle") === "flatcar";
const START = Math.max(0, Math.min(RAKES.length - 1, QUERY.has("car") ? +QUERY.get("car") : 5));

// ---------------------------------------------------------------- artboard scaling
const stageEl = document.getElementById("stage");
let fitScale = 1;
function fit() {
  const dpr = window.devicePixelRatio || 1;
  fitScale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const snap = (v) => Math.round(v * dpr) / dpr;
  const x = snap((window.innerWidth - 1920 * fitScale) / 2);
  const y = snap((window.innerHeight - 1080 * fitScale) / 2);
  stageEl.style.transform = `translate(${x}px, ${y}px) scale(${fitScale})`;
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

// ---------------------------------------------------------------- rake strip
const WAG = Art.GEO.WAGON;
const THUMB = { scale: FLATCAR ? 0.178 : 0.231, cx: 98, rail: 93 };
const strip = document.getElementById("strip");
const pillsFor = (r) => {
  const at = (units) => (38 + THUMB.rail + units * THUMB.scale).toFixed(1);   // card y for a height above the rail
  if (!FLATCAR) return `<em class="pill pill-${r.paint}" style="top:${at((WAG.TOP + WAG.FLOOR) / 2)}px">${r.note}</em>`;
  const box = Art.GEO.C53;
  return r.load.map((b, s) => `<em class="pill pill-${b.paint}" style="top:${at(-84 - box.h / 2 - (box.h + Art.GEO.GAP) * s)}px">${b.id}</em>`).join("");
};
strip.innerHTML = RAKES.map((r, i) =>
  `<article class="car" role="button" tabindex="0" data-i="${i}" aria-label="Rake ${r.id}" style="left:${66 + i * 238}px"><b>${r.slot}</b><span>${r.id}</span><canvas></canvas>${pillsFor(r)}</article>`).join("");
const cards = [...strip.children];

function paintThumbs() {
  cards.forEach((el, i) => {
    paint(el.querySelector("canvas"), 200, 104, (ctx) => {
      ctx.translate(THUMB.cx, THUMB.rail); ctx.scale(THUMB.scale, THUMB.scale);
      if (FLATCAR) { Art.track(ctx, -500, 500, { simple: true }); Art.car(ctx, RAKES[i]); return; }
      ctx.save(); ctx.beginPath(); ctx.rect(-400, -10, 800, 60); ctx.clip(); Art.track(ctx, -400, 400, { simple: true }); ctx.restore();
      Art.wagonCar(ctx, RAKES[i]);
    });
  });
  RAKES.forEach((_, i) => paintDetailThumb(i));                // warm the cache
  paintDetailThumb(stage ? stage.sel : START);
  const tray = (id, g, type, dims, serial, seed) => paint(document.getElementById(id), g.w * g.s, g.h * g.s, (ctx) => {
    ctx.scale(g.s, g.s);
    Art.container(ctx, { w: g.w, h: g.h, paint: "orange", id: serial, type, dims, seed, detail: true });
  });
  tray("tray40", { ...Art.GEO.C40, s: 242 / Art.GEO.C40.w }, "40CN", "12.192 x 2.438 x 2.591 mm", "MSKU793315", 71);
  tray("tray53", { ...Art.GEO.C53, s: 280 / Art.GEO.C53.w }, "53CN", "16.154 x 2.591 x 2.896 mm", "FSCU423311", 72);
}

// The wagon picture in the left panel follows the selection. Each one is drawn once and
// kept, so switching rakes only copies an image and never stalls the train.
let detailCache = [];
function paintDetailThumb(i) {
  const k = pixelScale(), key = i + "@" + k;
  if (!detailCache[i] || detailCache[i].key !== key) {
    const c = document.createElement("canvas");
    paint(c, 323, 100, (ctx) => {
      ctx.translate(161.5, 88);
      if (FLATCAR) { ctx.translate(0, -21); ctx.scale(0.333, 0.333); Art.track(ctx, -485, 485, { simple: true }); Art.car(ctx, { id: RAKES[i].id, load: [] }); return; }
      ctx.scale(0.32, 0.32);
      ctx.save(); ctx.beginPath(); ctx.rect(-410, -10, 820, 60); ctx.clip(); Art.track(ctx, -410, 410, { simple: true }); ctx.restore();
      Art.wagonCar(ctx, { ...RAKES[i], detail: true });
    });
    c.key = key; detailCache[i] = c;
  }
  const el = document.getElementById("flatcarThumb"), src = detailCache[i];
  el.width = src.width; el.height = src.height; el.style.width = "323px"; el.style.height = "100px";
  el.getContext("2d").drawImage(src, 0, 0);
}

// ---------------------------------------------------------------- selection
const panel = document.querySelector(".panel-center");
const flatcarId = document.getElementById("flatcarId");
const prevBtn = document.querySelector(".arrow.prev"), nextBtn = document.querySelector(".arrow.next");
let stage = null;

function reflect(sel, moving) {
  cards.forEach((el, i) => el.classList.toggle("active", i === sel));
  if (flatcarId.textContent !== RAKES[sel].id || !moving) { flatcarId.textContent = RAKES[sel].id; paintDetailThumb(sel); }
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

async function start() {
  // the liveries are typeset on the canvas, so the faces must be ready first
  const faces = ["700 18px Inter", "600 9px Inter"].map((f) => document.fonts.load(f, "SBB 0123"));
  await Promise.race([Promise.all(faces), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  stage = new TrainStage.Stage(document.getElementById("trainCanvas"), RAKES, {
    selected: START,
    vehicle: FLATCAR ? "flatcar" : "wagon",
    onState: ({ moving, selected }) => reflect(selected, moving),
  });
  stage.build(pixelScale());
  paintThumbs();
  reflect(START, false);
  if (QUERY.has("frame")) { const [p, v] = QUERY.get("frame").split(",").map(Number); stage.debugFrame(p, v || 0); }
}
start();

let resizeTimer = 0;
window.addEventListener("resize", () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (stage) { stage.build(pixelScale()); paintThumbs(); } }, 160);
});

// ---------------------------------------------------------------- payload-capacity dot matrix
(function () {
  const svg = document.getElementById("radarGrid");
  const NS = "http://www.w3.org/2000/svg";
  const ox = 79, oy = 76, step = 5.27;
  const add = (cx, cy, r, fill, op) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", cx.toFixed(2));
    c.setAttribute("cy", cy.toFixed(2));
    c.setAttribute("r", r);
    c.setAttribute("fill", fill);
    if (op < 1) c.setAttribute("opacity", op.toFixed(2));
    svg.appendChild(c);
  };
  // soft light bloom behind the orange cluster
  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = '<radialGradient id="bloom" cx="0.4" cy="0.4" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
  svg.appendChild(defs);
  const glow = document.createElementNS(NS, "rect");
  glow.setAttribute("x", ox - 11 * step); glow.setAttribute("y", oy - 11 * step);
  glow.setAttribute("width", 11 * step); glow.setAttribute("height", 11 * step);
  glow.setAttribute("fill", "url(#bloom)");
  svg.appendChild(glow);

  for (let j = -14; j <= 14; j++) {
    for (let i = -15; i <= 15; i++) {
      const x = ox + i * step, y = oy + j * step;
      const inCore = i >= -5 && i <= -1 && j >= -5 && j <= -1;
      const inHalo = i >= -10 && i <= -1 && j >= -9 && j <= -1;
      if (inCore) { add(x, y, 2.75, "#fc7f37", 1); continue; }
      if (inHalo) {
        // halo fades and shrinks away from the core square
        const d = Math.max(-5 - i, -5 - j, 0);
        add(x, y, 2.1 - d * 0.3, "#fc8a48", 0.9 - d * 0.17);
        continue;
      }
      if (j === 0 && i < 0) { add(x, y, 0.8, "#111", 0.9); continue; }
      if (i === 0 && j > 0) { add(x, y, 0.75, "#333", 0.75 - j * 0.035); continue; }
      if (j === 0) { add(x, y, 0.7, "#555", 0.55); continue; }
      // faint background grid that fades towards the outer edge
      const e = Math.max(Math.abs(i) / 15, Math.abs(j) / 14);
      add(x, y, 0.62, "#9a9a9a", 0.62 - e * 0.3);
    }
  }
  add(ox, oy, 1.6, "#000", 1);
  add(8, 46, 5, "#000", 1);
})();
