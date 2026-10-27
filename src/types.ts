export type UserRole =
  | 'SUPER_ADMIN'
  | 'LEGAL_HEAD'
  | 'LEGAL_MANAGER'
  | 'LEGAL_EXECUTIVE'
  | 'MANAGEMENT'
  | 'AUDITOR';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  designation: string;
  department?: string;
  wing?: 'Leadership' | 'Architecture' | 'Structural' | 'MEP' | 'Administration' | 'Audit' | 'Management' | 'Secretarial & Legal' | 'Legal';
  level?: 1 | 2 | 3;
  managerId?: string | null;
  managerName?: string | null;
  subordinateIds?: string[];
  organizationId: string;
  companyId?: string;
  avatarUrl?: string;
  phone?: string;
  activeMatters?: number;
  slaRate?: number;
  avgTAT?: string;
  status?: PerformanceStatus;
  rating?: string;
  assignedKras?: string[];
  assignedKpis?: string[];
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  industry: string;
  createdDate: string;
}

export interface Company {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  cin?: string;
  cinNumber?: string;
  incorporationDate?: string;
  active: boolean;
}

export interface Project {
  id: string;
  organizationId: string;
  companyId: string;
  name: string;
  code: string;
  location: string;
  reraRegistrationNumber?: string;
  type: 'Residential' | 'Commercial' | 'Mixed-Use' | 'Township' | 'Plotted';
  projectType?: string;
  status: 'Planning' | 'Land Acquisition' | 'Approvals' | 'Under Construction' | 'Ready for Possession' | 'Completed';
}

export interface FinancialYear {
  id: string;
  organizationId: string;
  name: string; // e.g. "FY 2026-27"
  startDate: string; // "2026-04-01"
  endDate: string; // "2027-03-31"
  isCurrent: boolean;
}

export interface PerformancePeriod {
  id: string;
  organizationId: string;
  financialYearId: string;
  name: string; // e.g. "September 2026", "Q2 FY 2026-27"
  type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  month?: number; // 1-12
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number; // 2026
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'LOCKED';
  lockedDate?: string;
  approvedBy?: string;
}

export type MeasurementType =
  | 'PERCENTAGE'
  | 'NUMBER'
  | 'CURRENCY'
  | 'DURATION'
  | 'RATIO'
  | 'BOOLEAN'
  | 'MILESTONE'
  | 'SCORE'
  | 'SLA_PERCENTAGE';

export type KPIDirection =
  | 'HIGHER_IS_BETTER'
  | 'LOWER_IS_BETTER'
  | 'TARGET_RANGE'
  | 'EXACT_TARGET';

export type CalculationMethod = 'MANUAL' | 'AUTOMATIC';

export type PerformanceStatus = 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'EXCEEDS_TARGET';

export interface KRA {
  id: string;
  organizationId: string;
  kraNumber: number; // 1 to 10+
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  weight: number; // percentage, e.g. 15 for 15%
  active: boolean;
  orderIndex: number;
  effectivePeriod?: string;
  department?: string;
  wing?: string;
}

export interface KPI {
  id: string;
  organizationId: string;
  kraId: string;
  kpiCode: string; // e.g. "K1-KPI-01"
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  department?: string;
  wing?: string;
  measurementType: MeasurementType;
  unit: string; // '%', 'days', 'cases', 'INR (Lakhs)', 'contracts'
  frequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
  direction: KPIDirection;
  calculationMethod: CalculationMethod;
  dataSource?: string; // Operational entity: "CONTRACTS", "COMPLIANCE", "LITIGATION", "NOTICES", "RISKS", "DUE_DILIGENCE", "APPROVALS", "TASKS"
  dataSourceMetric?: string;
  weight: number; // weight within its parent KRA, must sum to 100%
  minAcceptableValue?: number;
  targetValue: number;
  maxCapValue?: number; // e.g., 100% or 120% cap
  active: boolean;
  effectiveDate: string;
  endDate?: string;
}

export interface KPITarget {
  id: string;
  organizationId: string;
  kpiId: string;
  financialYearId: string;
  periodId: string;
  targetValue: number;
  companyId?: string;
  projectId?: string;
  employeeId?: string;
}

export type MeasurementApprovalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REOPENED';

