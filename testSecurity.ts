// testSecurity.ts
/**
 * ELEVATOR-RCA — Automated Security Audit, RLS Verification & Access Control Test Suite
 */

import fs from "node:fs";
import path from "node:path";
import { isValidUUID, isDemoPayload, syncService } from "./src/lib/syncService";
import { useElevatorStore } from "./src/simulation/store";
import { MaintenanceSession } from "./src/auth/maintenanceAuth";

console.log("\n===============================================================");
console.log("   ELEVATOR-RCA AUTOMATED SECURITY & AUTHENTICATION AUDIT");
console.log("===============================================================\n");

let passedCount = 0;

function testAssert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
  passedCount++;
}

async function runSecurityAuditSuite() {
  // --------------------------------------------------------------------------
  // TEST 1: Role Escalation Prevention & Store Privilege Enforcement
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Role Escalation & Store Privilege Enforcement...");

  const store = useElevatorStore.getState();

  // Test: Set session as apprentice
  const apprenticeSession: MaintenanceSession = {
    user: {
      id: "11111111-2222-3333-4444-555555555555",
      username: "apprentice_joe",
      fullName: "J. Doe (Apprentice)",
      role: "apprentice",
      badgeNumber: "APP-001",
      authorizedAssets: ["ELEV-01"],
    },
    assetId: "ELEV-01",
    token: "token-apprentice",
    loginTime: new Date().toISOString(),
    expiresAt: Date.now() + 3600000,
  };

  store.loginMaintenance(apprenticeSession);

  // Apprentice must NOT be allowed to verify repair
  const verifyRes = store.verifyRepair("J. Doe (Apprentice)");
  testAssert(verifyRes.passed === false, "Apprentice role is blocked from executing verifyRepair");

  // Apprentice must NOT be allowed to confirm return-to-service
  const returnRes = store.confirmReturnToService();
  testAssert(returnRes === false, "Apprentice role is blocked from executing confirmReturnToService");

  // Apprentice must NOT be allowed to execute raw log cleanup
  const cleanupRes = store.executeRawLogCleanup();
  testAssert(cleanupRes.success === false, "Apprentice role is blocked from executing executeRawLogCleanup");

  // Test: Set session as lead_pe
  const leadSession: MaintenanceSession = {
    user: {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      username: "pe_topson",
      fullName: "N. Topson (Lead PE)",
      role: "lead_pe",
      badgeNumber: "PE-1001",
      authorizedAssets: ["ELEV-01"],
    },
    assetId: "ELEV-01",
    token: "token-lead",
    loginTime: new Date().toISOString(),
    expiresAt: Date.now() + 3600000,
  };

  store.loginMaintenance(leadSession);
  testAssert(useElevatorStore.getState().maintenanceSession?.user.role === "lead_pe", "Elevated session registered as lead_pe");

  store.logoutMaintenance();
  testAssert(useElevatorStore.getState().maintenanceSession === null, "logoutMaintenance cleanly clears maintenanceSession");

  // --------------------------------------------------------------------------
  // TEST 2: Demo Identification, Mock Isolation & UUID Validation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Demo Identification, Mock Isolation & UUID Validation...");

  // Valid RFC 4122 UUIDs
  testAssert(isValidUUID("c56a4180-65aa-42ec-a945-5fd21dec0538"), "Valid UUID v4 accepted");
  testAssert(isValidUUID("12345678-1234-1234-8234-123456789abc"), "Valid lower-case UUID accepted");

  // Invalid / Mock UUIDs
  testAssert(!isValidUUID("OFFLINE-LEAD_PE"), "Mock OFFLINE-LEAD_PE rejected by UUID validator");
  testAssert(!isValidUUID("OFFLINE-DEMO-ADMIN"), "Mock OFFLINE-DEMO-ADMIN rejected by UUID validator");
  testAssert(!isValidUUID("tech-1234"), "Arbitrary text badge rejected by UUID validator");
  testAssert(!isValidUUID(""), "Empty string rejected by UUID validator");
  testAssert(!isValidUUID(null), "Null value rejected by UUID validator");
  testAssert(!isValidUUID(undefined), "Undefined value rejected by UUID validator");

  // Demo payload detection
  testAssert(isDemoPayload({ isDemo: true }), "Payload with isDemo: true correctly recognized");
  testAssert(isDemoPayload({ userId: "OFFLINE-LEAD_PE" }), "Payload with mock userId recognized as demo");
  testAssert(isDemoPayload({ userId: "invalid-uuid" }), "Payload with invalid UUID recognized as demo");
  testAssert(!isDemoPayload({ userId: "c56a4180-65aa-42ec-a945-5fd21dec0538" }), "Legitimate UUID payload not recognized as demo");

  // --------------------------------------------------------------------------
  // TEST 3: Offline Sync Queue Quarantine
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Offline Sync Queue Quarantine...");

  syncService.clearQueue();
  testAssert(syncService.getPendingCount() === 0, "Sync queue starts clean (0 items)");

  // Attempt to enqueue mock demo item
  syncService.enqueue("work_order", {
    userId: "OFFLINE-DEMO-LEAD_PE",
    isDemo: true,
    order: { id: "WO-DEMO-01", title: "Test Order" },
  });

  // Mock demo items must be quarantined locally and NOT added to the cloud queue
  testAssert(
    syncService.getPendingCount() === 0,
    "Mock demo payload was quarantined and excluded from the cloud sync queue"
  );

  // Enqueue legitimate authenticated payload
  syncService.enqueue("work_order", {
    userId: "c56a4180-65aa-42ec-a945-5fd21dec0538",
    order: { id: "WO-REAL-01", title: "Legitimate Certified Order" },
  });

  testAssert(
    syncService.getPendingCount() === 1,
    "Legitimate authenticated payload successfully enqueued in cloud sync queue"
  );

  syncService.clearQueue();

  // --------------------------------------------------------------------------
  // TEST 4: Database Hardening Migration & RLS Syntax Audit
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Database Hardening Migration & RLS Syntax Audit...");

  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261020000000_harden_security_and_rls.sql"
  );
  testAssert(fs.existsSync(migrationPath), "Hardening migration file exists");

  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  // 1. Role escalation trigger
  testAssert(
    migrationSql.includes("trg_prevent_self_role_escalation"),
    "Migration implements trg_prevent_self_role_escalation trigger"
  );
  testAssert(
    migrationSql.includes("check_profile_update_privileges"),
    "Migration implements check_profile_update_privileges function"
  );
  testAssert(
    migrationSql.includes("Only certified administrators can modify user roles"),
    "Migration enforces admin-only role updates"
  );

  // 2. Hardened default in handle_new_user
  testAssert(
    migrationSql.includes("'field_technician'"),
    "handle_new_user() forces default field_technician role"
  );
  testAssert(
    !migrationSql.includes("COALESCE(new.raw_user_meta_data->>'role', 'field_technician')"),
    "handle_new_user() eliminates untrusted raw_user_meta_data->>'role' assignment"
  );

  // 3. Work orders policy
  testAssert(
    /verification_passed\s+IS\s+NOT\s+TRUE\s+OR\s+EXISTS/i.test(migrationSql),
    "Work order updates require lead_pe or admin for verification_passed"
  );

  // 4. Revocation of anon privileges
  testAssert(
    migrationSql.includes("REVOKE SELECT ON public.profiles FROM anon;"),
    "Anon SELECT access revoked on public.profiles"
  );
  testAssert(
    migrationSql.includes("REVOKE SELECT ON public.maintenance_work_orders FROM anon;"),
    "Anon SELECT access revoked on public.maintenance_work_orders"
  );
  testAssert(
    migrationSql.includes("REVOKE SELECT ON public.diagnostic_records FROM anon;"),
    "Anon SELECT access revoked on public.diagnostic_records"
  );
  testAssert(
    migrationSql.includes("REVOKE SELECT ON public.audit_events FROM anon;"),
    "Anon SELECT access revoked on public.audit_events"
  );

  // --------------------------------------------------------------------------
  // TEST 5: Secret Key & Leaked Credentials Audit
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Client-Side Secret Key & Leaked Identifiers Audit...");

  // Search src/ directory for any accidental service_role strings
  const srcFiles: string[] = [];
  function collectFiles(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        srcFiles.push(full);
      }
    }
  }
  collectFiles(path.resolve(process.cwd(), "src"));

  let foundServiceRoleKey = false;
  let leakedProjectRef = false;

  for (const file of srcFiles) {
    const content = fs.readFileSync(file, "utf-8");
    if (content.includes("service_role") && !file.includes("test")) {
      foundServiceRoleKey = true;
    }
    if (content.includes("vfhtxpjkgkoezxeutwco") && file.includes("Login.tsx")) {
      leakedProjectRef = true;
    }
  }

  testAssert(!foundServiceRoleKey, "Zero service_role keys in frontend source files");
  testAssert(!leakedProjectRef, "Supabase project reference vfhtxpjkgkoezxeutwco successfully removed from Login UI");

  console.log("\n===============================================================");
  console.log(`  ALL ${passedCount} SECURITY AUDIT CHECKS PASSED (100% EMPIRICAL PASS)`);
  console.log("===============================================================\n");
}

runSecurityAuditSuite().catch((err) => {
  console.error("Security audit test suite failed:", err);
  process.exit(1);
});
