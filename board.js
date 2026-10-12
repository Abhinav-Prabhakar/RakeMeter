// The yard timeline: the second face of the centre stage.
//
// Every rake has a track of its own, and distance along a track is time. A rake is drawn
// as a small train as long as its stay, locomotive leading into the future. Along it, the
// coal drains wagon by wagon over the stretch where it is being tipped, and the rail
// beneath turns orange for every minute past free time. "Now" is a fixed line: as the
// clock runs, or is scrubbed, the whole yard slides past it.
const Board = (() => {
  const W = 984, H = 731;                 // the centre panel, artboard units
  const X0 = 104;                         // tracks start here; rake codes sit to the left
  const NOW_X = 420;                      // where "now" stands
  const PPM = (W - X0) / 600;             // pixels per minute: ten hours across the tracks
  const S = 0.1;                          // vehicles at a tenth of stage size
  const VEH = Art.GEO.WAGON.PITCH * S;    // length of one vehicle along the track
  const ROW0 = 150, ROWP = 68;            // rail of the first track, and track spacing
  const LEVELS = 5;                       // how finely a draining load is drawn
  const ORANGE = "#fc7f37", INK = "#111";

  let cache = new Map(), cacheK = 0;
  // A whole vehicle rendered small, origin at its centre on the rail.
  function sprite(key, k, draw) {
    if (k !== cacheK) { cache = new Map(); cacheK = k; }
    let s = cache.get(key);
    if (s) return s;
    const z = S * k, c = document.createElement("canvas");
    c.width = Math.ceil(760 * z); c.height = Math.ceil(300 * z);
    const ctx = c.getContext("2d");
    ctx.setTransform(z, 0, 0, z, 380 * z, 292 * z);
    draw(ctx);
    s = { c, ox: 380 * z, oy: 292 * z };
    cache.set(key, s);
    return s;
  }
  const wagon = (k, paint, level) => sprite(`w:${paint}:${level}`, k, (c) => Art.wagonCar(c, { paint, fill: level / (LEVELS - 1), seed: 4 }));
  const loco = (k) => sprite("loco", k, (c) => Art.locoCar(c));
  const van = (k) => sprite("van", k, (c) => Art.vanCar(c));

  const railY = (row) => ROW0 + row * ROWP;
  const rowAt = (y, count) => { const r = Math.round((y - ROW0 + 16) / ROWP); return r >= 0 && r < count && Math.abs(y - (railY(r) - 16)) < ROWP / 2 ? r : -1; };

  // st: { now, rakes, sel, hover, k }
  function draw(canvas, st) {
    const { now, rakes, sel, hover, k } = st;
    const w = Math.round(W * k), h = Math.round(H * k);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; canvas.style.width = w / k + "px"; canvas.style.height = h / k + "px"; }
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const x = (t) => NOW_X + (t - now) * PPM, bottom = railY(rakes.length - 1) + 22;

    // panel surface
    ctx.fillStyle = "#e1e1e1"; ctx.fillRect(0, 0, W, H);
    const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    sheen.addColorStop(0, "rgba(255,255,255,.06)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H * 0.3);

    // the selected track, and the one under the pointer, lift a little off the panel
    const band = (row, fill, edge) => {
      const y = railY(row) - 47;
      ctx.beginPath(); ctx.roundRect(10, y, W - 20, 62, 18); ctx.fillStyle = fill; ctx.fill();
      if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
    };
    if (hover >= 0 && hover !== sel) band(hover, "rgba(255,255,255,.2)");
    band(sel, "#ececec", "rgba(255,255,255,.55)");

    ctx.save();
    ctx.beginPath(); ctx.rect(X0 - 8, 0, W - X0 + 8, H); ctx.clip();

    // the hours, as dotted columns with their time underneath
    const first = Math.ceil((now - (NOW_X - X0) / PPM) / 60), last = Math.floor((now + (W - NOW_X) / PPM) / 60);
    ctx.font = "600 10.4px Urbanist, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (let hr = first; hr <= last; hr++) {
      const hx = x(hr * 60);
      ctx.fillStyle = "rgba(0,0,0,.2)";
      for (let y = 100; y <= bottom; y += 8.5) { ctx.beginPath(); ctx.arc(hx, y, 0.7, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = "#777"; ctx.fillText(Sim.clock(hr * 60), hx, bottom + 24);
    }

    rakes.forEach((r, row) => {
      const y = railY(row), xp = x(r.placed), xf = x(r.freeUntil), xr = x(r.released);
      // the track
      ctx.fillStyle = "rgba(0,0,0,.1)"; ctx.fillRect(X0 - 8, y, W, 2);
      ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(X0 - 8, y + 2, W, 1);
      // on its way: a dotted approach up to the moment it is placed
      ctx.fillStyle = "rgba(0,0,0,.34)";
      for (let dx = xp - 8; dx > xp - 150 * PPM; dx -= 7) { ctx.beginPath(); ctx.arc(dx, y + 1, 1.05, 0, 6.283); ctx.fill(); }
      // free time in black, then every minute beyond it in orange
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(xp, y - 0.3, Math.min(xf, xr) - xp, 2.6);
      if (r.released > r.freeUntil) { ctx.fillStyle = ORANGE; ctx.fillRect(xf, y - 0.6, xr - xf, 3.2); }

      // the train: locomotive leading at the moment of release, brake van trailing
      const n = Math.max(2, Math.round((xr - xp) / VEH));
      for (let j = n - 1; j >= 0; j--) {
        const cx = xr - VEH / 2 - j * VEH;
        if (cx < X0 - VEH || cx > W + VEH) continue;
        let spr;
        if (j === 0) spr = loco(k);
        else if (j === n - 1) spr = van(k);
        else {
          const t = now + (cx - NOW_X) / PPM;                    // the moment this wagon stands for
          const left = t <= r.start ? 1 : t >= r.done ? 0 : 1 - (t - r.start) / (r.done - r.start);
          spr = wagon(k, r.livery || "orange", Math.round(left * (LEVELS - 1)));
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(spr.c, cx * k - spr.ox, y * k - spr.oy);
        ctx.setTransform(k, 0, 0, k, 0, 0);
      }
      // what the stay ends up costing, at the head of the train
      const cost = Sim.charge(Sim.hoursOver(r.released - r.freeUntil));
      if (cost) {
        ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#d9540f";
        ctx.fillText(Sim.rupees(cost), xr + 9, y - 9);
      }
    });

    // everything still to come stands back behind a veil
    ctx.fillStyle = "rgba(225,225,225,.56)"; ctx.fillRect(NOW_X + 0.5, 92, W - NOW_X, bottom - 86);
    ctx.restore();

    // rake codes, in the margin the trains slide under
    rakes.forEach((r, row) => {
      const y = railY(row);
      ctx.textAlign = "left";
      ctx.font = "500 12.2px Inter, sans-serif"; ctx.fillStyle = row === sel ? INK : "#8a8a8a"; ctx.fillText(r.slot, 30, y - 14);
      ctx.font = "400 10.6px Urbanist, sans-serif"; ctx.fillStyle = row === sel ? "#777" : "#aaa"; ctx.fillText(r.where, 30, y + 1);
    });

    // now
    ctx.fillStyle = "rgba(0,0,0,.62)"; ctx.fillRect(NOW_X - 0.5, 96, 1, bottom - 90);
    ctx.beginPath(); ctx.arc(NOW_X, 92, 4, 0, 6.283); ctx.fillStyle = "#000"; ctx.fill();
    ctx.font = "400 13.4px Urbanist, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#1e1e1e";
    ctx.fillText(Sim.clock(now), NOW_X, 78);
  }

  // Which rake's track is at (x, y), and what moment that x stands for.
  const probe = (x, y, now, count) => ({ row: rowAt(y, count), time: now + (x - NOW_X) / PPM });

  return { draw, probe, railY, NOW_X };
})();
