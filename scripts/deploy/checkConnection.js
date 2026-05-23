// scripts/deploy/checkConnection.js
// Kiểm tra kết nối Sepolia + tính hợp lệ của private key, KHÔNG in giá trị nhạy cảm.

const hre = require("hardhat");

async function main() {
  console.log(`Network: ${hre.network.name}`);
  const provider = hre.ethers.provider;

  try {
    const net = await provider.getNetwork();
    console.log(`Chain ID: ${net.chainId}`);
    console.log(`Latest block: ${await provider.getBlockNumber()}`);
  } catch (e) {
    console.error(`Không kết nối được RPC: ${e.message}`);
    return;
  }

  try {
    const signers = await hre.ethers.getSigners();
    if (signers.length === 0) {
      console.error("Không có signer (DEPLOYER_PRIVATE_KEY trống hoặc sai).");
      return;
    }
    const deployer = signers[0];
    const bal = await provider.getBalance(deployer.address);
    console.log(`Deployer address: ${deployer.address}`);
    console.log(`Deployer balance: ${hre.ethers.formatEther(bal)} ETH`);
    if (bal === 0n) {
      console.warn("⚠ Balance = 0, cần xin Sepolia ETH ở https://sepoliafaucet.com trước khi deploy.");
    } else {
      console.log("✓ Sẵn sàng deploy: pnpm deploy:sepolia");
    }
  } catch (e) {
    console.error(`Signer error: ${e.message}`);
    console.error("→ Khả năng DEPLOYER_PRIVATE_KEY trong .env sai (phải là 64 hex chars, có hoặc không có 0x prefix).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
