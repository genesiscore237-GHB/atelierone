-- ============================================================
-- SEED : Données de référence du système éducatif camerounais
-- Compatible MINEDUB & MINESEC, Francophone & Anglophone
-- Idempotent : peut être exécuté plusieurs fois
-- ============================================================

-- 1. SOUS-SYSTEMES (déjà existants, idempotent)
INSERT INTO sous_systemes (code, libelle) VALUES ('FR', 'Francophone') ON CONFLICT (code) DO NOTHING;
INSERT INTO sous_systemes (code, libelle) VALUES ('EN', 'Anglophone') ON CONFLICT (code) DO NOTHING;

-- 2. MINISTERES (déjà existants)
INSERT INTO ministeres (code, libelle) VALUES ('MINEDUB', 'Ministere de l''Education de Base') ON CONFLICT (code) DO NOTHING;
INSERT INTO ministeres (code, libelle) VALUES ('MINESEC', 'Ministere des Enseignements Secondaires') ON CONFLICT (code) DO NOTHING;
INSERT INTO ministeres (code, libelle) VALUES ('MINESUP', 'Ministere de l''Enseignement Superieur') ON CONFLICT (code) DO NOTHING;
INSERT INTO ministeres (code, libelle) VALUES ('MINEFOP', 'Ministere de l''Emploi et de la Formation Professionnelle') ON CONFLICT (code) DO NOTHING;

-- 3. FILIERES
INSERT INTO filieres (code, libelle) VALUES ('GEN', 'Generale') ON CONFLICT (code) DO NOTHING;
INSERT INTO filieres (code, libelle) VALUES ('TECH', 'Technique') ON CONFLICT (code) DO NOTHING;
INSERT INTO filieres (code, libelle) VALUES ('NORM', 'Normale (ENIEG/ENS)') ON CONFLICT (code) DO NOTHING;
INSERT INTO filieres (code, libelle) VALUES ('ART', 'Artistique') ON CONFLICT (code) DO NOTHING;
INSERT INTO filieres (code, libelle) VALUES ('BIL', 'Bilingue') ON CONFLICT (code) DO NOTHING;
INSERT INTO filieres (code, libelle) VALUES ('SPORT', 'Sportive') ON CONFLICT (code) DO NOTHING;
INSERT INTO filieres (code, libelle) VALUES ('AGR', 'Agro-Pastorale') ON CONFLICT (code) DO NOTHING;

-- 4. NIVEAUX (avec ordre corrigé pour couvrir tout le parcours)
-- Sous-système FR
INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'MAT', 'Maternelle', 1, id FROM sous_systemes WHERE code = 'FR'
ON CONFLICT (code) DO NOTHING;

INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'PRIM', 'Primaire', 2, id FROM sous_systemes WHERE code = 'FR'
ON CONFLICT (code) DO NOTHING;

INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'SEC', 'Secondaire', 3, id FROM sous_systemes WHERE code = 'FR'
ON CONFLICT (code) DO NOTHING;

INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'SUP', 'Superieur', 4, id FROM sous_systemes WHERE code = 'FR'
ON CONFLICT (code) DO NOTHING;

-- Sous-système EN
INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'NURSERY', 'Nursery', 1, id FROM sous_systemes WHERE code = 'EN'
ON CONFLICT (code) DO NOTHING;

INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'PRIMARY', 'Primary', 2, id FROM sous_systemes WHERE code = 'EN'
ON CONFLICT (code) DO NOTHING;

INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'SECONDARY', 'Secondary', 3, id FROM sous_systemes WHERE code = 'EN'
ON CONFLICT (code) DO NOTHING;

INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id)
SELECT 'HIGHER', 'Higher Education', 4, id FROM sous_systemes WHERE code = 'EN'
ON CONFLICT (code) DO NOTHING;

-- Update ordre (correction si déjà existant)
UPDATE niveaux SET ordre = 1 WHERE code IN ('MAT', 'NURSERY');
UPDATE niveaux SET ordre = 2 WHERE code IN ('PRIM', 'PRIMARY');
UPDATE niveaux SET ordre = 3 WHERE code IN ('SEC', 'SECONDARY');
UPDATE niveaux SET ordre = 4 WHERE code IN ('SUP', 'HIGHER');

-- 5. CLASSES (toutes les classes du système camerounais)
-- Maternelle FR
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'PS', 'Petite Section', id FROM niveaux WHERE code = 'MAT'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'MS', 'Moyenne Section', id FROM niveaux WHERE code = 'MAT'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'GS', 'Grande Section', id FROM niveaux WHERE code = 'MAT'
ON CONFLICT (code) DO NOTHING;

-- Nursery EN
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'N1', 'Nursery 1', id FROM niveaux WHERE code = 'NURSERY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'N2', 'Nursery 2', id FROM niveaux WHERE code = 'NURSERY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'N3', 'Nursery 3', id FROM niveaux WHERE code = 'NURSERY'
ON CONFLICT (code) DO NOTHING;

-- Primaire FR
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'SIL', 'Section d''Initiation au Langage (SIL)', id FROM niveaux WHERE code = 'PRIM'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'CP', 'Cours Preparatoire (CP)', id FROM niveaux WHERE code = 'PRIM'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'CE1', 'Cours Elementaire 1 (CE1)', id FROM niveaux WHERE code = 'PRIM'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'CE2', 'Cours Elementaire 2 (CE2)', id FROM niveaux WHERE code = 'PRIM'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'CM1', 'Cours Moyen 1 (CM1)', id FROM niveaux WHERE code = 'PRIM'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'CM2', 'Cours Moyen 2 (CM2)', id FROM niveaux WHERE code = 'PRIM'
ON CONFLICT (code) DO NOTHING;

