"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings, Save, Loader2, AlertTriangle } from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";

interface FormState {
  seuilSansEvolutionJours: string;
  seuilImmobilisationLongueJours: string;
  seuilAttenteClientJours: string;
  seuilAttentePieceJours: string;
  seuilPretSortieJour: string;
  seuilTransfertJours: string;
  margeSecuriteDefaut: string;
}

const emptyForm: FormState = {
  seuilSansEvolutionJours: "",
  seuilImmobilisationLongueJours: "",
  seuilAttenteClientJours: "",
  seuilAttentePieceJours: "",
  seuilPretSortieJour: "",
  seuilTransfertJours: "",
  margeSecuriteDefaut: "",
};

const CHAMPS: { key: keyof FormState; label: string; hint: string; step?: string }[] = [
  { key: "seuilSansEvolutionJours", label: "Sans évolution (jours)", hint: "Alerte « Sans évolution » si aucun changement de statut depuis ce délai.", step: "1" },
  { key: "seuilImmobilisationLongueJours", label: "Immobilisation longue (jours)", hint: "Alerte « Immobilisation longue » au-delà de ce délai de présence.", step: "1" },
  { key: "seuilAttenteClientJours", label: "Attente client (jours)", hint: "Alerte « Attente client » pour un véhicule terminé non récupéré.", step: "1" },
  { key: "seuilAttentePieceJours", label: "Attente pièce (jours)", hint: "Alerte « Attente pièce » au-delà de ce délai sans pièce commandée.", step: "1" },
  { key: "seuilPretSortieJour", label: "Prêt pour sortie (jours)", hint: "Alerte « Prêt pour sortie » après cette durée en statut terminé.", step: "1" },
  { key: "seuilTransfertJours", label: "Transfert à étudier (jours)", hint: "Alerte « Transfert à étudier » pour un véhicule sans évolution prolongée.", step: "1" },
  { key: "margeSecuriteDefaut", label: "Marge de sécurité par défaut (m)", hint: "Distance minimale imposée autour de chaque véhicule lors des placements.", step: "0.1" },
];

export default function GarageConfigurationPage() {
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  const canGererAlertes = hasPermission("parking.alertes.gerer");

  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading, isError, error, refetch } = api.garage.config.useQuery();

  const utils = api.useUtils();
  const save = api.garage.saveConfig.useMutation({
    onSuccess: () => {
      utils.garage.config.invalidate();
      toast.success("Configuration enregistrée");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      seuilSansEvolutionJours: String(data.seuilSansEvolutionJours),
      seuilImmobilisationLongueJours: String(data.seuilImmobilisationLongueJours),
      seuilAttenteClientJours: String(data.seuilAttenteClientJours),
      seuilAttentePieceJours: String(data.seuilAttentePieceJours),
      seuilPretSortieJour: String(data.seuilPretSortieJour),
      seuilTransfertJours: String(data.seuilTransfertJours),
      margeSecuriteDefaut: String(data.margeSecuriteDefaut),
    });
  }, [data]);

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canGererAlertes) return;
    const int = (v: string, min: number, max: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
    };
    const marge = Number(form.margeSecuriteDefaut);
    save.mutate({
      seuilSansEvolutionJours: int(form.seuilSansEvolutionJours, 1, 365),
      seuilImmobilisationLongueJours: int(form.seuilImmobilisationLongueJours, 1, 3650),
      seuilAttenteClientJours: int(form.seuilAttenteClientJours, 1, 365),
      seuilAttentePieceJours: int(form.seuilAttentePieceJours, 1, 365),
      seuilPretSortieJour: int(form.seuilPretSortieJour, 1, 365),
      seuilTransfertJours: int(form.seuilTransfertJours, 1, 3650),
      margeSecuriteDefaut: Number.isFinite(marge) ? Math.min(5, Math.max(0, marge)) : 0.3,
    });
  }

  if (isLoading || permsLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement de la configuration…
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error?.message ?? "Impossible de charger la configuration."} retryAction={() => void refetch()} />;
  }

  const isPending = save.isPending;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Configuration du parking</h2>
        <p className="text-sm text-muted-foreground">
          Seuils du moteur d'alertes et marge de sécurité par défaut (une seule configuration par site).
        </p>
      </div>

      {!canGererAlertes && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Vous pouvez consulter cette configuration, mais vous n'avez pas la permission
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">parking.alertes.gerer</code>
            pour la modifier.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings size={16} /> Seuils d'alertes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {CHAMPS.map((c) => (
              <div key={c.key} className="grid grid-cols-[160px_1fr] items-start gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">{c.label}</label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>
                </div>
                <input
                  type="number"
                  step={c.step}
                  min={c.key === "margeSecuriteDefaut" ? 0 : 1}
                  value={form[c.key]}
                  onChange={(e) => set(c.key, e.target.value)}
                  disabled={!canGererAlertes}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                />
              </div>
            ))}

            <div className="flex items-center justify-end gap-3 pt-2">
              {canGererAlertes && (
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 size={15} className="mr-1.5 animate-spin" />
                  ) : (
                    <Save size={15} className="mr-1.5" />
                  )}
                  Enregistrer
                </Button>
              )}
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Les seuils sont appliqués à la prochaine analyse. Lancez l'analyse depuis la page Alertes (ou la fiche d'un véhicule) pour
            recalculer les alertes avec ces valeurs.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}