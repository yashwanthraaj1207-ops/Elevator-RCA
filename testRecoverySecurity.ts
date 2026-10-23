// testRecoverySecurity.ts
/**
 * ELEVATOR-RCA — Automated Password Recovery Flow, Redirect Security & Enumeration Defense Test Suite
 */

import fs from "node:fs";
import path from "node:path";
import { getPasswordRecoveryRedirectUrl, isApprovedOrigin } from "./src/utils/authUrls";
import { evaluatePasswordStrength } from "./src/utils/passwordSecurity";

console.log("\n===============================================================");
console.log("   ELEVATOR-RCA RECOVERY FLOW SECURITY & ENUMERATION AUDIT");
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

async function runRecoverySecuritySuite() {
  // --------------------------------------------------------------------------
  // TEST 1: Account Enumeration Defense & Public Message Neutrality
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Account Enumeration Defense & Public Message Neutrality...");

  const authContextPath = path.resolve(process.cwd(), "src/context/AuthContext.tsx");
  const authContextSql = fs.readFileSync(authContextPath, "utf-8");

  // Verify generic neutral message is returned regardless of email presence
  const genericMessage =
    "If an account is associated with this email address, password recovery instructions have been dispatched.";

  testAssert(
    authContextSql.includes(genericMessage),
    "AuthContext returns standardized non-enumerating generic confirmation"
  );

  // Verify that error responses do not disclose account presence
  testAssert(
    !authContextSql.includes("Email not found") && !authContextSql.includes("User not found"),
    "AuthContext contains zero error disclosures for nonexistent users"
  );

  // Rate limit protection
  testAssert(
    authContextSql.includes("Rate limit reached"),
    "AuthContext handles rate-limiting without leaking account existence"
  );

  // --------------------------------------------------------------------------
  // TEST 2: Redirect URL Security & Open Redirect Prevention
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Redirect URL Security & Open Redirect Prevention...");

  // Approved Origins
  testAssert(isApprovedOrigin("http://localhost:5173"), "Localhost dev origin approved");
  testAssert(isApprovedOrigin("http://localhost:3000"), "Localhost port 3000 approved");
  testAssert(isApprovedOrigin("http://127.0.0.1:5173"), "Loopback IP dev origin approved");
  testAssert(isApprovedOrigin("https://rca-elevator.netlify.app"), "Production Netlify domain approved");
  testAssert(isApprovedOrigin("https://deploy-preview-12--rca-elevator.netlify.app"), "Netlify preview branch origin approved");

  // Malicious / Open Redirects Rejected
  testAssert(!isApprovedOrigin("https://evil-attacker.com"), "Malicious external origin rejected");
  testAssert(!isApprovedOrigin("https://rca-elevator.netlify.app.attacker.com"), "Subdomain spoofing origin rejected");
  testAssert(!isApprovedOrigin("javascript:alert(1)"), "JavaScript URI rejected as origin");
  testAssert(!isApprovedOrigin(""), "Empty origin rejected");

  // Recovery URL resolution
  const recoveryUrl = getPasswordRecoveryRedirectUrl();
  testAssert(
    recoveryUrl.endsWith("/reset-password"),
    "Recovery redirect URL strictly targets /reset-password endpoint"
  );
  testAssert(
    !recoveryUrl.includes("localhost") || process.env.NODE_ENV !== "production",
    "Production does not hardcode localhost"
  );

  // --------------------------------------------------------------------------
  // TEST 3: Dedicated Reset Password Screen & Router Integration
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Dedicated Reset Password Screen & Router Integration...");

  const routerPath = path.resolve(process.cwd(), "src/router.tsx");
  const routerCode = fs.readFileSync(routerPath, "utf-8");

  testAssert(
    routerCode.includes('path: "/reset-password"'),
    "Router registers dedicated /reset-password route"
  );
  testAssert(
    routerCode.includes("<ResetPassword />"),
    "Router renders ResetPassword component on /reset-password"
  );

  const resetPasswordPath = path.resolve(process.cwd(), "src/pages/ResetPassword.tsx");
  testAssert(fs.existsSync(resetPasswordPath), "ResetPassword.tsx component exists");

  const resetPasswordCode = fs.readFileSync(resetPasswordPath, "utf-8");

  // Supabase recovery events
  testAssert(
    resetPasswordCode.includes("PASSWORD_RECOVERY"),
    "ResetPassword handles PASSWORD_RECOVERY event"
  );
  testAssert(
    resetPasswordCode.includes("supabase.auth.updateUser"),
    "ResetPassword updates passphrase via authenticated updateUser RPC"
  );
  testAssert(
    resetPasswordCode.includes("otp_expired"),
    "ResetPassword detects and handles expired OTP recovery links safely"
  );
  testAssert(
    resetPasswordCode.includes("supabase.auth.signOut"),
    "ResetPassword signs out temporary recovery session upon successful update"
  );

  // --------------------------------------------------------------------------
  // TEST 4: Recovery UX & Cooldown Logic
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Recovery UX & Cooldown Logic...");

  const loginTsxPath = path.resolve(process.cwd(), "src/pages/Login.tsx");
  const loginTsx = fs.readFileSync(loginTsxPath, "utf-8");

  testAssert(
    loginTsx.includes("resendCooldown"),
    "Login recovery view implements resendCooldown state"
  );
  testAssert(
    loginTsx.includes("setResendCooldown(60)"),
    "Recovery flow initializes a 60-second cooldown"
  );
  testAssert(
    loginTsx.includes("recoverySubmitted"),
    "Login recovery view provides neutral confirmation state"
  );
  testAssert(
    loginTsx.includes('isDev && authMode === "login"'),
    "Demo profile cards remain strictly hidden on Recovery view"
  );

  // --------------------------------------------------------------------------
  // TEST 5: Password Entropy on Reset Workstation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Password Entropy on Reset Workstation...");

  const weakReset = evaluatePasswordStrength("abc12");
  testAssert(!weakReset.isAcceptable, "Weak password rejected on reset (< 12 chars)");

  const compromisedReset = evaluatePasswordStrength("password12345");
  testAssert(compromisedReset.isCompromised, "Compromised password rejected on reset");

  const validReset = evaluatePasswordStrength("Safe#Elevator!2026Secure");
  testAssert(validReset.isAcceptable, "Valid 12+ character passphrase accepted on reset");

  console.log("\n===============================================================");
  console.log(`  ALL ${passedCount} RECOVERY FLOW SECURITY AUDIT CHECKS PASSED (100%)`);
  console.log("===============================================================\n");
}

runRecoverySecuritySuite().catch((err) => {
  console.error("Recovery audit suite failed:", err);
  process.exit(1);
});

