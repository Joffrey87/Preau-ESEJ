import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_FAMILLE_LIEE } from "@/lib/apercuFamille";
import { createClient } from "@/lib/supabase/server";

/** Quitte l'Espace de la famille reliée et revient à l'espace du compte (« /evenement » ou « / »). */
export async function GET(request: NextRequest) {
  const vers = request.nextUrl.searchParams.get("vers") === "/evenement" ? "/evenement" : "/";
  // Webmestre : referme (et journalise) l'Espace famille ouvert, s'il y en a un.
  await (await createClient()).rpc("webmestre_famille_fermer");
  const reponse = NextResponse.redirect(new URL(vers, request.url));
  reponse.cookies.delete(COOKIE_FAMILLE_LIEE);
  return reponse;
}
