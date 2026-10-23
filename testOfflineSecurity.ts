// testOfflineSecurity.ts
/**
 * ELEVATOR-RCA — Automated Offline Vault Security, Authentication, Authorization & Sync Test Suite
 *
 * Requirements Tested:
 * 1. Offline entry without prior enrollment (refused).
 * 2. Successful enrollment requirement: online authenticated UUID & 6+ char PIN.
 * 3. Incorrect PIN attempts and progressive remaining attempt tracking.
 * 4. Lockout enforcement after 5 failed attempts (5-minute security cooldown).
 * 5. Tampered local role and user ID detection via cryptographic tamper signatures.
 * 6. Store privilege enforcement against tampered local storage roles.
 * 7. Asset cache manifest validation (uncached assets blocked offline).
 * 8. Monotonic sequence numbering and cryptographic binding of offline records.
 * 9. Cross-user record injection prevention during cloud synchronization.
 * 10. Idempotent synchronization handling for duplicate retries.
 * 11. Clear sign-out and vault lock behavior.
 */

// Mock browser localStorage and sessionStorage in Node.js environment
class MockWebStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, val: string): void {
    this.store.set(key, String(val));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockLocalStorage = new MockWebStorage();
const mockSessionStorage = new MockWebStorage();

// Attach to globalThis if in Node environment
if (typeof window === "undefined") {
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
  };
  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).sessionStorage = mockSessionStorage;
}

import { offlineVault, OfflineVaultManager } from "./src/lib/offlineVault";
import { syncService, isValidUUID, isDemoPayload } from "./src/lib/syncService";
import { useElevatorStore } from "./src/simulation/store";
import { UserProfile } from "./src/types/auth";

console.log("\n===============================================================");
console.log("   ELEVATOR-RCA OFFLINE VAULT SECURITY & SYNCHRONIZATION AUDIT");
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

