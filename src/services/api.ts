import {
  Organization,
  Company,
  Project,
  User,
  FinancialYear,
  PerformancePeriod,
  KRA,
  KPI,
  KPIMeasurement,
  KPIEvidence,
  ScoringSettings,
  ScoreBreakdownNode,
  OperationalSummary,
  AuditLogEntry,
  NotificationItem,
  PerformanceReview,
  KPISubmission,
  ReportingChainMember,
} from '../types';

export interface BootstrapData {
  organization: Organization;
  allOrganizations: Organization[];
  companies: Company[];
  projects: Project[];
  users: User[];
  financialYears: FinancialYear[];
  periods: PerformancePeriod[];
  activePeriod: PerformancePeriod;
  scoringSettings: ScoringSettings;
}

export interface ScoringCalculationResponse {
  periodId: string;
  departmentSummary: {
    overallScore: number;
    status: string;
    totalKRAWeight: number;
    isKRAWeightValid: boolean;
    kraBreakdowns: Array<{
      kra: KRA;
      kraScore: number;
      weightedContribution: number;
      status: string;
      kpiCount: number;
      onTrackKpis: number;
      atRiskKpis: number;
      behindKpis: number;
    }>;
  };
  previousPeriodSummary: {
    overallScore: number;
    status: string;
    periodId: string | null;
    periodName: string | null;
  };
  scoreDiff: number;
  trend: Array<{ periodId: string; periodName: string; hasData: boolean; score: number | null }>;
  measuredKpiCount: number;
  explainabilityTree: ScoreBreakdownNode;
  operationalSummary: OperationalSummary;
}

const TOKEN_KEY = 'compliance_session_token';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const readStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    // storage blocked (sandboxed iframe / private mode) – start signed out
    return '';
  }
};

class ApiService {
  private token: string = typeof window !== 'undefined' ? readStoredToken() : '';
  private unauthorizedHandler: (() => void) | null = null;

