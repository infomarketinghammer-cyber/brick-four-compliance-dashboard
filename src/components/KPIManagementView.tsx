import React, { useState } from 'react';
import {
  BarChart3,
  Plus,
  Filter,
  Search,
  CheckCircle2,
  Database,
  Edit,
  Sliders,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
} from 'lucide-react';
import { KPI, KRA, User } from '../types';

interface KPIManagementViewProps {
  kpis: KPI[];
  kras: KRA[];
  users: User[];
  canManage: boolean;
  onCreateKPI: (data: Partial<KPI>) => Promise<void>;
  onUpdateKPI: (id: string, data: Partial<KPI>) => Promise<void>;
}

const DIRECTION_OPTIONS: Array<{ value: KPI['direction']; label: string }> = [
  { value: 'HIGHER_IS_BETTER', label: 'Higher is Better (e.g. % on-time)' },
  { value: 'LOWER_IS_BETTER', label: 'Lower is Better (e.g. TAT days, overdue items)' },
  { value: 'TARGET_RANGE', label: 'Within Range (min acceptable → target)' },
  { value: 'EXACT_TARGET', label: 'Exact Target (deviation penalized)' },
];

const MEASUREMENT_TYPE_OPTIONS: Array<{ value: KPI['measurementType']; label: string }> = [
  { value: 'PERCENTAGE', label: 'Percentage (%)' },
  { value: 'SLA_PERCENTAGE', label: 'SLA Percentage (%)' },
  { value: 'NUMBER', label: 'Number / Count' },
  { value: 'DURATION', label: 'Duration (Days / Hours)' },
  { value: 'CURRENCY', label: 'Currency (INR / ₹)' },
  { value: 'RATIO', label: 'Ratio' },
  { value: 'SCORE', label: 'Score' },
  { value: 'MILESTONE', label: 'Milestone' },
  { value: 'BOOLEAN', label: 'Yes / No (Boolean)' },
];

