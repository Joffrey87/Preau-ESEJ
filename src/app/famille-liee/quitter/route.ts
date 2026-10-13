import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_FAMILLE_LIEE } from "@/lib/apercuFamille";

/** Quitte l'Espace de la famille reliée et revient à l'espace du compte (« /evenement » ou « / »). */
export async function GET(request: NextRequest) {
  const vers = request.nextUrl.searchParams.get("vers") === "/evenement" ? "/evenement" : "/";
  const reponse = NextResponse.redirect(new URL(vers, request.url));
  reponse.cookies.delete(COOKIE_FAMILLE_LIEE);
  return reponse;
}
