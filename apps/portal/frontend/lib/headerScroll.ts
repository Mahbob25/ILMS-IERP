/**
 * Decide whether the mobile header is translated out of view.
 *
 * Kept pure and outside the component so the invariant is stated once and can
 * be reasoned about on its own:
 *
 *   At (or above) the top of the page the header is ALWAYS visible.
 *
 * The earlier inline version only ever revealed the header when it observed an
 * offset *decreasing*, so nothing guaranteed it came back. Anything that moved
 * the offset without an upward-reading event — a route change clamping the
 * offset to 0 with no scroll event, an elastic overscroll reporting a negative
 * offset, a momentum spike — could leave it latched off-screen while the user
 * sat at the top, with no scroll left on a short page to bring it back.
 */

export interface HeaderScrollState {
  /** Last observed offset, already clamped to >= 0. */
  lastY: number;
  /** Whether the header is currently off-screen. */
  hidden: boolean;
}

/** Offsets at or below this count as "the top". */
export const TOP_ZONE = 8;

/** Smaller moves than this are treated as jitter (URL bar, sub-pixel). */
export const MIN_DELTA = 6;

/**
 * @param state        Previous decision + offset.
 * @param rawY         Raw offset. Negative during an elastic overscroll.
 * @param headerHeight Measured header height — the downward move has to clear
 *                     the header itself before it is worth hiding.
 */
export function nextHeaderState(
  state: HeaderScrollState,
  rawY: number,
  headerHeight: number,
): HeaderScrollState {
  const y = Math.max(0, rawY);

  // Checked before the jitter guard, so this can never be skipped: whatever the
  // previous state, reaching the top reveals the header.
  if (y <= TOP_ZONE) {
    return { lastY: y, hidden: false };
  }

  if (Math.abs(y - state.lastY) < MIN_DELTA) {
    return state;
  }

  if (y > state.lastY && y > headerHeight) {
    return { lastY: y, hidden: true };
  }
  if (y < state.lastY) {
    return { lastY: y, hidden: false };
  }
  return { lastY: y, hidden: state.hidden };
}
