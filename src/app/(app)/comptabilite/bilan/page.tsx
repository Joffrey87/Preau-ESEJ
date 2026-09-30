import Link from "next/link";
import BilanToolbar from "@/components/BilanToolbar";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";
import {
  bornesPeriode,
  moisPrecedentISO,
  fractionAnneeEcoulee,
  formatPct,
  type Periode,
} from "@/lib/bilan";
import { sansLignesVentilees, toutesLesOperations } from "@/lib/operations";
import { regleDesFamilles } from "@/lib/regleScolarite";

type Op = {
  date_operation: string; montant: number; type: "recette" | "depense";
  id: string; categorie_id: string | null; exercice_id: string | null;
  parent_id: string | null; est_ventilee: boolean;
};
type Exo = { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean };
type Cat = { id: string; nom: string; type: "recette" | "depense" };
type Bl = { categorie_id: string; montant_prevu: number };
type Ligne = { nom: string; type: "recette" | "depense"; periode: number; cumul: number; budget: number };

// Palette « thème clair » figée (le document reste identique en clair/sombre et à l'impression).
const C = {
  marine: "#021d51", gold: "#c8952f", cream: "#f7f3ea", white: "#ffffff",
  border: "#e6dfce", ink: "#14213d", muted: "#6b7280",
  green: "#15803d", red: "#c0392b",
  greenBg: "#e8f2ea", redBg: "#fbece9", goldBg: "#f7edd4", marineBg: "#e7ebf4",
};

const groupeNom = (nom: string) => {
  const i = nom.indexOf(":");
  return (i === -1 ? nom : nom.slice(0, i)).trim();
};

