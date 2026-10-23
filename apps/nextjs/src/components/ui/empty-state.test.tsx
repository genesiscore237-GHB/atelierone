// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmptyState } from "~/components/ui/empty-state";

/**
 * C7 — premier test de composant React interactif du dépôt.
 *
 * Il prouve trois choses qu'aucun test serveur ne couvre :
 *   1. le composant est importable hors Next (pas de dépendance serveur cachée
 *      dans une chaîne d'imports) ;
 *   2. le rendu produit bien le titre, la description et l'action ;
 *   3. React échappe le contenu utilisateur — un titre contenant du HTML ne
 *      devient jamais du HTML exécutable.
 *
 * L'environnement jsdom est déclaré fichier par fichier : les tests de logique
 * et d'intégration restent en Node, plus rapides.
 */
describe("C7 — rendu réel de composant React", () => {
  it("rend le titre, la description et déclenche l'action", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Aucun véhicule"
        description="Ajoutez un véhicule pour démarrer."
        actionButton={<button type="button" onClick={onClick}>Créer</button>}
      />,
    );

    expect(screen.getByText("Aucun véhicule")).toBeTruthy();
    expect(screen.getByText("Ajoutez un véhicule pour démarrer.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("échappe le HTML fourni par l'utilisateur", () => {
    const { container } = render(
      <EmptyState title="Résultat" description={'<script>alert("x")</script>'} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain('<script>alert("x")</script>');
  });
});
