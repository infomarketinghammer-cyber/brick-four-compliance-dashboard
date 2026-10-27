import React, { useState } from 'react';
import { Calendar, Bell, Sparkles, X, LogOut } from 'lucide-react';
import { PerformancePeriod, NotificationItem, User } from '../types';

interface HeaderProps {
  periods: PerformancePeriod[];
  currentPeriodId: string;
  onSelectPeriod: (periodId: string) => void;
  currentUser: User | null;
  onLogout?: () => void;
  notifications: NotificationItem[];
  onOpenNotification: (n: NotificationItem) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenAIAssistant: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  periods,
  currentPeriodId,
  onSelectPeriod,
  currentUser,
  onLogout,
  notifications,
  onOpenNotification,
  onMarkAllNotificationsRead,
  onOpenAIAssistant,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const currentPeriod = periods.find((p) => p.id === currentPeriodId);

  return (
    <header className="bg-brand-gradient border-b border-teal-800/30 sticky top-0 z-30 shrink-0 h-14 flex items-center text-white">
      <div className="px-4 lg:px-6 flex items-center justify-end w-full gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Performance Period Selector */}
          <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white">
            <Calendar className="w-3.5 h-3.5 text-teal-200 shrink-0" />
            <select
              value={currentPeriodId}
              onChange={(e) => onSelectPeriod(e.target.value)}
              aria-label="Performance period"
              className="bg-transparent font-bold text-white focus:outline-none cursor-pointer [&>option]:bg-slate-900 [&>option]:text-white"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.status === 'LOCKED' ? '🔒' : p.status === 'APPROVED' ? '✓' : ''}
                </option>
              ))}
            </select>
            {currentPeriod && (
              <span
                className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  currentPeriod.status === 'LOCKED'
                    ? 'bg-slate-200 text-slate-800'
                    : currentPeriod.status === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {currentPeriod.status.replace('_', ' ')}
              </span>
            )}
          </div>

          {/* AI Legal Intelligence Advisor */}
          <button
            onClick={onOpenAIAssistant}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            title="Ask the AI Legal Intelligence Advisor"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span className="hidden md:inline">AI Advisor</span>
          </button>

          {/* Active Logged-in Employee */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl p-1 pr-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                  {currentUser.name
                    .replace(/^(mrs\.|mr\.|ms\.|ar\.|adv\.|ca)\s*/i, '')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="text-left leading-tight hidden sm:block max-w-[170px] lg:max-w-[200px]">
                  <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                  <div className="text-[10px] text-teal-100/80 truncate font-medium">{currentUser.designation}</div>
                </div>

                <div className="hidden md:flex items-center gap-1 pl-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/20 text-white border border-white/30">
                    {currentUser.level === 1 ? 'HOD' : currentUser.level === 2 ? 'Manager' : 'Staff'}
                  </span>
                  {currentUser.wing && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-teal-100">
                      {currentUser.wing}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              aria-label={`Notifications (${unreadCount} unread)`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 overflow-hidden text-slate-800">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <Bell className="w-3.5 h-3.5 text-indigo-600" />
                    Compliance Notifications ({notifications.length})
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 px-1.5"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                      aria-label="Close notifications"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto mt-2">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">No notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setShowNotifications(false);
                          onOpenNotification(n);
                        }}
                        className={`w-full text-left py-2 px-1 hover:bg-slate-50 transition-colors flex gap-2 ${n.read ? 'opacity-60' : ''}`}
                      >
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />}
                        <span className="flex-1">
                          <span className="block font-semibold text-xs text-slate-800">{n.title}</span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">{n.message}</span>
                          <span className="block text-[9px] text-slate-400 mt-1">{n.timestamp}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0 ml-1"
              title="Sign Out to Login Screen"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-300" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
