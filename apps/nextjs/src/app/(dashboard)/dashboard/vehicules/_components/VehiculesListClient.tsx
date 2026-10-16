"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Car, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { STATUT_STYLE } from "~/server/lib/vehicule-service";
import { libelleTypeVehicule } from "~/server/lib/vehicule-service";
import { FormulaireVehicule } from "~/components/vehicule/FormulaireVehicule";
import { usePermissions } from "~/hooks/usePermissions";
import { useDebounce } from "~/lib/useDebounce";

const TAILLE_PAGE = 25;

const EMPTY_FORM = {
  immatriculation: "",
  clientId: 0,
  marque: "",
  modele: "",
  version: "",
  annee: "",
  couleur: "",
  numeroChassis: "",
  kilometrage: "",
  carburant: "diesel",
  typeVehicule: "voiture",
  longueur: "",
  largeur: "",
  hauteur: "",
  poids: "",
  dimensionsEstimees: false,
  notes: "",
};

export function VehiculesListClient() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const recherche = useDebounce(search);
  // Changer un filtre renvoie en première page : rester sur la page 7 d'un
  // nouveau filtre affiche un tableau vide, ce qui se lit comme « aucun
  // véhicule » alors qu'il y en a.
  const filtres = {
    search: recherche || undefined,
    statut: statutFilter || undefined,
    limit: TAILLE_PAGE,
    offset: page * TAILLE_PAGE,
  } as const;

  const { data, isLoading, isError, error } = api.vehicules.listeCanonique.useQuery(filtres);
  const { data: clientsData } = api.clients.list.useQuery({ statut: "ACTIF", limit: 200 });
  const create = api.vehicules.create.useMutation({
    onSuccess: (r: any) => {
      if (r?.vehiculeReconcilie) {
        toast.info(`Véhicule déjà connu (${r.immatriculation}) — fiche complétée, rien n'a été écrasé`);
      } else {
        toast.success("Véhicule créé (en réception)");
      }
      utils.vehicules.listeCanonique.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const list = data?.vehicules ?? [];
  const total = data?.total ?? 0;
  const pageCourante = data?.page;
  const optionsStatut = data?.optionsStatut ?? [];
  const clientsList = (clientsData?.clients ?? []) as any[];
  const canCreer = hasPermission("vehicules.creer");

  const optionsFiltrees = (() => {
    // Type explicite : sans lui, TypeScript déduit l'union littérale des
    // statuts du moteur et refuse d'y ajouter un statut inconnu venu de la
    // base — précisément le cas que cette boucle est là pour traiter.
    const liste: { valeur: string; libelle: string; n: number }[] = optionsStatut.map((o) => ({
      valeur: o.valeur,
      libelle: o.libelle,
      n: data?.parStatut?.[o.valeur] ?? 0,
    }));
    // Un statut présent en base mais absent de la nomenclature ne doit pas
    // devenir inaccessible : il apparaît avec son compte, sans libelle inventé.
    for (const [cle, n] of Object.entries(data?.parStatut ?? {})) {
      if (!liste.some((o) => o.valeur === cle) && n > 0) {
        liste.push({ valeur: cle, libelle: cle, n });
      }
    }
    return liste;
  })();

  const submit = () => {
    if (!form.immatriculation.trim()) {
      toast.error("L'immatriculation est requise");
      return;
    }
    create.mutate({
      immatriculation: form.immatriculation.trim(),
      clientId: form.clientId || undefined,
      marque: form.marque || undefined,
      modele: form.modele || undefined,
      version: form.version || undefined,
      annee: form.annee ? Number(form.annee) : undefined,
      couleur: form.couleur || undefined,
      numeroChassis: form.numeroChassis || undefined,
      kilometrage: form.kilometrage ? Number(form.kilometrage) : undefined,
      carburant: form.carburant as any,
      typeVehicule: form.typeVehicule as any,
      longueur: form.longueur ? Number(form.longueur) : undefined,
      largeur: form.largeur ? Number(form.largeur) : undefined,
      hauteur: form.hauteur ? Number(form.hauteur) : undefined,
      poids: form.poids ? Number(form.poids) : undefined,
      dimensionsEstimees: !!form.dimensionsEstimees,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Parc véhicules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque véhicule appartient à un client. Un ordre de réparation s'ouvre sur un véhicule — statuts d'immobilisation suivis de la réception à la sortie.
          </p>
        </div>
        {canCreer && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus size={16} /> Nouveau véhicule
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Plaque, châssis, marque, n° registre, téléphone…"
            className="w-96 pl-9"
          />
        </div>
        {/* Sélecteur servi par le serveur : plus de table de statuts recopiée
            dans l'écran, qui finissait par diverger du moteur. */}
        <select
          value={statutFilter}
          onChange={(e) => {
            setStatutFilter(e.target.value);
            setPage(0);
          }}
          className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none"
        >
          <option value="">Tous les statuts</option>
          {optionsFiltrees.map((o) => (
            <option key={o.valeur} value={o.valeur} className="bg-background">
              {o.libelle} ({o.n})
            </option>
          ))}
        </select>
      </div>

      {/* Le total est réel et porte le filtre courant. Avant, l'écran
          affichait `list.length` : au-delà de 100 véhicules il annonçait
          « 100 résultats » comme si le parc s'arrêtait là. */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {isLoading
            ? "Chargement…"
            : total === 0
              ? "Aucun véhicule"
              : `${total} véhicule${total > 1 ? "s" : ""}${recherche || statutFilter ? " pour cette recherche" : " au parc"}`}
        </span>
        {pageCourante && pageCourante.pages > 1 && (
          <span>
            Page {pageCourante.page} sur {pageCourante.pages}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Véhicule</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Propriétaire</th>
              <th className="px-4 py-2.5">Position</th>
              <th className="px-4 py-2.5 text-right">Kilométrage</th>
              <th className="px-4 py-2.5 text-center">Statut</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : isError ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-destructive">{error.message}</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                <Car size={32} className="mx-auto mb-2 opacity-40" />
                {recherche || statutFilter
                  ? "Aucun véhicule ne correspond à cette recherche."
                  : "Aucun véhicule au parc. Enregistrez le premier véhicule."}
              </td></tr>
            ) : (
              list.map((v) => (
                <tr key={v.id} className="text-sm text-foreground hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    {v.immatriculation ? (
                      <Link href={`/dashboard/vehicules/${v.id}`} className="font-mono font-semibold hover:text-primary">{v.immatriculation}</Link>
                    ) : (
                      // 12 véhicules du parking n'ont pas de plaque relevée.
                      // Afficher une ligne vide ferait croire à une fiche
                      // corrompue : c'est un état métier normal.
                      <span className="text-xs italic text-muted-foreground">Sans plaque relevée</span>
                    )}
                    <div className="text-xs text-muted-foreground">{v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ""}</div>
                    {v.orEnCours && (
                      <Link
                        href={`/dashboard/ordres-reparation/${v.orEnCours.id}`}
                        className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary hover:bg-primary/20"
                      >
                        OR {v.orEnCours.numero} en cours
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {libelleTypeVehicule(v.typeVehicule)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{v.clientNom ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {v.position
                      ? [v.position.siteNom, v.position.zoneNom, v.position.spotCode].filter(Boolean).join(" · ") || `N° ${v.position.numRegistre}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{v.kilometrage ? `${v.kilometrage.toLocaleString("fr-FR")} km` : "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_STYLE[v.statutImmobilisation ?? ""] ?? ""}`}>
                      {optionsStatut.find((o) => o.valeur === v.statutImmobilisation)?.libelle ?? v.statutImmobilisation ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/dashboard/vehicules/${v.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Fiche</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCourante && pageCourante.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="gap-1"
          >
            <ChevronLeft size={14} /> Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCourante.pages}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1"
          >
            Suivant <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Car size={18} className="text-primary" /> Nouveau véhicule
              </h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 hover:bg-accent">✕</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Propriétaire (client)</Label>
                  <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value={0}>— Aucun —</option>
                    {clientsList.map((cl: any) => (
                      <option key={cl.id} value={cl.id}>{cl.raisonSociale ?? `${cl.prenom ?? ""} ${cl.nom}`}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* LOT U0b — fiche VÉHICULE partagées avec la réception : une
                  seule définition des champs, donc plus de divergence possible
                  entre les deux points de saisie. */}
              <FormulaireVehicule
                value={form}
                onChange={(champ, valeur) => setForm({ ...form, [champ]: valeur })}
                avecDimensions
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={submit} disabled={create.isPending} className="gap-2">
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 size={15} />}
                Créer le véhicule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}