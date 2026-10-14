-- 14/10/2026 — Option de la Directrice : taux de présentiel sur les bulletins (par classe) ;
-- relevés maternelle validés lisibles dans l'Espace famille. Strictement additif.

alter table public.classes add column if not exists presentiel_bulletin boolean not null default false;

-- Relevés maternelle validés des enfants de la famille, prêts à afficher (matières, niveaux, commentaires, absences).
create or replace function public.releves_maternelle_famille() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x ->> 'annee' desc, (x ->> 'tri')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', r.id,
      'eleve_id', r.eleve_id,
      'prenom', coalesce(e.prenom, e.initiale),
      'nom', f.nom,
      'classe', c.nom,
      'titulaire', (select trim(coalesce(t.civilite || ' ', '') || t.prenom || ' ' || t.nom) from enseignants t where t.id = c.titulaire_id),
      'annee', r.annee_scolaire,
      'trimestre', coalesce(r.trimestre, p.trimestre),
      'periode', case when p.id is not null then jsonb_build_object('ordre', p.ordre, 'debut', p.debut, 'fin', p.fin, 'libelle', p.libelle) end,
      'debut', coalesce(p.debut, (select min(q.debut) from periodes q where q.annee_scolaire = r.annee_scolaire and q.trimestre = r.trimestre)),
      'fin', coalesce(p.fin, (select max(q.fin) from periodes q where q.annee_scolaire = r.annee_scolaire and q.trimestre = r.trimestre)),
      'tri', coalesce(p.ordre, r.trimestre * 100),
      'appreciation', r.appreciation,
      'valide_le', r.valide_le,
      'matieres', (select coalesce(jsonb_agg(jsonb_build_object('nom', m.nom, 'niveau', l.niveau, 'commentaire', l.commentaire) order by m.ordre, m.created_at), '[]'::jsonb)
                     from maternelle_matieres m left join releve_maternelle_lignes l on l.matiere_id = m.id and l.releve_id = r.id
                    where m.classe_id = r.classe_id and (m.actif or l.releve_id is not null))
    ) x
    from releves_maternelle r
    join eleves e on e.id = r.eleve_id
    join familles f on f.id = e.famille_id
    join classes c on c.id = r.classe_id
    left join periodes p on p.id = r.periode_id
    where r.statut = 'valide' and e.famille_id = public.ma_famille()
  ) s;
$$;
revoke all on function public.releves_maternelle_famille() from public, anon;
grant execute on function public.releves_maternelle_famille() to authenticated;
