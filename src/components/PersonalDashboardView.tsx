import React, { useState, useEffect, useCallback } from 'react';
import { User, KRA, KPI, PerformancePeriod, KPISubmission } from '../types';
import { api } from '../services/api';
import { DocumentViewerModal, downloadDataUrl } from './DocumentViewerModal';
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  Download,
  Eye,
  Send,
  XCircle,
  TrendingUp,
  Layers,
  Crown,
  ShieldCheck,
  Check,
  X,
  Building,
  RefreshCw,
  Info,
} from 'lucide-react';

interface PersonalDashboardViewProps {
  currentUser: User;
  allUsers: User[];
  kras: KRA[];
  kpis: KPI[];
  currentPeriod: PerformancePeriod;
  periods?: PerformancePeriod[];
  /** Approvals write KPI actuals, so department scores must be refreshed afterwards */
  onSubmissionsChanged: () => Promise<void> | void;
  /** Reports how many deliverables are waiting for this user's decision (sidebar badge) */
  onPendingCountChange?: (count: number) => void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

// Vercel functions accept request bodies up to 4.5 MB; base64 adds ~33%, so files are capped at 3 MB
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const RESTRICTED_MESSAGE =
  'Access restricted: evidence files are confidential to the submitter, their reporting manager, the Head of Department and auditors.';

export const PersonalDashboardView: React.FC<PersonalDashboardViewProps> = ({
  currentUser,
  allUsers,
  kras,
  kpis,
  currentPeriod,
  periods = [],
  onSubmissionsChanged,
  onPendingCountChange,
  notify,
}) => {
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
  const isLevel1 = currentUser.level === 1 && !isSuperAdmin;
  const isLevel2 = currentUser.level === 2;
  /** May see and decide on other people's deliverables */
  const isApprover = isSuperAdmin || isLevel1 || isLevel2;
  /** Sees every deliverable in the department (not only direct reports) */
  const seesWholeDepartment = isSuperAdmin || isLevel1;

  // All submissions this user may see, across every period (approval queues must not hide older periods)
  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);
  const [hierarchyRollup, setHierarchyRollup] = useState<any>(null);
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

