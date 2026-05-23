// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAccessControl {
    enum Role { None, Patient, Doctor, Admin }
    function roleOf(address account) external view returns (Role);
    function isAuthorized(address patient, address requester, uint256 ehrId) external view returns (bool);
}

/// @title EHR - Lưu CID hồ sơ y tế và audit trail
/// @notice On-chain chỉ giữ CID + metadata. Dữ liệu thật (đã mã hoá) nằm trên
///         IPFS. Mọi thao tác đọc/ghi đều phát event để phục vụ audit.
contract EHR {
    struct Record {
        uint256 id;
        address patient;
        address createdBy;     // doctor/admin tạo record
        string cid;            // CID IPFS của payload đã mã hoá
        string keyCipher;      // symmetric key được wrap bằng RSA public key bệnh nhân
        uint256 createdAt;
        uint256 updatedAt;
        bool exists;
    }

    IAccessControl public immutable accessControl;

    uint256 private _nextId = 1;
    mapping(uint256 => Record) private _records;
    mapping(address => uint256[]) private _patientRecords;

    event EHRCreated(uint256 indexed id, address indexed patient, address indexed createdBy, string cid, uint256 timestamp);
    event EHRUpdated(uint256 indexed id, address indexed updatedBy, string newCid, uint256 timestamp);
    event EHRAccessed(uint256 indexed id, address indexed reader, uint256 timestamp);

    constructor(address accessControlAddr) {
        require(accessControlAddr != address(0), "EHR: zero AC");
        accessControl = IAccessControl(accessControlAddr);
    }

    /// @notice Doctor (hoặc admin) tạo bản ghi mới cho một bệnh nhân.
    ///         Bệnh nhân vẫn phải `grantAccess` riêng nếu doctor muốn đọc lại sau.
    function createEHR(
        address patient,
        string calldata cid,
        string calldata keyCipher
    ) external returns (uint256) {
        IAccessControl.Role r = accessControl.roleOf(msg.sender);
        require(r == IAccessControl.Role.Doctor || r == IAccessControl.Role.Admin, "EHR: not doctor");
        require(accessControl.roleOf(patient) == IAccessControl.Role.Patient, "EHR: not patient");
        require(bytes(cid).length > 0, "EHR: empty cid");

        uint256 id = _nextId++;
        _records[id] = Record({
            id: id,
            patient: patient,
            createdBy: msg.sender,
            cid: cid,
            keyCipher: keyCipher,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            exists: true
        });
        _patientRecords[patient].push(id);

        emit EHRCreated(id, patient, msg.sender, cid, block.timestamp);
        return id;
    }

    /// @notice Cập nhật CID (version mới) cho record đã tồn tại.
    ///         Chỉ patient hoặc người tạo gốc mới được update.
    function updateEHR(uint256 id, string calldata newCid) external {
        Record storage rec = _records[id];
        require(rec.exists, "EHR: not found");
        require(msg.sender == rec.patient || msg.sender == rec.createdBy, "EHR: not allowed");
        require(bytes(newCid).length > 0, "EHR: empty cid");

        rec.cid = newCid;
        rec.updatedAt = block.timestamp;
        emit EHRUpdated(id, msg.sender, newCid, block.timestamp);
    }

    /// @notice Đọc CID + key wrap. Caller phải có quyền (patient hoặc được grant).
    ///         Phát event audit mỗi lần truy cập.
    function getEHR(uint256 id)
        external
        returns (address patient, string memory cid, string memory keyCipher, uint256 createdAt, uint256 updatedAt)
    {
        Record storage rec = _records[id];
        require(rec.exists, "EHR: not found");
        require(accessControl.isAuthorized(rec.patient, msg.sender, id), "EHR: unauthorized");

        emit EHRAccessed(id, msg.sender, block.timestamp);
        return (rec.patient, rec.cid, rec.keyCipher, rec.createdAt, rec.updatedAt);
    }

    /// @notice View-only — không phát audit. Dùng cho dashboard nội bộ.
    function peekEHR(uint256 id)
        external
        view
        returns (address patient, string memory cid, uint256 createdAt, uint256 updatedAt)
    {
        Record storage rec = _records[id];
        require(rec.exists, "EHR: not found");
        require(accessControl.isAuthorized(rec.patient, msg.sender, id), "EHR: unauthorized");
        return (rec.patient, rec.cid, rec.createdAt, rec.updatedAt);
    }

    function getRecordIdsByPatient(address patient) external view returns (uint256[] memory) {
        return _patientRecords[patient];
    }

    function totalRecords() external view returns (uint256) {
        return _nextId - 1;
    }
}
