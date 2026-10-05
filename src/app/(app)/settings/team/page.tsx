import { redirect } from 'next/navigation';

// People and access moved to the Admin page.
export default function TeamPage() {
  redirect('/admin');
}
