import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  // Define supported locales
  const locales = ['en', 'ar'];
  const defaultLocale = 'ar';
  
  // Find current locale in URL path
  const pathnameLocale = locales.find(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  // If locale prefix is missing in URL, redirect to default (ar)
  if (!pathnameLocale) {
    const cleanPath = pathname === '/' ? '' : pathname;
    return NextResponse.redirect(
      new URL(`/${defaultLocale}${cleanPath}`, request.url)
    );
  }

  // Strip locale prefix to evaluate clean route name
  const cleanPath = pathname.replace(`/${pathnameLocale}`, '') || '/';

  // Read authentication cookies from request headers
  const hasRefreshToken = request.cookies.has('refresh_token');
  const accessToken = request.cookies.get('access_token')?.value;

  // Define protection rules
  const isDashboardPath = cleanPath.startsWith('/dashboard') || cleanPath === '/';
  const isAdminPath = cleanPath.startsWith('/admin');

  // Redirect to login if user attempts to reach dashboard/admin without active refresh token
  if (isDashboardPath || isAdminPath) {
    if (!hasRefreshToken) {
      return NextResponse.redirect(new URL(`/${pathnameLocale}/login`, request.url));
    }
    
    // If authenticated user hits root "/", redirect to dashboard
    if (cleanPath === '/') {
      return NextResponse.redirect(new URL(`/${pathnameLocale}/dashboard`, request.url));
    }
  }

  // Redirect to dashboard if logged-in user tries to open login page
  if (cleanPath === '/login' && hasRefreshToken) {
    return NextResponse.redirect(new URL(`/${pathnameLocale}/dashboard`, request.url));
  }

  // Protect admin paths strictly for superadmins via JWT claim inspection
  if (isAdminPath && accessToken) {
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        // Base64 decode JWT payload string
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonPayload);
        
        const isSuperAdmin = payload.is_superadmin === true || payload.role === 'superadmin';
        if (!isSuperAdmin) {
          return NextResponse.redirect(new URL(`/${pathnameLocale}/dashboard`, request.url));
        }
      }
    } catch (e) {
      // Decode failed, let API handle signature failures
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply middleware to all routes except standard static files
    '/((?!api/|_next/static|_next/image|favicon.ico).*)',
  ],
};
