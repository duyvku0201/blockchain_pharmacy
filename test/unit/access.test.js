const { expect } = require("chai");
const { ethers } = require("hardhat");

const ROLE = { None: 0, Patient: 1, Doctor: 2, Admin: 3 };

describe("AccessControl", function () {
  let ac, admin, patient, doctor, stranger;

  beforeEach(async () => {
    [admin, patient, doctor, stranger] = await ethers.getSigners();
    const AC = await ethers.getContractFactory("AccessControl");
    ac = await AC.deploy();
    await ac.waitForDeployment();
  });

  describe("roles", () => {
    it("deployer becomes Admin", async () => {
      expect(await ac.roleOf(admin.address)).to.equal(ROLE.Admin);
    });

    it("admin can assign Doctor role", async () => {
      await expect(ac.connect(admin).assignRole(doctor.address, ROLE.Doctor))
        .to.emit(ac, "RoleAssigned")
        .withArgs(doctor.address, ROLE.Doctor);
      expect(await ac.roleOf(doctor.address)).to.equal(ROLE.Doctor);
    });

    it("non-admin cannot assign roles", async () => {
      await expect(
        ac.connect(stranger).assignRole(doctor.address, ROLE.Doctor)
      ).to.be.revertedWith("AC: not admin");
    });

    it("self-register as Patient", async () => {
      await ac.connect(patient).registerAsPatient();
      expect(await ac.roleOf(patient.address)).to.equal(ROLE.Patient);
    });

    it("cannot re-register if role exists", async () => {
      await ac.connect(patient).registerAsPatient();
      await expect(ac.connect(patient).registerAsPatient()).to.be.revertedWith(
        "AC: role exists"
      );
    });
  });

  describe("grant / revoke", () => {
    beforeEach(async () => {
      await ac.connect(patient).registerAsPatient();
      await ac.connect(admin).assignRole(doctor.address, ROLE.Doctor);
    });

    it("patient grants access to doctor", async () => {
      await expect(ac.connect(patient).grantAccess(doctor.address, 1))
        .to.emit(ac, "AccessGranted")
        .withArgs(patient.address, doctor.address, 1);
      expect(await ac.isAuthorized(patient.address, doctor.address, 1)).to.equal(true);
    });

    it("patient self is always authorized", async () => {
      expect(await ac.isAuthorized(patient.address, patient.address, 999)).to.equal(true);
    });

    it("stranger cannot read after no grant", async () => {
      expect(await ac.isAuthorized(patient.address, stranger.address, 1)).to.equal(false);
    });

    it("cannot grant to non-doctor", async () => {
      await expect(
        ac.connect(patient).grantAccess(stranger.address, 1)
      ).to.be.revertedWith("AC: not doctor");
    });

    it("cannot grant twice", async () => {
      await ac.connect(patient).grantAccess(doctor.address, 1);
      await expect(
        ac.connect(patient).grantAccess(doctor.address, 1)
      ).to.be.revertedWith("AC: already granted");
    });

    it("revoke removes access", async () => {
      await ac.connect(patient).grantAccess(doctor.address, 1);
      await expect(ac.connect(patient).revokeAccess(doctor.address, 1))
        .to.emit(ac, "AccessRevoked")
        .withArgs(patient.address, doctor.address, 1);
      expect(await ac.isAuthorized(patient.address, doctor.address, 1)).to.equal(false);
    });

    it("revoke without grant reverts", async () => {
      await expect(
        ac.connect(patient).revokeAccess(doctor.address, 1)
      ).to.be.revertedWith("AC: not granted");
    });

    it("non-patient cannot grant", async () => {
      await expect(
        ac.connect(stranger).grantAccess(doctor.address, 1)
      ).to.be.revertedWith("AC: not patient");
    });
  });
});
