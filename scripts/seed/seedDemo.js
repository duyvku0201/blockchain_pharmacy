// scripts/seed/seedDemo.js
// End-to-end demo trên Sepolia + Pinata:
//   1. Deployer (Admin) gán Doctor role cho 1 account
//   2. Patient account tự register
//   3. Doctor mã hoá payload + upload Pinata + createEHR onchain
//   4. Patient grant access cho doctor
//   5. Doctor đọc + decrypt thành công
//   6. Doctor update EHR (version 2) → audit event ghi nhận
//
// Cần trong .env:
//   - DEPLOYER_PRIVATE_KEY    (admin, đã có)
//   - DOCTOR_PRIVATE_KEY      (ví doctor riêng)
//   - PATIENT_PRIVATE_KEY     (ví patient riêng)
//   - PINATA_JWT
//   - IPFS_PROVIDER=pinata
//
// Chạy: pnpm hardhat run scripts/seed/seedDemo.js --network sepolia

const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const ipfs = require("../../utils/ipfs");
const {
  generateRsaKeyPair,
  encryptForRecipient,
  decryptForRecipient,
} = require("../../utils/encryption");

const ROLE = { None: 0, Patient: 1, Doctor: 2, Admin: 3 };

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu ${name} trong .env`);
  return v;
}

async function main() {
  // ----- Setup providers/wallets -----
  const provider = hre.ethers.provider;
  const adminPk = requireEnv("DEPLOYER_PRIVATE_KEY");
  const doctorPk = requireEnv("DOCTOR_PRIVATE_KEY");
  const patientPk = requireEnv("PATIENT_PRIVATE_KEY");

  const admin = new hre.ethers.Wallet(adminPk, provider);
  const doctor = new hre.ethers.Wallet(doctorPk, provider);
  const patient = new hre.ethers.Wallet(patientPk, provider);

  console.log("=== Wallets ===");
  console.log("Admin  :", admin.address);
  console.log("Doctor :", doctor.address);
  console.log("Patient:", patient.address);

  for (const [name, w] of [["admin", admin], ["doctor", doctor], ["patient", patient]]) {
    const bal = await provider.getBalance(w.address);
    console.log(`  ${name} balance: ${hre.ethers.formatEther(bal)} ETH`);
    if (bal === 0n) {
      throw new Error(`${name} balance = 0. Faucet trước: https://sepoliafaucet.com`);
    }
  }

  // ----- Load contracts từ deployments/sepolia.json -----
  const deploymentsPath = path.join(__dirname, "..", "..", "deployments", "sepolia.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
  const acAddr = deployment.contracts.AccessControl.address;
  const ehrAddr = deployment.contracts.EHR.address;
  const prAddr = deployment.contracts.PatientRegistry.address;

  const ac = await hre.ethers.getContractAt("AccessControl", acAddr);
  const ehr = await hre.ethers.getContractAt("EHR", ehrAddr);
  const pr = await hre.ethers.getContractAt("PatientRegistry", prAddr);

  console.log("\n=== Contracts ===");
  console.log("PatientRegistry:", prAddr);
  console.log("AccessControl: ", acAddr);
  console.log("EHR:           ", ehrAddr);

  // ----- Step 1: Admin assign Doctor role (nếu chưa) -----
  console.log("\n=== [1] Assign Doctor role ===");
  const doctorRole = await ac.roleOf(doctor.address);
  if (doctorRole === BigInt(ROLE.Doctor)) {
    console.log("Doctor role đã tồn tại, skip.");
  } else if (doctorRole !== BigInt(ROLE.None)) {
    throw new Error(`Doctor address đã có role khác: ${doctorRole}`);
  } else {
    const tx = await ac.connect(admin).assignRole(doctor.address, ROLE.Doctor);
    const rc = await tx.wait();
    console.log(`assignRole tx: ${rc.hash}`);
  }

  // ----- Step 2: Patient self-register -----
  console.log("\n=== [2] Patient register ===");
  const patientRole = await ac.roleOf(patient.address);
  if (patientRole === BigInt(ROLE.Patient)) {
    console.log("Patient đã register, skip.");
  } else if (patientRole !== BigInt(ROLE.None)) {
    throw new Error(`Patient address đã có role khác: ${patientRole}`);
  } else {
    const tx = await ac.connect(patient).registerAsPatient();
    const rc = await tx.wait();
    console.log(`registerAsPatient tx: ${rc.hash}`);
  }

  // ----- Step 2b: PatientRegistry profile + public key -----
  console.log("\n=== [2b] Patient lưu public key vào PatientRegistry ===");
  // Sinh cặp RSA cho patient (trong thực tế lưu privateKey ở wallet/ KMS bệnh nhân)
  const patientKeys = generateRsaKeyPair();
  console.log("Patient RSA keypair generated (privateKey giữ off-chain).");

  const isReg = await pr.isRegistered(patient.address);
  if (!isReg) {
    // Profile rỗng - chỉ demo, thật sự nên upload profile encrypted lên IPFS trước
    const dummyProfile = Buffer.from(JSON.stringify({ name: "Patient demo", dob: "2000-01-01" }));
    const profileCid = await ipfs.add(dummyProfile);
    console.log(`Profile CID: ${profileCid}`);
    const tx = await pr.connect(patient).register(profileCid, patientKeys.publicKey);
    const rc = await tx.wait();
    console.log(`PatientRegistry.register tx: ${rc.hash}`);
  } else {
    console.log("Patient đã trong PatientRegistry, skip register profile.");
  }

  // ----- Step 3: Doctor tạo EHR (mã hoá + upload IPFS + onchain) -----
  console.log("\n=== [3] Doctor tạo EHR ===");
  const medicalData = {
    visitDate: new Date().toISOString(),
    diagnosis: "Viêm họng cấp",
    symptoms: ["sốt 38.5", "ho khan", "đau họng"],
    prescription: [
      { drug: "Paracetamol 500mg", dosage: "1 viên x 3 lần/ngày" },
      { drug: "Strepsil",          dosage: "ngậm khi đau" },
    ],
    doctorNote: "Theo dõi nhiệt độ, tái khám sau 5 ngày nếu không đỡ",
  };

  // Mã hoá bằng AES, wrap symmetric key bằng RSA public key của PATIENT
  // (patient là chủ dữ liệu, có thể re-wrap cho doctor khác sau)
  const payload = Buffer.from(JSON.stringify(medicalData, null, 2));
  const { blob, keyCipher } = encryptForRecipient(payload, patientKeys.publicKey);
  console.log(`Plaintext: ${payload.length} bytes → Encrypted blob: ${blob.length} bytes`);

  // Upload encrypted blob lên Pinata
  const cid = await ipfs.add(blob, { name: `ehr-${Date.now()}.bin` });
  console.log(`IPFS CID: ${cid}`);
  console.log(`Gateway: ${ipfs.gatewayUrl(cid)}`);

  // Gọi createEHR onchain
  const txCreate = await ehr.connect(doctor).createEHR(patient.address, cid, keyCipher);
  const rcCreate = await txCreate.wait();
  console.log(`createEHR tx: ${rcCreate.hash}`);
  const evCreated = rcCreate.logs
    .map((l) => { try { return ehr.interface.parseLog(l); } catch { return null; } })
    .find((p) => p?.name === "EHRCreated");
  if (!evCreated) throw new Error("Không tìm thấy EHRCreated event");
  const ehrId = Number(evCreated.args[0]);
  console.log(`EHR ID = ${ehrId}`);

  // ----- Step 4: Patient grant access cho doctor -----
  console.log("\n=== [4] Patient cấp quyền đọc cho doctor ===");
  const alreadyAuthorized = await ac.isAuthorized(patient.address, doctor.address, ehrId);
  if (alreadyAuthorized) {
    console.log("Doctor đã có quyền, skip.");
  } else {
    const tx = await ac.connect(patient).grantAccess(doctor.address, ehrId);
    const rc = await tx.wait();
    console.log(`grantAccess tx: ${rc.hash}`);
  }

  // ----- Step 5: Doctor đọc + decrypt -----
  console.log("\n=== [5] Doctor đọc EHR ===");
  // Doctor phải xin patient re-wrap key (trong demo này chúng ta giả lập: patient ký key cho doctor)
  const { unwrapKey, wrapKey } = require("../../utils/encryption");
  const aesKey = unwrapKey(keyCipher, patientKeys.privateKey);
  const doctorKeys = generateRsaKeyPair();
  const keyCipherForDoctor = wrapKey(aesKey, doctorKeys.publicKey);

  // Doctor gọi peekEHR để lấy CID
  const view = await ehr.connect(doctor).peekEHR(ehrId);
  const [readPatient, readCid] = [view[0], view[1]];
  console.log(`peekEHR → patient=${readPatient}, cid=${readCid}`);

  // Doctor tải blob từ IPFS và decrypt
  const downloaded = await ipfs.cat(readCid);
  const decrypted = decryptForRecipient(downloaded, keyCipherForDoctor, doctorKeys.privateKey);
  console.log("Decrypted payload:");
  console.log(decrypted.toString());

  // Audit: gọi getEHR (state-changing để phát EHRAccessed event)
  const txAccess = await ehr.connect(doctor).getEHR(ehrId);
  const rcAccess = await txAccess.wait();
  console.log(`getEHR (audit) tx: ${rcAccess.hash}`);

  // ----- Step 6: Update EHR (version 2) -----
  console.log("\n=== [6] Doctor update EHR (version 2) ===");
  const v2Data = { ...medicalData, doctorNote: medicalData.doctorNote + " — UPDATE: đỡ rõ, dừng thuốc" };
  const v2Payload = Buffer.from(JSON.stringify(v2Data, null, 2));
  const v2 = encryptForRecipient(v2Payload, patientKeys.publicKey);
  const v2Cid = await ipfs.add(v2.blob, { name: `ehr-${ehrId}-v2.bin` });
  const txUpdate = await ehr.connect(doctor).updateEHR(ehrId, v2Cid);
  const rcUpdate = await txUpdate.wait();
  console.log(`updateEHR tx: ${rcUpdate.hash}`);
  console.log(`Version 2 CID: ${v2Cid}`);

  // ----- Tóm tắt cho báo cáo -----
  console.log("\n=== TÓM TẮT CHO BÁO CÁO ===");
  console.log(`EHR contract: ${deployment.contracts.EHR.address}`);
  console.log(`Etherscan:    https://sepolia.etherscan.io/address/${deployment.contracts.EHR.address}#events`);
  console.log(`EHR ID:       ${ehrId}`);
  console.log(`CID v1:       ${cid}`);
  console.log(`CID v2:       ${v2Cid}`);
  console.log(`Doctor:       ${doctor.address}`);
  console.log(`Patient:      ${patient.address}`);
  console.log(`\nLịch sử chỉnh sửa xem ở:`);
  console.log(`  ${deployment.contracts.EHR.explorer || `https://sepolia.etherscan.io/address/${deployment.contracts.EHR.address}#events`}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
