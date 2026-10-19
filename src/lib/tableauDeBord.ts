import { etatProspect } from "@/lib/etatProspect";
import type { Etape } from "@/lib/pipeline";
// Tableau de bord (page d'accueil de chaque profil d'Administration) : une tuile par onglet du profil, avec ses
// chiffres essentiels. Chaque tuile se calcule à part, avec les droits réels du compte (la base filtre) ; un onglet
// sans résumé chiffré garde une tuile simple (lien). Les tuiles suivent le menu : un onglet ouvert plus tard à un
// profil y apparaît de lui-même.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NAV, type NavItem } from "@/lib/nav";
import { pagesAutorisees, roleByEmail } from "@/lib/roles";
import { formatEuros } from "@/lib/format";
import { regleDesFamilles } from "@/lib/regleScolarite";
import { sansLignesVentilees } from "@/lib/operations";
import { recuEnvoye, champsImportantsManquants, sansRecu } from "@/lib/statutDon";
import { libellePeriode, type Periode } from "@/lib/bulletins";
import { periodeCourante } from "@/lib/bulletinsDonnees";
import { SEUIL_REMERCIEMENT } from "@/lib/seuilRemerciement";

export type Ton = "rouge" | "ambre" | "bleu" | "vert" | "neutre";
export type Chiffre = { label: string; valeur: string; ton?: Ton };
export type Tuile = { href: string; titre: string; icone: string; sousTitre?: string; chiffres: Chiffre[]; description?: string };
export type Priorite = { titre: string; detail: string; href: string; icone: string; ton: Ton };

/** Onglets en lecture seule pour un profil : ses tuiles s'affichent, mais pas de priorité (il ne peut pas agir). */
const LECTURE_SEULE: Record<string, string[]> = { "directeur-spirituel": ["/dons", "/mecenat/pipeline", "/carnet"] };

/** Onglets du menu visibles pour ce profil (même règle que la barre latérale), hors tableau de bord. */
export function ongletsDuProfil(email?: string | null): NavItem[] {
  const pages = pagesAutorisees(email);
  const slug = roleByEmail(email)?.slug ?? "";
  return NAV.flatMap((s) => s.items).filter(
    (i) => i.ready && i.href !== "/" && !i.sauf?.includes(slug) && (pages ? pages.includes(i.href) : !i.roles || i.roles.includes(slug)),
  );
}

const DESCRIPTIONS: Record<string, string> = {
  "/mails": "Messagerie de l'association.",
  "/ca": "Conseil d'administration : membres et séances.",
  "/parametres": "Association, comptes, catégories.",
  "/processus": "Fiches d'aide et procédures.",
  "/acces-familles": "Comptes de l'Espace famille.",
  "/ma-famille/accueil": "Ce qui est à noter pour votre famille.",
  "/ma-famille/paiements": "Frais de scolarité réglés, factures et attestations de votre famille.",
  "/ma-famille/achats": "Achats divers de votre famille (École et Événement).",
  "/ma-famille/fiche": "Coordonnées et enfants de votre famille.",
};

type Contexte = {
  sb: SupabaseClient;
  aujourdhui: string;
  exercice: { id: string; libelle: string } | null;
  /** Profil affiché (slug) : certaines priorités ne concernent qu'un rôle. */
  slug: string;
  priorites: Priorite[];
};

