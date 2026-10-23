import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import fs from "fs";

const fileBuf = fs.readFileSync("public/models/elevator_rca.glb");
const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuf, "", (gltf) => {
  const scene = gltf.scene;
  let mainMesh = null;
  scene.traverse(c => { if (c.isMesh) mainMesh = c; });
  const geom = mainMesh.geometry;
  const pos = geom.attributes.position;
  
  let minY = Infinity, maxY = -Infinity;
  let minIdx = -1, maxIdx = -1;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) { minY = y; minIdx = i; }
    if (y > maxY) { maxY = y; maxIdx = i; }
  }
  console.log("Raw Min Y:", minY, "at index", minIdx, `(x=${pos.getX(minIdx)}, z=${pos.getZ(minIdx)})`);
  console.log("Raw Max Y:", maxY, "at index", maxIdx, `(x=${pos.getX(maxIdx)}, z=${pos.getZ(maxIdx)})`);
});

