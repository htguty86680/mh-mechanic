# M&H Mobile Mechanic — Website & Backend

A high-converting landing page + Node.js backend with lead management for Mehdi's mobile mechanic business.

---

## What's Included

| File | Purpose |
|------|---------|
| `index.html` | Full website — hero, services, reviews, booking form |
| `server.js` | Express backend — API, email notifications, admin dashboard |
| `.env.example` | Environment variable template |
| `package.json` | Node.js dependencies |

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

Key settings in `.env`:
- `ADMIN_KEY` — Password to access the admin dashboard (change this!)
- `EMAIL_USER` / `EMAIL_PASS` — Gmail credentials for lead notifications
- `NOTIFY_EMAIL` — Where to send new lead alerts (Mehdi's email)

### 3. Set up Gmail (for email notifications)
1. Go to [Google Account → Security → App Passwords](https://myaccount.google.com/apppasswords)
2. Create an App Password for "Mail"
3. Paste it as `EMAIL_PASS` in your `.env`

### 4. Run the server
```bash
npm start
# Development (auto-restart):
npm run dev
```

Site is now at: **http://localhost:3000**

---

## Admin Dashboard

Access at: `http://localhost:3000/admin?key=YOUR_ADMIN_KEY`

Features:
- See all incoming quote requests in real time
- Track status: New → Contacted → Booked → Completed
- Search by name, phone, suburb, or service
- Auto-refreshes every 60 seconds
- Delete old/spam leads

---

## API Endpoints

### `POST /api/quote`
Submit a new quote request from the website form.

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "0412 345 678",
  "email": "john@email.com",
  "car": "Toyota Camry",
  "service": "Log Book Service",
  "suburb": "Parramatta",
  "message": "Due for 60,000km service"
}
```

**Response:**
```json
{ "success": true, "id": "uuid-here" }
```

### `GET /api/leads?key=ADMIN_KEY`
List all leads. Optional filters: `?status=new&q=john`

### `PATCH /api/leads/:id?key=ADMIN_KEY`
Update lead status or notes.

```json
{ "status": "contacted", "notes": "Called, booked for Friday 2pm" }
```

### `DELETE /api/leads/:id?key=ADMIN_KEY`
Remove a lead.

---

## Deploying to Production

### Option A — VPS (DigitalOcean, Linode, etc.)
```bash
# Install Node.js 18+, then:
npm install -g pm2
pm2 start server.js --name mh-mechanic
pm2 startup
pm2 save
```
Use Nginx as a reverse proxy on port 80/443.

### Option B — Railway.app (free tier)
1. Push to GitHub
2. Connect repo to Railway
3. Add environment variables in Railway dashboard
4. Deploy — done

### Option C — Render.com
Same as Railway — connect GitHub repo, set env vars, deploy.

---

## Data Storage

Leads are stored in `leads.json` (auto-created on first submission). 
For production with high volume, swap `readLeads()`/`writeLeads()` for a proper database like SQLite (`better-sqlite3`) or PostgreSQL (`pg`).

---

## Connecting the Website Form to the Backend

The `index.html` form currently saves to `localStorage` (works standalone).  
To connect it to the backend, replace the `setTimeout` block in `index.html` with:

```javascript
const response = await fetch('/api/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    firstName: document.getElementById('firstName').value,
    lastName:  document.getElementById('lastName').value,
    phone:     document.getElementById('phone').value,
    email:     document.getElementById('email').value,
    car:       document.getElementById('carMake').value + ' ' + document.getElementById('carModel').value,
    service:   document.getElementById('service').value,
    suburb:    document.getElementById('suburb').value,
    message:   document.getElementById('message').value,
  })
});
const result = await response.json();
if (result.success) {
  // show success state
}
```

When serving `index.html` through the Express server (i.e. same origin), this works automatically.
