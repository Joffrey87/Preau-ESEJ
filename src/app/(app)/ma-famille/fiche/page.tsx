import MaFamille from "@/app/espace/famille/page";

// Profil d'Administration rattaché à une famille (ex. : le Président) : la fiche de sa famille, en lecture.
export default function MaFamilleAdministration() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      <MaFamille />
    </div>
  );
}
