"use client";

import { useMemo } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SelectSearch } from "~/components/ui/select-search";
import { TYPES_VEHICULE, libelleTypeVehicule } from "~/server/lib/vehicule-service";
import { api } from "~/trpc/react";

/**
 * LOT U0b — FICHE VÉHICULE, COMPOSANT UNIQUE.
 *
 * Deux écrans saisissent la même fiche (réception et parc) avec, jusqu'ici,
 * deux copies du formulaire. Toute divergence entre les deux était un bug en
 * puissance — c'est ainsi qu'un type de véhicule est devenu libre à la
 * réception mais est resté fermé au parc, et qu'un champ a existé d'un seul
 * côté.
 *
 * Le composant est **contrôlé** : il ne détient aucun état, il reçoit la fiche
 * et la modifie. Les deux écrans gardent ainsi leur propre modèle (la réception
 * gère en plus le client, l'état des lieux, la check-list).
 *
 * Les règles de VALIDATION ET D'ÉCRASEMENT ne sont pas ici : elles sont
 * serveur, dans `vehicule-regles.ts`. Ce composant ne fait qu'une chose —
 * ne pas devenir un deuxième endroit où les règles vivent.
 */

const CARBURANTS = ["essence", "diesel", "electrique", "hybride", "gpl"];

export type FicheVehicule = {
  id?: number;
  immatriculation?: string;
  numeroChassis?: string;
  typeVehicule?: string;
  marque?: string;
  modele?: string;
  version?: string;
  annee?: number | string | null;
  couleur?: string;
  carburant?: string;
  kilometrage?: number | string | null;
  // LOT U0d — empreinte physique, reprise du registre parking.
  longueur?: number | string | null;
  largeur?: number | string | null;
  hauteur?: number | string | null;
  poids?: number | string | null;
  dimensionsEstimees?: boolean;
};