export interface KPIMeasurement {
  id: string;
  organizationId: string;
  kpiId: string;
  periodId: string;
  target: number;
  actual: number;
  achievement: number; // in percentage e.g. 96.84%
  weightedScore: number; // achievement * weight / 100
  status: PerformanceStatus;
  approvalStatus: MeasurementApprovalStatus;
  calculatedAutomatically: boolean;
  isManuallyOverridden: boolean;
  originalCalculatedValue?: number;
  overrideReason?: string;
  overrideBy?: string;
  overrideDate?: string;
  rejectionReason?: string;
  submittedBy?: string;
  submittedDate?: string;
  approvedBy?: string;
  approvedDate?: string;
  comments?: string;
  evidenceCount?: number;
  companyId?: string;
  projectId?: string;
}

export interface KPIEvidence {
  id: string;
  organizationId: string;
  measurementId: string;
  kpiId: string;
  periodId: string;
  fileName: string;
  fileType: 'PDF' | 'EXCEL' | 'WORD' | 'IMAGE' | 'DOCUMENT' | 'URL';
  fileSize?: string;
  uploadedBy: string;
  uploadedDate: string;
  description: string;
  documentUrl?: string;
}

export interface KPISubmissionDocument {
  fileName: string;
  fileType: string;
  fileSize: string;
  fileData?: string;
  description?: string;
  isRestricted?: boolean;
}

export interface KPISubmission {
  id: string;
  organizationId: string;
  periodId: string;
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  kraId: string;
  kraName: string;
  employeeId: string;
  employeeName: string;
  employeeDesignation: string;
  employeeLevel: number;
  department?: string;
  wing?: string;
  managerId: string;
  managerName: string;
  achievedValue: number;
  targetValue: number;
  unit: string;
  notes: string;
  submittedDate: string;
  document: KPISubmissionDocument;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  pointsAwarded: number;
  maxPoints: number;
  approvalRemarks?: string;
  approvedBy?: string;
  approvedDate?: string;
  isManagerRollup?: boolean;
}

export interface ReportingChainMember {
  user: {
    id: string;
    name: string;
    designation: string;
    department?: string;
    wing?: string;
    level?: 1 | 2 | 3;
    role: UserRole;
  };
  relationship: 'DIRECT_MANAGER' | 'HOD' | 'EXECUTIVE';
  assignedKras: Array<{
    id: string;
    name: string;
    weight: number;
    kpis: Array<{
      id: string;
      kpiCode: string;
      name: string;
      targetValue: number;
      unit: string;
      weight: number;
      actual?: number;
      status?: string;
      submissionStatus?: 'NOT_SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
      submittedDate?: string;
      approvedDate?: string;
      documentFileName?: string;
      hasDocument?: boolean;
    }>;
  }>;
}

export interface ScoringSettings {
  maxAchievementCap: number; // default 100 or 120
  minAchievementFloor: number; // default 0
  behindThreshold: number; // default 70 (0-69 Behind)
  atRiskThreshold: number; // default 90 (70-89 At Risk)
  onTrackThreshold: number; // default 100 (90-100 On Track, >100 Exceeds)
  isWeightedFramework: boolean; // default true
  roundingDecimals: number; // default 2
  capAchievementAt100?: boolean;
  enforce100PercentWeight?: boolean;
  formulaType?: 'STANDARD_PROPORTIONAL' | 'STEPPED_SCALE' | 'POLARIZED_PENALTY';
  decimalPrecision?: number;
}

export interface ScoreBreakdownNode {
  type: 'DEPARTMENT' | 'KRA' | 'KPI';
  id: string;
  name: string;
  weight: number;
  target?: number;
  actual?: number;
  unit?: string;
  direction?: KPIDirection;
  achievement?: number;
  weightedScore?: number;
  scoreContribution: number;
  status: PerformanceStatus;
  formulaDescription?: string;
  operationalSource?: string;
  operationalMetricsSummary?: string;
  isManuallyOverridden?: boolean;
  overrideReason?: string;
  overrideBy?: string;
  hasMeasurement?: boolean;
  children?: ScoreBreakdownNode[];
}

export interface OperationalSummary {
  totalContracts: number;
  contractsWithinSLA: number;
  avgContractTAT: number;
  highRiskContracts: number;
  contractsExpiringSoon: number;

  totalCompliance: number;
  complianceCompleted: number;
  complianceOverdue: number;
  complianceOnTimeRate: number;

  activeLitigation: number;
  highRiskLitigation: number;
  totalLitigationCost: number;
  upcomingHearings: number;

