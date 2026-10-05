import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU } from "@/lib/apercuFamille";

/** Quitte l'aperçu et revient à l'onglet Frais de scolarité (ou à l'accueil). */
export async function GET(request: NextRequest) {
  // Par défaut on revient à l'onglet Frais de scolarité ; depuis le menu « voir en tant que », à l'accueil.
  const vers = request.nextUrl.searchParams.get("vers") === "accueil" ? "/" : "/scolarite";
  const reponse = NextResponse.redirect(new URL(vers, request.url));
  reponse.cookies.delete(COOKIE_APERCU);
  return reponse;
}
