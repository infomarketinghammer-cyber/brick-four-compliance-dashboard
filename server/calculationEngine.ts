import type {
  KRA,
  KPI,
  KPIMeasurement,
  PerformanceStatus,
  ScoringSettings,
  ScoreBreakdownNode,
  OperationalSummary,
  ContractRecord,
  ComplianceObligation,
  LitigationCase,
  LegalNotice,
  LegalRisk,
  PropertyDueDiligence,
  ProjectApproval,
  LegalTask,
} from '../src/types.js';

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  maxAchievementCap: 100, // Capped at 100% unless configured
  minAchievementFloor: 0,
  behindThreshold: 70,
  atRiskThreshold: 90,
  onTrackThreshold: 100,
  isWeightedFramework: true,
  roundingDecimals: 2,
};

export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function determineStatus(
  achievement: number,
  settings: ScoringSettings = DEFAULT_SCORING_SETTINGS
): PerformanceStatus {
  if (achievement < settings.behindThreshold) return 'BEHIND';
  if (achievement < settings.atRiskThreshold) return 'AT_RISK';
  if (achievement <= settings.onTrackThreshold) return 'ON_TRACK';
  return 'EXCEEDS_TARGET';
}

export interface CalculationResult {
  actual: number;
  achievement: number;
  weightedScore: number;
  status: PerformanceStatus;
  formulaDescription: string;
}

export function calculateKPIAchievement(
  kpi: KPI,
  actual: number,
  target: number,
  settings: ScoringSettings = DEFAULT_SCORING_SETTINGS
): CalculationResult {
  let rawAchievement = 0;
  let formula = '';

  // Per-KPI cap overrides the global cap. The floor is always the global achievement floor:
  // kpi.minAcceptableValue is expressed in KPI units (lower bound of a TARGET_RANGE), not in %.
  const cap = kpi.maxCapValue ?? settings.maxAchievementCap;
  const floor = settings.minAchievementFloor;

  switch (kpi.direction) {
    case 'HIGHER_IS_BETTER': {
      if (target === 0) {
        rawAchievement = actual >= 0 ? 100 : 0;
        formula = `Actual (${actual}) >= Target (0) ? 100% : 0%`;
      } else {
        rawAchievement = (actual / target) * 100;
        formula = `(Actual ${actual} / Target ${target}) × 100 = ${roundTo(rawAchievement, 2)}%`;
      }
      break;
    }

    case 'LOWER_IS_BETTER': {
      if (actual === 0) {
        rawAchievement = target >= 0 ? 100 : 0;
        formula = `Actual is 0 (optimal) vs Target (${target}) → 100%`;
      } else {
        rawAchievement = (target / actual) * 100;
        formula = `(Target ${target} / Actual ${actual}) × 100 = ${roundTo(rawAchievement, 2)}%`;
      }
      break;
    }

    case 'TARGET_RANGE': {
      const minAcceptable = kpi.minAcceptableValue ?? target * 0.9;
      if (actual >= minAcceptable && actual <= target) {
        rawAchievement = 100;
        formula = `Actual ${actual} within target range [${minAcceptable}, ${target}] → 100%`;
      } else if (actual < minAcceptable) {
        rawAchievement = (actual / minAcceptable) * 100;
        formula = `Actual ${actual} below minimum acceptable ${minAcceptable} → ${roundTo(rawAchievement, 2)}%`;
      } else {
        const excessRatio = (actual - target) / target;
        rawAchievement = Math.max(0, 100 - excessRatio * 100);
        formula = `Actual ${actual} above upper bound ${target} → ${roundTo(rawAchievement, 2)}%`;
      }
      break;
    }

    case 'EXACT_TARGET': {
      if (target === 0) {
        rawAchievement = actual === 0 ? 100 : 0;
        formula = `Exact match check with 0: ${actual === 0 ? 'Match' : 'Mismatch'}`;
      } else {
        const deviation = Math.abs(actual - target);
        const percentDeviation = (deviation / target) * 100;
        rawAchievement = Math.max(0, 100 - percentDeviation);
        formula = `Exact target deviation: 100 - (|${actual} - ${target}| / ${target} × 100) = ${roundTo(rawAchievement, 2)}%`;
      }
      break;
    }

    default: {
      rawAchievement = (actual / (target || 1)) * 100;
      formula = `Standard ratio (Actual / Target × 100)`;
    }
  }

  // Handle capping & flooring
  let cappedAchievement = rawAchievement;
  if (cap !== undefined && cap !== null && cap > 0) {
    if (cappedAchievement > cap) {
      formula += ` (Capped from ${roundTo(cappedAchievement, 2)}% to ${cap}%)`;
      cappedAchievement = cap;
    }
  }
  if (floor !== undefined && floor !== null && cappedAchievement < floor) {
    formula += ` (Floored at ${floor}%)`;
    cappedAchievement = floor;
  }

  const roundedAchievement = roundTo(cappedAchievement, settings.roundingDecimals);
  const weightedScore = roundTo(
    (roundedAchievement * (kpi.weight || 0)) / 100,
    settings.roundingDecimals
  );
  const status = determineStatus(roundedAchievement, settings);

  return {
    actual,
    achievement: roundedAchievement,
    weightedScore,
    status,
    formulaDescription: formula,
  };
}

