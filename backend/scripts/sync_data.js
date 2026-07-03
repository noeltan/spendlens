const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { fetchEmailIds, fetchEmailDetails } = require('../gmail');
const { parseEmails } = require('../gemini');
const { 
  getConfig, 
  getProcessedEmailIds, 
  saveTransactions, 
  saveSyncState 
} = require('../firestore');

/**
 * SpendLens CLI Sync Utility
 * 
 * Usage:
 * ACCESS_TOKEN="ya29..." [USER_ID="my-user"] node sync_data.js
 */

async function runSync() {
  const accessToken = process.env.ACCESS_TOKEN;
  const userId = process.env.USER_ID || 'default_user'; // Default or from env

  if (!accessToken) {
    console.error('❌ Error: ACCESS_TOKEN environment variable is required.');
    console.log('Usage: ACCESS_TOKEN="your_token" node sync_data.js');
    process.exit(1);
  }

  try {
    console.log(`\n🚀 Starting CLI Sync for user: ${userId}`);
    console.log('--------------------------------------------------');

    // 1. Get user configuration
    console.log('📥 Fetching configuration...');
    const config = await getConfig(userId);
    const months = config.syncPeriodMonths || 3;
    console.log(`   - Syncing last ${months} months of history.`);

    // 2. Identify already processed emails to avoid duplicates
    const processedIds = await getProcessedEmailIds(userId);
    console.log(`   - Skipping ${processedIds.size} already processed emails.`);

    // 3. Fetch all matching email IDs from Gmail
    console.log('🔍 Searching Gmail for bank alerts...');
    const banks = [...new Set((config.cards || []).map(card => card.bank).filter(Boolean))];
    const allIds = [];

    if (banks.length === 0) {
      allIds.push(...await fetchEmailIds(accessToken, null, months));
    } else {
      for (const bank of banks) {
        console.log(`   - Querying ${bank} emails...`);
        const ids = await fetchEmailIds(accessToken, null, months, null, [bank]);
        console.log(`     Found ${ids.length} emails for ${bank}.`);
        allIds.push(...ids);
      }
    }

    const dedupedIds = [...new Set(allIds)];
    const newIds = dedupedIds.filter(id => !processedIds.has(id));

    if (newIds.length === 0) {
      console.log('✅ No new emails to process.');
      return;
    }

    console.log(`✨ Found ${newIds.length} new emails to process.`);

    // 4. Process in batches (to respect Gemini/API limits)
    const BATCH_SIZE = 10;
    let totalProcessed = 0;

    for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
      const batchIds = newIds.slice(i, i + BATCH_SIZE);
      console.log(`\n📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1} (${batchIds.length} emails)...`);

      // Fetch details from Gmail
      const emails = await Promise.all(
        batchIds.map(async (id) => {
          const detail = await fetchEmailDetails(accessToken, id);
          return { id, subject: detail.subject, body: detail.body, receivedAt: detail.receivedAt };
        })
      );

      // Parse with Gemini
      console.log('   🤖 Asking Gemini to parse transactions...');
      const parsedRaw = await parseEmails(emails);
      
      const parsed = parsedRaw.map(txn => {
        const isLocal = (txn.currency || '').toUpperCase() === (config.localCurrency || 'SGD').toUpperCase();
        return {
          ...txn,
          isLocal,
          amountLocal: isLocal ? txn.amount : (txn.amountLocal || txn.amount)
        };
      });

      // Filter for actual charges
      const charges = parsed.filter(t => t.type === 'CHARGE');
      console.log(`   ✅ Extracted ${charges.length} charges from this batch.`);

      // Save to Firestore subcollection: transactions/{userId}/records
      if (charges.length > 0) {
        console.log(`   💾 Saving to Firestore...`);
        await saveTransactions(userId, charges, config);
      }

      totalProcessed += batchIds.length;
      const progress = Math.round((totalProcessed / newIds.length) * 100);
      
      // Update sync state for user
      await saveSyncState(userId, { 
        lastSyncedAt: new Date().toISOString(), 
        progress 
      });

      process.stdout.write(`   📊 Progress: ${progress}%\n`);
    }

    console.log('\n--------------------------------------------------');
    console.log('🎊 Sync completed successfully!');
    console.log(`✅ Total emails evaluated: ${newIds.length}`);
    
  } catch (err) {
    console.error('\n❌ Sync failed with error:');
    if (err.response) {
      console.error(`   API Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      console.error(`   ${err.message}`);
    }
    process.exit(1);
  }
}

runSync();
