// Nakama client for Admin Panel
import { Client, Session } from '@heroiclabs/nakama-js';
import type { AdminAuthResponse } from '../types';
import { ADMIN_FEATURE_FLAGS, getCapabilitiesForRole } from './permissions';

// Proxy mode: when enabled, connect to same origin (for tunnel/reverse proxy setups)
const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true';

const NAKAMA_HOST = USE_PROXY ? window.location.hostname : (import.meta.env.VITE_NAKAMA_HOST || 'localhost');
const NAKAMA_PORT = USE_PROXY ? (window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) : (import.meta.env.VITE_NAKAMA_PORT || '7350');
const NAKAMA_KEY = import.meta.env.VITE_NAKAMA_KEY || '';
const NAKAMA_SSL = USE_PROXY ? window.location.protocol === 'https:' : import.meta.env.VITE_NAKAMA_SSL === 'true';

if (!NAKAMA_KEY) {
  throw new Error('VITE_NAKAMA_KEY environment variable is required.');
}

class AdminNakamaClient {
  private static instance: AdminNakamaClient;
  private readonly sessionKey = 'admin_session';
  private client: Client;
  private session: Session | null = null;
  private adminInfo: AdminAuthResponse | null = null;
  private anonSession: Session | null = null;

  private constructor() {
    this.client = new Client(
      NAKAMA_KEY,
      NAKAMA_HOST,
      NAKAMA_PORT,
      NAKAMA_SSL
    );
  }

  static getInstance(): AdminNakamaClient {
    if (!AdminNakamaClient.instance) {
      AdminNakamaClient.instance = new AdminNakamaClient();
    }
    return AdminNakamaClient.instance;
  }

  getClient(): Client {
    return this.client;
  }

  getSession(): Session | null {
    return this.session;
  }

  isAuthenticated(): boolean {
    return !!this.session && !this.session.isexpired(Date.now() / 1000);
  }

  isAdmin(): boolean {
    return this.isAuthenticated() && !!this.adminInfo?.isAdmin;
  }

  getAdminInfo(): AdminAuthResponse | null {
    return this.adminInfo;
  }

  private normalizeAdminInfo(
    raw: Partial<AdminAuthResponse> | null | undefined,
    fallback: { telegramId?: number; userId?: string; displayName?: string } = {}
  ): AdminAuthResponse {
    const roleKey = raw?.roleKey || raw?.adminLevel || 'admin';
    return {
      isAdmin: raw?.isAdmin ?? true,
      adminLevel: raw?.adminLevel || roleKey,
      roleKey,
      userId: raw?.userId || fallback.userId || this.session?.user_id || '',
      telegramId: raw?.telegramId || fallback.telegramId || 0,
      displayName: raw?.displayName || fallback.displayName || 'Admin',
      capabilities: raw?.capabilities?.length ? raw.capabilities : getCapabilitiesForRole(roleKey),
      featureFlags: raw?.featureFlags?.length ? raw.featureFlags : [...ADMIN_FEATURE_FLAGS],
    };
  }

  // Authenticate as admin using Telegram initData
  async authenticateAdmin(initData: string): Promise<AdminAuthResponse> {
    // Parse telegram user from initData
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    if (!userJson) {
      throw new Error('Invalid Telegram initData: missing user');
    }

    let telegramUser: { id: number; first_name?: string; last_name?: string; username?: string };
    try {
      // URLSearchParams already decodes values; decoding again can break valid payloads.
      telegramUser = JSON.parse(userJson);
    } catch {
      throw new Error('Invalid Telegram initData: invalid user JSON');
    }

    if (!telegramUser.id) {
      throw new Error('Invalid Telegram initData: missing user id');
    }

    // Pre-check admin authorization on an anonymous session to avoid creating
    // persistent user records for unauthorized login attempts.
    const precheckRaw = await this.client.rpc(await this.getOrCreateAnonSession(), 'admin_authenticate', { initData });
    const precheck = typeof precheckRaw.payload === 'string'
      ? JSON.parse(precheckRaw.payload) as AdminAuthResponse
      : precheckRaw.payload as AdminAuthResponse;
    if (!precheck.isAdmin) {
      throw new Error('You are not authorized as an admin');
    }

    // Authenticate with Nakama using custom ID
    const customId = 'telegram_' + telegramUser.id.toString();
    this.session = await this.client.authenticateCustom(customId, false, undefined, { initData });

    // Verify session-bound admin claims after auth.
    const verifyResponse = await this.rpc<{ valid: boolean; adminInfo?: AdminAuthResponse }>('admin_verify_session');
    if (!verifyResponse.valid) {
      this.session = null;
      throw new Error('You are not authorized as an admin');
    }

    this.adminInfo = this.normalizeAdminInfo(verifyResponse.adminInfo || precheck, {
      telegramId: telegramUser.id,
      displayName: precheck.displayName || telegramUser.first_name || 'Admin',
    });
    return this.adminInfo;
  }

  // Authenticate as admin using a server-side token (self-hosted fallback)
  async authenticateAdminWithToken(telegramId: number, adminToken: string): Promise<AdminAuthResponse> {
    if (!telegramId || telegramId <= 0) {
      throw new Error('Valid Telegram ID required');
    }
    if (!adminToken) {
      throw new Error('Admin token is required');
    }

    const customId = 'admin_token_' + telegramId.toString();
    this.session = await this.client.authenticateCustom(customId, true, undefined, { adminToken, adminTelegramId: telegramId.toString() });

    const verifyResponse = await this.rpc<{ valid: boolean; adminInfo?: AdminAuthResponse }>('admin_verify_session');
    if (!verifyResponse.valid) {
      this.session = null;
      throw new Error('You are not authorized as an admin');
    }

    this.adminInfo = this.normalizeAdminInfo(verifyResponse.adminInfo, {
      telegramId,
      userId: this.session.user_id || '',
      displayName: 'Admin',
    });

    return this.adminInfo;
  }

