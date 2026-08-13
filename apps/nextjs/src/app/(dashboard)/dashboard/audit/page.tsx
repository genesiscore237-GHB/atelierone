"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { Clock, User, FileText, ChevronLeft, ChevronRight } from "lucide-react";

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const [entityType, setEntityType] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [search, setSearch] = useState("");

  const { data: auditLog, isLoading } = api.audit.list.useQuery({
    page,
    limit: 50,
    action,
    entityType,
    userId,
    startDate,
    endDate,
  });

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes("create")) return "bg-success/10 text-success-foreground";
    if (action.includes("update")) return "bg-warning/10 text-warning-foreground";
    if (action.includes("delete")) return "bg-destructive/10 text-destructive";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal d'Audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historique complet de toutes les actions réalisées sur la plateforme
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold">Filtres</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="Type d'événement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Création</SelectItem>
                <SelectItem value="update">Modification</SelectItem>
                <SelectItem value="delete">Suppression</SelectItem>
              </SelectContent>
            </Select>

            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger>
                <SelectValue placeholder="Type de ressource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">Vente</SelectItem>
                <SelectItem value="product">Produit</SelectItem>
                <SelectItem value="payment">Paiement</SelectItem>
                <SelectItem value="inventory">Inventaire</SelectItem>
                <SelectItem value="user">Utilisateur</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Date début"
            />

            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Date fin"
            />

            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                    </div>
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : auditLog && auditLog.events.length > 0 ? (
            <>
              <div className="divide-y divide-border">
                {auditLog.events.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5 flex-shrink-0">
                          {event.action === "create" && <FileText className="w-5 h-5 text-success-foreground" />}
                          {event.action === "update" && <FileText className="w-5 h-5 text-warning-foreground" />}
                          {event.action === "delete" && <FileText className="w-5 h-5 text-destructive" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className={getActionColor(event.action)}>
                              {event.action}
                            </Badge>
                            {event.entityType && (
                              <span className="text-sm font-medium">
                                {event.entityType}
                                {event.entityId && ` #${String(event.entityId).slice(0, 8)}`}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              {event.userId ? String(event.userId).slice(0, 8) : "Système"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(event.createdAt!)}
                            </span>
                            {event.ipAddress && (
                              <span className="text-xs text-muted-foreground">
                                IP: {event.ipAddress}
                              </span>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Pagination */}
              <div className="p-4 flex items-center justify-between border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Affichage {((page - 1) * 50) + 1} - {Math.min(page * 50, auditLog.total)} sur {auditLog.total} événements
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * 50 >= auditLog.total}
                  >
                    Suivant
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground/80">Aucun événement</p>
              <p className="text-sm text-muted-foreground mt-1">Le journal d'audit est vide pour le moment</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
