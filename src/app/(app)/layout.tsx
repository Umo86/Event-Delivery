import { requireUser } from '@/lib/auth/session';
import { getAppName, getCurrentEvent, listEvents, loadSchedule } from '@/lib/data/load';
import { fmtDate } from '@/lib/dates';
import { AppShell } from '@/components/shell';
import { logout, switchEvent } from '@/app/actions/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ allowPasswordChange: true });
  const [events, current, appName] = await Promise.all([listEvents(), getCurrentEvent(), getAppName()]);
  let myCount = 0;
  const counts = { os: 0, ss: 0, si: 0 };
  if (current) {
    const sched = await loadSchedule(current.id);
    for (const r of sched?.rows ?? []) {
      if (r.state.group === 'cancelled') continue;
      if (r.state.waitingOnUserIds.includes(user.id)) myCount += 1;
      if (r.item.category === 'organiser_signage') counts.os += 1;
      else if (r.item.category === 'sponsor_signage') counts.ss += 1;
      else counts.si += 1;
    }
  }
  const detail = current
    ? [current.venue, current.show_open ? (current.show_close && current.show_close !== current.show_open
        ? `${fmtDate(current.show_open, 'long').replace(/ \d{4}$/, '')} to ${fmtDate(current.show_close, 'long')}`
        : fmtDate(current.show_open, 'long')) : null].filter(Boolean).join(', ')
    : '';
  return (
    <AppShell
      appName={appName}
      user={{ name: user.full_name, role: user.role, superAdmin: user.is_super_admin }}
      events={events.map((e) => ({ id: e.id, name: e.name, archived: e.archived }))}
      currentEvent={current ? { id: current.id, name: current.name, detail } : null}
      myCount={myCount}
      counts={counts}
      switchEvent={switchEvent}
      logout={logout}
    >
      {children}
    </AppShell>
  );
}
