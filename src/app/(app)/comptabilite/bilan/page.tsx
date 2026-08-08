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
import { toutesLesOperations } from "@/lib/operations";

type Op = { date_operation: string; montant: number; type: "recette" | "depense"; categorie_id: string | null };
type Cat = { id: string; nom: string; type: "recette" | "depense" };
type Bl = { categorie_id: string; montant_prevu: number };
type Sco = {
  montant_mensuel: number | null; avance: number | null;
  m_sept: number | null; m_oct: number | null; m_nov: number | null; m_dec: number | null; m_jan: number | null;
  m_fev: number | null; m_mars: number | null; m_avr: number | null; m_mai: number | null; m_juin: number | null;
};
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
  searchParams: Promise<{ periode?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const periode: Periode = sp.periode === "trimestre" || sp.periode === "annee" ? sp.periode : "mois";
  const ref = sp.ref && /^\d{4}-\d{2}-\d{2}$/.test(sp.ref) ? sp.ref : moisPrecedentISO();
  const bornes = bornesPeriode(periode, ref);

  const supabase = await createClient();
  const opsP = toutesLesOperations<Op>(supabase, "date_operation, montant, type, categorie_id");
  const [exercicesRes, catsRes, comptesRes, donsRes, scoAnneeRes, orgRes] = await Promise.all([
    supabase.from("exercices").select("id, libelle, date_debut, date_fin"),
    supabase.from("categories").select("id, nom, type"),
    supabase.from("comptes").select("solde_initial").eq("archive", false),
    supabase.from("dons").select("montant, date_don"),
    supabase.from("scolarite_inscriptions").select("annee_scolaire").order("annee_scolaire", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("organisation").select("denomination, adresse, code_postal, ville").limit(1).maybeSingle(),
  ]);
  const ops = await opsP;

  const exercices = (exercicesRes.data ?? []) as { id: string; libelle: string; date_debut: string; date_fin: string }[];
  const exo = exercices.find((e) => e.date_debut <= bornes.fin && bornes.fin <= e.date_fin)
    ?? exercices.find((e) => e.date_debut <= bornes.debut && bornes.debut <= e.date_fin);
  const exoDebut = exo?.date_debut ?? bornes.debut;

  const budgetRes = exo
    ? await supabase.from("budget_lignes").select("categorie_id, montant_prevu").eq("exercice_id", exo.id)
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
    if (d >= exoDebut && d <= bornes.fin) l.cumul += Number(op.montant);
    if (d >= bornes.debut && d <= bornes.fin) l.periode += Number(op.montant);
  }
  const lignes = [...agg.values()].filter((l) => l.periode || l.cumul || l.budget);
  const recettes = lignes.filter((l) => l.type === "recette").sort((a, b) => b.cumul - a.cumul);
  const depenses = lignes.filter((l) => l.type === "depense").sort((a, b) => b.cumul - a.cumul);

  const somme = (arr: Ligne[], k: "periode" | "cumul" | "budget") => arr.reduce((s, l) => s + l[k], 0);
  const recP = somme(recettes, "periode"), depP = somme(depenses, "periode");
  const recC = somme(recettes, "cumul"), depC = somme(depenses, "cumul");
  const budDep = somme(depenses, "budget"), budRec = somme(recettes, "budget");
  const resultatPeriode = recP - depP;
  const resultatExo = recC - depC;
  const tresorerie = soldeInitial + ops.filter((o) => o.date_operation <= bornes.fin)
    .reduce((s, o) => s + (o.type === "recette" ? 1 : -1) * Number(o.montant), 0);
  const budgetConsomme = budDep > 0 ? (depC / budDep) * 100 : null;

  // Scolarité
  const anneeSco = (scoAnneeRes.data as { annee_scolaire: string } | null)?.annee_scolaire ?? null;
  const scoRes = anneeSco
    ? await supabase.from("scolarite_inscriptions")
        .select("montant_mensuel, avance, m_sept, m_oct, m_nov, m_dec, m_jan, m_fev, m_mars, m_avr, m_mai, m_juin")
        .eq("annee_scolaire", anneeSco)
    : { data: [] as Sco[] };
  const sco = (scoRes.data ?? []) as Sco[];
  const nb = (v: number | null | undefined) => Number(v ?? 0);
  const regleFam = (r: Sco) => nb(r.avance) + nb(r.m_sept) + nb(r.m_oct) + nb(r.m_nov) + nb(r.m_dec) + nb(r.m_jan) + nb(r.m_fev) + nb(r.m_mars) + nb(r.m_avr) + nb(r.m_mai) + nb(r.m_juin);
  const scoDu = sco.reduce((s, r) => s + nb(r.montant_mensuel) * 10, 0);
  const scoRegle = sco.reduce((s, r) => s + regleFam(r), 0);
  const scoReste = scoDu - scoRegle;
  const scoFamillesReste = sco.filter((r) => nb(r.montant_mensuel) * 10 - regleFam(r) > 0.005).length;

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
  const colReal = periode === "annee" ? "Réalisé exercice" : "Réalisé période";

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
            <th style={th}>Cumul exercice</th>
            <th style={th}>Budget</th>
            <th style={{ ...th, width: 56 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: C.muted }}>Aucun mouvement.</td></tr>
          ) : rows.map((l, i) => {
            const pct = l.budget ? (l.cumul / l.budget) * 100 : null;
            const pctColor = l.type === "depense" && pct !== null ? (pct > 100 ? C.red : pct > 90 ? C.gold : C.green) : C.muted;
            return (
              <tr key={l.nom} style={{ background: i % 2 ? C.cream : C.white }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>{l.nom}</td>
                <td style={td}>{formatEuros(l.periode)}</td>
                <td style={td}>{formatEuros(l.cumul)}</td>
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
            <td style={{ ...td, fontWeight: 700 }}>{formatEuros(tc)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{tb ? formatEuros(tb) : "—"}</td>
            <td style={{ ...td, fontWeight: 700 }}>{tb ? formatPct((tc / tb) * 100) : "—"}</td>
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
      <BilanToolbar periode={periode} refMois={ref.slice(0, 7)} />

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, margin: "14px 0 16px" }}>
          {carte("Résultat de la période", `${resultatPeriode >= 0 ? "+" : ""}${formatEuros(resultatPeriode)}`, resultatPeriode < 0 ? C.red : C.green, resultatPeriode < 0 ? C.redBg : C.greenBg)}
          {carte("Trésorerie à date", formatEuros(tresorerie), tresorerie < 0 ? C.red : C.green, tresorerie < 0 ? C.redBg : C.greenBg)}
          {carte("Résultat de l'exercice", `${resultatExo >= 0 ? "+" : ""}${formatEuros(resultatExo)}`, resultatExo < 0 ? C.red : C.green, C.marineBg)}
          {carte("Budget dépenses consommé", formatPct(budgetConsomme), (budgetConsomme ?? 0) > 100 ? C.red : C.ink, C.goldBg)}
        </div>

        {/* Compte de résultat */}
        <h2 style={h2}>Compte de résultat · {exo?.libelle ?? ""}</h2>
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
          Document de gestion interne établi par le trésorier de l&apos;ARIL. « Cumul exercice » = du 1ᵉʳ septembre à la fin de la période. Postes regroupés par grande rubrique budgétaire.
        </p>
      </div>
    </div>
  );
}
