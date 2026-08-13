"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Bénéfice net fusionné dans le module Marge (onglet « Bénéfice net ») — I4.
// Redirection client-side : dans ce setup Next 15.5, un redirect() serveur émis
// dans le flux RSC (status 200 + digest NEXT_REDIRECT) n'est pas suivi par le
// navigateur en chargement direct — même comportement que /dashboard/rh.
export default function ProfitPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/marge");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="text-sm text-muted-foreground">Redirection vers le module Marge…</span>
    </div>
  );
}
