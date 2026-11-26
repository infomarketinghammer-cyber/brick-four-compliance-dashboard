// Legal Department KRA/KPI wording.
// The original seed carried architectural / structural design names on 9 of the 10 Legal KRAs and their KPIs,
// while the calculation engine (autoCalculateKPIActual) measures legal register metrics for the same KPI codes
// (contracts within SLA, litigation, notices, approvals, risks...). These names restore the legal meaning so the
// labels match what is actually measured. Units, targets, directions and weights are unchanged except where noted.
//
// Applied as a data migration: a record is renamed only while it still carries the old seed name, so a name an
// administrator has since edited is never overwritten.

export interface FrameworkRename {
  oldName: string;
  name: string;
  description: string;
  unit?: string;
}

export const LEGAL_KRA_RENAMES: Record<string, FrameworkRename> = {
  'kra-02': {
    oldName: 'Architectural Sanctions & Working Drawings Compliance',
    name: 'RERA & Statutory Regulatory Compliance',
    description:
      'Measure adherence to RERA filings and disclosures, statutory registrations and regulatory deadlines across all projects and entities.',
  },
  'kra-03': {
    oldName: 'Structural & Seismic Engineering Compliance',
    name: 'Project Approvals, NOCs & Statutory Permissions',
    description:
      'Measure effectiveness in obtaining, tracking and renewing project approvals, NOCs and statutory permissions within the agreed SLA.',
  },
  'kra-04': {
    oldName: 'Architectural Design & Planning Deliverables',
    name: 'Contract Drafting, Review & Management',
    description:
      'Measure turnaround, quality and SLA compliance in drafting, vetting and executing contracts with vendors, contractors and partners.',
  },
  'kra-05': {
    oldName: 'Customer Architectural Documentation & Specifications',
    name: 'Customer Agreements & Legal Documentation',
    description:
      'Measure accuracy and turnaround of customer sale agreements, allotment letters and conveyance documents, and resolution of customer legal grievances.',
  },
  'kra-06': {
    oldName: 'MEP Design & Structural Peer Review Inspections',
    name: 'Litigation & Dispute Management',
    description:
      'Measure preparation, timeliness and outcomes in court, consumer forum, RERA and arbitration matters, and control of high-risk disputes.',
  },
  'kra-07': {
    oldName: 'Municipal Sanction Queries & Notice Resolution',
    name: 'Legal Notices & Authority Correspondence',
    description:
      'Measure how effectively the Legal Department evaluates and responds to legal notices, statutory show-cause notices and authority requisitions within SLA.',
  },
  'kra-08': {
    oldName: 'Overall Department Governance & Risk Management',
    name: 'Legal Risk Management & Department Governance',
    description:
      'Measure proactive identification and mitigation of legal risks, the statutory compliance matrix and overall departmental SLA and milestone delivery.',
  },
  'kra-09': {
    oldName: 'Master Layout Due Diligence & Statutory Permissions',
    name: 'Land Acquisition & Property Transactions',
    description:
      'Measure turnaround and risk control in land acquisition, development agreements, joint ventures and other property transactions.',
  },
  'kra-10': {
    oldName: 'Billing, Consultant Management & Document Archival',
    name: 'Legal Cost, External Counsel & Records Management',
    description:
      'Measure financial discipline over external counsel, legal invoice verification, counsel SLA compliance and digital archival of legal records.',
  },
};

