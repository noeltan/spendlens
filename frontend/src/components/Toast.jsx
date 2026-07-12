import { useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState('');
  const timer = useRef(null);
  function showToast(message) {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), 3000);
  }
  return [toast, showToast];
}

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg lg:bottom-8">
      {message}
    </div>
  );
}
