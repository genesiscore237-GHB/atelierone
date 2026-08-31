"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle, CalendarClock, Clock, Coffee, LogIn, LogOut, RefreshCw, Rocket, Wrench, X,
} from "lucide-react";
import { Button } from "~/components/ui/button";

const POSTURE_META: Record<string, { label: string; badge: string }> = {
  EN_TRAVAIL: { label: "En travail", badge: "bg-success/15 text-success-foreground" },
  EN_PAUSE: { label: "En pause", badge: "bg-warning/15 text-warning-foreground" },
  EN_MISSION: { label: "En mission", badge: "bg-sky-500/15 text-sky-400" },
  HORS_SITE: { label: "Hors site", badge: "bg-violet-500/15 text-violet-400" },
  EN_RETARD: { label: "En retard", badge: "bg-destructive/15 text-destructive" },
  ABSENT: { label: "Absent", badge: "bg-muted text-muted-foreground" },
};

const MOTIFS: Record<string, string> = {
  COMMISSION: "Commission", TEST_VEHICULE: "Test véhicule", STAGE: "Stage",
  FORMATION: "Formation", SORTIE_APPROVISIONNEMENT: "Sortie approvisionnement", AUTRE: "Autre",
};

const fmtH = (h: string | null | undefined) => h ?? "—";
const fmtHeure = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