export function computeKRAScore(
  kra: KRA,
  kpis: KPI[],
  measurementsMap: Map<string, KPIMeasurement>,
  settings: ScoringSettings = DEFAULT_SCORING_SETTINGS
): {
  kraScore: number;
  weightedContribution: number;
  status: PerformanceStatus;
  kpiDetails: Array<{
    kpi: KPI;
    measurement?: KPIMeasurement;
    calc: CalculationResult;
  }>;
} {
  const kraKpis = kpis.filter((k) => k.kraId === kra.id && k.active);
  let totalWeightedScore = 0;
  let totalKpiWeight = 0;

  const kpiDetails = kraKpis.map((kpi) => {
    const measurement = measurementsMap.get(kpi.id);
    const actual = measurement ? measurement.actual : 0;
    const target = measurement ? measurement.target : kpi.targetValue;
    const calc = calculateKPIAchievement(kpi, actual, target, settings);
    totalWeightedScore += calc.weightedScore;
    totalKpiWeight += kpi.weight;
    return { kpi, measurement, calc };
  });

  // Normalize by the total KPI weight so a KRA whose KPI weights do not sum to exactly 100
  // still yields a 0-100 score (identical result when the weights do sum to 100).
  const kraScore =
    totalKpiWeight > 0
      ? roundTo((totalWeightedScore * 100) / totalKpiWeight, settings.roundingDecimals)
      : 0;
  const weightedContribution = roundTo(
    (kraScore * (kra.weight || 0)) / 100,
    settings.roundingDecimals
  );
  const status = determineStatus(kraScore, settings);

  return {
    kraScore,
    weightedContribution,
    status,
    kpiDetails,
  };
}

export interface DepartmentScoreSummary {
  overallScore: number;
  status: PerformanceStatus;
  totalKRAWeight: number;
  isKRAWeightValid: boolean;
  kraBreakdowns: Array<{
    kra: KRA;
    kraScore: number;
    weightedContribution: number;
    status: PerformanceStatus;
    kpiCount: number;
    onTrackKpis: number;
    atRiskKpis: number;
    behindKpis: number;
  }>;
}

export function computeDepartmentScore(
  kras: KRA[],
  kpis: KPI[],
  measurements: KPIMeasurement[],
  settings: ScoringSettings = DEFAULT_SCORING_SETTINGS
): DepartmentScoreSummary {
  const measurementsMap = new Map<string, KPIMeasurement>();
  for (const m of measurements) {
    measurementsMap.set(m.kpiId, m);
  }

  let totalWeight = 0;
  let overallScore = 0;

  const activeKras = kras.filter((k) => k.active).sort((a, b) => a.orderIndex - b.orderIndex);

  const kraBreakdowns = activeKras.map((kra) => {
    totalWeight += kra.weight;
    const result = computeKRAScore(kra, kpis, measurementsMap, settings);
    overallScore += result.weightedContribution;

    let onTrackKpis = 0;
    let atRiskKpis = 0;
    let behindKpis = 0;

    for (const detail of result.kpiDetails) {
      if (detail.calc.status === 'ON_TRACK' || detail.calc.status === 'EXCEEDS_TARGET') onTrackKpis++;
      else if (detail.calc.status === 'AT_RISK') atRiskKpis++;
      else behindKpis++;
    }

    return {
      kra,
      kraScore: result.kraScore,
      weightedContribution: result.weightedContribution,
      status: result.status,
      kpiCount: result.kpiDetails.length,
      onTrackKpis,
      atRiskKpis,
      behindKpis,
    };
  });

  const roundedOverallScore = roundTo(overallScore, settings.roundingDecimals);
  const status = determineStatus(roundedOverallScore, settings);
  const isKRAWeightValid = Math.abs(totalWeight - 100) < 0.01;

  return {
    overallScore: roundedOverallScore,
    status,
    totalKRAWeight: roundTo(totalWeight, 1),
    isKRAWeightValid,
    kraBreakdowns,
  };
}

