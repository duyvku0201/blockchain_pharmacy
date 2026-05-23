// scripts/deploy/deployAll.js
// Deploy 3 contract + lưu addresses vào deployments/<network>.json để verify đọc lại.

const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  console.log(`\n>>> Deploying to network: ${network}`);
  console.log(`>>> Deployer: ${deployer.address}`);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`>>> Balance:  ${hre.ethers.formatEther(bal)} ETH\n`);

  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const patientRegistry = await PatientRegistry.deploy();
  await patientRegistry.waitForDeployment();
  const patientRegistryAddr = await patientRegistry.getAddress();
  console.log(`PatientRegistry: ${patientRegistryAddr}`);

  const AccessControl = await hre.ethers.getContractFactory("AccessControl");
  const accessControl = await AccessControl.deploy();
  await accessControl.waitForDeployment();
  const accessControlAddr = await accessControl.getAddress();
  console.log(`AccessControl:   ${accessControlAddr}`);

  const EHR = await hre.ethers.getContractFactory("EHR");
  const ehr = await EHR.deploy(accessControlAddr);
  await ehr.waitForDeployment();
  const ehrAddr = await ehr.getAddress();
  console.log(`EHR:             ${ehrAddr}\n`);

  // Lưu addresses ra file để verify đọc lại
  const out = {
    network,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      PatientRegistry: { address: patientRegistryAddr, args: [] },
      AccessControl: { address: accessControlAddr, args: [] },
      EHR: { address: ehrAddr, args: [accessControlAddr] },
    },
  };
  const outDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`>>> Lưu addresses tại: ${outPath}`);

  if (network === "sepolia") {
    console.log("\n>>> Xem trên Etherscan:");
    console.log(`    PatientRegistry: https://sepolia.etherscan.io/address/${patientRegistryAddr}`);
    console.log(`    AccessControl:   https://sepolia.etherscan.io/address/${accessControlAddr}`);
    console.log(`    EHR:             https://sepolia.etherscan.io/address/${ehrAddr}`);
    console.log("\n>>> Verify (sau khi đợi vài block):");
    console.log("    pnpm verify:sepolia");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
