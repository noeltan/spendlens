require('dotenv').config();
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { parseEmails } = require('./gemini');
const { fetchEmailIds, fetchEmailDetails } = require('./gmail');
const {
  saveTransactions, getSummary, getTransactions,
  getBudget, saveBudget, getSyncState, saveSyncState,
  getConfig, saveConfig,
  getAllTransactions, getProcessedEmailIds, updateTransactionsBatch, getBillingMonth,
  deleteTransactionsByCard,
  getRetirement, saveRetirement, addNetWorthSnapshot
} = require('./firestore');

const app = express();

// Security and Performance Middleware
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "https://accounts.google.com/gsi/client", "'unsafe-inline'"],
      "frame-src": ["'self'", "https://accounts.google.com", "https://accounts.google.com/gsi/"],
      "connect-src": [
        "'self'",
        "https://accounts.google.com",
        "https://accounts.google.com/gsi/",
        "https://oauth2.googleapis.com",
        "https://www.googleapis.com"
      ]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(morgan('combined')); // Production-level logging

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/syncstate', // polled frequently during sync
});
app.use('/api', limiter);

// Extract userId from the Authorization header token.
// For simplicity, userId is the user's Google email, decoded from the token.
// Use google-auth-library to verify and extract the email.
const { OAuth2Client } = require('google-auth-library');
const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function getUserId(req) {
  return req.userId;
}

function getUniqueBanks(cards = []) {
  return [...new Set(cards.map(card => card.bank).filter(Boolean))];
}

async function fetchEmailIdsByBanks(accessToken, banks, afterEmailId, newerThanMonths, olderThanMonths) {
  const emailIds = [];

  for (const bank of banks) {
    console.log(`Searching Gmail for bank: ${bank}`);
    const ids = await fetchEmailIds(accessToken, afterEmailId, newerThanMonths, olderThanMonths, [bank]);
    console.log(`  Found ${ids.length} candidate emails for ${bank}`);
    emailIds.push(...ids);
  }

  return emailIds;
}

// FX rates (foreign currency -> local), refreshed daily from the ECB via
// frankfurter.app; hardcoded values cover failures and unsupported currencies.
const FALLBACK_FX_RATES = {
  'USD': 1.35, 'JPY': 0.0091, 'MYR': 0.28, 'EUR': 1.46, 'GBP': 1.71,
  'AUD': 0.90, 'HKD': 0.17, 'KRW': 0.0010, 'TWD': 0.042, 'THB': 0.038,
  'IDR': 0.000086, 'VND': 0.000054
};
const FX_TTL_MS = 24 * 60 * 60 * 1000;
let fxCache = { base: null, rates: null, fetchedAt: 0 };

