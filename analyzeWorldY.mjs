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

  const pos = geom.attributes.position;
  const index = geom.index;
  const triCount = index.count / 3;

  const slices = 10;
  const counts = new Array(slices).fill(0);
  const yMin = -0.952, yMax = 0.948;

  for (let i = 0; i < triCount; i++) {
    const yA = pos.getY(index.getX(i * 3));
    const s = Math.min(slices - 1, Math.max(0, Math.floor(((yA - yMin) / (yMax - yMin)) * slices)));
    counts[s]++;
  }

  for (let s = 0; s < slices; s++) {
    const y0 = yMin + (s * (yMax - yMin)) / slices;
    const y1 = yMin + ((s + 1) * (yMax - yMin)) / slices;
    console.log(`Slice ${s} [${y0.toFixed(2)} to ${y1.toFixed(2)}]: ${counts[s]} triangles`);
  }
});

