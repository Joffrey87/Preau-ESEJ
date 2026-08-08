import PageHeader from "@/components/PageHeader";
import BoiteMails from "@/components/BoiteMails";
import { MAILS_EXEMPLE } from "@/lib/mails";

export default function MailsPage() {
  // Étape 1 (maquette) : données d'exemple. Étape 2 : brancher Gmail (lecture
  // seule) → remplacer MAILS_EXEMPLE par les vrais messages du dernier mois.
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <PageHeader
        title="Mails"
        subtitle="Trier les mails, repérer les factures impayées, préparer l'envoi des reçus."
      />
      <BoiteMails mails={MAILS_EXEMPLE} />
    </div>
  );
}
