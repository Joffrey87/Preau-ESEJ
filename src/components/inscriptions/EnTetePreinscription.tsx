import Image from "next/image";

/** En-tête de la préinscription (page publique et aperçu de la Directrice). */
export default function EnTetePreinscription({ annee }: { annee: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <Image src="/recu/ecole.png" alt="" width={48} height={48} />
      <div>
        <h1 className="text-lg font-semibold">Préinscription · Année {annee}</h1>
        <p className="text-sm text-muted">École du Saint-Enfant-Jésus, Reims</p>
      </div>
    </div>
  );
}
