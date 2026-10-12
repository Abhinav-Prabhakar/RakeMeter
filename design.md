# Design reference

The source of truth for how this product looks and moves. Every new component is checked against this file before it ships. Values are taken from the working code (`styles.css`, `art.js`, `train.js`, `motion.js`), not from memory.

The look comes from the reference mock-up in `references/`: a calm, pale-grey glass interface where one photoreal train is the hero and everything else stays quiet around it.

---

## 1. Principles

1. **One hero.** The train on the centre stage is the only thing that is large, coloured and detailed. Nothing else competes with it.
2. **Quiet by default.** A region shows only what someone needs at a glance. Everything else waits behind a hover, a press, or a drawer. If a panel needs a paragraph to explain, it has too much in it.
3. **White space is a component.** Padding and gaps are fixed (section 3). When content doesn't fit, cut content. Never tighten spacing or shrink type.
4. **Show, then tell.** Prefer a picture, a dot chart or a position on a line over a sentence or a number. Text labels are short nouns.
5. **Orange means "look here".** Orange is the only accent we own. It marks the live thing, the money, the part that needs attention. Used rarely, it stays loud.
6. **Black means "this one".** Solid black is selection and the primary action: the active nav button, the one round action on the stage.
7. **Everything is grey on grey.** Surfaces differ by two or three levels of grey and a hairline, never by drop shadows or colour blocks.
8. **Motion has weight.** Things ease in and out as if they have mass. Nothing snaps, bounces more than once, or moves without a reason.

---

## 2. Canvas

- Fixed artboard **1920 × 1080**, scaled uniformly to fit the window (`fit()` in `app.js`). All measurements in this file are artboard pixels.
- Every element is positioned absolutely on the artboard. There is no responsive reflow.
- Canvas artwork is rendered at `artboard scale × devicePixelRatio`, capped at 3, so it is sharp on any display.

---

## 3. Layout

```
0 ┌──────────────────────────────────────────────────────────────┐
  │ header (0–112): logo · round nav buttons · user              │
114 ├───────────┬───────────────────────────────┬────────────────┤
  │ left      │ centre stage                  │ right card A   │ 114–466
  │ panel     │ (canvas, 984 × 731)           ├────────────────┤
  │ 6–456     │ 462–1446                      │ right card B   │ 478–845
845 ├───────────┴───────────────────────────────┴────────────────┤
  │ controls row (860–912): slider centred · three tools right   │
931 ├──────────────────────────────────────────────────────────────┤
  │ card strip (931 → runs off the bottom edge)                  │
1080 └──────────────────────────────────────────────────────────────┘
```

| Thing | Value |
|---|---|
| Header height | 112 |
| Panel top / bottom | 114 / 845 (height 731) |
| Left panel | x 6, width 450 |
| Centre panel | x 462, width 984 |
| Right column | x 1452, width 462; card A height 352, card B height 367, 12 between |
| Gap between panels | 6 |
| Panel radius | 22 |
| Panel inner padding | 30 left/right; title baseline block at top 30; corner button 11 from the edges |
| Controls row | round buttons at top 860 |
| Strip cards | top 931, width 230, pitch 238 (8 gap), first card at x 66, radius 22. Cards are 200 tall and deliberately cut off by the screen edge |
| Vertical rhythm in a panel | title 30 → label 76 → display value 98 → image ~194 → data rows every 70 (297, 367, 436) |

---

## 4. Colour

### Interface

| Token | Value | Use |
|---|---|---|
| `--bg` | `#e5e5e5` | Header band |
| `--surface` | `#e1e1e1` | Panels, cards, the stage |
| `--card-active` | `#f0f0f0` | The selected strip card |
| Hairline dark | `rgba(0,0,0,.085)` – `.11` | Button and card outlines, select outlines |
| Hairline light | `rgba(255,255,255,.28)` – `.6` | Glass edge on panels, top-inner highlight on buttons |
| `--ink` | `#000` | Display values, icons, active fills |
| Ink soft | `#141414` – `#1e1e1e` | Body values, titles |
| Label | `#a9a9a9` | Data labels |
| `--muted` | `#9d9d9d` | Secondary lines (user role) |
| `--muted-2` | `#b3b3b3` | The small label above a display value |
| Control label | `#8a8a8a` | Label above a select |
| **`--orange`** | **`#fc7f37`** | **The accent. Chart highlights, attention, money** |
| Orange soft | `#fc8a48` at 20–90% | Halo around an orange cluster |
| Orange glass | `rgba(255,170,120,.5)` + white text | Pill sitting on orange artwork |

