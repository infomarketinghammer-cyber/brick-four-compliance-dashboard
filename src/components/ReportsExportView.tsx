import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Download, Printer, FileText, Calendar } from 'lucide-react';
import {
  KRA,
  KPI,
  KPIMeasurement,
  PerformancePeriod,
  ScoringSettings,
  ContractRecord,
  ComplianceRecord,
  LitigationCase,
  LegalNotice,
  DueDiligenceRecord,
  ApprovalNOCRecord,
  LegalTask,
  Project,
  AuditLogEntry,
} from '../types';
import { ScoringCalculationResponse } from '../services/api';

interface ReportsExportViewProps {
  organizationName: string;
  currentPeriod: PerformancePeriod;
  kras: KRA[];
  kpis: KPI[];
  measurements: KPIMeasurement[];
  scoringData: ScoringCalculationResponse | null;
  settings?: ScoringSettings;
  contracts: ContractRecord[];
  compliances: ComplianceRecord[];
  litigations: LitigationCase[];
  notices: LegalNotice[];
  dueDiligences: DueDiligenceRecord[];
  approvals: ApprovalNOCRecord[];
  tasks: LegalTask[];
  projects: Project[];
  auditLogs: AuditLogEntry[];
  canSeeAudit: boolean;
}

type Cell = string | number;
interface ReportDef {
  id: string;
  label: string;
  description: string;
  headers: string[];
  rows: Cell[][];
  footer?: Cell[];
  emptyMessage?: string;
}

const fmt = (s?: string) => (s ? s.replace(/_/g, ' ') : '—');
const cr = (inr?: number) => (inr ? `₹${(inr / 10000000).toFixed(2)} Cr` : '₹0.00 Cr');
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '—');

