// ─── Risk Levels ─────────────────────────────────────────────
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// ─── User Roles ──────────────────────────────────────────────
export const USER_ROLES = ['admin', 'analyst', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Transaction Statuses ────────────────────────────────────
export const TRANSACTION_STATUSES = [
  'pending', 'authorized', 'captured', 'failed', 'refunded', 'disputed',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// ─── Case Statuses ───────────────────────────────────────────
export const CASE_STATUSES = [
  'open', 'investigating', 'confirmed', 'resolved', 'false_positive', 'escalated',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

// ─── Case Types ──────────────────────────────────────────────
export const CASE_TYPES = [
  'abuse_ring', 'fraud', 'chargeback', 'return_abuse', 'other',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

// ─── Severity Levels ─────────────────────────────────────────
export const SEVERITY_LEVELS = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

// ─── Entity Types ────────────────────────────────────────────
export const ENTITY_TYPES = [
  'transaction', 'customer', 'merchant', 'device', 'ip_address', 'payment_method',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// ─── Graph Entity Types ─────────────────────────────────────
export const GRAPH_ENTITY_TYPES = [
  'customer', 'device', 'ip_address', 'payment_method', 'account', 'merchant',
] as const;
export type GraphEntityType = (typeof GRAPH_ENTITY_TYPES)[number];

// ─── Account Types ───────────────────────────────────────────
export const ACCOUNT_TYPES = ['bank', 'wallet', 'card', 'upi', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// ─── Payment Method Types ────────────────────────────────────
export const PAYMENT_METHOD_TYPES = [
  'card', 'upi', 'netbanking', 'wallet', 'emi', 'other',
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

// ─── Cluster Types ───────────────────────────────────────────
export const CLUSTER_TYPES = [
  'device_sharing', 'ip_sharing', 'payment_reuse', 'behavioral', 'mixed',
] as const;
export type ClusterType = (typeof CLUSTER_TYPES)[number];

// ─── Investigation Statuses ──────────────────────────────────
export const INVESTIGATION_STATUSES = ['active', 'completed', 'archived'] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

// ─── Pagination Defaults ─────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// ─── Currency ────────────────────────────────────────────────
export const DEFAULT_CURRENCY = 'INR';
