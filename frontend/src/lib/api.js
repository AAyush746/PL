const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...options,
  });

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

// ── Training (public tracking endpoints) ───────────────────────────────────

export async function completeTraining(token) {
  return request(`/track/complete/${token}`, { method: 'POST' });
}

export async function reportPhishing(token) {
  return request(`/track/report/${token}`, { method: 'POST' });
}