Status dots (5 px, only inside selects and pills): green `#6f8d00`, blue `#1677e6`, orange `#f5752e`, grey `#8c8c8c`. Positive arrow green `#5cbd3c`. Alert dot red `#f2453d`. Brand red `#eb0000` belongs to the logo only.

**Rules**
- No new hues. A new state is expressed with orange, black, or a grey step.
- Orange never fills a panel or a large UI area. In the interface it appears as dots, a thin line, a small pill, or a number.
- The big orange object on screen is always artwork (the wagon), never chrome.

### Artwork paint

| Paint | Base | Shadow tint | Light tint | Glint |
|---|---|---|---|---|
| Orange (primary) | `#d8510c` | `96,14,0` | `255,170,84` | `255,222,184` |
| White | `#e6e5e1` | `58,62,72` | white | white |
| Grey (inactive / not here yet) | `#a09f9c` | `26,28,34` | `236,236,234` | `250,250,250` |
| Ghost (empty slot) | `#f1f1f1` at ~86% + white dashed outline | — | — | — |
| Running gear | greys `#262626` – `#a9a9a9`, slightly warm on castings | — | — | — |

Livery print on orange is cream `#ffe6c6`; on white and grey it is a neighbouring grey.

---

## 5. Type

Two families. **Urbanist** (standing in for Lufga; the letter-spacing below compensates for its narrower letters, so keep it) for everything people read. **Inter** for codes, IDs and anything stencilled.

| Role | Family | Size / weight | Colour | Tracking |
|---|---|---|---|---|
| Display value (the big ID) | Urbanist | 34.6 / 300, line 48 | `#000` | 3.1 |
| Label above a display value | Urbanist | 14 / 300 | `#b3b3b3` | 1.05 |
| Panel title | Urbanist | 13.4 / 400 | `#1e1e1e` | 0.1 |
| Data label | Urbanist | 13.5 / 300 | `#a9a9a9` | 1.15 |
| Data value | Urbanist | 16 / 400 | `#141414` | 0.93 |
| Control label | Urbanist | 12 / 400 | `#8a8a8a` | 0.1 |
| Control text | Urbanist | 14 / 460 | `#0f0f0f` | 0.3 |
| Tooltip pill | Urbanist | 12.6 / 400, number 13.4 | `#777`, number `#3a3a3a` | 0.75 |
| Chart title and axis | Urbanist | 10.2–10.4 / 600 | `#333` – `#444` | 0.45–0.7 |
| User name / role | Urbanist | 16.6 / 470 · 14.6 / 400 | `#0a0a0a` · `#9d9d9d` | 0 |
| Card code | Inter | 12.2 / 500 | `#111` | −0.1 |
| Pill on a thumbnail | Inter | 9.6 / 500 | per pill | −0.1 |

**Rules**
- Light weights for big things, regular for small. Nothing bolder than 600, and 600 only at 10 px.
- One display value per panel. It is centred, with its small label above it.
- No sentence longer than about five words anywhere on the main screen. Longer text lives in a tooltip or drawer.
- Numbers that change keep a fixed width so nothing jitters (`font-variant-numeric: tabular-nums`).

---

## 6. Surfaces

**Panel (glass).** Radius 22. Fill `--surface` with a 6% white sheen fading out over the top 30%. Edge is two hairlines: an inner 1 px white at 28% and an outer 1 px black at 1.8%. `backdrop-filter: blur(18px)`. No drop shadow.

**Strip card.** Radius 22, fill `--surface`, 1 px outline black 11%, 1 px white top-inner highlight at 35%. **Selected:** fill `#f0f0f0`, outline turns white 60%, plus a 1 px white ring at 40%. Selection is a change of lightness only.

**Depth** comes from lightness and hairlines. The only soft shadows allowed are the feathered glow behind a tooltip pill and the contact shadows inside the artwork.

---

## 7. Components

