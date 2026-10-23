import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import fs from "fs";

const fileBuf = fs.readFileSync("public/models/elevator_rca.glb");
const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuf, "", (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  let mainMesh = null;
  scene.traverse(c => { if (c.isMesh) mainMesh = c; });

  const geom = mainMesh.geometry.clone();
  geom.applyMatrix4(mainMesh.matrixWorld);

  const box = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z);
  const scale = 3.8 / maxDim;

  const pos = geom.attributes.position;
  const index = geom.index;
  const triCount = index ? index.count / 3 : pos.count / 3;

  function classifyTriangle(x, y, z) {
    // 1. Top machine room (y >= 1.15m)
    if (y >= 1.15) {
      if (x > 0.18) return "bearing_main";
      if (x < -0.18) return "brake_assembly";
      return "traction_motor";
    }

    // 2. Vertical guide rails (sides |x| >= 0.46)
    if (x < -0.46) return "guide_rail_left";
    if (x > 0.46) return "guide_rail_right";

    // 3. Counterweight (rear z <= -0.28, below machine room)
    if (z <= -0.28 && y < 1.0) return "counterweight";

    // 4. Car door system (front z >= 0.22, within entrance)
    if (z >= 0.22 && Math.abs(x) <= 0.42 && y >= -1.25 && y <= 0.9) return "door_system";

    // 5. Main cabin body
    if (y >= -1.25 && y <= 1.05 && Math.abs(x) <= 0.46 && z > -0.28 && z < 0.22) return "cabin_body";

    // 6. Base frame & pit
    return "frame_structure";
  }

  const counts = {
    bearing_main: 0,
    brake_assembly: 0,
    traction_motor: 0,
    door_system: 0,
    cabin_body: 0,
    counterweight: 0,
    guide_rail_left: 0,
    guide_rail_right: 0,
    frame_structure: 0,
  };

  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), centroid = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    const idxA = index.getX(i * 3);
    const idxB = index.getX(i * 3 + 1);
    const idxC = index.getX(i * 3 + 2);

    vA.fromBufferAttribute(pos, idxA).sub(center).multiplyScalar(scale);
    vB.fromBufferAttribute(pos, idxB).sub(center).multiplyScalar(scale);
    vC.fromBufferAttribute(pos, idxC).sub(center).multiplyScalar(scale);
    centroid.addVectors(vA, vB).add(vC).divideScalar(3);

    const comp = classifyTriangle(centroid.x, centroid.y, centroid.z);
    counts[comp]++;
  }

  console.log("=== CALIBRATED SPATIAL GEOMETRY SEGMENTATION ===");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`- ${k.padEnd(18)}: ${v.toString().padStart(6)} triangles (${((v / triCount) * 100).toFixed(1)}%)`);
  }
});

