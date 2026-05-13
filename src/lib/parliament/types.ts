export type LayoutKind = "westminster" | "hemicycle" | "horseshoe";
export type WestminsterSide = "government" | "opposition" | "crossbench";

export interface Party {
  id: string;
  name: string;
  seats: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Westminster only */
  side?: WestminsterSide;
}

export interface Section {
  id: string;
  name: string;
  partyIds: string[];
  /** Westminster only — which side this section belongs to */
  side?: WestminsterSide;
}

export interface ParliamentConfig {
  layout: LayoutKind;
  parties: Party[];
  /** For hemicycle/horseshoe — flat list. For Westminster — sections grouped by `side`. */
  sections: Section[];
  title: string;
}

export interface SeatPos {
  x: number;
  y: number;
  partyId: string;
  sectionId?: string;
}
