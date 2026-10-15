import { AtelierAlertes } from "./_components/AtelierAlertes";

export const dynamic = "force-dynamic";

/** LOT A2 (E15) — rend `or.getAlertes` accessible (elle n'était appelée par aucune UI). */
export default function AtelierAlertesPage() {
  return <AtelierAlertes />;
}