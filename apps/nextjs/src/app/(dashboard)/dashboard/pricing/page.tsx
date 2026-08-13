// src/app/dashboard/pricing/page.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Plus, Tag, Percent, Calculator } from "lucide-react";
import { api } from "~/trpc/react";

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState("rules");

  const { data: pricingRules = [], isLoading: rulesLoading } = api.pricing.getPricingRules.useQuery();
  const { data: promotions = [], isLoading: promotionsLoading } = api.pricing.getPromotions.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tarification & Promotions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les règles de prix et les promotions
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle Règle
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rules">Règles de Prix</TabsTrigger>
          <TabsTrigger value="promotions">Promotions</TabsTrigger>
          <TabsTrigger value="calculator">Calculateur</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Règles de Tarification ({pricingRules.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : pricingRules.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-muted-foreground">
                    <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Aucune règle de prix</p>
                    <p className="text-sm">Créez votre première règle de tarification.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {pricingRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{rule.nom}</p>
                        <p className="text-sm text-muted-foreground">{rule.typeRegle} • Priorité {rule.priorite}</p>
                      </div>
                      <Badge variant={rule.estActive ? "default" : "secondary"}>
                        {rule.estActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promotions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="w-5 h-5" />
                Promotions Actives ({promotions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {promotionsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : promotions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-muted-foreground">
                    <Percent className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Aucune promotion</p>
                    <p className="text-sm">Créez votre première promotion.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {promotions.map((promo) => (
                    <div key={promo.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{promo.nom}</p>
                        <p className="text-sm text-muted-foreground">
                          {promo.typePromo} • {promo.valeur}% de réduction
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Du {new Date(promo.dateDebut).toLocaleDateString()} au {new Date(promo.dateFin).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={promo.estActive ? "default" : "secondary"}>
                        {promo.estActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculator" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Calculateur de Prix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                Calculateur de prix à implémenter
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Calculator className="h-8 w-8 text-primary" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Règles Actives</p>
                <p className="text-2xl font-bold text-foreground">
                  {pricingRules.filter(r => r.estActive).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Percent className="h-8 w-8 text-success-foreground" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Promotions Actives</p>
                <p className="text-2xl font-bold text-foreground">
                  {promotions.filter(p => p.estActive).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Tag className="h-8 w-8 text-primary" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Impact Mensuel</p>
                <p className="text-2xl font-bold text-foreground">+15.2%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}