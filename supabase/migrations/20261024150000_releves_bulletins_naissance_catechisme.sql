-- 15/10/2026 — Relevés de notes et bulletins trimestriels :
--  - la date de naissance de l'élève figure sur le bulletin (eleves_bulletins la renvoie) ;
--  - Catéchisme : une appréciation seule, sans note, y compris sur le relevé de la période
--    (appréciation par matière du relevé, sur le modèle de celles du bulletin trimestriel).

drop function if exists public.eleves_bulletins(text);
create function public.eleves_bulletins(p_annee text)
returns table (id uuid, prenom text, nom text, classe_entree text, annee_entree text, decalage integer, sorti_le date, famille_id uuid, date_naissance date)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(e.prenom, e.initiale), coalesce(nullif(btrim(e.nom_usage), ''), f.nom), e.classe_entree, e.annee_entree,
         e.decalage, e.sorti_le, e.famille_id, e.date_naissance
    from eleves e join familles f on f.id = e.famille_id
   where public.est_directrice()
      or exists (select 1 from classe_eleves ce join classes c on c.id = ce.classe_id
                  where ce.eleve_id = e.id and c.annee_scolaire = p_annee and public.enseigne_dans(c.id))
   order by 3, 2;
$$;
revoke all on function public.eleves_bulletins(text) from public, anon;
grant execute on function public.eleves_bulletins(text) to authenticated;

-- Appréciation d'une matière sur le relevé de la période (Catéchisme).
create table if not exists public.releves_notes_appreciations (
  releve_id uuid not null references public.releves_notes(id) on delete cascade,
  matiere_id uuid not null references public.matieres(id) on delete cascade,
  texte text,
  auteur uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (releve_id, matiere_id)
);
alter table public.releves_notes_appreciations enable row level security;
revoke all on public.releves_notes_appreciations from anon;

create or replace function public.releve_modifiable(p_releve uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_directrice() or exists (select 1 from releves_notes where id = p_releve and statut in ('nouveau', 'en_cours', 'pret'));
$$;
revoke all on function public.releve_modifiable(uuid) from public, anon;
grant execute on function public.releve_modifiable(uuid) to authenticated;

drop policy if exists rn_appreciations_lecture on public.releves_notes_appreciations;
create policy rn_appreciations_lecture on public.releves_notes_appreciations for select to authenticated
  using (exists (select 1 from releves_notes r where r.id = releve_id and public.enseigne_dans(r.classe_id)));
drop policy if exists rn_appreciations_ecriture on public.releves_notes_appreciations;
create policy rn_appreciations_ecriture on public.releves_notes_appreciations for all to authenticated
  using (public.peut_noter(matiere_id) and public.releve_modifiable(releve_id))
  with check (public.peut_noter(matiere_id) and public.releve_modifiable(releve_id));

create or replace function public.rn_appreciations_touche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.auteur := coalesce(auth.uid(), new.auteur);
  update releves_notes set statut = 'en_cours' where id = new.releve_id and statut = 'nouveau';
  return new;
end;
$$;
drop trigger if exists rn_appreciations_touche on public.releves_notes_appreciations;
create trigger rn_appreciations_touche before insert or update on public.releves_notes_appreciations
  for each row execute function public.rn_appreciations_touche();
