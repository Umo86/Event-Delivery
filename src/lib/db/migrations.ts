// Database migrations. Applied automatically (in order, once) the first time the app talks to the database.
// Never edit a migration that has shipped: add a new one instead.

export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: /* sql */ `
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  job_title text,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  password_hash text not null,
  must_change_password boolean not null default false,
  active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_idx on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text not null default 'ExCeL London',
  build_start date,
  show_open date,
  show_close date,
  breakdown_end date,
  budget numeric(12,2) check (budget is null or budget >= 0),
  warn_days int not null default 7 check (warn_days between 0 and 365),
  turnaround_days int not null default 3 check (turnaround_days between 0 and 365),
  studio_owner_id uuid references users(id) on delete set null,
  production_owner_id uuid references users(id) on delete set null,
  art_due_os date, print_due_os date,
  art_due_ss date, print_due_ss date,
  art_due_si date, print_due_si date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  position int not null,
  name text not null,
  approver_id uuid references users(id) on delete set null,
  uses_account_manager boolean not null default false,
  applies_os boolean not null default true,
  applies_ss boolean not null default true,
  applies_si boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index stages_event_idx on stages (event_id, position);

create table sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  package text,
  account_manager_id uuid references users(id) on delete set null,
  contact_name text,
  contact_email text,
  notes text,
  created_at timestamptz not null default now()
);
create unique index sponsors_event_name_idx on sponsors (event_id, lower(name));

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);
create unique index suppliers_name_idx on suppliers (lower(name));

create table list_options (
  id uuid primary key default gen_random_uuid(),
  list_key text not null,
  value text not null,
  sort int not null default 0
);
create unique index list_options_key_value_idx on list_options (list_key, lower(value));

create table items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null check (category in ('organiser_signage','sponsor_signage','sponsor_item')),
  ref_no int not null,
  description text not null,
  sponsor_id uuid references sponsors(id) on delete set null,
  item_type text,
  wording text,
  hall text,
  zone text,
  location_detail text,
  position text,
  width_mm int check (width_mm is null or width_mm >= 0),
  height_mm int check (height_mm is null or height_mm >= 0),
  sides text check (sides is null or sides in ('single','double')),
  qty int check (qty is null or qty >= 0),
  material text,
  artwork_by text not null default 'in_house' check (artwork_by in ('in_house','sponsor','supplier','not_required')),
  artwork_due date,
  artwork_link text,
  supplier_id uuid references suppliers(id) on delete set null,
  print_deadline date,
  production_status text check (production_status is null or production_status in ('sent_to_supplier','in_production','delivered','installed')),
  po_number text,
  delivery_date date,
  install_date date,
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  cancelled boolean not null default false,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, category, ref_no)
);
create index items_event_idx on items (event_id, category, ref_no);
create index items_sponsor_idx on items (sponsor_id);

create table artwork_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  version int not null check (version >= 1),
  file_url text not null,
  file_pathname text not null,
  preview_url text,
  preview_pathname text,
  thumb_url text,
  thumb_pathname text,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width_px int,
  height_px int,
  page_count int,
  note text,
  uploaded_by uuid references users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (item_id, version)
);
create index artwork_versions_event_idx on artwork_versions (event_id);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  version int not null check (version >= 0),
  decision text not null check (decision in ('approved','changes_requested','rejected','on_hold')),
  comment text,
  decided_by uuid references users(id) on delete set null,
  decided_by_name text not null,
  via text not null default 'app' check (via in ('app','sponsor_link')),
  decided_at timestamptz not null default now()
);
create index decisions_item_idx on decisions (item_id, version, decided_at);
create index decisions_event_idx on decisions (event_id);

create table activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  actor_name text not null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index activity_item_idx on activity (item_id, created_at desc);
create index activity_event_idx on activity (event_id, created_at desc);

create table share_links (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  version int not null,
  token_hash text not null unique,
  recipient_name text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index share_links_item_idx on share_links (item_id);

-- Line numbers (OS-001, SS-002…) come from a counter per event and list, so a number is never reused,
-- even after a line is deleted. The upsert locks the counter row, which keeps simultaneous adds apart.
create table item_ref_counters (
  event_id uuid not null references events(id) on delete cascade,
  category text not null,
  last_ref int not null,
  primary key (event_id, category)
);

create function assign_item_ref() returns trigger language plpgsql as $$
begin
  if new.ref_no is null then
    insert into item_ref_counters as c (event_id, category, last_ref)
    values (new.event_id, new.category, 1)
    on conflict (event_id, category) do update set last_ref = c.last_ref + 1
    returning last_ref into new.ref_no;
  end if;
  return new;
end $$;
create trigger items_assign_ref before insert on items for each row execute function assign_item_ref();

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger items_touch before update on items for each row execute function touch_updated_at();
create trigger events_touch before update on events for each row execute function touch_updated_at();
create trigger users_touch before update on users for each row execute function touch_updated_at();
`,
  },
  {
    version: 2,
    name: 'default dropdown lists',
    sql: /* sql */ `
insert into list_options (list_key, value, sort)
select k, v, ord from (values
  ${[
    ['sign_type', ['Hanging banner', 'Hall entrance banner', 'Arch / gateway', 'Freestanding totem', 'Directional sign', 'Floorplan / You Are Here board', 'Pull-up banner', 'Foamex board', 'Wall graphic', 'Window / door vinyl', 'Floor graphic', 'Column wrap', 'Stair / escalator graphic', 'Stage / theatre backdrop', 'Lectern / stage graphic', 'Seminar timetable board', 'Registration counter graphic', 'Feature area signage', 'Aisle sign', 'Flag / feather flag', 'External mesh banner', 'Digital screen content', 'Sponsor logo panel', 'Other']],
    ['item_type', ['Lanyards', 'Visitor badges', 'Show bags', 'Bag inserts / leaflets', 'Show guide advert', 'Water bottles', 'Hydration station', 'Charging station', 'Coffee cups / sleeves', 'Pens / notepads', 'Seat drops', 'Hand sanitiser station', 'Branded furniture', 'Staff / crew T-shirts', 'Wi-Fi sponsorship', 'Registration screens', 'Website / app banner', 'Email newsletter', 'Other']],
    ['material', ['PVC banner', 'Mesh banner', 'Fabric (SEG)', 'Fabric (stretch)', 'Foamex 5mm', 'Foamex 10mm', 'Dibond', 'Correx', 'Kappa / foam board', 'Self-adhesive vinyl', 'Floor vinyl (anti-slip)', 'One-way window vinyl', 'Paper / poster', 'Digital file only', 'Supplier spec', 'Other']],
    ['position', ['Hanging (rigged)', 'Freestanding', 'Wall-mounted', 'Floor', 'Door / window', 'Counter / furniture', 'Digital screen', 'External', 'Other']],
    ['zone', ['Entrance / registration', 'Boulevard / concourse', 'Hall entrance', 'Aisles', 'Main stage', 'Theatre', 'Feature area', 'Materials & Structures', 'Equipment, Tools & Hire', 'Construction Services', 'ConTech & AI', 'Offsite', 'Futurebuild', 'Stone & Surfaces Show', 'Timber Expo', 'Build Connect Networking Lounge', 'Café / catering', 'VIP / partner lounge', 'Press office', "Organiser's office", 'Cloakroom', 'External / car park', 'Other']],
    ['hall_nec', ['Hall 1', 'Hall 2', 'Hall 3', 'Hall 3a', 'Hall 4', 'Hall 5', 'Atrium', 'Piazza', 'Hall foyer', 'External / car park']],
    ['hall_excel', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'Boulevard', 'East entrance', 'West entrance', 'External']],
  ]
    .flatMap(([k, vals]) => (vals as string[]).map((v, i) => `('${k}', '${(v as string).replace(/'/g, "''")}', ${i})`))
    .join(',\n  ')}
) as t(k, v, ord)
on conflict do nothing;
`,
  },
  {
    version: 3,
    name: 'artwork version counter',
    sql: /* sql */ `
-- Artwork version numbers are never reused, even after a version is removed, so old decisions
-- and sponsor links can't attach to new artwork.
alter table items add column last_version int not null default 0;
update items i set last_version = greatest(
  (select coalesce(max(version), 0) from artwork_versions where item_id = i.id),
  (select coalesce(max(version), 0) from decisions where item_id = i.id),
  (select coalesce(max(version), 0) from share_links where item_id = i.id));
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
