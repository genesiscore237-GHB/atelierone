# Charte UX / UI — AtelierOne

> Document de référence pour toute nouvelle interface. Complète `DESIGN.md`
> (tokens visuels) avec les règles d'architecture d'écran, de navigation et
> d'interaction. Aucune nouvelle fonctionnalité ne doit improviser : suivre
> ce document, et le compléter si un cas manque.

---

## 1. Architecture de navigation

### Niveaux

| Niveau | Vue | Rôle |
|---|---|---|
| 0 — **Bureau** | `/dashboard` | Écran d'accueil immersif : sélection de domaine |
| 1 — **Domaine** | `/dashboard/<domaine>` | Hub du domaine : liste des modules (lignes compactes) |
| 2 — **Module** | `/dashboard/<domaine>/<module>` | Page fonctionnelle avec breadcrumb + tabs |
| 3 — **Sous-page** | `/dashboard/<domaine>/<module>/<action>` | Détail, création, édition |

### Règles

1. **Bureau** : seul endroit autorisé à utiliser le **bento**. Cartes strictement
   **égales** (même hauteur/largeur), maximum 8 (les 8 domaines).
2. **Sidebar latérale** (mode Pilotage) : présente **le même menu que le Bureau**,
   en accordéons par domaine. Visible sur **toutes les pages sauf le Bureau**.
   - Desktop : fixe à gauche (w-60), scrollable, domaine actif ouvert par défaut.
   - Mobile : **drawer** (max 85vw) ouvert par le bouton hamburger du header.
   - Entrées filtrées par permissions ; sous-menus visibles seulement si autorisés.
3. **Header compact** : logo, Bureau, Pilotage, thème. Pas de doublon de menu
   dans le header quand la sidebar est affichée.
4. **Breadcrumb** (ModuleShell) : `Bureau > Domaine > Module` sur toutes les
   pages de domaine, avec retour cliquable. C'est le « revenir en arrière ».
5. **Tabs de sous-menus** (ModuleShell) : bandeau scrollable affiché sur les
   sous-pages d'un module/domaine ; masqué sur la page d'accueil du domaine
   (la liste du hub joue ce rôle).
6. **Mobile** : bottom nav = **5 entrées max** (Bureau + 4 domaines clés +
   Pilotage), permission-aware. La navigation complète reste dans le drawer.

### Registre central

Toute la navigation découle de `apps/nextjs/src/lib/app-nav.tsx`
(8 domaines → modules → sous-menus, icônes, couleurs, permissions).
**Interdiction** de coder des liens de navigation en dur ailleurs ;
ajouter une entrée au registre suffit.

---

## 2. Affichage des contenus (anti-bento)

Le bento est **invasif** dès qu'il y a plus de 4-6 éléments. Règles :

| Contenu | Pattern imposé |
|---|---|
| Domaines (Bureau) | Bento de cartes **égales** (seul cas autorisé) |
| Sous-menus d'un domaine (hub) | **Liste de lignes compactes** : icône + label + description + chevron, `divide-y`, hover |
| Liste de données (employés, véhicules, OR…) | **Table** pleine largeur, lignes divisées, header sticky, scroll horizontal |
| Synthèse / indicateurs | Rangée de **cartes KPI** (2-6 max, hauteurs égales) |
| Actions fréquentes | Boutons dans le header de page ou toolbar, jamais de bento |
| Longs formulaires | Sections groupées avec titres, jamais de cartes imbriquées |

Une ligne de liste = icône (40px) + titre bold 14px + description 12px muted +
chevron. Hover : `bg-accent/50`. C'est le pattern standard des hubs de domaine.

---

## 3. États obligatoires

Chaque page interactive doit gérer 4 états :

1. **Loading** : skeleton (`animate-pulse` bg-muted) ou spinner — jamais de
   flash blanc ni de « undefined ».
2. **Empty** : `EmptyState` (icône, titre, description, action optionnelle).
3. **Erreur serveur** : message lisible + possibilité de réessayer.
4. **Données** : l'état normal.

---

## 4. Feedback

- Toute action réussie ou échouée → **toast** (sonner). Jamais de `alert()`.
- Confirmation des actions destructives : dialogue de confirmation (état React
  propre), jamais de `confirm()`.
- Action destructive → reflétée immédiatement dans la liste parente
  (`invalidate()` des queries concernées).

---

## 5. Validation & persistance

- Chaque modification passe par un bouton explicite **Enregistrer / Valider**
  qui écrit réellement en backend.
- Interdiction des champs modifiables sans bouton de soumission.
- Désactivation/suppression : confirmée et reflétée dans la liste parente.

---

## 6. Permissions sincères

- Les boutons/entrées dont l'utilisateur n'a pas la permission sont **masqués
  ou désactivés** (vérification serveur), cohérents avec les endpoints tRPC.
- Refus serveur → message clair (toast / état d'erreur), jamais muet.
- `ModuleGuard` (client) + `MODULE_PERMISSIONS` (registre) font foi pour la
  navigation ; le backend reste la seule autorité.

---

## 7. Modules en développement

Un module non livré affiche `ModulePlaceholder` :
titre, rôle, fonctionnalités prévues, badge « En cours de développement »,
retour au domaine. Aucune donnée factice.

---

## 8. Responsive

- Desktop ≥ 1024 : sidebar + contenu max-w 1600px.
- Tablette 768–1023 : sidebar présente (desktop) ; tables scrollables.
- Téléphone < 768 : drawer, bottom nav 5 entrées, tables pleine largeur.

---

## 9. Checklist de livraison (toute nouvelle page)

- [ ] Navigation déclarée dans `app-nav.tsx` (jamais en dur)
- [ ] Breadcrumb + tabs via `ModuleShell` (si page de domaine)
- [ ] Permissions : ModuleGuard + filtre des entrées
- [ ] États loading / empty / erreur gérés
- [ ] Toasts sur les actions, validation explicite
- [ ] Tests dans tous les thèmes (au minimum light/dark) + mobile
- [ ] Aucun bento hors du Bureau
