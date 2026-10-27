-- Suppression (annulation) d'un reçu fiscal, y compris déjà envoyé (avec confirmation renforcée côté
-- application : p_forcer). Les dons redeviennent « sans reçu » : numéro, date d'édition et état d'envoi effacés.
-- Le registre `recus` garde la trace (annule_le) ; la numérotation est à régulariser plus tard.

drop function if exists public.annuler_recu(text);
create or replace function public.annuler_recu(p_recu text, p_forcer boolean default false) returns void
language plpgsql set search_path = public as $$
begin
  if not public.est_tresorier() then
    raise exception 'Réservé au Trésorier ou au Président.';
  end if;
  if not p_forcer and exists (select 1 from dons where recu_numero = p_recu and recu_etat ilike 'envoy%') then
    raise exception 'Ce reçu a déjà été envoyé : confirmez la suppression pour l''annuler.';
  end if;
  update dons set recu_numero = null, recu_emis_le = null, recu_etat = null where recu_numero = p_recu;
  update recus set annule_le = now(), envoye_le = null, envoi_mode = null, envoi_precision = null, telecharge_le = null
   where recu_numero = p_recu;
end;
$$;
revoke execute on function public.annuler_recu(text, boolean) from public, anon;
grant execute on function public.annuler_recu(text, boolean) to authenticated;
