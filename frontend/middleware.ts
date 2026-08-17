import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

// Edge-runtime-safe base64url JWT payload decoder (atob is not available
// in the Vercel Edge runtime / Next.js middleware).
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const raw = atobSafe(base64 + pad);
  try {
    return JSON.parse(decodeURIComponent(escape(raw)));
  } catch {
    return null;
  }
}

function atobSafe(b64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const c of b64) {
    if (c === '=') break;
    const idx = chars.indexOf(c);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return result;
}

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

  // Define protection rules — "/" is the public landing (with integrated login)
  const isDashboardPath = cleanPath.startsWith('/dashboard');
  const isAdminPath = cleanPath.startsWith('/admin');

  // Redirect to login if user attempts to reach dashboard/admin without active refresh token
  if (isDashboardPath || isAdminPath) {
    if (!hasRefreshToken) {
      return NextResponse.redirect(new URL(`/${pathnameLocale}/login`, request.url));
    }
  }

  // Redirect to dashboard if logged-in user tries to open login page
  // Only redirect if the refresh token JWT is not expired (validates exp claim)
  if (cleanPath === '/login' && hasRefreshToken) {
    const refreshToken = request.cookies.get('refresh_token')?.value;
    let isRefreshTokenExpired = true;
    if (refreshToken) {
      const payload = decodeJwtPayload(refreshToken);
      if (payload && payload.type === 'refresh' && typeof payload.exp === 'number') {
        isRefreshTokenExpired = payload.exp * 1000 < Date.now();
      }
    }
    if (!isRefreshTokenExpired) {
      return NextResponse.redirect(new URL(`/${pathnameLocale}/dashboard`, request.url));
    }
  }

  // Protect admin paths strictly for superadmins via JWT claim inspection
  if (isAdminPath && accessToken) {
    const payload = decodeJwtPayload(accessToken);
    if (payload) {
      const isSuperAdmin = payload.is_superadmin === true || payload.role === 'superadmin';
      if (!isSuperAdmin) {
        return NextResponse.redirect(new URL(`/${pathnameLocale}/dashboard`, request.url));
      }
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
