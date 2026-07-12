import {
  Bus, Gamepad2, GraduationCap, HeartPulse, MoreHorizontal,
  Plane, Receipt, ShoppingBag, ShoppingCart, Utensils, Wallet
} from 'lucide-react';

// Single source of truth for category names, chart colors, and icon styling.
// The backend keeps its own copy of the name list in gemini.js (separate runtime).
export const CATEGORY_META = {
  Dining:        { color: '#1558C0', bgClass: 'bg-blue-50 text-blue-700',       icon: Utensils },
  Groceries:     { color: '#6E97F7', bgClass: 'bg-indigo-50 text-indigo-600',   icon: ShoppingBag },
  Transport:     { color: '#D66300', bgClass: 'bg-orange-50 text-orange-600',   icon: Bus },
  Shopping:      { color: '#0F766E', bgClass: 'bg-emerald-50 text-emerald-600', icon: ShoppingCart },
  Bills:         { color: '#7C3AED', bgClass: 'bg-violet-50 text-violet-600',   icon: Receipt },
  Health:        { color: '#EC4899', bgClass: 'bg-pink-50 text-pink-600',       icon: HeartPulse },
  Travel:        { color: '#2563EB', bgClass: 'bg-sky-50 text-sky-600',         icon: Plane },
  Entertainment: { color: '#9333EA', bgClass: 'bg-purple-50 text-purple-700',   icon: Gamepad2 },
  Education:     { color: '#D97706', bgClass: 'bg-amber-50 text-amber-700',     icon: GraduationCap },
  Income:        { color: '#059669', bgClass: 'bg-emerald-50 text-emerald-700', icon: Wallet },
  Other:         { color: '#64748B', bgClass: 'bg-slate-100 text-slate-600',    icon: MoreHorizontal }
};

// Assignable spending categories (Income is display-only)
export const CATEGORIES = Object.keys(CATEGORY_META).filter((c) => c !== 'Income');

export function categoryMeta(name) {
  return CATEGORY_META[name] || CATEGORY_META.Other;
}
