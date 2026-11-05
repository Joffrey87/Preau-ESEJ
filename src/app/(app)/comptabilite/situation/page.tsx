import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import { roleByEmail } from "@/lib/roles";
import { emailVue } from "@/lib/vueRoleServeur";
import { toutesLesOperations } from "@/lib/operations";
import { regleDesFamilles } from "@/lib/regleScolarite";
import { moisEchus } from "@/lib/retardScolarite";
import { recettes, nomContact, type EvenementCaisse } from "@/lib/evenement";

/** Une facture « reçue, à payer » est signalée en retard au-delà de ce délai (pas d'échéance en base). */
const DELAI_RETARD_JOURS = 30;
/** Horizon des échéances connues à venir (URSSAF, loyer, salaires…). */
const HORIZON_JOURS = 15;

type Echeance = { id: string; libelle: string; montant: number | null; jour_du_mois: number | null; date_echeance: string | null; motif_paiement: string | null; statut: string; source: string; notes: string | null };
type LigneAregler = { id: string; date: string | null; qui: string; objet: string; montant: number | null; ambre: boolean; etat: string };

const addJours = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
/** Date d'échéance du mois (jour borné à la fin du mois). */
function echeanceDuMois(annee: number, mois: number, jour: number) {
  const fin = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(annee, mois, Math.min(jour, fin))).toISOString().slice(0, 10);
}

type Ligne = { objet: string; attendu: number | null; paye: number; benefice: number };

/**
 * Situation financière : vue de synthèse pour le Président et le Trésorier.
 * Solde bancaire, factures à régler, frais de scolarité, ventes diverses + événements, dons.
 */
