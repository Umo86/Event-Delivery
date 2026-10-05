import 'server-only';
import { headers } from 'next/headers';

/**
 * The address people use to reach the platform, for links in emails and sponsor approval links.
 * Uses APP_URL if set, then the project's production domain on Vercel, then the address of this request.
 */
export async function appOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\/[^/\s]+/i.test(configured)) return configured.replace(/\/+$/, '');
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}
