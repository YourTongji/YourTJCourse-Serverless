// ─── Section ↔ Row Mapping ────────────────────────────────────────────────────

/**
 * Map a table row index (1-based) to the logical section number.
 *
 *  11-row system (calendarId >= 120):
 *    Row 1-2 → section 1, 3-4 → 2, 5-6 → 3,
 *    7-8 → 4, 9-10 → 5, 11 → 6
 *
 *  12-row system (legacy):
 *    Row 1-2 → section 1, 3-4 → 2, 5-6 → 3,
 *    7-8 → 4, 9 → 5, 10-12 → 6
 */
export function getRowSection(row: number, maxRows: number): number {
  if (maxRows === 11) {
    switch (row) {
      case 1:
      case 2:
        return 1;
      case 3:
      case 4:
        return 2;
      case 5:
      case 6:
        return 3;
      case 7:
      case 8:
        return 4;
      case 9:
      case 10:
        return 5;
      case 11:
        return 6;
      default:
        return -1;
    }
  }
  // 12-row (legacy)
  switch (row) {
    case 1:
    case 2:
      return 1;
    case 3:
    case 4:
      return 2;
    case 5:
    case 6:
      return 3;
    case 7:
    case 8:
      return 4;
    case 9:
      return 5;
    case 10:
    case 11:
    case 12:
      return 6;
    default:
      return -1;
  }
}

/**
 * Map a logical section number to the row index range (1-based, inclusive).
 *
 * Returns `[startRow, endRow]` or `null` for invalid input.
 */
export function getSectionRows(
  section: number,
  maxRows: number,
): [number, number] | null {
  if (maxRows === 11) {
    switch (section) {
      case 1:
        return [1, 2];
      case 2:
        return [3, 4];
      case 3:
        return [5, 6];
      case 4:
        return [7, 8];
      case 5:
        return [9, 10];
      case 6:
        return [11, 11];
      default:
        return null;
    }
  }
  // 12-row (legacy)
  switch (section) {
    case 1:
      return [1, 2];
    case 2:
      return [3, 4];
    case 3:
      return [5, 6];
    case 4:
      return [7, 8];
    case 5:
      return [9, 9];
    case 6:
      return [10, 12];
    default:
      return null;
  }
}

/**
 * Given calendarId, return maxRows and section↔row mapping for mobile-friendly section-based events.
 */
export function getMaxRows(calendarId: number): number {
  return calendarId >= 120 ? 11 : 12;
}
