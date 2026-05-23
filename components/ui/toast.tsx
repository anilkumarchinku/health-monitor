"use client";

import { CheckCircle2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Toast = {
  id: number;
  message: string;
};

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((current) => [...current.slice(-2), { id, message }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex min-h-12 w-full max-w-sm animate-in items-center gap-3 rounded-lg border border-emerald-200 bg-white/95 px-4 py-3 text-sm font-medium text-emerald-950 shadow-soft backdrop-blur-xl duration-200 slide-in-from-bottom-4"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context.showToast;
}
