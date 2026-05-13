import type { Party, SeatPos, Section, WestminsterSide } from "./types";

const SEAT_R = 1;
const SPACING = 2.4;

export interface DividerLine {
  points: { x: number; y: number }[];
}

export interface ArcLayoutResult {
  seats: SeatPos[];
  kind: "hemicycle" | "horseshoe";
  dividers: DividerLine[];
}

export interface WestmLayoutResult {
  seats: SeatPos[];
  kind: "westminster";
  dividers: DividerLine[];
}

interface Group {
  sectionId?: string;
  seats: { partyId: string; sectionId?: string }[];
}

/** Build ordered seat groups: one per non-empty section, plus a trailing group for unsectioned parties. */
function buildGroups(parties: Party[], sections: Section[]): Group[] {
  const groups: Group[] = [];
  const used = new Set<string>();
  const relevant = sections.filter((s) =>
    s.partyIds.some((id) => parties.some((p) => p.id === id && p.seats > 0)),
  );
  for (const sec of relevant) {
    const seats: Group["seats"] = [];
    for (const pid of sec.partyIds) {
      const p = parties.find((x) => x.id === pid);
      if (!p || used.has(pid)) continue;
      used.add(pid);
      for (let i = 0; i < p.seats; i++) seats.push({ partyId: pid, sectionId: sec.id });
    }
    if (seats.length > 0) groups.push({ sectionId: sec.id, seats });
  }
  const restSeats: Group["seats"] = [];
  for (const p of parties) {
    if (used.has(p.id)) continue;
    for (let i = 0; i < p.seats; i++) restSeats.push({ partyId: p.id });
  }
  if (restSeats.length > 0) groups.push({ seats: restSeats });
  return groups;
}

/** Allocate `total` units across rows proportional to capacity. */
function allocate(total: number, caps: number[]): number[] {
  const sum = caps.reduce((a, b) => a + b, 0);
  if (sum === 0) return caps.map(() => 0);
  const alloc = caps.map((c) => Math.min(c, Math.floor((total * c) / sum)));
  let diff = total - alloc.reduce((a, b) => a + b, 0);
  let i = caps.length - 1;
  let safety = 100000;
  while (diff > 0 && safety-- > 0) {
    if (alloc[i] < caps[i]) {
      alloc[i]++;
      diff--;
    }
    i = (i - 1 + caps.length) % caps.length;
  }
  return alloc;
}

interface Row {
  /** Arc length of this row (used for capacity). */
  length: number;
  /** Place a point at parameter u in [0,1] along the row's path. */
  place: (u: number) => { x: number; y: number };
}

function buildHemicycleRows(R: number): Row[] {
  const r0 = R;
  const rows: Row[] = [];
  for (let i = 0; i < R; i++) {
    const r = (r0 + i) * SPACING;
    rows.push({
      length: Math.PI * r,
      place: (u) => {
        const a = Math.PI - u * Math.PI;
        return { x: r * Math.cos(a), y: -r * Math.sin(a) };
      },
    });
  }
  return rows;
}

function buildHorseshoeRows(R: number): Row[] {
  const r0 = R;
  const H = r0 + R;
  const rows: Row[] = [];
  for (let i = 0; i < R; i++) {
    const halfWidth = (r0 + i) * SPACING;
    const armLen = H * SPACING;
    const arcLen = Math.PI * halfWidth;
    const total = 2 * armLen + arcLen;
    rows.push({
      length: total,
      place: (u) => {
        const s = u * total;
        if (s <= armLen) return { x: -halfWidth, y: -armLen + s };
        const s2 = s - armLen;
        if (s2 <= arcLen) {
          const t = s2 / arcLen;
          const a = Math.PI - t * Math.PI;
          return { x: halfWidth * Math.cos(a), y: halfWidth * Math.sin(a) };
        }
        const s3 = s2 - arcLen;
        return { x: halfWidth, y: -s3 };
      },
    });
  }
  return rows;
}

/**
 * Place groups along arc-style rows so section boundaries are at the SAME
 * normalized parameter u across every row. That guarantees boundary lines
 * are perfectly straight (radial in hemicycle / on the horseshoe arc, and
 * horizontal on the horseshoe arms).
 */
