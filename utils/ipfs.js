// utils/ipfs.js
// Adapter IPFS: chọn provider qua env IPFS_PROVIDER = "local" | "pinata".
// Cả hai provider trả về cùng interface: add(buf) -> cid, cat(cid) -> Buffer.

const PROVIDER = (process.env.IPFS_PROVIDER || "local").toLowerCase();

// =========================================================================
// Provider 1: Local Kubo HTTP API (127.0.0.1:5001)
// =========================================================================
const LOCAL_API = process.env.IPFS_API || "http://127.0.0.1:5001";

function localUrl(path, params) {
  const url = new URL(`/api/v0/${path}`, LOCAL_API);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function localAdd(buf, { pin = true } = {}) {
  const form = new FormData();
  form.append("file", new Blob([buf]), "blob");
  const res = await fetch(localUrl("add", { pin, "cid-version": 1 }), {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`IPFS local add ${res.status}: ${text}`);
  const lines = text.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = JSON.parse(lines[i]);
    if (obj.Hash) return obj.Hash;
  }
  throw new Error("IPFS local add: no Hash");
}

async function localCat(cid) {
  const res = await fetch(localUrl("cat", { arg: cid }), { method: "POST" });
  if (!res.ok) throw new Error(`IPFS local cat ${res.status}: ${await res.text().catch(() => "")}`);
  return Buffer.from(await res.arrayBuffer());
}

async function localPin(cid) {
  const res = await fetch(localUrl("pin/add", { arg: cid }), { method: "POST" });
  if (!res.ok) throw new Error(`IPFS local pin ${res.status}`);
  return cid;
}

// =========================================================================
// Provider 2: Pinata (https://api.pinata.cloud)
// =========================================================================
const PINATA_BASE = "https://api.pinata.cloud";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";

function pinataAuthHeader() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT chưa được set trong .env");
  return { Authorization: `Bearer ${jwt}` };
}

async function pinataAdd(buf, { name = "blob" } = {}) {
  const form = new FormData();
  form.append("file", new Blob([buf]), name);
  // Tùy chọn metadata để dễ tra trên dashboard
  form.append("pinataMetadata", JSON.stringify({ name }));

  const res = await fetch(`${PINATA_BASE}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: pinataAuthHeader(),
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata add ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.IpfsHash;
}

async function pinataCat(cid) {
  const res = await fetch(`${PINATA_GATEWAY}/ipfs/${cid}`);
  if (!res.ok) throw new Error(`Pinata gateway ${res.status} cho CID ${cid}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pinataPin(cid) {
  // Pin một CID đã tồn tại trên mạng IPFS (Pinata gọi là "pinByHash")
  const res = await fetch(`${PINATA_BASE}/pinning/pinByHash`, {
    method: "POST",
    headers: { ...pinataAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ hashToPin: cid }),
  });
  if (!res.ok) throw new Error(`Pinata pin ${res.status}: ${await res.text().catch(() => "")}`);
  return cid;
}

// =========================================================================
// Public interface
// =========================================================================
async function add(data, opts) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return PROVIDER === "pinata" ? pinataAdd(buf, opts) : localAdd(buf, opts);
}

async function cat(cid) {
  if (!cid) throw new Error("IPFS cat: empty cid");
  return PROVIDER === "pinata" ? pinataCat(cid) : localCat(cid);
}

async function pin(cid) {
  return PROVIDER === "pinata" ? pinataPin(cid) : localPin(cid);
}

/// URL public để chèn vào báo cáo / chia sẻ link.
function gatewayUrl(cid) {
  if (PROVIDER === "pinata") return `${PINATA_GATEWAY}/ipfs/${cid}`;
  return `https://ipfs.io/ipfs/${cid}`;
}

module.exports = { add, cat, pin, gatewayUrl, provider: PROVIDER };
