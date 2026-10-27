import React, { useEffect, useState } from 'react';
import {
  Target,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Save,
  RotateCcw,
  Sliders,
  Edit2,
  Trash2,
  Info,
} from 'lucide-react';
import { KRA, User } from '../types';

interface KRAFrameworkViewProps {
  kras: KRA[];
  users: User[];
  canManage: boolean;
  onSaveWeights: (weights: Record<string, number>, reason: string) => Promise<void>;
  onCreateKRA: (data: Partial<KRA>) => Promise<void>;
  onUpdateKRA: (id: string, data: Partial<KRA>) => Promise<void>;
}

const weightsFromKras = (kras: KRA[]) => {
  const init: Record<string, number> = {};
  kras.filter((k) => k.active).forEach((k) => {
    init[k.id] = k.weight;
  });
  return init;
};

export const KRAFrameworkView: React.FC<KRAFrameworkViewProps> = ({
  kras,
  users,
  canManage,
  onSaveWeights,
  onCreateKRA,
  onUpdateKRA,
}) => {
  // Local state for interactive weight adjustment (active KRAs only), re-synced whenever the KRA list changes
  const [weights, setWeights] = useState<Record<string, number>>(() => weightsFromKras(kras));
  useEffect(() => {
    setWeights(weightsFromKras(kras));
  }, [kras]);

  const [reason, setReason] = useState('Annual strategic KRA weight re-allocation');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newKraName, setNewKraName] = useState('');
  const [newKraDesc, setNewKraDesc] = useState('');
  const [newKraOwner, setNewKraOwner] = useState(users[0]?.id || '');
  const [newKraWeight, setNewKraWeight] = useState(10);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [editingKra, setEditingKra] = useState<KRA | null>(null);
  const [editError, setEditError] = useState('');

  const activeKras = kras.filter((k) => k.active);

  // Calculate dynamic local total
  const currentTotal = Math.round(Object.values(weights).reduce((sum, w) => sum + (Number(w) || 0), 0) * 100) / 100;
  const isLocalValid = Math.abs(currentTotal - 100) < 0.01;
  const remaining = Math.round((100 - currentTotal) * 10) / 10;
  const isDirty = activeKras.some((k) => weights[k.id] !== k.weight);

  const handleWeightChange = (id: string, val: number) => {
    setWeights((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(100, Math.round(val))),
    }));
    setSaveSuccess(false);
  };

  const handleProportionalNormalize = () => {
    if (currentTotal === 0) return;
    const factor = 100 / currentTotal;
    const normalized: Record<string, number> = {};
    let running = 0;
    const entries = Object.entries(weights);
    entries.forEach(([id, w], idx) => {
      if (idx === entries.length - 1) {
        normalized[id] = Math.max(0, Math.round((100 - running) * 10) / 10);
      } else {
        const scaled = Math.round(w * factor);
        normalized[id] = scaled;
        running += scaled;
      }
    });
    setWeights(normalized);
  };

  const handleSave = async () => {
    if (!isLocalValid || !reason.trim()) return;
    setIsSaving(true);
    try {
      await onSaveWeights(weights, reason.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // surfaced via notification
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKraName.trim()) return;
    setCreateError('');
    const owner = users.find((u) => u.id === newKraOwner);
    try {
      await onCreateKRA({
        name: newKraName.trim(),
        description: newKraDesc,
        ownerId: newKraOwner,
        ownerName: owner?.name,
        weight: Number(newKraWeight),
        orderIndex: kras.length + 1,
      });
      setIsCreating(false);
      setNewKraName('');
      setNewKraDesc('');
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create KRA');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKra || !editingKra.name.trim()) return;
    setEditError('');
    try {
      await onUpdateKRA(editingKra.id, {
        name: editingKra.name.trim(),
        description: editingKra.description,
        ownerId: editingKra.ownerId,
        ownerName: users.find((u) => u.id === editingKra.ownerId)?.name || editingKra.ownerName,
        active: editingKra.active,
      });
      setEditingKra(null);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update KRA');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" />
            KRA Framework & Strategic Weight Governance
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure enterprise Key Result Areas. By corporate governance policy, the sum of all active KRA weights must strictly equal 100%.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCreateError('');
                setIsCreating(true);
              }}
              className="flex items-center gap-1.5 bg-brand-gradient hover:opacity-90 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom KRA</span>
            </button>
          </div>
        )}
      </div>

      {/* Real-time Weight 100% Validation Meter (Section 13 & 50) */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLocalValid
            ? 'bg-emerald-50/70 border-emerald-200'
            : 'bg-amber-50/70 border-amber-200'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isLocalValid ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
              }`}
            >
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Total Active Weight Allocation: {currentTotal}%
                </h3>
                {isLocalValid ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 100% Balanced & Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {remaining > 0 ? `Unallocated: ${remaining}%` : `Overallocated: +${Math.abs(remaining)}%`}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {isLocalValid
                  ? `All ${activeKras.length} active KRAs are calibrated. Scores can be aggregated into executive dashboards.`
                  : 'Total must equal exactly 100% before saving weight alterations to the live calculation engine.'}
              </p>
            </div>
          </div>

          {canManage && (
          <div className="flex items-center gap-2.5 shrink-0">
            {!isLocalValid && (
              <button
                onClick={handleProportionalNormalize}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                title="Automatically scale all weights proportionally to equal 100%"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auto-Balance to 100%</span>
              </button>
            )}

            {isDirty && (
              <button
                onClick={() => setWeights(weightsFromKras(kras))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={!isLocalValid || isSaving || !isDirty || !reason.trim()}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                isLocalValid && isDirty && reason.trim()
                  ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer active:scale-98'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
              title={!isDirty ? 'No weight changes to save' : !reason.trim() ? 'Enter an audit reason first' : undefined}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save & Publish Weights'}</span>
            </button>
          </div>
          )}
        </div>

        {/* Visual Progress Bar */}
        <div className="mt-4 w-full bg-white rounded-full h-3 border border-slate-200 overflow-hidden flex">
          {activeKras.map((k) => {
            const w = weights[k.id] || 0;
            const colors = [
              'bg-blue-500',
              'bg-emerald-500',
              'bg-indigo-500',
              'bg-purple-500',
              'bg-amber-500',
              'bg-teal-500',
              'bg-rose-500',
              'bg-cyan-500',
            ];
            const color = colors[(k.kraNumber - 1) % colors.length];
            return (
              <div
                key={k.id}
                style={{ width: `${w}%` }}
                className={`${color} h-full transition-all duration-300 relative group`}
                title={`${k.name}: ${w}%`}
              />
            );
          })}
        </div>

        {saveSuccess && (
          <div className="mt-3 p-2 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            KRA weights updated and logged into regulatory audit trail.
          </div>
        )}
      </div>

      {/* Audit Justification Field */}
      {canManage && (
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <Info className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-semibold">Mandatory Governance Audit Reason:</span>
        </div>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter reason for modifying KRA weight allocation..."
          className="flex-1 max-w-xl px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      )}

      {/* KRA List & Sliders */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Department-Wise Key Result Areas ({kras.length})
            </h3>
            <span className="text-xs text-slate-500">
              {canManage
                ? 'Drag sliders or enter numerical weights to calibrate priority across wings'
                : 'Read-only view — weights are governed by the Head of Department'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">Filter Department:</span>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Departments ({kras.length})</option>
              {Array.from(new Set(kras.map((k) => k.department).filter(Boolean))).map((dept) => (
                <option key={dept} value={dept as string}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {(deptFilter === 'ALL' ? kras : kras.filter((k) => k.department === deptFilter)).map((k) => {
            const currentVal = weights[k.id] ?? k.weight;
            return (
              <div
                key={k.id}
                className={`p-4 sm:p-5 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  k.active ? '' : 'opacity-60'
                }`}
              >
                {/* KRA Info */}
                <div className="space-y-1 max-w-md">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      KRA {k.kraNumber}
                    </span>
                    {k.department && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {k.department}
                      </span>
                    )}
                    <h4 className="text-sm font-bold text-slate-900">{k.name}</h4>
                    {!k.active && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">INACTIVE</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{k.description}</p>
                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                    <span className="text-slate-700 font-semibold">Executive Owner: {k.ownerName}</span>
                    {k.wing && (
                      <>
                        <span>•</span>
                        <span>Wing: {k.wing}</span>
                      </>
                    )}
                    {k.effectivePeriod && (
                      <>
                        <span>•</span>
                        <span>Effective: {k.effectivePeriod}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Weight Adjustment Controls */}
                <div className="flex items-center gap-4 shrink-0">
                  {k.active ? (
                    <>
                      <div className="w-40 sm:w-56">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={currentVal}
                          disabled={!canManage}
                          aria-label={`${k.name} weight`}
                          onChange={(e) => handleWeightChange(k.id, Number(e.target.value))}
                          className="w-full accent-teal-600 cursor-pointer disabled:cursor-default"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                          <span>0%</span>
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={currentVal}
                          disabled={!canManage}
                          aria-label={`${k.name} weight percent`}
                          onChange={(e) => handleWeightChange(k.id, Number(e.target.value))}
                          className="w-16 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
                        />
                        <span className="text-xs font-bold text-slate-500">%</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Excluded from scoring</span>
                  )}

                  {canManage && (
                    <button
                      onClick={() => {
                        setEditError('');
                        setEditingKra({ ...k });
                      }}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit KRA details"
                      aria-label={`Edit ${k.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Create Custom KRA */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create Custom Key Result Area (KRA)</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">KRA Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Joint Venture Agreements & SRA Redevelopment"
                  value={newKraName}
                  onChange={(e) => setNewKraName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Define scope and organizational outcome..."
                  value={newKraDesc}
                  onChange={(e) => setNewKraDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">KRA Owner</label>
                  <select
                    value={newKraOwner}
                    onChange={(e) => setNewKraOwner(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 bg-white"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.designation})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Initial Weight %</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newKraWeight}
                    onChange={(e) => setNewKraWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Adding a KRA makes the total exceed 100% — rebalance the weights afterwards and save them.
              </p>

              {createError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{createError}</div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm"
                >
                  Create KRA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit KRA */}
      {editingKra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Edit KRA {editingKra.kraNumber}</h3>
            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="edit-kra-name">KRA Name</label>
                <input
                  id="edit-kra-name"
                  type="text"
                  required
                  value={editingKra.name}
                  onChange={(e) => setEditingKra({ ...editingKra, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="edit-kra-desc">Description</label>
                <textarea
                  id="edit-kra-desc"
                  rows={3}
                  value={editingKra.description}
                  onChange={(e) => setEditingKra({ ...editingKra, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1" htmlFor="edit-kra-owner">KRA Owner</label>
                <select
                  id="edit-kra-owner"
                  value={editingKra.ownerId}
                  onChange={(e) => setEditingKra({ ...editingKra, ownerId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                >
                  {!users.some((u) => u.id === editingKra.ownerId) && (
                    <option value={editingKra.ownerId}>{editingKra.ownerName}</option>
                  )}
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.designation})
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={editingKra.active}
                  onChange={(e) => setEditingKra({ ...editingKra, active: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600"
                />
                Active (included in department scoring)
              </label>
              {!editingKra.active && kras.find((k) => k.id === editingKra.id)?.active && (
                <p className="text-[11px] text-amber-700">
                  Deactivating removes this KRA's {editingKra.weight}% from the total — rebalance the remaining weights afterwards.
                </p>
              )}

              {editError && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{editError}</div>}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingKra(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm">
                  Save KRA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
