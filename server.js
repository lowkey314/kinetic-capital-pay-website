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

const requiredPlaidConfig = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'];
const hasPlaidConfig = requiredPlaidConfig.every((key) => Boolean(process.env[key]));

const requiredSupabaseConfig = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const hasSupabaseConfig = requiredSupabaseConfig.every((key) => Boolean(process.env[key]));

const supabase = hasSupabaseConfig
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaid = hasPlaidConfig ? new PlaidApi(plaidConfig) : null;

const encryptionKey = process.env.ACCESS_TOKEN_ENCRYPTION_KEY || 'fallback-dev-key-change-me';

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
  const decrypted = Buffer.concat([decipher.update(Buffer.from(value, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token.' });
  }

  // This is intentionally a lightweight placeholder for Supabase JWT validation.
  // In production, validate the JWT with Supabase and set req.user from decoded claims.
  req.user = { id: 'demo-user-id' };
  return next();
}

function getUserId(req) {
  return req.user?.id || 'demo-user-id';
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    plaidConfigured: !!plaid,
    supabaseConfigured: !!supabase,
    environment: process.env.PLAID_ENV || 'sandbox',
  });
});

app.post('/api/create-link-token', requireAuth, async (req, res) => {
  if (!plaid) {
    return res.status(500).json({ error: 'Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV.' });
  }

  try {
    const userId = getUserId(req);
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Kinetic Capital Pay',
      products: ['transactions', 'auth'],
      country_codes: ['US'],
      language: 'en',
    });

    return res.json({ link_token: response.data.link_token });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to create link token.' });
  }
});

app.post('/api/exchange-public-token', requireAuth, async (req, res) => {
  if (!plaid) {
    return res.status(500).json({ error: 'Plaid is not configured.' });
  }

  const { public_token } = req.body || {};
  if (!public_token) {
    return res.status(400).json({ error: 'public_token is required.' });
  }

  try {
    const userId = getUserId(req);
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const encrypted = encryptText(accessToken);

    if (supabase) {
      const { error } = await supabase.from('bank_accounts').upsert(
        {
          user_id: userId,
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
        return res.status(500).json({ error: error.message || 'Unable to save encrypted access token.' });
      }
    }

    return res.json({ ok: true, item_id: itemId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to exchange public token.' });
  }
});

app.get('/api/accounts', requireAuth, async (req, res) => {
  if (!plaid) {
    return res.status(500).json({ error: 'Plaid is not configured.' });
  }

  const userId = getUserId(req);

  try {
    let bankAccounts = [];

    if (supabase) {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        return res.status(500).json({ error: error.message || 'Unable to load saved bank accounts.' });
      }

      bankAccounts = data || [];
    }

    if (bankAccounts.length === 0) {
      return res.json({ accounts: [] });
    }

    const accounts = [];

    for (const bankAccount of bankAccounts) {
      const token = decryptText(bankAccount.access_token_encrypted, bankAccount.access_token_iv);
      const response = await plaid.accountsGet({ access_token: token });
      accounts.push(...response.data.accounts.map((account) => ({
        ...account,
        institution_name: bankAccount.institution_name,
      })));
    }

    return res.json({ accounts });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to fetch account balances.' });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  if (!plaid) {
    return res.status(500).json({ error: 'Plaid is not configured.' });
  }

  const userId = getUserId(req);

  try {
    let bankAccounts = [];

    if (supabase) {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        return res.status(500).json({ error: error.message || 'Unable to load saved bank accounts.' });
      }

      bankAccounts = data || [];
    }

    if (bankAccounts.length === 0) {
      return res.json({ transactions: [] });
    }

    const result = [];

    for (const bankAccount of bankAccounts) {
      const token = decryptText(bankAccount.access_token_encrypted, bankAccount.access_token_iv);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const response = await plaid.transactionsGet({
        access_token: token,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
      });

      result.push(...response.data.transactions.map((transaction) => ({
        ...transaction,
        institution_name: bankAccount.institution_name,
      })));
    }

    return res.json({ transactions: result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to fetch transactions.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(plaid ? 'Plaid integration ready.' : 'Plaid integration is not configured yet.');
  console.log(supabase ? 'Supabase integration ready.' : 'Supabase integration is not configured yet.');
});
