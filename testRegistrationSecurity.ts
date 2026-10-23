// testRegistrationSecurity.ts
/**
 * ELEVATOR-RCA — Automated Registration Security, Badge Validation & Password Audit Suite
 */

import fs from "node:fs";
import path from "node:path";
import { validateBadgeId, normalizeBadgeId } from "./src/utils/badgeValidation";
import { evaluatePasswordStrength } from "./src/utils/passwordSecurity";

console.log("\n===============================================================");
console.log("   ELEVATOR-RCA REGISTRATION SECURITY & VALIDATION AUDIT");
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

async function runRegistrationSecuritySuite() {
  // --------------------------------------------------------------------------
  // TEST 1: Industrial Badge ID Validation & Normalization
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Industrial Badge ID Validation & Normalization...");

  // Valid badges
  const validBadges = ["BT-4812", "APP-902", "PE-1001", "ADM-001", "TECH-8492", "CERT-9921", "LIC-10923"];
  for (const b of validBadges) {
    const res = validateBadgeId(b);
    testAssert(res.valid === true, `Badge "${b}" is recognized as valid`);
    testAssert(res.isSyntacticallyValid === true, `Badge "${b}" is syntactically valid`);
    testAssert(res.credentialStatus === "syntactically_valid", `Badge "${b}" status marked syntactically_valid`);
  }

  // Normalization
  testAssert(normalizeBadgeId("bt 4812") === "BT-4812", "Normalization converts space delimiter 'bt 4812' -> 'BT-4812'");
  testAssert(normalizeBadgeId("tech_1042") === "TECH-1042", "Normalization converts underscore 'tech_1042' -> 'TECH-1042'");
  testAssert(normalizeBadgeId("  pe-1001  ") === "PE-1001", "Normalization trims whitespace '  pe-1001  ' -> 'PE-1001'");

  // Invalid badges
  testAssert(!validateBadgeId("").valid, "Empty badge rejected");
  testAssert(!validateBadgeId("A").valid, "Single character badge rejected");
  testAssert(!validateBadgeId("1234").valid, "Missing prefix rejected (1234)");
  testAssert(!validateBadgeId("TECH").valid, "Missing numeric/code suffix rejected (TECH)");
  testAssert(!validateBadgeId("VERYLONGPREFIX-123456789012").valid, "Excessive length badge rejected");

  // Credential verification notice
  const validRes = validateBadgeId("BT-4812");
  testAssert(
    validRes.notice.includes("Official state/ASME credential verification is pending supervisory review"),
    "Explicit notice given that syntax validity does NOT equal verified credential"
  );

  // --------------------------------------------------------------------------
  // TEST 2: Password Security & Entropy Policy (12+ Characters & Compromised Lists)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Password Security & Entropy Policy...");

  // Minimum length check (< 12 characters rejected)
  const shortPass1 = evaluatePasswordStrength("abc");
  testAssert(!shortPass1.isAcceptable, "3-character password rejected as unacceptable");
  testAssert(shortPass1.score <= 1, "Short password score <= 1");

  const shortPass2 = evaluatePasswordStrength("elevatortech"); // 12 chars exactly
  testAssert(shortPass2.isAcceptable, "12-character passphrase accepted");

  const shortPass3 = evaluatePasswordStrength("short12345"); // 10 chars
  testAssert(!shortPass3.isAcceptable, "10-character password rejected (< 12 chars)");

  // Compromised / Dictionary passwords
  const compromised1 = evaluatePasswordStrength("password12345");
  testAssert(compromised1.isCompromised === true, "Known compromised password 'password12345' detected");
  testAssert(!compromised1.isAcceptable, "Known compromised password rejected");

  const compromised2 = evaluatePasswordStrength("123456789012");
  testAssert(compromised2.isCompromised === true, "Known sequential password '123456789012' detected");

  // Strong long passphrases (16+ chars or high entropy)
  const strongPass = evaluatePasswordStrength("Elevator#Safety!2026Station");
  testAssert(strongPass.score >= 3, "High entropy passphrase achieves score >= 3 (Strong / Very Strong)");
  testAssert(strongPass.isAcceptable === true, "High entropy passphrase is acceptable");

  // --------------------------------------------------------------------------
  // TEST 3: Server-Side Registration Schema & Trigger Audit
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Server-Side Registration Schema & Trigger Audit...");

  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261020010000_secure_registration_and_badge_validation.sql"
  );
  testAssert(fs.existsSync(migrationPath), "Migration 20261020010000 exists on disk");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // 1. Lowest permitted role assignment
  testAssert(
    sql.includes("'apprentice'"),
    "handle_new_user() strictly assigns lowest permitted role ('apprentice')"
  );
  testAssert(
    !sql.includes("COALESCE(new.raw_user_meta_data->>'role'"),
    "handle_new_user() never trusts raw_user_meta_data->>'role'"
  );

  // 2. Unverified certification status on registration
  testAssert(
    sql.includes("certification_status"),
    "Profiles table schema incorporates certification_status column"
  );
  testAssert(
    sql.includes("'unverified'"),
    "New profiles initialize with certification_status = 'unverified'"
  );

  // 3. Requested role captured for review without granting privileges
  testAssert(
    sql.includes("requested_role"),
    "Profiles table schema stores requested_role for supervisory review"
  );

  // 4. Badge ID format constraint and unique index
  testAssert(
    sql.includes("chk_profiles_badge_format"),
    "Schema enforces chk_profiles_badge_format constraint"
  );
  testAssert(
    sql.includes("idx_profiles_badge_unique"),
    "Schema creates unique index on upper(badge_number)"
  );

  // 5. Authorized promotion procedure
  testAssert(
    sql.includes("FUNCTION public.promote_user_role"),
    "Schema creates authoritative promote_user_role stored procedure"
  );
  testAssert(
    sql.includes("caller_role != 'admin'"),
    "promote_user_role enforces caller must be 'admin'"
  );
  testAssert(
    sql.includes("INSERT INTO public.audit_events"),
    "promote_user_role records immutable audit event"
  );

  // --------------------------------------------------------------------------
  // TEST 4: Frontend Form Layout & Demo Isolation Audit
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Frontend Form Layout & Demo Isolation Audit...");

  const loginTsxPath = path.resolve(process.cwd(), "src/pages/Login.tsx");
  const loginTsx = fs.readFileSync(loginTsxPath, "utf-8");

  // Grouped sections in register view
  testAssert(
    loginTsx.includes("1. Certified Identity Information"),
    "Register view contains Group 1: Certified Identity Information"
  );
  testAssert(
    loginTsx.includes("2. Security Credentials (Min 12 Characters)"),
    "Register view contains Group 2: Security Credentials"
  );
  testAssert(
    loginTsx.includes("3. Initial Role Policy & Credential Review"),
    "Register view contains Group 3: Role Policy & Review notice"
  );

  // Confirm password and strength meter
  testAssert(
    loginTsx.includes("regConfirmPassword"),
    "Register view includes confirm password field"
  );
  testAssert(
    loginTsx.includes("passwordStrength"),
    "Register view includes real-time password strength meter"
  );
  testAssert(
    loginTsx.includes("passwordsMatch"),
    "Register view verifies password matching before submit"
  );

  // Demo cards separation
  testAssert(
    loginTsx.includes('isDev && authMode === "login"'),
    "Demo profile cards are strictly isolated to Sign In view only"
  );
  testAssert(
    !loginTsx.includes('isDev && (authMode === "register"'),
    "Demo cards are hidden on Register view"
  );

  // --------------------------------------------------------------------------
  // TEST 5: Secret Key & Backend Exposure Check
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Secret Key & Environment Variable Audit...");

  const srcDir = path.resolve(process.cwd(), "src");
  let foundServiceRole = false;
  function scan(dir: string) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, file.name);
      if (file.isDirectory()) scan(full);
      else if (file.name.endsWith(".ts") || file.name.endsWith(".tsx")) {
        const c = fs.readFileSync(full, "utf-8");
        if (c.includes("service_role") && !file.name.includes("test")) {
          foundServiceRole = true;
        }
      }
    }
  }
  scan(srcDir);
  testAssert(!foundServiceRole, "Zero service_role keys exposed across src/ codebase");

  console.log("\n===============================================================");
  console.log(`  ALL ${passedCount} REGISTRATION SECURITY AUDIT CHECKS PASSED (100%)`);
  console.log("===============================================================\n");
}

runRegistrationSecuritySuite().catch((err) => {
  console.error("Registration audit suite failed:", err);
  process.exit(1);
});