export const KPIManagementView: React.FC<KPIManagementViewProps> = ({
  kpis,
  kras,
  users,
  canManage,
  onCreateKPI,
  onUpdateKPI,
}) => {
  const [selectedKraId, setSelectedKraId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKPI, setEditingKPI] = useState<KPI | null>(null);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // KPI weights within each KRA should total 100%; the engine normalizes otherwise, but flag it
  const kpiWeightTotals = kras.reduce<Record<string, number>>((acc, k) => {
    acc[k.id] = kpis.filter((p) => p.kraId === k.id && p.active).reduce((s, p) => s + p.weight, 0);
    return acc;
  }, {});
  const unbalancedKras = kras.filter((k) => k.active && kpis.some((p) => p.kraId === k.id && p.active) && Math.abs(kpiWeightTotals[k.id] - 100) >= 0.01);

  // Form states
  const [formData, setFormData] = useState<Partial<KPI>>({
    name: '',
    kpiCode: '',
    kraId: kras[0]?.id || '',
    description: '',
    measurementType: 'PERCENTAGE',
    direction: 'HIGHER_IS_BETTER',
    frequency: 'MONTHLY',
    unit: '%',
    targetValue: 90,
    weight: 30,
    calculationMethod: 'MANUAL',
    ownerId: users[0]?.id || '',
  });

  const filteredKPIs = kpis.filter((kpi) => {
    const matchKra = selectedKraId === 'ALL' || kpi.kraId === selectedKraId;
    const matchSearch =
      kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kpi.kpiCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kpi.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchKra && matchSearch;
  });

  const handleOpenCreate = () => {
    setEditingKPI(null);
    setFormError('');
    setFormData({
      name: '',
      kpiCode: `KPI-${Date.now().toString().slice(-4)}`,
      kraId: selectedKraId !== 'ALL' ? selectedKraId : kras[0]?.id,
      description: '',
      measurementType: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
      frequency: 'MONTHLY',
      unit: '%',
      targetValue: 90,
      weight: 30,
      calculationMethod: 'MANUAL',
      ownerId: users[0]?.id,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (kpi: KPI) => {
    setEditingKPI(kpi);
    setFormError('');
    setFormData(kpi);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (formData.direction === 'TARGET_RANGE') {
      if (formData.minAcceptableValue === undefined || !Number.isFinite(Number(formData.minAcceptableValue))) {
        setFormError('A range KPI needs a minimum acceptable value.');
        return;
      }
      if (Number(formData.minAcceptableValue) > Number(formData.targetValue)) {
        setFormError('Minimum acceptable value cannot be above the target (upper bound).');
        return;
      }
    }

    const owner = users.find((u) => u.id === formData.ownerId);
    const payload: Partial<KPI> = {
      kraId: formData.kraId,
      kpiCode: formData.kpiCode?.trim(),
      name: formData.name?.trim(),
      description: formData.description,
      ownerId: formData.ownerId,
      ownerName: owner?.name || formData.ownerName,
      measurementType: formData.measurementType,
      direction: formData.direction,
      frequency: formData.frequency,
      unit: formData.unit,
      calculationMethod: formData.calculationMethod,
      weight: Number(formData.weight),
      targetValue: Number(formData.targetValue),
      minAcceptableValue: formData.direction === 'TARGET_RANGE' ? Number(formData.minAcceptableValue) : undefined,
      active: formData.active ?? true,
    };

    setIsSaving(true);
    try {
      if (editingKPI) {
        await onUpdateKPI(editingKPI.id, payload);
      } else {
        await onCreateKPI(payload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save KPI');
    } finally {
      setIsSaving(false);
    }
  };

  const projectedKraWeight = (() => {
    if (!formData.kraId) return null;
    const others = kpis
      .filter((p) => p.kraId === formData.kraId && p.active && p.id !== editingKPI?.id)
      .reduce((s, p) => s + p.weight, 0);
    return others + (formData.active === false ? 0 : Number(formData.weight) || 0);
  })();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            Key Performance Indicators (KPI) Directory
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise legal indicators configured with target directions, measurement types, and operational register mappings.
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 bg-brand-gradient hover:opacity-90 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New KPI</span>
          </button>
        )}
      </div>

      {unbalancedKras.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <strong>KPI weights not balanced:</strong>{' '}
          {unbalancedKras.map((k) => `KRA ${k.kraNumber} (${kpiWeightTotals[k.id]}%)`).join(', ')}. KPI weights within each KRA
          should total 100%; scores are normalized until they do.
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by code, title, or keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* KRA Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold hidden sm:inline">KRA:</span>
            <select
              value={selectedKraId}
              onChange={(e) => setSelectedKraId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="ALL">All Key Result Areas ({kras.length})</option>
              {kras.map((k) => (
                <option key={k.id} value={k.id}>
                  KRA {k.kraNumber}: {k.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-900">{filteredKPIs.length}</span> indicators
        </div>
      </div>

      {/* KPI Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">KPI Code & Name</th>
                <th className="py-3 px-4">Parent KRA</th>
                <th className="py-3 px-4">Type & Direction</th>
                <th className="py-3 px-4 text-center">Target Benchmark</th>
                <th className="py-3 px-4 text-center">Weight in KRA</th>
                <th className="py-3 px-4">Owner</th>
                {canManage && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredKPIs.map((kpi) => {
                const parentKra = kras.find((k) => k.id === kpi.kraId);
                return (
                  <tr key={kpi.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded font-semibold">
                          {kpi.kpiCode}
                        </span>
                        <span>{kpi.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {kpi.description}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      <span className="font-semibold text-slate-800">
                        {parentKra ? `KRA ${parentKra.kraNumber}` : 'General'}
                      </span>
                      <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                        {parentKra?.name}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800 capitalize">
                        {kpi.measurementType.toLowerCase()}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {kpi.direction.replace(/_/g, ' ')}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                      {kpi.targetValue} {kpi.unit}
                    </td>

                    <td className="py-3.5 px-4 text-center font-semibold text-indigo-700">
                      {kpi.weight}%
                      {!kpi.active && <div className="text-[10px] text-slate-400 font-normal">inactive</div>}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">{kpi.ownerName}</td>

                    {canManage && (
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(kpi)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit KPI Parameters"
                          aria-label={`Edit ${kpi.kpiCode}`}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredKPIs.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="py-8 text-center text-slate-400">
                    No KPIs match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 my-8">
            <h3 className="text-base font-bold text-slate-900">
              {editingKPI ? 'Edit Key Performance Indicator' : 'Create New KPI'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">KPI Code</label>
                  <input
                    type="text"
                    required
                    value={formData.kpiCode}
                    onChange={(e) => setFormData({ ...formData, kpiCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Parent KRA</label>
                  <select
                    value={formData.kraId}
                    onChange={(e) => setFormData({ ...formData, kraId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                  >
                    {kras.map((k) => (
                      <option key={k.id} value={k.id}>
                        KRA {k.kraNumber}: {k.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">KPI Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Contract Drafting SLA Turnaround Compliance"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description & Formula Context</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Measurement Type</label>
                  <select
                    value={formData.measurementType}
                    onChange={(e) => setFormData({ ...formData, measurementType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                  >
                    {MEASUREMENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Performance Direction</label>
                  <select
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                  >
                    {DIRECTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">KPI Owner</label>
                  <select
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                  >
                    {formData.ownerId && !users.some((u) => u.id === formData.ownerId) && (
                      <option value={formData.ownerId}>{formData.ownerName || formData.ownerId}</option>
                    )}
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Frequency</label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="HALF_YEARLY">Half-Yearly</option>
                    <option value="YEARLY">Yearly</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Calculation</label>
                  <select
                    value={formData.calculationMethod}
                    onChange={(e) => setFormData({ ...formData, calculationMethod: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
                  >
                    <option value="MANUAL">Manual entry</option>
                    <option value="AUTOMATIC" disabled={!editingKPI || editingKPI.calculationMethod !== 'AUTOMATIC'}>
                      Automatic (from registers)
                    </option>
                  </select>
                </div>
              </div>

              {formData.direction === 'TARGET_RANGE' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Minimum Acceptable Value (lower bound)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.minAcceptableValue ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, minAcceptableValue: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400">Actuals between this value and the target score 100%.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Target Value</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.targetValue}
                    onChange={(e) => setFormData({ ...formData, targetValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit of Measurement</label>
                  <input
                    type="text"
                    placeholder="%, Days, ₹ Cr, Cases"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Weight within KRA (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                  {projectedKraWeight !== null && Math.abs(projectedKraWeight - 100) >= 0.01 && (
                    <span className="text-[10px] text-amber-700">KPIs in this KRA will total {projectedKraWeight}% (should be 100%)</span>
                  )}
                </div>
              </div>

              {editingKPI && (
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.active ?? true}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  Active (included in KRA scoring)
                </label>
              )}

              {formError && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{formError}</div>}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {editingKPI ? 'Update KPI' : 'Save KPI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
