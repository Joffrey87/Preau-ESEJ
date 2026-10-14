-- 23/10/2026 — Onglet « Médailles Don » de la Directrice : le tableau des dons (hors dons boursiers) en lecture, avec
-- la colonne Médaille qu'elle coche (definir_medaille_don l'autorise déjà). Page inscrite dans la grille du Webmestre.

drop policy if exists dons_lecture_directrice on public.dons;
create policy dons_lecture_directrice on public.dons for select to authenticated
  using (public.mon_role() = 'directrice' and coalesce(don_boursier, false) = false and supprime_le is null);

insert into public.acces_pages (cle, libelle, section, ordre) values ('/dons/medailles', 'Médailles Don', 'Financement', 34)
on conflict (cle) do nothing;
insert into public.acces_profils (profil, page, niveau)
select r.profil, '/dons/medailles',
  case when r.profil in ('directrice', 'tresorier') then 'modification' else 'masque' end
from (values ('president'),('tresorier'),('secretaire'),('administrateur'),('directrice'),('directeur-spirituel'),('resp-mecenat'),('recherche-fonds')) r(profil)
on conflict (profil, page) do nothing;
insert into public.acces_historique (auteur, action, detail)
values ('système', 'catalogue', 'Ajout de l''onglet Médailles Don ; Directrice et Trésorier en modification');
