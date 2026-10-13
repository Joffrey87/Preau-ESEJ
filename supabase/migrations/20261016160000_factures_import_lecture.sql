-- Facturation Événement : import d'une facture (photo / PDF) lue automatiquement, libellé court,
-- catégorie de dépense de la Comptabilité (choisie à la main) et case « Doute ».
alter table public.factures_fournisseurs
  add column if not exists libelle text,
  add column if not exists categorie_id uuid references public.categories(id) on delete set null,
  add column if not exists doute boolean not null default false;

-- Catégories de DÉPENSE de la Comptabilité (même table `categories`), lisibles par les profils qui saisissent les
-- factures (la table elle-même reste réservée au bureau).
create or replace function public.categories_depense_facture()
returns table (id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nom from categories c
   where c.type = 'depense' and not coalesce(c.archive, false) and public.voit_evenements()
   order by c.ordre, c.nom;
$$;
revoke all on function public.categories_depense_facture() from public, anon;
grant execute on function public.categories_depense_facture() to authenticated;

-- Contrôle de rôle de la route serveur de lecture automatique des factures.
create or replace function public.peut_saisir_factures() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_evenement() or public.est_tresorier();
$$;
revoke all on function public.peut_saisir_factures() from public, anon;
grant execute on function public.peut_saisir_factures() to authenticated;
