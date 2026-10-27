import { config as loadEnv } from 'dotenv';
import express from 'express';
import path from 'path';
import crypto from 'crypto';

loadEnv({ path: ['.env.local', '.env'], quiet: true });
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';
import {
  computeDepartmentScore,
  generateScoreExplainabilityTree,
  calculateKPIAchievement,
  autoCalculateKPIActual,
  calculateOperationalMetrics,
} from './server/calculationEngine.js';
import { askLegalIntelligenceAssistant } from './server/gemini.js';
import type { KRA, KPI, KPIMeasurement, UserRole, PerformancePeriod, ScoringSettings } from './src/types.js';

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  level: 1 | 2 | 3;
  designation: string;
  department?: string;
  wing?: string;
  managerId?: string | null;
  managerName?: string | null;
  subordinateIds?: string[];
  assignedKras?: string[];
  assignedKpis?: string[];
  organizationId: string;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Sessions are stateless HMAC-signed tokens so they stay valid across server restarts and across
// multiple hosted instances (Cloud Run / AI Studio), where an in-memory session map is not shared.
// The signing key must be identical on every instance: SESSION_SECRET, else derived from GEMINI_API_KEY.
const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.GEMINI_API_KEY) {
    return crypto.createHash('sha256').update(`compliance-dashboard-session:${process.env.GEMINI_API_KEY}`).digest('hex');
  }
  console.warn('[auth] SESSION_SECRET is not set; using an insecure development signing key. Set SESSION_SECRET in production.');
  return 'compliance-dashboard-insecure-dev-session-key';
})();

// Tokens revoked by logout on this instance (best effort; tokens also expire after SESSION_TTL_MS)
const revokedTokens = new Map<string, number>();

function signSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): { uid: string; exp: number } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    if (revokedTokens.has(token)) return null;
    return data;
  } catch {
    return null;
  }
}

const OPERATIONAL_ENTITIES = [
  'contracts',
  'compliances',
  'litigations',
  'notices',
  'risks',
  'dueDiligences',
  'approvals',
  'transactions',
  'tasks',
] as const;
type OperationalEntity = (typeof OPERATIONAL_ENTITIES)[number];

// Minimum fields a new operational record must carry to be meaningful in registers and KPI calculation
const OPERATIONAL_REQUIRED_FIELDS: Record<OperationalEntity, string[]> = {
  contracts: ['contractTitle', 'counterparty', 'contractType', 'status'],
  compliances: ['requirement', 'authority', 'dueDate', 'status'],
  litigations: ['caseNumber', 'court', 'parties', 'caseStatus', 'riskLevel'],
  notices: ['noticeType', 'direction', 'sender', 'dateReceived', 'status'],
  risks: ['description', 'riskCategory', 'probability', 'impact', 'status'],
  dueDiligences: ['propertyName', 'location', 'legalClearanceStatus'],
  approvals: ['approvalType', 'authority', 'applicationDate', 'status'],
  transactions: ['transactionTitle', 'transactionType', 'counterparty', 'status'],
  tasks: ['taskTitle', 'priority', 'dueDate', 'status'],
};

const KPI_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_RANGE', 'EXACT_TARGET'];

const KRA_EDITABLE_FIELDS = ['name', 'description', 'ownerId', 'ownerName', 'weight', 'active', 'orderIndex', 'effectivePeriod', 'department', 'wing'] as const;
const KPI_EDITABLE_FIELDS = [
  'kraId', 'kpiCode', 'name', 'description', 'ownerId', 'ownerName', 'department', 'wing', 'measurementType', 'unit',
  'frequency', 'direction', 'calculationMethod', 'dataSource', 'dataSourceMetric', 'weight', 'minAcceptableValue',
  'targetValue', 'maxCapValue', 'active', 'effectiveDate', 'endDate',
] as const;

function sanitizeUser(user: any): SessionUser {
  const { password: _, ...safeUser } = user;
  return safeUser as SessionUser;
}

function hashPassword(raw: string): Buffer {
  return crypto.createHash('sha256').update(raw).digest();
}

function passwordsMatch(input: string, stored: string): boolean {
  return crypto.timingSafeEqual(hashPassword(input), hashPassword(stored));
}

function pick<T extends object>(source: any, fields: readonly string[]): Partial<T> {
  const out: any = {};
  for (const f of fields) {
    if (source && source[f] !== undefined) out[f] = source[f];
  }
  return out;
}

function isFiniteNumber(v: unknown): boolean {
  return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
}

function isAdminRole(role: UserRole | null | undefined) {
  return role === 'LEGAL_HEAD' || role === 'SUPER_ADMIN';
}

// Previous period of the same type (monthly/quarterly) ordered by start date, and a trailing trend window
function getPeriodContext(orgId: string, periodId: string) {
  const state = db.getState();
  const current = state.periods.find((p) => p.id === periodId && p.organizationId === orgId);
  if (!current) return { current: undefined, previous: undefined, trendPeriods: [] as PerformancePeriod[] };
  const sameType = state.periods
    .filter((p) => p.organizationId === orgId && p.type === current.type)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const idx = sameType.findIndex((p) => p.id === current.id);
  return {
    current,
    previous: idx > 0 ? sameType[idx - 1] : undefined,
    trendPeriods: sameType.slice(Math.max(0, idx - 5), idx + 1),
  };
}

