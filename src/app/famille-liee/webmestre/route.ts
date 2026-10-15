import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reinitialiserVueWebmestre } from "@/lib/vueRoleServeur";
import { COOKIE_APERCU, COOKIE_FAMILLE_LIEE } from "@/lib/apercuFamille";
import { COOKIE_VUE } from "@/lib/vueRole";

/**
 * Le Webmestre ouvre l'Espace d'une famille, avec les droits de cette famille, sans son mot de passe. La base vérifie
 * qu'il est bien le Webmestre et journalise l'ouverture (webmestre_famille_ouvrir) ; le cookie ne donne aucun droit.
 */
export async function GET(request: NextRequest) {
  const famille = request.nextUrl.searchParams.get("famille");
  const supabase = await createClient();
  const { error } = famille ? await supabase.rpc("webmestre_famille_ouvrir", { p_famille: famille }) : { error: { message: "famille" } };
  if (error) return NextResponse.redirect(new URL("/", request.url));
  await reinitialiserVueWebmestre();
  const reponse = NextResponse.redirect(new URL("/espace", request.url));
  reponse.cookies.delete(COOKIE_VUE);
  reponse.cookies.delete(COOKIE_APERCU);
  reponse.cookies.set(COOKIE_FAMILLE_LIEE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
  return reponse;
}
