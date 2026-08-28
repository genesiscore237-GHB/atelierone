import Link from "next/link";
import { Activity, BadgeCheck, Building2, CloudOff, CreditCard, Globe2, KeyRound, RefreshCw, ShieldCheck, WifiOff, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

const PLANS = [
  { nom: "Starter", prix: "15 000 F/mois", detail: "1 garage · 5 utilisateurs · Stock & facturation", badge: null },
  { nom: "Pro", prix: "25 000 F/mois", detail: "1 garage · illimité · RH + Performance & Qualité", badge: "Populaire" },
  { nom: "Flotte", prix: "50 000 F/mois", detail: "Multi-agences · flottes · support prioritaire", badge: null },
];

const FONCTIONS = [
  { icon: WifiOff, titre: "Hors-ligne d'abord", texte: "Coupure d'Internet ? Le garage continue de travailler. Les données se synchronisent au retour de la connexion." },
  { icon: KeyRound, titre: "Licence à décompte", texte: "Chaque installation garde le contrôle : alerte à J-7, lecture seule à l'échéance, blocage après 7 jours de grâce." },
  { icon: RefreshCw, titre: "Synchronisation automatique", texte: "Ventes, ordres de réparation, stocks, RH : tout remonte au serveur central toutes les 5 minutes." },
  { icon: ShieldCheck, titre: "Données chez vous", texte: "Les données du garage restent sur son propre serveur local. Le cloud central n'est qu'un miroir sécurisé." },
  { icon: CreditCard, titre: "Paiement mobile money", texte: "Orange Money, MTN MoMo, cartes : abonnement mensuel, renouvelé automatiquement dès le paiement." },
  { icon: Globe2, titre: "Supervision pour vous", texte: "Un tableau de bord central : tous vos garages, leurs licences, leurs paiements, leur activité en temps réel." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background font-sans text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/10">
        <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Zap size={12} className="text-primary" /> ERP pour garages — hors-ligne first
            </span>
            <h1 className="mt-6 text-4xl font-black tracking-tight md:text-6xl">
              Atelier<span className="text-primary">One</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground md:text-xl">
              Le garage ne s'arrête jamais. Ordres de réparation, facturation, stock, RH, performance :
              <span className="font-semibold text-foreground"> tout fonctionne même sans Internet</span>, et se synchronise automatiquement.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
                Commencer l'essai (30 jours)
              </Link>
              <a href="#fonctions" className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold hover:bg-accent">
                Découvrir les fonctions
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Essai gratuit 30 jours · sans carte bancaire · installation sur votre serveur</p>
          </div>
        </div>
      </section>

      {/* Preuves */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: CloudOff, chiffre: "100 %", label: "Hors-ligne — le garage ne dépend plus d'Internet" },
            { icon: Zap, chiffre: "5 min", label: "Synchronisation automatique vers le central" },
            { icon: ShieldCheck, chiffre: "+7 j", label: "De grâce après l'échéance avant tout blocage" },
          ].map((p) => (
            <div key={p.label} className="rounded-2xl border border-border bg-card p-6">
              <p.icon size={20} className="text-primary" />
              <p className="mt-3 text-3xl font-black">{p.chiffre}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctions */}
      <section id="fonctions" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-black md:text-3xl">Tout le cycle du garage, en local</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
          Chaque garage installe le logiciel sur son propre serveur. Il garde ses données, son rythme, son indépendance.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FONCTIONS.map((f) => (
            <div key={f.titre} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
              <f.icon size={18} className="text-primary" />
              <h3 className="mt-3 font-bold">{f.titre}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.texte}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules métier */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-black md:text-3xl">Le cœur métier, complet</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Clients & contrats", "Véhicules & parc (P1-P4)", "Diagnostic & devis", "Demandes pièces", "Commandes fournisseurs", "Facturation & encaissements", "Stock V2 (cores, kits, DLC)", "Inventaire", "RH complet (paie, pointage)", "Performance & Qualité", "Photos & scans", "Retours fournisseur"].map((m) => (
            <span key={m} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <BadgeCheck size={12} className="mr-1 inline text-primary" /> {m}
            </span>
          ))}
        </div>
      </section>

      {/* Tarifs */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-center text-2xl font-black md:text-3xl">Des prix simples, en FCFA</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.nom} className={`relative rounded-2xl border p-6 ${p.badge ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
              {p.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase text-primary-foreground">{p.badge}</span>
              )}
              <h3 className="font-bold">{p.nom}</h3>
              <p className="mt-2 text-2xl font-black">{p.prix}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
              <Link href="/login" className="mt-5 block rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-bold text-primary-foreground hover:bg-primary/90">
                Essayer 30 jours
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Paiement par <Building2 size={11} className="inline" /> Orange Money · MTN MoMo · carte — renouvellement automatique à chaque paiement.
        </p>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-10">
          <Activity size={24} className="mx-auto text-primary" />
          <h2 className="mt-3 text-2xl font-black">Prêt à équiper votre garage — ou ceux de vos clients ?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Installation en quelques minutes sur n'importe quel serveur (Docker). Les données restent au garage, la licence suit le paiement.
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
            Démarrer l'essai gratuit
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/10 py-8 text-center text-xs text-muted-foreground">
        <p>AtelierOne — ERP garage offline-first · Cameroun</p>
        <p className="mt-1">Vos données chez vous · Supervision centralisée · Licence à décompte</p>
      </footer>
    </main>
  );
}