-- Suivi : date de l'action choisie dans la liste à cocher (par défaut : aujourd'hui). Additif : colonne facultative,
-- les lignes existantes gardent leur date d'enregistrement (cree_le).
alter table public.suivi_actions add column if not exists date_action date;

-- Fixer la date de sa propre action : seulement par son auteur, dans les 24 h (même règle que modifier_suivi_action).
create or replace function public.dater_suivi_action(p_id uuid, p_date date, p_auteur text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_auteur text := coalesce(nullif(btrim(p_auteur), ''), public.mon_role());
begin
  if not public.peut_suivre_donateurs() then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from suivi_actions where id = p_id and auteur = v_auteur and cree_le > now() - interval '24 hours') then
    raise exception 'Seul l''auteur peut modifier son action, dans les 24 heures.';
  end if;
  if p_date is not null and p_date > current_date + 1 then raise exception 'Date future impossible'; end if;
  update suivi_actions set date_action = p_date where id = p_id;
end;
$$;
revoke all on function public.dater_suivi_action(uuid, date, text) from public, anon;
grant execute on function public.dater_suivi_action(uuid, date, text) to authenticated;
