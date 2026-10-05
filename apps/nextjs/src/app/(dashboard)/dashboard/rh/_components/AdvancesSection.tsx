"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  HandCoins,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";

const STATUT_LABELS: Record<string, string> = {
  DEMANDÉE: "Demandée",
  APPROUVÉE: "Approuvée",
  VERSÉE: "Versée",
  PARTIELLEMENT_RÉCUPÉRÉE: "Partiellement récupérée",
  RÉCUPÉRÉE: "Récupérée",
  ANNULÉE: "Annulée",
};

const STATUT_COLORS: Record<string, string> = {
  DEMANDÉE: "bg-warning/15 text-warning-foreground",
  APPROUVÉE: "bg-primary/15 text-primary",
  VERSÉE: "bg-success/15 text-success-foreground",
  PARTIELLEMENT_RÉCUPÉRÉE: "bg-warning/15 text-warning-foreground",
  RÉCUPÉRÉE: "bg-muted/15 text-muted-foreground line-through decoration-muted-foreground/40",
  ANNULÉE: "bg-destructive/15 text-destructive",
};

const MOYEN_LABELS: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement",
  cheque: "Chèque",
  mobile_money: "Mobile Money",
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function semaineCourante(): { debut: string; fin: string } {
  const d = new Date();
  const jour = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - jour);
  const debut = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 6);
  const fin = d.toISOString().slice(0, 10);
  return { debut, fin };
}

interface AvanceRow {
  id: number;
  reference?: string | null;
  dateDemande: string | null;
  dateApprobation: string | null;
  dateVersement: string | null;
  montant: string;
  motif: string | null;
  moyenPaiement: string | null;
  montantRecupere: string;
  soldeRestant: string;
  statut: string;
}

