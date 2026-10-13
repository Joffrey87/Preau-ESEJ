"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, todayISO } from "@/lib/format";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { TONE_CLASSES, cleDonateur } from "@/lib/statutDon";
import {
  agregerDonateurs,
  badgesDe,
  suggestionsDonateurs,
  picCourant,
  type DonAgg,
  type ProfilDonateur,
} from "@/lib/donateurs";
import CampagneCollecte from "@/components/CampagneCollecte";
import FicheDonateur from "@/components/FicheDonateur";
import HarmoniserFiches from "@/components/HarmoniserFiches";
import ExportRelations from "@/components/ExportRelations";
import ListeProfilsContact from "@/components/ListeProfilsContact";
import CarteDonateurs from "@/components/CarteDonateurs";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import BoutonFiltresMultiples, { CasePastille } from "@/components/BoutonFiltresMultiples";
import { useFiltresMultiples } from "@/lib/filtresMultiples";
import { trierListe, useTri } from "@/components/TriColonnes";
import { PARAMS } from "@/lib/segments";
import { nomCliquableCls } from "@/lib/ui";
import { inputCls } from "./GestionComptes";
import { AjoutSuivi, CellulesSuivi } from "@/components/SuiviDonateur";
import { dernierCommentaire, etatCourant, suiviParDonateur, type SuiviAction } from "@/lib/suiviDonateurs";
import { RAYON_ALENTOURS_KM, distanceReims } from "@/lib/geoReims";
import type { Don } from "@/components/GestionDons";

type SegFiltre = "tous" | "grand" | "actif" | "sommeil" | "perdu" | "fidele" | "alentours" | "bourse" | "famille";

// Les états (grands donateurs, actifs, en sommeil, perdus) se filtrent depuis les tuiles de synthèse ; ici, le reste.
const FILTRES: { key: SegFiltre; label: string; regle?: string }[] = [
  { key: "fidele", label: "Fidèles", regle: `A donné sur au moins ${PARAMS.fideleAnnees} années civiles` },
  { key: "alentours", label: "Alentours Reims" },
  { key: "bourse", label: "Donateurs Bourse" },
  { key: "famille", label: "Familles", regle: "Familles actuelles et anciennes de l'école ; les actuelles sont classées au-dessus des anciennes" },
];

const correspond = (p: ProfilDonateur, f: SegFiltre) =>
  (f === "grand" && p.estGrand) ||
  (f === "actif" && p.etat === "actif") ||
  (f === "sommeil" && p.etat === "sommeil") ||
  (f === "perdu" && p.etat === "perdu") ||
  (f === "fidele" && p.estFidele) ||
  (f === "famille" && p.famille !== null);

/**
 * Donateurs qualifiés depuis les dons (coffre ouvert), en deux volets :
 * « fichier » (synthèse, filtres, tableau) et « campagnes » (campagne de
 * collecte, relances, prochaines actions suggérées).
 */
type ColTriB = "donateur" | "bourse" | "autres" | "dernier";

type ColTri =
  | "donateur" | "relation" | "suivi" | "suiviDate" | "etat" | "commentaire" | "reserve"
  | "qualification" | "cumul" | "annee" | "dons" | "dernier";
const NUMERIQUES: ColTri[] = ["cumul", "annee", "dons"];

