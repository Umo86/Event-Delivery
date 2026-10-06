import { requireManager } from '@/lib/auth/session';
import { SettingsNav } from '@/components/settings-nav';
import { PageHeader } from '@/components/ui';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireManager();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </>
  );
}
