-- MO EVENTOS | Esquema inicial PostgreSQL / Supabase
-- Execute no SQL Editor do Supabase. Rever as políticas antes de produção.

create extension if not exists pgcrypto;

create type public.app_role as enum ('platform_admin', 'event_admin', 'operator');
create type public.event_visibility as enum ('public', 'private');
create type public.event_status as enum ('draft', 'published', 'completed', 'cancelled');
create type public.ticket_status as enum ('valid', 'used', 'cancelled', 'pending');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Utilizador',
  role public.app_role not null default 'operator',
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  venue text not null,
  event_date date not null,
  event_time time not null default '18:00',
  visibility public.event_visibility not null default 'public',
  status public.event_status not null default 'draft',
  capacity integer not null default 100 check (capacity > 0),
  ticket_price numeric(14,2) not null default 0 check (ticket_price >= 0),
  cover_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_role public.app_role not null check (event_role in ('event_admin','operator')),
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(14,2) not null default 0 check (price >= 0),
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  buyer_name text not null,
  buyer_email text,
  buyer_phone text,
  total numeric(14,2) not null default 0 check (total >= 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  provider_reference text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text,
  provider_reference text,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','failed','refunded')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  guest_name text not null,
  guest_email text,
  code text not null unique default upper(encode(gen_random_bytes(8), 'hex')),
  token uuid not null unique default gen_random_uuid(),
  status public.ticket_status not null default 'valid',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.profiles(id)
);

create table public.ticket_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  background_path text not null,
  qr_x numeric not null default 75,
  qr_y numeric not null default 60,
  qr_size numeric not null default 18,
  guest_name_x numeric,
  guest_name_y numeric,
  created_at timestamptz not null default now()
);

create table public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete set null,
  code text not null,
  guest_name text,
  result text not null check (result in ('ACEITE','RECUSADO')),
  reason text not null,
  operator_id uuid references public.profiles(id),
  scanned_at timestamptz not null default now()
);

create index events_public_idx on public.events(visibility, status, event_date);
create index event_members_user_idx on public.event_members(user_id, event_id);
create index invitations_event_idx on public.invitations(event_id);
create index invitations_code_idx on public.invitations(code);
create index scan_logs_event_date_idx on public.scan_logs(event_id, scanned_at desc);
create index orders_event_idx on public.orders(event_id, created_at desc);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin');
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.event_members em
      where em.event_id = p_event_id and em.user_id = auth.uid()
        and em.event_role in ('event_admin')
    )
    or exists (
      select 1 from public.events e
      where e.id = p_event_id and e.created_by = auth.uid()
    );
$$;

create or replace function public.can_scan_event(p_event_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.event_members em
      where em.event_id = p_event_id and em.user_id = auth.uid()
        and em.event_role in ('event_admin','operator')
    )
    or exists (
      select 1 from public.events e
      where e.id = p_event_id and e.created_by = auth.uid()
    );
$$;