export default function DonateursPipeline({
  donsInit,
  volet,
  filtreInitial = null,
  carteInitiale = false,
  peutModifierDons = false,
  suivi = [],
  peutSuivre = false,
  auteurSuivi = null,
}: {
  donsInit: Don[];
  /** Modification de la relation en ligne (Trésorier, comme les dons). */
  peutModifierDons?: boolean;
  /** Historique des actions de suivi (tous donateurs). */
  suivi?: SuiviAction[];
  /** Ajout d'actions et réservation : Recherche de fonds, Trésorier, Administrateur. */
  peutSuivre?: boolean;
  /** Signature des actions (prénom Recherche de fonds ou profil). */
  auteurSuivi?: string | null;
  volet: "fichier" | "campagnes";
  /** Filtre actif à l'ouverture (lien du menu « Mises à jour »). */
  filtreInitial?: string | null;
  carteInitiale?: boolean;
}) {
  const coffre = useCoffre();
  const { dons, verrou } = useDonsDechiffres(donsInit);
  const today = todayISO();
  const { actifs: filtres, multiple, basculer, basculerMultiple, estActif, reinitialiser } = useFiltresMultiples<SegFiltre>(
    FILTRES.some((f) => f.key === filtreInitial) ? [filtreInitial as SegFiltre] : [],
  );
  const [ficheCle, setFicheCle] = useState<string | null>(null);
  // Filtre « Alentours Reims » : tableau ou carte.
  const [carte, setCarte] = useState(carteInitiale);
  const [recherche, setRecherche] = useState("");
  const router = useRouter();
  const [busyBourse, setBusyBourse] = useState<string | null>(null);
  const [erreurBourse, setErreurBourse] = useState<string | null>(null);
  // Relation modifiable en ligne : cellule en cours d'édition et état d'enregistrement.
  const [editRelation, setEditRelation] = useState<{ cle: string; valeur: string } | null>(null);
  // Tri des colonnes ; à l'ouverture, la dernière action de suivi la plus récente d'abord.
  const { tri, bouton, ariaSort } = useTri<ColTri>({ col: "suiviDate", dir: "desc" }, ["suiviDate", "dernier", ...NUMERIQUES]);
  const { tri: triB, bouton: boutonB, ariaSort: ariaSortB } = useTri<ColTriB>(null, ["bourse", "autres", "dernier"]);
  const th = (col: ColTri, label: string, centre = false) => (
    <th className={`px-3 py-1 font-medium ${centre ? "text-center" : ""}`} aria-sort={ariaSort(col)}>
      {bouton(col, label)}
    </th>
  );
  const [ajoutCle, setAjoutCle] = useState<string | null>(null);
  const [reserveBusy, setReserveBusy] = useState<string | null>(null);
  const [relationEtat, setRelationEtat] = useState<{ cle: string; etat: "enregistrement" | "erreur"; message?: string } | null>(null);

  const profils = useMemo(
    () => agregerDonateurs(dons as unknown as DonAgg[], today),
    [dons, today],
  );
  const profilParCle = useMemo(() => new Map(profils.map((p) => [p.cle, p])), [profils]);
  // « Donateur Bourse » : à part, hors grands donateurs, statistiques et campagnes de collecte.
  const ordinaires = useMemo(() => profils.filter((p) => !p.boursier), [profils]);
  const boursiers = useMemo(() => profils.filter((p) => p.boursier), [profils]);
  const donsParCle = useMemo(() => {
    const m = new Map<string, Don[]>();
    for (const d of dons) {
      const cle = cleDonateur(d);
      if (!cle) continue;
      const liste = m.get(cle) ?? m.set(cle, []).get(cle)!;
      liste.push(d);
    }
    return m;
  }, [dons]);
  // Historique de suivi rattaché aux dons (lien stable quand le nom change ou que des fiches sont regroupées).
  const suiviCle = useMemo(() => {
    const cleDeDon = new Map<string, string>();
    for (const [cle, liste] of donsParCle) for (const d of liste) cleDeDon.set(d.id, cle);
    return suiviParDonateur(suivi, cleDeDon);
  }, [suivi, donsParCle]);
  // Campagnes et actions suggérées : jamais ceux qui ne souhaitent pas être sollicités.
  const sollicitables = useMemo(() => ordinaires.filter((p) => !p.nePasSolliciter), [ordinaires]);
  const suggestions = useMemo(() => suggestionsDonateurs(sollicitables, today), [sollicitables, today]);
  const pic = picCourant(today);

  const stats = useMemo(() => {
    const grands = ordinaires.filter((p) => p.estGrand).length;
    const actifs = ordinaires.filter((p) => p.etat === "actif").length;
    const sommeil = ordinaires.filter((p) => p.etat === "sommeil").length;
    const perdus = ordinaires.filter((p) => p.etat === "perdu").length;
    const collecte12 = dons
      .filter((d) => d.date_don && d.date_don >= reculMois(today, 12) && !d.don_boursier)
      .reduce((s, d) => s + Number(d.montant || 0), 0);
    return { total: ordinaires.length, grands, actifs, sommeil, perdus, collecte12 };
  }, [ordinaires, dons, today]);

  // Distance à Reims d'après le code postal (le plus récent renseigné).
  const cpVilleDe = (cle: string) => [...(donsParCle.get(cle) ?? [])].reverse().map((d) => d.cp_ville).find(Boolean) ?? null;
  const distanceDe = (cle: string) => distanceReims(cpVilleDe(cle));
  // Recherche : tous les mots saisis doivent se retrouver (nom, courriel, ville, origine), sans tenir compte des accents.
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const correspondRecherche = (p: ProfilDonateur) => {
    if (mots.length === 0) return true;
    const texte = sansAccents([p.nom, p.courriel, cpVilleDe(p.cle), p.origine].filter(Boolean).join(" "));
    return mots.every((m) => texte.includes(m));
  };
  const alentours = estActif("alentours");
  const filtresListe = filtres.filter((f) => f !== "bourse" && f !== "alentours");
  const seulementBourse = filtres.length > 0 && filtres.every((f) => f === "bourse");
  // Filtres cumulés en OU ; aucun filtre = tout le fichier.
  const affiches: ProfilDonateur[] = seulementBourse
    ? []
    : (filtres.length === 0
        ? ordinaires
        : ordinaires.filter((p) => {
            if (filtresListe.some((f) => correspond(p, f))) return true;
            if (!alentours) return false;
            const d = distanceDe(p.cle);
            return d != null && d <= RAYON_ALENTOURS_KM;
          })
      ).filter(correspondRecherche);
  // Filtre « Familles » : les actuelles d'abord, puis les anciennes, puis le reste (tri stable : ordre des dons conservé).
  const rangFamille = (p: ProfilDonateur) => (p.famille === "actuelle" ? 0 : p.famille === "ancienne" ? 1 : 2);
  if (estActif("famille")) affiches.sort((a, b) => rangFamille(a) - rangFamille(b));
  // Tri par colonne (valeurs affichées, déchiffrées) : ordre français, vides toujours en dernier.
  const valTri = (p: ProfilDonateur, col: ColTri): string | number | null => {
    const h = suiviCle.get(p.cle);
    switch (col) {
      case "donateur": return p.nom || null;
      case "relation": return p.origine?.trim() || null;
      case "suivi": return h?.[0]?.actions.join(", ") || null;
      case "suiviDate": return h?.[0]?.cree_le ?? null;
      case "etat": return etatCourant(h);
      case "commentaire": return dernierCommentaire(h);
      case "reserve": return p.contactReserveA || null;
      case "qualification": return badgesDe(p).map((b) => b.label).join(", ") || null;
      case "cumul": return p.cumul;
      case "annee": return p.cumulAnnee || null;
      case "dons": return p.nbDons;
      case "dernier": return p.dernier || null;
    }
  };
  const affichesTries = trierListe(affiches, tri, valTri);
  const valTriB = (p: ProfilDonateur, col: ColTriB): string | number | null =>
    col === "donateur" ? p.nom || null : col === "bourse" ? p.cumulBourse : col === "autres" ? (p.nbDons > p.nbDonsBourse || p.cumulBourse === 0 ? p.cumul : null) : p.dernier || null;
  const boursiersAffiches = trierListe(boursiers.filter(correspondRecherche), triB, valTriB);

  /** Coche / décoche « Donateur Bourse » : aucun don n'est marqué boursier d'office (à cocher ensuite dans la fiche) ; décocher remet tous ses dons en dons ordinaires. */
  async function basculerBourse(p: ProfilDonateur, actif: boolean) {
    if (
      !actif &&
      p.nbDonsBourse > 0 &&
      !window.confirm(`Retirer ${p.nom} des « Donateurs Bourse » ? Ses ${p.nbDonsBourse} don(s) boursier(s) redeviendront des dons ordinaires.`)
    ) {
      return;
    }
    setBusyBourse(p.cle);
    setErreurBourse(null);
    const ids = (donsParCle.get(p.cle) ?? []).map((d) => d.id);
    const { error } = await createClient().rpc("definir_boursier", { p_ids: ids, p_donateur_bourse: actif, p_don_boursier: actif ? null : false });
    setBusyBourse(null);
    if (error) return setErreurBourse("Enregistrement impossible : " + error.message);
    router.refresh();
  }

  /** Don dont la cellule Relation affiche l'origine : même règle que agregerDonateurs. */
  function donDeRelation(cle: string): Don | null {
    const tous = [...(donsParCle.get(cle) ?? [])].sort((a, b) => (a.date_don ?? "").localeCompare(b.date_don ?? ""));
    const ordinaires = tous.filter((x) => !x.don_boursier);
    const liste = ordinaires.length > 0 ? ordinaires : tous;
    return [...liste].reverse().find((x) => x.origine && x.origine.trim()) ?? liste[liste.length - 1] ?? null;
  }

  async function enregistrerRelation(p: ProfilDonateur, valeur: string) {
    const don = donDeRelation(p.cle);
    const v = valeur.trim();
    if (!don || v === (p.origine ?? "").trim()) return setEditRelation(null);
    setRelationEtat({ cle: p.cle, etat: "enregistrement" });
    const { data, error } = await createClient().from("dons").update({ origine: v || null }).eq("id", don.id).select("id");
    if (error || !data?.length) {
      setRelationEtat({ cle: p.cle, etat: "erreur", message: error?.message ?? "modification refusée" });
      return;
    }
    setEditRelation(null);
    setRelationEtat(null);
    router.refresh();
  }

  async function reserver(p: ProfilDonateur, valeur: string) {
    setReserveBusy(p.cle);
    setErreurBourse(null);
    const ids = (donsParCle.get(p.cle) ?? []).map((x) => x.id);
    const { error } = await createClient().rpc("definir_contact_reserve", { p_ids: ids, p_valeur: valeur });
    setReserveBusy(null);
    if (error) return setErreurBourse("Enregistrement impossible : " + error.message);
    router.refresh();
  }

  if (verrou) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-6 text-center text-sm">
        <p className="text-gold">🔒 Coffre verrouillé — les donateurs ne peuvent pas être qualifiés.</p>
        <div className="mt-3 flex justify-center">
          <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
        </div>
      </div>
    );
  }

  if (!coffre.estConfigure && donsInit.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted">
        Aucun don pour l&apos;instant. <Link href="/dons/import" className="text-accent hover:underline">Importez vos dons</Link> pour voir les profils se remplir ici.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {volet === "fichier" && (
      <>
      {/* Synthèse : chaque tuile est un filtre (clic = filtrer, reclic = retirer) ; la règle s'affiche au survol. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Tuile
          label="Donateurs"
          valeur={String(stats.total)}
          regle="Tous les donateurs (hors donateurs Bourse). Un clic retire les filtres."
          actif={filtres.length === 0}
          onClick={reinitialiser}
        />
        <Tuile
          label="Grands donateurs"
          valeur={String(stats.grands)}
          accent="violet"
          regle={`Cumul d'au moins ${PARAMS.seuilGrandDonateur.toLocaleString("fr-FR")} € sur une année`}
          actif={estActif("grand")}
          multiple={multiple}
          onClick={() => basculer("grand")}
        />
        <Tuile
          label="Actifs"
          valeur={String(stats.actifs)}
          accent="positive"
          regle={`Dernier don il y a moins de ${PARAMS.sommeilMois} mois`}
          actif={estActif("actif")}
          multiple={multiple}
          onClick={() => basculer("actif")}
        />
        <Tuile
          label="En sommeil"
          valeur={String(stats.sommeil)}
          accent="gold"
          regle={`Sans don depuis ${PARAMS.sommeilMois} à ${PARAMS.perduMois} mois`}
          actif={estActif("sommeil")}
          multiple={multiple}
          onClick={() => basculer("sommeil")}
        />
        <Tuile
          label="Perdus"
          valeur={String(stats.perdus)}
          accent="rouge"
          regle={`Sans don depuis plus de ${PARAMS.perduMois} mois`}
          actif={estActif("perdu")}
          multiple={multiple}
          onClick={() => basculer("perdu")}
        />
        <Tuile label="Collecte 12 mois" valeur={formatEuros(stats.collecte12)} regle="Total des dons des 12 derniers mois (hors dons boursiers)" />
      </div>

      </>
      )}

      {volet === "campagnes" && (
      <>
      {/* Campagne « objectif » — trouver X € avant une échéance */}
      <CampagneCollecte profils={sollicitables} today={today} onOuvrirFiche={setFicheCle} donsParCle={donsParCle} />

      {/* Prochaines actions suggérées */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Prochaines actions suggérées</h2>
          {pic && <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs text-gold">Période favorable : {pic}</span>}
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted">Aucune action prioritaire pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.slice(0, 8).map((s) => (
              <li key={s.cle} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
                <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[s.tone]}`}>
                  {s.action}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{s.nom}</div>
                  <div className="text-xs text-muted">{s.motif}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      </>
      )}

      {volet === "fichier" && (
      <>
      {/* Filtres segment */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="mr-0.5 text-xs font-semibold uppercase tracking-wider text-muted">Filtres</span>
        <BoutonFiltresMultiples actif={multiple} onClick={basculerMultiple} nombre={filtres.length} />
        {/* Recherche intégrée à la rangée des filtres. */}
        <span className="relative min-w-[14rem] flex-1">
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un donateur, une ville…"
            aria-label="Rechercher dans les donateurs"
            className={`${inputCls} !rounded-full !py-1 text-sm`}
          />
        </span>
        {FILTRES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => basculer(f.key)}
            aria-pressed={estActif(f.key)}
            title={f.regle}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              estActif(f.key) ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"
            }`}
          >
            {multiple && <CasePastille coche={estActif(f.key)} />}
            {f.label}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <ListeProfilsContact profils={profils} onOuvrirFiche={setFicheCle} />
          <ExportRelations profils={profils} donsParCle={donsParCle} aujourdhui={today} />
          <HarmoniserFiches dons={dons as unknown as Don[]} verrou={verrou} />
        </span>
        {alentours && (
          <div className="ml-auto inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {[
              { v: false, l: "Tableau" },
              { v: true, l: "Carte" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => setCarte(o.v)}
                className={`rounded-md px-3 py-1 font-medium ${carte === o.v ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"}`}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}
      </div>

      {erreurBourse && <p className="text-sm text-negative">{erreurBourse}</p>}

      {seulementBourse ? null : alentours && carte ? (
        <CarteDonateurs profils={affiches} cpVilleDe={cpVilleDe} onOuvrirFiche={setFicheCle} />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-center text-xs text-muted">
              {th("donateur", "Donateur")}
              {th("relation", "Relation")}
              <th className="px-3 py-1 font-medium" aria-sort={ariaSort("suivi", "suiviDate")}>
                <span className="inline-flex items-center gap-1">
                  {bouton("suivi", "Suivi", "Trier par action")}
                  {bouton("suiviDate", "date", "Trier par date de la dernière action")}
                </span>
              </th>
              {th("etat", "État")}
              {th("commentaire", "Commentaire")}
              {th("reserve", "Réservé à")}
              {th("qualification", "Qualification")}
              {th("cumul", "Cumul", true)}
              {th("annee", "Cette année", true)}
              {th("dons", "Dons", true)}
              {th("dernier", "Dernier don")}
              <th className="w-20 px-2 py-1 text-center text-xs font-medium leading-tight">Donateur Bourse</th>
            </tr>
          </thead>
          <tbody>
            {affiches.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-10 text-center text-muted">Aucun donateur pour ce filtre.</td></tr>
            ) : (
              affichesTries.map((p) => (
                <tr key={p.cle} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setFicheCle(p.cle)} className={nomCliquableCls}>
                      {p.nom}
                    </button>
                    {alentours && <div className="text-xs text-muted">≈ {distanceDe(p.cle)} km de Reims</div>}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {editRelation?.cle === p.cle ? (
                      <input
                        autoFocus
                        type="text"
                        value={editRelation.valeur}
                        disabled={relationEtat?.cle === p.cle && relationEtat.etat === "enregistrement"}
                        onChange={(e) => setEditRelation({ cle: p.cle, valeur: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            setRelationEtat(null);
                            setEditRelation(null);
                          }
                        }}
                        onBlur={(e) => void enregistrerRelation(p, e.currentTarget.value)}
                        aria-label={`Relation : ${p.nom}`}
                        className={`${inputCls} min-w-32 py-1 text-sm`}
                      />
                    ) : peutModifierDons ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRelationEtat(null);
                          setEditRelation({ cle: p.cle, valeur: p.origine ?? "" });
                        }}
                        title="Modifier la relation"
                        className="-mx-1 rounded px-1 text-left hover:bg-surface-2"
                      >
                        {p.origine?.trim() || "—"}
                      </button>
                    ) : (
                      p.origine?.trim() || "—"
                    )}
                    {relationEtat?.cle === p.cle && (
                      <div className={`text-xs ${relationEtat.etat === "erreur" ? "text-negative" : "text-muted"}`}>
                        {relationEtat.etat === "erreur" ? `Erreur : ${relationEtat.message}` : "Enregistrement…"}
                      </div>
                    )}
                  </td>
                  <CellulesSuivi
                    historique={suiviCle.get(p.cle)}
                    peutSuivre={peutSuivre}
                    onAjouter={() => setAjoutCle(p.cle)}
                    reserve={p.contactReserveA}
                    reserveBusy={reserveBusy === p.cle}
                    onReserver={(v) => void reserver(p, v)}
                    nom={p.nom}
                  />
                  <td className="px-4 py-3">
                    <div className="flex flex-nowrap gap-1 whitespace-nowrap">
                      {badgesDe(p).map((b) => (
                        <span key={b.key} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[b.tone]}`}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatEuros(p.cumul)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{p.cumulAnnee ? formatEuros(p.cumulAnnee) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.nbDons}</td>
                  <td className="px-4 py-3 tabular-nums">{p.moisDepuisDernier} mois</td>
                  <td className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={busyBourse === p.cle}
                      onChange={() => void basculerBourse(p, true)}
                      aria-label={`Donateur Bourse : ${p.nom}`}
                      className="h-3 w-3"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Donateurs Bourse : à part, tout en bas (dons faits pour payer des bourses de scolarité). */}
      {(filtres.length === 0 || estActif("bourse")) && boursiersAffiches.length > 0 && (
        <section className="mt-8 rounded-xl border border-dashed border-border bg-surface-2/40 p-4">
          <h2 className="mb-1 text-sm font-semibold">Donateurs Bourse ({boursiersAffiches.length})</h2>
          <p className="mb-3 text-xs text-muted">
            Ils donnent pour payer des bourses de frais de scolarité : hors grands donateurs, hors statistiques et campagnes de collecte. Cochez ou décochez leurs « dons boursiers » dans leur fiche (boutons « Tout cocher » / « Tout décocher »).
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-center text-xs text-muted">
                  <th className="px-3 py-1 font-medium" aria-sort={ariaSortB("donateur")}>{boutonB("donateur", "Donateur")}</th>
                  <th className="px-3 py-1 text-center font-medium" aria-sort={ariaSortB("bourse")}>{boutonB("bourse", "Dons boursiers")}</th>
                  <th className="px-3 py-1 text-center font-medium" aria-sort={ariaSortB("autres")}>{boutonB("autres", "Autres dons")}</th>
                  <th className="px-3 py-1 font-medium" aria-sort={ariaSortB("dernier")}>{boutonB("dernier", "Dernier don")}</th>
                  <th className="w-20 px-2 py-1 text-center text-xs font-medium leading-tight">Donateur Bourse</th>
                </tr>
              </thead>
              <tbody>
                {boursiersAffiches.map((p) => (
                  <tr key={p.cle} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => setFicheCle(p.cle)} className={nomCliquableCls}>
                        {p.nom}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatEuros(p.cumulBourse)} <span className="text-xs text-muted">({p.nbDonsBourse})</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">{p.nbDons > p.nbDonsBourse || p.cumulBourse === 0 ? formatEuros(p.cumul) : "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{p.moisDepuisDernier} mois</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked
                        disabled={busyBourse === p.cle}
                        onChange={() => void basculerBourse(p, false)}
                        aria-label={`Donateur Bourse : ${p.nom}`}
                        className="h-3 w-3"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      </>
      )}

      {ficheCle && profilParCle.get(ficheCle) && (
        <FicheDonateur
          profil={profilParCle.get(ficheCle)!}
          dons={donsParCle.get(ficheCle) ?? []}
          suivi={suiviCle.get(ficheCle) ?? []}
          onClose={() => setFicheCle(null)}
        />
      )}
      {ajoutCle && profilParCle.get(ajoutCle) && (
        <AjoutSuivi cle={ajoutCle} donsIds={(donsParCle.get(ajoutCle) ?? []).map((d) => d.id)} nom={profilParCle.get(ajoutCle)!.nom} auteur={auteurSuivi} onClose={() => setAjoutCle(null)} />
      )}
    </div>
  );
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function reculMois(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 - n, d);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function Tuile({
  label,
  valeur,
  accent = "default",
  regle,
  actif = false,
  multiple = false,
  onClick,
}: {
  label: string;
  valeur: string;
  accent?: "default" | "positive" | "gold" | "violet" | "rouge";
  /** Règle de la catégorie, affichée au survol. */
  regle?: string;
  actif?: boolean;
  multiple?: boolean;
  /** Sans `onClick`, la tuile est un simple indicateur. */
  onClick?: () => void;
}) {
  const col =
    accent === "positive" ? "text-positive" : accent === "gold" ? "text-gold" : accent === "violet" ? "text-violet-600 dark:text-violet-400" : accent === "rouge" ? "text-negative" : "text-foreground";
  const contenu = (
    <>
      <div className="text-[11px] text-muted">
        {multiple && <CasePastille coche={actif} />}
        {label}
      </div>
      <div className={`text-base font-semibold leading-tight tabular-nums ${col}`}>{valeur}</div>
      {regle && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {regle}
        </span>
      )}
    </>
  );
  const base = "group relative rounded-lg border px-3 py-1.5 text-center transition";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`${base} ${actif ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"}`}
    >
      {contenu}
    </button>
  ) : (
    <div className={`${base} border-border bg-surface`}>{contenu}</div>
  );
}
