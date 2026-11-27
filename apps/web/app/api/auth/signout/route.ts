import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clearedSessionCookie } from "@/lib/session";

export async function POST() {
  const res = NextResponse.redirect(`${env.publicUrl}/signin`, 303);
  res.cookies.set(clearedSessionCookie());
  return res;
}