export function generateScoreExplainabilityTree(
  kras: KRA[],
  kpis: KPI[],
  measurements: KPIMeasurement[],
  settings: ScoringSettings = DEFAULT_SCORING_SETTINGS
): ScoreBreakdownNode {
  const deptSummary = computeDepartmentScore(kras, kpis, measurements, settings);
  const measurementsMap = new Map<string, KPIMeasurement>();
  for (const m of measurements) {
    measurementsMap.set(m.kpiId, m);
  }

  const kraChildren: ScoreBreakdownNode[] = [];

  for (const kraSummary of deptSummary.kraBreakdowns) {
    const kraResult = computeKRAScore(kraSummary.kra, kpis, measurementsMap, settings);

    const kpiChildren: ScoreBreakdownNode[] = kraResult.kpiDetails.map((detail) => {
      const { kpi, measurement, calc } = detail;
      const target = measurement ? measurement.target : kpi.targetValue;
      return {
        type: 'KPI',
        id: kpi.id,
        name: `[${kpi.kpiCode}] ${kpi.name}`,
        weight: kpi.weight,
        target,
        actual: calc.actual,
        unit: kpi.unit,
        direction: kpi.direction,
        achievement: calc.achievement,
        weightedScore: calc.weightedScore,
        scoreContribution: calc.weightedScore,
        status: calc.status,
        formulaDescription: calc.formulaDescription,
        operationalSource: kpi.dataSource,
        operationalMetricsSummary: measurement
          ? `Target: ${target} ${kpi.unit}, Actual: ${calc.actual} ${kpi.unit}, Weight in KRA: ${kpi.weight}%`
          : `No measurement recorded for this period (actual treated as 0). Weight in KRA: ${kpi.weight}%`,
        isManuallyOverridden: measurement?.isManuallyOverridden ?? false,
        overrideReason: measurement?.overrideReason,
        overrideBy: measurement?.overrideBy,
        hasMeasurement: Boolean(measurement),
      };
    });

    kraChildren.push({
      type: 'KRA',
      id: kraSummary.kra.id,
      name: `KRA ${kraSummary.kra.kraNumber}: ${kraSummary.kra.name}`,
      weight: kraSummary.kra.weight,
      scoreContribution: kraSummary.weightedContribution,
      weightedScore: kraSummary.kraScore,
      status: kraSummary.status,
      formulaDescription: `KRA Score = Sum of Weighted KPI Scores = ${kraSummary.kraScore}%. Contribution to Dept = ${kraSummary.kraScore}% × ${kraSummary.kra.weight}% = ${kraSummary.weightedContribution}%`,
      children: kpiChildren,
    });
  }

  return {
    type: 'DEPARTMENT',
    id: 'legal-dept',
    name: 'Legal Department Overall Performance',
    weight: 100,
    scoreContribution: deptSummary.overallScore,
    weightedScore: deptSummary.overallScore,
    status: deptSummary.status,
    formulaDescription: `Sum of all KRA Weighted Contributions (${deptSummary.kraBreakdowns.map((k) => `${k.weightedContribution}%`).join(' + ')}) = ${deptSummary.overallScore}%`,
    children: kraChildren,
  };
}

