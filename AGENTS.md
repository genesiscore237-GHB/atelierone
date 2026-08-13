## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Règle UX minimale (obligatoire pour toute interface)

Toute page ou fonctionnalité livrée doit satisfaire le standard UX suivant, faute de quoi elle est considérée comme « non exploitable » :

1. **Recherche / filtrage** : toute liste (caisses, utilisateurs, produits, factures, etc.) doit proposer une recherche par texte dès qu'elle peut dépasser ~10 éléments.
2. **Validation explicite et persistante** : chaque modification doit passer par un bouton type **Enregistrer / Valider** qui écrit réellement en backend et appelle `invalidate()` sur les queries concernées. Interdit de laisser des champs modifiables sans bouton de soumission.
3. **Feedback** : toute action réussie ou échouée affiche un `toast()` (sonner) — jamais de `alert()`/`confirm()` brut (confirmer via un état React propre est toléré).
4. **États** : gérer loading (skeleton ou spinner), empty state et erreur serveur affichée.
5. **Désactivation / suppression** : toute action destructive doit être confirmée et reflétée immédiatement dans la liste parente.
6. **Permissions sincères** : l'interface doit masquer ou désactiver les boutons dont l'utilisateur n'a pas la permission (vérifiée serveur), en cohérence avec les endpoints TRPC, avec un message clair en cas de refus.

Cette règle s'applique à toutes les modifications futures, notamment les modules Caisse, POS, Settings et toute nouvelle interface.
