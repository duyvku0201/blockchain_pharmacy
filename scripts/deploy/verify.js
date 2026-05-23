// scripts/deploy/verify.js
// Đọc deployments/<network>.json và verify từng contract lên Etherscan.
// Chạy: pnpm hardhat run scripts/deploy/verify.js --network sepolia

const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const network = hre.network.name;
  const file = path.join(__dirname, "..", "..", "deployments", `${network}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Không thấy ${file}. Hãy deploy trước.`);
  }
  const deployment = JSON.parse(fs.readFileSync(file, "utf-8"));

  for (const [name, info] of Object.entries(deployment.contracts)) {
    console.log(`\n>>> Verify ${name} (${info.address})`);
    try {
      await hre.run("verify:verify", {
        address: info.address,
        constructorArguments: info.args,
      });
    } catch (err) {
      if (String(err.message).toLowerCase().includes("already verified")) {
        console.log("    đã verify trước đó.");
      } else {
        console.error(`    Lỗi: ${err.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
