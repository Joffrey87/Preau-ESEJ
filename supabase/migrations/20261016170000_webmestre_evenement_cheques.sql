-- Webmestre : pages Événement (/evenement*) et Dépôt de chèques (/cheques) ajoutées au catalogue des droits.
-- Additif et non cassant : valeurs par défaut = accès actuels du code (roles.ts, nav.ts, middleware).
--   /cheques : Trésorier, Président, Directrice en modification ; les autres masqué.
--   /evenement* : Trésorier en modification ; Président et Directrice en lecture seule ; les autres masqué.
-- Les comptes du profil Événement (@evenement.esej) gardent leurs accès propres (hors grille).

insert into public.acces_pages (cle, libelle, section, ordre) values
  ('/cheques', 'Dépôt de chèques', 'Comptabilité', 15),
  ('/evenement', 'Événements', 'Événements', 55),
  ('/evenement/membres', 'Membres', 'Événements', 56),
  ('/evenement/facturation', 'Facturation', 'Événements', 57),
  ('/evenement/carnet', 'Carnet d''adresses (Événement)', 'Événements', 58)
on conflict (cle) do nothing;

insert into public.acces_profils (profil, page, niveau)
select r.profil, p.cle,
  case
    when p.cle = '/cheques' and r.profil in ('tresorier', 'president', 'directrice') then 'modification'
    when p.cle like '/evenement%' and r.profil = 'tresorier' then 'modification'
    when p.cle like '/evenement%' and r.profil in ('president', 'directrice') then 'lecture'
    else 'masque'
  end
from (values ('/cheques'), ('/evenement'), ('/evenement/membres'), ('/evenement/facturation'), ('/evenement/carnet')) p(cle)
cross join (values ('president'),('tresorier'),('secretaire'),('administrateur'),('directrice'),('directeur-spirituel'),('resp-mecenat'),('recherche-fonds')) r(profil)
on conflict (profil, page) do nothing;

insert into public.acces_historique (auteur, action, detail)
values ('système', 'catalogue', 'Ajout de Dépôt de chèques et des pages Événement ; droits initiaux = accès existants');