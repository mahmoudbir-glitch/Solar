import {NextRequest, NextResponse} from 'next/server';
import {AUTH_COOKIE, isValidSession} from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const session = request.cookies.get(AUTH_COOKIE)?.value;
  if (await isValidSession(session)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
