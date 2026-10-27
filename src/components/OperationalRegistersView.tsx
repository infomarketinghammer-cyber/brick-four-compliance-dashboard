import React, { useMemo, useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Scale,
  Mail,
  AlertTriangle,
  MapPin,
  CheckSquare,
  ListTodo,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  ContractRecord,
  ComplianceRecord,
  LitigationCase,
  LegalNotice,
  LegalRisk,
  DueDiligenceRecord,
  ApprovalNOCRecord,
  LegalTask,
  Project,
  Company,
  User,
  KRA,
} from '../types';
import { canEditRegisters } from '../permissions';

interface OperationalRegistersViewProps {
  contracts: ContractRecord[];
  compliances: ComplianceRecord[];
  litigations: LitigationCase[];
  notices: LegalNotice[];
  risks: LegalRisk[];
  dueDiligences: DueDiligenceRecord[];
  approvals: ApprovalNOCRecord[];
  tasks: LegalTask[];
  projects: Project[];
  companies: Company[];
  users: User[];
  kras: KRA[];
  currentUser: User;
  onAddRecord: (entity: string, data: any) => Promise<void>;
}

type RegisterId = 'contracts' | 'compliances' | 'litigations' | 'notices' | 'risks' | 'dueDiligences' | 'approvals' | 'tasks';

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'user' | 'project' | 'kra';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  defaultValue?: string | number;
  /** For user pickers: the field that stores the person's display name */
  nameKey?: string;
  min?: number;
  max?: number;
}

