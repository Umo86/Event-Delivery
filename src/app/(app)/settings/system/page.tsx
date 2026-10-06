import { redirect } from 'next/navigation';

// Health, the system check and the platform name moved to Admin › Platform.
export default function SystemRedirect() {
  redirect('/admin/platform');
}
