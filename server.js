/**
 * M&H Mobile Mechanic — Backend Server
 * Node.js + Express · No database required (JSON file storage)
 * 
 * Features:
 *  - POST /api/quote      — receive booking requests from the website
 *  - GET  /api/leads      — list all leads (admin, auth required)
 *  - PATCH /api/leads/:id — update lead status
 *  - GET  /admin          — admin dashboard HTML
 *  - Email notifications via Nodemailer (Gmail or SMTP)
 * 
 * Setup:
 *   npm install express nodemailer cors helmet dotenv
 *   cp .env.example .env  (fill in your credentials)
 *   node server.js
 */

require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const cors       = require('cors');
const helmet     = require('helmet');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'leads.json');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // serve index.html

// ─── Data helpers ─────────────────────────────────────────────────────────────
function readLeads() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return []; }
}

function writeLeads(leads) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
}

// ─── Email setup ──────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendLeadEmail(lead) {
  if (!process.env.EMAIL_USER) return; // skip if not configured

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #e85d04; color: white; padding: 20px 24px; border-radius: 4px 4px 0 0;">
        <h2 style="margin:0; font-size: 22px;">🔧 New Quote Request — M&H Mobile</h2>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border: 1px solid #eee;">
        <table style="width:100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; color: #666; width: 140px;">Name</td><td style="padding: 8px; font-weight: bold;">${lead.name}</td></tr>
          <tr style="background:#fff"><td style="padding: 8px; color: #666;">Phone</td><td style="padding: 8px;"><a href="tel:${lead.phone}">${lead.phone}</a></td></tr>
          <tr><td style="padding: 8px; color: #666;">Email</td><td style="padding: 8px;">${lead.email || '—'}</td></tr>
          <tr style="background:#fff"><td style="padding: 8px; color: #666;">Car</td><td style="padding: 8px;">${lead.car}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Service</td><td style="padding: 8px; color: #e85d04; font-weight: bold;">${lead.service}</td></tr>
          <tr style="background:#fff"><td style="padding: 8px; color: #666;">Suburb</td><td style="padding: 8px;">${lead.suburb}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Message</td><td style="padding: 8px;">${lead.message || '—'}</td></tr>
          <tr style="background:#fff"><td style="padding: 8px; color: #666;">Submitted</td><td style="padding: 8px;">${lead.submitted}</td></tr>
        </table>
      </div>
      <div style="background: #0d0d0d; color: #888; padding: 12px 24px; font-size: 12px; border-radius: 0 0 4px 4px;">
        M&H Mobile Mechanic — Lead ID: ${lead.id}
      </div>
    </div>
  `;

  const confirmHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #e85d04; color: white; padding: 20px 24px; border-radius: 4px 4px 0 0;">
        <h2 style="margin:0;">Thanks for contacting M&H Mobile Mechanic</h2>
      </div>
      <div style="padding: 24px; background: #f9f9f9; border: 1px solid #eee;">
        <p>Hi ${lead.name.split(' ')[0]},</p>
        <p>We've received your request for a <strong>${lead.service}</strong> and Mehdi will be in touch with you shortly — usually within a few hours during business hours.</p>
        <p>For urgent assistance, call directly: <a href="tel:0424334080" style="color:#e85d04; font-weight:bold;">0424 334 080</a></p>
        <p style="color: #888; font-size: 13px; margin-top: 24px;">M&H Mobile Mechanic · Northmead NSW · Mon–Sat 7am–6pm</p>
      </div>
    </div>
  `;

  try {
    // Notify Mehdi
    await transporter.sendMail({
      from: `"M&H Website" <${process.env.EMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
      subject: `🔧 New Quote: ${lead.service} — ${lead.name} (${lead.suburb})`,
      html,
    });

    // Confirm to customer
    if (lead.email) {
      await transporter.sendMail({
        from: `"M&H Mobile Mechanic" <${process.env.EMAIL_USER}>`,
        to: lead.email,
        subject: 'We received your quote request — M&H Mobile Mechanic',
        html: confirmHtml,
      });
    }
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

// ─── Admin auth middleware ─────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key && key === process.env.ADMIN_KEY) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/quote — Submit a new quote request
app.post('/api/quote', async (req, res) => {
  const { firstName, lastName, phone, email, car, service, suburb, message } = req.body;

  // Validate required fields
  const required = { firstName, lastName, phone, car, service, suburb };
  const missing = Object.entries(required).filter(([, v]) => !v?.trim()).map(([k]) => k);
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields', missing });
  }

  const lead = {
    id: crypto.randomUUID(),
    name: `${firstName.trim()} ${lastName.trim()}`,
    phone: phone.trim(),
    email: email?.trim() || '',
    car: car.trim(),
    service: service.trim(),
    suburb: suburb.trim(),
    message: message?.trim() || '',
    submitted: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
    status: 'new',    // new | contacted | booked | completed | cancelled
    notes: '',
  };

  const leads = readLeads();
  leads.unshift(lead);
  writeLeads(leads);

  // Fire-and-forget email
  sendLeadEmail(lead);

  res.json({ success: true, id: lead.id });
});

// GET /api/leads — List all leads (admin only)
app.get('/api/leads', requireAdmin, (req, res) => {
  const leads = readLeads();
  const { status, q } = req.query;
  let filtered = leads;
  if (status) filtered = filtered.filter(l => l.status === status);
  if (q) {
    const s = q.toLowerCase();
    filtered = filtered.filter(l =>
      l.name.toLowerCase().includes(s) ||
      l.phone.includes(s) ||
      l.suburb.toLowerCase().includes(s) ||
      l.service.toLowerCase().includes(s)
    );
  }
  res.json({ total: leads.length, count: filtered.length, leads: filtered });
});

// PATCH /api/leads/:id — Update lead status/notes
app.patch('/api/leads/:id', requireAdmin, (req, res) => {
  const leads = readLeads();
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead not found' });

  const allowed = ['status', 'notes'];
  allowed.forEach(key => {
    if (req.body[key] !== undefined) leads[idx][key] = req.body[key];
  });
  leads[idx].updatedAt = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  writeLeads(leads);

  res.json({ success: true, lead: leads[idx] });
});

// DELETE /api/leads/:id
app.delete('/api/leads/:id', requireAdmin, (req, res) => {
  let leads = readLeads();
  const before = leads.length;
  leads = leads.filter(l => l.id !== req.params.id);
  if (leads.length === before) return res.status(404).json({ error: 'Not found' });
  writeLeads(leads);
  res.json({ success: true });
});

// GET /admin — Admin dashboard
app.get('/admin', requireAdmin, (req, res) => {
  res.send(adminDashboardHTML());
});

// ─── Admin Dashboard HTML ─────────────────────────────────────────────────────
function adminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>M&H Admin Dashboard</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --orange: #e85d04;
  --black: #0d0d0d;
  --gray: #1a1a1a;
  --gray-mid: #2a2a2a;
  --white: #f0ede8;
  --muted: #888;
  --green: #22c55e;
  --blue: #3b82f6;
  --red: #ef4444;
  --yellow: #f59e0b;
}
body { background: var(--black); color: var(--white); font-family: system-ui, sans-serif; font-size: 14px; }
header { background: var(--gray); border-bottom: 2px solid var(--orange); padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
header h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.05em; }
header span { color: var(--orange); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px; background: var(--gray-mid); border-bottom: 1px solid var(--gray-mid); }
.stat { background: var(--gray); padding: 1.2rem 1.5rem; }
.stat-val { font-size: 2rem; font-weight: 700; color: var(--orange); }
.stat-lbl { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
.toolbar { display: flex; gap: 0.75rem; padding: 1rem 2rem; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--gray-mid); }
input[type=text] { background: var(--gray); border: 1px solid var(--gray-mid); border-radius: 4px; padding: 0.5rem 0.75rem; color: var(--white); font-size: 13px; width: 220px; outline: none; }
input[type=text]:focus { border-color: var(--orange); }
select { background: var(--gray); border: 1px solid var(--gray-mid); border-radius: 4px; padding: 0.5rem 0.75rem; color: var(--white); font-size: 13px; outline: none; cursor: pointer; }
select:focus { border-color: var(--orange); }
.leads { padding: 1.5rem 2rem; }
.lead-card { background: var(--gray); border: 1px solid var(--gray-mid); border-radius: 6px; padding: 1.2rem 1.4rem; margin-bottom: 0.75rem; display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 1rem; align-items: start; transition: border-color 0.2s; }
.lead-card:hover { border-color: rgba(232,93,4,0.3); }
.lead-card.status-new { border-left: 3px solid var(--orange); }
.lead-card.status-contacted { border-left: 3px solid var(--blue); }
.lead-card.status-booked { border-left: 3px solid var(--green); }
.lead-card.status-completed { border-left: 3px solid var(--muted); }
.lead-card.status-cancelled { border-left: 3px solid var(--red); opacity: 0.6; }
.lead-name { font-weight: 700; font-size: 15px; margin-bottom: 3px; }
.lead-phone { color: var(--orange); font-weight: 600; }
.lead-email { color: var(--muted); font-size: 12px; }
.lead-field { font-size: 12px; color: var(--muted); margin-bottom: 2px; }
.lead-field strong { color: var(--white); }
.badge { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.badge-new { background: rgba(232,93,4,0.2); color: #ff7a24; }
.badge-contacted { background: rgba(59,130,246,0.2); color: #60a5fa; }
.badge-booked { background: rgba(34,197,94,0.2); color: #4ade80; }
.badge-completed { background: rgba(136,136,136,0.2); color: #aaa; }
.badge-cancelled { background: rgba(239,68,68,0.2); color: #f87171; }
.lead-actions { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
.lead-actions select { font-size: 12px; padding: 4px 8px; }
.lead-actions button { background: transparent; border: 1px solid var(--gray-mid); border-radius: 4px; color: var(--muted); padding: 4px 10px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
.lead-actions button:hover { border-color: var(--red); color: var(--red); }
.lead-message { font-size: 12px; color: var(--muted); font-style: italic; margin-top: 4px; border-top: 1px solid var(--gray-mid); padding-top: 6px; grid-column: 1/-1; }
.empty { text-align: center; color: var(--muted); padding: 4rem; }
#count { color: var(--muted); font-size: 13px; margin-left: auto; }
</style>
</head>
<body>
<header>
  <h1>M<span>&</span>H Mobile Mechanic — <span>Lead Dashboard</span></h1>
  <span id="lastRefresh" style="font-size:12px;color:var(--muted)"></span>
</header>
<div class="stats" id="statsBar">
  <div class="stat"><div class="stat-val" id="sTotal">—</div><div class="stat-lbl">Total Leads</div></div>
  <div class="stat"><div class="stat-val" id="sNew" style="color:#ff7a24">—</div><div class="stat-lbl">New</div></div>
  <div class="stat"><div class="stat-val" id="sContacted" style="color:#60a5fa">—</div><div class="stat-lbl">Contacted</div></div>
  <div class="stat"><div class="stat-val" id="sBooked" style="color:#4ade80">—</div><div class="stat-lbl">Booked</div></div>
  <div class="stat"><div class="stat-val" id="sCompleted" style="color:#888">—</div><div class="stat-lbl">Completed</div></div>
</div>
<div class="toolbar">
  <input type="text" id="searchInput" placeholder="🔍 Search name, phone, suburb…" oninput="filterLeads()">
  <select id="statusFilter" onchange="filterLeads()">
    <option value="">All Statuses</option>
    <option value="new">New</option>
    <option value="contacted">Contacted</option>
    <option value="booked">Booked</option>
    <option value="completed">Completed</option>
    <option value="cancelled">Cancelled</option>
  </select>
  <button onclick="loadLeads()" style="background:var(--orange);border:none;color:white;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;font-size:13px;">↻ Refresh</button>
  <span id="count"></span>
</div>
<div class="leads" id="leadsContainer"><div class="empty">Loading…</div></div>

<script>
const ADMIN_KEY = new URLSearchParams(location.search).get('key');
let allLeads = [];

const statusColors = { new:'badge-new', contacted:'badge-contacted', booked:'badge-booked', completed:'badge-completed', cancelled:'badge-cancelled' };
const statusLabels = { new:'New', contacted:'Contacted', booked:'Booked', completed:'Completed', cancelled:'Cancelled' };

async function loadLeads() {
  try {
    const r = await fetch('/api/leads?key=' + ADMIN_KEY);
    const d = await r.json();
    allLeads = d.leads || [];
    updateStats(allLeads);
    filterLeads();
    document.getElementById('lastRefresh').textContent = 'Refreshed: ' + new Date().toLocaleTimeString('en-AU');
  } catch(e) { document.getElementById('leadsContainer').innerHTML = '<div class="empty">Error loading leads. Check admin key.</div>'; }
}

function updateStats(leads) {
  document.getElementById('sTotal').textContent = leads.length;
  ['new','contacted','booked','completed'].forEach(s => {
    document.getElementById('s' + s.charAt(0).toUpperCase() + s.slice(1)).textContent = leads.filter(l=>l.status===s).length;
  });
}

function filterLeads() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  let filtered = allLeads;
  if (status) filtered = filtered.filter(l => l.status === status);
  if (q) filtered = filtered.filter(l => 
    l.name.toLowerCase().includes(q) || l.phone.includes(q) ||
    (l.suburb||'').toLowerCase().includes(q) || l.service.toLowerCase().includes(q)
  );
  document.getElementById('count').textContent = filtered.length + ' of ' + allLeads.length + ' leads';
  renderLeads(filtered);
}

function renderLeads(leads) {
  const c = document.getElementById('leadsContainer');
  if (!leads.length) { c.innerHTML = '<div class="empty">No leads found.</div>'; return; }
  c.innerHTML = leads.map(l => {
    const messageHTML = l.message ? '<div class="lead-message">"' + l.message + '"</div>' : '';
    return \`
    <div class="lead-card status-\${l.status}" id="card-\${l.id}">
      <div>
        <div class="lead-name">\${l.name}</div>
        <div class="lead-phone"><a href="tel:\${l.phone}" style="color:inherit">\${l.phone}</a></div>
        <div class="lead-email">\${l.email || '—'}</div>
        <div style="margin-top:6px"><span class="badge \${statusColors[l.status]}">\${statusLabels[l.status]}</span></div>
      </div>
      <div>
        <div class="lead-field"><strong>\${l.service}</strong></div>
        <div class="lead-field">Car: <strong>\${l.car}</strong></div>
        <div class="lead-field">Suburb: <strong>\${l.suburb}</strong></div>
      </div>
      <div>
        <div class="lead-field">Submitted: <strong>\${l.submitted}</strong></div>
        \${l.updatedAt ? '<div class="lead-field">Updated: <strong>'+l.updatedAt+'</strong></div>' : ''}
        \${l.notes ? '<div class="lead-field" style="margin-top:6px;padding:6px;background:rgba(255,255,255,0.04);border-radius:3px;">'+l.notes+'</div>' : ''}
      </div>
      <div class="lead-actions">
        <select onchange="updateStatus('\${l.id}', this.value)">
          <option value="new" \${l.status==='new'?'selected':''}>New</option>
          <option value="contacted" \${l.status==='contacted'?'selected':''}>Contacted</option>
          <option value="booked" \${l.status==='booked'?'selected':''}>Booked</option>
          <option value="completed" \${l.status==='completed'?'selected':''}>Completed</option>
          <option value="cancelled" \${l.status==='cancelled'?'selected':''}>Cancelled</option>
        </select>
        <button onclick="deleteLead('\${l.id}')">🗑 Delete</button>
      </div>
      \${messageHTML}
    </div>
  \`;
  }).join('');
}

async function updateStatus(id, status) {
  await fetch('/api/leads/' + id + '?key=' + ADMIN_KEY, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ status })
  });
  const lead = allLeads.find(l => l.id === id);
  if (lead) lead.status = status;
  filterLeads();
  updateStats(allLeads);
}

async function deleteLead(id) {
  if (!confirm('Delete this lead?')) return;
  await fetch('/api/leads/' + id + '?key=' + ADMIN_KEY, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } });
  allLeads = allLeads.filter(l => l.id !== id);
  filterLeads();
  updateStats(allLeads);
}

loadLeads();
setInterval(loadLeads, 60000); // auto-refresh every minute
</script>
</body>
</html>`;
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔧 M&H Mobile Mechanic server running`);
  console.log(`   Website:   http://localhost:${PORT}`);
  console.log(`   Admin:     http://localhost:${PORT}/admin?key=YOUR_ADMIN_KEY`);
  console.log(`   API:       http://localhost:${PORT}/api/quote`);
  console.log(`\n   Set ADMIN_KEY in .env to secure the dashboard\n`);
});
