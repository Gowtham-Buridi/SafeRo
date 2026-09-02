import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App.tsx';

// Mock getContext for canvas in JSDOM environment
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
});

// Mock auth module
vi.mock('../src/lib/auth.tsx', () => ({
  useAuth: () => ({
    user: {
      id: 'u_demo_001',
      email: 'demo@safero.internal',
      name: 'SafeRo Demo Analyst',
      role: 'analyst',
      isDemo: true,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn().mockResolvedValue({ success: true }),
    register: vi.fn().mockResolvedValue({ success: true }),
    loginDemo: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock api to return instant resolved promises so no hanging unhandled rejections happen after teardown
vi.mock('../src/lib/api.ts', () => ({
  api: {
    getSummary: vi.fn().mockResolvedValue({
      total_transactions: 25000,
      total_volume: 35056410,
      active_merchants: 10,
      abuse_clusters_detected: 8,
      open_cases: 4,
      evaluation_metrics: { precision: 1.0, recall: 0.818, f1: 0.90 },
    }),
    getVolumeSeries: vi.fn().mockResolvedValue([]),
    getClusters: vi.fn().mockResolvedValue([]),
    getClusterDetail: vi.fn().mockResolvedValue(null),
    getTransactions: vi.fn().mockResolvedValue({ data: [] }),
    getTransactionDetail: vi.fn().mockResolvedValue(null),
    getCases: vi.fn().mockResolvedValue([]),
    getModelPerformance: vi.fn().mockResolvedValue(null),
    queryInvestigation: vi.fn().mockResolvedValue(null),
    getWebhookHistory: vi.fn().mockResolvedValue([]),
    getWebhookDiagnostics: vi.fn().mockResolvedValue({
      merchant_id: 'm_demo_001',
      recent_deliveries: [],
      total_deliveries: 0,
      deliveries_24h_count: 0,
      zero_deliveries_in_24h: true,
      unattributed_count: 0,
      advice: 'No webhook deliveries received in the last 24 hours.',
    }),
    sendSelfTestWebhook: vi.fn().mockResolvedValue({
      status_code: 200,
      signature_verified: true,
      target_url: '/webhooks/razorpay/m_demo_001',
      resolved_merchant_id: 'm_demo_001',
      transaction_id: 'pay_selftest_mock123',
      amount_inr: 500,
      message: 'Self-test webhook executed successfully.',
    }),
    getSystemInfo: vi.fn().mockResolvedValue({
      status: 'ok',
      service: 'safero-api',
      version: '0.1.0',
      git_commit: '0b1baa7',
      git_commit_short: '0b1baa7',
      deployed_at: new Date().toISOString(),
      uptime_seconds: 3600,
    }),
    getMerchantProfile: vi.fn().mockResolvedValue({ id: 'm_demo_001', razorpay_merchant_id: 'acc_demo_123' }),
    updateMerchantGatewayAccount: vi.fn().mockResolvedValue({ success: true }),
    simulateWebhook: vi.fn().mockResolvedValue({ success: true }),
    login: vi.fn().mockResolvedValue({ success: true }),
    register: vi.fn().mockResolvedValue({ success: true }),
  },
  getStoredAccessToken: vi.fn().mockReturnValue('mock-token'),
  getStoredRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  setStoredAuthTokens: vi.fn(),
  clearStoredAuth: vi.fn(),
  USER_STORAGE_KEY: 'safero_auth_user',
  API_BASE_URL: 'http://localhost:3001/api/v1',
}));

describe('App', () => {
  it('renders dashboard page by default', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Risk Command Center' })).toBeDefined();
    });
  });

  it('renders transactions page', async () => {
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Transaction Surveillance' })).toBeDefined();
    });
  });

  it('renders risk cases page', async () => {
    render(
      <MemoryRouter initialEntries={['/risk-cases']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Risk Cases' })).toBeDefined();
    });
  });

  it('renders abuse rings page', async () => {
    render(
      <MemoryRouter initialEntries={['/abuse-rings']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Abuse Rings Radar' })).toBeDefined();
    });
  });

  it('renders analytics page', async () => {
    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    });
  });

  it('renders investigation page', async () => {
    render(
      <MemoryRouter initialEntries={['/investigation']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'AI Risk Investigation Workspace' })).toBeDefined();
    });
  });

  it('renders settings page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Store Integration & Platform Settings' })).toBeDefined();
    });
  });
});
