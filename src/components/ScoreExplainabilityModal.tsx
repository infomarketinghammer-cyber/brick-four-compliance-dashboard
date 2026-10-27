import React from 'react';
import { ScoreBreakdownNode } from '../types';
import {
  X,
  HelpCircle,
  TrendingUp,
  ArrowRight,
  Calculator,
  Database,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Sparkles,
} from 'lucide-react';

interface ScoreExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: ScoreBreakdownNode | null;
  currentPeriodName: string;
}

export const ScoreExplainabilityModal: React.FC<ScoreExplainabilityModalProps> = ({
  isOpen,
  onClose,
  node,
  currentPeriodName,
}) => {
  if (!isOpen || !node) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ON_TRACK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> On Track
          </span>
        );
      case 'EXCEEDS_TARGET':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" /> Exceeds Target
          </span>
        );
      case 'AT_RISK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" /> At Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertOctagon className="w-3.5 h-3.5" /> Behind
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Score Explainability & Traceability Audit
                <span className="text-xs font-normal text-slate-500">({currentPeriodName})</span>
              </h2>
              <p className="text-xs text-slate-500">
                Inspect mathematical derivation, formula parameters, and operational data sources.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Main Selected Element Banner */}
          <div className="p-5 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-blue-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-white/80 px-2 py-0.5 rounded border border-indigo-200/60">
                {node.type} LEVEL AUDIT
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-1">{node.name}</h3>
              {node.formulaDescription && (
                <p className="text-xs text-slate-600 mt-1 font-mono bg-white/60 p-1.5 rounded border border-slate-200/50">
                  {node.formulaDescription}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm shrink-0">
              <div>
                <div className="text-xs text-slate-500 font-medium">Assigned Weight</div>
                <div className="text-lg font-bold text-slate-800">{node.weight}%</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-xs text-slate-500 font-medium">
                  {node.type === 'KPI' ? 'Achievement' : 'Score'}
                </div>
                <div className="text-2xl font-black text-indigo-600">
                  {node.achievement ?? node.weightedScore}%
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Status</div>
                <div className="mt-0.5">{getStatusBadge(node.status)}</div>
              </div>
            </div>
          </div>

          {/* Mathematical Hierarchy Flow */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Standard Score Aggregation Flow
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-700">
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
                1. Operational Legal Action
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
                2. Measured Actual vs Target
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
                3. KPI Achievement %
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
                4. Weighted KPI Score
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold">
                5. KRA Score (Weighted Sum)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2.5 py-1 bg-brand-gradient text-white rounded-lg font-bold">
                6. Legal Dept Score
              </span>
            </div>
          </div>

          {/* KPI Specific Details (Target, Actual, Direction, Operational Source) */}
          {node.type === 'KPI' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                  Target & Measurement Formula
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Target Value:</span>
                    <span className="font-semibold text-slate-800">
                      {node.target} {node.unit}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Actual Result:</span>
                    <span className="font-semibold text-indigo-700">
                      {node.actual} {node.unit}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Direction Type:</span>
                    <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {node.direction?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Weighted Contribution to KRA:</span>
                    <span className="font-bold text-indigo-600">
                      {node.weightedScore} points
                    </span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-600" />
                  Operational Data Source Trace
                </h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <p>
                    <strong className="text-slate-800">Source Entity:</strong>{' '}
                    <span className="font-mono text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                      {node.operationalSource || 'MANUAL ENTRY / OPERATIONAL REGISTER'}
                    </span>
                  </p>
                  <p>
                    <strong className="text-slate-800">Metrics Trace:</strong>{' '}
                    {node.operationalMetricsSummary ||
                      'Computed directly from verified contracts, compliance records, and litigation docket records.'}
                  </p>
                  {node.isManuallyOverridden ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <span>
                        Manually overridden{node.overrideBy ? ` by ${node.overrideBy}` : ''}.
                        {node.overrideReason ? ` Reason: ${node.overrideReason}` : ''} See the audit trail for the original value.
                      </span>
                    </div>
                  ) : node.hasMeasurement === false ? (
                    <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 flex items-start gap-2">
                      <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                      <span>No actual has been recorded for this period, so this KPI currently scores 0%.</span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                      <span>No manual override applied to this measurement.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Child Components Breakdown (If KRA or Department) */}
          {node.children && node.children.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {node.type === 'DEPARTMENT'
                  ? 'KRA Component Contributions'
                  : 'Constituent KPI Scores'}
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {node.children.map((child) => (
                  <div
                    key={child.id}
                    className="p-3.5 bg-white hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                          {child.weight}% WT
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{child.name}</span>
                        {getStatusBadge(child.status)}
                      </div>
                      {child.formulaDescription && (
                        <div className="text-xs text-slate-500 font-mono pl-1">
                          {child.formulaDescription}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-6 text-right shrink-0">
                      <div>
                        <div className="text-xs text-slate-400 font-medium">Achievement</div>
                        <div className="text-sm font-bold text-slate-800">
                          {child.achievement ?? child.weightedScore}%
                        </div>
                      </div>
                      <div className="w-24">
                        <div className="text-xs text-slate-400 font-medium">Contribution</div>
                        <div className="text-sm font-bold text-indigo-600">
                          +{child.scoreContribution} pts
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
          <span>Scores are recalculated live from recorded actuals and the current scoring rules.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
