import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, checkDatabaseConnection } from './database.js';
import { logger } from './logger.js';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  merchant_id: string;
  is_demo: boolean;
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
}

// Default seeded users with real bcrypt hashes (salt factor 10)
const INITIAL_USERS: UserRecord[] = [
  {
    id: 'u_demo_001',
    email: 'demo@safero.internal',
    password_hash: bcrypt.hashSync('SafeRo#Demo2026!', 10),
    full_name: 'SafeRo Demo Analyst',
    role: 'analyst',
    merchant_id: 'm_demo_testbed',
    is_demo: true,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'u_demo_002',
    email: 'demo@safero.ai',
    password_hash: bcrypt.hashSync('SafeRo#Demo2026!', 10),
    full_name: 'SafeRo Demo Analyst',
    role: 'analyst',
    merchant_id: 'm_demo_testbed',
    is_demo: true,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'u_admin_001',
    email: 'admin@safero.io',
    password_hash: bcrypt.hashSync('Admin1234!', 10),
    full_name: 'SafeRo Platform Admin',
    role: 'admin',
    merchant_id: 'u_admin_001',
    is_demo: false,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'u_analyst_001',
    email: 'analyst@safero.io',
    password_hash: bcrypt.hashSync('Analyst1234!', 10),
    full_name: 'Senior Risk Investigator',
    role: 'analyst',
    merchant_id: 'u_analyst_001',
    is_demo: false,
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

class UserStore {
  private users: Map<string, UserRecord> = new Map();
  private dbAvailable: boolean | null = null;

  constructor() {
    for (const u of INITIAL_USERS) {
      this.users.set(u.email.toLowerCase(), u);
    }
  }

  private async isDbLive(): Promise<boolean> {
    if (this.dbAvailable !== null) return this.dbAvailable;
    try {
      this.dbAvailable = await checkDatabaseConnection();
    } catch {
      this.dbAvailable = false;
    }
    return this.dbAvailable;
  }

  private enrichDbUser(row: any): UserRecord {
    const isDemo = row.email?.toLowerCase().includes('demo') || row.is_demo === true;
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      full_name: row.full_name,
      role: row.role,
      merchant_id: row.merchant_id || row.id,
      is_demo: isDemo,
      is_active: row.is_active ?? true,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    };
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();

    if (await this.isDbLive()) {
      try {
        const res = await pool.query(
          'SELECT id, email, password_hash, full_name, role, is_active, created_at, last_login_at FROM users WHERE LOWER(email) = $1',
          [normalized],
        );
        if (res.rows.length > 0) {
          const user = this.enrichDbUser(res.rows[0]);
          this.users.set(normalized, user);
          return user;
        }
      } catch (err) {
        logger.warn({ err }, 'Postgres query failed, checking memory user store');
      }
    }

    return this.users.get(normalized) || null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (await this.isDbLive()) {
      try {
        const res = await pool.query(
          'SELECT id, email, password_hash, full_name, role, is_active, created_at, last_login_at FROM users WHERE id = $1',
          [id],
        );
        if (res.rows.length > 0) {
          return this.enrichDbUser(res.rows[0]);
        }
      } catch (err) {
        logger.warn({ err }, 'Postgres query failed, checking memory user store');
      }
    }

    for (const u of this.users.values()) {
      if (u.id === id) return u;
    }
    return null;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    role?: string;
    merchantId?: string;
  }): Promise<UserRecord> {
    const normalized = data.email.trim().toLowerCase();
    const role = data.role || 'analyst';
    const isDemo = normalized.includes('demo');

    if (await this.isDbLive()) {
      try {
        const res = await pool.query(
          `INSERT INTO users (email, password_hash, full_name, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, full_name, role, is_active, created_at`,
          [normalized, data.passwordHash, data.fullName, role],
        );
        if (res.rows.length > 0) {
          const user = this.enrichDbUser(res.rows[0]);
          this.users.set(normalized, user);
          return user;
        }
      } catch (err) {
        logger.warn({ err }, 'Postgres insert failed, creating in memory store');
      }
    }

    const newId = `u_${crypto.randomUUID().slice(0, 8)}`;
    const newUser: UserRecord = {
      id: newId,
      email: normalized,
      password_hash: data.passwordHash,
      full_name: data.fullName,
      role,
      merchant_id: data.merchantId || newId,
      is_demo: isDemo,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    this.users.set(normalized, newUser);
    return newUser;
  }

  async updateLastLogin(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (await this.isDbLive()) {
      try {
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
      } catch {
        // Fallback handled in memory
      }
    }

    for (const u of this.users.values()) {
      if (u.id === id) {
        u.last_login_at = now;
        break;
      }
    }
  }
}

export const userStore = new UserStore();
