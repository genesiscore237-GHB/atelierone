# Règles métier non négociables

1. **Un article = une fiche** dans le catalogue (pas de doublons).
2. **Toute quantité vit dans un emplacement** (Magasin 1…4 ou Bureau).
3. **Tout mouvement est tracé** (qui, quand, d’où, vers où, motif, OR si applicable).
4. **Sortie pièce vers l’atelier** porte obligatoirement un OR.
5. **Un outil en prêt ne peut pas être prêté une seconde fois** tant qu’il n’est pas retourné.
6. **Retour d’outil ≠ OK** → remarque obligatoire + nouveau statut.
7. **Prix catalogue nullable** ; le prix réel est celui de la ligne d’OR.
8. **Le bureau se réapprovisionne uniquement par transfert tracé** depuis un magasin (pas de « création magique » de stock).
9. **Les permissions masquent/désactivent** les actions non autorisées (règle UX projet).
10. **Les listes > 10 éléments** ont une recherche (règle UX projet).

---

## Synthèse pour l’IA développeur

Implémenter dans cet ordre recommandé :
1. Modèle Article + Emplacement + Stock par emplacement
2. Mouvements de stock génériques
3. Transfert / Approvisionnement bureau
4. Cycle prêt outil (statuts + alertes retard)
5. Dotation consommable
6. UI Catalogue + UI Bureau/Outillage
7. Branchement depuis l’onglet Pièces des OR