  totalNotices: number;
  noticesRespondedSLA: number;
  avgNoticeResponseTAT: number;
  overdueNotices: number;

  totalRisks: number;
  highRisks: number;
  mitigatedRisks: number;

  totalDueDiligence: number;
  propertiesCleared: number;
  unresolvedDefects: number;

  totalApprovals: number;
  approvalsObtained: number;
  pendingApprovals: number;

  totalTasks: number;
  tasksCompleted: number;
  tasksOverdue: number;
  taskSLACompliance: number;

  // Compatibility aliases
  totalLitigationExposureINR?: number;
  averageContractTATDays?: number;
}

// Operational Data Sources
export interface LegalTask {
  id: string;
  organizationId: string;
  taskTitle: string;
  description: string;
  kraId?: string;
  kpiId?: string;
  legalMatter?: string;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  assigneeName?: string;
  companyId: string;
  projectId: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate: string;
  dueDate: string;
  completedDate?: string;
  targetSLADays: number;
  actualDaysTaken?: number;
  actualTATDays?: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  delayReason?: string;
  comments?: string;
}

export interface ContractRecord {
  id: string;
  organizationId: string;
  contractTitle: string;
  contractType: 'Vendor' | 'Consultant' | 'Lease' | 'Joint Venture' | 'JDA' | 'Construction' | 'Sales Agency' | 'Procurement' | string;
  companyId: string;
  projectId: string;
  counterparty: string;
  contractValueINR: number;
  receivedDate: string;
  reviewStartDate?: string;
  reviewCompletedDate?: string;
  executionDate?: string;
  expiryDate?: string;
  renewalDate?: string;
  targetSLADays: number;
  actualTATDays?: number;
  isWithinSLA?: boolean;
  assignedLawyerId: string;
  assignedLawyerName: string;
  assignedCounsel?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING_LEGAL_REVIEW' | 'IN_REVIEW' | 'PENDING_BUSINESS_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'EXPIRED' | 'TERMINATED' | string;
  documentRef?: string;
}

export interface ComplianceObligation {
  id: string;
  organizationId: string;
  requirement: string;
  regulation: string; // e.g. "RERA Sec 4(2)(l)(D)", "MOEF Environmental Clearance", "State Fire Safety Act"
  authority: string; // e.g. "MahaRERA", "Pollution Control Board", "Municipal Corporation"
  companyId: string;
  projectId: string;
  responsiblePersonId: string;
  responsiblePersonName: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME';
  dueDate: string;
  completionDate?: string;
  status: 'COMPLIANT' | 'PENDING' | 'OVERDUE' | 'WAIVED' | string;
  evidenceRef?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  penaltyRisk?: string;
}

export interface LitigationCase {
  id: string;
  organizationId: string;
  caseNumber: string;
  court: string; // e.g. "High Court of Bombay", "RERA Tribunal", "NCLT Mumbai Bench", "City Civil Court"
  caseType: 'Civil' | 'Consumer' | 'RERA Dispute' | 'Insolvency' | 'Labor' | 'Taxation' | 'Title Challenge' | string;
  parties: string; // "XYZ Developers vs State / Buyers Association"
  companyId: string;
  projectId: string;
  advocateOrFirm: string;
  externalAdvocate?: string;
  internalOwnerId: string;
  internalOwnerName: string;
  filingDate: string;
  nextHearingDate?: string;
  lastHearingDate?: string;
  actionDeadline?: string;
  caseStatus: 'ACTIVE' | 'HEARING_SCHEDULED' | 'STAY_GRANTED' | 'SETTLED' | 'DISMISSED' | 'CLOSED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedExposureINR: number;
  actualLegalCostINR: number;
}

export interface LegalNotice {
  id: string;
  organizationId: string;
  noticeType: 'Customer Complaint' | 'Regulatory Show Cause' | 'Contractor Claim' | 'Defamation' | 'Eviction' | 'Statutory Tax' | string;
  direction: 'RECEIVED' | 'SENT' | string;
  sender: string;
  recipient: string;
  senderOrRecipient?: string;
  subject?: string;
  referenceNumber?: string;
  companyId: string;
  projectId: string;
  dateReceived: string;
  responseDeadline: string;
  responseDate?: string;
  targetSLADays: number;
  actualResponseDays?: number;
  actualTATDays?: number;
  isWithinSLA?: boolean;
  assignedLawyerId: string;
  assignedLawyerName: string;
  assignedCounsel?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'UNDER_EVALUATION' | 'DRAFT_REPLY_PREPARED' | 'RESPONDED' | 'OVERDUE' | 'SETTLED' | string;
}

