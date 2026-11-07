create extension if not exists pgcrypto;

create table if not exists public.site_settings (
  id integer primary key check (id = 1),
  nightly_rate numeric(10, 2) not null default 0 check (nightly_rate >= 0),
  cleaning_fee numeric(10, 2) not null default 0 check (cleaning_fee >= 0),
  max_guests integer not null default 4 check (max_guests between 1 and 4),
  whatsapp text not null default '' check (char_length(whatsapp) <= 24),
  property_description text not null default 'Entre trilhas, águas claras e o verde da Mata Atlântica, o Chalé Azul foi pensado para quem quer trocar a pressa por presença. Um chalé inteiro, cercado de natureza, com tudo no lugar — inclusive o tempo.',
  public_address text not null default 'Ilhabela · Litoral Norte · São Paulo',
  location_description text not null default 'Ilhabela é um convite para ir mais devagar. Descubra praias, trilhas e cenários inesquecíveis — e aproveite uma estadia feita para descansar entre um passeio e outro.',
  maps_url text not null default 'https://www.google.com/maps/search/?api=1&query=Ilhabela%2C+SP',
  checkin_time text not null default '',
  checkout_time text not null default '',
  house_rules text not null default '',
  payment_policy text not null default '',
  cancellation_policy text not null default '',
  hero_image_path text not null default '',
  hero_image_alt text not null default 'Paisagem da hospedagem em Ilhabela',
  gallery_image_paths text[] not null default array['', '', '', '', '']::text[],
  gallery_image_alts text[] not null default array['', '', '', '', '']::text[],
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.site_settings
  add column if not exists property_description text not null default 'Entre trilhas, águas claras e o verde da Mata Atlântica, o Chalé Azul foi pensado para quem quer trocar a pressa por presença. Um chalé inteiro, cercado de natureza, com tudo no lugar — inclusive o tempo.',
  add column if not exists public_address text not null default 'Ilhabela · Litoral Norte · São Paulo',
  add column if not exists location_description text not null default 'Ilhabela é um convite para ir mais devagar. Descubra praias, trilhas e cenários inesquecíveis — e aproveite uma estadia feita para descansar entre um passeio e outro.',
  add column if not exists maps_url text not null default 'https://www.google.com/maps/search/?api=1&query=Ilhabela%2C+SP',
  add column if not exists checkin_time text not null default '',
  add column if not exists checkout_time text not null default '',
  add column if not exists house_rules text not null default '',
  add column if not exists payment_policy text not null default '',
  add column if not exists cancellation_policy text not null default '',
  add column if not exists hero_image_path text not null default '',
  add column if not exists hero_image_alt text not null default 'Paisagem da hospedagem em Ilhabela',
  add column if not exists gallery_image_paths text[] not null default array['', '', '', '', '']::text[],
  add column if not exists gallery_image_alts text[] not null default array['', '', '', '', '']::text[];

alter table public.site_settings
  alter column max_guests set default 4,
  alter column property_description set default 'Entre trilhas, águas claras e o verde da Mata Atlântica, o Chalé Azul foi pensado para quem quer trocar a pressa por presença. Um chalé inteiro, cercado de natureza, com tudo no lugar — inclusive o tempo.',
  alter column public_address set default 'Ilhabela · Litoral Norte · São Paulo',
  alter column location_description set default 'Ilhabela é um convite para ir mais devagar. Descubra praias, trilhas e cenários inesquecíveis — e aproveite uma estadia feita para descansar entre um passeio e outro.',
  alter column maps_url set default 'https://www.google.com/maps/search/?api=1&query=Ilhabela%2C+SP',
  alter column checkin_time set default '',
  alter column checkout_time set default '',
  alter column house_rules set default '',
  alter column payment_policy set default '',
  alter column cancellation_policy set default '',
  alter column gallery_image_paths set default array['', '', '', '', '']::text[],
  alter column gallery_image_alts set default array['', '', '', '', '']::text[],
  drop constraint if exists site_settings_max_guests_check,
  drop constraint if exists site_settings_max_guests_1_4_check,
  drop constraint if exists site_settings_gallery_image_paths_check,
  drop constraint if exists site_settings_gallery_image_alts_check,
  drop constraint if exists site_settings_property_description_check,
  drop constraint if exists site_settings_public_address_check,
  drop constraint if exists site_settings_location_description_check,
  drop constraint if exists site_settings_maps_url_check,
  drop constraint if exists site_settings_checkin_time_check,
  drop constraint if exists site_settings_checkout_time_check,
  drop constraint if exists site_settings_house_rules_check,
  drop constraint if exists site_settings_payment_policy_check,
  drop constraint if exists site_settings_cancellation_policy_check,
  drop constraint if exists site_settings_hero_image_path_check,
  drop constraint if exists site_settings_hero_image_alt_check;

update public.site_settings
  set max_guests = least(max_guests, 4)
  where max_guests > 4;

update public.site_settings
  set gallery_image_paths = array[
        coalesce(gallery_image_paths[1], ''),
        coalesce(gallery_image_paths[2], ''),
        coalesce(gallery_image_paths[3], ''),
        coalesce(gallery_image_paths[4], ''),
        coalesce(gallery_image_paths[5], '')
      ],
      gallery_image_alts = array[
        coalesce(gallery_image_alts[1], ''),
        coalesce(gallery_image_alts[2], ''),
        coalesce(gallery_image_alts[3], ''),
        coalesce(gallery_image_alts[4], ''),
        coalesce(gallery_image_alts[5], '')
      ]
  where cardinality(gallery_image_paths) <> 5 or cardinality(gallery_image_alts) <> 5;

alter table public.site_settings
  add constraint site_settings_max_guests_1_4_check check (max_guests between 1 and 4),
  add constraint site_settings_gallery_image_paths_check check (cardinality(gallery_image_paths) = 5),
  add constraint site_settings_gallery_image_alts_check check (cardinality(gallery_image_alts) = 5),
  add constraint site_settings_property_description_check check (char_length(property_description) between 1 and 1000),
  add constraint site_settings_public_address_check check (char_length(public_address) between 1 and 200),
  add constraint site_settings_location_description_check check (char_length(location_description) between 1 and 1000),
  add constraint site_settings_maps_url_check check (char_length(maps_url) between 8 and 2000 and maps_url like 'https://%'),
  add constraint site_settings_checkin_time_check check (checkin_time = '' or checkin_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint site_settings_checkout_time_check check (checkout_time = '' or checkout_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint site_settings_house_rules_check check (char_length(house_rules) <= 1200),
  add constraint site_settings_payment_policy_check check (char_length(payment_policy) <= 1200),
  add constraint site_settings_cancellation_policy_check check (char_length(cancellation_policy) <= 1200),
  add constraint site_settings_hero_image_path_check check (char_length(hero_image_path) <= 255),
  add constraint site_settings_hero_image_alt_check check (char_length(hero_image_alt) between 1 and 160);

update public.site_settings
set property_description = 'Entre trilhas, águas claras e o verde da Mata Atlântica, o Chalé Azul foi pensado para quem quer trocar a pressa por presença. Um chalé inteiro, cercado de natureza, com tudo no lugar — inclusive o tempo.'
where property_description in (
  'Entre trilhas, águas claras e o verde da Mata Atlântica, a Casa da Ilha foi pensada para quem quer trocar a pressa por presença. Uma casa inteira, cercada de natureza, com tudo no lugar — inclusive o tempo.',
  'Entre trilhas, águas claras e o verde da Mata Atlântica, o Chalé da Ilha foi pensado para quem quer trocar a pressa por presença. Um chalé inteiro, cercado de natureza, com tudo no lugar — inclusive o tempo.'
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null check (char_length(guest_name) between 2 and 80),
  guest_email text not null check (char_length(guest_email) <= 120),
  guest_phone text not null check (char_length(guest_phone) between 10 and 24),
  checkin date not null,
  checkout date not null,
  guests integer not null check (guests between 1 and 30),
  nights integer not null check (nights between 1 and 90),
  total numeric(10, 2) not null check (total >= 0),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined')),
  privacy_consent_at timestamptz,
  privacy_notice_version text not null default '2026-11-07',
  created_at timestamptz not null default now(),
  constraint reservations_date_order check (checkout > checkin)
);

alter table public.reservations
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists privacy_notice_version text not null default '2026-11-07';

create index if not exists reservations_dates_idx on public.reservations (checkin, checkout);
create index if not exists reservations_created_at_idx on public.reservations (created_at desc);
create index if not exists reservations_status_idx on public.reservations (status);

create table if not exists public.reservation_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count between 1 and 6)
);

create index if not exists reservation_rate_limits_window_idx
  on public.reservation_rate_limits (window_started_at);

alter table public.reservation_rate_limits enable row level security;
revoke all on public.reservation_rate_limits from public, anon, authenticated;

create or replace function public.consume_reservation_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_count integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_key';
  end if;

  delete from public.reservation_rate_limits
    where window_started_at < pg_catalog.now() - interval '24 hours';

  insert into public.reservation_rate_limits (ip_hash, window_started_at, attempt_count)
  values (p_ip_hash, pg_catalog.now(), 1)
  on conflict (ip_hash) do update
    set window_started_at = case
          when public.reservation_rate_limits.window_started_at <= pg_catalog.now() - interval '15 minutes'
            then pg_catalog.now()
          else public.reservation_rate_limits.window_started_at
        end,
        attempt_count = case
          when public.reservation_rate_limits.window_started_at <= pg_catalog.now() - interval '15 minutes'
            then 1
          else least(public.reservation_rate_limits.attempt_count + 1, 6)
        end
  returning attempt_count into v_attempt_count;

  return v_attempt_count <= 5;
end;
$$;

revoke all on function public.consume_reservation_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_reservation_rate_limit(text) to service_role;

create or replace function public.is_reservations_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_reservations_admin() from public, anon;
grant execute on function public.is_reservations_admin() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'casa-da-ilha-images',
  'casa-da-ilha-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view Casa da Ilha photos" on storage.objects;
create policy "Public can view Casa da Ilha photos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'casa-da-ilha-images');

drop policy if exists "Admins can upload Casa da Ilha photos" on storage.objects;
create policy "Admins can upload Casa da Ilha photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'casa-da-ilha-images'
    and (storage.foldername(name))[1] in ('hero', 'gallery')
    and (select public.is_reservations_admin())
  );