// Re-derive achievement/score/status from the stored actual so displayed values always reflect current KPI config & settings
function withLiveCalculation(m: KPIMeasurement, kpis: KPI[], settings: ScoringSettings): KPIMeasurement {
  const kpi = kpis.find((k) => k.id === m.kpiId);
  if (!kpi) return m;
  const calc = calculateKPIAchievement(kpi, m.actual, kpi.targetValue, settings);
  return { ...m, target: kpi.targetValue, achievement: calc.achievement, weightedScore: calc.weightedScore, status: calc.status };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // Session authentication: the organization is always taken from the verified session, never from a client header
  app.use((req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.headers['x-session-token']) {
      token = String(req.headers['x-session-token']);
    }

    const claims = token ? verifySessionToken(token) : null;
    // Always resolve the user fresh from the directory so role changes apply immediately
    const dbUser = claims ? db.getState().users.find((u) => u.id === claims.uid) : undefined;
    const user = dbUser ? sanitizeUser(dbUser) : null;

    (req as any).user = user;
    (req as any).userId = user?.id ?? null;
    (req as any).userRole = user?.role ?? null;
    (req as any).sessionToken = user ? token : null;
    (req as any).organizationId = user?.organizationId ?? ((req.headers['x-organization-id'] as string) || 'org-apex-01');
    next();
  });

  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({
        error: 'Unauthorized: Your session has expired or is invalid. Please sign in again.',
      });
    }
    next();
  };

  // Strict role guard for Admin / HOD governance endpoints
  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized: Your session has expired or is invalid. Please sign in again.' });
    }
    if (!isAdminRole((req as any).userRole)) {
      return res.status(403).json({
        error: 'Forbidden: This action requires Head of Department (LEGAL_HEAD) or SUPER_ADMIN authorization.',
      });
    }
    next();
  };

  // Audit identity of the authenticated caller
  const actor = (req: express.Request) => {
    const u = (req as any).user as SessionUser;
    return { userId: u.id, userName: u.name, userRole: u.role };
  };

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Authentication: login by corporate email (or its local part) and exact password
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const state = db.getState();

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password.trim()) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    const user = state.users.find((u) => {
      const uEmail = u.email.toLowerCase();
      return uEmail === cleanEmail || uEmail.split('@')[0] === cleanEmail;
    });

    // Same message for unknown user and wrong password so accounts cannot be enumerated
    if (!user || !user.password || !passwordsMatch(cleanPass, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signSessionToken(user.id);
    const safeUser = sanitizeUser(user);

    db.addAuditLog({
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN',
      entity: 'USER_SESSION',
      entityId: user.id,
      newValue: `${user.name} (${user.designation}) authenticated successfully via corporate credentials`,
    });

    res.json({ success: true, user: safeUser, token });
  });

  // Everything below requires a valid session
  app.use('/api', requireAuth);

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: (req as any).user });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = (req as any).sessionToken;
    if (token) {
      const now = Date.now();
      for (const [t, exp] of revokedTokens) if (exp < now) revokedTokens.delete(t);
      revokedTokens.set(token, now + SESSION_TTL_MS);
    }
    res.json({ success: true });
  });

  // Employee directory (WITHOUT passwords)
  app.get('/api/auth/users', (req, res) => {
    const orgId = (req as any).organizationId;
    const safeUsers = db.getState().users.filter((u) => u.organizationId === orgId).map(sanitizeUser);

    res.json({
      users: safeUsers,
      count: safeUsers.length,
      head: safeUsers.find((u) => u.role === 'LEGAL_HEAD'),
      managers: safeUsers.filter((u) => u.role === 'LEGAL_MANAGER'),
      team: safeUsers.filter((u) => u.role === 'LEGAL_EXECUTIVE'),
    });
  });

  // Bootstrap initial configuration & metadata (WITHOUT passwords)
  app.get('/api/bootstrap', (req, res) => {
    const orgId = (req as any).organizationId;
    const state = db.getState();

    const org = state.organizations.find((o) => o.id === orgId) || state.organizations[0];
    const companies = state.companies.filter((c) => c.organizationId === org.id);
    const projects = state.projects.filter((p) => p.organizationId === org.id);
    const users = state.users.filter((u) => u.organizationId === org.id).map(sanitizeUser);
    const financialYears = state.financialYears.filter((f) => f.organizationId === org.id);
    const periods = state.periods.filter((p) => p.organizationId === org.id);
    const scoringSettings = db.getScoringSettings(org.id);

    const activePeriod = periods.find((p) => p.status === 'UNDER_REVIEW' || p.status === 'OPEN') || periods[periods.length - 1];

    res.json({
      organization: org,
      allOrganizations: [org],
      companies,
      projects,
      users,
      financialYears,
      periods,
      activePeriod,
      scoringSettings,
    });
  });

  // KRAs endpoints
  app.get('/api/kras', (req, res) => {
    const orgId = (req as any).organizationId;
    const kras = db.getKRAs(orgId).sort((a, b) => a.orderIndex - b.orderIndex);
    const totalWeight = kras.reduce((acc, k) => acc + (k.active ? k.weight : 0), 0);
    res.json({
      kras,
      totalWeight,
      isValidTotalWeight: Math.abs(totalWeight - 100) < 0.01,
      remainingWeight: 100 - totalWeight,
    });
  });

  app.post('/api/kras', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const state = db.getState();
    const { name, description, ownerId, weight, orderIndex, effectivePeriod, department, wing } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'KRA name is required.' });
    }
    if (!isFiniteNumber(weight) || Number(weight) < 0 || Number(weight) > 100) {
      return res.status(400).json({ error: 'KRA weight must be a number between 0 and 100.' });
    }

    const owner = state.users.find((u) => u.id === ownerId && u.organizationId === orgId) || (req as any).user;
    const orgKras = state.kras.filter((k) => k.organizationId === orgId);

    const newKRA: KRA = {
      id: `kra-${Date.now()}`,
      organizationId: orgId,
      kraNumber: orgKras.reduce((max, k) => Math.max(max, k.kraNumber), 0) + 1,
      name: name.trim(),
      description: description || '',
      ownerId: owner.id,
      ownerName: owner.name,
      weight: Number(weight),
      active: true,
      orderIndex: Number(orderIndex) || orgKras.length + 1,
      effectivePeriod: effectivePeriod || 'FY 2026-27',
      department,
      wing,
    };

    state.kras.push(newKRA);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'CREATE_KRA',
      entity: 'KRA',
      entityId: newKRA.id,
      newValue: `Created KRA: ${newKRA.name} with weight ${newKRA.weight}%`,
    });

    res.status(201).json(newKRA);
  });

  app.put('/api/kras/:id', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const state = db.getState();
    const kra = state.kras.find((k) => k.id === req.params.id && k.organizationId === orgId);

    if (!kra) {
      return res.status(404).json({ error: 'KRA not found' });
    }

    const updates = pick<KRA>(req.body, KRA_EDITABLE_FIELDS);
    if (updates.weight !== undefined) {
      if (!isFiniteNumber(updates.weight) || Number(updates.weight) < 0 || Number(updates.weight) > 100) {
        return res.status(400).json({ error: 'KRA weight must be a number between 0 and 100.' });
      }
      updates.weight = Number(updates.weight);
    }
    if (updates.name !== undefined && !String(updates.name).trim()) {
      return res.status(400).json({ error: 'KRA name cannot be empty.' });
    }

    const oldWeight = kra.weight;
    Object.assign(kra, updates);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: updates.weight !== undefined && updates.weight !== oldWeight ? 'UPDATE_KRA_WEIGHT' : 'UPDATE_KRA',
      entity: 'KRA',
      entityId: kra.id,
      oldValue: updates.weight !== undefined && updates.weight !== oldWeight ? `${oldWeight}%` : undefined,
      newValue: updates.weight !== undefined && updates.weight !== oldWeight ? `${kra.weight}%` : `Updated KRA: ${kra.name}`,
      reason: req.body.reason || 'KRA configuration adjustment',
    });

    res.json(kra);
  });

  // Bulk update KRA weights (must balance to 100%)
  app.post('/api/kras/weights', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const state = db.getState();
    const { weights, reason } = (req.body || {}) as { weights: Record<string, number>; reason?: string };

    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({ error: 'A weights map of { kraId: weight } is required.' });
    }

    const orgKras = state.kras.filter((k) => k.organizationId === orgId);
    for (const [id, weight] of Object.entries(weights)) {
      if (!orgKras.some((k) => k.id === id)) {
        return res.status(400).json({ error: `Unknown KRA id: ${id}` });
      }
      if (!isFiniteNumber(weight) || Number(weight) < 0 || Number(weight) > 100) {
        return res.status(400).json({ error: 'Each KRA weight must be a number between 0 and 100.' });
      }
    }

    // Validate the resulting total across all active KRAs before mutating anything
    const projectedTotal = orgKras
      .filter((k) => k.active)
      .reduce((acc, k) => acc + (weights[k.id] !== undefined ? Number(weights[k.id]) : k.weight), 0);
    if (Math.abs(projectedTotal - 100) >= 0.01) {
      return res.status(400).json({
        error: `Active KRA weights must total exactly 100% (submitted total: ${Math.round(projectedTotal * 100) / 100}%).`,
      });
    }

    for (const [id, weight] of Object.entries(weights)) {
      const kra = orgKras.find((k) => k.id === id)!;
      const oldWeight = kra.weight;
      if (oldWeight === Number(weight)) continue;
      kra.weight = Number(weight);

      db.addAuditLog({
        organizationId: orgId,
        ...actor(req),
        action: 'BULK_UPDATE_KRA_WEIGHT',
        entity: 'KRA',
        entityId: kra.id,
        oldValue: `${oldWeight}%`,
        newValue: `${kra.weight}%`,
        reason: reason || 'Weight balancing',
      });
    }

    res.json({
      success: true,
      totalWeight: projectedTotal,
      isValid: true,
      kras: db.getKRAs(orgId),
    });
  });

  // KPIs endpoints
  app.get('/api/kpis', (req, res) => {
    const orgId = (req as any).organizationId;
    const kraId = req.query.kraId as string;
    let kpis = db.getKPIs(orgId);
    if (kraId) {
      kpis = kpis.filter((k) => k.kraId === kraId);
    }
    res.json(kpis);
  });

  const validateKpiPayload = (orgId: string, data: any, isCreate: boolean): string | null => {
    const state = db.getState();
    if (isCreate || data.name !== undefined) {
      if (!data.name || !String(data.name).trim()) return 'KPI name is required.';
    }
    if (isCreate || data.kraId !== undefined) {
      if (!state.kras.some((k) => k.id === data.kraId && k.organizationId === orgId)) return 'A valid parent KRA is required.';
    }
    if (data.direction !== undefined && !KPI_DIRECTIONS.includes(data.direction)) {
      return `Direction must be one of: ${KPI_DIRECTIONS.join(', ')}`;
    }
    if ((isCreate || data.targetValue !== undefined) && !isFiniteNumber(data.targetValue)) return 'Target value must be a number.';
    if (data.weight !== undefined && (!isFiniteNumber(data.weight) || Number(data.weight) <= 0 || Number(data.weight) > 100)) {
      return 'KPI weight must be a number between 1 and 100.';
    }
    if (data.minAcceptableValue !== undefined && data.minAcceptableValue !== null && !isFiniteNumber(data.minAcceptableValue)) {
      return 'Minimum acceptable value must be a number.';
    }
    if (data.maxCapValue !== undefined && data.maxCapValue !== null && (!isFiniteNumber(data.maxCapValue) || Number(data.maxCapValue) < 100)) {
      return 'Achievement cap must be a number of at least 100.';
    }
    if (data.kpiCode !== undefined) {
      const dup = state.kpis.find((k) => k.organizationId === orgId && k.kpiCode === data.kpiCode && k.id !== data.id);
      if (dup) return `KPI code ${data.kpiCode} is already used by "${dup.name}".`;
    }
    return null;
  };

  app.post('/api/kpis', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const state = db.getState();
    const data = req.body || {};
    const currentUser = (req as any).user as SessionUser;

    const kpiCode = data.kpiCode || `KPI-${Date.now().toString().slice(-4)}`;
    const validationError = validateKpiPayload(orgId, { ...data, kpiCode }, true);
    if (validationError) return res.status(400).json({ error: validationError });

    const owner = state.users.find((u) => u.id === data.ownerId && u.organizationId === orgId) || currentUser;

    const newKPI: KPI = {
      id: `kpi-${Date.now()}`,
      organizationId: orgId,
      kraId: data.kraId,
      kpiCode,
      name: String(data.name).trim(),
      description: data.description || '',
      ownerId: owner.id,
      ownerName: owner.name,
      measurementType: data.measurementType || 'PERCENTAGE',
      unit: data.unit || '%',
      frequency: data.frequency || 'MONTHLY',
      direction: data.direction || 'HIGHER_IS_BETTER',
      calculationMethod: data.calculationMethod || 'MANUAL',
      dataSource: data.dataSource,
      weight: isFiniteNumber(data.weight) ? Number(data.weight) : 30,
      minAcceptableValue: isFiniteNumber(data.minAcceptableValue) ? Number(data.minAcceptableValue) : undefined,
      targetValue: Number(data.targetValue),
      maxCapValue: isFiniteNumber(data.maxCapValue) ? Number(data.maxCapValue) : undefined,
      active: true,
      effectiveDate: data.effectiveDate || new Date().toISOString().slice(0, 10),
    };

    state.kpis.push(newKPI);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'CREATE_KPI',
      entity: 'KPI',
      entityId: newKPI.id,
      newValue: `Created KPI: ${newKPI.name} (Code: ${newKPI.kpiCode}) with target ${newKPI.targetValue}`,
    });

    res.status(201).json(newKPI);
  });

  app.put('/api/kpis/:id', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const state = db.getState();
    const kpi = state.kpis.find((k) => k.id === req.params.id && k.organizationId === orgId);

    if (!kpi) {
      return res.status(404).json({ error: 'KPI not found' });
    }

    const updates = pick<KPI>(req.body, KPI_EDITABLE_FIELDS) as any;
    const validationError = validateKpiPayload(orgId, { ...updates, id: kpi.id }, false);
    if (validationError) return res.status(400).json({ error: validationError });

    for (const numericField of ['weight', 'targetValue', 'minAcceptableValue', 'maxCapValue']) {
      if (updates[numericField] === null || updates[numericField] === '') updates[numericField] = undefined;
      else if (updates[numericField] !== undefined) updates[numericField] = Number(updates[numericField]);
    }
    if (updates.ownerId) {
      const owner = state.users.find((u) => u.id === updates.ownerId && u.organizationId === orgId);
      if (owner) updates.ownerName = owner.name;
    }

    Object.assign(kpi, updates);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'UPDATE_KPI',
      entity: 'KPI',
      entityId: kpi.id,
      newValue: `Updated KPI: ${kpi.name} (target ${kpi.targetValue} ${kpi.unit}, weight ${kpi.weight}%)`,
      reason: req.body.reason || 'KPI configuration adjustment',
    });

    res.json(kpi);
  });

  // Scoring Calculation Engine API
  app.get('/api/scoring/calculate', (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = (req.query.periodId as string) || 'period-2026-09';
    const state = db.getState();

    const kras = db.getKRAs(orgId);
    const kpis = db.getKPIs(orgId);
    const measurements = db.getMeasurements(orgId, periodId);
    const settings = db.getScoringSettings(orgId);

    const summary = computeDepartmentScore(kras, kpis, measurements, settings);

    // Previous period of the same type for comparison, plus a trailing trend window
    const { previous, trendPeriods } = getPeriodContext(orgId, periodId);
    const prevSummary = previous
      ? computeDepartmentScore(kras, kpis, db.getMeasurements(orgId, previous.id), settings)
      : null;
    const scoreDiff = prevSummary ? Math.round((summary.overallScore - prevSummary.overallScore) * 100) / 100 : 0;

    const trend = trendPeriods.map((p) => {
      const pMsr = db.getMeasurements(orgId, p.id);
      return {
        periodId: p.id,
        periodName: p.name,
        hasData: pMsr.length > 0,
        score: pMsr.length > 0 ? computeDepartmentScore(kras, kpis, pMsr, settings).overallScore : null,
      };
    });

    const explainabilityTree = generateScoreExplainabilityTree(kras, kpis, measurements, settings);

    const opMetrics = calculateOperationalMetrics(
      state.contracts.filter((c) => c.organizationId === orgId),
      state.compliances.filter((c) => c.organizationId === orgId),
      state.litigations.filter((l) => l.organizationId === orgId),
      state.notices.filter((n) => n.organizationId === orgId),
      state.risks.filter((r) => r.organizationId === orgId),
      state.dueDiligences.filter((d) => d.organizationId === orgId),
      state.approvals.filter((a) => a.organizationId === orgId),
      state.tasks.filter((t) => t.organizationId === orgId)
    );

    res.json({
      periodId,
      departmentSummary: summary,
      previousPeriodSummary: prevSummary
        ? { ...prevSummary, periodId: previous!.id, periodName: previous!.name }
        : { overallScore: 0, status: 'BEHIND', periodId: null, periodName: null },
      scoreDiff,
      trend,
      measuredKpiCount: measurements.length,
      explainabilityTree,
      operationalSummary: opMetrics,
    });
  });

  // Scoring Settings API
  app.get('/api/scoring/settings', (req, res) => {
    const orgId = (req as any).organizationId;
    res.json(db.getScoringSettings(orgId));
  });

  app.put('/api/scoring/settings', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const current = db.getScoringSettings(orgId);
    const body = req.body || {};
    const next: ScoringSettings = { ...current };

    for (const field of ['behindThreshold', 'atRiskThreshold', 'onTrackThreshold', 'maxAchievementCap', 'minAchievementFloor', 'roundingDecimals'] as const) {
      if (body[field] !== undefined) {
        if (!isFiniteNumber(body[field])) return res.status(400).json({ error: `${field} must be a number.` });
        (next as any)[field] = Number(body[field]);
      }
    }
    if (body.enforce100PercentWeight !== undefined) next.enforce100PercentWeight = Boolean(body.enforce100PercentWeight);

    if (!(next.behindThreshold > 0 && next.behindThreshold < next.atRiskThreshold && next.atRiskThreshold <= next.onTrackThreshold)) {
      return res.status(400).json({ error: 'Thresholds must satisfy 0 < Behind < At Risk ≤ On Track.' });
    }
    if (next.onTrackThreshold > 200) return res.status(400).json({ error: 'On Track threshold cannot exceed 200%.' });
    if (next.maxAchievementCap < 100 || next.maxAchievementCap > 200) {
      return res.status(400).json({ error: 'Maximum achievement cap must be between 100% and 200%.' });
    }
    if (next.minAchievementFloor < 0 || next.minAchievementFloor >= next.behindThreshold) {
      return res.status(400).json({ error: 'Achievement floor must be at least 0 and below the Behind threshold.' });
    }
    if (!Number.isInteger(next.roundingDecimals) || next.roundingDecimals < 0 || next.roundingDecimals > 4) {
      return res.status(400).json({ error: 'Decimal precision must be a whole number from 0 to 4.' });
    }

    const updated = db.updateScoringSettings(orgId, next);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'UPDATE_SCORING_SETTINGS',
      entity: 'SCORING_CONFIG',
      oldValue: JSON.stringify(current),
      newValue: JSON.stringify(updated),
    });

    res.json(updated);
  });

  // Measurements API (achievement values are always re-derived with the current KPI config and settings)
  app.get('/api/measurements', (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = req.query.periodId as string;
    const kpis = db.getKPIs(orgId);
    const settings = db.getScoringSettings(orgId);
    res.json(db.getMeasurements(orgId, periodId).map((m) => withLiveCalculation(m, kpis, settings)));
  });

  const getLockedPeriodError = (orgId: string, periodId: string): { status: number; error: string } | null => {
    const period = db.getState().periods.find((p) => p.id === periodId && p.organizationId === orgId);
    if (!period) return { status: 404, error: 'Performance period not found.' };
    if (period.status === 'LOCKED') {
      return { status: 403, error: `${period.name} is LOCKED. Reopen the period with an authorized reason before changing it.` };
    }
    return null;
  };

  // Enter/Update single actual value (ADMIN-ONLY Reconciliation: LEGAL_HEAD or SUPER_ADMIN)
  app.post('/api/measurements', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user;
    const state = db.getState();
    const { kpiId, periodId, actual, comments } = req.body || {};

    if (!isFiniteNumber(actual)) {
      return res.status(400).json({ error: 'Actual value must be a number.' });
    }
    const lockErr = getLockedPeriodError(orgId, periodId);
    if (lockErr) return res.status(lockErr.status).json({ error: lockErr.error });

    const kpi = state.kpis.find((k) => k.id === kpiId && k.organizationId === orgId);
    if (!kpi) return res.status(404).json({ error: 'KPI not found' });

    let measurement = state.measurements.find(
      (m) => m.kpiId === kpiId && m.periodId === periodId && m.organizationId === orgId
    );
    const oldActual = measurement?.actual;

    const calc = calculateKPIAchievement(kpi, Number(actual), kpi.targetValue, db.getScoringSettings(orgId));

    if (measurement) {
      measurement.actual = Number(actual);
      measurement.target = kpi.targetValue;
      measurement.achievement = calc.achievement;
      measurement.weightedScore = calc.weightedScore;
      measurement.status = calc.status;
      measurement.calculatedAutomatically = false;
      measurement.comments = comments || measurement.comments;
      measurement.submittedBy = currentUser.id;
      measurement.submittedDate = new Date().toISOString();
    } else {
      measurement = {
        id: `msr-${kpiId}-${periodId}`,
        organizationId: orgId,
        kpiId,
        periodId,
        target: kpi.targetValue,
        actual: Number(actual),
        achievement: calc.achievement,
        weightedScore: calc.weightedScore,
        status: calc.status,
        approvalStatus: 'DRAFT',
        calculatedAutomatically: false,
        isManuallyOverridden: false,
        submittedBy: currentUser.id,
        submittedDate: new Date().toISOString(),
        comments,
      };
      state.measurements.push(measurement);
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'ADMIN_UPDATE_KPI_ACTUAL',
      entity: 'KPI_MEASUREMENT',
      entityId: measurement.id,
      oldValue: oldActual !== undefined ? `${oldActual} ${kpi.unit}` : undefined,
      newValue: `${currentUser.name} (${currentUser.role}) recorded actual ${actual} ${kpi.unit} for ${kpi.name} (Achievement: ${calc.achievement}%)`,
      reason: comments,
    });

    res.json(measurement);
  });

  // Auto-calculate ALL automatic KPIs from operational records (ADMIN-ONLY)
  app.post('/api/measurements/auto-calculate-all', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = req.body?.periodId || 'period-2026-09';
    const state = db.getState();

    const lockErr = getLockedPeriodError(orgId, periodId);
    if (lockErr) return res.status(lockErr.status).json({ error: lockErr.error });

    const opMetrics = calculateOperationalMetrics(
      state.contracts.filter((c) => c.organizationId === orgId),
      state.compliances.filter((c) => c.organizationId === orgId),
      state.litigations.filter((l) => l.organizationId === orgId),
      state.notices.filter((n) => n.organizationId === orgId),
      state.risks.filter((r) => r.organizationId === orgId),
      state.dueDiligences.filter((d) => d.organizationId === orgId),
      state.approvals.filter((a) => a.organizationId === orgId),
      state.tasks.filter((t) => t.organizationId === orgId)
    );

    const kpis = db.getKPIs(orgId);
    const settings = db.getScoringSettings(orgId);
    const updatedCount: string[] = [];
    const skippedOverrides: string[] = [];

    for (const kpi of kpis) {
      if (kpi.calculationMethod !== 'AUTOMATIC') continue;
      const autoVal = autoCalculateKPIActual(kpi.kpiCode, opMetrics);
      if (autoVal === null) continue;

      let measurement = state.measurements.find(
        (m) => m.kpiId === kpi.id && m.periodId === periodId && m.organizationId === orgId
      );

      // Never silently overwrite an authorized manual override
      if (measurement?.isManuallyOverridden) {
        skippedOverrides.push(kpi.kpiCode);
        continue;
      }

      const calc = calculateKPIAchievement(kpi, autoVal, kpi.targetValue, settings);

      if (measurement) {
        measurement.actual = autoVal;
        measurement.target = kpi.targetValue;
        measurement.achievement = calc.achievement;
        measurement.weightedScore = calc.weightedScore;
        measurement.status = calc.status;
        measurement.calculatedAutomatically = true;
      } else {
        measurement = {
          id: `msr-${kpi.id}-${periodId}`,
          organizationId: orgId,
          kpiId: kpi.id,
          periodId,
          target: kpi.targetValue,
          actual: autoVal,
          achievement: calc.achievement,
          weightedScore: calc.weightedScore,
          status: calc.status,
          approvalStatus: 'DRAFT',
          calculatedAutomatically: true,
          isManuallyOverridden: false,
          submittedBy: 'SYSTEM_CALCULATION_ENGINE',
          submittedDate: new Date().toISOString(),
        };
        state.measurements.push(measurement);
      }
      updatedCount.push(kpi.kpiCode);
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'AUTO_CALCULATE_MEASUREMENTS',
      entity: 'KPI_ENGINE',
      newValue: `Auto-calculated ${updatedCount.length} KPIs from operational registers for ${periodId}` +
        (skippedOverrides.length ? ` (kept ${skippedOverrides.length} manual overrides: ${skippedOverrides.join(', ')})` : ''),
    });

    res.json({
      success: true,
      updatedCount: updatedCount.length,
      kpiCodes: updatedCount,
      skippedOverrides,
      measurements: db.getMeasurements(orgId, periodId),
    });
  });

  // Manual Override Endpoint (Section 54 - ADMIN-ONLY)
  app.post('/api/measurements/override', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user;
    const state = db.getState();
    const { kpiId, periodId, overrideValue, reason } = req.body || {};

    if (!reason || !String(reason).trim() || !isFiniteNumber(overrideValue)) {
      return res.status(400).json({ error: 'A numeric override value and a detailed justification reason are required.' });
    }
    const lockErr = getLockedPeriodError(orgId, periodId);
    if (lockErr) return res.status(lockErr.status).json({ error: lockErr.error });

    const kpi = state.kpis.find((k) => k.id === kpiId && k.organizationId === orgId);
    if (!kpi) return res.status(404).json({ error: 'KPI not found' });

    let measurement = state.measurements.find(
      (m) => m.kpiId === kpiId && m.periodId === periodId && m.organizationId === orgId
    );

    const originalVal = measurement ? measurement.actual : 0;
    const calc = calculateKPIAchievement(kpi, Number(overrideValue), kpi.targetValue, db.getScoringSettings(orgId));

    const approverTitle = `${currentUser.name} (${currentUser.designation})`;

    if (measurement) {
      // Preserve the very first pre-override value across repeated overrides
      if (!measurement.isManuallyOverridden) measurement.originalCalculatedValue = originalVal;
      measurement.actual = Number(overrideValue);
      measurement.target = kpi.targetValue;
      measurement.achievement = calc.achievement;
      measurement.weightedScore = calc.weightedScore;
      measurement.status = calc.status;
      measurement.isManuallyOverridden = true;
      measurement.overrideReason = reason;
      measurement.overrideBy = approverTitle;
      measurement.overrideDate = new Date().toISOString();
    } else {
      measurement = {
        id: `msr-${kpiId}-${periodId}`,
        organizationId: orgId,
        kpiId,
        periodId,
        target: kpi.targetValue,
        actual: Number(overrideValue),
        achievement: calc.achievement,
        weightedScore: calc.weightedScore,
        status: calc.status,
        approvalStatus: 'DRAFT',
        calculatedAutomatically: false,
        isManuallyOverridden: true,
        overrideReason: reason,
        overrideBy: approverTitle,
        overrideDate: new Date().toISOString(),
        submittedBy: currentUser.id,
        submittedDate: new Date().toISOString(),
      };
      state.measurements.push(measurement);
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'MANUAL_OVERRIDE_KPI',
      entity: 'KPI_MEASUREMENT',
      entityId: measurement.id,
      oldValue: `${originalVal} ${kpi.unit}`,
      newValue: `${overrideValue} ${kpi.unit}`,
      reason: `Section 54 Exception Authorized by ${approverTitle}: ${reason}`,
    });

    res.json({ success: true, measurement });
  });

  // Approval Workflow Endpoints (Section 28 - ADMIN-ONLY)
  const findPeriod = (orgId: string, periodId: string) =>
    db.getState().periods.find((p) => p.id === periodId && p.organizationId === orgId);

  app.post('/api/approval/submit', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const { periodId } = req.body || {};

    const period = findPeriod(orgId, periodId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (period.status !== 'OPEN') {
      return res.status(409).json({ error: `Only OPEN periods can be submitted for review (current status: ${period.status}).` });
    }

    const settings = db.getScoringSettings(orgId);
    if (settings.enforce100PercentWeight !== false) {
      const total = db.getKRAs(orgId).filter((k) => k.active).reduce((a, k) => a + k.weight, 0);
      if (Math.abs(total - 100) >= 0.01) {
        return res.status(409).json({ error: `Active KRA weights total ${total}%. Balance them to exactly 100% before submitting.` });
      }
    }

    const oldStatus = period.status;
    period.status = 'UNDER_REVIEW';

    for (const m of db.getMeasurements(orgId, periodId)) {
      if (m.approvalStatus === 'DRAFT' || m.approvalStatus === 'REOPENED' || m.approvalStatus === 'REJECTED') {
        m.approvalStatus = 'UNDER_REVIEW';
        m.rejectionReason = undefined;
      }
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'SUBMIT_PERIOD_FOR_REVIEW',
      entity: 'PERFORMANCE_PERIOD',
      entityId: periodId,
      oldValue: oldStatus,
      newValue: 'UNDER_REVIEW',
      reason: 'Measurements compiled and submitted for executive governance review',
    });

    res.json({ success: true, period });
  });

  app.post('/api/approval/approve', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user;
    const { periodId } = req.body || {};

    const period = findPeriod(orgId, periodId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (!['UNDER_REVIEW', 'SUBMITTED', 'APPROVED'].includes(period.status)) {
      return res.status(409).json({ error: `Only periods under review can be approved and locked (current status: ${period.status}).` });
    }

    const settings = db.getScoringSettings(orgId);
    if (settings.enforce100PercentWeight !== false) {
      const total = db.getKRAs(orgId).filter((k) => k.active).reduce((a, k) => a + k.weight, 0);
      if (Math.abs(total - 100) >= 0.01) {
        return res.status(409).json({ error: `Active KRA weights total ${total}%. Balance them to exactly 100% before locking.` });
      }
    }

    const oldStatus = period.status;
    const approverName = `${currentUser.name} (${currentUser.designation})`;
    period.status = 'LOCKED';
    period.approvedBy = approverName;
    period.lockedDate = new Date().toISOString();

    for (const m of db.getMeasurements(orgId, periodId)) {
      m.approvalStatus = 'APPROVED';
      m.approvedBy = approverName;
      m.approvedDate = period.lockedDate;
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'APPROVE_AND_LOCK_PERIOD',
      entity: 'PERFORMANCE_PERIOD',
      entityId: periodId,
      oldValue: oldStatus,
      newValue: 'LOCKED',
      reason: 'Period approved and officially locked for quarterly audit compliance',
    });

    res.json({ success: true, period });
  });

  app.post('/api/approval/reject', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const { periodId, rejectionReason } = req.body || {};

    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ error: 'Rejection reason is required.' });
    }

    const period = findPeriod(orgId, periodId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (!['UNDER_REVIEW', 'SUBMITTED', 'APPROVED'].includes(period.status)) {
      return res.status(409).json({ error: `Only periods under review can be rejected (current status: ${period.status}).` });
    }

    const oldStatus = period.status;
    period.status = 'OPEN';

    for (const m of db.getMeasurements(orgId, periodId)) {
      m.approvalStatus = 'REJECTED';
      m.rejectionReason = rejectionReason;
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'REJECT_PERIOD_MEASUREMENTS',
      entity: 'PERFORMANCE_PERIOD',
      entityId: periodId,
      oldValue: oldStatus,
      newValue: 'OPEN (REJECTED)',
      reason: rejectionReason,
    });

    res.json({ success: true, period });
  });

  app.post('/api/approval/reopen', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const { periodId, reopenReason } = req.body || {};

    if (!reopenReason || !String(reopenReason).trim()) {
      return res.status(400).json({ error: 'Authorized reason is required to unlock a finalized period.' });
    }

    const period = findPeriod(orgId, periodId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (period.status !== 'LOCKED') {
      return res.status(409).json({ error: `Only LOCKED periods can be reopened (current status: ${period.status}).` });
    }

    period.status = 'OPEN';

    for (const m of db.getMeasurements(orgId, periodId)) {
      m.approvalStatus = 'REOPENED';
    }

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'REOPEN_LOCKED_PERIOD',
      entity: 'PERFORMANCE_PERIOD',
      entityId: periodId,
      oldValue: 'LOCKED',
      newValue: 'OPEN (REOPENED)',
      reason: reopenReason,
    });

    res.json({ success: true, period });
  });

  // Evidence API (Section 27)
  app.get('/api/evidence', (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = req.query.periodId as string;
    const kpiId = req.query.kpiId as string;
    const state = db.getState();

    let list = state.evidence.filter((e) => e.organizationId === orgId);
    if (periodId) list = list.filter((e) => e.periodId === periodId);
    if (kpiId) list = list.filter((e) => e.kpiId === kpiId);

    res.json(list);
  });

  app.post('/api/evidence', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user as SessionUser;
    const state = db.getState();
    const data = req.body || {};

    const kpi = state.kpis.find((k) => k.id === data.kpiId && k.organizationId === orgId);
    if (!kpi) return res.status(404).json({ error: 'KPI not found' });
    const lockErr = getLockedPeriodError(orgId, data.periodId);
    if (lockErr) return res.status(lockErr.status).json({ error: lockErr.error });
    if (!data.fileName || !data.documentUrl) {
      return res.status(400).json({ error: 'A real evidence document must be uploaded.' });
    }

    const newEvidence = {
      id: `ev-${Date.now()}`,
      organizationId: orgId,
      measurementId: `msr-${data.kpiId}-${data.periodId}`,
      kpiId: data.kpiId,
      periodId: data.periodId,
      fileName: data.fileName,
      fileType: data.fileType || 'DOCUMENT',
      fileSize: data.fileSize || '',
      uploadedBy: currentUser.name,
      uploadedDate: new Date().toISOString().slice(0, 10),
      description: data.description || '',
      documentUrl: data.documentUrl,
    };

    state.evidence.push(newEvidence);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'UPLOAD_EVIDENCE',
      entity: 'KPI_EVIDENCE',
      entityId: newEvidence.id,
      newValue: `Attached document: ${newEvidence.fileName} for KPI ${kpi.kpiCode}`,
    });

    res.status(201).json(newEvidence);
  });

  // Hierarchical Submissions & Approvals API (Staff -> Reporting Manager -> HOD)
  app.get('/api/submissions', (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user;
    const { employeeId, managerId, periodId } = req.query as {
      employeeId?: string;
      managerId?: string;
      periodId?: string;
    };

    const submissions = db.getSubmissions(orgId, {
      employeeId,
      managerId,
      periodId,
      currentUserId: currentUser.id,
    });

    // Evidence FILE contents are restricted to the submitter, their direct manager, the HOD, and SUPER_ADMIN / AUDITOR
    const sanitized = submissions.map((s) => {
      const isOwner = s.employeeId === currentUser.id;
      const isDirectManager = s.managerId === currentUser.id;
      const isHOD = currentUser.level === 1 && (currentUser.role === 'LEGAL_HEAD' || currentUser.role === 'MANAGEMENT');
      const isAdminOrAuditor = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'AUDITOR';

      const canAccessFile = isOwner || isDirectManager || isHOD || isAdminOrAuditor;

      return {
        ...s,
        document: {
          ...s.document,
          fileData: canAccessFile ? s.document.fileData : '',
          isRestricted: !canAccessFile,
        },
      };
    });

    res.json(sanitized);
  });

  // Submit KRA deliverable with real evidence file upload
  app.post('/api/submissions', (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user;
    const state = db.getState();
    const data = req.body || {};

    if (data.employeeId && data.employeeId !== currentUser.id && currentUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden: You cannot submit deliverables on behalf of another employee.',
      });
    }

    const employee = state.users.find((u) => u.id === currentUser.id) || currentUser;
    const manager = employee.managerId ? state.users.find((u) => u.id === employee.managerId) : undefined;
    if (!manager || manager.id === employee.id) {
      return res.status(400).json({
        error: 'You have no reporting manager in the org chart to approve deliverables. Record KPI actuals via Reconciliation instead.',
      });
    }

    const kpi = state.kpis.find((k) => k.id === data.kpiId && k.organizationId === orgId);
    if (!kpi) {
      return res.status(404).json({ error: 'KPI deliverable not found.' });
    }

    const periodId = data.periodId || 'period-2026-09';
    const lockErr = getLockedPeriodError(orgId, periodId);
    if (lockErr) return res.status(lockErr.status).json({ error: lockErr.error });

    // Employees can only submit against their assigned KPIs
    const isAssigned =
      kpi.ownerId === currentUser.id ||
      currentUser.assignedKpis?.includes(kpi.id) ||
      currentUser.assignedKras?.includes(kpi.kraId) ||
      (currentUser.level === 2 && (kpi.wing === currentUser.wing || kpi.department === currentUser.department)) ||
      currentUser.role === 'SUPER_ADMIN';

    if (!isAssigned) {
      return res.status(403).json({
        error: `Forbidden: KPI ${kpi.kpiCode} (${kpi.name}) is not assigned to you. You can only submit deliverables for your own assigned KPIs.`,
      });
    }

    if (!isFiniteNumber(data.achievedValue)) {
      return res.status(400).json({ error: 'Achieved value must be a number.' });
    }

    // Real evidence upload is mandatory
    const fileData = data.fileData || data.document?.fileData;
    const fileName = data.fileName || data.document?.fileName;
    if (!fileName || !fileData || typeof fileData !== 'string' || !fileData.startsWith('data:')) {
      return res.status(400).json({
        error: 'A real verification evidence document must be uploaded to submit a deliverable.',
      });
    }

    const duplicatePending = state.submissions.find(
      (s) => s.employeeId === currentUser.id && s.kpiId === kpi.id && s.periodId === periodId && s.status === 'PENDING_APPROVAL'
    );
    if (duplicatePending) {
      return res.status(409).json({
        error: `You already have a pending submission for ${kpi.kpiCode} in this period. Wait for your manager's decision first.`,
      });
    }

    const kra = state.kras.find((kr) => kr.id === kpi.kraId);

    const newSub = {
      id: `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: orgId,
      periodId,
      kpiId: kpi.id,
      kpiCode: kpi.kpiCode,
      kpiName: kpi.name,
      kraId: kpi.kraId,
      kraName: kra?.name || '',
      employeeId: currentUser.id,
      employeeName: currentUser.name,
      employeeDesignation: currentUser.designation,
      employeeLevel: currentUser.level || 3,
      department: currentUser.department,
      wing: currentUser.wing,
      managerId: manager.id,
      managerName: manager.name,
      achievedValue: Number(data.achievedValue),
      targetValue: kpi.targetValue,
      unit: kpi.unit || 'units',
      notes: data.notes || '',
      submittedDate: new Date().toISOString().slice(0, 10),
      document: {
        fileName,
        fileType: data.fileType || data.document?.fileType || 'PDF',
        fileSize: data.fileSize || data.document?.fileSize || '',
        fileData,
        description: data.notes || data.description || data.document?.description || '',
      },
      status: 'PENDING_APPROVAL' as const,
      pointsAwarded: 0,
      maxPoints: 100,
    };

    const saved = db.addSubmission(newSub);
    res.status(201).json(saved);
  });

  const canActOnSubmission = (currentUser: SessionUser, sub: { managerId: string; employeeId: string }) => {
    if (sub.employeeId === currentUser.id) return false; // never self-approve
    const isDirectManager = sub.managerId === currentUser.id;
    const isHOD = currentUser.level === 1 && (currentUser.role === 'LEGAL_HEAD' || currentUser.role === 'MANAGEMENT');
    return isDirectManager || isHOD || currentUser.role === 'SUPER_ADMIN';
  };

  // Manager Approval endpoint with strict reporting hierarchy authorization
  app.post('/api/submissions/:id/approve', (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user as SessionUser;
    const { remarks } = req.body || {};

    const sub = db.getState().submissions.find((s) => s.id === req.params.id && s.organizationId === orgId);
    if (!sub) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!canActOnSubmission(currentUser, sub)) {
      return res.status(403).json({
        error: `Forbidden: Only the designated reporting manager (${sub.managerName}) or Head of Department can approve this deliverable, and never your own.`,
      });
    }

    const approverName = `${currentUser.name} (${currentUser.designation})`;
    try {
      const result = db.approveSubmission(sub.id, currentUser, approverName, remarks);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(409).json({ error: err.message });
    }
  });

  // Manager Rejection/Revision endpoint with strict reporting hierarchy authorization
  app.post('/api/submissions/:id/reject', (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user as SessionUser;
    const { remarks } = req.body || {};

    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ error: 'Rejection/revision remarks are mandatory' });
    }

    const sub = db.getState().submissions.find((s) => s.id === req.params.id && s.organizationId === orgId);
    if (!sub) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!canActOnSubmission(currentUser, sub)) {
      return res.status(403).json({
        error: `Forbidden: Only the designated reporting manager (${sub.managerName}) or Head of Department can request revisions, and never on your own deliverable.`,
      });
    }

    const rejectorName = `${currentUser.name} (${currentUser.designation})`;
    try {
      const result = db.rejectSubmission(sub.id, currentUser, rejectorName, remarks);
      res.json({ success: true, submission: result });
    } catch (err: any) {
      res.status(409).json({ error: err.message });
    }
  });

  // Hierarchy Rollup endpoint
  app.get('/api/hierarchy/rollup', (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = (req.query.periodId as string) || 'period-2026-09';
    res.json(db.getHierarchyRollup(orgId, periodId));
  });

  // Upward Reporting Chain endpoint (read-only visibility into managers' KRAs/KPIs)
  app.get('/api/hierarchy/reporting-chain', (req, res) => {
    const currentUser = (req as any).user;
    const periodId = (req.query.periodId as string) || 'period-2026-09';
    res.json(db.getReportingChain(currentUser.id, periodId));
  });

  // Operational Registers API (whitelisted entities only)
  const resolveOperationalEntity = (req: express.Request, res: express.Response): OperationalEntity | null => {
    const entityKey = req.params.entity as OperationalEntity;
    if (!OPERATIONAL_ENTITIES.includes(entityKey)) {
      res.status(404).json({ error: `Operational register '${req.params.entity}' not found` });
      return null;
    }
    return entityKey;
  };

  app.get('/api/operational/:entity', (req, res) => {
    const entityKey = resolveOperationalEntity(req, res);
    if (!entityKey) return;
    const orgId = (req as any).organizationId;
    const items = (db.getState() as any)[entityKey].filter((i: any) => i.organizationId === orgId);
    res.json(items);
  });

  app.post('/api/operational/:entity', (req, res) => {
    const entityKey = resolveOperationalEntity(req, res);
    if (!entityKey) return;
    const orgId = (req as any).organizationId;
    const role = (req as any).userRole as UserRole;
    if (role === 'AUDITOR' || role === 'MANAGEMENT') {
      return res.status(403).json({ error: 'Forbidden: Auditors and management viewers have read-only access to registers.' });
    }

    const body = { ...(req.body || {}) };
    delete body.id;
    delete body.organizationId;

    const missing = OPERATIONAL_REQUIRED_FIELDS[entityKey].filter(
      (f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === ''
    );
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Derived fields so new records feed SLA / risk calculations consistently with seeded ones
    for (const f of ['contractValueINR', 'targetSLADays', 'actualTATDays', 'actualResponseDays', 'actualDaysTaken', 'estimatedExposureINR',
      'actualLegalCostINR', 'probability', 'impact', 'defectsIdentified', 'defectsResolved', 'transactionValueINR']) {
      if (body[f] !== undefined && body[f] !== '') {
        if (!isFiniteNumber(body[f])) return res.status(400).json({ error: `${f} must be a number.` });
        body[f] = Number(body[f]);
      }
    }
    if (entityKey === 'contracts' && body.actualTATDays !== undefined && body.targetSLADays !== undefined) {
      body.isWithinSLA = body.actualTATDays <= body.targetSLADays;
    }
    if (entityKey === 'notices' && body.actualResponseDays !== undefined && body.targetSLADays !== undefined) {
      body.isWithinSLA = body.actualResponseDays <= body.targetSLADays;
    }
    if (entityKey === 'risks') {
      if (body.probability < 1 || body.probability > 5 || body.impact < 1 || body.impact > 5) {
        return res.status(400).json({ error: 'Probability and impact must be between 1 and 5.' });
      }
      body.riskScore = body.probability * body.impact;
      body.riskLevel = body.riskScore >= 20 ? 'CRITICAL' : body.riskScore >= 12 ? 'HIGH' : body.riskScore >= 6 ? 'MEDIUM' : 'LOW';
    }
    if (entityKey === 'dueDiligences') {
      body.defectsIdentified = body.defectsIdentified ?? 0;
      body.defectsResolved = body.defectsResolved ?? 0;
      if (body.defectsResolved > body.defectsIdentified) {
        return res.status(400).json({ error: 'Resolved defects cannot exceed identified defects.' });
      }
    }

    const prefix: Record<OperationalEntity, string> = {
      contracts: 'cnt', compliances: 'comp', litigations: 'lit', notices: 'not', risks: 'rsk',
      dueDiligences: 'dd', approvals: 'appr', transactions: 'txn', tasks: 'tsk',
    };
    const newItem = {
      ...body,
      id: `${prefix[entityKey]}-${Date.now()}`,
      organizationId: orgId,
    };

    (db.getState() as any)[entityKey].unshift(newItem);

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: `CREATE_${entityKey.toUpperCase()}`,
      entity: entityKey.toUpperCase(),
      entityId: newItem.id,
      newValue: `Added ${entityKey} register record ${newItem.id}`,
    });

    res.status(201).json(newItem);
  });

  // Reports API (Section 40)
  app.get('/api/reports/:reportType', (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = (req.query.periodId as string) || 'period-2026-09';
    const state = db.getState();
    const kras = db.getKRAs(orgId);
    const kpis = db.getKPIs(orgId);
    const measurements = db.getMeasurements(orgId, periodId);
    const settings = db.getScoringSettings(orgId);

    res.json({
      reportType: req.params.reportType,
      periodId,
      generatedDate: new Date().toISOString(),
      organization: state.organizations.find((o) => o.id === orgId),
      summary: computeDepartmentScore(kras, kpis, measurements, settings),
      kras,
      kpis,
      measurements,
    });
  });

  // Audit Logs API (governance roles only)
  app.get('/api/audit-logs', (req, res) => {
    const role = (req as any).userRole as UserRole;
    if (!isAdminRole(role) && role !== 'AUDITOR' && role !== 'MANAGEMENT') {
      return res.status(403).json({ error: 'Forbidden: The audit trail is restricted to HOD, administrators and auditors.' });
    }
    const orgId = (req as any).organizationId;
    res.json(db.getState().auditLogs.filter((l) => l.organizationId === orgId));
  });

  // Notifications API
  app.get('/api/notifications', (req, res) => {
    const orgId = (req as any).organizationId;
    res.json(db.getState().notifications.filter((n) => n.organizationId === orgId));
  });

  app.post('/api/notifications/mark-read', (req, res) => {
    const orgId = (req as any).organizationId;
    const id = req.body?.id;
    for (const n of db.getState().notifications) {
      if (n.organizationId === orgId && (!id || n.id === id)) {
        n.read = true;
      }
    }
    res.json({ success: true });
  });

  // AI Legal Intelligence Assistant API (Section 55)
  app.post('/api/ai/ask', async (req, res) => {
    const orgId = (req as any).organizationId;
    const { question, periodId } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'A question is required.' });
    }

    try {
      const answer = await askLegalIntelligenceAssistant(orgId, periodId || 'period-2026-09', String(question));
      res.json({ answer });
    } catch (err: any) {
      res.status(500).json({ error: 'AI advisor error', details: err?.message });
    }
  });

  // Performance Reviews API (Section 39)
  app.get('/api/reviews', (req, res) => {
    const orgId = (req as any).organizationId;
    const periodId = req.query.periodId as string;
    let list = db.getState().reviews.filter((r) => r.organizationId === orgId);
    if (periodId) list = list.filter((r) => r.periodId === periodId);
    res.json(list);
  });

  app.post('/api/reviews', requireAdmin, (req, res) => {
    const orgId = (req as any).organizationId;
    const currentUser = (req as any).user as SessionUser;
    const state = db.getState();
    const data = req.body || {};

    const period = findPeriod(orgId, data.periodId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (!data.performanceSummary || !String(data.performanceSummary).trim()) {
      return res.status(400).json({ error: 'Performance summary is required.' });
    }

    // The published score is always the engine's score for that period, never client supplied
    const summary = computeDepartmentScore(
      db.getKRAs(orgId),
      db.getKPIs(orgId),
      db.getMeasurements(orgId, period.id),
      db.getScoringSettings(orgId)
    );

    const newRev = {
      id: `rev-${Date.now()}`,
      organizationId: orgId,
      periodId: period.id,
      reviewerId: currentUser.id,
      reviewerName: `${currentUser.name} (${currentUser.designation})`,
      overallScore: summary.overallScore,
      performanceSummary: data.performanceSummary,
      majorAchievements: data.majorAchievements || '',
      identifiedProblems: data.identifiedProblems || '',
      reasonsForUnderperformance: data.reasonsForUnderperformance || '',
      correctiveActions: data.correctiveActions || '',
      managementComments: data.managementComments || '',
      createdDate: new Date().toISOString().slice(0, 10),
      status: data.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
    } as const;

    state.reviews.unshift({ ...newRev });

    db.addAuditLog({
      organizationId: orgId,
      ...actor(req),
      action: 'PUBLISH_PERFORMANCE_REVIEW',
      entity: 'PERFORMANCE_REVIEW',
      entityId: newRev.id,
      newValue: `Published review for ${period.name} (score ${newRev.overallScore}%)`,
    });

    res.status(201).json(newRev);
  });

  // Unknown API routes must not fall through to the SPA HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Legal Department KRA & KPI Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
