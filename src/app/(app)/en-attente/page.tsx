// Page d'attente des profils dont les accès ne sont pas encore définis : aucun onglet, aucune donnée.
export default function EnAttentePage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 text-center md:px-8">
      <h1 className="text-lg font-semibold tracking-tight">Votre espace est en cours de préparation</h1>
      <p className="mt-2 text-sm text-muted">Vos accès seront précisés prochainement par le Trésorier.</p>
    </div>
  );
}
