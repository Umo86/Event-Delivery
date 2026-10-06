import { requireSuperAdmin } from '@/lib/auth/session';
import { TabNav } from '@/components/tab-nav';
import { PageHeader } from '@/components/ui';

// Everything only a super admin can do, in one place: who can sign in, platform switches and health, and the audit trail.
const TABS = [
  { href: '/admin', label: 'People' },
  { href: '/admin/platform', label: 'Platform' },
  { href: '/admin/activity', label: 'Activity' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return (
    <>
      <PageHeader title="Admin" />
      <TabNav label="Admin" items={TABS} />
      {children}
    </>
  );
}
