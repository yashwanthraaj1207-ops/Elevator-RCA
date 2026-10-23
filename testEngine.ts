// testEngine.ts – quick sanity check for SimulationEngine integration
import { useElevatorStore } from "./src/simulation/store";

function logState(prefix: string) {
  const state = useElevatorStore.getState();
  console.log(prefix, {
    time: state.time,
    running: state.running,
    activeFault: state.activeFault?.name ?? null,
    motorCurr: state.sensors["Motor Current"].readings.slice(-1)[0]?.value?.toFixed(2),
    bearingVib: state.sensors["Bearing Vibration"].readings.slice(-1)[0]?.value?.toFixed(2),
  });
}

// reset & start normal simulation
useElevatorStore.getState().resetSimulation();
useElevatorStore.getState().startSimulation();
useElevatorStore.getState().tick();
logState("after 1 tick (normal)");

// inject bearing fault
const bearingFault = {
  id: "bf1",
  name: "Bearing degradation",
  description: "Increased vibration & load",
  affectedComponent: "bearing_main",
  sensorDeltas: {
    "Bearing Vibration": 5,
    "Motor Current": 1,
    "Motor Temperature": 2,
  },
};
useElevatorStore.getState().injectFault(bearingFault);
useElevatorStore.getState().tick();
logState("after fault tick");

