import React, { useState } from 'react';
import { FileText, Plus, CheckCircle2, AlertTriangle, AlertOctagon, Award, TrendingUp, Sparkles } from 'lucide-react';
import { PerformanceReview, PerformancePeriod, ScoringSettings } from '../types';

interface ReviewsViewProps {
  reviews: PerformanceReview[];
  periods: PerformancePeriod[];
  currentPeriod: PerformancePeriod;
  currentScore?: number;
  settings?: ScoringSettings;
  canPublish: boolean;
  onAddReview: (data: Partial<PerformanceReview>) => Promise<void>;
}

export const ReviewsView: React.FC<ReviewsViewProps> = ({
  reviews,
  periods,
  currentPeriod,
  currentScore,
  settings,
  canPublish,
  onAddReview,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [summary, setSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [problems, setProblems] = useState('');
  const [underperformance, setUnderperformance] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [managementComments, setManagementComments] = useState('');
  const [periodFilter, setPeriodFilter] = useState<string>('ALL');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const scoreBand = (score: number) => {
    const behind = settings?.behindThreshold ?? 70;
    const atRisk = settings?.atRiskThreshold ?? 90;
    const onTrack = settings?.onTrackThreshold ?? 100;
    if (score < behind) return { label: 'BEHIND', cls: 'bg-rose-50 text-rose-800 border-rose-200', Icon: AlertOctagon };
    if (score < atRisk) return { label: 'AT RISK', cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: AlertTriangle };
    if (score <= onTrack) return { label: 'ON TRACK', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2 };
    return { label: 'EXCEEDS TARGET', cls: 'bg-blue-50 text-blue-800 border-blue-200', Icon: TrendingUp };
  };

  const periodName = (id: string) => periods.find((p) => p.id === id)?.name || id;
  const visibleReviews = periodFilter === 'ALL' ? reviews : reviews.filter((r) => r.periodId === periodFilter);
  const existingForPeriod = reviews.some((r) => r.periodId === currentPeriod.id);

  const resetForm = () => {
    setSummary('');
    setAchievements('');
    setProblems('');
    setUnderperformance('');
    setCorrectiveActions('');
    setManagementComments('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      await onAddReview({
        periodId: currentPeriod.id,
        performanceSummary: summary.trim(),
        majorAchievements: achievements.trim(),
        identifiedProblems: problems.trim(),
        reasonsForUnderperformance: underperformance.trim(),
        correctiveActions: correctiveActions.trim(),
        managementComments: managementComments.trim(),
        status: 'PUBLISHED',
      });
      setIsCreating(false);
      resetForm();
    } catch (err: any) {
      setError(err?.message || 'Failed to publish review');
    } finally {
      setIsSaving(false);
    }
  };

  const section = (text?: string) => (text && text.trim() ? text : <span className="text-slate-400 italic">Not provided</span>);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            Monthly Legal Performance Reviews & Action Plans
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Qualitative evaluations, root cause analyses, and corrective action plans published by the Head of Department.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            aria-label="Filter reviews by period"
            className="text-xs font-semibold px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-800"
          >
            <option value="ALL">All periods ({reviews.length})</option>
            {periods
              .filter((p) => reviews.some((r) => r.periodId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          {canPublish && (
            <button
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
              className="flex items-center gap-1.5 bg-brand-gradient hover:opacity-90 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Draft Review for {currentPeriod.name}</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {visibleReviews.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">
            No reviews published yet{periodFilter !== 'ALL' ? ' for this period' : ''}.
          </div>
        )}
        {visibleReviews.map((rev) => {
          const band = scoreBand(rev.overallScore);
          return (
            <div key={rev.id} className="bg-white rounded-3xl border border-slate-200 p-6 lg:p-8 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                      {rev.status === 'DRAFT' ? 'DRAFT REVIEW' : 'EXECUTIVE LEGAL REVIEW'}
                    </span>
                    <span className="text-xs font-bold text-slate-500">• Published {rev.createdDate}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">Performance Briefing — {periodName(rev.periodId)}</h3>
                  <p className="text-xs text-slate-500">
                    Reviewed by: <strong className="text-slate-800">{rev.reviewerName}</strong>
                  </p>
                </div>

                <div className={`flex items-center gap-3 border px-4 py-2 rounded-xl shrink-0 ${band.cls}`}>
                  <band.Icon className="w-5 h-5" />
                  <div>
                    <div className="text-[10px] font-bold uppercase">Department Score</div>
                    <div className="text-xl font-black">
                      {rev.overallScore}% ({band.label})
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  1. Performance Summary & Strategic Overview
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/60 p-4 rounded-xl border border-slate-200/60 whitespace-pre-line">
                  {section(rev.performanceSummary)}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  2. Key Operational Achievements
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-emerald-50/30 p-4 rounded-xl border border-emerald-200/50 whitespace-pre-line">
                  {section(rev.majorAchievements)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    3. Identified Bottlenecks & Exposure Risks
                  </h4>
                  <div className="text-xs text-slate-700 leading-relaxed bg-amber-50/30 p-4 rounded-xl border border-amber-200/50 space-y-2 whitespace-pre-line">
                    <p>{section(rev.identifiedProblems)}</p>
                    <p className="font-semibold text-slate-800">Root Cause:</p>
                    <p>{section(rev.reasonsForUnderperformance)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    4. Corrective Action Plan & Management Direction
                  </h4>
                  <div className="text-xs text-slate-700 leading-relaxed bg-indigo-50/30 p-4 rounded-xl border border-indigo-200/50 space-y-2 whitespace-pre-line">
                    <p>{section(rev.correctiveActions)}</p>
                    <p className="font-semibold text-slate-800">Senior Leadership Guidance:</p>
                    <p>{section(rev.managementComments)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 my-8 text-xs">
            <h3 className="text-base font-bold text-slate-900">Draft Performance Review ({currentPeriod.name})</h3>
            <p className="text-slate-500">
              The published score is taken from the scoring engine for {currentPeriod.name}
              {currentScore !== undefined ? ` (currently ${currentScore}%)` : ''}.
              {existingForPeriod && ' A review already exists for this period — this will publish an additional one.'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              {[
                { label: 'Executive Summary', value: summary, set: setSummary, required: true, rows: 3, ph: 'Summarize overall department performance and milestone completions...' },
                { label: 'Key Achievements', value: achievements, set: setAchievements, rows: 2, ph: 'Court orders obtained, titles cleared, contracts finalized...' },
                { label: 'Identified Roadblocks', value: problems, set: setProblems, rows: 2, ph: 'External counsel turnaround, government delays, court vacations...' },
                { label: 'Root Cause of Underperformance', value: underperformance, set: setUnderperformance, rows: 2, ph: 'Why did weak KRAs fall short?' },
                { label: 'Corrective Actions', value: correctiveActions, set: setCorrectiveActions, rows: 2, ph: 'Actionable steps assigned for next month...' },
                { label: 'Senior Leadership Guidance', value: managementComments, set: setManagementComments, rows: 2, ph: 'Direction from management...' },
              ].map((f) => (
                <div key={f.label}>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {f.label}
                    {f.required && <span className="text-rose-600"> *</span>}
                  </label>
                  <textarea
                    rows={f.rows}
                    required={f.required}
                    placeholder={f.ph}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              ))}

              {error && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !summary.trim()}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {isSaving ? 'Publishing...' : 'Publish Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
