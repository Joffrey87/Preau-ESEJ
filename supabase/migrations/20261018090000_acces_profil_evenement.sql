-- Profil Événement (comptes <prénom>@evenement.esej, mon_role() = 'evenement') : absent de la matrice des droits
-- du Webmestre, il voyait toutes les pages du catalogue « masquées » → menu latéral vide.
-- Additif : ses quatre onglets en modification (comme avant le Webmestre) ; le reste reste masqué par défaut.
insert into public.acces_profils (profil, page, niveau) values
  ('evenement', '/evenement', 'modification'),
  ('evenement', '/evenement/membres', 'modification'),
  ('evenement', '/evenement/facturation', 'modification'),
  ('evenement', '/evenement/carnet', 'modification')
on conflict (profil, page) do nothing;
