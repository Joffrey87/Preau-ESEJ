import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAGES_RESTREINTES, ROLES } from "@/lib/roles";
import { COOKIE_VUE, peutChangerDeVue } from "@/lib/vueRole";

/** Le Webmestre bascule sa vue sur un autre profil et en reçoit tous les droits (base comprise). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = ROLES.find((r) => r.slug === slug);
  const reponse = NextResponse.redirect(new URL(role ? (PAGES_RESTREINTES[slug]?.[0] ?? "/") : "/", request.url));
  const { data: estWeb } = await supabase.rpc("est_webmestre");
  if (!peutChangerDeVue(user?.email, typeof estWeb === "boolean" ? estWeb : undefined)) return reponse;
  const vers = role && role.email !== user?.email ? slug : null;
  // Webmestre : la bascule est enregistrée (et journalisée) en base, qui lui donne alors tous les droits du profil.
  if (estWeb === true) {
    const { error } = await supabase.rpc("webmestre_vue_definir", { p_profil: vers });
    if (error) return NextResponse.redirect(new URL("/", request.url));
  }
  if (vers) reponse.cookies.set(COOKIE_VUE, vers, { path: "/", httpOnly: true, sameSite: "lax" });
  else reponse.cookies.delete(COOKIE_VUE);
  return reponse;
}
