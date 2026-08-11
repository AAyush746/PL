-- ============================================================================
-- Row-Level Security: database-enforced tenant isolation
--
-- Why this exists: app-level `WHERE org_id = ...` filtering is necessary but
-- not sufficient. One missed filter in a future report query, a raw-SQL
-- debugging query, or a bug in a join, and Bank A can see Bank B's data.
-- RLS makes that structurally impossible — the database refuses the row,
-- not just your application logic. Banks WILL ask about this in security
-- due diligence, so it's worth having on day one, not retrofitted later.
-- ============================================================================

ALTER TABLE employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE phishing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_results   ENABLE ROW LEVEL SECURITY;

-- FORCE is critical: without it, the table OWNER role bypasses RLS.
-- Your app's DB connection must NOT run as the table owner — see app_runtime
-- role below. Skipping this line is the #1 way teams think RLS is protecting
-- them when it isn't.
ALTER TABLE employees          FORCE ROW LEVEL SECURITY;
ALTER TABLE phishing_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns          FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_results   FORCE ROW LEVEL SECURITY;

-- Session variable set per-request by the app (see database.py). `true` as
-- the second arg to current_setting means "don't error if unset" — an
-- unset context just returns zero rows rather than crashing, which is the
-- safe failure mode.

CREATE POLICY tenant_isolation_employees ON employees
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- org_id IS NULL = your shared global template library, visible to every
-- tenant read-only. A tenant's own private templates are still isolated.
CREATE POLICY tenant_isolation_templates ON phishing_templates
    USING (
        org_id IS NULL
        OR org_id = current_setting('app.current_org_id', true)::uuid
    );

CREATE POLICY tenant_isolation_campaigns ON campaigns
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- campaign_results has no org_id column directly — it inherits tenancy
-- through its campaign. Isolate via subquery.
CREATE POLICY tenant_isolation_results ON campaign_results
    USING (
        campaign_id IN (
            SELECT id FROM campaigns
            WHERE org_id = current_setting('app.current_org_id', true)::uuid
        )
    );

-- ----------------------------------------------------------------------------
-- Runtime roles. Never let the app's connection pool run as the table
-- owner / migration role — that role bypasses FORCE RLS by definition.
-- ----------------------------------------------------------------------------

CREATE ROLE app_runtime LOGIN PASSWORD :'app_runtime_password';
GRANT SELECT, INSERT, UPDATE, DELETE
    ON organizations, users, employees, phishing_templates, campaigns, campaign_results
    TO app_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- ----------------------------------------------------------------------------
-- The tracking endpoints (open/click pixels) are a special case: they're
-- public, unauthenticated, and hit with only a tracking_token — there is no
-- org context yet, so the normal policy above would (correctly) return
-- nothing. Rather than granting this role blanket table access, expose a
-- single narrow SECURITY DEFINER function that resolves a token to its row.
-- This is the ONLY sanctioned way to cross the tenant boundary, and it does
-- only one thing.
-- ----------------------------------------------------------------------------

CREATE ROLE tracking_service LOGIN PASSWORD :'tracking_service_password';

CREATE OR REPLACE FUNCTION resolve_tracking_token(p_token text)
RETURNS TABLE (result_id uuid, org_id uuid, campaign_id uuid, employee_id uuid)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE
AS $$
    SELECT cr.id, c.org_id, cr.campaign_id, cr.employee_id
    FROM campaign_results cr
    JOIN campaigns c ON c.id = cr.campaign_id
    WHERE cr.tracking_token = p_token::uuid;
$$;

REVOKE ALL ON FUNCTION resolve_tracking_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tracking_token(text) TO tracking_service;

-- Once resolved, marking the event (opened/clicked) still goes through the
-- normal RLS-protected UPDATE path with the org context set from the
-- resolved org_id — see tracking.py.
GRANT UPDATE (is_opened, is_clicked, ip_address, user_agent, opened_at, clicked_at)
    ON campaign_results TO tracking_service;
