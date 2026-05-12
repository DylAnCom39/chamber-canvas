import type { Party, SeatPos, Section, WestminsterSide } from "./types";

const SEAT_R = 1;
const SPACING = 2.4; // center-to-center distance in SVG units
/** Empty seat slots inserted between sections to physically separate them. */
const SECTION_GAP = 2;

interface FlatItem {
  partyId?: string; // undefined = blank gap
  sectionId?: string;
}

/**
 * Order parties by their first containing section, inserting empty gap slots
 * between sections so they are physically separated in the diagram.
 */
function flattenWithSections(parties: Party[], sections: Section[]): FlatItem[] {
  const items: FlatItem[] = [];
  const used = new Set<string>();
  const relevant = sections.filter((s) =>
    s.partyIds.some((id) => parties.some((p) => p.id === id && p.seats > 0)),
  );

  relevant.forEach((sec, idx) => {
    if (idx > 0) for (let g = 0; g < SECTION_GAP; g++) items.push({});
    sec.partyIds.forEach((pid) => {
      const p = parties.find((x) => x.id === pid);
      if (!p || used.has(pid)) return;
      used.add(pid);
      for (let i = 0; i < p.seats; i++) items.push({ partyId: pid, sectionId: sec.id });
    });
  });

  const rest = parties.filter((p) => !used.has(p.id) && p.seats > 0);
  if (rest.length > 0 && relevant.length > 0) {
    for (let g = 0; g < SECTION_GAP; g++) items.push({});
  }
  rest.forEach((p) => {
    for (let i = 0; i < p.seats; i++) items.push({ partyId: p.id });
  });
  return items;
}

/** Allocate `total` units across rows proportional to capacity. */
function allocate(total: number, caps: number[]): number[] {
  const sum = caps.reduce((a, b) => a + b, 0);
  if (sum === 0) return caps.map(() => 0);
  const alloc = caps.map((c) => Math.min(c, Math.floor((total * c) / sum)));
  let diff = total - alloc.reduce((a, b) => a + b, 0);
  // distribute remaining seats outward then inward
  let i = caps.length - 1;
  let safety = 10000;
  while (diff > 0 && safety-- > 0) {
    if (alloc[i] < caps[i]) {
      alloc[i]++;
      diff--;
    }
    i = (i - 1 + caps.length) % caps.length;
  }
  return alloc;
}

/* ---------------- HEMICYCLE ---------------- */

interface RowPlan {
  /** seats placed in this row */
  n: number;
  /** path placement function: returns (x,y) for seat j of n */
  place: (j: number, n: number) => { x: number; y: number };
}

function buildHemicycleRows(total: number): RowPlan[] {
  // Find smallest R such that capacity ≥ total.
  let R = 1;
  while (R < 200) {
    const r0 = R;
    const caps: number[] = [];
    for (let i = 0; i < R; i++) {
      const r = r0 + i;
      caps.push(Math.floor(Math.PI * r) + 1);
    }
    if (caps.reduce((a, b) => a + b, 0) >= total) {
      const alloc = allocate(total, caps);
      return alloc.map((n, i) => {
        const r = (r0 + i) * SPACING;
        return {
          n,
          place: (j, k) => {
            const t = k === 1 ? 0.5 : j / (k - 1);
            const angle = Math.PI - t * Math.PI; // π → 0
            return { x: r * Math.cos(angle), y: -r * Math.sin(angle) };
          },
        };
      });
    }
    R++;
  }
  return [];
}

/* ---------------- HORSESHOE (U) ---------------- */

/**
 * U-shape: two vertical columns + a curved bottom semicircle.
 * Path is traversed left→down→curve→up→right.
 */
function buildHorseshoeRows(total: number): RowPlan[] {
  let R = 1;
  while (R < 200) {
    const r0 = R;
    const H = r0 + R; // straight column height (in spacing units), keeps a balanced U
    const caps: number[] = [];
    for (let i = 0; i < R; i++) {
      const r = r0 + i;
      const h = H; // all rows share the same column height → rectangular ends
      const len = 2 * h + Math.PI * r;
      caps.push(Math.floor(len) + 1);
    }
    if (caps.reduce((a, b) => a + b, 0) >= total) {
      const alloc = allocate(total, caps);
      return alloc.map((n, i) => {
        const r = (r0 + i) * SPACING;
        const h = (H + i) * SPACING;
        const totalLen = 2 * h + Math.PI * r;
        return {
          n,
          place: (j, k) => {
            const t = k === 1 ? 0.5 : j / (k - 1);
            const s = t * totalLen;
            if (s <= h) {
              // left column, top (-r,-h) → bottom (-r,0)
              return { x: -r, y: -h + s };
            }
            const s2 = s - h;
            const arcLen = Math.PI * r;
            if (s2 <= arcLen) {
              // bottom semicircle: angle param from π → 0 going through π/2 (bottom y=+r)
              const u = s2 / r; // 0..π
              return { x: -r * Math.cos(u), y: r * Math.sin(u) };
            }
            const s3 = s2 - arcLen;
            // right column, bottom (r,0) → top (r,-h)
            return { x: r, y: -s3 };
          },
        };
      });
    }
    R++;
  }
  return [];
}