  public setToken(token: string) {
    this.token = token;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // storage unavailable (private mode) – session lives in memory only
    }
  }

  public hasToken() {
    return Boolean(this.token);
  }

  /** Called whenever the server reports the session is no longer valid */
  public onUnauthorized(handler: () => void) {
    this.unauthorizedHandler = handler;
  }

  private clearToken() {
    this.token = '';
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  private async request<T>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && url !== '/api/auth/login') {
        this.clearToken();
        this.unauthorizedHandler?.();
      }
      throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
    }
    return data as T;
  }

  async login(email: string, password: string): Promise<{ success: boolean; user: User; token: string }> {
    const data = await this.request<{ success: boolean; user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setToken(data.token);
    return data;
  }

  async me(): Promise<User> {
    const data = await this.request<{ user: User }>('/api/auth/me');
    return data.user;
  }

  async logout() {
    if (this.token) {
      await this.request('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    }
    this.clearToken();
  }

  getAuthUsers() {
    return this.request<{ users: User[]; count: number; head: User; managers: User[]; team: User[] }>('/api/auth/users');
  }

  getBootstrap() {
    return this.request<BootstrapData>('/api/bootstrap');
  }

  getKRAs() {
    return this.request<{ kras: KRA[]; totalWeight: number; isValidTotalWeight: boolean; remainingWeight: number }>('/api/kras');
  }

  createKRA(data: Partial<KRA>) {
    return this.request<KRA>('/api/kras', { method: 'POST', body: data });
  }

  updateKRA(id: string, data: Partial<KRA> & { reason?: string }) {
    return this.request<KRA>(`/api/kras/${id}`, { method: 'PUT', body: data });
  }

  updateKRAWeights(weights: Record<string, number>, reason?: string) {
    return this.request('/api/kras/weights', { method: 'POST', body: { weights, reason } });
  }

  getKPIs(kraId?: string) {
    return this.request<KPI[]>(kraId ? `/api/kpis?kraId=${encodeURIComponent(kraId)}` : '/api/kpis');
  }

  createKPI(data: Partial<KPI>) {
    return this.request<KPI>('/api/kpis', { method: 'POST', body: data });
  }

  updateKPI(id: string, data: Partial<KPI>) {
    return this.request<KPI>(`/api/kpis/${id}`, { method: 'PUT', body: data });
  }

  calculateScoring(periodId: string) {
    return this.request<ScoringCalculationResponse>(`/api/scoring/calculate?periodId=${encodeURIComponent(periodId)}`);
  }

  getScoringSettings() {
    return this.request<ScoringSettings>('/api/scoring/settings');
  }

  updateScoringSettings(settings: Partial<ScoringSettings>) {
    return this.request<ScoringSettings>('/api/scoring/settings', { method: 'PUT', body: settings });
  }

  getMeasurements(periodId?: string) {
    return this.request<KPIMeasurement[]>(periodId ? `/api/measurements?periodId=${encodeURIComponent(periodId)}` : '/api/measurements');
  }

  updateMeasurement(data: { kpiId: string; periodId: string; actual: number; comments?: string }) {
    return this.request<KPIMeasurement>('/api/measurements', { method: 'POST', body: data });
  }

  autoCalculateAll(periodId: string) {
    return this.request<{ updatedCount: number; kpiCodes: string[]; skippedOverrides: string[] }>(
      '/api/measurements/auto-calculate-all',
      { method: 'POST', body: { periodId } }
    );
  }

  overrideMeasurement(data: { kpiId: string; periodId: string; overrideValue: number; reason: string }) {
    return this.request('/api/measurements/override', { method: 'POST', body: data });
  }

  submitPeriod(periodId: string) {
    return this.request('/api/approval/submit', { method: 'POST', body: { periodId } });
  }

  approvePeriod(periodId: string) {
    return this.request('/api/approval/approve', { method: 'POST', body: { periodId } });
  }

  rejectPeriod(periodId: string, rejectionReason: string) {
    return this.request('/api/approval/reject', { method: 'POST', body: { periodId, rejectionReason } });
  }

  reopenPeriod(periodId: string, reopenReason: string) {
    return this.request('/api/approval/reopen', { method: 'POST', body: { periodId, reopenReason } });
  }

  getEvidence(periodId?: string, kpiId?: string) {
    const params = new URLSearchParams();
    if (periodId) params.append('periodId', periodId);
    if (kpiId) params.append('kpiId', kpiId);
    const qs = params.toString();
    return this.request<KPIEvidence[]>(`/api/evidence${qs ? `?${qs}` : ''}`);
  }

  uploadEvidence(data: Partial<KPIEvidence>) {
    return this.request<KPIEvidence>('/api/evidence', { method: 'POST', body: data });
  }

  getOperationalEntity<T>(entityName: string) {
    return this.request<T[]>(`/api/operational/${entityName}`);
  }

  createOperationalEntity<T>(entityName: string, data: Partial<T>) {
    return this.request<T>(`/api/operational/${entityName}`, { method: 'POST', body: data });
  }

  getAuditLogs() {
    return this.request<AuditLogEntry[]>('/api/audit-logs');
  }

  getNotifications() {
    return this.request<NotificationItem[]>('/api/notifications');
  }

  markNotificationRead(id?: string) {
    return this.request('/api/notifications/mark-read', { method: 'POST', body: { id } });
  }

  getReviews(periodId?: string) {
    return this.request<PerformanceReview[]>(periodId ? `/api/reviews?periodId=${encodeURIComponent(periodId)}` : '/api/reviews');
  }

  createReview(data: Partial<PerformanceReview>) {
    return this.request<PerformanceReview>('/api/reviews', { method: 'POST', body: data });
  }

  getSubmissions(filter?: { employeeId?: string; managerId?: string; periodId?: string }) {
    const params = new URLSearchParams();
    if (filter?.employeeId) params.append('employeeId', filter.employeeId);
    if (filter?.managerId) params.append('managerId', filter.managerId);
    if (filter?.periodId) params.append('periodId', filter.periodId);
    const qs = params.toString();
    return this.request<KPISubmission[]>(`/api/submissions${qs ? `?${qs}` : ''}`);
  }

  createSubmission(
    data: Partial<KPISubmission> & { fileData?: string; fileName?: string; fileType?: string; fileSize?: string }
  ) {
    return this.request<KPISubmission>('/api/submissions', { method: 'POST', body: data });
  }

  approveSubmission(submissionId: string, remarks?: string) {
    return this.request<{ success: boolean; submission: KPISubmission; rolledUpKras: any[] }>(
      `/api/submissions/${submissionId}/approve`,
      { method: 'POST', body: { remarks } }
    );
  }

  rejectSubmission(submissionId: string, remarks: string) {
    return this.request<{ success: boolean; submission: KPISubmission }>(`/api/submissions/${submissionId}/reject`, {
      method: 'POST',
      body: { remarks },
    });
  }

  getHierarchyRollup(periodId?: string) {
    return this.request<any>(periodId ? `/api/hierarchy/rollup?periodId=${encodeURIComponent(periodId)}` : '/api/hierarchy/rollup');
  }

  getReportingChain(periodId?: string) {
    return this.request<ReportingChainMember[]>(
      periodId ? `/api/hierarchy/reporting-chain?periodId=${encodeURIComponent(periodId)}` : '/api/hierarchy/reporting-chain'
    );
  }

  async askAI(question: string, periodId?: string): Promise<string> {
    const data = await this.request<{ answer: string }>('/api/ai/ask', { method: 'POST', body: { question, periodId } });
    return data.answer;
  }
}

export const api = new ApiService();
