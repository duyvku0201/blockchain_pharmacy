const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  generateRsaKeyPair,
  encryptForRecipient,
  decryptForRecipient,
} = require("../../utils/encryption");

const ROLE = { None: 0, Patient: 1, Doctor: 2, Admin: 3 };

/// In-memory IPFS stub: lưu blob theo "CID" giả (sha256 hex).
function makeIpfsStub() {
  const store = new Map();
  const crypto = require("node:crypto");
  return {
    async add(buf) {
      const cid = "bafy" + crypto.createHash("sha256").update(buf).digest("hex").slice(0, 46);
      store.set(cid, Buffer.from(buf));
      return cid;
    },
    async cat(cid) {
      if (!store.has(cid)) throw new Error("not found");
      return store.get(cid);
    },
  };
}

describe("Integration: end-to-end EHR flow", function () {
  it("doctor creates → patient grants → doctor decrypts payload", async () => {
    const [admin, patient, doctor] = await ethers.getSigners();

    // 1. Deploy contracts
    const AC = await ethers.getContractFactory("AccessControl");
    const ac = await AC.deploy();
    await ac.waitForDeployment();

    const EHR = await ethers.getContractFactory("EHR");
    const ehr = await EHR.deploy(await ac.getAddress());
    await ehr.waitForDeployment();

    await ac.connect(patient).registerAsPatient();
    await ac.connect(admin).assignRole(doctor.address, ROLE.Doctor);

    // 2. Mỗi bên có 1 cặp RSA (giả lập key custody)
    const patientKeys = generateRsaKeyPair();
    const doctorKeys = generateRsaKeyPair();

    const ipfs = makeIpfsStub();

    // 3. Doctor soạn payload → mã hoá bằng AES key, wrap key cho PATIENT
    //    (patient sở hữu dữ liệu, doctor sẽ tạo bản re-wrap cho mình khi cần)
    const payload = Buffer.from(JSON.stringify({
      diagnosis: "Influenza A",
      prescription: ["Oseltamivir 75mg", "Paracetamol 500mg"],
      notes: "Theo dõi 72h",
    }));
    const { blob, keyCipher } = encryptForRecipient(payload, patientKeys.publicKey);

    // 4. Upload blob lên IPFS (stub), ghi CID lên chain
    const cid = await ipfs.add(blob);
    const tx = await ehr.connect(doctor).createEHR(patient.address, cid, keyCipher);
    const rc = await tx.wait();
    const ev = rc.logs.find((l) => l.fragment && l.fragment.name === "EHRCreated");
    const recordId = Number(ev.args[0]);
    expect(recordId).to.equal(1);

    // 5. Patient đọc — quyền tự cấp, decrypt thành công
    const peek = await ehr.connect(patient).peekEHR(recordId);
    expect(peek[1]).to.equal(cid);
    const downloaded = await ipfs.cat(peek[1]);
    const decrypted = decryptForRecipient(downloaded, keyCipher, patientKeys.privateKey);
    expect(JSON.parse(decrypted.toString()).diagnosis).to.equal("Influenza A");

    // 6. Doctor chưa được cấp quyền → không đọc được trên chain
    await expect(ehr.connect(doctor).peekEHR(recordId)).to.be.revertedWith(
      "EHR: unauthorized"
    );

    // 7. Patient cấp quyền, re-wrap key cho doctor's pubkey, update record
    await ac.connect(patient).grantAccess(doctor.address, recordId);

    // Patient unwrap AES key bằng private của mình rồi wrap lại bằng pubkey doctor.
    const { unwrapKey, wrapKey } = require("../../utils/encryption");
    const aesKey = unwrapKey(keyCipher, patientKeys.privateKey);
    const keyCipherForDoctor = wrapKey(aesKey, doctorKeys.publicKey);

    // Note: trong thiết kế này, on-chain chỉ giữ 1 keyCipher (cho patient).
    // Patient có thể truyền keyCipherForDoctor off-chain hoặc lưu trên IPFS riêng.
    // Ở đây test rằng doctor có thể decrypt bằng key wrap mới.

    // 8. Doctor đọc CID từ chain (đã được cấp quyền), tải blob, decrypt với key wrap riêng
    const doctorView = await ehr.connect(doctor).peekEHR(recordId);
    const blobForDoctor = await ipfs.cat(doctorView[1]);
    const decryptedByDoctor = decryptForRecipient(
      blobForDoctor,
      keyCipherForDoctor,
      doctorKeys.privateKey
    );
    expect(JSON.parse(decryptedByDoctor.toString()).prescription).to.deep.equal([
      "Oseltamivir 75mg",
      "Paracetamol 500mg",
    ]);

    // 9. Audit: getEHR phát EHRAccessed event
    await expect(ehr.connect(doctor).getEHR(recordId)).to.emit(ehr, "EHRAccessed");

    // 10. Patient thu hồi quyền — doctor đọc tiếp bị chặn on-chain
    await ac.connect(patient).revokeAccess(doctor.address, recordId);
    await expect(ehr.connect(doctor).getEHR(recordId)).to.be.revertedWith(
      "EHR: unauthorized"
    );
  });

  it("update tạo CID mới, mọi event được audit", async () => {
    const [admin, patient, doctor] = await ethers.getSigners();
    const AC = await ethers.getContractFactory("AccessControl");
    const ac = await AC.deploy();
    await ac.waitForDeployment();
    const EHR = await ethers.getContractFactory("EHR");
    const ehr = await EHR.deploy(await ac.getAddress());
    await ehr.waitForDeployment();

    await ac.connect(patient).registerAsPatient();
    await ac.connect(admin).assignRole(doctor.address, ROLE.Doctor);

    const ipfs = makeIpfsStub();
    const patientKeys = generateRsaKeyPair();

    const v1 = encryptForRecipient(Buffer.from("v1 data"), patientKeys.publicKey);
    const cid1 = await ipfs.add(v1.blob);
    await ehr.connect(doctor).createEHR(patient.address, cid1, v1.keyCipher);

    const v2 = encryptForRecipient(Buffer.from("v2 data"), patientKeys.publicKey);
    const cid2 = await ipfs.add(v2.blob);
    await expect(ehr.connect(patient).updateEHR(1, cid2)).to.emit(ehr, "EHRUpdated");

    const after = await ehr.connect(patient).peekEHR(1);
    expect(after[1]).to.equal(cid2);
  });
});
