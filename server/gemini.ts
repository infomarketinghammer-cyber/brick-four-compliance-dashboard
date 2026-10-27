import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { computeDepartmentScore } from './calculationEngine.js';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export async function askLegalIntelligenceAssistant(
  orgId: string,
  periodId: string,
  userQuestion: string
): Promise<string> {
  const state = db.getState();
  const kras = db.getKRAs(orgId);
  const kpis = db.getKPIs(orgId);
  const measurements = db.getMeasurements(orgId, periodId);
  const settings = db.getScoringSettings(orgId);
  const currentPeriod = state.periods.find((p) => p.id === periodId && p.organizationId === orgId);

  const deptScore = computeDepartmentScore(kras, kpis, measurements, settings);

  // Compile prompt context from real operational data
  const contextSummary = {
    period: currentPeriod?.name || periodId,
    overallDepartmentScore: `${deptScore.overallScore}%`,
    departmentStatus: deptScore.status,
    kraCount: kras.length,
    kraBreakdown: deptScore.kraBreakdowns.map((k) => ({
      kra: k.kra.name,
      weight: `${k.kra.weight}%`,
      score: `${k.kraScore}%`,
      contribution: `${k.weightedContribution}%`,
      status: k.status,
    })),
    highRisks: state.risks
      .filter((r) => r.organizationId === orgId && (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL'))
      .map((r) => ({
        description: r.description,
        score: r.riskScore,
        level: r.riskLevel,
        mitigation: r.mitigationPlan,
      })),
    activeLitigations: state.litigations
      .filter((l) => l.organizationId === orgId)
      .map((l) => ({
        caseNumber: l.caseNumber,
        court: l.court,
        parties: l.parties,
        risk: l.riskLevel,
        exposureINR: l.estimatedExposureINR,
      })),
    contractsExpiring: state.contracts
      .filter((c) => c.organizationId === orgId)
      .map((c) => ({
        title: c.contractTitle,
        counterparty: c.counterparty,
        status: c.status,
        tat: c.actualTATDays,
        withinSLA: c.isWithinSLA,
      })),
    complianceObligations: state.compliances
      .filter((c) => c.organizationId === orgId)
      .map((c) => ({
        requirement: c.requirement,
        authority: c.authority,
        status: c.status,
        dueDate: c.dueDate,
      })),
  };

  const client = getGeminiClient();

  if (client) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are the AI Legal Intelligence Advisor for the Legal Department of Brick Four (a leading Real Estate & Property Development organization).
You have real-time access to the department's actual KRA/KPI framework, operational records (contracts, RERA compliance, litigations, risks, land due diligence, approvals), and calculated scores.

Analyze the question based ONLY on the factual context provided below.
Rules:
1. Do not invent or hallucinate metrics, fake lawsuits, or non-existent numbers.
2. If asked about scores or decreases, refer to the exact weighted contributions and KPI metrics.
3. Be professional, direct, executive-ready, and analytical.
4. Structure your response with bullet points and bold key metrics.

REAL PERFORMANCE DATA CONTEXT:
${JSON.stringify(contextSummary, null, 2)}

USER INQUIRY:
${userQuestion}`,
      });

      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn('Gemini API call warning, falling back to analytical engine:', err?.message);
    }
  }

  // Deterministic Grounded Fallback Response (if no API key or offline) — computed only from live data
  const q = userQuestion.toLowerCase();
  const orgRisks = state.risks.filter((r) => r.organizationId === orgId);
  const orgCompliances = state.compliances.filter((c) => c.organizationId === orgId);
  const orgLitigations = state.litigations.filter((l) => l.organizationId === orgId);
  const orgContracts = state.contracts.filter((c) => c.organizationId === orgId);
  const behindKras = deptScore.kraBreakdowns.filter((k) => k.status === 'BEHIND' || k.status === 'AT_RISK');
  const criticalRisks = orgRisks.filter((r) => (r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH') && r.status !== 'MITIGATED');
  const overdueCompliance = orgCompliances.filter((c) => c.status === 'OVERDUE');
  const pendingCompliance = orgCompliances.filter((c) => c.status === 'PENDING');
  const fmtStatus = (s: string) => s.replace(/_/g, ' ');
  const formatCr = (inr: number) => `₹${(inr / 10000000).toFixed(2)} Cr`;

  if (measurements.length === 0) {
    return `**No KPI measurements have been recorded for ${currentPeriod?.name || periodId} yet.** Record actuals or run auto-calculation in Reconciliation before asking about performance for this period.`;
  }

  if (q.includes('below target') || q.includes('behind') || q.includes('at risk')) {
    if (behindKras.length === 0) {
      return `**Current Performance Status:** All KRAs are currently meeting or exceeding performance benchmarks. The Legal Department has achieved an overall score of **${deptScore.overallScore}%** (${fmtStatus(deptScore.status)}).`;
    }
    return `**KRAs Requiring Immediate Attention (${currentPeriod?.name || 'Current Period'}):**\n\n` +
      behindKras
        .sort((a, b) => a.kraScore - b.kraScore)
        .map(
          (k) =>
            `- **${k.kra.name}** (Weight: ${k.kra.weight}%): Currently scoring **${k.kraScore}%** (${fmtStatus(k.status)}). Contribution to department score is ${k.weightedContribution} pts; ${k.behindKpis} KPI(s) behind, ${k.atRiskKpis} at risk.`
        )
        .join('\n');
  }

  if (q.includes('project')) {
    const byProject = new Map<string, { exposure: number; highRisks: number; cases: number }>();
    for (const l of orgLitigations) {
      const e = byProject.get(l.projectId) || { exposure: 0, highRisks: 0, cases: 0 };
      e.exposure += l.estimatedExposureINR || 0;
      e.cases += 1;
      byProject.set(l.projectId, e);
    }
    for (const r of criticalRisks) {
      const e = byProject.get(r.projectId) || { exposure: 0, highRisks: 0, cases: 0 };
      e.highRisks += 1;
      byProject.set(r.projectId, e);
    }
    const ranked = [...byProject.entries()].sort((a, b) => b[1].exposure - a[1].exposure || b[1].highRisks - a[1].highRisks);
    if (ranked.length === 0) return '**No litigation or open high-risk matters are linked to any project.**';
    return `**Projects Ranked by Legal Exposure:**\n\n` +
      ranked
        .map(([projectId, e], i) => {
          const proj = state.projects.find((p) => p.id === projectId);
          const label = proj ? `${proj.name} (${proj.code}, ${proj.location})` : projectId || 'Not linked to a project';
          return `${i + 1}. **${label}**: ${formatCr(e.exposure)} litigation exposure across ${e.cases} case(s); ${e.highRisks} open high/critical risk(s).`;
        })
        .join('\n');
  }

  if (q.includes('contract') || q.includes('expiry') || q.includes('sla')) {
    const breached = orgContracts.filter((c) => c.isWithinSLA === false);
    const pending = orgContracts.filter((c) => !['EXECUTED', 'APPROVED', 'EXPIRED', 'TERMINATED'].includes(c.status));
    const withExpiry = orgContracts.filter((c) => c.expiryDate).sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!));
    return `**Contract SLA & Expiry Watch:**\n\n- Contracts in register: **${orgContracts.length}**\n- SLA breaches: **${breached.length}**${breached.length ? ` (${breached.map((c) => c.contractTitle).join('; ')})` : ''}\n- Awaiting review/approval: **${pending.length}**${pending.length ? ` (${pending.map((c) => `${c.contractTitle} – ${fmtStatus(c.status)}`).join('; ')})` : ''}\n` +
      (withExpiry.length ? `- Next expiries: ${withExpiry.slice(0, 3).map((c) => `${c.contractTitle} (${c.expiryDate})`).join('; ')}` : '- No contract expiry dates recorded.');
  }

  if (q.includes('risk') || q.includes('critical')) {
    if (criticalRisks.length === 0) return '**No open high or critical legal risks are recorded in the risk register.**';
    return `**High & Critical Legal Risks Identified:**\n\n` +
      criticalRisks
        .map(
          (r, i) =>
            `${i + 1}. **${r.riskCategory} Risk** (Score: ${r.riskScore}/25 - ${r.riskLevel}, ${fmtStatus(r.status)}): ${r.description}\n   *Mitigation:* ${r.mitigationPlan}`
        )
        .join('\n\n');
  }

  if (q.includes('compliance') || q.includes('overdue') || q.includes('rera')) {
    const listItems = (items: typeof orgCompliances) => items.map((c) => `  - ${c.requirement} (${c.authority}, due ${c.dueDate})`).join('\n');
    return `**RERA & Statutory Compliance Status:**\n\n- Compliance items monitored: **${orgCompliances.length}**\n- Compliant: **${orgCompliances.filter((c) => c.status === 'COMPLIANT').length}**\n- Overdue: **${overdueCompliance.length}**` +
      (overdueCompliance.length ? `\n${listItems(overdueCompliance)}` : '') +
      `\n- Pending: **${pendingCompliance.length}**` +
      (pendingCompliance.length ? `\n${listItems(pendingCompliance)}` : '');
  }

  const sortedKras = [...deptScore.kraBreakdowns].sort((a, b) => b.kraScore - a.kraScore);
  const top = sortedKras[0];
  const bottom = sortedKras[sortedKras.length - 1];
  const totalExposure = orgLitigations.reduce((a, l) => a + (l.estimatedExposureINR || 0), 0);
  const completedContracts = orgContracts.filter((c) => c.status === 'APPROVED' || c.status === 'EXECUTED');
  const withinSla = completedContracts.filter((c) => c.isWithinSLA).length;

  return `**Legal Department Performance Briefing (${currentPeriod?.name || 'Current Period'}):**\n\n` +
    `- **Overall Legal Department Score:** **${deptScore.overallScore}%** (${fmtStatus(deptScore.status)})\n` +
    (top ? `- **Top Performing KRA:** ${top.kra.name} (Score: ${top.kraScore}%, Weight: ${top.kra.weight}%)\n` : '') +
    (bottom && bottom !== top ? `- **Weakest KRA:** ${bottom.kra.name} (Score: ${bottom.kraScore}%, Weight: ${bottom.kra.weight}%)\n` : '') +
    `- **Litigation Exposure:** ${formatCr(totalExposure)} across ${orgLitigations.length} proceeding(s)\n` +
    `- **Contract Review Efficiency:** ${withinSla} of ${completedContracts.length} completed contracts within SLA\n` +
    `- **Statutory Compliance:** ${orgCompliances.filter((c) => c.status === 'COMPLIANT').length} of ${orgCompliances.length} obligations compliant, ${overdueCompliance.length} overdue\n` +
    `- **Open High/Critical Risks:** ${criticalRisks.length}`;
}