interface ColumnDef {
  header: string;
  className?: string;
  render: (row: any) => React.ReactNode;
}

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const pill = (text: string | undefined, tone: 'green' | 'amber' | 'red' | 'slate' | 'blue' = 'slate') => {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    blue: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${tones[tone]}`}>
      {(text || '—').replace(/_/g, ' ')}
    </span>
  );
};

const riskTone = (level?: string) =>
  level === 'CRITICAL' || level === 'HIGH' ? 'red' : level === 'MEDIUM' ? 'amber' : level === 'LOW' ? 'green' : 'slate';

const statusTone = (status?: string) => {
  if (!status) return 'slate';
  if (['EXECUTED', 'APPROVED', 'COMPLIANT', 'RESPONDED', 'SETTLED', 'MITIGATED', 'CLEARED', 'OBTAINED', 'COMPLETED', 'CLOSED', 'DISMISSED'].includes(status))
    return 'green';
  if (['OVERDUE', 'REJECTED', 'EXPIRED', 'TERMINATED', 'DEFECTIVE'].includes(status)) return 'red';
  if (['WAIVED', 'CANCELLED', 'ACCEPTED'].includes(status)) return 'slate';
  return 'amber';
};

const inr = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  return `₹${(value / 100000).toFixed(1)} L`;
};

const daysBetween = (from?: string, to?: string) => {
  if (!from || !to) return undefined;
  const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  return Number.isFinite(d) ? d : undefined;
};

export const OperationalRegistersView: React.FC<OperationalRegistersViewProps> = ({
  contracts,
  compliances,
  litigations,
  notices,
  risks,
  dueDiligences,
  approvals,
  tasks,
  projects,
  companies,
  users,
  kras,
  currentUser,
  onAddRecord,
}) => {
  const [activeTab, setActiveTab] = useState<RegisterId>('contracts');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = canEditRegisters(currentUser);

  const projectName = (id?: string) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.name} (${p.code})` : id || '—';
  };

  const today = new Date().toISOString().slice(0, 10);

  const registers: Record<
    RegisterId,
    { label: string; icon: React.ComponentType<{ className?: string }>; rows: any[]; title: string; stat: string; columns: ColumnDef[]; fields: FieldDef[] }
  > = useMemo(() => {
    const completedContracts = contracts.filter((c) => c.status === 'APPROVED' || c.status === 'EXECUTED');
    const contractSla = completedContracts.length
      ? Math.round((completedContracts.filter((c) => c.isWithinSLA).length / completedContracts.length) * 1000) / 10
      : null;
    const compliantRate = compliances.length
      ? Math.round((compliances.filter((c) => c.status === 'COMPLIANT').length / compliances.length) * 1000) / 10
      : null;
    const exposure = litigations.reduce((a, l) => a + (l.estimatedExposureINR || 0), 0);
    const respondedNotices = notices.filter((n) => n.status === 'RESPONDED' || n.status === 'SETTLED');
    const openHighRisks = risks.filter((r) => (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL') && r.status !== 'MITIGATED').length;

    return {
      contracts: {
        label: 'Contracts Register',
        icon: FileText,
        rows: contracts,
        title: 'Commercial & Development Contracts',
        stat: contractSla === null ? 'No completed contracts yet' : `${contractSla}% of completed contracts within SLA`,
        columns: [
          { header: 'Contract Title & Parties', render: (c: ContractRecord) => (<><div className="font-bold text-slate-900">{c.contractTitle}</div><div className="text-[11px] text-slate-500">{c.counterparty}</div></>) },
          { header: 'Type', render: (c: ContractRecord) => <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-700">{c.contractType}</span> },
          { header: 'Project', render: (c: ContractRecord) => <span className="text-slate-600">{projectName(c.projectId)}</span> },
          { header: 'Value', render: (c: ContractRecord) => <span className="font-semibold text-slate-800">{inr(c.contractValueINR)}</span> },
          { header: 'TAT / SLA', className: 'text-center', render: (c: ContractRecord) => (
            <div className="space-y-1">
              <div className="font-bold text-indigo-700">{c.actualTATDays !== undefined ? `${c.actualTATDays} / ${c.targetSLADays} days` : `SLA ${c.targetSLADays ?? '—'} days`}</div>
              {c.isWithinSLA !== undefined && pill(c.isWithinSLA ? 'Within SLA' : 'Breached SLA', c.isWithinSLA ? 'green' : 'red')}
            </div>
          ) },
          { header: 'Risk', render: (c: ContractRecord) => pill(c.riskLevel, riskTone(c.riskLevel)) },
          { header: 'Status', render: (c: ContractRecord) => pill(c.status, statusTone(c.status)) },
          { header: 'Counsel', render: (c: ContractRecord) => <span className="text-slate-500">{c.assignedCounsel || c.assignedLawyerName || '—'}</span> },
        ],
        fields: [
          { key: 'contractTitle', label: 'Contract Title', type: 'text', required: true },
          { key: 'counterparty', label: 'Counterparty', type: 'text', required: true },
          { key: 'contractType', label: 'Type', type: 'select', required: true, options: ['Vendor', 'Consultant', 'Lease', 'Joint Venture', 'JDA', 'Construction', 'Sales Agency', 'Procurement'] },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'contractValueINR', label: 'Contract Value (₹)', type: 'number', min: 0 },
          { key: 'receivedDate', label: 'Received Date', type: 'date', defaultValue: today },
          { key: 'targetSLADays', label: 'Target SLA (days)', type: 'number', defaultValue: 3, min: 0 },
          { key: 'actualTATDays', label: 'Actual TAT (days, if reviewed)', type: 'number', min: 0 },
          { key: 'riskLevel', label: 'Risk Level', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH'], defaultValue: 'MEDIUM' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['PENDING_LEGAL_REVIEW', 'IN_REVIEW', 'PENDING_BUSINESS_APPROVAL', 'APPROVED', 'EXECUTED', 'EXPIRED', 'TERMINATED'], defaultValue: 'PENDING_LEGAL_REVIEW' },
          { key: 'assignedLawyerId', label: 'Assigned Counsel', type: 'user', nameKey: 'assignedLawyerName' },
        ],
      },
      compliances: {
        label: 'RERA & Statutory',
        icon: ShieldCheck,
        rows: compliances,
        title: 'RERA & Statutory Compliance Obligations',
        stat: compliantRate === null ? 'No obligations recorded' : `${compliantRate}% compliant • ${compliances.filter((c) => c.status === 'OVERDUE').length} overdue`,
        columns: [
          { header: 'Statutory Requirement', render: (c: ComplianceRecord) => (<><div className="font-bold text-slate-900">{c.requirement}</div><div className="text-[11px] text-slate-500">{c.regulation}</div></>) },
          { header: 'Authority', render: (c: ComplianceRecord) => <span className="font-semibold text-indigo-700">{c.authority}</span> },
          { header: 'Project', render: (c: ComplianceRecord) => <span className="text-slate-600">{projectName(c.projectId)}</span> },
          { header: 'Frequency', render: (c: ComplianceRecord) => <span className="text-slate-600">{c.frequency?.replace(/_/g, ' ')}</span> },
          { header: 'Due Date', render: (c: ComplianceRecord) => <span className="font-mono text-slate-800">{c.dueDate}</span> },
          { header: 'Status', render: (c: ComplianceRecord) => pill(c.status, statusTone(c.status)) },
          { header: 'Risk / Penalty', render: (c: ComplianceRecord) => (<div className="space-y-1">{pill(c.riskLevel, riskTone(c.riskLevel))}{c.penaltyRisk && <div className="text-[11px] text-slate-500">{c.penaltyRisk}</div>}</div>) },
        ],
        fields: [
          { key: 'requirement', label: 'Requirement', type: 'text', required: true },
          { key: 'regulation', label: 'Regulation / Section', type: 'text' },
          { key: 'authority', label: 'Authority', type: 'text', required: true },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'frequency', label: 'Frequency', type: 'select', options: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'ONE_TIME'], defaultValue: 'QUARTERLY' },
          { key: 'dueDate', label: 'Due Date', type: 'date', required: true },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['PENDING', 'COMPLIANT', 'OVERDUE', 'WAIVED'], defaultValue: 'PENDING' },
          { key: 'riskLevel', label: 'Risk Level', type: 'select', options: RISK_LEVELS, defaultValue: 'MEDIUM' },
          { key: 'penaltyRisk', label: 'Penalty Risk', type: 'text' },
          { key: 'responsiblePersonId', label: 'Responsible Person', type: 'user', nameKey: 'responsiblePersonName' },
        ],
      },
      litigations: {
        label: 'Litigation Docket',
        icon: Scale,
        rows: litigations,
        title: 'Litigation Docket & Proceedings',
        stat: `Total claim exposure: ${inr(exposure)} across ${litigations.length} matter(s)`,
        columns: [
          { header: 'Case # & Parties', render: (l: LitigationCase) => (<><div className="font-bold font-mono text-indigo-700">{l.caseNumber}</div><div className="text-[11px] text-slate-500">{l.parties}</div></>) },
          { header: 'Court / Forum', render: (l: LitigationCase) => (<><div className="text-slate-700 font-semibold">{l.court}</div><div className="text-[11px] text-slate-400">{l.caseType}</div></>) },
          { header: 'Status', render: (l: LitigationCase) => pill(l.caseStatus, statusTone(l.caseStatus)) },
          { header: 'Risk', render: (l: LitigationCase) => pill(l.riskLevel, riskTone(l.riskLevel)) },
          { header: 'Exposure', render: (l: LitigationCase) => <span className="font-bold text-slate-900">{inr(l.estimatedExposureINR)}</span> },
          { header: 'Next Hearing', render: (l: LitigationCase) => <span className="font-mono text-slate-700">{l.nextHearingDate || '—'}</span> },
          { header: 'Advocate', render: (l: LitigationCase) => <span className="text-slate-600">{l.externalAdvocate || l.advocateOrFirm || '—'}</span> },
        ],
        fields: [
          { key: 'caseNumber', label: 'Case Number', type: 'text', required: true },
          { key: 'court', label: 'Court / Forum', type: 'text', required: true },
          { key: 'caseType', label: 'Case Type', type: 'select', options: ['Civil', 'Consumer', 'RERA Dispute', 'Insolvency', 'Labor', 'Taxation', 'Title Challenge'] },
          { key: 'parties', label: 'Parties', type: 'text', required: true },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'advocateOrFirm', label: 'Advocate / Firm', type: 'text' },
          { key: 'filingDate', label: 'Filing Date', type: 'date' },
          { key: 'nextHearingDate', label: 'Next Hearing', type: 'date' },
          { key: 'caseStatus', label: 'Case Status', type: 'select', required: true, options: ['ACTIVE', 'HEARING_SCHEDULED', 'STAY_GRANTED', 'SETTLED', 'DISMISSED', 'CLOSED'], defaultValue: 'ACTIVE' },
          { key: 'riskLevel', label: 'Risk Level', type: 'select', required: true, options: RISK_LEVELS, defaultValue: 'MEDIUM' },
          { key: 'estimatedExposureINR', label: 'Estimated Exposure (₹)', type: 'number', min: 0 },
          { key: 'actualLegalCostINR', label: 'Legal Cost to Date (₹)', type: 'number', min: 0, defaultValue: 0 },
          { key: 'internalOwnerId', label: 'Internal Owner', type: 'user', nameKey: 'internalOwnerName' },
        ],
      },
      notices: {
        label: 'Legal Notices',
        icon: Mail,
        rows: notices,
        title: 'Legal Notices Inward / Outward',
        stat: `${respondedNotices.filter((n) => n.isWithinSLA).length} of ${respondedNotices.length} responded within SLA`,
        columns: [
          { header: 'Notice', render: (n: LegalNotice) => (<><div className="font-bold text-slate-900">{n.subject || n.noticeType}</div><div className="font-mono text-[10px] text-slate-400">{n.referenceNumber || n.id}</div></>) },
          { header: 'Direction', render: (n: LegalNotice) => <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-700">{n.direction}</span> },
          { header: 'From → To', render: (n: LegalNotice) => <span className="text-slate-700">{n.senderOrRecipient || `${n.sender} → ${n.recipient || '—'}`}</span> },
          { header: 'Received / Deadline', render: (n: LegalNotice) => <span className="font-mono text-slate-700">{n.dateReceived} → {n.responseDeadline || '—'}</span> },
          { header: 'Response', className: 'text-center', render: (n: LegalNotice) => {
            const days = n.actualTATDays ?? n.actualResponseDays;
            return (<div className="space-y-1"><div className="font-bold text-slate-800">{days !== undefined ? `${days} / ${n.targetSLADays} days` : `SLA ${n.targetSLADays ?? '—'} days`}</div>{n.isWithinSLA !== undefined && days !== undefined && pill(n.isWithinSLA ? 'Within SLA' : 'Breached SLA', n.isWithinSLA ? 'green' : 'red')}</div>);
          } },
          { header: 'Status', render: (n: LegalNotice) => pill(n.status, statusTone(n.status)) },
          { header: 'Counsel', render: (n: LegalNotice) => <span className="text-slate-600">{n.assignedCounsel || n.assignedLawyerName || '—'}</span> },
        ],
        fields: [
          { key: 'noticeType', label: 'Notice Type', type: 'select', required: true, options: ['Customer Complaint', 'Regulatory Show Cause', 'Contractor Claim', 'Defamation', 'Eviction', 'Statutory Tax'] },
          { key: 'direction', label: 'Direction', type: 'select', required: true, options: ['RECEIVED', 'SENT'], defaultValue: 'RECEIVED' },
          { key: 'subject', label: 'Subject', type: 'text' },
          { key: 'sender', label: 'Sender', type: 'text', required: true },
          { key: 'recipient', label: 'Recipient', type: 'text' },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'dateReceived', label: 'Date Received', type: 'date', required: true, defaultValue: today },
          { key: 'responseDeadline', label: 'Response Deadline', type: 'date' },
          { key: 'targetSLADays', label: 'Target SLA (days)', type: 'number', defaultValue: 7, min: 0 },
          { key: 'actualResponseDays', label: 'Actual Response (days, if replied)', type: 'number', min: 0 },
          { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, defaultValue: 'MEDIUM' },
          { key: 'riskLevel', label: 'Risk Level', type: 'select', options: RISK_LEVELS, defaultValue: 'MEDIUM' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['NEW', 'UNDER_EVALUATION', 'DRAFT_REPLY_PREPARED', 'RESPONDED', 'OVERDUE', 'SETTLED'], defaultValue: 'NEW' },
          { key: 'assignedLawyerId', label: 'Assigned Counsel', type: 'user', nameKey: 'assignedLawyerName' },
        ],
      },
      risks: {
        label: 'Risk Matrix',
        icon: AlertTriangle,
        rows: risks,
        title: 'Legal Risk Register (Probability × Impact)',
        stat: `${openHighRisks} open high/critical risk(s) • score scale 1–25`,
        columns: [
          { header: 'Risk Category & Description', className: 'max-w-sm', render: (r: LegalRisk) => (<><span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] font-mono">{r.riskCategory}</span><div className="text-slate-900 font-medium mt-1">{r.description}</div></>) },
          { header: 'Score (P×I)', className: 'text-center', render: (r: LegalRisk) => <span className="font-black text-slate-900">{r.riskScore} / 25</span> },
          { header: 'Level', className: 'text-center', render: (r: LegalRisk) => pill(r.riskLevel, riskTone(r.riskLevel)) },
          { header: 'Mitigation Plan', render: (r: LegalRisk) => (<><div className="text-slate-600 text-[11px]">{r.mitigationPlan || '—'}</div>{r.mitigationDeadline && <div className="text-[10px] text-slate-400 mt-0.5">Due {r.mitigationDeadline}</div>}</>) },
          { header: 'Owner', render: (r: LegalRisk) => <span className="text-slate-600">{r.ownerName || '—'}</span> },
          { header: 'Status', render: (r: LegalRisk) => pill(r.status, statusTone(r.status)) },
        ],
        fields: [
          { key: 'description', label: 'Risk Description', type: 'textarea', required: true },
          { key: 'riskCategory', label: 'Category', type: 'select', required: true, options: ['Regulatory', 'Contractual', 'Litigation', 'Title & Land', 'Compliance', 'Operational'] },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'kraId', label: 'Related KRA', type: 'kra' },
          { key: 'probability', label: 'Probability (1–5)', type: 'number', required: true, min: 1, max: 5, defaultValue: 3 },
          { key: 'impact', label: 'Impact (1–5)', type: 'number', required: true, min: 1, max: 5, defaultValue: 3 },
          { key: 'mitigationPlan', label: 'Mitigation Plan', type: 'textarea' },
          { key: 'mitigationDeadline', label: 'Mitigation Deadline', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['OPEN', 'MITIGATION_IN_PROGRESS', 'MITIGATED', 'ACCEPTED'], defaultValue: 'OPEN' },
          { key: 'ownerId', label: 'Risk Owner', type: 'user', nameKey: 'ownerName' },
        ],
      },
      dueDiligences: {
        label: 'Title Due Diligence',
        icon: MapPin,
        rows: dueDiligences,
        title: 'Land & Title Due Diligence Reports',
        stat: `${dueDiligences.filter((d) => d.legalClearanceStatus === 'CLEARED').length} of ${dueDiligences.length} properties cleared`,
        columns: [
          { header: 'Property / Survey #', render: (d: DueDiligenceRecord) => (<><div className="font-bold text-slate-900">{d.propertyName}</div><div className="text-[11px] text-slate-500">{d.location || d.propertyLocation}</div></>) },
          { header: 'Owner / Seller', render: (d: DueDiligenceRecord) => <span className="text-slate-600">{d.ownerOrSeller || '—'}</span> },
          { header: 'Title', render: (d: DueDiligenceRecord) => pill(d.titleStatus, d.titleStatus === 'CLEAR' ? 'green' : d.titleStatus === 'DEFECTIVE' ? 'red' : 'amber') },
          { header: 'Encumbrance', render: (d: DueDiligenceRecord) => pill(d.encumbranceStatus, d.encumbranceStatus === 'NONE' ? 'green' : 'amber') },
          { header: 'Defects Resolved', className: 'text-center', render: (d: DueDiligenceRecord) => <span className="font-bold text-indigo-700">{d.defectsResolved ?? 0} / {d.defectsIdentified ?? 0}</span> },
          { header: 'Clearance', render: (d: DueDiligenceRecord) => pill(d.legalClearanceStatus, statusTone(d.legalClearanceStatus)) },
        ],
        fields: [
          { key: 'propertyName', label: 'Property / Survey #', type: 'text', required: true },
          { key: 'location', label: 'Location', type: 'text', required: true },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'ownerOrSeller', label: 'Owner / Seller', type: 'text' },
          { key: 'startDate', label: 'Start Date', type: 'date', defaultValue: today },
          { key: 'targetSLADays', label: 'Target SLA (days)', type: 'number', defaultValue: 30, min: 0 },
          { key: 'titleStatus', label: 'Title Status', type: 'select', options: ['UNDER_VERIFICATION', 'CLEAR', 'DEFECTIVE'], defaultValue: 'UNDER_VERIFICATION' },
          { key: 'encumbranceStatus', label: 'Encumbrance', type: 'select', options: ['SEARCH_IN_PROGRESS', 'NONE', 'MORTGAGE', 'LITIGATION_PENDING'], defaultValue: 'SEARCH_IN_PROGRESS' },
          { key: 'riskLevel', label: 'Risk Level', type: 'select', options: RISK_LEVELS, defaultValue: 'MEDIUM' },
          { key: 'defectsIdentified', label: 'Defects Identified', type: 'number', min: 0, defaultValue: 0 },
          { key: 'defectsResolved', label: 'Defects Resolved', type: 'number', min: 0, defaultValue: 0 },
          { key: 'legalClearanceStatus', label: 'Clearance Status', type: 'select', required: true, options: ['PENDING', 'CONDITIONAL_CLEARANCE', 'CLEARED', 'REJECTED'], defaultValue: 'PENDING' },
          { key: 'assignedLawyerId', label: 'Assigned Counsel', type: 'user', nameKey: 'assignedLawyerName' },
        ],
      },
      approvals: {
        label: 'NOCs & Permissions',
        icon: CheckSquare,
        rows: approvals,
        title: 'Project Approvals, Permissions & NOCs',
        stat: `${approvals.filter((a) => a.status === 'OBTAINED').length} of ${approvals.length} obtained`,
        columns: [
          { header: 'Permission & Authority', render: (a: ApprovalNOCRecord) => (<><div className="font-bold text-slate-900">{a.approvalType}</div><div className="text-[11px] text-indigo-600 font-semibold">{a.authority}</div></>) },
          { header: 'Project', render: (a: ApprovalNOCRecord) => <span className="text-slate-600">{projectName(a.projectId)}</span> },
          { header: 'Applied', render: (a: ApprovalNOCRecord) => <span className="font-mono text-slate-600">{a.applicationDate}</span> },
          { header: 'Approved', render: (a: ApprovalNOCRecord) => <span className="font-mono text-slate-600">{a.approvalDate || 'Pending'}</span> },
          { header: 'TAT', className: 'text-center', render: (a: ApprovalNOCRecord) => {
            const tat = a.actualTATDays ?? daysBetween(a.applicationDate, a.approvalDate);
            return <span className="font-bold text-indigo-700">{tat !== undefined ? `${tat} days` : '—'}</span>;
          } },
          { header: 'Status', render: (a: ApprovalNOCRecord) => pill(a.status, statusTone(a.status)) },
        ],
        fields: [
          { key: 'approvalType', label: 'Approval Type', type: 'select', required: true, options: ['Building Plan Sanction', 'Environmental Clearance', 'Fire NOC', 'Height/AAI Clearance', 'RERA Registration', 'Tree Authority NOC', 'Commencement Certificate', 'Occupancy Certificate'] },
          { key: 'authority', label: 'Authority', type: 'text', required: true },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'applicationDate', label: 'Application Date', type: 'date', required: true, defaultValue: today },
          { key: 'requiredDate', label: 'Required By', type: 'date' },
          { key: 'approvalDate', label: 'Approval Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['PENDING', 'APPLICATION_SUBMITTED', 'QUERY_RAISED', 'OBTAINED', 'OVERDUE', 'EXPIRED'], defaultValue: 'APPLICATION_SUBMITTED' },
          { key: 'responsiblePersonId', label: 'Responsible Person', type: 'user', nameKey: 'responsiblePersonName' },
        ],
      },
      tasks: {
        label: 'Advisory Tasks',
        icon: ListTodo,
        rows: tasks,
        title: 'Legal Department Advisory Tasks',
        stat: `${tasks.filter((t) => t.status === 'COMPLETED').length} completed • ${tasks.filter((t) => t.status === 'OVERDUE').length} overdue`,
        columns: [
          { header: 'Task', render: (t: LegalTask) => (<><div className="font-bold text-slate-900">{t.taskTitle}</div>{t.legalMatter && <div className="text-[11px] text-slate-500">{t.legalMatter}</div>}</>) },
          { header: 'Assignee', render: (t: LegalTask) => <span className="font-medium text-slate-700">{t.assigneeName || t.assignedEmployeeName || '—'}</span> },
          { header: 'Priority', render: (t: LegalTask) => pill(t.priority, t.priority === 'HIGH' || t.priority === 'URGENT' ? 'red' : 'slate') },
          { header: 'Due', render: (t: LegalTask) => <span className="font-mono text-slate-700">{t.dueDate}</span> },
          { header: 'Days / SLA', className: 'text-center', render: (t: LegalTask) => {
            const taken = t.actualTATDays ?? t.actualDaysTaken;
            return <span className="font-bold text-indigo-700">{taken !== undefined ? `${taken} / ${t.targetSLADays}` : `SLA ${t.targetSLADays ?? '—'}`}</span>;
          } },
          { header: 'Status', render: (t: LegalTask) => pill(t.status, statusTone(t.status)) },
        ],
        fields: [
          { key: 'taskTitle', label: 'Task Title', type: 'text', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'legalMatter', label: 'Legal Matter', type: 'text' },
          { key: 'projectId', label: 'Project', type: 'project' },
          { key: 'kraId', label: 'Related KRA', type: 'kra' },
          { key: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES, defaultValue: 'MEDIUM' },
          { key: 'startDate', label: 'Start Date', type: 'date', defaultValue: today },
          { key: 'dueDate', label: 'Due Date', type: 'date', required: true },
          { key: 'targetSLADays', label: 'Target SLA (days)', type: 'number', min: 0, defaultValue: 5 },
          { key: 'actualDaysTaken', label: 'Actual Days Taken (if completed)', type: 'number', min: 0 },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED'], defaultValue: 'NOT_STARTED' },
          { key: 'assignedEmployeeId', label: 'Assignee', type: 'user', nameKey: 'assignedEmployeeName' },
        ],
      },
    };
  }, [contracts, compliances, litigations, notices, risks, dueDiligences, approvals, tasks, projects, today]);

  const active = registers[activeTab];

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return active.rows;
    return active.rows.filter((row) =>
      Object.values(row).some((v) => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(term))
    );
  }, [active.rows, searchTerm]);

  const openAddModal = () => {
    const defaults: Record<string, any> = {};
    for (const f of active.fields) {
      if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
      if (f.type === 'user') defaults[f.key] = currentUser.id;
    }
    setFormValues(defaults);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {};
    for (const f of active.fields) {
      const raw = formValues[f.key];
      if (raw === undefined || raw === '') {
        if (f.required) {
          setFormError(`${f.label} is required.`);
          return;
        }
        continue;
      }
      if (f.type === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
          setFormError(`${f.label} must be a number${f.min !== undefined ? ` ≥ ${f.min}` : ''}${f.max !== undefined ? ` and ≤ ${f.max}` : ''}.`);
          return;
        }
        payload[f.key] = n;
      } else {
        payload[f.key] = typeof raw === 'string' ? raw.trim() : raw;
      }
      if (f.type === 'user' && f.nameKey) {
        payload[f.nameKey] = users.find((u) => u.id === raw)?.name || '';
      }
      if (f.type === 'project') {
        payload.companyId = projects.find((p) => p.id === raw)?.companyId;
      }
    }

    setIsSaving(true);
    setFormError('');
    try {
      await onAddRecord(activeTab, payload);
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save the record');
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (f: FieldDef) => {
    const common = {
      id: `reg-${f.key}`,
      value: formValues[f.key] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setFormValues((prev) => ({ ...prev, [f.key]: e.target.value })),
      required: f.required,
      className: 'w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white',
    };
    switch (f.type) {
      case 'textarea':
        return <textarea rows={2} {...common} />;
      case 'number':
        return <input type="number" step="any" min={f.min} max={f.max} {...common} />;
      case 'date':
        return <input type="date" {...common} />;
      case 'select':
        return (
          <select {...common}>
            <option value="">— Select —</option>
            {f.options!.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        );
      case 'user':
        return (
          <select {...common}>
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        );
      case 'project':
        return (
          <select {...common}>
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code}) – {companies.find((c) => c.id === p.companyId)?.code || p.location}
              </option>
            ))}
          </select>
        );
      case 'kra':
        return (
          <select {...common}>
            <option value="">— None —</option>
            {kras.map((k) => (
              <option key={k.id} value={k.id}>
                KRA {k.kraNumber}: {k.name}
              </option>
            ))}
          </select>
        );
      default:
        return <input type="text" {...common} />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Real Estate Operational Legal Registers</h2>
          <p className="text-xs text-slate-500 mt-1">
            Operational matters that serve as ground truth for automated KPI calculation and compliance audits.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 bg-brand-gradient hover:opacity-90 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add to {active.label}</span>
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2" role="tablist">
        {(Object.keys(registers) as RegisterId[]).map((id) => {
          const tab = registers[id];
          const Icon = tab.icon;
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActiveTab(id);
                setSearchTerm('');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {tab.rows.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{active.title}</h3>
            <span className="text-xs text-slate-500">{active.stat}</span>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={`Search ${active.label.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                {active.columns.map((c) => (
                  <th key={c.header} className={`py-2.5 px-3 ${c.className || ''}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60 align-top">
                  {active.columns.map((c) => (
                    <td key={c.header} className={`py-3 px-3 ${c.className || ''}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={active.columns.length} className="py-8 text-center text-slate-400">
                    {searchTerm ? 'No records match your search.' : 'No records in this register yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 text-xs my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add to {active.label}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {active.fields.map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <label className="font-semibold text-slate-700 block mb-1" htmlFor={`reg-${f.key}`}>
                      {f.label}
                      {f.required && <span className="text-rose-600"> *</span>}
                    </label>
                    {renderField(f)}
                  </div>
                ))}
              </div>

              {formError && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{formError}</div>}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save to Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
