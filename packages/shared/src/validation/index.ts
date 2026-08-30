import { z } from 'zod';
import {
  RISK_LEVELS, TRANSACTION_STATUSES, CASE_STATUSES,
  CASE_TYPES, SEVERITY_LEVELS, ENTITY_TYPES, PAYMENT_METHOD_TYPES,
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from '../constants/index.js';

// ─── Auth ────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(1, 'Full name is required').max(255),
});

// ─── Pagination ──────────────────────────────────────────────
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// ─── Merchant ────────────────────────────────────────────────
export const createMerchantSchema = z.object({
  name: z.string().min(1).max(255),
  razorpay_merchant_id: z.string().max(255).optional(),
  business_type: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  website: z.string().url().max(255).optional(),
});

// ─── Transaction Filters ────────────────────────────────────
export const transactionFilterSchema = paginationSchema.extend({
  merchant_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  min_amount: z.coerce.number().min(0).optional(),
  max_amount: z.coerce.number().min(0).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  payment_method_type: z.enum(PAYMENT_METHOD_TYPES).optional(),
});

// ─── Risk Case ───────────────────────────────────────────────
export const createCaseSchema = z.object({
  merchant_id: z.string().uuid().optional(),
  case_type: z.enum(CASE_TYPES),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  severity: z.enum(SEVERITY_LEVELS).default('medium'),
});

export const updateCaseStatusSchema = z.object({
  status: z.enum(CASE_STATUSES),
  resolution: z.string().optional(),
});

export const caseFilterSchema = paginationSchema.extend({
  case_type: z.enum(CASE_TYPES).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  severity: z.enum(SEVERITY_LEVELS).optional(),
  merchant_id: z.string().uuid().optional(),
});

// ─── Risk Score Filter ───────────────────────────────────────
export const riskScoreFilterSchema = paginationSchema.extend({
  entity_type: z.enum(ENTITY_TYPES).optional(),
  risk_level: z.enum(RISK_LEVELS).optional(),
  min_score: z.coerce.number().min(0).max(1).optional(),
  max_score: z.coerce.number().min(0).max(1).optional(),
});

// ─── Investigation ───────────────────────────────────────────
export const createInvestigationSchema = z.object({
  case_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  query: z.string().optional(),
});

// ─── UUID Param ──────────────────────────────────────────────
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});