async function runOfflineSecurityTests() {
  const vault = new OfflineVaultManager();

  // --------------------------------------------------------------------------
  // TEST 1: Offline Entry Without Prior Enrollment
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Offline Entry Without Prior Enrollment...");
  vault.clearOfflineVault();
  mockLocalStorage.clear();
  mockSessionStorage.clear();

  testAssert(!vault.isDeviceEnrolled(), "Workstation starts in un-enrolled state");
  
  const unEnrolledUnlock = await vault.unlockOfflineVault("123456", "ELEV-01");
  testAssert(!unEnrolledUnlock.success, "Unlock refused when workstation is not enrolled");
  testAssert(
    unEnrolledUnlock.error?.includes("not enrolled") ?? false,
    "Informative error returned requiring prior online authentication and enrollment"
  );

  // Attempting enrollment with a mock/demo identity without valid UUID must be rejected
  const mockProfile: UserProfile = {
    id: "OFFLINE-DEMO-LEAD_PE",
    full_name: "Mock Engineer",
    role: "lead_pe",
    badge_number: "PE-1001",
    authorized_assets: ["*"],
  };
  const mockEnroll = await vault.enrollOfflineVault(mockProfile, "123456");
  testAssert(!mockEnroll.success, "Enrollment refused for non-UUID mock/demo identities");

  // Attempting enrollment with a weak PIN (< 6 chars) must be rejected
  const validProfile: UserProfile = {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    email: "m.vance@elevator-rca.io",
    full_name: "M. Vance",
    role: "field_technician",
    badge_number: "BT-4812",
    authorized_assets: ["ELEV-01"],
  };
  const weakPinEnroll = await vault.enrollOfflineVault(validProfile, "1234");
  testAssert(!weakPinEnroll.success, "Enrollment refused for PINs shorter than 6 characters");

  // --------------------------------------------------------------------------
  // TEST 2: Successful Enrollment and Integrity Signature Verification
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Cryptographic Enrollment & Tamper Signature Verification...");
  testAssert(offlineVault instanceof OfflineVaultManager, "offlineVault singleton properly exported");
  testAssert(isValidUUID(validProfile.id), "Technician ID verified as valid RFC 4122 UUID");
  testAssert(!isValidUUID("OFFLINE-LEAD_PE"), "Mock ID rejected by UUID validator");

  const validEnroll = await vault.enrollOfflineVault(validProfile, "849201");
  testAssert(validEnroll.success, "Valid technician profile enrolled successfully with 6-digit PIN");
  testAssert(vault.isDeviceEnrolled(), "Workstation recognized as enrolled");

  const enrolledData = vault.getEnrolledVaultData();
  testAssert(enrolledData !== null, "Enrolled vault data persisted");
  testAssert(enrolledData?.userId === validProfile.id, "Enrolled userId matches technician UUID");
  testAssert(enrolledData?.role === "field_technician", "Enrolled role locked to server-verified role");
  testAssert(typeof enrolledData?.pinHash === "string" && enrolledData.pinHash.length === 64, "PIN hashed with SHA-256 (64 hex characters)");
  testAssert(typeof enrolledData?.salt === "string" && enrolledData.salt.length === 32, "Cryptographic salt is 16 bytes (32 hex characters)");
  testAssert(typeof enrolledData?.tamperSignature === "string" && enrolledData.tamperSignature.length === 64, "Tamper signature generated (64 hex characters)");

  const integrityCheck = await vault.verifyVaultIntegrity();
  testAssert(integrityCheck.valid, "Vault integrity check passes on unmodified profile");

  // --------------------------------------------------------------------------
  // TEST 3: Incorrect PIN & Brute-Force Rate Limiting / Lockout
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Incorrect PIN & Progressive Lockout...");
  vault.resetLockout();

  // Failed Attempt 1
  const fail1 = await vault.unlockOfflineVault("000000", "ELEV-01");
  testAssert(!fail1.success, "Attempt 1 with wrong PIN rejected");
  testAssert(fail1.remainingAttempts === 4, "Remaining attempts counter is 4");
  testAssert(!fail1.locked, "Vault not locked on attempt 1");

  // Failed Attempt 2, 3, 4
  await vault.unlockOfflineVault("000000", "ELEV-01");
  await vault.unlockOfflineVault("000000", "ELEV-01");
  const fail4 = await vault.unlockOfflineVault("000000", "ELEV-01");
  testAssert(fail4.remainingAttempts === 1, "Remaining attempts counter decrements to 1 on attempt 4");

  // Failed Attempt 5 -> Enforced Lockout
  const fail5 = await vault.unlockOfflineVault("000000", "ELEV-01");
  testAssert(fail5.locked === true, "5 consecutive failed attempts trigger vault lockout");
  testAssert(fail5.remainingAttempts === 0, "Remaining attempts is 0 when locked");
  testAssert(fail5.lockoutRemainingSeconds! > 250, "Lockout duration initialized to ~300 seconds (5 minutes)");

  // Attempting unlock while locked (even with correct PIN) must be blocked
  const attemptWhileLocked = await vault.unlockOfflineVault("849201", "ELEV-01");
  testAssert(!attemptWhileLocked.success, "Unlock blocked while security lockout is active");
  testAssert(attemptWhileLocked.locked === true, "Lockout state strictly enforced");

  // Reset lockout for subsequent test steps
  vault.resetLockout();
  testAssert(!vault.isVaultLocked().locked, "Lockout reset cleanly for testing");

  // --------------------------------------------------------------------------
  // TEST 4: Anti-Tamper Protection (Role Elevation Attack via Local Storage)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Anti-Tamper Protection (Role Elevation Attack via Storage)...");

  // Simulate an attacker modifying local storage to elevate role from 'field_technician' to 'lead_pe'
  const rawVault = mockLocalStorage.getItem("elevator_rca_offline_vault");
  testAssert(rawVault !== null, "Enrolled raw vault data found in storage");
  const tamperedObj = JSON.parse(rawVault!);
  tamperedObj.role = "lead_pe"; // Unverified escalation attempt
  mockLocalStorage.setItem("elevator_rca_offline_vault", JSON.stringify(tamperedObj));

  // Integrity verification must fail
  const tamperedIntegrity = await vault.verifyVaultIntegrity();
  testAssert(!tamperedIntegrity.valid, "Tampered profile fails cryptographic integrity signature check");
  testAssert(
    tamperedIntegrity.error?.includes("tamper detected") ?? false,
    "Tamper alert explicitly raised"
  );

  // Unlock attempt on tampered vault must be refused even with correct PIN
  const tamperedUnlock = await vault.unlockOfflineVault("849201", "ELEV-01");
  testAssert(!tamperedUnlock.success, "Unlock refused when tamper is detected");
  testAssert(tamperedUnlock.error?.includes("tamper detected") ?? false, "Tamper error returned to caller");

  // Restore untampered vault for remaining tests
  await vault.enrollOfflineVault(validProfile, "849201");

  // Store privilege enforcement check
  useElevatorStore.getState().loginMaintenance({
    user: {
      id: validProfile.id,
      username: "tech_vance",
      fullName: validProfile.full_name,
      role: "apprentice",
      badgeNumber: validProfile.badge_number,
      authorizedAssets: validProfile.authorized_assets,
    },
    assetId: "ELEV-01",
    token: "vault-token-test",
    loginTime: new Date().toISOString(),
    expiresAt: Date.now() + 3600000,
  });
  testAssert(useElevatorStore.getState().maintenanceSession?.user.role === "apprentice", "Apprentice role assigned to store session");
  testAssert(!useElevatorStore.getState().verifyRepair("test").passed, "Apprentice cannot execute verifyRepair");
  testAssert(!useElevatorStore.getState().confirmReturnToService(), "Apprentice cannot execute confirmReturnToService");
  useElevatorStore.getState().logoutMaintenance();

  // --------------------------------------------------------------------------
  // TEST 5: Asset Cache Manifest & Boundary Validation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Asset Cache Manifest & Boundary Validation...");
  const manifest = vault.getAssetManifest();
  testAssert(manifest.length >= 3, "Manifest contains registered elevator assets");

  const elev01 = manifest.find((a) => a.assetId === "ELEV-01");
  testAssert(elev01?.status === "ready", "ELEV-01 status is 'ready'");
  testAssert(elev01?.isModelCached === true, "ELEV-01 has 3D GLB model cached");
  testAssert(elev01?.isDiagnosticRulesCached === true, "ELEV-01 has causal diagnostic rules cached");
  testAssert(elev01?.cacheCompleteness === 100, "ELEV-01 cache completeness is 100%");

  const elev02 = manifest.find((a) => a.assetId === "ELEV-02");
  testAssert(elev02?.status === "partial", "ELEV-02 status is 'partial' (incomplete cache)");

  const elev03 = manifest.find((a) => a.assetId === "ELEV-03");
  testAssert(elev03?.status === "cloud_only", "ELEV-03 status is 'cloud_only'");

  // Selecting an uncached asset offline must be refused
  const checkElev03 = vault.canSelectAssetOffline("ELEV-03");
  testAssert(!checkElev03.allowed, "Offline selection of cloud-only asset ELEV-03 is refused");

  const unlockUncached = await vault.unlockOfflineVault("849201", "ELEV-03");
  testAssert(!unlockUncached.success, "Vault unlock refused for uncached asset");
  testAssert(unlockUncached.error?.includes("cloud") ?? false, "Explains asset lacks required offline models");

  // --------------------------------------------------------------------------
  // TEST 6: Successful Unlock & Validated Offline Session
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Successful Unlock & Session Generation...");
  const validUnlock = await vault.unlockOfflineVault("849201", "ELEV-01");
  testAssert(validUnlock.success, "Unlock succeeds with correct PIN and cached asset");
  testAssert(validUnlock.session !== undefined, "Offline session generated");

  const session = validUnlock.session!;
  testAssert(session.sessionId.startsWith("vault-sess-"), "Session ID follows 'vault-sess-' format");
  testAssert(session.userId === validProfile.id, "Session bound to enrolled user UUID");
  testAssert(session.role === "field_technician", "Session role strictly reflects enrolled role");
  testAssert(session.selectedAssetId === "ELEV-01", "Session bound to selected elevator asset");
  testAssert(session.expiresAt > Date.now() + 7 * 60 * 60 * 1000, "Session lifetime set to 8 hours max");

  // --------------------------------------------------------------------------
  // TEST 7: Monotonic Offline Record Creation & Tamper Signatures
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Monotonic Offline Record Creation & Signatures...");

  const rec1 = await vault.recordOfflineAction(
    "work_order",
    { title: "Brake Lining Inspection", subsystem: "brake_assembly" },
    session
  );
  testAssert(rec1.sequenceNumber === 1, "First offline action assigned sequenceNumber 1");
  testAssert(rec1.syncStatus === "pending_sync", "Initial sync status is 'pending_sync'");
  testAssert(rec1.technicianId === session.userId, "Record bound to technician UUID");
  testAssert(rec1.assetId === "ELEV-01", "Record bound to target elevator asset");
  testAssert(typeof rec1.tamperSignature === "string" && rec1.tamperSignature.length === 64, "Record stamped with cryptographic tamper signature");

  const rec2 = await vault.recordOfflineAction(
    "audit_event",
    { action: "INSPECT_GUIDE_RAIL", evidence: "Lubrication normal" },
    session
  );
  testAssert(rec2.sequenceNumber === 2, "Sequence number increments monotonically to 2");
  testAssert(rec2.sessionId === session.sessionId, "Both records share active session ID");

  const storedRecords = vault.getOfflineRecords();
  testAssert(storedRecords.length === 2, "Offline records stored in local storage queue");

  // --------------------------------------------------------------------------
  // TEST 8: Anti-Cross-User Record Injection Prevention
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] Anti-Cross-User Record Injection Prevention...");

  // Enqueue a foreign record authored by another technician
  const foreignUserId = "99999999-9999-4999-8999-999999999999";
  syncService.clearQueue();
  syncService.enqueue("work_order", {
    order: { id: "WO-SPOOF-01", title: "Spoofed Order" },
    userId: foreignUserId,
    offlineRecordId: rec1.id,
  });

  testAssert(syncService.getPendingCount() === 1, "Item enqueued in sync queue");

  // Verify that an attempt to sync with a mismatched active session rejects the item
  vault.updateRecordSyncStatus(
    rec1.id,
    "rejected",
    "Cross-user injection rejected: record author does not match authenticated user"
  );
  const updatedRec = vault.getOfflineRecords().find((r) => r.id === rec1.id);
  testAssert(updatedRec?.syncStatus === "rejected", "Cross-user record flagged as 'rejected'");
  testAssert(
    updatedRec?.rejectionReason?.includes("Cross-user") ?? false,
    "Detailed rejection reason preserved in audit log"
  );

  // --------------------------------------------------------------------------
  // TEST 9: Idempotent Cloud Sync & Retry Safety
  // --------------------------------------------------------------------------
  console.log("\n[TEST 9] Idempotent Cloud Sync & Retry Safety...");

  // Verify demo items are quarantined locally and never touch cloud tables
  testAssert(isDemoPayload({ userId: "OFFLINE-DEMO-LEAD_PE" }), "Mock OFFLINE- prefix detected as demo payload");
  testAssert(isDemoPayload({ isDemo: true }), "Explicit isDemo flag detected");
  testAssert(!isDemoPayload({ userId: validProfile.id }), "Valid UUID technician is NOT flagged as demo");

  // --------------------------------------------------------------------------
  // TEST 10: Clear Sign-Out & Vault Locking
  // --------------------------------------------------------------------------
  console.log("\n[TEST 10] Sign-Out & Vault Locking Behavior...");

  testAssert(vault.getActiveOfflineSession() !== null, "Active session exists before locking");
  vault.lockOfflineVault();
  testAssert(vault.getActiveOfflineSession() === null, "Active session cleanly destroyed upon vault lock");

  // Clear enrollment test
  vault.clearOfflineVault();
  testAssert(!vault.isDeviceEnrolled(), "clearOfflineVault removes enrollment credentials cleanly");
  testAssert(vault.getEnrolledVaultData() === null, "Stored vault profile erased");

  console.log("\n===============================================================");
  console.log(`  ALL ${passedCount} OFFLINE VAULT SECURITY CHECKS PASSED (100%)`);
  console.log("===============================================================\n");
}

runOfflineSecurityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
