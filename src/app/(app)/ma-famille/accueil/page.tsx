import TableauDeBordFamille from "@/app/espace/page";

// Profil d'Administration rattaché à une famille (ex. : le Président) : l'accueil de son Espace famille, dans son menu.
export default function AccueilFamille() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      <TableauDeBordFamille />
    </div>
  );
}
