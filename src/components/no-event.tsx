import { ButtonLink, Empty } from './ui';

export function NoEvent() {
  return (
    <Empty title="No show set up yet" action={<ButtonLink href="/shows/new" variant="primary">Create a show</ButtonLink>}>
      Lines, sponsors and deadlines all belong to a show. Create one to get started.
    </Empty>
  );
}
