import { forwardRef, useMemo } from "react";
import type { Party, ParliamentConfig, SeatPos, Section } from "@/lib/parliament/types";
import { SEAT_SPACING, computeLayout } from "@/lib/parliament/layouts";

interface Props {
  config: ParliamentConfig;
}

const SEAT_R = 1;

function bbox(seats: SeatPos[]) {
  if (seats.length === 0) return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of seats) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return { minX, maxX, minY, maxY };
}

function partyMap(parties: Party[]) {
  return new Map(parties.map((p) => [p.id, p]));
}

/** Polar to cartesian using same convention as layouts (y = -r sin) */
function polar(r: number, a: number) {
  return { x: r * Math.cos(a), y: -r * Math.sin(a) };
}

function arcPath(rOuter: number, startA: number, endA: number) {
  const p1 = polar(rOuter, startA);
  const p2 = polar(rOuter, endA);
  const sweep = endA < startA ? 1 : 0; // y-axis flipped
  const large = Math.abs(endA - startA) > Math.PI ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${large} ${sweep} ${p2.x} ${p2.y}`;
}

export const ParliamentGraph = forwardRef<SVGSVGElement, Props>(({ config }, ref) => {
  const { layout, parties, sections, title } = config;
  const result = useMemo(() => computeLayout(layout, parties, sections), [layout, parties, sections]);
  const seats = result.seats;
  const pmap = partyMap(parties);

  const bb = bbox(seats);
  const padX = 6;
  const padTop = 14; // for section labels
  const padBottom = 4;
  const vbX = bb.minX - padX;
  const vbY = bb.minY - padTop;
  const vbW = bb.maxX - bb.minX + padX * 2;
  const vbH = bb.maxY - bb.minY + padTop + padBottom;

  // ----- Section indicators -----
  const sectionEls: React.ReactNode[] = [];

  if (layout === "hemicycle" || layout === "horseshoe") {
    // For each section, find seats and compute angle range from outer ring.
    const seatsBySec = new Map<string, SeatPos[]>();
    for (const s of seats) {
      if (!s.sectionId) continue;
      const arr = seatsBySec.get(s.sectionId) ?? [];
      arr.push(s);
      seatsBySec.set(s.sectionId, arr);
    }
    // Determine outer radius from seats:
    const rOuter =
      Math.max(...seats.map((s) => Math.hypot(s.x, s.y)), 0) + SEAT_SPACING * 1.1;
    sections.forEach((sec) => {
      const arr = seatsBySec.get(sec.id);
      if (!arr || arr.length === 0) return;
      const angles = arr.map((s) => Math.atan2(-s.y, s.x));
      const a1 = Math.max(...angles);
      const a2 = Math.min(...angles);
      // pad slightly outward in angle by a small amount
      const pad = 0.02;
      const start = a1 + pad;
      const end = a2 - pad;
      const color = pmap.get(sec.partyIds[0])?.fill ?? "#666";
      const path = arcPath(rOuter, start, end);
      // Label position at midpoint
      const mid = (start + end) / 2;
      const labelR = rOuter + 2.2;
      const lp = polar(labelR, mid);
      sectionEls.push(
        <g key={sec.id}>
          <path d={path} stroke={color} strokeWidth={0.7} fill="none" opacity={0.9} />
          <text
            x={lp.x}
            y={lp.y}
            fontSize={1.8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
          >
            {sec.name}
          </text>
        </g>,
      );
    });
  } else if (layout === "westminster") {
    // Draw horizontal bracket above the columns spanned by each section's seats.
    const seatsBySec = new Map<string, SeatPos[]>();
    for (const s of seats) {
      if (!s.sectionId) continue;
      const arr = seatsBySec.get(s.sectionId) ?? [];
      arr.push(s);
      seatsBySec.set(s.sectionId, arr);
    }
    sections.forEach((sec) => {
      const arr = seatsBySec.get(sec.id);
      if (!arr || arr.length === 0) return;
      const xs = arr.map((s) => s.x);
      const ys = arr.map((s) => s.y);
      const minX = Math.min(...xs) - SEAT_R;
      const maxX = Math.max(...xs) + SEAT_R;
      const topY = Math.min(...ys) - SEAT_SPACING * 0.9;
      const color = pmap.get(sec.partyIds[0])?.fill ?? "#666";
      sectionEls.push(
        <g key={sec.id}>
          <line x1={minX} y1={topY} x2={maxX} y2={topY} stroke={color} strokeWidth={0.5} />
          <line x1={minX} y1={topY} x2={minX} y2={topY + 0.5} stroke={color} strokeWidth={0.5} />
          <line x1={maxX} y1={topY} x2={maxX} y2={topY + 0.5} stroke={color} strokeWidth={0.5} />
          <text
            x={(minX + maxX) / 2}
            y={topY - 0.6}
            fontSize={1.6}
            textAnchor="middle"
            fill="currentColor"
          >
            {sec.name}
          </text>
        </g>,
      );
    });
  }

  // ----- Seat circles -----
  const seatEls = seats.map((s, i) => {
    const p = pmap.get(s.partyId);
    if (!p) return null;
    return (
      <circle
        key={i}
        cx={s.x}
        cy={s.y}
        r={SEAT_R}
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={p.strokeWidth}
      />
    );
  });

  // ----- Legend -----
  // Render legend as separate <g> below the diagram inside same SVG (so export contains it).
  const legendItemH = 3;
  const legendCols = Math.min(3, Math.max(1, Math.ceil(parties.length / 8)));
  const legendW = vbW;
  const colW = legendW / legendCols;
  const legendStartY = bb.maxY + padBottom + 2;

  const legendEls = parties.map((p, i) => {
    const col = i % legendCols;
    const row = Math.floor(i / legendCols);
    const x = vbX + col * colW + 1;
    const y = legendStartY + row * legendItemH;
    return (
      <g key={p.id}>
        <circle cx={x + 1} cy={y + 1} r={1} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
        <text x={x + 3} y={y + 1.6} fontSize={1.7} fill="currentColor">
          {p.name} ({p.seats})
        </text>
      </g>
    );
  });
  const legendRows = Math.ceil(parties.length / legendCols);
  const legendH = legendRows * legendItemH + 2;

  const titleH = title ? 4 : 0;
  const totalH = titleH + vbH + legendH;
  const finalVbY = vbY - titleH;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vbX} ${finalVbY} ${vbW} ${totalH}`}
      className="w-full h-full text-foreground"
      style={{ maxHeight: "70vh" }}
    >
      {title && (
        <text
          x={vbX + vbW / 2}
          y={finalVbY + 3}
          fontSize={3}
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
        >
          {title}
        </text>
      )}
      {sectionEls}
      {seatEls}
      {legendEls}
    </svg>
  );
});

ParliamentGraph.displayName = "ParliamentGraph";
