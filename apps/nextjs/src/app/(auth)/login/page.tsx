"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle, Eye, EyeOff, Loader2, Lock, Mail, UserPlus, X, ArrowLeft } from "lucide-react";
import { signIn } from "next-auth/react";
import Image from "next/image";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activated = searchParams.get("activated");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [showActivated, setShowActivated] = useState(activated === "true");

  useEffect(() => {
    if (activated === "true") setShowActivated(true);
  }, [activated]);

  // Détection 2FA : affiche le champ code quand le compte l'exige
  useEffect(() => {
    if (!email.trim().includes("@")) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/2fa-status?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        const data = await res.json();
        setNeedTotp(data?.required === true);
      } catch {
        setNeedTotp(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [email]);

  // Première connexion state
  const [showFirstLogin, setShowFirstLogin] = useState(false);
  const [flStep, setFlStep] = useState<"verify" | "password" | "success">("verify");
  const [flLoginId, setFlLoginId] = useState("");
  const [flPassword, setFlPassword] = useState("");
  const [flConfirm, setFlConfirm] = useState("");
  const [flShowPw, setFlShowPw] = useState(false);
  const [flShowCf, setFlShowCf] = useState(false);
  const [flLoading, setFlLoading] = useState(false);
  const [flError, setFlError] = useState("");
  const [flUserName, setFlUserName] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email requis"); return; }
    if (!password.trim()) { setError("Mot de passe requis"); return; }
    if (needTotp && !totp.trim()) { setError("Code 2FA requis"); return; }
    setIsLoading(true);
    try {
      const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, totp: needTotp ? totp.trim() : "", redirect: false });
      if (result?.error) { setError(needTotp ? "Code 2FA invalide ou expiré." : "Identifiants incorrects."); setIsLoading(false); return; }
      router.push("/dashboard");
      router.refresh();
    } catch { setError("Erreur de connexion."); setIsLoading(false); }
  };

  const handleVerifyLoginId = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlError("");
    if (!flLoginId.trim()) { setFlError("Saisissez votre identifiant"); return; }
    setFlLoading(true);
    try {
      const { verifyLoginIdAction } = await import("@/lib/auth-actions");
      const result = await verifyLoginIdAction(flLoginId.trim());
      if ("error" in result) { setFlError(result.error ?? ""); setFlLoading(false); return; }
      setFlUserName(`${result.user.prenom ?? ""} ${result.user.nom}`.trim());
      setFlStep("password");
      setFlLoading(false);
    } catch { setFlError("Une erreur est survenue."); setFlLoading(false); }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlError("");
    if (!flPassword || flPassword.length < 6) { setFlError("Minimum 6 caractères"); return; }
    if (flPassword !== flConfirm) { setFlError("Les mots de passe ne correspondent pas"); return; }
    setFlLoading(true);
    try {
      const { activateFirstLoginAction } = await import("@/lib/auth-actions");
      const result = await activateFirstLoginAction({ email: flLoginId.trim(), password: flPassword });
      if ("error" in result) { setFlError(result.error ?? ""); setFlLoading(false); return; }
      setFlStep("success");
      setFlLoading(false);
    } catch { setFlError("Une erreur est survenue."); setFlLoading(false); }
  };

  const closeFirstLogin = () => {
    setShowFirstLogin(false);
    setTimeout(() => {
      setFlStep("verify");
      setFlLoginId("");
      setFlPassword("");
      setFlConfirm("");
      setFlError("");
      setFlUserName("");
    }, 300);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0f172a]">
      {showActivated && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-3 text-center shadow-2xl backdrop-blur-xl"
          >
            <CheckCircle className="mx-auto mb-1 h-5 w-5 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">Compte activé avec succès !</p>
            <p className="text-xs text-emerald-400/70">Connectez-vous avec vos identifiants.</p>
            <button onClick={() => setShowActivated(false)} className="absolute top-1 right-2 text-emerald-500/50 hover:text-emerald-300">
              <X size={14} />
            </button>
          </motion.div>
        </div>
      )}

      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-[100px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-slate-600/20 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl sm:p-10"
        >
          <div className="mb-8 text-center">
            <div className="relative mx-auto mb-4 flex h-20 w-20 sm:h-32 sm:w-32 items-center justify-center rounded-full bg-white shadow-xl">
              <Image src="/logo.png" alt="AtelierOne" fill className="object-contain p-2" priority />
            </div>
            <h1 className="text-xl font-bold text-white">AtelierOne</h1>
            <p className="mt-1 text-sm text-slate-400">Espace de connexion sécurisé</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Adresse Email</label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-5 w-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pr-4 pl-10 text-white placeholder-slate-500 transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="votre@email.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Mot de passe</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-12 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="********"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="text-right">
                <span className="text-sm text-slate-500">Mot de passe oublié ? Contactez votre administrateur</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] disabled:opacity-70"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Se Connecter
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setShowFirstLogin(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
            >
              <UserPlus className="h-3 w-3" />
              Première connexion
            </button>
          </div>

          <div className="mt-4 text-center text-xs text-slate-500">
            Problème d'accès ? Contactez l'administrateur AtelierOne.
          </div>
        </motion.div>
      </div>

      {/* Première Connexion Modal */}
      <AnimatePresence>
        {showFirstLogin && (
          <div
            ref={overlayRef}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
            onClick={(e) => { if (e.target === overlayRef.current) closeFirstLogin(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-[#020617] p-8 shadow-2xl"
            >
              {flStep === "verify" && (
                <>
                  <div className="mb-6 flex items-center gap-4 text-white">
                    <div className="rounded-2xl bg-blue-600/20 p-3 text-blue-500"><UserPlus size={24} /></div>
                    <h2 className="text-xl font-black tracking-tighter uppercase italic">Première connexion</h2>
                  </div>
                  <form onSubmit={handleVerifyLoginId} className="space-y-4">
                    <p className="text-xs text-slate-400">
                      Saisissez l'identifiant qui vous a été communiqué par votre administrateur.
                    </p>
                    <div className="relative">
                      <Mail className="absolute top-3 left-3 h-5 w-5 text-slate-500" />
                      <input
                        type="text"
                        value={flLoginId}
                        onChange={(e) => { setFlLoginId(e.target.value); setFlError(""); }}
                        placeholder="prenom.nom@gpj.cm"
                        className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pr-4 pl-10 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                        required
                        autoFocus
                      />
                    </div>
                    {flError && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-center text-xs text-red-400">
                        {flError}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={flLoading}
                      className="w-full rounded-2xl bg-blue-600 py-4 text-xs font-black text-white uppercase shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 disabled:opacity-50"
                    >
                      {flLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Vérifier mon identifiant"}
                    </button>
                  </form>
                </>
              )}

              {flStep === "password" && (
                <>
                  <div className="mb-6 flex items-center gap-4 text-white">
                    <button onClick={() => setFlStep("verify")} className="text-slate-400 hover:text-white">
                      <ArrowLeft size={20} />
                    </button>
                    <div className="rounded-2xl bg-blue-600/20 p-3 text-blue-500"><Lock size={24} /></div>
                    <h2 className="text-xl font-black tracking-tighter uppercase italic">Créer mon mot de passe</h2>
                  </div>
                  <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                    <p className="text-sm font-medium text-white">{flUserName}</p>
                    <p className="text-[10px] text-slate-500">{flLoginId}</p>
                  </div>
                  <form onSubmit={handleActivate} className="space-y-4">
                    <div className="relative">
                      <Lock className="absolute top-3 left-3 h-5 w-5 text-slate-400" />
                      <input
                        type={flShowPw ? "text" : "password"}
                        value={flPassword}
                        onChange={(e) => { setFlPassword(e.target.value); setFlError(""); }}
                        placeholder="Nouveau mot de passe"
                        className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pr-12 pl-10 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                        required
                        autoFocus
                      />
                      <button type="button" onClick={() => setFlShowPw(!flShowPw)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-300">
                        {flShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute top-3 left-3 h-5 w-5 text-slate-400" />
                      <input
                        type={flShowCf ? "text" : "password"}
                        value={flConfirm}
                        onChange={(e) => { setFlConfirm(e.target.value); setFlError(""); }}
                        placeholder="Confirmer le mot de passe"
                        className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pr-12 pl-10 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                        required
                      />
                      <button type="button" onClick={() => setFlShowCf(!flShowCf)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-300">
                        {flShowCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {flError && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-center text-xs text-red-400">
                        {flError}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={flLoading}
                      className="w-full rounded-2xl bg-blue-600 py-4 text-xs font-black text-white uppercase shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 disabled:opacity-50"
                    >
                      {flLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Activer mon compte"}
                    </button>
                  </form>
                </>
              )}

              {flStep === "success" && (
                <div className="text-center">
                  <div className="mb-6 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600/20">
                    <CheckCircle className="h-8 w-8 text-emerald-400" />
                  </div>
                  <h2 className="mb-2 text-xl font-black text-white uppercase tracking-tighter italic">Compte activé !</h2>
                  <p className="mb-6 text-sm text-slate-400">
                    Votre mot de passe a été créé avec succès.
                  </p>
                  <button
                    onClick={() => { closeFirstLogin(); router.push("/login?activated=true"); }}
                    className="w-full rounded-2xl bg-emerald-600 py-4 text-xs font-black text-white uppercase shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500"
                  >
                    Se connecter
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
