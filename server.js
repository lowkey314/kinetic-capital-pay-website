const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key'
);

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || 'placeholder-client-id',
      'PLAID-SECRET': process.env.PLAID_SECRET || 'placeholder-secret',
    },
  },
});

const plaid = new PlaidApi(plaidConfig);

const encryptionKey = process.env.ACCESS_TOKEN_ENCRYPTION_KEY || 'replace-with-a-real-long-random-32-byte-key';

function encryptText(value) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

function decryptText(value, ivHex) {
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(value, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid auth token.' });
    }

    req.user = { id: data.user.id, email: data.user.email };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Unable to validate auth token.' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    environment: process.env.PLAID_ENV || 'sandbox',
    plaidConfigured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

app.post('/api/create-link-token', requireAuth, async (req, res) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: req.user.id },
      client_name: 'Kinetic Capital Pay',
      products: ['transactions', 'auth'],
      country_codes: ['US'],
      language: 'en',
    });

    res.json({ link_token: response.data.link_token });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to create link token.' });
  }
});

app.post('/api/exchange-public-token', requireAuth, async (req, res) => {
  const { public_token } = req.body || {};
  if (!public_token) {
    return res.status(400).json({ error: 'public_token is required.' });
  }

  try {
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const encrypted = encryptText(accessToken);

    const { error } = await supabase.from('bank_accounts').upsert(
      {
        user_id: req.user.id,
        plaid_item_id: itemId,
        institution_name: 'Connected via Plaid',
        access_token_encrypted: encrypted.ciphertext,
        access_token_iv: encrypted.iv,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,plaid_item_id' }
    );

    if (error) {
      return res.status(500).json({ error: error.message || 'Unable to save access token.' });
    }

    res.json({ ok: true, item_id: itemId });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to exchange public token.' });
  }
});

app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const { data: records, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active');

    if (error) throw error;

    const accounts = [];

    for (const record of records || []) {
      const token = decryptText(record.access_token_encrypted, record.access_token_iv);
      const response = await plaid.accountsGet({ access_token: token });
      response.data.accounts.forEach((account) => {
        accounts.push({
          ...account,
          institution_name: record.institution_name,
        });
      });
    }

    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to fetch accounts.' });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { data: records, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active');

    if (error) throw error;

    const transactions = [];

    for (const record of records || []) {
      const token = decryptText(record.access_token_encrypted, record.access_token_iv);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const response = await plaid.transactionsGet({
        access_token: token,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
      });

      response.data.transactions.forEach((transaction) => {
        transactions.push({
          ...transaction,
          institution_name: record.institution_name,
        });
      });
    }

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to fetch transactions.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