export const LEGAL_KPI_RENAMES: Record<string, FrameworkRename> = {
  'kpi-02-01': {
    oldName: 'Architectural Working Drawings & Sanction Compliance %',
    name: 'Statutory & RERA Obligations Completed On Time %',
    description: 'Share of statutory and RERA compliance obligations completed by their due date (from the RERA & Statutory register).',
  },
  'kpi-02-02': {
    oldName: 'Municipal Authority Drawing Discrepancies',
    name: 'Overdue Statutory Compliance Obligations',
    description: 'Number of statutory / RERA obligations past their due date.',
  },
  'kpi-02-03': {
    oldName: 'RERA Architectural Disclosure Filing Compliance %',
    name: 'RERA Quarterly Disclosure Filing Compliance %',
    description: 'Share of RERA quarterly progress and disclosure filings submitted on time.',
  },
  'kpi-03-01': {
    oldName: 'Structural Stability & Seismic Design Certifications',
    name: 'Project Approvals & NOCs Obtained %',
    description: 'Share of required project approvals and NOCs obtained (from the NOCs & Permissions register).',
  },
  'kpi-03-02': {
    oldName: 'High-Impact Foundation & Structural Clearances',
    name: 'Pending Statutory Approvals',
    description: 'Number of statutory approvals still pending with authorities.',
  },
  'kpi-03-03': {
    oldName: 'Structural Consultant Vetting SLA',
    name: 'Authority Query Response TAT on Approvals',
    description: 'Average days taken to answer authority queries raised on approval applications.',
  },
  'kpi-04-01': {
    oldName: 'Architectural Scheme Sanction Drawings within SLA',
    name: 'Contracts Reviewed & Approved within SLA %',
    description: 'Share of contracts completed within their review SLA (from the Contracts register).',
  },
  'kpi-04-02': {
    oldName: 'Architectural Working Drawing Delivery TAT',
    name: 'Average Contract Review Turnaround',
    description: 'Average days from contract receipt to legal approval.',
  },
  'kpi-04-03': {
    oldName: 'Building Layout Optimization & Efficiency Rate',
    name: 'Contract Risk-Clause Review Accuracy %',
    description: 'Share of executed contracts with no missed risk clause found on post-execution audit.',
  },
  'kpi-05-01': {
    oldName: 'Customer Unit Floor Plan & Brochure Compliance',
    name: 'Customer Sale Agreements Executed within SLA %',
    description: 'Share of customer agreements for sale / allotment letters executed within SLA.',
  },
  'kpi-05-02': {
    oldName: 'Customer Architectural Customization TAT',
    name: 'Customer Legal Grievance Resolution TAT',
    description: 'Average days to resolve customer legal queries and grievances.',
  },
  'kpi-05-03': {
    oldName: 'Architectural Drawing Error & Revision Rate',
    name: 'Legal Documentation Error & Revision Rate',
    description: 'Share of customer legal documents that needed correction after issue.',
  },
  'kpi-06-01': {
    oldName: 'MEP Load & Firefighting Calculations SLA',
    name: 'Litigation Hearings Prepared & Attended on Time %',
    description: 'Share of scheduled hearings for which briefs were ready and the matter was represented on time.',
  },
  'kpi-06-02': {
    oldName: 'Structural Site Quality Inspection Check Rate',
    name: 'Court Filings & Pleadings within Deadline %',
    description: 'Share of replies, written statements and appeals filed within the statutory or court deadline.',
  },
  'kpi-06-03': {
    oldName: 'Site Structural Non-Conformance Reports Cleared',
    name: 'Unresolved High-Risk Litigation Matters',
    description: 'Number of active high / critical risk litigation matters (from the Litigation docket).',
    unit: 'matters',
  },
  'kpi-07-01': {
    oldName: 'Municipal Scrutiny Query Response within SLA Rate',
    name: 'Legal Notices Responded within SLA %',
    description: 'Share of legal and statutory notices replied to within SLA (from the Legal Notices register).',
  },
  'kpi-07-02': {
    oldName: 'Pending Authority Notice Drafting',
    name: 'Overdue Legal Notice Replies',
    description: 'Number of notices whose reply is past the SLA.',
  },
  'kpi-07-03': {
    oldName: 'Average Authority Objection Resolution TAT',
    name: 'Average Legal Notice Response TAT',
    description: 'Average days taken to reply to legal notices.',
  },
  'kpi-08-01': {
    oldName: 'Department Open Critical Statutory & Design Risks',
    name: 'Open Critical / High Legal Risks',
    description: 'Number of high or critical legal risks not yet mitigated (from the Risk Matrix).',
  },
  'kpi-08-02': {
    oldName: 'Cross-Wing Risk Mitigation Plans Active %',
    name: 'Legal Risks with Active Mitigation Plans %',
    description: 'Share of open legal risks that have an approved mitigation plan in progress.',
  },
  'kpi-08-03': {
    oldName: 'Overall Departmental SLA & Milestone Delivery Compliance %',
    name: 'Department SLA & Milestone Delivery Compliance %',
    description: 'Share of department deliverables and milestones completed within SLA.',
  },
  'kpi-09-01': {
    oldName: 'Layout Sanctions Completed within Target TAT',
    name: 'Property Transactions Completed within Target TAT %',
    description: 'Share of land / property transactions legally closed within the target turnaround.',
  },
  'kpi-09-02': {
    oldName: 'Statutory Town Planning Queries Resolved',
    name: 'Unresolved High-Risk Transaction Issues',
    description: 'Number of open high-risk legal issues on property transactions.',
  },
  'kpi-09-03': {
    oldName: 'Layout Amalgamation & DP Road Clearances',
    name: 'Average Transaction Legal Turnaround',
    description: 'Average days from transaction initiation to legal closure.',
  },
  'kpi-10-01': {
    oldName: 'Consultant Fee Notes & Invoice Audit Accuracy %',
    name: 'External Counsel Invoice Audit Accuracy %',
    description: 'Share of external counsel invoices verified against the agreed fee schedule without error.',
  },
  'kpi-10-02': {
    oldName: 'Statutory Approvals & Project Document Digital Archival TAT',
    name: 'Legal Records & Title Document Archival TAT',
    description: 'Average days to digitally archive executed agreements, title documents and approvals.',
  },
  'kpi-10-03': {
    oldName: 'MEP Drafting & CAD Documentation Delivery SLA',
    name: 'External Counsel Deliverables within SLA %',
    description: 'Share of external counsel deliverables (opinions, drafts, filings) received within SLA.',
  },
};

/** Seeded evidence records that never had a file (fabricated sample links / uploaders); removed by migration */
export const PLACEHOLDER_EVIDENCE_IDS = ['ev-01', 'ev-02', 'ev-03'];
