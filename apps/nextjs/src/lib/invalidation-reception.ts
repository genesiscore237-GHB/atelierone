/**
 * LOT U5 (E11) — Invalidation des caches après une réception.
 *
 * P2-6 : seuls `or.list` et `vehicules.list` étaient invalidés. Une réception
 * modifie pourtant bien davantage de données, et chaque cache resté périmé est
 * une information fausse affichée à l'agent.
 *
 * Le risque n'est pas qu'une requête soit oubliée à chaque fois : c'est que
 * l'oubli soit SILENCIEUX. La liste est donc centralisée ici, avec le motif
 * de chaque invalidation, pour qu'un prochain ajout se fasse en un endroit et
 * non à l'intuition.
 *
 * Rappel : `invalidate()` marque le cache périmé ; la requête n'est rejouée
 * qu'au montage ou à la lecture suivante. C'est le comportement voulu — on ne
 * force pas un rafraîchissement coûteux pour une liste que l'agent ne regarde
 * pas.
 */

type Utils = any;

/** Données réellement écrites par `or.receptionner`, et cache associé. */
export const INVALIDATIONS_RECEPTION: { chemin: string; motif: string }[] = [
  { chemin: "or.list", motif: "un dossier d'intervention vient d'être ouvert" },
  { chemin: "or.getDashboard", motif: "le tableau de bord atelier compte les dossiers ouverts" },
  { chemin: "or.getAlertes", motif: "une réception peut créer un retard ou une alerte de dossier" },
  { chemin: "or.rechercherReception", motif: "la recherche réception doit voir le véhicule et le client créés" },
  { chemin: "vehicules.list", motif: "véhicule créé ou réconcilié" },
  { chemin: "vehicules.listeCanonique", motif: "la liste canonique du parc doit voir le véhicule et sa position" },
  { chemin: "vehicules.get", motif: "la fiche véhicule peut avoir reçu un km ou un propriétaire" },
  { chemin: "vehicules.typesUtilises", motif: "un type de véhicule libre peut avoir été ajouté" },
  { chemin: "clients.list", motif: "un client a pu être créé" },
  { chemin: "clients.suggestionsClients", motif: "le dédoublonnage (R5) peut avoir marqué un doublon" },
  { chemin: "garage.overview", motif: "le registre parking a été projeté (statut du véhicule modifié)" },
  { chemin: "garage.vehicles", motif: "la liste du registre parking doit voir le nouveau passage" },
  { chemin: "garage.vehicule", motif: "la fiche parking du véhicule peut avoir changé" },
  { chemin: "garage.alertes", motif: "le véhicule entre au garage : les alertes de retard changent" },
  { chemin: "atelierKpi.getSanteGarage", motif: "les indicateurs de santé intègrent l'immobilisation" },
];

/**
 * Invalide tout ce qu'une réception a pu modifier.
 *
 * Une route absente est ignorée sans erreur : la réception est DÉJÀ
 * enregistrée à ce stade, une(route manquante) ne doit pas faire échouer le
 * retour à l'utilisateur et lui laisser croire que l'enregistrement a échoué.
 */
export async function invaliderApresReception(utils: Utils): Promise<void> {
  await Promise.all(
    INVALIDATIONS_RECEPTION.map(({ chemin }) => {
      const [routeur, ...reste] = chemin.split(".");
      let cible: any = utils?.[routeur];
      for (const segment of reste) {
        cible = cible?.[segment];
        if (!cible) return Promise.resolve();
      }
      return typeof cible?.invalidate === "function" ? cible.invalidate() : Promise.resolve();
    }),
  );
}
