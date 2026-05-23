// scripts/exportAbi.js
// Trích ABI từ artifacts/ vào abi/<Name>.json để backend nhúng dễ dàng.
// Chạy: pnpm abi:export (sau khi đã compile).

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts", "contracts");
const OUT_DIR = path.join(ROOT, "abi");

const CONTRACTS = [
  { name: "PatientRegistry", file: "core/PatientRegistry.sol/PatientRegistry.json" },
  { name: "AccessControl",   file: "access/AccessControl.sol/AccessControl.json" },
  { name: "EHR",             file: "core/EHR.sol/EHR.json" },
];

function main() {
  if (!fs.existsSync(ARTIFACTS)) {
    throw new Error("Chưa có artifacts/. Chạy `pnpm compile` trước.");
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const c of CONTRACTS) {
    const src = path.join(ARTIFACTS, c.file);
    if (!fs.existsSync(src)) {
      console.error(`✗ Không thấy ${src}`);
      continue;
    }
    const artifact = JSON.parse(fs.readFileSync(src, "utf-8"));
    const out = {
      contractName: c.name,
      abi: artifact.abi,
    };
    const dest = path.join(OUT_DIR, `${c.name}.json`);
    fs.writeFileSync(dest, JSON.stringify(out, null, 2));
    console.log(`✓ ${c.name} → abi/${c.name}.json`);
  }
}

main();
