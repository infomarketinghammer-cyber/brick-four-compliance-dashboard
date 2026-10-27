import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Scale,
  FileCheck,
  ShieldCheck,
  Building2,
  Clock,
  ChevronRight,
  Calculator,
  Briefcase,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell,
} from 'recharts';
import { ScoringCalculationResponse } from '../services/api';
import { PerformancePeriod, ScoreBreakdownNode, ScoringSettings } from '../types';

interface DashboardViewProps {
  scoringData: ScoringCalculationResponse | null;
  settings?: ScoringSettings;
  currentPeriod: PerformancePeriod;
  financialYearName?: string;
  onInspectNode: (node: ScoreBreakdownNode) => void;
  onNavigateTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  scoringData,
  settings,
  currentPeriod,
  financialYearName,
  onInspectNode,
  onNavigateTab,
}) => {
  if (!scoringData) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Calculating Department Performance Score...</p>
        </div>
      </div>
    );
  }

  const { departmentSummary, previousPeriodSummary, scoreDiff, explainabilityTree, trend, measuredKpiCount } = scoringData;
  const onTrackFrom = settings?.atRiskThreshold ?? 90;
  const atRiskFrom = settings?.behindThreshold ?? 70;
  const chartMax = Math.max(100, settings?.maxAchievementCap ?? 100);
  const totalKpis = departmentSummary.kraBreakdowns.reduce((a, k) => a + k.kpiCount, 0);

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
            <TrendingUp className="w-3.5 h-3.5" /> Exceeds Target
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

  // Chart data formatting
  const kraChartData = departmentSummary.kraBreakdowns.map((k) => ({
    name: k.kra.name.length > 20 ? k.kra.name.slice(0, 18) + '...' : k.kra.name,
    fullName: k.kra.name,
    Score: k.kraScore,
    Weight: k.kra.weight,
    Contribution: k.weightedContribution,
    status: k.status,
  }));

  // Only periods that actually have measurements are plotted
  const trendData = trend
    .filter((t) => t.hasData && t.score !== null)
    .map((t) => ({
      period: t.periodId === currentPeriod.id ? `${t.periodName} (Current)` : t.periodName,
      Score: t.score,
      Target: onTrackFrom,
    }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Executive Performance Summary
            </h2>
            {financialYearName && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {financialYearName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentPeriod.name} • Weighted KRA/KPI scoring of compliance risk, regulatory obligations, SLAs, and operational exposure.
          </p>
        </div>

        {/* Explainability Button */}
        <button
          onClick={() => onInspectNode(explainabilityTree)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-98 shrink-0"
        >
          <Calculator className="w-4 h-4 text-indigo-400" />
          <span>Inspect Full Score Calculation</span>
        </button>
      </div>

      {/* Headline score */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Department Score</div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-3xl font-black text-slate-900">{departmentSummary.overallScore}%</span>
            {getStatusBadge(departmentSummary.status)}
          </div>
          {previousPeriodSummary.periodName ? (
            <div className={`text-xs font-semibold mt-1 flex items-center gap-1 ${scoreDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {scoreDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {scoreDiff >= 0 ? '+' : ''}
              {scoreDiff} pts vs {previousPeriodSummary.periodName} ({previousPeriodSummary.overallScore}%)
            </div>
          ) : (
            <div className="text-xs text-slate-400 mt-1">No earlier period to compare</div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">KPIs Measured</div>
          <div className="text-3xl font-black text-slate-900 mt-1">
            {measuredKpiCount}
            <span className="text-base font-bold text-slate-400"> / {totalKpis}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {measuredKpiCount < totalKpis
              ? `${totalKpis - measuredKpiCount} KPI(s) have no actual yet and score 0%`
              : 'All KPIs have recorded actuals'}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">KRA Weight Allocation</div>
          <div className={`text-3xl font-black mt-1 ${departmentSummary.isKRAWeightValid ? 'text-emerald-600' : 'text-rose-600'}`}>
            {departmentSummary.totalKRAWeight}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {departmentSummary.isKRAWeightValid ? 'Balanced to 100%' : 'Not balanced — the score is not comparable until weights total 100%'}
          </div>
        </div>
      </div>


      {/* KRA Performance Grid (All 8 Core Real Estate KRAs) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Key Result Areas (KRA) Performance Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Each KRA score is derived mathematically from weighted KPI achievements and operational registers.
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('kras')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            Manage KRA Weights ({departmentSummary.totalKRAWeight}%)
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {departmentSummary.kraBreakdowns.map((k) => {
            const node = explainabilityTree.children?.find((c) => c.id === k.kra.id);
            return (
              <div
                key={k.kra.id}
                className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* KRA Info */}
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                      KRA {k.kra.kraNumber}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{k.kra.name}</h4>
                    {getStatusBadge(k.status)}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1">{k.kra.description}</p>
                  <div className="text-[11px] text-slate-400 flex items-center gap-3 pt-0.5">
                    <span>Owner: {k.kra.ownerName}</span>
                    <span>•</span>
                    <span>
                      KPIs: {k.onTrackKpis} on track, {k.atRiskKpis} at risk, {k.behindKpis} behind
                    </span>
                  </div>
                </div>

                {/* Score & Weight Metrics */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center min-w-[70px]">
                    <div className="text-[11px] text-slate-500 font-medium">KRA Weight</div>
                    <div className="text-sm font-bold text-slate-800">{k.kra.weight}%</div>
                  </div>

                  <div className="text-center min-w-[70px]">
                    <div className="text-[11px] text-slate-500 font-medium">KRA Score</div>
                    <div className="text-base font-black text-slate-900">{k.kraScore}%</div>
                  </div>

                  <div className="text-center min-w-[90px] bg-indigo-50/60 border border-indigo-100 px-3 py-1.5 rounded-xl">
                    <div className="text-[10px] text-indigo-700 font-semibold uppercase">Contribution</div>
                    <div className="text-sm font-bold text-indigo-900">{k.weightedContribution} pts</div>
                  </div>

                  {/* Inspect button */}
                  {node && (
                    <button
                      onClick={() => onInspectNode(node)}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200"
                      title="Inspect formula and calculation"
                    >
                      <Calculator className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KRA Performance vs Target */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">KRA Score vs Target Benchmark</h3>
              <p className="text-xs text-slate-500">
                Green ≥ {onTrackFrom}% (on track), amber {atRiskFrom}–{onTrackFrom}% (at risk), red &lt; {atRiskFrom}% (behind)
              </p>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kraChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" />
                <YAxis domain={[0, chartMax]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any, name: any) => [`${val}%`, name]}
                  labelFormatter={(label) => `KRA: ${label}`}
                />
                <Bar dataKey="Score" radius={[4, 4, 0, 0]}>
                  {kraChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.Score >= onTrackFrom ? '#10b981' : entry.Score >= atRiskFrom ? '#f59e0b' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Score trend across recent periods of the same type */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Score Trajectory</h3>
              <p className="text-xs text-slate-500">Overall department score for recent {currentPeriod.type.toLowerCase()} periods</p>
            </div>
          </div>

          <div className="h-64">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No measured periods to plot yet.
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, chartMax]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: any, name: any) => [`${val}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="Target"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  name={`On-track threshold (${onTrackFrom}%)`}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Score"
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#6366f1' }}
                  name="Overall Score"
                />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
