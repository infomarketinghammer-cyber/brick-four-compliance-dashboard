import React from 'react';
import { ShieldAlert, Scale, FileCheck, CheckCircle2, AlertTriangle, Building } from 'lucide-react';
import { ScoringCalculationResponse } from '../services/api';
import {
  PerformancePeriod,
  ScoringSettings,
  LitigationCase,
  LegalRisk,
  ContractRecord,
  ComplianceRecord,
  DueDiligenceRecord,
  Project,
  PerformanceReview,
} from '../types';

interface ManagementExecutiveViewProps {
  scoringData: ScoringCalculationResponse | null;
  currentPeriod: PerformancePeriod;
  settings?: ScoringSettings;
  litigations: LitigationCase[];
  risks: LegalRisk[];
  contracts: ContractRecord[];
  compliances: ComplianceRecord[];
  dueDiligences: DueDiligenceRecord[];
  projects: Project[];
  latestReview?: PerformanceReview;
  onNavigateTab: (tab: string) => void;
}

const cr = (inr: number) => `₹${(inr / 10000000).toFixed(2)} Cr`;
const riskRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export const ManagementExecutiveView: React.FC<ManagementExecutiveViewProps> = ({
  scoringData,
  currentPeriod,
  settings,
  litigations,
  risks,
  contracts,
  compliances,
  dueDiligences,
  projects,
  latestReview,
  onNavigateTab,
}) => {
  if (!scoringData) return null;
  const { departmentSummary, operationalSummary } = scoringData;
  const onTrackFrom = settings?.atRiskThreshold ?? 90;

  const statusStyles: Record<string, string> = {
    ON_TRACK: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
    EXCEEDS_TARGET: 'bg-blue-400/20 text-blue-200 border-blue-400/30',
    AT_RISK: 'bg-amber-400/20 text-amber-200 border-amber-400/30',
    BEHIND: 'bg-rose-400/20 text-rose-200 border-rose-400/30',
  };

  const totalExposure = litigations.reduce((a, l) => a + (l.estimatedExposureINR || 0), 0);
  const activeCases = litigations.filter((l) => !['SETTLED', 'DISMISSED', 'CLOSED'].includes(l.caseStatus));
  const topMatters = [...activeCases]
    .sort((a, b) => (riskRank[b.riskLevel] || 0) - (riskRank[a.riskLevel] || 0) || b.estimatedExposureINR - a.estimatedExposureINR)
    .slice(0, 4);
  const openRisks = risks
    .filter((r) => r.status !== 'MITIGATED')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 3);
  const completedContracts = contracts.filter((c) => c.status === 'APPROVED' || c.status === 'EXECUTED');
  const withinSla = completedContracts.filter((c) => c.isWithinSLA).length;
  const clearedDD = dueDiligences.filter((d) => d.legalClearanceStatus === 'CLEARED').length;
  const overdueCompliance = compliances.filter((c) => c.status === 'OVERDUE').length;
  const pendingCompliance = compliances.filter((c) => c.status === 'PENDING').length;
  const meetsBenchmark = departmentSummary.overallScore >= onTrackFrom;
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name || 'No project linked';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 lg:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 bg-white/10 px-3 py-1 rounded-full border border-white/10">
              C-SUITE & MANAGING DIRECTOR DASHBOARD • {currentPeriod.name}
            </span>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight">Legal Risk & Operational Governance Overview</h2>
            <p className="text-xs lg:text-sm text-slate-300 leading-relaxed">
              The Legal Department scored{' '}
              <strong className={meetsBenchmark ? 'text-emerald-400' : 'text-amber-300'}>{departmentSummary.overallScore}%</strong> this period,{' '}
              {meetsBenchmark
                ? `meeting the ${onTrackFrom}% on-track benchmark.`
                : `${Math.round((onTrackFrom - departmentSummary.overallScore) * 100) / 100} pts below the ${onTrackFrom}% on-track benchmark.`}{' '}
              {departmentSummary.kraBreakdowns.filter((k) => k.status === 'BEHIND').length} KRA(s) are behind target.
            </p>
          </div>

          <div className="flex items-center gap-6 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 shrink-0">
            <div>
              <div className="text-xs text-slate-400 font-medium">Department Index</div>
              <div className="text-3xl lg:text-4xl font-black text-white">{departmentSummary.overallScore}%</div>
            </div>
            <div className="h-10 w-px bg-white/20" />
            <div>
              <div className="text-xs text-slate-400 font-medium">Executive Status</div>
              <div className="mt-1">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusStyles[departmentSummary.status] || statusStyles.BEHIND}`}>
                  {departmentSummary.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Litigation Exposure</span>
            <Scale className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{cr(totalExposure)}</div>
          <p className="text-xs text-slate-500 mt-1">
            {activeCases.length} active of {litigations.length} proceeding(s), {operationalSummary.highRiskLitigation} high/critical
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">RERA & Statutory Compliance</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className={`mt-2 text-2xl font-black ${overdueCompliance ? 'text-rose-600' : 'text-emerald-600'}`}>
            {operationalSummary.complianceOnTimeRate}%
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {overdueCompliance} overdue, {pendingCompliance} pending of {compliances.length} obligations
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Contract Turnaround</span>
            <FileCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{operationalSummary.avgContractTAT} Days</div>
          <p className="text-xs text-slate-500 mt-1">
            {withinSla} of {completedContracts.length} completed contracts within SLA
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Title Due Diligence</span>
            <Building className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {dueDiligences.length ? `${Math.round((clearedDD / dueDiligences.length) * 1000) / 10}%` : '—'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {clearedDD} of {dueDiligences.length} properties cleared, {operationalSummary.unresolvedDefects} defect(s) unresolved
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              High Priority Litigation
            </h3>
            <button onClick={() => onNavigateTab('operations')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              View Registers →
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {topMatters.length === 0 && <div className="py-6 text-center text-slate-400">No active litigation.</div>}
            {topMatters.map((l) => (
              <div key={l.id} className="py-3 flex justify-between items-start gap-3">
                <div>
                  <span className="font-bold text-slate-900">
                    {l.caseNumber} ({l.court})
                  </span>
                  <p className="text-slate-500">{l.parties}</p>
                  <span className="text-[10px] text-slate-600 font-semibold">
                    Exposure: {cr(l.estimatedExposureINR || 0)} • {projectName(l.projectId)}
                    {l.nextHearingDate ? ` • Next hearing ${l.nextHearingDate}` : ''}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                    l.riskLevel === 'CRITICAL' || l.riskLevel === 'HIGH'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {l.riskLevel} RISK
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              Top Open Risks & Mitigation
            </h3>
            {latestReview && (
              <button onClick={() => onNavigateTab('reviews')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Read {currentPeriod.name} Review →
              </button>
            )}
          </div>

          <div className="space-y-3 text-xs text-slate-700">
            {openRisks.length === 0 && <div className="py-6 text-center text-slate-400">No open risks in the register.</div>}
            {openRisks.map((r) => (
              <div key={r.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900">
                    {r.riskCategory} • score {r.riskScore}/25 ({r.riskLevel})
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">{r.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-slate-600 mt-0.5">{r.description}</p>
                <p className="text-slate-500 mt-1">
                  <strong className="text-slate-700">Mitigation:</strong> {r.mitigationPlan || 'Not defined'}
                  {r.mitigationDeadline ? ` (due ${r.mitigationDeadline})` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