function arcLayout(
  parties: Party[],
  sections: Section[],
  buildRows: (R: number) => Row[],
  kind: "hemicycle" | "horseshoe",
): ArcLayoutResult {
  const groups = buildGroups(parties, sections);
  const total = groups.reduce((a, g) => a + g.seats.length, 0);
  if (total === 0) return { seats: [], kind, dividers: [] };

  const numGaps = Math.max(0, groups.length - 1);
  // Gap width as a fraction of normalized u. Tuned to look like a clean break
  // ~1.5 seat widths on the outer row.
  const GAP_U_BASE = 0.04;

  for (let R = 1; R < 300; R++) {
    const rows = buildRows(R);
    // Use outer row to set gapU so it matches a visible gap there.
    const outer = rows[rows.length - 1];
    const gapU = Math.min(0.15, (1.5 * SPACING) / outer.length);
    void GAP_U_BASE;
    const usefulU = Math.max(0, 1 - gapU * numGaps);
    if (usefulU <= 0) continue;

    // Capacity check: sum across rows of seats fit into useful arc.
    const totalCapacity = rows.reduce(
      (a, r) => a + Math.floor((r.length * usefulU) / SPACING) + 1,
      0,
    );
    if (totalCapacity < total) continue;

    const weights = groups.map((g) => g.seats.length / total);
    const seats: SeatPos[] = [];

    // Allocate each group's seats across rows.
    for (let g = 0; g < groups.length; g++) {
      const w = weights[g];
      const caps = rows.map((r) => Math.max(0, Math.floor((r.length * w * usefulU) / SPACING) + 1));
      const alloc = allocate(groups[g].seats.length, caps);

      // Group window in u: [uStart, uStart + w*usefulU]
      let uStart = 0;
      for (let gg = 0; gg < g; gg++) uStart += weights[gg] * usefulU + gapU;
      const span = w * usefulU;

      const queue = [...groups[g].seats];
      const maxCols = alloc.reduce((a, b) => Math.max(a, b), 0);
      // Column-major placement: fill column 0 across all rows (inner→outer),
      // then column 1, etc. Within each row, seats are evenly spaced across
      // the group's u window using that row's own count.
      // Pre-compute per-row write index so we keep the natural order intact.
      const rowSeats: { i: number; k: number; u: number }[] = [];
      for (let k = 0; k < maxCols; k++) {
        for (let i = 0; i < rows.length; i++) {
          if (k >= alloc[i]) continue;
          const n = alloc[i];
          const u = uStart + ((k + 0.5) / n) * span;
          rowSeats.push({ i, k, u });
        }
      }
      for (const rs of rowSeats) {
        const item = queue.shift();
        if (!item) break;
        const pt = rows[rs.i].place(rs.u);
        seats.push({ x: pt.x, y: pt.y, partyId: item.partyId, sectionId: item.sectionId });
      }
    }

    // Boundary divider polylines: at each gap midpoint, span all rows.
    const dividers: DividerLine[] = [];
    for (let g = 1; g < groups.length; g++) {
      let uStart = 0;
      for (let gg = 0; gg < g; gg++) uStart += weights[gg] * usefulU + gapU;
      const uBoundary = uStart - gapU / 2;
      // Inner boundary: just inside the innermost row; outer: just past outermost.
      const points: { x: number; y: number }[] = [];
      // Extend a bit inward (0.6 spacing) and outward (0.6 spacing) for visual reach.
      const inner = rows[0].place(uBoundary);
      const outer = rows[rows.length - 1].place(uBoundary);
      // Compute direction from inner to outer for extension.
      const dx = outer.x - inner.x;
      const dy = outer.y - inner.y;
      const len = Math.hypot(dx, dy) || 1;
      const ext = SPACING * 0.6;
      points.push({ x: inner.x - (dx / len) * ext, y: inner.y - (dy / len) * ext });
      points.push({ x: outer.x + (dx / len) * ext, y: outer.y + (dy / len) * ext });
      dividers.push({ points });
    }

    return { seats, kind, dividers };
  }
  return { seats: [], kind, dividers: [] };
}

export function hemicycleLayout(parties: Party[], sections: Section[]): ArcLayoutResult {
  return arcLayout(parties, sections, buildHemicycleRows, "hemicycle");
}

export function horseshoeLayout(parties: Party[], sections: Section[]): ArcLayoutResult {
  return arcLayout(parties, sections, buildHorseshoeRows, "horseshoe");
}

/* ---------------- WESTMINSTER ---------------- */

