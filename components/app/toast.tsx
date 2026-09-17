"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

export function Toast() {
  const toast = useApp((s) => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), toast.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !show) return null;
  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg",
        toast.kind === "error" ? "bg-red-600 text-white" : toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-ink text-white"
      )}
    >
      {toast.text}
    </div>
  );
}
