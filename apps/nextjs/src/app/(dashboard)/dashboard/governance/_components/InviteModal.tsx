"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EmployeeResult {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  emailPersonnel: string;
  telephone: string;
  fonction: string;
  typeEmploye: string;
  statut: string;
  photoUrl: string | null;
  userId: string | null;
  hasAccount: boolean;
  fullName: string;
}

function generateLogin(prenom: string, nom: string): string {
  const slug = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, ".");
  const firstPrenom = prenom.split(" ")[0] ?? "";
  const firstNom = nom.split(" ")[0] ?? "";
  return `${slug(firstPrenom)}.${slug(firstNom)}@atelierone.cm`;
}

export function InviteModal({ isOpen, onClose }: InviteModalProps) {
  const { data: rolesData } = api.governance.role.list.useQuery(undefined, { enabled: isOpen });
  const utils = api.useUtils();
  const roles = (rolesData ?? []) as Array<{ id: string; nom: string; code: string }>;

  const inviteMutation = api.governance.member.invite.useMutation({
    onSuccess: (data) => {
      setInviteResult({
        employeeName: `${selected!.prenom} ${selected!.nom}`,
        loginEmail: data.loginEmail,
      });
      setIsPending(false);
      utils.governance.member.list.invalidate();
      setSearch(""); setSearchDebounced("");
    },
    onError: (err) => { toast.error(err.message); setIsPending(false); },
  });

  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [selected, setSelected] = useState<EmployeeResult | null>(null);
  const [roleId, setRoleId] = useState("");
  const [inviteResult, setInviteResult] = useState<{
    employeeName: string;
    loginEmail: string;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: searchResults, isFetching: searching } = api.rh.search.useQuery(
    { query: searchDebounced, limit: 10, sansCompte: true },
    { enabled: searchDebounced.length >= 2 && isOpen },
  );
  const results = (searchResults ?? []) as EmployeeResult[];

  useEffect(() => {
    if (isOpen) {
      setSearch(""); setSearchDebounced(""); setSelected(null);
      setRoleId(""); setInviteResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSearch = (v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.length < 2) { setSearchDebounced(""); return; }
    debounceRef.current = setTimeout(() => setSearchDebounced(v), 300);
  };

  const loginEmail = selected
    ? generateLogin(selected.prenom, selected.nom)
    : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { toast.error("Sélectionnez un employé"); return; }
    if (!roleId) { toast.error("Sélectionnez un rôle système"); return; }
    setIsPending(true);
    inviteMutation.mutate({
      email: loginEmail,
      nom: selected.nom,
      prenom: selected.prenom,
      roleId: roleId,
      employeId: selected.id,
    });
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
      onClick={handleOverlayClick}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] md:rounded-[3rem] border border-border bg-card p-4 sm:p-6 md:p-12 shadow-2xl"
      >
        {inviteResult ? (
          <SuccessView inviteResult={inviteResult} onClose={onClose} onReset={() => { setInviteResult(null); setSelected(null); setSearch(""); setSearchDebounced(""); setRoleId(""); }} />
        ) : !selected ? (
          <SearchView search={search} onSearch={handleSearch} searching={searching} results={results} onSelect={setSelected} onClose={onClose} />
        ) : (
          <SelectView selected={selected} loginEmail={loginEmail} roles={roles} roleId={roleId} setRoleId={setRoleId} isPending={isPending} onSubmit={handleSubmit} onChangeEmployee={() => setSelected(null)} onClose={onClose} />
        )}
      </motion.div>
    </div>
  );
}

function SuccessView({ inviteResult, onClose, onReset }: {
  inviteResult: { employeeName: string; loginEmail: string };
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-4 text-foreground">
          <div className="rounded-2xl bg-success/20 p-3 text-success-foreground">
            <ShieldCheck size={24} />
          </div>
          <h2 className="text-2xl font-black tracking-tighter uppercase italic">Invitation créée</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={24} /></button>
      </div>
      <div className="space-y-4 rounded-2xl border border-success/20 bg-success/10 p-6">
        <p className="text-sm text-foreground/80">
          <span className="font-bold text-foreground">{inviteResult.employeeName}</span> a maintenant accès au système
        </p>
        <p className="text-sm text-muted-foreground">Identifiant de connexion :</p>
        <p className="text-center font-mono text-lg font-bold tracking-wider text-success-foreground">
          {inviteResult.loginEmail}
        </p>
        <div className="mt-4 rounded-xl border border-warning/20 bg-warning/10 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-warning-foreground uppercase">À remettre à l'employé</p>
          <p className="mt-1 text-[11px] text-warning-foreground/80">
            Sur la page de connexion, cliquez sur "Première connexion" et saisissez cet identifiant pour créer votre mot de passe.
          </p>
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={onReset}
          className="flex-1 rounded-2xl bg-primary py-4 text-[11px] font-black text-foreground uppercase shadow-lg shadow-primary/20 transition-all hover:bg-primary">
          Inviter un autre
        </button>
        <button onClick={onClose}
          className="rounded-2xl border border-border py-4 px-6 text-[11px] font-black text-muted-foreground uppercase transition-all hover:bg-accent/30 hover:text-foreground">
          Fermer
        </button>
      </div>
    </>
  );
}

