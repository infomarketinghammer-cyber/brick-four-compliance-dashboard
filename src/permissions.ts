import { User } from './types';

export type AppTab =
  | 'personal_dashboard'
  | 'dashboard'
  | 'kras'
  | 'kpis'
  | 'measurements'
  | 'operations'
  | 'management'
  | 'projects'
  | 'employees'
  | 'reviews'
  | 'reports'
  | 'audit'
  | 'settings';

export const isAdmin = (user?: User | null) => user?.role === 'LEGAL_HEAD' || user?.role === 'SUPER_ADMIN';

export const isExecutiveStaff = (user?: User | null) =>
  !isAdmin(user) && (user?.role === 'LEGAL_EXECUTIVE' || user?.level === 3);

export const isManager = (user?: User | null) => user?.role === 'LEGAL_MANAGER' || user?.level === 2;

export const isReadOnlyViewer = (user?: User | null) => user?.role === 'AUDITOR' || user?.role === 'MANAGEMENT';

/** Mirrors the server-side role guards so the UI never offers an action the API will refuse */
export function canAccessTab(user: User | null | undefined, tab: string): boolean {
  if (!user) return false;
  switch (tab as AppTab) {
    case 'personal_dashboard':
    case 'kras':
    case 'kpis':
    case 'operations':
      return true;
    case 'dashboard':
    case 'management':
    case 'projects':
    case 'reports':
      return !isExecutiveStaff(user);
    case 'employees':
      return isAdmin(user) || isManager(user) || user.role === 'MANAGEMENT';
    case 'reviews':
      return isAdmin(user) || isReadOnlyViewer(user);
    case 'audit':
      return isAdmin(user) || isReadOnlyViewer(user);
    case 'measurements':
    case 'settings':
      return isAdmin(user);
    default:
      return false;
  }
}

export const canEditRegisters = (user?: User | null) => Boolean(user) && !isReadOnlyViewer(user);
