import { ButtonLink, Empty } from './ui';

export function NoEvent() {
  return (
    <Empty title="No event set up yet" action={<ButtonLink href="/settings/events" variant="primary">Create an event</ButtonLink>}>
      Lines, sponsors and deadlines all belong to an event. Create one to get started.
    </Empty>
  );
}
