// Côté serveur : profils reliés au compte connecté, pour la bascule par le logo sans mot de passe.
// Mêmes règles (et mêmes fonctions de la base) que celles qui construisent le panneau du logo dans
// src/app/(app)/layout.tsx et src/app/espace/layout.tsx : on ne peut basculer que vers ce que le logo propose.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Espace } from "@/lib/basculeEspace";
import { ROLES, estEvenement, estProfesseur, roleByEmail } from "@/lib/roles";
import { MEMBRES } from "@/lib/rechercheFonds";
import { emailConnexionFamille } from "@/lib/identifiantFamille";

/** Compte cible d'une bascule : son adresse de connexion, et le prénom de visite (Recherche de fonds). */
export type Cible = { email: string; prenom?: string | null };

const emailRole = (slug: string) => ROLES.find((r) => r.slug === slug)?.email ?? null;

type Liens = { famille: string | null; prenom: string | null; directrice: boolean; president: boolean; evenement: string | null; professeur?: string | null };

async function liensDeBase(supabase: SupabaseClient, user: User, prenomVisite: string): Promise<Liens | null> {
  const slug = roleByEmail(user.email)?.slug;
  const espace = (user.app_metadata as { espace?: string } | undefined)?.espace;
  const evenementLie = async (p: string | null) =>
    ((((await supabase.rpc("membres_evenement_lies", { p_prenom: p })).data ?? []) as { email: string }[])[0]?.email ?? null);

  if (espace === "famille") {
    const { data: f } = await supabase.from("familles").select("nom, membre_recherche, directrice_liee, profil_lie").maybeSingle();
    if (!f) return null;
    const ev = (((await supabase.rpc("membres_evenement_lies")).data ?? []) as { email: string }[])[0]?.email ?? null;
    return { famille: f.nom as string, prenom: (f.membre_recherche as string | null) ?? null, directrice: !!f.directrice_liee, president: f.profil_lie === "president", evenement: ev };
  }
  if (slug === "recherche-fonds" && prenomVisite) {
    const lien = ((await supabase.rpc("liens_du_membre", { p_prenom: prenomVisite })).data as { famille: string; directrice: boolean }[] | null)?.[0];
    if (!lien) return null;
    return { famille: lien.famille, prenom: prenomVisite, directrice: lien.directrice, president: false, evenement: await evenementLie(prenomVisite) };
  }
  if (slug === "directrice" || slug === "president") {
    const q = supabase.from("familles").select("nom, membre_recherche");
    const { data: f } = await (slug === "directrice" ? q.eq("directrice_liee", true) : q.eq("profil_lie", "president")).maybeSingle();
    if (!f) return null;
    return { famille: f.nom as string, prenom: (f.membre_recherche as string | null) ?? null, directrice: slug === "directrice", president: slug === "president", evenement: await evenementLie(prenomVisite || null) };
  }
  if (estEvenement(user.email)) {
    const l = (((await supabase.rpc("mes_liens_evenement")).data ?? []) as { famille: string; membre_recherche: string | null; directrice: boolean }[])[0];
    if (!l) return null;
    // Depuis un compte Événement : jamais le profil Président.
    return { famille: l.famille, prenom: l.membre_recherche, directrice: l.directrice, president: false, evenement: user.email ?? null };
  }
  return null;
}

/** Accès donnés par le Webmestre (mes_acces_lies) : ils s'ajoutent aux liens d'origine, sans en retirer — comme dans le logo. */
type LiensWebmestre = {
  famille: string | null;
  recherche: string | null;
  directrice: boolean;
  president: boolean;
  evenement: { email: string } | null;
  professeur: { email: string } | null;
};

async function liensDuCompte(supabase: SupabaseClient, user: User, prenomVisite: string): Promise<Liens | null> {
  const base = await liensDeBase(supabase, user, prenomVisite);
  const w = (await supabase.rpc("mes_acces_lies", { p_prenom: prenomVisite || null })).data as LiensWebmestre | null;
  // Professeur : son propre compte nominatif (l'espace en cours) fait partie de ses liens.
  const moiProf = estProfesseur(user.email) ? (user.email ?? null) : null;
  if (!w) return base ?? (moiProf ? { famille: null, prenom: null, directrice: false, president: false, evenement: null, professeur: moiProf } : null);
  const prenomRecherche = w.recherche && MEMBRES.includes(w.recherche) ? w.recherche : null;
  const b: Liens = base ?? { famille: null, prenom: null, directrice: false, president: false, evenement: null };
  return {
    famille: b.famille ?? w.famille,
    prenom: b.prenom ?? prenomRecherche,
    directrice: b.directrice || w.directrice,
    president: b.president || w.president,
    evenement: b.evenement ?? w.evenement?.email ?? null,
    professeur: b.professeur ?? w.professeur?.email ?? moiProf,
  };
}

/** Compte vers lequel le connecté peut basculer, ou null si `vers` ne lui est pas relié. */
export async function cibleBascule(supabase: SupabaseClient, user: User, prenomVisite: string, vers: Espace): Promise<Cible | null> {
  const l = await liensDuCompte(supabase, user, prenomVisite);
  if (!l) return null;
  let email: string | null = null;
  if (vers === "famille" && l.famille) email = emailConnexionFamille(l.famille);
  else if (vers === "recherche" && l.prenom) return { email: emailRole("recherche-fonds")!, prenom: l.prenom };
  else if (vers === "directrice" && l.directrice) email = emailRole("directrice");
  else if (vers === "president" && l.president) email = emailRole("president");
  else if (vers === "evenement" && l.evenement) email = l.evenement;
  else if (vers === "professeur" && l.professeur) email = l.professeur;
  return email ? { email, prenom: null } : null;
}
