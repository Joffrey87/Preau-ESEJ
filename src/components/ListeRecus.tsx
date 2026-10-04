"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { Modal, Field, inputCls } from "./GestionComptes";
import GestionDons, { type Don } from "./GestionDons";
import ReattribuerDon from "./ReattribuerDon";
import FicheRecuDonateur from "./FicheRecuDonateur";
import { EDITION_EXIGEE_DEPUIS, LIBELLE, TON, type StatutRecu } from "./recusCommun";

export type { StatutRecu } from "./recusCommun";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { cleDonateur, champsImportantsManquants, recuEnvoye, sansRecu } from "@/lib/statutDon";
import { MOYENS_ENVOI, etatEnvoye, libelleMoyen, prefereCourrier } from "@/lib/envoiRecu";
import { construireRecuPdf, genererRecuPdf, nomFichierRecu, type DonPourRecu } from "@/lib/recu";
import { modeleRecuEnCache } from "@/lib/modeleRecu";
import { creerZip } from "@/lib/zip";
import { syntheseVersements } from "@/lib/recuVersements";

/** Un don, tel que lu par la page (mêmes colonnes que l'onglet Dons : la fiche s'ouvre ici). */
export type DonRow = Don;

/** Suivi d'un reçu émis, tenu dans le registre `recus`. */
export type RecuInfo = {
  recu_numero: string;
  envoye_le: string | null;
  envoi_mode: string | null;
  /** Date à laquelle le reçu a été enregistré (ZIP ou « Télécharger ») ; vide = pas encore téléchargé. */
  telecharge_le: string | null;
};

/**
 * Un reçu, émis ou à établir.
 *
 * Règles (28/09/2026) : chaque don figure sur un seul reçu ; un reçu ne couvre
 * qu'une année civile ; en principe un reçu par donateur et par an. Un reçu
 * émis regroupe les dons portant son numéro ; les dons encore sans reçu d'un
 * même donateur et d'une même année forment le reçu « à établir » — après un
 * reçu intermédiaire, il ne reprend donc que les dons arrivés depuis.
 */
export type Groupe = {
  cle: string;
  numero: string | null;
  annee: number;
  total: number;
  dons: DonRow[];
  representant: DonRow;
  /** Le même numéro figure sur plusieurs années civiles : à scinder (un reçu = une année). */
  aScinder: boolean;
  /** Le donateur ne demande pas de reçu fiscal pour ces dons. */
  sans: boolean;
  /** Numéro seulement réservé : reçu 2026 ni édité (aucune date d'édition) ni envoyé. */
  reserve: boolean;
};

/**
 * Date d'édition : celle enregistrée sur les dons, sinon aujourd'hui. Le suffixe du numéro est la
 * date du (premier) don, pas la date d'édition : il n'est jamais lu comme telle.
 */
const dateEditionDuRecu = (g: Groupe) => g.dons.find((d) => d.recu_emis_le)?.recu_emis_le ?? todayISO();

/** Minuscules sans accents, pour une recherche tolérante. */
const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type ColTri = "annee" | "donateur" | "total" | "dons" | "numero" | "statut";

const numeroValide = (n: string | null) => !!n && /^RE_\d+/.test(n);

function grouper(dons: DonRow[], coffreOuvert: boolean): Groupe[] {
  const map = new Map<string, DonRow[]>();
  for (const d of dons) {
    const annee = d.date_don.slice(0, 4);
    const sans = sansRecu(d); // reçu non demandé : groupe à part, rétablissable
    // Sans le coffre, les noms sont illisibles : on ne regroupe pas à l'aveugle.
    // Un numéro couvrant plusieurs années forme un groupe par année : « reçu fiscal AAAA » ne
    // contient que les dons de l'année AAAA.
    const cle = sans
      ? coffreOuvert
        ? `s|${cleDonateur(d)}|${annee}`
        : `s|${d.id}`
      : numeroValide(d.recu_numero)
      ? `n|${d.recu_numero}|${annee}`
      : coffreOuvert
        ? `a|${cleDonateur(d)}|${annee}`
        : `a|${d.id}`;
    (map.get(cle) ?? map.set(cle, []).get(cle)!).push(d);
  }
  const groupes: Groupe[] = [];
  for (const [cle, rows] of map) {
    const tri = [...rows].sort((a, b) => a.date_don.localeCompare(b.date_don));
    const representant = tri[tri.length - 1];
    groupes.push({
      cle,
      numero: cle.startsWith("n|") ? representant.recu_numero : null,
      aScinder: false,
      sans: cle.startsWith("s|"),
      reserve:
        cle.startsWith("n|") &&
        Number(representant.date_don.slice(0, 4)) >= EDITION_EXIGEE_DEPUIS &&
        !rows.some((d) => d.recu_emis_le || recuEnvoye(d)),
      annee: Number(representant.date_don.slice(0, 4)),
      total: rows.reduce((s, d) => s + Number(d.montant), 0),
      dons: tri,
      representant,
    });
  }
  const anneesParNumero = new Map<string, number>();
  for (const g of groupes) if (g.numero) anneesParNumero.set(g.numero, (anneesParNumero.get(g.numero) ?? 0) + 1);
  for (const g of groupes) g.aScinder = !!g.numero && (anneesParNumero.get(g.numero) ?? 0) > 1;
  return groupes.sort((a, b) => b.representant.date_don.localeCompare(a.representant.date_don));
}

/**
 * Où en est ce reçu ? Les dons de l'année en cours d'un donateur mensuel (il donne tous les
 * mois, depuis au moins 3 mois, sur les 12 derniers mois) attendent la fin de l'année pour un reçu unique ;
 * un reçu intermédiaire reste possible à sa demande. Tout autre don sans reçu est « à établir ».
 */
