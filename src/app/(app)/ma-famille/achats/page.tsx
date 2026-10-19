import AchatsFamille from "@/app/espace/achats/page";

// Profil rattaché à une famille (ex. : le Président) : achats divers de sa famille, comme dans l'Espace famille.
export default function MesAchats() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      <AchatsFamille />
    </div>
  );
}
