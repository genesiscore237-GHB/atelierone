"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, ShieldCheck, AlertCircle } from "lucide-react";

function SetupPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email requis"); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Email invalide"); return; }
    if (!token) { setError("Lien d'invitation invalide"); return; }
    setIsLoading(true);
    try {
      const { checkEmailForActivationAction } = await import("@/lib/auth-actions");
      const result = await checkEmailForActivationAction(email.trim(), token);
      if ("error" in result) { setError(result.error ?? "Erreur"); setIsLoading(false); return; }
      setStep("password");
      setIsLoading(false);
    } catch { setError("Une erreur est survenue"); setIsLoading(false); }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Minimum 8 caractères"); return; }
    if (password !== confirmPassword) { setError("Les mots de passe ne correspondent pas"); return; }
    if (!token) { setError("Token manquant"); return; }
    setIsLoading(true);
    try {
      const { activateAccountAction } = await import("@/lib/auth-actions");
      const result = await activateAccountAction({ email: email.trim(), password, token });
      if ("error" in result) { setError(result.error ?? "Erreur"); setIsLoading(false); return; }
      router.push("/login?activated=true");
      router.refresh();
    } catch { setError("Une erreur est survenue"); setIsLoading(false); }
  };

  if (!token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#0f172a] p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h2 className="mb-2 text-lg font-bold text-white">Lien invalide</h2>
          <p className="mb-6 text-sm text-slate-400">Ce lien d'invitation est manquant ou invalide.</p>
          <button onClick={() => router.push("/login")} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Retour à la connexion</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] p-4">
      <div className="w-full max-w-md rounded-[2.5rem] border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-2xl">
        <button
          onClick={() => router.push("/login")}
          className="mb-8 flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-white"
        >
          <ArrowLeft size={14} /> Retour à la connexion
        </button>

        <AnimatePresence mode="wait">
          {step === "email" ? (
            <motion.form
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleVerifyEmail}
              className="space-y-6"
            >
              <h2 className="text-2xl font-black tracking-tighter text-white">Activation de compte</h2>
              <p className="text-sm text-slate-400">Entrez votre email pour activer votre compte.</p>

              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="votre@email.com"
                className="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-sm text-white outline-none focus:border-blue-500/50"
                required
                autoFocus
              />

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-blue-600 py-4 text-xs font-black tracking-widest text-white uppercase shadow-lg shadow-blue-600/20"
              >
                {isLoading ? <Loader2 className="mx-auto animate-spin" /> : "VÉRIFIER MON ACCÈS"}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="step2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleActivate}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-center">
                <p className="text-xs font-bold tracking-widest text-blue-400 uppercase">Compte reconnu</p>
                <p className="mt-1 text-sm text-white">{email}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Nouveau mot de passe</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <ShieldCheck className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-12 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Minimum 8 caractères"
                    required
                    autoFocus
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
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Confirmer le mot de passe</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <ShieldCheck className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                    className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-12 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Confirmer"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-emerald-600 py-4 text-xs font-black tracking-widest text-white uppercase shadow-lg shadow-emerald-600/20"
              >
                {isLoading ? <Loader2 className="mx-auto animate-spin" /> : "ACTIVER MON COMPTE"}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#020617]"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
      <SetupPasswordContent />
    </Suspense>
  );
}
