// Empty by default → relative URLs. The Vite dev/preview server proxies
// `/api` (and `/media`) to the backend, so the browser only ever talks to the
// forwarded frontend port — which works even when the backend's own port isn't
// reachable from the developer's machine. Set VITE_API_BASE to an absolute URL
// only when hosting the API on a different origin than the frontend.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...options,
    });
  } catch (err) {
    // Network-level failure (server down, wrong host, CORS block, offline).
    const shownBase = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '(relative)');
    throw new Error(
      `Cannot reach the API at ${shownBase} — is the backend running and reachable from this browser? (${err.message})`
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      body.detail?.map?.((d) => d.msg).join(', ') || body.detail || body.error || response.statusText;
    throw new Error(message);
  }
  return response.json();
}

async function requestText(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.error || response.statusText);
  }
  return response.text();
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(payload) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export async function register(payload) {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerAdmin(payload) {
  return request('/api/auth/admin/register', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getMe(token) {
  const data = await request('/api/auth/me', { method: 'GET', token });
  return {
    email: data.email,
    firstName: data.first_name,
    role: data.role,
    orgName: data.org_name,
    orgSlug: data.org_slug,
    subscriptionTier: data.subscription_tier,
    trialEndsAt: data.trial_ends_at,
    employeeCount: data.employee_count,
  };
}

export async function initiateEsewa(token, plan) {
  return request('/api/v1/org/pay/esewa/initiate', {
    method: 'POST',
    body: JSON.stringify({ plan }),
    token,
  });
}

// ── Org summary ────────────────────────────────────────────────────────────

export async function getOrgSummary(token) {
  const summary = await request('/api/v1/org/summary', { method: 'GET', token });
  return {
    ...summary,
    riskScore: summary.risk_score,
    riskTrendPrev: summary.risk_trend_prev,
    activeCampaigns: summary.active_campaigns,
    completedCampaigns: summary.completed_campaigns,
    clickRate: summary.click_rate,
    reportRate: summary.report_rate,
    trainingCompletionRate: summary.training_completion_rate,
    subscriptionTier: summary.subscription_tier,
    trialEndsAt: summary.trial_ends_at,
  };
}

// ── Employees ──────────────────────────────────────────────────────────────

export async function getEmployees(token) {
  return request('/api/employees', { method: 'GET', token });
}

export async function createEmployee(token, payload) {
  return request('/api/employees', { method: 'POST', body: JSON.stringify(payload), token });
}

export async function updateEmployee(token, id, patch) {
  return request(`/api/employees/${id}`, { method: 'PATCH', body: JSON.stringify(patch), token });
}

export async function deleteEmployee(token, id) {
  return request(`/api/employees/${id}`, { method: 'DELETE', token });
}

export async function importEmployees(token, csvText) {
  return request('/api/employees/import', {
    method: 'POST',
    body: JSON.stringify({ csv_text: csvText }),
    token,
  });
}

// ── Departments ────────────────────────────────────────────────────────────

export async function getDepartments(token) {
  return request('/api/departments', { method: 'GET', token });
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function getTemplates(token) {
  return request('/api/templates', { method: 'GET', token });
}

export async function createTemplate(token, payload) {
  const { difficulty, ...rest } = payload;
  return request('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ ...rest, difficulty_level: difficulty ?? 2 }),
    token,
  });
}

export async function deleteTemplate(token, id) {
  return request(`/api/templates/${id}`, { method: 'DELETE', token });
}

// ── Campaigns ──────────────────────────────────────────────────────────────

export async function getCampaigns(token) {
  return request('/api/campaigns', { method: 'GET', token });
}

export async function getCampaign(token, id) {
  return request(`/api/campaigns/${id}`, { method: 'GET', token });
}

export async function createCampaign(token, payload) {
  return request('/api/campaigns', { method: 'POST', body: JSON.stringify(payload), token });
}

export async function launchCampaign(token, id) {
  return request(`/api/campaigns/${id}/launch`, { method: 'POST', token });
}

export async function exportCampaignCsv(token, id, name) {
  try {
    const csv = await requestText(`/api/campaigns/${id}/export`, { method: 'GET', token });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.toLowerCase().replace(/\s+/g, '-')}-results.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    throw new Error(err.message || 'Export failed');
  }
}

// ── Outbox (simulated mailbox) ─────────────────────────────────────────────

export async function getOutbox(token) {
  return request('/api/outbox', { method: 'GET', token });
}

export async function getOutboxHtml(token, id) {
  return requestText(`/api/outbox/${id}/html`, { method: 'GET', token });
}

// ── Sending profiles ───────────────────────────────────────────────────────

export async function getSendingProfiles(token) {
  return request('/api/sending-profiles', { method: 'GET', token });
}

export async function createSendingProfile(token, payload) {
  return request('/api/sending-profiles', { method: 'POST', body: JSON.stringify(payload), token });
}

export async function updateSendingProfile(token, id, patch) {
  return request(`/api/sending-profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch), token });
}

export async function deleteSendingProfile(token, id) {
  return request(`/api/sending-profiles/${id}`, { method: 'DELETE', token });
}

export async function testSendingProfile(token, id, toEmail) {
  return request(`/api/sending-profiles/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({ to_email: toEmail }),
    token,
  });
}

// ── Events (append-only audit log) ─────────────────────────────────────────

export async function getEvents(token) {
  return request('/api/events', { method: 'GET', token });
}

// ── Remediation & follow-up queue ──────────────────────────────────────────

export async function getRemediations(token) {
  return request('/api/remediations', { method: 'GET', token });
}

export async function resendRemediation(token, id) {
  return request(`/api/remediations/${id}/resend`, { method: 'POST', token });
}

// ── Training (lesson library) ───────────────────────────────────────────────

export async function getTrainingModules(token) {
  return request('/api/training/modules', { method: 'GET', token });
}

export async function getTrainingModule(token, id) {
  return request(`/api/training/modules/${id}`, { method: 'GET', token });
}

export async function getTrainingCompliance(token) {
  return request('/api/training/compliance', { method: 'GET', token });
}

// ── Training (public tracking endpoints) ───────────────────────────────────

export async function completeTraining(token) {
  return request(`/track/complete/${token}`, { method: 'POST' });
}

export async function reportPhishing(token) {
  return request(`/track/report/${token}`, { method: 'POST' });
}
