// Motion model for the train. Pure maths, no DOM.
//
// The consist follows a minimum-jerk (quintic) trajectory: position, velocity and
// acceleration are all continuous, so it pulls away and brakes like something heavy.
// A new target can be planned from any in-flight state, which keeps re-selection smooth.
// The acceleration of that trajectory then drives two damped springs per car:
// suspension pitch (the load rocking on its bogies) and coupler slack.
const Motion = (() => {
  // Quintic from (p0, v0, a0) to rest at pf, lasting T seconds.
  function plan(p0, v0, a0, pf, T, t0 = 0) {
    const d = pf - p0, T2 = T * T, T3 = T2 * T;
    return {
      t0, T, pf,
      c: [
        p0, v0, a0 / 2,
        (20 * d - 12 * v0 * T - 3 * a0 * T2) / (2 * T3),
        (-30 * d + 16 * v0 * T + 3 * a0 * T2) / (2 * T3 * T),
        (12 * d - 6 * v0 * T - a0 * T2) / (2 * T3 * T2),
      ],
    };
  }

  function at(seg, time) {
    const t = time - seg.t0;
    if (t <= 0) return { p: seg.c[0], v: seg.c[1], a: seg.c[2] * 2 };
    if (t >= seg.T) return { p: seg.pf, v: 0, a: 0 };
    const [c0, c1, c2, c3, c4, c5] = seg.c;
    return {
      p: c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * c5)))),
      v: c1 + t * (2 * c2 + t * (3 * c3 + t * (4 * c4 + t * 5 * c5))),
      a: 2 * c2 + t * (6 * c3 + t * (12 * c4 + t * 20 * c5)),
    };
  }

  // Travel time for a trip of `cars` car-lengths: quick for a neighbour,
  // growing with the square root of distance so long hops stay under two seconds.
  function duration(cars) {
    return 0.5 + 0.48 * Math.sqrt(Math.max(cars, 0.15));
  }

  // One semi-implicit Euler step of x'' = -w²x - 2zw·x' + drive.
  function spring(s, drive, dt, w, z) {
    s.v += (-w * w * s.x - 2 * z * w * s.v + drive) * dt;
    s.x += s.v * dt;
  }

  const soft = (x, lim) => lim * Math.tanh(x / lim);

  return { plan, at, duration, spring, soft };
})();

if (typeof module !== "undefined") module.exports = Motion;
