import { RefreshCcw } from 'lucide-react';

export default function LoadingCard({ label }) {
  return (
    <div className="page-outer page-content">
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-100 bg-white">
        <RefreshCcw className="h-12 w-12 animate-spin text-blue-600" />
        <p className="text-sm font-bold uppercase tracking-widest text-slate-400">{label}</p>
      </div>
    </div>
  );
}
