import PaiementsFamille from "@/app/espace/paiements/page";

// Profil d'Administration rattaché à une famille (ex. : le Président) : ses paiements, dans son propre menu
// (même page que dans l'Espace famille, en lecture ; la famille est donnée par `familles.profil_lie`).
export default function MesPaiements(props: { searchParams: Promise<{ annee?: string }> }) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      <PaiementsFamille {...props} />
    </div>
  );
}
