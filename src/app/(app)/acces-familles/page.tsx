import PageHeader from "@/components/PageHeader";
import AccesFamilles from "@/components/AccesFamilles";

export default function AccesFamillesPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Accès des familles" subtitle="Invitations et mots de passe de l'espace famille." />
      <AccesFamilles />
    </div>
  );
}
