require('dotenv').config();
const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore({
  databaseId: process.env.FIRESTORE_DATABASE_ID || 'spendlens'
});

/**
 * Deletes all documents in a collection (including subcollections)
 * @param {string} collectionPath 
 */
async function deleteCollection(collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  let snapshot = await query.get();
  while (snapshot.size > 0) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`  Deleted ${snapshot.size} docs from ${collectionPath}...`);
    snapshot = await query.get();
  }
}

/**
 * Discovers and wipes all transactional data
 */
async function clearAll() {
  const databaseId = process.env.FIRESTORE_DATABASE_ID || 'spendlens';
  console.log(`⚠️  Starting robust Firestore wipe for database: "${databaseId}"`);
  
  // 1. Discover all root collections
  const collections = await db.listCollections();
  
  for (const col of collections) {
    const colId = col.id;
    console.log(`Processing collection: ${colId}...`);

    // Special handling for nested structures
    if (colId === 'transactions' || colId === 'budgets') {
      const docs = await col.listDocuments();
      for (const doc of docs) {
        // Find subcollections for this specific user/doc
        const subCollections = await doc.listCollections();
        for (const subCol of subCollections) {
          await deleteCollection(`${colId}/${doc.id}/${subCol.id}`);
        }
        // Finally delete the parent doc itself
        await doc.delete();
      }
    }
    
    // Wipe the collection itself (or any remaining top-level docs)
    await deleteCollection(colId);
  }

  console.log('✅ Firestore cleared successfully.');
}

clearAll().catch(err => {
  console.error('❌ Error clearing Firestore:', err);
  process.exit(1);
});
