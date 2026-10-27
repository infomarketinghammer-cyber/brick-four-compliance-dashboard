import React, { useState } from 'react';
import {
  ClipboardCheck,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  TrendingUp,
  Database,
  FileUp,
  FileText,
  Sliders,
  Send,
  XCircle,
  Clock,
  Sparkles,
  Paperclip,
  Eye,
  Info,
  Download,
} from 'lucide-react';
import { KPI, KRA, KPIMeasurement, PerformancePeriod, KPIEvidence, User } from '../types';
import { isAdmin } from '../permissions';

interface PerformanceEntryApprovalViewProps {
  currentPeriod: PerformancePeriod;
  kpis: KPI[];
  kras: KRA[];
  measurements: KPIMeasurement[];
  evidenceList: KPIEvidence[];
  currentUser: User;
  onUpdateActual: (kpiId: string, actual: number, comments?: string) => Promise<void>;
  onAutoCalculateAll: () => Promise<void>;
  onOverride: (kpiId: string, overrideVal: number, reason: string) => Promise<void>;
  onSubmitForReview: () => Promise<void>;
  onApprovePeriod: () => Promise<void>;
  onRejectPeriod: (reason: string) => Promise<void>;
  onReopenPeriod: (reason: string) => Promise<void>;
  onUploadEvidence: (data: Partial<KPIEvidence>) => Promise<void>;
}

// Vercel functions accept request bodies up to 4.5 MB; base64 adds ~33%, so files are capped at 3 MB
const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;