export default async function BilanPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; ref?: string; exercice?: string }>;
}) {
  const sp = await searchParams;
  const periode: Periode = sp.periode === "trimestre" || sp.periode === "annee" ? sp.periode : "mois";
  const ref = sp.ref && /^\d{4}-\d{2}-\d{2}$/.test(sp.ref) ? sp.ref : moisPrecedentISO();

  const supabase = await createClient();
  const opsP = toutesLesOperations<Op>(supabase, "id, date_operation, montant, type, categorie_id, exercice_id, parent_id, est_ventilee");
  const [exercicesRes, catsRes, comptesRes, donsRes, scoAnneeRes, orgRes] = await Promise.all([
    supabase
      .from("exercices")
      .select("id, libelle, date_debut, date_fin, actif")
      .order("date_debut", { ascending: false }),
    supabase.from("categories").select("id, nom, type"),
    supabase.from("comptes").select("solde_initial").eq("archive", false),
    supabase.from("dons").select("montant, date_don"),
    supabase.from("scolarite_inscriptions").select("annee_scolaire").order("annee_scolaire", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("organisation").select("denomination, adresse, code_postal, ville").limit(1).maybeSingle(),
  ]);
  // Le bilan se construit sur les SOUS-ÉCRITURES lorsqu'il y en a : leurs
  // catégories décrivent la réalité mieux que celle de la ligne bancaire.
  // Une ligne détaillée est donc écartée, qu'elle porte l'indicateur ou non —
  // la présence de filles fait foi.
  const ops = sansLignesVentilees(await opsP);

  const exercices = (exercicesRes.data ?? []) as Exo[];

  // Onglet « Exercice » : on choisit un exercice, pas une date de référence.
  // Onglets « Mois » / « Trimestre » : la date de référence délimite la période,
  // et l'exercice qui la contient sert au cumul.
  const exo: Exo | null =
    periode === "annee"
      ? (exercices.find((e) => e.id === sp.exercice) ??
         exercices.find((e) => e.actif) ??
         exercices[0] ??
         null)
      : null;
  const bornes =
    periode === "annee" && exo
      ? { debut: exo.date_debut, fin: exo.date_fin, libelle: exo.libelle }
      : bornesPeriode(periode, ref);
  const exercice: Exo | null =
    exo ??
    exercices.find((e) => e.date_debut <= bornes.fin && bornes.fin <= e.date_fin) ??
    exercices.find((e) => e.date_debut <= bornes.debut && bornes.debut <= e.date_fin) ??
    null;

  const budgetRes = exercice
    ? await supabase.from("budget_lignes").select("categorie_id, montant_prevu").eq("exercice_id", exercice.id)
    : { data: [] as Bl[] };

  const cats = (catsRes.data ?? []) as Cat[];
  const catById = new Map(cats.map((c) => [c.id, c]));
  const soldeInitial = (comptesRes.data ?? []).reduce((s, c) => s + Number(c.solde_initial), 0);

  // Agrégation par GRAND POSTE (nom avant « : »).
  const agg = new Map<string, Ligne>();
  const ligne = (nom: string, type: "recette" | "depense") => {
    const key = `${type}|${nom}`;
    let l = agg.get(key);
    if (!l) { l = { nom, type, periode: 0, cumul: 0, budget: 0 }; agg.set(key, l); }
    return l;
  };
  for (const bl of (budgetRes.data ?? []) as Bl[]) {
    const c = catById.get(bl.categorie_id);
    if (c) ligne(groupeNom(c.nom), c.type).budget += Number(bl.montant_prevu);
  }
  for (const op of ops) {
    const c = catById.get(op.categorie_id ?? "");
    // Classement par SENS RÉEL de l'opération (cohérent avec la trésorerie et l'accueil).
    const l = ligne(c ? groupeNom(c.nom) : "Non catégorisé", op.type);
    const d = op.date_operation;
    // Appartenance à l'exercice : le champ `exercice_id` prime sur la date, car
    // une opération peut être rattachée à un exercice qui ne couvre pas sa date.
    const dansExercice = !!exercice && op.exercice_id === exercice.id;

    if (periode === "annee") {
      // Bilan d'exercice : uniquement l'appartenance, sans filtre de date.
      if (dansExercice) l.periode += Number(op.montant);
    } else {
      if (d >= bornes.debut && d <= bornes.fin) l.periode += Number(op.montant);
      if (dansExercice && d <= bornes.fin) l.cumul += Number(op.montant);
    }
  }
  const lignes = [...agg.values()].filter((l) => l.periode || l.cumul || l.budget);
  const cle = (l: Ligne) => (periode === "annee" ? l.periode : l.cumul);
  const recettes = lignes.filter((l) => l.type === "recette").sort((a, b) => cle(b) - cle(a));
  const depenses = lignes.filter((l) => l.type === "depense").sort((a, b) => cle(b) - cle(a));

  const somme = (arr: Ligne[], k: "periode" | "cumul" | "budget") => arr.reduce((s, l) => s + l[k], 0);
  const recP = somme(recettes, "periode"), depP = somme(depenses, "periode");
  const recC = somme(recettes, "cumul"), depC = somme(depenses, "cumul");
  const budDep = somme(depenses, "budget"), budRec = somme(recettes, "budget");
  const modeExercice = periode === "annee";
  const resultatPeriode = recP - depP;
  const resultatExo = modeExercice ? resultatPeriode : recC - depC;
  const tresorerie = soldeInitial + ops.filter((o) => o.date_operation <= bornes.fin)
    .reduce((s, o) => s + (o.type === "recette" ? 1 : -1) * Number(o.montant), 0);
  const budgetConsomme = budDep > 0 ? ((modeExercice ? depP : depC) / budDep) * 100 : null;

  // Scolarité
  const anneeSco = (scoAnneeRes.data as { annee_scolaire: string } | null)?.annee_scolaire ?? null;
  // Dû et réglé par famille : calcul commun (lib/regleScolarite).
  const sco = anneeSco ? await regleDesFamilles(supabase, anneeSco) : [];
  const scoDu = sco.reduce((s, r) => s + r.du, 0);
  const scoRegle = sco.reduce((s, r) => s + r.regle, 0);
  const scoReste = scoDu - scoRegle;
  const scoFamillesReste = sco.filter((r) => r.du - r.regle > 0.005).length;

  // Dons
  const dons = (donsRes.data ?? []) as { montant: number; date_don: string }[];
  const anneeCiv = Number(bornes.fin.slice(0, 4));
  const donsPeriode = dons.filter((d) => d.date_don >= bornes.debut && d.date_don <= bornes.fin).reduce((s, d) => s + Number(d.montant), 0);
  const parAnnee = new Map<number, number>();
  for (const d of dons) { const y = Number(d.date_don.slice(0, 4)); parAnnee.set(y, (parAnnee.get(y) ?? 0) + Number(d.montant)); }
  const cumulAnneeCiv = dons.filter((d) => d.date_don >= `${anneeCiv}-01-01` && d.date_don <= bornes.fin).reduce((s, d) => s + Number(d.montant), 0);
  const estimationDons = cumulAnneeCiv / fractionAnneeEcoulee(bornes.fin);
  const anneesPrec = [anneeCiv - 1, anneeCiv - 2].filter((y) => parAnnee.has(y));

  const org = orgRes.data as { denomination: string | null; adresse: string | null; code_postal: string | null; ville: string | null } | null;
  const editionLe = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const colReal = modeExercice ? "Réalisé exercice" : "Réalisé période";

  const carte = (label: string, valeur: string, couleur: string, bg: string) => (
    <div key={label} style={{ background: bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 19, fontWeight: 600, color: couleur }}>{valeur}</div>
    </div>
  );

  const th: React.CSSProperties = { padding: "7px 10px", fontSize: 11, fontWeight: 600, color: C.white, textAlign: "right" };
  const td: React.CSSProperties = { padding: "5px 10px", fontSize: 12.5, color: C.ink, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  const tableResultat = (titre: string, rows: Ligne[], tp: number, tc: number, tb: number, accent: string) => (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.marine }}>
            <th style={{ ...th, textAlign: "left" }}>{titre}</th>
            <th style={th}>{colReal}</th>
            {!modeExercice && <th style={th}>Cumul exercice</th>}
            <th style={th}>Budget</th>
            <th style={{ ...th, width: 56 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={modeExercice ? 4 : 5} style={{ ...td, textAlign: "center", color: C.muted }}>Aucun mouvement.</td></tr>
          ) : rows.map((l, i) => {
            const reel = modeExercice ? l.periode : l.cumul;
            const pct = l.budget ? (reel / l.budget) * 100 : null;
            const pctColor = l.type === "depense" && pct !== null ? (pct > 100 ? C.red : pct > 90 ? C.gold : C.green) : C.muted;
            return (
              <tr key={l.nom} style={{ background: i % 2 ? C.cream : C.white }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>{l.nom}</td>
                <td style={td}>{formatEuros(l.periode)}</td>
                {!modeExercice && <td style={td}>{formatEuros(l.cumul)}</td>}
                <td style={{ ...td, color: C.muted }}>{l.budget ? formatEuros(l.budget) : "—"}</td>
                <td style={{ ...td, fontWeight: 600, color: pctColor }}>{pct !== null ? formatPct(pct) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: accent, fontWeight: 700 }}>
            <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>Total</td>
            <td style={{ ...td, fontWeight: 700 }}>{formatEuros(tp)}</td>
            {!modeExercice && <td style={{ ...td, fontWeight: 700 }}>{formatEuros(tc)}</td>}
            <td style={{ ...td, fontWeight: 700 }}>{tb ? formatEuros(tb) : "—"}</td>
            <td style={{ ...td, fontWeight: 700 }}>
              {tb ? formatPct(((modeExercice ? tp : tc) / tb) * 100) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.gold };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <style>{`@media print{
        aside,.no-print{display:none!important}
        html,body{background:#fff!important}
        #bilan-doc{border:none!important;box-shadow:none!important;margin:0!important;border-radius:0!important}
        @page{margin:12mm}
      }
      #bilan-doc{-webkit-print-color-adjust:exact;print-color-adjust:exact}`}</style>

      <div className="no-print mb-4">
        <Link href="/comptabilite" className="text-sm text-accent hover:underline">← Retour à la comptabilité</Link>
      </div>
      <BilanToolbar
        periode={periode}
        refMois={ref.slice(0, 7)}
        exercices={exercices.map((e) => ({ id: e.id, libelle: e.libelle }))}
        exerciceId={exercice?.id ?? null}
      />

      <div id="bilan-doc" style={{ background: C.cream, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        {/* En-tête marine */}
        <div style={{ background: C.marine, borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 600 }}>{org?.denomination ?? "ARIL"}</div>
            <div style={{ color: "#b9c3dd", fontSize: 11, marginTop: 2 }}>
              {[org?.adresse, [org?.code_postal, org?.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Bilan financier</div>
            <div style={{ color: C.white, fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>{bornes.libelle}</div>
            <div style={{ color: "#b9c3dd", fontSize: 10.5 }}>Édité le {editionLe}</div>
          </div>
        </div>

        {/* Synthèse */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${modeExercice ? 3 : 4},1fr)`, gap: 8, margin: "14px 0 16px" }}>
          {!modeExercice &&
            carte("Résultat de la période", `${resultatPeriode >= 0 ? "+" : ""}${formatEuros(resultatPeriode)}`, resultatPeriode < 0 ? C.red : C.green, resultatPeriode < 0 ? C.redBg : C.greenBg)}
          {carte("Trésorerie à date", formatEuros(tresorerie), tresorerie < 0 ? C.red : C.green, tresorerie < 0 ? C.redBg : C.greenBg)}
          {carte("Résultat de l'exercice", `${resultatExo >= 0 ? "+" : ""}${formatEuros(resultatExo)}`, resultatExo < 0 ? C.red : C.green, C.marineBg)}
          {carte("Budget dépenses consommé", formatPct(budgetConsomme), (budgetConsomme ?? 0) > 100 ? C.red : C.ink, C.goldBg)}
        </div>

        {/* Compte de résultat */}
        <h2 style={h2}>Compte de résultat · {exercice?.libelle ?? ""}</h2>
        {tableResultat("Recettes", recettes, recP, recC, budRec, C.greenBg)}
        {tableResultat("Dépenses", depenses, depP, depC, budDep, C.redBg)}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: resultatPeriode < 0 ? C.redBg : C.greenBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 14px", margin: "4px 0 16px" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Résultat net {periode === "annee" ? "de l'exercice" : "de la période"}</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: resultatPeriode < 0 ? C.red : C.green }}>
            {resultatPeriode >= 0 ? "+" : ""}{formatEuros(resultatPeriode)}
          </span>
        </div>

        {/* Scolarité + Dons côte à côte */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <h2 style={h2}>Frais de scolarité {anneeSco ? `· ${anneeSco}` : ""}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {carte("Total dû", formatEuros(scoDu), C.ink, C.white)}
              {carte("Réglé à ce jour", formatEuros(scoRegle), C.green, C.greenBg)}
              {carte("Reste à percevoir", formatEuros(scoReste), scoReste > 0 ? C.red : C.green, scoReste > 0 ? C.redBg : C.greenBg)}
              {carte("Familles avec reste", `${scoFamillesReste} / ${sco.length}`, C.ink, C.white)}
            </div>
          </div>
          <div>
            <h2 style={h2}>Dons &amp; mécénat</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {carte("Dons de la période", formatEuros(donsPeriode), C.ink, C.white)}
              {carte(`Cumul ${anneeCiv}`, formatEuros(cumulAnneeCiv), C.ink, C.marineBg)}
              {carte(`Estimation ${anneeCiv}`, formatEuros(estimationDons), C.gold, C.goldBg)}
              {carte("Années précédentes", anneesPrec.length ? anneesPrec.map((y) => `${y}: ${formatEuros(parAnnee.get(y) ?? 0)}`).join("  ") : "—", C.ink, C.white)}
            </div>
          </div>
        </div>

        <p style={{ marginTop: 16, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 10.5, color: C.muted }}>
          Document de gestion interne établi par le trésorier de l&apos;ARIL.{" "}
          {modeExercice
            ? "Les montants retenus sont ceux des opérations rattachées à cet exercice, indépendamment de leur date."
            : "« Cumul exercice » = opérations rattachées à l'exercice, jusqu'à la fin de la période."}{" "}
          Postes regroupés par grande rubrique budgétaire.
        </p>
      </div>
    </div>
  );
}