export function PointageDirect() {
  const utils = api.useUtils();
  const { data, isLoading, refetch } = api.rhPosture.now.useQuery(undefined, { refetchInterval: 15_000 });
  const [fPosture, setFPosture] = useState("");
  const [missionFor, setMissionFor] = useState<number | null>(null);
  const [missionMotif, setMissionMotif] = useState("TEST_VEHICULE");
  const [missionRef, setMissionRef] = useState("");
  const [salaireEmp, setSalaireEmp] = useState(0);
  const [du, setDu] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [fin, setFin] = useState(() => new Date().toISOString().slice(0, 10));

  const pointer = api.rhPosture.pointer.useMutation({
    onSuccess: (r) => { toast.success(`Posture : ${POSTURE_META[r.posture]?.label ?? r.posture}`); utils.rhPosture.now.invalidate(); setMissionFor(null); setMissionRef(""); },
    onError: (e) => toast.error(e.message),
  });
  const { data: salaire } = api.rhPosture.salaireIntervalle.useQuery(
    { employeId: salaireEmp, dateDebut: du, dateFin: fin },
    { enabled: salaireEmp > 0 }
  );
  const { data: motifsData } = api.rhPosture.motifsMission.useQuery();

  const employes = (data?.employes ?? []) as any[];
  const compteurs = (data?.compteurs ?? {}) as any;
  const motifs = (motifsData ?? []) as string[];
  const filtered = employes.filter((e) => !fPosture || e.posture === fPosture);

  const action = (id: number, a: string) => pointer.mutate({ employeId: id, action: a as any });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Clock size={22} className="text-primary" /> Pointage en direct
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Posture de chaque employé à tout moment — le responsable pointe arrivée, pause, mission et départ.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()}>
          <RefreshCw size={13} /> Actualiser
        </Button>
      </div>

      {/* Bandeau temps réel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Compteur label="En travail" value={compteurs.enTravail ?? 0} cls="text-success-foreground" />
        <Compteur label="En pause" value={compteurs.enPause ?? 0} cls="text-warning-foreground" />
        <Compteur label="En mission" value={compteurs.enMission ?? 0} cls="text-sky-400" />
        <Compteur label="Hors site" value={compteurs.horsSite ?? 0} cls="text-violet-400" />
        <Compteur label="Absents" value={compteurs.absents ?? 0} cls="text-muted-foreground" />
      </div>

      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={fPosture} onChange={(e) => setFPosture(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Toutes les postures</option>
          {Object.keys(POSTURE_META).map((p) => <option key={p} value={p}>{POSTURE_META[p].label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} employé(s)</span>
      </div>

      {/* Tableau des postures */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Employé</th>
              <th className="px-3 py-2.5">Posture</th>
              <th className="px-3 py-2.5">Depuis</th>
              <th className="px-3 py-2.5">Mission</th>
              <th className="px-3 py-2.5 text-center">Arrivée</th>
              <th className="px-3 py-2.5 text-center">Pause</th>
              <th className="px-3 py-2.5 text-center">Retour</th>
              <th className="px-3 py-2.5 text-center">Départ</th>
              <th className="px-3 py-2.5 text-right">Gain jour</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">Aucun employé dans cette posture.</td></tr>
            ) : (
              filtered.map((e: any) => {
                const m = POSTURE_META[e.posture] ?? { label: e.posture, badge: "bg-muted text-muted-foreground" };
                return (
                  <tr key={e.id} className={`text-sm hover:bg-accent/30 ${e.posture === "EN_PAUSE" ? "bg-warning/5" : e.posture === "EN_MISSION" ? "bg-sky-500/5" : ""}`}>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{e.nom}</span>
                      <span className="block text-[10px] text-muted-foreground">{e.fonction ?? "—"} · {e.modePaie}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${m.badge}`}>{m.label}</span>
                      {e.posture === "EN_RETARD" && <AlertTriangle size={11} className="mt-0.5 inline text-destructive" />}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtHeure(e.depuis)}</td>
                    <td className="px-3 py-2 text-xs">
                      {e.motifMission ? (
                        <span className="font-semibold text-sky-400">{MOTIFS[e.motifMission] ?? e.motifMission}</span>
                      ) : "—"}
                      {e.reference && <span className="block font-mono text-[10px] text-muted-foreground">{e.reference}</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{fmtH(e.pointage?.timeIn)}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs text-warning-foreground">{fmtH(e.pointage?.timeInBreak)}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{fmtH(e.pointage?.timeOutBreak)}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs text-muted-foreground">{fmtH(e.pointage?.timeOut)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary">{fmtFCFA(e.gainJour)} F</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {e.posture === "ABSENT" && (
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={pointer.isPending} onClick={() => action(e.id, "ARRIVEE")}>
                            <LogIn size={11} /> Arrivée
                          </Button>
                        )}
                        {e.posture === "EN_TRAVAIL" && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-warning-foreground" disabled={pointer.isPending} onClick={() => action(e.id, "DEPART_PAUSE")}>
                              <Coffee size={11} /> Pause
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-sky-400" disabled={pointer.isPending} onClick={() => setMissionFor(e.id)}>
                              <Rocket size={11} /> Mission
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px]" disabled={pointer.isPending} onClick={() => action(e.id, "DEPART")}>
                              <LogOut size={11} /> Départ
                            </Button>
                          </>
                        )}
                        {e.posture === "EN_PAUSE" && (
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={pointer.isPending} onClick={() => action(e.id, "RETOUR_PAUSE")}>
                            <Coffee size={11} /> Retour de pause
                          </Button>
                        )}
                        {e.posture === "EN_MISSION" && (
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={pointer.isPending} onClick={() => action(e.id, "MISSION_RETOUR")}>
                            <Wrench size={11} /> Retour de mission
                          </Button>
                        )}
                        {e.posture === "HORS_SITE" && (
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={pointer.isPending} onClick={() => action(e.id, "ARRIVEE")}>
                            <LogIn size={11} /> Arrivée
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Salaire sur intervalle */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <CalendarClock size={14} className="text-primary" /> Salaire sur période (base présences)
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Employé</p>
            <select value={salaireEmp} onChange={(e) => setSalaireEmp(Number(e.target.value))} className="mt-1 h-9 min-w-52 rounded-lg border border-border bg-background px-3 text-sm">
              <option value={0}>Choisir…</option>
              {employes.map((e: any) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Du</p>
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className="mt-1 h-9 rounded-lg border border-border bg-background px-2 text-sm" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Au</p>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="mt-1 h-9 rounded-lg border border-border bg-background px-2 text-sm" />
          </div>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setDu(new Date().toISOString().slice(0, 10)); setFin(new Date().toISOString().slice(0, 10)); }}>
            Aujourd'hui
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setDu(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)); setFin(new Date().toISOString().slice(0, 10)); }}>
            7 jours
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setDu(new Date().toISOString().slice(0, 7) + "-01"); setFin(new Date().toISOString().slice(0, 10)); }}>
            Ce mois
          </Button>
        </div>

        {salaire && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Mini label="Taux horaire" value={`${fmtFCFA(salaire.resultat.tauxHoraire)} F`} />
            <Mini label="Heures normales" value={`${salaire.resultat.heuresNormales} h`} />
            <Mini label="Heures supp. (×1,5)" value={`${salaire.resultat.heuresSupplementaires} h`} />
            <Mini label="Primes de tâche" value={`${fmtFCFA(salaire.resultat.primesTache)} F`} />
            <Mini label="Jours d'absence" value={String(salaire.resultat.joursAbsents)} />
            <Mini label="Salaire brut période" value={`${fmtFCFA(salaire.resultat.brut)} F`} accent />
          </div>
        )}
      </div>

      {/* Modal mission */}
      {missionFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setMissionFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Rocket size={16} className="text-sky-400" /> Mission de l'employé
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setMissionFor(null)} aria-label="Fermer"><X size={14} /></Button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motif (obligatoire)</p>
                <select value={missionMotif} onChange={(e) => setMissionMotif(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {motifs.map((m) => <option key={m} value={m}>{MOTIFS[m] ?? m}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Référence (ex. OR, véhicule, fournisseur)</p>
                <input value={missionRef} onChange={(e) => setMissionRef(e.target.value)} placeholder="ex. OR-26-0101 — essai route" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMissionFor(null)}>Annuler</Button>
              <Button disabled={pointer.isPending} onClick={() => pointer.mutate({ employeId: missionFor, action: "MISSION_DEBUT", motifMission: missionMotif as any, reference: missionRef || undefined })}>
                <Rocket size={14} /> Débuter la mission
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Compteur({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-black ${cls}`}>{value}</p>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}