function statutRecu(g: Groupe, recurrents: Set<string>, anneeEnCours: number): StatutRecu {
  if (g.sans) return "sans";
  if (g.numero && !g.reserve) return g.dons.every(recuEnvoye) ? "envoye" : prefereCourrier(g.representant) ? "courrier" : "edite";
  return recurrents.has(cleDonateur(g.representant)) && g.annee >= anneeEnCours ? "attente" : "a_faire";
}

const nomAffiche = (d: DonRow) =>
  d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? "—"
    : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ") || "—";

/** Données du PDF pour un reçu et les dons qu'il couvre. */
function donPourRecu(r: DonRow, dons: DonRow[], numero: string, dateEdition: string): DonPourRecu {
  return {
    recu_numero: numero,
    donateur_titre: r.donateur_titre,
    donateur_nom: r.donateur_nom ?? "",
    donateur_prenom: r.donateur_prenom,
    raison_sociale: r.raison_sociale,
    est_personne_morale: r.est_personne_morale,
    adresse: r.adresse,
    cp_ville: r.cp_ville,
    montant: dons.reduce((s, d) => s + Number(d.montant), 0),
    date_don: dons[dons.length - 1].date_don,
    mode_paiement: r.mode_paiement,
    versements: dons.map((d) => ({ date: d.date_don, montant: Number(d.montant), mode: d.mode_paiement })),
    date_edition: dateEdition,
  };
}