export default async function SituationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const slug = roleByEmail(await emailVue(user?.email))?.slug ?? "";
  if (slug !== "president" && slug !== "tresorier") redirect("/comptabilite");

  const aujourdhui = todayISO();
  const { data: exs } = await supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false });
  const exercices = (exs ?? []) as { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean }[];
  const exercice =
    exercices.find((e) => e.date_debut <= aujourdhui && aujourdhui <= e.date_fin) ?? exercices.find((e) => e.actif) ?? exercices[0];

  const opsP = toutesLesOperations<{ montant: number; type: "recette" | "depense"; parent_id: string | null }>(supabase, "montant, type, parent_id");
  const [releveRes, comptesRes, facturesRes, contactsRes, scRes, duesRes, payRes, evRes, evRecRes, evFactRes, scoAnneeRes, jaugeRes] = await Promise.all([
    supabase.from("imports_releve").select("solde_banque, solde_date, solde_preau, cree_le").is("annule_le", null)
      .not("solde_banque", "is", null).order("solde_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("comptes").select("solde_initial").eq("archive", false),
    supabase.from("factures_fournisseurs").select("id, fournisseur_id, fournisseur_lu, montant, date, numero, libelle, statut, domaine, evenement_id").neq("statut", "payee").order("date"),
    supabase.from("contacts_evenement").select("id, nom, prenom, raison_sociale"),
    supabase.from("ventes_sous_categories").select("id, nom, domaine"),
    exercice ? supabase.from("ventes_dues").select("id, sous_categorie_id, montant_attendu").eq("exercice_id", exercice.id) : Promise.resolve({ data: [] }),
    supabase.from("ventes_paiements").select("vente_due_id, montant"),
    exercice
      ? supabase.from("evenements_caisse").select("id, nom, date, responsable_id, caisse_avant, caisse_apres").gte("date", exercice.date_debut).lte("date", exercice.date_fin).order("date")
      : Promise.resolve({ data: [] }),
    supabase.from("evenement_recettes").select("evenement_id, montant"),
    supabase.from("factures_fournisseurs").select("evenement_id, montant").not("evenement_id", "is", null),
    supabase.from("scolarite_inscriptions").select("annee_scolaire").order("annee_scolaire", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("dons_exercice_courant"),
  ]);
  const debutMoisPrec = addJours(`${addJours(`${aujourdhui.slice(0, 7)}-01`, -1).slice(0, 7)}-01`, -10);
  const [echRes, opsRecRes, evNomsRes] = await Promise.all([
    supabase.from("echeances_connues").select("id, libelle, montant, jour_du_mois, date_echeance, motif_paiement, statut, source, notes").eq("actif", true),
    supabase.from("operations").select("date_operation, libelle, libelle_origine").eq("type", "depense").gte("date_operation", debutMoisPrec),
    supabase.from("evenements_caisse").select("id, nom, date"),
  ]);

  // 1. Solde : dernier relevé importé (solde lu dans l'export), à défaut le solde calculé par Préau.
  const releve = releveRes.data as { solde_banque: number; solde_date: string | null; solde_preau: number | null } | null;
  const ops = (await opsP).filter((o) => !o.parent_id);
  const soldePreau =
    ((comptesRes.data ?? []) as { solde_initial: number }[]).reduce((s, c) => s + Number(c.solde_initial), 0) +
    ops.reduce((s, o) => s + (o.type === "recette" ? 1 : -1) * Number(o.montant), 0);

  // 2. Factures fournisseurs non payées (pas de rapprochement bancaire ni de paiement saisi).
  const contacts = new Map(((contactsRes.data ?? []) as { id: string; nom: string | null; prenom: string | null; raison_sociale: string | null }[])
    .map((c) => [c.id, nomContact(c as never)]));
  const limite = new Date(Date.parse(aujourdhui) - DELAI_RETARD_JOURS * 86400000).toISOString().slice(0, 10);
  const evNoms = new Map(((evNomsRes.data ?? []) as { id: string; nom: string }[]).map((e) => [e.id, e.nom]));
  const facturesBrutes = (facturesRes.data ?? []) as { id: string; fournisseur_id: string; fournisseur_lu: string | null; montant: number; date: string; numero: string | null; libelle: string | null; statut: string; domaine: string | null; evenement_id: string | null }[];
  const lignes: LigneAregler[] = facturesBrutes.filter((f) => f.statut !== "mise_de_cote").map((f) => {
    const retard = f.date < limite;
    return {
      id: f.id, date: f.date, qui: contacts.get(f.fournisseur_id) ?? f.fournisseur_lu ?? "—",
      objet: [f.evenement_id && evNoms.get(f.evenement_id), f.libelle, f.numero && `n° ${f.numero}`].filter(Boolean).join(" · ") || "—",
      montant: Number(f.montant), ambre: retard, etat: retard ? "En retard" : "À payer",
    };
  });
  const misesDeCote: { libelle: string; montant: number | null }[] = facturesBrutes.filter((f) => f.statut === "mise_de_cote")
    .map((f) => ({ libelle: contacts.get(f.fournisseur_id) ?? f.fournisseur_lu ?? f.libelle ?? "Facture", montant: Number(f.montant) }));

  // 2b. Échéances connues : factures reçues par mail (boîte Trésorier) + charges récurrentes (loyer, URSSAF, salaires le 28).
  const opsRec = (opsRecRes.data ?? []) as { date_operation: string; libelle: string | null; libelle_origine: string | null }[];
  const horizon = addJours(aujourdhui, HORIZON_JOURS);
  const [an, mo] = [Number(aujourdhui.slice(0, 4)), Number(aujourdhui.slice(5, 7)) - 1];
  for (const e of (echRes.data ?? []) as Echeance[]) {
    if (e.statut === "mise_de_cote") { misesDeCote.push({ libelle: e.libelle, montant: e.montant == null ? null : Number(e.montant) }); continue; }
    if (e.statut !== "a_payer") continue;
    const montant = e.montant == null ? null : Number(e.montant);
    if (e.jour_du_mois) {
      let re: RegExp | null = null;
      try { re = e.motif_paiement ? new RegExp(e.motif_paiement, "i") : null; } catch { re = null; }
      const match = (o: { libelle: string | null; libelle_origine: string | null }) => !!re && re.test(`${o.libelle ?? ""} ${o.libelle_origine ?? ""}`);
      // Occurrences : mois précédent, courant, suivant. Payée si une dépense correspondante tombe entre D − 5 j et l'occurrence suivante − 5 j.
      const occ = [-1, 0, 1, 2].map((k) => echeanceDuMois(an, mo + k, e.jour_du_mois!));
      for (let k = 0; k < 3; k++) {
        const due = occ[k];
        if (due > horizon) continue;
        const paye = opsRec.some((o) => o.date_operation >= addJours(due, -5) && o.date_operation < addJours(occ[k + 1], -5) && match(o));
        if (paye) continue;
        const ambre = due <= aujourdhui;
        lignes.push({ id: `${e.id}-${due}`, date: due, qui: e.libelle, objet: e.notes ?? "Échéance mensuelle", montant, ambre, etat: due < aujourdhui ? "En retard" : due === aujourdhui ? "Jour J" : "À venir" });
      }
    } else {
      if (e.date_echeance && e.date_echeance > horizon) continue;
      const ambre = !!e.date_echeance && e.date_echeance <= aujourdhui;
      lignes.push({ id: e.id, date: e.date_echeance, qui: e.libelle, objet: e.notes ?? (e.source === "mail" ? "Facture reçue par mail" : "—"), montant, ambre,
        etat: !e.date_echeance ? "À payer" : e.date_echeance < aujourdhui ? "En retard" : e.date_echeance === aujourdhui ? "Jour J" : "À venir" });
    }
  }
  lignes.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const factures = lignes;
  const totalFactures = lignes.reduce((s, f) => s + (f.montant ?? 0), 0);
  const totalRetard = lignes.filter((f) => f.ambre).reduce((s, f) => s + (f.montant ?? 0), 0);

  // 3. Frais de scolarité : réglé / dû, perception annuelle (% perçu / % exigible).
  const anneeSco = (scoAnneeRes.data as { annee_scolaire: string } | null)?.annee_scolaire ?? null;
  const sco = anneeSco ? await regleDesFamilles(supabase, anneeSco) : [];
  const scoDu = sco.reduce((s, r) => s + r.du, 0);
  const scoRegle = sco.reduce((s, r) => s + r.regle, 0);
  const echus = anneeSco ? moisEchus(anneeSco, aujourdhui) : 0;
  const scoExigible = sco.reduce((s, r) => s + Math.min(r.du, (r.du / 10) * echus), 0);
  const scoPercu = sco.reduce((s, r) => s + Math.min(Math.max(r.regle, 0), r.du), 0);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

  // 4. Ventes diverses (par objet) + Événements (caisse).
  const paye = new Map<string, number>();
  for (const p of (payRes.data ?? []) as { vente_due_id: string; montant: number }[]) paye.set(p.vente_due_id, (paye.get(p.vente_due_id) ?? 0) + Number(p.montant));
  const sousCats = (scRes.data ?? []) as { id: string; nom: string; domaine: "ecole" | "evenement" }[];
  const parObjet = new Map<string, Ligne>();
  for (const d of (duesRes.data ?? []) as { id: string; sous_categorie_id: string; montant_attendu: number }[]) {
    const l = parObjet.get(d.sous_categorie_id) ?? { objet: "", attendu: 0, paye: 0, benefice: 0 };
    l.attendu = (l.attendu ?? 0) + Number(d.montant_attendu);
    l.paye += paye.get(d.id) ?? 0;
    l.benefice = l.paye;
    parObjet.set(d.sous_categorie_id, l);
  }
  const lignesVentes = (dom: "ecole" | "evenement") =>
    sousCats.filter((s) => s.domaine === dom && parObjet.has(s.id)).map((s) => ({ ...parObjet.get(s.id)!, objet: s.nom })).sort((a, b) => a.objet.localeCompare(b.objet, "fr"));

  const recManuelles = new Map<string, number>();
  for (const r of (evRecRes.data ?? []) as { evenement_id: string; montant: number }[]) recManuelles.set(r.evenement_id, (recManuelles.get(r.evenement_id) ?? 0) + Number(r.montant));
  const depEv = new Map<string, number>();
  for (const f of (evFactRes.data ?? []) as { evenement_id: string; montant: number }[]) depEv.set(f.evenement_id, (depEv.get(f.evenement_id) ?? 0) + Number(f.montant));
  const lignesEvenements: Ligne[] = ((evRes.data ?? []) as EvenementCaisse[]).map((e) => {
    const rec = (recettes(e) ?? 0) + (recManuelles.get(e.id) ?? 0);
    return { objet: `${e.nom} (${formatDate(e.date)})`, attendu: null, paye: rec, benefice: rec - (depEv.get(e.id) ?? 0) };
  });

  const groupes = [
    { titre: "Ventes diverses · École", lignes: lignesVentes("ecole") },
    { titre: "Ventes diverses · Événement", lignes: lignesVentes("evenement") },
    { titre: "Événements (caisse − factures)", lignes: lignesEvenements },
  ].filter((g) => g.lignes.length);
  const somme = (ls: Ligne[]) => ({
    attendu: ls.reduce((s, l) => s + (l.attendu ?? 0), 0),
    paye: ls.reduce((s, l) => s + l.paye, 0),
    benefice: ls.reduce((s, l) => s + l.benefice, 0),
  });
  const total = somme(groupes.flatMap((g) => g.lignes));

  const carte = "rounded-xl border border-border bg-surface px-4 py-3";
  const h2 = "mb-2 text-sm font-semibold";
  const td = "px-3 py-1.5 text-right tabular-nums";

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <div className="mb-4">
        <Link href="/comptabilite" className="text-sm text-accent hover:underline">← Retour à la comptabilité</Link>
      </div>
      <PageHeader title="Situation" subtitle={`Synthèse financière${exercice ? ` · exercice ${exercice.libelle}` : ""}`} />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={carte}>
          <div className="text-xs text-muted">Solde du compte</div>
          <div className={`mt-1 text-2xl font-semibold ${(releve?.solde_banque ?? soldePreau) < 0 ? "text-negative" : ""}`}>
            {formatEuros(Number(releve?.solde_banque ?? soldePreau))}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {releve ? `Dernier relevé${releve.solde_date ? ` au ${formatDate(releve.solde_date)}` : ""} · Préau : ${formatEuros(soldePreau)}` : "Calculé par Préau (aucun solde de relevé enregistré)"}
          </div>
        </div>
        <div className={carte}>
          <div className="text-xs text-muted">Frais de scolarité{anneeSco ? ` · ${anneeSco}` : ""} — Total réglé / Dû</div>
          <div className="mt-1 text-2xl font-semibold">{formatEuros(scoRegle)} <span className="text-base font-normal text-muted">/ {formatEuros(scoDu)}</span></div>
          <div className="mt-0.5 text-xs text-muted">Perception annuelle : {pct(scoPercu, scoDu)} / {pct(scoExigible, scoDu)} dû</div>
        </div>
        <div className={carte}>
          <div className="text-xs text-muted">Factures à régler</div>
          <div className={`mt-1 text-2xl font-semibold ${totalRetard > 0 ? "text-amber-500" : ""}`}>{formatEuros(totalFactures)}</div>
          <div className="mt-0.5 text-xs text-muted">{factures.length} ligne(s) sur {HORIZON_JOURS} j · dont {formatEuros(totalRetard)} en retard / jour J</div>
        </div>
      </div>

      <section className={`${carte} mb-4`}>
        <h2 className={h2}>Factures à régler &amp; échéances à venir ({HORIZON_JOURS} j)</h2>
        {factures.length === 0 ? (
          <p className="text-sm text-muted">Aucune facture en attente de paiement.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted">
              <th className="px-3 py-1 text-left">Date</th><th className="px-3 py-1 text-left">Fournisseur</th>
              <th className="px-3 py-1 text-left">Objet</th><th className="px-3 py-1 text-right">Montant</th><th className="px-3 py-1 text-left">État</th>
            </tr></thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id} className={`border-t border-border ${f.ambre ? "text-amber-600 dark:text-amber-400" : "text-foreground dark:text-white"}`}>
                  <td className="px-3 py-1.5">{f.date ? formatDate(f.date) : "—"}</td>
                  <td className="px-3 py-1.5">{f.qui}</td>
                  <td className="px-3 py-1.5">{f.objet}</td>
                  <td className={td}>{f.montant == null ? "—" : formatEuros(f.montant)}</td>
                  <td className="px-3 py-1.5 font-medium">{f.etat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-muted">
          {misesDeCote.length > 0 && <>Mises de côté : {misesDeCote.map((m) => `${m.libelle}${m.montant != null ? ` (${formatEuros(m.montant)})` : ""}`).join(", ")}. </>}
          Factures fournisseurs sans paiement + factures reçues dans la boîte de réception Trésorier + échéances récurrentes (payées si une dépense du mois correspond). Blanc : dans les temps · ambre : en retard ou jour J. <Link href="/evenement/facturation" className="text-accent hover:underline">Ouvrir la facturation</Link>
        </p>
      </section>

      <section className={`${carte} mb-4`}>
        <h2 className={h2}>Ventes diverses &amp; événements</h2>
        {groupes.length === 0 ? (
          <p className="text-sm text-muted">Aucune vente ni événement sur l&apos;exercice.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted">
              <th className="px-3 py-1 text-left">Objet / événement</th><th className="px-3 py-1 text-right">Attendu</th>
              <th className="px-3 py-1 text-right">Payé</th><th className="px-3 py-1 text-right">Bénéfice</th>
            </tr></thead>
            {groupes.map((g) => {
              const st = somme(g.lignes);
              const avecAttendu = g.lignes.some((l) => l.attendu != null);
              return (
                <tbody key={g.titre}>
                  <tr><td colSpan={4} className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gold">{g.titre}</td></tr>
                  {g.lignes.map((l) => (
                    <tr key={l.objet} className="border-t border-border">
                      <td className="px-3 py-1.5">{l.objet}</td>
                      <td className={td}>{l.attendu == null ? "—" : formatEuros(l.attendu)}</td>
                      <td className={td}>{formatEuros(l.paye)}</td>
                      <td className={`${td} ${l.benefice < 0 ? "text-negative" : ""}`}>{formatEuros(l.benefice)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-surface-2 font-medium">
                    <td className="px-3 py-1.5">Sous-total</td>
                    <td className={td}>{avecAttendu ? formatEuros(st.attendu) : "—"}</td>
                    <td className={td}>{formatEuros(st.paye)}</td>
                    <td className={`${td} ${st.benefice < 0 ? "text-negative" : ""}`}>{formatEuros(st.benefice)}</td>
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className={td}>{formatEuros(total.attendu)}</td>
                <td className={td}>{formatEuros(total.paye)}</td>
                <td className={`${td} ${total.benefice < 0 ? "text-negative" : ""}`}>{formatEuros(total.benefice)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Ventes diverses : bénéfice = payé (aucun coût rattaché aux objets). Événements : payé = recettes (caisse + chèques / carte), bénéfice = recettes − factures fournisseurs de l&apos;événement.
        </p>
      </section>

      <section className="mb-4">
        <h2 className={h2}>Dons</h2>
        <JaugeDons donnees={(jaugeRes.data ?? null) as DonsExercice} aujourdhui={aujourdhui} />
      </section>
    </div>
  );
}
