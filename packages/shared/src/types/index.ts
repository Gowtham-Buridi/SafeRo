import type {
  RiskLevel, UserRole, TransactionStatus, CaseStatus, CaseType,
  SeverityLevel, EntityType, GraphEntityType, AccountType,
  PaymentMethodType, ClusterType, InvestigationStatus,
} from '../constants/index.js';

// ─── Base ────────────────────────────────────────────────────
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ─── User ────────────────────────────────────────────────────
export interface User extends BaseEntity {
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
}

// ─── Merchant ────────────────────────────────────────────────
export interface Merchant extends BaseEntity {
  razorpay_merchant_id: string | null;
  name: string;
  business_type: string | null;
  category: string | null;
  website: string | null;
  risk_level: RiskLevel;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

// ─── Customer ────────────────────────────────────────────────
export interface Customer extends BaseEntity {
  merchant_id: string;
  external_id: string | null;
  email_hash: string | null;
  phone_hash: string | null;
  name_hash: string | null;
  first_seen_at: string;
  last_seen_at: string;
  transaction_count: number;
  total_amount: number;
  risk_level: RiskLevel;
  metadata: Record<string, unknown>;
}

// ─── Account ─────────────────────────────────────────────────
export interface Account extends BaseEntity {
  customer_id: string;
  account_type: AccountType;
  account_hash: string | null;
  provider: string | null;
  is_verified: boolean;
}

// ─── Transaction ─────────────────────────────────────────────
export interface Transaction extends BaseEntity {
  merchant_id: string;
  customer_id: string | null;
  payment_method_id: string | null;
  device_id: string | null;
  ip_address_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount: number;
  currency: string;
  status: TransactionStatus;
  payment_method_type: PaymentMethodType | null;
  description: string | null;
  error_code: string | null;
  error_description: string | null;
  is_international: boolean;
  metadata: Record<string, unknown>;
}

// ─── Device ──────────────────────────────────────────────────
export interface Device extends BaseEntity {
  fingerprint_hash: string;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  first_seen_at: string;
  last_seen_at: string;
  transaction_count: number;
  unique_customer_count: number;
  metadata: Record<string, unknown>;
}

// ─── IP Address ──────────────────────────────────────────────
export interface IpAddress extends BaseEntity {
  ip_hash: string;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
  is_vpn: boolean;
  is_tor: boolean;
  is_proxy: boolean;
  is_datacenter: boolean;
  first_seen_at: string;
  last_seen_at: string;
  transaction_count: number;
  unique_customer_count: number;
  metadata: Record<string, unknown>;
}

// ─── Payment Method ──────────────────────────────────────────
export interface PaymentMethod extends BaseEntity {
  customer_id: string | null;
  method_type: PaymentMethodType;
  method_hash: string | null;
  card_bin: string | null;
  card_last4: string | null;
  card_network: string | null;
  card_issuer: string | null;
  is_international: boolean;
  first_used_at: string;
  last_used_at: string;
  transaction_count: number;
  metadata: Record<string, unknown>;
}

// ─── Transaction Event ───────────────────────────────────────
export interface TransactionEvent {
  id: string;
  transaction_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

// ─── Risk Score ──────────────────────────────────────────────
export interface RiskScore {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  model_version_id: string | null;
  score: number;
  risk_level: RiskLevel;
  confidence: number | null;
  factors: unknown[];
  metadata: Record<string, unknown>;
  scored_at: string;
  created_at: string;
}

// ─── Risk Signal ─────────────────────────────────────────────
export interface RiskSignal {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  signal_type: string;
  signal_value: number | null;
  severity: SeverityLevel;
  description: string | null;
  evidence: Record<string, unknown>;
  detected_at: string;
  created_at: string;
}

export interface CaseAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
}

export interface CaseChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  action_type?: 'block_device' | 'block_ip' | 'freeze_customer' | 'notify_merchant' | 'custom' | string;
  entity_val?: string;
}

export interface CaseMitigations {
  device_blocked?: boolean;
  ip_throttled?: boolean;
  customer_held?: boolean;
  merchant_notified?: boolean;
}

// ─── Risk Case ───────────────────────────────────────────────
export interface RiskCase extends BaseEntity {
  merchant_id: string | null;
  case_type?: CaseType;
  title: string;
  description?: string | null;
  status: CaseStatus;
  severity: SeverityLevel;
  risk_score?: number;
  assigned_to?: string | null;
  entity_count?: number;
  total_amount?: number;
  evidence?: Record<string, unknown>;
  resolution?: string | null;
  resolved_at?: string | null;
  typology_tags?: string[];
  notes?: string;
  ai_summary?: string;
  action_checklist?: CaseChecklistItem[];
  audit_trail?: CaseAuditEntry[];
  mitigations?: CaseMitigations;
  signals?: Array<{ signal_type: string; severity: string; message: string; [key: string]: any }>;
}

// ─── Graph Relationship ──────────────────────────────────────
export interface GraphRelationship extends BaseEntity {
  source_type: GraphEntityType;
  source_id: string;
  target_type: GraphEntityType;
  target_id: string;
  relationship: string;
  weight: number;
  properties: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
}

// ─── Abuse Cluster ───────────────────────────────────────────
export interface AbuseCluster extends BaseEntity {
  case_id: string | null;
  cluster_type: ClusterType;
  detection_method: string;
  confidence: number | null;
  member_count: number;
  member_ids: string[];
  shared_attributes: Record<string, unknown>;
  total_amount: number;
  risk_level: RiskLevel;
  metadata: Record<string, unknown>;
  detected_at: string;
}

// ─── Model Version ───────────────────────────────────────────
export interface ModelVersion extends BaseEntity {
  model_name: string;
  version: string;
  model_type: string;
  description: string | null;
  hyperparameters: Record<string, unknown>;
  metrics: Record<string, unknown>;
  training_data_info: Record<string, unknown>;
  artifact_path: string | null;
  is_active: boolean;
  promoted_at: string | null;
}

// ─── Prediction ──────────────────────────────────────────────
export interface Prediction {
  id: string;
  model_version_id: string;
  entity_type: string;
  entity_id: string;
  prediction: Record<string, unknown>;
  probability: number | null;
  latency_ms: number | null;
  created_at: string;
}

// ─── Investigation ───────────────────────────────────────────
export interface Investigation extends BaseEntity {
  case_id: string | null;
  user_id: string;
  title: string;
  status: InvestigationStatus;
  query: string | null;
  findings: Record<string, unknown>;
  entities_examined: unknown[];
  timeline: unknown[];
  conclusion: string | null;
}

// ─── API Response Types ──────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ─── Auth Types ──────────────────────────────────────────────
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}
