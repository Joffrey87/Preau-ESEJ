-- 15/10/2026 — Notes verrouillées après publication du relevé.
-- Dès que le relevé de notes d'un élève est publié pour une période, ses notes de cette période ne se créent, ne se
-- modifient ni ne se suppriment plus (suppression d'une évaluation comprise). La Directrice rouvre en repassant le
-- relevé « en cours ». Le barème et le coefficient d'une évaluation se figent dès qu'un relevé de la classe est publié.

create or replace function public.evaluation_notes_verrou() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_eleve uuid := coalesce(new.eleve_id, old.eleve_id);
  v_eval uuid := coalesce(new.evaluation_id, old.evaluation_id);
begin
  if exists (
    select 1 from evaluations e join releves_notes r on r.periode_id = e.periode_id and r.classe_id = e.classe_id
     where e.id = v_eval and r.eleve_id = v_eleve and r.statut = 'publie'
  ) then
    raise exception 'Relevé publié : les notes de cet élève pour la période sont verrouillées (la Directrice peut repasser le relevé en cours).';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists evaluation_notes_verrou on public.evaluation_notes;
create trigger evaluation_notes_verrou before insert or update or delete on public.evaluation_notes
  for each row execute function public.evaluation_notes_verrou();

create or replace function public.evaluations_verrou() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.bareme is distinct from old.bareme or new.coef is distinct from old.coef or new.periode_id is distinct from old.periode_id or new.matiere_id is distinct from old.matiere_id)
     and exists (select 1 from releves_notes r where r.periode_id = old.periode_id and r.classe_id = old.classe_id and r.statut = 'publie') then
    raise exception 'Relevés publiés pour cette période : barème, coefficient, période et matière de l''évaluation ne se modifient plus.';
  end if;
  return new;
end;
$$;
drop trigger if exists evaluations_verrou on public.evaluations;
create trigger evaluations_verrou before update on public.evaluations
  for each row execute function public.evaluations_verrou();
