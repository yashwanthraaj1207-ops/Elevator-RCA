import fs from "fs";

const buf = fs.readFileSync("public/models/elevator_rca.glb");
const jsonLen = buf.readUInt32LE(12);
const jsonBuf = buf.subarray(20, 20 + jsonLen);
const gltf = JSON.parse(jsonBuf.toString("utf8"));

console.log("Accessors:", gltf.accessors?.length);
const posAccessor = gltf.accessors[0]; // usually POSITION
console.log("Position Accessor min/max:", posAccessor.min, posAccessor.max);
console.log("Position Accessor count:", posAccessor.count, "type:", posAccessor.type);

// Let's check bufferViews
console.log("BufferViews count:", gltf.bufferViews?.length);

