-- 13/10/2026 — Nom d'usage de l'élève (bulletins) : le nom de la fiche famille peut différer de celui de l'école
-- (« Picard A » / « Picard H » pour deux foyers, nom composé abrégé). À défaut, le nom de la famille.

alter table public.eleves add column if not exists nom_usage text;

create or replace function public.eleves_bulletins(p_annee text)
returns table (id uuid, prenom text, nom text, classe_entree text, annee_entree text, decalage integer, sorti_le date, famille_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(e.prenom, e.initiale), coalesce(nullif(btrim(e.nom_usage), ''), f.nom), e.classe_entree, e.annee_entree,
         e.decalage, e.sorti_le, e.famille_id
    from eleves e join familles f on f.id = e.famille_id
   where public.est_directrice()
      or exists (select 1 from classe_eleves ce join classes c on c.id = ce.classe_id
                  where ce.eleve_id = e.id and c.annee_scolaire = p_annee and public.enseigne_dans(c.id))
   order by 3, 2;
$$;

-- Directrice : modifier le nom d'usage d'un élève (elle n'a pas l'écriture sur la table des élèves).
create or replace function public.eleve_nom_usage(p_eleve uuid, p_nom text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  update eleves set nom_usage = nullif(btrim(p_nom), '') where id = p_eleve;
end;
$$;
revoke all on function public.eleve_nom_usage(uuid, text) from public, anon;
grant execute on function public.eleve_nom_usage(uuid, text) to authenticated;
