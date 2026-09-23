import { CryptoEngine } from './CryptoEngine.js';
import { FilePackager } from './FilePackager.js';
import { ThemeManager } from './ThemeManager.js';

/**
 * FileEncryptorApp — Main UI controller and orchestrator.
 *
 * Composes CryptoEngine, FilePackager, and ThemeManager to deliver the
 * complete encrypt/decrypt workflow. Owns all DOM interaction, file
 * selection state, password handling, and user feedback. Contains no
 * crypto logic itself — delegates to CryptoEngine for security and
 * FilePackager for binary format concerns.
 *
 * Composition:
 *   FileEncryptorApp ──has-a──▸ CryptoEngine
 *                     ──has-a──▸ FilePackager
 *                     ──has-a──▸ ThemeManager
 */
export class FileEncryptorApp {

    /** Maximum allowed file size in bytes (100 MB) */
    static MAX_FILE_SIZE = 100 * 1024 * 1024;

    /** Extension appended to encrypted output files */
    static ENCRYPTED_EXTENSION = '.vault';

    /** Common password patterns that trigger entropy penalties */
    static COMMON_PATTERNS = [
        'password', '123456', 'qwerty', 'letmein', 'admin', 'welcome',
        'monkey', 'dragon', 'master', 'login', 'abc123', 'shadow',
        'sunshine', 'trustno1', 'iloveyou', 'passw0rd', '1234567890',
    ];

    /** Common keyboard sequences for pattern detection */
    static KEYBOARD_ROWS = [
        'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
        '1234567890', '0987654321',
    ];

    /** SVG icon for the "show password" state (eye) */
    static EYE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

    /** SVG icon for the "hide password" state (eye-off) */
    static EYE_OFF_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    constructor() {
        // Compose dependencies — no inheritance
        this.cryptoEngine = new CryptoEngine();
        this.filePackager = new FilePackager();
        this.themeManager = new ThemeManager('theme-toggle');

        // Application state
        this.selectedFile = null;
        this.mode = 'encrypt'; // 'encrypt' or 'decrypt'
        this.isProcessing = false;
        this.passwordVisible = false;

        this._cacheDOM();
        this._bindEvents();

        // Support PWA shortcuts — check for ?mode=decrypt in URL
        const urlMode = new URLSearchParams(window.location.search).get('mode');
        if (urlMode === 'decrypt') {
            this.mode = 'decrypt';
        }

        this._updateUI();
    }

    // ══════════════════════════════════════════════════════════════
    //  DOM & Event Setup
    // ══════════════════════════════════════════════════════════════

    /**
     * Caches references to all DOM elements the app interacts with.
     * @private
     */
    _cacheDOM() {
        // Mode tabs
        this.encryptTab = document.getElementById('encrypt-tab');
        this.decryptTab = document.getElementById('decrypt-tab');

        // File area
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.fileInfo = document.getElementById('file-info');
        this.fileName = document.getElementById('file-name');
        this.fileSize = document.getElementById('file-size');
        this.clearFileBtn = document.getElementById('clear-file');

        // Password
        this.passwordInput = document.getElementById('password-input');
        this.passwordToggle = document.getElementById('password-toggle');
        this.strengthBar = document.getElementById('strength-bar');
        this.strengthText = document.getElementById('strength-text');
        this.strengthEntropy = document.getElementById('strength-entropy');

        // Action
        this.actionBtn = document.getElementById('action-btn');
        this.actionText = document.getElementById('action-text');
        this.actionSpinner = document.getElementById('action-spinner');

        // Status
        this.statusArea = document.getElementById('status-area');
        this.statusMessage = document.getElementById('status-message');
    }