| Component | Spec |
|---|---|
| **Round button** | 52 × 52 circle, 1 px outline black 8.5%, faint white diagonal sheen, white top-inner highlight. Icon 19 px (cog 21), solid black, drawn on a 16-unit grid; line icons use 1.3–1.6 stroke with round caps. **Active:** black fill, white icon, 1.5 px white ring |
| **Stage action** | 54 × 54 solid black circle, white 16 px icon. At most one on the stage. It fades and shrinks (to 0.7) while the train moves |
| **Display block** | Small label (top 76) + display value (top 98), both centred in the panel |
| **Data pair** | Label over value, 4 px apart. Pairs sit on a two-column grid (x 30 and x 312 in the left panel), rows 70 apart. Five pairs is the most a panel holds |
| **Select pill** | 218 × 40, radius 20, 1 px outline black 10%, white top-inner highlight. Centred content: 5 px status dot, text, 10 px chevron. A control label sits 24 above it |
| **Tooltip pill** | Height 29, radius 15, fill `rgba(219,219,219,.82)`, feathered glow `0 0 14px 4px rgba(222,222,222,.95)`, 3 px backdrop blur. Small coloured glyph, a darker number, then grey words. This is the only tooltip style |
| **Slider** | 1 px track fading at both ends, 101 long, between two round buttons. Knob is an 8 px black dot inside a 16 px circle of black at 8% |
| **Thumbnail pill** | Height 18, radius 9, centred on the object it names. On white art: grey glass with dark text. On orange art: orange glass with white text. On grey art: light glass with white text |
| **Dot-matrix chart** | The house chart. A grid of ~0.6 px grey dots at 5.27 pitch that fades toward its edges; darker dotted axes; an orange cluster of 2.75 px dots with a halo of smaller, fainter dots and a soft white bloom behind it; one black dot as the marker; one tooltip pill. Three tiny axis labels at most |

New components are built from these parts. If something genuinely new is needed, it must use the same radii (22 for containers, 20 for pills, full circle for buttons), the same hairlines and the same type roles.

---

## 8. Density and what stays hidden

The reference screen sets the budget. A region may hold **at most** what it holds there.

| Region | Budget |
|---|---|
| Left panel | 1 title, 1 display block, 1 image, up to 5 data pairs, 1 chart with one pill |
| Centre stage | 1 title, the train, 2 arrows, 1 black action |
| Right card | 1 small title, 1 display block, 1 image, 2 labelled selects |
| Controls row | 1 slider, 3 tools |
| Strip card | 2 codes, 1 thumbnail, up to 2 pills |

**Reveal patterns**, in order of preference:

1. **Tooltip pill on hover.** For a single extra fact about the thing under the pointer. One pill at a time. In 120 ms, out 80 ms.
2. **Card lift.** A strip card rises to show one line that normally sits below the screen edge. The card is already taller than what is visible, so nothing is added to the layout.
3. **Quiet to loud.** Secondary marks (axis labels, the next step on a line) sit at low contrast and come up to full contrast while their panel is hovered.
4. **Drawer.** Anything tabular or explanatory opens from a cog. It is never on the main screen.

If a fact is not needed to decide what to do in the next minute, it is not visible by default.

---

## 9. Motion

| Kind | Timing |
|---|---|
| Hide / dismiss | 100 ms, ease |
| Colour, opacity, selection | 200–250 ms, ease |
| Pop in (stage action, pills) | 320 ms, `cubic-bezier(.2,.9,.3,1.25)`, from scale 0.7 |
| Train travel | Minimum-jerk curve; `0.5 + 0.48·√(cars travelled)` seconds: about 1.0 s for a neighbour, about 1.8 s for seven |
| After a stop | Body rocks on its springs (~2 Hz, lightly damped, under 0.35°); couplers take up slack car by car |

- The train's switching animation is a signature. It is not shortened, replaced with a fade, or bypassed.
- While the train is moving, overlays on the stage fade out and return when it stops.
- Fast frames are motion-blurred by averaging sub-frames (shutter 0.6 of a frame). Wheels turn at the true rolling rate.
- `prefers-reduced-motion` jumps straight to the end state.
- Interface elements never slide across the screen. They fade, lift a few pixels, or scale slightly from their own centre.

---

## 10. Artwork

All train artwork is drawn in code (`art.js`) so it stays sharp at any size and can be animated in parts.