const n = (x: number, un: string, plusieurs = `${un}s`) => `${x} ${x > 1 ? plusieurs : un}`;
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x)} %`);

type Op = { id: string; type: "recette" | "depense"; montant: number; parent_id: string | null; est_ventilee: boolean };

async function operationsExercice(c: Contexte): Promise<Op[]> {
  if (!c.exercice) return [];
  const { data } = await c.sb.from("operations").select("id, type, montant, parent_id, est_ventilee").eq("exercice_id", c.exercice.id);
  return sansLignesVentilees((data ?? []) as Op[]);
}
const somme = (ops: Op[], t: Op["type"]) => ops.filter((o) => o.type === t).reduce((s, o) => s + Number(o.montant), 0);

/** Chiffres de chaque onglet. */
const CALCULS: Record<string, (c: Contexte) => Promise<Omit<Tuile, "href" | "titre" | "icone"> | null>> = {
  "/comptabilite": async (c) => {
    const [ops, comptes, maj] = await Promise.all([
      operationsExercice(c),
      c.sb.from("comptes").select("solde_initial").eq("archive", false),
      c.sb.rpc("date_maj_comptes"),
    ]);
    const solde = ((comptes.data ?? []) as { solde_initial: number }[]).reduce((s, x) => s + Number(x.solde_initial), 0) + somme(ops, "recette") - somme(ops, "depense");
    const resultat = somme(ops, "recette") - somme(ops, "depense");
    if (solde < 0) c.priorites.push({ titre: "Solde de trésorerie négatif", detail: formatEuros(solde), href: "/comptabilite", icone: "ledger", ton: "rouge" });
    return {
      sousTitre: c.exercice?.libelle,
      chiffres: [
        { label: "Trésorerie", valeur: formatEuros(solde), ton: solde < 0 ? "rouge" : "neutre" },
        { label: "Résultat de l'exercice", valeur: formatEuros(resultat), ton: resultat < 0 ? "rouge" : "vert" },
        ...(maj.data ? [{ label: "Relevé intégré au", valeur: new Date(maj.data as string).toLocaleDateString("fr-FR") }] : []),
      ],
    };
  },
  "/budget": async (c) => {
    if (!c.exercice) return null;
    const [ops, lignes] = await Promise.all([
      operationsExercice(c),
      c.sb.from("budget_lignes").select("montant_prevu, categories(type)").eq("exercice_id", c.exercice.id),
    ]);
    const prevu = (t: string) =>
      ((lignes.data ?? []) as { montant_prevu: number; categories: { type: string } | { type: string }[] | null }[])
        .filter((b) => (Array.isArray(b.categories) ? b.categories[0] : b.categories)?.type === t)
        .reduce((s, b) => s + Number(b.montant_prevu), 0);
    const dep = prevu("depense") > 0 ? (100 * somme(ops, "depense")) / prevu("depense") : null;
    const rec = prevu("recette") > 0 ? (100 * somme(ops, "recette")) / prevu("recette") : null;
    if (dep !== null && dep > 100) c.priorites.push({ titre: "Budget dépassé", detail: `${Math.round(dep)} % des dépenses prévues`, href: "/budget", icone: "chart", ton: "ambre" });
    return {
      sousTitre: c.exercice.libelle,
      chiffres: [
        { label: "Dépenses / prévu", valeur: pct(dep), ton: dep !== null && dep > 100 ? "ambre" : "neutre" },
        // Recettes : % réalisé ; au-delà du prévu, c'est un gain (vert).
        { label: "Recettes réalisées", valeur: pct(rec), ton: rec !== null && rec >= 100 ? "vert" : "neutre" },
      ],
    };
  },
  "/scolarite": async (c) => {
    const { data: a } = await c.sb.from("scolarite_inscriptions").select("annee_scolaire").order("annee_scolaire", { ascending: false }).limit(1).maybeSingle();
    const annee = (a as { annee_scolaire: string } | null)?.annee_scolaire;
    if (!annee) return null;
    const [sco, modifs] = await Promise.all([regleDesFamilles(c.sb, annee), c.sb.from("familles_modifications").select("famille_id").is("vu_le", null)]);
    const impayees = sco.filter((r) => r.du - r.regle > 0.005);
    const reste = impayees.reduce((s, r) => s + r.du - r.regle, 0);
    const aValider = new Set(((modifs.data ?? []) as { famille_id: string }[]).map((m) => m.famille_id)).size;
    if (aValider) c.priorites.push({ titre: `À valider : ${n(aValider, "modification famille", "modifications familles")}`, detail: "Coordonnées modifiées par des familles dans leur espace", href: "/scolarite", icone: "graduation", ton: "ambre" });
    if (impayees.length) c.priorites.push({ titre: `${n(impayees.length, "famille")} avec un reste à régler`, detail: `${formatEuros(reste)} au total · scolarité ${annee}`, href: "/scolarite", icone: "graduation", ton: "ambre" });
    return {
      sousTitre: `Année ${annee}`,
      chiffres: [
        { label: "Familles à jour", valeur: `${sco.length - impayees.length} / ${sco.length}`, ton: impayees.length ? "neutre" : "vert" },
        { label: "Reste à régler", valeur: formatEuros(reste), ton: reste > 0 ? "ambre" : "vert" },
        ...(aValider ? [{ label: "Coordonnées à valider", valeur: String(aValider), ton: "ambre" as Ton }] : []),
      ],
    };
  },
  "/remerciements": async (c) => {
    const { data } = await c.sb
      .from("dons")
      .select("date_don, remerciement_envoye_le")
      .is("supprime_le", null)
      .eq("don_boursier", false)
      .gte("montant", SEUIL_REMERCIEMENT);
    const lignes = (data ?? []) as { date_don: string; remerciement_envoye_le: string | null }[];
    const debut = c.exercice ? c.exercice.libelle.match(/\d{4}/)?.[0] : null;
    const exo = debut ? lignes.filter((d) => d.date_don >= `${debut}-09-01` && d.date_don < `${Number(debut) + 1}-09-01`) : lignes;
    const attente = exo.filter((d) => !d.remerciement_envoye_le).length;
    if (attente && c.slug === "president")
      c.priorites.push({ titre: `${n(attente, "remerciement")} à envoyer`, detail: `Dons de ${SEUIL_REMERCIEMENT} € et plus de l'exercice`, href: "/remerciements", icone: "mail", ton: "ambre" });
    return {
      sousTitre: c.exercice?.libelle,
      chiffres: [
        { label: "À remercier", valeur: String(attente), ton: attente ? "ambre" : "vert" },
        { label: "Remerciés", valeur: String(exo.length - attente) },
      ],
    };
  },
  "/dons": async (c) => {
    const [jauge, dons] = await Promise.all([
      c.sb.rpc("dons_exercice_courant"),
      c.sb
        .from("dons")
        .select("recu_etat, recu_numero, envoi_prefere, est_personne_morale, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, date_don, mode_paiement")
        .is("supprime_le", null),
    ]);
    const j = jauge.data as { exercice: string; dons: { montant: number }[] } | null;
    const lignes = (dons.data ?? []) as Parameters<typeof champsImportantsManquants>[0][];
    const incomplets = lignes.filter((d) => champsImportantsManquants(d).some((x) => !sansRecu(d) || x === "nom" || x === "nom de l'organisme")).length;
    if (incomplets) c.priorites.push({ titre: `${n(incomplets, "don")} à compléter`, detail: "Information importante manquante (nom, adresse, courriel…)", href: "/dons", icone: "gift", ton: "rouge" });
    return {
      sousTitre: j?.exercice,
      chiffres: [
        ...(j ? [{ label: "Collecté sur l'exercice", valeur: formatEuros(j.dons.reduce((s, d) => s + Number(d.montant), 0)), ton: "vert" as Ton }, { label: "Dons reçus", valeur: String(j.dons.length) }] : []),
        ...(incomplets ? [{ label: "À compléter", valeur: String(incomplets), ton: "rouge" as Ton }] : []),
      ],
    };
  },
  "/recus-fiscaux": async (c) => {
    const { data } = await c.sb
      .from("dons")
      .select("recu_etat, recu_numero, envoi_prefere, est_personne_morale, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, date_don, mode_paiement")
      .is("supprime_le", null);
    const lignes = (data ?? []) as Parameters<typeof recuEnvoye>[0][];
    const aEnvoyer = lignes.filter((d) => !recuEnvoye(d) && !sansRecu(d as Parameters<typeof sansRecu>[0])).length;
    if (aEnvoyer) c.priorites.push({ titre: `${n(aEnvoyer, "reçu fiscal", "reçus fiscaux")} à envoyer`, detail: "Dons dont le reçu n'est pas encore parti", href: "/recus-fiscaux", icone: "receipt", ton: "bleu" });
    return { chiffres: [{ label: "Reçus à envoyer", valeur: String(aEnvoyer), ton: aEnvoyer ? "bleu" : "vert" }] };
  },
  "/courriers": async (c) => {
    const { data, error } = await c.sb.rpc("courriers_a_confirmer");
    if (error) return null;
    const nb = ((data ?? []) as unknown[]).length;
    if (nb) c.priorites.push({ titre: `${n(nb, "courrier")} à confirmer`, detail: "Reçus envoyés par la poste, à confirmer", href: "/courriers", icone: "receipt", ton: "ambre" });
    return { chiffres: [{ label: "À confirmer", valeur: String(nb), ton: nb ? "ambre" : "vert" }] };
  },
  "/mecenat/pipeline": async (c) => {
    const { data } = await c.sb.from("prospects").select("etape, etat_unifie, prochaine_action_date");
    // État unifié (choisi, sinon suggéré depuis l'ancienne étape).
    const ps = ((data ?? []) as { etape: Etape; etat_unifie: string | null; prochaine_action_date: string | null }[])
      .map((p) => ({ ...p, etat: etatProspect(p, undefined, false).affiche }));
    const actifs = ps.filter((p) => ["Pas contacté", "Contacté", "Promesse", "Sans réponse, à relancer"].includes(p.etat));
    const dans7 = new Date(Date.parse(c.aujourdhui) + 7 * 86400000).toISOString().slice(0, 10);
    const retard = actifs.filter((p) => p.prochaine_action_date && p.prochaine_action_date < c.aujourdhui).length;
    const bientot = actifs.filter((p) => p.prochaine_action_date && p.prochaine_action_date >= c.aujourdhui && p.prochaine_action_date <= dans7).length;
    const donateurs = ps.filter((p) => p.etat === "Donateur").length;
    if (retard) c.priorites.push({ titre: `${n(retard, "relance")} en retard`, detail: "Prochaine action prévue à une date passée", href: "/mecenat/pipeline", icone: "funnel", ton: "rouge" });
    return {
      chiffres: [
        { label: "Relations en cours", valeur: String(actifs.length) },
        { label: "Actions sous 7 jours", valeur: String(bientot), ton: bientot ? "bleu" : "neutre" },
        { label: "En retard", valeur: String(retard), ton: retard ? "rouge" : "vert" },
        { label: "Donateurs suivis", valeur: String(donateurs), ton: "vert" },
      ],
    };
  },
  "/recherche/axes": async (c) => {
    const { data } = await c.sb.from("recherche_idees").select("statut").is("supprime_le", null);
    const st = (data ?? []) as { statut: string }[];
    const k = (s: string) => st.filter((x) => x.statut === s).length;
    return {
      chiffres: [
        { label: "Pistes retenues", valeur: String(k("retenue")), ton: "vert" },
        { label: "En réflexion", valeur: String(k("en_reflexion")) },
        { label: "À étudier", valeur: String(k("a_etudier")), ton: k("a_etudier") ? "ambre" : "neutre" },
      ],
    };
  },
  "/recherche/suivi": async (c) => {
    const [a, e] = await Promise.all([c.sb.from("recherche_actions").select("id, statut, montant_obtenu"), c.sb.from("recherche_etapes").select("action_id, fait")]);
    const actions = (a.data ?? []) as { id: string; statut: string; montant_obtenu: number | null }[];
    const enCours = actions.filter((x) => x.statut === "en_cours");
    const ouvertes = new Set(enCours.map((x) => x.id));
    const etapes = ((e.data ?? []) as { action_id: string; fait: boolean }[]).filter((x) => ouvertes.has(x.action_id) && !x.fait).length;
    const obtenu = actions.reduce((s, x) => s + Number(x.montant_obtenu ?? 0), 0);
    return {
      chiffres: [
        { label: "Actions en cours", valeur: String(enCours.length), ton: "bleu" },
        { label: "À lancer", valeur: String(actions.filter((x) => x.statut === "a_lancer").length) },
        { label: "Étapes restantes", valeur: String(etapes), ton: etapes ? "ambre" : "neutre" },
        { label: "Montant obtenu", valeur: formatEuros(obtenu), ton: obtenu ? "vert" : "neutre" },
      ],
    };
  },
  "/carnet": async (c) => {
    const { count } = await c.sb.from("contacts").select("id", { count: "exact", head: true }).is("supprime_le", null);
    return { chiffres: [{ label: "Contacts", valeur: String(count ?? 0) }] };
  },
  "/bulletins": async (c) => {
    const { data: ps } = await c.sb.from("periodes").select("*").order("annee_scolaire").order("ordre");
    const periodes = (ps ?? []) as Periode[];
    const annee = periodes.at(-1)?.annee_scolaire;
    const p = periodeCourante(periodes.filter((x) => x.annee_scolaire === annee), c.aujourdhui);
    if (!p) return null;
    const [cour, pub] = await Promise.all([
      c.sb.from("bulletins").select("statut").eq("periode_id", p.id),
      c.sb.from("bulletins").select("lu_le").eq("statut", "publie"),
    ]);
    const st = (cour.data ?? []) as { statut: string }[];
    const k = (s: string) => st.filter((x) => x.statut === s).length;
    const publies = (pub.data ?? []) as { lu_le: string | null }[];
    const directrice = c.slug === "directrice";
    if (directrice && k("pret")) c.priorites.push({ titre: `${n(k("pret"), "bulletin")} prêt${k("pret") > 1 ? "s" : ""} à valider`, detail: `Période ${p.ordre}`, href: "/bulletins", icone: "book", ton: "bleu" });
    if (directrice && k("valide")) c.priorites.push({ titre: `${n(k("valide"), "bulletin")} à publier`, detail: `Période ${p.ordre} · validés, pas encore visibles des familles`, href: "/bulletins", icone: "book", ton: "ambre" });
    return {
      sousTitre: `Période ${p.ordre} · ${libellePeriode(p)}`,
      chiffres: [
        { label: "En saisie", valeur: String(k("nouveau") + k("en_cours")), ton: "ambre" },
        { label: "Prêts", valeur: String(k("pret")), ton: k("pret") ? "bleu" : "neutre" },
        { label: "Validés / publiés", valeur: `${k("valide")} / ${k("publie")}`, ton: "vert" },
        ...(publies.length ? [{ label: "Lus par les familles", valeur: `${publies.filter((x) => x.lu_le).length} / ${publies.length}` }] : []),
      ],
    };
  },
};

