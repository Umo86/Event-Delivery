import { requireManager } from '@/lib/auth/session';
import { SettingsNav } from '@/components/settings-nav';
import { PageHeader } from '@/components/ui';

// Show setup: how the show you're working in runs (details, dates, sign-off stages), plus the lists every show shares.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireManager();
  return (
    <>
      <PageHeader title="Show setup" />
      <SettingsNav />
      {children}
    </>
  );
}
