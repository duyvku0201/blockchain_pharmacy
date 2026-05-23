// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PatientRegistry - Đăng ký bệnh nhân và public key
/// @notice On-chain map từ địa chỉ ví bệnh nhân sang CID của profile (off-chain
///         trên IPFS) và public key dùng để wrap khóa AES.
///         KHÔNG lưu thông tin định danh cá nhân trực tiếp.
contract PatientRegistry {
    struct Patient {
        string profileCID;   // CID IPFS chứa profile đã mã hoá
        string publicKey;    // RSA/Ed25519 public key (PEM hoặc base64)
        uint256 registeredAt;
        bool exists;
    }

    mapping(address => Patient) private _patients;
    address[] private _patientList;

    event PatientRegistered(address indexed patient, string profileCID, uint256 timestamp);
    event ProfileUpdated(address indexed patient, string newProfileCID, uint256 timestamp);
    event PublicKeyUpdated(address indexed patient, uint256 timestamp);

    function register(string calldata profileCID, string calldata publicKey) external {
        require(!_patients[msg.sender].exists, "PR: already registered");
        require(bytes(profileCID).length > 0, "PR: empty CID");
        require(bytes(publicKey).length > 0, "PR: empty pubkey");

        _patients[msg.sender] = Patient({
            profileCID: profileCID,
            publicKey: publicKey,
            registeredAt: block.timestamp,
            exists: true
        });
        _patientList.push(msg.sender);

        emit PatientRegistered(msg.sender, profileCID, block.timestamp);
    }

    function updateProfile(string calldata newCID) external {
        require(_patients[msg.sender].exists, "PR: not registered");
        require(bytes(newCID).length > 0, "PR: empty CID");
        _patients[msg.sender].profileCID = newCID;
        emit ProfileUpdated(msg.sender, newCID, block.timestamp);
    }

    function updatePublicKey(string calldata newKey) external {
        require(_patients[msg.sender].exists, "PR: not registered");
        require(bytes(newKey).length > 0, "PR: empty pubkey");
        _patients[msg.sender].publicKey = newKey;
        emit PublicKeyUpdated(msg.sender, block.timestamp);
    }

    function getPatient(address patient)
        external
        view
        returns (string memory profileCID, string memory publicKey, uint256 registeredAt)
    {
        require(_patients[patient].exists, "PR: not registered");
        Patient storage p = _patients[patient];
        return (p.profileCID, p.publicKey, p.registeredAt);
    }

    function isRegistered(address patient) external view returns (bool) {
        return _patients[patient].exists;
    }

    function totalPatients() external view returns (uint256) {
        return _patientList.length;
    }
}
