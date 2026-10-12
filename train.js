// The animated rake in the centre panel.
// Artwork is rasterised once into sprites at the current pixel density; each frame
// only composites them, so the train can run at display refresh rate.
//
// Two coordinate systems meet here. The stage is laid out in artboard units (the centre
// panel is 984 x 731). The train is drawn in vehicle units (64 per metre) and magnified
// by V.Z, so `kz` = device pixels per vehicle unit. Train positions are vehicle units
// measured from the point where the selected wagon rests, with y = 0 on the rail top.
const TrainStage = (() => {
  const G = Art.GEO;

  // What can run on the stage. Each vehicle says how big it is drawn (Z), where its bogies
  // sit, and which sprites ride on its springs. `layers` are drawn back to front; x and y
  // place each sprite's origin relative to the vehicle centre on the rail top.
  const VEHICLES = {
    // open wagon with a coal load: the Yard screen
    wagon: {
      ...G.WAGON, shadowHalf: G.WAGON.HALF + 40,
      pad: (i, n) => ({ id: "BNSF2706" + n, paint: "orange", loaded: true, seed: 90 + i, phantom: true, i }),
      shared: () => ({}),
      layers(st, car) {
        const V = G.WAGON, reach = V.HALF + V.REACH + 8, out = [];
        // the load sits inside, so the side wall is drawn over it
        if (car.loaded) out.push({ spr: st.sprite(-V.HALF, V.TOP - 54, V.HALF, V.TOP + 6, (c) => Art.heap(c, { seed: car.seed })), x: 0, y: 0 });
        out.push({ spr: st.sprite(-reach, V.TOP - 6, reach, 2, (c) => Art.wagon(c, { id: car.id, paint: car.paint, seed: car.seed })), x: 0, y: 0 });
        return out;
      },
    },
    // the original flatcar carrying up to two containers, with a ghost slot above
    flatcar: {
      Z: 1, PITCH: G.PITCH, BOGIE: G.BOGIE, SILL: G.SILL, shadowHalf: 470,
      pad: (i, n) => ({ id: "BNSF2706" + n, load: [], phantom: true, i }),
      shared(st) {
        const c53 = G.C53;
        return {
          ghost: st.sprite(-4, -4, c53.w + 4, c53.h + 4, (c) => {
            c.globalAlpha = 0.86;
            Art.container(c, { w: c53.w, h: c53.h, paint: "ghost", detail: false });
            c.globalAlpha = 1;
            Art.slotOutline(c, c53.w, c53.h);
          }),
        };
      },
      layers(st, car) {
        const c53 = G.C53, top = (slot) => G.DECK - 1 - (c53.h + G.GAP) * slot - c53.h;
        const out = [{ spr: st.sprite(-490, -96, 490, 0, (c) => Art.body(c, { id: car.id, loaded: car.load.length > 0 })), x: 0, y: 0 }];
        car.load.forEach((b, slot) => out.push({
          // a stacked box carries the twist locks it stands on
          spr: st.sprite(0, 0, c53.w, c53.h + (slot ? G.GAP : 0), (c) => {
            if (slot) { c.fillStyle = "#6f6f6f"; c.fillRect(2, c53.h, 11, G.GAP); c.fillRect(c53.w - 13, c53.h, 11, G.GAP); }
            Art.container(c, { w: c53.w, h: c53.h, paint: b.paint, id: b.id, type: "53CN", dims: "16.154 x 2.591 x 2.896 mm", seed: b.seed });
          }),
          x: -c53.w / 2, y: top(slot),
        }));
        car.ghost = car.load.length < 2 && !car.phantom ? { spr: st.spr.ghost, x: -c53.w / 2, y: top(car.load.length) } : null;
        return out;
      },
    },
  };
  const W = 984, H = 731;       // canvas size in artboard units (the whole centre panel)
  const CX = 488;               // where the selected wagon comes to rest
  const RAIL = 624;             // rail top
  const TAU = Math.PI * 2;

  // suspension pitch: ~2 Hz, lightly damped so the load rocks once or twice after a stop
  const PITCH_W = TAU * 2.1, PITCH_Z = 0.3, PITCH_GAIN = 2.1e-4, PITCH_MAX = 0.0058;
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
      const V = (this.V = VEHICLES[opts.vehicle] || VEHICLES.wagon);
      this.reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

      // one more wagon either side so the listed ones are never the end of the train
      const pad = V.pad;
      const list = [pad(-1, "62"), ...cars.map((c, i) => ({ ...c, i })), pad(cars.length, "71")];
      this.train = list.map((c) => ({
        ...c,
        pitch: { x: 0, v: 0 }, slack: { x: 0, v: 0 },
        delay: (c.i + 1) * SLACK_DELAY,
        phase: [0, 1, 2, 3].map((n) => ((c.i * 7 + n * 3) * 1.37) % TAU),
      }));
      this.count = cars.length;
      this.sel = opts.selected || 0;
      this.ghostCar = this.sel;         // which vehicle shows its empty-slot ghost, and how visible it is
      this.ghost = 1;
      this.seg = Motion.plan(this.sel * V.PITCH, 0, 0, this.sel * V.PITCH, 0.001, -1);
      this.moving = false;
      this.raf = 0;
      this.tPrev = 0;
      this.k = 0;
      this.tick = this.tick.bind(this);
    }

    // ---------------------------------------------------------------- sprites
    sprite(x0, y0, x1, y1, draw) {                 // bounds in vehicle units
      const k = this.kz, c = document.createElement("canvas");
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
      const V = this.V, kz = (this.kz = k * V.Z);
      this.cxPx = Math.round(CX * k);
      this.railPx = Math.round(RAIL * k);

      this.spr = {
        wheel: this.sprite(-37, -37, 37, 37, (c) => Art.wheel(c, 3)),
        wheelLight: this.sprite(-37, -37, 37, 37, (c) => Art.wheelLight(c)),
        bogie: this.sprite(-118, -70, 118, 2, (c) => Art.bogie(c)),
        shadow: this.sprite(-V.PITCH / 2 - 30, 0, V.PITCH / 2 + 30, 40, (c) => Art.shadow(c, V.BOGIE, V.shadowHalf)),
      };
      Object.assign(this.spr, V.shared(this));
      for (const car of this.train) car.layers = V.layers(this, car);

      // static backdrop: panel surface + track
      const bg = (this.bg = document.createElement("canvas"));
      bg.width = cv.width; bg.height = cv.height;
      const b = bg.getContext("2d", { alpha: false });
      b.fillStyle = "#e1e1e1"; b.fillRect(0, 0, bg.width, bg.height);
      const sheen = b.createLinearGradient(0, 0, 0, bg.height * 0.3);
      sheen.addColorStop(0, "rgba(255,255,255,.06)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
      b.fillStyle = sheen; b.fillRect(0, 0, bg.width, bg.height * 0.3);
      b.setTransform(kz, 0, 0, kz, 0, this.railPx);
      Art.track(b, 0, W / V.Z + 2);
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
      const V = this.V, kz = this.kz, S = this.spr, ox = this.cxPx, oy = this.railPx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.bg, 0, 0);
      const vis = [], edge = W / 2 / V.Z + V.PITCH / 2 + 30;
      for (const car of this.train) {
        const off = Motion.soft(car.slack.x, SLACK_MAX);
        const x = car.i * V.PITCH - pos + off;
        if (Math.abs(x) < edge) vis.push([car, x, off]);
      }
      for (const [, x] of vis) this.put(ctx, S.shadow, x, 0, snap);

      for (const [car, x, off] of vis) {
        // running gear
        let n = 0;
        for (const bx of [-V.BOGIE, V.BOGIE]) {
          for (const ax of [-G.AXLE, G.AXLE]) {
            const wx = x + bx + ax, wy = -G.R;
            const ang = (off - pos) / G.R + car.phase[n++];
            const c = Math.cos(ang) * kz, s = Math.sin(ang) * kz;
            ctx.setTransform(c, s, -s, c, ox + wx * kz, oy + wy * kz);
            ctx.drawImage(S.wheel.c, -S.wheel.ox, -S.wheel.oy, S.wheel.w, S.wheel.h);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.put(ctx, S.wheelLight, wx, wy, snap);
          }
          this.put(ctx, S.bogie, x + bx, 0, snap);
        }

        // sprung mass: body, couplers and load pitch together about the bogie springs
        const th = Motion.soft(car.pitch.x, PITCH_MAX);
        const still = Math.abs(th) < 1e-5;
        if (!still) {
          const c = Math.cos(th) * kz, s = Math.sin(th) * kz;
          ctx.setTransform(c, s, -s, c, ox + (x + th * 150) * kz, oy + V.SILL * kz);
        }
        const place = ({ spr, x: lx, y: ly }) => {
          if (still) this.put(ctx, spr, x + lx, ly, snap);
          else ctx.drawImage(spr.c, lx - spr.ox, ly - V.SILL - spr.oy, spr.w, spr.h);
        };
        car.layers.forEach(place);
        if (car.ghost && car.i === this.ghostCar && this.ghost > 0.004) {
          ctx.globalAlpha = this.ghost; place(car.ghost); ctx.globalAlpha = 1;
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
      const want = this.moving ? 0 : 1;             // the ghost slot fades out for the journey
      this.ghost += (want - this.ghost) * Math.min(1, dt * (want ? 9 : 22));
      const fading = Math.abs(want - this.ghost) > 0.004;
      if (!fading) this.ghost = want;

      const settled = !running && energy < 0.06 && !fading;
      if (settled) for (const car of this.train) { car.pitch.x = car.pitch.v = car.slack.x = car.slack.v = 0; }
      this.render(t, settled ? 0 : Math.min(dt, 1 / 48) * SHUTTER);
      this.raf = settled ? 0 : requestAnimationFrame(this.tick);
    }

    // Bring wagon `i` to rest on the stage.
    select(i) {
      i = Math.max(0, Math.min(this.count - 1, i));
      if (i === this.sel) return;
      const t = performance.now() / 1000;
      const P = this.V.PITCH, s = Motion.at(this.seg, t), target = i * P;
      const T = this.reduced ? 0.001 : Motion.duration(Math.abs(target - s.p) / P);
      this.seg = Motion.plan(s.p, s.v, s.a, target, T, t);
      this.sel = i;
      this.moving = true;
      this.onState({ moving: true, selected: i });
      if (!this.raf) { this.tPrev = t; this.raf = requestAnimationFrame(this.tick); }
    }

    // Test hook: freeze a frame as if travelling at `v` vehicle units/s past `pos`.
    debugFrame(pos, v) {
      cancelAnimationFrame(this.raf); this.raf = 0;
      this.ghost = v ? 0 : 1;
      this.seg = { t0: 0, T: 1e9, pf: pos, c: [pos - v, v, 0, 0, 0, 0] };
      this.render(1, (1 / 60) * SHUTTER);
    }
  }

  return { Stage, VEHICLES, W, H, CX, RAIL };
})();
