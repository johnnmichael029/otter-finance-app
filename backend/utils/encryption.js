/**
 * OTTER — AES-256-GCM Encryption Utility
 * ──────────────────────────────────────────────────────────────────────────────
 * Used to encrypt sensitive user notes (transaction notes, debt notes) at rest.
 *
 * How it works:
 *   - Algorithm: AES-256-GCM (authenticated encryption — prevents tampering)
 *   - Key:       32-byte key from ENCRYPTION_KEY in .env (64-char hex string)
 *   - Format:    Stored as "enc:iv:authTag:ciphertext" (all base64)
 *   - Prefix:    "enc:" prefix lets us skip decryption on plaintext legacy data
 *
 * Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const crypto = require('crypto');

const ALGORITHM    = 'aes-256-gcm';
const IV_LENGTH    = 12;   // 96-bit IV for GCM
const TAG_LENGTH   = 16;   // 128-bit auth tag
const ENC_PREFIX   = 'enc:';

// ── Derive 32-byte key from env ───────────────────────────────────────────────
const getKey = () => {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        console.warn('[Encryption] ⚠️  ENCRYPTION_KEY missing or invalid in .env — notes will NOT be encrypted. Restart the server after adding it.');
        return null;
    }
    return Buffer.from(hex, 'hex');
};

// ── Encrypt a plaintext string ───────────────────────────────────────────────
// Returns "enc:<iv_b64>:<tag_b64>:<cipher_b64>"  or '' for empty/falsy input
const encrypt = (plaintext) => {
    if (!plaintext) return plaintext;
    try {
        const key = getKey();
        if (!key) return plaintext;  // No key loaded — store as plaintext

        const iv     = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag       = cipher.getAuthTag();

        return (
            ENC_PREFIX +
            iv.toString('base64') + ':' +
            tag.toString('base64') + ':' +
            encrypted.toString('base64')
        );
    } catch (err) {
        console.error('[Encryption] Encrypt error:', err.message);
        return plaintext; // Fail open — store plaintext rather than crash
    }
};

// ── Decrypt a ciphertext string ───────────────────────────────────────────────
// Accepts "enc:<iv>:<tag>:<cipher>" — returns original plaintext
// If value is NOT prefixed with "enc:", returns it as-is (backward compat)
const decrypt = (ciphertext) => {
    if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
    try {
        const key = getKey();
        if (!key) return ciphertext;  // No key — return as-is
        const raw    = ciphertext.slice(ENC_PREFIX.length);
        const parts  = raw.split(':');
        if (parts.length !== 3) return ciphertext;

        const iv         = Buffer.from(parts[0], 'base64');
        const tag        = Buffer.from(parts[1], 'base64');
        const encrypted  = Buffer.from(parts[2], 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        return decipher.update(encrypted) + decipher.final('utf8');
    } catch (err) {
        console.error('[Encryption] Decrypt error:', err.message);
        return ''; // Auth tag mismatch — note was tampered or key changed
    }
};

// ── Helper: decrypt the note field on a plain JS object ──────────────────────
const decryptNote = (doc) => {
    if (!doc) return doc;
    if (doc.note) doc.note = decrypt(doc.note);
    return doc;
};

module.exports = { encrypt, decrypt, decryptNote };
