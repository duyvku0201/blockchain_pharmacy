const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const ROLE = { None: 0, Patient: 1, Doctor: 2, Admin: 3 };

async function deployFixture() {
  const [admin, patient, doctor, otherDoctor, stranger] = await ethers.getSigners();

  const AC = await ethers.getContractFactory("AccessControl");
  const ac = await AC.deploy();
  await ac.waitForDeployment();

  const EHR = await ethers.getContractFactory("EHR");
  const ehr = await EHR.deploy(await ac.getAddress());
  await ehr.waitForDeployment();

  await ac.connect(patient).registerAsPatient();
  await ac.connect(admin).assignRole(doctor.address, ROLE.Doctor);
  await ac.connect(admin).assignRole(otherDoctor.address, ROLE.Doctor);

  return { ac, ehr, admin, patient, doctor, otherDoctor, stranger };
}

describe("EHR", function () {
  describe("create", () => {
    it("doctor creates record and emits event", async () => {
      const { ehr, patient, doctor } = await deployFixture();
      const cid = "bafytest1";
      const keyCipher = "wrapped-key-base64";

      const tx = await ehr.connect(doctor).createEHR(patient.address, cid, keyCipher);
      const receipt = await tx.wait();

      const block = await ethers.provider.getBlock(receipt.blockNumber);
      await expect(tx)
        .to.emit(ehr, "EHRCreated")
        .withArgs(1n, patient.address, doctor.address, cid, block.timestamp);

      expect(await ehr.totalRecords()).to.equal(1n);
    });

    it("non-doctor cannot create", async () => {
      const { ehr, patient, stranger } = await deployFixture();
      await expect(
        ehr.connect(stranger).createEHR(patient.address, "cid", "k")
      ).to.be.revertedWith("EHR: not doctor");
    });

    it("cannot create for non-patient", async () => {
      const { ehr, doctor, stranger } = await deployFixture();
      await expect(
        ehr.connect(doctor).createEHR(stranger.address, "cid", "k")
      ).to.be.revertedWith("EHR: not patient");
    });

    it("empty cid reverts", async () => {
      const { ehr, doctor, patient } = await deployFixture();
      await expect(
        ehr.connect(doctor).createEHR(patient.address, "", "k")
      ).to.be.revertedWith("EHR: empty cid");
    });
  });

  describe("read with access control", () => {
    it("patient always reads own record", async () => {
      const { ehr, patient, doctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");

      const tx = await ehr.connect(patient).getEHR(1);
      await expect(tx).to.emit(ehr, "EHRAccessed");

      const r = await ehr.connect(patient).peekEHR(1);
      expect(r[0]).to.equal(patient.address);
      expect(r[1]).to.equal("cid1");
    });

    it("doctor without grant cannot read", async () => {
      const { ehr, patient, doctor, otherDoctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");
      await expect(ehr.connect(otherDoctor).getEHR(1)).to.be.revertedWith(
        "EHR: unauthorized"
      );
    });

    it("doctor with grant can read", async () => {
      const { ac, ehr, patient, doctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");
      await ac.connect(patient).grantAccess(doctor.address, 1);

      const tx = await ehr.connect(doctor).getEHR(1);
      await expect(tx).to.emit(ehr, "EHRAccessed").withArgs(1n, doctor.address, anyValue);
    });

    it("revoke blocks further reads", async () => {
      const { ac, ehr, patient, doctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");
      await ac.connect(patient).grantAccess(doctor.address, 1);
      await ac.connect(patient).revokeAccess(doctor.address, 1);

      await expect(ehr.connect(doctor).getEHR(1)).to.be.revertedWith("EHR: unauthorized");
    });
  });

  describe("update", () => {
    it("patient updates own record", async () => {
      const { ehr, patient, doctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");
      await expect(ehr.connect(patient).updateEHR(1, "cid2"))
        .to.emit(ehr, "EHRUpdated");
      const r = await ehr.connect(patient).peekEHR(1);
      expect(r[1]).to.equal("cid2");
    });

    it("creator (doctor) can update", async () => {
      const { ehr, patient, doctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");
      await ehr.connect(doctor).updateEHR(1, "cid3");
    });

    it("stranger cannot update", async () => {
      const { ehr, patient, doctor, otherDoctor } = await deployFixture();
      await ehr.connect(doctor).createEHR(patient.address, "cid1", "kc");
      await expect(
        ehr.connect(otherDoctor).updateEHR(1, "x")
      ).to.be.revertedWith("EHR: not allowed");
    });
  });

  it("lists records by patient", async () => {
    const { ehr, patient, doctor } = await deployFixture();
    await ehr.connect(doctor).createEHR(patient.address, "a", "k");
    await ehr.connect(doctor).createEHR(patient.address, "b", "k");
    const ids = await ehr.getRecordIdsByPatient(patient.address);
    expect(ids.map(Number)).to.deep.equal([1, 2]);
  });
});

