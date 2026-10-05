import { redirect } from 'next/navigation';

// Suppliers moved out of Settings to their own section in the menu.
export default function SettingsSuppliersRedirect() {
  redirect('/suppliers');
}
