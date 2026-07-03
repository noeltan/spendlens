const axios = require('axios');

const CATEGORIES = [
  'Dining', 'Groceries', 'Transport', 'Shopping', 'Bills',
  'Health', 'Travel', 'Entertainment', 'Education', 'Other'
];

const MONTHS = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11
};

function normalizeYear(yearText) {
  const year = Number(yearText);
  if (Number.isNaN(year)) return null;
  return year < 100 ? 2000 + year : year;
}

function parseDbsAlertDate(body, receivedAt) {
  const explicitDate = body.match(/request dated\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (explicitDate) {
    const [, dd, mm, yy] = explicitDate;
    return `${normalizeYear(yy)}-${mm}-${dd}`;
  }

  const dateTime = body.match(/Date\s*&\s*Time:\s*(\d{1,2})\s+([A-Z]{3})/i);
  if (dateTime) {
    const [, dayText, monthText] = dateTime;
    const month = MONTHS[monthText.toUpperCase()];
    const fallback = receivedAt ? new Date(receivedAt) : new Date();
    const year = fallback.getUTCFullYear();
    const day = String(Number(dayText)).padStart(2, '0');
    const monthNum = String(month + 1).padStart(2, '0');
    return `${year}-${monthNum}-${day}`;
  }

  if (receivedAt) return receivedAt.substring(0, 10);
  return null;
}

function inferCategory(merchant) {
  const value = merchant.toLowerCase();
  if (value.includes('subscription') || value.includes('spotify') || value.includes('netflix') || value.includes('google') || value.includes('apple')) {
    return 'Bills';
  }
  if (value.includes('grab') || value.includes('gojek') || value.includes('comfort')) {
    return 'Transport';
  }
  if (value.includes('airbnb') || value.includes('agoda') || value.includes('booking') || value.includes('hotel') || value.includes('airlines')) {
    return 'Travel';
  }
  if (value.includes('mcdonald') || value.includes('bakery') || value.includes('coffee') || value.includes('restaurant')) {
    return 'Dining';
  }
  return 'Other';
}

function pickCardName(bank, cards) {
  const matchingCards = cards.filter(card => (card.bank || '').toUpperCase() === bank.toUpperCase());
  if (matchingCards.length === 1) return matchingCards[0].name;
  return bank;
}

function parseKnownEmail(email, cards = []) {
  const subject = email.subject || '';
  const body = email.body || '';

  if (!/card transaction alert/i.test(subject) || !/DBS\/POSB card ending/i.test(body)) {
    return null;
  }

  const amountMatch = body.match(/Amount:\s*([A-Z]{3})\s*([\d,]+(?:\.\d{2})?)/i);
  const merchantMatch = body.match(/To:\s*(.+)/i);
  const date = parseDbsAlertDate(body, email.receivedAt);

  if (!amountMatch || !merchantMatch || !date) return null;

  const currency = amountMatch[1].toUpperCase();
  const amount = Number(amountMatch[2].replace(/,/g, ''));
  const merchant = merchantMatch[1].trim().replace(/\s+/g, ' ');
  if (!Number.isFinite(amount)) return null;

  return {
    emailId: email.id,
    date,
    amount,
    amountLocal: null,
    currency,
    merchant,
    category: inferCategory(merchant),
    card: pickCardName('DBS', cards),
    type: 'CHARGE'
  };
}

function extractJsonArray(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON array found');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

// Parse a batch of raw email details into structured transactions.
// emails: [{ id: string, subject: string, body: string, receivedAt?: string }]
// cards: [{ name: string, bank: string }]
// Returns: [{ emailId, date, amount, currency, merchant, category, card, type }]
async function parseEmails(emails, cards = []) {
  const knownParses = [];
  const remainingEmails = [];

  for (const email of emails) {
    const parsed = parseKnownEmail(email, cards);
    if (parsed) {
      knownParses.push(parsed);
    } else {
      remainingEmails.push(email);
    }
  }

  if (remainingEmails.length === 0) {
    return knownParses;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  const cardListText = cards.length > 0 
    ? `The user has the following cards. PLEASE map each transaction to one of these exactly if possible:\n${cards.map(c => `- "${c.name}" (${c.bank})`).join('\n')}`
    : "Determine the card name (e.g. 'DBS Debit', 'SCB Credit') from the email content.";

  const emailsText = remainingEmails
    .map(e => `EMAIL_ID: ${e.id}\nRECEIVED_AT: ${e.receivedAt || 'UNKNOWN'}\nSUBJECT: ${e.subject}\nBODY: ${e.body}`)
    .join('\n\n---\n\n');

  const prompt = `
You are a financial transaction parser for a Singapore household. Your job is to extract credit card and debit card transaction alerts from bank notification emails.

These emails are from Singapore banks: DBS, Standard Chartered (SCB), Citibank, UOB, HSBC, Maybank, and American Express (AMEX).
The emails are typically transaction alerts, card alerts, or card transaction notifications sent by the bank when a card is used.

CONTEXT:
${cardListText}

For each transaction found, return a JSON object with these exact fields:
- emailId: the EMAIL_ID value from the header of the email it came from
- date: transaction date as "YYYY-MM-DD". If only a time is given with no date, use the RECEIVED_AT value from the email header.
- amount: transaction amount as a numeric value in the original transaction currency. No currency symbol. Always positive.
- amountLocal: the transaction amount in your home currency (usually SGD) ONLY if mentioned explicitly in the email (e.g. as "estimated" or "approximately"). If NOT specifically mentioned, leave this field as null.
- currency: 3-letter ISO currency code (e.g. "SGD", "USD", "GBP", "MYR"). Look for explicit currency codes or symbols. Default to "SGD" ONLY if no currency is mentioned anywhere in the email.
- merchant: cleaned merchant name. Remove store codes, terminal IDs, city suffixes, and excessive capitalisation. (e.g. "McDonald's" not "MCDONALD'S VIVOCITY S 001", "Grab" not "GRAB* GRABFOOD SG")
- category: MUST be exactly one of: ${CATEGORIES.join(', ')}
- card: the card name. If it matches one of the user's cards above, use that EXACT name. Otherwise, use a descriptive name found in the email.
- type: MUST be exactly one of: "CHARGE", "AUTH_HOLD", or "PAYMENT"

---

TYPE CLASSIFICATION RULES (apply in this order):

1. PAYMENT — classify as PAYMENT if the email is about:
   - Credit card bill or statement payment received
   - Incoming fund transfers: PayNow, FAST, GIRO, Interbank Transfer, Bank Transfer
   - Salary or payroll credits
   - Any notification that money was received INTO an account (not spent)
   - Refunds or reversals back to the card/account

2. AUTH_HOLD — classify as AUTH_HOLD if the email mentions:
   - "pre-authorisation", "pre-auth", "authorisation hold", "temporary hold"
   - Small card verification charges (e.g. $0.01, $1.00) from services like Netflix, Google, Spotify
   - Fuel station holds or hotel incidental holds

3. CHARGE — classify as CHARGE for all other card transactions where money was spent at a merchant.

IMPORTANT: Never classify PayNow, FAST, GIRO, Interbank Transfer, or Bank Transfer notifications as CHARGE. They are always PAYMENT or should be skipped.

---

CATEGORY RULES:

Use the merchant name and context to assign the best category. Guidelines:
- Dining: restaurants, cafes, food delivery (Grab Food, Foodpanda, Deliveroo), hawker centres, bubble tea
- Groceries: supermarkets (NTUC FairPrice, Cold Storage, Giant, Sheng Siong), wet markets, RedMart
- Transport: Grab rides, Gojek, MRT/bus top-ups (EZ-Link, SimplyGo), petrol, ERP, parking, ComfortDelGro
- Shopping: retail stores, Lazada, Shopee, Amazon, Qoo10, SP PIVENE (wine retailer — always Shopping not Bills)
- Bills: utilities (SP Group, PUB), telco (Singtel, StarHub, M1, SIMBA), insurance premiums, subscriptions (Netflix, Spotify, Apple, Google)
- Health: pharmacies (Guardian, Watsons), clinics, hospitals, dental, gym memberships (ActiveSG, Anytime Fitness)
- Travel: airlines, hotels, Agoda, Booking.com, Airbnb, travel agencies, foreign transactions at overseas merchants
- Entertainment: movies (Shaw, Golden Village), attractions, concerts, sports events, games
- Education: school fees, tuition, courses, SkillsFuture, bookstores
- Other: anything that does not clearly fit the above

---

OUTPUT RULES:

- Return ONLY a valid raw JSON array. No markdown fences, no backticks, no explanation text before or after.
- One JSON object per transaction found.
- If an email contains no card transaction (e.g. it is a marketing email, OTP, or account statement notification with no individual transaction), skip it entirely — do not include it in the output.
- If the transaction amount cannot be determined, skip that transaction.
- If the same transaction appears in multiple emails, include it once using the most recent emailId.
- Do not fabricate or infer transactions that are not explicitly stated in the email.

---

Emails to parse:
${emailsText}
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    }
  );

  const raw = response.data.candidates[0].content.parts[0].text;
  try {
    const parsed = extractJsonArray(raw);
    return [...knownParses, ...parsed];
  } catch (err) {
    console.error("Failed to parse Gemini output:", raw);
    return knownParses;
  }
}

module.exports = { parseEmails };
