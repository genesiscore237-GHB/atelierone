"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { Member } from "./MemberTable";

type PanelMode = "view" | "edit" | "add";

interface GovernanceSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PanelMode;
  member: Member | null;
  onSave: (data: Partial<Member>) => void;
}

const statutVariant: Record<string, "success" | "warning" | "destructive"> = {
  active: "success",
  invited: "warning",
  suspended: "destructive",
};

const statutLabel: Record<string, string> = {
  active: "Actif",
  invited: "Invité",
  suspended: "Suspendu",
};

const roleOptions = [
  { id: 1, nom: "Administrateur réseau" },
  { id: 2, nom: "Responsable agence" },
  { id: 3, nom: "Opérateur POS" },
  { id: 4, nom: "Caissier" },
  { id: 5, nom: "Magasinier" },
  { id: 6, nom: "Gestionnaire achats" },
  { id: 7, nom: "Comptable" },
  { id: 8, nom: "RH" },
  { id: 9, nom: "Consultation" },
];

export function GovernanceSidePanel({
  open,
  onOpenChange,
  mode,
  member,
  onSave,
}: GovernanceSidePanelProps) {
  const [form, setForm] = useState({
    nom: member?.nom ?? "",
    prenom: member?.prenom ?? "",
    email: member?.email ?? "",
    roleId: member?.role?.id ?? 9,
    statut: member?.statut ?? "active",
  });

  const isView = mode === "view";

  const handleSave = () => {
    const role = roleOptions.find((r) => r.id === form.roleId);
    onSave({
      nom: form.nom || undefined,
      prenom: form.prenom || undefined,
      email: form.email || undefined,
      role: role
        ? { id: role.id, code: "", nom: role.nom, niveau: null }
        : null,
      statut: form.statut as Member["statut"],
    } as unknown as Partial<Member>);
    onOpenChange(false);
  };

  const title = mode === "add" ? "Ajouter un membre" : mode === "edit" ? "Modifier le membre" : "Détail du membre";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {mode === "add"
              ? "Invitez un nouveau membre dans votre organisation"
              : mode === "edit"
                ? "Modifiez les informations du membre"
                : "Consultez les informations du membre"}
          </SheetDescription>
        </SheetHeader>

        {isView && member ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                {member.prenom?.[0]}{member.nom[0]}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {member.prenom} {member.nom}
                </p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Rôle</Label>
                <p className="text-sm font-medium text-foreground mt-1">{member.role?.nom ?? "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Statut</Label>
                <div className="mt-1">
                  <Badge variant={statutVariant[member.statut]}>
                    {statutLabel[member.statut]}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Dernière connexion</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                  {member.derniereConnexion ?? "Jamais"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  disabled={isView}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom</Label>
                <Input
                  id="prenom"
                  value={form.prenom}
                  onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                  disabled={isView}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rôle</Label>
              <Select
                value={String(form.roleId)}
                onValueChange={(v) => setForm({ ...form, roleId: Number(v) })}
                disabled={isView}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="statut">Statut</Label>
              <Select
                value={form.statut}
                onValueChange={(v) => setForm({ ...form, statut: v as Member["statut"] })}
                disabled={isView}
              >
                <SelectTrigger id="statut">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="invited">Invité</SelectItem>
                  <SelectItem value="suspended">Suspendu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <SheetFooter className="mt-8 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {isView ? "Fermer" : "Annuler"}
          </Button>
          {!isView && (
            <Button onClick={handleSave}>
              {mode === "add" ? "Inviter" : "Enregistrer"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