/** Tuiles et priorités du profil. */
export async function chargerTableauDeBord(sb: SupabaseClient, email: string | null | undefined, aujourdhui: string) {
  const { data: exercice } = await sb.from("exercices").select("id, libelle").eq("actif", true).order("date_debut", { ascending: false }).limit(1).maybeSingle();
  const slug = roleByEmail(email)?.slug ?? "";
  const c: Contexte = { sb, aujourdhui, exercice: (exercice as Contexte["exercice"]) ?? null, slug, priorites: [] };
  const onglets = ongletsDuProfil(email);
  const tuiles = await Promise.all(
    onglets.map(async (o): Promise<Tuile> => {
      const base = { href: o.href, titre: o.label, icone: o.icon };
      const calcul = CALCULS[o.href];
      try {
        const r = calcul ? await calcul(c) : null;
        return r ? { ...base, ...r } : { ...base, chiffres: [], description: DESCRIPTIONS[o.href] };
      } catch {
        return { ...base, chiffres: [], description: DESCRIPTIONS[o.href] };
      }
    }),
  );
  const ordre: Ton[] = ["rouge", "ambre", "bleu", "vert", "neutre"];
  const lecture = LECTURE_SEULE[slug] ?? [];
  const priorites = c.priorites.filter((p) => !lecture.includes(p.href)).sort((a, b) => ordre.indexOf(a.ton) - ordre.indexOf(b.ton));
  return { exercice: c.exercice, tuiles, priorites };
}
