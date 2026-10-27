import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { KRAFrameworkView } from './components/KRAFrameworkView';
import { KPIManagementView } from './components/KPIManagementView';
import { PerformanceEntryApprovalView } from './components/PerformanceEntryApprovalView';
import { OperationalRegistersView } from './components/OperationalRegistersView';
import { ManagementExecutiveView } from './components/ManagementExecutiveView';
import { ProjectEntityView } from './components/ProjectEntityView';
import { EmployeePerformanceView } from './components/EmployeePerformanceView';
import { ReviewsView } from './components/ReviewsView';
import { ReportsExportView } from './components/ReportsExportView';
import { AuditLogView } from './components/AuditLogView';
import { SettingsView } from './components/SettingsView';
import { ScoreExplainabilityModal } from './components/ScoreExplainabilityModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { LoginView } from './components/LoginView';
import { PersonalDashboardView } from './components/PersonalDashboardView';
import { api, BootstrapData, ScoringCalculationResponse } from './services/api';
import { canAccessTab, isAdmin, isReadOnlyViewer } from './permissions';
import {
  KRA,
  KPI,
  User,
  KPIMeasurement,
  KPIEvidence,
  PerformancePeriod,
  ScoreBreakdownNode,
  ScoringSettings,
  ContractRecord,
  ComplianceRecord,
  LitigationCase,
  LegalNotice,
  LegalRisk,
  DueDiligenceRecord,
  ApprovalNOCRecord,
  LegalTask,
  AuditLogEntry,
  NotificationItem,
  PerformanceReview,
} from './types';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [activeTab, setActiveTab] = useState<string>('personal_dashboard');
  const [currentPeriodId, setCurrentPeriodId] = useState<string>('period-2026-09');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Core Data Lists
  const [kras, setKras] = useState<KRA[]>([]);
  const [totalKRAWeight, setTotalKRAWeight] = useState<number>(100);
  const [isValidWeight, setIsValidWeight] = useState<boolean>(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [measurements, setMeasurements] = useState<KPIMeasurement[]>([]);
  const [evidenceList, setEvidenceList] = useState<KPIEvidence[]>([]);
  const [scoringData, setScoringData] = useState<ScoringCalculationResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);

  // Operational Lists
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [compliances, setCompliances] = useState<ComplianceRecord[]>([]);
  const [litigations, setLitigations] = useState<LitigationCase[]>([]);
  const [notices, setNotices] = useState<LegalNotice[]>([]);
  const [risks, setRisks] = useState<LegalRisk[]>([]);
  const [dueDiligences, setDueDiligences] = useState<DueDiligenceRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalNOCRecord[]>([]);
  const [tasks, setTasks] = useState<LegalTask[]>([]);

  // Modal States
  const [inspectedNode, setInspectedNode] = useState<ScoreBreakdownNode | null>(null);
  const [isExplainModalOpen, setIsExplainModalOpen] = useState<boolean>(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');

  const notify = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);

  const canSeeAudit = (user: User | null) => isAdmin(user) || isReadOnlyViewer(user);

  const loadAuditLogs = async (user: User | null = currentUser) => {
    if (!canSeeAudit(user)) return;
    setAuditLogs(await api.getAuditLogs());
  };

  // Initial Data Bootstrap (runs only for an authenticated session)
  const loadData = useCallback(async (user: User) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const bData = await api.getBootstrap();
      setBootstrap(bData);
      const periodId = bData.activePeriod?.id || 'period-2026-09';
      setCurrentPeriodId(periodId);

      const [kraRes, kpisRes, msrRes, calcRes, evRes, notifsRes, revRes] = await Promise.all([
        api.getKRAs(),
        api.getKPIs(),
        api.getMeasurements(periodId),
        api.calculateScoring(periodId),
        api.getEvidence(periodId),
        api.getNotifications(),
        api.getReviews(),
      ]);
      setKras(kraRes.kras);
      setTotalKRAWeight(kraRes.totalWeight);
      setIsValidWeight(kraRes.isValidTotalWeight);
      setKpis(kpisRes);
      setMeasurements(msrRes);
      setScoringData(calcRes);
      setEvidenceList(evRes);
      setNotifications(notifsRes);
      setReviews(revRes);

      if (canSeeAudit(user)) {
        setAuditLogs(await api.getAuditLogs());
      }

      const [cRes, cmpRes, litRes, nRes, rRes, ddRes, aRes, tRes] = await Promise.all([
        api.getOperationalEntity<ContractRecord>('contracts'),
        api.getOperationalEntity<ComplianceRecord>('compliances'),
        api.getOperationalEntity<LitigationCase>('litigations'),
        api.getOperationalEntity<LegalNotice>('notices'),
        api.getOperationalEntity<LegalRisk>('risks'),
        api.getOperationalEntity<DueDiligenceRecord>('dueDiligences'),
        api.getOperationalEntity<ApprovalNOCRecord>('approvals'),
        api.getOperationalEntity<LegalTask>('tasks'),
      ]);

      setContracts(cRes);
      setCompliances(cmpRes);
      setLitigations(litRes);
      setNotices(nRes);
      setRisks(rRes);
      setDueDiligences(ddRes);
      setApprovals(aRes);
      setTasks(tRes);
    } catch (err: any) {
      console.error('Failed to bootstrap KRA/KPI system:', err);
      setLoadError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetSession = useCallback(() => {
    setCurrentUser(null);
    setBootstrap(null);
    setScoringData(null);
    setAuditLogs([]);
    setActiveTab('personal_dashboard');
  }, []);

  // Restore an existing session on page load; any 401 later sends the user back to the login screen
  useEffect(() => {
    api.onUnauthorized(() => {
      resetSession();
    });

    (async () => {
      if (api.hasToken()) {
        try {
          const user = await api.me();
          setCurrentUser(user);
          await loadData(user);
        } catch {
          resetSession();
        }
      }
      setIsCheckingSession(false);
    })();
  }, [loadData, resetSession]);

  // Recalculate when period changes
  const handleSelectPeriod = async (periodId: string) => {
    setCurrentPeriodId(periodId);
    try {
      const [msrRes, calcRes, evRes] = await Promise.all([
        api.getMeasurements(periodId),
        api.calculateScoring(periodId),
        api.getEvidence(periodId),
      ]);
      setMeasurements(msrRes);
      setScoringData(calcRes);
      setEvidenceList(evRes);
    } catch (err: any) {
      notify(err.message || 'Failed to load the selected period', 'error');
    }
  };

  const refreshCalculations = async (periodId: string = currentPeriodId) => {
    const [calcRes, msrRes, evRes] = await Promise.all([
      api.calculateScoring(periodId),
      api.getMeasurements(periodId),
      api.getEvidence(periodId),
    ]);
    setScoringData(calcRes);
    setMeasurements(msrRes);
    setEvidenceList(evRes);
    await loadAuditLogs();
  };

  const refreshKRAs = async () => {
    const kraRes = await api.getKRAs();
    setKras(kraRes.kras);
    setTotalKRAWeight(kraRes.totalWeight);
    setIsValidWeight(kraRes.isValidTotalWeight);
  };

  const refreshBootstrap = async () => {
    setBootstrap(await api.getBootstrap());
  };

  /** Runs a mutation, refreshes dependent data, and reports the outcome. Re-throws so modals can stay open on failure. */
  const runAction = async (action: () => Promise<unknown>, successMessage: string, after?: () => Promise<void>) => {
    try {
      await action();
      if (after) await after();
      notify(successMessage);
    } catch (err: any) {
      notify(err?.message || 'The action failed', 'error');
      throw err;
    }
  };

  // KRA Weight Updates
  const handleSaveWeights = (weights: Record<string, number>, reason: string) =>
    runAction(() => api.updateKRAWeights(weights, reason), 'KRA weights saved', async () => {
      await refreshKRAs();
      await refreshCalculations();
    });

  const handleCreateKRA = (data: Partial<KRA>) =>
    runAction(() => api.createKRA(data), 'KRA created — rebalance weights to 100%', async () => {
      await refreshKRAs();
      await refreshCalculations();
    });

  const handleUpdateKRA = (id: string, data: Partial<KRA>) =>
    runAction(() => api.updateKRA(id, data), 'KRA updated', async () => {
      await refreshKRAs();
      await refreshCalculations();
    });

  // Route guard: never render a tab the signed-in role is not allowed to use
  useEffect(() => {
    if (currentUser && !canAccessTab(currentUser, activeTab)) {
      setActiveTab('personal_dashboard');
    }
  }, [currentUser, activeTab]);

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    setActiveTab('personal_dashboard');
    await loadData(user);
  };

  const handleLogout = async () => {
    await api.logout();
    resetSession();
  };

  // KPI Actions
  const handleCreateKPI = (data: Partial<KPI>) =>
    runAction(() => api.createKPI(data), 'KPI created', async () => {
      setKpis(await api.getKPIs());
      await refreshCalculations();
    });

  const handleUpdateKPI = (id: string, data: Partial<KPI>) =>
    runAction(() => api.updateKPI(id, data), 'KPI updated', async () => {
      setKpis(await api.getKPIs());
      await refreshCalculations();
    });

  // Measurement Actions
  const handleUpdateActual = (kpiId: string, actual: number, comments?: string) =>
    runAction(
      () => api.updateMeasurement({ kpiId, periodId: currentPeriodId, actual, comments }),
      'Actual value recorded',
      () => refreshCalculations()
    );

  const handleAutoCalculateAll = async () => {
    let summary = '';
    await runAction(
      async () => {
        const res = await api.autoCalculateAll(currentPeriodId);
        summary = `Auto-calculated ${res.updatedCount} KPIs from registers` +
          (res.skippedOverrides.length ? ` (kept ${res.skippedOverrides.length} manual overrides)` : '');
      },
      'Auto-calculation complete',
      () => refreshCalculations()
    );
    if (summary) notify(summary);
  };

  const handleOverride = (kpiId: string, overrideVal: number, reason: string) =>
    runAction(
      () => api.overrideMeasurement({ kpiId, periodId: currentPeriodId, overrideValue: overrideVal, reason }),
      'Override authorized and logged',
      () => refreshCalculations()
    );

  // Workflow Sign-Offs
  const afterPeriodChange = async () => {
    await refreshBootstrap();
    await refreshCalculations();
  };

  const handleSubmitForReview = () =>
    runAction(() => api.submitPeriod(currentPeriodId), 'Period submitted for review', afterPeriodChange);

  const handleApprovePeriod = () =>
    runAction(() => api.approvePeriod(currentPeriodId), 'Period approved and locked', afterPeriodChange);

  const handleRejectPeriod = (reason: string) =>
    runAction(() => api.rejectPeriod(currentPeriodId, reason), 'Period sent back for revision', afterPeriodChange);

  const handleReopenPeriod = (reason: string) =>
    runAction(() => api.reopenPeriod(currentPeriodId, reason), 'Period reopened', afterPeriodChange);

  // Evidence
  const handleUploadEvidence = (data: Partial<KPIEvidence>) =>
    runAction(() => api.uploadEvidence(data), 'Evidence attached', async () => {
      setEvidenceList(await api.getEvidence(currentPeriodId));
      await loadAuditLogs();
    });

  // Operational Record Creation
  const operationalSetters: Record<string, (rows: any[]) => void> = {
    contracts: setContracts,
    compliances: setCompliances,
    litigations: setLitigations,
    notices: setNotices,
    risks: setRisks,
    dueDiligences: setDueDiligences,
    approvals: setApprovals,
    tasks: setTasks,
  };

  const handleAddOperationalRecord = (entity: string, data: any) =>
    runAction(() => api.createOperationalEntity(entity, data), 'Record added to register', async () => {
      operationalSetters[entity]?.(await api.getOperationalEntity<any>(entity));
      await refreshCalculations();
    });

  // Performance Review
  const handleAddReview = (data: Partial<PerformanceReview>) =>
    runAction(() => api.createReview(data), 'Review published', async () => {
      setReviews(await api.getReviews());
      await loadAuditLogs();
    });

  // Settings
  const handleSaveSettings = (newSettings: Partial<ScoringSettings>) =>
    runAction(() => api.updateScoringSettings(newSettings), 'Scoring settings saved', async () => {
      await refreshBootstrap();
      await refreshCalculations();
    });

  // Notifications
  const handleOpenNotification = async (n: NotificationItem) => {
    try {
      if (!n.read) {
        await api.markNotificationRead(n.id);
        setNotifications(await api.getNotifications());
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
    const tabAlias: Record<string, string> = { approvals: 'measurements' };
    const target = n.linkTab ? tabAlias[n.linkTab] || n.linkTab : '';
    if (target && canAccessTab(currentUser, target)) setActiveTab(target);
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.markNotificationRead();
      setNotifications(await api.getNotifications());
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Inspect Explainability Node
  const handleInspectNode = (node: ScoreBreakdownNode) => {
    setInspectedNode(node);
    setIsExplainModalOpen(true);
  };

  const currentPeriod: PerformancePeriod =
    bootstrap?.periods.find((p) => p.id === currentPeriodId) ||
    bootstrap?.activePeriod || {
      id: 'period-2026-09',
      organizationId: 'org-apex-01',
      financialYearId: 'fy-2026-27',
      name: 'September 2026',
      type: 'MONTHLY',
      year: 2026,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      status: 'UNDER_REVIEW',
    };

  const toastStack = (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2 max-w-sm" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
            t.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {t.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  if (isCheckingSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginView onLoginSuccess={handleLoginSuccess} />
        {toastStack}
      </>
    );
  }

  const users = bootstrap?.users || [];

  return (
    <div className="h-screen max-h-screen bg-slate-50 flex text-slate-800 font-sans antialiased overflow-hidden">
      {/* Left Sidebar - Full Height */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        totalKRAWeight={totalKRAWeight}
        isValidWeight={isValidWeight}
        currentUser={currentUser}
        pendingApprovalsCount={currentPeriod.status === 'UNDER_REVIEW' ? 1 : 0}
      />

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header
          periods={bootstrap?.periods || []}
          currentPeriodId={currentPeriodId}
          onSelectPeriod={handleSelectPeriod}
          currentUser={currentUser}
          onLogout={handleLogout}
          notifications={notifications}
          onOpenNotification={handleOpenNotification}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onOpenAIAssistant={() => setIsAIModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto min-h-0 pb-12">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center min-h-[500px]">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-600 mt-4">Initializing Compliance KRA Engine...</p>
            </div>
          ) : loadError ? (
            <div className="p-12 flex flex-col items-center justify-center min-h-[400px] text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-600" />
              <p className="text-sm font-semibold text-slate-800">{loadError}</p>
              <button
                onClick={() => loadData(currentUser)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'personal_dashboard' && (
                <PersonalDashboardView
                  currentUser={currentUser}
                  allUsers={users}
                  kras={kras}
                  kpis={kpis}
                  currentPeriod={currentPeriod}
                  onSubmissionsChanged={() => refreshCalculations()}
                  notify={notify}
                />
              )}

              {activeTab === 'dashboard' && (
                <DashboardView
                  scoringData={scoringData}
                  settings={bootstrap?.scoringSettings}
                  currentPeriod={currentPeriod}
                  financialYearName={bootstrap?.financialYears.find((f) => f.id === currentPeriod.financialYearId)?.name}
                  onInspectNode={handleInspectNode}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'kras' && (
                <KRAFrameworkView
                  kras={kras}
                  users={users}
                  canManage={isAdmin(currentUser)}
                  onSaveWeights={handleSaveWeights}
                  onCreateKRA={handleCreateKRA}
                  onUpdateKRA={handleUpdateKRA}
                />
              )}

              {activeTab === 'kpis' && (
                <KPIManagementView
                  kpis={kpis}
                  kras={kras}
                  users={users}
                  canManage={isAdmin(currentUser)}
                  onCreateKPI={handleCreateKPI}
                  onUpdateKPI={handleUpdateKPI}
                />
              )}

              {activeTab === 'measurements' && (
                <PerformanceEntryApprovalView
                  currentPeriod={currentPeriod}
                  kpis={kpis}
                  kras={kras}
                  measurements={measurements}
                  evidenceList={evidenceList}
                  currentUser={currentUser}
                  onUpdateActual={handleUpdateActual}
                  onAutoCalculateAll={handleAutoCalculateAll}
                  onOverride={handleOverride}
                  onSubmitForReview={handleSubmitForReview}
                  onApprovePeriod={handleApprovePeriod}
                  onRejectPeriod={handleRejectPeriod}
                  onReopenPeriod={handleReopenPeriod}
                  onUploadEvidence={handleUploadEvidence}
                />
              )}

              {activeTab === 'operations' && (
                <OperationalRegistersView
                  contracts={contracts}
                  compliances={compliances}
                  litigations={litigations}
                  notices={notices}
                  risks={risks}
                  dueDiligences={dueDiligences}
                  approvals={approvals}
                  tasks={tasks}
                  projects={bootstrap?.projects || []}
                  companies={bootstrap?.companies || []}
                  users={users}
                  kras={kras}
                  currentUser={currentUser}
                  onAddRecord={handleAddOperationalRecord}
                />
              )}

              {activeTab === 'management' && (
                <ManagementExecutiveView
                  scoringData={scoringData}
                  currentPeriod={currentPeriod}
                  settings={bootstrap?.scoringSettings}
                  litigations={litigations}
                  risks={risks}
                  contracts={contracts}
                  compliances={compliances}
                  dueDiligences={dueDiligences}
                  projects={bootstrap?.projects || []}
                  latestReview={reviews.find((r) => r.periodId === currentPeriodId)}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'projects' && (
                <ProjectEntityView
                  projects={bootstrap?.projects || []}
                  companies={bootstrap?.companies || []}
                  contracts={contracts}
                  compliances={compliances}
                  litigations={litigations}
                  notices={notices}
                  risks={risks}
                  dueDiligences={dueDiligences}
                  approvals={approvals}
                />
              )}

              {activeTab === 'employees' && (
                <EmployeePerformanceView users={users} currentUser={currentUser} currentPeriod={currentPeriod} kpis={kpis} />
              )}

              {activeTab === 'reviews' && (
                <ReviewsView
                  reviews={reviews}
                  periods={bootstrap?.periods || []}
                  currentPeriod={currentPeriod}
                  currentScore={scoringData?.departmentSummary.overallScore}
                  settings={bootstrap?.scoringSettings}
                  canPublish={isAdmin(currentUser)}
                  onAddReview={handleAddReview}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsExportView
                  organizationName={bootstrap?.organization.name || ''}
                  currentPeriod={currentPeriod}
                  kras={kras}
                  kpis={kpis}
                  measurements={measurements}
                  scoringData={scoringData}
                  settings={bootstrap?.scoringSettings}
                  contracts={contracts}
                  compliances={compliances}
                  litigations={litigations}
                  notices={notices}
                  dueDiligences={dueDiligences}
                  approvals={approvals}
                  tasks={tasks}
                  projects={bootstrap?.projects || []}
                  auditLogs={auditLogs}
                  canSeeAudit={canSeeAudit(currentUser)}
                />
              )}

              {activeTab === 'audit' && <AuditLogView logs={auditLogs} />}

              {activeTab === 'settings' && bootstrap && (
                <SettingsView settings={bootstrap.scoringSettings} onSaveSettings={handleSaveSettings} />
              )}
            </>
          )}
        </main>
      </div>

      <ScoreExplainabilityModal
        isOpen={isExplainModalOpen}
        onClose={() => setIsExplainModalOpen(false)}
        node={inspectedNode}
        currentPeriodName={currentPeriod.name}
      />

      <AIAssistantModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        periodId={currentPeriodId}
        periodName={currentPeriod.name}
        organizationName={bootstrap?.organization.name || ''}
      />


      {toastStack}
    </div>
  );
}
