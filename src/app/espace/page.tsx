import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import { formatEurosCourt as formatEuros, todayISO } from "@/lib/format";
import { chargerEspace, situation, alertes, anneeCourante, classeEn } from "@/lib/espaceFamille";
import { prenomEleve, termineEnJuin } from "@/lib/eleves";

const TONS = {
  rouge: "border-negative/40 bg-negative/5 text-negative",
  ambre: "border-gold/50 bg-gold-soft/50 text-gold",
  info: "border-border bg-surface text-foreground",
};

export default async function TableauDeBordFamille() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleEnApercu(user);
  const { espace, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;

  const aujourdhui = todayISO();
  const annee = anneeCourante(espace, aujourdhui);
  const s = annee ? situation(espace, annee, aujourdhui) : null;
  const liste = alertes(espace, s, aujourdhui);
  const activitesDues = espace.activites.filter((a) => !a.paye_le && a.annee_scolaire === annee);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Bonjour, famille {espace.famille.nom}</h1>
        {annee && <p className="text-sm text-muted">Année scolaire {annee}</p>}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">À noter</h2>
        {liste.length === 0 ? (
          <p className="rounded-xl border border-positive/30 bg-positive/5 px-4 py-3 text-sm text-positive">Tout est à jour. Merci !</p>
        ) : (
          <ul className="space-y-2">
            {liste.map((a, k) => (
              <li key={k} className={`rounded-xl border px-4 py-3 text-sm ${TONS[a.ton]}`}>
                <div className="font-medium">{a.titre}</div>
                {a.detail && <div className="text-xs opacity-80">{a.detail}</div>}
                {a.lien && (
                  <Link href={a.lien} className="mt-1 inline-block text-xs underline">
                    Voir le détail
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {s && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: "Frais de l'année", v: formatEuros(s.du), c: "" },
            { l: "Déjà réglé", v: formatEuros(s.regle), c: "text-positive" },
            { l: "Reste à régler", v: formatEuros(Math.max(0, s.reste)), c: s.reste > 0 ? "text-foreground" : "text-positive" },
            { l: "Activités à régler", v: formatEuros(activitesDues.reduce((t, a) => t + Number(a.montant), 0)), c: activitesDues.length ? "text-gold" : "" },
          ].map((t) => (
            <div key={t.l} className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs text-muted">{t.l}</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${t.c}`}>{t.v}</div>
            </div>
          ))}
        </section>
      )}

      {annee && espace.eleves.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Vos enfants à l&apos;école</h2>
          <ul className="flex flex-wrap gap-2">
            {espace.eleves.map((e) => {
              const c = classeEn(e, annee);
              if (!c) return null;
              return (
                <li key={e.id} className="rounded-full border border-border bg-surface px-3 py-1 text-sm">
                  {prenomEleve(e)} — {c}
                  {termineEnJuin(e, annee) && <span className="ml-1 text-xs text-gold">(dernière année)</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
