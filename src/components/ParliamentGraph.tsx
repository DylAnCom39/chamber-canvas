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

  // Sections are visualized as physical gaps between seat groups (handled in layout).

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
      
      {seatEls}
      {legendEls}
    </svg>
  );
});

ParliamentGraph.displayName = "ParliamentGraph";
