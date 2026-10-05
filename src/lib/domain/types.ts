export type Role = 'admin' | 'member' | 'viewer';
export type Category = 'organiser_signage' | 'sponsor_signage' | 'sponsor_item';
export type ArtworkBy = 'in_house' | 'sponsor' | 'supplier' | 'not_required';
export type ProductionStatus = 'sent_to_supplier' | 'in_production' | 'delivered' | 'installed';
export type DecisionValue = 'approved' | 'changes_requested' | 'rejected' | 'on_hold';
export type Group =
  | 'awaiting_artwork'
  | 'in_signoff'
  | 'changes_requested'
  | 'rejected'
  | 'on_hold'
  | 'approved'
  | ProductionStatus
  | 'cancelled';
export type Flag = 'not_signed_off' | 'overdue' | 'due_soon' | 'slow';

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

export interface EventRow {
  id: string;
  name: string;
  venue: string;
  build_start: string | null;
  show_open: string | null;
  show_close: string | null;
  breakdown_end: string | null;
  budget: number | null;
  warn_days: number;
  turnaround_days: number;
  studio_owner_id: string | null;
  production_owner_id: string | null;
  art_due_os: string | null;
  print_due_os: string | null;
  art_due_ss: string | null;
  print_due_ss: string | null;
  art_due_si: string | null;
  print_due_si: string | null;
  archived: boolean;
  created_at: Date;
}

export interface StageRow {
  id: string;
  event_id: string;
  position: number;
  name: string;
  approver_id: string | null;
  uses_account_manager: boolean;
  applies_os: boolean;
  applies_ss: boolean;
  applies_si: boolean;
  archived: boolean;
}

export interface SponsorRow {
  id: string;
  event_id: string;
  name: string;
  package: string | null;
  account_manager_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export interface ItemRow {
  id: string;
  event_id: string;
  category: Category;
  ref_no: number;
  description: string;
  sponsor_id: string | null;
  item_type: string | null;
  wording: string | null;
  hall: string | null;
  zone: string | null;
  location_detail: string | null;
  position: string | null;
  width_mm: number | null;
  height_mm: number | null;
  sides: 'single' | 'double' | null;
  qty: number | null;
  material: string | null;
  artwork_by: ArtworkBy;
  artwork_due: string | null;
  artwork_link: string | null;
  supplier_id: string | null;
  print_deadline: string | null;
  production_status: ProductionStatus | null;
  po_number: string | null;
  delivery_date: string | null;
  install_date: string | null;
  unit_cost: number | null;
  cancelled: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface VersionRow {
  id: string;
  item_id: string;
  event_id: string;
  version: number;
  file_url: string;
  file_pathname: string;
  preview_url: string | null;
  preview_pathname: string | null;
  thumb_url: string | null;
  thumb_pathname: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  page_count: number | null;
  note: string | null;
  uploaded_by: string | null;
  uploaded_at: Date;
}

export interface DecisionRow {
  id: string;
  item_id: string;
  event_id: string;
  stage_id: string;
  version: number;
  decision: DecisionValue;
  comment: string | null;
  decided_by: string | null;
  decided_by_name: string;
  via: 'app' | 'sponsor_link';
  decided_at: Date;
}

export interface ActivityRow {
  id: string;
  event_id: string | null;
  item_id: string | null;
  user_id: string | null;
  actor_name: string;
  kind: string;
  message: string;
  created_at: Date;
}