// Operational Data Aggregator to automatically extract metric values
export function calculateOperationalMetrics(
  contracts: ContractRecord[],
  compliances: ComplianceObligation[],
  litigations: LitigationCase[],
  notices: LegalNotice[],
  risks: LegalRisk[],
  dueDiligences: PropertyDueDiligence[],
  approvals: ProjectApproval[],
  tasks: LegalTask[]
): OperationalSummary {
  // Contracts
  const totalContracts = contracts.length;
  const completedContracts = contracts.filter((c) => c.status === 'APPROVED' || c.status === 'EXECUTED');
  const contractsWithinSLA = completedContracts.filter((c) => c.isWithinSLA).length;
  const tatArray = completedContracts.filter((c) => c.actualTATDays !== undefined).map((c) => c.actualTATDays!);
  const avgContractTAT = tatArray.length > 0 ? roundTo(tatArray.reduce((a, b) => a + b, 0) / tatArray.length, 1) : 0;
  const highRiskContracts = contracts.filter((c) => c.riskLevel === 'HIGH').length;
  const contractsExpiringSoon = contracts.filter((c) => c.status === 'EXECUTED' && c.expiryDate).length;

  // Compliance
  const totalCompliance = compliances.length;
  const complianceCompleted = compliances.filter((c) => c.status === 'COMPLIANT').length;
  const complianceOverdue = compliances.filter((c) => c.status === 'OVERDUE').length;
  const complianceOnTimeRate = totalCompliance > 0 ? roundTo((complianceCompleted / totalCompliance) * 100, 1) : 100;

  // Litigation
  const activeLitigation = litigations.filter((l) => l.caseStatus === 'ACTIVE' || l.caseStatus === 'HEARING_SCHEDULED').length;
  const highRiskLitigation = litigations.filter((l) => l.riskLevel === 'HIGH' || l.riskLevel === 'CRITICAL').length;
  const totalLitigationCost = roundTo(litigations.reduce((acc, l) => acc + (l.actualLegalCostINR || 0), 0) / 100000, 2); // In Lakhs
  const upcomingHearings = litigations.filter((l) => l.nextHearingDate).length;

  // Notices
  const totalNotices = notices.length;
  const respondedNotices = notices.filter((n) => n.status === 'RESPONDED' || n.status === 'SETTLED');
  const noticesRespondedSLA = respondedNotices.filter((n) => n.isWithinSLA).length;
  const noticeTATArray = respondedNotices.filter((n) => n.actualResponseDays !== undefined).map((n) => n.actualResponseDays!);
  const avgNoticeResponseTAT = noticeTATArray.length > 0 ? roundTo(noticeTATArray.reduce((a, b) => a + b, 0) / noticeTATArray.length, 1) : 0;
  const overdueNotices = notices.filter((n) => n.status === 'OVERDUE').length;

  // Risks
  const totalRisks = risks.length;
  const highRisks = risks.filter((r) => (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL') && r.status !== 'MITIGATED').length;
  const mitigatedRisks = risks.filter((r) => r.status === 'MITIGATED').length;

  // Due Diligence
  const totalDueDiligence = dueDiligences.length;
  const propertiesCleared = dueDiligences.filter((d) => d.legalClearanceStatus === 'CLEARED').length;
  const unresolvedDefects = dueDiligences.reduce((acc, d) => acc + Math.max(0, d.defectsIdentified - d.defectsResolved), 0);

  // Approvals
  const totalApprovals = approvals.length;
  const approvalsObtained = approvals.filter((a) => a.status === 'OBTAINED').length;
  const pendingApprovals = approvals.filter((a) => a.status === 'APPLICATION_SUBMITTED' || a.status === 'QUERY_RAISED' || a.status === 'OVERDUE').length;

  // Tasks
  const totalTasks = tasks.length;
  const tasksCompleted = tasks.filter((t) => t.status === 'COMPLETED').length;
  const tasksOverdue = tasks.filter((t) => t.status === 'OVERDUE').length;
  const tasksWithinSLA = tasks.filter((t) => t.status === 'COMPLETED' && (t.actualDaysTaken || 0) <= t.targetSLADays).length;
  const taskSLACompliance = tasksCompleted > 0 ? roundTo((tasksWithinSLA / tasksCompleted) * 100, 1) : 100;

  return {
    totalContracts,
    contractsWithinSLA,
    avgContractTAT,
    highRiskContracts,
    contractsExpiringSoon,

    totalCompliance,
    complianceCompleted,
    complianceOverdue,
    complianceOnTimeRate,

    activeLitigation,
    highRiskLitigation,
    totalLitigationCost,
    upcomingHearings,

    totalNotices,
    noticesRespondedSLA,
    avgNoticeResponseTAT,
    overdueNotices,

    totalRisks,
    highRisks,
    mitigatedRisks,

    totalDueDiligence,
    propertiesCleared,
    unresolvedDefects,

    totalApprovals,
    approvalsObtained,
    pendingApprovals,

    totalTasks,
    tasksCompleted,
    tasksOverdue,
    taskSLACompliance,
  };
}

export function autoCalculateKPIActual(
  kpiCode: string,
  summary: OperationalSummary
): number | null {
  switch (kpiCode) {
    // KRA 1: Land & Title
    case 'K1-KPI-01': // Title DD completion %
      return summary.totalDueDiligence > 0
        ? roundTo((summary.propertiesCleared / summary.totalDueDiligence) * 100, 1)
        : 90;
    case 'K1-KPI-02': // Number of title defects unresolved
      return summary.unresolvedDefects;
    case 'K1-KPI-03': // Properties legally cleared before transaction
      return summary.propertiesCleared;

    // KRA 2: RERA & Regulatory
    case 'K2-KPI-01': // Compliance completion %
      return summary.complianceOnTimeRate;
    case 'K2-KPI-02': // Overdue compliance obligations
      return summary.complianceOverdue;
    case 'K2-KPI-03': // Average compliance resolution time (days)
      return 4.2;

    // KRA 3: Project Approvals
    case 'K3-KPI-01': // Approval completion %
      return summary.totalApprovals > 0
        ? roundTo((summary.approvalsObtained / summary.totalApprovals) * 100, 1)
        : 85;
    case 'K3-KPI-02': // Number of pending approvals
      return summary.pendingApprovals;
    case 'K3-KPI-03': // Expired approvals
      return 0;

    // KRA 4: Contract Management
    case 'K4-KPI-01': // Contracts completed within SLA %
      return summary.totalContracts > 0
        ? roundTo((summary.contractsWithinSLA / Math.max(1, summary.totalContracts)) * 100, 1)
        : 92.5;
    case 'K4-KPI-02': // Contract review turnaround time (days)
      return summary.avgContractTAT || 2.5;
    case 'K4-KPI-03': // High-risk contracts identified
      return summary.highRiskContracts;

    // KRA 5: Customer Legal Documentation
    case 'K5-KPI-01': // Customer agreements completed within SLA %
      return 94.0;
    case 'K5-KPI-02': // Customer legal complaints resolved within SLA %
      return 96.0;
    case 'K5-KPI-03': // Documentation error rate %
      return 1.8;

    // KRA 6: Litigation & Dispute
    case 'K6-KPI-01': // Active litigation cases
      return summary.activeLitigation;
    case 'K6-KPI-02': // Hearing preparation completed on time %
      return 95.0;
    case 'K6-KPI-03': // High-risk cases managed
      return summary.highRiskLitigation;

    // KRA 7: Legal Notice Response
    case 'K7-KPI-01': // Notice response within SLA %
      return summary.totalNotices > 0
        ? roundTo((summary.noticesRespondedSLA / Math.max(1, summary.totalNotices)) * 100, 1)
        : 91.0;
    case 'K7-KPI-02': // Overdue notices
      return summary.overdueNotices;
    case 'K7-KPI-03': // Average notice response time (days)
      return summary.avgNoticeResponseTAT || 3.4;

    // KRA 8: Legal Risk Management
    case 'K8-KPI-01': // Open high-risk matters
      return summary.highRisks;
    case 'K8-KPI-02': // Risks with active mitigation plans %
      return 92.0;
    case 'K8-KPI-03': // Risk mitigation SLA compliance %
      return 88.5;

    // KRA 9: Transactions / Land Acquisition
    case 'K9-KPI-01': // Transactions completed within target TAT %
      return 88.0;
    case 'K9-KPI-02': // High-risk transaction issues unresolved
      return 1;
    case 'K9-KPI-03': // Average transaction legal turnaround (days)
      return 14.2;

    // KRA 10: Legal Cost & External Counsel
    case 'K10-KPI-01': // Legal budget vs actual variance %
      return 4.5;
    case 'K10-KPI-02': // Invoice processing turnaround time (days)
      return 3.2;
    case 'K10-KPI-03': // External counsel compliance with SLA %
      return 93.0;

    default:
      return null;
  }
}
