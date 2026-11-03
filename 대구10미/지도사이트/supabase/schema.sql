-- 비플페이 지도 스키마. Supabase SQL Editor에서 한 번 실행한다. 여러 번 실행해도 안전하다.

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  road text not null,
  area text not null,
  display_name text not null,
  boundary jsonb not null,          -- GeoJSON Polygon
  boundary_exact boolean not null,  -- false면 경계가 없어 주변 사각형으로 대신한 구획
  store_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- 식당 하나의 비플페이 상태는 구획이 겹쳐도 하나로 공유한다.
create table if not exists public.stores (
  biz_id text primary key,          -- 상가정보 API의 bizesId
  name text not null,
  branch text,
  category_mid text,
  category_small text,
  address text,
  floor text,
  lon double precision not null,
  lat double precision not null,
  beeple_status text check (beeple_status in ('available', 'unavailable')),
  beeple_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.zone_stores (
  zone_id uuid not null references public.zones (id) on delete cascade,
  biz_id text not null references public.stores (biz_id) on delete cascade,
  primary key (zone_id, biz_id)
);

-- 표시는 최신 응답을 따르고, 이 이력으로 잘못된 제보를 되돌릴 수 있다.
create table if not exists public.beeple_reports (
  id bigint generated always as identity primary key,
  biz_id text not null references public.stores (biz_id) on delete cascade,
  status text not null check (status in ('available', 'unavailable')),
  device_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists beeple_reports_device_idx on public.beeple_reports (device_id, created_at desc);

alter table public.zones enable row level security;
alter table public.stores enable row level security;
alter table public.zone_stores enable row level security;
alter table public.beeple_reports enable row level security;

-- 누구나 읽을 수 있지만 직접 쓰지는 못한다. 제보 이력은 공개하지 않는다.
drop policy if exists "공개 조회" on public.zones;
create policy "공개 조회" on public.zones for select to anon, authenticated using (true);
drop policy if exists "공개 조회" on public.stores;
create policy "공개 조회" on public.stores for select to anon, authenticated using (true);
drop policy if exists "공개 조회" on public.zone_stores;
create policy "공개 조회" on public.zone_stores for select to anon, authenticated using (true);

grant select on public.zones, public.stores, public.zone_stores to anon, authenticated;

-- 로그인 없는 사용자의 제보는 이 함수로만 받는다.
create or replace function public.report_beeple(p_biz_id text, p_status text, p_device_id text)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.stores;
begin
  if p_status not in ('available', 'unavailable') then
    raise exception '잘못된 상태입니다.';
  end if;
  if p_device_id is null or length(p_device_id) not between 8 and 64 then
    raise exception '잘못된 기기 정보입니다.';
  end if;
  if (select count(*) from beeple_reports
      where device_id = p_device_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception '제보가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  update stores
    set beeple_status = p_status, beeple_updated_at = now()
    where biz_id = p_biz_id
    returning * into result;
  if not found then
    raise exception '없는 식당입니다.';
  end if;

  insert into beeple_reports (biz_id, status, device_id) values (p_biz_id, p_status, p_device_id);
  return result;
end;
$$;

revoke execute on function public.report_beeple(text, text, text) from public;
grant execute on function public.report_beeple(text, text, text) to anon, authenticated;

-- 다른 사용자의 제보가 바로 보이도록 실시간 전송을 켠다.
do $$
begin
  alter publication supabase_realtime add table public.stores;
exception when duplicate_object then null;
end;
$$;
