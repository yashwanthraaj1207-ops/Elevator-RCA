// testSegmentation.mjs
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import fs from "fs";

// Load GLB file using Three.js in Node
const fileBuf = fs.readFileSync("public/models/elevator_rca.glb");
const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);

const loader = new GLTFLoader();
loader.parse(
  arrayBuf,
  "",
  (gltf) => {
    const rawScene = gltf.scene;
    console.log("Parsed scene successfully!");
    
    // Auto-center and normalize bounds
    const box = new THREE.Box3().setFromObject(rawScene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 3.8 / maxDim : 1;

    console.log("Original Center:", center);
    console.log("Original Size:", size);
    console.log("Scale Factor:", scale);

    let mainMesh = null;
    rawScene.traverse((child) => {
      if (child.isMesh) {
        mainMesh = child;
      }
    });

    if (!mainMesh) {
      console.error("No mesh found!");
      return;
    }

    const geom = mainMesh.geometry;
    console.log("Geometry attributes:", Object.keys(geom.attributes));
    const pos = geom.attributes.position;
    const index = geom.index;
    console.log("Vertices:", pos.count);
    console.log("Indices:", index ? index.count : "non-indexed");

    // Test spatial bounds of triangles
    const triangleCount = index ? index.count / 3 : pos.count / 3;
    console.log("Total Triangles:", triangleCount);

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const centroid = new THREE.Vector3();

    const counts = {
      traction_motor: 0,
      bearing_main: 0,
      brake_assembly: 0,
      door_system: 0,
      cabin_body: 0,
      guide_rails: 0,
      counterweight: 0,
      frame_structure: 0,
    };

    for (let i = 0; i < triangleCount; i++) {
      let iA = i * 3, iB = i * 3 + 1, iC = i * 3 + 2;
      if (index) {
        iA = index.getX(iA);
        iB = index.getX(iB);
        iC = index.getX(iC);
      }
      vA.fromBufferAttribute(pos, iA).sub(center).multiplyScalar(scale);
      vB.fromBufferAttribute(pos, iB).sub(center).multiplyScalar(scale);
      vC.fromBufferAttribute(pos, iC).sub(center).multiplyScalar(scale);
      centroid.addVectors(vA, vB).add(vC).divideScalar(3);

      const { x, y, z } = centroid;

      if (y >= 1.2) {
        if (x > 0.28) counts.bearing_main++;
        else if (x < -0.28) counts.brake_assembly++;
        else counts.traction_motor++;
      } else if (Math.abs(x) > 0.82) {
        counts.guide_rails++;
      } else if (z < -0.58 && y < 0.8) {
        counts.counterweight++;
      } else if (z > 0.52 && y >= -1.2 && y <= 0.8 && Math.abs(x) < 0.6) {
        counts.door_system++;
      } else if (y >= -1.3 && y <= 1.0 && Math.abs(x) <= 0.8 && Math.abs(z) <= 0.75) {
        counts.cabin_body++;
      } else {
        counts.frame_structure++;
      }
    }

    console.log("\n=== SPATIAL GEOMETRY SEGMENTATION RESULTS ===");
    for (const [comp, count] of Object.entries(counts)) {
      console.log(`- ${comp.padEnd(16)}: ${count} triangles (${((count / triangleCount) * 100).toFixed(1)}%)`);
    }
  },
  (err) => console.error("Error parsing GLB:", err)
);

