const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore({
  databaseId: process.env.FIRESTORE_DATABASE_ID || 'spendlens'
});

// Computes the billing month based on the cycle closing day.
// The closing day is the LAST day included in that month's bill.
// E.g., UOB closes on 12th: Apr 1–12 = April bill, Apr 13+ = May bill.
// E.g., DBS closes on 25th: Apr 1–25 = April bill, Apr 26+ = May bill.
function getBillingMonth(dateStr, cycleClosingDay = 28) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr.substring(0, 7);

  // If the transaction is AFTER the closing day, it belongs to the NEXT month's bill
  // Use Date.UTC(year, month+1, 1) to avoid day-overflow (e.g. Mar 31 + 1 month ≠ Apr 31)
  if (date.getUTCDate() > cycleClosingDay) {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return next.toISOString().substring(0, 7);
  }
  return date.toISOString().substring(0, 7);
}

// Save an array of parsed transactions for a user.
// Applies any card aliasing or custom billing cycles mappings configured by the user.
async function saveTransactions(userId, transactions, config = {}) {
  const aliases = config.cardAliases || {};
  const cycles = config.billingCycles || {};
  
  const batch = db.batch();
  for (const txn of transactions) {
    // Normalize aliases out of raw Gemini output
    const normalizedCard = aliases[txn.card] || txn.card;
    txn.card = normalizedCard;
    
    // Compute exact accounting window
    const startDay = cycles[normalizedCard] || 1;
    const month = getBillingMonth(txn.date, startDay);
    const calendarMonth = txn.date.substring(0, 7);
    
    const ref = db
      .collection('transactions')
      .doc(userId)
      .collection('records')
      .doc(txn.emailId);
    batch.set(ref, { ...txn, month, calendarMonth });
  }
  await batch.commit();
}

// Fetches ALL transactions efficiently for reprocessing mappings across the entire timeline
async function getAllTransactions(userId) {
  const snapshot = await db.collection('transactions').doc(userId).collection('records').get();
  return snapshot.docs.map(doc => doc.data());
}

// Returns a Set of all emailIds already stored — used to skip re-processing in sync
async function getProcessedEmailIds(userId) {
  const snapshot = await db
    .collection('transactions')
    .doc(userId)
    .collection('records')
    .select() // fetch no fields, just doc IDs — very cheap
    .get();
  return new Set(snapshot.docs.map(doc => doc.id));
}

// Overwrites an array of fully-formed records securely in chunks of 500
async function updateTransactionsBatch(userId, updatedRecords) {
  for (let i = 0; i < updatedRecords.length; i += 500) {
    const chunk = updatedRecords.slice(i, i + 500);
    const batch = db.batch();
    for (const record of chunk) {
      const ref = db.collection('transactions').doc(userId).collection('records').doc(record.emailId);
      batch.set(ref, record, { merge: true });
    }
    await batch.commit();
  }
}

// Get all transactions for a user in a given month ("YYYY-MM").
async function getTransactions(userId, month, viewBy = 'billing') {
  const fieldPath = viewBy === 'calendar' ? 'calendarMonth' : 'month';
  const snapshot = await db
    .collection('transactions')
    .doc(userId)
    .collection('records')
    .where(fieldPath, '==', month)
    .get();
  return snapshot.docs.map(doc => doc.data());
}

// Compute summary stats for a user in a given month.
async function getSummary(userId, month, viewBy = 'billing') {
  const transactions = await getTransactions(userId, month, viewBy);

  const totalSpend = transactions.reduce((sum, t) => sum + (t.amountLocal || t.amount || 0), 0);

  const byCard = {};
  const byCategory = {};
  const merchantMap = {};

  for (const t of transactions) {
    const amt = t.amountLocal || t.amount || 0;
    byCard[t.card] = (byCard[t.card] || 0) + amt;
    byCategory[t.category] = (byCategory[t.category] || 0) + amt;
    merchantMap[t.merchant] = (merchantMap[t.merchant] || 0) + amt;
  }

  const topMerchants = Object.entries(merchantMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([merchant, total]) => ({ merchant, total }));

  return { totalSpend, byCard, byCategory, topMerchants };
}

// Get budget for a user in a given month. Returns null if not set.
async function getBudget(userId, month) {
  const ref = db.collection('budgets').doc(userId).collection('monthly').doc(month);
  const doc = await ref.get();
  return doc.exists ? doc.data() : null;
}

// Save (merge) budget for a user in a given month.
async function saveBudget(userId, month, budgetData) {
  const ref = db.collection('budgets').doc(userId).collection('monthly').doc(month);
  await ref.set(budgetData, { merge: true });
}

// Get sync state for a user. Returns null if never synced.
async function getSyncState(userId) {
  const ref = db.collection('syncState').doc(userId);
  const doc = await ref.get();
  return doc.exists ? doc.data() : null;
}

// Save sync state for a user.
async function saveSyncState(userId, state) {
  const ref = db.collection('syncState').doc(userId);
  await ref.set(state, { merge: true });
}

// Get config for a user. Returns sensible defaults if not set.
async function getConfig(userId) {
  const ref = db.collection('settings').doc(userId);
  const doc = await ref.get();
  return doc.exists ? doc.data() : { syncPeriodMonths: 3, localCurrency: 'SGD', billingCycles: {}, cardAliases: {} };
}

// Save config for a user.
async function saveConfig(userId, configData) {
  const ref = db.collection('settings').doc(userId);
  await ref.set(configData, { merge: true });
}

// Delete all transaction records matching a specific card nickname for a user
async function deleteTransactionsByCard(userId, cardName) {
  const recordsRef = db.collection('transactions').doc(userId).collection('records');
  const snapshot = await recordsRef.where('card', '==', cardName).get();
  
  if (snapshot.size === 0) return 0;
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  return snapshot.size;
}

module.exports = {
  saveTransactions,
  getTransactions,
  getSummary,
  getBudget,
  saveBudget,
  getSyncState,
  saveSyncState,
  getConfig,
  saveConfig,
  getAllTransactions,
  getProcessedEmailIds,
  updateTransactionsBatch,
  getBillingMonth,
  deleteTransactionsByCard
};
