-- Les montants des opérations sont positifs ; les débits ont type = 'depense'. Excluant aussi les opérations ventilées
-- (lignes mères) : on rapproche une ligne réelle.
create or replace function public.operations_candidates_facture(p_facture uuid)
returns table (id uuid, date_operation date, libelle text, montant numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.date_operation, o.libelle, o.montant
    from factures_fournisseurs f join operations o
      on o.type = 'depense' and abs(o.montant) = f.montant and abs(o.date_operation - f.date) <= 45
   where f.id = p_facture and public.est_tresorier() and not coalesce(o.est_ventilee, false)
     and not exists (select 1 from factures_fournisseurs x where x.operation_id = o.id and x.id <> f.id)
   order by abs(o.date_operation - f.date);
$$;
