import { TabNav } from './tab-nav';

const ITEMS = [
  { href: '/settings', label: 'Details and dates' },
  { href: '/settings/stages', label: 'Sign-off stages' },
  { href: '/settings/departments', label: 'Departments' },
  { href: '/settings/lists', label: 'Dropdown lists' },
];

export function SettingsNav() {
  return <TabNav label="Show setup" items={ITEMS} />;
}
