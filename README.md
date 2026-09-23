# Vault — File Encryptor & Decryptor

A secure, client-side file encryption and decryption web application built with **vanilla JavaScript (ES6 classes)**, HTML, and CSS. All cryptographic operations run entirely in the browser using the **Web Crypto API** — no data or passwords are ever sent to a server.

## Features

- **AES-GCM 256-bit encryption** — authenticated encryption that detects tampering
- **PBKDF2 key derivation** — 200,000 iterations with SHA-256 to resist brute-force attacks
- **Fresh random salt + IV** per encryption — same password + file = different ciphertext every time
- **Original filename preservation** — restored exactly on decryption
- **Drag-and-drop** or click-to-browse file selection
- **Password strength meter** — entropy-based evaluation with pattern, sequence, and repetition penalties
- **Light / Dark themes** — persisted via `localStorage`, respects system preference
- **Clear error messages** — wrong password, corrupted file, and format errors are all caught and displayed

## Architecture

The app follows strict **object-oriented design** with composition over inheritance:

```
FileEncryptorApp ──has-a──▸ CryptoEngine     (encryption / decryption)
                 ──has-a──▸ FilePackager      (binary format handling)
                 ──has-a──▸ ThemeManager      (UI theming)
```

### Classes

| Class | File | Responsibility |
|---|---|---|
| `CryptoEngine` | `js/CryptoEngine.js` | PBKDF2 key derivation, AES-GCM encrypt/decrypt via `crypto.subtle` |
| `FilePackager` | `js/FilePackager.js` | Serializes/deserializes the `.vault` binary format (magic header + metadata + ciphertext) |
| `ThemeManager` | `js/ThemeManager.js` | Light/dark theme toggle with `localStorage` persistence |
| `FileEncryptorApp` | `js/FileEncryptorApp.js` | UI controller — file handling, password input, strength meter, orchestrates encrypt/decrypt flows |

### Project Structure

```
OOPS_Project/
├── index.html                  # HTML entry point
├── css/
│   └── styles.css              # Theming + layout + component styles
├── js/
│   ├── CryptoEngine.js         # Crypto operations (Web Crypto API)
│   ├── FilePackager.js         # Binary .vault format handling
│   ├── ThemeManager.js         # Theme toggle + persistence
│   ├── FileEncryptorApp.js     # Main app controller
│   └── main.js                 # Bootstrap entry point
├── file_encryptor_prompt.md    # Original requirements
└── README.md                   # This file
```

## How to Run

Since the project uses **ES6 modules** (`import`/`export`), it needs to be served over HTTP (browsers block module imports from `file://`).

### Option 1: VS Code Live Server
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**

### Option 2: Python
```bash
cd OOPS_Project
python -m http.server 8080
# Open http://localhost:8080
```

### Option 3: Node.js
```bash
npx -y serve .
```

## .vault File Format

Encrypted files use a custom binary format:

| Field | Size | Description |
|---|---|---|
| Magic bytes | 4 bytes | `0x454E4352` ("ENCR") — identifies valid files |
| Version | 1 byte | `0x01` — format version |
| Filename length | 2 bytes | Big-endian `Uint16` — original filename byte length |
| Filename | N bytes | UTF-8 encoded original filename |
| Salt | 16 bytes | PBKDF2 salt |
| IV | 12 bytes | AES-GCM initialization vector |
| Ciphertext | remaining | AES-GCM encrypted + authenticated data |

## Security Details

- **Algorithm**: AES-GCM with 256-bit keys
- **Key Derivation**: PBKDF2 with 200,000 iterations and SHA-256
- **Salt**: 16 bytes (128-bit), randomly generated per encryption
- **IV**: 12 bytes (96-bit), randomly generated per encryption (NIST recommended for AES-GCM)
- **Authentication**: AES-GCM is an AEAD cipher — decryption fails cleanly on wrong password or tampered data (no garbled output)
- **Client-side only**: All operations use `crypto.subtle` — nothing leaves the browser

## License

MIT
