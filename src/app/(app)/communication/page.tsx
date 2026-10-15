import PageHeader from "@/components/PageHeader";
import Messagerie from "@/components/communication/Messagerie";

/** Messagerie de l'école : Direction, Secrétariat, Trésorerie, Événementiel ↔ familles. */
export default function CommunicationPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Messagerie" subtitle="Échanges avec les familles · envois groupés à une classe ou à toute l'école" />
      <Messagerie cote="ecole" />
    </div>
  );
}
