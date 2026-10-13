// The demurrage meter in the left panel, drawn in the house dot-matrix style.
// The centre of the grid is the moment free time runs out. To its left, the axis is the
// free time being used up, half an hour a dot. To its right, every hour over stacks up
// another block of orange: the charge, as a staircase.
const Meter = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const OX = 79, OY = 76, STEP = 5.27, COLS = 15, ROWS = 14;
  const OVER_MIN = 30;                                             // right of centre, a column is half an hour
  const UNIT = Yard.rules.rate * Yard.rules.wagons;                // one hour at the base rate
  const rows = (hours) => Math.min(ROWS, Math.round((Yard.charge(hours) / UNIT) * 2));
  const hourOf = (col) => Math.ceil(col / 2);

  // m: { placed, free (minutes of free time; the left axis always spans all of it),
  //      elapsed (minutes since placement), over (minutes past free time),
  //      hours (charged so far), plan (hours that will be charged if released as scheduled) }
  // Returns where the marker sits, in the svg's own units.
  function draw(svg, m) {
    const parts = [];
    const dot = (cx, cy, r, fill, op) => parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${fill}"${op < 1 ? ` opacity="${op.toFixed(2)}"` : ""}/>`);
    if (m.hours > 0) {
      const w = Math.min(COLS, m.hours * 2 + 4) * STEP, h = (rows(m.hours) + 4) * STEP;
      parts.push(`<defs><radialGradient id="bloom" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`);
      parts.push(`<rect x="${OX - STEP * 2}" y="${OY - h}" width="${w}" height="${h}" fill="url(#bloom)"/>`);
    }
    const freeCol = m.free / 14, used = m.placed ? Math.min(14, m.elapsed / freeCol) : -1;
    for (let j = -ROWS; j <= ROWS; j++) {
      for (let i = -COLS; i <= COLS; i++) {
        const x = OX + i * STEP, y = OY + j * STEP;
        if (i > 0 && j < 0 && -j <= rows(hourOf(i))) {
          const h = hourOf(i);
          if (h <= m.hours) { dot(x, y, 2.75, "#fc7f37", 1); continue; }                        // charged
          if (h <= m.plan) { dot(x, y, 1.55, "#fc8a48", 0.5); continue; }                       // on its way, if nothing changes
        }
        if (j === 0 && i <= 0) { i + 14 <= used ? dot(x, y, 0.95, "#111", 0.95) : dot(x, y, 0.72, "#555", 0.55); continue; }
        if (j === 0) { dot(x, y, 0.7, "#666", 0.5); continue; }
        if (i === 0 && j > 0) { dot(x, y, 0.75, "#333", 0.75 - j * 0.035); continue; }
        if (i === 0) { dot(x, y, 0.72, "#555", 0.6 + j * 0.03); continue; }                    // the limit, running up
        const e = Math.max(Math.abs(i) / COLS, Math.abs(j) / ROWS);
        dot(x, y, 0.62, "#9a9a9a", 0.62 - e * 0.3);
      }
    }
    dot(OX, OY, 1.6, "#000", 1);
    let mark = null;
    if (m.placed) {
      mark = m.over > 0
        ? { x: OX + Math.min(COLS, m.over / OVER_MIN) * STEP, y: OY - rows(m.hours) * STEP }
        : { x: OX + (used - 14) * STEP, y: OY };
      dot(mark.x, mark.y, 5, "#000", 1);
    }
    svg.innerHTML = parts.join("");
    return mark;
  }

  // What the chart says at horizontal position x: minutes after placement, and the charge by then.
  function probe(x, free) {
    const col = Math.max(-14, Math.min(COLS, Math.round((x - OX) / STEP)));
    const hours = col > 0 ? hourOf(col) : 0;
    const minutes = col > 0 ? free + col * OVER_MIN : (col + 14) * (free / 14);
    return { minutes, hours, cost: Yard.charge(hours), x: OX + col * STEP, y: OY - rows(hours) * STEP };
  }

  return { draw, probe };
})();
