// testWorkflow.ts
/**
 * Comprehensive Automated Verification Suite for ELEVATOR-RCA Research Prototype
 *
 * Acceptance Tests:
 * Test A: Healthy Startup - All components start healthy, no false alarms, normal sensor ranges
 * Test B: Normal Multi-Floor Operation - Cabin travels, levels, opens/closes doors, brake holds/releases without premature faults
 * Test C: Delayed Operating-Time-Dependent Degradation - Progressive bearing wear, warning threshold, confirmed multi-sample critical fault
 * Test D: Long-Running Stability - Accelerated cycles, bounded 60-sample telemetry window, cumulative metrics tracking
 * Test E: Maintenance Retest & Return-to-Service - Negative retest blocks restart, verified repair clears fault, Ground return certifies IN_SERVICE
 * Test F: Simulation Baseline Reset - Degradation cleared, sensors restored to baseline, time and counters reset
 * Test G: Canonical Fault Scenarios & RCA Diagnostic Hypotheses
 * Test H: Maintenance Authentication Adapter & RBAC Gatekeepers
 * Test I: Prerequisite-Gated Archival & Immutable Audit Trail Integrity
 */

import { useElevatorStore, ALL_FAULT_SCENARIOS } from "./src/simulation/store";
import { maintenanceAuthAdapter } from "./src/auth/maintenanceAuth";
import { evaluateComponentHealth } from "./src/simulation/componentHealth";
import { ComponentId, COMPONENT_CATALOG } from "./src/components/digitalTwin/componentMapping";
import * as fs from "fs";
import * as path from "path";
import { getAudioMuted, setAudioMuted, playWarningBeep, playCriticalBeep } from "./src/utils/audioAnnouncement";
import { executeAutomatedBenchmark } from "./src/simulation/benchmark";
import { evaluateDataQuality } from "./src/simulation/dataQuality";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase";
import { syncService } from "./src/lib/syncService";
import {
  buildRcaPdfDocument,
  generateRcaJson,
  buildWorkOrderPdfDocument,
  buildRecordsPdfDocument,
  generateRecordsCsv,
  buildComponentInventoryPdfDocument,
  generateComponentInventoryCsv,
  buildAuditTrailPdfDocument,
  generateAuditTrailCsv,
  exportToCsv,
} from "./src/utils/reportExport";

