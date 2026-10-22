import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Le domaine « Clients » ouvre directement la liste.
 *
 * L'ancien hub affichait des cartes de modules sans aucun client : l'agent
 * devait deviner que « Clients » menait ailleurs. La liste porte désormais
 * les liens vers les contrats et les doublons, donc le hub n'apporte plus
 * d'information.
 */
export default function ClientsHubPage() {
  redirect("/dashboard/customers");
}
