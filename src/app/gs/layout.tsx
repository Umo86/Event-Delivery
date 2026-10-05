import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Super admin', robots: { index: false, follow: false } };

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-paper">{children}</div>;
}
