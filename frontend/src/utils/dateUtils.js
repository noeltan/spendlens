/**
 * Computes the billing month for a given date based on a cycle closing day.
 * The closing day is the LAST day included in that month's bill.
 * E.g., closing=12: Apr 1–12 = April bill, Apr 13+ = May bill.
 * Matches backend firestore.js logic.
 *
 * @param {Date|string} dateInput
 * @param {number} cycleClosingDay
 * @returns {string} YYYY-MM
 */
export function getBillingMonth(dateInput, cycleClosingDay = 28) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return new Date().toISOString().substring(0, 7);

  const day = date.getDate();
  if (day > cycleClosingDay) {
    // Use day=1 to avoid overflow (e.g. Mar 31 + 1 month ≠ Apr 31)
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns the standard calendar month for a date.
 * 
 * @param {Date|string} dateInput 
 * @returns {string} YYYY-MM
 */
export function getCalendarMonth(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return new Date().toISOString().substring(0, 7);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
