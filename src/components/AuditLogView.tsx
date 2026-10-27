import React, { useState } from 'react';
import { History, Search, Shield, Filter, Calendar, UserCheck } from 'lucide-react';
import { AuditLogEntry } from '../types';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  const filteredLogs = logs.filter((l) => {
    const matchSearch =
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.reason && l.reason.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.newValue && l.newValue.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchAction = filterAction === 'ALL' || l.action === filterAction;
    return matchSearch && matchAction;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-600" />
            Regulatory Governance & Audit Trail
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Immutable system logs tracking every KRA weight reallocation, manual KPI override, period lock/unlock event, and document upload.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
          <Shield className="w-4 h-4" />
          Tamper-Evident Ledger Active
        </span>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by action, user, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total Recorded Audit Events: <strong className="text-slate-900">{filteredLogs.length}</strong>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-3">User & Authority</th>
                <th className="py-3 px-3">Governance Action</th>
                <th className="py-3 px-4">Delta / Modifications</th>
                <th className="py-3 px-4">Audit Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {log.timestamp.slice(0, 19).replace('T', ' ')}
                  </td>

                  <td className="py-3.5 px-3">
                    <div className="font-bold text-slate-900">{log.userName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.userRole}</div>
                  </td>

                  <td className="py-3.5 px-3">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {log.action}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 max-w-xs">
                    {log.oldValue && (
                      <div className="text-slate-400 line-through text-[11px]">
                        Prev: {log.oldValue}
                      </div>
                    )}
                    <div className="text-slate-900 font-semibold">{log.newValue}</div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600 max-w-sm">
                    {log.reason ? (
                      <span className="italic">{log.reason}</span>
                    ) : (
                      <span className="text-slate-400">System standard event</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
