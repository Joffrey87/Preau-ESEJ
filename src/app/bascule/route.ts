import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_PRENOM } from "@/lib/roles";
import { COOKIE_VUE } from "@/lib/vueRole";
import { reinitialiserVueWebmestre } from "@/lib/vueRoleServeur";
import { cibleBascule } from "@/lib/liensBascule";
import type { Espace } from "@/lib/basculeEspace";

const ESPACES: Espace[] = ["famille", "recherche", "directrice", "president", "evenement"];
const ACCUEIL: Record<Espace, string> = { famille: "/espace", recherche: "/", directrice: "/", president: "/", evenement: "/evenement", professeur: "/bulletins" };

/**
 * Bascule par le logo vers un profil RELIÉ au compte connecté, sans mot de passe, sur n'importe quel appareil.
 * Le serveur vérifie la session en cours et le lien (mêmes fonctions de la base que le logo), puis ouvre la session
 * du compte cible avec la clé de service (lien magique vérifié ici même, jamais envoyé). Sans la clé : 501, et le
 * navigateur reprend l'ancien fonctionnement (session gardée sur l'appareil, sinon connexion).
 */
export async function POST(request: NextRequest) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) return NextResponse.json({ ok: false, raison: "indisponible" }, { status: 501 });

  const { vers } = ((await request.json().catch(() => ({}))) ?? {}) as { vers?: string };
  if (!vers || !ESPACES.includes(vers as Espace)) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const prenomVisite = decodeURIComponent(request.cookies.get(COOKIE_PRENOM)?.value ?? "");
  const cible = await cibleBascule(supabase, user, prenomVisite, vers as Espace);
  if (!cible) return NextResponse.json({ ok: false, raison: "non relié" }, { status: 403 });

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: lien, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email: cible.email });
  const jeton = lien?.properties?.hashed_token;
  if (e1 || !jeton) return NextResponse.json({ ok: false, raison: "compte introuvable" }, { status: 404 });

  await reinitialiserVueWebmestre();
  // Remplace la session (cookies @supabase/ssr) par celle du compte cible.
  const { error: e2 } = await supabase.auth.verifyOtp({ type: "email", token_hash: jeton });
  if (e2) return NextResponse.json({ ok: false, raison: "session" }, { status: 500 });

  const reponse = NextResponse.json({ ok: true, url: ACCUEIL[vers as Espace] });
  reponse.cookies.delete(COOKIE_VUE);
  if (cible.prenom) reponse.cookies.set(COOKIE_PRENOM, cible.prenom, { path: "/", sameSite: "lax" });
  else reponse.cookies.delete(COOKIE_PRENOM);
  return reponse;
}
