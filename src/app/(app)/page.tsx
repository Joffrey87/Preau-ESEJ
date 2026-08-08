import Link from "next/link";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";
import { roleByEmail } from "@/lib/roles";
import { recuEnvoye, champsImportantsManquants } from "@/lib/statutDon";

type Op = { type: "recette" | "depense"; montant: number; date_operation: string };
type DonRow = {
  recu_etat: string | null;
  recu_numero: string | null;
  est_personne_morale: boolean;
  donateur_nom: string;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  date_don: string;
  mode_paiement: string | null;
};
type ScoRow = {
  montant_mensuel: number | null;
  avance: number | null;
  m_sept: number | null;
  m_oct: number | null;
  m_nov: number | null;
  m_dec: number | null;
  m_jan: number | null;
  m_fev: number | null;
  m_mars: number | null;
  m_avr: number | null;
  m_mai: number | null;
  m_juin: number | null;
};

type Tone = "red" | "amber" | "blue" | "violet" | "green";
type Prio = { title: string; detail: string; href: string; icon: string; tone: Tone };

const TONE: Record<Tone, { dot: string; ring: string }> = {
  red: { dot: "bg-negative", ring: "hover:border-negative/50" },
  amber: { dot: "bg-gold", ring: "hover:border-gold/60" },
  blue: { dot: "bg-accent", ring: "hover:border-accent" },
  violet: { dot: "bg-violet-500", ring: "hover:border-violet-400" },
  green: { dot: "bg-positive", ring: "hover:border-positive/50" },
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(user?.email);
  const meta = (user?.user_metadata ?? {}) as { prenom?: string; nom?: string };
  const prenom = (meta.prenom ?? "").trim();
  const slug = role?.slug ?? "";
  const estFinance = ["tresorier", "president", "administrateur"].includes(slug);
  const estMecenat = slug === "resp-mecenat";
  const estEcole = ["secretaire", "directrice", "directeur-spirituel"].includes(slug);

  const { data: exercice } = await supabase
    .from("exercices")
    .select("id, libelle")
    .eq("actif", true)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [comptesRes, opsRes, budgetRes, donsRes, scoAnneeRes] = await Promise.all([
    supabase.from("comptes").select("solde_initial").eq("archive", false),
    exercice
      ? supabase.from("operations").select("type, montant, date_operation").eq("exercice_id", exercice.id)
      : Promise.resolve({ data: [] as Op[] }),
    exercice
      ? supabase.from("budget_lignes").select("montant_prevu, categories(type)").eq("exercice_id", exercice.id)
      : Promise.resolve({ data: [] as { montant_prevu: number; categories: { type: string } | null }[] }),
    supabase
      .from("dons")
      .select(
        "recu_etat, recu_numero, est_personne_morale, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, date_don, mode_paiement",
      ),
    supabase
      .from("scolarite_inscriptions")
      .select("annee_scolaire")
      .order("annee_scolaire", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const anneeSco = (scoAnneeRes.data as { annee_scolaire: string } | null)?.annee_scolaire ?? null;
  const scoRes = anneeSco
    ? await supabase
        .from("scolarite_inscriptions")
        .select("montant_mensuel, avance, m_sept, m_oct, m_nov, m_dec, m_jan, m_fev, m_mars, m_avr, m_mai, m_juin")
        .eq("annee_scolaire", anneeSco)
    : { data: [] as ScoRow[] };

  // Finances
  const soldeInitial = (comptesRes.data ?? []).reduce((s, c) => s + Number(c.solde_initial), 0);
  const ops = (opsRes.data ?? []) as Op[];
  const sum = (arr: Op[], t: Op["type"]) =>
    arr.filter((o) => o.type === t).reduce((s, o) => s + Number(o.montant), 0);
  const solde = soldeInitial + sum(ops, "recette") - sum(ops, "depense");
  const budgetPrevuDep = (budgetRes.data ?? [])
    .filter((b) => {
      const cat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
      return cat?.type === "depense";
    })
    .reduce((s, b) => s + Number(b.montant_prevu), 0);
  const budgetConsomme = budgetPrevuDep > 0 ? (sum(ops, "depense") / budgetPrevuDep) * 100 : null;

  // Dons
  const dons = (donsRes.data ?? []) as DonRow[];
  const recusAEnvoyer = dons.filter((d) => !recuEnvoye(d)).length;
  const donsIncomplets = dons.filter((d) => champsImportantsManquants(d).length > 0).length;
  const totalDons = dons.length;

  // Scolarité — reste à payer = montant_mensuel*10 − (avance + Σ mois)
  const sco = (scoRes.data ?? []) as ScoRow[];
  const n = (v: number | null | undefined) => Number(v ?? 0);
  const resteFamille = (r: ScoRow) => {
    const regle =
      n(r.avance) +
      n(r.m_sept) + n(r.m_oct) + n(r.m_nov) + n(r.m_dec) + n(r.m_jan) +
      n(r.m_fev) + n(r.m_mars) + n(r.m_avr) + n(r.m_mai) + n(r.m_juin);
    return n(r.montant_mensuel) * 10 - regle;
  };
  const famImpayees = sco.filter((r) => resteFamille(r) > 0.005);
  const resteTotal = famImpayees.reduce((s, r) => s + resteFamille(r), 0);

  // Priorités du jour (filtrées par rôle)
  const prios: Prio[] = [];
  if (estFinance && solde < 0)
    prios.push({ title: "Solde de trésorerie négatif", detail: formatEuros(solde), href: "/comptabilite", icon: "ledger", tone: "red" });
  if (estFinance && budgetConsomme !== null && budgetConsomme > 100)
    prios.push({ title: "Budget dépassé", detail: `${Math.round(budgetConsomme)} % du prévu consommé`, href: "/budget", icon: "chart", tone: "amber" });
  if ((estFinance || estMecenat) && donsIncomplets > 0)
    prios.push({ title: `${donsIncomplets} don${donsIncomplets > 1 ? "s" : ""} à compléter`, detail: "Info importante manquante (nom, adresse, courriel…)", href: "/dons", icon: "gift", tone: "red" });
  if ((estFinance || estMecenat) && recusAEnvoyer > 0)
    prios.push({ title: `${recusAEnvoyer} reçu${recusAEnvoyer > 1 ? "s" : ""} fiscal${recusAEnvoyer > 1 ? "s" : ""} à envoyer`, detail: "Dons sans reçu encore envoyé", href: "/recus-fiscaux", icon: "receipt", tone: "blue" });
  if ((estFinance || estEcole) && famImpayees.length > 0)
    prios.push({ title: `${famImpayees.length} famille${famImpayees.length > 1 ? "s" : ""} avec un reste à régler`, detail: `${formatEuros(resteTotal)} au total · scolarité ${anneeSco}`, href: "/scolarite", icon: "graduation", tone: "amber" });

  // Chiffres clés selon le rôle
  type Stat = { label: string; value: string; hint: string };
  let stats: Stat[] = [];
  if (estFinance) {
    stats = [
      { label: "Solde courant", value: formatEuros(solde), hint: "Tous comptes" },
      { label: "Dépenses / prévu", value: budgetConsomme === null ? "—" : `${Math.round(budgetConsomme)} %`, hint: "Budget de l'exercice" },
      { label: "Reçus à envoyer", value: String(recusAEnvoyer), hint: `${totalDons} dons au total` },
      { label: "Restes scolarité", value: formatEuros(resteTotal), hint: `${famImpayees.length} famille(s)` },
    ];
  } else if (estMecenat) {
    stats = [
      { label: "Dons enregistrés", value: String(totalDons), hint: "Toutes années" },
      { label: "Reçus à envoyer", value: String(recusAEnvoyer), hint: "Dons non envoyés" },
      { label: "Dons à compléter", value: String(donsIncomplets), hint: "Info manquante" },
    ];
  } else if (estEcole) {
    stats = [
      { label: "Familles inscrites", value: String(sco.length), hint: `Scolarité ${anneeSco ?? ""}` },
      { label: "Restes à régler", value: String(famImpayees.length), hint: "Familles concernées" },
    ];
  }

  // Accès rapide selon le rôle
  const RACCOURCIS: Record<string, { href: string; icon: string; title: string; desc: string }> = {
    comptabilite: { href: "/comptabilite", icon: "ledger", title: "Comptabilité", desc: "Saisir et suivre recettes et dépenses." },
    budget: { href: "/budget", icon: "chart", title: "Budget", desc: "Réalisé vs prévisionnel." },
    dons: { href: "/dons", icon: "gift", title: "Dons", desc: "Suivi des dons et statuts." },
    recus: { href: "/recus-fiscaux", icon: "receipt", title: "Reçus fiscaux", desc: "Générer les reçus annuels." },
    scolarite: { href: "/scolarite", icon: "graduation", title: "Frais de scolarité", desc: "Paiements par famille." },
    carnet: { href: "/carnet", icon: "contact", title: "Carnet d'adresses", desc: "Contacts de l'association." },
    parametres: { href: "/parametres", icon: "settings", title: "Paramètres", desc: "Association, comptes, catégories." },
  };
  const raccourcis = estFinance
    ? ["comptabilite", "budget", "dons", "scolarite", "carnet", "parametres"]
    : estMecenat
      ? ["dons", "recus", "carnet"]
      : estEcole
        ? ["scolarite", "carnet"]
        : ["carnet"];

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const salut = now.getHours() < 18 ? "Bonjour" : "Bonsoir";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      {/* Hero personnalisé */}
      <div className="mb-8 flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Préau" className="h-20 w-20 shrink-0 rounded-full object-contain sm:h-24 sm:w-24" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gold">{dateStr}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {salut}
            {prenom ? ` ${prenom}` : ""}
            {role ? <span className="text-muted font-normal"> · {role.label}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {exercice ? `Trésorerie de l'ARIL · ${exercice.libelle}` : "Trésorerie de l'ARIL"}
          </p>
        </div>
      </div>

      {/* Priorités du jour */}
      <section className="mb-9">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          <Icon name="check" className="h-4 w-4 text-gold" />
          Vos priorités du jour
        </h2>
        {prios.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-positive/10 text-positive">
              <Icon name="check" className="h-5 w-5" />
            </span>
            Rien d’urgent à traiter aujourd’hui. Tout est à jour de votre côté.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {prios.map((p) => (
              <Link
                key={p.title}
                href={p.href}
                className={`group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors ${TONE[p.tone].ring}`}
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE[p.tone].dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{p.detail}</span>
                </span>
                <Icon name="transfer" className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Chiffres clés */}
      {stats.length > 0 && (
        <section className="mb-9">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Chiffres clés</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
                <div className="text-sm text-muted">{s.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
                <div className="mt-1 text-xs text-muted">{s.hint}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accès rapide */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Accès rapide</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {raccourcis.map((k) => {
            const s = RACCOURCIS[k];
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Icon name={s.icon} className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium group-hover:text-accent">{s.title}</div>
                  <div className="mt-0.5 text-sm text-muted">{s.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
