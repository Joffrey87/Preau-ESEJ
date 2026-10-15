// Côté serveur : bascule réelle du Webmestre. Après ressaisie de son mot de passe, il reçoit un jeton de 4 h
// (cookie httpOnly ; la base n'en garde que l'empreinte, table webmestre_jetons) qui lui permet d'ouvrir la session de
// n'importe quel compte (bureau, Recherche de fonds, Événement, professeurs, familles), puis d'en changer ou de revenir
// au sien. Le jeton ne sert qu'au compte du Webmestre et au compte qu'il a ouvert en dernier : quelqu'un qui se connecte
// ensuite sur le même appareil ne peut pas s'en servir. Chaque ouverture et chaque bascule sont journalisées.

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient as createAdmin, type SupabaseClient } from "@supabase/supabase-js";
import { DOMAINE_EVENEMENT, DOMAINE_PROFESSEURS, PAGES_RESTREINTES, ROLES, roleByEmail } from "@/lib/roles";
import { MEMBRES } from "@/lib/rechercheFonds";

export const COOKIE_JETON = "webmestre_jeton";
export const DUREE_JETON_MS = 4 * 60 * 60 * 1000;

const DOMAINE_ROLES = "roles.esej";
const DOMAINE_FAMILLES = "familles.esej";

export type Jeton = { id: string; webmestre_user: string; webmestre_email: string; compte_courant: string | null; expire: string };

/** Client de service (contourne la RLS) ; null si la clé n'est pas configurée. */
export function clientService(): SupabaseClient | null {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) return null;
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, { auth: { autoRefreshToken: false, persistSession: false } });
}

const empreinte = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Crée un jeton pour le Webmestre ; renvoie le secret à poser en cookie. */
export async function creerJeton(admin: SupabaseClient, userId: string, email: string): Promise<{ secret: string; expire: Date } | null> {
  const secret = randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + DUREE_JETON_MS);
  const { error } = await admin
    .from("webmestre_jetons")
    .insert({ empreinte: empreinte(secret), webmestre_user: userId, webmestre_email: email, compte_courant: userId, expire: expire.toISOString() });
  return error ? null : { secret, expire };
}

/** Jeton valide du cookie, utilisable par ce compte (le Webmestre ou le dernier compte ouvert), sinon null. */
export async function jetonValide(admin: SupabaseClient, userId: string | null | undefined): Promise<Jeton | null> {
  const secret = (await cookies()).get(COOKIE_JETON)?.value;
  if (!secret || !userId) return null;
  const { data } = await admin
    .from("webmestre_jetons")
    .select("id, webmestre_user, webmestre_email, compte_courant, expire")
    .eq("empreinte", empreinte(secret))
    .is("revoque", null)
    .gt("expire", new Date().toISOString())
    .maybeSingle();
  const j = data as Jeton | null;
  if (!j || (userId !== j.webmestre_user && userId !== j.compte_courant)) return null;
  return j;
}

/** Révoque le jeton du cookie (déconnexion, fin de la bascule). */
export async function revoquerJeton(admin: SupabaseClient): Promise<void> {
  const secret = (await cookies()).get(COOKIE_JETON)?.value;
  if (secret) await admin.from("webmestre_jetons").update({ revoque: new Date().toISOString() }).eq("empreinte", empreinte(secret));
}

/** Inscrit l'action dans l'historique des accès (page Webmestre). */
export async function journaliser(admin: SupabaseClient, action: string, detail: string): Promise<void> {
  const { data } = await admin.from("webmestre").select("profil").maybeSingle();
  await admin.from("acces_historique").insert({ auteur: (data?.profil as string | undefined) ?? "webmestre", action, detail });
}

// ─── Comptes cibles ──────────────────────────────────────────────────────────────────────────────────────────────

export type Cible = { userId: string; prenom?: string; libelle: string; groupe: "Bureau" | "Recherche de fonds" | "Professeurs" | "Événement" | "Familles" };

const domaine = (email?: string | null) => email?.split("@")[1] ?? "";

/** Page d'arrivée d'un compte. */
export function accueilDuCompte(email: string): string {
  const d = domaine(email);
  if (d === DOMAINE_FAMILLES) return "/espace";
  if (d === DOMAINE_EVENEMENT) return "/evenement";
  if (d === DOMAINE_PROFESSEURS) return "/bulletins";
  const slug = roleByEmail(email)?.slug;
  return (slug && PAGES_RESTREINTES[slug]?.[0]) || "/";
}

