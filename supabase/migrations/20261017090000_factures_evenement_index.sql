-- Factures rattachées à un événement : vue par événement et historique des événements d'un fournisseur.
create index if not exists factures_fournisseurs_evenement on public.factures_fournisseurs (evenement_id);
create index if not exists evenements_caisse_date on public.evenements_caisse (date);
