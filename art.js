// Procedural artwork for the train: open wagon and coal load, flatcar and containers,
// bogies, wheels, track.
// Everything is drawn in "stage units" (1 unit = 1px on the 1920x1080 artboard)
// so the same code renders the hero at any pixel density and the small thumbnails.
// Car-space origin: x = car centre, y = 0 at the top of the rail (y grows downwards).
const Art = (() => {
  const GEO = {
    PITCH: 960,        // coupler-to-coupler car spacing
    R: 32,             // wheel radius
    BOGIE: 278,        // bogie centre offset from car centre
    AXLE: 63.5,        // axle offset from bogie centre
    DECK: -83,         // deck top
    SILL: -68,         // underside of the shallow part of the sill
    BELLY: -38,        // underside of the deep centre sill
    HALF: 399,         // half deck length
    C53: { w: 718, h: 223 },
    C40: { w: 560, h: 208 },
    GAP: 3,            // twist-lock gap between stacked containers
  };

  // shd / lit / spec are the tints the paint takes in shadow, in light, and at a glint
  const PAINTS = {
    orange: { base: "#d8510c", print: "#ffe6c6", sh: 1, dust: "70,38,14", shd: "96,14,0", lit: "255,170,84", spec: "255,222,184" },
    white:  { base: "#e6e5e1", print: "#a3a29e", sh: 0.6, dust: "90,80,66", shd: "58,62,72", lit: "255,255,255", spec: "255,255,255" },
    grey:   { base: "#a09f9c", print: "#d6d6d4", sh: 0.72, dust: "60,56,50", shd: "26,28,34", lit: "236,236,234", spec: "250,250,250" },
    // further wagon liveries
    oxide:  { base: "#8f3b23", print: "#f4dfcc", sh: 1, dust: "60,34,20", shd: "36,6,2", lit: "232,146,104", spec: "255,214,190" },
    cobalt: { base: "#2c6cae", print: "#e8f1fb", sh: 1, dust: "40,44,52", shd: "4,18,50", lit: "128,188,240", spec: "214,236,255" },
    forest: { base: "#3d7848", print: "#e6f2e3", sh: 1, dust: "48,44,30", shd: "6,32,16", lit: "150,212,150", spec: "222,246,222" },
    ochre:  { base: "#d39c1c", print: "#3b2c08", sh: 1, dust: "84,58,18", shd: "96,50,0", lit: "255,226,128", spec: "255,246,206" },
    ghost:  { base: "#f1f1f1", print: null, sh: 0.26, dust: null, shd: "70,70,70", lit: "255,255,255", spec: "255,255,255" },
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function spaced(ctx, text, x, y, gap) {
    for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + gap; }
    return x;
  }
  const pxScale = (ctx) => { const m = ctx.getTransform(); return Math.hypot(m.a, m.b); };

  // Film-grain tile, one texel per device pixel.
  let grainTile = null;
  function grain(ctx) {
    if (!grainTile) {
      grainTile = document.createElement("canvas");
      grainTile.width = grainTile.height = 128;
      const g = grainTile.getContext("2d");
      const d = g.createImageData(128, 128);
      const R = rng(99);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = R();
        const c = v > 0.5 ? 255 : 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = c;
        d.data[i + 3] = Math.abs(v - 0.5) * 2 * 255;
      }
      g.putImageData(d, 0, 0);
    }
    const p = ctx.createPattern(grainTile, "repeat");
    const k = pxScale(ctx);
    p.setTransform(new DOMMatrix().scale(1 / k));
    return p;
  }

  function sbbMark(ctx, x, y, h, ink, paper) {
    // flag with the double-arrow knocked out, followed by the wordmark
    const w = h * 3.35;
    ctx.fillStyle = ink;
    ctx.fillRect(x, y, w, h);
    const s = h / 20, ox = x + w - 36 * s, oy = y;
    ctx.strokeStyle = paper; ctx.lineWidth = 2.7 * s; ctx.lineJoin = "miter"; ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(ox + 15.6 * s, oy + 3 * s); ctx.lineTo(ox + 9 * s, oy + 10 * s); ctx.lineTo(ox + 15.6 * s, oy + 17 * s);
    ctx.moveTo(ox + 24.4 * s, oy + 3 * s); ctx.lineTo(ox + 31 * s, oy + 10 * s); ctx.lineTo(ox + 24.4 * s, oy + 17 * s);
    ctx.moveTo(ox + 11 * s, oy + 10 * s); ctx.lineTo(ox + 29 * s, oy + 10 * s);
    ctx.moveTo(ox + 20 * s, oy + 3 * s); ctx.lineTo(ox + 20 * s, oy + 17 * s);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `700 ${h * 1.1}px Inter, Arial, sans-serif`;
    ctx.textBaseline = "alphabetic";
    spaced(ctx, "SBB", x + w + h * 0.36, y + h * 0.9, h * 0.03);
  }

  // ------------------------------------------------------------------ container
  // Origin at the container's top-left corner.
  function container(ctx, o) {
    const { w, h, paint = "orange", id = "", type = "53CN", dims = "", seed = 1, detail = true } = o;
    const P = PAINTS[paint], S = P.sh, R = rng(seed * 7919 + 13);
    const post = 11, tr = 12, br = 16, y0 = tr, y1 = h - br, pw = w - post * 2;
    // shadows and highlights are tinted, not neutral: paint goes deeper and redder in
    // shade and warmer where it catches the light, which is what keeps it looking like steel
    const SH = (a) => `rgba(${P.shd},${Math.min(1, a * S).toFixed(3)})`;
    const LT = (a) => `rgba(${P.lit},${Math.min(1, a * S).toFixed(3)})`;
    const SP = (a) => `rgba(${P.spec},${Math.min(1, a * S).toFixed(3)})`;
    const live = !!P.print && detail;
    const RUST = "112,46,14";

    ctx.save();
    rr(ctx, 0, 0, w, h, 1.4); ctx.clip();
    ctx.fillStyle = P.base; ctx.fillRect(0, 0, w, h);

    // --- livery, printed before the shading so it follows the corrugation
    if (live) {
      ctx.save();
      ctx.globalAlpha = 0.96;
      sbbMark(ctx, 26, 31, 21, P.print, P.base);
      ctx.fillStyle = P.print;
      ctx.font = "700 17.5px Inter, Arial, sans-serif";
      spaced(ctx, id.slice(0, 4), w - 112, 42, 2.4);
      spaced(ctx, id.slice(4), w - 112, 65.5, 2.4);
      spaced(ctx, type, w - 112, 89, 2.4);
      ctx.font = "600 9.4px Inter, Arial, sans-serif";
      spaced(ctx, dims, 27, y1 - 13, 1.15);
      ctx.font = "600 4.6px Inter, Arial, sans-serif";
      ["MAX. GROSS   30,480 KG", "TARE             4,800 KG", "NET             25,680 KG", "CU. CAP.       86.0 CU.M"]
        .forEach((t, i) => spaced(ctx, t, w - 112, 106 + i * 6.6, 0.35));
      ctx.restore();
    }

    // --- corrugated side panel: wide outer faces, narrow pressed troughs
    const n = Math.round(pw / 25.6), p = pw / n;
    const F = 0.55, A = 0.64, B = 0.91;          // face | falling slope | trough | rising slope
    for (let i = 0; i < n; i++) {
      const x = post + i * p, vary = (R() - 0.5) * 0.06;
      // outer face: a soft sheen where the sheet bows towards the light
      ctx.fillStyle = lin(ctx, x, 0, x + F * p, 0, [0, LT(0.2), 0.22, LT(0.1), 0.6, LT(0), 1, SH(0.1)]);
      ctx.fillRect(x, y0, F * p, y1 - y0);
      // slope falling away from the light
      ctx.fillStyle = lin(ctx, x + F * p, 0, x + A * p, 0, [0, SH(0.3), 0.3, SH(0.66), 1, SH(0.5)]);
      ctx.fillRect(x + F * p - 0.1, y0, (A - F) * p + 0.2, y1 - y0);
      // trough floor, with light bouncing in from the rising slope
      ctx.fillStyle = lin(ctx, x + A * p, 0, x + B * p, 0, [0, SH(0.44), 0.55, SH(0.3), 1, SH(0.2)]);
      ctx.fillRect(x + A * p, y0, (B - A) * p, y1 - y0);
      // slope facing the light: the bright line of each rib
      ctx.fillStyle = lin(ctx, x + B * p, 0, x + p, 0, [0, SP(0.18), 0.45, SP(0.62), 1, LT(0.34)]);
      ctx.fillRect(x + B * p - 0.1, y0, (1 - B) * p + 0.3, y1 - y0);

      // pressed trough ends: the top one faces down (dark), the bottom one up (lit)
      const cap = (ya, yb, fill, edge) => {
        ctx.beginPath();
        ctx.moveTo(x + F * p, ya); ctx.lineTo(x + p, ya); ctx.lineTo(x + B * p, yb); ctx.lineTo(x + A * p, yb); ctx.closePath();
        ctx.fillStyle = P.base; ctx.fill(); ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x + A * p, yb); ctx.lineTo(x + B * p, yb); ctx.stroke();
      };
      cap(y0, y0 + 8.5, lin(ctx, 0, y0, 0, y0 + 8.5, [0, SH(0.72), 1, SH(0.46)]), SH(0.5));
      cap(y1, y1 - 6, lin(ctx, 0, y1 - 6, 0, y1, [0, SH(0.1), 1, LT(0.2)]), SP(0.22));

      // shadow of the top rail: short on the faces, reaching further into the troughs
      ctx.fillStyle = lin(ctx, 0, y0, 0, y0 + 5, [0, SH(0.62), 0.6, SH(0.3), 1, SH(0)]);
      ctx.fillRect(x, y0, F * p, 5);
      ctx.fillStyle = lin(ctx, 0, y0 + 8, 0, y0 + 19, [0, SH(0.4), 1, SH(0)]);
      ctx.fillRect(x + A * p, y0 + 8.5, (B - A) * p, 11);

      ctx.fillStyle = vary > 0 ? LT(vary) : SH(-vary);    // sheet-to-sheet tone variation
      ctx.fillRect(x, y0, p, y1 - y0);
    }
    // panel weld seams
    for (const f of [0.2, 0.4, 0.6, 0.8]) {
      const sx = post + Math.round(n * f) * p + F * p * 0.5;
      ctx.fillStyle = SH(0.22); ctx.fillRect(sx, y0 + 2, 0.7, y1 - y0 - 4);
      ctx.fillStyle = LT(0.2); ctx.fillRect(sx - 0.7, y0 + 2, 0.7, y1 - y0 - 4);
    }
    // sky light from above, ground bounce from below
    ctx.fillStyle = lin(ctx, 0, y0, 0, y1, [0, LT(0.13), 0.3, LT(0.02), 0.62, SH(0), 0.9, SH(0.16), 1, SH(0.1)]);
    ctx.fillRect(post, y0, pw, y1 - y0);
    ctx.fillStyle = lin(ctx, 0, 0, w, 0, [0, LT(0.05), 0.5, LT(0), 1, SH(0.1)]);
    ctx.fillRect(post, y0, pw, y1 - y0);

    // --- top rail (square tube)
    ctx.fillStyle = lin(ctx, 0, 0, 0, tr, [0, LT(0.34), 0.16, LT(0.1), 0.55, SH(0.1), 1, SH(0.46)]);
    ctx.fillRect(0, 0, w, tr);
    ctx.fillStyle = SP(0.7); ctx.fillRect(0, 0, w, 0.8);
    ctx.fillStyle = SH(0.8); ctx.fillRect(post, tr - 0.8, pw, 0.8);

    // --- bottom rail with fork pockets
    ctx.fillStyle = lin(ctx, 0, y1, 0, h, [0, LT(0.36), 0.12, LT(0.1), 0.5, SH(0.12), 1, SH(0.5)]);
    ctx.fillRect(0, y1, w, br);
    ctx.fillStyle = SH(0.7); ctx.fillRect(post, y1 - 0.8, pw, 0.8);
    ctx.fillStyle = SP(0.5); ctx.fillRect(post, y1, pw, 0.8);
    for (const fx of [0.303, 0.672]) {
      const px = w * fx, pk = w * 0.05;
      ctx.fillStyle = SH(0.3); ctx.fillRect(px - 3, y1 + 1.5, pk + 6, br - 1.5);              // reinforcing strap
      ctx.fillStyle = paint === "ghost" ? "rgba(0,0,0,.1)" : lin(ctx, 0, y1 + 3, 0, h - 1.5, [0, "#030202", 0.55, "#120d0a", 1, "#2b1f17"]);
      ctx.fillRect(px, y1 + 3.5, pk, br - 5);
      ctx.fillStyle = SP(0.4); ctx.fillRect(px, h - 1.6, pk, 0.8);
      ctx.fillStyle = SH(0.6); ctx.fillRect(px - 0.8, y1 + 3.5, 0.8, br - 5);
    }

    // --- corner posts and castings
    ctx.fillStyle = lin(ctx, 0, 0, post, 0, [0, LT(0.3), 0.3, LT(0.06), 1, SH(0.3)]);
    ctx.fillRect(0, tr, post, y1 - tr);
    ctx.fillStyle = SH(0.75); ctx.fillRect(post - 0.9, tr, 0.9, y1 - tr);
    ctx.fillStyle = lin(ctx, w - post, 0, w, 0, [0, LT(0.14), 0.3, SH(0.1), 1, SH(0.5)]);
    ctx.fillRect(w - post, tr, post, y1 - tr);
    ctx.fillStyle = SH(0.75); ctx.fillRect(w - post, tr, 0.9, y1 - tr);
    for (const [cx, cy] of [[0, 0], [w - 13, 0], [0, h - 15], [w - 13, h - 15]]) {
      ctx.fillStyle = P.base; ctx.fillRect(cx, cy, 13, 15);
      ctx.fillStyle = lin(ctx, cx, cy, cx + 13, cy + 15, [0, SH(0.16), 1, SH(0.58)]);
      ctx.fillRect(cx, cy, 13, 15);
      ctx.strokeStyle = SP(0.42); ctx.lineWidth = 0.7; ctx.strokeRect(cx + 0.5, cy + 0.5, 12, 14);
      ctx.fillStyle = paint === "ghost" ? "rgba(0,0,0,.14)" : "rgba(10,6,4,.92)";
      ctx.beginPath(); ctx.ellipse(cx + 6.5, cy + 7.5, 3.1, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = SP(0.4); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(cx + 6.5, cy + 7.8, 3.1, 4, 0, 0.2, Math.PI - 0.2); ctx.stroke();
    }

    if (live) {
      // weld beads where the panel meets the rails
      for (let x = post; x < w - post; x += 1.7) {
        const a = 0.12 + R() * 0.26;
        ctx.fillStyle = SP(a); ctx.fillRect(x, tr + 0.2, 1.1, 0.7);
        ctx.fillStyle = SH(a + 0.1); ctx.fillRect(x + 0.4, y1 - 1.7, 1.1, 0.7);
      }
      // high-cube markings: hazard chevrons on the rail and the 9'6" decal
      for (const hx of [post + 4, w - post - 34]) {
        ctx.save();
        ctx.beginPath(); ctx.rect(hx, 2.5, 30, tr - 5); ctx.clip();
        ctx.fillStyle = "rgba(236,190,36,.92)"; ctx.fillRect(hx, 0, 30, tr);
        ctx.fillStyle = "rgba(20,18,14,.9)";
        for (let s = -10; s < 40; s += 7.5) {
          ctx.beginPath(); ctx.moveTo(hx + s, tr); ctx.lineTo(hx + s + 3.6, tr); ctx.lineTo(hx + s + 10, 0); ctx.lineTo(hx + s + 6.4, 0); ctx.fill();
        }
        ctx.restore();
      }
      ctx.fillStyle = "rgba(236,190,36,.9)"; ctx.fillRect(w - post - 38, 18, 20, 9.5);
      ctx.fillStyle = "rgba(20,18,14,.9)"; ctx.font = "700 3.5px Inter, Arial, sans-serif";
      ctx.fillText("2.9 m", w - post - 34.5, 22); ctx.fillText("9'6\" HIGH", w - post - 36.6, 26);
      for (let i = 0; i < n; i++) {                       // keep the decal reading as paint on ribs
        const x = post + i * p; if (x < w - 80) continue;
        ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(x + F * p, 18, (B - F) * p, 9.5);
      }

      // --- wear and weather
      for (let i = 0; i < 7; i++) {             // broad, barely-there tonal drift
        const mx = R() * w, my = R() * h, mr = 70 + R() * 160;
        ctx.fillStyle = rad(ctx, mx, my, 0, mr, [0, R() > 0.5 ? SH(0.07) : LT(0.05), 1, "rgba(0,0,0,0)"]);
        ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
      for (let i = 0; i < 6; i++) {             // shallow dents: a lit lip above a shaded hollow
        const dx = post + 30 + R() * (pw - 60), dy = y0 + 30 + R() * (y1 - y0 - 60), dr = 5 + R() * 9;
        ctx.fillStyle = rad(ctx, dx - dr * 0.25, dy - dr * 0.3, 0, dr, [0, LT(0.1), 1, "rgba(0,0,0,0)"]);
        ctx.fillRect(dx - dr * 2, dy - dr * 2, dr * 4, dr * 4);
        ctx.fillStyle = rad(ctx, dx + dr * 0.3, dy + dr * 0.35, 0, dr, [0, SH(0.09), 1, "rgba(0,0,0,0)"]);
        ctx.fillRect(dx - dr * 2, dy - dr * 2, dr * 4, dr * 4);
      }
      for (let i = 0; i < 22; i++) {            // faint water runs under the top rail
        const sx = post + R() * pw, len = 14 + R() * R() * (h * 0.7), sw = 0.7 + R() * 2.4;
        ctx.fillStyle = lin(ctx, 0, tr, 0, tr + len, [0, SH(0.1 + R() * 0.12), 1, SH(0)]);
        ctx.fillRect(sx, tr, sw, len);
      }
      for (let i = 0; i < 9; i++) {             // rust blooming at the bottom weld, bleeding downwards
        const rx = R() < 0.25 ? (R() < 0.5 ? 3 + R() * 10 : w - 13 + R() * 10) : post + R() * pw, rw = 2 + R() * 7;
        ctx.fillStyle = rad(ctx, rx, y1, 0, rw, [0, `rgba(${RUST},.55)`, 0.5, `rgba(${RUST},.22)`, 1, `rgba(${RUST},0)`]);
        ctx.save(); ctx.translate(rx, y1); ctx.scale(1, 0.6); ctx.translate(-rx, -y1); ctx.fillRect(rx - rw, y1 - rw, rw * 2, rw * 2); ctx.restore();
        ctx.fillStyle = lin(ctx, 0, y1, 0, h, [0, `rgba(${RUST},.3)`, 1, `rgba(${RUST},0)`]); ctx.fillRect(rx - rw * 0.3, y1, rw * 0.6, br);
      }
      for (let i = 0; i < 70; i++) {            // paint chips along the frame members
        const onRail = R() < 0.6, cx = R() * w, cy = onRail ? (R() < 0.5 ? R() * tr : y1 + R() * br) : R() * h;
        const ex = onRail ? cx : (R() < 0.5 ? R() * post : w - R() * post);
        ctx.fillStyle = `rgba(${R() < 0.5 ? RUST : "40,20,10"},${0.25 + R() * 0.4})`;
        ctx.fillRect(ex, cy, 0.5 + R() * 1.4, 0.4 + R() * 0.9);
      }
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {             // handling scuffs: bare-metal scratches and dark rub marks
        const sx = post + R() * (pw - 50), sy = y0 + 40 + R() * (y1 - y0 - 60), len = 4 + R() * 20, lightScuff = R() > 0.4;
        ctx.strokeStyle = lightScuff ? SP(0.1 + R() * 0.12) : SH(0.12 + R() * 0.14); ctx.lineWidth = 0.4 + R() * 0.8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + len, sy + (R() - 0.5) * 3); ctx.stroke();
      }
      ctx.fillStyle = lin(ctx, 0, h - 44, 0, h, [0, `rgba(${P.dust},0)`, 1, `rgba(${P.dust},.13)`]);
      ctx.fillRect(0, h - 44, w, 44);           // road dust
      if (pxScale(ctx) >= 0.8) { ctx.globalAlpha = 0.03; ctx.fillStyle = grain(ctx); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    }
    ctx.restore();

    // crisp silhouette
    ctx.strokeStyle = paint === "ghost" ? "rgba(0,0,0,.05)" : `rgba(${P.shd},.55)`;
    ctx.lineWidth = 0.7;
    rr(ctx, 0.35, 0.35, w - 0.7, h - 0.7, 1.4); ctx.stroke();
  }

  // Dashed "empty slot" outline drawn around the ghost container.
  function slotOutline(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 1.6; ctx.setLineDash([9, 7]);
    rr(ctx, -1.5, -1.5, w + 3, h + 3, 4); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ wheel
  // Origin at the axle. This layer rotates; wheelLight() stays fixed on top of it.
  function wheel(ctx, seed = 1) {
    const R = rng(seed * 131 + 7), r = GEO.R;
    circ(ctx, 0, 0, r + 3.6); ctx.fillStyle = "#262626"; ctx.fill();            // flange
    circ(ctx, 0, 0, r); ctx.fillStyle = rad(ctx, 0, 0, r - 6, r, [0, "#5a5a5a", 0.35, "#9a9a9a", 0.75, "#7c7c7c", 1, "#555"]); ctx.fill(); // tyre
    circ(ctx, 0, 0, r - 5.6); ctx.fillStyle = rad(ctx, 0, 0, 8, r - 5.6, [0, "#5d5852", 0.45, "#3f3a35", 0.82, "#4e4842", 1, "#2b2724"]); ctx.fill(); // dished plate
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.5)"; circ(ctx, 0, 0, r - 5.6); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 3.5; circ(ctx, 0, 0, 19.5); ctx.stroke();

    // grime, brake dust and rust patches (these make the rotation readable)
    ctx.save(); circ(ctx, 0, 0, r - 6); ctx.clip();
    for (let i = 0; i < 7; i++) {
      const a = R() * 6.283, d = 12 + R() * 12, br = 5 + R() * 9, light = R() > 0.55;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      ctx.fillStyle = rad(ctx, x, y, 0, br, [0, light ? "rgba(150,140,128,.24)" : "rgba(10,8,6,.34)", 1, "rgba(0,0,0,0)"]);
      ctx.fillRect(x - br, y - br, br * 2, br * 2);
    }
    ctx.restore();
    // raised foundry lettering and a chalk inspection mark
    ctx.save(); ctx.rotate(R() * 6.283);
    ctx.strokeStyle = "rgba(210,210,210,.5)"; ctx.lineWidth = 1; ctx.lineCap = "butt";
    for (let i = 0; i < 9; i++) {
      const a = i * 0.13; ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 20.5, Math.sin(a) * 20.5); ctx.lineTo(Math.cos(a) * (22.6 + (i % 3 === 0 ? 0.8 : 0)), Math.sin(a) * (22.6 + (i % 3 === 0 ? 0.8 : 0))); ctx.stroke();
    }
    ctx.rotate(2.3 + R());
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(14.5, 0); ctx.lineTo(24, 1.2); ctx.stroke();
    ctx.restore();

    // hub and roller-bearing end cap with its three cap screws
    circ(ctx, 0, 0, 12.6); ctx.fillStyle = rad(ctx, -2, -2, 1, 13, [0, "#7a7a7a", 0.7, "#4f4f4f", 1, "#2e2e2e"]); ctx.fill();
    circ(ctx, 0, 0, 8.8); ctx.fillStyle = rad(ctx, -2, -2.5, 0.5, 9.5, [0, "#a6a6a6", 0.6, "#757575", 1, "#484848"]); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 0.8; circ(ctx, 0, 0, 8.8); ctx.stroke();
    ctx.fillStyle = "#8f8f8f"; ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.0944; ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * 2.0944, x = Math.cos(a) * 4.6, y = Math.sin(a) * 4.6;
      circ(ctx, x, y, 1.75); ctx.fillStyle = "#c4c4c4"; ctx.fill(); ctx.stroke();
      circ(ctx, x, y, 0.6); ctx.fillStyle = "#3a3a3a"; ctx.fill();
    }
  }

  // World-space lighting laid over the spinning wheel.
  function wheelLight(ctx) {
    const r = GEO.R;
    const sweep = (r0, r1, a, b) => {           // diagonal light across an annulus
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r1, 0, Math.PI * 2); if (r0) ctx.arc(0, 0, r0, 0, Math.PI * 2, true); ctx.clip("evenodd");
      ctx.fillStyle = lin(ctx, -r1 * 0.7, -r1 * 0.7, r1 * 0.7, r1 * 0.7, [0, a, 0.5, "rgba(0,0,0,0)", 1, b]);
      ctx.fillRect(-r1, -r1, r1 * 2, r1 * 2); ctx.restore();
    };
    sweep(r - 5.6, r + 3.6, "rgba(255,250,240,.26)", "rgba(0,0,0,.46)");      // rim face: convex
    sweep(12.6, r - 5.6, "rgba(0,0,0,.42)", "rgba(255,246,232,.17)");          // plate: dished inwards
    sweep(0, 12.6, "rgba(255,250,240,.22)", "rgba(0,0,0,.4)");                 // hub and bearing cap: convex
    ctx.save(); circ(ctx, 0, 0, r + 3.6); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, -r - 3, 0, -10, [0, "rgba(0,0,0,.6)", 0.4, "rgba(0,0,0,.3)", 1, "rgba(0,0,0,0)"]);   // shade from the deck
    ctx.fillRect(-40, -40, 80, 34);
    ctx.fillStyle = rad(ctx, 0, r, 0, 16, [0, "rgba(0,0,0,.4)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(-20, r - 16, 40, 20);   // contact with the rail
    ctx.restore();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,252,244,.62)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r - 1.6, Math.PI * 1.04, Math.PI * 1.3); ctx.stroke();
    ctx.strokeStyle = "rgba(255,252,244,.3)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r - 1.2, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();                              // rail bounce on the tread
    ctx.strokeStyle = "rgba(255,252,244,.22)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0, 0, r - 6.3, Math.PI * 0.05, Math.PI * 0.45); ctx.stroke();                              // lip of the dish
  }

  // ------------------------------------------------------------------ bogie side frame
  // Helical coil spring seen from the side: far strands first, near strands over them.
  function coil(ctx, cx, top, bot, r, wire, turns) {
    const p = (bot - top) / turns;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#14120f"; ctx.lineWidth = wire * 0.9;
    for (let i = 0; i < turns; i++) {
      ctx.beginPath(); ctx.moveTo(cx + r, top + p * (i + 0.08)); ctx.lineTo(cx - r, top + p * (i + 0.55)); ctx.stroke();
    }
    for (let i = 0; i < turns; i++) {
      const ya = top + p * (i + 0.55), yb = Math.min(bot - wire * 0.4, top + p * (i + 1.08));
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = wire + 1;
      ctx.beginPath(); ctx.moveTo(cx - r, ya + 0.9); ctx.lineTo(cx + r, yb + 0.9); ctx.stroke();
      ctx.strokeStyle = lin(ctx, cx - r - wire / 2, 0, cx + r + wire / 2, 0, [0, "#2b2722", 0.26, "#c5bfb3", 0.5, "#8a847a", 0.8, "#4a453e", 1, "#191714"]);
      ctx.lineWidth = wire;
      ctx.beginPath(); ctx.moveTo(cx - r, ya); ctx.lineTo(cx + r, yb); ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,240,.35)"; ctx.lineWidth = wire * 0.22;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.75, ya - wire * 0.2 + (yb - ya) * 0.12); ctx.lineTo(cx + r * 0.1, ya - wire * 0.2 + (yb - ya) * 0.55); ctx.stroke();
    }
    ctx.fillStyle = lin(ctx, cx - r, 0, cx + r, 0, [0, "#2b2722", 0.3, "#a09a8f", 1, "#1c1a17"]);
    rr(ctx, cx - r - wire / 2, top - wire * 0.2, r * 2 + wire, wire * 0.8, wire * 0.3); ctx.fill();
    rr(ctx, cx - r - wire / 2, bot - wire * 0.6, r * 2 + wire, wire * 0.8, wire * 0.3); ctx.fill();
  }

  function roundPoly(ctx, pts, r) {
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = mid(pts[n - 1], pts[0]);
    ctx.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const a = pts[i], b = mid(a, pts[(i + 1) % n]); ctx.arcTo(a[0], a[1], b[0], b[1], r); ctx.lineTo(b[0], b[1]); }
    ctx.closePath();
  }

  // Three-piece freight bogie, seen from outside: cast side frame with pedestal jaws
  // over the bearings, bolster end and spring nest in the centre window.
  // Origin: bogie centre on the rail top.
  function bogie(ctx, detail = true) {
    const A = GEO.AXLE, R = rng(515), k = pxScale(ctx);
    const half = [[0, -62], [30, -62], [37, -61.2], [58, -55.2], [72, -53.4], [78.2, -52.4], [81, -49.4], [81, -30.5], [79.4, -27.6],
      [75.6, -27.6], [74.5, -29.2], [74.5, -45.6], [52.5, -45.6], [52.5, -29.2], [51.4, -27.6], [47.4, -27.6], [26.5, -4.6], [0, -4.6]];
    const outline = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    const frame = () => {
      ctx.beginPath();
      roundPoly(ctx, outline, 1.4);
      roundPoly(ctx, [[-14.5, -53.5], [14.5, -53.5], [14.5, -8.9], [-14.5, -8.9]], 1.8);   // bolster window
      for (const s of [-1, 1]) roundPoly(ctx, [[s * 23.6, -51.4], [s * 44, -47.6], [s * 23.6, -24]], 2.6);   // lightening openings
    };

    // --- behind the frame: brake shoes on the treads, and their beam
    for (const s of [-1, 1]) {
      const wx = s * A, wy = -GEO.R, a0 = s > 0 ? Math.PI : 0;
      ctx.beginPath(); ctx.arc(wx, wy, GEO.R + 1.2, a0 - 0.36, a0 + 0.36); ctx.arc(wx, wy, GEO.R + 7.5, a0 + 0.33, a0 - 0.33, true); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, wy - 12, 0, wy + 12, [0, "#5b4a3c", 0.5, "#3a2e25", 1, "#1e1814"]); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = "#2a2622"; rr(ctx, s > 0 ? wx - GEO.R - 12 : wx + GEO.R + 6.5, wy - 5, 5.5, 10, 1); ctx.fill();   // brake head
    }
    ctx.fillStyle = "#211e1b"; ctx.fillRect(-24, -36.5, 48, 5);                             // brake beam

    // --- centre window: dark interior, spring nest, bolster end, friction wedges
    ctx.fillStyle = "#0b0a09"; ctx.fillRect(-15, -54, 30, 46);
    coil(ctx, -7.1, -35.5, -9.4, 2.6, 1.3, 6);                                              // inner coils
    coil(ctx, 7.1, -35.5, -9.4, 2.6, 1.3, 6);
    coil(ctx, -7.1, -36, -9.2, 5.2, 2.5, 4);                                                // outer coils
    coil(ctx, 7.1, -36, -9.2, 5.2, 2.5, 4);
    ctx.fillStyle = lin(ctx, 0, -36.5, 0, -30, [0, "rgba(0,0,0,.7)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(-15, -36.5, 30, 7);
    ctx.fillStyle = lin(ctx, 0, -53, 0, -36, [0, "#8b857b", 0.18, "#6f6a62", 0.7, "#4b4741", 1, "#2e2b28"]);
    rr(ctx, -13.6, -52.6, 27.2, 16.4, 1.6); ctx.fill();                                     // bolster end
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = "rgba(255,250,240,.3)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-12.4, -51.9); ctx.lineTo(12.4, -51.9); ctx.stroke();
    circ(ctx, 0, -44.6, 3.1); ctx.fillStyle = "#12100e"; ctx.fill();
    ctx.strokeStyle = "rgba(255,250,240,.28)"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(0, -44.4, 3.1, 0.3, 2.8); ctx.stroke();
    for (const s of [-1, 1]) {                                                              // friction wedges
      ctx.beginPath(); ctx.moveTo(s * 14, -52.6); ctx.lineTo(s * 8.6, -52.6); ctx.lineTo(s * 14, -40.5); ctx.closePath();
      ctx.fillStyle = "#9a9388"; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 0.5; ctx.stroke();
    }

    // --- the casting
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4 * k; ctx.shadowOffsetX = 1 * k; ctx.shadowOffsetY = 2.2 * k;
    frame(); ctx.fillStyle = "#3b3733"; ctx.fill("evenodd");
    ctx.restore();
    ctx.save(); frame(); ctx.clip("evenodd");
    ctx.fillStyle = lin(ctx, 0, -62, 0, -4, [0, "#6a645d", 0.2, "#4d4843", 0.6, "#3a3632", 1, "#262321"]);
    ctx.fillRect(-84, -64, 168, 62);
    ctx.fillStyle = lin(ctx, -82, 0, 82, 0, [0, "rgba(255,246,232,.09)", 0.5, "rgba(0,0,0,0)", 1, "rgba(0,0,0,.2)"]);
    ctx.fillRect(-84, -64, 168, 62);
    // raised flange around every edge, recessed web between
    ctx.lineJoin = "round";
    frame(); ctx.strokeStyle = "rgba(255,244,226,.13)"; ctx.lineWidth = 6.4; ctx.stroke();
    ctx.save(); ctx.translate(0.75, 0.85); frame(); ctx.strokeStyle = "rgba(255,248,236,.5)"; ctx.lineWidth = 0.9; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(-0.75, -0.85); frame(); ctx.strokeStyle = "rgba(0,0,0,.62)"; ctx.lineWidth = 1.1; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(3.6, 3.9); frame(); ctx.strokeStyle = "rgba(0,0,0,.26)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(-3.4, -3.6); frame(); ctx.strokeStyle = "rgba(255,246,232,.1)"; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
    // shade from the deck above, grime, rust and brake dust
    ctx.fillStyle = lin(ctx, 0, -63, 0, -47, [0, "rgba(0,0,0,.58)", 0.5, "rgba(0,0,0,.26)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(-84, -64, 168, 18);
    for (let i = 0; i < 9; i++) {
      const gx = (R() - 0.5) * 160, gy = -58 + R() * 52, gr = 6 + R() * 16, rust = R() > 0.45;
      ctx.fillStyle = rad(ctx, gx, gy, 0, gr, [0, rust ? "rgba(118,62,28,.3)" : "rgba(0,0,0,.34)", 1, "rgba(0,0,0,0)"]);
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    for (const s of [-1, 1]) {
      ctx.fillStyle = rad(ctx, s * A, -40, 0, 20, [0, "rgba(0,0,0,.5)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(s * A - 20, -60, 40, 40);
      ctx.fillStyle = rad(ctx, s * 38, -14, 0, 22, [0, "rgba(96,70,52,.3)", 1, "rgba(96,70,52,0)"]); ctx.fillRect(s * 38 - 22, -36, 44, 44);
    }
    if (detail) {
      // cast-in foundry marks on the top chord
      ctx.font = "700 3.3px Inter, Arial, sans-serif"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(0,0,0,.5)"; spaced(ctx, "CASNUB 22HS", -13.1, -56.05, 0.35);
      ctx.fillStyle = "rgba(255,246,232,.34)"; spaced(ctx, "CASNUB 22HS", -13.4, -56.4, 0.35);
      ctx.globalAlpha = 0.07; ctx.fillStyle = grain(ctx); ctx.fillRect(-84, -64, 168, 62); ctx.globalAlpha = 1;
    }
    ctx.restore();
    frame(); ctx.strokeStyle = "rgba(0,0,0,.72)"; ctx.lineWidth = 0.8; ctx.lineJoin = "round"; ctx.stroke();

    // --- pedestal hardware: elastomeric pad, bearing adapter, retainer bolts
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#0e0d0c"; ctx.fillRect(s * A - 10.6, -45.8, 21.2, 1.5);
      ctx.fillStyle = lin(ctx, 0, -44.4, 0, -39.6, [0, "#b0aaa0", 0.4, "#807a71", 1, "#45413c"]);
      ctx.beginPath(); ctx.moveTo(s * A - 10.4, -44.4); ctx.lineTo(s * A + 10.4, -44.4); ctx.lineTo(s * A + 10.4, -41.4); ctx.lineTo(s * A + 7.6, -39.4); ctx.lineTo(s * A - 7.6, -39.4); ctx.lineTo(s * A - 10.4, -41.4); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.stroke();
      for (const bx of [s * A - 13.2, s * A + 14.2]) {
        circ(ctx, bx, -31.4, 1.5); ctx.fillStyle = "#8f897f"; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.5; ctx.stroke();
        circ(ctx, bx - 0.4, -31.8, 0.5); ctx.fillStyle = "rgba(255,250,240,.6)"; ctx.fill();
      }
    }
    // spring seat lip
    ctx.fillStyle = lin(ctx, 0, -9.6, 0, -7.4, [0, "#77716a", 1, "#3a3632"]); ctx.fillRect(-15.4, -9.6, 30.8, 2);
  }

  // ------------------------------------------------------------------ flatcar body
  // Centre-buffer coupler, drawn for the +x end (mirror for the other). A flared striker
  // casting on the headstock, the shank, then the cast head with its knuckle; two air hoses
  // (brake pipe and feed pipe) hang beneath and meet the next vehicle's at the coupling plane.
  // `half` is the headstock face, `reach` how far beyond it the couplers meet.
  function coupler(ctx, half = GEO.HALF, reach = 81) {
    const cy = -70, h = half - 399, d = half + reach - 480;       // offsets from the original flatcar drawing
    const edge = () => { ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.8; ctx.lineJoin = "round"; ctx.stroke(); };

    // air hoses first, so the coupler hangs in front of them
    const hose = (x0, y0, x1, y1, drop) => {
      const sag = Math.min(-5, Math.max(y0, y1) + drop + (x1 - x0) * 0.1);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0c0c0c"; ctx.lineWidth = 4.4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + 1, sag - 4, x1 - (x1 - x0) * 0.42, sag + 2, x1, y1); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(x0 - 1.3, y0 + 2); ctx.bezierCurveTo(x0 - 0.4, sag - 5.5, x1 - (x1 - x0) * 0.42 - 1, sag, x1 - 1.6, y1 - 1.3); ctx.stroke();
      ctx.fillStyle = lin(ctx, 0, y0 - 3, 0, y0 + 4, [0, "#8a8680", 1, "#34322f"]); rr(ctx, x0 - 3.2, y0 - 2, 6.4, 5, 1); ctx.fill();   // ferrule
      ctx.fillStyle = lin(ctx, 0, y1 - 4, 0, y1 + 4, [0, "#9a958d", 0.5, "#57534d", 1, "#262422"]);                                  // coupling head
      ctx.beginPath(); ctx.moveTo(x1 - 6.5, y1 - 3.4); ctx.lineTo(x1 + 0.6, y1 - 4.2); ctx.lineTo(x1 + 0.6, y1 + 3.6); ctx.lineTo(x1 - 4.5, y1 + 3.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.stroke();
    };
    const cock = (x) => {                                         // angle cock with its handle
      ctx.fillStyle = lin(ctx, 0, -60, 0, -51, [0, "#6c6862", 1, "#262422"]); rr(ctx, x - 4, -60, 8, 8, 1.6); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.strokeStyle = "#8c8780"; ctx.lineWidth = 1.3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, -58); ctx.lineTo(x + 5.5, -62.5); ctx.stroke();
    };
    const px = 480 + d;                                           // coupling plane
    cock(392 + h); hose(392 + h, -52, px, -24, 14);               // feed pipe, hanging lower
    cock(405 + h); hose(405 + h, -52, px, -34, 8);               // brake pipe

    // striker casting: the flared pocket the shank works in
    ctx.beginPath();
    ctx.moveTo(396 + h, -89); ctx.lineTo(408 + h, -87); ctx.lineTo(416 + h, -80.5); ctx.lineTo(416 + h, -59.5); ctx.lineTo(408 + h, -53); ctx.lineTo(396 + h, -51); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -89, 0, -51, [0, "#77726b", 0.16, "#514d48", 0.6, "#34312e", 1, "#191817"]); ctx.fill(); edge();
    ctx.strokeStyle = "rgba(255,248,236,.34)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(396.6 + h, -88.2); ctx.lineTo(408 + h, -86.2); ctx.lineTo(415.3 + h, -80.2); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.55)"; rr(ctx, 409 + h, cy - 8.5, 7, 17, 1.5); ctx.fill();                       // mouth of the pocket
    for (const by of [-84, -56.5]) { circ(ctx, 402 + h, by, 1.5); ctx.fillStyle = "#8d8880"; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.5; ctx.stroke(); }

    // shank
    const s0 = 412 + h, s1 = 458 + d;
    if (s1 > s0) {
      ctx.fillStyle = lin(ctx, 0, cy - 6.5, 0, cy + 6.5, [0, "#3d3a36", 0.22, "#8f8a82", 0.45, "#5d5953", 0.8, "#2b2927", 1, "#131211"]);
      ctx.fillRect(s0, cy - 6.5, s1 - s0, 13);
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(s0, cy - 6.5, 3, 13);
      if (s1 - s0 > 22) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(s0 + 15, cy - 6.5, 1.2, 13); ctx.fillStyle = "rgba(255,248,236,.2)"; ctx.fillRect(s0 + 16.2, cy - 6.5, 0.8, 13); }
    }
    // head: swells out of the shank into the horn above and the guard arm ahead
    ctx.beginPath();
    ctx.moveTo(452 + d, -76.5);
    ctx.bezierCurveTo(458 + d, -79, 459 + d, -86, 466 + d, -87);
    ctx.lineTo(475 + d, -87);
    ctx.bezierCurveTo(480 + d, -87, 483.5 + d, -84, 483.5 + d, -79);
    ctx.lineTo(483.5 + d, -64);
    ctx.bezierCurveTo(483.5 + d, -58, 480 + d, -54.5, 474 + d, -54.5);
    ctx.lineTo(466 + d, -54.5);
    ctx.bezierCurveTo(459 + d, -55, 458 + d, -61, 452 + d, -63.5);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -87, 0, -54, [0, "#817c74", 0.14, "#5a5650", 0.55, "#3a3734", 1, "#161514"]); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = rad(ctx, 474 + d, -62, 0, 20, [0, "rgba(104,58,26,.34)", 1, "rgba(104,58,26,0)"]); ctx.fillRect(452 + d, -88, 34, 36);   // rust in the casting
    ctx.restore(); edge();
    ctx.strokeStyle = "rgba(255,248,236,.4)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(458 + d, -80); ctx.bezierCurveTo(460 + d, -85.4, 463 + d, -86.3, 466 + d, -86.3); ctx.lineTo(475 + d, -86.3); ctx.stroke();
    // knuckle: the worn, brighter jaw that locks into its neighbour
    ctx.beginPath();
    ctx.moveTo(471 + d, -81); ctx.lineTo(480 + d, -81); ctx.bezierCurveTo(486 + d, -80, 486.5 + d, -71, 482 + d, -68.5); ctx.lineTo(476 + d, -68.5); ctx.bezierCurveTo(478.5 + d, -72, 477 + d, -76.5, 471 + d, -76.5); ctx.closePath();
    ctx.fillStyle = lin(ctx, 470 + d, -81, 486 + d, -68, [0, "#b3aea5", 0.5, "#807b73", 1, "#3c3936"]); ctx.fill(); edge();
    ctx.fillStyle = "rgba(0,0,0,.6)"; rr(ctx, 470 + d, -67, 10, 7.5, 2); ctx.fill();                              // throat
    circ(ctx, 471.5 + d, -87.5, 2.6); ctx.fillStyle = rad(ctx, 470.8 + d, -88.3, 0.3, 3, [0, "#c9c4bb", 1, "#4a4743"]); ctx.fill(); edge();   // knuckle pin
    ctx.fillStyle = "#4a4743"; rr(ctx, 461 + d, -91, 5, 5, 1); ctx.fill(); edge();                                // lock lifter

    // uncoupling lever
    ctx.strokeStyle = "#1c1b1a"; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(400 + h, -90.5); ctx.lineTo(456 + d, -92.5); ctx.lineTo(463.5 + d, -90); ctx.stroke();
    ctx.fillStyle = "#3a3734"; rr(ctx, 397 + h, -93, 5, 5, 1); ctx.fill();                                        // lever bracket
  }

  function body(ctx, o = {}) {
    const { id = "", loaded = true, detail = true } = o;
    const { DECK: T, SILL: S, BELLY: D, HALF: H } = GEO;
    const sill = () => {
      ctx.beginPath();
      ctx.moveTo(-H, T); ctx.lineTo(H, T); ctx.lineTo(H, S);
      ctx.lineTo(203, S); ctx.lineTo(139, D); ctx.lineTo(-139, D); ctx.lineTo(-203, S); ctx.lineTo(-H, S);
      ctx.closePath();
    };
    const under = (x) => { const a = Math.abs(x); return a <= 139 ? D : a >= 203 ? S : D + ((a - 139) / 64) * (S - D); };

    // underframe gear, tucked behind the sill
    ctx.fillStyle = lin(ctx, 0, D, 0, D + 18, [0, "#3c3c3c", 0.3, "#8a8a8a", 0.55, "#5d5d5d", 1, "#262626"]);
    rr(ctx, 26, D + 1, 74, 17, 8.5); ctx.fill();                                  // air reservoir
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(40, D + 1, 2.4, 17); ctx.fillRect(84, D + 1, 2.4, 17);
    ctx.fillStyle = lin(ctx, 0, D, 0, D + 13, [0, "#474747", 0.35, "#7c7c7c", 1, "#2a2a2a"]);
    rr(ctx, -104, D + 1, 50, 12, 3); ctx.fill();                                  // brake cylinder
    ctx.fillStyle = "#5a5a5a"; ctx.fillRect(-135, D + 5.5, 32, 2.6);              // push rod
    ctx.fillStyle = "#4a4a4a"; rr(ctx, -34, D + 1, 26, 15, 2); ctx.fill();        // control valve
    ctx.fillStyle = "#777"; rr(ctx, -30, D + 4, 8, 6, 1); ctx.fill();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-8, D + 8); ctx.lineTo(26, D + 8); ctx.moveTo(-54, D + 7); ctx.lineTo(-34, D + 7); ctx.stroke();

    // main sill
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 7 * pxScale(ctx); ctx.shadowOffsetY = 3.5 * pxScale(ctx);
    sill(); ctx.fillStyle = "#5c5c5c"; ctx.fill();
    ctx.restore();
    ctx.save(); sill(); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, T, 0, D, [0, "#8e8e8e", 0.1, "#787878", 0.5, "#5f5f5f", 1, "#3a3a3a"]);
    ctx.fillRect(-H, T, H * 2, D - T);
    ctx.fillStyle = lin(ctx, -H, 0, H, 0, [0, "rgba(255,255,255,.08)", 0.5, "rgba(255,255,255,0)", 1, "rgba(0,0,0,.1)"]);
    ctx.fillRect(-H, T, H * 2, D - T);
    // web stiffeners
    for (let x = -374; x <= 374; x += 44) {
      ctx.fillStyle = "rgba(0,0,0,.26)"; ctx.fillRect(x, T + 4, 1.1, under(x) - T - 7);
      ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(x - 1.1, T + 4, 1, under(x) - T - 7);
    }
    // top flange
    ctx.fillStyle = lin(ctx, 0, T, 0, T + 4.5, [0, "#cfcfcf", 0.3, "#9c9c9c", 1, "#6c6c6c"]); ctx.fillRect(-H, T, H * 2, 4.5);
    ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.fillRect(-H, T + 4.5, H * 2, 1.2);
    if (loaded) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-359, T, 718, 2.2); }
    // rivets under the flange
    if (detail) {
      for (let x = -390; x <= 390; x += 11) {
        circ(ctx, x, T + 9, 0.95); ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fill();
        circ(ctx, x - 0.3, T + 8.7, 0.6); ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fill();
      }
      // stencilled reporting marks
      ctx.fillStyle = "rgba(245,245,245,.86)"; ctx.textBaseline = "alphabetic";
      ctx.font = "700 8.6px Inter, Arial, sans-serif";
      spaced(ctx, id.slice(0, 4) + " " + id.slice(4), -120, -51.5, 0.9);
      ctx.font = "600 4.4px Inter, Arial, sans-serif"; ctx.fillStyle = "rgba(245,245,245,.72)";
      spaced(ctx, "LD LMT 68000 KG", 22, -55.5, 0.3);
      spaced(ctx, "LT WT  22800 KG", 22, -49.5, 0.3);
      spaced(ctx, "80FT IM FLAT   BLT 04-19", 78, -55.5, 0.3);
      spaced(ctx, "2×40 / 45 / 53", 78, -49.5, 0.3);
      // grime thrown up over the bogies and dust along the belly
      for (const bx of [-GEO.BOGIE, GEO.BOGIE]) {
        ctx.fillStyle = rad(ctx, bx, S + 2, 0, 120, [0, "rgba(20,16,12,.3)", 1, "rgba(20,16,12,0)"]);
        ctx.save(); ctx.translate(bx, S + 2); ctx.scale(1, 0.22); ctx.translate(-bx, -(S + 2)); ctx.fillRect(bx - 120, S - 120, 240, 240); ctx.restore();
      }
      ctx.globalAlpha = 0.045; ctx.fillStyle = grain(ctx); ctx.fillRect(-H, T, H * 2, D - T); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // bottom flange following the fishbelly
    ctx.strokeStyle = "#4b4b4b"; ctx.lineWidth = 2.6; ctx.lineJoin = "round"; ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(-H, S - 1.2); ctx.lineTo(-203, S - 1.2); ctx.lineTo(-139, D - 1.2); ctx.lineTo(139, D - 1.2); ctx.lineTo(203, S - 1.2); ctx.lineTo(H, S - 1.2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-H, S - 2.6); ctx.lineTo(-203, S - 2.6); ctx.lineTo(-139, D - 2.6); ctx.lineTo(139, D - 2.6); ctx.lineTo(203, S - 2.6); ctx.lineTo(H, S - 2.6); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 0.7; sill(); ctx.stroke();

    // container pedestals with twist locks
    for (const px of [-352, -128, 128, 352]) {
      ctx.fillStyle = lin(ctx, 0, T - 3.5, 0, T + 2, [0, "#bdbdbd", 1, "#666"]);
      rr(ctx, px - 9, T - 3.2, 18, 5, 1); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // end sills, steps and grab irons
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      ctx.fillStyle = lin(ctx, 0, T - 4, 0, S + 5, [0, "#8c8c8c", 0.2, "#5e5e5e", 1, "#2c2c2c"]);
      rr(ctx, H - 12, T - 4, 13, S - T + 9, 1.2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = "#555"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(H - 30, T + 6); ctx.lineTo(H - 30, T + 11); ctx.lineTo(H - 16, T + 11); ctx.lineTo(H - 16, T + 6); ctx.stroke();
      coupler(ctx);
      ctx.restore();
    }
  }

  // Soft contact shadow a vehicle throws onto the sleepers and ballast.
  function shadow(ctx, bogie = GEO.BOGIE, half = 470) {
    const blob = (cx, cy, rx, ry, a) => {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
      ctx.fillStyle = rad(ctx, 0, 0, 0, rx, [0, `rgba(0,0,0,${a})`, 0.55, `rgba(0,0,0,${a * 0.5})`, 1, "rgba(0,0,0,0)"]);
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
    };
    blob(0, 22, half, 16, 0.3);
    blob(-bogie, 20, 170, 16, 0.46);
    blob(bogie, 20, 170, 16, 0.46);
  }

  // ------------------------------------------------------------------ open wagon (BOXNHL-type gondola)
  // Same 64 units per metre as everything else. Wide sheet bays between heavy posts, two
  // full-length ribs, a door in the second and fifth bay, a hollow coping along the top.
  const WAGON = (GEO.WAGON = { HALF: 321, TOP: -211, FLOOR: -81, SILL: -66, BOGIE: 214, REACH: 47, Z: 1.3 });
  WAGON.PITCH = 2 * (WAGON.HALF + WAGON.REACH);
  const POSTS = [-312, -192, -120, 0, 120, 192, 312];      // bay boundaries; bays 1 and 4 are doors
  const RIB_A = -170, RIB_B = -127;                         // top edges of the two side ribs

  function centred(ctx, text, cx, y, gap) {
    let w = -gap; for (const ch of text) w += ctx.measureText(ch).width + gap;
    spaced(ctx, text, cx - w / 2, y, gap);
  }

  // Everything a bogie vehicle of this length shares below the floor: centre sill and
  // air-brake gear in the shade, headstocks with their couplers, and the grey solebar.
  // Origin: vehicle centre on the rail top.
  function chassis(ctx, o = {}) {
    const { id = "", detail = true, bolts = [], marks = ["", ""] } = o;
    const { HALF: H, FLOOR: F, SILL: S } = WAGON, k = pxScale(ctx);

    // --- under the floor, in shade: centre sill, air-brake gear, hand-brake wheel
    ctx.fillStyle = lin(ctx, 0, S, 0, S + 22, [0, "#161616", 1, "#303030"]);
    ctx.fillRect(-128, S - 1, 256, 21);
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(-128, S + 19.2, 256, 0.8);
    ctx.fillStyle = lin(ctx, 0, S + 9, 0, S + 27, [0, "#3c3c3c", 0.3, "#8e8e8e", 0.55, "#5d5d5d", 1, "#232323"]);
    rr(ctx, 34, S + 9, 68, 18, 9); ctx.fill();                                              // auxiliary reservoir
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(47, S + 8, 2.6, 20); ctx.fillRect(87, S + 8, 2.6, 20);   // straps
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(46.2, S + 8, 0.8, 20); ctx.fillRect(86.2, S + 8, 0.8, 20);
    ctx.fillStyle = lin(ctx, 0, S + 10, 0, S + 24, [0, "#474747", 0.35, "#858585", 1, "#272727"]);
    rr(ctx, -104, S + 10, 48, 14, 3.2); ctx.fill(); ctx.stroke();                            // brake cylinder
    ctx.fillStyle = "#2c2c2c"; ctx.fillRect(-60, S + 9, 5, 16);
    ctx.fillStyle = lin(ctx, 0, S + 15, 0, S + 18.5, [0, "#9a9a9a", 1, "#444"]); ctx.fillRect(-126, S + 15, 23, 3.4);   // push rod
    ctx.fillStyle = lin(ctx, 0, S + 6, 0, S + 24, [0, "#6a6a6a", 1, "#2e2e2e"]);
    rr(ctx, -46, S + 7, 24, 17, 2); ctx.fill(); ctx.stroke();                                // distributor valve
    ctx.fillStyle = "#8a8a8a"; rr(ctx, -42, S + 10, 8, 6, 1); ctx.fill();
    ctx.strokeStyle = "#262626"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-124, S + 33); ctx.lineTo(124, S + 33); ctx.moveTo(-22, S + 16); ctx.lineTo(34, S + 16); ctx.moveTo(-56, S + 13); ctx.lineTo(-46, S + 13); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-124, S + 32.3); ctx.lineTo(124, S + 32.3); ctx.stroke();
    {                                                                                        // hand-brake wheel
      const wx = 6, wy = S + 21, wr = 12.5;
      ctx.fillStyle = "#3a3a3a"; ctx.fillRect(wx - 2.2, S, 4.4, 21);
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 3.6; circ(ctx, wx + 0.8, wy + 1.2, wr); ctx.stroke();
      ctx.strokeStyle = "#4b4b4b"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) { const a = -1.2 + i * 1.2566; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); ctx.stroke(); }
      ctx.strokeStyle = lin(ctx, wx - wr, wy - wr, wx + wr, wy + wr, [0, "#b9b9b9", 0.5, "#6a6a6a", 1, "#2e2e2e"]); ctx.lineWidth = 2.5;
      circ(ctx, wx, wy, wr); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(wx, wy, wr + 0.6, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
      circ(ctx, wx, wy, 3); ctx.fillStyle = rad(ctx, wx - 1, wy - 1, 0.3, 3.4, [0, "#bdbdbd", 1, "#4a4a4a"]); ctx.fill();
    }

    // --- headstocks, corner steps, couplers
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      ctx.fillStyle = lin(ctx, 0, F - 8, 0, S + 6, [0, "#8a8a8a", 0.2, "#5c5c5c", 1, "#292929"]);
      rr(ctx, H - 13, F - 8, 14, S - F + 14, 1.2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = "#3b3b3b"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(H - 27, S); ctx.lineTo(H - 27, S + 17); ctx.lineTo(H - 9, S + 17); ctx.lineTo(H - 9, S); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(H - 26.4, S + 16.2); ctx.lineTo(H - 9.6, S + 16.2); ctx.stroke();
      coupler(ctx, H, WAGON.REACH);
      ctx.restore();
    }

    // --- solebar: the grey channel the body stands on
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.62)"; ctx.shadowBlur = 7 * k; ctx.shadowOffsetY = 3.5 * k;
    ctx.fillStyle = "#555"; ctx.fillRect(-H, F, H * 2, S - F);
    ctx.restore();
    ctx.fillStyle = lin(ctx, 0, F, 0, S, [0, "#8f8f8f", 0.22, "#737373", 0.62, "#585858", 1, "#333"]);
    ctx.fillRect(-H, F, H * 2, S - F);
    ctx.fillStyle = lin(ctx, -H, 0, H, 0, [0, "rgba(255,255,255,.09)", 0.5, "rgba(255,255,255,0)", 1, "rgba(0,0,0,.12)"]);
    ctx.fillRect(-H, F, H * 2, S - F);
    ctx.fillStyle = lin(ctx, 0, F, 0, F + 3.2, [0, "#cdcdcd", 1, "#7c7c7c"]); ctx.fillRect(-H, F, H * 2, 3.2);        // top flange
    ctx.fillStyle = "rgba(0,0,0,.36)"; ctx.fillRect(-H, F, H * 2, 1.6);                                               // body sitting on it
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(-H, F + 3.2, H * 2, 1);
    ctx.fillStyle = "#484848"; ctx.fillRect(-H, S - 2.4, H * 2, 2.4);                                                 // bottom flange
    ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(-H, S - 3.1, H * 2, 0.7);
    if (detail) {
      for (const px of bolts) for (const dx of [-4.5, 4.5]) {                                                         // bolts at each post foot
        const bx = Math.max(-H + 5, Math.min(H - 5, px + dx));
        circ(ctx, bx, F + 8.4, 1.05); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fill();
        circ(ctx, bx - 0.3, F + 8.1, 0.65); ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fill();
      }
      ctx.fillStyle = "rgba(245,245,245,.86)"; ctx.textBaseline = "alphabetic";
      ctx.font = "700 6.6px Inter, Arial, sans-serif";
      spaced(ctx, id.slice(0, 4) + " " + id.slice(4), -108, F + 10.6, 0.8);
      ctx.font = "600 3.9px Inter, Arial, sans-serif"; ctx.fillStyle = "rgba(245,245,245,.7)";
      spaced(ctx, marks[0], 24, F + 8.2, 0.3);
      spaced(ctx, marks[1], 24, F + 12.6, 0.3);
      for (const bx of [-WAGON.BOGIE, WAGON.BOGIE]) {                                                                 // grime over the bogies
        ctx.fillStyle = rad(ctx, bx, S, 0, 110, [0, "rgba(20,16,12,.32)", 1, "rgba(20,16,12,0)"]);
        ctx.save(); ctx.beginPath(); ctx.rect(-H, F, H * 2, S - F); ctx.clip();
        ctx.translate(bx, S); ctx.scale(1, 0.2); ctx.fillRect(-110, -110, 220, 220); ctx.restore();
      }
      ctx.globalAlpha = 0.045; ctx.fillStyle = grain(ctx); ctx.fillRect(-H, F, H * 2, S - F); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 0.7; ctx.strokeRect(-H, F, H * 2, S - F);
  }

  // Origin: wagon centre on the rail top. Draws everything that rides on the springs
  // except the load: underframe gear, solebar, couplers and the body side.
  function wagon(ctx, o = {}) {
    const { id = "", paint = "orange", detail = true, seed = 1 } = o;
    const { HALF: H, TOP: T, FLOOR: F, SILL: S } = WAGON;
    const P = PAINTS[paint], sh = P.sh, R = rng(seed * 4099 + 5), k = pxScale(ctx);
    const SH = (a) => `rgba(${P.shd},${Math.min(1, a * sh).toFixed(3)})`;
    const LT = (a) => `rgba(${P.lit},${Math.min(1, a * sh).toFixed(3)})`;
    const SP = (a) => `rgba(${P.spec},${Math.min(1, a * sh).toFixed(3)})`;
    const SOOT = "18,14,10", RUST = "112,46,14";

    chassis(ctx, { id, detail, bolts: POSTS, marks: ["BOXNHL   CC 71.0 T   TARE 20.6 T", "AIR BRAKE   BLT 04-19   POH 06-27"] });

    // --- body side
    ctx.save();
    rr(ctx, -H, T, H * 2, F - T, 1.2); ctx.clip();
    ctx.fillStyle = P.base; ctx.fillRect(-H, T, H * 2, F - T);

    // livery first, so the relief shading falls across it
    if (P.print && detail) {
      ctx.save(); ctx.globalAlpha = 0.95; ctx.textBaseline = "alphabetic";
      sbbMark(ctx, -H + 21, T + 16.5, 17, P.print, P.base);
      ctx.fillStyle = P.print;
      ctx.font = "700 15px Inter, Arial, sans-serif";
      centred(ctx, id.slice(0, 4), 252, T + 30.6, 2.2);
      centred(ctx, id.slice(4), 252, RIB_A + 31.5, 2.2);
      ctx.font = "700 12.6px Inter, Arial, sans-serif";
      centred(ctx, "BOXNHL", 252, RIB_B + 28.5, 1.9);
      ctx.font = "600 7.2px Inter, Arial, sans-serif";
      spaced(ctx, "CC  71.0 t", -H + 22, F - 20, 0.9);
      spaced(ctx, "TARE  20.6 t", -H + 22, F - 10, 0.9);
      ctx.fillStyle = "rgba(236,190,36,.92)"; ctx.fillRect(-106, RIB_A + 15, 27, 16);                                 // return-date plate
      ctx.fillStyle = "rgba(20,18,14,.88)"; ctx.font = "700 3.6px Inter, Arial, sans-serif";
      spaced(ctx, "RETURN", -103.4, RIB_A + 21.2, 0.3); spaced(ctx, "06 · 27", -103.4, RIB_A + 27.4, 0.4);
      ctx.restore();
    }

    // sheet bays: thin plate bowing between its supports, so each bay shades a little differently
    const zones = [[T + 10, RIB_A], [RIB_A + 8, RIB_B], [RIB_B + 8, F]];
    for (let b = 0; b < 6; b++) {
      const x0 = POSTS[b], x1 = POSTS[b + 1];
      for (const [ya, yb] of zones) {
        const amp = 0.07 + R() * 0.08;
        ctx.fillStyle = lin(ctx, x0, ya, x1, yb, [0, LT(amp * 1.5), 0.42, LT(0), 0.62, SH(0), 1, SH(amp * 1.25)]);
        ctx.fillRect(x0, ya, x1 - x0, yb - ya);
        for (let r = 0; r < 2; r++) {                                  // faint ripple in the plate
          const rx = x0 + 10 + R() * (x1 - x0 - 44), rw = 16 + R() * 20;
          ctx.fillStyle = lin(ctx, rx, 0, rx + rw, 0, [0, SH(0), 0.3, LT(0.06), 0.62, SH(0.05), 1, SH(0)]);
          ctx.fillRect(rx, ya, rw, yb - ya);
        }
      }
      const vary = (R() - 0.5) * 0.05;
      ctx.fillStyle = vary > 0 ? LT(vary) : SH(-vary); ctx.fillRect(x0, T + 10, x1 - x0, F - T - 10);
    }
    // sky from above, ground bounce from below, and the far end falling away from the light
    ctx.fillStyle = lin(ctx, 0, T, 0, F, [0, LT(0.2), 0.3, LT(0.04), 0.6, SH(0.02), 0.9, SH(0.24), 1, SH(0.16)]);
    ctx.fillRect(-H, T, H * 2, F - T);
    ctx.fillStyle = lin(ctx, -H, 0, H, 0, [0, LT(0.05), 0.5, LT(0), 1, SH(0.1)]);
    ctx.fillRect(-H, T, H * 2, F - T);

    const RIB = 8;
    const hrib = (xa, xb, y) => {                                      // raised horizontal member, 8 deep
      ctx.fillStyle = SH(0.16); ctx.fillRect(xa, y - 1.6, xb - xa, 1.6);
      ctx.fillStyle = lin(ctx, 0, y, 0, y + 1.8, [0, SP(0.62), 1, LT(0.4)]); ctx.fillRect(xa, y, xb - xa, 1.8);          // upper chamfer, to the sky
      ctx.fillStyle = lin(ctx, 0, y + 1.8, 0, y + 6, [0, LT(0.3), 1, LT(0.08)]); ctx.fillRect(xa, y + 1.8, xb - xa, 4.2);   // face
      ctx.fillStyle = lin(ctx, 0, y + 6, 0, y + RIB, [0, SH(0.5), 1, SH(0.86)]); ctx.fillRect(xa, y + 6, xb - xa, 2);       // lower chamfer, in shade
      ctx.fillStyle = lin(ctx, 0, y + RIB, 0, y + RIB + 11, [0, SH(0.58), 0.35, SH(0.26), 1, SH(0)]); ctx.fillRect(xa, y + RIB, xb - xa, 11);
    };
    const post = (x, ya, yb, w = 11) => {                              // raised vertical member, lit from the left
      const l = x - w / 2, r = x + w / 2;
      ctx.fillStyle = lin(ctx, r, 0, r + 15, 0, [0, SH(0.6), 0.35, SH(0.28), 1, SH(0)]); ctx.fillRect(r, ya, 15, yb - ya);  // cast shadow
      ctx.fillStyle = SH(0.2); ctx.fillRect(l - 1.8, ya, 1.8, yb - ya);
      ctx.fillStyle = lin(ctx, l, 0, l + 2.2, 0, [0, SP(0.58), 1, LT(0.42)]); ctx.fillRect(l, ya, 2.2, yb - ya);            // chamfer facing the light
      ctx.fillStyle = lin(ctx, l + 2.2, 0, r - 2.4, 0, [0, LT(0.3), 1, LT(0.1)]); ctx.fillRect(l + 2.2, ya, w - 4.6, yb - ya);   // face
      ctx.fillStyle = lin(ctx, r - 2.4, 0, r, 0, [0, SH(0.5), 1, SH(0.88)]); ctx.fillRect(r - 2.4, ya, 2.4, yb - ya);       // chamfer in shade
    };
    const door = (x0, x1) => {
      const xa = x0 + 12, xb = x1 - 12, ya = RIB_A + 13, yb = F - 2.5;
      ctx.fillStyle = SH(0.62); ctx.fillRect(xa - 1.1, ya - 1.1, xb - xa + 2.2, yb - ya + 2.2);                        // gap round the leaf
      ctx.fillStyle = P.base; ctx.fillRect(xa, ya, xb - xa, yb - ya);
      ctx.fillStyle = lin(ctx, xa, ya, xb, yb, [0, LT(0.2), 0.5, LT(0.04), 1, SH(0.14)]); ctx.fillRect(xa, ya, xb - xa, yb - ya);
      ctx.fillStyle = SP(0.55); ctx.fillRect(xa, ya, xb - xa, 0.9); ctx.fillRect(xa, ya, 0.9, yb - ya);
      ctx.fillStyle = SH(0.6); ctx.fillRect(xb - 0.9, ya, 0.9, yb - ya); ctx.fillRect(xa, yb - 0.9, xb - xa, 0.9);
      ctx.fillStyle = lin(ctx, xb + 1.1, 0, xb + 6, 0, [0, SH(0.34), 1, SH(0)]); ctx.fillRect(xb + 1.1, ya, 5, yb - ya);
      hrib(xa + 1, xb - 1, RIB_B + 2);
      for (const hx of [xa + 9, (xa + xb) / 2, xb - 9]) {                                                             // strap hinges
        ctx.fillStyle = SH(0.34); rr(ctx, hx - 3.4, ya - 7.5, 8, 14.5, 1.2); ctx.fill();
        ctx.fillStyle = P.base; rr(ctx, hx - 3.6, ya - 8, 7.2, 14, 1.2); ctx.fill();
        ctx.fillStyle = lin(ctx, hx - 3.6, 0, hx + 3.6, 0, [0, LT(0.34), 0.5, LT(0.1), 1, SH(0.3)]); rr(ctx, hx - 3.6, ya - 8, 7.2, 14, 1.2); ctx.fill();
        circ(ctx, hx, ya - 1, 1.5); ctx.fillStyle = SH(0.6); ctx.fill();
        circ(ctx, hx - 0.35, ya - 1.35, 0.8); ctx.fillStyle = SP(0.7); ctx.fill();
      }
      for (const lx of [xa + (xb - xa) * 0.3, xa + (xb - xa) * 0.7]) {                                                // locking rods
        ctx.fillStyle = lin(ctx, lx + 1.2, 0, lx + 5, 0, [0, SH(0.42), 1, SH(0)]); ctx.fillRect(lx + 1.2, ya + 7, 3.8, yb - ya - 12);
        ctx.fillStyle = P.base; ctx.fillRect(lx - 1.2, ya + 7, 2.4, yb - ya - 12);
        ctx.fillStyle = lin(ctx, lx - 1.2, 0, lx + 1.2, 0, [0, SP(0.7), 0.45, LT(0.16), 1, SH(0.62)]); ctx.fillRect(lx - 1.2, ya + 7, 2.4, yb - ya - 12);
        for (const ky of [ya + 12, RIB_B + 19, yb - 9]) {                                                             // keepers
          ctx.fillStyle = SH(0.36); rr(ctx, lx - 3.9, ky - 2.2, 8.6, 5.6, 1); ctx.fill();
          ctx.fillStyle = P.base; rr(ctx, lx - 4.2, ky - 2.7, 8.4, 5.4, 1); ctx.fill();
          ctx.fillStyle = lin(ctx, 0, ky - 2.7, 0, ky + 2.7, [0, LT(0.36), 0.45, LT(0.08), 1, SH(0.36)]); rr(ctx, lx - 4.2, ky - 2.7, 8.4, 5.4, 1); ctx.fill();
        }
        ctx.strokeStyle = SH(0.9); ctx.lineWidth = 1.7; ctx.lineCap = "round"; ctx.lineJoin = "round";              // handle
        ctx.beginPath(); ctx.moveTo(lx, yb - 20); ctx.lineTo(lx + 6.5, yb - 17.5); ctx.lineTo(lx + 6.5, yb - 12.5); ctx.stroke();
        ctx.strokeStyle = SP(0.5); ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(lx + 0.4, yb - 20.6); ctx.lineTo(lx + 6.2, yb - 18.3); ctx.stroke();
      }
    };

    for (let b = 0; b < 6; b++) {
      const x0 = POSTS[b], x1 = POSTS[b + 1], isDoor = b === 1 || b === 4;
      hrib(x0, x1, RIB_A);
      if (isDoor) door(x0, x1); else hrib(x0, x1, RIB_B);
    }
    // weld toe along the solebar, then the uprights over everything
    ctx.fillStyle = SH(0.6); ctx.fillRect(-H, F - 1, H * 2, 1);
    for (const px of POSTS.slice(1, -1)) post(px, T + 9, F);
    // corner posts: the near one catches the light, the far one turns away
    ctx.fillStyle = lin(ctx, -H, 0, -H + 12, 0, [0, SP(0.5), 0.2, LT(0.3), 0.75, LT(0.08), 1, SH(0.5)]); ctx.fillRect(-H, T + 9, 12, F - T - 9);
    ctx.fillStyle = SH(0.85); ctx.fillRect(-H + 11, T + 9, 1.2, F - T - 9);
    ctx.fillStyle = lin(ctx, -H + 12, 0, -H + 26, 0, [0, SH(0.5), 0.4, SH(0.2), 1, SH(0)]); ctx.fillRect(-H + 12.2, T + 9, 14, F - T - 9);
    ctx.fillStyle = SH(0.2); ctx.fillRect(H - 13.8, T + 9, 1.8, F - T - 9);
    ctx.fillStyle = lin(ctx, H - 12, 0, H, 0, [0, SP(0.5), 0.18, LT(0.24), 0.6, SH(0.12), 1, SH(0.62)]); ctx.fillRect(H - 12, T + 9, 12, F - T - 9);
    // coping: a hollow section along the top edge, and the shadow it throws
    ctx.fillStyle = P.base; ctx.fillRect(-H, T, H * 2, 10);
    ctx.fillStyle = lin(ctx, 0, T, 0, T + 10, [0, LT(0.44), 0.16, LT(0.16), 0.58, SH(0.08), 1, SH(0.5)]); ctx.fillRect(-H, T, H * 2, 10);
    ctx.fillStyle = SP(0.8); ctx.fillRect(-H, T, H * 2, 0.9);
    ctx.fillStyle = SH(0.85); ctx.fillRect(-H, T + 9.1, H * 2, 0.9);
    ctx.fillStyle = lin(ctx, 0, T + 10, 0, T + 22, [0, SH(0.62), 0.4, SH(0.26), 1, SH(0)]); ctx.fillRect(-H, T + 10, H * 2, 12);

    if (detail && paint !== "ghost") {
      // --- wear: this wagon carries coal, so most of the dirt is soot working down from the top
      ctx.fillStyle = lin(ctx, 0, T + 10, 0, T + 34, [0, `rgba(${SOOT},.2)`, 1, `rgba(${SOOT},0)`]); ctx.fillRect(-H, T + 10, H * 2, 24);
      for (let i = 0; i < 40; i++) {
        const sx = -H + 10 + R() * (H * 2 - 20), len = 14 + R() * R() * 100, sw = 0.7 + R() * 2.8;
        ctx.fillStyle = lin(ctx, 0, T + 10, 0, T + 10 + len, [0, `rgba(${SOOT},${(0.07 + R() * 0.13).toFixed(3)})`, 1, `rgba(${SOOT},0)`]);
        ctx.fillRect(sx, T + 10, sw, len);
      }
      for (const ry of [RIB_A, RIB_B]) {
        for (let i = 0; i < 26; i++) {                                 // dust lying on the ribs and washing off below them
          const sx = -H + 10 + R() * (H * 2 - 40), sl = 5 + R() * 24;
          ctx.fillStyle = `rgba(${SOOT},${(0.12 + R() * 0.2).toFixed(3)})`; ctx.fillRect(sx, ry, sl, 1.5);
          if (R() < 0.5) {
            const len = 8 + R() * 26;
            ctx.fillStyle = lin(ctx, 0, ry + RIB, 0, ry + RIB + len, [0, `rgba(${SOOT},.12)`, 1, `rgba(${SOOT},0)`]);
            ctx.fillRect(sx + R() * sl, ry + RIB, 0.8 + R() * 2, len);
          }
        }
      }
      for (let i = 0; i < 6; i++) {                                    // broad tonal drift
        const mx = -H + R() * H * 2, my = T + R() * (F - T), mr = 70 + R() * 150;
        ctx.fillStyle = rad(ctx, mx, my, 0, mr, [0, R() > 0.5 ? SH(0.07) : LT(0.05), 1, "rgba(0,0,0,0)"]);
        ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
      for (let i = 0; i < 7; i++) {                                    // dents from loaders: a lit lip over a shaded hollow
        const dx = -H + 30 + R() * (H * 2 - 60), dy = T + 30 + R() * (F - T - 50), dr = 6 + R() * 11;
        ctx.fillStyle = rad(ctx, dx - dr * 0.25, dy - dr * 0.3, 0, dr, [0, LT(0.1), 1, "rgba(0,0,0,0)"]); ctx.fillRect(dx - dr * 2, dy - dr * 2, dr * 4, dr * 4);
        ctx.fillStyle = rad(ctx, dx + dr * 0.3, dy + dr * 0.35, 0, dr, [0, SH(0.1), 1, "rgba(0,0,0,0)"]); ctx.fillRect(dx - dr * 2, dy - dr * 2, dr * 4, dr * 4);
      }
      for (let i = 0; i < 10; i++) {                                   // rust at the floor weld and post feet
        const rx = R() < 0.5 ? POSTS[1 + ((R() * 5) | 0)] + (R() - 0.5) * 12 : -H + 8 + R() * (H * 2 - 16), rw = 2.5 + R() * 7;
        ctx.fillStyle = rad(ctx, rx, F, 0, rw, [0, `rgba(${RUST},.5)`, 0.5, `rgba(${RUST},.2)`, 1, `rgba(${RUST},0)`]);
        ctx.save(); ctx.translate(rx, F); ctx.scale(1, 0.7); ctx.fillRect(-rw, -rw, rw * 2, rw * 2); ctx.restore();
      }
      for (let i = 0; i < 60; i++) {                                   // paint chips on the coping and corner posts
        const top = R() < 0.65, cx = top ? -H + R() * H * 2 : (R() < 0.5 ? -H + R() * 9 : H - R() * 9), cy = top ? T + R() * 10 : T + R() * (F - T);
        ctx.fillStyle = `rgba(${R() < 0.5 ? RUST : "40,20,10"},${(0.25 + R() * 0.4).toFixed(2)})`;
        ctx.fillRect(cx, cy, 0.5 + R() * 1.5, 0.4 + R() * 0.9);
      }
      ctx.lineCap = "round";
      for (let i = 0; i < 9; i++) {                                    // scrapes
        const sx = -H + 16 + R() * (H * 2 - 70), sy = T + 44 + R() * (F - T - 60), len = 5 + R() * 22, light = R() > 0.45;
        ctx.strokeStyle = light ? SP(0.1 + R() * 0.12) : SH(0.12 + R() * 0.14); ctx.lineWidth = 0.4 + R() * 0.8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + len, sy + (R() - 0.5) * 3.5); ctx.stroke();
      }
      for (const bx of [-WAGON.BOGIE, WAGON.BOGIE]) {                  // dust thrown up by the wheels
        ctx.fillStyle = rad(ctx, 0, 0, 0, 130, [0, `rgba(${P.dust},.2)`, 1, `rgba(${P.dust},0)`]);
        ctx.save(); ctx.translate(bx, F + 4); ctx.scale(1, 0.42); ctx.fillRect(-130, -130, 260, 130); ctx.restore();
      }
      if (k >= 0.8) { ctx.globalAlpha = 0.03; ctx.fillStyle = grain(ctx); ctx.fillRect(-H, T, H * 2, F - T); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    ctx.strokeStyle = paint === "ghost" ? "rgba(0,0,0,.05)" : `rgba(${P.shd},.55)`; ctx.lineWidth = 0.7;
    rr(ctx, -H + 0.35, T + 0.35, H * 2 - 0.7, F - T - 0.7, 1.2); ctx.stroke();

    // --- corner grab irons
    for (const s of [-1, 1]) {
      const gx = s * (H - 4.5);
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(gx + 1.4, -151); ctx.lineTo(gx + 1.4, -109); ctx.stroke();
      ctx.strokeStyle = lin(ctx, gx - 1, 0, gx + 1, 0, [0, "#d2d2d2", 1, "#6c6c6c"]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(gx, -152); ctx.lineTo(gx, -110); ctx.stroke();
      ctx.fillStyle = "#555"; ctx.fillRect(gx - 1.6, -153.5, 3.2, 2.2); ctx.fillRect(gx - 1.6, -110.6, 3.2, 2.2);
    }
  }

  // The coal load: a few broad mounds under an angle-of-repose envelope, built up from
  // individual lumps so the outline and surface both read as broken coal.
  function heap(ctx, o = {}) {
    const { seed = 1, detail = true, rise = 1 } = o;                  // rise: how tall the pile stands, 1 being a level load
    const { HALF: H, TOP: T } = WAGON, R = rng(seed * 977 + 3);
    const x0 = -H + 13, x1 = H - 13, L = x1 - x0;
    const mounds = [-0.56, 0.02, 0.57].map((c) => ({ c: c + (R() - 0.5) * 0.16, a: 9 + R() * 9, w: 0.24 + R() * 0.08 }));
    const height = (x) => {
      const u = (x - x0) / L, env = Math.max(0, Math.min(1, Math.min(u, 1 - u) * L / 36));
      let h = 12;
      for (const m of mounds) { const d = (u * 2 - 1 - m.c) / m.w; h += m.a * Math.exp(-d * d); }
      return h * env * (0.55 + 0.45 * env) * rise;
    };
    const slope = (x) => (height(x + 3) - height(x - 3)) / 6;
    const lump = (x, y, s, a0) => {
      ctx.beginPath();
      for (let v = 0; v < 5; v++) { const a = a0 + v * 1.2566, r = s * (0.62 + ((v * 53 + 17) % 7) * 0.065); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.82); }
      ctx.closePath();
    };

    ctx.beginPath(); ctx.moveTo(x0, T + 4);
    for (let x = x0; x <= x1; x += 2) ctx.lineTo(x, T - height(x));
    ctx.lineTo(x1, T + 4); ctx.closePath();
    if (o.outline) {                                   // just the shape, dashed: a load that is not there
      ctx.fillStyle = "rgba(255,255,255,.34)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.96)"; ctx.lineWidth = 1.7; ctx.lineJoin = "round"; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    ctx.fillStyle = lin(ctx, 0, T - 42, 0, T + 4, [0, "#2a2b30", 0.6, "#151518", 1, "#08080a"]); ctx.fill();

    const n = detail ? 2600 : 380, pile = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * L, h = height(x);
      pile.push([x, T + 3 - Math.pow(R(), 0.85) * (h + 2.5), (detail ? 1 : 1.9) * (0.9 + R() * R() * 3.4), R() * 6.283, R(), R(), R()]);
    }
    for (let x = x0 + 2; x < x1 - 2; x += detail ? 1.7 : 4) {           // lumps along the skyline
      const s = (detail ? 1 : 1.8) * (0.9 + R() * 2.3);
      pile.push([x + R(), T - height(x) + s * (0.15 + R() * 0.5), s, R() * 6.283, R(), R(), R()]);
    }
    pile.sort((a, b) => a[1] - b[1]);
    for (const [x, y, s, a0, r1, r2, r3] of pile) {
      const lit = Math.max(0.12, Math.min(1, 0.52 + slope(x) * 1.5 + (T - y) / 90));   // left-facing and upper faces see the sky
      ctx.fillStyle = "rgba(0,0,0,.55)"; lump(x + s * 0.18, y + s * 0.34, s * 1.02, a0); ctx.fill();
      const g = 11 + r1 * 20 + lit * 12;
      ctx.fillStyle = `rgb(${g | 0},${g | 0},${(g + 3) | 0})`; lump(x, y, s, a0); ctx.fill();
      const f = 34 + lit * 78 + r2 * 46;
      ctx.fillStyle = `rgba(${f | 0},${(f + 3) | 0},${(f + 10) | 0},${(0.45 + r3 * 0.45).toFixed(2)})`;
      lump(x - s * 0.2, y - s * 0.24, s * 0.52, a0 + 1.1); ctx.fill();
      if (r3 < 0.075 * lit && s > 1.4) {                                 // the glassy glint of freshly broken coal
        ctx.fillStyle = `rgba(232,238,250,${(0.5 + r1 * 0.4).toFixed(2)})`; lump(x - s * 0.28, y - s * 0.32, s * 0.2, a0); ctx.fill();
      }
    }
    // sky on the crown, depth where the load meets the coping
    ctx.save(); ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = lin(ctx, 0, T - 44, 0, T + 4, [0, "rgba(176,190,214,.2)", 0.5, "rgba(176,190,214,.04)", 0.8, "rgba(0,0,0,.14)", 1, "rgba(0,0,0,.5)"]);
    ctx.fillRect(x0 - 4, T - 52, L + 8, 58);
    ctx.restore();
  }

  // Whole wagon, static, for thumbnails. Origin: wagon centre on the rail top.
  // `fill` (0 to 1) is how much of the load is left: the heap sits lower as it drains.
  function wagonCar(ctx, o = {}) {
    const { id = "", paint = "orange", loaded = true, detail = false, seed = 1 } = o;
    const fill = o.fill === undefined ? (loaded ? 1 : 0) : o.fill;
    running(ctx, WAGON.BOGIE, bogie, detail);
    if (o.rise !== undefined) {                        // a pile of a set size, and perhaps the outline of a bigger one
      if (o.ghost > 0.02) heap(ctx, { seed, rise: o.ghost, outline: true });
      if (o.rise > 0.02) heap(ctx, { seed, detail, rise: o.rise });
    } else if (fill > 0.03) { ctx.save(); ctx.translate(0, (1 - fill) * 48); heap(ctx, { seed, detail }); ctx.restore(); }
    wagon(ctx, { id, paint, detail, seed });
  }
  // Wheels and bogie frames of a static vehicle.
  function running(ctx, offset, frame, detail) {
    for (const bx of [-offset, offset]) {
      for (const ax of [-GEO.AXLE, GEO.AXLE]) {
        ctx.save(); ctx.translate(bx + ax, -GEO.R); ctx.rotate((bx + ax) * 0.013); wheel(ctx, 3); ctx.restore();
        ctx.save(); ctx.translate(bx + ax, -GEO.R); wheelLight(ctx); ctx.restore();
      }
      ctx.save(); ctx.translate(bx, 0); frame(ctx, detail); ctx.restore();
    }
  }

  // ------------------------------------------------------------------ track
  // World-space x from x0 to x1, rail top at y = 0.
  function track(ctx, x0, x1, o = {}) {
    const R = rng(4242), simple = !!o.simple, SP = 46;
    if (!simple) {
      // ballast shoulder: crushed stone, lit from above, thinning out towards the bottom
      const stones = [];
      for (let x = x0 - 6; x < x1 + 6; x += 0.62) {
        const y = 17.5 + Math.pow(R(), 1.9) * 22;
        stones.push([x + R() * 2, y, 1.1 + R() * 2.5, 132 + R() * 84, R() * 6.283]);
      }
      stones.sort((a, b) => a[1] - b[1]);
      for (const [x, y, sz, g, a0] of stones) {
        const fade = Math.min(1, Math.max(0, 1.15 - (y - 21) / 17));
        const poly = (dy, sc) => {
          ctx.beginPath();
          for (let v = 0; v < 5; v++) { const a = a0 + v * 1.2566; ctx.lineTo(x + Math.cos(a) * sz * sc * (0.75 + ((v * 37) % 5) * 0.08), y + dy + Math.sin(a) * sz * sc * 0.72); }
          ctx.closePath();
        };
        ctx.fillStyle = `rgba(40,38,34,${(0.5 * fade).toFixed(2)})`; poly(0.8, 1.05); ctx.fill();
        ctx.fillStyle = `rgba(${g | 0},${(g - 2) | 0},${(g - 7) | 0},${fade.toFixed(2)})`; poly(0, 1); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${(0.22 * fade).toFixed(2)})`; poly(-sz * 0.3, 0.5); ctx.fill();
      }
    }
    // sleeper ends
    for (let sx = Math.floor(x0 / SP) * SP + SP / 2; sx < x1 + SP; sx += SP) {
      const t = 0.92 + R() * 0.12;
      ctx.fillStyle = lin(ctx, 0, 15, 0, 27, [0, `rgba(${196 * t | 0},${194 * t | 0},${188 * t | 0},1)`, 0.25, `rgba(${170 * t | 0},${168 * t | 0},${162 * t | 0},1)`, 1, `rgba(${118 * t | 0},${116 * t | 0},${112 * t | 0},1)`]);
      ctx.beginPath(); ctx.moveTo(sx - 12, 15.5); ctx.lineTo(sx + 12, 15.5); ctx.lineTo(sx + 13.5, 26.5); ctx.lineTo(sx - 13.5, 26.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(sx - 13.5, 26.5, 27, 1);
      if (!simple) {
        ctx.fillStyle = "#565656"; ctx.fillRect(sx - 10.5, 11.6, 21, 4.4);          // base plate
        ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(sx - 10.5, 11.6, 21, 0.7);
        ctx.fillStyle = "#2a2a2a"; rr(ctx, sx - 8.5, 8.4, 5, 4.4, 1); ctx.fill(); rr(ctx, sx + 3.5, 8.4, 5, 4.4, 1); ctx.fill(); // clips
      }
    }
    // rail: foot, web, head
    ctx.fillStyle = lin(ctx, 0, 12.4, 0, 16, [0, "#6a6a6a", 0.3, "#474747", 1, "#2b2b2b"]); ctx.fillRect(x0, 12.4, x1 - x0, 3.6);
    ctx.fillStyle = lin(ctx, 0, 6, 0, 12.4, [0, "#1c1c1c", 0.35, "#4c4c4c", 0.75, "#6d6d6d", 1, "#575757"]); ctx.fillRect(x0, 6, x1 - x0, 6.4);
    ctx.fillStyle = lin(ctx, 0, 0, 0, 6.2, [0, "#d5d5d5", 0.16, "#8f8f8f", 0.3, "#2a2a2a", 1, "#0e0e0e"]); ctx.fillRect(x0, 0, x1 - x0, 6.2);
    if (!simple) {
      for (let sx = Math.floor(x0 / SP) * SP + SP / 2; sx < x1 + SP; sx += SP) {
        ctx.fillStyle = "#242424"; rr(ctx, sx - 8.5, 9.6, 5, 3.2, 0.8); ctx.fill(); rr(ctx, sx + 3.5, 9.6, 5, 3.2, 0.8); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(sx - 8, 9.7, 4, 0.6); ctx.fillRect(sx + 4, 9.7, 4, 0.6);
      }
      ctx.globalAlpha = 0.04; ctx.fillStyle = grain(ctx); ctx.fillRect(x0, 0, x1 - x0, 28); ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ whole car (static, used for thumbnails)
  // load: [{paint,id}] bottom first. Origin: car centre on the rail top.
  function car(ctx, o = {}) {
    const { id = "", load = [], detail = false, couplers = true } = o;
    for (const bx of [-GEO.BOGIE, GEO.BOGIE]) {
      for (const ax of [-GEO.AXLE, GEO.AXLE]) {
        ctx.save(); ctx.translate(bx + ax, -GEO.R); ctx.rotate((bx + ax) * 0.013); wheel(ctx, 3); ctx.restore();
        ctx.save(); ctx.translate(bx + ax, -GEO.R); wheelLight(ctx); ctx.restore();
      }
      ctx.save(); ctx.translate(bx, 0); bogie(ctx, detail); ctx.restore();
    }
    if (!couplers) { ctx.save(); ctx.beginPath(); ctx.rect(-GEO.HALF - 2, -200, GEO.HALF * 2 + 4, 260); ctx.clip(); }
    body(ctx, { id, loaded: load.length > 0, detail });
    if (!couplers) ctx.restore();
    load.forEach((c, i) => {
      const g = GEO.C53;
      ctx.save();
      ctx.translate(-g.w / 2, GEO.DECK - 1 - (g.h + GEO.GAP) * i - g.h);
      container(ctx, { w: g.w, h: g.h, paint: c.paint, id: c.id, type: "53CN", dims: "16.154 x 2.591 x 2.896 mm", seed: c.seed || 1, detail });
      ctx.restore();
    });
  }

  // drawing kit for the other artwork files
  const kit = { rng, lin, rad, rr, circ, spaced, centred, pxScale, grain, sbbMark, coil, roundPoly, coupler, chassis, running, bogie };
  return { GEO, PAINTS, kit, container, slotOutline, wheel, wheelLight, bogie, body, shadow, track, car, wagon, heap, wagonCar };
})();
