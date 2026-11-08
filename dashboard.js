const defaults = {
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
};

const money = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(value);

function render(data) {
  const totalBalance = document.getElementById('totalBalance');
  const availableCash = document.getElementById('availableCash');
  const pendingFunds = document.getElementById('pendingFunds');
  const totalInflow = document.getElementById('totalInflow');
  const totalOutflow = document.getElementById('totalOutflow');
  const lastUpdated = document.getElementById('lastUpdated');
  const transactionList = document.getElementById('transactionList');

  totalBalance.textContent = money(data.totalBalance);
  availableCash.textContent = money(data.availableCash);
  pendingFunds.textContent = money(data.pendingFunds);
  totalInflow.textContent = money(data.totalInflow);
  totalOutflow.textContent = money(data.totalOutflow);
  lastUpdated.textContent = data.lastUpdatedLabel;

  if (transactionList) {
    transactionList.innerHTML = data.transactions.map(item => {
      const amount = item.type === 'credit' ? `+$${(item.amount / 1000).toFixed(0)}k` : `-$${(Math.abs(item.amount) / 1000).toFixed(0)}k`;
      const className = item.type === 'credit' ? 'credit' : 'debit';
      return `
        <li>
          <div>
            <strong>${item.title}</strong>
            <small>${item.detail}</small>
          </div>
          <span class="${className}">${amount}</span>
        </li>
      `;
    }).join('');
  }
}

async function loadAccountData() {
  const statusMessage = document.getElementById('statusMessage');
  try {
    const response = await fetch('/api/account');
    if (!response.ok) {
      throw new Error('No backend account API configured yet');
    }
    const payload = await response.json();
    render(payload);
    statusMessage.textContent = 'Bank data refreshed successfully.';
  } catch (error) {
    render(defaults);
    statusMessage.textContent = 'No live banking backend is configured yet. Using demo account values.';
  }
}

async function connectBank() {
  const statusMessage = document.getElementById('statusMessage');
  try {
    const response = await fetch('/api/plaid/link-token');
    if (!response.ok) {
      throw new Error('Plaid link token not configured');
    }
    const payload = await response.json();
    statusMessage.textContent = `Plaid token received. Add your Plaid Link code to continue using ${payload.environment || 'production'} mode.`;
  } catch (error) {
    statusMessage.textContent = 'Plaid is not configured in this environment yet. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to enable live bank connections.';
  }
}

document.getElementById('refreshBtn')?.addEventListener('click', loadAccountData);
document.getElementById('connectBankBtn')?.addEventListener('click', connectBank);

render(defaults);
loadAccountData();
