import { TabNav } from './tab-nav';

const ITEMS = [
  { href: '/settings', label: 'Event' },
  { href: '/settings/stages', label: 'Sign-off stages' },
  { href: '/settings/departments', label: 'Departments' },
  { href: '/settings/lists', label: 'Dropdown lists' },
  { href: '/settings/events', label: 'Events' },
];

export function SettingsNav() {
  return <TabNav label="Settings" items={ITEMS} />;
}
