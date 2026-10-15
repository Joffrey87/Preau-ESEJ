import { reinitialiserVueWebmestre } from "@/lib/vueRoleServeur";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU, COOKIE_FAMILLE_LIEE } from "@/lib/apercuFamille";
import { COOKIE_VUE } from "@/lib/vueRole";

/**
 * Ouvre, sans changer de compte, l'Espace de la famille réservée reliée au compte connecté (Président → Antona,
 * membre Événementiel → sa famille). Le cookie ne donne aucun droit : la base décide (ma_famille / ma_famille_liee).
 */
export async function GET(request: NextRequest) {
  const reponse = NextResponse.redirect(new URL("/espace", request.url));
  await reinitialiserVueWebmestre();
  reponse.cookies.delete(COOKIE_VUE);
  reponse.cookies.delete(COOKIE_APERCU);
  reponse.cookies.set(COOKIE_FAMILLE_LIEE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
  return reponse;
}
