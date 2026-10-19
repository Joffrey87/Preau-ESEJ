-- Opérations candidates pour une facture : ±45 jours, ou toute la comptabilité (p_tout). Additif.
create or replace function public.operations_candidates_facture(p_facture uuid, p_tout boolean)
returns table (id uuid, date_operation date, libelle text, montant numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.date_operation, o.libelle, o.montant
    from factures_fournisseurs f join operations o
      on abs(o.montant) = f.montant and (o.type = 'depense' or o.montant < 0)
     and (p_tout or abs(o.date_operation - f.date) <= 45)
   where f.id = p_facture and public.est_tresorier()
     and not exists (select 1 from factures_fournisseurs x where x.operation_id = o.id and x.id <> f.id)
   order by abs(o.date_operation - f.date)
   limit 50;
$$;
revoke execute on function public.operations_candidates_facture(uuid, boolean) from public, anon;
grant execute on function public.operations_candidates_facture(uuid, boolean) to authenticated;
