import React, { useState, useEffect } from 'react';
import {
  User,
  KRA,
  KPI,
  PerformancePeriod,
  KPISubmission,
} from '../types';
import { api } from '../services/api';
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  Download,
  Eye,
  Send,
  AlertCircle,
  XCircle,
  ChevronRight,
  TrendingUp,
  Layers,
  Crown,
  User as UserIcon,
  LogOut,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Check,
  X,
  Building,
  ArrowUpRight,
  RefreshCw,
  Target,
} from 'lucide-react';

interface PersonalDashboardViewProps {
  currentUser: User;
  allUsers: User[];
  kras: KRA[];
  kpis: KPI[];
  currentPeriod: PerformancePeriod;
  /** Approvals write KPI actuals, so department scores must be refreshed afterwards */
  onSubmissionsChanged: () => Promise<void> | void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

// Vercel functions accept request bodies up to 4.5 MB; base64 adds ~33%, so files are capped at 3 MB
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export const PersonalDashboardView: React.FC<PersonalDashboardViewProps> = ({
  currentUser,
  allUsers,
  kras,
  kpis,
  currentPeriod,
  onSubmissionsChanged,
  notify,
}) => {
  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);
  const [hierarchyRollup, setHierarchyRollup] = useState<any>(null);
  const [reportingChain, setReportingChain] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'MY_SUBMISSIONS' | 'ROLLUP_DESK'>('MY_SUBMISSIONS');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [inspectingDoc, setInspectingDoc] = useState<KPISubmission | null>(null);

