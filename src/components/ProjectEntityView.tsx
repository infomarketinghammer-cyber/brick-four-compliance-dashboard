import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  Project,
  Company,
  ContractRecord,
  ComplianceRecord,
  LitigationCase,
  LegalNotice,
  LegalRisk,
  DueDiligenceRecord,
  ApprovalNOCRecord,
} from '../types';

interface ProjectEntityViewProps {
  projects: Project[];
  companies: Company[];
  contracts: ContractRecord[];
  compliances: ComplianceRecord[];
  litigations: LitigationCase[];
  notices: LegalNotice[];
  risks: LegalRisk[];
  dueDiligences: DueDiligenceRecord[];
  approvals: ApprovalNOCRecord[];
}

const cr = (inr: number) => `₹${(inr / 10000000).toFixed(2)} Cr`;

export const ProjectEntityView: React.FC<ProjectEntityViewProps> = ({
  projects,
  companies,
  contracts,
  compliances,
  litigations,
  notices,
  risks,
  dueDiligences,
  approvals,
}) => {
  const [activeTab, setActiveTab] = useState<'PROJECTS' | 'COMPANIES'>('PROJECTS');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  // Legal health metrics derived from the registers for one project or a set of projects
  const healthFor = (projectIds: string[]) => {
    const inScope = <T extends { projectId: string }>(rows: T[]) => rows.filter((r) => projectIds.includes(r.projectId));
    const pContracts = inScope(contracts);
    const pCompliance = inScope(compliances);
    const pLitigation = inScope(litigations);
    const pNotices = inScope(notices);
    const pRisks = inScope(risks);
    const pDD = inScope(dueDiligences);
    const pApprovals = inScope(approvals);
    const completed = pContracts.filter((c) => c.status === 'APPROVED' || c.status === 'EXECUTED');
    const tats = completed.filter((c) => c.actualTATDays !== undefined).map((c) => c.actualTATDays!);

    return {
      contracts: pContracts.length,
      contractsWithinSla: completed.filter((c) => c.isWithinSLA).length,
      contractsCompleted: completed.length,
      avgTat: tats.length ? Math.round((tats.reduce((a, b) => a + b, 0) / tats.length) * 10) / 10 : null,
      compliant: pCompliance.filter((c) => c.status === 'COMPLIANT').length,
      complianceTotal: pCompliance.length,
      complianceOverdue: pCompliance.filter((c) => c.status === 'OVERDUE').length,
      activeLitigation: pLitigation.filter((l) => !['SETTLED', 'DISMISSED', 'CLOSED'].includes(l.caseStatus)).length,
      exposure: pLitigation.reduce((a, l) => a + (l.estimatedExposureINR || 0), 0),
      openNotices: pNotices.filter((n) => !['RESPONDED', 'SETTLED'].includes(n.status)).length,
      openHighRisks: pRisks.filter((r) => (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL') && r.status !== 'MITIGATED').length,
      ddCleared: pDD.filter((d) => d.legalClearanceStatus === 'CLEARED').length,
      ddTotal: pDD.length,
      approvalsObtained: pApprovals.filter((a) => a.status === 'OBTAINED').length,
      approvalsTotal: pApprovals.length,
      openIssues:
        pCompliance.filter((c) => c.status === 'OVERDUE').length +
        pNotices.filter((n) => n.status === 'OVERDUE').length +
        pRisks.filter((r) => (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL') && r.status !== 'MITIGATED').length +
        pApprovals.filter((a) => a.status === 'OVERDUE' || a.status === 'QUERY_RAISED').length,
    };
  };

  const h = currentProject ? healthFor([currentProject.id]) : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            Project & Corporate Entity Legal Scorecards
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            RERA statutory health, litigation exposure, and register activity per development and SPV.
          </p>
        </div>

        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
          {(['PROJECTS', 'COMPANIES'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === t ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'PROJECTS' ? `Real Estate Projects (${projects.length})` : `Operating Companies & SPVs (${companies.length})`}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'PROJECTS' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {projects.map((proj) => {
              const isSelected = proj.id === currentProject?.id;
              const ph = healthFor([proj.id]);
              return (
                <button
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    isSelected ? 'bg-indigo-50/80 border-indigo-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {proj.projectType || proj.type}
                    </span>
                    <span className={`text-[10px] font-bold ${ph.openIssues ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {ph.openIssues ? `${ph.openIssues} open issue(s)` : 'No open issues'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-2">
                    {proj.name} <span className="font-mono text-xs text-slate-500">({proj.code})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{proj.location}</p>
                </button>
              );
            })}
          </div>

          {currentProject && h && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      {currentProject.name} ({currentProject.code})
                    </h3>
                    {currentProject.reraRegistrationNumber && (
                      <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                        RERA: {currentProject.reraRegistrationNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {currentProject.location} • Stage: {currentProject.status} • Entity:{' '}
                    {companies.find((c) => c.id === currentProject.companyId)?.code || '—'}
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Open Issues</div>
                    <div className={`text-xl font-black ${h.openIssues ? 'text-amber-600' : 'text-emerald-600'}`}>{h.openIssues}</div>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Litigation Exposure</div>
                    <div className="text-sm font-bold text-slate-800">{cr(h.exposure)}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-700">Statutory Compliance</span>
                  <div className={`text-lg font-bold mt-1 ${h.complianceOverdue ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {h.complianceTotal ? `${h.compliant}/${h.complianceTotal} compliant` : 'None tracked'}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{h.complianceOverdue} overdue</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-700">Title Due Diligence</span>
                  <div className="text-lg font-bold text-slate-900 mt-1">{h.ddTotal ? `${h.ddCleared}/${h.ddTotal} cleared` : 'None recorded'}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Approvals: {h.approvalsObtained}/{h.approvalsTotal} obtained</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-700">Contract Turnaround</span>
                  <div className="text-lg font-bold text-slate-900 mt-1">{h.avgTat !== null ? `${h.avgTat} days avg` : '—'}</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {h.contracts} contract(s), {h.contractsWithinSla}/{h.contractsCompleted} completed within SLA
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-700">Disputes & Risks</span>
                  <div className="text-lg font-bold text-slate-900 mt-1">{h.activeLitigation} active case(s)</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {h.openNotices} open notice(s), {h.openHighRisks} open high risk(s)
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Corporate Companies & Joint Venture SPVs</h3>
            <span className="text-xs text-slate-500">Health aggregated across each entity's projects</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-3">CIN</th>
                  <th className="py-3 px-3">Projects</th>
                  <th className="py-3 px-3">Compliance</th>
                  <th className="py-3 px-3">Litigation Exposure</th>
                  <th className="py-3 px-4 text-right">Open Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => {
                  const companyProjects = projects.filter((p) => p.companyId === c.id);
                  const ch = healthFor(companyProjects.map((p) => p.id));
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{c.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{c.code}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{c.cinNumber || c.cin || '—'}</td>
                      <td className="py-3 px-3">
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-700">
                          {companyProjects.length} project{companyProjects.length === 1 ? '' : 's'}
                        </span>
                        {companyProjects.length > 0 && (
                          <div className="text-[10px] text-slate-400 mt-1">{companyProjects.map((p) => p.code).join(', ')}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {ch.complianceTotal ? `${ch.compliant}/${ch.complianceTotal} compliant` : '—'}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{cr(ch.exposure)}</td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold border ${
                            ch.openIssues ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          {ch.openIssues ? `${ch.openIssues} open` : 'COMPLIANT'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
