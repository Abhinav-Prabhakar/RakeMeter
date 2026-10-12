// The animated stage in the centre panel.
// Artwork is rasterised once into sprites at the current pixel density; each frame only
// composites them, so trains run at display refresh rate.
//
// Two coordinate systems meet here. The stage is laid out in artboard units (the centre
// panel is 984 x 731). Vehicles are drawn in vehicle units (64 per metre) and magnified
// by Z, so `kz` = device pixels per vehicle unit. Everything on the track has a position
// along it in vehicle units; the view is one more such position, and it is the view that
// the motion planner moves.
//
// In rake mode a rake is a locomotive, 58 wagons and a brake van. Only the vehicle on
// stage and its neighbours are ever drawn in full; both ends of the train are pulled in
// close behind them, so whenever a rake rolls past it is seen whole, end to end.
const TrainStage = (() => {
  const G = Art.GEO, WG = G.WAGON;
  const W = 984, H = 731;       // canvas size in artboard units (the whole centre panel)
  const CX = 488;               // where the vehicle on stage comes to rest
  const RAIL = 624;             // rail top
  const TAU = Math.PI * 2;

  // suspension pitch: ~2 Hz, lightly damped so the load rocks once or twice after a stop
  const PITCH_W = TAU * 2.1, PITCH_Z = 0.3, PITCH_GAIN = 2.1e-4, PITCH_MAX = 0.0058;
  // coupler slack: stiffer and better damped, and it reaches each vehicle a little later
  const SLACK_W = TAU * 2.8, SLACK_Z = 0.45, SLACK_GAIN = 0.155, SLACK_MAX = 4, SLACK_DELAY = 0.026;
  const SHUTTER = 0.6;          // fraction of the frame the "shutter" stays open
  const NEAR = 2;               // wagons kept either side of the one on stage
  const GAP = 1.2;              // clear track between two rakes, in vehicle lengths
  const CREEP = 1.3;            // seconds to index the rake forward by one wagon
  const SINK = 0.95;            // seconds for a tipped wagon's load to drain away
  const DROP = 62;              // how far the heap sinks behind the side wall, in vehicle units

  const KINDS = {
    wagon: { bogie: WG.BOGIE, sill: WG.SILL, truck: "bogie" },
    van: { bogie: WG.BOGIE, sill: WG.SILL, truck: "bogie" },
    loco: { bogie: G.LOCO.BOGIE, sill: G.LOCO.SILL, truck: "locoBogie" },
    flatcar: { bogie: G.BOGIE, sill: G.SILL, truck: "bogie" },
  };
  const MODES = {
    rake: { Z: WG.Z, PITCH: WG.PITCH, shadowHalf: WG.HALF + 40 },
    flatcar: { Z: 1, PITCH: G.PITCH, shadowHalf: 470 },      // the original flatcars and containers
  };
  const still = () => Motion.plan(0, 0, 0, 0, 0.001, -1);

  class Stage {
    constructor(canvas, data, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.buf = document.createElement("canvas");
      this.bctx = this.buf.getContext("2d", { alpha: false });
      this.onState = opts.onState || (() => {});
      this.reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.mode = opts.vehicle === "flatcar" ? "flatcar" : "rake";
      this.M = MODES[this.mode];
      this.data = data;
      this.count = data.length;
      this.sel = opts.selected || 0;
      this.items = [];              // every vehicle currently on the track
      this.seg = still();           // the view's motion
      this.travel = null;           // what to tidy up when the current move ends
      this.after = null;            // what to do once a tipped load has gone
      this.ghostCar = this.sel;     // flatcar mode: which car shows its empty slot, and how visible it is
      this.ghost = 1;
      this.moving = false;
      this.dirty = false;
      this.raf = 0;
      this.tPrev = 0;
      this.k = 0;
      this.cache = new Map();
      this.tick = this.tick.bind(this);
    }

    // ---------------------------------------------------------------- sprites
    sprite(key, x0, y0, x1, y1, draw) {            // bounds in vehicle units; built once per pixel density
      let s = this.cache.get(key);
      if (s) return s;
      const k = this.kz, c = document.createElement("canvas");
      c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((y1 - y0) * k);
      const ctx = c.getContext("2d");
      ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      draw(ctx);
      s = { c, ox: -x0, oy: -y0, w: c.width / k, h: c.height / k };
      this.cache.set(key, s);
      return s;
    }
    wagonBody(rake) {
      const reach = WG.HALF + WG.REACH + 8;
      return this.sprite(`wagon:${rake.id}:${rake.paint}`, -reach, WG.TOP - 6, reach, 2, (c) => Art.wagon(c, { id: rake.id, paint: rake.paint, seed: rake.seed }));
    }
    heap(n) {
      return this.sprite(`heap:${n}`, -WG.HALF, WG.TOP - 54, WG.HALF, WG.TOP + 6, (c) => Art.heap(c, { seed: 11 + n * 7 }));
    }

    // What rides on a vehicle's springs, back to front. x and y place each sprite's origin
    // relative to the vehicle centre on the rail top.
    dress(it) {
      const reach = WG.HALF + WG.REACH + 8;
      if (it.kind === "wagon") {
        const rake = this.data[it.r];
        // the load sits inside, so the side wall is drawn over it
        it.layers = [{ spr: this.heap(((it.idx % 3) + 3) % 3), x: 0, y: 0, load: true }, { spr: this.wagonBody(rake), x: 0, y: 0 }];
      } else if (it.kind === "loco") {
        it.layers = [{ spr: this.sprite("loco", -reach, G.LOCO.TOP - 6, reach, 2, (c) => Art.loco(c)), x: 0, y: 0 }];
      } else if (it.kind === "van") {
        const rake = this.data[it.r];
        it.layers = [{ spr: this.sprite(`van:${rake.id}`, -reach, G.VAN.TOP - 6, reach, 2, (c) => Art.van(c, { id: rake.id, seed: rake.seed })), x: 0, y: 0 }];
      } else {
        const car = it.car, c53 = G.C53, top = (slot) => G.DECK - 1 - (c53.h + G.GAP) * slot - c53.h;
        it.layers = [{ spr: this.sprite(`flat:${car.id}`, -490, -96, 490, 0, (c) => Art.body(c, { id: car.id, loaded: car.load.length > 0 })), x: 0, y: 0 }];
        car.load.forEach((b, slot) => it.layers.push({
          // a stacked box carries the twist locks it stands on
          spr: this.sprite(`box:${b.id}`, 0, 0, c53.w, c53.h + (slot ? G.GAP : 0), (c) => {
            if (slot) { c.fillStyle = "#6f6f6f"; c.fillRect(2, c53.h, 11, G.GAP); c.fillRect(c53.w - 13, c53.h, 11, G.GAP); }
            Art.container(c, { w: c53.w, h: c53.h, paint: b.paint, id: b.id, type: "53CN", dims: "16.154 x 2.591 x 2.896 mm", seed: b.seed });
          }),
          x: -c53.w / 2, y: top(slot),
        }));
        it.ghost = car.load.length < 2 && !car.phantom ? { spr: this.spr.ghost, x: -c53.w / 2, y: top(car.load.length) } : null;
      }
      return it;
    }

    make(kind, x, more = {}) {
      const n = (this.serial = (this.serial || 0) + 1);
      return this.dress({
        kind, x, K: KINDS[kind], fill: 1, fillTo: 1,
        pitch: { x: 0, v: 0 }, slack: { x: 0, v: 0 }, delay: 0,
        phase: [0, 1, 2, 3].map((w) => ((n * 7 + w * 3) * 1.37) % TAU),
        ...more,
      });
    }

    // The vehicles of rake `r` worth drawing when its vehicle `at` is on stage (-1 is the
    // locomotive, `wagons` is the brake van). Placed with `at` at x = 0.
    group(r, at) {
      const rake = this.data[r], last = rake.wagons, P = this.M.PITCH;
      const lo = Math.max(-1, at - NEAR), hi = Math.min(last, at + NEAR), idx = [];
      if (lo > -1) idx.push(-1);
      for (let i = lo; i <= hi; i++) idx.push(i);
      if (hi < last) idx.push(last);
      const c = idx.indexOf(at);
      return idx.map((i, n) => {
        const fill = i >= rake.tipped ? 1 : 0;
        return this.make(i < 0 ? "loco" : i === last ? "van" : "wagon", (n - c) * P, { r, idx: i, fill, fillTo: fill });
      });
    }

    // Put the selected rake (or the flatcar train) on the track, at rest.
    rest() {
      const P = this.M.PITCH;
      if (this.mode === "rake") {
        this.at = this.data[this.sel].view;
        this.items = this.group(this.sel, this.at);
        this.seg = still();
      } else {
        // an empty flatcar either side so the listed cars are never the end of the train
        const pad = (n) => ({ id: "BNSF2706" + n, load: [], phantom: true });
        const cars = [pad("62"), ...this.data, pad("71")];
        this.items = cars.map((car, n) => this.make("flatcar", (n - 1) * P, { car, i: n - 1 }));
        this.seg = Motion.plan(this.sel * P, 0, 0, this.sel * P, 0.001, -1);
      }
      this.travel = this.after = null;
      this.order();
    }
    order() {                                      // slack runs down the train from its leading end
      [...this.items].sort((a, b) => a.x - b.x).forEach((it, n) => (it.delay = n * SLACK_DELAY));
    }

    // (Re)build everything for a given device-pixels-per-artboard-unit scale.
    build(k) {
      k = Math.max(0.5, Math.min(3, Math.round(k * 100) / 100));
      if (k === this.k) return;
      this.k = k;
      const cv = this.canvas, M = this.M, kz = (this.kz = k * M.Z);
      cv.width = this.buf.width = Math.round(W * k);
      cv.height = this.buf.height = Math.round(H * k);
      cv.style.width = cv.width / k + "px";
      cv.style.height = cv.height / k + "px";
      this.cxPx = Math.round(CX * k);
      this.railPx = Math.round(RAIL * k);
      this.cache.clear();

      this.spr = {
        wheel: this.sprite("wheel", -37, -37, 37, 37, (c) => Art.wheel(c, 3)),
        wheelLight: this.sprite("wheelLight", -37, -37, 37, 37, (c) => Art.wheelLight(c)),
        bogie: this.sprite("bogie", -118, -70, 118, 2, (c) => Art.bogie(c)),
        shadow: this.sprite("shadow", -M.PITCH / 2 - 30, 0, M.PITCH / 2 + 30, 40, (c) => Art.shadow(c, KINDS[this.mode === "rake" ? "wagon" : "flatcar"].bogie, M.shadowHalf)),
      };
      if (this.mode === "rake") {
        this.spr.locoBogie = this.sprite("locoBogie", -118, -70, 118, 2, (c) => Art.locoBogie(c));
        // draw everything a switch could need now, so nothing is rasterised mid-flight
        for (const rake of this.data) { this.wagonBody(rake); if (rake.paint !== "orange") this.wagonBody({ ...rake, paint: "orange" }); }
      } else {
        const c53 = G.C53;
        this.spr.ghost = this.sprite("ghost", -4, -4, c53.w + 4, c53.h + 4, (c) => {
          c.globalAlpha = 0.86;
          Art.container(c, { w: c53.w, h: c53.h, paint: "ghost", detail: false });
          c.globalAlpha = 1;
          Art.slotOutline(c, c53.w, c53.h);
        });
      }
      this.rest();

      // static backdrop: panel surface + track
      const bg = (this.bg = document.createElement("canvas"));
      bg.width = cv.width; bg.height = cv.height;
      const b = bg.getContext("2d", { alpha: false });
      b.fillStyle = "#e1e1e1"; b.fillRect(0, 0, bg.width, bg.height);
      const sheen = b.createLinearGradient(0, 0, 0, bg.height * 0.3);
      sheen.addColorStop(0, "rgba(255,255,255,.06)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
      b.fillStyle = sheen; b.fillRect(0, 0, bg.width, bg.height * 0.3);
      b.setTransform(kz, 0, 0, kz, 0, this.railPx);
      Art.track(b, 0, W / M.Z + 2);
      // the rail itself is redrawn over the wheels so the flanges sit behind it
      const strip = (this.railStrip = document.createElement("canvas"));
      strip.width = cv.width; strip.height = Math.floor(16 * kz);
      strip.getContext("2d").drawImage(bg, 0, this.railPx, strip.width, strip.height, 0, 0, strip.width, strip.height);

      this.render(performance.now() / 1000, 0);
    }

    // ---------------------------------------------------------------- drawing
    put(ctx, s, x, y, snap) {                      // sprite origin at vehicle point (x, y)
      let dx = this.cxPx + (x - s.ox) * this.kz, dy = this.railPx + (y - s.oy) * this.kz;
      if (snap) { dx = Math.round(dx); dy = Math.round(dy); }
      ctx.drawImage(s.c, dx, dy);
    }

    scene(ctx, pos, snap) {
      const M = this.M, kz = this.kz, S = this.spr, ox = this.cxPx, oy = this.railPx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.bg, 0, 0);
      const vis = [], edge = W / 2 / M.Z + M.PITCH / 2 + 30;
      for (const it of this.items) {
        const off = Motion.soft(it.slack.x, SLACK_MAX);
        const x = it.x - pos + off;
        if (Math.abs(x) < edge) vis.push([it, x, off]);
      }
      for (const [, x] of vis) this.put(ctx, S.shadow, x, 0, snap);

      for (const [it, x, off] of vis) {
        // running gear
        const K = it.K;
        let n = 0;
        for (const bx of [-K.bogie, K.bogie]) {
          for (const ax of [-G.AXLE, G.AXLE]) {
            const wx = x + bx + ax, wy = -G.R;
            const ang = (it.x + off - pos) / G.R + it.phase[n++];
            const c = Math.cos(ang) * kz, s = Math.sin(ang) * kz;
            ctx.setTransform(c, s, -s, c, ox + wx * kz, oy + wy * kz);
            ctx.drawImage(S.wheel.c, -S.wheel.ox, -S.wheel.oy, S.wheel.w, S.wheel.h);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.put(ctx, S.wheelLight, wx, wy, snap);
          }
          this.put(ctx, S[K.truck], x + bx, 0, snap);
        }

        // sprung mass: body, couplers and load pitch together about the bogie springs
        const th = Motion.soft(it.pitch.x, PITCH_MAX);
        const level = Math.abs(th) < 1e-5;
        if (!level) {
          const c = Math.cos(th) * kz, s = Math.sin(th) * kz;
          ctx.setTransform(c, s, -s, c, ox + (x + th * 150) * kz, oy + K.sill * kz);
        }
        const place = ({ spr, x: lx, y: ly }, dy = 0) => {
          if (level) this.put(ctx, spr, x + lx, ly + dy, snap && !dy);
          else ctx.drawImage(spr.c, lx - spr.ox, ly + dy - K.sill - spr.oy, spr.w, spr.h);
        };
        for (const layer of it.layers) {
          if (!layer.load) { place(layer); continue; }
          // The load is drawn before the side wall, so sinking it is enough: it drains out
          // of sight behind the wall, slowly at first, as the wagon is tipped.
          if (it.fill > 0.002) { const u = 1 - it.fill; place(layer, DROP * u * u * (1.6 - 0.6 * u)); }
        }
        if (it.ghost && it.i === this.ghostCar && this.ghost > 0.004) {
          ctx.globalAlpha = this.ghost; place(it.ghost); ctx.globalAlpha = 1;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.drawImage(this.railStrip, 0, this.railPx);
    }

    // Draw the frame at time t. `shutter` seconds of travel are averaged into it.
    render(t, shutter) {
      const now = Motion.at(this.seg, t);
      const smear = Math.abs(now.v) * shutter * this.kz;       // device px travelled while exposed
      const n = Math.max(1, Math.min(20, Math.ceil(smear / 1.8)));
      if (n === 1) { this.scene(this.ctx, now.p, Math.abs(now.v) < 1e-3); return; }
      const ctx = this.ctx;
      for (let j = 0; j < n; j++) {
        const p = Motion.at(this.seg, t - shutter * (j / (n - 1))).p;
        this.scene(this.bctx, p, false);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 / (j + 1);                         // running average of the sub-frames
        ctx.drawImage(this.buf, 0, 0);
      }
      ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- simulation
    wake() {
      if (this.raf) return;
      this.tPrev = performance.now() / 1000;
      this.raf = requestAnimationFrame(this.tick);
    }

    tick(ms) {
      const t = ms / 1000;
      const dt = Math.min(0.05, Math.max(0.001, t - this.tPrev));
      this.tPrev = t;

      const steps = Math.ceil(dt * 240), h = dt / steps;
      let energy = 0, emptying = false;
      for (const it of this.items) {
        for (let s = 1; s <= steps; s++) {
          const tau = t - dt + h * s;
          Motion.spring(it.pitch, -PITCH_GAIN * Motion.at(this.seg, tau).a, h, PITCH_W, PITCH_Z);
          Motion.spring(it.slack, -SLACK_GAIN * Motion.at(this.seg, tau - it.delay).a, h, SLACK_W, SLACK_Z);
        }
        energy = Math.max(energy, Math.abs(it.pitch.x) * 4000, Math.abs(it.pitch.v) * 300, Math.abs(it.slack.x) * 8, Math.abs(it.slack.v) * 0.6);
        if (it.fill !== it.fillTo) {                           // a load being tipped out, or put back
          const step = dt / SINK;
          it.fill = it.fillTo > it.fill ? Math.min(it.fillTo, it.fill + step) : Math.max(it.fillTo, it.fill - step);
          emptying = emptying || it.fill !== it.fillTo;
        }
      }
      if (!emptying && this.after) { const next = this.after; this.after = null; next(); }

      const running = t < this.seg.t0 + this.seg.T;
      if (!running && this.travel) this.arrive();
      const want = this.moving ? 0 : 1;             // flatcar mode: the ghost slot fades out for the journey
      this.ghost += (want - this.ghost) * Math.min(1, dt * (want ? 9 : 22));
      const fading = Math.abs(want - this.ghost) > 0.004;
      if (!fading) this.ghost = want;

      const settled = !running && energy < 0.06 && !fading && !emptying && !this.after;
      if (settled) for (const it of this.items) { it.pitch.x = it.pitch.v = it.slack.x = it.slack.v = 0; }
      this.render(t, settled ? 0 : Math.min(dt, 1 / 48) * SHUTTER);
      this.raf = settled ? 0 : requestAnimationFrame(this.tick);
      if (!running && !emptying && !this.after && this.dirty) { this.dirty = false; this.sync(); }
    }

    // A move has finished: drop what was left behind and measure from the new resting place.
    arrive() {
      const tr = this.travel;
      this.travel = null;
      if (tr.keep) {
        this.items = tr.keep;
        for (const it of this.items) it.x -= tr.D;
        this.seg = still();
      }
      if (this.moving) {
        this.moving = false;
        this.ghostCar = this.sel;
        this.onState({ moving: false, selected: this.sel });
      }
    }

    go(target, seconds) {
      const t = performance.now() / 1000, s = Motion.at(this.seg, t);
      const T = this.reduced ? 0.001 : seconds || Motion.duration(Math.abs(target - s.p) / this.M.PITCH);
      this.seg = Motion.plan(s.p, s.v, s.a, target, T, t);
      this.wake();
    }

    // Bring rake (or flatcar) `i` onto the stage.
    select(i) {
      i = Math.max(0, Math.min(this.count - 1, i));
      if (i === this.sel) return;
      const P = this.M.PITCH;
      if (this.mode === "flatcar") {
        this.sel = i; this.travel = {}; this.go(i * P);
      } else {
        // The rake on stage pulls out; the chosen one is waiting further up the line, beyond
        // a stretch of clear track, and rolls in behind it. Later rakes arrive from the right.
        const dir = i > this.sel ? 1 : -1, at = this.data[i].view, g = this.group(i, at);
        const xs = this.items.map((it) => it.x), gx = g.map((it) => it.x);
        const D = (dir > 0 ? Math.max(...xs) - Math.min(...gx) : Math.min(...xs) - Math.max(...gx)) + dir * (1 + GAP) * P;
        for (const it of g) it.x += D;
        this.items.push(...g);
        this.order();
        this.sel = i; this.at = at; this.after = null;
        this.travel = { keep: g, D };
        this.go(D);
      }
      this.moving = true;
      this.onState({ moving: true, selected: i });
    }

    // The simulation has moved on: bring the rake on stage up to date with it.
    sync() {
      if (this.mode !== "rake" || !this.items.length) return;
      if (this.travel || this.after) { this.dirty = true; return; }
      const rake = this.data[this.sel], d = rake.view - this.at;
      if (d === 0) {
        for (const it of this.items) if (it.kind === "wagon" && it.r === this.sel) { it.fillTo = it.idx >= rake.tipped ? 1 : 0; this.dress(it); }
        this.wake();
      } else if (Math.abs(d) <= 4) {
        // a wagon has been tipped: its load goes, then the rake indexes forward by a wagon
        // length. If the stage has fallen a few wagons behind, it catches up one at a time.
        const step = Math.sign(d), onStage = this.items.find((it) => it.r === this.sel && it.idx === this.at);
        this.dirty = Math.abs(d) > 1;
        if (step === 1 && onStage && onStage.kind === "wagon" && onStage.fill > 0) { onStage.fillTo = 0; this.after = () => this.creep(step); this.wake(); }
        else this.creep(step);
      } else {
        this.rest(); this.render(performance.now() / 1000, 0);  // a jump in time: no pretending the rake rolled there
      }
    }

    creep(d) {
      const P = this.M.PITCH, D = d * P, old = this.items;
      const g = this.group(this.sel, this.at + d);
      for (const it of g) {
        it.x += D;
        const was = old.find((o) => o.r === it.r && o.idx === it.idx);   // same vehicle: keep it rocking as it was
        if (was) { it.pitch = was.pitch; it.slack = was.slack; it.phase = was.phase; it.fill = was.fill; }
      }
      this.items = g;
      this.order();
      this.at += d;
      this.travel = { keep: g, D };
      this.go(D, CREEP);
    }

    // Test hooks: freeze a frame as if travelling at `v` vehicle units/s past `pos`,
    // or part-way through a switch to rake `i`.
    debugFrame(pos, v) {
      cancelAnimationFrame(this.raf); this.raf = 0;
      this.ghost = v ? 0 : 1;
      this.seg = { t0: 0, T: 1e9, pf: pos, c: [pos - v, v, 0, 0, 0, 0] };
      this.render(1, (1 / 60) * SHUTTER);
    }
    debugSwitch(i, u, v) {
      this.select(i);
      const D = this.travel.D;
      this.debugFrame(D * u, v * Math.sign(D));
    }
  }

  return { Stage, W, H, CX, RAIL };
})();