    /**
     * Binds all event listeners.
     * @private
     */
    _bindEvents() {
        // Mode switching
        this.encryptTab.addEventListener('click', () => this._setMode('encrypt'));
        this.decryptTab.addEventListener('click', () => this._setMode('decrypt'));

        // File selection — drag-and-drop
        this.dropZone.addEventListener('dragover', (e) => this._onDragOver(e));
        this.dropZone.addEventListener('dragleave', (e) => this._onDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this._onDrop(e));
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.fileInput.click();
            }
        });

        // File selection — browse
        this.fileInput.addEventListener('change', (e) => this._onFileSelect(e));

        // Clear file
        this.clearFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._clearFile();
        });

        // Password
        this.passwordInput.addEventListener('input', () => this._onPasswordInput());
        this.passwordToggle.addEventListener('click', () => this._togglePasswordVisibility());

        // Action
        this.actionBtn.addEventListener('click', () => this._executeAction());
    }

    // ══════════════════════════════════════════════════════════════
    //  Mode Switching
    // ══════════════════════════════════════════════════════════════

    /**
     * Switches between encrypt and decrypt modes.
     *
     * @param {'encrypt'|'decrypt'} mode
     * @private
     */
    _setMode(mode) {
        if (this.mode === mode || this.isProcessing) return;

        this.mode = mode;

        // Reset state when switching modes
        this._clearFile();
        this._clearStatus();
        this.passwordInput.value = '';
        this._onPasswordInput();

        this._updateUI();
    }

    // ══════════════════════════════════════════════════════════════
    //  File Handling
    // ══════════════════════════════════════════════════════════════

    /**
     * @param {DragEvent} e
     * @private
     */
    _onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('drag-over');
    }

    /**
     * @param {DragEvent} e
     * @private
     */
    _onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('drag-over');
    }

    /**
     * @param {DragEvent} e
     * @private
     */
    _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this._handleFile(files[0]);
        }
    }

    /**
     * @param {Event} e
     * @private
     */
    _onFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this._handleFile(files[0]);
        }
    }

    /**
     * Validates and stores the selected file.
     *
     * @param {File} file
     * @private
     */
    _handleFile(file) {
        // Check file size
        if (file.size > FileEncryptorApp.MAX_FILE_SIZE) {
            this._showStatus(
                'error',
                'File too large',
                `Maximum file size is ${this._formatFileSize(FileEncryptorApp.MAX_FILE_SIZE)}. ` +
                `Your file is ${this._formatFileSize(file.size)}.`
            );
            return;
        }

        if (file.size === 0) {
            this._showStatus('error', 'Empty file', 'The selected file is empty.');
            return;
        }

        this.selectedFile = file;
        this._clearStatus();
        this._updateFileDisplay();
        this._updateActionButton();
    }

    /**
     * Clears the selected file and resets the file display.
     * @private
     */
    _clearFile() {
        this.selectedFile = null;
        this.fileInput.value = '';
        this._updateFileDisplay();
        this._updateActionButton();
    }

    // ══════════════════════════════════════════════════════════════
    //  Password Handling
    // ══════════════════════════════════════════════════════════════

    /**
     * Called on every keystroke in the password field.
     * @private
     */
    _onPasswordInput() {
        const password = this.passwordInput.value;
        this._updateStrengthIndicator(password);
        this._updateActionButton();
    }

    /**
     * Toggles password field between visible text and hidden dots.
     * @private
     */
    _togglePasswordVisibility() {
        this.passwordVisible = !this.passwordVisible;

        this.passwordInput.type = this.passwordVisible ? 'text' : 'password';
        this.passwordToggle.innerHTML =
            `<span class="icon">${this.passwordVisible ? FileEncryptorApp.EYE_OFF_ICON : FileEncryptorApp.EYE_ICON}</span>`;
        this.passwordToggle.setAttribute(
            'aria-label',
            this.passwordVisible ? 'Hide password' : 'Show password'
        );
    }

    // ══════════════════════════════════════════════════════════════
    //  Password Strength — Entropy-Based Evaluation
    // ══════════════════════════════════════════════════════════════

    /**
     * Evaluates password strength using entropy estimation with penalties
     * for common patterns, repetition, and keyboard sequences.
     *
     * This is more sophisticated than a simple "has uppercase + number"
     * check — it estimates the actual bits of entropy and penalizes
     * predictable structures that reduce real-world security.
     *
     * @param {string} password - The password to evaluate.
     * @returns {{ score: number, label: string, entropy: number }}
     *   score: 0–4 (Very Weak → Very Strong)
     *   label: Human-readable strength label
     *   entropy: Estimated bits of entropy
     */
    _evaluateStrength(password) {
        if (!password) {
            return { score: 0, label: '', entropy: 0 };
        }

        // Step 1: Calculate character pool size
        let poolSize = 0;
        if (/[a-z]/.test(password)) poolSize += 26;
        if (/[A-Z]/.test(password)) poolSize += 26;
        if (/[0-9]/.test(password)) poolSize += 10;
        if (/[^a-zA-Z0-9]/.test(password)) poolSize += 33;

        // Step 2: Base entropy = length × log2(pool)
        let entropy = password.length * Math.log2(poolSize || 1);

        // Step 3: Penalty — repeated characters reduce effective entropy
        const charFrequency = {};
        for (const ch of password) {
            charFrequency[ch] = (charFrequency[ch] || 0) + 1;
        }
        const uniqueRatio = Object.keys(charFrequency).length / password.length;
        if (uniqueRatio < 0.5) {
            entropy *= 0.5 + uniqueRatio;  // Heavy penalty for mostly-repeated chars
        }

        // Step 4: Penalty — sequential characters (abc, 123, cba, 321)
        let sequentialRuns = 0;
        for (let i = 0; i < password.length - 2; i++) {
            const a = password.charCodeAt(i);
            const b = password.charCodeAt(i + 1);
            const c = password.charCodeAt(i + 2);

            if ((b - a === 1 && c - b === 1) || (a - b === 1 && b - c === 1)) {
                sequentialRuns++;
            }
        }
        if (sequentialRuns > 0) {
            entropy *= Math.max(0.4, 1 - sequentialRuns * 0.1);
        }

        // Step 5: Penalty — keyboard row sequences (qwerty, asdf, etc.)
        const lower = password.toLowerCase();
        for (const row of FileEncryptorApp.KEYBOARD_ROWS) {
            for (let len = 4; len <= password.length; len++) {
                for (let start = 0; start <= row.length - len; start++) {
                    const seq = row.substring(start, start + len);
                    if (lower.includes(seq)) {
                        entropy *= 0.4;
                        break;
                    }
                }
            }
        }

        // Step 6: Penalty — common password patterns
        for (const pattern of FileEncryptorApp.COMMON_PATTERNS) {
            if (lower.includes(pattern)) {
                entropy *= 0.2;
                break;
            }
        }

        // Step 7: Bonus — extra length beyond 16 characters
        if (password.length > 16) {
            entropy *= 1 + (password.length - 16) * 0.02;
        }

        entropy = Math.max(0, Math.round(entropy));

        // Map entropy to a 0–4 score
        let score, label;
        if (entropy < 25) {
            score = 0;
            label = 'Very Weak';
        } else if (entropy < 40) {
            score = 1;
            label = 'Weak';
        } else if (entropy < 60) {
            score = 2;
            label = 'Fair';
        } else if (entropy < 80) {
            score = 3;
            label = 'Strong';
        } else {
            score = 4;
            label = 'Very Strong';
        }

        return { score, label, entropy };
    }

    /**
     * Updates the strength bar and label in the DOM.
     *
     * @param {string} password
     * @private
     */
    _updateStrengthIndicator(password) {
        const { score, label, entropy } = this._evaluateStrength(password);

        // Width: each score level = 20%
        const width = password ? Math.max(4, (score + 1) * 20) : 0;

        this.strengthBar.style.width = `${width}%`;
        this.strengthBar.setAttribute('data-score', score);
        this.strengthText.textContent = label;
        this.strengthText.setAttribute('data-score', score);
        this.strengthEntropy.textContent = password ? `${entropy} bits` : '';
    }

    // ══════════════════════════════════════════════════════════════
    //  Encrypt / Decrypt Execution
    // ══════════════════════════════════════════════════════════════

    /**
     * Executes the current mode's action (encrypt or decrypt).
     * @private
     */
    async _executeAction() {
        if (this.isProcessing || !this.selectedFile || !this.passwordInput.value) {
            return;
        }

        this._setProcessing(true);
        this._clearStatus();

        try {
            if (this.mode === 'encrypt') {
                await this._encryptFile();
            } else {
                await this._decryptFile();
            }
        } catch (error) {
            this._showStatus('error', 'Operation failed', error.message);
        } finally {
            this._setProcessing(false);
        }
    }

    /**
     * Reads the selected file, encrypts it, packages the result, and
     * triggers a download of the .vault file.
     * @private
     */
    async _encryptFile() {
        const fileData = await this._readFile(this.selectedFile);
        const password = this.passwordInput.value;

        // Encrypt the raw file data
        const { ciphertext, salt, iv } = await this.cryptoEngine.encrypt(fileData, password);

        // Package everything into a single .vault blob
        const packagedData = this.filePackager.package(
            this.selectedFile.name,
            salt,
            iv,
            ciphertext
        );

        // Trigger download
        const outputName = this.selectedFile.name + FileEncryptorApp.ENCRYPTED_EXTENSION;
        this._downloadFile(packagedData, outputName);

        this._showStatus(
            'success',
            'File encrypted successfully',
            `Saved as "${outputName}" (${this._formatFileSize(packagedData.byteLength)})`
        );
    }

    /**
     * Reads the selected .vault file, unpacks it, decrypts the contents,
     * and triggers a download with the original filename restored.
     * @private
     */
    async _decryptFile() {
        const fileData = await this._readFile(this.selectedFile);
        const password = this.passwordInput.value;

        // Unpackage — validates format and extracts parts
        const { filename, salt, iv, ciphertext } = this.filePackager.unpackage(fileData);

        // Decrypt the ciphertext
        const decryptedData = await this.cryptoEngine.decrypt(ciphertext, password, salt, iv);

        // Trigger download with the original filename
        this._downloadFile(decryptedData.buffer, filename);

        this._showStatus(
            'success',
            'File decrypted successfully',
            `Original file "${filename}" has been restored (${this._formatFileSize(decryptedData.byteLength)})`
        );
    }

    // ══════════════════════════════════════════════════════════════
    //  UI Updates
    // ══════════════════════════════════════════════════════════════

    /**
     * Updates all dynamic UI elements to reflect current state.
     * @private
     */
    _updateUI() {
        // Tab states
        this.encryptTab.classList.toggle('active', this.mode === 'encrypt');
        this.decryptTab.classList.toggle('active', this.mode === 'decrypt');
        this.encryptTab.setAttribute('aria-selected', this.mode === 'encrypt');
        this.decryptTab.setAttribute('aria-selected', this.mode === 'decrypt');

        // Update action button label
        this.actionText.textContent = this.mode === 'encrypt' ? 'Encrypt File' : 'Decrypt File';

        // Update drop zone hint for decrypt mode
        const dropHint = this.dropZone.querySelector('.drop-hint');
        if (dropHint) {
            dropHint.textContent = this.mode === 'decrypt'
                ? 'Select a .vault file to decrypt'
                : 'Any file type supported';
        }

        this._updateFileDisplay();
        this._updateActionButton();
    }

    /**
     * Toggles between the drop zone and file info display.
     * @private
     */
    _updateFileDisplay() {
        if (this.selectedFile) {
            this.dropZone.classList.add('has-file');
            this.fileInfo.classList.remove('hidden');
            this.fileName.textContent = this.selectedFile.name;
            this.fileSize.textContent = this._formatFileSize(this.selectedFile.size);
        } else {
            this.dropZone.classList.remove('has-file');
            this.fileInfo.classList.add('hidden');
            this.fileName.textContent = '';
            this.fileSize.textContent = '';
        }
    }

    /**
     * Enables/disables the action button based on whether all inputs are filled.
     * @private
     */
    _updateActionButton() {
        const canAct = this.selectedFile && this.passwordInput.value.length > 0 && !this.isProcessing;
        this.actionBtn.disabled = !canAct;
    }

    /**
     * Toggles the processing state — shows/hides spinner, disables inputs.
     *
     * @param {boolean} processing
     * @private
     */
    _setProcessing(processing) {
        this.isProcessing = processing;

        this.actionBtn.classList.toggle('processing', processing);
        this.actionSpinner.classList.toggle('hidden', !processing);
        this.actionText.textContent = processing
            ? (this.mode === 'encrypt' ? 'Encrypting…' : 'Decrypting…')
            : (this.mode === 'encrypt' ? 'Encrypt File' : 'Decrypt File');

        this.passwordInput.disabled = processing;
        this.fileInput.disabled = processing;
        this._updateActionButton();
    }

    /**
     * Displays a status message (success or error).
     *
     * @param {'success'|'error'} type
     * @param {string} title
     * @param {string} detail
     * @private
     */
    _showStatus(type, title, detail) {
        const icon = type === 'success' ? '✓' : '✕';

        this.statusMessage.className = `status-message ${type}`;
        this.statusMessage.innerHTML = `
            <span class="status-icon">${icon}</span>
            <div class="status-content">
                <div class="status-title">${this._escapeHTML(title)}</div>
                ${detail ? `<div class="status-detail">${this._escapeHTML(detail)}</div>` : ''}
            </div>
        `;
        this.statusArea.classList.remove('hidden');
    }

    /**
     * Hides the status area.
     * @private
     */
    _clearStatus() {
        this.statusArea.classList.add('hidden');
    }

    // ══════════════════════════════════════════════════════════════
    //  Utility Methods
    // ══════════════════════════════════════════════════════════════

    /**
     * Reads a File object as an ArrayBuffer.
     *
     * @param {File} file
     * @returns {Promise<ArrayBuffer>}
     * @private
     */
    _readFile(file) {
        return file.arrayBuffer();
    }

    /**
     * Triggers a browser download of an ArrayBuffer with a given filename.
     *
     * @param {ArrayBuffer} data
     * @param {string} filename
     * @private
     */
    _downloadFile(data, filename) {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Formats a byte count into a human-readable string (B, KB, MB, GB).
     *
     * @param {number} bytes
     * @returns {string}
     * @private
     */
    _formatFileSize(bytes) {
        if (bytes === 0) return '0 B';

        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = bytes / Math.pow(1024, i);

        return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }

    /**
     * Escapes HTML special characters to prevent XSS in status messages.
     *
     * @param {string} str
     * @returns {string}
     * @private
     */
    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
