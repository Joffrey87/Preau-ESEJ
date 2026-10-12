import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { familleDuProfil, familleEnApercu } from "@/lib/apercuFamille";
import { formatEurosCourt as formatEuros, todayISO } from "@/lib/format";
import { PastilleMaj } from "@/components/PageHeader";
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
  // Aperçu (cookie) ou famille rattachée au profil (ex. : le Président, depuis son propre menu).
  const enApercu = await familleEnApercu(user);
  const liee = enApercu ? null : await familleDuProfil(user);
  const apercu = enApercu ?? liee;
  // Depuis le menu d'un profil d'Administration, les liens restent dans ce menu ; pas de bulletins (années passées
  // dans École Futée).
  const lien = (href: string | undefined) =>
    !liee || !href ? href : href === "/espace/paiements" ? "/ma-famille/paiements" : href === "/espace/famille" ? "/ma-famille/fiche" : undefined;
  const { espace, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;

  const aujourdhui = todayISO();
  const annee = anneeCourante(espace, aujourdhui);
  const s = annee ? situation(espace, annee, aujourdhui) : null;
  // Bulletins publiés pas encore ouverts : une tuile « À noter » (la base ne renvoie que ceux de la famille).
  const { count: bulletinsNonLus } = await supabase
    .from("bulletins")
    .select("id", { count: "exact", head: true })
    .eq("statut", "publie")
    .is("lu_le", null);
  const liste = [
    ...(bulletinsNonLus && !liee
      ? [
          {
            ton: "info" as const,
            titre: bulletinsNonLus > 1 ? `${bulletinsNonLus} nouveaux bulletins` : "Un nouveau bulletin",
            detail: "Publié par la Directrice, à lire dans l'onglet Bulletins.",
            lien: "/espace/bulletins",
          },
        ]
      : []),
    ...alertes(espace, s, aujourdhui),
  ];
  const activitesDues = espace.activites.filter((a) => !a.paye_le && a.annee_scolaire === annee);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Bonjour, famille {espace.famille.nom}</h1>
        {annee && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            Année scolaire {annee}
            {espace.maj && <PastilleMaj maj={espace.maj} />}
          </p>
        )}
      </div>

      <section>
        {/* Tuiles compactes, côte à côte (deux par ligne dès la largeur d'une tablette). */}
        <h2 className="mb-2 text-sm font-semibold">À noter</h2>
        {liste.length === 0 ? (
          <p className="rounded-lg border border-positive/30 bg-positive/5 px-3 py-2 text-[13px] text-positive">Tout est à jour. Merci !</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {liste.map((a, k) => (
              <li key={k} className={`flex flex-col rounded-lg border px-3 py-2 text-[13px] leading-snug ${TONS[a.ton]}`}>
                <div className="font-medium">{a.titre}</div>
                {a.detail && <div className="text-xs opacity-80">{a.detail}</div>}
                {lien(a.lien) && (
                  <Link href={lien(a.lien) as string} className="mt-auto pt-1 text-xs underline">
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
