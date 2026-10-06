import { NextResponse, type NextRequest } from 'next/server';

// A quick check before app pages load: anyone without a session cookie goes to the sign-in page,
// which then brings them back to the page they asked for. Each page still verifies the session itself.
export function proxy(request: NextRequest) {
  if (request.cookies.has('ed_session')) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc');
  const next = `${url.pathname}${url.search}`;
  url.pathname = '/login';
  url.search = next === '/dashboard' ? '' : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/inbox', '/dashboard', '/shows', '/account', '/admin/:path*', '/schedule/:path*', '/items/:path*', '/sponsors/:path*', '/suppliers/:path*', '/settings/:path*', '/proof/:path*',
  ],
};