  const activeDepartment = currentUser.department || 'Legal';
  const headOfDepartment = allUsers.find((u) => u.level === 1 && u.role === 'LEGAL_HEAD');
  const reportingManager = currentUser.managerId ? allUsers.find((u) => u.id === currentUser.managerId) : undefined;
  const canSubmitWork = !isSuperAdmin && Boolean(reportingManager) && currentPeriod.status !== 'LOCKED';
  const periodName = (id: string) => periods.find((p) => p.id === id)?.name || id;

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

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setIsLoading(true);
      try {
        const [allSubs, rollup] = await Promise.all([api.getSubmissions(), api.getHierarchyRollup(currentPeriod.id)]);
        setSubmissions(allSubs);
        setHierarchyRollup(rollup);
      } catch (err: any) {
        notify(err?.message || 'Failed to load your dashboard data', 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [currentPeriod.id, notify]
  );

  useEffect(() => {
    loadData();
  }, [currentUser.id, loadData]);

  // Keep queues current while the page is open (new submissions from the team appear without a reload)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadData(false);
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadData]);

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
      await loadData(false);
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openApprove = (sub: KPISubmission) => {
    setApprovalError('');
    setApprovalModalSub(sub);
    setIsRejectMode(false);
    setApprovalRemarks(
      sub.isManagerRollup
        ? `Executive authorization approved by ${currentUser.name} (${currentUser.designation}).`
        : `Verified and approved by ${currentUser.name}. Points awarded.`
    );
  };

  const openReject = (sub: KPISubmission) => {
    setApprovalError('');
    setRejectRemarks('');
    setApprovalModalSub(sub);
    setIsRejectMode(true);
  };

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
      await loadData(false);
      await onSubmissionsChanged();
    } catch (err: any) {
      setApprovalError(err.message || 'Approval failed');
    } finally {
      setIsProcessingApproval(false);
    }
  };

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
      await loadData(false);
    } catch (err: any) {
      setApprovalError(err.message || 'Rejection failed');
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleViewDoc = (sub: KPISubmission) => {
    if (sub.document?.isRestricted) {
      notify(RESTRICTED_MESSAGE, 'error');
      return;
    }
    setInspectingDoc(sub);
  };

  const handleDownloadDoc = async (sub: KPISubmission) => {
    if (sub.document?.isRestricted) {
      notify(RESTRICTED_MESSAGE, 'error');
      return;
    }
    try {
      const doc = sub.document?.hasFile ? await api.getSubmissionDocument(sub.id) : null;
      if (doc?.fileData) downloadDataUrl(doc.fileData, doc.fileName || sub.document.fileName);
      else downloadSummary(sub);
    } catch (err: any) {
      notify(err?.message || 'Could not download the document', 'error');
    }
  };

  // ---------- Derived lists ----------
  const periodSubmissions = submissions.filter((s) => s.periodId === currentPeriod.id);
  const mySubmissions = periodSubmissions.filter((s) => s.employeeId === currentUser.id);

  const decidesOn = (s: KPISubmission) => s.employeeId !== currentUser.id && (s.managerId === currentUser.id || seesWholeDepartment);

  // Everything waiting for this user's decision, from ANY period, oldest first
  const pendingForMe = submissions
    .filter((s) => s.status === 'PENDING_APPROVAL' && decidesOn(s))
    .sort((a, b) => a.submittedDate.localeCompare(b.submittedDate));

  const decidedByTeam = submissions
    .filter((s) => s.status !== 'PENDING_APPROVAL' && decidesOn(s))
    .sort((a, b) => (b.approvedDate || '').localeCompare(a.approvedDate || ''));
  const approvedForMe = decidedByTeam.filter((s) => s.status === 'APPROVED');

  useEffect(() => {
    onPendingCountChange?.(pendingForMe.length);
  }, [pendingForMe.length, onPendingCountChange]);

  const myEarnedPoints = mySubmissions.reduce((acc, s) => acc + s.pointsAwarded, 0);
  const myApprovedCount = mySubmissions.filter((s) => s.status === 'APPROVED').length;
  const myPendingCount = mySubmissions.filter((s) => s.status === 'PENDING_APPROVAL').length;

  const levelBadge = isSuperAdmin
    ? { label: 'Super Admin', bg: 'bg-rose-500/20 text-rose-200 border-rose-400/30' }
    : isLevel1
    ? { label: 'Head of Department', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
    : isLevel2
    ? { label: 'Wing Manager', bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
    : { label: 'Technical Staff', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };

  const allStaffNodes: any[] = [
    ...(hierarchyRollup?.directStaff || []),
    ...(hierarchyRollup?.managers || []).flatMap((m: any) => m.subordinates || []),
  ];
  const myRollupPercent = isLevel1 || isSuperAdmin
    ? hierarchyRollup?.head?.departmentRollupScore ?? 0
    : isLevel2
    ? hierarchyRollup?.managers?.find((m: any) => m.id === currentUser.id)?.rollupScore ?? 0
    : allStaffNodes.find((s: any) => s.id === currentUser.id)?.completionRate ?? 0;

  // ---------- Reusable pieces ----------
  const statusChip = (sub: KPISubmission) =>
    sub.status === 'APPROVED' ? (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        Approved • {sub.pointsAwarded} Pts
      </span>
    ) : sub.status === 'REJECTED' ? (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
        <XCircle className="w-3 h-3 text-rose-600" />
        Revision Requested
      </span>
    ) : (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
        <Clock className="w-3 h-3 text-amber-600" />
        Pending Approval
      </span>
    );

  const documentCard = (sub: KPISubmission) => (
    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 truncate">
        <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="truncate">
          <span className="font-semibold text-slate-800 block truncate">{sub.document.fileName}</span>
          <span className="text-[10px] text-slate-400">
            {sub.document.fileSize} • {sub.document.fileType}
            {!sub.document.hasFile && ' • no stored file'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <button
          onClick={() => handleViewDoc(sub)}
          className="px-2 py-1 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 text-[11px] font-semibold"
          title="Preview document"
        >
          <Eye className="w-3.5 h-3.5" /> View
        </button>
        <button
          onClick={() => handleDownloadDoc(sub)}
          className="p-1 hover:bg-slate-200 text-indigo-600 rounded"
          title="Download document"
          aria-label="Download document"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const renderQueueItem = (sub: KPISubmission) => (
    <div key={sub.id} className="p-4 hover:bg-indigo-50/30 transition-all space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-slate-900 text-xs">{sub.employeeName}</div>
          <div className="text-[10px] text-slate-500">
            {sub.employeeDesignation} • Submitted {sub.submittedDate} • {periodName(sub.periodId)}
          </div>
          {seesWholeDepartment && sub.managerId !== currentUser.id && (
            <div className="text-[10px] text-slate-400">Routed to: {sub.managerName}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
            {sub.kpiCode}
          </span>
          {sub.isManagerRollup && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
              <Crown className="w-3 h-3" /> Wing rollup
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-700 font-medium">{sub.kpiName}</div>
      <div className="text-[11px] text-slate-500">
        Achieved <strong className="text-slate-800">{sub.achievedValue}</strong> / target {sub.targetValue} {sub.unit}
      </div>
      {sub.notes && <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100">{sub.notes}</p>}

      {documentCard(sub)}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={() => openReject(sub)}
          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-all"
        >
          Request Revision
        </button>
        <button
          onClick={() => openApprove(sub)}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{sub.isManagerRollup ? 'Executive Sign-off' : 'Approve & Award Points'}</span>
        </button>
      </div>
    </div>
  );

  const approvalQueuePanel = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Approvals Required</span>
          </h3>
          <p className="text-[11px] text-indigo-200 mt-0.5">
            {seesWholeDepartment
              ? 'Every deliverable in the department waiting for a decision (all periods)'
              : 'Deliverables your direct reports submitted to you (all periods)'}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-900">{pendingForMe.length} Pending</span>
      </div>

      <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
        {pendingForMe.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
            <p className="font-semibold text-slate-700">Nothing waiting for your approval</p>
            <p className="text-[11px] text-slate-400 mt-0.5">New submissions appear here automatically.</p>
          </div>
        ) : (
          pendingForMe.map(renderQueueItem)
        )}
      </div>
    </div>
  );

  const progressBar = (percent: number, tone: 'emerald' | 'indigo' | 'amber' = 'emerald') => (
    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          tone === 'indigo' ? 'bg-indigo-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
        }`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Personalized Hero Banner */}
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
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${levelBadge.bg}`}>{levelBadge.label}</span>
            </div>
            <p className="text-xs text-indigo-300 font-medium mt-1">
              {currentUser.designation} • {currentUser.department}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
              <span className="font-mono text-slate-300">{currentUser.email}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => loadData(false)}
          className="relative z-10 self-start md:self-center px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5"
          title="Reload submissions and approvals"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isSuperAdmin && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-xs text-rose-900 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Super Admin account.</strong> You govern the whole system and can approve any pending deliverable, but you do
            not have personal KRAs or KPIs and do not submit deliverables yourself.
          </span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!isSuperAdmin && (
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
        )}

        {!isSuperAdmin && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">My Pending Submissions</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{myPendingCount}</div>
              <div className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Awaiting {reportingManager?.name || 'manager'} review</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
          </div>
        )}

        {isApprover && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approvals Required</div>
              <div className="text-2xl font-black text-indigo-600 mt-1">{pendingForMe.length}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                {pendingForMe.length > 0 ? 'Requires your verification' : 'All deliverables cleared'}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        )}

        {isSuperAdmin && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Decided Deliverables</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{decidedByTeam.length}</div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">{approvedForMe.length} approved</div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Hierarchy Rollup</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{isLoading ? '…' : `${myRollupPercent}%`}</div>
            <div className="text-[11px] text-indigo-600 font-semibold mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>{seesWholeDepartment || isLevel2 ? 'Team deliverables approved' : 'Your deliverables approved'} • {currentPeriod.name}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Department-Wise KRAs */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Building className="w-5 h-5 text-indigo-600 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Department-Wise KRAs: {isSuperAdmin ? 'All Departments' : activeDepartment}</h3>
              {currentUser.wing && !isSuperAdmin && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {currentUser.wing} Wing
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Completion shows the share of deliverables submitted against each KRA in {currentPeriod.name} that have been approved.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departmentKras.map((kra) => {
            const kpiItems = kpis.filter((k) => k.kraId === kra.id);
            const kraSubmissions = periodSubmissions.filter((s) => s.kraId === kra.id);
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
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono">KRA #{kra.kraNumber}</span>
                    <span className="text-[11px] font-extrabold text-indigo-600">Weight: {kra.weight}%</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 leading-snug">{kra.name}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{kra.description}</p>
                  <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-slate-400">Department Lead:</span>
                    <span className="font-semibold text-slate-800">{kra.ownerName}</span>
                  </div>
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
                            <span className="font-mono text-[10px] font-bold text-indigo-600 shrink-0">{kpi.kpiCode}</span>
                            <span className="truncate text-slate-700 font-medium">{kpi.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0 font-semibold">{(kpi.ownerName || '').split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium">
                      {kraSubmissions.length > 0
                        ? `Deliverables approved (${approvedSubs.length}/${kraSubmissions.length}):`
                        : 'No deliverables submitted yet'}
                    </span>
                    <span className="font-black text-emerald-600">{completionPercent}%</span>
                  </div>
                  {progressBar(completionPercent)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MY SUBMISSIONS */}
      {!isSuperAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className={`${isApprover ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6`}>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-indigo-600" />
                  <span>My KRA Deliverables & Document Submissions</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submit completed work with a proof document (PDF, DOC, PNG). Your reporting manager reviews it and awards points.
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
                <span className="text-[11px] text-slate-500 max-w-[240px] text-right">
                  {currentPeriod.status === 'LOCKED'
                    ? `${currentPeriod.name} is locked — submissions are closed.`
                    : 'You have no reporting manager to approve deliverables. Record KPI actuals in Reconciliation.'}
                </span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Submitted Documents ({mySubmissions.length})</span>
                <span className="text-[11px] text-slate-500">Period: {currentPeriod.name}</span>
              </div>

              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {mySubmissions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">No deliverables submitted yet for this period</p>
                    {canSubmitWork && <p className="mt-1">Click "Submit Work & Upload Doc" above to send your first deliverable.</p>}
                  </div>
                ) : (
                  mySubmissions.map((sub) => (
                    <div key={sub.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-all space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs truncate">{sub.kpiName}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{sub.kpiCode}</span>
                        {statusChip(sub)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Submitted {sub.submittedDate} to <strong className="text-slate-700">{sub.managerName}</strong> • Achieved{' '}
                        {sub.achievedValue} / target {sub.targetValue} {sub.unit}
                      </div>
                      {documentCard(sub)}
                      {sub.notes && <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">{sub.notes}</p>}
                      {sub.approvalRemarks && (
                        <p
                          className={`text-xs p-2 rounded-lg border font-medium ${
                            sub.status === 'REJECTED' ? 'text-rose-800 bg-rose-50 border-rose-100' : 'text-emerald-800 bg-emerald-50 border-emerald-100'
                          }`}
                        >
                          {sub.approvedBy ? `${sub.approvedBy}: ` : 'Manager remarks: '}
                          {sub.approvalRemarks}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {isApprover && <div className="lg:col-span-5 space-y-6">{approvalQueuePanel}</div>}
        </div>
      )}
      {/* Super Admin: no own deliverables, only the department-wide approval queue */}
      {isSuperAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">{approvalQueuePanel}</div>
          <div className="lg:col-span-5 space-y-6">
            {isApprover && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recent Decisions</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                  {decidedByTeam.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400">No approvals or revisions yet.</div>
                  ) : (
                    decidedByTeam.slice(0, 15).map((sub) => (
                      <div key={sub.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">
                            {sub.employeeName} • <span className="font-mono text-indigo-600">{sub.kpiCode}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {sub.approvedDate} by {sub.approvedBy || '—'} • {periodName(sub.periodId)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusChip(sub)}
                          <button onClick={() => handleViewDoc(sub)} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="View document">
                            <Eye className="w-3.5 h-3.5" />
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

      {/* Modal: Submit Work & Upload Document */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Submit KRA Deliverable & Upload Document</h3>
              </div>
              <button onClick={() => setIsSubmitModalOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitWork} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="submit-kpi">
                  Select Assigned KPI / Deliverable ({currentUser.department})
                </label>
                <select
                  id="submit-kpi"
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
                  <input type="number" disabled value={targetVal} className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-bold" />
                  {selectedKpiId && (
                    <span className="text-[10px] text-slate-400">
                      {kpis.find((k) => k.id === selectedKpiId)?.direction.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  )}
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1" htmlFor="achieved-value">
                    Achieved Output
                  </label>
                  <input
                    id="achieved-value"
                    type="number"
                    step="any"
                    required
                    value={achievedVal}
                    onChange={(e) => setAchievedVal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Attach Verification Document <span className="text-indigo-600 font-bold">(PDF, DOC, DOCX, XLSX, PNG, JPG — max 3 MB)</span>
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
                        ? fileBase64
                          ? `${(selectedFile.size / 1024).toFixed(1)} KB • File attached`
                          : 'Reading file…'
                        : 'PDF drawings, sanction reports, PNG photos, or DOCX memos'}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="submit-notes">
                  Submission Notes & Description
                </label>
                <textarea
                  id="submit-notes"
                  rows={3}
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarize the work done, drawings prepared, authority visits, or sanction references..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Routed to your reporting manager</span>
                </div>
                <p>
                  Approver: <strong className="text-emerald-900">{reportingManager?.name || currentUser.managerName}</strong>. Only you, your
                  reporting manager, the Head of Department, administrators and auditors can open the document.
                </p>
              </div>

              {submitError && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{submitError}</div>}

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
                  disabled={isSubmitting || (Boolean(selectedFile) && !fileBase64)}
                  className="px-5 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Submitting...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit to Manager</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Document Viewer (fetches the file from the server on open) */}
      {inspectingDoc && (
        <DocumentViewerModal
          fileName={inspectingDoc.document.fileName}
          subtitle={`Uploaded by ${inspectingDoc.employeeName} (${inspectingDoc.employeeDesignation}) on ${inspectingDoc.submittedDate} • ${inspectingDoc.kpiCode}`}
          load={async () => {
            if (!inspectingDoc.document.hasFile) {
              return { fileName: inspectingDoc.document.fileName, fileType: inspectingDoc.document.fileType, fileData: '', hasFile: false };
            }
            return api.getSubmissionDocument(inspectingDoc.id);
          }}
          details={
            <div className="flex flex-wrap justify-between gap-2">
              <span>
                <strong className="text-slate-700">Notes:</strong> {inspectingDoc.notes || 'No notes provided.'}
              </span>
              <span>
                Status: <strong className="text-slate-800">{inspectingDoc.status.replace(/_/g, ' ')}</strong>
              </span>
            </div>
          }
          onClose={() => setInspectingDoc(null)}
        />
      )}

      {/* Modal: Manager Review, Remarks & Approval */}
      {approvalModalSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {isRejectMode ? <XCircle className="w-5 h-5 text-rose-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                <h3 className="text-base font-bold text-slate-900">{isRejectMode ? 'Request Revision' : 'Approve & Award Points'}</h3>
              </div>
              <button onClick={() => setApprovalModalSub(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Employee:</span>
                  <span className="font-bold text-slate-800">{approvalModalSub.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">KPI Code:</span>
                  <span className="font-mono font-bold text-indigo-600">{approvalModalSub.kpiCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Period:</span>
                  <span className="font-medium text-slate-700">{periodName(approvalModalSub.periodId)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500">Document:</span>
                  <button
                    onClick={() => handleViewDoc(approvalModalSub)}
                    className="font-semibold text-indigo-700 hover:underline truncate max-w-[220px] flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3 shrink-0" />
                    {approvalModalSub.document.fileName}
                  </button>
                </div>
              </div>

              {!isRejectMode ? (
                <>
                  <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200 text-xs leading-relaxed">
                    <span className="font-bold">Impact:</span> <strong>{approvalModalSub.employeeName}</strong> receives{' '}
                    <strong>{approvalModalSub.maxPoints} points</strong>
                    {approvalModalSub.isManagerRollup
                      ? ' and the consolidated wing package is authorized.'
                      : ` and ${approvalModalSub.achievedValue} ${approvalModalSub.unit} is recorded as the ${approvalModalSub.kpiCode} actual for ${periodName(approvalModalSub.periodId)}.`}
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1" htmlFor="approve-remarks">
                      Approval Remarks
                    </label>
                    <textarea
                      id="approve-remarks"
                      rows={2}
                      value={approvalRemarks}
                      onChange={(e) => setApprovalRemarks(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="font-semibold block mb-1 text-rose-700" htmlFor="reject-remarks">
                    Revision Reason / Required Changes
                  </label>
                  <textarea
                    id="reject-remarks"
                    rows={3}
                    required
                    value={rejectRemarks}
                    onChange={(e) => setRejectRemarks(e.target.value)}
                    placeholder="Specify which parts of the document or figures need revision..."
                    className="w-full px-3 py-2 border border-rose-300 rounded-xl text-slate-800"
                  />
                </div>
              )}

              {approvalError && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{approvalError}</div>}
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
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs disabled:opacity-50"
                >
                  {isProcessingApproval ? 'Sending...' : 'Send Back for Revision'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessingApproval}
                  onClick={handleApprove}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isProcessingApproval ? (
                    'Approving...'
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm & Award Points</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Fallback download for records that have no stored file (sample data): a plain-text summary */
function downloadSummary(submission: KPISubmission) {
  const content =
    `COMPLIANCE DEPARTMENT DELIVERABLE SUMMARY\n` +
    `Document on record: ${submission.document.fileName} (no stored file)\n` +
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
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${submission.kpiCode}_summary.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