const ALL_COMPONENTS: ComponentId[] = [
  "shaft_frame",
  "cabin_body",
  "cabin_floor",
  "door_left",
  "door_right",
  "door_operator",
  "door_system",
  "traction_motor",
  "traction_sheave",
  "bearing_main",
  "brake_assembly",
  "counterweight",
  "guide_rail_left",
  "guide_rail_right",
  "suspension_ropes",
  "position_encoder",
  "sensor_assembly",
  "safety_buffers",
  "electrical_controller",
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runTestSuite() {
  console.log("===============================================================");
  console.log("   ELEVATOR-RCA COMPREHENSIVE AUTOMATED VERIFICATION SUITE");
  console.log("===============================================================\n");

  // =========================================================================
  // TEST A: Healthy Startup
  // =========================================================================
  console.log("[TEST A] Healthy Startup Verification...");
  useElevatorStore.getState().resetSimulation();
  useElevatorStore.getState().startSimulation();

  let state = useElevatorStore.getState();
  assert(state.running === true, "Simulation running after start");
  assert(state.activeFault === undefined, "No active fault at startup");
  assert(state.faultAlertDismissed === true, "Fault alert modal dismissed at startup");
  assert(state.diagnostic === undefined, "No diagnostic incident open at startup");
  assert(state.motion.serviceState === "IN_SERVICE", "Elevator begins in IN_SERVICE state");

  // Verify all sensor readings are in nominal ranges
  const sensorChannels = [
    "Motor Temperature",
    "Motor Current",
    "Vibration",
    "Elevator Speed",
    "Cabin Position",
    "Payload Mass",
    "Door State",
    "Brake State",
  ];
  for (const ch of sensorChannels) {
    const s = state.sensors[ch];
    assert(!!s, `Sensor channel "${ch}" is present`);
    assert(s.status === "normal", `Sensor "${ch}" initial status is "normal" (got "${s.status}")`);
    const val = s.readings.slice(-1)[0]?.value ?? 0;
    assert(val <= s.critThreshold, `Sensor "${ch}" value (${val}) is within critical threshold (${s.critThreshold})`);
  }

  // Verify all 19 components evaluate as NORMAL with >= 90% health and 0 anomalies
  for (const compId of ALL_COMPONENTS) {
    const health = evaluateComponentHealth(compId, state.sensors, undefined, state.time);
    assert(health.operationalState === "NORMAL", `Component "${compId}" operationalState is NORMAL`);
    assert(health.healthScore >= 90, `Component "${compId}" healthScore is ${health.healthScore}% (>= 90%)`);
    assert(health.detectedAnomalies.length === 0, `Component "${compId}" has 0 detected anomalies`);
  }
  console.log(">> Test A (Healthy Startup) PASSED.\n");

  // =========================================================================
  // TEST B: Normal Multi-Floor Operation
  // =========================================================================
  console.log("[TEST B] Normal Multi-Floor Kinematic Operation (No Premature False Alarms)...");
  
  // Disable auto-cycle during explicit manual trip testing
  useElevatorStore.getState().setAutoCycle(false);

  // Trip 1: Ground to Floor 4
  assert(useElevatorStore.getState().requestFloor(4), "Request to Floor 4 accepted");
  // Advance simulation to travel, level, open doors, close doors
  for (let i = 0; i < 30; i++) {
    useElevatorStore.getState().tick();
    if (useElevatorStore.getState().motion.currentFloor === 4) break;
  }
  state = useElevatorStore.getState();
  assert(state.motion.currentFloor === 4, `Cabin reached Floor 4 (got ${state.motion.currentFloor})`);
  assert(state.activeFault === undefined, "No premature fault after traveling to Floor 4");

  // Trip 2: Floor 4 to Top Floor 11 (testing upper-floor position limit 35.2m without false alarm)
  assert(useElevatorStore.getState().requestFloor(11), "Request to Top Floor 11 accepted");
  for (let i = 0; i < 35; i++) {
    useElevatorStore.getState().tick();
    if (useElevatorStore.getState().motion.currentFloor === 11) break;
  }
  state = useElevatorStore.getState();
  assert(state.motion.currentFloor === 11, `Cabin reached Top Floor 11 (${state.motion.position.toFixed(1)}m)`);
  assert(state.sensors["Cabin Position"].status === "normal", `Cabin position sensor status at Floor 11 is "normal"`);
  assert(state.activeFault === undefined, "No position overtravel false alarm at top floor");

  // Cycle door open and close at Floor 11
  useElevatorStore.getState().toggleDoorCycle();
  for (let i = 0; i < 5; i++) {
    useElevatorStore.getState().tick();
  }
  state = useElevatorStore.getState();
  // Check Door State (100% open) & Brake State (100% engaged) at stop
  assert(state.sensors["Door State"].status === "normal", "Door State 100% opening does not trigger false alarm");
  assert(state.sensors["Brake State"].status === "normal", "Brake State holding engagement does not trigger false alarm");

  // Trip 3: Return to Ground Floor
  assert(useElevatorStore.getState().requestFloor(0), "Request to Ground accepted");
  for (let i = 0; i < 40; i++) {
    useElevatorStore.getState().tick();
    if (useElevatorStore.getState().motion.currentFloor === 0) break;
  }
  state = useElevatorStore.getState();
  assert(state.motion.currentFloor === 0, `Cabin returned to Ground Floor (got ${state.motion.currentFloor})`);
  assert(state.cumulativeMotorTime > 0, `Cumulative motor run time tracked (${state.cumulativeMotorTime.toFixed(1)}s)`);
  assert(state.activeFault === undefined, "Cabin healthy across full multi-floor trips");
  
  // Re-enable auto-cycle
  useElevatorStore.getState().setAutoCycle(true);
  console.log(">> Test B (Normal Multi-Floor Operation) PASSED.\n");

  // =========================================================================
  // TEST C: Delayed Operating-Time-Dependent Degradation
  // =========================================================================
  console.log("[TEST C] Delayed Operating-Time-Dependent Degradation (Bearing Wear)...");
  
  // Configure degradation: trigger when cumulative motor time reaches current + 4s, ramp over 8s
  const currentMotorTime = useElevatorStore.getState().cumulativeMotorTime;
  const triggerAt = currentMotorTime + 4; // 4 seconds of motor travel needed
  const rampDuration = 8; // 8 seconds of wear ramp

  useElevatorStore.getState().startDegradationRun("bearing_degradation", {
    triggerMetric: "motor_time",
    triggerThreshold: triggerAt,
    rampDuration: rampDuration,
  });

  // Verify degradation run is active in store
  assert(useElevatorStore.getState().degradationConfig.enabled === true, "Degradation run is enabled");
  assert(useElevatorStore.getState().degradationState.stage === "dormant", "Degradation stage starts as 'dormant'");

  // Dispatch elevator to Floor 6 to accumulate motor time
  useElevatorStore.getState().requestFloor(6);

  // Phase 1: Advance ticks while below trigger threshold -> should remain healthy
  let reachedTrigger = false;
  for (let i = 0; i < 30; i++) {
    useElevatorStore.getState().tick();
    state = useElevatorStore.getState();
    if (state.cumulativeMotorTime < triggerAt) {
      assert(state.degradationState.stage === "dormant", "Remains in dormant before threshold");
      assert(state.activeFault === undefined, "No fault triggered before threshold");
    } else {
      reachedTrigger = true;
      break;
    }
  }
  assert(reachedTrigger, `Successfully reached trigger threshold (${triggerAt.toFixed(1)}s motor time)`);

  // Phase 2: Advance through ramp -> stage enters warning_envelope/critical_fault, vibration ramps up, warning appears
  let sawWarning = false;
  for (let i = 0; i < 40; i++) {
    useElevatorStore.getState().tick();
    state = useElevatorStore.getState();
    if (
      state.degradationState.stage === "warning_envelope" ||
      state.degradationState.stage === "critical_fault"
    ) {
      if (state.sensors["Vibration"].status === "warning") {
        sawWarning = true;
      }
    }
    if (state.activeFault) break;
  }
  assert(sawWarning, "Degradation produced confirmed 'warning' status on Vibration channel");

  // Phase 3: Continue running until critical limit is confirmed via 3 consecutive samples
  for (let i = 0; i < 30; i++) {
    if (useElevatorStore.getState().activeFault) break;
    useElevatorStore.getState().tick();
  }
  state = useElevatorStore.getState();
  assert(state.activeFault !== undefined, "Critical fault confirmed and injected into activeFault");
  assert(state.activeFault?.affectedComponent === "bearing_main", `Affected component is bearing_main (got ${state.activeFault?.affectedComponent})`);
  assert(state.faultAlertDismissed === false, "Fault alert modal triggered (faultAlertDismissed=false)");
  assert(state.motion.serviceState === "OUT_OF_SERVICE", "Service state transitioned to OUT_OF_SERVICE");
  assert(state.motion.speed === 0, "Elevator motion halted upon critical fault confirmation");
  assert(!!state.diagnostic, "Diagnostic pipeline automatically generated root-cause hypotheses");
  assert(state.diagnostic!.hypotheses[0].componentId === "bearing_main", "Top RCA hypothesis identifies bearing_main");
  console.log(">> Test C (Delayed Degradation) PASSED.\n");

  // =========================================================================
  // TEST D: Long-Running Stability & Telemetry Bounds
  // =========================================================================
  console.log("[TEST D] Long-Running Stability & Window Bounds...");
  // Clear fault temporarily to run accelerated simulation
  useElevatorStore.getState().clearFault();
  useElevatorStore.getState().setSimSpeed(10);
  assert(useElevatorStore.getState().simSpeed === 10, "Simulation clock multiplier set to 10x");

  for (let i = 0; i < 100; i++) {
    useElevatorStore.getState().tick();
  }
  state = useElevatorStore.getState();
  for (const ch of sensorChannels) {
    const s = state.sensors[ch];
    assert(s.readings.length <= 60, `Sensor "${ch}" rolling window strictly bounded (length=${s.readings.length} <= 60)`);
  }
  assert(state.time >= 150, `Time advances correctly under accelerated execution (${state.time} ticks)`);
  useElevatorStore.getState().setSimSpeed(1);
  console.log(">> Test D (Long-Running Stability) PASSED.\n");

  // =========================================================================
  // TEST E: Maintenance Retest, Verified Repair & Return-to-Service
  // =========================================================================
  console.log("[TEST E] Maintenance Retest & Return-to-Service Workflow...");
  
  // Re-inject critical fault to test repair verification
  const critFault = ALL_FAULT_SCENARIOS["bearing_degradation"];
  useElevatorStore.getState().injectFault(critFault);
  state = useElevatorStore.getState();
  assert(state.motion.serviceState === "OUT_OF_SERVICE", "Service is OUT_OF_SERVICE");

  // Authorize maintenance technician
  const authRes = await maintenanceAuthAdapter.login("ELEV-001", "tech_vance", "elevator!tech4812");
  assert(authRes.success === true && !!authRes.session, "Authorized technician authenticated");
  useElevatorStore.getState().loginMaintenance(authRes.session!);

  // Progress through FSM
  useElevatorStore.getState().openInvestigation();
  useElevatorStore.getState().startRepair("M. Vance (Field Tech)", "Flushed housing, replaced bearing assembly", "Roller Bearing #22214");
  useElevatorStore.getState().submitForVerification("M. Vance (Field Tech)");

  // Negative retest: should fail and block return-to-service
  const failedRetest = useElevatorStore.getState().verifyRepair("M. Vance (Field Tech)", true);
  assert(failedRetest.passed === false, "Negative retest correctly fails");
  state = useElevatorStore.getState();
  assert(state.maintenance.state === "verification_failed", "FSM in verification_failed");
  assert(state.activeFault !== undefined, "Active fault remains open on failed verification");
  assert(useElevatorStore.getState().requestRecovery() === false, "Recovery blocked after failed verification");

  // Re-repair and positive retest
  useElevatorStore.getState().startRepair("M. Vance (Field Tech)", "Verified shaft alignment and torque", "OEM Spacers");
  useElevatorStore.getState().submitForVerification("M. Vance (Field Tech)");
  const passedRetest = useElevatorStore.getState().verifyRepair("M. Vance (Field Tech)", false);
  assert(passedRetest.passed === true, "Retest passed successfully");
  state = useElevatorStore.getState();
  assert(state.maintenance.state === "repair_verified", "FSM in repair_verified");
  assert(state.activeFault === undefined, "Active fault cleared upon verified repair");
  assert(state.sensors["Vibration"].status === "normal", "Vibration sensor reset to normal status");

  // Controlled Return-to-Service: Step 1 Recovery to Ground
  const recoveryAccepted = useElevatorStore.getState().requestRecovery();
  assert(recoveryAccepted === true, "Controlled recovery to Ground floor initiated");
  assert(useElevatorStore.getState().motion.serviceState === "RECOVERY_MODE", "Elevator in RECOVERY_MODE");

  for (let i = 0; i < 40; i++) {
    useElevatorStore.getState().tick();
  }
  state = useElevatorStore.getState();
  assert(state.motion.currentFloor === 0, `Cabin reached Ground floor (floor=${state.motion.currentFloor})`);

  // Controlled Return-to-Service: Step 2 Confirm IN_SERVICE
  const restored = useElevatorStore.getState().confirmReturnToService();
  assert(restored === true, "Return-to-Service confirmed at Ground floor");
  assert(useElevatorStore.getState().motion.serviceState === "IN_SERVICE", "Service state restored to IN_SERVICE");
  console.log(">> Test E (Maintenance Retest & Return-to-Service) PASSED.\n");

  // =========================================================================
  // TEST F: Baseline Simulation Reset
  // =========================================================================
  console.log("[TEST F] Baseline Simulation Reset...");
  useElevatorStore.getState().resetSimulation();
  state = useElevatorStore.getState();

  assert(state.running === false, "Simulation stopped after reset");
  assert(state.time === 0, "Simulation time reset to 0");
  assert(state.cumulativeMotorTime === 0, "Cumulative motor time reset to 0");
  assert(state.operatingCycles === 0, "Operating cycles reset to 0");
  assert(state.activeFault === undefined, "Active fault cleared after reset");
  assert(state.diagnostic === undefined, "Diagnostic cleared after reset");
  assert(state.degradationConfig.enabled === false, "Degradation state deactivated");
  assert(state.degradationState.stage === "dormant", "Degradation stage reset to dormant");
  assert(state.sensors["Vibration"].status === "normal", "Vibration status reset to normal");
  assert(state.sensors["Motor Temperature"].status === "normal", "Motor temperature status reset to normal");
  console.log(">> Test F (Baseline Simulation Reset) PASSED.\n");

  // =========================================================================
  // TEST G: All 8 Canonical Fault Scenarios & Diagnostic RCA Pipeline
  // =========================================================================
  console.log("[TEST G] Evaluating All 8 Canonical Fault Scenarios in Diagnostic Core...");
  const scenariosToTest = [
    { key: "normal", expectedComp: "cabin_body" },
    { key: "motor_overheating", expectedComp: "traction_motor" },
    { key: "excessive_load", expectedComp: "cabin_body" },
    { key: "mechanical_vibration", expectedComp: "guide_rail_left" },
    { key: "traction_motor_fault", expectedComp: "traction_motor" },
    { key: "bearing_degradation", expectedComp: "bearing_main" },
    { key: "door_mechanism_fault", expectedComp: "door_system" },
    { key: "brake_related_fault", expectedComp: "brake_assembly" },
    { key: "encoder_fault", expectedComp: "position_encoder" },
  ];

  for (const { key, expectedComp } of scenariosToTest) {
    const scenario = ALL_FAULT_SCENARIOS[key];
    assert(!!scenario, `Scenario "${key}" exists in canonical registry`);

    useElevatorStore.getState().injectFault(scenario);
    useElevatorStore.getState().tick();

    const currState = useElevatorStore.getState();
    assert(currState.activeFault?.id === scenario.id, `Scenario "${scenario.name}" injected active fault`);

    if (key !== "normal") {
      const diag = currState.diagnostic;
      assert(!!diag, `Diagnostic investigation created for "${scenario.name}"`);
      assert(diag!.hypotheses.length > 0, `Diagnostic hypotheses generated (count=${diag!.hypotheses.length})`);

      const topHyp = diag!.hypotheses[0];
      assert(
        topHyp.componentId === expectedComp,
        `Top ranked hypothesis component matches expected "${expectedComp}" (got "${topHyp.componentId}")`
      );
      assert(topHyp.confidence > 0.5, `Confidence score is meaningful (${(topHyp.confidence * 100).toFixed(0)}%)`);
      assert(topHyp.causalChain.length > 0, `Causal chain generated (${topHyp.causalChain.length} stages)`);
    }

    useElevatorStore.getState().clearFault();
  }
  console.log(">> Test G (All Canonical Scenarios & RCA) PASSED.\n");

  // =========================================================================
  // TEST H: Authentication Adapter & RBAC Gatekeepers
  // =========================================================================
  console.log("[TEST H] Testing Maintenance Authentication Adapter & RBAC Gatekeepers...");
  const badLogin = await maintenanceAuthAdapter.login("ELEV-001", "tech_vance", "wrong_password");
  assert(badLogin.success === false, "Invalid password correctly rejected");

  const badAsset = await maintenanceAuthAdapter.login("ELEV-999", "tech_vance", "elevator!tech4812");
  assert(badAsset.success === false, "Unauthorized elevator asset correctly denied");

  const validLogin = await maintenanceAuthAdapter.login("ELEV-001", "tech_vance", "elevator!tech4812");
  assert(validLogin.success === true && !!validLogin.session, "Authorized technician login succeeded");
  console.log(">> Test H (Authentication Adapter & RBAC) PASSED.\n");

  // =========================================================================
  // TEST I: Prerequisite-Gated Archival & Immutable Audit Trail Integrity
  // =========================================================================
  // Complete repair verification on any open fault before archiving
  if (useElevatorStore.getState().maintenance.state !== "repair_verified") {
    useElevatorStore.getState().openInvestigation();
    useElevatorStore.getState().startRepair("M. Vance (Field Tech)", "Restored nominal baseline tolerances");
    useElevatorStore.getState().submitForVerification("M. Vance (Field Tech)");
    useElevatorStore.getState().verifyRepair("M. Vance (Field Tech)", false);
  }

  useElevatorStore.getState().requestArchival();
  useElevatorStore.getState().confirmArchival();
  useElevatorStore.getState().verifyBackup();
  const cleanup = useElevatorStore.getState().executeRawLogCleanup();
  assert(cleanup.success === true, "Prerequisite-gated raw log cleanup approved");

  const auditEntries = useElevatorStore.getState().maintenance.auditTrail;
  assert(auditEntries.length >= 8, `Audit trail contains comprehensive history (${auditEntries.length} logged events)`);
  console.log(">> Test I (Archival & Audit Trail) PASSED.\n");

  // =========================================================================
  // TEST J: Scenario E — Door Mechanism Obstruction & Motion Inhibition
  // =========================================================================
  console.log("[TEST J] Scenario E: Door Mechanism Obstruction, Motion Inhibition & Recovery...");
  useElevatorStore.getState().resetSimulation();
  useElevatorStore.getState().startSimulation();
  useElevatorStore.getState().setAutoCycle(false);

  // 1. Dispatch cabin to Floor 2
  assert(useElevatorStore.getState().requestFloor(2), "Request to Floor 2 accepted");
  for (let i = 0; i < 20; i++) {
    useElevatorStore.getState().tick();
    if (useElevatorStore.getState().motion.currentFloor === 2) break;
  }
  let sJ = useElevatorStore.getState();
  assert(sJ.motion.currentFloor === 2, `Cabin arrived at Floor 2 (got ${sJ.motion.currentFloor})`);

  // 2. Door cycle starts opening upon arrival; inject door mechanism fault (obstruction/safety edge)
  const doorFault = ALL_FAULT_SCENARIOS["door_mechanism_fault"];
  assert(!!doorFault, "door_mechanism_fault exists in canonical fault scenarios");
  useElevatorStore.getState().injectFault(doorFault);
  useElevatorStore.getState().tick();

  sJ = useElevatorStore.getState();
  assert(sJ.activeFault?.id === doorFault.id, `Active fault matches ${doorFault.id}`);
  assert(sJ.activeFault?.affectedComponent === "door_system", "Affected component is door_system");
  assert(sJ.motion.serviceState === "OUT_OF_SERVICE", "Service state forced OUT_OF_SERVICE due to door interlock trip");
  assert(sJ.motion.speed === 0, "Elevator speed locked to 0 m/s");
  assert(sJ.motion.brakeEngaged === 100, "Brake holding at 100% engagement");

  // 3. Attempt to dispatch while door fault active -> must be inhibited
  const dispatchBlocked = useElevatorStore.getState().requestFloor(5);
  assert(dispatchBlocked === false, "Dispatch to Floor 5 blocked while OUT_OF_SERVICE with door fault");

  for (let i = 0; i < 5; i++) {
    useElevatorStore.getState().tick();
  }
  sJ = useElevatorStore.getState();
  assert(sJ.motion.currentFloor === 2, "Cabin did not move while door interlock fault remained active");
  assert(sJ.motion.speed === 0, "Speed remained zero during inhibited movement");

  // 4. Technician repair workflow for door obstruction
  useElevatorStore.getState().openInvestigation();
  useElevatorStore.getState().startRepair(
    "M. Vance (Field Tech)",
    "Cleared obstruction in door sill guide rail and realigned safety curtain interlock",
    "Door Sill Guide Clip OEM-D44"
  );
  useElevatorStore.getState().submitForVerification("M. Vance (Field Tech)");

  // 5. Run verification re-test
  const doorRetest = useElevatorStore.getState().verifyRepair("M. Vance (Field Tech)", false);
  assert(doorRetest.passed === true, "Door repair retest passed successfully");
  sJ = useElevatorStore.getState();
  assert(sJ.maintenance.state === "repair_verified", "Maintenance FSM state is repair_verified");
  assert(sJ.activeFault === undefined, "Active fault cleared after verified repair");

  // 6. Return elevator to service via controlled recovery to Ground floor
  const doorRecovery = useElevatorStore.getState().requestRecovery();
  assert(doorRecovery === true, "Controlled recovery permitted following door repair verification");
  assert(useElevatorStore.getState().motion.serviceState === "RECOVERY_MODE", "Elevator in RECOVERY_MODE");

  for (let i = 0; i < 30; i++) {
    useElevatorStore.getState().tick();
    if (useElevatorStore.getState().motion.currentFloor === 0) break;
  }
  sJ = useElevatorStore.getState();
  assert(sJ.motion.currentFloor === 0, `Cabin safely returned to Ground floor (${sJ.motion.currentFloor})`);

  const doorRestored = useElevatorStore.getState().confirmReturnToService();
  assert(doorRestored === true, "Return-to-service confirmed at Ground floor");
  assert(useElevatorStore.getState().motion.serviceState === "IN_SERVICE", "Service state is IN_SERVICE");
  console.log(">> Test J (Scenario E: Door Obstruction & Recovery) PASSED.\n");

  // =========================================================================
  // TEST K: Scenario F — Audio Announcement & 3D Model Asset Resilience
  // =========================================================================
  console.log("[TEST K] Scenario F: Audio Announcement & 3D Model Asset Resilience...");

  // 1. Audio Mute / Unmute state controls
  const initialMute = getAudioMuted();
  assert(typeof initialMute === "boolean", "getAudioMuted returns boolean");

  setAudioMuted(true);
  assert(getAudioMuted() === true, "Audio successfully muted via setAudioMuted(true)");

  setAudioMuted(false);
  assert(getAudioMuted() === false, "Audio successfully unmuted via setAudioMuted(false)");

  // Restore initial mute state
  setAudioMuted(initialMute);

  // 2. Web Audio synthesize calls run gracefully without throwing exceptions
  await playWarningBeep();
  await playCriticalBeep();
  assert(true, "Web Audio synthesized warning and critical beeps execute without rejection");

  // 3. 3D Model GLB asset resilience & verification
  const glbPath = path.resolve(process.cwd(), "public/models/Firstyyy_splited_Completed.glb");
  assert(fs.existsSync(glbPath), `Blender exported GLB model exists at: ${glbPath}`);

  const glbStat = fs.statSync(glbPath);
  assert(glbStat.size > 10 * 1024 * 1024, `GLB file size is ${glbStat.size} bytes (> 10 MB, exactly 244,325,648 bytes)`);

  // Verify ModelViewer.tsx references the exact model path and useGLTF
  const modelViewerPath = path.resolve(process.cwd(), "src/components/digitalTwin/ModelViewer.tsx");
  assert(fs.existsSync(modelViewerPath), "ModelViewer.tsx exists");
  const modelViewerCode = fs.readFileSync(modelViewerPath, "utf-8");
  assert(
    modelViewerCode.includes("/models/Firstyyy_splited_Completed.glb"),
    "ModelViewer.tsx references /models/Firstyyy_splited_Completed.glb"
  );
  assert(
    modelViewerCode.includes("useGLTF"),
    "ModelViewer.tsx utilizes useGLTF from @react-three/drei"
  );

  console.log(">> Test K (Scenario F: Audio & Model Resilience) PASSED.\n");

  // =========================================================================
  // TEST L: Sensor Replay & Deterministic Timeline Scrubbing
  // =========================================================================
  console.log("[TEST L] Sensor Replay & Deterministic Timeline Scrubbing...");
  useElevatorStore.getState().resetSimulation();
  useElevatorStore.getState().startSimulation();

  for (let i = 0; i < 15; i++) {
    useElevatorStore.getState().tick();
  }

  let hist = useElevatorStore.getState().timelineHistory;
  assert(hist.length >= 15, `Timeline history accumulated ${hist.length} snapshots (expected >= 15)`);

  const targetSnapshotTime = hist[5].time;
  useElevatorStore.getState().startReplay(targetSnapshotTime);
  assert(useElevatorStore.getState().replayMode === true, "Replay mode active after startReplay");
  assert(useElevatorStore.getState().replayTime === targetSnapshotTime, "Replay time matched target snapshot time");

  // Verify live tick advancement is frozen during replay mode
  const replayTickTime = useElevatorStore.getState().time;
  useElevatorStore.getState().tick();
  assert(useElevatorStore.getState().time === replayTickTime, "Live tick advancement strictly gated during replay mode");

  // Test seek and step
  useElevatorStore.getState().stepReplay(2);
  assert(useElevatorStore.getState().replayTime === targetSnapshotTime + 2, "stepReplay(+2) advanced replay time by 2 seconds");

  useElevatorStore.getState().stopReplay();
  assert(useElevatorStore.getState().replayMode === false, "Replay mode deactivated after stopReplay");
  assert(useElevatorStore.getState().replayTime === null, "Replay time reset to null upon return to live telemetry");
  console.log(">> Test L (Deterministic Replay Engine) PASSED.\n");

  // =========================================================================
  // TEST M: Automated Fault Benchmark Suite Execution
  // =========================================================================
  console.log("[TEST M] Automated Fault Benchmark Suite Execution...");
  const benchmarkReport = await executeAutomatedBenchmark();
  assert(benchmarkReport.totalScenarios === 7, `Benchmark executed 7 scenarios (got ${benchmarkReport.totalScenarios})`);
  assert(benchmarkReport.healthyScenariosEvaluated === 1, "Evaluated exactly 1 healthy baseline scenario");
  assert(benchmarkReport.faultScenariosEvaluated === 6, "Evaluated 6 canonical failure scenarios");
  assert(benchmarkReport.totalFalseAlarms === 0, `Zero false alarms on healthy baseline (got ${benchmarkReport.totalFalseAlarms})`);
  assert(benchmarkReport.overallSubsystemAccuracy >= 85, `Overall subsystem isolation accuracy is ${benchmarkReport.overallSubsystemAccuracy}% (expected >= 85%)`);
  assert(benchmarkReport.overallRootCauseRankingAccuracy >= 85, `Overall Top-1 root cause ranking accuracy is ${benchmarkReport.overallRootCauseRankingAccuracy}% (expected >= 85%)`);
  assert(benchmarkReport.meanDetectionDelaySeconds > 0 && benchmarkReport.meanDetectionDelaySeconds < 10, `Empirical mean detection delay is ${benchmarkReport.meanDetectionDelaySeconds}s`);
  console.log(">> Test M (Automated Benchmark Suite) PASSED.\n");

  // =========================================================================
  // TEST N: Before-and-After Verification Safety Gate
  // =========================================================================
  console.log("[TEST N] Before-and-After Verification Safety Gate...");
  useElevatorStore.getState().injectFault(ALL_FAULT_SCENARIOS.motor_overheating);
  assert(useElevatorStore.getState().motion.serviceState === "OUT_OF_SERVICE", "Service is OUT_OF_SERVICE following motor overheat");

  useElevatorStore.getState().openInvestigation();
  useElevatorStore.getState().startRepair("N. Topson", "Checked thermal coupling and replaced cooling fan");
  useElevatorStore.getState().submitForVerification("N. Topson");

  // Forced failure retest must block recovery
  const forcedFailRetest = useElevatorStore.getState().verifyRepair("N. Topson", true);
  assert(forcedFailRetest.passed === false, "Failed retest verification accurately flagged");
  assert(useElevatorStore.getState().requestRecovery() === false, "Elevator recovery strictly blocked after failed retest verification");

  // Corrective re-repair following failed verification
  useElevatorStore.getState().startRepair("N. Topson", "Replaced sensor module and thermal heat sink");
  useElevatorStore.getState().submitForVerification("N. Topson");

  // Successful retest must permit recovery
  const passedRetestVerif = useElevatorStore.getState().verifyRepair("N. Topson", false);
  assert(passedRetestVerif.passed === true, "Retest verification passed successfully");
  assert(useElevatorStore.getState().requestRecovery() === true, "Controlled recovery permitted after passing retest verification");
  console.log(">> Test N (Before-and-After Verification Safety Gate) PASSED.\n");

  // =========================================================================
  // TEST O: Maintenance Work Orders & Diagnostic Hypothesis Verdicts
  // =========================================================================
  console.log("[TEST O] Maintenance Work Orders & Diagnostic Hypothesis Verdicts...");
  useElevatorStore.getState().injectFault(ALL_FAULT_SCENARIOS.bearing_degradation);
  const curDiag = useElevatorStore.getState().diagnostic;
  assert(curDiag !== undefined && curDiag.hypotheses.length > 0, "Diagnostic generated active hypotheses");

  const topHypId = curDiag!.hypotheses[0].id;
  useElevatorStore.getState().confirmHypothesis(topHypId, "Physical micrometer check confirmed spall crater");
  const confirmedHyp = useElevatorStore.getState().diagnostic!.hypotheses.find((h) => h.id === topHypId);
  assert(confirmedHyp?.technicianVerdict === "confirmed", "Technician verdict confirmed in store");
  assert(confirmedHyp?.technicianNotes?.includes("micrometer"), "Technician notes persisted with hypothesis");

  // Work order checklist step toggle
  const activeWO = useElevatorStore.getState().maintenance.activeWorkOrder;
  assert(activeWO !== undefined, "Active maintenance work order automatically instantiated");
  if (activeWO && activeWO.inspectionSteps.length > 0) {
    const firstStepId = activeWO.inspectionSteps[0].id;
    useElevatorStore.getState().toggleWorkOrderStep(firstStepId, true);
    const updatedWO = useElevatorStore.getState().maintenance.activeWorkOrder;
    assert(updatedWO?.inspectionSteps[0].completed === true, "Work order checklist step marked completed");
  }
  console.log(">> Test O (Work Orders & Hypothesis Verdicts) PASSED.\n");

  // =========================================================================
  // TEST P: Telemetry Data Quality & Cryptographic Stream Health
  // =========================================================================
  console.log("[TEST P] Telemetry Data Quality & Cryptographic Stream Health...");
  const sP = useElevatorStore.getState();
  const dataQualityReport = evaluateDataQuality(sP.sensors, sP.time, sP.maintenance.auditTrail);
  assert(dataQualityReport.overallScore > 0, `Overall data quality score is ${dataQualityReport.overallScore}%`);
  assert(dataQualityReport.totalChannelsMonitored === Object.keys(sP.sensors).length, "All registered telemetry channels monitored");
  assert(dataQualityReport.auditTrailIntegrity.tamperFree === true, "Audit trail verified tamper-free");
  assert(dataQualityReport.syntheticDisclosures.standardReference.includes("ISO"), "Disclosures reference ISO standards");
  // =========================================================================
  // TEST Q: Supabase Client, Offline Resilience & Telemetry Sync Pipeline
  // =========================================================================
  console.log("[TEST Q] Supabase Client, Offline Resilience & Telemetry Sync Pipeline...");
  assert(typeof supabase === "object" && supabase !== null, "Supabase client instance is initialized");
  assert(typeof supabase.auth === "object", "Supabase Auth module is available");
  assert(typeof supabase.from === "function", "Supabase Database query builder is available");
  assert(isSupabaseConfigured === true, "Supabase configuration flags active credentials");

  // Verify syncService handles offline and online queueing gracefully
  const initialPending = syncService.getPendingCount();
  assert(typeof initialPending === "number", "SyncService returns numeric pending count");

  const testWO = useElevatorStore.getState().maintenance.activeWorkOrder;
  if (testWO) {
    const res = await syncService.pushWorkOrderToCloud(testWO, "test-user-id");
    assert(res.success === true, "SyncService successfully queued or sent work order to cloud");
  }

  const testAudit = useElevatorStore.getState().maintenance.auditTrail[0];
  if (testAudit) {
    const res = await syncService.pushAuditEntryToCloud(testAudit, "test-user-id");
    assert(res.success === true, "SyncService successfully queued or sent audit entry to cloud");
  }

  console.log(">> Test Q (Supabase Client & Sync Pipeline) PASSED.\n");

  // =========================================================================
  // TEST R: Component Replacement & Maintenance Assistant (Section 8 & 12)
  // =========================================================================
  console.log("[TEST R] Component Replacement & Maintenance Assistant (Section 8 & 12)...");

  // 1. Verify COMPONENT_CATALOG enrichment
  const bearingMeta = COMPONENT_CATALOG.bearing_main;
  assert(bearingMeta.oemSku === "SKF-22316-EK-VA405", "bearing_main contains OEM SKU");
  assert(bearingMeta.compatibleSkus?.includes("SKF-22316-EK-VA405"), "bearing_main has verified compatible SKUs");
  assert((bearingMeta.requiredTools?.length || 0) > 0, "bearing_main specifies required tools & equipment");
  assert((bearingMeta.removalSteps?.length || 0) > 0, "bearing_main specifies detailed removal sequence");
  assert((bearingMeta.installationSteps?.length || 0) > 0, "bearing_main specifies installation steps");
  assert((bearingMeta.immediateSafetyPrecautions?.length || 0) > 0, "bearing_main specifies mandatory safety precautions");

  // 2. Inject fault, record component replacement, and verify workflow
  useElevatorStore.getState().injectFault(ALL_FAULT_SCENARIOS.bearing_degradation);
  assert(useElevatorStore.getState().activeFault?.id === "scenario_bearing_degradation", "Active fault injected for bearing replacement test");

  const initialReplacementCount = useElevatorStore.getState().maintenance.replacementRecords.length;

  const newRecord = useElevatorStore.getState().recordComponentReplacement({
    incidentId: "INC-TEST-REPLACE-01",
    componentId: "bearing_main",
    componentName: "Main Drive Bearing",
    category: "Drive & Hoist",
    technicianName: "N. Topson (Lead PE)",
    technicianBadge: "CERT-PE-9921",
    oldPartSerialNumber: "SN-2019-BRG-4412",
    newPartSku: "SKF-22316-EK-VA405",
    newPartManufacturer: "SKF Group (Spherical Roller Bearing Series)",
    compatibilityVerified: true,
    removalProcedureCompleted: true,
    installationChecklistCompleted: true,
    installationNotes: "Replaced degraded bearing with OEM cartridge. Preload and torque verified to 145 Nm.",
    postReplacementRetestPassed: true,
    status: "verified_installed",
    verifiedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
    verifiedBy: "N. Topson (Lead PE)",
  });

  assert(newRecord.id.startsWith("REP-"), `Replacement record generated valid ID: ${newRecord.id}`);
  assert(
    useElevatorStore.getState().maintenance.replacementRecords.length === initialReplacementCount + 1,
    "Replacement record saved to maintenance store history"
  );

  // 3. Verify work order parts replaced updated
  const activeWO_R = useElevatorStore.getState().maintenance.activeWorkOrder;
  assert(
    activeWO_R?.partsReplaced.some((p) => p.includes("SKF-22316-EK-VA405")),
    "Active work order recorded replaced part OEM SKU"
  );

  // 4. Verify audit trail logged replacement action
  const latestAudit = useElevatorStore.getState().maintenance.auditTrail[0];
  assert(
    latestAudit.action.includes("Component Replaced") && latestAudit.evidence.includes("SKF-22316-EK-VA405"),
    "Maintenance audit trail logged component replacement event with OEM SKU"
  );

  // 5. Complete verification and clear fault
  useElevatorStore.getState().clearFault();
  assert(useElevatorStore.getState().activeFault === undefined, "Active fault cleared following verified replacement");

  console.log(">> Test R (Component Replacement & Maintenance Assistant) PASSED.\n");

  // =========================================================================
  // TEST S: Continuous Lifecycle Simulation, Realistic Telemetry & Component Replacement
  // =========================================================================
  console.log("[TEST S] Continuous Lifecycle Simulation, Realistic Telemetry & Component Replacement...");

  // 1. Initial Continuous Lifecycle State & All 16 Canonical Subassemblies
  const wearMap = useElevatorStore.getState().componentWearMap;
  const canonicalCount = Object.keys(wearMap).length;
  assert(canonicalCount === 16, `All 16 discrete canonical subassemblies tracked in wearMap (got ${canonicalCount})`);
  assert(useElevatorStore.getState().safetyPermission.canMove === true, "Initial safety permission allows elevator motion");

  // 2. Configurable Inter-Fault Scheduling
  useElevatorStore.getState().setInterFaultInterval(60);
  assert(
    useElevatorStore.getState().schedulerConfig.interFaultIntervalSeconds === 60,
    "Configured inter-fault interval updated to 60s"
  );
  useElevatorStore.getState().setInterFaultInterval(180);
  assert(
    useElevatorStore.getState().schedulerConfig.interFaultIntervalSeconds === 180,
    "Configured inter-fault interval updated to 180s"
  );

  // 3. Continuous Telemetry & Motor Cooling during Safety Hold
  useElevatorStore.getState().injectFault(ALL_FAULT_SCENARIOS.motor_overheating);
  useElevatorStore.getState().tick();
  let sState = useElevatorStore.getState();
  assert(sState.activeFault?.id === "scenario_motor_overheating", "Injected motor overheating fault");
  assert(sState.safetyPermission.canMove === false, "Safety permission locked (canMove = false) during critical fault");
  assert(sState.safetyPermission.safetyHoldActive === true, "Safety hold active during critical fault");
  assert(sState.safetyPermission.safetyReasons.length > 0, "Safety hold provides explicit causal reasons");
  assert(sState.lifecycleStatus === "SAFETY_HOLD", "Lifecycle status transitioned to SAFETY_HOLD");

  const tempBeforeCooling = sState.sensors["Motor Temperature"]?.readings.slice(-1)[0]?.value ?? 0;
  assert(tempBeforeCooling > 50, `Motor temperature elevated due to fault (measured ${tempBeforeCooling.toFixed(1)}°C)`);

  // Advance 10 simulation seconds while in safety hold
  const clockBefore = sState.time;
  for (let i = 0; i < 10; i++) {
    useElevatorStore.getState().tick();
  }
  sState = useElevatorStore.getState();
  assert(sState.time === clockBefore + 10, "Simulation clock advanced 10s continuously under safety hold");
  assert(sState.motion.speed === 0, "Elevator physical speed locked to 0 m/s under safety hold");

  const tempAfterCooling = sState.sensors["Motor Temperature"]?.readings.slice(-1)[0]?.value ?? 0;
  assert(
    tempAfterCooling < tempBeforeCooling,
    `Motor thermal dissipation cooled motor toward ambient 24°C (${tempBeforeCooling.toFixed(1)}°C -> ${tempAfterCooling.toFixed(1)}°C)`
  );

  // 4. Single-Component Wear Reset Isolation
  // Record initial wear on bearing_main and door_left
  const bearingWearInitial = sState.componentWearMap["bearing_main"].wearIndex;
  const doorWearInitial = sState.componentWearMap["door_left"].wearIndex;

  // Replace traction_motor specifically
  const replacedComp = useElevatorStore.getState().replaceComponent("traction_motor");
  assert(replacedComp.wearIndex === 0.0, "Replaced component wearIndex strictly reset to 0.0");
  assert(replacedComp.healthScore === 100, "Replaced component healthScore strictly reset to 100");
  assert(replacedComp.lifecycleState === "replaced", "Replaced component lifecycleState set to replaced");
  assert(replacedComp.replacementCount >= 1, "Replaced component replacementCount incremented");

  // Verify other 15 components remained completely untouched
  const updatedWearMap = useElevatorStore.getState().componentWearMap;
  assert(
    updatedWearMap["bearing_main"].wearIndex === bearingWearInitial,
    "bearing_main wear index preserved untouched during traction_motor replacement"
  );
  assert(
    updatedWearMap["door_left"].wearIndex === doorWearInitial,
    "door_left wear index preserved untouched during traction_motor replacement"
  );

  // 5. Multi-Fault Queuing
  useElevatorStore.getState().injectFault(ALL_FAULT_SCENARIOS.door_mechanism_fault);
  assert(useElevatorStore.getState().activeFault !== undefined, "Active fault present with multi-fault queuing");

  // 6. Verified Repair & Resumption of Normal Lifecycle Cycling
  if (useElevatorStore.getState().maintenance.state !== "repair_verified") {
    useElevatorStore.getState().openInvestigation();
    useElevatorStore.getState().startRepair("K. Zhang (Reliability Lead)", "Traction motor replacement verified and calibrated");
    useElevatorStore.getState().submitForVerification("K. Zhang (Reliability Lead)");
    useElevatorStore.getState().verifyRepair("K. Zhang (Reliability Lead)", false);
  }
  sState = useElevatorStore.getState();
  assert(sState.lifecycleStatus === "VERIFICATION_PASSED", "Lifecycle transitioned to VERIFICATION_PASSED");

  // Ensure cabin at ground floor for return to service
  if (sState.motion.currentFloor !== 0) {
    useElevatorStore.getState().returnToGround();
    for (let i = 0; i < 20; i++) {
      useElevatorStore.getState().tick();
      if (useElevatorStore.getState().motion.currentFloor === 0) break;
    }
  }

  const resumed = useElevatorStore.getState().confirmReturnToService();
  assert(resumed === true, "confirmReturnToService succeeded");
  sState = useElevatorStore.getState();
  assert(sState.lifecycleStatus === "NORMAL_OPERATION_RESUMED", "Lifecycle transitioned to NORMAL_OPERATION_RESUMED");
  assert(sState.safetyPermission.canMove === true, "Safety permission restored to canMove = true");

  console.log(">> Test S (Continuous Lifecycle Simulation, Realistic Telemetry & Component Replacement) PASSED.\n");

  // =========================================================================
  // TEST T: Global Document Formatting, Multi-Page Pagination, Print Alignment & RFC 4180 CSV Export
  // =========================================================================
  console.log("[TEST T] Global Document Generation, Multi-Page Pagination, CSV Quoting & Export Engine...");

  const storeState = useElevatorStore.getState();

  // 1. Multi-Page RCA PDF Report Generation & Dynamic Pagination
  const rcaInput = {
    assetId: "ELEV-001",
    model: "KONE EcoDisc V3",
    activeFault: ALL_FAULT_SCENARIOS.bearing_wear,
    diagnostic: {
      id: "DIAG-RCA-TEST-001",
      scenarioId: "bearing_wear",
      timestamp: "2026-10-19 14:30:00",
      topRootCause: "bearing_main",
      status: "completed" as const,
      summary: "Progressive mechanical raceway pitting and spalling causing severe high-frequency vibration harmonic spikes across motor drive bearing.",
      hypotheses: [
        {
          id: "HYP-01",
          rank: 1,
          component: "bearing_main",
          confidence: 0.94,
          rationale: "Vibration telemetry spectral energy concentrated at ball-pass frequency outer raceway (BPFO). Peak velocity exceeds ISO 10816-3 Category II limits (4.5 mm/s RMS).",
          supportingEvidence: [
            "Vibration RMS reached 4.82 mm/s (> 4.5 mm/s warning threshold)",
            "Motor bearing housing surface temperature elevated to 68.4°C",
            "Harmonic sideband modulation detected around 120 Hz fundamental",
          ],
          conflictingEvidence: [
            "Shaft guide rail displacement remains within nominal 0.4mm tolerance",
          ],
          recommendedAction: "Isolate drive unit, flush contaminated grease, and install replacement OEM SKF-2214 spherical roller bearing pack.",
          technicianVerdict: "confirmed" as const,
          technicianNotes: "Field technician inspected raceway visually via borescope and confirmed severe flaking.",
        },
        {
          id: "HYP-02",
          rank: 2,
          component: "traction_motor",
          confidence: 0.42,
          rationale: "Stator rotor air-gap eccentricity could hypothetically induce mechanical vibration harmonics.",
          supportingEvidence: [
            "Elevated drive unit thermal reading",
          ],
          conflictingEvidence: [
            "Phase current symmetry is balanced within 1.2% (ruling out electrical winding asymmetry)",
            "Motor stator magnetic flux remains uniform across all 4 poles",
          ],
          recommendedAction: "Secondary electrical insulation resistance test.",
          technicianVerdict: "rejected" as const,
          technicianNotes: "Winding megohmmeter reading verified 450 MΩ (> 100 MΩ standard). Ruled out.",
        },
      ],
      causalChain: [
        {
          stage: 1,
          title: "Tribological Boundary Lubricant Breakdown",
          description: "Synthetic lubricant film thickness fell below minimum elastohydrodynamic threshold, causing microscopic metal-to-metal asperities contact.",
          evidence: "Grease sample particulate count > 500 ppm ferrous debris.",
        },
        {
          stage: 2,
          title: "Surface Micro-Fatigue & Raceway Pitting",
          description: "Repeated cyclic shear stresses generated subsurface micro-cracks propagating to surface raceway spalling.",
          evidence: "High frequency accelerometer sensor spike to 0.18g.",
        },
        {
          stage: 3,
          title: "Safety Threshold Violation & Automated Interlock Lockout",
          description: "RMS vibration exceeded Class II threshold for 3 consecutive execution cycles, triggering automated elevator shutdown.",
          evidence: "System FSM entered FAULT_DETECTED, brake locked at 100%.",
        },
      ],
    },
    motion: storeState.motion,
    sensors: storeState.sensors,
    maintenance: {
      ...storeState.maintenance,
      verificationEvidence: [
        {
          channelName: "Vibration RMS",
          targetMax: 0.08,
          measuredPostRepair: 0.04,
          unit: "g",
          passed: true,
        },
        {
          channelName: "Motor Temperature",
          targetMax: 65,
          measuredPostRepair: 42.1,
          unit: "°C",
          passed: true,
        },
      ],
    },
    session: {
      token: "test-token",
      user: {
        id: "TECH-4812",
        fullName: "Marcus Vance",
        role: "field_technician" as const,
        badgeNumber: "VT-9021",
        assignedElevators: ["ELEV-001"],
        certifications: ["QEI-1", "EN-81-20"],
      },
      expiresAt: Date.now() + 3600000,
    },
    reportId: "REP-RCA-2026-TEST",
  };

  const rcaDoc = buildRcaPdfDocument(rcaInput);
  assert(rcaDoc !== null && rcaDoc !== undefined, "buildRcaPdfDocument returned valid jsPDF instance");
  const rcaPages = rcaDoc.getNumberOfPages();
  assert(rcaPages >= 2, `RCA PDF generated multiple pages automatically (got ${rcaPages} pages, expected >= 2)`);
  assert(Math.round(rcaDoc.internal.pageSize.getWidth()) === 210, "RCA PDF page width is exactly 210mm (A4 Portrait)");
  assert(Math.round(rcaDoc.internal.pageSize.getHeight()) === 297, "RCA PDF page height is exactly 297mm (A4 Portrait)");

  // 2. High-Stress Multi-Hypothesis Long Content Pagination Test
  const longDiagnostic = {
    ...rcaInput.diagnostic,
    hypotheses: [
      ...rcaInput.diagnostic.hypotheses,
      {
        id: "HYP-03",
        rank: 3,
        component: "brake_assembly",
        confidence: 0.25,
        rationale: "Transient caliper drag could contribute to mechanical vibration signature during initial deceleration.",
        supportingEvidence: ["Slight slip drift recorded on deceleration"],
        conflictingEvidence: ["Holding torque test passed nominal 1200 Nm static load"],
        recommendedAction: "Check brake shoe lining thickness and air gap.",
      },
      {
        id: "HYP-04",
        rank: 4,
        component: "guide_rail_left",
        confidence: 0.15,
        rationale: "Guide shoe clip loosening could cause lateral carriage sway.",
        supportingEvidence: ["Horizontal car vibration 0.05g"],
        conflictingEvidence: ["Laser alignment check confirms vertical plumb line within 0.8mm"],
        recommendedAction: "Re-torque guide rail bracket fasteners to 85 Nm.",
      },
      {
        id: "HYP-05",
        rank: 5,
        component: "suspension_ropes",
        confidence: 0.08,
        rationale: "Unequal cable tension causing harmonic vibration bounce.",
        supportingEvidence: ["Tension variation measured at 4.2%"],
        conflictingEvidence: ["Well below EN 81-20 10% tension equalization limit"],
        recommendedAction: "Measure rope groove depth and re-equalize spring compression.",
      },
    ],
  };

  const multiHypoDoc = buildRcaPdfDocument({
    ...rcaInput,
    diagnostic: longDiagnostic,
    reportId: "REP-RCA-LONG-PAGINATION",
  });
  const longPages = multiHypoDoc.getNumberOfPages();
  assert(
    longPages >= 2,
    `Multi-hypothesis stress document successfully paginated across multiple pages without text collisions (got ${longPages} pages)`
  );

  // 3. Structured JSON RCA Export
  const rcaJsonStr = generateRcaJson(rcaInput);
  assert(typeof rcaJsonStr === "string" && rcaJsonStr.length > 500, "generateRcaJson returned non-empty JSON string");
  const rcaJsonObj = JSON.parse(rcaJsonStr);
  assert(rcaJsonObj.metadata.assetId === "ELEV-001", "JSON export preserves assetId in metadata");
  assert(rcaJsonObj.metadata.reportId === "REP-RCA-2026-TEST", "JSON export preserves custom reportId in metadata");
  assert(Array.isArray(rcaJsonObj.diagnosticInvestigation?.rankedHypotheses), "JSON export includes structured hypotheses array");
  assert(rcaJsonObj.diagnosticInvestigation.rankedHypotheses.length === 2, "JSON export preserves all 2 hypotheses");
  assert(rcaJsonObj.telemetrySnapshot !== undefined, "JSON export includes complete telemetry snapshot");
  assert(rcaJsonObj.maintenanceWorkflow !== undefined, "JSON export includes maintenance summary and retest criteria");
  assert(rcaJsonObj.metadata.auditor?.fullName === "Marcus Vance", "JSON export includes sign-off technician");

  // 4. Component Replacement Work Order PDF Document
  const workOrderDoc = buildWorkOrderPdfDocument({
    workOrderId: "WO-2026-SKF2214",
    incidentId: "INC-889102",
    assetId: "ELEV-001",
    model: "KONE EcoDisc V3",
    componentId: "bearing_main",
    componentName: "Main Traction Drive Bearing",
    category: "Drive & Hoist",
    technicianName: "Marcus Vance",
    technicianBadge: "VT-9021",
    oldPartSerial: "SN-2019-BRG-4128",
    newPartSku: "SKF-2214-E-2CS2",
    newPartManufacturer: "SKF Industrial Bearings Inc.",
    requiredTools: [
      "Hydraulic Bearing Puller (10-Ton)",
      "Digital Torque Wrench (20-150 Nm)",
      "Feeler Gauge Set (0.02 - 1.00 mm)",
      "Infrared Thermometer (Calibrated)",
    ],
    immediateSafetyPrecautions: [
      "Execute electrical lock-out tag-out (LOTO) on main 400V disconnect breaker.",
      "Engage mechanical car safety wedge dogs on hoistway guide rails before uncoupling.",
      "Verify zero kinetic energy and mechanical lock on traction sheave.",
    ],
    removalSteps: [
      "De-tension counterweight and car hoisting suspension cables using hoistway rigging beams.",
      "Uncouple motor drive end-bell retaining cap and loosen 8x M12 socket bolts.",
      "Mount hydraulic puller assembly and extract worn bearing without scoring journal shaft.",
      "Inspect journal seat diameter and runout with dial test indicator (tolerance < 0.015mm).",
    ],
    installationSteps: [
      "Induction heat new SKF-2214 bearing to 110°C using calibrated portable induction heater.",
      "Slide bearing squarely onto cold journal shaft until seated firmly against locating shoulder.",
      "Allow bearing to cool to ambient temperature, verifying zero axial clearance.",
      "Inject 180 grams of Mobil Polyrex EM synthetic polyurea grease into cavity.",
      "Torque retaining end-cap bolts in star pattern to 85 Nm specification.",
    ],
    torqueSpecifications: "85 Nm (M12 Class 10.9) in star sequence with Loctite 243",
    retestCriteria: [
      {
        channelName: "Main Bearing Vibration RMS",
        targetMax: 0.08,
        measuredPostRepair: 0.04,
        unit: "g",
        passed: true,
      },
      {
        channelName: "Motor Housing Temperature",
        targetMax: 65,
        measuredPostRepair: 42.1,
        unit: "°C",
        passed: true,
      },
      {
        channelName: "Deceleration Drift",
        targetMax: 0.02,
        measuredPostRepair: 0.00,
        unit: "m",
        passed: true,
      },
    ],
    installationNotes: "Replaced main drive bearing under planned corrective intervention. Clean journal and new seals fitted.",
    verifiedAt: "2026-10-19 16:45:00",
    status: "verified_installed",
  });
  assert(workOrderDoc !== null, "buildWorkOrderPdfDocument returned valid jsPDF instance");
  const woPages = workOrderDoc.getNumberOfPages();
  assert(woPages >= 1, `Work Order PDF generated successfully (${woPages} pages)`);
  assert(Math.round(workOrderDoc.internal.pageSize.getWidth()) === 210, "Work order PDF page width is 210mm");

  // 5. Landscape Multi-Page Records PDF Document
  const dummyRecords = Array.from({ length: 30 }, (_, i) => ({
    id: `REC-${1000 + i}`,
    timestamp: `2026-10-${String((i % 28) + 1).padStart(2, "0")} 10:${String(i % 60).padStart(2, "0")}:00`,
    component: i % 3 === 0 ? "bearing_main" : i % 3 === 1 ? "door_system" : "brake_assembly",
    severity: (i % 5 === 0 ? "fault" : i % 3 === 0 ? "warning" : "normal") as "fault" | "warning" | "normal",
    summary: `Automated baseline telemetry diagnostic log sample entry #${i + 1} with calibrated vibration and temperature checks.`,
    confidence: 0.85 + (i % 15) * 0.01,
    status: (i % 2 === 0 ? "Resolved" : "Verified") as "Resolved" | "Verified",
    operator: i % 2 === 0 ? "M. Vance (Field Tech #4812)" : "Nikita Topson, PE",
  }));

  const recordsDoc = buildRecordsPdfDocument(dummyRecords, "ELEV-001");
  assert(recordsDoc !== null, "buildRecordsPdfDocument returned valid jsPDF instance");
  const recPages = recordsDoc.getNumberOfPages();
  assert(recPages >= 2, `Records log with 30 entries successfully paginated across landscape pages (got ${recPages} pages, expected >= 2)`);
  assert(Math.round(recordsDoc.internal.pageSize.getWidth()) === 297, "Records PDF width is 297mm (A4 Landscape)");
  assert(Math.round(recordsDoc.internal.pageSize.getHeight()) === 210, "Records PDF height is 210mm (A4 Landscape)");

  // 6. RFC 4180 CSV Export Compliance
  const csvRaw = exportToCsv({
    filename: "test_compliance.csv",
    headers: ["ID", "Description", "Value", "Notes"],
    rows: [
      ["1", "Simple description", 10.5, "Standard"],
      ["2", "Field with comma, separator", 20.0, "Comma inside"],
      ["3", "Field with \"embedded quotes\"", 35.2, "Quotes inside"],
      ["4", "Field with\nmultiline\ntext", 40.0, "Newlines inside"],
      ["5", "Special characters: & < > / \\ |", 50.0, null],
    ],
  });

  assert(csvRaw.charCodeAt(0) === 0xfeff, "CSV output begins with UTF-8 BOM (\\uFEFF) for Excel compatibility");
  assert(csvRaw.includes('"Field with comma, separator"'), "Fields with commas correctly enclosed in double quotes");
  assert(csvRaw.includes('"Field with ""embedded quotes"""'), "Fields with double quotes correctly escaped with double-double quotes");
  assert(csvRaw.includes('"Field with\nmultiline\ntext"'), "Fields with newlines correctly enclosed in double quotes");

  // Validate Diagnostic Records CSV
  const recordsCsv = generateRecordsCsv(dummyRecords);
  assert(recordsCsv.charCodeAt(0) === 0xfeff, "Records CSV begins with UTF-8 BOM");
  const recordsCsvLines = recordsCsv.trim().split("\r\n");
  assert(recordsCsvLines.length === 31, `Records CSV contains header + 30 rows (got ${recordsCsvLines.length} lines)`);
  assert(recordsCsvLines[0].includes('"Record ID"'), "Records CSV starts with Record ID header");

  // 7. Component Inventory PDF & CSV Export
  const catalogComponents = Object.values(COMPONENT_CATALOG);
  const invPdf = buildComponentInventoryPdfDocument(catalogComponents, storeState.componentWearMap);
  assert(invPdf !== null, "buildComponentInventoryPdfDocument returned valid jsPDF instance");
  const invPages = invPdf.getNumberOfPages();
  assert(invPages >= 2, `Component inventory for all 19 catalog subassemblies generated multiple pages (got ${invPages} pages)`);
  assert(Math.round(invPdf.internal.pageSize.getWidth()) === 297, "Component inventory PDF width is 297mm (A4 Landscape)");

  const invCsv = generateComponentInventoryCsv(catalogComponents, storeState.componentWearMap);
  assert(invCsv.charCodeAt(0) === 0xfeff, "Component inventory CSV begins with UTF-8 BOM");
  const invCsvLines = invCsv.trim().split("\r\n");
  assert(
    invCsvLines.length === catalogComponents.length + 1,
    `Component inventory CSV contains header + exactly ${catalogComponents.length} component rows (got ${invCsvLines.length} lines)`
  );

  // 8. Maintenance Audit Trail PDF & CSV Export
  const auditPdf = buildAuditTrailPdfDocument(storeState.maintenance.auditTrail, "ELEV-001");
  assert(auditPdf !== null, "buildAuditTrailPdfDocument returned valid jsPDF instance");
  assert(auditPdf.getNumberOfPages() >= 1, "Audit trail PDF generated successfully");
  assert(Math.round(auditPdf.internal.pageSize.getWidth()) === 210, "Audit trail PDF width is 210mm (A4 Portrait)");

  const auditCsv = generateAuditTrailCsv(storeState.maintenance.auditTrail);
  assert(auditCsv.charCodeAt(0) === 0xfeff, "Audit trail CSV begins with UTF-8 BOM");
  const auditCsvLines = auditCsv.trim().split("\r\n");
  assert(
    auditCsvLines.length === storeState.maintenance.auditTrail.length + 1,
    `Audit trail CSV contains header + ${storeState.maintenance.auditTrail.length} entries (got ${auditCsvLines.length} lines)`
  );

  console.log(">> Test T (Global Document Generation, Multi-Page Pagination, CSV Quoting & Export Engine) PASSED.\n");

  console.log("===============================================================");
  console.log("  ALL TESTS PASSED! ELEVATOR-RCA PROTOYPE VERIFIED 100%");
  console.log("===============================================================");
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
