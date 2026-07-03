const CATEGORY_COLORS = {
  Dining: { bg: '#FEF7E0', text: '#B05E27' },
  Groceries: { bg: '#E6F4EA', text: '#137333' },
  Transport: { bg: '#E8F0FE', text: '#1967D2' },
  Shopping: { bg: '#F3E8FD', text: '#8430CE' },
  Bills: { bg: '#FCE8E6', text: '#C5221F' },
  Health: { bg: '#E4F7FB', text: '#007B83' },
  Travel: { bg: '#FFF4E5', text: '#A54B00' },
  Entertainment: { bg: '#FDE7F3', text: '#B80672' },
  Education: { bg: '#F1F8E9', text: '#33691E' },
  Other: { bg: '#F1F3F4', text: '#3C4043' }
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function TransactionTable({ transactions }) {
  if (transactions.length === 0) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
        No transactions found matching your filters.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {transactions.map((t, i) => (
        <div key={i} style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '12px 16px', 
          borderBottom: i === transactions.length - 1 ? 'none' : '1px solid var(--surface-border)',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.merchant}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(t.date)}</span>
              <span 
                className="badge" 
                style={{ 
                  backgroundColor: CATEGORY_COLORS[t.category]?.bg || '#f1f3f4', 
                  color: CATEGORY_COLORS[t.category]?.text || '#3c4043',
                  fontSize: '0.6875rem',
                  padding: '1px 6px'
                }}
              >
                {t.category}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t.card}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t.isLocal === false ? (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                   <span>${t.amountLocal?.toFixed(2) || (t.amount * 1.35).toFixed(2)}</span>
                   <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{t.currency} {t.amount?.toFixed(2)}</span>
                </span>
              ) : `$${t.amount.toFixed(2)}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
