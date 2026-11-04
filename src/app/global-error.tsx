"use client";

/** Dernier filet : erreur dans la mise en page racine elle-même. */
export default function ErreurGlobale({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Cette page n&apos;a pas pu s&apos;afficher</h1>
          <p style={{ fontSize: 14, color: "#666" }}>
            Un incident passager est survenu. Rechargez la page{error.digest ? ` (code ${error.digest})` : ""}.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Recharger
          </button>
        </div>
      </body>
    </html>
  );
}
