require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');

// Exports a user's transaction records to CSV (and JSON) for offline analysis.
//
// Usage (from backend/, with gcloud application-default credentials):
//   node scripts/export_transactions.js --user you@gmail.com [--months 6] [--out ./export]
//
// Auth: `gcloud auth application-default login` once, or GOOGLE_APPLICATION_CREDENTIALS.

const db = new Firestore({
  databaseId: process.env.FIRESTORE_DATABASE_ID || 'spendlens'
});

function parseArgs(argv) {
  const args = { months: 6, out: './export' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--user') args.user = argv[++i];
    else if (key === '--months') args.months = Number(argv[++i]);
    else if (key === '--out') args.out = argv[++i];
  }
  if (!args.user) {
    console.error('Usage: node scripts/export_transactions.js --user <email> [--months 6] [--out ./export]');
    process.exit(1);
  }
  return args;
}

const COLUMNS = ['date', 'calendarMonth', 'month', 'card', 'merchant', 'category', 'currency', 'amount', 'amountLocal', 'isLocal', 'type', 'emailId'];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const { user, months, out } = parseArgs(process.argv.slice(2));

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const cutoffDate = cutoff.toISOString().substring(0, 10);

  console.log(`Exporting records for ${user} dated on/after ${cutoffDate}...`);
  const snapshot = await db
    .collection('transactions').doc(user).collection('records')
    .where('date', '>=', cutoffDate)
    .orderBy('date')
    .get();

  const records = snapshot.docs.map(doc => doc.data());
  fs.mkdirSync(out, { recursive: true });

  const csvPath = path.join(out, `transactions_${months}m.csv`);
  const jsonPath = path.join(out, `transactions_${months}m.json`);
  const csv = [COLUMNS.join(',')]
    .concat(records.map(r => COLUMNS.map(col => csvCell(r[col])).join(',')))
    .join('\n');
  fs.writeFileSync(csvPath, csv);
  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));

  const total = records.reduce((sum, r) => sum + (r.amountLocal || r.amount || 0), 0);
  console.log(`${records.length} records, total ${total.toFixed(2)} (local currency)`);
  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${jsonPath}`);
}

main().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
