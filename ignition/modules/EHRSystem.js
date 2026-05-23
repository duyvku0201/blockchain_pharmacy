// ignition/modules/EHRSystem.js
// Triển khai PatientRegistry → AccessControl → EHR(accessControl).

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("EHRSystem", (m) => {
  const patientRegistry = m.contract("PatientRegistry");
  const accessControl = m.contract("AccessControl");
  const ehr = m.contract("EHR", [accessControl]);

  return { patientRegistry, accessControl, ehr };
});
