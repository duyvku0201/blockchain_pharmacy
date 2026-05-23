// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AccessControl - Quản lý vai trò và quyền truy cập EHR
/// @notice Lưu vai trò (Patient/Doctor/Admin) và bản đồ quyền cấp/thu hồi
///         truy cập các bản ghi EHR. EHR.sol gọi `isAuthorized` trước khi
///         trả CID cho người yêu cầu.
contract AccessControl {
    enum Role { None, Patient, Doctor, Admin }

    address public immutable admin;

    mapping(address => Role) private _roles;

    // patient => doctor => ehrId => granted
    mapping(address => mapping(address => mapping(uint256 => bool))) private _access;

    event RoleAssigned(address indexed account, Role role);
    event AccessGranted(address indexed patient, address indexed doctor, uint256 indexed ehrId);
    event AccessRevoked(address indexed patient, address indexed doctor, uint256 indexed ehrId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AC: not admin");
        _;
    }

    modifier onlyPatient() {
        require(_roles[msg.sender] == Role.Patient, "AC: not patient");
        _;
    }

    constructor() {
        admin = msg.sender;
        _roles[msg.sender] = Role.Admin;
        emit RoleAssigned(msg.sender, Role.Admin);
    }

    /// @notice Admin gán vai trò cho một address.
    function assignRole(address account, Role role) external onlyAdmin {
        require(account != address(0), "AC: zero addr");
        require(role != Role.None, "AC: invalid role");
        _roles[account] = role;
        emit RoleAssigned(account, role);
    }

    /// @notice Self-register Patient (bệnh nhân tự đăng ký bằng ví của mình).
    function registerAsPatient() external {
        require(_roles[msg.sender] == Role.None, "AC: role exists");
        _roles[msg.sender] = Role.Patient;
        emit RoleAssigned(msg.sender, Role.Patient);
    }

    function roleOf(address account) external view returns (Role) {
        return _roles[account];
    }

    /// @notice Bệnh nhân cấp quyền cho bác sĩ trên một ehrId cụ thể.
    function grantAccess(address doctor, uint256 ehrId) external onlyPatient {
        require(_roles[doctor] == Role.Doctor, "AC: not doctor");
        require(!_access[msg.sender][doctor][ehrId], "AC: already granted");
        _access[msg.sender][doctor][ehrId] = true;
        emit AccessGranted(msg.sender, doctor, ehrId);
    }

    /// @notice Bệnh nhân thu hồi quyền đã cấp.
    function revokeAccess(address doctor, uint256 ehrId) external onlyPatient {
        require(_access[msg.sender][doctor][ehrId], "AC: not granted");
        _access[msg.sender][doctor][ehrId] = false;
        emit AccessRevoked(msg.sender, doctor, ehrId);
    }

    /// @notice EHR.sol gọi hàm này để kiểm tra một address có được phép đọc
    ///         record của patient không. Patient luôn được đọc record của mình.
    function isAuthorized(address patient, address requester, uint256 ehrId)
        external
        view
        returns (bool)
    {
        if (requester == patient) return true;
        return _access[patient][requester][ehrId];
    }
}
