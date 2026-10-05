"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NouvelArticleWizard } from "../_components/NouvelArticleWizard";

export default function NouvelArticlePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/dashboard/catalog/articles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Articles
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Nouvel article</h1>
        <p className="text-sm text-muted-foreground">
          L'article est le produit conceptuel (« Plaquette de frein avant ») ; les variantes sont les références réellement stockables (Bosch BP1234, Brembo P85001…). Pour un outil, chaque variante est un exemplaire physique suivi individuellement.
        </p>
      </div>
      <NouvelArticleWizard />
    </div>
  );
}