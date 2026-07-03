import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const COLORS = [
  '#4285F4', // Google Blue
  '#EA4335', // Google Red
  '#FBBC05', // Google Yellow
  '#34A853', // Google Green
  '#FA7B17', // Orange
  '#F06292', // Pink
  '#AF5CF7', // Purple
  '#24C1E0', // Cyan
  '#4FC3F7', // Light Blue
  '#81C995'  // Light Green
];

export default function CategoryDonut({ byCategory }) {
  const data = Object.entries(byCategory || {})
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No transactions this month.</div>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <PieChart width={360} height={320}>
        <Pie 
          data={data} 
          cx={180} 
          cy={140} 
          innerRadius={70} 
          outerRadius={100} 
          dataKey="value"
          stroke="var(--bg-color)"
          strokeWidth={4}
          paddingAngle={2}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip 
          formatter={(v) => `$${v.toFixed(2)}`} 
          contentStyle={{ 
            backgroundColor: '#fff', 
            border: '1px solid var(--surface-border)', 
            borderRadius: '4px', 
            boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)',
            fontSize: '0.8125rem'
          }}
        />
        <Legend 
          wrapperStyle={{ fontSize: '0.75rem', paddingTop: '20px' }} 
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </div>
  );
}
