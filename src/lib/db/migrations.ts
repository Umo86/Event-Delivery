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
  // The invite_email_* columns below are unused: invites are sent by the admin from their own email, not by the platform.
  {
    version: 4,
    name: 'invitations',
    sql: /* sql */ `
-- People join by invitation: an admin creates the account, a temporary password is emailed to them,
-- and they choose their own at first sign-in. Temporary passwords stop working after a few days.
alter table users
  add column invited_by uuid references users(id) on delete set null,
  add column invited_at timestamptz,
  add column temp_password_expires_at timestamptz,
  add column invite_email_status text check (invite_email_status is null or invite_email_status in ('sent', 'failed', 'not_set_up')),
  add column invite_email_error text,
  add column invite_email_at timestamptz;
update users set temp_password_expires_at = now() + interval '7 days' where must_change_password;
create index activity_kind_idx on activity (kind, created_at desc);
`,
  },
  {
    version: 5,
    name: 'super admins and the shared demo login',
    sql: /* sql */ `
-- Super admins are admins who can also open the super admin panel (/gs) and manage other super admins.
-- The first admin, who set the platform up, becomes the first super admin.
alter table users add column is_super_admin boolean not null default false;
update users set is_super_admin = true
  where id = (select id from users where role = 'admin' and active order by created_at limit 1);
alter table users add constraint users_super_admin_is_admin check (not is_super_admin or role = 'admin');
-- The shared demo account, whose login is shown on the sign-in page. Its password can't be changed and it is never an admin.
alter table users add column is_demo boolean not null default false;
`,
  },
  {
    version: 6,
    name: 'supplier scope of work',
    sql: /* sql */ `
-- What each supplier is contracted to do, which lists they work on, and a link to the signed scope of work.
alter table suppliers
  add column scope_of_work text,
  add column scope_link text,
  add column works_on_os boolean not null default true,
  add column works_on_ss boolean not null default true,
  add column works_on_si boolean not null default true;
`,
  },
  {
    version: 7,
    name: 'departments',
    sql: /* sql */ `
-- Departments are the teams people belong to (Sales, Marketing, Content, External, …). A shared catalogue,
-- assigned to shows, and used to organise who approves each sign-off step.
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index departments_name_idx on departments (lower(name));
insert into departments (name, position) values
  ('Operations', 1), ('Sales', 2), ('Marketing', 3), ('Content', 4), ('External', 5);

-- People belong to one or more departments.
create table user_departments (
  user_id uuid not null references users(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  primary key (user_id, department_id)
);

-- A sign-off stage can have one or more named approvers; any one of them can sign it off.
create table stage_approvers (
  stage_id uuid not null references stages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (stage_id, user_id)
);
alter table stages add column department_id uuid references departments(id) on delete set null;

-- Each show records which departments are involved.
create table event_departments (
  event_id uuid not null references events(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  primary key (event_id, department_id)
);

-- Carry existing data over: the single approver becomes the first named approver.
insert into stage_approvers (stage_id, user_id)
  select id, approver_id from stages where approver_id is not null on conflict do nothing;
-- Map the default stages to departments by name; 'Final sign-off' goes to Operations.
update stages s set department_id = d.id from departments d
  where not s.uses_account_manager and lower(s.name) = lower(d.name);
update stages s set department_id = (select id from departments where lower(name) = 'operations')
  where s.department_id is null and not s.uses_account_manager and lower(s.name) = 'final sign-off';
-- Seed membership: approvers join the department of the stage they approve.
insert into user_departments (user_id, department_id)
  select distinct sa.user_id, st.department_id from stage_approvers sa
    join stages st on st.id = sa.stage_id where st.department_id is not null on conflict do nothing;
-- Involved departments per show, from its stages.
insert into event_departments (event_id, department_id)
  select distinct event_id, department_id from stages where department_id is not null on conflict do nothing;
`,
  },
  {
    version: 8,
    name: 'personal task board',
    sql: /* sql */ `
-- A private kanban board per person, scoped to a show. Columns are 'todo' / 'in_process' / 'complete'.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo', 'in_process', 'complete')),
  deadline date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_owner_idx on tasks (user_id, event_id, status);

-- Checklist items under a task.
create table task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index task_subtasks_task_idx on task_subtasks (task_id);

-- Files attached to a task (stored in Blob, served through /api/task-files).
create table task_documents (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  name text not null,
  url text not null,
  size bigint,
  content_type text,
  uploaded_at timestamptz not null default now()
);
create index task_documents_task_idx on task_documents (task_id);
`,
  },
  {
    version: 9,
    name: 'three roles: super_admin, manager, user',
    sql: /* sql */ `
-- Collapse the old four tiers (super-admin flag + admin / member / viewer) into three roles.
-- Super Admins and Admins -> super_admin; Members -> manager; Viewers -> user. Nobody loses access.
alter table users drop constraint if exists users_super_admin_is_admin;
alter table users drop constraint if exists users_role_check;
update users set role = case
  when is_super_admin or role = 'admin' then 'super_admin'
  when role = 'member' then 'manager'
  else 'user' end;
alter table users alter column role set default 'user';
alter table users add constraint users_role_check check (role in ('super_admin', 'manager', 'user'));
-- The super-admin flag is now just the super_admin role.
alter table users drop column is_super_admin;
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
