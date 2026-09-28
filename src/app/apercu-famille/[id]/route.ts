import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU } from "@/lib/apercuFamille";

/** Ouvre l'espace d'une famille en aperçu (bureau). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reponse = NextResponse.redirect(new URL("/espace", request.url));
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    reponse.cookies.set(COOKIE_APERCU, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 4 });
  }
  return reponse;
}
