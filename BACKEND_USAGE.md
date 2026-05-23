# Hướng dẫn tích hợp Blockchain cho Backend

Tài liệu này dành cho lập trình viên backend/frontend cần gửi và đọc dữ liệu từ
hệ thống blockchain EHR đã deploy trên **Sepolia testnet**.

Bạn KHÔNG cần đụng vào code Solidity. Chỉ cần `ethers.js` (hoặc `viem`/`web3.js`)
và các thông tin trong file này.

---

## 1. Thông tin mạng & contracts

| Thông tin | Giá trị |
|---|---|
| Network | Sepolia (Ethereum testnet) |
| Chain ID | `11155111` |
| Public RPC (free) | `https://ethereum-sepolia-rpc.publicnode.com` |
| Better RPC (free, có rate limit) | Tạo tại [alchemy.com](https://alchemy.com) hoặc [infura.io](https://infura.io) |
| Explorer | `https://sepolia.etherscan.io` |

**Địa chỉ contracts** (đã verify trên Etherscan, source code public):

| Contract | Address | Vai trò |
|---|---|---|
| `PatientRegistry` | [`0x1192Ed11B7476cafB448767E23c8016242F26921`](https://sepolia.etherscan.io/address/0x1192Ed11B7476cafB448767E23c8016242F26921#code) | Lưu CID profile + RSA public key của bệnh nhân |
| `AccessControl` | [`0x15239eBE91b071eB73Ca56E650A96CdcC04a3651`](https://sepolia.etherscan.io/address/0x15239eBE91b071eB73Ca56E650A96CdcC04a3651#code) | Quản lý roles + grant/revoke quyền đọc EHR |
| `EHR` | [`0xad3e0b594e5F10d95A7fF56188910b394CfcEa67`](https://sepolia.etherscan.io/address/0xad3e0b594e5F10d95A7fF56188910b394CfcEa67#code) | Lưu CID hồ sơ + audit trail |

Tất cả thông tin trên cũng có trong **[abi/networks.json](abi/networks.json)** và
ABI từng contract trong thư mục **[abi/](abi/)** — backend chỉ cần `require("./abi/EHR.json")`.

---

## 2. Setup nhanh trong project backend

```bash
npm install ethers@6 dotenv
```

Copy 4 file sang project backend:
- `abi/PatientRegistry.json`
- `abi/AccessControl.json`
- `abi/EHR.json`
- `abi/networks.json`

`.env` của backend:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
# Tuỳ chiến lược ví (mục 5), có thể cần thêm BACKEND_PRIVATE_KEY
```

---

## 3. Kết nối cơ bản (read-only — không cần ví)

```javascript
const { ethers } = require("ethers");
const networks = require("./abi/networks.json");
const ehrAbi = require("./abi/EHR.json");
const acAbi  = require("./abi/AccessControl.json");

const cfg = networks.sepolia;
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || cfg.publicRpc);

const ehr = new ethers.Contract(cfg.contracts.EHR.address, ehrAbi.abi, provider);
const ac  = new ethers.Contract(cfg.contracts.AccessControl.address, acAbi.abi, provider);

// Đọc tổng số records (không cần ví)
const total = await ehr.totalRecords();
console.log("Tổng EHR:", total.toString());

// Lấy danh sách EHR ID của 1 patient
const ids = await ehr.getRecordIdsByPatient("0xPATIENT_ADDRESS");
console.log("IDs:", ids.map(Number));
```

---

## 4. Các hàm chính của contracts

### 4.1 `AccessControl` (roles + permissions)

| Hàm | Loại | Mô tả |
|---|---|---|
| `roleOf(address)` | view | Trả về `0`=None, `1`=Patient, `2`=Doctor, `3`=Admin |
| `assignRole(address, uint8)` | write — admin only | Gán role (chỉ deployer/admin gọi được) |
| `registerAsPatient()` | write — anyone | Self-register Patient role cho `msg.sender` |
| `grantAccess(address doctor, uint256 ehrId)` | write — patient only | Bệnh nhân cấp quyền đọc cho bác sĩ |
| `revokeAccess(address doctor, uint256 ehrId)` | write — patient only | Bệnh nhân thu hồi quyền |
| `isAuthorized(address patient, address requester, uint256 ehrId)` | view | Check requester có quyền đọc record |

### 4.2 `PatientRegistry`

| Hàm | Loại | Mô tả |
|---|---|---|
| `register(string profileCID, string publicKey)` | write | Patient lưu CID profile + RSA public key |
| `updateProfile(string newCID)` | write | Update CID profile |
| `updatePublicKey(string newKey)` | write | Thay public key (khi rotate keys) |
| `getPatient(address)` | view | Trả về (profileCID, publicKey, registeredAt) |
| `isRegistered(address)` | view | Bool |

### 4.3 `EHR`

| Hàm | Loại | Mô tả |
|---|---|---|
| `createEHR(address patient, string cid, string keyCipher)` | write — doctor/admin | Tạo record mới, trả về EHR ID |
| `updateEHR(uint256 id, string newCid)` | write — patient hoặc creator | Update CID (event `EHRUpdated` ghi lịch sử) |
| `getEHR(uint256 id)` | write — phát event audit | Trả CID + keyCipher; chỉ caller được phép mới gọi được |
| `peekEHR(uint256 id)` | view — không phát event | Như `getEHR` nhưng không ghi audit |
| `getRecordIdsByPatient(address)` | view | Mảng EHR IDs |
| `totalRecords()` | view | Tổng số records đã tạo |

---

## 5. Chiến lược quản lý ví (QUAN TRỌNG)

Trước khi viết write functions, phải quyết định ai ký giao dịch. **Healthcare khuyến nghị
không custodial** (user tự ký), nhưng demo có thể đơn giản hoá.

### Phương án A — User-signed (khuyến nghị, non-custodial)

Frontend dùng **MetaMask**, user click "Connect" → ký TX bằng ví của mình. Backend
chỉ nhận **signed TX** từ frontend rồi forward lên RPC, hoặc thậm chí frontend gửi
trực tiếp lên RPC.

**Backend không giữ private key của user → an toàn nhất.**

Code mẫu — phía frontend (browser):

```javascript
// frontend
import { ethers } from "ethers";
import ehrAbi from "./abi/EHR.json";
import networks from "./abi/networks.json";

const browserProvider = new ethers.BrowserProvider(window.ethereum);
await browserProvider.send("eth_requestAccounts", []);
const signer = await browserProvider.getSigner();

const ehr = new ethers.Contract(networks.sepolia.contracts.EHR.address, ehrAbi.abi, signer);

const tx = await ehr.createEHR(patientAddress, cid, keyCipher);
const receipt = await tx.wait();
console.log("Tx:", receipt.hash);
```

Backend chỉ cần API trả về `address` của contracts + chuẩn bị data (mã hoá, upload IPFS) →
frontend tự ký + gửi TX.

### Phương án B — Server hot wallet (custodial, đơn giản)

Backend giữ 1 private key duy nhất, ký mọi giao dịch. **Dễ implement nhưng user
không thật sự "sở hữu" data — backend có thể giả mạo bệnh nhân.** Chỉ phù hợp demo.

```javascript
// backend
const wallet = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider);
const ehr = new ethers.Contract(cfg.contracts.EHR.address, ehrAbi.abi, wallet);

const tx = await ehr.createEHR(patientAddress, cid, keyCipher);
const receipt = await tx.wait();
```

Vấn đề: ví này phải có **Sepolia ETH** để trả gas. Xin faucet:
- https://sepoliafaucet.com/
- https://www.alchemy.com/faucets/ethereum-sepolia

### Phương án C — Hybrid

Backend ký các thao tác "trung tính" (đọc, admin assign role). User ký các thao tác
nhạy cảm (createEHR, grantAccess) qua MetaMask. Đây là cách production thật.

---

## 6. Workflow đầy đủ — code mẫu

### 6.1 Doctor tạo hồ sơ mới (giả định phương án A)

```javascript
// 1. Frontend lấy dữ liệu y tế từ form
const medicalData = {
  visitDate: "2026-05-21",
  diagnosis: "...",
  prescription: [...],
};

// 2. Backend mã hoá + upload IPFS (vì cần PINATA_JWT là secret)
//    Sử dụng utils/encryption.js và utils/ipfs.js từ repo này
const { encryptForRecipient } = require("./utils/encryption");
const ipfs = require("./utils/ipfs");

// Backend gọi PatientRegistry.getPatient để lấy public key
const patientInfo = await patientRegistry.getPatient(patientAddress);
const patientPubKey = patientInfo[1];

const payload = Buffer.from(JSON.stringify(medicalData));
const { blob, keyCipher } = encryptForRecipient(payload, patientPubKey);

const cid = await ipfs.add(blob);

// 3. Backend trả về (cid, keyCipher) cho frontend
//    Frontend gọi createEHR qua MetaMask
const tx = await ehr.connect(signer).createEHR(patientAddress, cid, keyCipher);
const rc = await tx.wait();
console.log("EHR tx:", rc.hash);

// 4. Parse EHR ID từ event
const log = rc.logs
  .map(l => { try { return ehr.interface.parseLog(l); } catch { return null; } })
  .find(p => p?.name === "EHRCreated");
const ehrId = log.args[0];
```

### 6.2 Bệnh nhân cấp quyền cho bác sĩ

```javascript
// Frontend (patient connect MetaMask)
const tx = await ac.connect(signer).grantAccess(doctorAddress, ehrId);
await tx.wait();
```

### 6.3 Bác sĩ đọc hồ sơ

```javascript
// 1. Doctor (đã được grant) gọi peekEHR để lấy CID + key wrap
const result = await ehr.connect(doctorSigner).peekEHR(ehrId);
const [patient, cid, keyCipher, createdAt, updatedAt] = result;

// 2. Backend tải blob từ IPFS
const ipfs = require("./utils/ipfs");
const blob = await ipfs.cat(cid);

// 3. Decrypt - cần private key của patient (re-wrap key)
//    Trong production: patient phải re-wrap key cho doctor's pubkey trước khi
//    doctor đọc được. Tham khảo scripts/seed/seedDemo.js để hiểu flow.
```

### 6.4 Đọc lịch sử chỉnh sửa (audit trail)

```javascript
// Query toàn bộ EHRUpdated event của 1 EHR ID
const filter = ehr.filters.EHRUpdated(ehrId);
const events = await ehr.queryFilter(filter, 0, "latest");

const history = events.map(ev => ({
  txHash: ev.transactionHash,
  block: ev.blockNumber,
  updatedBy: ev.args[1],
  newCid: ev.args[2],
  timestamp: Number(ev.args[3]),
}));
console.log("Lịch sử update:", history);
```

Tương tự với các event khác:
- `ehr.filters.EHRCreated(null, patientAddress)` — mọi EHR của 1 patient
- `ehr.filters.EHRAccessed(ehrId)` — ai đã đọc record này
- `ac.filters.AccessGranted(patientAddress)` — patient cấp quyền cho ai

---

## 7. Tích hợp IPFS (Pinata)

Backend dùng module **[utils/ipfs.js](utils/ipfs.js)** đã có sẵn — chỉ cần set
`.env`:

```env
IPFS_PROVIDER=pinata
PINATA_JWT=eyJhbGc...
PINATA_GATEWAY=https://gateway.pinata.cloud
```

Sau đó:

```javascript
const ipfs = require("./utils/ipfs");

const cid = await ipfs.add(buffer);          // upload, trả CID
const data = await ipfs.cat(cid);            // download
const url = ipfs.gatewayUrl(cid);            // URL public
```

Tại sao mã hoá ở backend, không ở frontend?
- **PINATA_JWT là secret** — không bao giờ expose ra browser
- Encrypted blob upload Pinata → CID public, nhưng nội dung không đọc được nếu không có key wrap

---

## 8. Các lỗi thường gặp

### "execution reverted: AC: not patient"
Caller chưa register làm Patient. Gọi `ac.registerAsPatient()` trước.

### "execution reverted: AC: not doctor"
Caller chưa được assign Doctor role. Admin phải gọi `ac.assignRole(address, 2)`.

### "execution reverted: EHR: unauthorized"
Caller không phải patient và chưa được grant access. Gọi `ac.grantAccess(...)` trước.

### "insufficient funds for intrinsic transaction cost"
Ví ký TX không có Sepolia ETH. Xin faucet.

### "nonce too low" / "replacement transaction underpriced"
Backend hot wallet bị race condition khi gửi nhiều TX song song. Dùng nonce manager:
```javascript
const nonce = await provider.getTransactionCount(wallet.address, "pending");
const tx = await contract.someMethod(args, { nonce });
```

### Tx pending mãi không confirm
- Kiểm tra gas price (`provider.getFeeData()`)
- Sepolia đôi khi chậm, đợi 30-60s
- Reset queue: gửi 1 TX nonce=N với gas price cao hơn

---

## 9. Checklist trước khi production

Hệ thống hiện tại đang trên **testnet** — chưa production-ready. Khi chuyển sang
mainnet hoặc Polygon, cần:

- [ ] Audit smart contract (Slither, MythX, hoặc thuê audit firm)
- [ ] Multi-sig cho admin (đừng để 1 private key quản lý role assignment)
- [ ] Pin IPFS file ở nhiều provider (Pinata + Web3.Storage backup)
- [ ] Rate limit trên API backend
- [ ] Logging + monitoring (theo dõi failed TX)
- [ ] HIPAA / luật khám chữa bệnh VN compliance review
- [ ] Plan để xoá data (GDPR "right to be forgotten") — vấn đề khó với blockchain immutable

---

## 10. Liên hệ & hỏi đáp

| Nội dung | Tham khảo |
|---|---|
| Contract source code | Tab "Contract" trên Etherscan của từng địa chỉ |
| ABI files | `abi/` trong repo này |
| End-to-end flow example | [scripts/seed/seedDemo.js](scripts/seed/seedDemo.js) — script chạy thật trên Sepolia |
| Tests | `pnpm test` — 27 test cases mô tả mọi happy path + edge case |
| Encrypt/decrypt utility | [utils/encryption.js](utils/encryption.js) |
| IPFS utility | [utils/ipfs.js](utils/ipfs.js) |

Nếu contract behavior khác mô tả, đối chiếu với [test/unit/](test/unit/) — đó là
spec authoritative.