drop policy if exists "Admins can delete Casa da Ilha photos" on storage.objects;
create policy "Admins can delete Casa da Ilha photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'casa-da-ilha-images'
    and (select public.is_reservations_admin())
  );

alter table public.site_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "Public can read public booking settings" on public.site_settings;
create policy "Public can read public booking settings"
  on public.site_settings for select
  to anon, authenticated
  using (id = 1);

drop policy if exists "Admins can update booking settings" on public.site_settings;
create policy "Admins can update booking settings"
  on public.site_settings for update
  to authenticated
  using ((select public.is_reservations_admin()))
  with check ((select public.is_reservations_admin()));

drop policy if exists "Admins can read reservations" on public.reservations;
create policy "Admins can read reservations"
  on public.reservations for select
  to authenticated
  using ((select public.is_reservations_admin()));

drop policy if exists "Admins can change reservation status" on public.reservations;
create policy "Admins can change reservation status"
  on public.reservations for update
  to authenticated
  using ((select public.is_reservations_admin()))
  with check ((select public.is_reservations_admin()));

drop policy if exists "Admins can delete reservations" on public.reservations;
create policy "Admins can delete reservations"
  on public.reservations for delete
  to authenticated
  using ((select public.is_reservations_admin()));

revoke all on public.admin_users from anon, authenticated;
revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;
grant delete on public.reservations to authenticated;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update (
  nightly_rate,
  cleaning_fee,
  max_guests,
  whatsapp,
  property_description,
  public_address,
  location_description,
  maps_url,
  checkin_time,
  checkout_time,
  house_rules,
  payment_policy,
  cancellation_policy,
  hero_image_path,
  hero_image_alt,
  gallery_image_paths,
  gallery_image_alts
) on public.site_settings to authenticated;

