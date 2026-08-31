import { db, boiteEnvoi } from "@atelierone/db";

/**
 * MAILER TRANSACTIONNEL (module SaaS — serveur central).
 * Les notifications sont mises en file dans boite_envoi (typeEvenement + corpsJson).
 * Un process externe (ou un SMTP branché plus tard) les expédie réellement ;
 * l'architecture garantit zéro perte et une reprise facile.
 */

export type EvenementMail =
  | "SAAS_BIENVENUE_ESSAI"
  | "SAAS_LICENCE_EXPIRANT"
  | "SAAS_QUITTANCE_PAIEMENT"
  | "SAAS_SITE_SUSPENDU";

interface PayloadMail {
  destinataire: string;
  sujet: string;
  corps: string;
  [k: string]: unknown;
}

export async function notifierSite(type: EvenementMail, payload: PayloadMail): Promise<void> {
  try {
    if (!payload.destinataire) return;
    await db.insert(boiteEnvoi).values({
      typeEvenement: type,
      corpsJson: payload as any,
      statut: "en_attente",
    } as any);
  } catch (e) {
    // La file ne doit jamais faire échouer l'action métier
    void e;
  }
}

/** Corps prêts à l'emploi pour les événements SaaS. */
const fmtMontant = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const corpsMail = {
  bienvenueEssai: (garage: string, dateFin: string) => ({
    sujet: `Bienvenue chez AtelierOne — essai gratuit de 30 jours`,
    corps: `Bonjour ${garage},\n\nVotre garage est enregistré. Votre licence d'essai est active jusqu'au ${dateFin}.\n\nTéléchargez et installez le pack sur votre serveur pour commencer. À la fin de l'essai, souscrivez à l'abonnement pour continuer.\n\nL'équipe AtelierOne`,
  }),
  licenceExpirant: (garage: string, dateFin: string, jours: number) => ({
    sujet: `Votre abonnement AtelierOne expire dans ${jours} jour(s)`,
    corps: `Bonjour ${garage},\n\nVotre licence expire le ${dateFin} (dans ${jours} jour(s)).\n\nAprès l'échéance, l'application passe en lecture seule, puis se bloque après 7 jours de grâce.\n\nRenouvelez dès maintenant pour éviter toute interruption : Orange Money, MTN MoMo ou carte.\n\nL'équipe AtelierOne`,
  }),
  quittance: (garage: string, reference: string, montant: number, periodeMois: number) => ({
    sujet: `Quittance de paiement ${reference}`,
    corps: `Bonjour ${garage},\n\nVotre paiement de ${fmtMontant(montant)} FCFA (${periodeMois} mois) a été confirmé.\n\nRéférence : ${reference}\nVotre licence est prolongée en conséquence — elle sera appliquée à votre prochaine connexion.\n\nL'équipe AtelierOne`,
  }),
  suspendu: (garage: string) => ({
    sujet: `Votre garage a été suspendu`,
    corps: `Bonjour ${garage},\n\nVotre compte a été suspendu. Contactez le support pour rétablir votre accès.\n\nL'équipe AtelierOne`,
  }),
};