/** Comptes qui existent réellement (auth.users), regroupés pour le choix du Webmestre. */
export async function listerCibles(admin: SupabaseClient): Promise<Cible[]> {
  const comptes = new Map<string, string>(); // email → user id
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const us = data?.users ?? [];
    for (const u of us) if (u.email) comptes.set(u.email, u.id);
    if (us.length < 1000) break;
  }
  const cibles: Cible[] = [];

  for (const r of ROLES) {
    const id = comptes.get(r.email);
    if (!id) continue;
    if (r.slug === "recherche-fonds") {
      for (const p of MEMBRES) cibles.push({ userId: id, prenom: p, libelle: p, groupe: "Recherche de fonds" });
    } else cibles.push({ userId: id, libelle: r.label, groupe: "Bureau" });
  }

  const [{ data: profs }, { data: evts }, { data: fams }] = await Promise.all([
    admin.from("enseignants").select("prenom, nom, user_id, actif").not("user_id", "is", null).order("nom"),
    admin.from("evenement_membres").select("libelle, user_id").not("user_id", "is", null).order("libelle"),
    admin.from("familles").select("nom, identifiant").not("identifiant", "is", null).order("nom"),
  ]);
  const idsParUser = new Map([...comptes].map(([e, id]) => [id, e]));
  for (const p of (profs ?? []) as { prenom: string; nom: string; user_id: string; actif: boolean }[]) {
    // Les comptes du bureau qui enseignent (Directrice, Directeur spirituel) figurent déjà dans « Bureau ».
    if (p.actif && domaine(idsParUser.get(p.user_id)) === DOMAINE_PROFESSEURS)
      cibles.push({ userId: p.user_id, libelle: `${p.prenom} ${p.nom}`, groupe: "Professeurs" });
  }
  for (const e of (evts ?? []) as { libelle: string; user_id: string }[]) {
    if (idsParUser.has(e.user_id)) cibles.push({ userId: e.user_id, libelle: e.libelle, groupe: "Événement" });
  }
  for (const f of (fams ?? []) as { nom: string; identifiant: string }[]) {
    const id = comptes.get(`${f.identifiant}@${DOMAINE_FAMILLES}`);
    if (id) cibles.push({ userId: id, libelle: `Famille ${f.nom}`, groupe: "Familles" });
  }
  return cibles;
}

/** Libellé du compte connecté, pour le bandeau. */
export async function libelleDuCompte(admin: SupabaseClient, userId: string, email: string, prenom: string): Promise<string> {
  const d = domaine(email);
  if (d === DOMAINE_ROLES) {
    const r = roleByEmail(email);
    return r?.slug === "recherche-fonds" && prenom ? `Recherche de fonds (${prenom})` : (r?.label ?? email);
  }
  if (d === DOMAINE_EVENEMENT) {
    const { data } = await admin.from("evenement_membres").select("libelle").eq("user_id", userId).maybeSingle();
    return `Événement — ${(data?.libelle as string | undefined) ?? email}`;
  }
  if (d === DOMAINE_PROFESSEURS) {
    const { data } = await admin.from("enseignants").select("prenom, nom").eq("user_id", userId).maybeSingle();
    return data ? `Professeur — ${data.prenom} ${data.nom}` : email;
  }
  if (d === DOMAINE_FAMILLES) {
    const { data } = await admin.from("familles").select("nom").eq("identifiant", email.split("@")[0]).maybeSingle();
    return `Famille ${(data?.nom as string | undefined) ?? email.split("@")[0]}`;
  }
  return email;
}

/** État de la bascule réelle pour les mises en page : null si aucun jeton utilisable par ce compte. */
export type ContexteBasculeReelle = { libelle: string; expire: string; surWebmestre: boolean; webmestreUser: string };

export async function contexteBasculeReelle(user: { id: string; email?: string | null }, prenom: string): Promise<ContexteBasculeReelle | null> {
  if (!(await cookies()).get(COOKIE_JETON)) return null;
  const admin = clientService();
  if (!admin) return null;
  const j = await jetonValide(admin, user.id);
  if (!j) return null;
  const surWebmestre = user.id === j.webmestre_user;
  return {
    libelle: surWebmestre ? "votre compte Webmestre" : await libelleDuCompte(admin, user.id, user.email ?? "", prenom),
    expire: j.expire,
    surWebmestre,
    webmestreUser: j.webmestre_user,
  };
}

/** Adresse d'un compte cible, s'il fait partie des comptes ouvrables (domaines internes de Préau). */
export async function emailCible(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email ?? null;
  return email && [DOMAINE_ROLES, DOMAINE_FAMILLES, DOMAINE_EVENEMENT, DOMAINE_PROFESSEURS].includes(domaine(email)) ? email : null;
}
