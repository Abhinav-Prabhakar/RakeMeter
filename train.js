// The animated consist in the centre panel.
// Artwork is rasterised once into sprites at the current pixel density; each frame
// only composites them, so the train can run at display refresh rate.
const TrainStage = (() => {
  const G = Art.GEO;
  const W = 984, H = 731;       // canvas size in stage units (the whole centre panel)
  const CX = 488;               // where the selected car comes to rest
  const RAIL = 624;             // rail top
  const TAU = Math.PI * 2;

  // suspension pitch: ~2 Hz, lightly damped so the load rocks once or twice after a stop
  const PITCH_W = TAU * 2.1, PITCH_Z = 0.3, PITCH_GAIN = 1.75e-4, PITCH_MAX = 0.0058;
  // coupler slack: stiffer and better damped, and it reaches each car a little later
  const SLACK_W = TAU * 2.8, SLACK_Z = 0.45, SLACK_GAIN = 0.155, SLACK_MAX = 4, SLACK_DELAY = 0.026;
  const SHUTTER = 0.6;          // fraction of the frame the "shutter" stays open

  class Stage {
    constructor(canvas, cars, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.buf = document.createElement("canvas");
      this.bctx = this.buf.getContext("2d", { alpha: false });
      this.onState = opts.onState || (() => {});
      this.reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

      // an empty flatcar either side so the listed cars are never the end of the train
      const pad = (i, n) => ({ id: "BNSF2706" + n, load: [], phantom: true, i });
      const list = [pad(-1, "62"), ...cars.map((c, i) => ({ ...c, i })), pad(cars.length, "71")];
      this.train = list.map((c) => ({
        ...c,
        pitch: { x: 0, v: 0 }, slack: { x: 0, v: 0 },
        delay: (c.i + 1) * SLACK_DELAY,
        phase: [0, 1, 2, 3].map((n) => ((c.i * 7 + n * 3) * 1.37) % TAU),
      }));
      this.count = cars.length;
      this.sel = opts.selected || 0;
      this.ghostCar = this.sel;
      this.ghost = 1;
      this.seg = Motion.plan(this.sel * G.PITCH, 0, 0, this.sel * G.PITCH, 0.001, -1);
      this.moving = false;
      this.raf = 0;
      this.tPrev = 0;
      this.k = 0;
      this.tick = this.tick.bind(this);
    }

    // ---------------------------------------------------------------- sprites
    sprite(x0, y0, x1, y1, draw) {
      const k = this.k, c = document.createElement("canvas");
      c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((y1 - y0) * k);
      const ctx = c.getContext("2d");
      ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      draw(ctx);
      return { c, ox: -x0, oy: -y0, w: c.width / k, h: c.height / k };
    }

    // (Re)build everything for a given device-pixels-per-unit scale.
    build(k) {
      k = Math.max(0.5, Math.min(3, Math.round(k * 100) / 100));
      if (k === this.k) return;
      this.k = k;
      const cv = this.canvas;
      cv.width = this.buf.width = Math.round(W * k);
      cv.height = this.buf.height = Math.round(H * k);
      cv.style.width = cv.width / k + "px";
      cv.style.height = cv.height / k + "px";
      this.railPx = Math.round(RAIL * k);
      this.rail = this.railPx / k;

      const c53 = G.C53;
      this.spr = {
        wheel: this.sprite(-37, -37, 37, 37, (c) => Art.wheel(c, 3)),
        wheelLight: this.sprite(-37, -37, 37, 37, (c) => Art.wheelLight(c)),
        bogie: this.sprite(-118, -70, 118, 2, (c) => Art.bogie(c)),
        shadow: this.sprite(-480, 0, 480, 40, (c) => Art.shadow(c)),
        ghost: this.sprite(-4, -4, c53.w + 4, c53.h + 4, (c) => {
          c.globalAlpha = 0.86;
          Art.container(c, { w: c53.w, h: c53.h, paint: "ghost", detail: false });
          c.globalAlpha = 1;
          Art.slotOutline(c, c53.w, c53.h);
        }),
      };
      for (const car of this.train) {
        car.body = this.sprite(-490, -96, 490, 0, (c) => Art.body(c, { id: car.id, loaded: car.load.length > 0 }));
        car.boxes = car.load.map((b) =>
          this.sprite(0, 0, c53.w, c53.h, (c) =>
            Art.container(c, { w: c53.w, h: c53.h, paint: b.paint, id: b.id, type: "53CN", dims: "16.154 x 2.591 x 2.896 mm", seed: b.seed })));
      }

      // static backdrop: panel surface + track
      const bg = (this.bg = document.createElement("canvas"));
      bg.width = cv.width; bg.height = cv.height;
      const b = bg.getContext("2d", { alpha: false });
      b.fillStyle = "#e1e1e1"; b.fillRect(0, 0, bg.width, bg.height);
      const sheen = b.createLinearGradient(0, 0, 0, bg.height * 0.3);
      sheen.addColorStop(0, "rgba(255,255,255,.06)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
      b.fillStyle = sheen; b.fillRect(0, 0, bg.width, bg.height * 0.3);
      b.setTransform(k, 0, 0, k, 0, this.railPx);
      Art.track(b, 0, W);
      // the rail itself is redrawn over the wheels so the flanges sit behind it
      const strip = (this.railStrip = document.createElement("canvas"));
      strip.width = cv.width; strip.height = Math.floor(16 * k);
      strip.getContext("2d").drawImage(bg, 0, this.railPx, strip.width, strip.height, 0, 0, strip.width, strip.height);

      this.render(performance.now() / 1000, 0);
    }

    // ---------------------------------------------------------------- drawing
    put(ctx, s, x, y, snap) {
      const k = this.k;
      let dx = (x - s.ox) * k, dy = (y - s.oy) * k;
      if (snap) { dx = Math.round(dx); dy = Math.round(dy); }
      ctx.drawImage(s.c, dx, dy);
    }

    scene(ctx, pos, snap) {
      const k = this.k, S = this.spr, rail = this.rail;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.bg, 0, 0);
      const vis = [];
      for (const car of this.train) {
        const off = Motion.soft(car.slack.x, SLACK_MAX);
        const x = CX + car.i * G.PITCH - pos + off;
        if (x > -500 && x < W + 500) vis.push([car, x, off]);
      }
      for (const [, x] of vis) this.put(ctx, S.shadow, x, rail, snap);

      for (const [car, x, off] of vis) {
        // running gear
        let n = 0;
        for (const bx of [-G.BOGIE, G.BOGIE]) {
          for (const ax of [-G.AXLE, G.AXLE]) {
            const wx = x + bx + ax, wy = rail - G.R;
            const ang = (off - pos) / G.R + car.phase[n++];
            const c = Math.cos(ang) * k, s = Math.sin(ang) * k;
            ctx.setTransform(c, s, -s, c, wx * k, wy * k);
            ctx.drawImage(S.wheel.c, -S.wheel.ox, -S.wheel.oy, S.wheel.w, S.wheel.h);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.put(ctx, S.wheelLight, wx, wy, snap);
          }
          this.put(ctx, S.bogie, x + bx, rail, snap);
        }

        // sprung mass: sill, couplers and load pitch together about the bogie springs
        const th = Motion.soft(car.pitch.x, PITCH_MAX);
        const still = Math.abs(th) < 1e-5;
        const px = x + th * 150, py = rail + G.SILL;
        if (!still) {
          const c = Math.cos(th) * k, s = Math.sin(th) * k;
          ctx.setTransform(c, s, -s, c, px * k, py * k);
        }
        const place = (spr, lx, ly) => {
          if (still) this.put(ctx, spr, x + lx, rail + ly, snap);
          else ctx.drawImage(spr.c, lx - spr.ox, ly - G.SILL - spr.oy, spr.w, spr.h);
        };
        place(car.body, 0, 0);
        const top = (slot) => G.DECK - 1 - (G.C53.h + G.GAP) * slot - G.C53.h;
        car.boxes.forEach((spr, slot) => {
          if (slot > 0) {                       // twist locks between stacked boxes
            ctx.fillStyle = "#6f6f6f";
            for (const lx of [-G.C53.w / 2 + 2, G.C53.w / 2 - 13]) {
              if (still) ctx.fillRect(Math.round((x + lx) * k), Math.round((rail + top(slot) + G.C53.h) * k), Math.round(11 * k), Math.ceil(G.GAP * k));
              else ctx.fillRect(lx, top(slot) + G.C53.h - G.SILL, 11, G.GAP);
            }
          }
          place(spr, -G.C53.w / 2, top(slot));
        });
        if (car.i === this.ghostCar && this.ghost > 0.004 && car.load.length < 2 && !car.phantom) {
          ctx.globalAlpha = this.ghost;
          place(S.ghost, -G.C53.w / 2, top(car.load.length));
          ctx.globalAlpha = 1;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.drawImage(this.railStrip, 0, this.railPx);
    }

    // Draw the frame at time t. `shutter` seconds of travel are averaged into it.
    render(t, shutter) {
      const now = Motion.at(this.seg, t);
      const smear = Math.abs(now.v) * shutter * this.k;        // device px travelled while exposed
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
    tick(ms) {
      const t = ms / 1000;
      const dt = Math.min(0.05, Math.max(0.001, t - this.tPrev));
      this.tPrev = t;

      const steps = Math.ceil(dt * 240), h = dt / steps;
      let energy = 0;
      for (const car of this.train) {
        for (let s = 1; s <= steps; s++) {
          const tau = t - dt + h * s;
          Motion.spring(car.pitch, -PITCH_GAIN * Motion.at(this.seg, tau).a, h, PITCH_W, PITCH_Z);
          Motion.spring(car.slack, -SLACK_GAIN * Motion.at(this.seg, tau - car.delay).a, h, SLACK_W, SLACK_Z);
        }
        energy = Math.max(energy, Math.abs(car.pitch.x) * 4000, Math.abs(car.pitch.v) * 300, Math.abs(car.slack.x) * 8, Math.abs(car.slack.v) * 0.6);
      }

      const running = t < this.seg.t0 + this.seg.T;
      if (!running && this.moving) {
        this.moving = false;
        this.ghostCar = this.sel;
        this.onState({ moving: false, selected: this.sel });
      }
      const want = this.moving ? 0 : 1;
      this.ghost += (want - this.ghost) * Math.min(1, dt * (want ? 9 : 22));
      const fading = Math.abs(want - this.ghost) > 0.004;
      if (!fading) this.ghost = want;

      const settled = !running && energy < 0.06 && !fading;
      if (settled) for (const car of this.train) { car.pitch.x = car.pitch.v = car.slack.x = car.slack.v = 0; }
      this.render(t, settled ? 0 : Math.min(dt, 1 / 48) * SHUTTER);
      this.raf = settled ? 0 : requestAnimationFrame(this.tick);
    }

    // Bring car `i` to the centre of the stage.
    select(i) {
      i = Math.max(0, Math.min(this.count - 1, i));
      if (i === this.sel) return;
      const t = performance.now() / 1000;
      const s = Motion.at(this.seg, t), target = i * G.PITCH;
      const T = this.reduced ? 0.001 : Motion.duration(Math.abs(target - s.p) / G.PITCH);
      this.seg = Motion.plan(s.p, s.v, s.a, target, T, t);
      this.sel = i;
      this.moving = true;
      this.onState({ moving: true, selected: i });
      if (!this.raf) { this.tPrev = t; this.raf = requestAnimationFrame(this.tick); }
    }

    hasSlot(i) { return this.train[i + 1].load.length < 2; }

    // Test hook: freeze a frame as if travelling at `v` units/s past `pos`.
    debugFrame(pos, v) {
      cancelAnimationFrame(this.raf); this.raf = 0;
      this.ghost = v ? 0 : 1;
      this.seg = { t0: 0, T: 1e9, pf: pos, c: [pos - v, v, 0, 0, 0, 0] };
      this.render(1, (1 / 60) * SHUTTER);
    }
  }

  return { Stage, W, H, CX, RAIL };
})();