export const ReportsExportView: React.FC<ReportsExportViewProps> = ({
  organizationName,
  currentPeriod,
  kras,
  kpis,
  measurements,
  scoringData,
  settings,
  contracts,
  compliances,
  litigations,
  notices,
  dueDiligences,
  approvals,
  tasks,
  projects,
  auditLogs,
  canSeeAudit,
}) => {
  const [selectedReport, setSelectedReport] = useState<string>('dept-summary');

  const reports: ReportDef[] = useMemo(() => {
    const summary = scoringData?.departmentSummary;
    const breakdowns = summary?.kraBreakdowns || [];
    const projectLabel = (id?: string) => {
      const p = projects.find((x) => x.id === id);
      return p ? `${p.name} (${p.code})` : id || '—';
    };
    const kpiNodes = new Map(
      (scoringData?.explainabilityTree.children || []).flatMap((k) => (k.children || []).map((c) => [c.id, c] as const))
    );

    // Counsel workload across all registers
    const workload = new Map<string, { total: number; open: number }>();
    const addWork = (name: string | undefined, isOpen: boolean) => {
      const key = name || 'Unassigned';
      const w = workload.get(key) || { total: 0, open: 0 };
      w.total += 1;
      if (isOpen) w.open += 1;
      workload.set(key, w);
    };
    contracts.forEach((c) => addWork(c.assignedCounsel || c.assignedLawyerName, !['EXECUTED', 'APPROVED', 'EXPIRED', 'TERMINATED'].includes(c.status)));
    notices.forEach((n) => addWork(n.assignedCounsel || n.assignedLawyerName, !['RESPONDED', 'SETTLED'].includes(n.status)));
    litigations.forEach((l) => addWork(l.internalOwnerName, !['SETTLED', 'DISMISSED', 'CLOSED'].includes(l.caseStatus)));
    tasks.forEach((t) => addWork(t.assigneeName || t.assignedEmployeeName, !['COMPLETED', 'CANCELLED'].includes(t.status)));
    dueDiligences.forEach((d) => addWork(d.assignedLawyerName, d.legalClearanceStatus === 'PENDING' || d.legalClearanceStatus === 'CONDITIONAL_CLEARANCE'));

    const completedContracts = contracts.filter((c) => c.status === 'APPROVED' || c.status === 'EXECUTED');
    const exposure = litigations.reduce((a, l) => a + (l.estimatedExposureINR || 0), 0);

    return [
      {
        id: 'dept-summary',
        label: '1. Department Overall Performance Report',
        description: 'Weighted contribution of every KRA to the department score.',
        headers: ['KRA #', 'Key Result Area', 'Weight', 'Score', 'Contribution', 'Status'],
        rows: breakdowns.map((k) => [`KRA ${k.kra.kraNumber}`, k.kra.name, `${k.kra.weight}%`, `${k.kraScore}%`, `${k.weightedContribution} pts`, fmt(k.status)]),
        footer: summary ? ['', 'Total', `${summary.totalKRAWeight}%`, `${summary.overallScore}%`, `${summary.overallScore} pts`, fmt(summary.status)] : undefined,
      },
      {
        id: 'kra-breakdown',
        label: '2. KRA Performance & Weight Allocation Report',
        description: 'KPI status distribution inside each KRA.',
        headers: ['KRA #', 'Key Result Area', 'Owner', 'Weight', 'KPIs', 'On Track', 'At Risk', 'Behind', 'Score'],
        rows: breakdowns.map((k) => [`KRA ${k.kra.kraNumber}`, k.kra.name, k.kra.ownerName, `${k.kra.weight}%`, k.kpiCount, k.onTrackKpis, k.atRiskKpis, k.behindKpis, `${k.kraScore}%`]),
      },
      {
        id: 'kpi-details',
        label: '3. KPI Target vs Actual Achievement Report',
        description: 'Every KPI with its recorded actual for the period.',
        headers: ['KPI Code', 'KPI', 'KRA', 'Direction', 'Target', 'Actual', 'Achievement', 'Weighted Pts', 'Status', 'Override'],
        rows: kpis
          .filter((k) => k.active)
          .map((k) => {
            const m = measurements.find((x) => x.kpiId === k.id);
            const kra = kras.find((x) => x.id === k.kraId);
            const node = kpiNodes.get(k.id);
            return [
              k.kpiCode,
              k.name,
              kra ? `KRA ${kra.kraNumber}` : '—',
              fmt(k.direction),
              `${k.targetValue} ${k.unit}`,
              m ? `${m.actual} ${k.unit}` : 'Not recorded',
              m ? `${m.achievement}%` : `${node?.achievement ?? 0}%`,
              m ? m.weightedScore : 0,
              m ? fmt(m.status) : 'NOT MEASURED',
              m?.isManuallyOverridden ? `Yes – ${m.overrideBy || ''}` : 'No',
            ];
          }),
      },
      {
        id: 'contract-sla',
        label: '4. Contract Turnaround SLA & Efficiency Report',
        description: `${completedContracts.filter((c) => c.isWithinSLA).length} of ${completedContracts.length} completed contracts within SLA.`,
        headers: ['Contract', 'Counterparty', 'Type', 'Project', 'Value', 'Target SLA', 'Actual TAT', 'Within SLA', 'Status'],
        rows: contracts.map((c) => [
          c.contractTitle, c.counterparty, c.contractType, projectLabel(c.projectId), cr(c.contractValueINR),
          c.targetSLADays !== undefined ? `${c.targetSLADays} d` : '—', c.actualTATDays !== undefined ? `${c.actualTATDays} d` : '—',
          c.isWithinSLA === undefined ? '—' : c.isWithinSLA ? 'Yes' : 'No', fmt(c.status),
        ]),
      },
      {
        id: 'rera-compliance',
        label: '5. RERA Statutory Compliance & Filings Report',
        description: `${compliances.filter((c) => c.status === 'COMPLIANT').length} of ${compliances.length} obligations compliant.`,
        headers: ['Requirement', 'Regulation', 'Authority', 'Project', 'Frequency', 'Due', 'Completed', 'Status', 'Risk'],
        rows: compliances.map((c) => [c.requirement, c.regulation || '—', c.authority, projectLabel(c.projectId), fmt(c.frequency), c.dueDate, c.completionDate || '—', fmt(c.status), c.riskLevel]),
      },
      {
        id: 'litigation-exposure',
        label: '6. Litigation Docket & Financial Exposure Report',
        description: `Total exposure ${cr(exposure)} across ${litigations.length} matter(s).`,
        headers: ['Case #', 'Court', 'Type', 'Parties', 'Project', 'Status', 'Risk', 'Exposure', 'Legal Cost', 'Next Hearing'],
        rows: litigations.map((l) => [l.caseNumber, l.court, l.caseType, l.parties, projectLabel(l.projectId), fmt(l.caseStatus), l.riskLevel, cr(l.estimatedExposureINR), cr(l.actualLegalCostINR), l.nextHearingDate || '—']),
        footer: ['', '', '', '', '', '', 'Total', cr(exposure), cr(litigations.reduce((a, l) => a + (l.actualLegalCostINR || 0), 0)), ''],
      },
      {
        id: 'title-dd',
        label: '7. Land Title Due Diligence & Search Report',
        description: `${dueDiligences.filter((d) => d.legalClearanceStatus === 'CLEARED').length} of ${dueDiligences.length} properties cleared.`,
        headers: ['Property', 'Location', 'Owner / Seller', 'Title', 'Encumbrance', 'Defects (Resolved/Found)', 'Days (Actual/SLA)', 'Clearance'],
        rows: dueDiligences.map((d) => [d.propertyName, d.location || d.propertyLocation || '—', d.ownerOrSeller || '—', fmt(d.titleStatus), fmt(d.encumbranceStatus), `${d.defectsResolved ?? 0}/${d.defectsIdentified ?? 0}`, `${d.actualDaysTaken ?? '—'}/${d.targetSLADays ?? '—'}`, fmt(d.legalClearanceStatus)]),
      },
      {
        id: 'legal-notices',
        label: '8. Legal Notices TAT & Disposition Report',
        description: `${notices.filter((n) => n.status === 'OVERDUE').length} overdue notice(s).`,
        headers: ['Type', 'Direction', 'Sender', 'Received', 'Deadline', 'Response Days', 'SLA Days', 'Within SLA', 'Status'],
        rows: notices.map((n) => [n.noticeType, n.direction, n.sender, n.dateReceived, n.responseDeadline || '—', n.actualResponseDays ?? n.actualTATDays ?? '—', n.targetSLADays ?? '—', n.isWithinSLA === undefined ? '—' : n.isWithinSLA ? 'Yes' : 'No', fmt(n.status)]),
      },
      {
        id: 'project-legal',
        label: '9. Project-wise Real Estate Legal Health Report',
        description: 'Register activity and exposure per development project.',
        headers: ['Project', 'Location', 'RERA #', 'Contracts', 'Compliance (OK/Total)', 'Litigations', 'Exposure', 'Open Notices', 'Pending Approvals'],
        rows: projects.map((p) => {
          const pc = compliances.filter((c) => c.projectId === p.id);
          const pl = litigations.filter((l) => l.projectId === p.id);
          return [
            `${p.name} (${p.code})`, p.location, p.reraRegistrationNumber || '—',
            contracts.filter((c) => c.projectId === p.id).length,
            `${pc.filter((c) => c.status === 'COMPLIANT').length}/${pc.length}`,
            pl.length, cr(pl.reduce((a, l) => a + (l.estimatedExposureINR || 0), 0)),
            notices.filter((n) => n.projectId === p.id && !['RESPONDED', 'SETTLED'].includes(n.status)).length,
            approvals.filter((a) => a.projectId === p.id && a.status !== 'OBTAINED').length,
          ];
        }),
      },
      {
        id: 'counsel-workload',
        label: '10. Legal Counsel Productivity & Workload Report',
        description: 'Matters assigned per counsel across contracts, notices, litigation, tasks and due diligence.',
        headers: ['Counsel / Owner', 'Total Matters', 'Open Matters', 'Closed', 'Closure Rate'],
        rows: [...workload.entries()]
          .sort((a, b) => b[1].open - a[1].open)
          .map(([name, w]) => [name, w.total, w.open, w.total - w.open, pct(w.total - w.open, w.total)]),
      },
      {
        id: 'historical-trend',
        label: '11. Historical Trend & Trajectory Report',
        description: `Department score for recent ${currentPeriod.type.toLowerCase()} periods.`,
        headers: ['Period', 'Department Score', 'Change vs Previous'],
        rows: (scoringData?.trend || []).map((t, i, arr) => {
          const prev = i > 0 ? arr[i - 1].score : null;
          return [
            t.periodName,
            t.score !== null ? `${t.score}%` : 'No data',
            t.score !== null && prev !== null ? `${t.score - prev >= 0 ? '+' : ''}${Math.round((t.score - prev) * 100) / 100} pts` : '—',
          ];
        }),
      },
      {
        id: 'audit-trail',
        label: '12. Regulatory Governance & Audit Trail Report',
        description: 'Immutable log of governance actions.',
        headers: ['Timestamp', 'User', 'Role', 'Action', 'Previous', 'New', 'Reason'],
        rows: canSeeAudit ? auditLogs.map((l) => [l.timestamp, l.userName, l.userRole, l.action, l.oldValue || '', l.newValue || '', l.reason || '']) : [],
        emptyMessage: canSeeAudit ? 'No audit events recorded.' : 'The audit trail is restricted to the HOD, administrators and auditors.',
      },
      {
        id: 'csuite-briefing',
        label: '13. Senior Management C-Suite Briefing Report',
        description: 'Headline indicators for leadership.',
        headers: ['Indicator', 'Value'],
        rows: [
          ['Department score', summary ? `${summary.overallScore}% (${fmt(summary.status)})` : '—'],
          ['Change vs previous period', scoringData?.previousPeriodSummary.periodName ? `${scoringData.scoreDiff >= 0 ? '+' : ''}${scoringData.scoreDiff} pts vs ${scoringData.previousPeriodSummary.periodName}` : '—'],
          ['KRAs behind / at risk', `${breakdowns.filter((k) => k.status === 'BEHIND').length} / ${breakdowns.filter((k) => k.status === 'AT_RISK').length}`],
          ['Weakest KRA', breakdowns.length ? (() => { const w = [...breakdowns].sort((a, b) => a.kraScore - b.kraScore)[0]; return `${w.kra.name} (${w.kraScore}%)`; })() : '—'],
          ['Litigation exposure', `${cr(exposure)} across ${litigations.length} matter(s)`],
          ['Contracts within SLA', pct(completedContracts.filter((c) => c.isWithinSLA).length, completedContracts.length)],
          ['Statutory compliance', `${compliances.filter((c) => c.status === 'COMPLIANT').length}/${compliances.length} compliant, ${compliances.filter((c) => c.status === 'OVERDUE').length} overdue`],
          ['Pending approvals / NOCs', approvals.filter((a) => a.status !== 'OBTAINED').length],
          ['Properties with clear title', `${dueDiligences.filter((d) => d.legalClearanceStatus === 'CLEARED').length}/${dueDiligences.length}`],
        ],
      },
    ];
  }, [scoringData, kras, kpis, measurements, contracts, compliances, litigations, notices, dueDiligences, approvals, tasks, projects, auditLogs, canSeeAudit, currentPeriod.type]);

  const report = reports.find((r) => r.id === selectedReport) || reports[0];
  const summary = scoringData?.departmentSummary;

  const handleExportCSV = () => {
    const escape = (v: Cell) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [report.headers, ...report.rows, ...(report.footer ? [report.footer] : [])].map((r) => r.map(escape).join(','));
    // BOM so Excel opens the UTF-8 file (₹, –) correctly
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}_${currentPeriod.name.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            Executive Reports & Data Export Center
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {reports.length} audit-ready legal compliance and KPI reports for Board and statutory reviews.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={report.rows.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV / Excel</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print / PDF Document</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2 text-xs w-full md:w-auto">
          <FileText className="w-4 h-4 text-indigo-600" />
          <label className="font-bold text-slate-700" htmlFor="report-type">Select Report Type:</label>
          <select
            id="report-type"
            value={selectedReport}
            onChange={(e) => setSelectedReport(e.target.value)}
            className="flex-1 md:w-96 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none"
          >
            {reports.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Active Period: <strong className="text-slate-800">{currentPeriod.name}</strong>
          </span>
        </div>
      </div>

      {/* Printable Report */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm print:p-0 print:border-none print:shadow-none space-y-6">
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              CONFIDENTIAL • LEGAL & REGULATORY AUDIT REPORT
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-1">
              {organizationName} — {report.label.replace(/^\d+\.\s*/, '')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Period: {currentPeriod.name} • Period status: {fmt(currentPeriod.status)} • Generated: {new Date().toLocaleString()}
            </p>
            <p className="text-xs text-slate-600 mt-1">{report.description}</p>
          </div>

          {summary && (
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-slate-500 uppercase">Department Score</div>
              <div className="text-3xl font-black text-indigo-600">{summary.overallScore}%</div>
              <div className="text-xs font-bold text-slate-600">
                {fmt(summary.status)} (on track from {settings?.atRiskThreshold ?? 90}%)
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                {report.headers.map((h) => (
                  <th key={h} className="py-2.5 px-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={`py-2.5 px-3 ${j === 0 ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={report.headers.length} className="py-8 text-center text-slate-400">
                    {report.emptyMessage || 'No data for this report.'}
                  </td>
                </tr>
              )}
            </tbody>
            {report.footer && (
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold text-slate-900 bg-slate-50">
                  {report.footer.map((cell, j) => (
                    <td key={j} className="py-3 px-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
