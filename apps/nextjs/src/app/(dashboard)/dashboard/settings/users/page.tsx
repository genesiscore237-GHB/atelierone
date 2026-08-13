import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export default function UsersPage() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Gestion des Utilisateurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les membres de votre équipe
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Membres de l'équipe
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-primary/60" />
            <p className="text-sm font-medium text-foreground">
              La création d&apos;utilisateurs se fait depuis le module <strong>Gouvernance</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Processus : RH → créer l&apos;employé → Gouvernance → inviter au système
            </p>
            <Link href="/dashboard/governance">
              <Button className="mt-4">
                Accéder à Gouvernance
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}