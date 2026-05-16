## Problem

Right now `arcLayout` builds one group per section, plus a trailing group containing **all** unsectioned parties mixed together. Within that group, seats are placed column-major from a queue that's ordered party-by-party. That keeps each party mostly contiguous, but the boundary between two parties can fall mid-column, producing a partially-shared wedge where the last column of one party also contains the first seats of the next.

## Fix

Allocate seats per **party**, not per group. Each party gets its own contiguous sub-window of the arc, so its seats form a solid block with no shared columns.

Implementation in `src/lib/parliament/layouts.ts → arcLayout`:

1. **Two-level layout**: groups (sections + trailing unsectioned bucket) keep their roles for dividers and ordering, but inside each group, split the group's u-window into per-party sub-windows proportional to each party's seat count.
2. **No gap between parties in the same section** — only section boundaries get the visible `gapU`. Party-to-party transitions inside a section are flush, but each party's seats still occupy a fully separate radial wedge.
3. **Per-party allocation across rows**: reuse the existing `allocate()` to distribute that party's seats across rows proportional to each row's slice of the party's sub-window.
4. **Column-major placement per party**: same column-major fill we use today, applied to each party's queue inside its sub-window. This guarantees the party's seats are a single contiguous block.
5. Trailing "rest" group (unsectioned parties) is treated the same way — each unsectioned party gets its own sub-window inside the rest group's window, so they don't bleed into each other.

Westminster is unchanged — its bench layout already places each party in its own contiguous column block.

## Files to change

- `src/lib/parliament/layouts.ts` — refactor `arcLayout` to allocate per-party within each group's window; keep dividers at group boundaries only.

## Open question

Should party order **inside a section** match the order the user added parties to the section, or follow the order parties appear in the global party list? I'll default to the order they were added to the section (current behavior preserved) unless you say otherwise.
