-- 24/10/2026 — « À jour au … » : date de fin du dernier relevé validé (releves_attente.statut = 'valide'),
-- au lieu de la date de la dernière écriture bancaire. Repli sur l'ancien calcul s'il n'y a aucun relevé validé.
-- releves_attente n'est pas lisible par les profils (RLS) : la fonction reste SECURITY DEFINER et ne renvoie qu'une date.
create or replace function public.date_maj_comptes()
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select max(date_fin) from releves_attente where statut = 'valide'),
    (select max(date_operation) from operations
      where libelle_origine is not null or libelle_origine_chiffre is not null or import_id is not null)
  )
$$;
revoke all on function public.date_maj_comptes() from public, anon;
grant execute on function public.date_maj_comptes() to authenticated;
