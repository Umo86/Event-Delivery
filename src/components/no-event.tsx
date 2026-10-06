import { getCurrentUser } from '@/lib/auth/session';
import { ButtonLink, Empty } from './ui';

/** Shown when there's no show to work in yet. Only managers and super admins can create one. */
export async function NoEvent() {
  const user = await getCurrentUser();
  const canCreate = !!user && user.role !== 'user';
  return (
    <Empty title="No show set up yet" action={canCreate ? <ButtonLink href="/shows/new" variant="primary">Create a show</ButtonLink> : undefined}>
      Lines, sponsors and deadlines all belong to a show. {canCreate ? 'Create one to get started.' : 'Ask a manager to set one up.'}
    </Empty>
  );
}