-- Perfil automático para novos utilizadores; privilégios elevados nunca são atribuídos pelo cliente.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 'operator')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Validação transaccional: o ingresso pertence ao evento seleccionado e só pode ser usado uma vez.
create or replace function public.validate_ticket(p_event_id uuid, p_code text)
returns table(valid boolean, guest_name text, message text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_ticket public.invitations%rowtype;
begin
  if auth.uid() is null or not public.can_scan_event(p_event_id) then
    raise exception 'Sem autorização para validar ingressos neste evento.';
  end if;

  select * into v_ticket
  from public.invitations
  where code = upper(trim(p_code))
  for update;

  if not found then
    insert into public.scan_logs(event_id, code, result, reason, operator_id)
    values(p_event_id, upper(trim(p_code)), 'RECUSADO', 'Código inexistente.', auth.uid());
    return query select false, null::text, 'Código inexistente.';
    return;
  end if;

  if v_ticket.event_id <> p_event_id then
    insert into public.scan_logs(event_id, invitation_id, code, guest_name, result, reason, operator_id)
    values(p_event_id, v_ticket.id, v_ticket.code, v_ticket.guest_name, 'RECUSADO', 'Ingresso associado a outro evento.', auth.uid());
    return query select false, v_ticket.guest_name, 'Este ingresso pertence a outro evento.';
    return;
  end if;

  if v_ticket.status <> 'valid' then
    insert into public.scan_logs(event_id, invitation_id, code, guest_name, result, reason, operator_id)
    values(p_event_id, v_ticket.id, v_ticket.code, v_ticket.guest_name, 'RECUSADO',
      case when v_ticket.status = 'used' then 'Ingresso já utilizado.' else 'Ingresso não activo.' end, auth.uid());
    return query select false, v_ticket.guest_name,
      case when v_ticket.status = 'used' then 'Este ingresso já foi utilizado.' else 'Este ingresso não está activo.' end;
    return;
  end if;

  update public.invitations
  set status = 'used', used_at = now(), used_by = auth.uid()
  where id = v_ticket.id;

  insert into public.scan_logs(event_id, invitation_id, code, guest_name, result, reason, operator_id)
  values(p_event_id, v_ticket.id, v_ticket.code, v_ticket.guest_name, 'ACEITE', 'Entrada autorizada.', auth.uid());

  return query select true, v_ticket.guest_name, 'Entrada autorizada.';
end;
$$;

revoke all on function public.validate_ticket(uuid,text) from public;
grant execute on function public.validate_ticket(uuid,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.invitations enable row level security;
alter table public.ticket_templates enable row level security;
alter table public.scan_logs enable row level security;

create policy "profiles self or platform admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_platform_admin());
create policy "platform admin update profiles" on public.profiles
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "public published events and authorized events" on public.events
for select to anon, authenticated using (
  (visibility = 'public' and status = 'published')
  or created_by = auth.uid()
  or public.is_platform_admin()
  or exists(select 1 from public.event_members em where em.event_id = id and em.user_id = auth.uid())
);
create policy "event managers insert events" on public.events
for insert to authenticated with check (created_by = auth.uid() or public.is_platform_admin());
create policy "event managers update events" on public.events
for update to authenticated using (public.can_manage_event(id)) with check (public.can_manage_event(id));
create policy "event managers delete events" on public.events
for delete to authenticated using (public.can_manage_event(id));

create policy "members view event membership" on public.event_members
for select to authenticated using (user_id = auth.uid() or public.is_platform_admin() or public.can_manage_event(event_id));
create policy "managers manage event membership" on public.event_members
for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "public view ticket types for public events" on public.ticket_types
for select to anon, authenticated using (
  exists(select 1 from public.events e where e.id = event_id and e.visibility='public' and e.status='published')
  or public.can_manage_event(event_id) or public.can_scan_event(event_id)
);
create policy "managers manage ticket types" on public.ticket_types
for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "managers view orders" on public.orders
for select to authenticated using (public.can_manage_event(event_id));
create policy "managers manage orders" on public.orders
for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "managers view payments" on public.payments
for select to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id and public.can_manage_event(o.event_id))
);
create policy "managers manage payments" on public.payments
for all to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id and public.can_manage_event(o.event_id))
) with check (
  exists(select 1 from public.orders o where o.id = order_id and public.can_manage_event(o.event_id))
);

create policy "managers and operators view invitations" on public.invitations
for select to authenticated using (public.can_manage_event(event_id) or public.can_scan_event(event_id));
create policy "managers manage invitations" on public.invitations
for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "managers manage ticket templates" on public.ticket_templates
for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "authorized users read scan logs" on public.scan_logs
for select to authenticated using (public.can_manage_event(event_id) or public.can_scan_event(event_id));
-- A inserção de scan_logs é feita pela função validate_ticket; não conceder inserção directa ao cliente.

-- Depois de criar o primeiro utilizador, promover manualmente o seu perfil:
-- update public.profiles set role = 'platform_admin' where id = 'UUID-DO-UTILIZADOR';
