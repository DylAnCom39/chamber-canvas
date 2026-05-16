## What you want

A classic parliament layout (à la parliamentarch / Wikipedia parliament SVGs): a fixed set of seat **slots** arranged in concentric arcs that fill the chosen shape (hemicycle or horseshoe). Slots are ordered by angle around the arc (and inner→outer at each angle), then parties claim consecutive blocks from that ordering. Each party gets one contiguous wedge; no per-party arc allocation, no per-party row balancing.

## Current behaviour (wrong)

`arcLayout` gives each party its **own** sub-window of the arc and balances its seats inner-to-outer within that window. That produces a fan-shaped block per party but rows aren't filled like a real chamber — small parties get a single-seat-wide wedge spanning all rows, and inner/outer balance differs from convention.

## Fix

Replace the per-party allocator with a **single shared slot grid** that's independent of parties. Parties just consume slots in order.

### Algorithm

1. **Pick R (number of rows).** Smallest R such that total slot capacity ≥ total seats.
2. **Row capacity.** For each row i, capacity `Ci = floor(row_length_i / SPACING)`.
3. **Per-row allocation.** Distribute total seats across rows proportional to capacity (using existing `allocate()`), so each row holds roughly the same fraction of its capacity filled.
4. **Place slots.** For row i with `ni` seats, place them at `u = (k + 0.5) / ni` for k = 0..ni-1 along that row's arc parameter (cell-centered). Each slot records `{x, y, u, rowIndex}`.
5. **Sort slots into seat order.** Primary key: `u` (angle around the arc). Secondary key: `rowIndex` (inner → outer, the convention used by parliamentarch). This gives the canonical "left-to-right, back-to-front" sweep.
6. **Assign parties.** Walk the sorted slot list in order and assign each slot to the current party until the party's seat count is exhausted, then move to the next party.

The overall shape is unchanged — same arc geometry, same row spacing.

### Sections (with gaps + dividers)

Sections still need to read as separate angular wedges with a visible gap. Approach:

- Split the arc's u-range [0, 1] into per-section windows, separated by the same `gapU` we use today. Order of windows = order of sections, with unsectioned parties forming a trailing window.
- For **each section window** independently, run the slot-grid algorithm above (compute per-row caps from that window's arc length, allocate, place, sort by u then row, assign that section's parties in order).
- Dividers stay at section boundaries only (no dividers between parties).

If a section has no parties, skip its window (don't reserve space for it).

### Westminster

Unchanged — already correct.

## Files to change

- `src/lib/parliament/layouts.ts` — rewrite the inner placement loop in `arcLayout` to use the shared slot-grid algorithm per group; replace per-party sub-window allocation.

## Notes

- Each party remains contiguous because slot order is deterministic and parties claim consecutive slots.
- Inner-to-outer ordering at the same angle means tall thin parties (small seat count in a section) cluster near the inside first, matching standard parliament diagrams. Tell me if you'd prefer outer→inner instead.
