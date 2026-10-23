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
  geom.computeBoundingBox();

  const bb = geom.boundingBox;
  console.log("Transformed Bounding Box:");
  console.log("X:", bb.min.x.toFixed(3), "to", bb.max.x.toFixed(3), "span:", (bb.max.x - bb.min.x).toFixed(3));
  console.log("Y:", bb.min.y.toFixed(3), "to", bb.max.y.toFixed(3), "span:", (bb.max.y - bb.min.y).toFixed(3));
  console.log("Z:", bb.min.z.toFixed(3), "to", bb.max.z.toFixed(3), "span:", (bb.max.z - bb.min.z).toFixed(3));
});

