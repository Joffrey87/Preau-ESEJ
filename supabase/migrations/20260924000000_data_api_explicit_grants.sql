-- ============================================================
-- Grants explicites sur la Data API (public schema).
--
-- À partir du 30 octobre 2026, Supabase arrête d'accorder automatiquement
-- les privilèges Postgres nécessaires à la Data API pour toute nouvelle
-- table de public (voir email Supabase du 23/09/2026). Les tables déjà
-- créées gardent leurs droits actuels sur CE projet — mais si l'historique
-- de migration est rejoué (nouveau projet, branche de preview, `supabase
-- db reset`), seules les tables dont la migration contient un GRANT
-- explicite restent accessibles depuis l'app après cette date.
--
-- Cette migration rend explicites, pour toutes les tables existantes, les
-- droits qui étaient jusqu'ici accordés implicitement. Aucune policy RLS de
-- ce projet ne référence `anon` : seuls `authenticated` (membres du bureau,
-- toutes les policies sont "for all to authenticated") et `service_role`
-- reçoivent des privilèges.
--
-- ATTENTION : 5 tables (correspondances, profils, affectations_scolarite,
-- journal_operations, releve_import) n'ont aucune migration de création
-- dans l'historique suivi par Supabase — elles ont été créées hors du
-- système de migration. Cette migration leur ajoute des grants explicites,
-- mais un rejeu complet de l'historique (nouveau projet, `db reset`) ne les
-- recréerait pas. À traiter séparément si des environnements rejoués sont
-- envisagés pour ce projet.
--
-- Règle à suivre pour toute future table : ajouter les GRANT nécessaires
-- dans la même migration que le CREATE TABLE.
-- ============================================================

grant select, insert, update, delete on public.exercices               to authenticated, service_role;
grant select, insert, update, delete on public.comptes                 to authenticated, service_role;
grant select, insert, update, delete on public.categories              to authenticated, service_role;
grant select, insert, update, delete on public.operations              to authenticated, service_role;
grant select, insert, update, delete on public.budget_lignes           to authenticated, service_role;
grant select, insert, update, delete on public.organisation            to authenticated, service_role;
grant select, insert, update, delete on public.dons                    to authenticated, service_role;
grant select, insert, update, delete on public.scolarite_bareme        to authenticated, service_role;
grant select, insert, update, delete on public.scolarite_inscriptions  to authenticated, service_role;
grant select, insert, update, delete on public.contacts                to authenticated, service_role;
grant select, insert, update, delete on public.echeances               to authenticated, service_role;
grant select, insert, update, delete on public.prospects               to authenticated, service_role;
grant select, insert, update, delete on public.coffre                  to authenticated, service_role;
grant select, insert, update, delete on public.taches                  to authenticated, service_role;
grant select, insert, update, delete on public.evenements              to authenticated, service_role;
grant select, insert, update, delete on public.financements            to authenticated, service_role;
grant select, insert, update, delete on public.modele_recu             to authenticated, service_role;

-- Tables sans migration de création trouvée (voir avertissement ci-dessus)
grant select, insert, update, delete on public.correspondances         to authenticated, service_role;
grant select, insert, update, delete on public.profils                 to authenticated, service_role;
grant select, insert, update, delete on public.affectations_scolarite  to authenticated, service_role;
grant select, insert, update, delete on public.journal_operations      to authenticated, service_role;
grant select, insert, update, delete on public.releve_import           to authenticated, service_role;
