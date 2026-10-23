# Supabase Setup & Production Integration Guide for Elevator-RCA

This document provides complete instructions for configuring, deploying, and maintaining the Supabase backend for **Elevator-RCA** — Explainable Causal AI for Intelligent Elevator Fault Diagnosis.

---

## 1. Project Credentials & Environment Configuration

The application is pre-configured to communicate with the Supabase project:

- **Supabase Project URL**: `https://vfhtxpjkgkoezxeutwco.supabase.co`
- **Publishable / Anon Key**: `sb_publishable_ANG24UI1UIbQ_PuAsa326Q_xVC0AhzO`
- **Live Explanation Website**: `https://rca-elevator.netlify.app/`

### Local Environment (`.env.local`)
The `.env.local` file contains:
```env
# Supabase Configuration for Elevator-RCA
VITE_SUPABASE_URL=https://vfhtxpjkgkoezxeutwco.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ANG24UI1UIbQ_PuAsa326Q_xVC0AhzO

# Next.js backward compatibility (for server-side utility stubs)
NEXT_PUBLIC_SUPABASE_URL=https://vfhtxpjkgkoezxeutwco.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ANG24UI1UIbQ_PuAsa326Q_xVC0AhzO
```

> [!NOTE]
> `.env.local` is listed in `.gitignore` and will never be committed to source control.

---

## 2. Supabase Dashboard Configuration

### Step A: Enable Email Authentication
1. Navigate to your [Supabase Dashboard](https://supabase.com/dashboard/project/vfhtxpjkgkoezxeutwco).
2. Go to **Authentication** > **Providers** > **Email**.
3. Verify that **Enable Email provider** is toggled **ON**.
4. *(Recommended for rapid testing)*: Under **Email Auth**, you may temporarily disable **Confirm email** so test technician accounts can log in immediately upon registration.

### Step B: Configure Redirect URLs
1. In the Supabase Dashboard, go to **Authentication** > **URL Configuration**.
2. Set the **Site URL** to:
   ```
   http://localhost:5173
   ```
3. Under **Redirect URLs**, add:
   ```
   http://localhost:5173/**
   https://rca-elevator.netlify.app/**
   ```
4. Click **Save Changes**.

---

## 3. Database Schema & RLS Migration

To create the required database tables, triggers, and security policies:

1. Open the **SQL Editor** in your Supabase Dashboard.
2. Open the migration file:
   [`supabase/migrations/20261019000000_create_profiles_and_rca_tables.sql`](file:///supabase/migrations/20261019000000_create_profiles_and_rca_tables.sql)
3. Copy its entire content, paste it into the SQL Editor, and click **Run**.

### Schema Summary

| Table | Purpose | Security & RLS |
|---|---|---|
| `profiles` | 1:1 user profile linked to `auth.users(id)` containing certified role, badge ID, and certifications | RLS enabled. Users can view team profiles and update their own profile. Automatic trigger on signup. |
| `elevator_assets` | Digital twin asset registry (pre-seeded with `ELEV-01`) | RLS enabled. Authenticated users can view and update operational status. |
| `maintenance_work_orders` | Corrective work orders, inspection checklists, and repair before/after measurements | RLS enabled. Indexed foreign keys (`user_id`, `asset_id`, `status`). |
| `diagnostic_records` | Diagnostic hypotheses, causal graphs, confidence scores, and sensor snapshots | RLS enabled. Indexed by `created_at` and `fault_scenario_id`. |
| `audit_events` | ASME A17.1-compliant immutable maintenance audit trail | RLS enabled. Tamper-evident transition logs. |

---

## 4. Architectural Highlights & Offline Resilience

### Dual-Layer Session Synchronization
The application maintains synchronization between Supabase Auth and the local Zustand maintenance state machine:
- When a user logs in via Supabase, their email, full name, certified role (`lead_pe`, `field_technician`, `admin`, `apprentice`), and badge ID are mapped into the local FSM session.
- Role-based access control (RBAC) automatically gates Lead PE verification permissions and archival authority.

### Offline Hoistway Capability
Technicians working in deep basements or shielded elevator hoistways without internet connectivity retain 100% operational functionality:
- **Offline Shaft Mode**: Click "Launch Offline Field Workstation" on the login screen to work completely offline.
- **Offline Sync Queue**: Any work order completions or audit events generated while offline are cached in `localStorage` (`elevator_rca_sync_queue`).
- **Automatic Reconnection Flush**: The `syncService` listens to the browser `online` event and automatically drains the queue to Supabase when network connectivity returns.

---

## 5. Verification & Testing

To verify the integration locally:

```bash
# Type check all TypeScript files
npx tsc --noEmit

# Run the full automated integration test suite (includes Supabase Auth test)
npx tsx testWorkflow.ts

# Build production bundle
npm run build
```

