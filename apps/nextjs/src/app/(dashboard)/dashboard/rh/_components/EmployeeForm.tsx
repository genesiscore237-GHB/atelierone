"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";
import { TYPE_EMPLOYE_OPTIONS as typeOptions, MODE_PAIE_OPTIONS as modePaieOptions, STATUT_EMPLOYE_OPTIONS_SAISIE as statutOptions } from "~/lib/rh-labels";
import { api } from "~/trpc/react";

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string | null;
  onSaved: () => void;
}

const emptyForm = {
  civilite: "",
  nom: "",
  prenom: "",
  dateNaissance: "",
  lieuNaissance: "",
  sexe: "",
  emailPersonnel: "",
  telephone: "",
  telephoneSecondaire: "",
  adresse: "",
  ville: "",
  contactUrgenceNom: "",
  contactUrgenceTelephone: "",
  typeEmploye: "permanent" as const,
  fonction: "",
  departmentId: "",
  positionId: "",
  workCycleId: "",
  managerId: "",
  statut: "actif" as const,
  dateEmbauche: new Date().toISOString().split("T")[0],
  dateFinContrat: "",
  periodeEssaiFin: "",
  salaireBase: "",
  modePaie: "mensuel" as const,
  numCnss: "",
  niu: "",
  numCompteBancaire: "",
  banque: "",
  typePieceIdentite: "",
  numPieceIdentite: "",
  pieceExpireLe: "",
  diplome: "",
  photoUrl: "",
  notes: "",
  langues: "",
  logiciels: "",
  pointsFort: "",
  axesAmelioration: "",
};

type FormData = typeof emptyForm;

