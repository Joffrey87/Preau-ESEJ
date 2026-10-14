"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, todayISO } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "@/components/GestionComptes";
import { AjoutSuivi, CellulesSuivi, HistoriqueSuivi } from "@/components/SuiviDonateur";
import { dernierCommentaire, etatCourant, suiviParCle, type SuiviAction } from "@/lib/suiviDonateurs";
import { trierListe, useTri } from "@/components/TriColonnes";
import RelationEnLigne from "@/components/RelationEnLigne";
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
  ETAPES,
  ETAPE_LABEL,
  SEGMENT_LABEL,
  CAPACITE_LABEL,
  etapeSuivante,
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
  etape: Etape;
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
  | "etape" | "responsable" | "action" | "cible" | "obtenu";
const ETAPE_ORDRE: Etape[] = ["identifie", "qualifie", "contacte", "rencontre", "sollicite", "don_recu", "remercie", "fidelise", "perdu"];

const vide: Form = {
  civilite: "", prenom: "", adresse: "", cp_ville: "",
  nom: "", segment: "particulier", etape: "identifie", capacite: "",
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
  const [ajoutSuivi, setAjoutSuivi] = useState<ProspectLisible | null>(null);
  const [histoSuivi, setHistoSuivi] = useState<ProspectLisible | null>(null);
  const [erreurReserve, setErreurReserve] = useState<string | null>(null);
  const suiviProspect = useMemo(() => suiviParCle(suivi), [suivi]);
  const [form, setForm] = useState<Form>(vide);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fEtape, setFEtape] = useState<"" | Etape>("");
  const [fSegment, setFSegment] = useState<"" | Segment>("");

  const filtres = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (!ql || [p.affiche, p.adresse, p.cp_ville, p.responsable, p.email, p.telephone, p.relation].some((v) => (v ?? "").toLowerCase().includes(ql))) &&
        (!fEtape || p.etape === fEtape) &&
        (!fSegment || p.segment === fSegment) &&
        (fListes.length === 0 || (!!p.liste && fListes.includes(p.liste))),
    );
  }, [prospects, q, fEtape, fSegment, fListes]);

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
      case "etat": return etatCourant(h);
      case "commentaire": return dernierCommentaire(h);
      case "reserve": return p.reserve_a || null;
      case "etape": return ETAPE_ORDRE.indexOf(p.etape);
      case "responsable": return p.responsable || null;
      case "action": return p.prochaine_action_date || null;
      case "cible": return p.montant_cible ?? null;
      case "obtenu": return obtenus[p.id]?.montant ?? null;
    }
  });

  // Analyse (sur la sélection filtrée).
  const actifs = filtres.filter((p) => p.etape !== "perdu");
  const totalCible = actifs.reduce((s, p) => s + Number(p.montant_cible ?? 0), 0);
  const totalObtenu = filtres.reduce((s, p) => s + (obtenus[p.id]?.montant ?? 0), 0);
  const dans7j = actifs.filter(
    (p) => p.prochaine_action_date && p.prochaine_action_date <= addJours(today, 7),
  ).length;

  // Répartition par étape (pour la barre de progression du pipeline).
  const parEtape = ETAPES.map((e) => ({ ...e, n: filtres.filter((p) => p.etape === e.key).length }));
  const maxEtape = Math.max(1, ...parEtape.map((e) => e.n));

  function ouvrir(p: ProspectLisible | "nouveau") {
    setError(null);
    if (p === "nouveau") setForm(vide);
    else
      setForm({
        civilite: abregerCivilite(p.titre), prenom: p.prenom ?? "", adresse: p.adresse ?? "", cp_ville: p.cp_ville ?? "",
        nom: p.verrouille ? "" : p.nom, segment: p.segment, etape: p.etape, capacite: p.capacite ?? "",
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
    setError(null);
    if (!form.nom.trim()) return setError("Le nom est obligatoire.");
    // Seuls les prospects de la « Liste Axel » sont chiffrés (ils le restent) ; les autres sont enregistrés en clair.
    const personnel = edit !== "nouveau" && !!edit?.chiffre;
    if (personnel && !coffre.estOuvert) return setError("Coffre verrouillé : déverrouillez-le pour enregistrer des coordonnées (elles sont chiffrées).");
    if (edit !== "nouveau" && edit?.verrouille) return setError("Fiche chiffrée illisible : déverrouillez le coffre.");
    setSaving(true);
    const supabase = createClient();
    const nomPropre = form.segment === "particulier" ? nomSoigne(form.nom, false) : form.nom.trim();
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
      etape: form.etape,
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
    if (err) return setError("Enregistrement impossible : " + err.message);
    setEdit(null);
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

  async function reserverProspect(p: ProspectLisible, valeur: string) {
    setBusy(p.id);
    setErreurReserve(null);
    const { error } = await createClient().rpc("definir_reserve_prospect", { p_id: p.id, p_valeur: valeur });
    setBusy(null);
    if (error) return setErreurReserve("Enregistrement impossible : " + error.message);
    router.refresh();
  }

  async function avancer(p: Prospect) {
    const suite = etapeSuivante(p.etape);
    if (!suite) return;
    setBusy(p.id);
    const supabase = createClient();
    await supabase.from("prospects").update({ etape: suite, updated_at: new Date().toISOString() }).eq("id", p.id);
    setBusy(null);
    router.refresh();
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
              <span className="text-[9px] text-muted">{e.court}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (nom, responsable)…"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select value={fSegment} onChange={(e) => setFSegment(e.target.value as "" | Segment)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Tous segments</option>
          {Object.entries(SEGMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fEtape} onChange={(e) => setFEtape(e.target.value as "" | Etape)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Toutes étapes</option>
          {Object.entries(ETAPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(q || fEtape || fSegment) && (
          <button type="button" onClick={() => { setQ(""); setFEtape(""); setFSegment(""); }} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            Réinitialiser
          </button>
        )}
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
          cle={ajoutSuivi.id}
          nom={!ajoutSuivi.verrouille ? nomComplet({ titre: ajoutSuivi.titre, prenom: ajoutSuivi.prenom, nom: ajoutSuivi.nom }) : ajoutSuivi.affiche}
          auteur={auteurSuivi}
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              {thTri("prospect", "Prospect")}
              {thTri("relation", "Relation")}
              <th className="px-4 py-3 font-medium" aria-sort={ariaSort("suivi", "suiviDate")}>
                <span className="inline-flex items-center gap-1">
                  {bouton("suivi", "Suivi", "Trier par action")}
                  {bouton("suiviDate", "date", "Trier par date de la dernière action")}
                </span>
              </th>
              {thTri("etat", "État")}
              {thTri("commentaire", "Commentaire")}
              {thTri("reserve", "Réservé à")}
              {thTri("etape", "Étape")}
              {thTri("responsable", "Responsable")}
              {thTri("action", "Prochaine action")}
              {thTri("cible", "Cible", true)}
              {thTri("obtenu", "Obtenu", true)}
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-10 text-center text-muted">Aucun prospect. Commencez par « Ajouter un prospect ».</td></tr>
            ) : (
              tries.map((p) => {
                const suite = etapeSuivante(p.etape);
                const retard = p.prochaine_action_date && p.prochaine_action_date < today;
                return (
                  <tr key={p.id} className={`border-b border-border last:border-0 ${p.etape === "perdu" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setHistoSuivi(p)} title="Voir le suivi des actions" className={`${nomCliquableCls} font-medium`}>
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
                            value={p.segment}
                            disabled={busy === p.id}
                            onChange={(e) => void majChamp(p, { segment: e.target.value as Segment })}
                            aria-label="Segment"
                            className="rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-border"
                          >
                            {Object.entries(SEGMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <RelationEnLigne
                        valeur={p.relation ?? null}
                        modifiable={peutEcrire}
                        liste="relations-prospects"
                        nom={p.affiche}
                        onEnregistrer={async (v) => {
                          const { data, error: e } = await createClient().from("prospects").update({ relation: v, updated_at: new Date().toISOString() }).eq("id", p.id).select("id");
                          if (e || !data?.length) return e?.message ?? "modification refusée";
                          router.refresh();
                          return null;
                        }}
                      />
                    </td>
                    <CellulesSuivi
                      historique={suiviProspect.get(p.id)}
                      peutSuivre={peutSuivre}
                      onAjouter={() => setAjoutSuivi(p)}
                      reserve={p.reserve_a ?? null}
                      reserveBusy={busy === p.id}
                      onReserver={(v) => void reserverProspect(p, v)}
                      nom={!p.verrouille ? nomComplet({ titre: p.titre, prenom: p.prenom, nom: p.nom }) : p.affiche}
                    />
                    <td className="px-4 py-3">
                      <select
                        value={p.etape}
                        disabled={busy === p.id}
                        onChange={(e) => void majChamp(p, { etape: e.target.value as Etape })}
                        aria-label="Étape"
                        className="rounded-full border border-transparent bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent hover:border-accent"
                      >
                        {Object.entries(ETAPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <ChoixResponsable
                        key={`${p.id}-${p.responsable ?? ""}`}
                        value={p.responsable ?? null}
                        disabled={busy === p.id}
                        compact
                        onChange={(v) => void majChamp(p, { responsable: v })}
                      />
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3 text-right">
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
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
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
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {suite && (
                        <button type="button" onClick={() => avancer(p)} disabled={busy === p.id} className="rounded p-1.5 text-accent hover:bg-accent-soft disabled:opacity-50" title={`Avancer → ${ETAPE_LABEL[suite]}`} aria-label={`Avancer vers ${ETAPE_LABEL[suite]}`}>
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
        <Modal title={edit === "nouveau" ? "Nouveau prospect" : "Modifier le prospect"} onClose={() => setEdit(null)} enregistrerEnFermant>
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
              <Field label="Segment">
                <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as Segment })} className={inputCls}>
                  {Object.entries(SEGMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Capacité">
                <select value={form.capacite} onChange={(e) => setForm({ ...form, capacite: e.target.value as "" | Capacite })} className={inputCls}>
                  <option value="">— non estimée —</option>
                  {Object.entries(CAPACITE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Étape">
                <select value={form.etape} onChange={(e) => setForm({ ...form, etape: e.target.value as Etape })} className={inputCls}>
                  {Object.entries(ETAPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Responsable (comité)">
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
