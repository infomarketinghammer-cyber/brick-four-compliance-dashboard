import React from 'react';
import {
  LayoutDashboard,
  Target,
  BarChart3,
  ClipboardCheck,
  Briefcase,
  Layers,
  Users,
  FileSpreadsheet,
  History,
  Settings,
  ShieldAlert,
  Building,
  Scale,
  Sparkles,
  FileText,
  Award,
} from 'lucide-react';

import { User } from '../types';
import { canAccessTab, isExecutiveStaff, isManager as isManagerUser } from '../permissions';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  pendingApprovalsCount?: number;
  totalKRAWeight: number;
  isValidWeight: boolean;
  currentUser: User | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingApprovalsCount = 0,
  totalKRAWeight,
  isValidWeight,
  currentUser,
}) => {
  const isExecutive = isExecutiveStaff(currentUser);
  const isManager = isManagerUser(currentUser);

  const groups: Array<{ group: string; items: NavItem[] }> = [
    {
      group: 'PERFORMANCE',
      items: [
        {
          id: 'personal_dashboard',
          label: isExecutive ? 'My KRA & Submissions' : isManager ? 'Personal & Wing Dashboard' : 'Personal Dashboard',
          icon: Award,
          badge: isExecutive ? 'My KRA' : isManager ? 'Approvals' : 'HOD',
          badgeColor: 'bg-emerald-500/20 text-emerald-300',
        },
        { id: 'dashboard', label: 'Department Dashboard', icon: LayoutDashboard },
        {
          id: 'kras',
          label: 'KRA Framework',
          icon: Target,
          badge: isValidWeight ? '100%' : `${totalKRAWeight}%`,
          badgeColor: isValidWeight ? 'bg-emerald-100/10 text-emerald-400' : 'bg-rose-100/10 text-rose-400',
        },
        { id: 'kpis', label: 'KPI Directory', icon: BarChart3 },
        {
          id: 'measurements',
          label: 'Reconciliation & Overrides',
          icon: ClipboardCheck,
          badge: pendingApprovalsCount > 0 ? `Review (${pendingApprovalsCount})` : undefined,
          badgeColor: 'bg-amber-500 text-slate-900',
        },
        { id: 'reviews', label: 'Monthly Reviews', icon: FileText },
      ],
    },
    {
      group: 'LEGAL OPERATIONS',
      items: [
        { id: 'operations', label: 'Operational Registers', icon: Briefcase },
        { id: 'projects', label: 'Projects & Entities', icon: Building },
        { id: 'management', label: 'Executive Summary', icon: ShieldAlert },
      ],
    },
    {
      group: 'STAKEHOLDERS',
      items: [{ id: 'employees', label: 'Team Performance', icon: Users }],
    },
    {
      group: 'GOVERNANCE',
      items: [
        { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
        { id: 'audit', label: 'Audit Trail', icon: History },
        { id: 'settings', label: 'Scoring Rules', icon: Settings },
      ],
    },
  ];

  // Same rules the router and the API enforce
  const navItems = groups
    .map((g) => ({ ...g, items: g.items.filter((item) => canAccessTab(currentUser, item.id)) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="w-72 bg-brand-gradient text-white flex flex-col shrink-0 border-r border-teal-800/30 h-full select-none z-20">
      {/* Branding Header */}
      <div className="bg-transparent px-5 py-3.5 border-b border-teal-800/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-28 flex items-center justify-center">
            <img 
              src="/logo.jpeg" 
              alt="Brick Four Logo" 
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="border-l border-white/20 pl-3">
            <h1 className="text-xs font-black text-white tracking-wider uppercase leading-tight">
              Compliance
            </h1>
            <p className="text-[10px] font-bold text-teal-100 tracking-wider uppercase mt-0.5">
              Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navItems.map((group, gIdx) => (
          <div key={gIdx}>
            <div className="text-[10px] font-bold text-teal-200/80 tracking-wider px-3 mb-2">
              {group.group}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left ${
                      isActive
                        ? 'bg-white/25 text-white font-semibold shadow-sm backdrop-blur-xs'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-white/70'}`} />
                      <div className="truncate">{item.label}</div>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isActive ? 'bg-white/20 text-white' : item.badgeColor
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
