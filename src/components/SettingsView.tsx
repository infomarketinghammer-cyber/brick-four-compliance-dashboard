import React, { useEffect, useState } from 'react';
import { Settings, Save, CheckCircle2, Sliders, ShieldCheck, AlertCircle } from 'lucide-react';
import { ScoringSettings } from '../types';

interface SettingsViewProps {
  settings: ScoringSettings;
  onSaveSettings: (settings: Partial<ScoringSettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [formData, setFormData] = useState<ScoringSettings>({ enforce100PercentWeight: true, ...settings });
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Keep the form in sync with the saved server values
  useEffect(() => {
    setFormData({ enforce100PercentWeight: true, ...settings });
  }, [settings]);

  const validate = (s: ScoringSettings): string => {
    if (!(s.behindThreshold > 0 && s.behindThreshold < s.atRiskThreshold && s.atRiskThreshold <= s.onTrackThreshold)) {
      return 'Thresholds must satisfy 0 < Behind < At Risk ≤ On Track.';
    }
    if (s.maxAchievementCap < 100 || s.maxAchievementCap > 200) return 'Achievement cap must be between 100% and 200%.';
    if (s.minAchievementFloor < 0 || s.minAchievementFloor >= s.behindThreshold) {
      return 'Achievement floor must be at least 0 and below the Behind threshold.';
    }
    if (!Number.isInteger(s.roundingDecimals) || s.roundingDecimals < 0 || s.roundingDecimals > 4) {
      return 'Decimal precision must be a whole number from 0 to 4.';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(formData);
    setError(validationError);
    if (validationError) return;

    setIsSaving(true);
    try {
      await onSaveSettings({
        behindThreshold: formData.behindThreshold,
        atRiskThreshold: formData.atRiskThreshold,
        onTrackThreshold: formData.onTrackThreshold,
        maxAchievementCap: formData.maxAchievementCap,
        minAchievementFloor: formData.minAchievementFloor,
        roundingDecimals: formData.roundingDecimals,
        enforce100PercentWeight: formData.enforce100PercentWeight,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const numberField = (key: keyof ScoringSettings, label: string, hint: string, labelClass = 'text-slate-700', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className={`font-semibold block mb-1 ${labelClass}`} htmlFor={`setting-${key}`}>
        {label}
      </label>
      <input
        id={`setting-${key}`}
        type="number"
        value={Number.isFinite(formData[key] as number) ? (formData[key] as number) : ''}
        onChange={(e) => setFormData({ ...formData, [key]: e.target.value === '' ? NaN : Number(e.target.value) })}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-bold"
        {...extra}
      />
      <span className="text-[10px] text-slate-400">{hint}</span>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-indigo-600" />
            Scoring Rules, Thresholds & Engine Settings
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            These parameters drive every KPI achievement, KRA score, and status band across the application.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Status Banding Thresholds */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            Performance Status Thresholds
          </h3>
          <p className="text-xs text-slate-500">
            Achievement below <strong>Behind</strong> is BEHIND; below <strong>At Risk</strong> is AT RISK; up to{' '}
            <strong>On Track</strong> is ON TRACK; anything above is EXCEEDS TARGET.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {numberField('behindThreshold', 'Behind Threshold (Under %)', 'Score < this value is BEHIND', 'text-rose-700')}
            {numberField('atRiskThreshold', 'At Risk Threshold (Under %)', 'Score between Behind and this value is AT RISK', 'text-amber-700')}
            {numberField('onTrackThreshold', 'On Track Ceiling (%)', 'Scores above this are EXCEEDS TARGET', 'text-emerald-700')}
          </div>
        </div>

        {/* Calculation Policy & Capping */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            Mathematical Capping & Weight Governance
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {numberField(
              'maxAchievementCap',
              'Maximum KPI Achievement (%)',
              '100 prevents over-performance in one KPI masking deficits elsewhere. A KPI-level cap overrides this.',
              'text-slate-700',
              { min: 100, max: 200 }
            )}
            {numberField('minAchievementFloor', 'Minimum KPI Achievement (%)', 'Floor applied to every KPI (usually 0)', 'text-slate-700', { min: 0 })}
            {numberField('roundingDecimals', 'Decimal Precision', 'Decimal places for achievements and scores (0–4)', 'text-slate-700', {
              min: 0,
              max: 4,
              step: 1,
            })}
          </div>

          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <div>
              <div className="font-bold text-slate-900">Strict 100% KRA Weight Enforcement</div>
              <div className="text-[11px] text-slate-500">
                A period cannot be submitted for review or locked unless active KRA weights total exactly 100%.
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.enforce100PercentWeight !== false}
              onChange={(e) => setFormData({ ...formData, enforce100PercentWeight: e.target.checked })}
              className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
            />
          </label>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {isSaved ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Settings updated — all scores recalculated
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 bg-brand-gradient hover:opacity-90 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Governance Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
