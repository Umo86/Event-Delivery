import { requireUser } from '@/lib/auth/session';
import { SettingsNav } from '@/components/settings-nav';
import { PageHeader } from '@/components/ui';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav isAdmin={user.role === 'admin'} />
      {children}
    </>
  );
}
