// 後台登入 + JWT-like session token
// 用 Web Crypto API（Cloudflare Workers 相容）

export interface Env {
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
}

/** hash 密碼（PBKDF2） */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltBytes = salt
    ? new Uint8Array(salt.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );

  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const saltHex = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  return `${saltHex}:${hashHex}`;
}

/** 常數時間字串比對（避免 timing attack） */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 驗證密碼 */
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  const [saltHex, hashHex] = hashed.split(':');
  const test = await hashPassword(password, saltHex);
  return timingSafeEqual(test, hashed);
}

/** 產生 session token（JWT_SECRET 未設定時直接 throw，絕不使用預設密鑰簽章） */
export async function createSessionToken(secret: string): Promise<string> {
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const payload = {
    sub: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 天
  };
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const payloadB64 = btoa(JSON.stringify(payload));
  return `${payloadB64}.${sigHex}`;
}

/** 驗證 session token（JWT_SECRET 未設定時一律失敗 = fail closed） */
export async function verifySessionToken(token: string, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  try {
    const [payloadB64, sigHex] = token.split('.');
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, data);
    const expectedHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return timingSafeEqual(expectedHex, sigHex);
  } catch {
    return false;
  }
}

/** 從 cookie 檢查登入狀態 */
export async function isAuthenticated(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/session=([^;]+)/);
  if (!match) return false;
  return await verifySessionToken(match[1], secret);
}

/** 設定 session cookie */
export function setSessionCookie(token: string): string {
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

/** 清除 session cookie */
export function clearSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

/** 驗證請求密碼（後台登入用） */
export async function checkAdminPassword(password: string, env: Env): Promise<boolean> {
  const adminPw = env.ADMIN_PASSWORD;
  if (!adminPw) return false;
  // 常數時間比對，避免 timing attack
  return timingSafeEqual(password, adminPw);
}