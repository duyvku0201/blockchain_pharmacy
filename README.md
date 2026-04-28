# blockchain_pharmacy

**Hệ thống Quản lý Hồ sơ Bệnh án Điện tử (EHR) phi tập trung dựa trên Blockchain & IPFS**

Một giải pháp đột phá giúp bệnh nhân sở hữu toàn quyền dữ liệu y tế của mình, với bảo mật tuyệt đối, tính toàn vẹn dữ liệu, và lịch sử truy cập không thể giả mạo (immutable audit trail).

---

## 📋 Mục lục

1. [Tổng quan](#tổng-quan)
2. [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
3. [Luồng nghiệp vụ chính](#luồng-nghiệp-vụ-chính)
4. [Bảo mật & Quyền riêng tư](#bảo-mật--quyền-riêng-tư)
5. [Quản lý Private Key](#quản-lý-private-key)
6. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
7. [Hướng dẫn cài đặt](#hướng-dẫn-cài-đặt)
8. [Cấu trúc dự án](#cấu-trúc-dự-án)
9. [Chạy Smart Contract](#chạy-smart-contract)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Gợi ý mở rộng](#gợi-ý-mở-rộng)

---

## 🎯 Tổng quan

### Vấn đề cần giải quyết

- **Quyền sở hữu dữ liệu**: Hiện nay, bệnh viện giữ hộ và kiểm soát bệnh án → bệnh nhân không chủ động.
- **Bảo mật dữ liệu**: Nếu máy chủ bị tấn công, toàn bộ hồ sơ có nguy cơ rò rỉ.
- **Tính nhất quán**: Khi đi từ bệnh viện này sang bệnh viện khác, bệnh nhân phải mang theo giấy tờ hoặc chờ chuyển tệp.
- **Minh bạch lịch sử**: Không biết ai đã xem, sửa bệnh án của mình lúc nào.

### Giải pháp

Xây dựng hệ thống **phi tập trung** (Decentralized) kết hợp:
- **Blockchain**: Sổ cái bất biến, ghi nhận quyền truy cập, metadata, lịch sử.
- **IPFS**: Lưu trữ phân tán, lưu tệp tin bệnh án đã mã hoá.
- **Smart Contracts**: Tự động hoá quản lý quyền, audit trail.
- **Backend (Node/NestJS)**: Xử lý nghiệp vụ, tương tác IPFS & Blockchain.

---

## 🏗️ Kiến trúc hệ thống

### Tổng thể

```
┌─────────────────────────────────────────────────────────┐
│                 FRONTEND (Next.js/React)                │
│              (Giao diện, kết nối Ví MetaMask)           │
└────────────────────┬────────────────────────────────────┘
                     │ (HTTP/REST)
┌────────────────────▼────────────────────────────────────┐
│               BACKEND (NestJS/Node)                     │
│          (API, mã hoá, điều phối IPFS/BC)               │
└───────┬──────────────────────────────┬──────────────────┘
        │                              │
        ▼                              ▼
┌──────────────────┐    ┌──────────────────────────────┐
│   IPFS (Storage) │    │  Blockchain (Smart Contract) │
│  (File encrypted)│    │   (Solidity 0.8.28)          │
│   (CID pointer)  │    │   - EHR.sol                  │
└──────────────────┘    │   - PatientRegistry.sol      │
                        │   - AccessControl.sol        │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  Local Node      │
                              │ (Hardhat)        │
                              └──────────────────┘
```

### Các thành phần chi tiết

| Thành phần         | Vai trò                                           | Công nghệ               |
|-------------------|-----------------------------------------------|------------------------|
| **Frontend**      | Giao diện người dùng, kết nối ví (MetaMask) | Next.js / React + ethers.js |
| **Backend**       | API, xác thực, mã hoá, điều phối IPFS/BC  | NestJS / Node.js       |
| **Database**      | Lưu dữ liệu off-chain, user info, cache   | PostgreSQL / MongoDB   |
| **Smart Contracts** | Quản lý quyền, ghi CID, audit trail       | Solidity 0.8.28        |
| **IPFS**          | Lưu file mã hoá, phân tán, có CID         | IPFS Node / Pinata     |
| **Blockchain**    | Sổ cái bất biến, xác thực giao dịch       | Ethereum / Polygon / Local Hardhat |

---

## 📊 Luồng nghiệp vụ chính

### 1️⃣ Khởi tạo định danh (Identity Management)

```
Patient / Doctor
      │
      ├─ Register Account (Email + Password hoặc KYC)
      │
      ├─ Generate Wallet (Public Key + Private Key)
      │
      └─ Link Identity to Blockchain Address
```

- Mỗi người dùng nhận một cặp khoá (Public / Private Key).
- Private Key được lưu trữ an toàn (ví điện tử, KMS, hoặc Smart Contract Wallet).
- Public Key (wallet address) được dùng để xác thực trên Blockchain.

### 2️⃣ Tạo và Lưu trữ hồ sơ mới (Create EHR)

```
Doctor
  │
  ├─ Enter Medical Data (diagnosis, prescription, lab results)
  │
  ├─ Backend encrypts data (AES-256)
  │
  ├─ Upload to IPFS → receive CID
  │
  ├─ Call Smart Contract: recordEHR(
  │      patientId,
  │      CID,
  │      doctorAddress,
  │      timestamp
  │   )
  │
  └─ Blockchain ghi event: EHRCreated(...)
```

- Dữ liệu được mã hoá bằng khóa đối xứng (Symmetric Key).
- File mã hoá được đẩy lên IPFS → nhận CID (Content Identifier).
- CID + metadata được ghi lên Smart Contract.
- Event được phát ra và lắng nghe bởi Backend → indexing.

### 3️⃣ Quản lý quyền truy cập (Access Control)

```
Doctor (new)
  │
  ├─ Send Access Request to Patient
  │
Patient
  │
  ├─ Review Request (optional approval UI)
  │
  ├─ Sign Transaction: grantAccess(
  │      doctorAddress,
  │      ehrId
  │   )
  │
  ├─ Smart Contract records: AccessGranted event
  │
  └─ (Optional) Proxy Re-Encryption: 
     Patient's private key → re-encrypt data for Doctor
     (Doctor không thấy Patient's key)
```

- Bệnh nhân có toàn quyền kiểm soát ai được xem bệnh án.
- Mỗi lần cấp/thu hồi quyền đều được ghi trên Blockchain.
- Có thể dùng Proxy Re-Encryption (PRE) để chia sẻ khóa giải mã an toàn.

### 4️⃣ Truy xuất và Giải mã (Retrieve & Decrypt)

```
Doctor (authorized)
  │
  ├─ Query Smart Contract: getCIDsByPatient(patientId)
  │
  ├─ Verify Access: isAuthorized(doctorAddress, ehrId)
  │
  ├─ Backend returns CID (if authorized)
  │
  ├─ Download file from IPFS using CID
  │
  ├─ Decrypt file using key (from PRE or patient-shared)
  │
  └─ Display decrypted medical record on UI
```

- Bác sĩ chỉ có quyền xem CID nếu bệnh nhân cấp.
- Dù có CID, không có khóa giải mã không thể đọc nội dung.
- Backend cache CID list để query nhanh hơn.

### 5️⃣ Lịch sử & Audit Trail

```
Blockchain Events Log:
├─ EHRCreated(patientId, doctorId, CID, timestamp)
├─ AccessGranted(patientId, doctorId, ehrId, timestamp)
├─ AccessRevoked(patientId, doctorId, ehrId, timestamp)
├─ EHRUpdated(ehrId, newCID, updatedBy, timestamp)
└─ AccessLog(actorId, action, resource, timestamp)
```

- Mọi sự kiện được ghi trên Blockchain → không thể sửa/xóa.
- Bệnh nhân có thể xem "Ai đã truy cập bệnh án vào lúc nào" thông qua UI.
- Hữu ích cho phát hiện truy cập trái phép, kiểm toán y tế.

---

## 🔒 Bảo mật & Quyền riêng tư

### 3 Lớp bảo vệ

#### 1️⃣ Loại Blockchain

| Loại                     | Công khai? | Phù hợp y tế?         |
|--------------------------|-----------|---------------------|
| **Public (Bitcoin/Ethereum)** | ✅ Ai cũng thấy giao dịch (nhưng chỉ hash)  | ⚠️ Có, nhưng cần cẩn trọng |
| **Private/Permissioned (Hyperledger)** | ❌ Chỉ node được cấp phép thấy | ✅ Tốt nhất cho y tế |

**Quyết định thiết kế**: Repo này dùng **Hardhat local node** (tương tự Ethereum Public). Để triển khai thực tế ở Việt Nam, khuyến nghị Private Chain hoặc Layer 2 (Polygon) + cơ chế quyền truy cập ở ứng dụng layer.

#### 2️⃣ Dữ liệu trên Blockchain chỉ là "Chỉ mục"

```
Blockchain chứa:
├─ CID (IPFS hash): Qz67f8k2h3j...
├─ patientAddress: 0x742d35C...
├─ doctorAddress: 0x8aB5C9...
├─ timestamp: 1704067200
└─ eventType: EHRCreated

❌ Blockchain KHÔNG chứa:
├─ Họ tên bệnh nhân
├─ Chẩn đoán bệnh
├─ Nội dung xét nghiệm
└─ Hình ảnh X-quang
```

Người ngoài nhìn vào Blockchain chỉ thấy "Ví A cấp quyền cho Ví B", không biết đó là ai hay bệnh gì.

#### 3️⃣ Mã hoá dữ liệu (Encryption)

```
Plaintext Medical Record
         │
         ▼
    [AES-256 Encrypt]
         │
         ▼
   Encrypted Blob
         │
         ▼
   [Upload to IPFS]
         │
         ▼
    IPFS CID
```

- **AES-256 (Symmetric)**: Mã hoá nhanh, tệp lớn.
  - Khóa được quản lý bởi bệnh nhân hoặc hệ thống KMS.
  
- **RSA (Asymmetric)**: Có thể dùng cho key wrapping.
  - Doctor's public key → encrypt symmetric key → chỉ doctor's private key mới decrypt.

- **Proxy Re-Encryption (PRE)**: Nâng cao.
  - Bệnh nhân có thể tạo "re-encryption key" cho doctor mà không cần chia sẻ private key trực tiếp.

---

## 🔑 Quản lý Private Key

### Vấn đề cốt lõi

- **Mất khóa** → mất quyền truy cập bệnh án vĩnh viễn.
- **Lộ khóa** → bệnh án bị mở khóa, quyền riêng tư bị vi phạm.

### Phương án lựa chọn

#### Ví điện tử (Crypto Wallets) — **Phổ biến nhất**

```
User → Install MetaMask / Trust Wallet
       │
       ├─ Private Key stored in Secure Enclave (Smartphone)
       │
       ├─ User remembers: Password + optional Seed Phrase (12-24 words)
       │
       └─ Sign transactions using biometric (fingerprint / face)
```

**Ưu điểm**: Phi tập trung, bảo mật cao.
**Nhược điểm**: Người dùng phải quản lý seed phrase, có nguy cơ mất khóa.
**Phù hợp**: Người rành công nghệ.

## 📦 Yêu cầu hệ thống

- **Node.js**: 24+ (recommend 24 LTS)
- **pnpm** hoặc **npm**
- **Git**
- **(Tùy chọn) IPFS Node**: Để test upload file local
  - Cài `go-ipfs` hoặc dùng `IPFS Desktop`
  - Hoặc dùng dịch vụ public (Pinata, Infura IPFS)

---

## 🚀 Hướng dẫn cài đặt

### 1. Clone repo

```bash
git clone <repository-url>
cd blockchain_pharmacy
```

### 2. Cài dependencies

**Dùng pnpm**

```powershell
pnpm install
```

**Hoặc dùng npm**

```powershell
npm install
```

### 3. Kiểm tra cài đặt

```powershell
npx hardhat --version
# kết quả: hardhat v2.28.6 (hoặc tương tự)
```

### 4. (Tùy chọn) Cài IPFS

**Nếu muốn test upload file local**

```powershell
# Download từ https://dist.ipfs.tech/#go-ipfs

# Windows: download .zip, giải nén, thêm vào PATH

# Khởi động IPFS daemon
ipfs daemon
# kết quả: Daemon is ready

# Ở terminal khác, test:
ipfs id
```

---

## 📁 Cấu trúc dự án

```
blockchain_pharmacy/
├── contracts/                  # Smart Contracts (Solidity)
│   ├── access/
│   │   └── AccessControl.sol   # Quản lý quyền truy cập
│   └── core/
│       ├── EHR.sol             # Lưu trữ hồ sơ (CID + metadata)
│       └── PatientRegistry.sol # Đăng ký bệnh nhân
├── scripts/
│   ├── deploy/
│   │   ├── deployAll.js        # Deploy tất cả contracts
│   │   └── deployEHR.js        # Deploy EHR contract
│   └── seed/
│       └── seedUsers.js        # Seed dữ liệu mẫu
├── services/
│   ├── access/
│   │   └── access.service.js   # Business logic: cấp quyền
│   ├── ehr/
│   │   └── ehr.service.js      # Business logic: EHR
│   └── wallet/
│       ├── metamask.service.js # Tương tác MetaMask
│       ├── session.service.js  # Quản lý session
│       └── wallet.service.js   # Ví blockchain
├── test/
│   ├── integration/
│   │   └── flow.test.js        # E2E test (tạo, cấp quyền, truy xuất)
│   └── unit/
│       ├── access.test.js      # Unit: AccessControl
│       └── ehr.test.js         # Unit: EHR
├── storage/
│   ├── sessions.json           # Session mẫu
│   └── users.json              # User mẫu
├── config/
│   ├── app.config.js           # Cấu hình ứng dụng
│   └── network.js              # Cấu hình network (RPC, chain ID)
├── frontend/
│   ├── src/                    # Next.js / React source
│   └── ...
├── hooks/
│   └── useWallet.js            # React hook: ví
├── ignition/
│   └── modules/                # Hardhat Ignition modules
├── utils/
│   ├── encryption.js           # Mã hoá / giải mã (AES, RSA)
│   └── ipfs.js                 # Tương tác IPFS
├── hardhat.config.js           # Cấu hình Hardhat
├── package.json
├── pnpm-lock.yaml
└── README.md
```

---

## ⛓️ Chạy Smart Contract

### Bước 1: Khởi động Hardhat Local Node

```powershell
npx hardhat node
```

Output:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545
Accounts:
0x0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (private key: 0x...)
0x1: 0x70997970C51812e339D9B73b0245ad59E6f7892b
...
```

**Giữ terminal này chạy.**

### Bước 2: Trong terminal mới, deploy contracts

```powershell
# Option A: Dùng script deploy tùy chỉnh
node scripts/deploy/deployAll.js

# Option B: Dùng Hardhat Ignition (nếu đã setup modules)
npx hardhat ignition deploy ./ignition/modules/<module.js>
```

### Bước 3: Kết nối Frontend với Local Node

Cấu hình `frontend/.env` hoặc `config/network.js`:

```javascript
// config/network.js
module.exports = {
  local: {
    rpc: "http://127.0.0.1:8545",
    chainId: 31337,
  },
  // ...
};
```

### Bước 4: Chạy Frontend

```powershell
cd frontend
pnpm install
pnpm run dev
# kết quả: http://localhost:3000
```

---

## 🧪 Testing

### Chạy tất cả tests

```powershell
npx hardhat test
```

Output:
```
  AccessControl
    ✓ should grant access (1234ms)
    ✓ should revoke access (567ms)
  EHR
    ✓ should create EHR record (1500ms)
    ✓ should retrieve EHR with correct CID (800ms)
  Integration
    ✓ full flow: create → grant → retrieve (2500ms)

  5 passing (6s)
```

### Chạy test cụ thể

```powershell
# Chỉ unit tests
npx hardhat test test/unit/**

# Chỉ integration tests
npx hardhat test test/integration/**

# Test một file
npx hardhat test test/unit/ehr.test.js
```

### Xem coverage

```powershell
npx hardhat coverage
```

Output:
```
  ✓ File coverage
  |  Stmts   | Branch | Funcs | Lines |
  |----------|--------|-------|-------|
  | 85.2%    | 72.1%  | 90%   | 84%   |
```

---

## 📤 Deployment

### A. Deploy lên testnet (ví dụ: Polygon Mumbai)

1. **Tạo `.env`** ở gốc repo

```
POLYGON_MUMBAI_RPC=https://rpc-mumbai.maticvigil.com
PRIVATE_KEY=0x<your-wallet-private-key>
```

2. **Cấu hình `hardhat.config.js`**

```javascript
require("dotenv").config();

module.exports = {
  solidity: "0.8.28",
  networks: {
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
```

3. **Deploy**

```powershell
npx hardhat run scripts/deploy/deployAll.js --network mumbai
```

### B. Deploy lên mainnet (Ethereum / Polygon)

**Cảnh báo**: Chi phí gas cao. Khuyến nghị test trên testnet trước.

```powershell
npx hardhat run scripts/deploy/deployAll.js --network mainnet
```

### C. Verify contract trên Etherscan

```powershell
npx hardhat verify --network mumbai <contract-address> <constructor-args>
```

---

## 🌱 Seed Dữ liệu Mẫu

### Chạy seed script

```powershell
node scripts/seed/seedUsers.js
```

Sẽ tạo:
- 5 bệnh nhân (Patient)
- 3 bác sĩ (Doctor)
- 10 hồ sơ mẫu (EHR)
- Ghi dữ liệu vào `storage/users.json` và `storage/sessions.json`

---

## 🔧 IPFS - Cấu hình & Sử dụng

### Option 1: Local IPFS Node (Dev/Testing)

```powershell
# 1. Cài go-ipfs (https://dist.ipfs.tech/#go-ipfs)

# 2. Khởi động daemon
ipfs daemon
# Output: Daemon is ready

# 3. Backend sẽ giao tiếp với /ip4/127.0.0.1/tcp/5001 (API endpoint)
```

### Option 2: Pinata (Public Gateway - Khuyến nghị cho Prod)

```javascript
// config/app.config.js
module.exports = {
  ipfs: {
    provider: "pinata", // hoặc "local"
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretKey: process.env.PINATA_SECRET_KEY,
  },
};
```

### Option 3: Infura IPFS

```javascript
// config/app.config.js
module.exports = {
  ipfs: {
    provider: "infura",
    projectId: process.env.INFURA_PROJECT_ID,
    projectSecret: process.env.INFURA_PROJECT_SECRET,
  },
};
```

### Hàm upload file

```javascript
// services/ehr/ehr.service.js
const uploadToIPFS = async (fileBuffer, fileName) => {
  // 1. Mã hoá file
  const encrypted = encrypt(fileBuffer, symmetricKey);
  
  // 2. Upload lên IPFS
  const cid = await ipfs.add(encrypted);
  
  // 3. Ghi CID lên Smart Contract
  await ehrContract.recordEHR(patientId, cid, doctorAddress);
  
  return cid;
};
```

---

## 📱 Frontend Integration

### Kết nối ví (MetaMask)

```javascript
// hooks/useWallet.js
export const useWallet = () => {
  const connect = async () => {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    return accounts[0];
  };

  const signTransaction = async (tx) => {
    const signer = await provider.getSigner();
    return signer.sendTransaction(tx);
  };

  return { connect, signTransaction };
};
```

### Luồng: Tạo hồ sơ mới

```javascript
// pages/ehr/create.js (Next.js)
const createEHR = async (medicalData) => {
  // 1. Mã hoá
  const encrypted = await backend.encrypt(medicalData);
  
  // 2. Upload IPFS
  const cid = await backend.uploadIPFS(encrypted);
  
  // 3. Ghi Smart Contract
  const tx = await ehrContract.recordEHR(patientId, cid);
  await tx.wait();
  
  // 4. Refresh UI
  setRecords([...records, { id: cid, date: new Date() }]);
};
```

---

## 🔐 Security Best Practices

1. ✅ **Không bao giờ log private key**
2. ✅ **HTTPS only** cho tất cả traffic
3. ✅ **Rate limiting** cho API endpoints
4. ✅ **Input validation** trước khi mã hoá
5. ✅ **CORS policy** chặt
6. ✅ **Regular security audit** của Smart Contracts (dùng Slither, MythX)
7. ✅ **Store secrets** trong `.env` (không commit vào git)
8. ✅ **Multi-signature** cho sensitive admin functions

---

## 📚 Gợi ý mở rộng

### Ngắn hạn

1. **Hoàn thiện Smart Contracts**
   - Thêm versioning cho EHR (history của từng record).
   - Thêm batch operations (grant multiple access at once).

2. **IPFS Pinning**
   - Setup Pinata / Web3.Storage để ensure file không bị lose.

3. **Indexing**
   - Dùng The Graph (GraphQL queries cho Blockchain events).

4. **Backend API**
   - Develop NestJS endpoints: `/ehr/create`, `/access/grant`, `/ehr/retrieve`.

### Trung hạn

1. **Account Abstraction (ERC-4337)**
   - Implement Smart Contract Wallet.
   - Social recovery mechanism.

2. **Proxy Re-Encryption (PRE)**
   - Integrate Umbral library (for threshold PRE).
   - Cho phép share khóa mà không expose private key.

3. **Zero-Knowledge Proofs (ZK)**
   - Prove "đã tiêm chủng" mà không tiết lộ chi tiết hồ sơ.
   - zk-SNARKs trên Polygon.

### Dài hạn

1. **Layer 2 Scaling**
   - Migrate từ Ethereum mainnet → Polygon / Arbitrum.
   - Giảm gas cost, tăng tốc độ.

2. **Interoperability**
   - Cross-chain bridges (connect multiple blockchains).

3. **Compliance**
   - GDPR "right to be forgotten" handling.
   - HIPAA compliance cho Mỹ.
   - Healthcare law compliance cho Việt Nam.

4. **Đối tác hệ sinh thái**
   - Tích hợp với các bệnh viện, BHYT công ty.
   - SDK cho third-party developers.

---

## 📖 Tài liệu tham khảo

- [Solidity Docs](https://docs.soliditylang.org/)
- [Hardhat](https://hardhat.org/docs)
- [IPFS](https://docs.ipfs.tech/)
- [Ethers.js](https://docs.ethers.org/)
- [Ethereum Smart Contract Best Practices](https://docs.soliditylang.org/en/latest/style-guide.html)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

---

## 💬 Câu hỏi thường gặp (FAQ)

### Q: Nếu Blockchain là công khai, không phải ai cũng thấy được bệnh án của tôi sao?

**A**: Không. Blockchain chỉ lưu mã băm (CID) và địa chỉ ví. Nội dung thực tế nằm trên IPFS, đã được mã hoá. Nếu không có khóa giải mã từ bệnh nhân hoặc được ủy quyền, tệp chỉ là ký tự rác không thể đọc.

### Q: Nếu tôi mất Private Key thì sao?

**A**: Nếu dùng Simple Wallet (MetaMask), rất khó khôi phục. Khuyến nghị:
- Lưu giữ Seed Phrase ở nơi an toàn (offline).
- Hoặc dùng Smart Contract Wallet với Social Recovery.
- Hoặc TSS (chia khóa multiple devices).

### Q: Có cần backend không?

**A**: **Có, rất cần.**
- Blockchain không thể lưu file lớn (expensive, slow).
- Backend xử lý mã hoá, IPFS, caching, authentication.
- Frontend không thể trực tiếp gọi Smart Contract mà không có backend layer.