**Camera and light**
- True side elevation. No perspective, no three-quarter views.
- One key light from the upper left. Faces toward it get a warm lift; faces away get a deep, tinted shadow. Recessed areas darken; ledges catch a thin bright line on their upper edge.
- Shadows are never neutral grey on coloured paint: they move toward the paint's shadow tint (section 4). This is what keeps paint looking like paint.

**Palette discipline**
- Running gear, underframes, track and structures are **greyscale**, slightly warm on cast parts.
- The load-carrying body is the only coloured object. Orange is the default; grey and white are states.

**Construction**
- Units: 64 per metre (a 1 m wheel is 64 across). Origin at the vehicle centre on the rail top.
- Build each object in this order: flat paint → printed livery → relief shading as translucent tints (so print follows the relief) → frame members → hardware → wear → 0.7 px silhouette line.
- Every raised part gets three things: a lit edge, a shaded edge, and a short cast shadow on its lee side.
- Wear is restrained and specific: water runs from top edges, rust at lower welds, chips on frame members, a few scuffs, road dust low down, 3% film grain. The object should look used, not derelict.
- Text on artwork is stencil-like Inter 600–700 with open tracking.
- A random seed per object varies dents, runs and tone, so no two look copied.

**Thumbnails** are the same drawing code at a smaller scale with fine wear switched off. They are never separate images.

**Staging**
- The selected vehicle rests centred at x 488 of the stage, on a rail at y 624, with its couplers reaching toward the panel edges.
- A soft contact shadow sits under each vehicle. The rail is redrawn over the wheel flanges.
- Sprites are rasterised once per pixel density and only composited per frame.

---

## 11. The Yard screen

The existing screen, re-used region for region. Compared with `plan.md`, this is deliberately thinner: each region keeps the density it has today, and the rest moves behind hover.

| Region | Shows by default | Revealed on hover or press |
|---|---|---|
| **Centre stage** | One orange open wagon of the selected rake, loaded or empty. Two arrows. One black badge | Hovering the wagon: a pill with its number and weight |
| **Strip** | One card per rake: sequence, rake ID, wagon thumbnail, one pill carrying the single most important fact (time left, or the charge) | Card lifts to show one more line (progress and where it is) |
| **Left panel** | Rake ID as the display value, a thumbnail, up to five facts, one dot chart for the meter | Hovering the chart moves the pill along it |
| **Right card A** | Where the rake goes: one display value, one picture, two selects | Queue detail in a pill |
| **Right card B** | What the rake is owed: one display value, one picture, two selects | The rule behind each allowance in a pill |
| **Controls row** | The slider, re-used as the day's time. Three tools | — |

Wagon colour carries state on both the stage and the cards: **orange** = on site, **grey** = not here yet, **no coal** = unloaded.

Switching rakes uses the existing train animation unchanged: the track rolls through the in-between wagons and settles on the chosen one.

The original flatcar and its containers are kept, not replaced. The stage can run either vehicle (`VEHICLES` in `train.js`); the Yard screen uses the wagon, and `?vehicle=flatcar` shows the flatcars exactly as they were. Their drawing code in `art.js` must not be removed.

### Build order

Each component is built, wired into the live screen, and reviewed before the next starts.

| # | Component | Status |
|---|---|---|
| 1 | **Wagon**: photoreal open wagon and coal load, on the stage and in every thumbnail, with the switching animation intact | In review |
| 2 | **Rake cards**: strip content, status pill, hover lift | Next |
| 3 | **Rake panel**: left panel content and the meter chart | — |
| 4 | **Stage overlays**: progress badge, wagon hover pill | — |
| 5 | **Right cards**: plan and allowances | — |
| 6 | **Controls**: time slider, view toggle | — |
| 7 | **Board view**: the timeline mode of the stage | — |

The designs for 2–7 are settled when each is built, not before.

---

## 12. Checklist for any new component

- [ ] Fits its region's budget (section 8) without changing padding or type sizes
- [ ] Uses only the colours in section 4; orange appears once, for the thing that matters
- [ ] Every piece of text maps to a role in section 5
- [ ] Built from the parts in section 7, same radii and hairlines
- [ ] Secondary facts are behind one of the four reveal patterns
- [ ] Transitions use the timings in section 9; nothing slides across the screen
- [ ] Artwork follows section 10 and is drawn in code at 64 units per metre
- [ ] Checked at 1× and 2× pixel density, at rest and mid-animation
