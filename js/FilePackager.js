/**
 * FilePackager — Manages the .vault binary file format.
 *
 * Responsible for serializing all encryption artifacts (filename, salt, IV,
 * ciphertext) into a single binary blob, and deserializing them back on
 * decryption. This class contains zero crypto logic — it only deals with
 * binary layout and validation.
 *
 * Binary Format (packed sequentially):
 * ┌──────────────────┬───────┬──────────────────────────────────────────────┐
 * │ Field            │ Bytes │ Description                                  │
 * ├──────────────────┼───────┼──────────────────────────────────────────────┤
 * │ Magic bytes      │ 4     │ 0x454E4352 ("ENCR") — format identifier     │
 * │ Version          │ 1     │ 0x01 — format version for future-proofing   │
 * │ Filename length  │ 2     │ Uint16 big-endian — original filename size  │
 * │ Filename         │ N     │ UTF-8 encoded original filename             │
 * │ Salt             │ 16    │ PBKDF2 salt                                 │
 * │ IV               │ 12    │ AES-GCM initialization vector               │
 * │ Ciphertext       │ rest  │ Encrypted file content                      │
 * └──────────────────┴───────┴──────────────────────────────────────────────┘
 */
export class FilePackager {

    /** Magic bytes that identify a valid .vault file — ASCII "ENCR" */
    static MAGIC_BYTES = new Uint8Array([0x45, 0x4E, 0x43, 0x52]);

    /** Current format version */
    static VERSION = 0x01;

    /** Fixed header size: magic (4) + version (1) + filename length (2) */
    static HEADER_SIZE = 4 + 1 + 2;

    /** Expected salt length in bytes */
    static SALT_LENGTH = 16;

    /** Expected IV length in bytes */
    static IV_LENGTH = 12;

    /**
     * Packages encryption artifacts into a single binary blob (.vault format).
     *
     * @param {string} filename - The original filename to preserve.
     * @param {Uint8Array} salt - The PBKDF2 salt used during encryption.
     * @param {Uint8Array} iv - The AES-GCM IV used during encryption.
     * @param {Uint8Array} ciphertext - The encrypted file content.
     * @returns {ArrayBuffer} The assembled .vault binary blob.
     * @throws {Error} If the filename is too long to fit in a Uint16.
     */
    package(filename, salt, iv, ciphertext) {
        const encoder = new TextEncoder();
        const filenameBytes = encoder.encode(filename);

        // Guard against filenames exceeding Uint16 max (65535 bytes)
        if (filenameBytes.length > 0xFFFF) {
            throw new Error('Filename is too long to package.');
        }

        const totalSize =
            FilePackager.HEADER_SIZE +
            filenameBytes.length +
            salt.length +
            iv.length +
            ciphertext.length;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        let offset = 0;

        // Write magic bytes — "ENCR"
        bytes.set(FilePackager.MAGIC_BYTES, offset);
        offset += FilePackager.MAGIC_BYTES.length;

        // Write version
        view.setUint8(offset, FilePackager.VERSION);
        offset += 1;

        // Write filename length (big-endian Uint16)
        view.setUint16(offset, filenameBytes.length, false);
        offset += 2;

        // Write filename (UTF-8)
        bytes.set(filenameBytes, offset);
        offset += filenameBytes.length;

        // Write salt
        bytes.set(salt, offset);
        offset += salt.length;

        // Write IV
        bytes.set(iv, offset);
        offset += iv.length;

        // Write ciphertext
        bytes.set(ciphertext, offset);

        return buffer;
    }

    /**
     * Unpacks a .vault binary blob back into its component parts.
     *
     * Validates the magic header and version, then extracts the original
     * filename, salt, IV, and ciphertext for decryption.
     *
     * @param {ArrayBuffer} buffer - The raw .vault file content.
     * @returns {{ filename: string, salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array }}
     * @throws {Error} If the file is invalid, corrupted, or has an unsupported version.
     */
    unpackage(buffer) {
        const bytes = new Uint8Array(buffer);
        const view = new DataView(buffer);

        // Minimum size check — must at least contain the fixed header
        if (buffer.byteLength < FilePackager.HEADER_SIZE) {
            throw new Error(
                'Invalid file: too small to be a valid .vault encrypted file.'
            );
        }

        // Validate magic bytes
        for (let i = 0; i < FilePackager.MAGIC_BYTES.length; i++) {
            if (bytes[i] !== FilePackager.MAGIC_BYTES[i]) {
                throw new Error(
                    'Invalid file: this is not a .vault encrypted file. ' +
                    'Make sure you are selecting a file that was encrypted with this app.'
                );
            }
        }

        let offset = FilePackager.MAGIC_BYTES.length;

        // Read and validate version
        const version = view.getUint8(offset);
        if (version !== FilePackager.VERSION) {
            throw new Error(
                `Unsupported file format version: ${version}. ` +
                `This app supports version ${FilePackager.VERSION}.`
            );
        }
        offset += 1;

        // Read filename length
        const filenameLength = view.getUint16(offset, false);
        offset += 2;

        // Validate remaining size can hold filename + salt + IV + at least 1 byte of ciphertext
        const minimumRemaining =
            filenameLength +
            FilePackager.SALT_LENGTH +
            FilePackager.IV_LENGTH +
            1; // at least 1 byte of ciphertext

        if (buffer.byteLength - offset < minimumRemaining) {
            throw new Error(
                'Invalid file: the file appears to be corrupted or truncated.'
            );
        }

        // Read filename
        const decoder = new TextDecoder();
        const filename = decoder.decode(bytes.slice(offset, offset + filenameLength));
        offset += filenameLength;

        // Read salt
        const salt = bytes.slice(offset, offset + FilePackager.SALT_LENGTH);
        offset += FilePackager.SALT_LENGTH;

        // Read IV
        const iv = bytes.slice(offset, offset + FilePackager.IV_LENGTH);
        offset += FilePackager.IV_LENGTH;

        // Read ciphertext (everything remaining)
        const ciphertext = bytes.slice(offset);

        return { filename, salt, iv, ciphertext };
    }
}
