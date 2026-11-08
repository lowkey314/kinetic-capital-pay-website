const express = require('express');
const dotenv = require('dotenv');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const requiredConfig = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'];
const hasPlaidConfig = requiredConfig.every((key) => Boolean(process.env[key]));

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = hasPlaidConfig ? new PlaidApi(configuration) : null;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, plaidConfigured: !!plaidClient, environment: process.env.PLAID_ENV || 'sandbox' });
});

app.get('/api/account', (req, res) => {
  res.json({
    totalBalance: 8000000,
    availableCash: 4680000,
    pendingFunds: 1240000,
    totalInflow: 1240000,
    totalOutflow: 860000,
    lastUpdatedLabel: '2 minutes ago',
    transactions: [
      { title: 'Client settlement', detail: 'May 14 • ACH completion', amount: 420000, type: 'credit' },
      { title: 'Merchant payout', detail: 'May 13 • Automated transfer', amount: -180000, type: 'debit' },
      { title: 'Processor rebate', detail: 'May 12 • Card settlement', amount: 265000, type: 'credit' }
    ]
  });
});

app.post('/api/plaid/exchange', async (req, res) => {
  if (!plaidClient) {
    return res.status(400).json({ error: 'Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV.' });
  }

  try {
    const { public_token } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    res.json({ accessToken: response.data.access_token });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to exchange public token.' });
  }
});

app.get('/api/plaid/link-token', async (req, res) => {
  if (!plaidClient) {
    return res.status(400).json({ error: 'Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV.' });
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: 'kinetic-capital-pay-user',
      },
      client_name: 'Kinetic Capital Pay',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });

    res.json({ link_token: response.data.link_token, environment: process.env.PLAID_ENV || 'sandbox' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to create link token.' });
  }
});

app.listen(port, () => {
  console.log(`Kinetic Capital Pay dashboard server running on http://localhost:${port}`);
  console.log(plaidClient ? 'Plaid integration is enabled.' : 'Plaid integration is not enabled yet. Set the environment variables to connect a live bank.');
});
