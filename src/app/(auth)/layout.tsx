import { Mark } from '@/components/brand';
import { getAppName } from '@/lib/data/load';
import { isDatabaseConfigured } from '@/lib/db';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const appName = isDatabaseConfigured() ? await getAppName() : 'Event Deliver';
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="font-display text-[22px] font-semibold tracking-wide">{appName}</span>
        </div>
        <div className="max-w-md">
          <p className="font-display text-[40px] font-semibold leading-[1.08]">
            Every sign, every sponsor deliverable, signed off and on site.
          </p>
          <p className="mt-4 text-[16px] text-white/70">
            The signage and sponsorship schedule for UK Construction Week: artwork, sign-off and production in one place.
          </p>
        </div>
        <div className="hazard h-3 w-full rounded-[2px]" aria-hidden />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Mark dark />
            <span className="font-display text-[22px] font-semibold text-ink">{appName}</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