function dateDisplay(date: string | null): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AdvancesSection({
  employeId,
  devise,
  canModifier,
}: {
  employeId: string;
  devise: string;
  canModifier: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const peutModifier = canModifier && hasPermission("rh.paie.modifier");

  const { data: listData, isLoading, error, refetch } = api.rhAdvances.list.useQuery({ employeId: Number(employeId) });
  const synthese = listData?.synthese;
  const [search, setSearch] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [openRecup, setOpenRecup] = useState<AvanceRow | null>(null);
  const [openDetail, setOpenDetail] = useState<AvanceRow | null>(null);
  const [openAnnulation, setOpenAnnulation] = useState<{ avance: AvanceRow; mode: "refuser" | "annuler" } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ titre: string; description: string; exec: () => void } | null>(null);

  const filtrees = useMemo(() => {
    const rows = (listData?.rows ?? []) as AvanceRow[];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (a) =>
        (STATUT_LABELS[a.statut] ?? "").toLowerCase().includes(q) ||
        (a.motif ?? "").toLowerCase().includes(q) ||
        (a.reference ?? "").toLowerCase().includes(q)
    );
  }, [listData, search]);

  const after = (message: string) => {
    toast.success(message);
    utils.rhAdvances.list.invalidate();
    void refetch();
    router.refresh();
  };

  const annuler = api.rhAdvances.annuler.useMutation({
    onSuccess: () => after("Avance annulée"),
    onError: (e) => toast.error(e.message),
  });
  const refuser = api.rhAdvances.refuser.useMutation({
    onSuccess: () => after("Avance refusée"),
    onError: (e) => toast.error(e.message),
  });
  const approuver = api.rhAdvances.approuver.useMutation({
    onSuccess: () => after("Avance approuvée"),
    onError: (e) => toast.error(e.message),
  });
  const verser = api.rhAdvances.verser.useMutation({
    onSuccess: () => after("Avance versée"),
    onError: (e) => toast.error(e.message),
  });
  const recuperer = api.rhAdvances.enregistrerRecuperation.useMutation({
    onSuccess: () => {
      setOpenRecup(null);
      after("Récupération enregistrée");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((s) => (
          <div key={s} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4" /> {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par statut ou motif…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring"
          />
        </div>
        {peutModifier && (
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
          >
            <Plus size={14} /> Nouvelle avance
          </button>
        )}
      </div>

      {synthese && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total accordé", value: `${num(synthese.totalAccorde).toLocaleString("fr-FR")} ${devise}`, i: "bg-primary/10 text-primary" },
            { label: "Total récupéré", value: `${num(synthese.totalRecupere).toLocaleString("fr-FR")} ${devise}`, i: "bg-success/10 text-success-foreground" },
            { label: "Reste à récupérer", value: `${num(synthese.totalRestant).toLocaleString("fr-FR")} ${devise}`, i: "bg-warning/10 text-warning-foreground" },
            { label: `Soldées / actives / annulées`, value: `${synthese.soldees} / ${synthese.actives + synthese.partielles} / ${synthese.annulees}`, i: "bg-muted/10 text-muted-foreground" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-card/60 p-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{c.label}</p>
              <p className={`rounded-lg px-2 py-1 text-sm font-bold ${c.i}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {filtrees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {search ? "Aucune avance ne correspond à la recherche." : "Aucune avance enregistrée pour cet employé."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 text-left">Réf.</th>
                <th className="px-4 py-3 text-left">Date versement</th>
                <th className="px-4 py-3 text-left">Montant</th>
                <th className="px-4 py-3 text-left">Récupéré</th>
                <th className="px-4 py-3 text-left">Solde</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Motif</th>
                {peutModifier && <th className="px-4 py-3 text-right">Actions</th>}
                <th className="px-4 py-3 text-right">Historique</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((a) => (
                <tr key={a.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground">{a.reference ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{dateDisplay(a.dateVersement)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">{num(a.montant).toLocaleString("fr-FR")} {devise}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{num(a.montantRecupere).toLocaleString("fr-FR")} {devise}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{num(a.soldeRestant).toLocaleString("fr-FR")} {devise}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${STATUT_COLORS[a.statut] ?? "bg-muted/15 text-muted-foreground"}`}>
                      {STATUT_LABELS[a.statut] ?? a.statut}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-sm text-muted-foreground" title={a.motif ?? undefined}>
                    {a.motif || "—"}
                  </td>
                  {peutModifier && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {a.statut === "DEMANDÉE" && (
                          <>
                            <ActionBtn
                              title="Approuver"
                              onClick={() => setConfirmAction({ titre: "Approuver l'avance", description: `Approuver l'avance de ${num(a.montant).toLocaleString("fr-FR")} ${devise} ? Elle passera en « Approuvée ».`, exec: () => approuver.mutate({ advanceId: a.id }) })}
                              icon={<Check className="h-3.5 w-3.5" />}
                            />
                            <ActionBtn
                              title="Refuser"
                              onClick={() => setOpenAnnulation({ avance: a, mode: "refuser" })}
                              icon={<X className="h-3.5 w-3.5" />}
                              danger
                            />
                          </>
                        )}
                        {a.statut === "APPROUVÉE" && (
                          <>
                            <ActionBtn
                              title="Verser"
                              onClick={() => setConfirmAction({ titre: "Verser l'avance", description: `Verser l'avance de ${num(a.montant).toLocaleString("fr-FR")} ${devise} ? Elle passera en « Versée ».`, exec: () => verser.mutate({ advanceId: a.id }) })}
                              icon={<Wallet className="h-3.5 w-3.5" />}
                            />
                            <ActionBtn
                              title="Refuser"
                              onClick={() => setOpenAnnulation({ avance: a, mode: "refuser" })}
                              icon={<X className="h-3.5 w-3.5" />}
                              danger
                            />
                          </>
                        )}
                        {!["DEMANDÉE", "APPROUVÉE", "ANNULÉE", "RÉCUPÉRÉE"].includes(a.statut) && (
                          <>
                            <ActionBtn
                              title="Enregistrer une récupération"
                              onClick={() => setOpenRecup(a)}
                              icon={<HandCoins className="h-3.5 w-3.5" />}
                            />
                            <ActionBtn
                              title="Annuler l'avance"
                              onClick={() => setOpenAnnulation({ avance: a, mode: "annuler" })}
                              icon={<RotateCcw className="h-3.5 w-3.5" />}
                              danger
                            />
                          </>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <ActionBtn
                        title="Historique des récupérations"
                        onClick={() => setOpenDetail(a)}
                        icon={<History className="h-3.5 w-3.5" />}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openCreate && (
        <SaisieModal
          employeId={Number(employeId)}
          devise={devise}
          onClose={() => setOpenCreate(false)}
          onSaved={() => {
            setOpenCreate(false);
            after("Avance enregistrée (statut : Demandée)");
          }}
        />
      )}

      {openRecup && (
        <RecuperationModal
          avance={openRecup}
          devise={devise}
          onClose={() => setOpenRecup(null)}
          onSaved={(montant) => recuperer.mutate({ advanceId: openRecup.id, montant, dateRecuperation: new Date().toISOString().slice(0, 10) })}
          isPending={recuperer.isPending}
        />
      )}

      {openDetail && (
        <DetailHistoryModal avance={openDetail} devise={devise} onClose={() => setOpenDetail(null)} />
      )}

      {openAnnulation && (
        <AnnulationModal
          avance={openAnnulation.avance}
          mode={openAnnulation.mode}
          devise={devise}
          onClose={() => setOpenAnnulation(null)}
          onConfirm={(motif) => {
            if (openAnnulation.mode === "refuser") {
              refuser.mutate({ advanceId: openAnnulation.avance.id, motif: motif || undefined });
            } else {
              annuler.mutate({ advanceId: openAnnulation.avance.id, motif: motif || undefined });
            }
            setOpenAnnulation(null);
          }}
        />
      )}

      {confirmAction && (
        <ConfirmationDialog
          isOpen
          onClose={() => setConfirmAction(null)}
          onConfirm={() => confirmAction.exec()}
          title={confirmAction.titre}
          description={confirmAction.description}
          confirmText="Confirmer"
        />
      )}
    </div>
  );
}

function ActionBtn({ title, onClick, icon, danger }: { title: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        danger
          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
    </button>
  );
}

function SaisieModal({
  employeId,
  devise,
  onClose,
  onSaved,
}: {
  employeId: number;
  devise: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const semaine = semaineCourante();
  const [montant, setMontant] = useState("");
  const [dateVersement, setDateVersement] = useState(new Date().toISOString().slice(0, 10));
  const [moyenPaiement, setMoyenPaiement] = useState("");
  const [motif, setMotif] = useState("");
  const [semaineConcernee, setSemaineConcernee] = useState(false);
  const [periodeDebut, setPeriodeDebut] = useState("");
  const [periodeFin, setPeriodeFin] = useState("");
  const [debutRecup, setDebutRecup] = useState("");
  const [finRecup, setFinRecup] = useState("");
  const [erreur, setErreur] = useState("");

  const create = api.rhAdvances.create.useMutation({
    onSuccess: () => onSaved(),
    onError: (e) => setErreur(e.message),
  });

  const soumettre = () => {
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      setErreur("Montant invalide — saisissez un montant strictement positif.");
      return;
    }
    if (!dateVersement) {
      setErreur("Date de versement requise.");
      return;
    }
    create.mutate({
      employeeId: employeId,
      montant: m,
      dateVersement,
      moyenPaiement: (moyenPaiement || undefined) as "especes" | "virement" | "cheque" | "mobile_money" | undefined,
      motif: motif || undefined,
      periodeConcerneeDebut: semaineConcernee ? semaine.debut : periodeDebut || undefined,
      periodeConcerneeFin: semaineConcernee ? semaine.fin : periodeFin || undefined,
      periodeRecuperationDebut: debutRecup || undefined,
      periodeRecuperationFin: finRecup || undefined,
    });
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring";
  const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-modal)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            <Banknote className="mr-2 inline h-5 w-5 text-primary" /> Nouvelle avance
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Montant ({devise})</label>
            <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 50 000" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date de versement</label>
              <input type="date" value={dateVersement} onChange={(e) => setDateVersement(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Moyen de paiement</label>
              <select value={moyenPaiement} onChange={(e) => setMoyenPaiement(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {Object.entries(MOYEN_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Motif</label>
            <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Avance sur salaire" className={inputCls} />
          </div>

          <div className="rounded-xl border border-border bg-accent/5 p-4">
            <button
              type="button"
              onClick={() => setSemaineConcernee((v) => !v)}
              className={`mb-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                semaineConcernee ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" /> Saisie hebdomadaire rapide
            </button>
            {semaineConcernee && (
              <p className="mb-2 text-xs text-muted-foreground">
                Semaine concernée pré-remplie : <b>{semaine.debut}</b> → <b>{semaine.fin}</b>
              </p>
            )}
            {!semaineConcernee && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Période concernée — début</label>
                  <input type="date" value={periodeDebut} onChange={(e) => setPeriodeDebut(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Période concernée — fin</label>
                  <input type="date" value={periodeFin} onChange={(e) => setPeriodeFin(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-accent/5 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Fenêtre de récupération (optionnelle)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Récupération dès le</label>
                <input type="date" value={debutRecup} onChange={(e) => setDebutRecup(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Récupération jusqu'au</label>
                <input type="date" value={finRecup} onChange={(e) => setFinRecup(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {erreur && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{erreur}</p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-accent">
              Annuler
            </button>
            <button
              onClick={soumettre}
              disabled={create.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecuperationModal({
  avance,
  devise,
  onClose,
  onSaved,
  isPending,
}: {
  avance: AvanceRow;
  devise: string;
  onClose: () => void;
  onSaved: (montant: number) => void;
  isPending?: boolean;
}) {
  const solde = num(avance.soldeRestant);
  const [montant, setMontant] = useState(String(solde > 0 ? solde : ""));
  const [erreur, setErreur] = useState("");

  const soumettre = () => {
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      setErreur("Montant invalide.");
      return;
    }
    if (m > solde) {
      setErreur(`Le montant (${m.toLocaleString("fr-FR")}) dépasse le solde restant (${solde.toLocaleString("fr-FR")}).`);
      return;
    }
    onSaved(m);
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-modal)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            <HandCoins className="mr-2 inline h-5 w-5 text-primary" /> Récupération
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Solde restant : <b className="text-foreground">{solde.toLocaleString("fr-FR")} {devise}</b>
        </p>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Montant récupéré</label>
        <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="numeric" className={inputCls} />
        {erreur && <p className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{erreur}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={onClose} disabled={isPending} className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-accent disabled:opacity-60">
            Annuler
          </button>
          <button onClick={soumettre} disabled={isPending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-foreground transition hover:bg-primary/90 disabled:opacity-60">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnulationModal({
  avance,
  mode,
  devise,
  onClose,
  onConfirm,
}: {
  avance: AvanceRow;
  mode: "refuser" | "annuler";
  devise: string;
  onClose: () => void;
  onConfirm: (motif: string) => void;
}) {
  const [motif, setMotif] = useState("");

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-modal)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            {mode === "refuser" ? (
              <X className="mr-2 inline h-5 w-5 text-destructive" />
            ) : (
              <RotateCcw className="mr-2 inline h-5 w-5 text-destructive" />
            )}
            {mode === "refuser" ? "Refuser l'avance" : "Annuler l'avance"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Réf. <b className="font-mono text-foreground">{avance.reference ?? "—"}</b> — {num(avance.montant).toLocaleString("fr-FR")} {devise} ({STATUT_LABELS[avance.statut] ?? avance.statut})
        </p>
        {mode === "annuler" && (
          <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            L'annulation est refusée si une récupération a déjà été enregistrée.
          </p>
        )}
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Justification (requise)</label>
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder={mode === "refuser" ? "Ex : avance trop élevée au vu des jours travaillés" : "Ex : erreur de saisie, avance non versée"}
          rows={3}
          className={inputCls}
        />
        <div className="mt-4 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-accent">
            Retour
          </button>
          <button
            onClick={() => onConfirm(motif.trim())}
            disabled={!motif.trim()}
            className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-foreground transition hover:bg-destructive/90 disabled:opacity-60"
          >
            {mode === "refuser" ? "Refuser" : "Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailHistoryModal({
  avance,
  devise,
  onClose,
}: {
  avance: AvanceRow;
  devise: string;
  onClose: () => void;
}) {
  const { data: recups, isLoading: lRecups } = api.rhAdvances.listRecoveries.useQuery({ advanceId: avance.id });
  const { data: transitions, isLoading: lTrans } = api.rhAdvances.listTransitions.useQuery({ advanceId: avance.id });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-modal)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            <History className="mr-2 inline h-5 w-5 text-primary" />
            Historique de l'avance
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-border bg-accent/5 p-4 text-sm text-muted-foreground">
          <p>
            <b className="font-mono text-foreground">{avance.reference ?? "—"}</b> — montant {num(avance.montant).toLocaleString("fr-FR")} {devise} · récupéré {num(avance.montantRecupere).toLocaleString("fr-FR")} {devise} · solde {num(avance.soldeRestant).toLocaleString("fr-FR")} {devise}
          </p>
          <p className="mt-1">
            Statut : <b className="text-foreground">{STATUT_LABELS[avance.statut] ?? avance.statut}</b>
            {avance.motif ? <span className="ml-1">· motif : {avance.motif}</span> : null}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Récupérations</p>
            {lRecups ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : !recups || recups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucune récupération.</p>
            ) : (
              <ul className="space-y-2">
                {recups.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border/60 p-3 text-xs">
                    <p className="font-semibold text-foreground">{num(r.montant).toLocaleString("fr-FR")} {devise}</p>
                    <p className="text-muted-foreground">le {dateDisplay(r.dateRecuperation as string | null)}</p>
                    {r.payrollEntryId && <p className="text-muted-foreground">Via bulletin #{r.payrollEntryId} (paie)</p>}
                    {!r.payrollEntryId && <p className="text-muted-foreground">Récupération manuelle</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Journal des transitions</p>
            {lTrans ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : !transitions || transitions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucune transition journalisée.</p>
            ) : (
              <ol className="space-y-2">
                {transitions.map((t, i) => (
                  <li key={t.id ?? i} className="rounded-xl border border-border/60 p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-foreground">
                      <span>{t.fromStatus ?? "—"}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span>{t.toStatus}</span>
                    </p>
                    {t.justification && <p className="mt-0.5 text-muted-foreground">{t.justification}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t.acteurId ? `Acteur #${t.acteurId} · ` : ""}{new Date(t.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}