-- Primary EN
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'C1', 'Class 1', id FROM niveaux WHERE code = 'PRIMARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'C2', 'Class 2', id FROM niveaux WHERE code = 'PRIMARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'C3', 'Class 3', id FROM niveaux WHERE code = 'PRIMARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'C4', 'Class 4', id FROM niveaux WHERE code = 'PRIMARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'C5', 'Class 5', id FROM niveaux WHERE code = 'PRIMARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'C6', 'Class 6', id FROM niveaux WHERE code = 'PRIMARY'
ON CONFLICT (code) DO NOTHING;

-- Secondaire FR (déjà existants : 6e, 5e, 4e, 3e, 2nde, 1ere, Tle)
INSERT INTO classes (code, libelle, niveau_id)
SELECT '6e', '6e', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT '5e', '5e', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT '4e', '4e', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT '3e', '3e', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT '2NDE', '2nde', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT '1ERE', '1ere', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'TLE', 'Tle', id FROM niveaux WHERE code = 'SEC'
ON CONFLICT (code) DO NOTHING;

-- Secondary EN (déjà existants : Form 1-5)
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'FORM1', 'Form 1', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'FORM2', 'Form 2', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'FORM3', 'Form 3', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'FORM4', 'Form 4', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'FORM5', 'Form 5', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'L6', 'Lower Sixth', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;
INSERT INTO classes (code, libelle, niveau_id)
SELECT 'U6', 'Upper Sixth', id FROM niveaux WHERE code = 'SECONDARY'
ON CONFLICT (code) DO NOTHING;

-- 6. MATIERES
INSERT INTO matieres (code, libelle) VALUES ('ALL', 'Allemand') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('ANG', 'Anglais') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('ART', 'Arts Plastiques') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('BIO', 'Biology') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('CHEM', 'Chemistry') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('CIT', 'Citizenship / Education Civique') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('EC', 'ECM / Education Civique et Morale') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('EDM', 'Education a la Vie Familiale et Menagere') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('EPS', 'EPS / Education Physique et Sportive') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('ESP', 'Espagnol') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('FR', 'Francais') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('GEO', 'Geography') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('HG', 'Histoire-Geographie') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('HIST', 'History') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('ICT', 'Informatique / ICT') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('LIT', 'Literature') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('LN', 'Langues Nationales') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('MATH', 'Mathematiques') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('MATHS', 'Mathematics') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('MUS', 'Musique / Music') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('PHILO', 'Philosophie') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('PHY', 'Physique-Chimie') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('PHYSICS', 'Physics') ON CONFLICT (code) DO NOTHING;
INSERT INTO matieres (code, libelle) VALUES ('SVT', 'SVT / Sciences de la Vie et de la Terre') ON CONFLICT (code) DO NOTHING;

-- 7. UNITES DE MESURE
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('PCE', 'Piece', 'pc', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('DOZ', 'Douzaine', 'dz', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('PAQ', 'Paquet', 'paq', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('BOI', 'Boite', 'bt', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('RAM', 'Rame', 'rame', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('CAR', 'Carton', 'ctn', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('SAC', 'Sachet', 'sach', 'QUANTITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('KG', 'Kilogramme', 'kg', 'POIDS') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('G', 'Gramme', 'g', 'POIDS') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('L', 'Litre', 'L', 'VOLUME') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('M', 'Metre', 'm', 'LONGUEUR') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('CM', 'Centimetre', 'cm', 'LONGUEUR') ON CONFLICT (code) DO NOTHING;
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('SET', 'Kit / Set', 'set', 'QUANTITE') ON CONFLICT (code) DO NOTHING;

-- 8. ANNEES SCOLAIRES
INSERT INTO annees_scolaires (libelle, date_debut, date_fin, is_current) VALUES ('2023-2024', '2023-09-01', '2024-08-31', false) ON CONFLICT (libelle) DO NOTHING;
INSERT INTO annees_scolaires (libelle, date_debut, date_fin, is_current) VALUES ('2024-2025', '2024-09-01', '2025-08-31', false) ON CONFLICT (libelle) DO NOTHING;
INSERT INTO annees_scolaires (libelle, date_debut, date_fin, is_current) VALUES ('2025-2026', '2025-09-01', '2026-08-31', false) ON CONFLICT (libelle) DO NOTHING;
INSERT INTO annees_scolaires (libelle, date_debut, date_fin, is_current) VALUES ('2026-2027', '2026-09-01', '2027-08-31', true) ON CONFLICT (libelle) DO NOTHING;

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT '=== RESUMEN DU SEED ===' AS "";

SELECT 'niveaux' AS table_name, COUNT(*) AS total FROM niveaux
UNION ALL
SELECT 'classes', COUNT(*) FROM classes
UNION ALL
SELECT 'filieres', COUNT(*) FROM filieres
UNION ALL
SELECT 'matieres', COUNT(*) FROM matieres
UNION ALL
SELECT 'ministeres', COUNT(*) FROM ministeres
UNION ALL
SELECT 'unites_mesure', COUNT(*) FROM unites_mesure
UNION ALL
SELECT 'sous_systemes', COUNT(*) FROM sous_systemes
ORDER BY table_name;
