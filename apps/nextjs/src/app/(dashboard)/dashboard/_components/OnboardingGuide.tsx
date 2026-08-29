"use client";

import { useEffect, useState } from "react";
import { Car, ClipboardList, KeyRound, Package, Users, Wrench, X } from "lucide-react";
import Link from "next/link";

const ETAPES = [
  { icon: Car, titre: "1. Enregistrez vos véhicules", texte: "Allez dans Véhicules & Atelier → Véhicules pour créer la fiche de chaque véhicule (immatriculation, propriétaire, chauffeur).", href: "/dashboard/vehicules" },
  { icon: ClipboardList, titre: "2. Ouvrez un ordre de réparation", texte: "Plainte → diagnostic → devis client → travaux → facture. Tout le cycle est suivi, même hors-ligne.", href: "/dashboard/ordres-reparation" },
  { icon: Package, titre: "3. Alimentez le stock", texte: "Créez vos pièces (catalogue), enregistrez vos fournisseurs et vos factures pour une archive retrouvable.", href: "/dashboard/fournisseurs-factures" },
  { icon: Users, titre: "4. Complétez vos clients", texte: "Fiches 360°, contrats de maintenance, activité & factures par période — dans Clients & Contrats.", href: "/dashboard/customers" },
  { icon: KeyRound, titre: "5. Vérifiez votre abonnement", texte: "Votre licence, vos paiements et la synchronisation sont visibles dans Mon abonnement.", href: "/dashboard/mon-abonnement" },
];

const CLE = "ao.onboarding.done";

export function OnboardingGuide() {
  const [visible, setVisible] = useState(false);
  const [etape, setEtape] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CLE)) setVisible(true);
    } catch { /* ignore */ }
  }, []);

  const fermer = () => {
    setVisible(false);
    try { localStorage.setItem(CLE, "1"); } catch { /* ignore */ }
  };

  if (!visible) return null;
  const e = ETAPES[etape];
  const Icon = e.icon;

  return (
    <div className="fixed bottom-24 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-primary/30 bg-card p-5 shadow-2xl md:bottom-8 md:right-8">
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon size={18} className="text-primary" />
        </div>
        <button onClick={fermer} aria-label="Fermer le guide" className="rounded-lg p-1 text-muted-foreground hover:bg-accent">
          <X size={14} />
        </button>
      </div>
      <h3 className="mt-3 text-sm font-bold text-foreground">{e.titre}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.texte}</p>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">
          {ETAPES.map((_, i) => (
            <span key={i} className={`h-1.5 w-4 rounded-full ${i === etape ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {etape > 0 && (
            <button onClick={() => setEtape(etape - 1)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Précédent</button>
          )}
          {etape < ETAPES.length - 1 ? (
            <button onClick={() => setEtape(etape + 1)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Suivant</button>
          ) : (
            <Link href={e.href} onClick={fermer} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Commencer</Link>
          )}
        </div>
      </div>
    </div>
  );
}