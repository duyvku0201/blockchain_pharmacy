// utils/encryption.js
// AES-256-GCM cho payload + RSA-OAEP wrap/unwrap symmetric key.
// Dựa trên node:crypto, không phụ thuộc thư viện ngoài.

const crypto = require("node:crypto");

const AES_ALG = "aes-256-gcm";
const AES_KEY_LEN = 32;   // 256 bit
const IV_LEN = 12;        // GCM khuyến nghị 96 bit

/// Sinh khoá AES-256 ngẫu nhiên (Buffer 32 byte).
function generateAesKey() {
  return crypto.randomBytes(AES_KEY_LEN);
}

/// Mã hoá dữ liệu (Buffer | string) bằng AES-256-GCM.
/// Trả về Buffer dạng: iv (12) || tag (16) || ciphertext.
function aesEncrypt(plaintext, key) {
  if (!Buffer.isBuffer(key) || key.length !== AES_KEY_LEN) {
    throw new Error("aesEncrypt: key must be 32-byte Buffer");
  }
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(AES_ALG, key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/// Giải mã blob (iv || tag || ciphertext) bằng AES key.
function aesDecrypt(blob, key) {
  if (!Buffer.isBuffer(key) || key.length !== AES_KEY_LEN) {
    throw new Error("aesDecrypt: key must be 32-byte Buffer");
  }
  if (!Buffer.isBuffer(blob) || blob.length < IV_LEN + 16) {
    throw new Error("aesDecrypt: blob too short");
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + 16);
  const data = blob.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(AES_ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/// Sinh cặp khoá RSA-2048 (PEM).
function generateRsaKeyPair() {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/// Wrap (mã hoá) symmetric key bằng RSA public key, trả về base64.
function wrapKey(aesKey, publicKeyPem) {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  );
  return encrypted.toString("base64");
}

/// Unwrap symmetric key bằng RSA private key. Input là base64 của ciphertext.
function unwrapKey(wrappedB64, privateKeyPem) {
  const ciphertext = Buffer.from(wrappedB64, "base64");
  return crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    ciphertext
  );
}

/// Helper cấp cao: mã hoá payload + wrap key cho 1 người nhận.
function encryptForRecipient(plaintext, recipientPublicKeyPem) {
  const aesKey = generateAesKey();
  const blob = aesEncrypt(plaintext, aesKey);
  const keyCipher = wrapKey(aesKey, recipientPublicKeyPem);
  return { blob, keyCipher };
}

/// Helper cấp cao: ngược lại của encryptForRecipient.
function decryptForRecipient(blob, keyCipher, recipientPrivateKeyPem) {
  const aesKey = unwrapKey(keyCipher, recipientPrivateKeyPem);
  return aesDecrypt(blob, aesKey);
}

module.exports = {
  generateAesKey,
  aesEncrypt,
  aesDecrypt,
  generateRsaKeyPair,
  wrapKey,
  unwrapKey,
  encryptForRecipient,
  decryptForRecipient,
};
