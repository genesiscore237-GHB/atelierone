-- Migration taxonomie outillage (P3.3)
-- Canonique retenue : "Outillage d'atelier" (G13, id 293). Racine 11 "Outillage" est
-- is_active=false (masquée par listCategories) ; AUCUNE suppression, arbre conservé.
-- Ré-affectation des 4 articles orphelins encore liés à la feuille 1440 (DEMO-OUTCLES)
-- vers leurs équivalents canoniques G13 (mapping métier, prouvable).
UPDATE produit_articles SET categorie_id = 305 WHERE id = 569; -- Clé dynamométrique 40-200 N·m  -> Clé dynamométrique (G130111)
UPDATE produit_articles SET categorie_id = 308 WHERE id = 580; -- Ponceuse d'atelier scénario    -> Meuleuse (G130202)
UPDATE produit_articles SET categorie_id = 317 WHERE id = 581; -- Multimètre d'atelier scénario   -> Multimètre (G130303)
UPDATE produit_articles SET categorie_id = 309 WHERE id = 582; -- Dévireuse à chocs scénario      -> Clé à chocs (G130203)