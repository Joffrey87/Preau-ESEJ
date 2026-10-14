import Image from "next/image";
import Preinscription from "@/components/inscriptions/Preinscription";
import { anneeInscriptions } from "@/lib/inscriptions";

export const metadata = { title: "Préinscription · École du Saint-Enfant-Jésus" };

/** Lien public de préinscription : une nouvelle famille remplit son dossier, sans compte. */
export default function PreinscriptionPage() {
  const annee = anneeInscriptions();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Image src="/recu/ecole.png" alt="" width={48} height={48} />
        <div>
          <h1 className="text-lg font-semibold">Préinscription · Année {annee}</h1>
          <p className="text-sm text-muted">École du Saint-Enfant-Jésus, Reims</p>
        </div>
      </div>
      <p className="mb-5 text-sm text-muted">
        Remplissez ce dossier pour demander l&apos;inscription de votre enfant. La Directrice étudie chaque demande et vous recontacte.
      </p>
      <Preinscription annee={annee} />
    </main>
  );
}
