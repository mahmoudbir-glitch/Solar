import {NextResponse} from 'next/server';
import {AUTH_COOKIE, createSessionValue, getAuthCredentials} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const credentials = getAuthCredentials();

    if (!credentials.username || !credentials.password || !credentials.secret) {
      return NextResponse.json({error:'لم يتم إعداد بيانات الدخول بعد.'},{status:500,headers:{'Cache-Control':'no-store'}});
    }

    if (username !== credentials.username || password !== credentials.password) {
      return NextResponse.json({error:'اسم المستخدم أو كلمة المرور غير صحيحة.'},{status:401,headers:{'Cache-Control':'no-store'}});
    }

    const response = NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(AUTH_COOKIE, await createSessionValue(), {
      httpOnly:true,
      secure:process.env.NODE_ENV === 'production',
      sameSite:'strict',
      path:'/',
      maxAge:7*24*60*60,
    });
    return response;
  } catch {
    return NextResponse.json({error:'تعذر تسجيل الدخول. حاول مرة أخرى.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
