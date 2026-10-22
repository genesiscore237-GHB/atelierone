import { CentreAlertes } from "./_components/CentreAlertes";

export const dynamic = "force-dynamic";

/** P2.2 — l'ancien écran `alert.getActiveAlerts` était une impasse : cette page le relie aux alertes réelles. */
export default function Page() {
  return <CentreAlertes />;
}
