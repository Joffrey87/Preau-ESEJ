"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, todayISO } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "@/components/GestionComptes";
import { AjoutSuivi, HistoriqueSuivi } from "@/components/SuiviDonateur";
import { ETATS_PROSPECT, AIDE_ETAT, TON_ETAT, etatProspect, etatSuivant, type EtatProspect, type EtatCalcule } from "@/lib/etatProspect";
import { TYPES_ACTION_PROSPECT, dernierCommentaire, formatDateHeure, suiviParCle, type SuiviAction } from "@/lib/suiviDonateurs";
import { trierListe, useTri } from "@/components/TriColonnes";
import RelationResponsable from "@/components/RelationResponsable";
import { nomCliquableCls } from "@/lib/ui";
import { useCoffre } from "@/components/CoffreProvider";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import ImportProspects from "@/components/ImportProspects";
import BoutonFiltresMultiples, { CasePastille } from "@/components/BoutonFiltresMultiples";
import { useFiltresMultiples } from "@/lib/filtresMultiples";
import { NOM_NEUTRE, abregerCivilite, estListeChiffree, nomComplet, useProspectsDechiffres, type ProspectLisible } from "@/lib/prospectsChiffres";
import { nomSoigne } from "@/lib/nomPropre";
import type { Don } from "@/components/GestionDons";
import Icon from "@/components/Icon";
import ChoixResponsable from "@/components/ChoixResponsable";
import LierEcrituresProspect from "@/components/LierEcrituresProspect";
import { villeEtDepartement } from "@/lib/listeProspects";
import {
  TYPES_PROSPECT,
  typeDe,
  libelleType,
  ancienType,
  type TypeProspect,
  CAPACITE_LABEL,
  type Prospect,
  type Etape,
  type Segment,
  type Capacite,
} from "@/lib/pipeline";

type Form = {
  civilite: string;
  prenom: string;
  adresse: string;
  cp_ville: string;
  nom: string;
  segment: Segment;
  type_autre: string;
  etape: Etape;
  etat_unifie: string;
  capacite: "" | Capacite;
  montant_cible: string;
  montant_obtenu: string;
  responsable: string;
  prochaine_action: string;
  prochaine_action_date: string;
  notes: string;
  email: string;
  telephone: string;
  relation: string;
};

type ColTriP =
  | "prospect" | "relation" | "suivi" | "suiviDate" | "etat" | "commentaire" | "reserve"
  | "responsable" | "action" | "cible" | "obtenu";
/** Colonnes masquables du tableau (préférence par personne). */
const COLONNES_P = [
  { key: "relation", label: "Relation · Responsable" }, { key: "suivi", label: "Suivi" }, { key: "etat", label: "État" },
  { key: "action", label: "Prochaine action" }, { key: "cible", label: "Cible" }, { key: "obtenu", label: "Obtenu" },
  { key: "commentaire", label: "Commentaire" },
] as const;
type ColP = (typeof COLONNES_P)[number]["key"];
const H24 = 24 * 3600 * 1000;

const vide: Form = {
  civilite: "", prenom: "", adresse: "", cp_ville: "",
  nom: "", segment: "particulier", type_autre: "", etape: "identifie", etat_unifie: "Pas contacté", capacite: "",
  montant_cible: "", montant_obtenu: "", responsable: "",
  prochaine_action: "", prochaine_action_date: "", notes: "",
  email: "", telephone: "", relation: "",
};

const eur = (s: string) => Number((s.trim() || "0").replace(/\s/g, "").replace(",", ".")) || 0;

