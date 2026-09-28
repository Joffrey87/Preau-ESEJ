import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU } from "@/lib/apercuFamille";

/** Quitte l'aperçu et revient à l'onglet Frais de scolarité. */
export async function GET(request: NextRequest) {
  const reponse = NextResponse.redirect(new URL("/scolarite", request.url));
  reponse.cookies.delete(COOKIE_APERCU);
  return reponse;
}
