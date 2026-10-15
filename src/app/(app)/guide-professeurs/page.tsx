import PageHeader from "@/components/PageHeader";
import GuideProfesseurs from "@/components/GuideProfesseurs";

/** Guide d'utilisation de Préau pour les Professeurs (aussi téléchargeable en PDF). */
export default function GuideProfesseursPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Guide Professeurs" subtitle="Notes, relevés, bulletins, appel : l'essentiel de Préau" />
      <GuideProfesseurs />
    </div>
  );
}