async function getFxRates(base = 'SGD') {
  if (fxCache.rates && fxCache.base === base && Date.now() - fxCache.fetchedAt < FX_TTL_MS) {
    return fxCache.rates;
  }
  try {
    const resp = await axios.get(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`, { timeout: 5000 });
    const toLocal = {};
    for (const [currency, rate] of Object.entries(resp.data.rates || {})) {
      if (rate > 0) toLocal[currency] = 1 / rate;
    }
    const rates = { ...FALLBACK_FX_RATES, ...toLocal };
    fxCache = { base, rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    console.error('FX rate fetch failed, using fallback rates:', err.message);
    return FALLBACK_FX_RATES;
  }
}

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes (Google tokens last 1hr)
const tokenCache = new Map(); // token -> { email, expiresAt }

app.use('/api', async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({ error: 'No token' });
  }

  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.userId = cached.email;
    return next();
  }

  try {
    console.log(`Validating token (first 10 chars): ${token.substring(0, 10)}...`);
    const info = await oauthClient.getTokenInfo(token);
    if (!info.email) {
      throw new Error('Token does not contain email scope');
    }
    tokenCache.set(token, { email: info.email, expiresAt: Date.now() + TOKEN_TTL_MS });
    req.userId = info.email;
    console.log(`Token validated for: ${info.email}`);
    next();
  } catch (err) {
    tokenCache.delete(token);
    console.error('Token validation failed:', err.message, err.response?.data || '');
    return res.status(401).json({ error: 'Invalid or expired token', detailed: err.message });
  }
});

// POST /api/sync
// Crawls Gmail incrementally, parses new emails with Gemini, saves to Firestore.
// Responds immediately and runs sync in the background to avoid gateway timeouts.
app.post('/api/sync', async (req, res) => {
  const userId = await getUserId(req);
  const accessToken = req.headers.authorization.replace('Bearer ', '');
  const { cardId } = req.body;

  // Respond immediately so the client can start polling
  res.json({ started: true });

  // Run sync in background
  (async () => {
  try {
    const syncState = await getSyncState(userId) || {};
    const config = await getConfig(userId);
    const syncPeriodMonths = config.syncPeriodMonths || 3;
    const oldestSyncedMonths = syncState.oldestSyncedMonths || 0;
    
    let lastEmailId = syncState.lastEmailId || null;
    let userBanks = getUniqueBanks(config.cards || []);
    let isPartialSync = false;

    // ── PER-CARD WIPE & RESYNC ──────────────────────────────────────────
    if (cardId) {
      const targetCard = (config.cards || []).find(c => c.id === cardId);
      if (targetCard) {
        console.log(`🗑️ Wiping data for card: ${targetCard.name}`);
        const deletedCount = await deleteTransactionsByCard(userId, targetCard.name);
        console.log(`  Deleted ${deletedCount} existing records.`);
        
        userBanks = [targetCard.bank];
        lastEmailId = null; // Force a full search within the window
        isPartialSync = true;
      }
    }

    await saveSyncState(userId, { ...syncState, progress: { stage: "fetching", current: 0, total: 0 } });

    let emailIds = [];

    // 1. ACTIVE SYNC: Fetch emails
    if (lastEmailId) {
      emailIds = emailIds.concat(await fetchEmailIdsByBanks(accessToken, userBanks, lastEmailId, null, null));
    } else {
      // First run OR Card-specific re-sync: fetch all within syncPeriodMonths
      emailIds = emailIds.concat(await fetchEmailIdsByBanks(accessToken, userBanks, null, syncPeriodMonths, null));
    }

    // 2. HISTORICAL SYNC: Skip for partial syncs
    if (!isPartialSync && syncPeriodMonths > oldestSyncedMonths && oldestSyncedMonths > 0) {
      const historicalIds = await fetchEmailIdsByBanks(accessToken, userBanks, null, syncPeriodMonths, oldestSyncedMonths);
      emailIds = emailIds.concat(historicalIds);
    }

    // Remove duplicates
    emailIds = [...new Set(emailIds)];

    if (emailIds.length === 0) {
      if (!isPartialSync) {
        await saveSyncState(userId, {
          ...syncState,
          lastSyncedAt: new Date().toISOString(),
          oldestSyncedMonths: Math.max(oldestSyncedMonths, syncPeriodMonths),
          progress: null
        });
      } else {
        await saveSyncState(userId, { ...syncState, progress: null });
      }
      return;
    }

    await saveSyncState(userId, { ...syncState, progress: { stage: "parsing", current: 0, total: emailIds.length } });

    // ── CACHE: skip emails already parsed (except for the ones we just wiped)
    const processedIds = await getProcessedEmailIds(userId);
    const newEmailIds = emailIds.filter(id => !processedIds.has(id));
    
    for (let i = 0; i < newEmailIds.length; i += 10) {
      const BATCH_SIZE = 10;
      const batch = newEmailIds.slice(i, i + BATCH_SIZE);
      const emails = await Promise.all(batch.map(async id => {
        const detail = await fetchEmailDetails(accessToken, id);
        return { id, subject: detail.subject, body: detail.body, receivedAt: detail.receivedAt };
      }));

      const parsedRaw = await parseEmails(emails, config.cards || []);
      const fxRates = await getFxRates(config.localCurrency || 'SGD');

      const parsed = parsedRaw.map(txn => {
        const isLocal = (txn.currency || '').toUpperCase() === (config.localCurrency || 'SGD').toUpperCase();
        let amtLocal = txn.amountLocal;
        if (isLocal) {
          amtLocal = txn.amount;
        } else if (!amtLocal) {
          const rate = fxRates[txn.currency?.toUpperCase()] || 1;
          amtLocal = txn.amount * rate;
        }
        return { ...txn, isLocal, amountLocal: amtLocal };
      });
      
      const charges = parsed.filter(t => t.type === 'CHARGE');
      if (charges.length > 0) {
        await saveTransactions(userId, charges, config);
      }
      await saveSyncState(userId, { ...syncState, progress: { stage: "parsing", current: Math.min(i + BATCH_SIZE, newEmailIds.length), total: newEmailIds.length } });
    }

    // Only update global markers if this was a full user sync
    if (!isPartialSync) {
      await saveSyncState(userId, {
        ...syncState,
        lastSyncedAt: new Date().toISOString(),
        lastEmailId: emailIds[0], 
        oldestSyncedMonths: Math.max(oldestSyncedMonths, syncPeriodMonths),
        progress: null
      });
    } else {
      await saveSyncState(userId, { ...syncState, progress: null });
    }

  } catch (err) {
    console.error('/api/sync background error:', err);
    // Save error to syncState so the frontend can surface it
    try {
      const syncState = await getSyncState(userId) || {};
      await saveSyncState(userId, { ...syncState, progress: null, syncError: err.message });
    } catch (_) {}
  }
  })();
});

// POST /api/setup
// Finalizes onboarding wizard configuration and triggers large retroactive accounting adjustment
app.post('/api/setup', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { localCurrency, cards } = req.body;
    
    // Cards is an array of { id: string, name: string, bank: string, startDay: number }
    // We map this into our internal billingCycles and cardAliases structures for compatibility
    const billingCycles = {};
    const cardAliases = {}; // No longer heavily used but kept for schema compatibility

    if (cards && Array.isArray(cards)) {
      cards.forEach(card => {
        billingCycles[card.name] = card.startDay;
        cardAliases[card.name] = card.name;
      });
    }

    const newConfig = { 
      localCurrency, 
      cards, 
      billingCycles, 
      cardAliases, 
      setupComplete: true 
    };
    
    await saveConfig(userId, newConfig);
    res.json({ ok: true });
  } catch (err) {
    console.error('/api/setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions?month=YYYY-MM&viewBy=billing
app.get('/api/transactions', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const month = req.query.month || new Date().toISOString().substring(0, 7);
    const viewBy = req.query.viewBy || 'billing';
    const transactions = await getTransactions(userId, month, viewBy);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/summary?month=YYYY-MM&viewBy=billing
app.get('/api/summary', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const month = req.query.month || new Date().toISOString().substring(0, 7);
    const viewBy = req.query.viewBy || 'billing';
    const summary = await getSummary(userId, month, viewBy);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget?month=YYYY-MM
app.get('/api/budget', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const month = req.query.month || new Date().toISOString().substring(0, 7);
    const budget = await getBudget(userId, month);
    res.json(budget || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/budget
// Body: { month, overall, byCard, byCategory }
app.post('/api/budget', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { month, ...budgetData } = req.body;
    await saveBudget(userId, month, budgetData);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retirement
app.get('/api/retirement', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const data = await getRetirement(userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/retirement
// Body: { plan, nw }
app.post('/api/retirement', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { plan, nw } = req.body;
    await saveRetirement(userId, { plan: plan || {}, nw: nw || {} });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/retirement/snapshot
// Body: { date: "YYYY-MM-DD", netWorth, retireAssets }
app.post('/api/retirement/snapshot', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { date, netWorth, retireAssets } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date' });
    }
    const snapshots = await addNetWorthSnapshot(userId, {
      date,
      netWorth: Math.round(Number(netWorth) || 0),
      retireAssets: Math.round(Number(retireAssets) || 0)
    });
    res.json({ ok: true, snapshots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/syncstate
app.get('/api/syncstate', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const state = await getSyncState(userId);
    res.json(state || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config
app.get('/api/config', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const config = await getConfig(userId);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/config
app.post('/api/config', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const prevConfig = await getConfig(userId);
    
    const { syncPeriodMonths, localCurrency, cards } = req.body;

    // Build internal mappings for legacy lookups
    const billingCycles = {};
    const cardAliases = {};
    if (cards && Array.isArray(cards)) {
      cards.forEach(c => {
        billingCycles[c.name] = c.startDay;
        cardAliases[c.name] = c.name;
      });
    }

    const newConfig = {
      ...prevConfig,
      syncPeriodMonths: Number(syncPeriodMonths) || prevConfig.syncPeriodMonths,
      localCurrency: localCurrency || prevConfig.localCurrency,
      cards: cards || prevConfig.cards,
      billingCycles,
      cardAliases
    };

    await saveConfig(userId, newConfig);

    // If billing cycles changed, recompute months for all existing transactions
    const prevCycles = prevConfig.billingCycles || {};
    const cyclesChanged = JSON.stringify(billingCycles) !== JSON.stringify(prevCycles);

    let recomputed = 0;
    if (cyclesChanged) {
      const allTxns = await getAllTransactions(userId);
      const updatedTxns = allTxns.map(txn => {
        const normalizedCard = cardAliases[txn.card] || txn.card;
        const startDay = billingCycles[normalizedCard] || 1;
        const month = getBillingMonth(txn.date, startDay);
        const calendarMonth = txn.date.substring(0, 7);
        return { ...txn, card: normalizedCard, month, calendarMonth };
      });
      if (updatedTxns.length > 0) {
        await updateTransactionsBatch(userId, updatedTxns);
      }
      recomputed = updatedTxns.length;
    }

    res.json({ ok: true, recomputed });
  } catch (err) {
    console.error('/api/config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Diagnostic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve React frontend
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

app.get('*', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Error sending index.html from ${indexPath}:`, err);
      res.status(err.status || 500).end();
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`--------------------------------------------------`);
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Static assets path: ${publicPath}`);
  console.log(`--------------------------------------------------`);
});
