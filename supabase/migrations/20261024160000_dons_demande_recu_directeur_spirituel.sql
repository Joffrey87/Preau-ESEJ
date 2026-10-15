-- Le Directeur spirituel peut, comme la Recherche de fonds, demander au Trésorier le reçu fiscal d'un don.
create or replace function public.dons_basculer_demande_recu(p_don uuid, p_prenom text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_role text := public.mon_role();
begin
  if v_role not in ('recherche-fonds', 'directeur-spirituel', 'tresorier', 'president') then
    raise exception 'Profil non autorisé à demander un reçu fiscal.';
  end if;
  if not exists (select 1 from dons where id = p_don and supprime_le is null and not coalesce(don_boursier, false)) then
    raise exception 'Don introuvable.';
  end if;
  if exists (select 1 from dons_demandes_recu where don_id = p_don) then
    delete from dons_demandes_recu where don_id = p_don;
    return false;
  end if;
  insert into dons_demandes_recu (don_id, demande_par, demande_role)
  values (p_don, nullif(btrim(coalesce(p_prenom, '')), ''), v_role);
  return true;
end;
$function$;

-- Il voit donc aussi les demandes en cours (bouton ambre « demandé »).
drop policy if exists dons_demandes_recu_lecture on public.dons_demandes_recu;
create policy dons_demandes_recu_lecture on public.dons_demandes_recu for select
  using (est_tresorier() or mon_role() = any (array['recherche-fonds', 'directeur-spirituel', 'president']));
