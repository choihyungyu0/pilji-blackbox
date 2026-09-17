-- 필지 블랙박스 — Supabase SQL Editor 에서 실행 (재실행 안전)
-- 판정·작업 로그만 저장한다. 건물 데이터는 정적 파일. 개인 식별 필드 없음 (SEC-02).
-- 서버(service_role 키)로만 접근하므로 RLS 는 켜고 정책은 만들지 않는다.

-- 1) 현장 판정 (INV-02) — 건물당 최신 1건
create table if not exists public.pb_verdicts (
  building_id integer primary key,
  pnu text not null,
  verdict text not null check (verdict in ('VIOLATION', 'NORMAL', 'NOT_TARGET', 'HOLD')),
  memo text,
  decided_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists pb_verdicts_pnu_idx on public.pb_verdicts (pnu);
alter table public.pb_verdicts enable row level security;

create or replace function public.pb_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
drop trigger if exists pb_verdicts_touch on public.pb_verdicts;
create trigger pb_verdicts_touch before update on public.pb_verdicts
  for each row execute function public.pb_touch_updated_at();

-- 2) 작업 로그 (SEC-04) — 에이전트 호출·문서 생성·판정 변경
create table if not exists public.pb_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  summary text not null,
  payload jsonb
);
create index if not exists pb_logs_created_at_idx on public.pb_logs (created_at desc);
alter table public.pb_logs enable row level security;