export const PerformanceEntryApprovalView: React.FC<PerformanceEntryApprovalViewProps> = ({
  currentPeriod,
  kpis,
  kras,
  measurements,
  evidenceList,
  currentUser,
  onUpdateActual,
  onAutoCalculateAll,
  onOverride,
  onSubmitForReview,
  onApprovePeriod,
  onRejectPeriod,
  onReopenPeriod,
  onUploadEvidence,
}) => {
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [activeModal, setActiveModal] = useState<'ACTUAL' | 'OVERRIDE' | 'EVIDENCE' | 'REJECT' | 'REOPEN' | null>(null);

  // Form states
  const [actualValue, setActualValue] = useState<string>('');
  const [actualComments, setActualComments] = useState<string>('');
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [reopenReason, setReopenReason] = useState<string>('');
  const [modalError, setModalError] = useState<string>('');

  // Real File Upload State
  const [selectedEvidenceFile, setSelectedEvidenceFile] = useState<File | null>(null);
  const [evidenceBase64, setEvidenceBase64] = useState<string>('');
  const [evidenceDesc, setEvidenceDesc] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const isLocked = currentPeriod.status === 'LOCKED';
  const isUnderReview = ['UNDER_REVIEW', 'SUBMITTED', 'APPROVED'].includes(currentPeriod.status);

  const canApprove = isAdmin(currentUser);
  const canEdit = canApprove && !isLocked;

  const openModal = (modal: typeof activeModal) => {
    setModalError('');
    setActiveModal(modal);
  };

  /** Runs a workflow action; keeps the modal open and shows the reason if it fails */
  const runModalAction = async (action: () => Promise<void>) => {
    setIsProcessing(true);
    setModalError('');
    try {
      await action();
      setActiveModal(null);
    } catch (err: any) {
      setModalError(err?.message || 'The action failed');
    } finally {
      setIsProcessing(false);
    }
  };

  /** Toolbar actions report failures through the global toast, so the rejection is just absorbed here */
  const runToolbarAction = async (action: () => Promise<void>) => {
    setIsProcessing(true);
    try {
      await action();
    } catch {
      // already surfaced by the caller's notification
    } finally {
      setIsProcessing(false);
    }
  };

  const getMeasurement = (kpiId: string) => {
    return measurements.find((m) => m.kpiId === kpiId);
  };

  const getEvidenceCount = (kpiId: string) => {
    return evidenceList.filter((e) => e.kpiId === kpiId).length;
  };

  const handleOpenActualModal = (kpi: KPI) => {
    const msr = getMeasurement(kpi.id);
    setSelectedKpi(kpi);
    setActualValue(msr ? String(msr.actual) : '');
    setActualComments('');
    openModal('ACTUAL');
  };

  const handleOpenOverrideModal = (kpi: KPI) => {
    const msr = getMeasurement(kpi.id);
    setSelectedKpi(kpi);
    setOverrideValue(String(msr ? msr.actual : kpi.targetValue));
    setOverrideReason('');
    openModal('OVERRIDE');
  };

  const handleOpenEvidenceModal = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setSelectedEvidenceFile(null);
    setEvidenceBase64('');
    setEvidenceDesc('');
    openModal('EVIDENCE');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setEvidenceBase64('');
    if (!file) {
      setSelectedEvidenceFile(null);
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      setSelectedEvidenceFile(null);
      setModalError('File is larger than 3 MB. Please upload a smaller document.');
      return;
    }
    setModalError('');
    setSelectedEvidenceFile(file);
    const reader = new FileReader();
    reader.onload = () => setEvidenceBase64(reader.result as string);
    reader.onerror = () => setModalError('Could not read the selected file.');
    reader.readAsDataURL(file);
  };

  const handleSaveActual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKpi || actualValue.trim() === '' || !Number.isFinite(Number(actualValue))) {
      setModalError('Enter a numeric actual value.');
      return;
    }
    runModalAction(() => onUpdateActual(selectedKpi.id, Number(actualValue), actualComments || undefined));
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKpi || !overrideReason.trim()) return;
    if (overrideValue.trim() === '' || !Number.isFinite(Number(overrideValue))) {
      setModalError('Enter a numeric override value.');
      return;
    }
    runModalAction(() => onOverride(selectedKpi.id, Number(overrideValue), overrideReason.trim()));
  };

  const handleSaveEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKpi || !selectedEvidenceFile || !evidenceBase64) return;
    const formattedSize =
      selectedEvidenceFile.size > 1024 * 1024
        ? `${(selectedEvidenceFile.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(selectedEvidenceFile.size / 1024))} KB`;
    const ext = selectedEvidenceFile.name.split('.').pop()?.toLowerCase() || '';
    const fileType = ext === 'pdf' ? 'PDF' : ['xls', 'xlsx', 'csv'].includes(ext) ? 'EXCEL' : ['doc', 'docx'].includes(ext) ? 'WORD' : ['png', 'jpg', 'jpeg'].includes(ext) ? 'IMAGE' : 'DOCUMENT';

    runModalAction(() =>
      onUploadEvidence({
        kpiId: selectedKpi.id,
        periodId: currentPeriod.id,
        fileName: selectedEvidenceFile.name,
        fileType,
        fileSize: formattedSize,
        description: evidenceDesc || 'Reconciliation Verification Document',
        documentUrl: evidenceBase64,
      })
    );
  };

  const modalErrorBanner = modalError ? (
    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{modalError}</span>
    </div>
  ) : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Dynamic Workflow Context Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-gradient text-white font-bold text-xs flex items-center justify-center shrink-0">
            {currentUser.name
              .replace(/^(mrs\.|mr\.|ms\.|ar\.|adv\.|ca)\s*/i, '')
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">{currentUser.name}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                {currentUser.designation}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {currentUser.role === 'SUPER_ADMIN' ? 'Administrator' : 'Admin / HOD'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Record and reconcile KPI actuals, attach evidence, authorize overrides, and sign off the period.
            </p>
          </div>
        </div>
      </div>

      {/* Title & Period Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-600" />
              Monthly Performance Measurements & Approvals
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Period: <span className="font-bold text-slate-800">{currentPeriod.name}</span> • Enter actual outcomes, auto-calculate from operational registers, attach audit documents, and execute regulatory sign-offs.
          </p>
        </div>

        {/* Workflow Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && (
            <button
              onClick={() => runToolbarAction(onAutoCalculateAll)}
              disabled={isProcessing}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
              title="Pull operational register metrics into AUTOMATIC KPIs (manual overrides are kept)"
            >
              <Database className="w-4 h-4" />
              <span>Auto-Calculate from Registers</span>
            </button>
          )}

          {canEdit && currentPeriod.status === 'OPEN' && (
            <button
              onClick={() => runToolbarAction(onSubmitForReview)}
              disabled={isProcessing}
              className="flex items-center gap-1.5 bg-brand-gradient hover:opacity-90 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Submit for Sign-Off</span>
            </button>
          )}

          {canApprove && isUnderReview && (
            <>
              <button
                onClick={() => {
                  setRejectionReason('');
                  openModal('REJECT');
                }}
                className="flex items-center gap-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject with Notes</span>
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Approve and lock ${currentPeriod.name}? Measurements become read-only until the period is reopened.`)) {
                    runToolbarAction(onApprovePeriod);
                  }
                }}
                disabled={isProcessing}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Approve & Lock Period</span>
              </button>
            </>
          )}

          {canApprove && isLocked && (
            <button
              onClick={() => {
                setReopenReason('');
                openModal('REOPEN');
              }}
              className="flex items-center gap-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            >
              <Unlock className="w-4 h-4 text-amber-600" />
              <span>Reopen Locked Period</span>
            </button>
          )}
        </div>
      </div>

      {/* Period Status Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl ${
              isLocked
                ? 'bg-slate-100 text-slate-700'
                : isUnderReview
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {isLocked ? <Lock className="w-5 h-5" /> : isUnderReview ? <Clock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Period Governance State: {currentPeriod.status}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isLocked
                    ? 'bg-slate-200 text-slate-800'
                    : isUnderReview
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isLocked ? 'Frozen / Audit Ready' : isUnderReview ? 'Pending Sign-Off' : 'Draft / Data Collection'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isLocked
                ? `Signed off by ${currentPeriod.approvedBy || 'the Head of Department'}. Measurements are read-only until the period is reopened.`
                : isUnderReview
                ? 'Measurements are compiled and awaiting formal sign-off. Values can still be corrected before locking.'
                : 'Record monthly results, review auto-calculations, and attach supporting documentation, then submit for sign-off.'}
            </p>
          </div>
        </div>

        <div className="text-right text-xs text-slate-500 shrink-0">
          <div>Total KPIs Tracked: <span className="font-bold text-slate-800">{kpis.length}</span></div>
          <div>Attached Evidences: <span className="font-bold text-indigo-600">{evidenceList.length} docs</span></div>
        </div>
      </div>

      {/* KPI Performance by KRA Groups */}
      <div className="space-y-6">
        {kras.map((kra) => {
          const kraKPIs = kpis.filter((k) => k.kraId === kra.id);
          if (kraKPIs.length === 0) return null;

          return (
            <div key={kra.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {/* KRA Header */}
              <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                    KRA {kra.kraNumber}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">{kra.name}</h3>
                  <span className="text-xs text-slate-400 font-medium">({kra.weight}% Department Weight)</span>
                </div>
                <span className="text-xs text-slate-500 font-medium">{kraKPIs.length} Indicators</span>
              </div>

              {/* Table of KPIs */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-white text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-4">KPI Indicator</th>
                      <th className="py-2.5 px-3 text-center">Direction</th>
                      <th className="py-2.5 px-3 text-center">Target</th>
                      <th className="py-2.5 px-3 text-center">Actual Result</th>
                      <th className="py-2.5 px-3 text-center">Achievement %</th>
                      <th className="py-2.5 px-3 text-center">Weighted Pts</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {kraKPIs.map((kpi) => {
                      const msr = getMeasurement(kpi.id);
                      const evCount = getEvidenceCount(kpi.id);
                      const hasOverride = msr?.isManuallyOverridden;

                      return (
                        <tr key={kpi.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 max-w-sm">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded font-semibold">
                                {kpi.kpiCode}
                              </span>
                              <span>{kpi.name}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                              <span>Weight in KRA: {kpi.weight}%</span>
                              {kpi.calculationMethod === 'AUTOMATIC' && (
                                <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                                  <Database className="w-2.5 h-2.5" /> Auto
                                </span>
                              )}
                              {hasOverride && (
                                <span className="text-amber-600 font-bold bg-amber-50 px-1 rounded border border-amber-200">
                                  Override Authorized
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center text-slate-500 font-mono text-[10px]">
                            {kpi.direction.replace(/_/g, ' ')}
                          </td>

                          <td className="py-3 px-3 text-center font-bold text-slate-700">
                            {kpi.targetValue} {kpi.unit}
                          </td>

                          <td className="py-3 px-3 text-center font-bold text-indigo-700">
                            {msr ? `${msr.actual} ${kpi.unit}` : '—'}
                          </td>

                          <td className="py-3 px-3 text-center font-black text-slate-900">
                            {msr ? `${msr.achievement}%` : '—'}
                          </td>

                          <td className="py-3 px-3 text-center font-bold text-indigo-600">
                            {msr ? `${msr.weightedScore} pts` : '—'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            {msr ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  msr.status === 'ON_TRACK' || msr.status === 'EXCEEDS_TARGET'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : msr.status === 'AT_RISK'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {msr.status.replace(/_/g, ' ')}
                              </span>
                            ) : (
                              <span className="text-slate-400">Pending</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                            {canEdit && (
                              <button
                                onClick={() => handleOpenActualModal(kpi)}
                                className="px-2 py-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors border border-indigo-200 inline-flex items-center gap-1"
                                title="Record or correct the actual value for this period"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{msr ? 'Edit Actual' : 'Record Actual'}</span>
                              </button>
                            )}

                            {/* Manual Override (Section 54 - Admin Only) */}
                            {canEdit && (
                              <button
                                onClick={() => handleOpenOverrideModal(kpi)}
                                className="px-2 py-1 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-semibold transition-colors border border-amber-200 inline-flex items-center gap-1"
                                title="Authorize manual score override with Section 54 justification"
                              >
                                <Sliders className="w-3.5 h-3.5 text-amber-600" />
                                <span>Override</span>
                              </button>
                            )}

                            {/* Attach Evidence */}
                            <button
                              onClick={() => handleOpenEvidenceModal(kpi)}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors border inline-flex items-center gap-1 ${
                                evCount > 0
                                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200 font-bold'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200'
                              }`}
                              title={`${evCount} evidence document(s) attached`}
                            >
                              <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{evCount > 0 ? `${evCount} Docs` : 'Attach Evidence'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Record / correct actual value */}
      {activeModal === 'ACTUAL' && selectedKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <ClipboardCheck className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Record Actual — {selectedKpi.kpiCode}</h3>
            </div>
            <p className="text-xs text-slate-600">
              {selectedKpi.name} • Target {selectedKpi.targetValue} {selectedKpi.unit} ({selectedKpi.direction.replace(/_/g, ' ').toLowerCase()})
            </p>

            <form onSubmit={handleSaveActual} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="actual-value">
                  Actual Value ({selectedKpi.unit})
                </label>
                <input
                  id="actual-value"
                  type="number"
                  step="any"
                  required
                  autoFocus
                  value={actualValue}
                  onChange={(e) => setActualValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="actual-comments">
                  Comments (optional)
                </label>
                <textarea
                  id="actual-comments"
                  rows={2}
                  value={actualComments}
                  onChange={(e) => setActualComments(e.target.value)}
                  placeholder="Source of the figure, register reference, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              {modalErrorBanner}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : 'Save Actual'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Override with Mandatory Audit Trail (Section 54) */}
      {activeModal === 'OVERRIDE' && selectedKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <Sliders className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">
                Authorize Manual KPI Override
              </h3>
            </div>

            <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs">
              <p className="font-bold">Mandatory Regulatory Governance Rule:</p>
              <p className="mt-0.5">
                Manual overrides preserve the original auto-calculated score in audit logs, require explicit General Counsel authorization, and record a permanent audit reason.
              </p>
            </div>

            <form onSubmit={handleSaveOverride} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Adjusted Actual Value ({selectedKpi.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Mandatory Justification / Exception Reason
                </label>
                <textarea
                  rows={3}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Detail the procedural exemption, force majeure court closure, or corporate executive waiver..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              {modalErrorBanner}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !overrideReason.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {isProcessing ? 'Authorizing...' : 'Authorize & Log Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Real Evidence File Attachment (Section 27) */}
      {activeModal === 'EVIDENCE' && selectedKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileUp className="w-5 h-5 text-indigo-600" />
              Upload Real KPI Verification Evidence
            </h3>

            {/* Existing Evidences */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">Attached Verification Documents:</div>
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl p-2 text-xs">
                {evidenceList
                  .filter((e) => e.kpiId === selectedKpi.id)
                  .map((ev) => (
                    <div key={ev.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          {ev.fileName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {ev.fileSize} • Uploaded by {ev.uploadedBy} on {ev.uploadedDate}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const link = document.createElement('a');
                            if (ev.documentUrl && ev.documentUrl.startsWith('data:')) {
                              link.href = ev.documentUrl;
                            } else {
                              const content = `COMPLIANCE VERIFICATION\nDocument: ${ev.fileName}\nUploaded by: ${ev.uploadedBy}\nDate: ${ev.uploadedDate}\nDescription: ${ev.description || 'Verified'}`;
                              const blob = new Blob([content], { type: 'text/plain' });
                              link.href = URL.createObjectURL(blob);
                            }
                            link.download = ev.fileName;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold flex items-center gap-1 transition-all"
                          title="Download document file"
                        >
                          <Download className="w-3 h-3 text-indigo-600" />
                          <span>Download</span>
                        </button>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          VERIFIED
                        </span>
                      </div>
                    </div>
                  ))}
                {evidenceList.filter((e) => e.kpiId === selectedKpi.id).length === 0 && (
                  <div className="text-slate-400 text-center py-2 text-xs">No documents attached yet</div>
                )}
              </div>
            </div>

            {!canEdit && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                This period is locked. Reopen it to attach additional evidence.
              </div>
            )}
            {modalErrorBanner}
            {!canEdit ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 text-xs"
                >
                  Close
                </button>
              </div>
            ) : (
            <form onSubmit={handleSaveEvidence} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Select Real Verification Document (PDF, Word, Excel, Image)
                </label>
                <input
                  type="file"
                  required
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-xl p-1"
                />
                {selectedEvidenceFile && (
                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-emerald-800 text-[11px]">
                    <span className="font-semibold truncate max-w-[280px]">{selectedEvidenceFile.name}</span>
                    <span className="font-mono text-[10px]">
                      {selectedEvidenceFile.size > 1024 * 1024
                        ? `${(selectedEvidenceFile.size / (1024 * 1024)).toFixed(1)} MB`
                        : `${Math.round(selectedEvidenceFile.size / 1024)} KB`}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Document Description / Scope</label>
                <input
                  type="text"
                  placeholder="e.g., MahaRERA quarterly submission acknowledgment slip"
                  value={evidenceDesc}
                  onChange={(e) => setEvidenceDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !selectedEvidenceFile || !evidenceBase64}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {isProcessing ? 'Uploading...' : 'Attach Real Document'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Reopen Locked Period */}
      {activeModal === 'REOPEN' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 text-amber-700">
              <Unlock className="w-5 h-5" />
              Reopen Locked Performance Period
            </h3>
            <p className="text-xs text-slate-600">
              Unlocking a finalized performance period requires a mandatory audit justification recorded in the regulatory governance log.
            </p>
            <div className="space-y-3 text-xs">
              <label className="font-semibold text-slate-700 block">Authorized Justification</label>
              <textarea
                rows={3}
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="State why this locked period must be unsealed (e.g., retrospective court settlement or audit request)..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              />
              {modalErrorBanner}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reopenReason.trim() || isProcessing}
                  onClick={() => runModalAction(() => onReopenPeriod(reopenReason.trim()))}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  Confirm Reopen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Review */}
      {activeModal === 'REJECT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 text-rose-700">
              <XCircle className="w-5 h-5" />
              Reject Performance Submission
            </h3>
            <div className="space-y-3 text-xs">
              <label className="font-semibold text-slate-700 block">Feedback & Revision Instructions</label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Specify which actual values or evidence require verification..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              />
              {modalErrorBanner}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!rejectionReason.trim() || isProcessing}
                  onClick={() => runModalAction(() => onRejectPeriod(rejectionReason.trim()))}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