export interface LegalRisk {
  id: string;
  organizationId: string;
  description: string;
  companyId: string;
  projectId: string;
  kraId: string;
  riskCategory: 'Regulatory' | 'Contractual' | 'Litigation' | 'Title & Land' | 'Compliance' | 'Operational';
  probability: number; // 1 to 5
  impact: number; // 1 to 5
  riskScore: number; // 1 to 25
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mitigationPlan: string;
  ownerId: string;
  ownerName: string;
  mitigationDeadline: string;
  resolutionDate?: string;
  status: 'OPEN' | 'MITIGATION_IN_PROGRESS' | 'MITIGATED' | 'ACCEPTED';
}

export interface PropertyDueDiligence {
  id: string;
  organizationId: string;
  propertyName: string;
  propertyLocation?: string;
  companyId: string;
  projectId: string;
  location: string;
  ownerOrSeller: string;
  startDate: string;
  completionDate?: string;
  targetSLADays: number;
  actualDaysTaken?: number;
  searchPeriodYears?: number;
  encumbranceFound?: boolean;
  titleClearanceIssued?: boolean;
  assignedLawyerId: string;
  assignedLawyerName: string;
  titleStatus: 'CLEAR' | 'DEFECTIVE' | 'UNDER_VERIFICATION';
  encumbranceStatus: 'NONE' | 'MORTGAGE' | 'LITIGATION_PENDING' | 'SEARCH_IN_PROGRESS';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  defectsIdentified: number;
  defectsResolved: number;
  legalClearanceStatus: 'CLEARED' | 'CONDITIONAL_CLEARANCE' | 'REJECTED' | 'PENDING';
}

export interface ProjectApproval {
  id: string;
  organizationId: string;
  projectId: string;
  companyId: string;
  approvalType: 'Building Plan Sanction' | 'Environmental Clearance' | 'Fire NOC' | 'Height/AAI Clearance' | 'RERA Registration' | 'Tree Authority NOC' | 'Commencement Certificate' | 'Occupancy Certificate' | string;
  authority: string;
  requiredDate: string;
  applicationDate: string;
  approvalDate?: string;
  actualTATDays?: number;
  expiryDate?: string;
  responsiblePersonId: string;
  responsiblePersonName: string;
  status: 'OBTAINED' | 'APPLICATION_SUBMITTED' | 'QUERY_RAISED' | 'PENDING' | 'OVERDUE' | 'EXPIRED' | string;
  delayReason?: string;
}

export interface LegalTransaction {
  id: string;
  organizationId: string;
  transactionTitle: string;
  transactionType: 'Land Acquisition' | 'Joint Development Agreement' | 'Development Rights Purchase' | 'Long-term Commercial Lease' | 'Slum Rehabilitation Legal Transfer';
  companyId: string;
  projectId: string;
  counterparty: string;
  transactionValueINR: number;
  startDate: string;
  targetCompletionDate: string;
  actualCompletionDate?: string;
  assignedLawyerId: string;
  assignedLawyerName: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'DRAFTING' | 'NEGOTIATION' | 'STAMPING_REGISTRATION' | 'COMPLETED' | 'CANCELLED';
}

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  timestamp: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
}

export interface NotificationItem {
  id: string;
  organizationId: string;
  title: string;
  message: string;
  type: 'ALERT' | 'APPROVAL' | 'DEADLINE' | 'SLA_BREACH' | 'INFO';
  timestamp: string;
  read: boolean;
  linkTab?: string;
}

export interface PerformanceReview {
  id: string;
  organizationId: string;
  periodId: string;
  reviewerId: string;
  reviewerName: string;
  overallScore: number;
  performanceSummary: string;
  majorAchievements: string;
  identifiedProblems: string;
  reasonsForUnderperformance: string;
  correctiveActions: string;
  managementComments?: string;
  createdDate: string;
  status: 'DRAFT' | 'PUBLISHED';
}

export type ComplianceRecord = ComplianceObligation;
export type DueDiligenceRecord = PropertyDueDiligence;
export type ApprovalNOCRecord = ProjectApproval;

