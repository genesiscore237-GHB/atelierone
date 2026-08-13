// src/server/lib/errors.ts
import { TRPCError } from "@trpc/server";

// Error codes catalog
export const ERROR_CODES = {
  // Auth errors
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_ACCOUNT_LOCKED: "AUTH_ACCOUNT_LOCKED",
  AUTHZ_PERMISSION_DENIED: "AUTHZ_PERMISSION_DENIED",
  AUTHZ_SCOPE_DENIED: "AUTHZ_SCOPE_DENIED",

  // Sale errors
  SALE_CART_EMPTY: "SALE_CART_EMPTY",
  SALE_STOCK_INSUFFICIENT: "SALE_STOCK_INSUFFICIENT",

  // Payment errors
  PAYMENT_INVALID_AMOUNT: "PAYMENT_INVALID_AMOUNT",
  PAYMENT_CASH_SESSION_REQUIRED: "PAYMENT_CASH_SESSION_REQUIRED",

  // Cash errors
  CASH_SESSION_ALREADY_OPEN: "CASH_SESSION_ALREADY_OPEN",

  // Inventory errors
  INVENTORY_INVALID_ADJUSTMENT: "INVENTORY_INVALID_ADJUSTMENT",

  // Procurement errors
  PO_INVALID_STATE: "PO_INVALID_STATE",
  RECEIPT_ALREADY_APPLIED: "RECEIPT_ALREADY_APPLIED",

  // Return errors
  RETURN_INVALID_QUANTITY: "RETURN_INVALID_QUANTITY",

  // Generic
  NOT_FOUND: "NOT_FOUND",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

type ErrorCode = keyof typeof ERROR_CODES;

// Error definitions with messages
const ERROR_DEFINITIONS: Record<ErrorCode, { message: string; status: number }> = {
  AUTH_INVALID_CREDENTIALS: { message: "Identifiants invalides", status: 401 },
  AUTH_ACCOUNT_LOCKED: { message: "Compte verrouillé", status: 403 },
  AUTHZ_PERMISSION_DENIED: { message: "Permission refusée", status: 403 },
  AUTHZ_SCOPE_DENIED: { message: "Scope refusé", status: 403 },
  SALE_CART_EMPTY: { message: "Le panier est vide", status: 400 },
  SALE_STOCK_INSUFFICIENT: { message: "Stock insuffisant", status: 400 },
  PAYMENT_INVALID_AMOUNT: { message: "Montant de paiement invalide", status: 400 },
  PAYMENT_CASH_SESSION_REQUIRED: { message: "Session de caisse requise", status: 400 },
  CASH_SESSION_ALREADY_OPEN: { message: "Une session de caisse est déjà ouverte", status: 400 },
  INVENTORY_INVALID_ADJUSTMENT: { message: "Ajustement d'inventaire invalide", status: 400 },
  PO_INVALID_STATE: { message: "État du bon de commande invalide", status: 400 },
  RECEIPT_ALREADY_APPLIED: { message: "Réception déjà appliquée", status: 400 },
  RETURN_INVALID_QUANTITY: { message: "Quantité de retour invalide", status: 400 },
  NOT_FOUND: { message: "Ressource non trouvée", status: 404 },
  BAD_REQUEST: { message: "Requête invalide", status: 400 },
  UNAUTHORIZED: { message: "Non autorisé", status: 401 },
};

// Helper to create TRPCError with standardized code
export function createBusinessError(code: ErrorCode, details?: string): TRPCError {
  const definition = ERROR_DEFINITIONS[code];
  const message = details ? `${definition.message}: ${details}` : definition.message;

  return new TRPCError({
    code: definition.status === 400 ? "BAD_REQUEST" :
          definition.status === 401 ? "UNAUTHORIZED" :
          definition.status === 403 ? "FORBIDDEN" :
          definition.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
    message,
  });
}

// Helper for common validation errors
export function validateRequired(value: any, fieldName: string): void {
  if (!value) {
    throw createBusinessError("BAD_REQUEST", `${fieldName} est requis`);
  }
}

export function validatePositive(value: number, fieldName: string): void {
  if (value <= 0) {
    throw createBusinessError("BAD_REQUEST", `${fieldName} doit être positif`);
  }
}