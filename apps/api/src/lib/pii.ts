import crypto from 'crypto';

/**
 * Hash a PII string (e.g. email, phone, card token) using SHA-256 with a salt.
 */
export function hashPii(value: string, salt: string = 'safero_pii_salt_2026'): string {
  if (!value) return '';
  return crypto
    .createHmac('sha256', salt)
    .update(value.trim().toLowerCase())
    .digest('hex');
}

/**
 * Mask an email address for privacy (e.g. "customer@example.com" -> "cus***@example.com").
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return 'cust_***';
  const parts = email.split('@');
  const local = parts[0] || 'cust';
  const domain = parts[1] || 'domain.com';
  if (local.length <= 2) {
    return `${local[0] || 'c'}***@${domain}`;
  }
  return `${local.slice(0, 3)}***@${domain}`;
}

/**
 * Mask an Indian phone number (e.g. "+91 98765 43210" or "9876543210" -> "+91 98*** **210").
 */
export function maskPhone(phone: string): string {
  if (!phone) return 'phone_***';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.length < 8) return 'phone_***';
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-3);
  return `${prefix}***${suffix}`;
}

/**
 * Mask payment identifiers (e.g. VPA "username@okhdfcbank" -> "use***@okhdfcbank", Card "411122******3344").
 */
export function maskPaymentIdentifier(identifier: string): string {
  if (!identifier) return 'pm_***';
  if (identifier.includes('@')) {
    const parts = identifier.split('@');
    const vpaUser = parts[0] || 'vpa';
    const vpaBank = parts[1] || 'bank';
    return `${vpaUser.slice(0, 3)}***@${vpaBank}`;
  }
  if (identifier.length >= 8) {
    return `${identifier.slice(0, 4)}******${identifier.slice(-4)}`;
  }
  return `${identifier.slice(0, 2)}***`;
}
