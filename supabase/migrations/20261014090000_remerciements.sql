-- 14/10/2026 — REMERCIEMENTS (Président) : dons de 500 € et plus (hors dons boursiers), lettre de remerciement en PDF
-- signée du Président, et date d'envoi du remerciement.

alter table public.dons add column if not exists remerciement_envoye_le date;
alter table public.dons add column if not exists remerciement_par uuid;

-- Coche (date du jour) ou décoche « Remerciement envoyé ». Président (et bureau de trésorerie).
create or replace function public.marquer_remerciement(p_don uuid, p_envoye boolean) returns date
language plpgsql volatile security definer set search_path = public as $$
declare d date;
begin
  if not public.est_tresorier() then raise exception 'Accès refusé'; end if;
  update dons
     set remerciement_envoye_le = case when p_envoye then (now() at time zone 'Europe/Paris')::date end,
         remerciement_par = case when p_envoye then auth.uid() end
   where id = p_don
  returning remerciement_envoye_le into d;
  return d;
end;
$$;
revoke all on function public.marquer_remerciement(uuid, boolean) from public, anon;
grant execute on function public.marquer_remerciement(uuid, boolean) to authenticated;
