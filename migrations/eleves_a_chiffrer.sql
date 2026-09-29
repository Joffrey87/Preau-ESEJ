-- Élèves en attente de chiffrement.
--
-- Un élève saisi hors du navigateur (import par l'assistant, script) ne peut
-- pas être chiffré : la clé du coffre du carnet n'existe que dans le navigateur
-- d'un membre du bureau. Il est déposé ici, prénom en clair, le temps que le
-- coffre soit ouvert : Préau le chiffre alors dans `eleves` et efface la ligne.
-- Lecture et écriture réservées à ceux qui gèrent la scolarité ; les familles
-- n'y ont aucun accès.

create table if not exists public.eleves_a_chiffrer (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references public.familles(id) on delete cascade,
  prenom text not null,
  classe_entree text not null check (classe_entree in ('PS','MS','GS','CP','CE1','CE2','CM1','CM2')),
  annee_entree text not null check (annee_entree ~ '^\d{4}-\d{4}$'),
  decalage integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.eleves_a_chiffrer enable row level security;

drop policy if exists eleves_a_chiffrer_gestion on public.eleves_a_chiffrer;
create policy eleves_a_chiffrer_gestion on public.eleves_a_chiffrer
  for all to authenticated
  using (gere_scolarite())
  with check (gere_scolarite());