drop function if exists public.create_reservation(text, text, text, date, date, integer);

create or replace function public.create_reservation(
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_checkin date,
  p_checkout date,
  p_guests integer,
  p_privacy_consent boolean
)
returns table (reservation_id uuid, nights integer, total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.site_settings%rowtype;
  v_nights integer;
  v_total numeric(10, 2);
  v_reservation_id uuid;
  v_phone_digits text;
begin
  if p_privacy_consent is distinct from true then
    raise exception using errcode = '22023', message = 'privacy_consent_required';
  end if;

  if p_guest_name is null or char_length(trim(p_guest_name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_guest_name';
  end if;

  if p_guest_email is null
    or char_length(trim(p_guest_email)) > 120
    or trim(p_guest_email) !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$'
  then
    raise exception using errcode = '22023', message = 'invalid_guest_email';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_guest_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_phone_digits) not between 10 and 15 or char_length(trim(p_guest_phone)) > 24 then
    raise exception using errcode = '22023', message = 'invalid_guest_phone';
  end if;

  if p_checkin is null
    or p_checkout is null
    or p_checkin < (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    or p_checkout <= p_checkin
  then
    raise exception using errcode = '22023', message = 'invalid_stay_dates';
  end if;

  v_nights := p_checkout - p_checkin;
  if v_nights > 90 then
    raise exception using errcode = '22023', message = 'stay_too_long';
  end if;

  select settings.*
    into v_settings
    from public.site_settings as settings
    where settings.id = 1;

  if not found or v_settings.nightly_rate <= 0 then
    raise exception using errcode = '55000', message = 'booking_prices_not_configured';
  end if;

  if p_guests is null or p_guests < 1 or p_guests > v_settings.max_guests then
    raise exception using errcode = '22023', message = 'invalid_guest_count';
  end if;

  v_total := (v_nights * v_settings.nightly_rate) + v_settings.cleaning_fee;

  perform pg_catalog.pg_advisory_xact_lock(2026110701);

  if exists (
    select 1
    from public.reservations as existing
    where existing.status in ('requested', 'confirmed')
      and existing.checkin < p_checkout
      and existing.checkout > p_checkin
  ) then
    raise exception using errcode = '23P01', message = 'stay_dates_unavailable';
  end if;

  insert into public.reservations (
    guest_name,
    guest_email,
    guest_phone,
    checkin,
    checkout,
    guests,
    nights,
    total,
    privacy_consent_at,
    privacy_notice_version
  )
  values (
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    trim(p_guest_phone),
    p_checkin,
    p_checkout,
    p_guests,
    v_nights,
    v_total,
    pg_catalog.now(),
    '2026-11-07'
  )
  returning id into v_reservation_id;

  return query select v_reservation_id, v_nights, v_total;
end;
$$;

revoke all on function public.create_reservation(text, text, text, date, date, integer, boolean) from public, anon, authenticated;
grant execute on function public.create_reservation(text, text, text, date, date, integer, boolean) to service_role;

create or replace function public.update_reservation_status(
  p_reservation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  if not (select public.is_reservations_admin()) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_status is null or p_status not in ('requested', 'confirmed', 'declined') then
    raise exception using errcode = '22023', message = 'invalid_reservation_status';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026110701);

  select reservation.*
    into v_reservation
    from public.reservations as reservation
    where reservation.id = p_reservation_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'reservation_not_found';
  end if;

  if p_status in ('requested', 'confirmed') and exists (
    select 1
    from public.reservations as existing
    where existing.id <> p_reservation_id
      and existing.status in ('requested', 'confirmed')
      and existing.checkin < v_reservation.checkout
      and existing.checkout > v_reservation.checkin
  ) then
    raise exception using errcode = '23P01', message = 'stay_dates_unavailable';
  end if;

  update public.reservations
    set status = p_status
    where id = p_reservation_id;
end;
$$;

revoke all on function public.update_reservation_status(uuid, text) from public, anon;
grant execute on function public.update_reservation_status(uuid, text) to authenticated;
