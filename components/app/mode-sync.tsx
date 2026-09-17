"use client";

import { useEffect } from "react";
import { useApp } from "@/store/app-store";
import type { Mode } from "@/lib/types";

/** 서버가 판정한 모드를 클라이언트 스토어에 반영 */
export function ModeSync({ mode }: { mode: Mode }) {
  const setMode = useApp((s) => s.setMode);
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);
  return null;
}
