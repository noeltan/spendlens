export default function BudgetProgressBar({ label, spent, limit }) {
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  
  let color = 'var(--success)';
  if (pct >= 90) color = 'var(--danger)';
  else if (pct >= 75) color = 'var(--warning)';

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'flex-end' }}>
        <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: '0.8125rem' }}>
          <span style={{ fontWeight: 600, color: pct >= 90 ? 'var(--danger)' : 'var(--text-primary)' }}>${spent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          {limit > 0 && <span style={{ color: 'var(--text-tertiary)' }}> / ${limit.toLocaleString()}</span>}
        </span>
      </div>
      {limit > 0 && (
        <div style={{ height: '4px', background: '#e8eaed', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ 
            width: `${pct}%`, 
            height: '100%', 
            background: color, 
            borderRadius: '2px', 
            transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' 
          }} />
        </div>
      )}
    </div>
  );
}
