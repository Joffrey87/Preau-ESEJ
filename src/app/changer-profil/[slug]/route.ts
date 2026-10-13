import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAGES_RESTREINTES, ROLES } from "@/lib/roles";
import { COOKIE_VUE, peutChangerDeVue } from "@/lib/vueRole";

/** Le Trésorier voit l'application « en tant que » un autre profil (vue seulement). */
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
  if (role && role.email !== user?.email) {
    reponse.cookies.set(COOKIE_VUE, slug, { path: "/", httpOnly: true, sameSite: "lax" });
  } else {
    reponse.cookies.delete(COOKIE_VUE);
  }
  return reponse;
}
