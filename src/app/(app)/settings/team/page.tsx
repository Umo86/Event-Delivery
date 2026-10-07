import { redirect } from 'next/navigation';

// The team (people, their departments and what they approve) has its own page under Show.
export default function TeamPage() {
  redirect('/team');
}
