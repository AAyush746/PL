import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Languages,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  PlayCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../App';
import { getTrainingModules, getTrainingModule, getTrainingCompliance } from '../lib/api';
import { useAsync, KpiCard, Modal, cn } from '../components/ui';

const TOPICS = [
  { key: 'phishing-basics', label: 'Phishing basics', tint: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700' },
  { key: 'credential-phishing', label: 'Credential phishing', tint: 'border-rose-500/20 bg-rose-500/10 text-rose-700' },
  { key: 'malware-link', label: 'Links & attachments', tint: 'border-violet-500/20 bg-violet-500/10 text-violet-700' },
  { key: 'urgency-bait', label: 'Urgency & bait', tint: 'border-amber-500/20 bg-amber-500/10 text-amber-700' },
];

function topicTint(key) {
  return TOPICS.find((t) => t.key === key)?.tint || 'border-slate-500/20 bg-slate-500/10 text-slate-600';
}

function fmtDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  return m < 1 ? `${secs}s` : `${m}m`;
}

export default function Training() {
  const { token } = useAuth();
  const modules = useAsync(() => getTrainingModules(token), [token]);
  const compliance = useAsync(() => getTrainingCompliance(token), [token]);

  const [topic, setTopic] = useState('all');
  const [lang, setLang] = useState('en');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealed, setRevealed] = useState({});

  const filtered = useMemo(
    () => (modules.data || []).filter((m) => topic === 'all' || m.failure_type === topic),
    [modules.data, topic]
  );

  useEffect(() => {
    if (!openId) return;
    setDetail(null);
    setRevealed({});
    setDetailLoading(true);
    getTrainingModule(token, openId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [openId, token]);

  const summary = compliance.data?.summary || {};
  const totalQuestions = useMemo(
    () => (modules.data || []).reduce((sum, m) => sum + (m.question_count || 0), 0),
    [modules.data]
  );

  const openModule = (modules.data || []).find((m) => m.id === openId) || null;
  const videoUrl = lang === 'ne' ? openModule?.video_url_ne : openModule?.video_url_en;
  const keyPoints = lang === 'ne' ? openModule?.key_points_ne : openModule?.key_points_en;

  if (modules.loading) {
    return <div className="py-24 text-center text-slate-600">Loading lesson library…</div>;
  }

  const questions = detail?.questions || [];

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600/90">
          Phishloop · Training library
        </p>
        <h1 className="font-display text-2xl font-bold text-slate-900">Security lessons & study material</h1>
        <p className="mt-1 text-sm text-slate-600">
          Bilingual micro-lessons with video, key takeaways and a quiz — the same curriculum employees
          are auto-enrolled into after clicking a simulated phish.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Layers} label="Lessons" value={modules.data?.length ?? 0} accent="indigo" sub="in the library" />
        <KpiCard icon={ListChecks} label="Quiz questions" value={totalQuestions} accent="cyan" sub="across all lessons" />
        <KpiCard icon={Users} label="Attempts" value={summary.attempts ?? 0} accent="amber" sub="by your employees" />
        <KpiCard icon={GraduationCap} label="Completed" value={summary.completed ?? 0} accent="rose" sub="verified completions" />
        <KpiCard icon={CheckCircle2} label="Quiz pass rate" value={`${summary.quiz_pass_rate ?? 0}%`} accent="emerald" sub="of attempts that reached the quiz" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTopic('all')}
          className={cn('chip border transition-colors', topic === 'all' ? 'border-orange-500/30 bg-orange-500/15 text-orange-700' : 'border-black/10 bg-black/5 text-slate-600 hover:border-black/20')}
        >
          All topics
        </button>
        {TOPICS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTopic(t.key)}
            className={cn('chip border transition-colors', topic === t.key ? 'border-orange-500/30 bg-orange-500/15 text-orange-700' : 'border-black/10 bg-black/5 text-slate-600 hover:border-black/20')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel py-16 text-center">
          <BookOpen size={28} className="mx-auto text-slate-400" />
          <p className="mt-3 font-display text-lg font-semibold text-slate-900">No lessons in this topic yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Add a lesson from the platform library or author a custom one to fill this gap.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((m) => {
            const tint = topicTint(m.failure_type);
            return (
              <div key={m.id} className="glass-panel anim-fade-up overflow-hidden">
                <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-950">
                  <button
                    onClick={() => setOpenId(m.id)}
                    className="group absolute inset-0 flex items-center justify-center"
                    title="Watch lesson"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm transition-transform group-hover:scale-110 group-hover:bg-white/20">
                      <PlayCircle size={30} />
                    </span>
                    <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                      <Clock size={12} /> {fmtDuration(m.duration_seconds)}
                    </span>
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('chip border', tint)}>{TOPICS.find((t) => t.key === m.failure_type)?.label || m.failure_type}</span>
                    <span className="chip border border-black/10 bg-black/5 text-slate-600">{m.question_count} questions</span>
                    {m.is_global && (
                      <span className="chip border border-orange-500/20 bg-orange-500/10 text-orange-700">Platform lesson</span>
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold text-slate-900">{m.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{m.description}</p>
                  {(m.key_points_en || []).slice(0, 2).length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {(m.key_points_en || []).slice(0, 2).map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                          <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-500" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => setOpenId(m.id)} className="btn-primary flex-1 !py-2 !text-xs">
                      <PlayCircle size={14} /> Watch lesson
                    </button>
                    <button onClick={() => setOpenId(m.id)} className="btn-ghost !py-2 !text-xs">
                      <FileText size={14} /> Study material
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!openId} onClose={() => setOpenId(null)} title={openModule?.title || 'Lesson'} wide>
        <div className="space-y-6">
          {openModule && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('chip border', topicTint(openModule.failure_type))}>
                    {TOPICS.find((t) => t.key === openModule.failure_type)?.label || openModule.failure_type}
                  </span>
                  <span className="chip border border-black/10 bg-black/5 text-slate-600">
                    {openModule.question_count} questions · {fmtDuration(openModule.duration_seconds)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Languages size={14} className="text-slate-500" />
                  {(['en', 'ne']).map((code) => (
                    <button
                      key={code}
                      onClick={() => setLang(code)}
                      className={cn('chip border transition-colors', lang === code ? 'border-orange-500/30 bg-orange-500/15 text-orange-700' : 'border-black/10 bg-black/5 text-slate-600 hover:border-black/20')}
                    >
                      {code === 'en' ? 'English' : 'नेपाली'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl bg-black">
                <video
                  key={`${openModule.id}-${lang}`}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full"
                  src={videoUrl}
                />
              </div>

              <p className="text-sm leading-relaxed text-slate-600">
                {lang === 'ne' ? openModule.description_ne : openModule.description}
              </p>

              <section className="rounded-xl border border-black/10 bg-black/5 p-5">
                <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-slate-900">
                  <Lightbulb size={16} className="text-amber-500" /> Key takeaways
                </h3>
                <ul className="space-y-2">
                  {(keyPoints || []).map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      {point}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-slate-900">
                  <ListChecks size={16} className="text-orange-500" /> Practice quiz
                </h3>
                {detailLoading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin text-orange-500" /> Loading questions…
                  </div>
                ) : questions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">This lesson has no quiz yet.</p>
                ) : (
                  <div className="space-y-4">
                    {questions.map((q, qi) => {
                      const isRevealed = !!revealed[q.id];
                      return (
                        <div key={q.id} className="rounded-xl border border-black/10 p-4">
                          <p className="text-sm font-medium text-slate-800">
                            {qi + 1}. {lang === 'ne' ? q.prompt_ne : q.prompt}
                          </p>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {(q.options || []).map((opt, oi) => (
                              <button
                                key={oi}
                                onClick={() => setRevealed((r) => ({ ...r, [q.id]: true }))}
                                className={cn(
                                  'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                                  isRevealed && oi === q.correct_index
                                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800'
                                    : isRevealed
                                      ? 'border-black/10 bg-black/5 text-slate-500'
                                      : 'border-black/10 bg-white text-slate-700 hover:border-orange-500/40 hover:bg-orange-500/5'
                                )}
                              >
                                <span className="font-semibold">{String.fromCharCode(65 + oi)}.</span> {opt}
                              </button>
                            ))}
                          </div>
                          {isRevealed && (
                            <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
                              <Lightbulb size={13} className="mt-0.5 shrink-0" />
                              {lang === 'ne' ? q.explanation_ne : q.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
