# CyberSafe Nepal — Phishing Simulation Training

A working end-to-end phishing simulation platform: build campaigns, dispatch
simulated phishing emails to employees, track opens/clicks, and drive employees
through a micro-learning reveal page after they click. Fully self-contained —
emails are recorded to a simulated outbox instead of a real provider, so the
whole loop is observable without SMTP credentials.

## What's here

- **Backend** (FastAPI + SQLAlchemy async + SQLite) with a full API:
  auth (login/register per org), org summary/analytics, employees (CRUD +
  CSV import), departments, templates (CRUD), campaigns (list/detail/create/
  launch/CSV export), per-org **sending profiles** (simulated or a real SMTP
  relay, with passwords encrypted at rest), an append-only **events audit
  log**, simulated outbox, and public tracking endpoints (`/track/open`,
  `/track/click` → 307 to the reveal page, `/track/complete`, `/track/report`).
- **Frontend** (React + Vite + Tailwind CSS v4 + recharts) — a polished
  dark-theme dashboard: login/org creation, KPI command center with funnel
  and risk charts, campaigns list/detail with per-employee results (including
  who reported the email as phish), template library with live HTML preview,
  employee directory with CSV import, sending-profile manager, a simulated
  mailbox that renders the actual phishing emails (click the link to
  experience the employee journey), a public awareness-reveal page, and a
  **physics-driven phishing-hook animation** on the landing page (real
  gravity free-fall, water drag that slows the hook as it sinks to the middle
  of the pond, and every phishing element latching onto the hook tip).

## Run it

Backend (port 8000):

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python seed.py            # creates demo-org + 16 employees + campaigns + templates
uvicorn app.main:app --port 8000
```

Frontend (port 5173 — this matches the reveal-page redirect in the default config):

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Sign in with the seeded demo account: `demo-org` / `admin@demo.com` / `demo1234`.

## Try the full loop

1. **Campaigns → New campaign** — pick a template, audience, create it.
2. **Launch** it from the list. Each eligible employee gets a `CampaignResult`
   and a rendered email in the **Mailbox**.
3. Open a message in the **Mailbox** and click the button/link inside it.
   This fires `/track/click`, which 307-redirects to the **awareness-reveal**
   page. Complete the micro-lesson there.
4. Watch **Dashboard** KPIs, the funnel, department risk, and per-campaign
   click/training stats update, and **export** the per-employee CSV.

## Reporting phishing

The reveal page, mailbox, and campaign detail all let you mark an email as
phishing. Each report is written to the audit log and stored on the campaign
result (`is_reported` / `reported_at`), and the dashboard surfaces a **report
rate** (reported ÷ delivered) so you can measure the behavior you actually
want to encourage.

## Sending profiles

Campaigns are dispatched through a per-org **sending profile** — either the
built-in *Simulated Relay* (records to the outbox) or a real SMTP relay you
configure in **Sending** (`/sending-profiles`). Relay passwords are encrypted
at rest with a key derived from `JWT_SECRET`; the API only ever exposes
whether a password is set. Dispatch is paced per recipient domain
(`SEND_RATE_PER_MINUTE`) with jitter so real relays don't throttle you.

## Configuration

- `API_BASE_URL` (backend): base URL used to build tracking links (default
  `http://localhost:8000`). For real campaigns this must be a publicly
  reachable HTTPS URL so the tracking pixel and click links work in real
  inboxes.
- `REVEAL_PAGE_URL` (backend): where `/track/click` redirects (default
  `http://localhost:5173/awareness-reveal`).
- `VITE_API_BASE` (frontend): API origin the browser calls (default
  `http://localhost:8000`).

## Real email delivery

By default `SIMULATE_EMAILS=1` and every campaign email is recorded to the
local outbox (the **Mailbox** page) so the whole loop is observable with zero
infrastructure. To send real email, set `SIMULATE_EMAILS=0` and point SMTP at
your transactional provider's relay:

| Variable | Default | Meaning |
| --- | --- | --- |
| `SIMULATE_EMAILS` | `1` | `0` = actually deliver over SMTP, `1` = outbox only |
| `SMTP_HOST` | (empty) | Relay hostname, e.g. `smtp.postmarkapp.com` |
| `SMTP_PORT` | `587` | Relay port (`465` if you set `SMTP_USE_TLS=1`) |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | (empty) | Relay credentials (optional) |
| `SMTP_FROM_NAME` / `SMTP_FROM_EMAIL` | `NovaGuard Security` / `security@novaguard.example` | Visible sender — must be a verified sending address on the account's domain |
| `SMTP_USE_TLS` | `0` | `1` = implicit TLS (SMTPS), `0` = plain with auto-STARTTLS |
| `SMTP_TIMEOUT` | `30` | Connection/send timeout in seconds |

```bash
SIMULATE_EMAILS=0 \
SMTP_HOST=smtp.postmarkapp.com \
SMTP_PORT=587 \
SMTP_USERNAME=<api-token> \
SMTP_PASSWORD=<api-token> \
SMTP_FROM_NAME="Acme Security" \
SMTP_FROM_EMAIL=security@acme.com \
python -m uvicorn app.main:app --port 8000
```

Notes:

- With `SIMULATE_EMAILS=0` a message is only counted as delivered (and only
  appears in the outbox) after the SMTP server accepts it. Failures are
  logged and skipped, so a campaign with zero accepted recipients stays in
  `draft`.
- The recipients must be real, deliverable addresses — the seeded `@acme.local`
  demo employees are placeholders.
- Deliverability means the normal, legitimate things only: a verified sending
  domain with SPF/DKIM/DMARC. Nothing in the code is built to evade detection
  as suspicious — the product's goal is measuring realistic susceptibility and
  training people, so tracking is standard open/click behavior and the click
  target is always an educational page, never a credential capture.

## Going live

`EmailProvider.send()` in `backend/app/tasks.py` dispatches through SMTP when
`SIMULATE_EMAILS=0`. If you prefer a provider's HTTP API over SMTP, swap the
body of `EmailProvider._send_via_smtp()` for your transactional client (SES /
Postmark / SendGrid) — the call sites and outbox bookkeeping stay the same.
Nothing in the code is built to evade detection as suspicious — the product's
goal is measuring realistic susceptibility and training people, so tracking is
standard open/click behavior and the click target is always an educational
page, never a credential capture.