export default function GestionPipeline({
  prospects: brut,
  dons,
  obtenus = {},
  peutLier = false,
  listeInitiale = null,
  suivi = [],
  peutSuivre = false,
  auteurSuivi = null,
  peutEcrire = false,
}: {
  prospects: Prospect[];
  dons: Don[];
  /** « Obtenu » par prospect : somme des écritures comptables liées. */
  obtenus?: Record<string, { montant: number; nb: number }>;
  /** Trésorier (ou président, administrateur) : peut lier des écritures de Comptabilité. */
  peutLier?: boolean;
  /** Liste filtrée à l'ouverture (lien du menu « Mises à jour »). */
  listeInitiale?: string | null;
  /** Historique des actions de suivi (tous). */
  suivi?: SuiviAction[];
  /** Ajout d'actions et réservation : Recherche de fonds, Trésorier, Administrateur. */
  peutSuivre?: boolean;
  auteurSuivi?: string | null;
  /** Écriture sur les prospects (même règle que la base : bureau et Recherche de fonds). */
  peutEcrire?: boolean;
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const { prospects, verrou } = useProspectsDechiffres(brut);
  // Listes d'origine (ex. « Liste Axel ») : filtres en pastilles, cumulables avec « + ».
  const { actifs: fListes, multiple: listeMultiple, basculer: basculerListe, basculerMultiple: basculerListeMultiple, estActif: listeActive, reinitialiser: reinitialiserListes } = useFiltresMultiples<string>(listeInitiale ? [listeInitiale] : []);
  const listes = useMemo(() => [...new Set(prospects.map((p) => p.liste).filter((l): l is string => !!l))].sort((a, b) => a.localeCompare(b, "fr")), [prospects]);
  const today = todayISO();
  const [edit, setEdit] = useState<ProspectLisible | "nouveau" | null>(null);
  const [liaison, setLiaison] = useState<ProspectLisible | null>(null);
  // Suivi des actions : ajout, historique, réservation.
  const [ajoutSuivi, setAjoutSuiviEtat] = useState<{ p: ProspectLisible; existante?: SuiviAction; noteSeule?: boolean } | null>(null);
  const setAjoutSuivi = (p: ProspectLisible | null) => setAjoutSuiviEtat(p ? { p } : null);
  const [histoSuivi, setHistoSuivi] = useState<ProspectLisible | null>(null);
  // Colonnes affichées : préférence propre à chaque personne (profil + prénom), gardée dans ce navigateur.
  const cleCols = `prospects.cols:${auteurSuivi ?? "profil"}`;
  const [masquees, setMasquees] = useState<ColP[]>([]);
  const [menuCols, setMenuCols] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { const v = localStorage.getItem(cleCols); setMasquees(v ? JSON.parse(v) : []); } catch {}
  }, [cleCols]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const basculerCol = (k: ColP) => setMasquees((l) => {
    const n = l.includes(k) ? l.filter((x) => x !== k) : [...l, k];
    try { localStorage.setItem(cleCols, JSON.stringify(n)); } catch {}
    return n;
  });
  const vis = (k: ColP) => !masquees.includes(k);
  const [editCom, setEditCom] = useState<string | null>(null);
  const [erreurReserve, setErreurReserve] = useState<string | null>(null);
  const suiviProspect = useMemo(() => suiviParCle(suivi), [suivi]);
  const etats = useMemo(() => {
    const m = new Map<string, EtatCalcule>();
    for (const p of prospects) m.set(p.id, etatProspect(p, suiviProspect.get(p.id), (obtenus[p.id]?.nb ?? 0) > 0));
    return m;
  }, [prospects, suiviProspect, obtenus]);
  const etatDe = (p: { id: string }) => etats.get(p.id)!;
  const [form, setForm] = useState<Form>(vide);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fEtape, setFEtape] = useState<"" | EtatProspect>("");
  const [fSegments, setFSegments] = useState<TypeProspect[]>([]);
  const [exportEnCours, setExportEnCours] = useState(false);

  const filtres = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (!ql || [p.affiche, p.adresse, p.cp_ville, p.responsable, p.email, p.telephone, p.relation].some((v) => (v ?? "").toLowerCase().includes(ql))) &&
        (!fEtape || etats.get(p.id)?.affiche === fEtape) &&
        (fSegments.length === 0 || fSegments.includes(typeDe(p.segment))) &&
        (fListes.length === 0 || (!!p.liste && fListes.includes(p.liste))),
    );
  }, [prospects, q, fEtape, fSegments, fListes, etats]);

  const relationsConnues = useMemo(
    () => [...new Set(prospects.map((p) => (p.relation ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [prospects],
  );
  // Tri des colonnes ; à l'ouverture, la dernière action de suivi la plus récente d'abord.
  const { tri, bouton, ariaSort } = useTri<ColTriP>({ col: "suiviDate", dir: "desc" }, ["suiviDate", "action", "cible", "obtenu"]);
  const thTri = (col: ColTriP, label: string, droite = false) => (
    <th className={`px-4 py-3 font-medium ${droite ? "text-right" : ""}`} aria-sort={ariaSort(col)}>
      {bouton(col, label)}
    </th>
  );
  const tries = trierListe(filtres, tri, (p, col): string | number | null => {
    const h = suiviProspect.get(p.id);
    switch (col) {
      case "prospect": return p.verrouille ? null : nomComplet({ titre: null, prenom: p.prenom, nom: p.nom }) || null;
      case "relation": return p.relation?.trim() || null;
      case "suivi": return h?.[0]?.actions.join(", ") || null;
      case "suiviDate": return h?.[0]?.cree_le ?? null;
      case "etat": return ETATS_PROSPECT.indexOf(etatDe(p).affiche);
      case "commentaire": return dernierCommentaire(h);
      case "reserve": return p.reserve_a || null;
      case "responsable": return p.responsable || null;
      case "action": return p.prochaine_action_date || null;
      case "cible": return p.montant_cible ?? null;
      case "obtenu": return obtenus[p.id]?.montant ?? null;
    }
  });

  // Analyse (sur la sélection filtrée).
  const actifs = filtres.filter((p) => etatDe(p).affiche !== "Pas intéressé");
  const totalCible = actifs.reduce((s, p) => s + Number(p.montant_cible ?? 0), 0);
  const totalObtenu = filtres.reduce((s, p) => s + (obtenus[p.id]?.montant ?? 0), 0);
  const dans7j = actifs.filter(
    (p) => p.prochaine_action_date && p.prochaine_action_date <= addJours(today, 7),
  ).length;

  // Répartition par étape (pour la barre de progression du pipeline).
  const parEtape = ETATS_PROSPECT.map((e) => ({ key: e, label: e, court: e, n: filtres.filter((p) => etatDe(p).affiche === e).length }));
  const maxEtape = Math.max(1, ...parEtape.map((e) => e.n));

  async function exporterListe() {
    setExportEnCours(true);
    try {
      const { telechargerListeProspects } = await import("@/lib/prospectsPdf");
      const ferme = "coffre fermé";
      const lignes = tries.map((p) => {
        const h = suiviProspect.get(p.id) ?? [];
        const der = [...h].sort((a, b) => b.cree_le.localeCompare(a.cree_le))[0];
        return {
          nom: p.verrouille ? `${ferme} (${p.affiche.replace("🔒 ", "")})` : nomComplet({ titre: p.titre, prenom: p.prenom, nom: p.nom }),
          adresse: p.verrouille ? ferme : [p.adresse, p.cp_ville].filter(Boolean).join(", "),
          courriel: p.email ?? "",
          telephone: p.telephone ?? "",
          segment: libelleType(p),
          etape: etatDe(p).affiche + (etatDe(p).etat ? "" : " (suggéré)"),
          relation: p.relation ?? "",
          reserve: p.reserve_a ?? p.responsable ?? p.relation ?? "",
          derniereAction: der ? `${[...der.actions, der.etat].filter(Boolean).join(", ") || "Action"} — ${new Date(der.cree_le).toLocaleDateString("fr-FR")}${der.auteur ? ` (${der.auteur})` : ""}` : "",
          commentaire: dernierCommentaire(h) ?? "",
        };
      });
      const actifs = [
        fSegments.length ? `Types : ${fSegments.map((s) => TYPES_PROSPECT.find((t) => t.key === s)!.label).join(", ")}` : "",
        fEtape ? `État : ${fEtape}` : "",
        q.trim() ? `Recherche : « ${q.trim()} »` : "",
      ].filter(Boolean).join(" · ");
      await telechargerListeProspects(lignes, actifs || "Tous les prospects (aucun filtre)");
    } finally {
      setExportEnCours(false);
    }
  }

  function ouvrir(p: ProspectLisible | "nouveau") {
    setError(null);
    if (p === "nouveau") setForm(vide);
    else
      setForm({
        civilite: abregerCivilite(p.titre), prenom: p.prenom ?? "", adresse: p.adresse ?? "", cp_ville: p.cp_ville ?? "",
        nom: p.verrouille ? "" : p.nom, segment: p.segment, type_autre: p.type_autre ?? "", etape: p.etape, etat_unifie: etatDe(p).auto ? "" : etatDe(p).etat ?? "", capacite: p.capacite ?? "",
        montant_cible: p.montant_cible != null ? String(p.montant_cible).replace(".", ",") : "",
        montant_obtenu: p.montant_obtenu ? String(p.montant_obtenu).replace(".", ",") : "",
        responsable: p.responsable ?? "", prochaine_action: p.prochaine_action ?? "",
        prochaine_action_date: p.prochaine_action_date ?? "", notes: p.notes ?? "",
        email: p.email ?? "", telephone: p.telephone ?? "", relation: p.relation ?? "",
      });
    setEdit(p);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (await enregistrerFiche()) setEdit(null);
  }

  /** Enregistre la fiche ouverte ; renvoie vrai si c'est fait (la fenêtre peut rester ouverte). */
  async function enregistrerFiche(): Promise<boolean> {
    const echec = (m: string) => { setError(m); return false; };
    setError(null);
    if (!form.nom.trim()) return echec("Le nom est obligatoire.");
    // Seuls les prospects de la « Liste Axel » sont chiffrés (ils le restent) ; les autres sont enregistrés en clair.
    const personnel = edit !== "nouveau" && !!edit?.chiffre;
    if (personnel && !coffre.estOuvert) return echec("Coffre verrouillé : déverrouillez-le pour enregistrer des coordonnées (elles sont chiffrées).");
    if (edit !== "nouveau" && edit?.verrouille) return echec("Fiche chiffrée illisible : déverrouillez le coffre.");
    setSaving(true);
    const supabase = createClient();
    const nomPropre = typeDe(form.segment) === "particulier" ? nomSoigne(form.nom, false) : form.nom.trim();
    const coordonnees: { nom: string; pii_chiffre: string | null } = personnel
      ? {
          nom: NOM_NEUTRE,
          pii_chiffre: await coffre.chiffrer(
            JSON.stringify({
              titre: form.civilite.trim() || null,
              nom: nomPropre,
              prenom: form.prenom.trim() || null,
              adresse: form.adresse.trim() || null,
              cp_ville: form.cp_ville.trim() || null,
            }),
          ),
        }
      : { nom: nomPropre, pii_chiffre: null };
    // En clair : civilité, prénom, adresse et ville dans leurs colonnes (vides pour une fiche chiffrée).
    const enClair = personnel
      ? { civilite: null, prenom: null, adresse: null, cp_ville: null }
      : {
          civilite: form.civilite.trim() || null,
          prenom: form.prenom.trim() || null,
          adresse: form.adresse.trim() || null,
          cp_ville: form.cp_ville.trim() || null,
        };
    const payload = {
      ...coordonnees,
      ...enClair,
      segment: form.segment,
      type_autre: typeDe(form.segment) === "autre" ? form.type_autre.trim() || null : null,
      etape: form.etape,
      ...(edit === "nouveau" || form.etat_unifie !== (etatDe(edit as Prospect).auto ? "" : etatDe(edit as Prospect).etat ?? "")
        ? { etat_unifie: form.etat_unifie || null, etat_unifie_le: new Date().toISOString(), etat_unifie_par: auteurSuivi }
        : {}),
      capacite: form.capacite || null,
      montant_cible: form.montant_cible.trim() ? eur(form.montant_cible) : null,
      responsable: form.responsable.trim() || null,
      prochaine_action: form.prochaine_action.trim() || null,
      prochaine_action_date: form.prochaine_action_date || null,
      notes: form.notes.trim() || null,
      email: form.email.trim() || null,
      telephone: form.telephone.trim() || null,
      relation: form.relation.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("prospects").insert(payload)
        : await supabase.from("prospects").update(payload).eq("id", (edit as Prospect).id);
    setSaving(false);
    if (err) return echec("Enregistrement impossible : " + err.message);
    router.refresh();
    return true;
  }

  /** État unifié choisi depuis le tableau (ou suggestion acceptée). */
  async function definirEtat(p: ProspectLisible, etat: string) {
    setBusy(p.id);
    await createClient().from("prospects").update({ etat_unifie: etat || null, etat_unifie_le: new Date().toISOString(), etat_unifie_par: auteurSuivi, updated_at: new Date().toISOString() }).eq("id", p.id);
    setBusy(null);
    router.refresh();
  }

  /** Clic sur le Suivi : modifier sa dernière action (moins de 24 h, même auteur), sinon en ajouter une. */
  function cliquerSuivi(p: ProspectLisible) {
    const der = suiviProspect.get(p.id)?.[0];
    const modifiable = der && der.actions.length > 0 && der.auteur === auteurSuivi && Date.now() - new Date(der.cree_le).getTime() < H24;
    setAjoutSuiviEtat(modifiable ? { p, existante: der } : { p });
  }

  /** Commentaire modifié dans le tableau : corrige le sien (moins de 24 h), sinon ajoute une ligne de commentaire. */
  async function enregistrerCommentaire(p: ProspectLisible, texte: string) {
    setEditCom(null);
    const h = suiviProspect.get(p.id) ?? [];
    if (texte.trim() === (dernierCommentaire(h) ?? "").trim()) return;
    const der = h.find((l) => l.note);
    const sb = createClient();
    const { error: e } = der && der.auteur === auteurSuivi && Date.now() - new Date(der.cree_le).getTime() < H24
      ? await sb.rpc("modifier_suivi_action", { p_id: der.id, p_actions: der.actions, p_note: texte, p_auteur: auteurSuivi ?? "" })
      : await sb.rpc("ajouter_suivi_action", { p_cible_type: "prospect", p_cible_cle: p.id, p_dons_ids: [], p_actions: [], p_etat: "", p_note: texte, p_auteur: auteurSuivi ?? "" });
    if (e) return setErreurReserve("Commentaire non enregistré : " + e.message);
    router.refresh();
  }

  /** Modification directe d'un état depuis le tableau (étape, segment, capacité, responsable…). */
  async function majChamp(
    p: ProspectLisible,
    patch: Partial<Pick<Prospect, "etape" | "segment" | "capacite" | "responsable" | "prochaine_action" | "prochaine_action_date" | "montant_cible">>,
  ) {
    setBusy(p.id);
    await createClient().from("prospects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id);
    setBusy(null);
    router.refresh();
  }



  async function avancer(p: Prospect) {
    const suite = etatSuivant(etatDe(p).affiche);
    if (suite) await definirEtat(p as ProspectLisible, suite);
  }

  async function supprimer(p: ProspectLisible) {
    if (!confirm(`Supprimer « ${p.affiche} » du pipeline ?`)) return;
    setBusy(p.id);
    const supabase = createClient();
    await supabase.from("prospects").delete().eq("id", p.id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Analyse */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile label="Prospects actifs" valeur={String(actifs.length)} />
        <Tuile label="Objectif (cible)" valeur={formatEuros(totalCible)} />
        <Tuile label="Déjà obtenu" valeur={formatEuros(totalObtenu)} accent="positive" />
        <Tuile label="Actions ≤ 7 jours" valeur={String(dans7j)} accent={dans7j > 0 ? "gold" : "muted"} />
      </div>

      {/* Progression du pipeline par étape */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-end gap-1.5" style={{ height: 84 }}>
          {parEtape.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => setFEtape(fEtape === e.key ? "" : e.key)}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${e.label} : ${e.n}`}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t ${fEtape === e.key ? "bg-accent" : "bg-accent/40"}`}
                  style={{ height: `${Math.max(4, (e.n / maxEtape) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-medium tabular-nums">{e.n}</span>
              <span className="text-[9px] text-muted" title={AIDE_ETAT[e.key]}>{e.court}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Légende des états */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">États :</span>
        {ETATS_PROSPECT.map((e) => (
          <span key={e} title={AIDE_ETAT[e]} className={`rounded-full px-2 py-0.5 font-medium ${TON_ETAT[e]}`}>{e}</span>
        ))}
        <span className="text-muted">— survolez pour la définition (Contacté : premier contact établi ou don sollicité).</span>
      </div>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par type">
          <span className="mr-1 text-sm text-muted">Type</span>
          {TYPES_PROSPECT.map(({ key: k, label: v }) => {
            const actif = fSegments.includes(k);
            const n = prospects.filter((p) => typeDe(p.segment) === k).length;
            return (
              <button key={k} type="button" aria-pressed={actif}
                onClick={() => setFSegments((l) => (actif ? l.filter((x) => x !== k) : [...l, k]))}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${actif ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"} ${n === 0 ? "opacity-40" : ""}`}>
                {actif ? "✓ " : ""}{v} <span className="tabular-nums">({n})</span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (nom, responsable)…"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select value={fEtape} onChange={(e) => setFEtape(e.target.value as "" | EtatProspect)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Tous états</option>
          {ETATS_PROSPECT.map((v) => <option key={v} value={v} title={AIDE_ETAT[v]}>{v}</option>)}
        </select>
        <div className="relative">
          <button type="button" onClick={() => setMenuCols((v) => !v)} aria-expanded={menuCols}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">Colonnes ▾</button>
          {menuCols && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuCols(false)} />
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-surface p-2 shadow-lg">
                {COLONNES_P.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={vis(c.key)} onChange={() => basculerCol(c.key)} className="h-4 w-4" />
                    {c.label}
                  </label>
                ))}
                <p className="mt-1 px-2 text-[11px] text-muted">Mémorisé pour {auteurSuivi ?? "ce profil"}.</p>
              </div>
            </>
          )}
        </div>
        {(q || fEtape || fSegments.length > 0) && (
          <button type="button" onClick={() => { setQ(""); setFEtape(""); setFSegments([]); }} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            Réinitialiser
          </button>
        )}
        <button type="button" onClick={() => void exporterListe()} disabled={exportEnCours}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
          title="PDF des prospects affichés (filtres actifs), ou de tous sans filtre">
          {exportEnCours ? "Export…" : "Exporter liste"}
        </button>
        {peutEcrire && <ImportProspects prospects={prospects} dons={dons} auteur={auteurSuivi} relations={relationsConnues} />}
        {peutEcrire && (
          <button type="button" onClick={() => ouvrir("nouveau")} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="plus" className="h-4 w-4" />
              Ajouter un prospect
            </span>
          </button>
        )}
        <datalist id="relations-prospects">
          {relationsConnues.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>

      {listes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted">Liste</span>
          <button
            type="button"
            onClick={reinitialiserListes}
            className={`rounded-full border px-3 py-1 text-sm transition ${fListes.length === 0 ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"}`}
          >
            Toutes
          </button>
          {listes.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => basculerListe(l)}
              aria-pressed={listeActive(l)}
              className={`rounded-full border px-3 py-1 text-sm transition ${listeActive(l) ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"}`}
            >
              {listeMultiple && <CasePastille coche={listeActive(l)} />}
              {l}
            </button>
          ))}
          <BoutonFiltresMultiples actif={listeMultiple} onClick={basculerListeMultiple} nombre={fListes.length} />
        </div>
      )}

      {liaison && (
        <LierEcrituresProspect
          prospectId={liaison.id}
          prospectNom={nomComplet({ titre: liaison.titre, prenom: liaison.prenom, nom: liaison.nom }) || liaison.affiche}
          onClose={() => setLiaison(null)}
        />
      )}

      {verrou && (
        <div className="rounded-lg border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-gold">
          🔒 Coffre verrouillé — les noms et adresses des prospects importés sont masqués.
          <div className="mt-2">
            <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
          </div>
        </div>
      )}

      {erreurReserve && <p className="text-sm text-negative">{erreurReserve}</p>}
      {ajoutSuivi && (
        <AjoutSuivi
          cibleType="prospect"
          cle={ajoutSuivi.p.id}
          nom={!ajoutSuivi.p.verrouille ? nomComplet({ titre: ajoutSuivi.p.titre, prenom: ajoutSuivi.p.prenom, nom: ajoutSuivi.p.nom }) : ajoutSuivi.p.affiche}
          auteur={auteurSuivi}
          existante={ajoutSuivi.existante ?? null}
          noteSeule={ajoutSuivi.noteSeule}
          etats={ETATS_PROSPECT}
          types={TYPES_ACTION_PROSPECT}
          onClose={() => setAjoutSuivi(null)}
        />
      )}
      {histoSuivi && (
        <Modal title={`Suivi — ${!histoSuivi.verrouille ? nomComplet({ titre: histoSuivi.titre, prenom: histoSuivi.prenom, nom: histoSuivi.nom }) : histoSuivi.affiche}`} onClose={() => setHistoSuivi(null)} fermerAuClicExterieur>
          <div className="space-y-3">
            <HistoriqueSuivi historique={suiviProspect.get(histoSuivi.id) ?? []} />
            {peutSuivre && (
              <button
                type="button"
                onClick={() => {
                  setAjoutSuivi(histoSuivi);
                  setHistoSuivi(null);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                + Ajouter une action
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm [&_th:first-child]:text-left [&_td:not(:first-child)]:text-center [&_th:not(:first-child)]:text-center">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              {thTri("prospect", "Prospect")}
              {vis("relation") && thTri("relation", "Relation · Responsable")}
              {vis("suivi") && <th className="px-4 py-3 font-medium" aria-sort={ariaSort("suivi", "suiviDate")}>
                <span className="inline-flex items-center gap-1">
                  {bouton("suivi", "Suivi", "Trier par action")}
                  {bouton("suiviDate", "date", "Trier par date de la dernière action")}
                </span>
              </th>}
              {vis("etat") && thTri("etat", "État")}
              {vis("action") && thTri("action", "Prochaine action")}
              {vis("cible") && thTri("cible", "Cible", true)}
              {vis("obtenu") && thTri("obtenu", "Obtenu", true)}
              {vis("commentaire") && thTri("commentaire", "Commentaire")}
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-10 text-center text-muted">Aucun prospect. Commencez par « Ajouter un prospect ».</td></tr>
            ) : (
              tries.map((p) => {
                const ec = etatDe(p);
                const suite = etatSuivant(ec.affiche);
                const h = suiviProspect.get(p.id);
                const der = h?.[0];
                const com = dernierCommentaire(h);
                const nomP = !p.verrouille ? nomComplet({ titre: p.titre, prenom: p.prenom, nom: p.nom }) : p.affiche;
                const retard = p.prochaine_action_date && p.prochaine_action_date < today;
                return (
                  <tr key={p.id} className={`border-b border-border last:border-0 ${ec.affiche === "Pas intéressé" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => ouvrir(p)} title="Ouvrir la fiche du prospect (informations et suivi)" className={`${nomCliquableCls} font-medium hover:underline`}>
                        {!p.verrouille ? nomComplet({ titre: p.titre, prenom: p.prenom, nom: p.nom }) : p.affiche}
                      </button>
                      {p.cp_ville && <div className="text-xs text-muted">{villeEtDepartement(p.cp_ville)}</div>}
                      {(p.email || p.telephone) && (
                        <div className="text-xs text-muted">
                          {p.email && <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a>}
                          {p.email && p.telephone && " · "}
                          {p.telephone && <a href={`tel:${p.telephone.replace(/\s/g, "")}`} className="hover:underline">{p.telephone}</a>}
                        </div>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {/* Prospects de la Liste Axel : tous des particuliers, segment non modifiable depuis le tableau. */}
                        {!estListeChiffree(p.liste) && (
                          <select
                            value={ancienType(p.segment) ? `ancien:${p.segment}` : p.segment}
                            disabled={busy === p.id || !peutEcrire}
                            onChange={(e) => !e.target.value.startsWith("ancien:") && void majChamp(p, { segment: e.target.value as Segment })}
                            aria-label="Type"
                            title={ancienType(p.segment) ? `Ancienne valeur : ${ancienType(p.segment)} — type suggéré : ${libelleType(p)}` : `Type : ${libelleType(p)}`}
                            className="rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-border"
                          >
                            {ancienType(p.segment) && <option value={`ancien:${p.segment}`}>{libelleType(p)} (suggéré · ancien : {ancienType(p.segment)})</option>}
                            {TYPES_PROSPECT.map((t) => <option key={t.key} value={t.key}>{t.key === "autre" && p.type_autre && typeDe(p.segment) === "autre" ? libelleType(p) : t.label}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                    {vis("relation") && <td className="px-4 py-3 text-muted">
                      <RelationResponsable
                        relation={p.relation ?? null}
                        responsable={p.reserve_a ?? p.responsable ?? null}
                        peutRelation={peutEcrire}
                        peutResponsable={peutSuivre}
                        suggestions={relationsConnues}
                        nom={nomP}
                        onEnregistrer={async (rel, resp) => {
                          const sb = createClient();
                          if (peutEcrire && rel !== (p.relation ?? "").trim()) {
                            const { data, error: e } = await sb.from("prospects").update({ relation: rel || null, updated_at: new Date().toISOString() }).eq("id", p.id).select("id");
                            if (e || !data?.length) return e?.message ?? "modification refusée";
                          }
                          if (peutSuivre && (resp ?? "") !== (p.reserve_a ?? "")) {
                            const { error: e } = await sb.rpc("definir_reserve_prospect", { p_id: p.id, p_valeur: resp ?? "" });
                            if (e) return e.message;
                          }
                          router.refresh();
                          return null;
                        }}
                      />
                    </td>}
                    {vis("suivi") && <td className="px-4 py-3">
                      <button type="button" disabled={!peutSuivre} onClick={() => cliquerSuivi(p)}
                        title={der ? `Dernière action le ${formatDateHeure(der.cree_le)} par ${der.auteur}${peutSuivre ? (der.auteur === auteurSuivi && Date.now() - new Date(der.cree_le).getTime() < H24 ? " — cliquer pour la modifier" : " — cliquer pour ajouter une action") : ""}` : peutSuivre ? "Ajouter une action" : undefined}
                        className="mx-auto flex flex-wrap items-center justify-center gap-1 rounded enabled:hover:bg-surface-2">
                        {der && der.actions.length ? der.actions.map((a) => (
                          <span key={a} className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">{a}</span>
                        )) : <span className="text-muted">{peutSuivre ? "+ action" : "—"}</span>}
                        {der && <span className="text-[11px] text-muted">{new Date(der.cree_le).toLocaleDateString("fr-FR")}</span>}
                      </button>
                    </td>}
                    {vis("etat") && <td className="whitespace-nowrap px-4 py-3">
                      {ec.etat || !peutEcrire ? (
                        peutEcrire && !ec.auto ? (
                          <select value={ec.etat ?? ""} disabled={busy === p.id} onChange={(e) => void definirEtat(p, e.target.value)}
                            aria-label={`État : ${nomP}`} title={ec.etat ? AIDE_ETAT[ec.etat] : undefined}
                            className={`rounded-full border border-transparent px-2 py-0.5 text-xs font-medium hover:border-border ${ec.etat ? TON_ETAT[ec.etat] : ""}`}>
                            {ETATS_PROSPECT.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TON_ETAT[ec.affiche]}`} title={ec.auto ? "Automatique : un don est enregistré pour ce prospect" : AIDE_ETAT[ec.affiche]}>
                            {ec.etat ?? ec.ancien ?? "—"}
                          </span>
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs text-muted" title="Ancienne valeur (conservée)">{ec.ancien ?? "—"}</span>
                          <span className="inline-flex items-center gap-1">
                            {ec.suggestion && (
                              <button type="button" disabled={busy === p.id} onClick={() => void definirEtat(p, ec.suggestion!)}
                                title={`Accepter l'état suggéré : ${ec.suggestion} (${AIDE_ETAT[ec.suggestion]})`}
                                className={`rounded-full border border-dashed border-accent px-2 py-0.5 text-xs font-medium ${TON_ETAT[ec.suggestion]}`}>
                                → {ec.suggestion} ✓
                              </button>
                            )}
                            <select value="" disabled={busy === p.id} onChange={(e) => e.target.value && void definirEtat(p, e.target.value)}
                              aria-label={`Choisir l'état : ${nomP}`} className="rounded border border-border bg-background py-0.5 text-[11px] text-muted">
                              <option value="">Autre…</option>
                              {ETATS_PROSPECT.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </span>
                        </div>
                      )}
                    </td>}
                    {vis("action") && <td className="px-4 py-3">
                      <input
                        type="text"
                        // Enregistré en quittant le champ.
                        key={`${p.id}-a-${p.prochaine_action ?? ""}`}
                        defaultValue={p.prochaine_action ?? ""}
                        placeholder="—"
                        aria-label="Prochaine action"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (p.prochaine_action ?? "")) void majChamp(p, { prochaine_action: v || null });
                        }}
                        className="w-36 rounded border border-border bg-background px-1.5 py-0.5 text-xs focus:border-accent focus:outline-none"
                      />
                      <input
                        type="date"
                        key={`${p.id}-d-${p.prochaine_action_date ?? ""}`}
                        defaultValue={p.prochaine_action_date ?? ""}
                        aria-label="Échéance de l'action"
                        title={retard ? "En retard" : "Échéance"}
                        onChange={(e) => void majChamp(p, { prochaine_action_date: e.target.value || null })}
                        className={`mt-1 block rounded border bg-background px-1.5 py-0.5 text-xs focus:border-accent focus:outline-none ${retard ? "border-negative text-negative" : "border-border text-muted"}`}
                      />
                    </td>}
                    {vis("cible") && <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          key={`${p.id}-c-${p.montant_cible ?? ""}`}
                          defaultValue={p.montant_cible != null ? String(p.montant_cible).replace(".", ",") : ""}
                          placeholder="—"
                          aria-label="Cible en euros"
                          onBlur={(e) => {
                            const t = e.target.value.trim();
                            const v = t ? eur(t) : null;
                            if (v !== (p.montant_cible != null ? Number(p.montant_cible) : null)) void majChamp(p, { montant_cible: v });
                          }}
                          className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-accent focus:outline-none"
                        />
                        <span className="text-xs text-muted">€</span>
                      </span>
                      <div className="mt-1">
                        <select
                          value={p.capacite ?? ""}
                          disabled={busy === p.id}
                          onChange={(e) => void majChamp(p, { capacite: (e.target.value || null) as Capacite | null })}
                          aria-label="Capacité"
                          title={p.capacite ? CAPACITE_LABEL[p.capacite] : "Capacité non estimée"}
                          className="rounded border border-border bg-background py-0.5 text-xs text-muted focus:border-accent focus:outline-none"
                        >
                          <option value="">Capacité —</option>
                          {Object.entries(CAPACITE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </td>}
                    {vis("obtenu") && <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-medium text-positive">{obtenus[p.id] ? formatEuros(obtenus[p.id].montant) : "—"}</span>
                      {peutLier && (
                        <button
                          type="button"
                          onClick={() => setLiaison(p)}
                          className="ml-1.5 rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                          title={obtenus[p.id] ? `${obtenus[p.id].nb} écriture(s) liée(s) — gérer` : "Lier une écriture de Comptabilité"}
                          aria-label="Lier une écriture de Comptabilité"
                        >
                          <Icon name="ledger" className="h-4 w-4" />
                        </button>
                      )}
                    </td>}
                    {vis("commentaire") && <td className="max-w-56 px-4 py-3 text-muted">
                      {editCom === p.id ? (
                        <textarea autoFocus defaultValue={com ?? ""} rows={2} aria-label={`Commentaire : ${nomP}`}
                          onBlur={(e) => void enregistrerCommentaire(p, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditCom(null); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                          className="w-52 rounded border border-accent bg-background px-1.5 py-1 text-xs text-foreground" />
                      ) : (
                        <button type="button" disabled={!peutSuivre} onClick={() => setEditCom(p.id)} title={peutSuivre ? "Cliquer pour modifier le commentaire" : com ?? undefined}
                          className="line-clamp-2 w-full rounded text-center enabled:hover:bg-surface-2">
                          {com ?? "—"}
                        </button>
                      )}
                    </td>}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {suite && (
                        <button type="button" onClick={() => avancer(p)} disabled={busy === p.id} className="rounded p-1.5 text-accent hover:bg-accent-soft disabled:opacity-50" title={`Avancer → ${suite}`} aria-label={`Avancer vers ${suite}`}>
                          <Icon name="avancer" className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => ouvrir(p)} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" title="Modifier" aria-label="Modifier">
                        <Icon name="crayon" className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => supprimer(p)} disabled={busy === p.id} className="rounded p-1.5 text-muted hover:bg-negative/10 hover:text-negative disabled:opacity-50" title="Supprimer" aria-label="Supprimer">
                        <Icon name="corbeille" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit === "nouveau" ? "Nouveau prospect" : `Fiche prospect — ${!edit.verrouille ? nomComplet({ titre: edit.titre, prenom: edit.prenom, nom: edit.nom }) : edit.affiche}`} onClose={() => setEdit(null)} enregistrerEnFermant>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Civilité">
                <select value={form.civilite} onChange={(e) => setForm({ ...form, civilite: e.target.value })} className={inputCls}>
                  {["", "M.", "Mme", "M. & Mme", "Père", "Sœur", "Abbé"].map((c) => <option key={c} value={c}>{c || "—"}</option>)}
                </select>
              </Field>
              <Field label="Prénom">
                <input type="text" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Nom / organisme">
                <input type="text" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className={inputCls} placeholder="Nom, ou Fondation Y…" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adresse">
                <input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className={inputCls} placeholder="N° et rue" />
              </Field>
              <Field label="CP et ville">
                <input type="text" value={form.cp_ville} onChange={(e) => setForm({ ...form, cp_ville: e.target.value })} className={inputCls} placeholder="51100 Reims" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Email">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Téléphone">
                <input type="tel" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Relation (qui l'a amené)">
                <input type="text" list="relations-prospects" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} className={inputCls} />
              </Field>
            </div>
            {edit !== "nouveau" && edit?.chiffre && (
              <p className="-mt-2 text-xs text-muted">Fiche de la « {edit.liste} » : prénom, adresse et civilité sont chiffrés dans le coffre (email, téléphone et relation restent en clair).</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as Segment })} className={inputCls}>
                  {ancienType(form.segment) && <option value={form.segment}>Ancien : {ancienType(form.segment)} (suggéré : {libelleType({ segment: form.segment })})</option>}
                  {TYPES_PROSPECT.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                {typeDe(form.segment) === "autre" && (
                  <input type="text" value={form.type_autre} onChange={(e) => setForm({ ...form, type_autre: e.target.value })} maxLength={80}
                    placeholder="Précisez le type…" className={`${inputCls} mt-1`} />
                )}
              </Field>
              <Field label="Capacité">
                <select value={form.capacite} onChange={(e) => setForm({ ...form, capacite: e.target.value as "" | Capacite })} className={inputCls}>
                  <option value="">— non estimée —</option>
                  {Object.entries(CAPACITE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="État">
                <select value={form.etat_unifie} onChange={(e) => setForm({ ...form, etat_unifie: e.target.value })} className={inputCls}
                  title="Contacté : premier contact établi ou don sollicité">
                  {edit !== "nouveau" && <option value="">— Non défini{edit && etatDe(edit).auto ? " (Donateur automatique)" : ""}</option>}
                  {ETATS_PROSPECT.map((v) => <option key={v} value={v}>{v} — {AIDE_ETAT[v]}</option>)}
                </select>
                {edit !== "nouveau" && edit && !etatDe(edit).etat && (
                  <span className="mt-1 block text-xs text-muted">Ancienne valeur : {etatDe(edit).ancien ?? "—"} {etatDe(edit).suggestion ? ` · suggestion : ${etatDe(edit).suggestion}` : ""}</span>
                )}
              </Field>
              <Field label="Comité (ancien champ Responsable)">
                <ChoixResponsable value={form.responsable || null} onChange={(v) => setForm({ ...form, responsable: v ?? "" })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant cible (€)">
                <input type="text" inputMode="decimal" value={form.montant_cible} onChange={(e) => setForm({ ...form, montant_cible: e.target.value })} className={inputCls} placeholder="0,00" />
              </Field>
              <div className="text-xs text-muted">
                <span className="mb-1 block">Montant obtenu</span>
                Tiré des écritures de Comptabilité liées par le Trésorier (bouton <Icon name="ledger" className="inline h-3.5 w-3.5" /> du tableau).
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prochaine action">
                <input type="text" value={form.prochaine_action} onChange={(e) => setForm({ ...form, prochaine_action: e.target.value })} className={inputCls} placeholder="Ex. Appeler, envoyer le dossier…" />
              </Field>
              <Field label="Échéance de l'action">
                <input type="date" value={form.prochaine_action_date} onChange={(e) => setForm({ ...form, prochaine_action_date: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={2} placeholder="Motivations, historique, points d'attention…" />
            </Field>
            {edit !== "nouveau" && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Suivi des actions</span>
                  <span className="text-xs text-muted">Responsable : {edit.reserve_a || edit.responsable || edit.relation || "—"}</span>
                </div>
                <HistoriqueSuivi historique={suiviProspect.get(edit.id) ?? []} />
                {peutSuivre && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      // Enregistre d'abord la fiche : aucune modification n'est perdue.
                      const p = edit;
                      if (await enregistrerFiche()) {
                        setEdit(null);
                        setAjoutSuivi(p);
                      }
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
                  >
                    + Ajouter une action
                  </button>
                )}
              </div>
            )}
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "positive" | "gold" | "muted" }) {
  const col = accent === "positive" ? "text-positive" : accent === "gold" ? "text-gold" : accent === "muted" ? "text-muted" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}

function addJours(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
