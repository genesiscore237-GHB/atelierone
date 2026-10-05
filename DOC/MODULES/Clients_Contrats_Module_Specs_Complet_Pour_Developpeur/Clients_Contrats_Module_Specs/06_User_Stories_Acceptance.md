# 06 — USER STORIES & CRITÈRES D’ACCEPTANCE

### Epic 1 — Fiche Client (Priorité 1)

**US1.1** Créer un client Particulier  
**US1.2** Créer un client Entreprise (contrat ou ponctuelle)  
**US1.3** Modifier et consulter la fiche client  
**US1.4** Voir le solde et l’historique synthétique depuis la fiche  

**Acceptance clés :** Type obligatoire, téléphone obligatoire, solde visible, statut géré.

### Epic 2 — Contrats (Priorité 1)

**US2.1** Créer un contrat de maintenance  
**US2.2** Affecter / retirer des véhicules au contrat  
**US2.3** Voir les contrats d’un client  
**US2.4** Renouveler ou résilier un contrat  

**Acceptance :** Numéro unique, dates, conditions de paiement, lien véhicules, statuts corrects.

### Epic 3 — Créances & Solde (Priorité 1)

**US3.1** Consulter le solde d’un client en temps réel  
**US3.2** Voir la liste des factures ouvertes avec jours de retard  
**US3.3** Tableau de bord « Créances clients » (total, en retard, à relancer)  

### Epic 4 — Relances (Priorité 2)

**US4.1** Enregistrer une relance  
**US4.2** Voir l’historique des relances d’un client  
**US4.3** Liste des clients à relancer  

### Epic 5 — Facturation groupée (Priorité 2)

**US5.1** Générer une facture récapitulative sur une période pour un contrat/client  
**US5.2** Lier les OR/interventions inclus dans la facture groupée  

### Epic 6 — Vue 360° & Pilotage (Priorité 2)

**US6.1** Vue 360° client (contrats + véhicules + OR + factures + relances)  
**US6.2** Alertes contrats arrivant à échéance  

---

**Règle de test :** Chaque US doit avoir happy path + cas limite (client bloqué, contrat expiré, solde négatif, etc.).
