import React, { useEffect, useMemo, useState } from 'react';
import { Users, CheckCircle2, Clock, XCircle, Crown, Search, Award, X } from 'lucide-react';
import { User, KPI, KPISubmission, PerformancePeriod } from '../types';
import { api } from '../services/api';

interface EmployeePerformanceViewProps {
  users: User[];
  currentUser: User;
  currentPeriod: PerformancePeriod;
  kpis: KPI[];
}

interface MemberStats {
  submitted: number;
  approved: number;
  pending: number;
  rejected: number;
  points: number;
  assignedKpis: number;
}

const initials = (name: string) =>
  name
    .replace(/^(mrs\.|mr\.|ms\.|ar\.|adv\.|ca)\s*/i, '')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const EmployeePerformanceView: React.FC<EmployeePerformanceViewProps> = ({ users, currentUser, currentPeriod, kpis }) => {
  const [viewMode, setViewMode] = useState<'TREE' | 'CARDS'>('TREE');
  const [inspectedMember, setInspectedMember] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getSubmissions({ periodId: currentPeriod.id })
      .then((rows) => !cancelled && setSubmissions(rows))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [currentPeriod.id]);

  const statsFor = (u: User): MemberStats => {
    const mine = submissions.filter((s) => s.employeeId === u.id);
    const assigned = kpis.filter(
      (k) => k.active && (k.ownerId === u.id || u.assignedKpis?.includes(k.id) || u.assignedKras?.includes(k.kraId))
    );
    return {
      submitted: mine.length,
      approved: mine.filter((s) => s.status === 'APPROVED').length,
      pending: mine.filter((s) => s.status === 'PENDING_APPROVAL').length,
      rejected: mine.filter((s) => s.status === 'REJECTED').length,
      points: mine.reduce((a, s) => a + s.pointsAwarded, 0),
      assignedKpis: assigned.length,
    };
  };

  const head = users.find((u) => u.level === 1 && u.role === 'LEGAL_HEAD') || users.find((u) => !u.managerId) || users[0];
  const reportsOf = (id: string) => users.filter((u) => u.managerId === id);
  const levelCounts = {
    1: users.filter((u) => u.level === 1).length,
    2: users.filter((u) => u.level === 2).length,
    3: users.filter((u) => u.level === 3).length,
  };

  const teamTotals = useMemo(() => {
    const approved = submissions.filter((s) => s.status === 'APPROVED').length;
    const decided = submissions.filter((s) => s.status !== 'PENDING_APPROVAL').length;
    return {
      submitted: submissions.length,
      pending: submissions.filter((s) => s.status === 'PENDING_APPROVAL').length,
      approvalRate: decided ? Math.round((approved / decided) * 1000) / 10 : null,
    };
  }, [submissions]);

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.designation.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    );
  });

  const levelLabel = (u: User) => (u.level === 1 ? 'HOD' : u.level === 2 ? 'Manager' : 'Staff');

  const StatLine: React.FC<{ s: MemberStats }> = ({ s }) => (
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
      <span className="text-emerald-700 flex items-center gap-0.5">
        <CheckCircle2 className="w-3 h-3" /> {s.approved} approved
      </span>
      <span className="text-amber-700 flex items-center gap-0.5">
        <Clock className="w-3 h-3" /> {s.pending} pending
      </span>
      {s.rejected > 0 && (
        <span className="text-rose-700 flex items-center gap-0.5">
          <XCircle className="w-3 h-3" /> {s.rejected} revision
        </span>
      )}
    </div>
  );

  const MemberCard: React.FC<{ member: User; tone: 'amber' | 'indigo' | 'slate' }> = ({ member, tone }) => {
    const s = statsFor(member);
    const isCurrent = currentUser.id === member.id;
    const border = tone === 'amber' ? 'border-amber-300' : tone === 'indigo' ? 'border-indigo-200' : 'border-slate-200';
    return (
      <button
        onClick={() => setInspectedMember(member)}
        className={`w-64 text-left bg-white border-2 ${isCurrent ? 'border-indigo-600 ring-2 ring-indigo-500/20' : border} rounded-2xl p-4 shadow-sm hover:shadow-md transition-all`}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-slate-800 to-indigo-900 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
            {initials(member.name)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-900 truncate">{member.name}</div>
            <div className="text-[10px] text-slate-500 truncate">{member.designation}</div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{levelLabel(member)} • {member.wing || member.department || '—'}</span>
            <span className="font-bold text-indigo-600">{s.assignedKpis} KPIs</span>
          </div>
          <StatLine s={s} />
        </div>
      </button>
    );
  };

  // Recursive org chart so staff reporting directly to the HOD (no wing manager) are shown too
  const renderBranch = (member: User, depth: number): React.ReactNode => {
    const children = reportsOf(member.id);
    return (
      <div key={member.id} className="flex flex-col items-center">
        <MemberCard member={member} tone={depth === 0 ? 'amber' : member.level === 2 ? 'indigo' : 'slate'} />
        {children.length > 0 && (
          <>
            <div className="w-0.5 h-6 bg-slate-300" />
            <div className="flex flex-wrap justify-center gap-6 pt-2 border-t-2 border-slate-200">
              {children.map((c) => (
                <div key={c.id} className="flex flex-col items-center pt-2">
                  {renderBranch(c, depth + 1)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const inspectedStats = inspectedMember ? statsFor(inspectedMember) : null;
  const inspectedSubs = inspectedMember ? submissions.filter((s) => s.employeeId === inspectedMember.id) : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {head?.department || 'Legal'} Department Organization & Performance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Reporting hierarchy and deliverable approvals for {currentPeriod.name}
            </p>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          {(['TREE', 'CARDS'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                viewMode === mode ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mode === 'TREE' ? 'Org Chart Tree' : `Staff Directory (${users.length})`}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">Could not load submissions: {loadError}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Staff</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{users.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {levelCounts[1]} HOD • {levelCounts[2]} Manager{levelCounts[2] === 1 ? '' : 's'} • {levelCounts[3]} Staff
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deliverables Submitted</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{teamTotals.submitted}</div>
          <div className="text-[11px] text-amber-600 font-semibold mt-1">{teamTotals.pending} awaiting approval</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Approval Rate</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {teamTotals.approvalRate !== null ? `${teamTotals.approvalRate}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Approved of decided submissions</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Head of Department</span>
          <div className="text-sm font-bold text-slate-900 mt-1.5 truncate">{head?.name || '—'}</div>
          <div className="text-[11px] text-slate-500 truncate">{head?.designation}</div>
        </div>
      </div>

      {viewMode === 'TREE' && head && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-2xs overflow-x-auto">
          <div className="text-center pb-4 mb-6 border-b border-slate-100">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              Hierarchical Reporting & Approval Structure
            </div>
          </div>
          <div className="flex justify-center min-w-max">{renderBranch(head, 0)}</div>
        </div>
      )}

      {viewMode === 'CARDS' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, designation, or email..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((member) => {
              const s = statsFor(member);
              return (
                <div key={member.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-800 to-indigo-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {initials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{member.name}</h3>
                      <p className="text-xs text-slate-500 truncate">{member.designation}</p>
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Reports To:</span>
                      <span className="font-semibold text-indigo-700">{member.managerName || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Level:</span>
                      <span className="font-semibold text-slate-800">
                        {member.level ?? '—'} ({levelLabel(member)})
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">KPIs</span>
                      <span className="font-bold text-slate-900">{s.assignedKpis}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">Approved</span>
                      <span className="font-bold text-emerald-600">{s.approved}/{s.submitted}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">Points</span>
                      <span className="font-bold text-indigo-600">{s.points}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setInspectedMember(member)}
                    className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    View Dossier
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {inspectedMember && inspectedStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-brand-gradient text-white font-bold text-base flex items-center justify-center shadow-md">
                  {initials(inspectedMember.name)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{inspectedMember.name}</h3>
                  <p className="text-xs font-semibold text-slate-600">{inspectedMember.designation}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 mt-1 inline-block">
                    {inspectedMember.department || '—'}
                  </span>
                </div>
              </div>
              <button onClick={() => setInspectedMember(null)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Corporate Email:</span>
                <span className="font-mono font-bold text-slate-800">{inspectedMember.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reports To:</span>
                <span className="font-bold text-slate-800">{inspectedMember.managerName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Direct Reports:</span>
                <span className="font-bold text-slate-800">{reportsOf(inspectedMember.id).length}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-indigo-700 font-bold block uppercase">Assigned KPIs</span>
                <span className="text-sm font-black text-indigo-950 mt-0.5 block">{inspectedStats.assignedKpis}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Approved</span>
                <span className="text-sm font-black text-emerald-600 mt-0.5 block">
                  {inspectedStats.approved}/{inspectedStats.submitted}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Points</span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">{inspectedStats.points}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-indigo-600" /> Deliverables — {currentPeriod.name}
              </div>
              {inspectedSubs.length === 0 ? (
                <div className="text-xs text-slate-400 p-3 border border-dashed border-slate-200 rounded-xl text-center">
                  No submissions visible for this period.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl text-xs">
                  {inspectedSubs.map((s) => (
                    <div key={s.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">
                          {s.kpiCode} • {s.kpiName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.achievedValue} / {s.targetValue} {s.unit} • {s.submittedDate}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          s.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