function SearchView({ search, onSearch, searching, results, onSelect, onClose }: {
  search: string; onSearch: (v: string) => void; searching: boolean;
  results: EmployeeResult[]; onSelect: (e: EmployeeResult) => void; onClose: () => void;
}) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4 text-foreground">
          <div className="rounded-2xl bg-primary/20 p-3 text-primary"><UserPlus size={24} /></div>
          <h2 className="text-xl font-black tracking-tighter uppercase italic">Inviter au système</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={24} /></button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" size={18} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Rechercher un employé (nom, prénom, matricule)..."
          className="w-full rounded-xl border border-border bg-accent/30 p-4 pl-12 text-sm text-foreground outline-none focus:border-primary/50"
          autoFocus
        />
        {searching && <Loader2 className="absolute top-1/2 right-4 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
      </div>

      {results.length > 0 && (
        <div className="mb-4 max-h-48 space-y-1 overflow-y-auto">
          {results.map((emp) => (
            <button key={emp.id} onClick={() => onSelect(emp)}
              className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-accent/5 p-3 text-left transition-all hover:border-primary/30 hover:bg-primary/5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                {emp.prenom[0]}{emp.nom[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{emp.prenom} {emp.nom}</div>
                <div className="text-[10px] text-muted-foreground">{emp.fonction} · {emp.matricule}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {search.length >= 2 && !searching && results.length === 0 && (
        <div className="mb-4 rounded-xl border border-border/50 bg-accent/5 p-6 text-center">
          <p className="text-sm text-muted-foreground">Aucun employé trouvé</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Tous les employés déjà invités sont exclus de la recherche</p>
        </div>
      )}
    </>
  );
}

function SelectView({ selected, loginEmail, roles, roleId, setRoleId, isPending, onSubmit, onChangeEmployee, onClose }: {
  selected: EmployeeResult; loginEmail: string;
  roles: Array<{ id: string; nom: string; code: string }>;
  roleId: string; setRoleId: (v: string) => void; isPending: boolean;
  onSubmit: (e: React.FormEvent) => void; onChangeEmployee: () => void; onClose: () => void;
}) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4 text-foreground">
          <div className="rounded-2xl bg-primary/20 p-3 text-primary"><UserPlus size={24} /></div>
          <h2 className="text-xl font-black tracking-tighter uppercase italic">Inviter au système</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={24} /></button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                {selected.prenom[0]}{selected.nom[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{selected.prenom} {selected.nom}</p>
                <p className="text-[10px] text-muted-foreground">{selected.fonction} · {selected.matricule}</p>
              </div>
            </div>
            <button type="button" onClick={onChangeEmployee}
              className="text-[10px] text-primary hover:text-primary/80">Changer</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            {selected.telephone && <div><span className="text-muted-foreground">Tél.</span><span className="ml-1 text-foreground/80">{selected.telephone}</span></div>}
            {selected.emailPersonnel && <div><span className="text-muted-foreground">Email</span><span className="ml-1 text-foreground/80">{selected.emailPersonnel}</span></div>}
            <div><span className="text-muted-foreground">Type</span><span className="ml-1 text-foreground/80">{selected.typeEmploye}</span></div>
            <div><span className="text-muted-foreground">Statut</span><span className="ml-1 text-foreground/80">{selected.statut}</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-center font-mono text-xs font-black tracking-widest text-primary">
          {loginEmail}
        </div>

        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-xl border border-border bg-accent/50 p-4 text-sm text-foreground outline-none focus:border-primary/50" required>
          <option value="" className="bg-card">Rôle système *</option>
          {roles.map((r) => <option key={r.id} value={r.id} className="bg-card">{r.nom}</option>)}
        </select>

        <button type="submit" disabled={isPending || !roleId}
          className="w-full rounded-2xl bg-primary py-5 text-[11px] font-black text-foreground uppercase shadow-lg shadow-primary/20 transition-all hover:bg-primary disabled:opacity-50">
          {isPending ? "TRAITEMENT..." : "INVITER AU SYSTÈME"}
        </button>
      </form>
    </>
  );
}
