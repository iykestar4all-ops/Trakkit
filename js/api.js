/* ============================================================
   api.js — client for the Trackit backend (same origin).
   Holds the session token; every call carries it.
   ============================================================ */

const TOKEN_KEY = "trackit.token";

export const API = {
  token: (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })(),

  authed() { return !!this.token; },
  setToken(t) {
    this.token = t || null;
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  },

  async req(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = await res.json(); } catch {}
    if (res.status === 401) { this.setToken(null); throw new AuthError(json.error || "Please sign in."); }
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  },

  // auth
  signup(d) { return this.req("POST", "/api/auth/signup", d); },
  login(d) { return this.req("POST", "/api/auth/login", d); },
  logout() { return this.req("POST", "/api/auth/logout"); },
  me() { return this.req("GET", "/api/me"); },

  // data
  getState() { return this.req("GET", "/api/state"); },
  putState(s) { return this.req("PUT", "/api/state", s); },
  updateBusiness(patch) { return this.req("PUT", "/api/business", patch); },

  // billing
  billingInitialize() { return this.req("POST", "/api/billing/initialize"); },
  billingVerify(reference) { return this.req("POST", "/api/billing/verify", { reference }); },
  billingMockActivate() { return this.req("POST", "/api/billing/mock-activate"); },
  billingCancel() { return this.req("POST", "/api/billing/cancel"); },
  billingResume() { return this.req("POST", "/api/billing/resume"); },
  billingDevExpire() { return this.req("POST", "/api/billing/dev-expire"); },
};

export class AuthError extends Error {}