/** Section Affectation & hiérarchie (département, poste, cycle, manager) */
function AffectationSection({
  form,
  set,
}: {
  form: FormData;
  set: (key: keyof FormData, value: string) => void;
}) {
  const { data: departments } = api.rh.listDepartments.useQuery();
  const { data: positions } = api.rh.listPositions.useQuery();
  const { data: cycles } = api.rhSettings.listCycles.useQuery();
  const { data: managers } = api.rh.list.useQuery({ limit: 100, statut: "actif" });

  const inputCls =
    "rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50";

  return (
    <section>
      <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">
        Affectation & hiérarchie
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}
          className={inputCls}>
          <option value="" className="bg-background">Département / Service</option>
          {(departments ?? []).map((d) => (
            <option key={d.id} value={String(d.id)} className="bg-background">{d.name}</option>
          ))}
        </select>
        <select value={form.positionId} onChange={(e) => set("positionId", e.target.value)}
          className={inputCls}>
          <option value="" className="bg-background">Poste</option>
          {(positions ?? []).map((p) => (
            <option key={p.id} value={String(p.id)} className="bg-background">{p.name}</option>
          ))}
        </select>
        <select value={form.workCycleId} onChange={(e) => set("workCycleId", e.target.value)}
          className={inputCls}>
          <option value="" className="bg-background">Cycle de travail</option>
          {(cycles ?? []).map((c) => (
            <option key={c.id} value={String(c.id)} className="bg-background">{c.name}</option>
          ))}
        </select>
        <select value={form.managerId} onChange={(e) => set("managerId", e.target.value)}
          className={inputCls}>
          <option value="" className="bg-background">Supérieur hiérarchique</option>
          {(managers?.employees ?? []).map((m) => (
            <option key={m.id} value={String(m.id)} className="bg-background">
              {m.prenom} {m.nom}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

export function EmployeeForm({ isOpen, onClose, employeeId, onSaved }: EmployeeFormProps) {
  const isEdit = employeeId !== null     ;
  const { hasPermission } = usePermissions();
  const canSeeSalary = hasPermission("rh.salaire.consulter");

  const { data: existing, error: getError } = api.rh.get.useQuery(
    { id: String(employeeId) },
    { enabled: isEdit && isOpen },
  );

  const createMutation = api.rh.create.useMutation({
    onSuccess: () => { toast.success("Employé créé"); onSaved(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = api.rh.update.useMutation({
    onSuccess: () => { toast.success("Employé mis à jour"); onSaved(); },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isPending, setIsPending] = useState(false);
  const [matricule, setMatricule] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (isEdit && existing) {
        setForm({
          civilite: existing.civilite ?? "",
          nom: existing.nom ?? "",
          prenom: existing.prenom ?? "",
          dateNaissance: existing.dateNaissance ?? "",
          lieuNaissance: existing.lieuNaissance ?? "",
          sexe: existing.sexe ?? "",
          emailPersonnel: existing.emailPersonnel ?? "",
          telephone: existing.telephone ?? "",
          telephoneSecondaire: existing.telephoneSecondaire ?? "",
          adresse: existing.adresse ?? "",
          ville: existing.ville ?? "",
          contactUrgenceNom: existing.contactUrgenceNom ?? "",
          contactUrgenceTelephone: existing.contactUrgenceTelephone ?? "",
          typeEmploye: (existing.typeEmploye as FormData["typeEmploye"]) ?? "permanent",
          fonction: existing.fonction ?? "",
          departmentId: existing.departmentId ? String(existing.departmentId) : "",
          positionId: existing.positionId ? String(existing.positionId) : "",
          workCycleId: existing.workCycleId ? String(existing.workCycleId) : "",
          managerId: existing.managerId ? String(existing.managerId) : "",
          dateEmbauche: existing.dateEmbauche ?? new Date().toISOString().split("T")[0],
          dateFinContrat: existing.dateFinContrat ?? "",
          periodeEssaiFin: existing.periodeEssaiFin ?? "",
          salaireBase: existing.salaireBase ?? "",
          modePaie: (existing.modePaie as FormData["modePaie"]) ?? "mensuel",
          statut: (existing.statut as FormData["statut"]) ?? "actif",
          numCnss: existing.numCnss ?? "",
          niu: existing.niu ?? "",
          numCompteBancaire: existing.numCompteBancaire ?? "",
          banque: existing.banque ?? "",
          typePieceIdentite: existing.typePieceIdentite ?? "",
          numPieceIdentite: existing.numPieceIdentite ?? "",
          pieceExpireLe: existing.pieceExpireLe ?? "",
          diplome: existing.diplome ?? "",
          photoUrl: existing.photoUrl ?? "",
          notes: existing.notes ?? "",
          langues: existing.langues ?? "",
          logiciels: existing.logiciels ?? "",
          pointsFort: existing.pointsFort ?? "",
          axesAmelioration: existing.axesAmelioration ?? "",
        });
      } else if (!isEdit) {
        setForm(emptyForm);
      }
    }
  }, [isOpen, isEdit, existing]);

  // Génération automatique du matricule GPJ-YYYY-NNNN
  const aujourdhui = new Date();
  const annee = aujourdhui.getFullYear();
  const matriculeExistant = matricule;
  if (!matriculeExistant || !matriculeExistant.startsWith("GPJ")) {
    setMatricule(`GPJ-${annee}-0001`);
  }

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const set = (key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const [uploading, setUploading] = useState(false);
  const uploadPhoto = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Veuillez choisir une image (JPG, PNG, WebP)"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("folder", "photos");
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Échec de l'upload");
      set("photoUrl", j.url || j.path || "");
      toast.success("Photo importée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom || !form.prenom || !form.fonction) {
      toast.error("Nom, prénom et fonction sont requis");
      return;
    }
    setIsPending(true);

    type UpdatePayload = Parameters<typeof updateMutation.mutate>[0];
    type CreatePayload = Parameters<typeof createMutation.mutate>[0];

    const sexeVal = form.sexe === "M" || form.sexe === "F" ? form.sexe as any : undefined;
    const numOrUndef = (v: string) => (v ? Number(v) : undefined);
    const numOrNull = (v: string) => (v ? Number(v) : null);

    if (isEdit && employeeId) {
      updateMutation.mutate(
        {
          id: String(employeeId),
          civilite: form.civilite || null,
          nom: form.nom, prenom: form.prenom, fonction: form.fonction,
          typeEmploye: form.typeEmploye as any,
          modePaie: form.modePaie as any,
          statut: form.statut as "actif" | "conge" | "suspendu" | "archive",
          sexe: sexeVal ?? null,
          telephone: form.telephone || null, adresse: form.adresse || null,
          ville: form.ville || null, telephoneSecondaire: form.telephoneSecondaire || null,
          dateNaissance: form.dateNaissance || null, lieuNaissance: form.lieuNaissance || null,
          contactUrgenceNom: form.contactUrgenceNom || null,
          contactUrgenceTelephone: form.contactUrgenceTelephone || null,
          dateFinContrat: form.dateFinContrat || null,
          periodeEssaiFin: form.periodeEssaiFin || null, salaireBase: form.salaireBase || null,
          emailPersonnel: form.emailPersonnel || null, dateEmbauche: form.dateEmbauche,
          numCnss: form.numCnss || null, niu: form.niu || null,
          numCompteBancaire: form.numCompteBancaire || null,
          banque: form.banque || null,
          typePieceIdentite: form.typePieceIdentite || null, numPieceIdentite: form.numPieceIdentite || null,
          pieceExpireLe: form.pieceExpireLe || null, diplome: form.diplome || null,
          photoUrl: form.photoUrl || null,
          notes: form.notes || null,
          langues: form.langues || null, logiciels: form.logiciels || null,
          pointsFort: form.pointsFort || null, axesAmelioration: form.axesAmelioration || null,
          departmentId: numOrNull(form.departmentId),
          positionId: numOrNull(form.positionId),
          workCycleId: numOrNull(form.workCycleId),
          managerId: numOrNull(form.managerId),
        } as UpdatePayload,
        { onSettled: () => setIsPending(false) },
      );
    } else {
      createMutation.mutate(
        {
          civilite: form.civilite || undefined,
          nom: form.nom, prenom: form.prenom, fonction: form.fonction,
          typeEmploye: form.typeEmploye as any,
          modePaie: form.modePaie as any,
          sexe: sexeVal,
          telephone: form.telephone || undefined, adresse: form.adresse || undefined,
          ville: form.ville || undefined, telephoneSecondaire: form.telephoneSecondaire || undefined,
          dateNaissance: form.dateNaissance || undefined, lieuNaissance: form.lieuNaissance || undefined,
          contactUrgenceNom: form.contactUrgenceNom || undefined,
          contactUrgenceTelephone: form.contactUrgenceTelephone || undefined,
          dateFinContrat: form.dateFinContrat || undefined,
          periodeEssaiFin: form.periodeEssaiFin || undefined, salaireBase: form.salaireBase || undefined,
          emailPersonnel: form.emailPersonnel || undefined, dateEmbauche: form.dateEmbauche,
          numCnss: form.numCnss || undefined, niu: form.niu || undefined,
          numCompteBancaire: form.numCompteBancaire || undefined,
          banque: form.banque || undefined,
          typePieceIdentite: form.typePieceIdentite || undefined, numPieceIdentite: form.numPieceIdentite || undefined,
          pieceExpireLe: form.pieceExpireLe || undefined, diplome: form.diplome || undefined,
          photoUrl: form.photoUrl || undefined,
          notes: form.notes || undefined,
          langues: form.langues || undefined, logiciels: form.logiciels || undefined,
          pointsFort: form.pointsFort || undefined, axesAmelioration: form.axesAmelioration || undefined,
          departmentId: numOrUndef(form.departmentId),
          positionId: numOrUndef(form.positionId),
          workCycleId: numOrUndef(form.workCycleId),
          managerId: numOrUndef(form.managerId),
        } as CreatePayload,
        { onSettled: () => setIsPending(false) },
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-end bg-[var(--overlay)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {isEdit ? "Modifier l'employé" : "Nouvel employé"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isEdit ? "Modifiez les informations de l'employé" : "Remplissez la fiche complète de l'employé"}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identité */}
          <section>
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">Identité</h3>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.civilite} onChange={(e) => set("civilite", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="" className="bg-background">Civilité</option>
                <option value="M." className="bg-background">M.</option>
                <option value="Mme" className="bg-background">Mme</option>
                <option value="Mlle" className="bg-background">Mlle</option>
              </select>
              <input placeholder="Prénom *" value={form.prenom} onChange={(e) => set("prenom", e.target.value)} required
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Nom *" value={form.nom} onChange={(e) => set("nom", e.target.value)} required
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <div className="col-span-2 flex items-center gap-3">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="Photo" className="h-14 w-14 rounded-full object-cover ring-1 ring-border" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/40 text-xs text-muted-foreground">Photo</div>
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-accent/30 px-3 py-2 text-sm text-foreground hover:border-primary/50">
                  {uploading ? "Envoi…" : "Téléverser la photo"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
                </label>
              </div>
              <input placeholder="Date de naissance" type="date" value={form.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50 [color-scheme:dark]" />
              <input placeholder="Lieu de naissance" value={form.lieuNaissance} onChange={(e) => set("lieuNaissance", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <select value={form.sexe} onChange={(e) => set("sexe", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="" className="bg-background">Sexe</option>
                <option value="M" className="bg-background">Masculin</option>
                <option value="F" className="bg-background">Féminin</option>
              </select>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">Contact</h3>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Email personnel" type="email" value={form.emailPersonnel} onChange={(e) => set("emailPersonnel", e.target.value)}
                className="col-span-2 rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Téléphone" value={form.telephone} onChange={(e) => set("telephone", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Téléphone secondaire" value={form.telephoneSecondaire} onChange={(e) => set("telephoneSecondaire", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)}
                className="col-span-2 rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Ville" value={form.ville} onChange={(e) => set("ville", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Contact urgence — nom" value={form.contactUrgenceNom} onChange={(e) => set("contactUrgenceNom", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Contact urgence — téléphone" value={form.contactUrgenceTelephone} onChange={(e) => set("contactUrgenceTelephone", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </section>

          {/* Affectation & hiérarchie */}
          <AffectationSection form={form} set={set} />

          {/* Contrat */}
          <section>
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">Contrat</h3>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.typeEmploye} onChange={(e) => set("typeEmploye", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50">
                {typeOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-background">{o.label}</option>
                ))}
              </select>
              <input placeholder="Fonction *" value={form.fonction} onChange={(e) => set("fonction", e.target.value)} required
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Date d'embauche" type="date" value={form.dateEmbauche} onChange={(e) => set("dateEmbauche", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50 [color-scheme:dark]" />
              {isEdit && (
                <select value={form.statut} onChange={(e) => set("statut", e.target.value)}
                  className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50">
                  {statutOptions.map((o) => (
                    <option key={o.value} value={o.value} className="bg-background">{o.label}</option>
                  ))}
                </select>
              )}
              <input placeholder="Date fin contrat" type="date" value={form.dateFinContrat} onChange={(e) => set("dateFinContrat", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50 [color-scheme:dark]" />
              <input placeholder="Fin période d'essai" type="date" value={form.periodeEssaiFin} onChange={(e) => set("periodeEssaiFin", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50 [color-scheme:dark]" />
              {canSeeSalary ? (
                <>
                  <input placeholder="Salaire de base (XOF)" type="number" value={form.salaireBase} onChange={(e) => set("salaireBase", e.target.value)}
                    className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
                  <select value={form.modePaie} onChange={(e) => set("modePaie", e.target.value)}
                    className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50">
                    {modePaieOptions.map((o) => (
                      <option key={o.value} value={o.value} className="bg-background">{o.label}</option>
                    ))}
                  </select>
                </>
              ) : (
                <div className="col-span-2 flex items-center gap-2 rounded-xl border border-border bg-accent/10 p-3 text-xs text-muted-foreground">
                  <Lock size={14} className="shrink-0" />
                  Accès restreint : vos permissions ne permettent pas de consulter le salaire ni le mode de paiement.
                </div>
              )}
              <input placeholder="N° CNSS" value={form.numCnss} onChange={(e) => set("numCnss", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="N° NIU" value={form.niu} onChange={(e) => set("niu", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="N° Compte bancaire" value={form.numCompteBancaire} onChange={(e) => set("numCompteBancaire", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Banque" value={form.banque} onChange={(e) => set("banque", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </section>

          {/* Profil compétences (specs MVP 06_Competences) */}
          <section>
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">Profil compétences</h3>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Langues (ex. Français, Anglais)" value={form.langues} onChange={(e) => set("langues", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Logiciels maîtrisés" value={form.logiciels} onChange={(e) => set("logiciels", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <textarea placeholder="Points forts" value={form.pointsFort} onChange={(e) => set("pointsFort", e.target.value)}
              className="mt-3 w-full rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" rows={2} />
            <textarea placeholder="Axes d'amélioration" value={form.axesAmelioration} onChange={(e) => set("axesAmelioration", e.target.value)}
              className="mt-3 w-full rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" rows={2} />
          </section>

          {/* Notes */}
          <section>
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">Notes internes</h3>
            <textarea placeholder="Notes internes (non visibles par l'employé)" value={form.notes} onChange={(e) => set("notes", e.target.value)}
              className="w-full rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" rows={3} />
          </section>

          {/* Documents */}
          <section>
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-primary uppercase">Pièces & Documents</h3>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Type de pièce (CNI, Passeport...)" value={form.typePieceIdentite} onChange={(e) => set("typePieceIdentite", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="N° de pièce" value={form.numPieceIdentite} onChange={(e) => set("numPieceIdentite", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
              <input placeholder="Pièce expire le" type="date" value={form.pieceExpireLe} onChange={(e) => set("pieceExpireLe", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50 [color-scheme:dark]" />
              <input placeholder="Diplôme / Qualification" value={form.diplome} onChange={(e) => set("diplome", e.target.value)}
                className="rounded-xl border border-border bg-accent/30 p-3 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </section>

          <div className="sticky bottom-0 flex gap-3 border-t border-border bg-background pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-2xl border border-border py-4 text-[11px] font-black text-muted-foreground uppercase transition-all hover:bg-accent/30 hover:text-foreground">
              Annuler
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 rounded-2xl bg-primary py-4 text-[11px] font-black text-foreground uppercase shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50">
              {isPending ? (
                <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Traitement...</>
              ) : (
                isEdit ? "Enregistrer" : "Créer l'employé"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
