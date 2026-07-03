const axios = require('axios');
const BANK_DOMAINS = {
  'DBS': 'ibanking.alert@dbs.com OR dbs.com OR dbs.com.sg OR posb.com.sg',
  'SCB': 'sc.com OR sc.com.sg',
  'Citibank': 'citibank.com OR citibank.com.sg',
  'UOB': 'uobgroup.com OR uob.com.sg',
  'HSBC': 'hsbc.com.sg',
  'Maybank': 'maybank2u.com.sg',
  'AMEX': 'americanexpress.com'
};

// Fetch all relevant email IDs.
// accessToken: Gmail OAuth access token
// afterEmailId: last synced email ID (null for full sync)
// newerThanMonths: e.g., 3 means 'newer_than:3m'
// olderThanMonths: e.g., 6 means 'older_than:6m' (useful for historical gaps)
// banks: optional array of bank names (e.g. ['DBS', 'UOB'])
async function fetchEmailIds(accessToken, afterEmailId = null, newerThanMonths = null, olderThanMonths = null, banks = []) {
  let pageToken = null;
  const ids = [];

  let query = 'subject:(transaction OR debit OR credit OR payment OR alert OR charge)';
  
  if (banks && banks.length > 0) {
    const domains = banks.map(b => BANK_DOMAINS[b]).filter(Boolean);
    if (domains.length > 0) {
      query += ` from:(${domains.join(' OR ')})`;
    }
  } else {
    // Default fallback if no banks provided (legacy/broad)
    const allDomains = Object.values(BANK_DOMAINS);
    query += ` from:(${allDomains.join(' OR ')})`;
  }

  if (newerThanMonths) query += ` newer_than:${newerThanMonths}m`;
  if (olderThanMonths) query += ` older_than:${olderThanMonths}m`;

  console.log(`Gmail Query: ${query}`);

  do {
    const params = { q: query, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;

    const res = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params
    });

    const messages = res.data.messages || [];

    for (const msg of messages) {
      if (msg.id === afterEmailId) {
        // Reached the last synced email — stop paginating
        return ids;
      }
      ids.push(msg.id);
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return ids;
}

function decodeBase64Url(data) {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBodyFromParts(parts) {
  if (!parts) return { text: '', html: '' };

  let text = '';
  let html = '';

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data && !text) {
      text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    }

    if ((!text || !html) && part.parts) {
      const nested = extractBodyFromParts(part.parts);
      text ||= nested.text;
      html ||= nested.html;
    }
  }

  return { text, html };
}

// Fetch the plain text body and subject of a single email.
async function fetchEmailDetails(accessToken, emailId) {
  const res = await axios.get(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { format: 'full' }
    }
  );

  const payload = res.data.payload;

  // Extract subject
  const headers = payload.headers || [];
  const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
  const subject = subjectHeader ? subjectHeader.value : 'No Subject';

  let body = '';
  if (payload.body?.data) {
    body = decodeBase64Url(payload.body.data);
  } else {
    const extracted = extractBodyFromParts(payload.parts);
    body = extracted.text || htmlToText(extracted.html);
  }

  return {
    subject,
    body,
    receivedAt: res.data.internalDate ? new Date(Number(res.data.internalDate)).toISOString() : null
  };
}

module.exports = { fetchEmailIds, fetchEmailDetails };
