import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAnon } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_PRENOM, roleByEmail } from "@/lib/roles";
import { COOKIE_VUE } from "@/lib/vueRole";
import { COOKIE_APERCU, COOKIE_FAMILLE_LIEE } from "@/lib/apercuFamille";
import { MEMBRES } from "@/lib/rechercheFonds";
import { reinitialiserVueWebmestre } from "@/lib/vueRoleServeur";
import {
  COOKIE_JETON,
  accueilDuCompte,
  clientService,
  creerJeton,
  emailCible,
  jetonValide,
  journaliser,
  listerCibles,
  revoquerJeton,
} from "@/lib/basculeReelle";

/**
 * Bascule réelle du Webmestre (voir src/lib/basculeReelle.ts).
 * GET : comptes ouvrables. POST { action } : « ouvrir » (mot de passe → jeton 4 h), « basculer » (vers un compte),
 * « terminer » (retour au compte du Webmestre et fin du jeton). DELETE : fin du jeton sans changer de compte (déconnexion).
 */

const refus = (raison: string, status: number) => NextResponse.json({ ok: false, raison }, { status });

/** Requête venue de Préau lui-même (le cookie est en SameSite=Lax : on vérifie aussi l'origine). */
const memeOrigine = (request: NextRequest) => request.headers.get("origin") === request.nextUrl.origin;

/** Remplace la session du navigateur par celle de `email` (lien magique vérifié ici même, jamais envoyé). */
async function ouvrirSession(admin: NonNullable<ReturnType<typeof clientService>>, email: string): Promise<boolean> {
  const { data: lien, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jeton = lien?.properties?.hashed_token;
  if (error || !jeton) return false;
  const { error: e2 } = await (await createClient()).auth.verifyOtp({ type: "email", token_hash: jeton });
  return !e2;
}

/** Referme les modes d'affichage liés au compte quitté (vue Webmestre, aperçu ou famille reliée). */
function nettoyer(reponse: NextResponse, prenom: string | null) {
  reponse.cookies.delete(COOKIE_VUE);
  reponse.cookies.delete(COOKIE_APERCU);
  reponse.cookies.delete(COOKIE_FAMILLE_LIEE);
  if (prenom) reponse.cookies.set(COOKIE_PRENOM, prenom, { path: "/", sameSite: "lax" });
  else reponse.cookies.delete(COOKIE_PRENOM);
}

export async function GET() {
  const admin = clientService();
  if (!admin) return refus("indisponible", 501);
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!(await jetonValide(admin, user?.id))) return refus("jeton", 403);
  return NextResponse.json({ ok: true, cibles: await listerCibles(admin) });
}

export async function POST(request: NextRequest) {
  if (!memeOrigine(request)) return refus("origine", 403);
  const admin = clientService();
  if (!admin) return refus("indisponible", 501);
  const corps = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string; motDePasse?: string; userId?: string; prenom?: string };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return refus("session", 401);

  if (corps.action === "ouvrir") {
    if ((await supabase.rpc("est_webmestre")).data !== true) return refus("Réservé au Webmestre", 403);
    if (!corps.motDePasse) return refus("Mot de passe requis", 400);
    // Vérification du mot de passe sur un client jetable : la session du navigateur n'est pas touchée.
    const verif = createAnon(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: essai, error } = await verif.auth.signInWithPassword({ email: user.email, password: corps.motDePasse });
    if (error || essai.user?.id !== user.id) return refus("Mot de passe incorrect", 403);
    await verif.auth.signOut({ scope: "local" });
    const j = await creerJeton(admin, user.id, user.email);
    if (!j) return refus("jeton", 500);
    await journaliser(admin, "bascule réelle ouverte", `jusqu'à ${j.expire.toISOString()}`);
    const reponse = NextResponse.json({ ok: true });
    reponse.cookies.set(COOKIE_JETON, j.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: j.expire,
    });
    return reponse;
  }

  const jeton = await jetonValide(admin, user.id);
  if (!jeton) return refus("jeton", 403);

  if (corps.action === "basculer") {
    const email = corps.userId ? await emailCible(admin, corps.userId) : null;
    if (!email || !corps.userId) return refus("compte introuvable", 404);
    const rf = roleByEmail(email)?.slug === "recherche-fonds";
    const prenom = rf ? (corps.prenom && MEMBRES.includes(corps.prenom) ? corps.prenom : null) : null;
    if (rf && !prenom) return refus("prénom requis", 400);
    // En quittant son propre compte, le Webmestre referme sa vue « en tant que ».
    if (user.id === jeton.webmestre_user) await reinitialiserVueWebmestre();
    if (!(await ouvrirSession(admin, email))) return refus("session", 500);
    await admin.from("webmestre_jetons").update({ compte_courant: corps.userId }).eq("id", jeton.id);
    await journaliser(admin, "bascule réelle", prenom ? `${email} (${prenom})` : email);
    const reponse = NextResponse.json({ ok: true, url: accueilDuCompte(email) });
    nettoyer(reponse, prenom);
    return reponse;
  }

  if (corps.action === "terminer") {
    if (user.id !== jeton.webmestre_user && !(await ouvrirSession(admin, jeton.webmestre_email))) return refus("session", 500);
    await revoquerJeton(admin);
    await journaliser(admin, "bascule réelle terminée", `retour à ${jeton.webmestre_email}`);
    const reponse = NextResponse.json({ ok: true, url: accueilDuCompte(jeton.webmestre_email) });
    nettoyer(reponse, null);
    reponse.cookies.delete(COOKIE_JETON);
    return reponse;
  }

  return refus("action inconnue", 400);
}

export async function DELETE(request: NextRequest) {
  if (!memeOrigine(request)) return refus("origine", 403);
  const admin = clientService();
  if (admin) await revoquerJeton(admin);
  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.delete(COOKIE_JETON);
  return reponse;
}
