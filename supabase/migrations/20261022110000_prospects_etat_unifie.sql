-- Prospects : état unifié (remplace, pour l'affichage, l'étape et l'état du Suivi), actions libres, modification
-- de sa dernière action sous 24 h. Additif : aucune donnée existante n'est convertie ni supprimée ; les contraintes
-- sont seulement élargies.

alter table public.prospects add column if not exists etat_unifie text;
alter table public.prospects add column if not exists etat_unifie_le timestamptz;
alter table public.prospects add column if not exists etat_unifie_par text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'prospects_etat_unifie_check') then
    alter table public.prospects add constraint prospects_etat_unifie_check
      check (etat_unifie is null or etat_unifie in ('Pas contacté', 'Contacté', 'Promesse', 'Donateur', 'En pause', 'Perdu'));
  end if;
end $$;

-- Actions : types existants + « Envoi courrier Bienfaiteur » + texte libre ; une ligne peut ne porter qu'une note.
alter table public.suivi_actions drop constraint if exists suivi_actions_actions_check;
alter table public.suivi_actions add constraint suivi_actions_actions_check
  check (actions is not null and array_position(actions, '') is null and cardinality(actions) <= 20);

-- États du Suivi : anciens + nouveaux (état unifié des prospects).
alter table public.suivi_actions drop constraint if exists suivi_actions_etat_check;
alter table public.suivi_actions add constraint suivi_actions_etat_check
  check (etat is null or etat in ('À contacter', 'Contacté', 'En réflexion', 'Promesse de don', 'Don reçu', 'À relancer',
    'Refus', 'Ne plus solliciter', 'Pas contacté', 'Promesse', 'Donateur', 'En pause', 'Perdu'));

-- Modifier sa dernière action : seulement par son auteur, dans les 24 h.
create or replace function public.modifier_suivi_action(p_id uuid, p_actions text[], p_note text, p_auteur text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_auteur text := coalesce(nullif(btrim(p_auteur), ''), public.mon_role());
begin
  if not public.peut_suivre_donateurs() then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from suivi_actions where id = p_id and auteur = v_auteur and cree_le > now() - interval '24 hours') then
    raise exception 'Seul l''auteur peut modifier son action, dans les 24 heures.';
  end if;
  update suivi_actions set actions = coalesce(p_actions, '{}'), note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
end;
$$;
revoke all on function public.modifier_suivi_action(uuid, text[], text, text) from public, anon;
grant execute on function public.modifier_suivi_action(uuid, text[], text, text) to authenticated;
