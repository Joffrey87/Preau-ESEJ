-- Bascule réelle du Webmestre : après ressaisie de son mot de passe, il reçoit un jeton (4 h) qui lui permet d'ouvrir
-- la session de n'importe quel compte (bureau, Recherche de fonds, Événement, professeurs, familles) puis de revenir,
-- par le logo ou le bandeau. Le secret n'est gardé que dans un cookie httpOnly ; la base n'en garde que l'empreinte
-- (SHA-256). Table lue et écrite uniquement par le serveur (clé de service) : aucune politique, aucun droit client.

create table if not exists public.webmestre_jetons (
  id uuid primary key default gen_random_uuid(),
  empreinte text not null unique,
  -- Compte réel du Webmestre (retour) et compte ouvert en dernier par le jeton : seuls ces deux comptes peuvent s'en servir.
  webmestre_user uuid not null references auth.users(id) on delete cascade,
  webmestre_email text not null,
  compte_courant uuid references auth.users(id) on delete set null,
  cree timestamptz not null default now(),
  expire timestamptz not null,
  revoque timestamptz
);
alter table public.webmestre_jetons enable row level security;
revoke all on public.webmestre_jetons from anon, authenticated;

create index if not exists webmestre_jetons_actifs on public.webmestre_jetons (expire) where revoque is null;
