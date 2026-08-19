import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Marketing app middleware — locale prefix redirect ONLY.
// No auth checks: the landing page and login are public. Auth is enforced by
// the ERP and portal apps' own middlewares after the role-based redirect.

const PUBLIC_FILE = /\.(.*)$/;

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico).*)',
  ],
};