  // Verify existing session is still valid admin
  async verifySession(): Promise<boolean> {
    if (!this.session || this.session.isexpired(Date.now() / 1000)) {
      return false;
    }

    try {
      const response = await this.rpc<{ valid: boolean; adminId: string }>('admin_verify_session');
      return response.valid;
    } catch {
      return false;
    }
  }

  // Generic RPC call with automatic session refresh and timeout
  async rpc<T>(rpcId: string, payload?: object, timeoutMs: number = 30000): Promise<T> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    // Check if session is expired and try to refresh
    if (this.session.isexpired(Date.now() / 1000)) {
      const refreshed = await this.tryRefreshSession();
      if (!refreshed) {
        this.logout();
        throw new Error('Session expired. Please login again.');
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`RPC ${rpcId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      // Race between RPC call and timeout
      const response = await Promise.race([
        this.client.rpc(this.session, rpcId, payload || {}),
        timeoutPromise,
      ]);

      if (typeof response.payload === 'string') {
        if (!response.payload) {
          return {} as T;
        }
        try {
          return JSON.parse(response.payload) as T;
        } catch {
          throw new Error(`RPC ${rpcId}: Invalid JSON response`);
        }
      }
      if (response.payload && typeof response.payload === 'object') {
        return response.payload as T;
      }
      return {} as T;
    } catch (error: unknown) {
      if (error instanceof Response) {
        let message = `RPC ${rpcId} failed (${error.status})`;
        try {
          const text = await error.text();
          if (text) {
            try {
              const parsed = JSON.parse(text) as { message?: string; error?: string };
              message = parsed.message || parsed.error || text || message;
            } catch {
              message = text || message;
            }
          }
        } catch {
          // Keep fallback message
        }
        throw new Error(message);
      }

      // Handle specific error cases
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('token') || message.includes('unauthorized') || message.includes('unauthenticated')) {
          this.logout();
          throw new Error('Session expired. Please login again.');
        }
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  // Try to refresh the session token
  private async tryRefreshSession(): Promise<boolean> {
    if (!this.session) return false;

    try {
      this.session = await this.client.sessionRefresh(this.session);
      this.saveSession();
      return true;
    } catch {
      return false;
    }
  }

  private async getOrCreateAnonSession(): Promise<Session> {
    if (this.anonSession && !this.anonSession.isexpired(Date.now() / 1000)) {
      return this.anonSession;
    }

    let deviceId = '';
    try {
      deviceId = sessionStorage.getItem('admin_public_device_id') || '';
      if (!deviceId) {
        const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        deviceId = `admin_public_${randomPart}`;
        sessionStorage.setItem('admin_public_device_id', deviceId);
      }
    } catch {
      deviceId = `admin_public_fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    this.anonSession = await this.client.authenticateDevice(deviceId, true);
    return this.anonSession;
  }

  // Logout
  logout(): void {
    this.session = null;
    this.adminInfo = null;
    this.safeRemove(sessionStorage, this.sessionKey);
    this.safeRemove(localStorage, this.sessionKey);
  }

  // Save session to localStorage (with sessionStorage fallback)
  saveSession(): void {
    if (this.session && this.adminInfo) {
      const serialized = JSON.stringify({
        token: this.session.token,
        refreshToken: this.session.refresh_token,
        adminInfo: this.adminInfo,
      });

      const savedToLocal = this.safeSet(localStorage, this.sessionKey, serialized);
      if (savedToLocal) {
        // Clear legacy storage once session is persisted for cross-reload restore.
        this.safeRemove(sessionStorage, this.sessionKey);
      } else {
        this.safeSet(sessionStorage, this.sessionKey, serialized);
      }
    }
  }

  // Restore session from localStorage (legacy sessionStorage migration supported)
  async restoreSession(): Promise<boolean> {
    const localSaved = this.safeGet(localStorage, this.sessionKey);
    const legacySaved = this.safeGet(sessionStorage, this.sessionKey);
    const saved = localSaved ?? legacySaved;
    if (!saved) {
      return false;
    }

    let parsed: { token: string; refreshToken: string };
    try {
      parsed = JSON.parse(saved);
    } catch {
      // Storage is corrupted, clear it
      this.safeRemove(localStorage, this.sessionKey);
      this.safeRemove(sessionStorage, this.sessionKey);
      return false;
    }

    try {
      const { token, refreshToken } = parsed;

      // Try to restore the session
      this.session = await this.client.sessionRefresh(
        { token, refresh_token: refreshToken } as Session
      );

      // Security: Re-verify admin status with server instead of using cached adminInfo
      // This prevents privilege escalation via sessionStorage manipulation
      const response = await this.rpc<{ valid: boolean; adminInfo?: AdminAuthResponse }>('admin_verify_session');
      if (response.valid && response.adminInfo) {
        this.adminInfo = this.normalizeAdminInfo(response.adminInfo);
        this.saveSession(); // Save fresh admin info + migrate legacy storage
        return true;
      }
    } catch {
      this.safeRemove(localStorage, this.sessionKey);
      this.safeRemove(sessionStorage, this.sessionKey);
    }

    this.session = null;
    this.adminInfo = null;
    return false;
  }

  private safeGet(storage: Storage, key: string): string | null {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeSet(storage: Storage, key: string, value: string): boolean {
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  private safeRemove(storage: Storage, key: string): void {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage access errors.
    }
  }
}

export const adminNakama = AdminNakamaClient.getInstance();
export type { AdminAuthResponse } from '../types';
export default adminNakama;