  // New Submission Form State
  const [selectedKpiId, setSelectedKpiId] = useState<string>('');
  const [achievedVal, setAchievedVal] = useState<string>('');
  const [targetVal, setTargetVal] = useState<number | ''>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [approvalError, setApprovalError] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Manager Approval State
  const [approvalModalSub, setApprovalModalSub] = useState<KPISubmission | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState<string>('');
  const [rejectRemarks, setRejectRemarks] = useState<string>('');
  const [isRejectMode, setIsRejectMode] = useState<boolean>(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState<boolean>(false);
  const isLevel1 = currentUser.level === 1;
  const isLevel2 = currentUser.level === 2;

  const activeDepartment = currentUser.department || 'Legal';
  const headOfDepartment = allUsers.find((u) => u.level === 1 && u.role === 'LEGAL_HEAD');
  const reportingManager = currentUser.managerId ? allUsers.find((u) => u.id === currentUser.managerId) : undefined;
  const canSubmitWork = Boolean(reportingManager) && currentPeriod.status !== 'LOCKED';

  const departmentKras = kras.filter((k) => k.active);

  // Mirrors the server's assignment rule for which KPIs a person may submit against
  const submissionKpis = kpis.filter(
    (k) =>
      k.active &&
      (k.ownerId === currentUser.id ||
        currentUser.assignedKpis?.includes(k.id) ||
        currentUser.assignedKras?.includes(k.kraId) ||
        (isLevel2 && ((k.wing && k.wing === currentUser.wing) || (k.department && k.department === currentUser.department))))
  );

  // Load Submissions, Hierarchy Rollup, and Upward Reporting Chain
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allSubs, rollup, chain] = await Promise.all([
        api.getSubmissions({ periodId: currentPeriod.id }),
        api.getHierarchyRollup(currentPeriod.id),
        api.getReportingChain(currentPeriod.id),
      ]);
      setSubmissions(allSubs);
      setHierarchyRollup(rollup);
      setReportingChain(chain || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load your dashboard data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id, currentPeriod.id]);

  const openSubmitModal = () => {
    setSelectedKpiId('');
    setAchievedVal('');
    setTargetVal('');
    setNotes('');
    setSelectedFile(null);
    setFileBase64('');
    setSubmitError('');
    setIsSubmitModalOpen(true);
  };

  // Handle File Input Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileBase64('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSelectedFile(null);
      setSubmitError('File is larger than 3 MB. Please upload a smaller document.');
      return;
    }
    setSubmitError('');
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setFileBase64(reader.result as string);
    reader.onerror = () => setSubmitError('Could not read the selected file.');
    reader.readAsDataURL(file);
  };

  // Submit Work & Upload Document (Real file upload strictly enforced)
  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!selectedKpiId) {
      setSubmitError('Please select an assigned KPI deliverable.');
      return;
    }
    if (achievedVal.trim() === '' || !Number.isFinite(Number(achievedVal))) {
      setSubmitError('Enter the achieved value as a number.');
      return;
    }
    if (!selectedFile || !fileBase64) {
      setSubmitError('A real verification document (PDF, DOC, PNG, etc.) must be attached to submit a deliverable.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fileType = selectedFile.name.split('.').pop()?.toUpperCase() || 'PDF';
      const fileSize =
        selectedFile.size > 1024 * 1024
          ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`;

      await api.createSubmission({
        periodId: currentPeriod.id,
        kpiId: selectedKpiId,
        employeeId: currentUser.id,
        achievedValue: Number(achievedVal),
        notes,
        document: {
          fileName: selectedFile.name,
          fileType,
          fileSize,
          fileData: fileBase64,
          description: notes,
        },
      });

      setIsSubmitModalOpen(false);
      notify(`Deliverable submitted to ${reportingManager?.name || 'your manager'} for approval`);
      await loadData();
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manager Approve Action
  const handleApprove = async () => {
    if (!approvalModalSub) return;
    setIsProcessingApproval(true);
    setApprovalError('');
    try {
      await api.approveSubmission(
        approvalModalSub.id,
        approvalRemarks || 'Approved. Work verified with compliance standards. Full points awarded.'
      );
      notify(`Approved ${approvalModalSub.employeeName}'s ${approvalModalSub.kpiCode} deliverable`);
      setApprovalModalSub(null);
      setApprovalRemarks('');
      await loadData();
      await onSubmissionsChanged();
    } catch (err: any) {
      setApprovalError(err.message || 'Approval failed');
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Manager Reject Action
  const handleReject = async () => {
    if (!approvalModalSub || !rejectRemarks.trim()) {
      setApprovalError('Please provide rejection or revision comments');
      return;
    }
    setIsProcessingApproval(true);
    setApprovalError('');
    try {
      await api.rejectSubmission(approvalModalSub.id, rejectRemarks.trim());
      notify(`Revision requested from ${approvalModalSub.employeeName}`);
      setApprovalModalSub(null);
      setRejectRemarks('');
      setIsRejectMode(false);
      await loadData();
    } catch (err: any) {
      setApprovalError(err.message || 'Rejection failed');
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Document files are only delivered by the server to the submitter, their manager, the HOD and auditors
  const restrictedMessage =
    'Access restricted: evidence files are confidential to the submitter, their reporting manager, the Head of Department and auditors.';

  const handleViewDoc = (sub: KPISubmission) => {
    if (sub.document?.isRestricted || !sub.document?.fileData) {
      notify(restrictedMessage, 'error');
      return;
    }
    setInspectingDoc(sub);
  };

  const handleDownloadDoc = (sub: KPISubmission) => {
    if (sub.document?.isRestricted || !sub.document?.fileData) {
      notify(restrictedMessage, 'error');
      return;
    }
    downloadDocument(sub);
  };

  // Filter submissions for this user
  const mySubmissions = submissions.filter((s) => s.employeeId === currentUser.id);

  // Filter subordinate submissions waiting for this manager's review (strictly direct reports)
  const pendingForMe = submissions.filter(
    (s) =>
      (s.managerId === currentUser.id || isLevel1) &&
      s.status === 'PENDING_APPROVAL' &&
      s.employeeId !== currentUser.id
  );

  const approvedForMe = submissions.filter(
    (s) =>
      (s.managerId === currentUser.id || isLevel1) &&
      s.status === 'APPROVED' &&
      s.employeeId !== currentUser.id
  );

  // Total points earned by current user
  const myEarnedPoints = mySubmissions.reduce((acc, s) => acc + s.pointsAwarded, 0);
  const myApprovedCount = mySubmissions.filter((s) => s.status === 'APPROVED').length;
  const myPendingCount = mySubmissions.filter((s) => s.status === 'PENDING_APPROVAL').length;

  // Role Badge Styling
  const levelBadge = isLevel1
    ? { label: 'Head of Department', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
    : isLevel2
    ? { label: 'Wing Manager', bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
    : { label: 'Technical Staff', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Personalized Executive Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-brand-gradient/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start sm:items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/30">
            {currentUser.name
              .replace(/^(mrs\.|mr\.|ms\.|ar\.|adv\.|ca)\s*/i, '')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{currentUser.name}</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${levelBadge.bg}`}>
                {levelBadge.label}
              </span>
            </div>
            <p className="text-xs text-indigo-300 font-medium mt-1">
              {currentUser.designation} • {currentUser.department}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
              <span className="font-mono text-slate-300">{currentUser.email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI & KRA Hierarchy Status Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Points Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">My Points Awarded</div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-baseline gap-1">
              <span>{myEarnedPoints}</span>
              <span className="text-xs font-normal text-slate-500">pts</span>
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{myApprovedCount} Deliverables Approved</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Submissions Pending Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">My Pending Submissions</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{myPendingCount}</div>
            <div className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Awaiting Upper Manager Review</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Subordinate Review Queue (For Managers & HOD) */}
        {(isLevel1 || isLevel2) && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subordinate Approval Queue</div>
              <div className="text-2xl font-black text-indigo-600 mt-1">{pendingForMe.length}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                {pendingForMe.length > 0 ? 'Requires Your Verification' : 'All Deliverables Cleared'}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        )}

        {/* Hierarchy Rollup Status */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Hierarchy Rollup Impact</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {isLoading
                ? '…'
                : isLevel1
                ? `${hierarchyRollup?.head?.departmentRollupScore ?? 0}%`
                : isLevel2
                ? `${hierarchyRollup?.managers?.find((m: any) => m.id === currentUser.id)?.rollupScore ?? 0}%`
                : `${
                    [...(hierarchyRollup?.directStaff || []), ...(hierarchyRollup?.managers || []).flatMap((m: any) => m.subordinates)].find(
                      (s: any) => s.id === currentUser.id
                    )?.completionRate ?? 0
                  }%`}
            </div>
            <div className="text-[11px] text-indigo-600 font-semibold mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>{isLevel1 ? 'Team deliverables approved this period' : 'Your deliverables approved this period'}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Department-Wise KRAs & Org Chart Hierarchy Rollup */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Building className="w-5 h-5 text-indigo-600 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">
                Department-Wise KRAs: {activeDepartment}
              </h3>
              {currentUser.wing && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {currentUser.wing} Wing
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              KRAs and KPIs are architected hierarchically: when lower employees complete deliverables and their manager approves, their KRA completes and automatically rolls up to fulfill upper executive KRAs.
            </p>
          </div>
        </div>

        {/* Department KRA Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departmentKras.map((kra) => {
            const kpiItems = kpis.filter((k) => k.kraId === kra.id);
            const kraSubmissions = submissions.filter(
              (s) => s.kraId === kra.id && s.periodId === currentPeriod.id
            );
            const approvedSubs = kraSubmissions.filter((s) => s.status === 'APPROVED');
            const completionPercent =
              kraSubmissions.length > 0 ? Math.min(100, Math.round((approvedSubs.length / kraSubmissions.length) * 100)) : 0;

            return (
              <div
                key={kra.id}
                className="bg-slate-50/70 hover:bg-slate-50 rounded-2xl p-4 border border-slate-200/90 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono">
                      KRA #{kra.kraNumber}
                    </span>
                    <span className="text-[11px] font-extrabold text-indigo-600">
                      Weight: {kra.weight}%
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 leading-snug">
                    {kra.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {kra.description}
                  </p>

                  <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-slate-400">Department Lead:</span>
                    <span className="font-semibold text-slate-800">{kra.ownerName}</span>
                  </div>

                  {/* Child KPIs */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Assigned Deliverables ({kpiItems.length})
                    </span>
                    <div className="space-y-1">
                      {kpiItems.slice(0, 3).map((kpi) => (
                        <div
                          key={kpi.id}
                          className="text-[11px] bg-white px-2 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2"
                        >
                          <div className="truncate flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-indigo-600 shrink-0">
                              {kpi.kpiCode}
                            </span>
                            <span className="truncate text-slate-700 font-medium">
                              {kpi.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0 font-semibold">
                            {kpi.ownerName.split(' ')[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Hierarchy Completion Progress */}
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium">
                      {kraSubmissions.length > 0
                        ? `Deliverables approved (${approvedSubs.length}/${kraSubmissions.length}):`
                        : 'No deliverables submitted yet'}
                    </span>
                    <span className="font-black text-emerald-600">{completionPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* View Switcher Tabs: Submissions | Upward Visibility | Hierarchy Rollup */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab('MY_SUBMISSIONS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'MY_SUBMISSIONS'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>My Deliverables & Submissions</span>
            {myPendingCount > 0 && (
              <span className="text-[10px] bg-amber-500 text-slate-900 font-bold px-1.5 py-0.2 rounded-full">
                {myPendingCount}
              </span>
            )}
          </button>



          <button
            onClick={() => setActiveSubTab('ROLLUP_DESK')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'ROLLUP_DESK'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hierarchy Rollup & Approvals Desk</span>
            {pendingForMe.length > 0 && (
              <span className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.2 rounded-full animate-pulse">
                {pendingForMe.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: MY SUBMISSIONS & DELIVERABLES */}
      {activeSubTab === 'MY_SUBMISSIONS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Work Submission & Deliverables */}
          <div className="lg:col-span-7 space-y-6">
            {/* Action Header */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-indigo-600" />
                  <span>My KRA Deliverables & Document Submissions</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submit completed tasks with real attached proof documents (PDF, DOC, PNG). Upper managers review and award points.
                </p>
              </div>
              {canSubmitWork ? (
                <button
                  onClick={openSubmitModal}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all shrink-0"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Submit Work & Upload Doc</span>
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 max-w-[220px] text-right">
                  {currentPeriod.status === 'LOCKED'
                    ? `${currentPeriod.name} is locked — submissions are closed.`
                    : 'You have no reporting manager to approve deliverables. Record KPI actuals in Reconciliation.'}
                </span>
              )}
            </div>

            {/* Submissions List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Submitted Documents ({mySubmissions.length})
                </span>
                <span className="text-[11px] text-slate-500">Period: {currentPeriod.name}</span>
              </div>

              <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                {mySubmissions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">No deliverables submitted yet for this period</p>
                    <p className="mt-1">Click "Submit Work & Upload Doc" above to upload your required PDF, DOC or PNG document.</p>
                  </div>
                ) : (
                  mySubmissions.map((sub) => {
                    const isApproved = sub.status === 'APPROVED';
                    const isRejected = sub.status === 'REJECTED';
                    return (
                      <div key={sub.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs truncate">{sub.kpiName}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                              {sub.kpiCode}
                            </span>
                            {isApproved ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Approved • {sub.pointsAwarded} Pts
                              </span>
                            ) : isRejected ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Revision Requested
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Pending Review (0 Pts)
                              </span>
                            )}
                          </div>

                          {/* Document Badge */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 font-medium">
                              <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span className="font-semibold truncate max-w-[200px]">{sub.document.fileName}</span>
                              <span className="text-[10px] text-slate-400">({sub.document.fileSize})</span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Submitted on {sub.submittedDate} • Reporting Manager: {sub.managerName}
                            </span>
                          </div>

                          {/* Confidentiality Org Chart Tag */}
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200 w-fit">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Confidential: Strictly private to you & reporting manager ({sub.managerName}) per Org Chart</span>
                          </div>

                          {sub.notes && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                              {sub.notes}
                            </p>
                          )}

                          <div className="text-[11px] text-slate-500">
                            Achieved {sub.achievedValue} / target {sub.targetValue} {sub.unit}
                          </div>

                          {sub.approvalRemarks && (
                            <p
                              className={`text-xs p-2 rounded-lg border font-medium ${
                                isRejected ? 'text-rose-800 bg-rose-50 border-rose-100' : 'text-emerald-800 bg-emerald-50 border-emerald-100'
                              }`}
                            >
                              Manager Remarks: {sub.approvalRemarks}
                            </p>
                          )}
                        </div>

                        {/* Document Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleViewDoc(sub)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>View Doc</span>
                          </button>
                          <button
                            onClick={() => handleDownloadDoc(sub)}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                          >
                            <Download className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Upper Manager Approval Desk & Hierarchy Visualizer */}
          <div className="lg:col-span-5 space-y-6">
            {/* Subordinate Approvals Desk (For Managers & GM) */}
            {(isLevel1 || isLevel2) && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Subordinate Approvals Desk</span>
                    </h3>
                    <p className="text-[11px] text-indigo-200 mt-0.5">
                      Review and verify documents submitted by your technical staff
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-900">
                    {pendingForMe.length} Pending
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                  {pendingForMe.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                      <p className="font-semibold text-slate-700">No pending subordinate submissions</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">All direct report deliverables are up to date.</p>
                    </div>
                  ) : (
                    pendingForMe.map((sub) => (
                      <div key={sub.id} className="p-4 hover:bg-indigo-50/30 transition-all space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{sub.employeeName}</div>
                            <div className="text-[10px] text-slate-500">
                              {sub.employeeDesignation} • Submitted: {sub.submittedDate}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                            {sub.kpiCode}
                          </span>
                        </div>

                        <div className="text-xs text-slate-700 font-medium">{sub.kpiName}</div>
                        <div className="text-[11px] text-slate-500">
                          Achieved {sub.achievedValue} / target {sub.targetValue} {sub.unit}
                        </div>

                        {/* Attached Document Card */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            <div className="truncate">
                              <span className="font-semibold text-slate-800 block truncate">{sub.document.fileName}</span>
                              <span className="text-[10px] text-slate-400">{sub.document.fileSize} • {sub.document.fileType}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              onClick={() => handleViewDoc(sub)}
                              className="p-1 hover:bg-slate-200 text-slate-600 rounded"
                              title="Preview Document"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadDoc(sub)}
                              className="p-1 hover:bg-slate-200 text-indigo-600 rounded"
                              title="Download Document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Approval Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => {
                              setApprovalError('');
                              setRejectRemarks('');
                              setApprovalModalSub(sub);
                              setIsRejectMode(true);
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-all"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => {
                              setApprovalError('');
                              setApprovalModalSub(sub);
                              setIsRejectMode(false);
                              setApprovalRemarks(`Verified and approved by ${currentUser.name}. Points awarded.`);
                            }}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve & Award Points</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {/* VIEW 3: HIERARCHY ROLLUP & APPROVALS DESK */}
      {activeSubTab === 'ROLLUP_DESK' && (
        <div className="space-y-6">
          {/* Header Summary Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 border border-slate-800 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold">
                    Hierarchy Rollup & Approval Governance
                  </h3>
                </div>
                <p className="text-xs text-indigo-200 mt-1 max-w-2xl">
                    {isLevel1
                    ? 'Head of Department Review: Monitor all department KRAs, verify Level 2 Manager submissions, and authorize period rollups.'
                    : isLevel2
                    ? `Manager Rollup: Verify deliverables, award points, and track your consolidated submission routed upward to ${headOfDepartment?.name || 'the Head of Department'}.`
                    : 'Personal Rollup Status: Track how your approved deliverables roll up to fulfill your reporting manager’s KRA benchmarks.'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/10 rounded-xl text-center">
                  <span className="text-[10px] text-indigo-300 block font-bold uppercase">Pending Queue</span>
                  <span className="text-lg font-black text-amber-400 block">{pendingForMe.length}</span>
                </div>
                <div className="p-3 bg-white/10 rounded-xl text-center">
                  <span className="text-[10px] text-indigo-300 block font-bold uppercase">Approved Deliverables</span>
                  <span className="text-lg font-black text-emerald-400 block">{approvedForMe.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* For Level 2 Managers: My Upward Rollup Submission to HOD */}
          {isLevel2 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    My Aggregated Rollup Submission to Head of Department
                  </span>
                </div>
                <span className="text-[11px] font-bold text-indigo-600">{headOfDepartment?.name || 'Head of Department'}</span>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  When you approve your team's deliverables, your aggregated completion updates and a consolidated KRA achievement package is routed up to {headOfDepartment?.name || 'the Head of Department'} for executive authorization.
                </p>

                {/* Show manager's upward submission */}
                {submissions.filter((s) => s.employeeId === currentUser.id && s.isManagerRollup).length === 0 ? (
                  <div className="p-5 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-700">Rollup Package Ready for Generation</p>
                    <p className="mt-1">
                      Approve pending deliverables to generate and update your consolidated submission to {headOfDepartment?.name || 'the Head of Department'}.
                    </p>
                  </div>
                ) : (
                  submissions
                    .filter((s) => s.employeeId === currentUser.id && s.isManagerRollup)
                    .map((sub) => (
                      <div
                        key={sub.id}
                        className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">{sub.kpiName}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-indigo-700 border border-indigo-200 font-mono">
                              {sub.kpiCode}
                            </span>
                            {sub.status === 'APPROVED' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                GM Approved
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                Pending GM Review
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">{sub.notes}</p>
                          <div className="text-[11px] text-slate-400">
                            Attached File: <strong className="text-slate-700">{sub.document.fileName}</strong> ({sub.document.fileSize})
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleViewDoc(sub)}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200"
                          >
                            View Dossier
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* For Level 1 HOD: Pending for GM Review Queue (Wing Managers' Rollup Submissions) */}
          {isLevel1 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-900/90 to-slate-900 text-white">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Executive Review Queue: Level 2 Wing Managers' Rollup Submissions
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-900">
                  {submissions.filter((s) => s.managerId === currentUser.id && s.isManagerRollup && s.status === 'PENDING_APPROVAL').length} Pending GM Sign-off
                </span>
              </div>

              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {submissions.filter((s) => s.managerId === currentUser.id && s.isManagerRollup && s.status === 'PENDING_APPROVAL').length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">All Wing Manager Rollups Authorized</p>
                    <p className="mt-1">No consolidated wing submissions pending executive GM review.</p>
                  </div>
                ) : (
                  submissions
                    .filter((s) => s.managerId === currentUser.id && s.isManagerRollup && s.status === 'PENDING_APPROVAL')
                    .map((sub) => (
                      <div key={sub.id} className="p-5 hover:bg-amber-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">{sub.employeeName} ({sub.employeeDesignation})</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                              {sub.kpiCode}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Awaiting GM Sign-off
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 font-medium">{sub.kpiName}</p>
                          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            {sub.notes}
                          </p>
                          <div className="text-[11px] text-slate-400">
                            Consolidated Dossier: <strong className="text-slate-700">{sub.document.fileName}</strong> ({sub.document.fileSize})
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleViewDoc(sub)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                          >
                            Inspect Dossier
                          </button>
                          <button
                            onClick={() => {
                              setApprovalError('');
                              setApprovalModalSub(sub);
                              setIsRejectMode(false);
                              setApprovalRemarks(`Executive authorization approved by ${currentUser.name} (${currentUser.designation}).`);
                            }}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Executive Sign-off</span>
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Submit Work & Upload Document */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Submit KRA Deliverable & Upload Document</h3>
              </div>
              <button onClick={() => setIsSubmitModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitWork} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Select Assigned KPI / Deliverable ({currentUser.department})
                </label>
                <select
                  required
                  value={selectedKpiId}
                  onChange={(e) => {
                    setSelectedKpiId(e.target.value);
                    const kpi = kpis.find((k) => k.id === e.target.value);
                    setTargetVal(kpi ? kpi.targetValue : '');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Choose your assigned deliverable --</option>
                  {submissionKpis.map((kpi) => (
                    <option key={kpi.id} value={kpi.id}>
                      [{kpi.kpiCode}] {kpi.name} (Target: {kpi.targetValue} {kpi.unit})
                    </option>
                  ))}
                </select>
                {submissionKpis.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">No KPIs are assigned to you. Ask the Head of Department to assign KRAs/KPIs.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Benchmark Target {selectedKpiId && `(${kpis.find((k) => k.id === selectedKpiId)?.unit})`}
                  </label>
                  <input
                    type="number"
                    disabled
                    value={targetVal}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-bold"
                  />
                  {selectedKpiId && (
                    <span className="text-[10px] text-slate-400">
                      {kpis.find((k) => k.id === selectedKpiId)?.direction.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  )}
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Achieved Output</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={achievedVal}
                    onChange={(e) => setAchievedVal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Document File Upload */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Attach Verification Document <span className="text-indigo-600 font-bold">(PDF, DOC, DOCX, PNG, JPG)</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-indigo-500 transition-all bg-slate-50">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx"
                    onChange={handleFileChange}
                    className="hidden"
                    id="doc-file-upload"
                  />
                  <label htmlFor="doc-file-upload" className="cursor-pointer block">
                    <FileUp className="w-6 h-6 text-indigo-600 mx-auto mb-1" />
                    <span className="text-xs font-bold text-slate-700 block">
                      {selectedFile ? selectedFile.name : 'Click to select verification file from device'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB • File attached`
                        : 'PDF drawings, sanction reports, PNG photos, or DOCX memos'}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Submission Notes & Description</label>
                <textarea
                  rows={3}
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarize the work done, drawings prepared, authority visits, or sanction references..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Locked Org Chart Manager Badge */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Strict Org Chart Routing (Enforced)</span>
                </div>
                <p>
                  Assigned Manager: <strong className="text-emerald-900">{reportingManager?.name || currentUser.managerName}</strong>.
                  Your uploaded document is confidential: only you, your reporting manager, the Head of Department and auditors can open it.
                </p>
              </div>

              {submitError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{submitError}</div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting ? <span>Submitting...</span> : <><Send className="w-3.5 h-3.5" /><span>Submit to Manager</span></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Document Inspector & Viewer */}
      {inspectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">{inspectingDoc.document.fileName}</h3>
                  <p className="text-[10px] text-slate-400">
                    Uploaded by {inspectingDoc.employeeName} ({inspectingDoc.employeeDesignation}) on {inspectingDoc.submittedDate}
                  </p>
                </div>
              </div>
              <button onClick={() => setInspectingDoc(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Preview Box */}
            <div className="border border-slate-200 rounded-xl p-6 bg-slate-50 min-h-[220px] flex flex-col items-center justify-center text-center">
              {['PNG', 'JPG', 'JPEG'].includes(inspectingDoc.document.fileType?.toUpperCase()) && inspectingDoc.document.fileData ? (
                <div className="space-y-3">
                  <div className="w-64 h-48 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center mx-auto overflow-hidden">
                    <img
                      src={inspectingDoc.document.fileData}
                      alt="Verification preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="text-xs font-semibold text-slate-700">Image Verification Dossier Attached</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{inspectingDoc.document.fileName}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {inspectingDoc.document.fileType} Document • {inspectingDoc.document.fileSize}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-200 w-full text-left text-xs text-slate-600">
                <span className="font-bold text-slate-700 block">Deliverable Scope:</span>
                <p className="mt-0.5">{inspectingDoc.notes || 'No notes provided.'}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Status: <strong className="text-slate-800">{inspectingDoc.status}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setInspectingDoc(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 text-xs"
                >
                  Close
                </button>
                <button
                  onClick={() => downloadDocument(inspectingDoc)}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Document</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manager Review, Remarks & Approval */}
      {approvalModalSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {isRejectMode ? (
                  <XCircle className="w-5 h-5 text-rose-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                )}
                <h3 className="text-base font-bold text-slate-900">
                  {isRejectMode ? 'Request Revision for Deliverable' : 'Approve & Award Points'}
                </h3>
              </div>
              <button
                onClick={() => setApprovalModalSub(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Employee:</span>
                  <span className="font-bold text-slate-800">{approvalModalSub.employeeName}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">KPI Code:</span>
                  <span className="font-mono font-bold text-indigo-600">{approvalModalSub.kpiCode}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">Document Attached:</span>
                  <span className="font-medium text-slate-700 truncate max-w-[200px]">
                    {approvalModalSub.document.fileName}
                  </span>
                </div>
              </div>

              {!isRejectMode ? (
                <>
                  <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200 text-xs leading-relaxed">
                    <span className="font-bold">Impact:</span> <strong>{approvalModalSub.employeeName}</strong> receives{' '}
                    <strong>{approvalModalSub.maxPoints} points</strong>
                    {approvalModalSub.isManagerRollup
                      ? ' and the consolidated wing package is authorized.'
                      : ` and ${approvalModalSub.achievedValue} ${approvalModalSub.unit} is recorded as the ${approvalModalSub.kpiCode} actual for this period.`}
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Manager Approval Remarks (Commendation)
                    </label>
                    <textarea
                      rows={2}
                      value={approvalRemarks}
                      onChange={(e) => setApprovalRemarks(e.target.value)}
                      placeholder="e.g. Excellent drawing quality. Municipal sanction criteria fully met."
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 text-rose-700">
                    Revision Reason / Required Changes
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={rejectRemarks}
                    onChange={(e) => setRejectRemarks(e.target.value)}
                    placeholder="Specify which parts of the drawing, document or calculations require revision..."
                    className="w-full px-3 py-2 border border-rose-300 rounded-xl text-slate-800"
                  />
                </div>
              )}

              {approvalError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{approvalError}</div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApprovalModalSub(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 text-xs"
              >
                Cancel
              </button>
              {isRejectMode ? (
                <button
                  type="button"
                  disabled={isProcessingApproval || !rejectRemarks.trim()}
                  onClick={handleReject}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs"
                >
                  {isProcessingApproval ? 'Sending...' : 'Confirm Rejection'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessingApproval}
                  onClick={handleApprove}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  {isProcessingApproval ? 'Approving...' : <><Check className="w-3.5 h-3.5" /><span>Confirm & Award Points</span></>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to trigger browser file download of attached deliverable
function downloadDocument(submission: KPISubmission) {
  const doc = submission.document;
  const link = document.createElement('a');

  if (doc.fileData && doc.fileData.startsWith('data:')) {
    link.href = doc.fileData;
  } else {
    // Generate text/pdf simulation download
    const content = `COMPLIANCE DEPARTMENT DELIVERABLE SUMMARY\n` +
      `VERIFIED DELIVERABLE DOCUMENT: ${doc.fileName}\n` +
      `============================================================\n` +
      `Employee: ${submission.employeeName} (${submission.employeeDesignation})\n` +
      `KRA: ${submission.kraName}\n` +
      `KPI Code: ${submission.kpiCode} - ${submission.kpiName}\n` +
      `Period: ${submission.periodId}\n` +
      `Achieved: ${submission.achievedValue} / ${submission.targetValue} ${submission.unit}\n` +
      `Approval Status: ${submission.status}\n` +
      `Points: ${submission.pointsAwarded} / ${submission.maxPoints}\n` +
      `Approved By: ${submission.approvedBy || 'Pending Manager'}\n` +
      `Approval Date: ${submission.approvedDate || 'N/A'}\n` +
      `Notes: ${submission.notes || 'None'}\n` +
      `\nSubmission reference: ${submission.id}`;
    const blob = new Blob([content], { type: 'text/plain' });
    link.href = URL.createObjectURL(blob);
  }

  link.download = doc.fileName || `Deliverable_${submission.kpiCode}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
