"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";

export default function SetupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    orgName: "",
    orgSlug: "",
    adminEmail: "",
    adminPassword: "",
    adminFullName: "",
  });

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    setFormData(prev => ({ ...prev, orgName: name, orgSlug: slug }));
  };
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupMutation = api.organization.setup.useMutation({
    onSuccess: (result) => {
      // Redirect to dashboard where onboarding checklist will appear
      router.push("/dashboard");
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await setupMutation.mutateAsync({
        orgName: formData.orgName.trim(),
        orgSlug: formData.orgSlug.trim(),
        adminEmail: formData.adminEmail.trim(),
        adminPassword: formData.adminPassword,
        adminFullName: formData.adminFullName.trim(),
      });
    } catch (err) {
      // Error handled in onError
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Configuration de LibraCore
          </CardTitle>
          <p className="text-gray-600 mt-2">
            Créez votre organisation et commencez votre aventure
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="orgName">Nom de l'organisation</Label>
              <Input
                id="orgName"
                type="text"
                value={formData.orgName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex: Librairie Centrale"
                required
                minLength={3}
              />
            </div>

            <div>
              <Label htmlFor="orgSlug">URL de la librairie</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 text-sm text-gray-900 bg-gray-200 border border-r-0 border-gray-300 rounded-l-md">
                  libracore.app/
                </span>
                <Input
                  id="orgSlug"
                  type="text"
                  value={formData.orgSlug}
                  readOnly
                  className="rounded-l-none bg-gray-50"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Généré automatiquement à partir du nom
              </p>
            </div>

            <div>
              <Label htmlFor="adminFullName">Nom complet de l'administrateur</Label>
              <Input
                id="adminFullName"
                type="text"
                value={formData.adminFullName}
                onChange={(e) => setFormData(prev => ({ ...prev, adminFullName: e.target.value }))}
                placeholder="Jean Dupont"
                required
                minLength={2}
              />
            </div>

            <div>
              <Label htmlFor="adminEmail">Email de l'administrateur</Label>
              <Input
                id="adminEmail"
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, adminEmail: e.target.value }))}
                placeholder="admin@ma-librairie.com"
                required
              />
            </div>

            <div>
              <Label htmlFor="adminPassword">Mot de passe</Label>
              <Input
                id="adminPassword"
                type="password"
                value={formData.adminPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, adminPassword: e.target.value }))}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <p className="text-xs text-gray-500 mt-1">
                Au moins 8 caractères
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Configuration en cours..." : "Créer mon organisation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}