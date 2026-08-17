import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

// Portal-scoped cookies — distinct names from the ERP (portal_access_token /
// portal_refresh_token) so the two subdomains never collide.
const REFRESH_COOKIE = 'portal_refresh_token';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets, internal paths, upload directories, and api requests
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const locales = ['en', 'ar'];
  const defaultLocale = 'ar';

  const pathnameLocale = locales.find(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  // Redirect to default (ar) when locale prefix is missing
  if (!pathnameLocale) {
    const cleanPath = pathname === '/' ? '' : pathname;
    return NextResponse.redirect(
      new URL(`/${defaultLocale}${cleanPath}`, request.url)
    );
  }

  const cleanPath = pathname.replace(`/${pathnameLocale}`, '') || '/';

  const hasRefreshToken = request.cookies.has(REFRESH_COOKIE);

  const isDashboardPath = cleanPath.startsWith('/dashboard');

  // Protect dashboard without active portal refresh token
  if (isDashboardPath) {
    if (!hasRefreshToken) {
      return NextResponse.redirect(new URL(`/${pathnameLocale}/login`, request.url));
    }
  }

  // Redirect logged-in users away from login
  if (cleanPath === '/login' && hasRefreshToken) {
    return NextResponse.redirect(new URL(`/${pathnameLocale}/dashboard`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico).*)',
  ],
};