export default function ListeRecus({ dons, recus }: { dons: DonRow[]; recus: RecuInfo[] }) {
  const router = useRouter();
  const { dons: hydrates, verrou } = useDonsDechiffres(dons);
  const [annee, setAnnee] = useState<number | "toutes">("toutes");
  const [statut, setStatut] = useState<StatutRecu | "tous">("tous");
  // Reçus dont la fiche donateur est incomplète (alarme en haut de page).
  const [incompletsSeuls, setIncompletsSeuls] = useState(false);
  const [recherche, setRecherche] = useState("");
  // Tri par colonne (clic sur l'en-tête : croissant, puis décroissant, puis ordre d'origine : le plus récent d'abord).
  const [tri, setTri] = useState<{ col: ColTri; dir: "asc" | "desc" } | null>(null);
  // Fiche donateur ouverte en fenêtre (même formulaire que l'onglet Dons).
  const [ficheId, setFicheId] = useState<{ id: string; signaler: boolean } | null>(null);
  const [envoi, setEnvoi] = useState<Groupe | null>(null);
  // Sélection de reçus à télécharger en lot (ZIP).
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lot, setLot] = useState<{ fait: number; total: number } | null>(null);
  // Fiche « Reçu fiscal donateur » : tous les dons du donateur, année par année.
  const [fiche, setFiche] = useState<{ ids: Set<string>; annee: number } | null>(null);
  // Lignes dépliées (leurs dons s'affichent en « lignes filles ») et don en cours de réattribution.
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [reattribuer, setReattribuer] = useState<{ don: DonRow; statut: "envoye" | "edite" | null } | null>(null);
  // Les écritures filles se referment dès qu'on clique ailleurs (hors de la ligne dépliée et de
  // ses dons, hors fenêtres ouvertes) ou qu'on appuie sur Échap ; quitter la page les referme aussi.
  useEffect(() => {
    if (ouverts.size === 0) return;
    const ailleurs = (e: MouseEvent) => {
      const cible = e.target as Element | null;
      if (!cible) return;
      const ligne = cible.closest("tr[data-groupe]");
      if (ligne && ouverts.has(ligne.getAttribute("data-groupe") ?? "")) return;
      if (cible.closest(".fixed")) return;
      setOuverts(new Set());
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuverts(new Set());
    };
    document.addEventListener("mousedown", ailleurs);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", ailleurs);
      document.removeEventListener("keydown", echap);
    };
  }, [ouverts]);
  const basculer = (cle: string) =>
    setOuverts((p) => {
      const n = new Set(p);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });
  const suivi = useMemo(() => new Map(recus.map((x) => [x.recu_numero, x])), [recus]);
  const [etablir, setEtablir] = useState<Groupe | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const anneeEnCours = new Date().getFullYear();

  // Un donateur est « mensuel » s'il donne tous les mois : sur les 12 derniers mois, entre son
  // premier et son dernier don il n'y a aucun mois sans don (au moins 3 mois). Seuls ses dons
  // de l'année en cours attendent la fin d'année pour un reçu unique.
  const recurrents = useMemo(() => {
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() - 1);
    const depuis = limite.toISOString().slice(0, 10);
    const mois = new Map<string, Set<string>>();
    for (const d of hydrates) {
      const c = cleDonateur(d);
      if (!c || c === "|" || d.date_don < depuis) continue;
      (mois.get(c) ?? mois.set(c, new Set()).get(c)!).add(d.date_don.slice(0, 7));
    }
    const rang = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
    return new Set(
      [...mois]
        .filter(([, m]) => {
          const rangs = [...m].map(rang);
          const premier = Math.min(...rangs);
          const dernier = Math.max(...rangs);
          return rangs.length >= 3 && rangs.length === dernier - premier + 1;
        })
        .map(([c]) => c),
    );
  }, [hydrates]);

  const tous = useMemo(
    () =>
      grouper(hydrates, !verrou).map((g) => ({
        g,
        statut: statutRecu(g, recurrents, anneeEnCours),
        manquants: g.sans ? [] : champsImportantsManquants(g.representant),
      })),
    [hydrates, verrou, recurrents, anneeEnCours],
  );

  const annees = useMemo(() => [...new Set(tous.map((x) => x.g.annee))].sort((a, b) => b - a), [tous]);

  // Le tableau de bord porte sur l'année choisie, la liste sur année + statut.
  const deLAnnee = tous.filter((x) => annee === "toutes" || x.g.annee === annee);
  const estIncomplet = (x: (typeof tous)[number]) => x.statut !== "envoye" && x.manquants.length > 0;
  // Recherche : chaque mot saisi doit se retrouver (sans accents ni majuscules) dans le
  // nom, l'adresse, le courriel, le n° de reçu, le montant ou la date d'un don du reçu.
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const correspond = (g: Groupe) => {
    if (mots.length === 0) return true;
    const r = g.representant;
    const texte = sansAccents(
      [
        nomAffiche(r), r.donateur_nom, r.donateur_prenom, r.raison_sociale, r.adresse, r.cp_ville, r.courriel,
        g.numero, g.annee, String(g.total).replace(".", ","), formatEuros(g.total),
        ...g.dons.flatMap((d) => [formatDate(d.date_don), String(d.montant).replace(".", ",")]),
      ].join(" "),
    );
    return mots.every((m) => texte.includes(m));
  };
  const filtres = deLAnnee.filter(
    (x) => (statut === "tous" || x.statut === statut) && (!incompletsSeuls || estIncomplet(x)) && correspond(x.g),
  );
  const affiches = !tri
    ? filtres
    : [...filtres].sort((a, b) => {
        const cle = (x: (typeof filtres)[number]): string | number =>
          tri.col === "annee" ? x.g.annee
          : tri.col === "donateur" ? sansAccents(nomAffiche(x.g.representant))
          : tri.col === "total" ? x.g.total
          : tri.col === "dons" ? x.g.dons.length
          : tri.col === "numero" ? x.g.numero ?? ""
          : LIBELLE[x.statut];
        const ka = cle(a), kb = cle(b);
        const c = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb), "fr");
        return tri.dir === "asc" ? c : -c;
      });
  /** Un reçu est téléchargeable s'il existe : numéroté, édité (pas seulement réservé), demandé. */
  const telechargeable = (g: Groupe) => !!g.numero && !g.reserve && !g.sans;
  const affichesTelechargeables = affiches.filter((x) => telechargeable(x.g));
  /** Reçus nouvellement établis, pas encore enregistrés (ZIP ou « Télécharger »). */
  const aTelecharger = (g: Groupe) => {
    const info = g.numero ? suivi.get(g.numero) : undefined;
    return telechargeable(g) && !!info && !info.telecharge_le;
  };
  const nouveaux = tous.map((x) => x.g).filter(aTelecharger);
  const trierPar = (col: ColTri) =>
    setTri((t) => (!t || t.col !== col ? { col, dir: "asc" } : t.dir === "asc" ? { col, dir: "desc" } : null));
  const enteteTri = (col: ColTri, libelle: string, alignement = "") => (
    <th
      className={`px-4 py-3 font-medium ${alignement}`}
      aria-sort={tri?.col === col ? (tri.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" onClick={() => trierPar(col)} className="inline-flex items-center gap-1 hover:text-foreground" title="Trier par cette colonne">
        {libelle}
        <span aria-hidden="true" className={tri?.col === col ? "text-accent" : "text-muted/50"}>
          {tri?.col === col ? (tri.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );

  const compte = (s: StatutRecu) => deLAnnee.filter((x) => x.statut === s).length;
  const somme = (s: StatutRecu) => deLAnnee.filter((x) => x.statut === s).reduce((t, x) => t + x.g.total, 0);
  const incomplets = deLAnnee.filter(estIncomplet).length;

  /** Ouvre la fiche d'un don (formulaire de l'onglet Dons) ; les manques sont surlignés. */
  const ouvrirFiche = (d: DonRow, signaler: boolean) => setFicheId({ id: d.id, signaler });

  const tuiles: { cle: StatutRecu; libelle: string; ton: string }[] = [
    { cle: "a_faire", libelle: "À établir", ton: "text-gold" },
    { cle: "attente", libelle: "Attente fin d'année", ton: "text-gold" },
    { cle: "edite", libelle: "Établis, à envoyer", ton: "text-accent" },
    { cle: "courrier", libelle: "Établis, à poster", ton: "text-emerald-600" },
    { cle: "envoye", libelle: "Envoyés", ton: "text-positive" },
    { cle: "sans", libelle: "Reçu non demandé", ton: "text-positive" },
  ];

  /** Note au registre que ces reçus ont été enregistrés (ils ne sont plus « à télécharger »). */
  async function marquerTelecharges(numeros: string[]) {
    if (numeros.length === 0) return;
    await createClient().from("recus").update({ telecharge_le: new Date().toISOString() }).in("recu_numero", numeros);
    router.refresh();
  }

  /** « PDF » ouvre le reçu dans un onglet ; « Télécharger » l'enregistre (nom de fichier complet). */
  async function telecharger(g: Groupe, ouvrir = true) {
    if (!g.numero) return;
    setMessage(null);
    setBusy(g.cle);
    try {
      await genererRecuPdf(
        donPourRecu(g.representant, g.dons, g.numero, dateEditionDuRecu(g)),
        { ouvrir },
      );
      if (!ouvrir) await marquerTelecharges([g.numero]);
    } catch (e) {
      setMessage({ ok: false, t: e instanceof Error ? e.message : "Génération impossible." });
    }
    setBusy(null);
  }

  /** Tous les dons (non supprimés) du même donateur que ce groupe. */
  const donsDuDonateur = (g: Groupe) => {
    const cle = cleDonateur(g.representant);
    return !verrou && cle && cle !== "|" ? hydrates.filter((d) => cleDonateur(d) === cle) : g.dons;
  };

  const ouvrirFicheDonateur = (g: Groupe) =>
    setFiche({ ids: new Set(donsDuDonateur(g).map((d) => d.id)), annee: g.annee });

  async function refuserRecu(g: Groupe) {
    const nom = nomAffiche(g.representant);
    if (!window.confirm(`${nom} ne demande pas de reçu fiscal ?\n\nSes dons sans reçu établi ne seront plus « à établir » (rubrique « Reçu non demandé »). Réversible : « Rétablir le reçu ».`)) return;
    setBusy(g.cle);
    const { error } = await createClient()
      .from("dons")
      .update({ envoi_prefere: "aucun" })
      .in("id", donsDuDonateur(g).map((d) => d.id));
    setBusy(null);
    setMessage(error ? { ok: false, t: error.message } : { ok: true, t: `${nom} : reçu non demandé (réversible depuis la rubrique « Reçu non demandé »).` });
    router.refresh();
  }

  /** Annule « reçu non demandé » : préférence de la fiche et anciennes mentions libres. */
  async function retablirRecu(g: Groupe) {
    const nom = nomAffiche(g.representant);
    setBusy(g.cle);
    const supabase = createClient();
    const motif = /pas de re[çc]u|sans re[çc]u|ne veut pas|non demand/i;
    const resultats = await Promise.all(
      donsDuDonateur(g).map((d) =>
        supabase
          .from("dons")
          .update({
            ...(d.envoi_prefere === "aucun" ? { envoi_prefere: null } : {}),
            ...(motif.test(d.recu_etat ?? "") ? { recu_etat: null } : {}),
            ...(motif.test(d.recu_numero ?? "") ? { recu_numero: null } : {}),
          })
          .eq("id", d.id),
      ),
    );
    setBusy(null);
    const erreur = resultats.find((x) => x.error)?.error;
    setMessage(erreur ? { ok: false, t: erreur.message } : { ok: true, t: `${nom} : le reçu fiscal est rétabli, ses dons redeviennent « à établir ».` });
    router.refresh();
  }

  /**
   * Établit un reçu à numéro réservé : le numéro est conservé, la date d'édition devient celle
   * d'aujourd'hui et le PDF s'ouvre. (Le PDF démarre d'abord, dans le geste du clic.)
   */
  async function editerReserve(g: Groupe) {
    if (!g.numero) return;
    const aujourdhui = todayISO();
    setMessage(null);
    setBusy(g.cle);
    const pdf = genererRecuPdf(donPourRecu(g.representant, g.dons, g.numero, aujourdhui), { ouvrir: true });
    const supabase = createClient();
    const { error } = await supabase.from("dons").update({ recu_emis_le: aujourdhui }).in("id", g.dons.map((d) => d.id));
    if (!error) await supabase.from("recus").update({ date_edition: aujourdhui, telecharge_le: null }).eq("recu_numero", g.numero);
    let erreurPdf: string | null = null;
    try {
      await pdf;
    } catch (e) {
      erreurPdf = e instanceof Error ? e.message : "Génération du PDF impossible.";
    }
    setBusy(null);
    setMessage(
      error
        ? { ok: false, t: "Édition non enregistrée : " + error.message }
        : { ok: !erreurPdf, t: erreurPdf ? `Reçu ${g.numero} établi, mais le PDF a échoué (${erreurPdf}) : utilisez « PDF ».` : `Reçu ${g.numero} établi le ${formatDate(aujourdhui)}.` },
    );
    router.refresh();
  }

  /** « Établir » : numéro réservé → date du jour ; sinon choix des dons et nouveau numéro. */
  const lancerEtablir = (g: Groupe) => (g.reserve ? void editerReserve(g) : setEtablir(g));

  /** Génère les PDF des reçus cochés et les remet dans un seul fichier ZIP. */
  async function telechargerLot(parmi?: Groupe[]) {
    const choisis = parmi ?? tous.map((x) => x.g).filter((g) => selection.has(g.cle) && telechargeable(g));
    if (choisis.length === 0) return;
    setMessage(null);
    setLot({ fait: 0, total: choisis.length });
    const echecs: string[] = [];
    const fichiers: { nom: string; octets: Uint8Array }[] = [];
    const generes: string[] = [];
    try {
      const modele = await modeleRecuEnCache(createClient());
      for (const g of choisis) {
        try {
          const don = donPourRecu(g.representant, g.dons, g.numero!, dateEditionDuRecu(g));
          fichiers.push({ nom: nomFichierRecu(don), octets: await construireRecuPdf(don, { modele }) });
          generes.push(g.numero!);
        } catch (e) {
          echecs.push(`${g.numero} (${e instanceof Error ? e.message : "erreur"})`);
        }
        setLot((l) => (l ? { ...l, fait: l.fait + 1 } : l));
      }
      if (fichiers.length > 0) {
        const blob = new Blob([creerZip(fichiers) as BlobPart], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reçus fiscaux - ${fichiers.length} reçu${fichiers.length > 1 ? "s" : ""} - ${todayISO()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        await marquerTelecharges(generes);
      }
      setMessage({
        ok: echecs.length === 0,
        t:
          `${fichiers.length} reçu${fichiers.length > 1 ? "s" : ""} téléchargé${fichiers.length > 1 ? "s" : ""} dans un fichier ZIP.` +
          (echecs.length ? ` Non générés : ${echecs.join(" ; ")}.` : ""),
      });
    } catch (e) {
      setMessage({ ok: false, t: e instanceof Error ? e.message : "Téléchargement par lot impossible." });
    }
    setLot(null);
  }

  async function annuler(g: Groupe) {
    if (!g.numero) return;
    if (!window.confirm(`Annuler le reçu ${g.numero} ? Ses dons redeviendront « à établir » ; le numéro ne sera jamais réattribué.`)) return;
    setBusy(g.cle);
    const { error } = await createClient().rpc("annuler_recu", { p_recu: g.numero });
    setBusy(null);
    setMessage(error ? { ok: false, t: error.message } : { ok: true, t: `Reçu ${g.numero} annulé.` });
    router.refresh();
  }

  return (
    <>
      {verrou && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm">
          <span className="text-gold">
            🔒 Coffre verrouillé — noms masqués, dons non regroupés par donateur, établissement des reçus indisponible.
          </span>
          <DeverrouillerCoffre />
        </div>
      )}

      {message && (
        <p
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${
            message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
          }`}
        >
          {message.t}
        </p>
      )}

      {/* Tableau de bord */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {tuiles.map((t) => (
          <button
            key={t.cle}
            type="button"
            onClick={() => {
              // Un filtre cliqué montre tous les reçus concernés : la recherche en cours est effacée.
              setRecherche("");
              setStatut(statut === t.cle ? "tous" : t.cle);
            }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              statut === t.cle ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"
            }`}
          >
            <div className="text-xs text-muted">{t.libelle}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${t.ton}`}>{compte(t.cle)}</div>
            <div className="text-xs text-muted tabular-nums">{formatEuros(somme(t.cle))}</div>
          </button>
        ))}
      </div>

      {incomplets > 0 && (
        <button
          type="button"
          onClick={() => {
            setRecherche("");
            setIncompletsSeuls((v) => !v);
          }}
          aria-pressed={incompletsSeuls}
          className={`mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm text-gold transition-colors ${
            incompletsSeuls ? "border-gold bg-gold-soft" : "border-gold/60 bg-gold-soft/50 hover:bg-gold-soft"
          }`}
        >
          <span>
            {incomplets} reçu{incomplets > 1 ? "s" : ""} à compléter : adresse, code postal ou courriel manquant (⚠).
          </span>
          <span className="text-xs font-medium underline">
            {incompletsSeuls ? "Afficher tous les reçus" : "Voir les reçus concernés"}
          </span>
        </button>
      )}

      {/* Recherche et filtres */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un donateur, un n° de reçu, une ville, un montant…"
          aria-label="Rechercher dans les reçus fiscaux"
          className={`${inputCls} max-w-md flex-1`}
        />
        {recherche && (
          <button type="button" onClick={() => setRecherche("")} className="text-xs text-muted underline hover:text-foreground">
            Effacer
          </button>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted">Année</span>
          {(["toutes", ...annees] as (number | "toutes")[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnnee(a)}
              className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums ${
                annee === a ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"
              }`}
            >
              {a === "toutes" ? "Toutes" : a}
            </button>
          ))}
        </div>
        {incompletsSeuls && (
          <span className="text-sm text-gold">
            Reçus incomplets uniquement{verrou ? "" : " — cliquez sur une ligne pour ouvrir la fiche Reçu fiscal du donateur"}
          </span>
        )}
        {statut !== "tous" && (
          <button type="button" onClick={() => setStatut("tous")} className="text-sm text-accent hover:underline">
            Afficher tous les statuts
          </button>
        )}
        <span className="ml-auto text-sm text-muted">
          {affiches.length} reçu{affiches.length > 1 ? "s" : ""} affiché{affiches.length > 1 ? "s" : ""}
        </span>
      </div>

      {!verrou && (affichesTelechargeables.length > 0 || selection.size > 0 || nouveaux.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-2.5 text-sm">
          <span className="font-medium">
            {selection.size} reçu{selection.size > 1 ? "s" : ""} sélectionné{selection.size > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setSelection((p) => new Set([...p, ...affichesTelechargeables.map((x) => x.g.cle)]))}
            disabled={affichesTelechargeables.length === 0}
            className="text-accent hover:underline disabled:opacity-50"
            title="Ajoute à la sélection tous les reçus affichés (selon les filtres) qui peuvent être téléchargés"
          >
            Sélectionner les {affichesTelechargeables.length} reçu{affichesTelechargeables.length > 1 ? "s" : ""} affiché{affichesTelechargeables.length > 1 ? "s" : ""}
          </button>
          {selection.size > 0 && (
            <button type="button" onClick={() => setSelection(new Set())} className="text-muted hover:text-foreground hover:underline">
              Tout désélectionner
            </button>
          )}
          {nouveaux.length > 0 && (
            <button
              type="button"
              onClick={() => void telechargerLot(nouveaux)}
              disabled={lot !== null}
              className="rounded-lg border border-accent px-3 py-1.5 font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
              title="Génère les reçus établis qui n'ont pas encore été enregistrés et les télécharge dans un ZIP"
            >
              {lot && lot.total === nouveaux.length ? `Génération… ${lot.fait}/${lot.total}` : `Télécharger les ${nouveaux.length} nouveau${nouveaux.length > 1 ? "x" : ""} reçu${nouveaux.length > 1 ? "s" : ""}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => void telechargerLot()}
            disabled={selection.size === 0 || lot !== null}
            className="ml-auto rounded-lg bg-accent px-4 py-1.5 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            title="Génère les PDF des reçus sélectionnés et les télécharge dans un seul fichier ZIP"
          >
            {lot ? `Génération… ${lot.fait}/${lot.total}` : "Télécharger la sélection (ZIP)"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="w-8 px-3 py-3">
                {!verrou && (
                  <input
                    type="checkbox"
                    aria-label="Sélectionner les reçus affichés"
                    title="Sélectionner (ou désélectionner) tous les reçus affichés qui peuvent être téléchargés"
                    checked={affichesTelechargeables.length > 0 && affichesTelechargeables.every((x) => selection.has(x.g.cle))}
                    disabled={affichesTelechargeables.length === 0}
                    onChange={(e) =>
                      setSelection((p) => {
                        const n = new Set(p);
                        for (const x of affichesTelechargeables) {
                          if (e.target.checked) n.add(x.g.cle);
                          else n.delete(x.g.cle);
                        }
                        return n;
                      })
                    }
                  />
                )}
              </th>
              {enteteTri("annee", "Année")}
              {enteteTri("donateur", "Donateur")}
              {enteteTri("total", "Total", "text-right")}
              {enteteTri("dons", "Dons", "text-center")}
              {enteteTri("numero", "N° reçu")}
              {enteteTri("statut", "Statut")}
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {affiches.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted">Aucun reçu pour ce filtre.</td>
              </tr>
            ) : (
              affiches.map(({ g, statut: st, manquants }) => {
                const aCompleter = st !== "envoye" && manquants.length > 0 && !verrou;
                return (
                <Fragment key={g.cle}>
                <tr
                  data-groupe={g.cle}
                  onClick={verrou ? undefined : (e) => { if (!(e.target as HTMLElement).closest("button, a, input")) ouvrirFicheDonateur(g); }}
                  title={verrou ? undefined : aCompleter ? "Cliquer pour ouvrir la fiche Reçu fiscal du donateur et compléter : " + manquants.join(", ") : "Cliquer pour ouvrir la fiche Reçu fiscal du donateur"}
                  className={`${verrou ? "" : "cursor-pointer hover:bg-surface-2"} ${ouverts.has(g.cle) ? "" : "border-b border-border last:border-0"}`}
                >
                  <td className="w-8 px-3 py-3">
                    {!verrou && (
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner le reçu ${g.numero ?? ""}`}
                        checked={selection.has(g.cle)}
                        disabled={!telechargeable(g)}
                        title={telechargeable(g) ? "Sélectionner pour un téléchargement par lot" : "Pas de reçu édité à télécharger"}
                        onChange={(e) =>
                          setSelection((p) => {
                            const n = new Set(p);
                            if (e.target.checked) n.add(g.cle);
                            else n.delete(g.cle);
                            return n;
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <button
                      type="button"
                      onClick={() => basculer(g.cle)}
                      aria-expanded={ouverts.has(g.cle)}
                      aria-label={ouverts.has(g.cle) ? "Replier les dons" : "Voir les dons"}
                      title={ouverts.has(g.cle) ? "Replier les dons" : "Voir les dons de ce reçu"}
                      className="-ml-1 mr-1 inline-block w-5 rounded text-muted hover:bg-surface-2 hover:text-foreground"
                    >
                      {ouverts.has(g.cle) ? "▾" : "▸"}
                    </button>
                    {g.annee}
                  </td>
                  <td className="px-4 py-3">
                    {nomAffiche(g.representant)}
                    {prefereCourrier(g.representant) && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">courrier postal</span>}
                    {aCompleter && <div className="text-xs text-gold">Manque : {manquants.join(", ")}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatEuros(g.total)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted">{g.dons.length}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {g.numero ?? "—"}
                    {g.reserve && <div className="text-[10px] text-muted">réservé, pas encore édité</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TON[st]}`}>
                      {LIBELLE[st]}
                    </span>
                    {st !== "envoye" && manquants.length > 0 && (
                      <span className="ml-1.5 text-gold" title={"Manque : " + manquants.join(", ")}>
                        ⚠
                      </span>
                    )}
                    {aTelecharger(g) && (
                      <span className="ml-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent" title="Reçu établi, pas encore enregistré : « Télécharger les nouveaux reçus »">
                        à télécharger
                      </span>
                    )}
                    {g.aScinder && (
                      <span className="ml-1.5 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold" title="Ce numéro couvre plusieurs années civiles : un reçu ne doit couvrir qu'une année. À scinder.">
                        à scinder
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {verrou ? (
                      <span className="text-xs text-muted">🔒</span>
                    ) : g.numero && !g.reserve ? (
                      <span className="inline-flex items-center gap-3 text-xs">
                        <button type="button" onClick={() => telecharger(g)} disabled={busy === g.cle} className="text-accent hover:underline disabled:opacity-50" title="Ouvrir le reçu dans un onglet">
                          PDF
                        </button>
                        {(st === "edite" || st === "courrier") && (
                          <>
                            <button type="button" onClick={() => setEnvoi(g)} disabled={busy === g.cle} className="text-positive hover:underline disabled:opacity-50">
                              Marquer envoyé
                            </button>
                            <button type="button" onClick={() => annuler(g)} disabled={busy === g.cle} className="text-muted hover:text-negative disabled:opacity-50">
                              Annuler
                            </button>
                          </>
                        )}
                        {st === "envoye" && (
                          <button type="button" onClick={() => setEnvoi(g)} className="text-muted hover:text-foreground hover:underline">
                            Modifier l&apos;envoi
                          </button>
                        )}
                      </span>
                    ) : g.sans ? (
                      <button type="button" onClick={() => retablirRecu(g)} disabled={busy === g.cle} className="text-xs text-accent hover:underline disabled:opacity-50">
                        Rétablir le reçu
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-3">
                        <button type="button" onClick={() => refuserRecu(g)} disabled={busy === g.cle} className="text-xs text-muted hover:text-foreground hover:underline disabled:opacity-50" title="Ce donateur ne demande pas de reçu fiscal">
                          Reçu non demandé
                        </button>
                        <button
                          type="button"
                          onClick={() => lancerEtablir(g)}
                          className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:opacity-90"
                        >
                          {st === "attente" ? "Reçu intermédiaire" : "Établir le reçu"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
                {ouverts.has(g.cle) && (
                  <tr data-groupe={g.cle} className="border-b border-border bg-surface-2/40 last:border-0">
                    <td colSpan={8} className="px-4 py-2 pl-10">
                      <ul className="divide-y divide-border/60">
                        {g.dons.map((d) => {
                          const manque = st !== "envoye" ? champsImportantsManquants(d) : [];
                          return (
                            <li
                              key={d.id}
                              onClick={(e) => { if (!verrou && !(e.target as HTMLElement).closest("button, a")) ouvrirFiche(d, manque.length > 0); }}
                              title={verrou ? undefined : "Cliquer pour ouvrir la fiche de ce don"}
                              className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-sm ${verrou ? "" : "cursor-pointer hover:bg-surface-2"}`}
                            >
                              <span className="w-24 tabular-nums">{formatDate(d.date_don)}</span>
                              <span className="w-24 text-right font-medium tabular-nums">{formatEuros(Number(d.montant))}</span>
                              <span className="w-28 text-muted">{d.mode_paiement ?? "—"}</span>
                              {d.operation_id ? (
                                <span
                                  className="rounded-full bg-positive/15 px-2 py-0.5 text-xs text-positive"
                                  title={d.operation?.date_operation ? `Relié à la comptabilité (encaissé le ${formatDate(d.operation.date_operation)})` : "Relié à la comptabilité"}
                                >
                                  compta{d.operation?.date_operation ? ` · ${formatDate(d.operation.date_operation)}` : ""}
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted" title="Don saisi à la main, sans écriture de comptabilité reliée">
                                  hors compta
                                </span>
                              )}
                              {manque.length > 0 && <span className="text-xs text-gold">⚠ manque : {manque.join(", ")}</span>}
                              {!verrou && (
                                <span className="ml-auto inline-flex items-center gap-3 text-xs">
                                  <button type="button" onClick={() => ouvrirFiche(d, manque.length > 0)} className="text-accent hover:underline">
                                    Fiche
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReattribuer({ don: d, statut: g.numero ? (st === "envoye" ? "envoye" : "edite") : null })}
                                    className="text-muted hover:text-foreground hover:underline"
                                  >
                                    Réattribuer
                                  </button>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {fiche && (() => {
        const donsFiche = hydrates.filter((d) => fiche.ids.has(d.id));
        if (donsFiche.length === 0) return null;
        return (
          <FicheRecuDonateur
            entrees={tous.filter((x) => x.g.dons.some((d) => fiche.ids.has(d.id))).map(({ g, statut: st }) => ({ g, statut: st }))}
            dons={donsFiche}
            suivi={suivi}
            anneeCible={fiche.annee}
            actions={{
              etablir: lancerEtablir,
              envoi: setEnvoi,
              pdf: (g) => telecharger(g),
              telecharger: (g) => telecharger(g, false),
              annuler,
              refuser: refuserRecu,
              retablir: retablirRecu,
              modifierDon: (d, signaler) => ouvrirFiche(d, signaler),
              reattribuer: (d, g, st) => setReattribuer({ don: d, statut: g.numero ? (st === "envoye" ? "envoye" : "edite") : null }),
            }}
            onFermer={() => setFiche(null)}
            onChange={(ok, t) => {
              setMessage({ ok, t });
              router.refresh();
            }}
          />
        );
      })()}

      {envoi && (
        <EnvoiRecu
          groupe={envoi}
          suivi={suivi.get(envoi.numero ?? "")}
          onFermer={() => setEnvoi(null)}
          onFait={(t) => {
            setEnvoi(null);
            setMessage({ ok: true, t });
            router.refresh();
          }}
        />
      )}

      {reattribuer && (
        <ReattribuerDon
          don={reattribuer.don}
          dons={hydrates}
          statutRecu={reattribuer.statut}
          onFermer={() => setReattribuer(null)}
          onFait={(t) => {
            setReattribuer(null);
            setMessage({ ok: true, t });
            router.refresh();
          }}
        />
      )}

      {/* Fiche d'un don : le formulaire de l'onglet Dons, ouvert ici en fenêtre. */}
      {ficheId && (
        <GestionDons
          dons={dons}
          ouvrirId={ficheId.id}
          signalerManques={ficheId.signaler}
          onFermer={() => setFicheId(null)}
        />
      )}

      {etablir && (
        <EtablirRecu
          groupe={etablir}
          manquants={champsImportantsManquants(etablir.representant)}
          onFermer={() => setEtablir(null)}
          onFait={(t) => {
            setEtablir(null);
            setMessage({ ok: true, t });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Établissement d'un reçu : les dons de l'année encore sans reçu de ce
 * donateur, cochés par défaut. En décocher permet un reçu partiel (un reçu par
 * don, ou un reçu intermédiaire) ; les dons laissés iront sur le reçu suivant.
 * Le numéro est attribué par la base, au moment de valider.
 */
function EtablirRecu({
  groupe,
  manquants,
  onFermer,
  onFait,
}: {
  groupe: Groupe;
  manquants: string[];
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [coches, setCoches] = useState<Set<string>>(new Set(groupe.dons.map((d) => d.id)));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const retenus = groupe.dons.filter((d) => coches.has(d.id));
  const total = retenus.reduce((s, d) => s + Number(d.montant), 0);
  const lignes = syntheseVersements(retenus.map((d) => ({ date: d.date_don, montant: Number(d.montant), mode: d.mode_paiement })));
  const partiel = retenus.length < groupe.dons.length;

  async function valider() {
    if (retenus.length === 0) return setErreur("Cochez au moins un don.");
    setErreur(null);
    setBusy(true);
    const date = todayISO();
    const { data, error } = await createClient().rpc("etablir_recu", {
      p_dons: retenus.map((d) => d.id),
      p_date: date,
    });
    if (error || !data) {
      setBusy(false);
      return setErreur("Établissement impossible : " + (error?.message ?? "réponse vide"));
    }
    const numero = data as string;
    try {
      await genererRecuPdf(donPourRecu(groupe.representant, retenus, numero, date), { ouvrir: true });
    } catch (e) {
      setBusy(false);
      return onFait(`Reçu ${numero} établi, mais le PDF n'a pas pu être généré (${e instanceof Error ? e.message : "erreur"}) : utilisez « PDF » dans la liste.`);
    }
    setBusy(false);
    onFait(`Reçu ${numero} établi (${formatEuros(total)}) et téléchargé.`);
  }

  return (
    <Modal title={`Établir le reçu ${groupe.annee} — ${nomAffiche(groupe.representant)}`} onClose={onFermer}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Dons {groupe.annee} de ce donateur sans reçu. Décochez-en pour un reçu partiel : ils resteront pour le reçu suivant.
        </p>

        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {groupe.dons.map((d) => (
            <li key={d.id}>
              <label className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-surface-2">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coches.has(d.id)}
                    onChange={(e) =>
                      setCoches((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(d.id);
                        else n.delete(d.id);
                        return n;
                      })
                    }
                  />
                  <span className="tabular-nums">{formatDate(d.date_don)}</span>
                  <span className="text-muted">{d.mode_paiement ?? ""}</span>
                </span>
                <span className="tabular-nums">{formatEuros(Number(d.montant))}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Tel qu&apos;imprimé sur le reçu</div>
          {lignes.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 text-xs">
              <span>{l.libelle}</span>
              <span className="tabular-nums">{formatEuros(l.montant)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatEuros(total)}</span>
          </div>
        </div>

        {partiel && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
            Reçu partiel : {groupe.dons.length - retenus.length} don(s) resteront à inclure dans un prochain reçu.
          </p>
        )}
        {manquants.length > 0 && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
            Fiche incomplète ({manquants.join(", ")}) : complétez-la dans l&apos;onglet Dons avant d&apos;envoyer le reçu.
          </p>
        )}
        <p className="text-xs text-muted">
          Le numéro suivant sera attribué automatiquement (format RE_000NNN_AAAAMMJJ, date du premier don) et le PDF téléchargé.
        </p>
        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
            Fermer
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={busy || retenus.length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Établissement…" : `Établir le reçu (${formatEuros(total)})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Envoi d'un reçu : date et moyen réellement utilisé. Le moyen proposé est la
 * préférence de la fiche du donateur ; il peut différer d'un envoi à l'autre.
 */
function EnvoiRecu({
  groupe,
  suivi,
  onFermer,
  onFait,
}: {
  groupe: Groupe;
  suivi: RecuInfo | undefined;
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const dejaEnvoye = groupe.dons.every(recuEnvoye);
  const [moyen, setMoyen] = useState<string>(suivi?.envoi_mode ?? (prefereCourrier(groupe.representant) ? "courrier" : "courriel"));
  const [date, setDate] = useState(suivi?.envoye_le ?? todayISO());
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(annulerEnvoi: boolean) {
    if (!groupe.numero) return;
    setBusy(true);
    setErreur(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("recus")
      .update(annulerEnvoi ? { envoye_le: null, envoi_mode: null } : { envoye_le: date, envoi_mode: moyen })
      .eq("recu_numero", groupe.numero)
      .select("recu_numero");
    if (error || !data || data.length === 0) {
      setBusy(false);
      return setErreur("Enregistrement impossible : " + (error?.message ?? "reçu absent du registre"));
    }
    const { error: errDons } = await supabase
      .from("dons")
      .update({ recu_etat: annulerEnvoi ? null : etatEnvoye(formatDate(date), moyen) })
      .in("id", groupe.dons.map((d) => d.id));
    setBusy(false);
    if (errDons) return setErreur("Reçu enregistré, mais l'état des dons n'a pas pu être mis à jour : " + errDons.message);
    onFait(annulerEnvoi ? `Envoi du reçu ${groupe.numero} annulé.` : `Reçu ${groupe.numero} marqué envoyé le ${formatDate(date)} (${libelleMoyen(moyen)}).`);
  }

  return (
    <Modal title={`${dejaEnvoye ? "Envoi du reçu" : "Marquer le reçu envoyé"} ${groupe.numero ?? ""}`} onClose={onFermer}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          {nomAffiche(groupe.representant)} — {formatEuros(groupe.total)} ({groupe.dons.length} don{groupe.dons.length > 1 ? "s" : ""}, {groupe.annee}).
          {prefereCourrier(groupe.representant) ? " Ce donateur préfère le courrier postal." : ""}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Envoyé par">
            <select value={moyen} onChange={(e) => setMoyen(e.target.value)} className={inputCls}>
              {MOYENS_ENVOI.map((m) => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </select>
          </Field>
          <Field label="Date d'envoi">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {dejaEnvoye ? (
            <button type="button" onClick={() => enregistrer(true)} disabled={busy} className="text-xs text-muted hover:text-negative disabled:opacity-50">
              Annuler l&apos;envoi
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" onClick={onFermer} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
              Fermer
            </button>
            <button type="button" onClick={() => enregistrer(false)} disabled={busy || !date} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
