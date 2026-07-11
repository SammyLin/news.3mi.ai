import type { APIRoute } from 'astro';
import {
  checkAdminPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  isAuthenticated,
} from '../../lib/auth';

export const prerender = false;

const getEnv = (context: any) => context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};

export const GET: APIRoute = async (context) => {
  const env = getEnv(context);
  const authed = await isAuthenticated(context.request, env.JWT_SECRET);
  return new Response(JSON.stringify({ authenticated: authed }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  const body = await context.request.json() as { password?: string };
  if (!body.password) {
    return new Response(JSON.stringify({ error: 'Missing password' }), { status: 400 });
  }

  const valid = await checkAdminPassword(body.password, env);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 });
  }

  if (!env.JWT_SECRET) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500 });
  }
  const token = await createSessionToken(env.JWT_SECRET);
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setSessionCookie(token),
    },
  });
};

export const DELETE: APIRoute = async (_context) => {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
};