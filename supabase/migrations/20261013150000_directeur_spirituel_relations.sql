-- 13/10/2026 — Directeur spirituel : onglet Relations donateurs, en lecture (prospects et montants obtenus).
-- Les écritures (prospects, liaisons, indicateurs des dons) restent réservées aux profils qui les avaient.

drop policy if exists prospects_lecture on public.prospects;
create policy prospects_lecture on public.prospects for select to authenticated
  using (public.peut_voir_pipeline() or public.mon_role() = 'directeur-spirituel');

create or replace function public.prospects_obtenus()
returns table (prospect_id uuid, montant numeric, nb integer)
language sql stable security definer set search_path = public as $$
  select l.prospect_id, coalesce(sum(o.montant), 0)::numeric, count(*)::integer
    from public.prospects_ecritures l
    join public.operations o on o.id = l.operation_id
   where public.peut_voir_pipeline() or public.mon_role() = 'directeur-spirituel'
   group by l.prospect_id;
$$;
