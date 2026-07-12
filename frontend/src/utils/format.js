export function formatCurrency(value, digits = 2) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
}

export function formatMonthLabel(ym, viewBy) {
  const [year, month] = ym.split('-').map(Number);
  const label = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  return viewBy === 'billing' ? `${label} Bill` : label;
}
