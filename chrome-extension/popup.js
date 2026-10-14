const API = 'https://api.backero.in/api';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screenLogin = document.getElementById('screen-login');
const screenMain  = document.getElementById('screen-main');
const statusDot   = document.getElementById('status-dot');
const loginErr    = document.getElementById('login-err');
const mainErr     = document.getElementById('main-err');
const mainOk      = document.getElementById('main-ok');
const pageUrlLabel = document.getElementById('page-url-label');

// ── Helpers ───────────────────────────────────────────────────────────────────
function showAlert(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : label;
}

function setConnected(yes) {
  statusDot.style.background = yes ? '#22c55e' : '#64748b';
  statusDot.style.boxShadow  = yes ? '0 0 6px #22c55e88' : 'none';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getToken() {
  return new Promise(resolve => chrome.storage.local.get('backero_token', d => resolve(d.backero_token)));
}

async function saveToken(token) {
  return new Promise(resolve => chrome.storage.local.set({ backero_token: token }, resolve));
}

async function clearToken() {
  return new Promise(resolve => chrome.storage.local.remove('backero_token', resolve));
}

// ── On open: decide which screen to show ─────────────────────────────────────
(async () => {
  const token = await getToken();
  if (token) {
    showMainScreen(token);
  } else {
    screenLogin.style.display = 'block';
    screenMain.style.display  = 'none';
  }
})();

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const btn = document.getElementById('btn-login');
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showAlert(loginErr, 'Enter your email and password.');
    return;
  }

  setLoading(btn, true, 'Sign In');

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok || !data.data?.token) {
      showAlert(loginErr, data.message || 'Login failed.');
      return;
    }

    await saveToken(data.data.token);
    showMainScreen(data.data.token);
  } catch (err) {
    showAlert(loginErr, 'Network error — check your connection.');
  } finally {
    setLoading(btn, false, 'Sign In');
  }
});

// ── Show main screen + populate from active tab ────────────────────────────────
async function showMainScreen(token) {
  screenLogin.style.display = 'none';
  screenMain.style.display  = 'block';
  setConnected(true);

  // Ask the content script for page info
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });

    pageUrlLabel.textContent = new URL(pageInfo.url).hostname;

    // Pre-fill form with extracted data
    if (pageInfo.phone)   document.getElementById('f-phone').value   = pageInfo.phone;
    if (pageInfo.email)   document.getElementById('f-email').value   = pageInfo.email;
    if (pageInfo.company) document.getElementById('f-company').value = pageInfo.company;

    // Store URL as sourceDetails
    document.getElementById('btn-submit').dataset.sourceUrl = pageInfo.url;
    document.getElementById('btn-submit').dataset.sourceNotes = pageInfo.description;
  } catch {
    pageUrlLabel.textContent = '(could not read page)';
  }
}

// ── Submit lead ───────────────────────────────────────────────────────────────
document.getElementById('btn-submit').addEventListener('click', async () => {
  const btn = document.getElementById('btn-submit');
  const token = await getToken();
  if (!token) { showAlert(mainErr, 'Session expired — please sign in again.'); return; }

  const name     = document.getElementById('f-name').value.trim();
  const phone    = document.getElementById('f-phone').value.trim().replace(/\D/g, '');
  const email    = document.getElementById('f-email').value.trim();
  const company  = document.getElementById('f-company').value.trim();
  const priority = document.getElementById('f-priority').value;
  const value    = Number(document.getElementById('f-value').value) || 0;
  const notes    = document.getElementById('f-notes').value.trim();
  const sourceUrl   = btn.dataset.sourceUrl   || '';
  const sourceNotes = btn.dataset.sourceNotes || '';

  if (!name)  { showAlert(mainErr, 'Name is required.'); return; }
  if (!phone) { showAlert(mainErr, 'Phone is required.'); return; }

  setLoading(btn, true, 'Save Lead to CRM');

  const payload = {
    name,
    phone,
    email: email || undefined,
    company: company || undefined,
    priority,
    estimatedValue: value,
    source: 'website',
    sourceDetails: sourceUrl,
    notes: [notes, sourceNotes].filter(Boolean).join('\n\n') || undefined,
  };

  try {
    const res = await fetch(`${API}/crm/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.status === 401) {
      await clearToken();
      showAlert(mainErr, 'Session expired — please sign in again.');
      setTimeout(() => location.reload(), 1500);
      return;
    }

    if (!res.ok) {
      showAlert(mainErr, data.message || 'Could not save lead.');
      return;
    }

    showAlert(mainOk, `Lead saved! ID: ${data.data?.lead?._id?.slice(-6) || 'ok'}`);

    // Reset form
    ['f-name', 'f-phone', 'f-email', 'f-company', 'f-value', 'f-notes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('f-priority').value = 'medium';

  } catch {
    showAlert(mainErr, 'Network error — check your connection.');
  } finally {
    setLoading(btn, false, 'Save Lead to CRM');
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', async () => {
  await clearToken();
  setConnected(false);
  screenMain.style.display  = 'none';
  screenLogin.style.display = 'block';
  document.getElementById('login-email').value    = '';
  document.getElementById('login-password').value = '';
});
