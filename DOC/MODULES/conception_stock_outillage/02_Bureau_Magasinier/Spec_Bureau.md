# Module B1 — Bureau du magasinier

## Rôle du bureau

Le bureau n’est **pas** un 5e grand magasin : c’est le **point de distribution**.  
Le magasinier y maintient un stock tampon des articles à rotation quotidienne (consommables, petites pièces, outils courants).

## 1. Approvisionnement du bureau

**Action** : « Approvisionner le bureau »

| Champ | Détail |
|-------|--------|
| Article | Recherche catalogue |
| Emplacement source | Un des 4 magasins |
| Quantité | |
| Motif | Réassort, inventaire, urgence… |
| Qui / Quand | Automatique |

**Effet stock** :
- − quantité sur Magasin source
- + quantité sur Bureau
- Mouvement type `APPROVISIONNEMENT_BUREAU` (tracé)

## 2. Stock du bureau

Vue dédiée :
- Liste des articles présents au bureau
- Quantité, seuil d’alerte bureau, statut (OK / Sous seuil)
- Bouton « Approvisionner » si sous seuil

## 3. Sorties depuis le bureau

Deux natures :

| Nature | Vers | Retour ? | Lien OR |
|--------|------|----------|---------|
| **Dotation consommable** | OR et/ou Technicien | Non | Fortement recommandé |
| **Prêt d’outil** | Technicien | **Oui** | Facultatif |
| **Sortie pièce pour OR** | OR (atelier) | Possible si non posée | Obligatoire |

Toutes les sorties génèrent un mouvement de stock formalisé.

## 4. Seuils d’alerte bureau

Exemple : Huile 5W40 — seuil bureau = 3 → suggestion d’approvisionnement.  
L’alerte est visible sur le tableau de bord magasinier et sur la page Bureau.
