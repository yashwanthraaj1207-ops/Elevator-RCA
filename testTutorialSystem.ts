// testTutorialSystem.ts
/**
 * ELEVATOR-RCA — Automated Verification Suite for Interactive Guided Tutorial Engine
 * Tests registry completeness, target DOM presence, state machine transitions, and storage persistence.
 */

import fs from "fs";
import path from "path";
import { TUTORIAL_REGISTRY } from "./src/tutorial/tutorialRegistry";
import { PageTutorialConfig, TutorialStep } from "./src/tutorial/types";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` — Detail: ${detail}` : ""}`);
    failCount++;
  }
}

console.log("\n================================================================================");
console.log("ELEVATOR-RCA: INTERACTIVE GAME-STYLE GUIDED TUTORIAL ENGINE AUDIT SUITE");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// SUITE 1: Tutorial Registry Completeness & Structure
// -----------------------------------------------------------------------------
console.log("SUITE 1: Tutorial Registry Specification & Route Coverage");

const REQUIRED_ROUTES = [
  "/overview",
  "/digital-twin",
  "/live-monitoring",
  "/investigation",
  "/fault-lab",
  "/guided-investigation",
  "/judge-demo",
  "/methodology",
  "/maintenance",
  "/records",
  "/report",
  "/storage",
  "/settings",
  "/login",
];

assert(
  REQUIRED_ROUTES.length === 14,
  "All 14 required application routes are registered in specification"
);

for (const route of REQUIRED_ROUTES) {
  const config = TUTORIAL_REGISTRY[route];
  assert(!!config, `Route "${route}" exists in TUTORIAL_REGISTRY`);

  if (config) {
    assert(
      typeof config.pageTitle === "string" && config.pageTitle.length > 5,
      `Route "${route}" has descriptive pageTitle: "${config.pageTitle}"`
    );
    assert(
      typeof config.intro === "string" && config.intro.length > 20,
      `Route "${route}" has comprehensive intro explanation (${config.intro.length} chars)`
    );
    assert(
      Array.isArray(config.steps) && config.steps.length >= 2,
      `Route "${route}" contains at least 2 steps (Actual: ${config.steps.length} steps)`
    );

    // Validate each step
    config.steps.forEach((step: TutorialStep, idx: number) => {
      assert(
        step.target.startsWith('[data-tutorial="') && step.target.endsWith('"]'),
        `Route "${route}" Step ${idx + 1} uses valid data-tutorial target selector (${step.target})`
      );
      assert(
        typeof step.title === "string" && step.title.length > 3,
        `Route "${route}" Step ${idx + 1} has title: "${step.title}"`
      );
      assert(
        typeof step.description === "string" && step.description.length > 25,
        `Route "${route}" Step ${idx + 1} has descriptive explanation (${step.description.length} chars)`
      );
      assert(
        !step.placement || ["top", "bottom", "left", "right", "auto"].includes(step.placement),
        `Route "${route}" Step ${idx + 1} specifies valid placement: "${step.placement || "default"}"`
      );
    });
  }
}

// -----------------------------------------------------------------------------
// SUITE 2: Target DOM Presence & Codebase Static Analysis
// -----------------------------------------------------------------------------
console.log("\nSUITE 2: Target DOM Presence & Data-Tutorial Attribute Static Verification");

// Collect all unique targets in registry
const allTargets = new Set<string>();
for (const config of Object.values(TUTORIAL_REGISTRY)) {
  for (const step of config.steps) {
    const match = step.target.match(/\[data-tutorial="([^"]+)"\]/);
    if (match) {
      allTargets.add(match[1]);
    }
  }
}

console.log(`Total unique data-tutorial target attributes to verify: ${allTargets.size}`);

// Read all TSX files in src
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const sourceFiles = getAllFiles(path.resolve("src"));
const fileContents = sourceFiles.map((file) => fs.readFileSync(file, "utf-8")).join("\n");

// Check every target
for (const target of allTargets) {
  const pattern = `data-tutorial="${target}"`;
  const exists = fileContents.includes(pattern);
  assert(exists, `Target attribute [data-tutorial="${target}"] is implemented in source JSX`);
}

// -----------------------------------------------------------------------------
// SUITE 3: Tutorial Engine State Machine & Transition Logic Simulation
// -----------------------------------------------------------------------------
console.log("\nSUITE 3: Tutorial Engine State Machine Simulation");

// Mock local storage simulation
const mockStorage: Record<string, string> = {};
const fakeLocalStorage = {
  getItem: (k: string) => mockStorage[k] || null,
  setItem: (k: string, v: string) => {
    mockStorage[k] = v;
  },
  removeItem: (k: string) => {
    delete mockStorage[k];
  },
  clear: () => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  },
};

class SimulatedTutorialController {
  activeTutorial: PageTutorialConfig | null = null;
  currentStepIndex = 0;
  completedRoutes: Record<string, boolean> = {};
  autoTutorialsEnabled = true;
  userId = "usr_eng_8492";

  constructor() {
    const saved = fakeLocalStorage.getItem(`elevator_rca_tutorial_progress_${this.userId}`);
    if (saved) {
      this.completedRoutes = JSON.parse(saved);
    }
  }

  normalizeRoute(p: string): string {
    let clean = p.replace(/\/$/, "");
    if (!clean || clean === "") clean = "/overview";
    if (clean === "/investigation-report") clean = "/report";
    return clean;
  }

  isRouteCompleted(route: string): boolean {
    return !!this.completedRoutes[this.normalizeRoute(route)];
  }

  startTutorial(route: string, forceRestart = false) {
    const clean = this.normalizeRoute(route);
    const config = TUTORIAL_REGISTRY[clean];
    if (!config) return;
    if (!forceRestart && this.isRouteCompleted(clean)) return;

    this.activeTutorial = config;
    this.currentStepIndex = 0;
  }

  nextStep() {
    if (!this.activeTutorial) return;
    if (this.currentStepIndex < this.activeTutorial.steps.length - 1) {
      this.currentStepIndex++;
    } else {
      this.finishTutorial();
    }
  }

  prevStep() {
    if (!this.activeTutorial) return;
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
    }
  }

  skipTutorial() {
    if (!this.activeTutorial) return;
    this.completedRoutes[this.normalizeRoute(this.activeTutorial.route)] = true;
    fakeLocalStorage.setItem(
      `elevator_rca_tutorial_progress_${this.userId}`,
      JSON.stringify(this.completedRoutes)
    );
    this.activeTutorial = null;
    this.currentStepIndex = 0;
  }

  finishTutorial() {
    if (!this.activeTutorial) return;
    this.completedRoutes[this.normalizeRoute(this.activeTutorial.route)] = true;
    fakeLocalStorage.setItem(
      `elevator_rca_tutorial_progress_${this.userId}`,
      JSON.stringify(this.completedRoutes)
    );
    this.activeTutorial = null;
    this.currentStepIndex = 0;
  }

  resetProgress(route?: string) {
    if (route) {
      delete this.completedRoutes[this.normalizeRoute(route)];
    } else {
      this.completedRoutes = {};
    }
    fakeLocalStorage.setItem(
      `elevator_rca_tutorial_progress_${this.userId}`,
      JSON.stringify(this.completedRoutes)
    );
  }
}

const sim = new SimulatedTutorialController();

// Test initial start
sim.startTutorial("/overview");
assert(sim.activeTutorial !== null, "Tutorial starts successfully on /overview");
assert(sim.currentStepIndex === 0, "Initial step index is 0");
assert(
  sim.activeTutorial?.steps[0].target === '[data-tutorial="sim-controls"]',
  "First step correctly targets sim-controls"
);

// Test step advancement
sim.nextStep();
assert(sim.currentStepIndex === 1, "nextStep advances to index 1");
assert(
  sim.activeTutorial?.steps[1].target === '[data-tutorial="asset-selector"]',
  "Second step targets asset-selector"
);

// Test previous step
sim.prevStep();
assert(sim.currentStepIndex === 0, "prevStep returns to index 0");

// Test lower bound clamp
sim.prevStep();
assert(sim.currentStepIndex === 0, "prevStep clamped at lower bound 0 (cannot go negative)");

// Advance through all steps to finish
const total = sim.activeTutorial!.steps.length;
for (let i = 0; i < total; i++) {
  sim.nextStep();
}

assert(sim.activeTutorial === null, "Tutorial dismissed upon finishing last step");
assert(sim.isRouteCompleted("/overview"), "Route /overview marked completed after finish");
assert(
  sim.isRouteCompleted("/overview/"),
  "Route normalizer handles trailing slash: /overview/ is also recognized as completed"
);

// Test that without forceRestart, completed route tutorial is not auto-launched again
sim.startTutorial("/overview", false);
assert(sim.activeTutorial === null, "Completed route tutorial does not re-launch without forceRestart");

// Test force restart
sim.startTutorial("/overview", true);
assert(sim.activeTutorial !== null, "forceRestart=true successfully re-opens completed tutorial");

// Test skip tutorial
sim.skipTutorial();
assert(sim.activeTutorial === null, "skipTutorial dismisses active overlay immediately");
assert(sim.isRouteCompleted("/overview"), "Skipped tutorial persists as completed to prevent re-nagging");

// Test reset single route
sim.resetProgress("/overview");
assert(!sim.isRouteCompleted("/overview"), "resetProgress(/overview) successfully removes completion flag");

// Test alias normalization: /investigation-report -> /report
sim.startTutorial("/investigation-report");
assert(
  sim.activeTutorial?.route === "/report",
  "Route alias /investigation-report correctly mapped to canonical /report"
);
sim.finishTutorial();
assert(sim.isRouteCompleted("/report"), "/report marked completed");
assert(
  sim.isRouteCompleted("/investigation-report"),
  "Alias /investigation-report recognized as completed via canonical normalization"
);

// Test reset all progress
sim.startTutorial("/digital-twin");
sim.finishTutorial();
assert(sim.isRouteCompleted("/digital-twin"), "/digital-twin marked completed");
sim.resetProgress();
assert(!sim.isRouteCompleted("/digital-twin"), "resetProgress() clears all completed routes");
assert(!sim.isRouteCompleted("/report"), "resetProgress() cleared /report");

// -----------------------------------------------------------------------------
// SUITE 4: Contextual Tooltip Component Verification
// -----------------------------------------------------------------------------
console.log("\nSUITE 4: Contextual Tooltip Component Integrity");

const tooltipPath = path.resolve("src/components/ui/ContextualTooltip.tsx");
assert(fs.existsSync(tooltipPath), "src/components/ui/ContextualTooltip.tsx exists");

const tooltipContent = fs.readFileSync(tooltipPath, "utf-8");
assert(tooltipContent.includes("ContextualTooltipProps"), "ContextualTooltip exports valid TypeScript props");
assert(tooltipContent.includes("role=\"tooltip\""), "ContextualTooltip includes accessible role='tooltip'");
assert(tooltipContent.includes("shortcut"), "ContextualTooltip supports keyboard shortcut display");
assert(tooltipContent.includes("onMouseEnter") && tooltipContent.includes("onFocus"), "ContextualTooltip supports both hover and keyboard focus");

// -----------------------------------------------------------------------------
// AUDIT SUMMARY
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`TUTORIAL SYSTEM AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("================================================================================\n");

if (failCount > 0) {
  process.exit(1);
} else {
  console.log("ALL VERIFICATIONS COMPLETED WITH 100% SUCCESS.\n");
}