function Field({
  label,
  required,
  error,
  hint,
  anchor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** LOT U4 (E10) — ancre de défilement vers le champ en erreur. */
  anchor?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={anchor ? `champ-${anchor}` : undefined}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface FormulaireVehiculeProps {
  value: FicheVehicule;
  onChange: (champ: keyof FicheVehicule, valeur: unknown) => void;
  erreurs?: Partial<Record<keyof FicheVehicule | string, string>>;
  /** Affiche l'empreinte physique (dimensions) — lot U0d. */
  avecDimensions?: boolean;
  /**
   * Affiche le kilométrage dans la fiche.
   *
   * LOT U2 (RD5) : à la RÉCEPTION ce champ est MASQUÉ. Il y coexistait deux
   * champs km aux libellés ambigus (fiche / section Entrée) ; le km qui fait
   * foi à une entrée est celui relevé à l'entrée, pas celui tapé dans la
   * fiche. Le parc, lui, garde le champ (c'est sa référence courante).
   */
  avecKilometrage?: boolean;
  desactive?: boolean;
}

export function FormulaireVehicule({
  value,
  onChange,
  erreurs = {},
  avecDimensions = false,
  avecKilometrage = true,
  desactive = false,
}: FormulaireVehiculeProps) {
  // Liste de référence + types réellement rencontrés par l'agence (U1).
  const typesUtilises = api.vehicules.typesUtilises.useQuery(undefined, { enabled: !desactive });
  const optionsTypeVehicule = useMemo(() => {
    const vues = new Set<string>(TYPES_VEHICULE as readonly string[]);
    for (const o of typesUtilises.data?.options ?? []) vues.add(o.valeur);
    const courant = (value.typeVehicule ?? "").trim();
    if (courant) vues.add(courant);
    return [...vues].map((v) => ({ value: v, label: libelleTypeVehicule(v) }));
  }, [typesUtilises.data?.options, value.typeVehicule]);

  const num = (v: unknown) => (v === "" || v == null ? "" : Number(v));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Immatriculation" required error={erreurs.immatriculation} anchor="immatriculation">
        <Input
          value={value.immatriculation ?? ""}
          onChange={(e) => onChange("immatriculation", e.target.value.toUpperCase())}
          placeholder="AA-123-BB"
          className="font-mono uppercase"
          disabled={desactive}
        />
      </Field>
      <Field label="N° de châssis" error={erreurs.numeroChassis}>
        <Input
          value={value.numeroChassis ?? ""}
          onChange={(e) => onChange("numeroChassis", e.target.value.toUpperCase())}
          className="font-mono uppercase"
          disabled={desactive}
        />
      </Field>
      <Field
        label="Type de véhicule"
        required
        error={erreurs.typeVehicule}
        anchor="typeVehicule"
        hint="Liste de l'agence + saisie libre (ex. « benne »)"
      >
        <SelectSearch
          allowCustom
          customMaxLength={30}
          disabled={desactive}
          value={value.typeVehicule ?? "voiture"}
          onChange={(v) => onChange("typeVehicule", v)}
          options={optionsTypeVehicule}
          placeholder="Sélectionner ou saisir un type…"
          searchPlaceholder="Rechercher ou saisir un type…"
        />
      </Field>
      <Field label="Marque" required error={erreurs.marque} anchor="marque">
        <Input
          value={value.marque ?? ""}
          onChange={(e) => onChange("marque", e.target.value)}
          placeholder="Peugeot, Toyota…"
          disabled={desactive}
        />
      </Field>
      <Field label="Modèle" error={erreurs.modele}>
        <Input
          value={value.modele ?? ""}
          onChange={(e) => onChange("modele", e.target.value)}
          placeholder="308, Corolla…"
          disabled={desactive}
        />
      </Field>
      <Field label="Version / Finition">
        <Input
          value={value.version ?? ""}
          onChange={(e) => onChange("version", e.target.value)}
          placeholder="Allure, Confort…"
          disabled={desactive}
        />
      </Field>
      <Field label="Année" error={erreurs.annee} anchor="annee">
        <Input
          type="number"
          value={value.annee ?? ""}
          onChange={(e) => onChange("annee", num(e.target.value))}
          disabled={desactive}
        />
      </Field>
      <Field label="Couleur">
        <Input
          value={value.couleur ?? ""}
          onChange={(e) => onChange("couleur", e.target.value)}
          disabled={desactive}
        />
      </Field>
      <Field label="Énergie" error={erreurs.carburant}>
        <select
          value={value.carburant ?? ""}
          onChange={(e) => onChange("carburant", e.target.value)}
          disabled={desactive}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">—</option>
          {CARBURANTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      {avecKilometrage && (
        <Field label="Kilométrage" error={erreurs.kilometrage}>
          <Input
            type="number"
            min={0}
            value={value.kilometrage ?? ""}
            onChange={(e) => onChange("kilometrage", num(e.target.value))}
            disabled={desactive}
          />
        </Field>
      )}

      {avecDimensions && (
        <>
          <div className="col-span-full mt-1 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Empreinte physique
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sert à placer le véhicule sur le plan d&apos;occupation. Laisser vide si non mesuré.
            </p>
          </div>
          <Field label="Longueur (m)">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={value.longueur ?? ""}
              onChange={(e) => onChange("longueur", num(e.target.value))}
              disabled={desactive}
            />
          </Field>
          <Field label="Largeur (m)">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={value.largeur ?? ""}
              onChange={(e) => onChange("largeur", num(e.target.value))}
              disabled={desactive}
            />
          </Field>
          <Field label="Hauteur (m)">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={value.hauteur ?? ""}
              onChange={(e) => onChange("hauteur", num(e.target.value))}
              disabled={desactive}
            />
          </Field>
          <Field label="Poids (kg)">
            <Input
              type="number"
              min={0}
              value={value.poids ?? ""}
              onChange={(e) => onChange("poids", num(e.target.value))}
              disabled={desactive}
            />
          </Field>
          <div className="col-span-full">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={!!value.dimensionsEstimees}
                onChange={(e) => onChange("dimensionsEstimees", e.target.checked)}
                disabled={desactive}
              />
              Dimensions estimées (non mesurées)
            </label>
          </div>
        </>
      )}
    </div>
  );
}
