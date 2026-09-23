/**
 * CryptoEngine — Handles all cryptographic operations.
 *
 * Encapsulates key derivation (PBKDF2) and authenticated encryption/decryption
 * (AES-GCM 256-bit) using the Web Crypto API. This class has no knowledge of
 * the DOM, file formats, or UI — it deals purely with raw data and keys.
 *
 * @example
 *   const engine = new CryptoEngine();
 *   const { ciphertext, salt, iv } = await engine.encrypt(data, 'myPassword');
 *   const plaintext = await engine.decrypt(ciphertext, 'myPassword', salt, iv);
 */
export class CryptoEngine {

    /** Number of PBKDF2 iterations — high count to resist brute-force attacks */
    static ITERATIONS = 200_000;

    /** Salt length in bytes — 128-bit random salt per encryption */
    static SALT_LENGTH = 16;

    /** Initialization vector length in bytes — 96-bit IV as recommended for AES-GCM */
    static IV_LENGTH = 12;

    /** Symmetric encryption algorithm */
    static ALGORITHM = 'AES-GCM';

    /** AES key length in bits */
    static KEY_LENGTH = 256;

    /** Hash function used by PBKDF2 */
    static HASH = 'SHA-256';

    /**
     * Derives an AES-GCM 256-bit CryptoKey from a password and salt using PBKDF2.
     *
     * @param {string} password - The user-supplied password.
     * @param {Uint8Array} salt - A random salt (should be unique per encryption).
     * @returns {Promise<CryptoKey>} The derived AES-GCM key.
     */
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();

        // Import the password as raw key material for PBKDF2
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,       // not extractable
            ['deriveKey']
        );

        // Derive the actual AES-GCM key from the password via PBKDF2
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: CryptoEngine.ITERATIONS,
                hash: CryptoEngine.HASH,
            },
            keyMaterial,
            {
                name: CryptoEngine.ALGORITHM,
                length: CryptoEngine.KEY_LENGTH,
            },
            false,             // not extractable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts raw data with a password using AES-GCM.
     *
     * Generates a fresh random salt and IV for every call, ensuring that
     * encrypting the same data with the same password produces different
     * ciphertext each time.
     *
     * @param {ArrayBuffer|Uint8Array} data - The plaintext data to encrypt.
     * @param {string} password - The user-supplied password.
     * @returns {Promise<{ ciphertext: Uint8Array, salt: Uint8Array, iv: Uint8Array }>}
     */
    async encrypt(data, password) {
        const salt = crypto.getRandomValues(new Uint8Array(CryptoEngine.SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(CryptoEngine.IV_LENGTH));
        const key = await this.deriveKey(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: CryptoEngine.ALGORITHM, iv },
            key,
            data
        );

        return {
            ciphertext: new Uint8Array(encrypted),
            salt,
            iv,
        };
    }

    /**
     * Decrypts AES-GCM encrypted data using the original password, salt, and IV.
     *
     * AES-GCM is an authenticated cipher, so this will throw a clear error if
     * the password is wrong or the ciphertext has been tampered with — rather
     * than silently returning garbled data.
     *
     * @param {Uint8Array} ciphertext - The encrypted data.
     * @param {string} password - The password used during encryption.
     * @param {Uint8Array} salt - The salt used during encryption.
     * @param {Uint8Array} iv - The IV used during encryption.
     * @returns {Promise<Uint8Array>} The decrypted plaintext data.
     * @throws {Error} If the password is incorrect or the data is corrupted.
     */
    async decrypt(ciphertext, password, salt, iv) {
        const key = await this.deriveKey(password, salt);

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: CryptoEngine.ALGORITHM, iv },
                key,
                ciphertext
            );

            return new Uint8Array(decrypted);
        } catch (error) {
            // AES-GCM throws OperationError when authentication fails
            // (wrong password or tampered ciphertext)
            if (error.name === 'OperationError') {
                throw new Error(
                    'Decryption failed: the password is incorrect or the file has been corrupted.'
                );
            }
            throw error;
        }
    }
}
