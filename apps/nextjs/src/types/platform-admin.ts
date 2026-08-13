/**
 * Platform Admin Read Models
 * These interfaces define the data structures used in the Platform Admin Cockpit.
 * They are strictly separated from tenant/client data to ensure security and clarity.
 */

export interface TenantActivationFact {
  tenantId: string;
  tenantName: string;
  signupAt: Date;
  activationScore: number; // 0-100, based on user engagement
  firstPaymentAt?: Date;
  firstValueDeliveredAt?: Date;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  status: 'trial' | 'active' | 'churned' | 'suspended';
}

export interface SubscriptionMetricsFact {
  tenantId: string;
  period: string; // YYYY-MM format
  mrrAmount: number; // Monthly Recurring Revenue in cents
  arrAmount: number; // Annual Recurring Revenue in cents
  churnRiskFlag: boolean;
  churnRiskScore: number; // 0-100
  upgradePotential: number; // Projected increase in MRR
  contractEndDate?: Date;
  autoRenew: boolean;
}

export interface TenantHealthScore {
  tenantId: string;
  tenantName: string;
  healthStatus: 'healthy' | 'warning' | 'critical';
  usageScore: number; // 0-100, based on API calls, active users, etc.
  supportTicketsLast30Days: number;
  lastActivityAt: Date;
  dataQualityScore: number; // 0-100, based on data completeness
  technicalDebtScore: number; // 0-100, based on system health
  riskFactors: string[]; // e.g., ['high_api_latency', 'payment_failed', 'low_usage']
}

export interface PlatformIncidentFact {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  impactedTenantsCount: number;
  impactedTenantIds: string[];
  startedAt: Date;
  resolvedAt?: Date;
  estimatedResolution?: Date;
  affectedServices: string[]; // e.g., ['api', 'database', 'payment_gateway']
  rootCause?: string;
}

// Platform-wide aggregated metrics
export interface PlatformKPIs {
  totalTenants: {
    active: number;
    trial: number;
    churned: number;
    total: number;
  };
  revenue: {
    currentMRR: number;
    currentARR: number;
    projectedMRR: number;
    churnRate: number; // percentage
    growthRate: number; // percentage month-over-month
  };
  activation: {
    trialToActiveRate: number; // percentage
    timeToFirstValue: number; // days average
    activationFunnel: {
      signedUp: number;
      activated: number;
      firstPayment: number;
      retained: number;
    };
  };
  health: {
    healthyTenants: number;
    warningTenants: number;
    criticalTenants: number;
    systemUptime: number; // percentage
  };
}

// Permissions for Platform Admin
export type PlatformPermission =
  | 'platform.dashboard.executive.view'
  | 'platform.operations.view'
  | 'platform.customers.view'
  | 'platform.growth.view'
  | 'platform.billing.view'
  | 'platform.support.view'
  | 'platform.tenants.health.view'
  | 'platform.tenants.impersonate'
  | 'platform.incidents.manage';