export function westminsterLayout(parties: Party[], sections: Section[]): WestmLayoutResult {
  const seats: SeatPos[] = [];
  const dividers: DividerLine[] = [];
  const dx = SPACING;
  const dy = SPACING;
  const aisle = SPACING * 2.5;
  const SECTION_GAP_COLS = 1;

  function sideGroups(side: WestminsterSide): Group[] {
    const sideParties = parties.filter((p) => p.side === side);
    const sideSections = sections.filter((s) => s.side === side);
    return buildGroups(sideParties, sideSections);
  }

  const oppGroups = sideGroups("opposition");
  const govGroups = sideGroups("government");
  const crossGroups = sideGroups("crossbench");

  const oppCount = oppGroups.reduce((a, g) => a + g.seats.length, 0);
  const govCount = govGroups.reduce((a, g) => a + g.seats.length, 0);
  const crossCount = crossGroups.reduce((a, g) => a + g.seats.length, 0);

  const benchRows = Math.max(2, Math.ceil(Math.sqrt(Math.max(oppCount, govCount) / 4)));
  const crossRows = Math.max(2, Math.ceil(Math.sqrt(crossCount / 6)));

  function bench(groups: Group[], rows: number, originX: number, originY: number, dirX: 1 | -1) {
    let colCursor = 0;
    const groupBoundaries: number[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      if (gi > 0) {
        groupBoundaries.push(colCursor);
        colCursor += SECTION_GAP_COLS;
      }
      const g = groups[gi];
      const cols = Math.max(1, Math.ceil(g.seats.length / rows));
      let i = 0;
      for (let c = 0; c < cols && i < g.seats.length; c++) {
        for (let r = 0; r < rows && i < g.seats.length; r++) {
          const item = g.seats[i++];
          seats.push({
            x: originX + dirX * (colCursor + c) * dx,
            y: originY + r * dy,
            partyId: item.partyId,
            sectionId: item.sectionId,
          });
        }
      }
      colCursor += cols;
    }
    // Convert column boundaries to dividers.
    for (const colB of groupBoundaries) {
      const x = originX + dirX * (colB - 0.5) * dx;
      const y0 = originY - dy * 0.5;
      const y1 = originY + (rows - 1 + 0.5) * dy;
      dividers.push({ points: [{ x, y: y0 }, { x, y: y1 }] });
    }
  }

  bench(oppGroups, benchRows, -aisle / 2, 0, -1);
  bench(govGroups, benchRows, aisle / 2, 0, 1);

  // Crossbench row above.
  if (crossCount > 0) {
    const crossOriginY = -(benchRows + 1) * dy - SPACING * 0.5;
    let colCursor = 0;
    const crossCols = Math.max(
      1,
      crossGroups.reduce((a, g) => a + Math.ceil(g.seats.length / crossRows), 0) +
        Math.max(0, crossGroups.length - 1) * SECTION_GAP_COLS,
    );
    const crossWidth = (crossCols - 1) * dx;
    const originX = -crossWidth / 2;

    const groupBoundaries: number[] = [];
    for (let gi = 0; gi < crossGroups.length; gi++) {
      if (gi > 0) {
        groupBoundaries.push(colCursor);
        colCursor += SECTION_GAP_COLS;
      }
      const g = crossGroups[gi];
      const cols = Math.max(1, Math.ceil(g.seats.length / crossRows));
      let i = 0;
      for (let c = 0; c < cols && i < g.seats.length; c++) {
        for (let r = 0; r < crossRows && i < g.seats.length; r++) {
          const item = g.seats[i++];
          seats.push({
            x: originX + (colCursor + c) * dx,
            y: crossOriginY - r * dy,
            partyId: item.partyId,
            sectionId: item.sectionId,
          });
        }
      }
      colCursor += cols;
    }
    for (const colB of groupBoundaries) {
      const x = originX + (colB - 0.5) * dx;
      const y1 = crossOriginY + dy * 0.5;
      const y0 = crossOriginY - (crossRows - 1 + 0.5) * dy;
      dividers.push({ points: [{ x, y: y0 }, { x, y: y1 }] });
    }
  }

  return { seats, kind: "westminster", dividers };
}

export function computeLayout(
  layout: "hemicycle" | "horseshoe" | "westminster",
  parties: Party[],
  sections: Section[],
): ArcLayoutResult | WestmLayoutResult {
  if (layout === "hemicycle") return hemicycleLayout(parties, sections);
  if (layout === "horseshoe") return horseshoeLayout(parties, sections);
  return westminsterLayout(parties, sections);
}

export const SEAT_RADIUS = SEAT_R;
export const SEAT_SPACING = SPACING;