/** Generic arc/U placer — assigns items to positions in left→right traversal order. */
function placeArc(items: FlatItem[], rows: RowPlan[]): SeatPos[] {
  // Generate all positions row by row; within row order is along path direction.
  // To make parties form vertical "wedges" we sort all positions by their
  // path-progress ratio, then by row (inner first), so consecutive items end
  // up stacked.
  type P = { x: number; y: number; key: number; row: number };
  const positions: P[] = [];
  rows.forEach((row, rIdx) => {
    for (let j = 0; j < row.n; j++) {
      const { x, y } = row.place(j, row.n);
      const key = row.n === 1 ? 0.5 : j / (row.n - 1);
      positions.push({ x, y, key, row: rIdx });
    }
  });
  positions.sort((a, b) => a.key - b.key || a.row - b.row);

  const out: SeatPos[] = [];
  positions.forEach((p, idx) => {
    const item = items[idx];
    if (!item || !item.partyId) return; // gap
    out.push({ x: p.x, y: p.y, partyId: item.partyId, sectionId: item.sectionId });
  });
  return out;
}

export function hemicycleLayout(parties: Party[], sections: Section[]) {
  const items = flattenWithSections(parties, sections);
  const rows = buildHemicycleRows(items.length);
  return { seats: placeArc(items, rows), kind: "hemicycle" as const };
}

export function horseshoeLayout(parties: Party[], sections: Section[]) {
  const items = flattenWithSections(parties, sections);
  const rows = buildHorseshoeRows(items.length);
  return { seats: placeArc(items, rows), kind: "horseshoe" as const };
}

/* ---------------- WESTMINSTER ---------------- */

export function westminsterLayout(parties: Party[], sections: Section[]) {
  const seats: SeatPos[] = [];
  const dx = SPACING;
  const dy = SPACING;
  const aisle = SPACING * 2.5;

  function sideItems(side: WestminsterSide): FlatItem[] {
    const sideParties = parties.filter((p) => p.side === side);
    const sideSections = sections.filter((s) => s.side === side);
    return flattenWithSections(sideParties, sideSections);
  }

  const oppItems = sideItems("opposition");
  const govItems = sideItems("government");
  const crossItems = sideItems("crossbench");

  const benchRows = Math.max(2, Math.ceil(Math.sqrt(Math.max(oppItems.length, govItems.length) / 4)));
  const crossRows = Math.max(2, Math.ceil(Math.sqrt(crossItems.length / 6)));

  function bench(items: FlatItem[], rows: number, originX: number, originY: number, dirX: 1 | -1) {
    const cols = Math.max(1, Math.ceil(items.length / rows));
    let i = 0;
    for (let c = 0; c < cols && i < items.length; c++) {
      for (let r = 0; r < rows && i < items.length; r++) {
        const item = items[i++];
        if (!item.partyId) continue;
        seats.push({
          x: originX + dirX * c * dx,
          y: originY + r * dy,
          partyId: item.partyId,
          sectionId: item.sectionId,
        });
      }
    }
    return cols;
  }

  bench(oppItems, benchRows, -aisle / 2, 0, -1);
  bench(govItems, benchRows, aisle / 2, 0, 1);

  // Crossbench centered above the benches.
  const crossCols = Math.max(1, Math.ceil(crossItems.length / crossRows));
  const crossWidth = (crossCols - 1) * dx;
  const crossOriginX = -crossWidth / 2;
  const crossOriginY = -(benchRows + 1) * dy - SPACING * 0.5;
  let ci = 0;
  for (let c = 0; c < crossCols && ci < crossItems.length; c++) {
    for (let r = 0; r < crossRows && ci < crossItems.length; r++) {
      const item = crossItems[ci++];
      if (!item.partyId) continue;
      seats.push({
        x: crossOriginX + c * dx,
        y: crossOriginY - r * dy,
        partyId: item.partyId,
        sectionId: item.sectionId,
      });
    }
  }

  return { seats, kind: "westminster" as const };
}

export function computeLayout(
  layout: "hemicycle" | "horseshoe" | "westminster",
  parties: Party[],
  sections: Section[],
) {
  if (layout === "hemicycle") return hemicycleLayout(parties, sections);
  if (layout === "horseshoe") return horseshoeLayout(parties, sections);
  return westminsterLayout(parties, sections);
}

export const SEAT_RADIUS = SEAT_R;
export const SEAT_SPACING = SPACING;
