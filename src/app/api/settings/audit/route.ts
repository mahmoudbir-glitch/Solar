import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || "1"));
  const take = 20;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.username } });
    if (!user) return NextResponse.json({ items: [], page, pages: 0 });
    const [items, count] = await Promise.all([
      prisma.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * take,
        take,
        select: { id: true, action: true, details: true, timestamp: true },
      }),
      prisma.auditLog.count({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({ items, page, pages: Math.ceil(count / take) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "audit_read_failed", message: "تعذر قراءة سجل النشاط." }, { status: 503 });
  }
}
