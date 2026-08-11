import { useEffect, useState } from 'react';
import { Inbox, ShieldCheck, MailOpen, Clock, Flag, CheckCircle2 } from 'lucide-react';
import { getOutbox, getOutboxHtml, reportPhishing } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, Spinner, EmptyState, PageHeader, cn } from '../components/ui';

export default function Mailbox() {
  const { token } = useAuth();
  const { data, loading } = useAsync(() => getOutbox(token), [token]);
  const [selectedId, setSelectedId] = useState(null);
  const [html, setHtml] = useState('');
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [reportedTokens, setReportedTokens] = useState({});
  const [reportingToken, setReportingToken] = useState(null);

  const messages = data || [];

  useEffect(() => {
    if (!messages.length) return;
    const first = messages[0];
    if (!selectedId) setSelectedId(first.id);
  }, [messages, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setHtmlLoading(true);
    setHtml('');
    getOutboxHtml(token, selectedId)
      .then(setHtml)
      .catch(() => setHtml('<p>Could not render message.</p>'))
      .finally(() => setHtmlLoading(false));
  }, [selectedId, token]);

  const selected = messages.find((m) => m.id === selectedId);

  const report = async (message) => {
    if (!message?.tracking_token) return;
    setReportingToken(message.id);
    try {
      await reportPhishing(message.tracking_token);
      setReportedTokens((prev) => ({ ...prev, [message.id]: true }));
    } catch {
      // non-fatal — the mailbox stays usable
    } finally {
      setReportingToken(null);
    }
  };

  if (loading) return <Spinner label="Loading mailbox…" />;

  return (
    <div>
      <PageHeader
        title="Simulated Mailbox"
        subtitle="A peek into the emails your employees would receive. Click the button inside an email to walk through the full employee journey."
      />

      {messages.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={Inbox}
            title="Inbox zero"
            hint="Launch a campaign to populate the mailbox with simulated phishing emails."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="glass-panel max-h-[75vh] overflow-y-auto">
            <div className="sticky top-0 border-b border-black/10 bg-black/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {messages.length} message(s)
            </div>
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={cn(
                  'block w-full border-b border-black/10 px-4 py-3.5 text-left transition-colors',
                  selectedId === m.id ? 'bg-orange-500/10' : 'hover:bg-black/[0.03]'
                )}
              >
                <div className="flex items-center gap-2">
                  <MailOpen size={14} className={cn('shrink-0', selectedId === m.id ? 'text-orange-300' : 'text-slate-500')} />
                  <span className="flex-1 truncate text-sm font-medium text-slate-800">{m.subject}</span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck size={12} className="text-emerald-400" />
                  {m.from_name} &lt;{m.from_email}&gt;
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                  <Clock size={11} />
                  {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                </p>
              </button>
            ))}
          </div>

          <div className="glass-panel overflow-hidden lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-black/10 px-5 py-4">
              <div className="flex-1">
                <h3 className="font-display text-base font-semibold text-slate-900">{selected?.subject}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selected?.from_name} &lt;{selected?.from_email}&gt; → {selected?.to_name} &lt;{selected?.to_email}&gt;
                </p>
              </div>
              {reportedTokens[selected?.id] ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  <CheckCircle2 size={13} /> Reported
                </span>
              ) : (
                <button
                  onClick={() => report(selected)}
                  disabled={reportingToken === selected?.id || !selected?.tracking_token}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                >
                  <Flag size={13} />
                  {reportingToken === selected?.id ? 'Reporting…' : 'Report phishing'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 border-b border-amber-500/15 bg-amber-500/5 px-5 py-2.5 text-[11px] text-amber-200/80">
              <ShieldCheck size={13} />
              Simulated message — clicking the link inside opens the awareness reveal page and records a “clicked” event.
            </div>
            <div className="h-[65vh] overflow-auto bg-white p-6">
              {htmlLoading ? (
                <p className="text-sm text-slate-600">Rendering message…</p>
              ) : (
                <iframe
                  title={selected?.subject}
                  srcDoc={html}
                  className="h-full w-full bg-white"
                  sandbox="allow-same-origin allow-scripts"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
