"use client";

import { useState, useEffect } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  WifiOff, Map, Smartphone, Scale, BookOpen, Shield, Clock, ChevronRight,
  Sparkles, TrendingUp, Package, ShoppingCart, BarChart3, Users, Globe,
  CheckCircle, ArrowRight, Play, Star, Zap, Database, Lock, HeadphonesIcon,
  Monitor, CreditCard, FileText, Layers
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  const navbarOpacity = useTransform(scrollY, [0, 50], [1, 0.95]);
  const navbarBlur = useTransform(scrollY, [0, 50], ["blur(0px)", "blur(8px)"]);

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", updateScroll);
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-[Geist]">
      {/* ==================== NAVBAR ==================== */}
      <motion.nav
        style={{ opacity: navbarOpacity, backdropFilter: navbarBlur }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-slate-950/80 border-b border-slate-800" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <BookOpen className="w-8 h-8 text-indigo-400" />
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                LibraCore
              </span>
            </motion.div>

            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">Fonctionnalités</a>
              <a href="#sectors" className="text-sm text-slate-400 hover:text-white transition-colors">Secteurs</a>
              <a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Tarifs</a>
              <a href="#faq" className="text-sm text-slate-400 hover:text-white transition-colors">FAQ</a>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4"
            >
              <Link
                href="/login"
                className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block"
              >
                Connexion
              </Link>
              <Link
                href="/setup"
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-cyan-700 transition-all shadow-lg shadow-indigo-600/20"
              >
                Essai Gratuit
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.nav>

      {/* ==================== SECTION 1: HERO ==================== */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div variants={fadeInUp} className="mb-6">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-full text-sm text-slate-300 border border-slate-700">
                <Sparkles className="w-4 h-4 text-amber-400" />
                OS Retail unifié pour le multi-sites
              </span>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
            >
              Unifiez{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                vente, stock, caisse et pilotage
              </span>
              {" "}multi-sites
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="text-lg sm:text-xl text-slate-400 mb-10 max-w-2xl mx-auto"
            >
              La plateforme SaaS conçue pour les librairies, papeteries et commerces
              qui veulent une gestion rapide, fiable et traçable de toutes leurs opérations.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/setup"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-xl text-lg font-semibold hover:from-indigo-700 hover:to-cyan-700 transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 group"
              >
                Essayer gratuitement
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="w-full sm:w-auto px-8 py-4 bg-slate-800 border border-slate-700 rounded-xl text-lg font-semibold hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                Demander une démo
              </Link>
            </motion.div>

            <motion.p variants={fadeInUp} className="mt-6 text-sm text-slate-500">
              Aucune carte bancaire requise • 14 jours d'essai complet • Support local 7j/7
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 2: PROPOSITION DE VALEUR ==================== */}
      <section className="py-20 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Passez du système local au Cloud temps réel
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Fini les logiciels fragiles installés sur un seul poste. LibraCore centralise
              toutes vos opérations dans une plateforme sécurisée, accessible partout.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Avant */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
              className="p-6 bg-red-500/5 rounded-2xl border border-red-500/20"
            >
              <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center text-sm">✕</span>
                Avant : Système local
              </h3>
              <ul className="space-y-3 text-slate-400 text-sm">
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Un seul poste, une seule agence</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Stock non fiable, écarts fréquents</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Pas de visibilité multi-sites</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Données vulnérables, pas de backup</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Rapports manuels, lents et error-prone</li>
              </ul>
            </motion.div>

            {/* Après */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
              className="p-6 bg-emerald-500/5 rounded-2xl border border-emerald-500/20"
            >
              <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Avec LibraCore Cloud
              </h3>
              <ul className="space-y-3 text-slate-300 text-sm">
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Multi-sites natif, accès depuis partout</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Stock basé sur des mouvements traçables</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Dashboard centralisé en temps réel</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Chiffrement AES-256, backups automatiques</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Rapports automatiques, décisions éclairées</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ==================== SECTION 3: BÉNÉFICES MÉTIER (ROI) ==================== */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Un ROI mesurable dès le premier mois
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              LibraCore n'est pas qu'un outil de plus. C'est un investissement qui transforme votre exploitation.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[
              {
                icon: Zap,
                metric: "3x",
                title: "Ventes plus rapides",
                desc: "POS optimisé pour scanner et encaisser en quelques secondes"
              },
              {
                icon: Package,
                metric: "0",
                title: "Ruptures de stock",
                desc: "Alertes automatiques et suggestions de réapprovisionnement"
              },
              {
                icon: CreditCard,
                metric: "100%",
                title: "Caisse maîtrisée",
                desc: "Zéro écart inexpliqué grâce au suivi session par session"
              },
              {
                icon: BarChart3,
                metric: "24/7",
                title: "Pilotage centralisé",
                desc: "Voyez tout depuis votre dashboard, même à distance"
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all"
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                  {item.metric}
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 4: MODULES PRINCIPAUX ==================== */}
      <section id="features" className="py-20 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tout ce dont vous avez besoin, intégré nativement
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Pas d'intégrations compliquées, pas de frais cachés.
              Tous les modules essentiels sont inclus.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {/* POS ultra-rapide */}
            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group col-span-1 lg:col-span-2 row-span-2 p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700 hover:border-indigo-500/50 transition-all"
            >
              <div className="w-14 h-14 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShoppingCart className="w-7 h-7 text-indigo-400" />
              </div>
              <h3 className="text-2xl font-bold mb-3">POS ultra-rapide</h3>
              <p className="text-slate-400 text-lg mb-4">
                Encaissez en quelques secondes. Recherche instantanée, scan code-barres,
                panier fluide, et validation backend pour garantir la cohérence.
              </p>
              <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
                <WifiOff className="w-4 h-4" />
                Fonctionne même sans connexion internet
              </div>
            </motion.div>

            {/* Ledger de Stock */}
            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700 hover:border-indigo-500/50 transition-all"
            >
              <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4">
                <Database className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Ledger de Stock</h3>
              <p className="text-slate-400 text-sm">
                Chaque mouvement est tracé. La vérité du stock vient des événements,
                pas d'un simple compteur.
              </p>
            </motion.div>

            {/* Gestion de Caisse */}
            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700 hover:border-indigo-500/50 transition-all"
            >
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-4">
                <CreditCard className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Gestion de Caisse</h3>
              <p className="text-slate-400 text-sm">
                Sessions ouvertes, sorties justifiées, clôture avec rapprochement
                théorique/physique.
              </p>
            </motion.div>

            {/* Achats fournisseurs */}
            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="col-span-1 sm:col-span-2 p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700 hover:border-indigo-500/50 transition-all"
            >
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Achats fournisseurs</h3>
              <p className="text-slate-400 text-sm">
                Bons de commande, réceptions partielles, écarts tracés, coûts réels capturés.
                Suggestions de réapprovisionnement intelligentes.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 5: CAS D'USAGE / VERTICAUX ==================== */}
      <section id="sectors" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 rounded-full text-sm text-indigo-300 border border-indigo-500/30 mb-6">
              <Users className="w-4 h-4" />
              Pensé pour vous
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Adapté à votre métier
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              LibraCore a été conçu pour les réalités spécifiques du commerce spécialisé africain.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[
              {
                icon: BookOpen,
                title: "Librairies",
                desc: "Gestion ISBN, auteurs, éditeurs. Listes scolaires automatisées. Suivi des nouveautés et collections.",
                color: "indigo"
              },
              {
                icon: FileText,
                title: "Papeteries",
                desc: "Catalogue riche avec variantes. Gestion des fournitures par lot. Prix par quantité et remises scolaires.",
                color: "cyan"
              },
              {
                icon: Layers,
                title: "Fournitures scolaires",
                desc: "Import des listes MINEDUB. Génération automatique des commandes. Suivi des manques par établissement.",
                color: "amber"
              },
              {
                icon: Map,
                title: "Retail multi-boutiques",
                desc: "Jusqu'à 10 points de vente. Transferts de stock en 2 clics. Dashboard centralisé multi-sites.",
                color: "emerald"
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all"
              >
                <div className={`w-12 h-12 bg-${item.color}-500/10 rounded-xl flex items-center justify-center mb-4`}>
                  <item.icon className={`w-6 h-6 text-${item.color}-400`} />
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 6: DIFFÉRENCIATEURS ==================== */}
      <section className="py-20 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ce qui nous rend uniques
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Des choix d'architecture qui font la différence au quotidien.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[
              {
                icon: Database,
                title: "Stock basé sur les mouvements",
                desc: "Pas de simple compteur. Chaque entrée, sortie, transfert est un événement tracé. La vérité est auditable."
              },
              {
                icon: Shield,
                title: "Aucune suppression destructive",
                desc: "Les erreurs se corrigent par void, reversal ou retour. L'historique est toujours intact."
              },
              {
                icon: Globe,
                title: "Multi-sites natif",
                desc: "Conçu dès le départ pour gérer plusieurs agences. Transferts, stock par site, dashboard consolidé."
              },
              {
                icon: Lock,
                title: "Audit trail intégré",
                desc: "Chaque action sensible est journalisée. Qui, quoi, quand, pourquoi. Contrôle interne renforcé."
              },
              {
                icon: WifiOff,
                title: "Offline-first pour le POS",
                desc: "Travaillez même sans connexion. Les données se synchronisent automatiquement quand le réseau revient."
              },
              {
                icon: TrendingUp,
                title: "Analytics temps réel",
                desc: "Dashboards alimentés par des read models dédiés. Pas de ralentissement sur les opérations."
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="flex items-start gap-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all"
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <item.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-400">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 7: DÉMONSTRATION PRODUIT ==================== */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Une interface pensée pour le terrain
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Rapide, claire, sans friction. Voyez par vous-même.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="relative max-w-5xl mx-auto"
          >
            <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl shadow-indigo-500/10">
              {/* Mock UI Preview */}
              <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center text-sm text-slate-400">
                  app.libracore.cm/dashboard
                </div>
              </div>
              <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Mock Dashboard Widgets */}
                {[
                  { label: "Ventes du jour", value: "1 250 000 FCFA", change: "+12%", color: "indigo" },
                  { label: "Tickets", value: "147", change: "+8%", color: "cyan" },
                  { label: "Stock critique", value: "23 produits", change: "-5", color: "amber" },
                  { label: "Écart caisse", value: "0 FCFA", change: "Parfait", color: "emerald" }
                ].map((widget, i) => (
                  <div key={i} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">{widget.label}</p>
                    <p className="text-lg font-bold">{widget.value}</p>
                    <p className={`text-xs text-${widget.color}-400 mt-1`}>{widget.change}</p>
                  </div>
                ))}
              </div>
              <div className="p-8 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 h-32 flex items-center justify-center text-slate-500">
                  <BarChart3 className="w-8 h-8 mr-2" />
                  Graphique des ventes 7 jours
                </div>
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 h-32 flex items-center justify-center text-slate-500">
                  <Package className="w-8 h-8 mr-2" />
                  Top produits vendus
                </div>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 rounded-3xl blur-2xl -z-10" />
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 8: PREUVE SOCIALE ==================== */}
      <section className="py-20 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ils nous font confiance
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Plus de 120 librairies et commerces utilisent LibraCore au quotidien.
            </p>
          </motion.div>

          {/* Testimonials */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
          >
            {[
              {
                quote: "Depuis LibraCore, nos écarts de caisse sont passés de 50 000 FCFA/mois à zéro. Le suivi session par session a tout changé.",
                author: "Marie D.",
                role: "Gérante, Librairie du Centre - Yaoundé"
              },
              {
                quote: "La rentrée scolaire n'est plus un cauchemar. On importe les listes MINEDUB et les commandes se génèrent automatiquement.",
                author: "Jean K.",
                role: "Directeur, Papeterie Scolaire - Douala"
              },
              {
                quote: "On gère 4 boutiques depuis un seul écran. Les transferts de stock se font en 2 clics. Avant, c'était le chaos.",
                author: "Sophie T.",
                role: "Propriétaire, Réseau Fournitures Plus"
              }
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 text-sm mb-4 italic">&ldquo;{testimonial.quote}&rdquo;</p>
                <div>
                  <p className="font-bold text-sm">{testimonial.author}</p>
                  <p className="text-slate-400 text-xs">{testimonial.role}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Metrics */}
          <motion.div
            variants={fadeInUp}
            className="grid grid-cols-2 md:grid-cols-4 gap-6"
          >
            {[
              { value: "120+", label: "Commerces actifs" },
              { value: "99.9%", label: "Uptime garanti" },
              { value: "2M+", label: "Tickets traités" },
              { value: "7j/7", label: "Support local" }
            ].map((metric, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                  {metric.value}
                </div>
                <div className="text-sm text-slate-400 mt-1">{metric.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 9: PRICING TEASER ==================== */}
      <section id="pricing" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Des tarifs simples et transparents
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Pas de frais cachés. Pas de surprise. Choisissez le plan qui correspond à votre activité.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
          >
            {[
              {
                name: "Starter",
                price: "15 000",
                desc: "Pour une seule librairie",
                features: ["1 point de vente", "Stock illimité", "Caisse sessionnelle", "Rapports de base", "Support email"],
                cta: "Commencer",
                highlighted: false
              },
              {
                name: "Business",
                price: "35 000",
                desc: "Pour les commerces en croissance",
                features: ["Jusqu'à 3 points de vente", "Transferts inter-sites", "Achats fournisseurs", "Alertes stock", "Support prioritaire"],
                cta: "Le plus populaire",
                highlighted: true
              },
              {
                name: "Enterprise",
                price: "Sur mesure",
                desc: "Pour les réseaux multi-sites",
                features: ["Points de vente illimités", "API & intégrations", "Rôles personnalisés", "Audit avancé", "Account manager dédié"],
                cta: "Nous contacter",
                highlighted: false
              }
            ].map((plan, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className={`relative p-6 rounded-2xl border ${
                  plan.highlighted
                    ? "bg-gradient-to-b from-indigo-900/50 to-slate-900 border-indigo-500/50 shadow-xl shadow-indigo-500/10"
                    : "bg-slate-900/50 border-slate-800"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 rounded-full text-xs font-medium">
                    Recommandé
                  </div>
                )}
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.price !== "Sur mesure" && <span className="text-slate-400 text-sm"> FCFA/mois</span>}
                </div>
                <p className="text-slate-400 text-sm mb-6">{plan.desc}</p>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                      <span className="text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/setup"
                  className={`block w-full py-3 rounded-xl text-center font-medium transition-all ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700"
                      : "bg-slate-800 hover:bg-slate-700 border border-slate-700"
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center mt-8">
            <Link href="/pricing" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium inline-flex items-center gap-1">
              Voir le comparatif détaillé <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 10: FAQ COURTE ==================== */}
      <section id="faq" className="py-20 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Questions fréquentes
            </h2>
            <p className="text-slate-400">
              Les réponses aux questions que se posent nos clients avant de se lancer.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="space-y-4"
          >
            {[
              {
                q: "Comment se passe la migration depuis mon système actuel ?",
                a: "Nous importons votre catalogue produits, vos stocks initiaux et vos données clients. Notre équipe vous accompagne pour une transition en douceur, avec une période de test avant la bascule définitive."
              },
              {
                q: "Le système fonctionne-t-il vraiment sans internet ?",
                a: "Oui. Le POS est conçu pour fonctionner en mode offline-first. Toutes les ventes et mouvements de stock sont enregistrés localement et se synchronisent automatiquement dès que la connexion revient."
              },
              {
                q: "Quel matériel est nécessaire ?",
                a: "Un simple ordinateur avec un navigateur web suffit. Pour le POS, nous recommandons un écran tactile et une douchette code-barres USB. Nous pouvons vous conseiller des fournisseurs de matériel compatibles."
              },
              {
                q: "Mes données sont-elles en sécurité ?",
                a: "Absolument. Chiffrement AES-256, Row Level Security par organisation, backups automatiques hors site. Chaque organisation ne voit que ses propres données. L'audit trail trace toutes les actions sensibles."
              },
              {
                q: "Puis-je essayer avant de m'engager ?",
                a: "Oui, 14 jours d'essai gratuit avec toutes les fonctionnalités. Aucune carte bancaire requise. Vous pouvez configurer votre espace, importer vos produits et faire vos premières ventes test."
              }
            ].map((faq, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800"
              >
                <h3 className="font-bold mb-2">{faq.q}</h3>
                <p className="text-slate-400 text-sm">{faq.a}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== SECTION 11: CTA FINAUX + FOOTER ==================== */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="relative p-8 sm:p-12 bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 rounded-3xl border border-indigo-500/30 text-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-indigo-500/10" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Prêt à transformer votre commerce ?
              </h2>
              <p className="text-slate-300 mb-8 max-w-xl mx-auto">
                Rejoignez plus de 120 commerces qui ont déjà fait confiance à LibraCore
                pour gérer leur activité au quotidien.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/setup"
                  className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 rounded-xl text-lg font-semibold hover:bg-slate-100 transition-all shadow-xl shadow-indigo-900/30 flex items-center justify-center gap-2"
                >
                  Démarrer mon essai gratuit
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/demo"
                  className="w-full sm:w-auto px-8 py-4 bg-slate-800 border border-slate-700 rounded-xl text-lg font-semibold hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Demander une démo
                </Link>
              </div>
              <p className="mt-6 text-sm text-slate-400">
                Aucune carte bancaire • Annulation à tout moment • Support local 7j/7
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-6 h-6 text-indigo-400" />
                <span className="font-bold">LibraCore</span>
              </div>
              <p className="text-sm text-slate-400">
                L'OS Retail unifié pour les commerces spécialisés africains.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4 text-sm">Produit</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Tarifs</a></li>
                <li><a href="#sectors" className="hover:text-white transition-colors">Secteurs</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4 text-sm">Entreprise</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">À propos</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Carrières</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4 text-sm">Légal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Mentions légales</a></li>
                <li><a href="#" className="hover:text-white transition-colors">CGU</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Politique de confidentialité</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookies</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              © 2026 Genesis Core • LibraCore v1.0.0
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Shield className="w-4 h-4" />
              Sécurisé par chiffrement AES-256
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
