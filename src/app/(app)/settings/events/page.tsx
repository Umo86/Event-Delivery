import { redirect } from 'next/navigation';

// Creating, archiving and restoring shows moved to All shows.
export default function EventsRedirect() {
  redirect('/shows');
}
