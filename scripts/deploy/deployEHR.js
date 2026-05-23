// scripts/deploy/deployEHR.js
// Deploy riêng EHR.sol khi AccessControl đã tồn tại. Nhận địa chỉ qua env ACCESS_CONTROL.

const hre = require("hardhat");

async function main() {
  const acAddr = process.env.ACCESS_CONTROL;
  if (!acAddr) throw new Error("Set ACCESS_CONTROL env to deployed AccessControl address");

  const EHR = await hre.ethers.getContractFactory("EHR");
  const ehr = await EHR.deploy(acAddr);
  await ehr.waitForDeployment();
  console.log("EHR:", await ehr.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
