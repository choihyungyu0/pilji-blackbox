"use client";

import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useApp } from "@/store/app-store";

/** 문서 공통 기관·결재선 — 기안문 서식(별지1)의 발신명의·기안자·검토자·결재권자·시행·주소·연락처·공개구분 */
export function OrgForm({ defaultOpen }: { defaultOpen?: boolean }) {
  const org = useApp((s) => s.org);
  const setOrg = useApp((s) => s.setOrg);
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const filled = ["dept", "drafter", "approver", "orgAddr", "orgTel"].filter((k) => org[k as keyof typeof org]).length;
  const F = ({ k, label, ph, w }: { k: keyof typeof org; label: string; ph?: string; w?: string }) => (
    <label className={`block ${w ?? ""}`}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input className="input mt-0.5 h-8 w-full text-xs" value={org[k]} placeholder={ph} onChange={(e) => setOrg({ [k]: e.target.value })} />
    </label>
  );
  return (
    <section className="card text-xs">
      <button className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setOpen((v) => !v)}>
        <Building2 className="size-4" />
        <span className="font-semibold">기관·결재선 (모든 문서 공통)</span>
        <span className={`chip ml-1 ${filled >= 5 ? "text-green-700" : "text-amber-800"}`}>{filled}/5 필수</span>
        <ChevronDown className={`ml-auto size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 border-t border-border p-3 sm:grid-cols-3">
          <F k="orgName" label="행정기관명" ph="안양시" />
          <F k="dept" label="처리과 *" ph="만안구청 건축과" />
          <F k="drafter" label="기안자 직위(직급) *" ph="주무관" />
          <F k="reviewer" label="검토자" ph="팀장" />
          <F k="approver" label="결재권자 *" ph="과장" />
          <F k="coop" label="협조자" ph="" />
          <F k="orgAddr" label="주소 *" ph="경기도 안양시 만안구 … (우편번호)" w="sm:col-span-2" />
          <F k="orgTel" label="전화 *" ph="031-8045-" />
          <F k="orgFax" label="팩스" />
          <F k="orgEmail" label="전자우편(기관)" />
          <F k="openClass" label="공개 구분" ph="부분공개(개인정보)" />
          <p className="col-span-full text-[10px] text-muted-foreground">직위만 적어도 됩니다. 당사자(건축주·거주자) 정보는 어디에도 입력하지 않습니다 — 발송 시 담당자가 원본에 직접 기재.</p>
        </div>
      )}
    </section>
  );
}
