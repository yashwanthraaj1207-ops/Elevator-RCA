import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import fs from "fs";

const fileBuf = fs.readFileSync("public/models/elevator_rca.glb");
const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuf, "", (gltf) => {
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 3.8 / maxDim;

  let mainMesh = null;
  scene.traverse(c => { if (c.isMesh) mainMesh = c; });
  const geom = mainMesh.geometry;
  const pos = geom.attributes.position;
  const index = geom.index;

  const yMin = -size.y * scale / 2;
  const yMax = size.y * scale / 2;
  console.log("Y Range after center & scale:", yMin.toFixed(2), "to", yMax.toFixed(2));

  // Let's divide into 10 vertical slices
  const slices = 10;
  const sliceCounts = new Array(slices).fill(0);
  const v = new THREE.Vector3();
  const triCount = index.count / 3;

  for (let i = 0; i < triCount; i++) {
    const iA = index.getX(i * 3);
    v.fromBufferAttribute(pos, iA).sub(center).multiplyScalar(scale);
    const sliceIdx = Math.min(slices - 1, Math.max(0, Math.floor(((v.y - yMin) / (yMax - yMin)) * slices)));
    sliceCounts[sliceIdx]++;
  }

  for (let s = 0; s < slices; s++) {
    const low = yMin + (s * (yMax - yMin)) / slices;
    const high = yMin + ((s + 1) * (yMax - yMin)) / slices;
    console.log(`Slice ${s} [${low.toFixed(2)} to ${high.toFixed(2)}m]: ${sliceCounts[s]} triangles`);
  }
});

