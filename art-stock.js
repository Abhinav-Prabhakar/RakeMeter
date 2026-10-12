// The two ends of a rake: a plant shunting locomotive and a bogie brake van.
// Same rules as art.js: 64 units per metre, origin at the vehicle centre on the rail top,
// one key light from the upper left, and paint that goes to its own shadow tint.
// Both are the length of a wagon, so every vehicle in a rake sits on the same pitch.
(() => {
  const { GEO, PAINTS, kit } = Art;
  const { rng, lin, rad, rr, circ, spaced, centred, pxScale, grain, sbbMark, coil, roundPoly, coupler, chassis } = kit;
  const W = GEO.WAGON, H = W.HALF, A = GEO.AXLE, R = GEO.R;
  const LOCO = (GEO.LOCO = { BOGIE: 205, DECK: -100, SILL: -72, TOP: -282 });
  const VAN = (GEO.VAN = { TOP: -258 });

  // machines are graphite and steel; orange is kept for the cargo and one stripe
  PAINTS.graphite = { base: "#575b61", print: "#ecebe6", sh: 1, dust: "92,80,64", shd: "6,8,14", lit: "176,184,198", spec: "236,241,250" };
  PAINTS.steel = { base: "#9b9a97", print: "#f2f1ed", sh: 0.92, dust: "74,66,54", shd: "20,22,28", lit: "238,238,236", spec: "255,255,255" };
  const STRIPE = PAINTS.orange.base, AMBER = "236,190,36", SOOT = "14,12,10", RUST = "112,56,22";

  const tints = (P) => ({
    SH: (a) => `rgba(${P.shd},${Math.min(1, a * P.sh).toFixed(3)})`,
    LT: (a) => `rgba(${P.lit},${Math.min(1, a * P.sh).toFixed(3)})`,
    SP: (a) => `rgba(${P.spec},${Math.min(1, a * P.sh).toFixed(3)})`,
  });

  // ---------------------------------------------------------------- shared relief
  // A door or panel standing slightly proud of the sheet: a dark gap round it, lit top and
  // left edges, shaded right and bottom, and a short shadow thrown down-right.
  function plate(ctx, T, x, y, w, h, o = {}) {
    const { gap = 1, lift = 1 } = o;
    ctx.fillStyle = T.SH(0.3 * lift); ctx.fillRect(x + w, y + 1.5, 3.2, h); ctx.fillRect(x + 1.5, y + h, w, 2.6);
    ctx.fillStyle = T.SH(0.74); ctx.fillRect(x - gap, y - gap, w + gap * 2, gap); ctx.fillRect(x - gap, y - gap, gap, h + gap * 2);
    ctx.fillRect(x + w, y - gap, gap, h + gap * 2); ctx.fillRect(x - gap, y + h, w + gap * 2, gap);
    ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [0, T.LT(0.16 * lift), 0.5, T.LT(0.02), 1, T.SH(0.14 * lift)]); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = T.SP(0.5 * lift); ctx.fillRect(x, y, w, 0.9); ctx.fillRect(x, y, 0.9, h);
    ctx.fillStyle = T.SH(0.5 * lift); ctx.fillRect(x + w - 0.9, y, 0.9, h); ctx.fillRect(x, y + h - 0.9, w, 0.9);
  }
  // Pressed louvres: each slot is dark, with the lip below it catching the light.
  function louvres(ctx, T, x, y, w, h, n) {
    const p = h / n;
    for (let i = 0; i < n; i++) {
      const ly = y + i * p;
      ctx.fillStyle = lin(ctx, 0, ly, 0, ly + p * 0.62, [0, T.SH(0.92), 1, T.SH(0.5)]); rr(ctx, x, ly, w, p * 0.6, p * 0.2); ctx.fill();
      ctx.fillStyle = T.SP(0.42); ctx.fillRect(x + 0.6, ly + p * 0.62, w - 1.2, p * 0.16);
      ctx.fillStyle = T.LT(0.12); ctx.fillRect(x + 0.6, ly + p * 0.78, w - 1.2, p * 0.2);
    }
  }
  // Glazing: dark, slightly blue, with the sky sliding across it.
  function glass(ctx, x, y, w, h, r = 2) {
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [0, "#3f4a57", 0.45, "#1c232b", 1, "#0d1014"]); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [0, "rgba(190,208,228,.34)", 0.3, "rgba(190,208,228,.1)", 0.31, "rgba(190,208,228,0)", 0.56, "rgba(190,208,228,0)", 0.57, "rgba(190,208,228,.12)", 0.7, "rgba(190,208,228,.03)", 1, "rgba(0,0,0,.2)"]);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = lin(ctx, 0, y, 0, y + 5, [0, "rgba(0,0,0,.6)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(x, y, w, 5);    // shadow of the frame
    ctx.restore();
    ctx.strokeStyle = "#08090a"; ctx.lineWidth = 1.3; rr(ctx, x, y, w, h, r); ctx.stroke();                             // rubber seal
  }
  // Round steel tube along a polyline, with the shadow it throws on whatever is behind.
  function tube(ctx, pts, w = 1.7, shade = true) {
    const path = (dx, dy) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy))); };
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (shade) { ctx.strokeStyle = "rgba(0,0,0,.34)"; ctx.lineWidth = w + 0.5; path(1.5, 1.8); ctx.stroke(); }
    ctx.strokeStyle = "#3c3e42"; ctx.lineWidth = w + 0.8; path(0, 0); ctx.stroke();
    ctx.strokeStyle = "#c9ccd1"; ctx.lineWidth = w; path(0, 0); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = w * 0.3; path(-w * 0.2, -w * 0.22); ctx.stroke();
  }
  function bolt(ctx, x, y, r = 1) {
    circ(ctx, x, y, r); ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fill();
    circ(ctx, x - r * 0.25, y - r * 0.3, r * 0.6); ctx.fillStyle = "rgba(255,255,255,.42)"; ctx.fill();
  }
  function chevrons(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = `rgba(${AMBER},.94)`; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(18,17,14,.92)";
    for (let s = -h; s < w + h; s += 9) { ctx.beginPath(); ctx.moveTo(x + s, y + h); ctx.lineTo(x + s + 4.4, y + h); ctx.lineTo(x + s + 4.4 + h, y); ctx.lineTo(x + s + h, y); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, h);
  }
  // soot and water working down a painted side from its top edge
  function runs(ctx, Rn, x0, x1, y, n, maxLen, a = 0.12) {
    for (let i = 0; i < n; i++) {
      const sx = x0 + Rn() * (x1 - x0), len = 10 + Rn() * Rn() * maxLen, sw = 0.7 + Rn() * 2.6;
      ctx.fillStyle = lin(ctx, 0, y, 0, y + len, [0, `rgba(${SOOT},${(a * (0.4 + Rn())).toFixed(3)})`, 1, `rgba(${SOOT},0)`]);
      ctx.fillRect(sx, y, sw, len);
    }
  }

  // ---------------------------------------------------------------- locomotive bogie
  // Fabricated two-axle bogie: a welded box frame riding on coil springs either side of
  // each axlebox. Origin: bogie centre on the rail top.
  function locoBogie(ctx, detail = true) {
    const k = pxScale(ctx), Rn = rng(733), ay = -R;
    const frame = () => {
      ctx.beginPath();
      roundPoly(ctx, [[-106, -63], [106, -63], [106, -50], [100, -45], [36, -45], [30, -31], [-30, -31], [-36, -45], [-100, -45], [-106, -50]], 2.4);
      for (const s of [-1, 1]) { ctx.moveTo(s * 86 + 7, -54); ctx.ellipse(s * 86, -54, 7, 3.6, 0, 0, Math.PI * 2); }      // lightening holes
    };

    // behind the frame: brake blocks on the outer treads, sand pipes down to the rail
    for (const s of [-1, 1]) {
      const wx = s * A, a0 = s > 0 ? 0 : Math.PI;
      ctx.beginPath(); ctx.arc(wx, ay, R + 1.2, a0 - 0.34, a0 + 0.34); ctx.arc(wx, ay, R + 7.5, a0 + 0.31, a0 - 0.31, true); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, ay - 12, 0, ay + 12, [0, "#5a4a3d", 0.5, "#382d25", 1, "#1c1713"]); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.strokeStyle = "#1b1b1c"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s * (A + R + 6), ay - 6); ctx.lineTo(s * 101, -47); ctx.stroke();                       // hanger
      ctx.strokeStyle = "#232324"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(s * 104, -48); ctx.quadraticCurveTo(s * 112, -30, s * (A + R + 4.5), -5); ctx.stroke();  // sand pipe
      ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(s * 103.2, -47); ctx.quadraticCurveTo(s * 111, -30, s * (A + R + 3.8), -6); ctx.stroke();
    }

    // primary springs and their seats on the axlebox wings
    for (const s of [-1, 1]) {
      for (const d of [-21, 21]) {
        coil(ctx, s * A + d, -45.5, -27.5, 4.6, 2.1, 3);
        ctx.fillStyle = lin(ctx, 0, -28, 0, -23.5, [0, "#8d8983", 1, "#34322f"]); rr(ctx, s * A + d - 7, -28, 14, 4.5, 1.2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.5; ctx.stroke();
      }
    }

    // the frame
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4 * k; ctx.shadowOffsetX = 1 * k; ctx.shadowOffsetY = 2.2 * k;
    frame(); ctx.fillStyle = "#35373a"; ctx.fill("evenodd");
    ctx.restore();
    ctx.save(); frame(); ctx.clip("evenodd");
    ctx.fillStyle = lin(ctx, 0, -63, 0, -31, [0, "#666a70", 0.2, "#474a4f", 0.65, "#313337", 1, "#1e1f22"]); ctx.fillRect(-108, -64, 216, 34);
    ctx.fillStyle = lin(ctx, -106, 0, 106, 0, [0, "rgba(255,250,240,.1)", 0.5, "rgba(0,0,0,0)", 1, "rgba(0,0,0,.2)"]); ctx.fillRect(-108, -64, 216, 34);
    ctx.lineJoin = "round";
    ctx.save(); ctx.translate(0.75, 0.85); frame(); ctx.strokeStyle = "rgba(255,250,240,.5)"; ctx.lineWidth = 0.9; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(-0.75, -0.85); frame(); ctx.strokeStyle = "rgba(0,0,0,.62)"; ctx.lineWidth = 1.1; ctx.stroke(); ctx.restore();
    for (const wx of [-70, -36, 36, 70]) {                                // weld lines between the plates
      ctx.fillStyle = "rgba(0,0,0,.34)"; ctx.fillRect(wx, -63, 0.9, 19); ctx.fillStyle = "rgba(255,250,240,.16)"; ctx.fillRect(wx - 0.9, -63, 0.8, 19);
    }
    ctx.fillStyle = lin(ctx, 0, -64, 0, -50, [0, "rgba(0,0,0,.6)", 0.5, "rgba(0,0,0,.24)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(-108, -64, 216, 14);   // shade from the frame above
    for (let i = 0; i < 7; i++) {
      const gx = (Rn() - 0.5) * 200, gy = -62 + Rn() * 28, gr = 6 + Rn() * 14, rust = Rn() > 0.5;
      ctx.fillStyle = rad(ctx, gx, gy, 0, gr, [0, rust ? `rgba(${RUST},.28)` : "rgba(0,0,0,.34)", 1, "rgba(0,0,0,0)"]); ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    if (detail) { ctx.globalAlpha = 0.07; ctx.fillStyle = grain(ctx); ctx.fillRect(-108, -64, 216, 34); ctx.globalAlpha = 1; }
    ctx.restore();
    frame(); ctx.strokeStyle = "rgba(0,0,0,.72)"; ctx.lineWidth = 0.8; ctx.stroke();

    // bolster pivot cover
    circ(ctx, 0, -42, 8.5); ctx.fillStyle = rad(ctx, -2, -44.5, 0.6, 9.5, [0, "#8f9399", 0.7, "#4c4f54", 1, "#26272a"]); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.lineWidth = 0.7; ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = i * 1.047; bolt(ctx, Math.cos(a) * 6, -42 + Math.sin(a) * 6, 0.9); }

    // axleboxes: these cover the axle ends, so only the wheel plate behind is seen turning
    for (const s of [-1, 1]) {
      const x = s * A;
      ctx.fillStyle = lin(ctx, 0, -44, 0, -20, [0, "#7b7f85", 0.35, "#54575c", 1, "#232427"]); rr(ctx, x - 12.5, -44.5, 25, 25, 4.5); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,240,.4)"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x - 9, -43.6); ctx.lineTo(x + 9, -43.6); ctx.stroke();
      circ(ctx, x, ay, 8.6); ctx.fillStyle = rad(ctx, x - 2.4, ay - 2.8, 0.5, 9.6, [0, "#b4b8be", 0.6, "#72767c", 1, "#35373a"]); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.7; ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = 0.785 + i * 1.5708; bolt(ctx, x + Math.cos(a) * 6, ay + Math.sin(a) * 6, 1.05); }
      circ(ctx, x, ay, 2.4); ctx.fillStyle = "#2a2b2d"; ctx.fill();
      // guide link tying the axlebox back to the frame
      ctx.strokeStyle = "#18181a"; ctx.lineWidth = 3.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - s * 12, -23); ctx.lineTo(s * 33, -34); ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,240,.26)"; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x - s * 12, -24.2); ctx.lineTo(s * 33, -35.2); ctx.stroke();
      circ(ctx, x - s * 12, -23, 2.4); ctx.fillStyle = "#77797d"; ctx.fill(); circ(ctx, s * 33, -34, 2.4); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- shunting locomotive
  // Hood unit with an offset cab: long engine hood leading, short hood behind.
  function loco(ctx, o = {}) {
    const { detail = true, seed = 7, number = "843 052" } = o;
    const P = PAINTS.graphite, T = tints(P), { SH, LT, SP } = T, Rn = rng(seed * 311 + 9), k = pxScale(ctx);
    const D = LOCO.DECK, S = LOCO.SILL;
    const HOOD = { x0: -298, x1: 46, top: -198 }, CAB = { x0: 46, x1: 158, top: -264 }, REAR = { x0: 158, x1: 298, top: -184 };

    // --- between the bogies: fuel tank, battery box, air dryer
    ctx.fillStyle = "#101011"; ctx.fillRect(-104, S - 1, 208, 9);
    ctx.fillStyle = lin(ctx, 0, S + 4, 0, S + 54, [0, "#5b5e63", 0.12, "#3d4044", 0.6, "#26272a", 1, "#111112"]);
    rr(ctx, -66, S + 4, 132, 50, 9); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-58, S + 5); ctx.lineTo(58, S + 5); ctx.stroke();
    for (const wx of [-22, 22]) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(wx, S + 5, 1, 48); ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.fillRect(wx - 1, S + 5, 0.9, 48); }
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(-48, S + 3, 3, 52); ctx.fillRect(45, S + 3, 3, 52);                 // straps
    ctx.fillStyle = "#1a1b1c"; rr(ctx, 31, S + 14, 6, 28, 1.5); ctx.fill();                                              // sight gauge
    ctx.fillStyle = lin(ctx, 0, S + 22, 0, S + 41, [0, "rgba(255,196,96,.9)", 1, "rgba(206,120,30,.9)"]); ctx.fillRect(32.6, S + 22, 2.8, 18.6);
    ctx.fillStyle = lin(ctx, 0, S, 0, S + 8, [0, "#a9adb3", 1, "#484b4f"]); rr(ctx, -40, S - 1, 13, 8, 2); ctx.fill();    // filler
    if (detail) { ctx.fillStyle = "rgba(240,240,236,.6)"; ctx.font = "600 4.4px Inter, Arial, sans-serif"; ctx.textBaseline = "alphabetic"; spaced(ctx, "DIESEL  2 800 L", -17, S + 31, 0.4); }
    ctx.fillStyle = lin(ctx, 0, S + 2, 0, S + 30, [0, "#55585d", 1, "#1d1e20"]); rr(ctx, 72, S + 2, 30, 28, 2); ctx.fill();   // battery box
    ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.7; ctx.stroke();
    louvres(ctx, T, 76, S + 7, 22, 12, 3);
    ctx.fillStyle = "#b8bbc0"; ctx.fillRect(85, S + 23, 5, 2);
    ctx.fillStyle = lin(ctx, 0, S + 3, 0, S + 21, [0, "#484b4f", 0.3, "#7c8086", 1, "#1e1f21"]); rr(ctx, -102, S + 3, 30, 18, 9); ctx.fill();   // air reservoir
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.stroke();

    // --- both ends: buffer beam, step well, coupler
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      ctx.fillStyle = "#0e0e0f"; ctx.fillRect(H - 45, D, 31, 56);                                                        // step well
      for (const ty of [D + 15, D + 33, D + 51]) {
        ctx.fillStyle = lin(ctx, 0, ty, 0, ty + 3.4, [0, "#c3c6cb", 0.3, "#70747a", 1, "#2a2b2d"]); ctx.fillRect(H - 44, ty, 29, 3.4);
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(H - 44, ty + 3.4, 29, 4);
      }
      ctx.fillStyle = "#3a3c40"; ctx.fillRect(H - 46, D, 2.4, 57); ctx.fillRect(H - 16, D, 2.4, 57);
      ctx.fillStyle = lin(ctx, 0, D - 6, 0, S + 22, [0, "#7b7f85", 0.2, "#4b4e53", 1, "#1a1b1d"]);
      rr(ctx, H - 13, D - 6, 15, S - D + 28, 1.6); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.lineWidth = 0.8; ctx.stroke();
      coupler(ctx, H, W.REACH);
      ctx.restore();
    }

    // --- running frame: the deep side sill the hoods stand on
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.62)"; ctx.shadowBlur = 7 * k; ctx.shadowOffsetY = 3.5 * k;
    ctx.fillStyle = "#3a3c40"; ctx.fillRect(-H + 46, D, H * 2 - 92, S - D);
    ctx.restore();
    ctx.fillStyle = lin(ctx, 0, D, 0, S, [0, "#7e8288", 0.14, "#55585d", 0.6, "#3a3c40", 1, "#202124"]); ctx.fillRect(-H + 46, D, H * 2 - 92, S - D);
    ctx.fillStyle = lin(ctx, -H, 0, H, 0, [0, "rgba(255,255,255,.08)", 0.5, "rgba(255,255,255,0)", 1, "rgba(0,0,0,.14)"]); ctx.fillRect(-H + 46, D, H * 2 - 92, S - D);
    ctx.fillStyle = "#17181a"; ctx.fillRect(-H + 46, S - 2.6, H * 2 - 92, 2.6);
    ctx.fillStyle = "rgba(255,255,255,.26)"; ctx.fillRect(-H + 46, S - 3.3, H * 2 - 92, 0.7);
    for (const s of [-1, 1]) chevrons(ctx, s > 0 ? H - 100 : -H + 54, D + 6, 46, 15);
    if (detail) {
      for (let x = -H + 110; x <= H - 110; x += 14) bolt(ctx, x, D + 7, 0.95);
      ctx.fillStyle = "rgba(240,240,236,.8)"; ctx.textBaseline = "alphabetic"; ctx.font = "700 6.4px Inter, Arial, sans-serif";
      spaced(ctx, "SBB CARGO", -150, D + 20.5, 0.9);
      ctx.fillStyle = "rgba(206,210,216,.9)"; rr(ctx, 24, D + 9, 24, 12, 6); ctx.fill();                                   // builder's plate
      ctx.fillStyle = "rgba(20,22,26,.8)"; ctx.font = "700 3px Inter, Arial, sans-serif"; spaced(ctx, "VOSSLOH", 28.4, D + 14.2, 0.2); spaced(ctx, "2019", 32.4, D + 18.2, 0.3);
      ctx.fillStyle = "rgba(240,240,236,.8)"; ctx.font = "700 6.4px Inter, Arial, sans-serif";
      ctx.font = "600 3.9px Inter, Arial, sans-serif"; ctx.fillStyle = "rgba(240,240,236,.66)";
      spaced(ctx, "DH 700   72 T   60 KM/H", 96, D + 16, 0.3); spaced(ctx, "REV 03-26   AIR + DYN BRAKE", 96, D + 21, 0.3);
      ctx.globalAlpha = 0.05; ctx.fillStyle = grain(ctx); ctx.fillRect(-H + 46, D, H * 2 - 92, S - D); ctx.globalAlpha = 1;
    }
    // walkway: tread plate seen edge on
    ctx.fillStyle = lin(ctx, 0, D - 3.4, 0, D, [0, "#d5d8dc", 0.4, "#8b8f95", 1, "#3b3d41"]); ctx.fillRect(-H - 1, D - 3.4, H * 2 + 2, 3.4);
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-H + 46, D, H * 2 - 92, 1.4);

    // --- superstructure silhouette
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(HOOD.x0, D - 3.4); ctx.lineTo(HOOD.x0, HOOD.top + 16); ctx.quadraticCurveTo(HOOD.x0, HOOD.top, HOOD.x0 + 16, HOOD.top);
      ctx.lineTo(CAB.x0, HOOD.top); ctx.lineTo(CAB.x0, CAB.top + 5); ctx.quadraticCurveTo(CAB.x0, CAB.top, CAB.x0 + 5, CAB.top);
      ctx.lineTo(CAB.x1 - 5, CAB.top); ctx.quadraticCurveTo(CAB.x1, CAB.top, CAB.x1, CAB.top + 5); ctx.lineTo(CAB.x1, REAR.top);
      ctx.lineTo(REAR.x1 - 16, REAR.top); ctx.quadraticCurveTo(REAR.x1, REAR.top, REAR.x1, REAR.top + 16); ctx.lineTo(REAR.x1, D - 3.4);
      ctx.closePath();
    };
    ctx.save(); body(); ctx.clip();
    ctx.fillStyle = P.base; ctx.fillRect(-H, LOCO.TOP, H * 2, D - LOCO.TOP);

    // livery before relief: one orange stripe the length of the machine, number and mark on the cab
    ctx.fillStyle = STRIPE; ctx.fillRect(-H, -141, H * 2, 12);
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(-H, -141, H * 2, 1); ctx.fillStyle = "rgba(60,10,0,.4)"; ctx.fillRect(-H, -130, H * 2, 1);
    if (detail) {
      ctx.save(); ctx.globalAlpha = 0.95; ctx.textBaseline = "alphabetic";
      sbbMark(ctx, CAB.x0 + 14, -177, 13.5, P.print, P.base);
      ctx.fillStyle = P.print; ctx.font = "700 13px Inter, Arial, sans-serif";
      centred(ctx, number, (CAB.x0 + CAB.x1) / 2, -111, 1.8);
      ctx.restore();
    }

    // each volume: sky on the shoulder, shade where it meets the deck, and the far end falling off
    const volume = (x0, x1, top) => {
      ctx.fillStyle = lin(ctx, 0, top, 0, D, [0, LT(0.42), 0.07, LT(0.2), 0.28, LT(0.03), 0.7, SH(0.06), 0.93, SH(0.3), 1, SH(0.5)]); ctx.fillRect(x0, top, x1 - x0, D - top);
      ctx.fillStyle = lin(ctx, x0, 0, x1, 0, [0, LT(0.08), 0.5, LT(0), 1, SH(0.14)]); ctx.fillRect(x0, top, x1 - x0, D - top);
    };
    volume(HOOD.x0, HOOD.x1, HOOD.top); volume(CAB.x0, CAB.x1, CAB.top); volume(REAR.x0, REAR.x1, REAR.top);
    // the cab stands proud of both hoods: it shades the short hood, and catches light on its leading edge
    ctx.fillStyle = lin(ctx, CAB.x1, 0, CAB.x1 + 20, 0, [0, SH(0.6), 0.4, SH(0.24), 1, SH(0)]); ctx.fillRect(CAB.x1, REAR.top, 20, D - REAR.top);
    ctx.fillStyle = SH(0.26); ctx.fillRect(CAB.x0 - 3, HOOD.top, 3, D - HOOD.top);
    ctx.fillStyle = lin(ctx, CAB.x0, 0, CAB.x0 + 3.4, 0, [0, SP(0.66), 1, LT(0.2)]); ctx.fillRect(CAB.x0, CAB.top, 3.4, D - CAB.top);
    ctx.fillStyle = lin(ctx, CAB.x1 - 3.4, 0, CAB.x1, 0, [0, SH(0.3), 1, SH(0.8)]); ctx.fillRect(CAB.x1 - 3.4, CAB.top, 3.4, D - CAB.top);

    // long hood: radiator grille at the nose, then the engine-room doors
    plate(ctx, T, HOOD.x0 + 8, HOOD.top + 14, 54, 74, { lift: 1.1 });
    louvres(ctx, T, HOOD.x0 + 12, HOOD.top + 18, 46, 66, 11);
    for (let i = 0; i < 5; i++) {
      const dx = HOOD.x0 + 72 + i * 53.6, dy = HOOD.top + 12, dw = 49, dh = D - 6 - dy;
      plate(ctx, T, dx, dy, dw, dh);
      if (i % 2 === 0) louvres(ctx, T, dx + 6, dy + 7, dw - 12, 22, 5);
      for (const hy of [dy + 12, dy + dh - 14]) { ctx.fillStyle = SH(0.5); rr(ctx, dx - 2.4, hy - 3, 5.6, 8, 1); ctx.fill(); ctx.fillStyle = LT(0.4); rr(ctx, dx - 3, hy - 3.6, 5, 7, 1); ctx.fill(); }   // hinges
      ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, dx + dw - 9.4, dy + dh * 0.56 - 0.4, 5.4, 10.4, 1.2); ctx.fill();              // latch
      ctx.fillStyle = lin(ctx, 0, dy + dh * 0.56, 0, dy + dh * 0.56 + 9, [0, "#d6d9dd", 1, "#70747a"]); rr(ctx, dx + dw - 10, dy + dh * 0.56 - 1, 4.6, 9.4, 1.2); ctx.fill();
    }
    // short hood: three smaller doors
    for (let i = 0; i < 3; i++) {
      const dx = REAR.x0 + 12 + i * 42, dy = REAR.top + 12, dw = 38, dh = D - 6 - dy;
      plate(ctx, T, dx, dy, dw, dh);
      if (i === 1) louvres(ctx, T, dx + 5, dy + 6, dw - 10, 18, 4);
      ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, dx + dw - 8.4, dy + dh * 0.5 - 0.4, 5, 9.4, 1.2); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, dy + dh * 0.5, 0, dy + dh * 0.5 + 8, [0, "#d6d9dd", 1, "#70747a"]); rr(ctx, dx + dw - 9, dy + dh * 0.5 - 1, 4.2, 8.4, 1.2); ctx.fill();
    }
    // cab side: a sliding window, armrest below it, drip rail above
    ctx.fillStyle = SH(0.5); rr(ctx, CAB.x0 + 11, CAB.top + 17, 90, 54, 4); ctx.fill();
    ctx.fillStyle = P.base; rr(ctx, CAB.x0 + 12, CAB.top + 18, 88, 52, 3.4); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, CAB.top + 18, 0, CAB.top + 70, [0, LT(0.5), 0.5, LT(0.16), 1, SH(0.3)]); rr(ctx, CAB.x0 + 12, CAB.top + 18, 88, 52, 3.4); ctx.fill();
    glass(ctx, CAB.x0 + 16, CAB.top + 22, 38.5, 44, 2.4); glass(ctx, CAB.x0 + 57.5, CAB.top + 22, 38.5, 44, 2.4);
    ctx.fillStyle = lin(ctx, 0, CAB.top + 73, 0, CAB.top + 77, [0, "#c9ccd1", 1, "#55585d"]); rr(ctx, CAB.x0 + 18, CAB.top + 73, 76, 4, 2); ctx.fill();   // armrest
    ctx.fillStyle = SH(0.4); ctx.fillRect(CAB.x0 + 18, CAB.top + 77, 76, 3);
    ctx.fillStyle = SP(0.5); ctx.fillRect(CAB.x0 + 6, CAB.top + 12, 100, 1.1); ctx.fillStyle = SH(0.55); ctx.fillRect(CAB.x0 + 6, CAB.top + 13.1, 100, 1.4);
    if (detail) {
      // wear: soot round the exhaust, runs from the roof edges, dust low down, a few chips
      ctx.fillStyle = rad(ctx, -112, HOOD.top, 0, 70, [0, `rgba(${SOOT},.5)`, 0.5, `rgba(${SOOT},.18)`, 1, `rgba(${SOOT},0)`]);
      ctx.save(); ctx.translate(-112, HOOD.top); ctx.scale(1.3, 0.5); ctx.fillRect(-70, -10, 140, 80); ctx.restore();
      runs(ctx, Rn, HOOD.x0, HOOD.x1, HOOD.top, 26, 80); runs(ctx, Rn, REAR.x0, REAR.x1, REAR.top, 12, 60); runs(ctx, Rn, CAB.x0, CAB.x1, CAB.top + 80, 8, 60, 0.08);
      for (let i = 0; i < 8; i++) {                 // oil weeping from the door bottoms
        const sx = HOOD.x0 + 76 + Rn() * 250, len = 4 + Rn() * 12;
        ctx.fillStyle = lin(ctx, 0, D - 6 - len, 0, D - 4, [0, `rgba(${SOOT},0)`, 1, `rgba(${SOOT},.36)`]); ctx.fillRect(sx, D - 6 - len, 1.5 + Rn() * 3, len);
      }
      ctx.fillStyle = lin(ctx, 0, D - 34, 0, D, [0, `rgba(${P.dust},0)`, 1, `rgba(${P.dust},.2)`]); ctx.fillRect(-H, D - 34, H * 2, 34);
      for (let i = 0; i < 46; i++) {
        ctx.fillStyle = `rgba(${Rn() < 0.5 ? RUST : "196,200,206"},${(0.2 + Rn() * 0.35).toFixed(2)})`;
        ctx.fillRect(-H + 24 + Rn() * (H * 2 - 48), LOCO.TOP + 80 + Rn() * 100, 0.5 + Rn() * 1.4, 0.4 + Rn() * 0.9);
      }
      if (k >= 0.8) { ctx.globalAlpha = 0.035; ctx.fillStyle = grain(ctx); ctx.fillRect(-H, LOCO.TOP, H * 2, D - LOCO.TOP); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(${P.shd},.75)`; ctx.lineWidth = 0.8; ctx.lineJoin = "round"; body(); ctx.stroke();
    ctx.strokeStyle = SP(0.55); ctx.lineWidth = 0.8;                       // light catching the hood shoulders
    ctx.beginPath(); ctx.moveTo(HOOD.x0 + 14, HOOD.top + 0.7); ctx.lineTo(CAB.x0 - 1, HOOD.top + 0.7); ctx.moveTo(CAB.x1 + 1, REAR.top + 0.7); ctx.lineTo(REAR.x1 - 14, REAR.top + 0.7); ctx.stroke();

    // --- on the roof: cab roof with visor, beacon and horns, radiator fan, exhaust
    ctx.fillStyle = lin(ctx, 0, CAB.top - 7, 0, CAB.top + 4, [0, "#7b7f85", 0.3, "#3f4246", 1, "#17181a"]);
    rr(ctx, CAB.x0 - 9, CAB.top - 7, CAB.x1 - CAB.x0 + 18, 11, 4.5); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(CAB.x0 - 4, CAB.top - 6.3, CAB.x1 - CAB.x0 + 8, 0.8);
    ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.fillRect(CAB.x0, CAB.top + 4, CAB.x1 - CAB.x0, 4);
    ctx.fillStyle = "#2a2c2f"; rr(ctx, CAB.x1 - 30, CAB.top - 11, 12, 4.4, 1.2); ctx.fill();                               // beacon base
    ctx.fillStyle = rad(ctx, CAB.x1 - 25.5, CAB.top - 15, 0.5, 7, [0, "#ffd08a", 0.5, "#f08a2c", 1, "#a04a0c"]); rr(ctx, CAB.x1 - 29, CAB.top - 18.6, 10, 8, 3.4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)"; rr(ctx, CAB.x1 - 27.6, CAB.top - 17.4, 2.2, 4, 1); ctx.fill();
    for (const hx of [CAB.x0 + 14, CAB.x0 + 27]) {                                                                         // horns
      ctx.fillStyle = lin(ctx, 0, CAB.top - 14, 0, CAB.top - 8, [0, "#b9bcc1", 1, "#484b4f"]);
      ctx.beginPath(); ctx.moveTo(hx, CAB.top - 12.4); ctx.lineTo(hx - 13, CAB.top - 14.6); ctx.lineTo(hx - 13, CAB.top - 7.6); ctx.lineTo(hx, CAB.top - 9.8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.fillStyle = lin(ctx, 0, HOOD.top - 9, 0, HOOD.top + 1, [0, "#70747a", 0.4, "#3d4044", 1, "#1c1d1f"]);
    rr(ctx, HOOD.x0 + 14, HOOD.top - 8.6, 46, 9.6, 3); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.7; ctx.stroke();   // fan cowl
    for (let x = HOOD.x0 + 19; x < HOOD.x0 + 57; x += 4.6) { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x, HOOD.top - 6.4, 2.4, 4.4); }
    ctx.fillStyle = lin(ctx, -122, 0, -102, 0, [0, "#2a2b2d", 0.3, "#70737a", 0.6, "#3a3c40", 1, "#111112"]);
    ctx.fillRect(-122, HOOD.top - 22, 20, 23);                                                                             // exhaust stack
    ctx.fillStyle = "#0d0d0e"; rr(ctx, -125, HOOD.top - 25, 26, 5, 1.6); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(-124, HOOD.top - 24.6, 24, 0.8);
    for (const lx of [HOOD.x0 + 110, HOOD.x1 - 34, REAR.x0 + 70]) {                                                        // lifting lugs
      const ly = lx > CAB.x1 ? REAR.top : HOOD.top;
      ctx.fillStyle = "#4b4e53"; ctx.beginPath(); ctx.moveTo(lx - 5, ly); ctx.lineTo(lx - 2.5, ly - 5.4); ctx.lineTo(lx + 2.5, ly - 5.4); ctx.lineTo(lx + 5, ly); ctx.closePath(); ctx.fill();
      circ(ctx, lx, ly - 2.7, 1.2); ctx.fillStyle = "#101011"; ctx.fill();
    }
    // --- headlights at both hood ends, facing along the track
    for (const [hx, hy, s] of [[HOOD.x0, HOOD.top + 20, -1], [REAR.x1, REAR.top + 20, 1]]) {
      ctx.fillStyle = lin(ctx, 0, hy - 8, 0, hy + 8, [0, "#6f7379", 1, "#1e1f21"]); rr(ctx, s > 0 ? hx - 2 : hx - 7, hy - 8, 9, 16, 2.4); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = rad(ctx, hx + s * 6.4, hy, 0, 22, [0, "rgba(255,244,214,.5)", 1, "rgba(255,244,214,0)"]); ctx.fillRect(hx + s * 6.4 - 22, hy - 22, 44, 44);
      ctx.fillStyle = "#fff6dc"; ctx.beginPath(); ctx.ellipse(hx + s * 7, hy, 1.7, 5.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s < 0 ? "#f4f0e4" : "#d7372c"; ctx.beginPath(); ctx.ellipse(hx + s * 0.8, D - 26, 1.3, 3.2, 0, 0, Math.PI * 2); ctx.fill();   // marker lamp
    }
    // mirror on the cab's leading corner
    ctx.strokeStyle = "#2a2c2f"; ctx.lineWidth = 1.3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(CAB.x0, CAB.top + 30); ctx.lineTo(CAB.x0 - 8, CAB.top + 30); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, CAB.top + 22, 0, CAB.top + 42, [0, "#55585d", 1, "#151617"]); rr(ctx, CAB.x0 - 12, CAB.top + 22, 4.6, 20, 1.6); ctx.fill();

    // --- handrails along both walkways and up the corner steps
    const rails = (x0, x1, top) => {
      const posts = Math.max(2, Math.round((x1 - x0) / 58));
      for (let i = 0; i <= posts; i++) { const px = x0 + (i / posts) * (x1 - x0); tube(ctx, [[px, D - 3], [px, top]], 1.5); }
      tube(ctx, [[x0, top], [x1, top]], 1.8);
    };
    rails(HOOD.x0 + 6, CAB.x0 - 10, D - 66); rails(CAB.x1 + 10, REAR.x1 - 6, D - 66);
    for (const s of [-1, 1]) {
      tube(ctx, [[s * (H - 46), D + 40], [s * (H - 46), D - 70]], 1.7);
      tube(ctx, [[s * (H - 15), D + 40], [s * (H - 15), D - 70], [s * (H - 22), D - 78], [s * (H - 40), D - 78], [s * (H - 46), D - 70]], 1.7);
    }
  }

  // ---------------------------------------------------------------- brake van
  // A guard's cabin between two open verandas, under one long roof.
  function van(ctx, o = {}) {
    const { id = "", detail = true, seed = 5 } = o;
    const P = PAINTS.steel, T = tints(P), { SH, LT, SP } = T, Rn = rng(seed * 577 + 3), k = pxScale(ctx);
    const F = W.FLOOR, S = W.SILL, C = 178, EAVE = -222, RAILY = -150, PANEL = -128;

    chassis(ctx, { id, detail, bolts: [-312, -178, -60, 60, 178, 312], marks: ["BVZI   TARE 23.5 T   GUARD", "AIR BRAKE   BLT 11-18   POH 03-27"] });

    // --- far side of each veranda, seen through the open half
    for (const s of [-1, 1]) {
      ctx.fillStyle = "rgba(52,54,60,.5)";
      ctx.fillRect(Math.min(s * C, s * 306), RAILY + 4, 128, 2.4);
      ctx.fillRect(s > 0 ? 300 : -304, EAVE, 4, PANEL - EAVE);
      ctx.fillRect(s > 0 ? 238 : -242, RAILY + 4, 3, PANEL - RAILY - 4);
    }
    // guard's hand brake in the trailing veranda
    ctx.fillStyle = lin(ctx, 250, 0, 255, 0, [0, "#aeb1b6", 1, "#3c3e42"]); ctx.fillRect(250, -150, 4.4, 26);
    tube(ctx, [[252.2, -150], [252.2, -163]], 2, false);
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 3.2; circ(ctx, 253, -162, 13); ctx.stroke();
    ctx.strokeStyle = "#55585d"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const a = 0.4 + i * 1.5708; ctx.beginPath(); ctx.moveTo(252.2, -163); ctx.lineTo(252.2 + Math.cos(a) * 13, -163 + Math.sin(a) * 13); ctx.stroke(); }
    ctx.strokeStyle = lin(ctx, 239, -176, 265, -150, [0, "#d2d5d9", 0.5, "#7b7f85", 1, "#303236"]); ctx.lineWidth = 2.6; circ(ctx, 252.2, -163, 13); ctx.stroke();
    circ(ctx, 252.2, -163, 3); ctx.fillStyle = rad(ctx, 251.4, -164, 0.3, 3.4, [0, "#d2d5d9", 1, "#4a4c50"]); ctx.fill();

    // --- cabin
    ctx.save();
    rr(ctx, -C, EAVE, C * 2, F - EAVE, 1.2); ctx.clip();
    ctx.fillStyle = P.base; ctx.fillRect(-C, EAVE, C * 2, F - EAVE);
    ctx.fillStyle = STRIPE; ctx.fillRect(-C, -151, C * 2, 9);                                                              // the one stripe
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(-C, -151, C * 2, 0.9); ctx.fillStyle = "rgba(60,10,0,.4)"; ctx.fillRect(-C, -143, C * 2, 0.9);
    if (detail) {
      ctx.save(); ctx.globalAlpha = 0.95; ctx.textBaseline = "alphabetic";
      sbbMark(ctx, -C + 18, -131, 14, P.print, P.base);
      ctx.fillStyle = P.print; ctx.font = "700 14px Inter, Arial, sans-serif"; centred(ctx, "BVZI", 108, -117, 2.2);
      ctx.font = "600 7.2px Inter, Arial, sans-serif"; spaced(ctx, "TARE  23.5 t", -C + 18, F - 11, 0.9); centred(ctx, id.slice(0, 4) + " " + id.slice(4), 108, F - 11, 0.9);
      ctx.restore();
    }
    // sheet seams with their rivet lines
    for (let x = -C + 44.5; x < C - 10; x += 44.5) {
      ctx.fillStyle = SH(0.34); ctx.fillRect(x, EAVE, 1, F - EAVE); ctx.fillStyle = LT(0.24); ctx.fillRect(x - 1, EAVE, 0.9, F - EAVE);
      if (detail) for (let y = EAVE + 10; y < F - 4; y += 11) bolt(ctx, x + 4, y, 0.7);
    }
    ctx.fillStyle = lin(ctx, 0, EAVE, 0, F, [0, SH(0.5), 0.07, SH(0.22), 0.2, LT(0.06), 0.55, SH(0), 0.9, SH(0.2), 1, SH(0.3)]); ctx.fillRect(-C, EAVE, C * 2, F - EAVE);
    ctx.fillStyle = lin(ctx, -C, 0, C, 0, [0, LT(0.1), 0.5, LT(0), 1, SH(0.14)]); ctx.fillRect(-C, EAVE, C * 2, F - EAVE);
    // waist rail above the stripe
    ctx.fillStyle = SP(0.6); ctx.fillRect(-C, -158, C * 2, 1.3);
    ctx.fillStyle = lin(ctx, 0, -156.7, 0, -153, [0, LT(0.3), 1, LT(0.06)]); ctx.fillRect(-C, -156.7, C * 2, 3.7);
    ctx.fillStyle = SH(0.72); ctx.fillRect(-C, -153, C * 2, 1.6);
    // corner posts
    ctx.fillStyle = lin(ctx, -C, 0, -C + 8, 0, [0, SP(0.6), 0.3, LT(0.3), 1, SH(0.3)]); ctx.fillRect(-C, EAVE, 8, F - EAVE);
    ctx.fillStyle = lin(ctx, C - 8, 0, C, 0, [0, LT(0.14), 0.4, SH(0.14), 1, SH(0.6)]); ctx.fillRect(C - 8, EAVE, 8, F - EAVE);

    // windows: a raised frame, dark glass, two guard bars
    for (const wx of [-146, 90]) {
      ctx.fillStyle = SH(0.5); rr(ctx, wx - 3, -211, 63, 54, 3); ctx.fill();
      ctx.fillStyle = P.base; rr(ctx, wx - 4, -212, 62, 53, 3); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, -212, 0, -159, [0, LT(0.52), 0.5, LT(0.16), 1, SH(0.34)]); rr(ctx, wx - 4, -212, 62, 53, 3); ctx.fill();
      glass(ctx, wx, -208, 54, 45, 2);
      for (const by of [-193, -178]) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(wx, by + 1.3, 54, 1.4); ctx.fillStyle = lin(ctx, 0, by, 0, by + 1.6, [0, "#e2e4e7", 1, "#7b7f85"]); ctx.fillRect(wx, by, 54, 1.6); }
      ctx.fillStyle = SP(0.6); ctx.fillRect(wx - 7, -217, 68, 1.2); ctx.fillStyle = SH(0.6); ctx.fillRect(wx - 7, -215.8, 68, 1.6);     // drip strip
    }
    // door: two pressed panels, a light, a lever handle
    plate(ctx, T, -29, -213, 58, F - 2 + 213, { lift: 1.1 });
    ctx.fillStyle = P.base; ctx.fillRect(-29, -151, 58, 9); ctx.fillStyle = STRIPE; ctx.fillRect(-29, -151, 58, 9);
    plate(ctx, T, -21, -136, 42, 23, { gap: 0.8, lift: 0.7 }); plate(ctx, T, -21, -109, 42, 12, { gap: 0.8, lift: 0.7 });
    glass(ctx, -19, -206, 38, 42, 2);
    ctx.fillStyle = lin(ctx, 0, F - 14, 0, F - 2, [0, "#b7babf", 1, "#5c5f64"]); ctx.fillRect(-29, F - 13, 58, 11);                 // kick plate
    for (const hy of [-200, -150, -100]) { ctx.fillStyle = SH(0.5); rr(ctx, -31.4, hy - 3.4, 6, 8, 1); ctx.fill(); ctx.fillStyle = LT(0.45); rr(ctx, -32, hy - 4, 5.4, 7.4, 1); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, 15, -160, 10, 4.4, 1.6); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, -162, 0, -157, [0, "#e2e4e7", 1, "#7b7f85"]); rr(ctx, 14, -162, 10, 4, 1.6); ctx.fill();

    if (detail) {
      ctx.fillStyle = lin(ctx, 0, EAVE, 0, EAVE + 26, [0, `rgba(${SOOT},.2)`, 1, `rgba(${SOOT},0)`]); ctx.fillRect(-C, EAVE, C * 2, 26);
      runs(ctx, Rn, -C, C, EAVE, 30, 100);
      for (let i = 0; i < 8; i++) {
        const rx = -C + 8 + Rn() * (C * 2 - 16), rw = 2.5 + Rn() * 7;
        ctx.fillStyle = rad(ctx, rx, F, 0, rw, [0, `rgba(${RUST},.5)`, 0.5, `rgba(${RUST},.2)`, 1, `rgba(${RUST},0)`]);
        ctx.save(); ctx.translate(rx, F); ctx.scale(1, 0.7); ctx.fillRect(-rw, -rw, rw * 2, rw * 2); ctx.restore();
      }
      ctx.fillStyle = lin(ctx, 0, F - 40, 0, F, [0, `rgba(${P.dust},0)`, 1, `rgba(${P.dust},.2)`]); ctx.fillRect(-C, F - 40, C * 2, 40);
      if (k >= 0.8) { ctx.globalAlpha = 0.035; ctx.fillStyle = grain(ctx); ctx.fillRect(-C, EAVE, C * 2, F - EAVE); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(${P.shd},.6)`; ctx.lineWidth = 0.7; rr(ctx, -C + 0.35, EAVE + 0.35, C * 2 - 0.7, F - EAVE - 0.7, 1.2); ctx.stroke();
    tube(ctx, [[-38, -198], [-38, -104]], 1.8); tube(ctx, [[38, -198], [38, -104]], 1.8);                                     // grab rails by the door

    // --- near side of each veranda: entry gap by the cabin, then a sheet panel under an open rail
    for (const s of [-1, 1]) {
      const xa = s > 0 ? 214 : -308, pw = 94;
      ctx.fillStyle = SH(0.5); ctx.fillRect(xa + 1.5, PANEL + 1.5, pw, F - PANEL);
      ctx.fillStyle = P.base; ctx.fillRect(xa, PANEL, pw, F - PANEL);
      ctx.fillStyle = lin(ctx, 0, PANEL, 0, F, [0, LT(0.3), 0.3, LT(0.04), 1, SH(0.3)]); ctx.fillRect(xa, PANEL, pw, F - PANEL);
      ctx.fillStyle = lin(ctx, xa, 0, xa + pw, 0, [0, LT(0.1), 1, SH(0.14)]); ctx.fillRect(xa, PANEL, pw, F - PANEL);
      ctx.fillStyle = SP(0.62); ctx.fillRect(xa, PANEL, pw, 1.3); ctx.fillStyle = lin(ctx, 0, PANEL + 1.3, 0, PANEL + 5, [0, LT(0.3), 1, LT(0.05)]); ctx.fillRect(xa, PANEL + 1.3, pw, 3.7);
      ctx.fillStyle = SH(0.7); ctx.fillRect(xa, PANEL + 5, pw, 1.5);
      ctx.fillStyle = SP(0.5); ctx.fillRect(xa, -104, pw, 1); ctx.fillStyle = SH(0.6); ctx.fillRect(xa, -103, pw, 1.4);         // pressed rib
      if (detail) { runs(ctx, Rn, xa, xa + pw, PANEL + 6, 6, 30, 0.1); ctx.globalAlpha = 0.035; ctx.fillStyle = grain(ctx); ctx.fillRect(xa, PANEL, pw, F - PANEL); ctx.globalAlpha = 1; }
      ctx.strokeStyle = `rgba(${P.shd},.6)`; ctx.lineWidth = 0.7; ctx.strokeRect(xa, PANEL, pw, F - PANEL);
      // roof post at the outer corner, in the cabin's colour
      const px = s > 0 ? 304 : -310;
      ctx.fillStyle = P.base; ctx.fillRect(px, EAVE, 6, F - EAVE);
      ctx.fillStyle = lin(ctx, px, 0, px + 6, 0, [0, SP(0.6), 0.35, LT(0.2), 1, SH(0.6)]); ctx.fillRect(px, EAVE, 6, F - EAVE);
      ctx.fillStyle = lin(ctx, 0, EAVE, 0, EAVE + 16, [0, SH(0.6), 1, SH(0)]); ctx.fillRect(px, EAVE, 6, 16);
      // open rail and its uprights, gate post, and the handrail beside the entry
      const g = s * 213;
      tube(ctx, [[g, F - 1], [g, RAILY], [s * 306, RAILY]], 1.9);
      tube(ctx, [[s * 244, RAILY], [s * 244, PANEL]], 1.4); tube(ctx, [[s * 275, RAILY], [s * 275, PANEL]], 1.4);
      tube(ctx, [[s * 183, -198], [s * 183, -104]], 1.8);
    }

    // --- roof: one long slab, curved across the vehicle, so from the side it reads as a deep edge
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-312, EAVE, 624, 3);
    ctx.fillStyle = lin(ctx, 0, VAN.TOP + 6, 0, EAVE, [0, "#8d9197", 0.16, "#62666c", 0.6, "#3b3d41", 1, "#1c1d1f"]);
    rr(ctx, -316, VAN.TOP + 6, 632, EAVE - VAN.TOP - 6, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.36)"; ctx.fillRect(-308, VAN.TOP + 6.8, 616, 0.9);
    ctx.fillStyle = lin(ctx, 0, EAVE - 4.4, 0, EAVE - 0.6, [0, "#a7abb1", 1, "#484b4f"]); ctx.fillRect(-314, EAVE - 4.4, 628, 3.6);   // gutter
    for (let x = -260; x <= 260; x += 52) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x, VAN.TOP + 8, 0.9, EAVE - VAN.TOP - 13); ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x - 0.9, VAN.TOP + 8, 0.8, EAVE - VAN.TOP - 13); }
    for (const vx of [-86, 86]) {                                                                                               // ventilators
      ctx.fillStyle = lin(ctx, 0, VAN.TOP, 0, VAN.TOP + 8, [0, "#9a9ea4", 0.4, "#55585d", 1, "#232427"]); rr(ctx, vx - 13, VAN.TOP - 1, 26, 8.4, 4); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(vx - 8, VAN.TOP + 3, 16, 1.4);
    }
    if (detail) { ctx.save(); rr(ctx, -316, VAN.TOP + 6, 632, EAVE - VAN.TOP - 6, 7); ctx.clip(); runs(ctx, Rn, -310, 310, VAN.TOP + 8, 20, 16, 0.2); ctx.globalAlpha = 0.05; ctx.fillStyle = grain(ctx); ctx.fillRect(-316, VAN.TOP, 632, 40); ctx.restore(); ctx.globalAlpha = 1; }

    // --- last-vehicle board and tail lamp on the trailing end
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(279.4, -121.6, 21, 15);
    ctx.fillStyle = "#f1f0ea"; ctx.fillRect(278, -123, 21, 15); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.6; ctx.strokeRect(278, -123, 21, 15);
    ctx.fillStyle = "#16171a"; ctx.font = "700 9.4px Inter, Arial, sans-serif"; ctx.textBaseline = "alphabetic"; spaced(ctx, "LV", 281.6, -111.6, 0.9);
    ctx.fillStyle = lin(ctx, 0, -174, 0, -158, [0, "#62666c", 1, "#1c1d1f"]); rr(ctx, 309, -174, 9, 16, 2.4); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = rad(ctx, 318, -166, 0, 20, [0, "rgba(255,70,50,.5)", 1, "rgba(255,70,50,0)"]); ctx.fillRect(298, -186, 40, 40);
    ctx.fillStyle = "#ff4a38"; ctx.beginPath(); ctx.ellipse(318.4, -166, 1.7, 5, 0, 0, Math.PI * 2); ctx.fill();
  }

  Object.assign(Art, { loco, locoBogie, van });
})();
