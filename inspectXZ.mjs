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

  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), centroid = new THREE.Vector3();
  let maxAbsX = 0, maxAbsZ = 0;
  let frontTriangles = 0;

  for (let i = 0; i < triCount; i++) {
    const idxA = index.getX(i * 3);
    const idxB = index.getX(i * 3 + 1);
    const idxC = index.getX(i * 3 + 2);
    vA.fromBufferAttribute(pos, idxA).sub(center).multiplyScalar(scale);
    vB.fromBufferAttribute(pos, idxB).sub(center).multiplyScalar(scale);
    vC.fromBufferAttribute(pos, idxC).sub(center).multiplyScalar(scale);
    centroid.addVectors(vA, vB).add(vC).divideScalar(3);

    if (Math.abs(centroid.x) > maxAbsX) maxAbsX = Math.abs(centroid.x);
    if (Math.abs(centroid.z) > maxAbsZ) maxAbsZ = Math.abs(centroid.z);
    if (centroid.z > 0.25 && centroid.y < 1.0) frontTriangles++;
  }

  console.log("Max |X| centroid:", maxAbsX.toFixed(3));
  console.log("Max |Z| centroid:", maxAbsZ.toFixed(3));
  console.log("Front triangles (Z > 0.25):", frontTriangles);
});

