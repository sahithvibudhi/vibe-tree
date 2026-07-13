import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from '../config';

interface SessionToken {
  id: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
}

interface DeviceInfo {
  id: string;
  name: string;
  type: 'desktop' | 'web' | 'mobile';
  lastSeen: Date;
}

export class AuthService {
  private sessionTokens: Map<string, SessionToken> = new Map();
  private devices: Map<string, DeviceInfo> = new Map();
  private userSessions: Set<string> = new Set();
  private cleanupTimer: NodeJS.Timeout;

  constructor(private config: ServerConfig) {
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTokens(), 60000);
    this.cleanupTimer.unref?.();
  }

  async generateQRCode(port: number): Promise<{ qrCode: string; token: string; url: string }> {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const localIP = this.getLocalIPAddress();
    const url = `ws://${localIP}:${port}/connect?token=${token}`;

    this.sessionTokens.set(token, {
      id: token,
      deviceId: '',
      createdAt: new Date(),
      expiresAt
    });

    const qrCode = await QRCode.toDataURL(url);

    return { qrCode, token, url };
  }

  validateToken(token: string): boolean {
    const sessionToken = this.sessionTokens.get(token);
    if (!sessionToken) {
      return false;
    }

    if (sessionToken.expiresAt < new Date()) {
      this.sessionTokens.delete(token);
      return false;
    }

    return true;
  }

  async pairDevice(
    token: string,
    deviceInfo: { name: string; type: 'web' | 'mobile' }
  ): Promise<string> {
    if (!this.validateToken(token)) {
      throw new Error('Invalid or expired token');
    }

    const deviceId = uuidv4();
    const device: DeviceInfo = {
      id: deviceId,
      name: deviceInfo.name,
      type: deviceInfo.type,
      lastSeen: new Date()
    };

    this.devices.set(deviceId, device);

    const sessionToken = this.sessionTokens.get(token)!;
    sessionToken.deviceId = deviceId;

    return jwt.sign({ deviceId, type: device.type }, this.config.jwtSecret, { expiresIn: '7d' });
  }

  verifyJWT(token: string): { deviceId: string; type: string } | null {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as {
        deviceId: string;
        type: string;
      };

      const device = this.devices.get(decoded.deviceId);
      if (device) {
        device.lastSeen = new Date();
      }

      return { deviceId: decoded.deviceId, type: decoded.type };
    } catch {
      return null;
    }
  }

  getConnectedDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  disconnectDevice(deviceId: string): boolean {
    return this.devices.delete(deviceId);
  }

  private getLocalIPAddress(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  private cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, sessionToken] of this.sessionTokens) {
      if (sessionToken.expiresAt < now) {
        this.sessionTokens.delete(token);
      }
    }
  }

  generateSessionToken(): string {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `${timestamp}-${randomBytes}`;
  }

  validateCredentials(username: string, password: string): boolean {
    const { username: expectedUsername, password: expectedPassword } = this.config;

    if (!expectedUsername || !expectedPassword) {
      return false;
    }

    return username === expectedUsername && password === expectedPassword;
  }

  login(
    username: string,
    password: string
  ): { success: boolean; sessionToken?: string; error?: string } {
    if (!this.config.authRequired) {
      const sessionToken = this.generateSessionToken();
      this.userSessions.add(sessionToken);
      return { success: true, sessionToken };
    }

    if (!this.validateCredentials(username, password)) {
      return { success: false, error: 'Invalid credentials' };
    }

    const sessionToken = this.generateSessionToken();
    this.userSessions.add(sessionToken);
    return { success: true, sessionToken };
  }

  logout(sessionToken: string): boolean {
    return this.userSessions.delete(sessionToken);
  }

  validateSessionToken(sessionToken: string): boolean {
    if (!this.config.authRequired) {
      return true;
    }

    return this.userSessions.has(sessionToken);
  }

  getAuthConfig(): { authRequired: boolean; authConfigured: boolean } {
    return {
      authRequired: this.config.authRequired,
      authConfigured: !!(this.config.username && this.config.password)
    };
  }

  requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!this.config.authRequired) {
      return next();
    }

    let sessionToken: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7);
    } else if (req.query.session_token) {
      sessionToken = req.query.session_token as string;
    }

    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!this.validateSessionToken(sessionToken)) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    next();
  };

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }
}
