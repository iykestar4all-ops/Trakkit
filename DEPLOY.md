# Deploying Trackit to Render

Trackit is one Node service that serves the app and the API. Render runs it directly.

## 1. Put the code on GitHub

From the project folder (`C:\Users\ikenn\OneDrive\Documents\Trakkit`):

```bash
git init
git add .
git commit -m "Trackit v1"
```

Create an empty repo on GitHub (github.com/new, name it `trackit`, no README), then:

```bash
git remote add origin https://github.com/<your-username>/trackit.git
git branch -M main
git push -u origin main
```

## 2. Create the service on Render

1. Go to **dashboard.render.com** → **New +** → **Blueprint**.
2. Connect your GitHub and pick the `trackit` repo. Render reads `render.yaml`.
3. Click **Apply**. It builds (a few seconds — no dependencies) and gives you a URL like `https://trackit.onrender.com`.

That URL works in any browser and on your phone. Sign up and you're in.

> Free plan note: the service sleeps after ~15 min idle (first request then takes ~30s to wake), and **data resets on restart** because there is no persistent disk. Fine for testing. For real use, see step 4.

## 3. Turn on real payments (Paystack)

1. In your Paystack dashboard, copy your **Secret key** (`sk_live_…` for real money, or `sk_test_…` to test with test cards).
2. In Render → your service → **Environment** → add:
   - `PAYSTACK_SECRET_KEY` = your secret key
3. Save. Render redeploys. The startup log will now say `Paystack: LIVE`.
4. In Paystack → **Settings → API Keys & Webhooks**, set the **Webhook URL** to:
   ```
   https://<your-service>.onrender.com/api/paystack/webhook
   ```

Now "Subscribe" opens Paystack's hosted checkout, and Trackit verifies the payment (and the webhook) before activating the plan. No card details ever touch Trackit.

## 4. Keep data forever, free (Supabase) — do this so logins stick

On the free plan Render wipes its own disk on every restart. To keep accounts, Trackit stores everything in **Supabase** (free Postgres) when two env vars are set. Data then survives restarts and redeploys, at ₦0.

1. Go to **supabase.com**, create a free project (pick a region near you).
2. In the project's **SQL Editor**, run:
   ```sql
   create table if not exists kv (k text primary key, v jsonb);
   alter table kv enable row level security;
   ```
   (No RLS policies needed — Trackit connects with the service role key, which bypasses RLS. That key is server-only and never reaches the browser.)
3. In Supabase → **Project Settings → API**, copy:
   - **Project URL** (like `https://abcd.supabase.co`)
   - **service_role** secret key (under Project API keys — keep it secret)
4. In **Render → your `trackit` service → Environment**, add:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key
   - **Save Changes** (Render redeploys).

The startup log will now say `Storage: Supabase (persistent)`. From now on, accounts and data persist no matter what the host does — comfortably enough for your first 10+ clients before any tool costs money. (Free Supabase projects pause after ~1 week of no activity; open the Supabase dashboard to wake it. A weekly login or a cron ping keeps it active.)

## 5. Custom domain (optional)

Render → your service → **Settings → Custom Domains** → add `trackit.yourdomain.com` and follow the DNS instructions.

---

### Alternatives
- **Railway** (railway.app): New Project → Deploy from repo. It has volumes on the usage-based plan for persistence. Start command `npm start`.
- **Quick phone test without deploying:** run `node server/index.mjs` locally, then `ngrok http 5050` for a temporary public URL.
