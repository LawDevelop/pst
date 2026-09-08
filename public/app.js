/**
 * PST Görüntüleyici Pro - İstemci Uygulaması (Frontend Logic)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Lucide Icons Init
    lucide.createIcons();

    // App State
    const state = {
        isLoaded: false,
        fileInfo: null,
        folderTree: [],
        currentFolderId: null,
        currentFolderTitle: 'Tüm E-Postalar',
        currentFilter: 'all', // all, photos, attachments
        currentSort: 'date_desc',
        searchQuery: '',
        currentPage: 1,
        totalPages: 1,
        messages: [],
        selectedMessageId: null,
        selectedMessageData: null,
        // Gallery State
        galleryPhotos: [],
        galleryPage: 1,
        galleryTotalPages: 1,
        gallerySearch: '',
        currentLightboxIndex: -1,
        // Theme
        theme: localStorage.getItem('pst_theme') || 'light'
    };

    // DOM Elements Cache
    const el = {
        app: document.getElementById('app'),
        activeFilePill: document.getElementById('active-file-pill'),
        activeFilename: document.getElementById('active-filename'),
        activeFilesize: document.getElementById('active-filesize'),
        activeItemCount: document.getElementById('active-item-count'),
        btnOpenDialog: document.getElementById('btn-open-dialog'),
        btnToggleGallery: document.getElementById('btn-toggle-gallery'),
        galleryBadgeCount: document.getElementById('gallery-badge-count'),
        btnExportModal: document.getElementById('btn-export-modal'),
        btnToggleTheme: document.getElementById('btn-toggle-theme'),
        themeIcon: document.getElementById('theme-icon'),
        
        // Views
        welcomeView: document.getElementById('welcome-view'),
        explorerView: document.getElementById('explorer-view'),
        galleryView: document.getElementById('gallery-view'),
        
        // Welcome View Elements
        dropZone: document.getElementById('drop-zone'),
        btnBrowseFile: document.getElementById('btn-browse-file'),
        fileInputNative: document.getElementById('file-input-native'),
        btnUploadFile: document.getElementById('btn-upload-file'),
        manualPathInput: document.getElementById('manual-path-input'),
        btnOpenPath: document.getElementById('btn-open-path'),
        btnLoadSample: document.getElementById('btn-load-sample'),
        
        // Sidebar Elements
        navAllEmails: document.getElementById('nav-all-emails'),
        navAllPhotos: document.getElementById('nav-all-photos'),
        navWithAttachments: document.getElementById('nav-with-attachments'),
        badgeTotalEmails: document.getElementById('badge-total-emails'),
        badgeTotalPhotos: document.getElementById('badge-total-photos'),
        badgeTotalAttachments: document.getElementById('badge-total-attachments'),
        folderTreeContainer: document.getElementById('folder-tree-container'),
        btnExportQuick: document.getElementById('btn-export-quick'),
        
        // Message List Elements
        mailSearchInput: document.getElementById('mail-search-input'),
        btnClearSearch: document.getElementById('btn-clear-search'),
        filterChips: document.querySelectorAll('.filter-chips .chip'),
        sortSelect: document.getElementById('sort-select'),
        messagesCountLabel: document.getElementById('messages-count-label'),
        currentFolderLabel: document.getElementById('current-folder-label'),
        messageListContainer: document.getElementById('message-list-container'),
        btnPagePrev: document.getElementById('btn-page-prev'),
        btnPageNext: document.getElementById('btn-page-next'),
        paginationLabel: document.getElementById('pagination-label'),
        
        // Reader Elements
        readerEmptyState: document.getElementById('reader-empty-state'),
        readerContent: document.getElementById('reader-content'),
        mailSubject: document.getElementById('mail-subject'),
        mailSenderAvatar: document.getElementById('mail-sender-avatar'),
        mailSenderName: document.getElementById('mail-sender-name'),
        mailSenderEmail: document.getElementById('mail-sender-email'),
        mailRecipientTo: document.getElementById('mail-recipient-to'),
        mailRecipientCcRow: document.getElementById('mail-recipient-cc-row'),
        mailRecipientCc: document.getElementById('mail-recipient-cc'),
        mailDate: document.getElementById('mail-date'),
        btnDownloadEml: document.getElementById('btn-download-eml'),
        btnDownloadHtml: document.getElementById('btn-download-html'),
        btnPrintMail: document.getElementById('btn-print-mail'),
        attachmentsSection: document.getElementById('attachments-section'),
        attachmentsCountTitle: document.getElementById('attachments-count-title'),
        attachmentsGrid: document.getElementById('attachments-grid'),
        btnDownloadAllAttachments: document.getElementById('btn-download-all-attachments'),
        bodyTabs: document.querySelectorAll('.body-tab'),
        mailBodyIframe: document.getElementById('mail-body-iframe'),
        mailBodyText: document.getElementById('mail-body-text'),
        mailBodyHeaders: document.getElementById('mail-body-headers'),
        
        // Gallery Elements
        btnBackToExplorer: document.getElementById('btn-back-to-explorer'),
        galleryTotalCountLabel: document.getElementById('gallery-total-count-label'),
        gallerySearchInput: document.getElementById('gallery-search-input'),
        btnDownloadAllPhotosZip: document.getElementById('btn-download-all-photos-zip'),
        btnExportPhotosDisk: document.getElementById('btn-export-photos-disk'),
        galleryGrid: document.getElementById('gallery-grid'),
        btnGalleryPrev: document.getElementById('btn-gallery-prev'),
        btnGalleryNext: document.getElementById('btn-gallery-next'),
        galleryPaginationLabel: document.getElementById('gallery-pagination-label'),
        
        // Lightbox Elements
        lightboxModal: document.getElementById('lightbox-modal'),
        lightboxBackdrop: document.getElementById('lightbox-backdrop'),
        lightboxClose: document.getElementById('lightbox-close'),
        lightboxPrev: document.getElementById('lightbox-prev'),
        lightboxNext: document.getElementById('lightbox-next'),
        lightboxImage: document.getElementById('lightbox-image'),
        lightboxFilename: document.getElementById('lightbox-filename'),
        lightboxSize: document.getElementById('lightbox-size'),
        lightboxType: document.getElementById('lightbox-type'),
        lightboxFolder: document.getElementById('lightbox-folder'),
        lightboxSender: document.getElementById('lightbox-sender'),
        lightboxDate: document.getElementById('lightbox-date'),
        lightboxSubject: document.getElementById('lightbox-subject'),
        lightboxBtnDownload: document.getElementById('lightbox-btn-download'),
        lightboxBtnGotoMail: document.getElementById('lightbox-btn-goto-mail'),
        
        // Export Modal Elements
        exportModal: document.getElementById('export-modal'),
        exportModalBackdrop: document.getElementById('export-modal-backdrop'),
        exportModalClose: document.getElementById('export-modal-close'),
        exportDiskPath: document.getElementById('export-disk-path'),
        btnBrowseExportFolder: document.getElementById('btn-browse-export-folder'),
        btnStartDiskExport: document.getElementById('btn-start-disk-export'),
        
        // Misc
        toastContainer: document.getElementById('toast-container'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text')
    };

    // Apply saved theme
    applyTheme(state.theme);

    // ==========================================================
    // Core Functions: Loading & Status & Safe Fetch
    // ==========================================================

    function showLoading(text = 'Yükleniyor...') {
        el.loadingText.textContent = text;
        el.loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        el.loadingOverlay.classList.add('hidden');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info'}"></i>
            <span>${message}</span>
        `;
        el.toastContainer.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    function applyTheme(theme) {
        state.theme = theme;
        document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
        localStorage.setItem('pst_theme', theme);
        el.themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        lucide.createIcons();
    }

    el.btnToggleTheme.addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    // Helper: Safe Fetch with JSON parsing & error handling
    async function safeFetchJson(url, options = {}) {
        let res;
        try {
            res = await fetch(url, options);
        } catch (networkErr) {
            throw new Error('Sunucu ile bağlantı kurulamadı: ' + networkErr.message);
        }

        const rawText = await res.text();
        let data = null;
        try {
            data = JSON.parse(rawText);
        } catch {
            if (!res.ok) {
                throw new Error(`Hata kodu ${res.status}: ${rawText.substring(0, 200)}`);
            } else {
                throw new Error('Sunucudan geçersiz veri alındı.');
            }
        }

        if (!res.ok || (data && data.error)) {
            throw new Error(data.error || `İşlem başarısız (Kod ${res.status})`);
        }

        return data;
    }

    // ==========================================================
    // PST File Opening
    // ==========================================================

    async function openPstPath(filePath) {
        if (!filePath) return;
        showLoading('PST Dosyası Açılıyor ve İndeksleniyor...');

        try {
            const data = await safeFetchJson('/api/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath })
            });

            handlePstOpened(data);
            showToast(`"${data.fileName}" başarıyla yüklendi! (${data.totalEmails} e-posta)`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async function openPstUpload(file) {
        if (!file) return;
        showLoading(`"${file.name}" yükleniyor...`);

        try {
            const formData = new FormData();
            formData.append('pstFile', file);

            const data = await safeFetchJson('/api/upload', {
                method: 'POST',
                body: formData
            });

            handlePstOpened(data);
            showToast(`"${data.fileName}" başarıyla yüklendi!`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    function handlePstOpened(data) {
        state.isLoaded = true;
        state.fileInfo = data;
        state.folderTree = data.folderTree;
        state.currentFolderId = null;
        state.currentFolderTitle = 'Tüm E-Postalar';
        state.currentPage = 1;
        state.selectedMessageId = null;

        // Update Header Pill
        el.activeFilename.textContent = data.fileName;
        el.activeFilesize.textContent = data.formattedFileSize;
        el.activeItemCount.textContent = `${data.totalEmails.toLocaleString()} E-posta`;
        el.activeFilePill.classList.remove('hidden');
        el.btnToggleGallery.classList.remove('hidden');
        el.btnExportModal.classList.remove('hidden');

        // Update Badges
        el.badgeTotalEmails.textContent = data.totalEmails.toLocaleString();
        el.badgeTotalPhotos.textContent = '...';
        el.badgeTotalAttachments.textContent = '...';

        // Switch to Explorer View
        el.welcomeView.classList.add('hidden');
        el.galleryView.classList.add('hidden');
        el.explorerView.classList.remove('hidden');

        // Render Folder Tree
        renderFolderTree(data.folderTree);

        // Fetch Messages
        fetchMessages();

        // Refresh stats (total photos etc.) after a short delay
        setTimeout(checkPstStatus, 800);
    }

    async function checkPstStatus() {
        try {
            const data = await safeFetchJson('/api/status');
            if (data.isLoaded) {
                el.badgeTotalPhotos.textContent = data.totalPhotos.toLocaleString();
                el.badgeTotalAttachments.textContent = data.totalAttachments.toLocaleString();
                el.galleryBadgeCount.textContent = data.totalPhotos.toLocaleString();
            }
        } catch (e) {
            console.error('Status check error:', e);
        }
    }

    // Windows Native File Dialog Trigger
    async function browseWindowsFile() {
        try {
            showLoading('Windows dosya seçici açılıyor, lütfen PST dosyanızı seçin...');
            const data = await safeFetchJson('/api/system/browse-pst');
            hideLoading();
            if (data && data.selectedPath) {
                openPstPath(data.selectedPath);
            }
        } catch {
            hideLoading();
            el.fileInputNative.click();
        }
    }

    // Event Listeners for File Opening
    el.btnBrowseFile.addEventListener('click', browseWindowsFile);
    el.btnOpenDialog.addEventListener('click', browseWindowsFile);

    el.btnUploadFile.addEventListener('click', () => el.fileInputNative.click());
    el.fileInputNative.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            openPstUpload(e.target.files[0]);
        }
    });

    el.btnOpenPath.addEventListener('click', () => {
        const p = el.manualPathInput.value.trim();
        if (p) openPstPath(p);
    });

    el.manualPathInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const p = el.manualPathInput.value.trim();
            if (p) openPstPath(p);
        }
    });

    // Sample Test File Quick Loader
    el.btnLoadSample.addEventListener('click', () => {
        openPstPath('node_modules/pst-extractor/example/testdata/enron.pst');
    });

    // Drag and Drop support
    el.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropZone.classList.add('dragover');
    });
    el.dropZone.addEventListener('dragleave', () => {
        el.dropZone.classList.remove('dragover');
    });
    el.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            openPstUpload(e.dataTransfer.files[0]);
        }
    });

    // ==========================================================
    // Sidebar & Folder Tree
    // ==========================================================

    function renderFolderTree(treeNodes) {
        el.folderTreeContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();

        function buildNode(node) {
            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'tree-node';

            const rowDiv = document.createElement('div');
            rowDiv.className = 'tree-row';
            rowDiv.dataset.folderId = node.id;
            if (state.currentFolderId === node.id) {
                rowDiv.classList.add('active');
            }

            const hasSub = node.children && node.children.length > 0;

            rowDiv.innerHTML = `
                <span class="tree-toggle">${hasSub ? '<i data-lucide="chevron-right" class="toggle-icon"></i>' : ''}</span>
                <i data-lucide="${hasSub ? 'folder' : 'folder-closed'}" class="tree-icon"></i>
                <span class="tree-name" title="${node.fullPath}">${node.name}</span>
                ${node.contentCount > 0 ? `<span class="tree-count">${node.contentCount}</span>` : ''}
            `;

            rowDiv.addEventListener('click', (e) => {
                // Check if toggle clicked
                if (e.target.closest('.tree-toggle') && hasSub) {
                    const childrenDiv = nodeDiv.querySelector('.tree-children');
                    const toggleIcon = rowDiv.querySelector('.toggle-icon');
                    if (childrenDiv) {
                        const isHidden = childrenDiv.classList.toggle('hidden');
                        if (toggleIcon) {
                            toggleIcon.setAttribute('data-lucide', isHidden ? 'chevron-right' : 'chevron-down');
                            lucide.createIcons();
                        }
                    }
                    return;
                }

                // Select Folder
                selectFolder(node.id, node.name);
            });

            nodeDiv.appendChild(rowDiv);

            if (hasSub) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-children hidden';
                node.children.forEach(child => {
                    childrenContainer.appendChild(buildNode(child));
                });
                nodeDiv.appendChild(childrenContainer);
            }

            return nodeDiv;
        }

        treeNodes.forEach(node => {
            fragment.appendChild(buildNode(node));
        });

        el.folderTreeContainer.appendChild(fragment);
        lucide.createIcons();
    }

    function selectFolder(folderId, folderTitle) {
        state.currentFolderId = folderId;
        state.currentFolderTitle = folderTitle || 'Tüm Klasörler';
        state.currentPage = 1;

        // Update active class on tree rows
        document.querySelectorAll('.tree-row').forEach(r => {
            r.classList.toggle('active', r.dataset.folderId === folderId);
        });

        // Deselect quick nav items
        document.querySelectorAll('.quick-nav-section .nav-item').forEach(n => n.classList.remove('active'));

        el.currentFolderLabel.textContent = state.currentFolderTitle;
        fetchMessages();
    }

    // Quick Nav Clicks
    el.navAllEmails.addEventListener('click', () => {
        state.currentFolderId = null;
        state.currentFilter = 'all';
        state.currentFolderTitle = 'Tüm E-Postalar';
        setActiveNav(el.navAllEmails);
        syncFilterChips();
        fetchMessages();
    });

    el.navAllPhotos.addEventListener('click', () => {
        switchToGalleryView();
    });

    el.navWithAttachments.addEventListener('click', () => {
        state.currentFolderId = null;
        state.currentFilter = 'attachments';
        state.currentFolderTitle = 'Ekli E-Postalar';
        setActiveNav(el.navWithAttachments);
        syncFilterChips();
        fetchMessages();
    });

    function setActiveNav(navElement) {
        document.querySelectorAll('.quick-nav-section .nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('active'));
        navElement.classList.add('active');
        el.currentFolderLabel.textContent = state.currentFolderTitle;
    }

    function syncFilterChips() {
        el.filterChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === state.currentFilter);
        });
    }

    // ==========================================================
    // Messages List & Searching & Filtering
    // ==========================================================

    async function fetchMessages() {
        if (!state.isLoaded) return;

        el.messageListContainer.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                <div class="spinner" style="width: 28px; height: 28px; margin: 0 auto 12px auto;"></div>
                <span>E-postalar yükleniyor...</span>
            </div>
        `;

        try {
            const params = new URLSearchParams({
                page: state.currentPage,
                limit: 50,
                filter: state.currentFilter,
                sortBy: state.currentSort
            });
            if (state.currentFolderId) params.append('folderId', state.currentFolderId);
            if (state.searchQuery) params.append('search', state.searchQuery);

            const data = await safeFetchJson(`/api/messages?${params.toString()}`);

            state.messages = data.messages;
            state.totalPages = data.totalPages || 1;
            state.currentPage = data.page || 1;

            el.messagesCountLabel.textContent = `${data.totalCount.toLocaleString()} e-posta bulundu`;
            el.paginationLabel.textContent = `Sayfa ${state.currentPage} / ${state.totalPages}`;
            el.btnPagePrev.disabled = state.currentPage <= 1;
            el.btnPageNext.disabled = state.currentPage >= state.totalPages;

            renderMessageList(data.messages);
        } catch (err) {
            el.messageListContainer.innerHTML = `
                <div style="padding: 30px; text-align: center; color: var(--danger);">
                    <i data-lucide="alert-circle" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                    <p>${err.message}</p>
                </div>
            `;
            lucide.createIcons();
        }
    }

    function renderMessageList(messages) {
        el.messageListContainer.innerHTML = '';
        if (messages.length === 0) {
            el.messageListContainer.innerHTML = `
                <div style="padding: 60px 20px; text-align: center; color: var(--text-muted);">
                    <i data-lucide="inbox" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <h4>Hiç e-posta bulunamadı</h4>
                    <p style="font-size: 12px; margin-top: 4px;">Seçilen kriterlere uygun mesaj bulunmuyor.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const fragment = document.createDocumentFragment();

        messages.forEach(msg => {
            const card = document.createElement('div');
            card.className = `mail-card ${state.selectedMessageId === msg.id ? 'selected' : ''}`;
            card.dataset.msgId = msg.id;

            const senderDisplay = msg.senderName || msg.senderEmail || 'Bilinmeyen Gönderen';
            const dateDisplay = msg.date ? msg.date.formatted : '';

            card.innerHTML = `
                <div class="mail-card-header">
                    <span class="mail-card-sender" title="${senderDisplay}">${escapeHtml(senderDisplay)}</span>
                    <span class="mail-card-date">${dateDisplay}</span>
                </div>
                <div class="mail-card-subject" title="${escapeHtml(msg.subject)}">${escapeHtml(msg.subject)}</div>
                <div class="mail-card-snippet">${escapeHtml(msg.snippet || '')}</div>
                ${(msg.hasAttachments || msg.hasPhotos) ? `
                    <div class="mail-card-badges">
                        ${msg.hasPhotos ? `
                            <span class="badge-att photo">
                                <i data-lucide="image" style="width: 12px; height: 12px;"></i> ${msg.photoCount} Fotoğraf
                            </span>
                        ` : ''}
                        ${(msg.attachmentCount > msg.photoCount) ? `
                            <span class="badge-att">
                                <i data-lucide="paperclip" style="width: 12px; height: 12px;"></i> ${msg.attachmentCount} Ek
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
            `;

            card.addEventListener('click', () => {
                selectMessage(msg.folderId, msg.index, msg.id);
            });

            fragment.appendChild(card);
        });

        el.messageListContainer.appendChild(fragment);
        lucide.createIcons();
    }

    // Search and Filters
    let searchDebounceTimer = null;
    el.mailSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        const val = e.target.value;
        el.btnClearSearch.classList.toggle('hidden', !val);

        searchDebounceTimer = setTimeout(() => {
            state.searchQuery = val.trim();
            state.currentPage = 1;
            fetchMessages();
        }, 300);
    });

    el.btnClearSearch.addEventListener('click', () => {
        el.mailSearchInput.value = '';
        el.btnClearSearch.classList.add('hidden');
        state.searchQuery = '';
        state.currentPage = 1;
        fetchMessages();
    });

    el.filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            el.filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.currentFilter = chip.dataset.filter;
            state.currentPage = 1;
            fetchMessages();
        });
    });

    el.sortSelect.addEventListener('change', (e) => {
        state.currentSort = e.target.value;
        state.currentPage = 1;
        fetchMessages();
    });

    el.btnPagePrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            fetchMessages();
        }
    });

    el.btnPageNext.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            fetchMessages();
        }
    });

    // ==========================================================
    // Email Reader Pane
    // ==========================================================

    async function selectMessage(folderId, msgIndex, msgId) {
        state.selectedMessageId = msgId;

        // Update active class on cards
        document.querySelectorAll('.mail-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.msgId === msgId);
        });

        el.readerEmptyState.classList.add('hidden');
        el.readerContent.classList.remove('hidden');

        // Loading in reader
        el.mailSubject.textContent = 'Yükleniyor...';
        el.mailSenderName.textContent = '';
        el.mailSenderEmail.textContent = '';
        el.mailRecipientTo.textContent = '';
        el.mailDate.textContent = '';
        el.attachmentsSection.classList.add('hidden');

        try {
            const data = await safeFetchJson(`/api/message/${folderId}/${msgIndex}`);

            state.selectedMessageData = data;
            renderMessageDetails(data);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderMessageDetails(data) {
        el.mailSubject.textContent = data.subject || '(Konusuz)';
        el.mailSenderName.textContent = data.senderName || data.senderEmail || 'Bilinmeyen Gönderen';
        el.mailSenderEmail.textContent = data.senderEmail ? `<${data.senderEmail}>` : '';
        el.mailSenderAvatar.textContent = (data.senderName || data.senderEmail || 'A').charAt(0).toUpperCase();
        el.mailRecipientTo.textContent = data.displayTo || '-';

        if (data.displayCC) {
            el.mailRecipientCc.textContent = data.displayCC;
            el.mailRecipientCcRow.classList.remove('hidden');
        } else {
            el.mailRecipientCcRow.classList.add('hidden');
        }

        el.mailDate.textContent = data.date ? data.date.formatted : '';

        // Download Action Buttons
        el.btnDownloadEml.onclick = () => window.open(`/api/export/email-eml/${data.folderId}/${data.index}`, '_blank');
        el.btnDownloadHtml.onclick = () => window.open(`/api/export/email-html/${data.folderId}/${data.index}`, '_blank');
        el.btnPrintMail.onclick = () => {
            if (el.mailBodyIframe.contentWindow) {
                el.mailBodyIframe.contentWindow.print();
            }
        };

        // Attachments
        if (data.attachments && data.attachments.length > 0) {
            el.attachmentsCountTitle.textContent = `Ekler & Fotoğraflar (${data.attachments.length})`;
            el.attachmentsGrid.innerHTML = '';

            data.attachments.forEach(att => {
                const card = document.createElement('div');
                card.className = 'att-card';

                if (att.isImage) {
                    card.innerHTML = `
                        <img src="${att.previewUrl}" class="att-thumb" alt="${escapeHtml(att.filename)}">
                        <div class="att-info">
                            <span class="att-name" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</span>
                            <span class="att-size">${att.formattedSize}</span>
                        </div>
                        <a href="${att.downloadUrl}" class="att-download-btn" title="İndir" download>
                            <i data-lucide="download"></i>
                        </a>
                    `;
                    // Clicking image opens Lightbox
                    card.addEventListener('click', (e) => {
                        if (!e.target.closest('.att-download-btn')) {
                            openSingleImageLightbox({
                                filename: att.filename,
                                filesize: att.filesize,
                                formattedSize: att.formattedSize,
                                mimeTag: att.mimeTag,
                                emailSubject: data.subject,
                                emailSender: data.senderName || data.senderEmail,
                                emailDate: data.date ? data.date.formatted : '',
                                previewUrl: att.previewUrl,
                                downloadUrl: att.downloadUrl
                            });
                        }
                    });
                } else {
                    card.innerHTML = `
                        <div class="att-icon-box"><i data-lucide="file-text"></i></div>
                        <div class="att-info">
                            <span class="att-name" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</span>
                            <span class="att-size">${att.formattedSize}</span>
                        </div>
                        <a href="${att.downloadUrl}" class="att-download-btn" title="İndir" download>
                            <i data-lucide="download"></i>
                        </a>
                    `;
                }
                el.attachmentsGrid.appendChild(card);
            });

            el.attachmentsSection.classList.remove('hidden');
            lucide.createIcons();
        } else {
            el.attachmentsSection.classList.add('hidden');
        }

        // Render Body
        renderBodyContent(data);
    }

    function renderBodyContent(data) {
        // Prepare HTML inside iframe
        const htmlDoc = el.mailBodyIframe.contentDocument || el.mailBodyIframe.contentWindow.document;
        htmlDoc.open();
        if (data.bodyHTML) {
            htmlDoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; margin: 12px; }
                        img { max-width: 100%; height: auto; }
                        a { color: #2563eb; }
                    </style>
                </head>
                <body>
                    ${data.bodyHTML}
                </body>
                </html>
            `);
        } else {
            htmlDoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; margin: 12px; white-space: pre-wrap; word-break: break-word; }
                    </style>
                </head>
                <body>${escapeHtml(data.bodyText || '(İçerik boş)')}</body>
                </html>
            `);
        }
        htmlDoc.close();

        // Plain Text
        el.mailBodyText.textContent = data.bodyText || '(Düz metin gövdesi bulunmuyor)';

        // Headers
        el.mailBodyHeaders.textContent = data.headers || '(E-posta başlık bilgisi bulunmuyor)';

        // Reset to HTML tab
        switchBodyTab('html');
    }

    function switchBodyTab(tabName) {
        el.bodyTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

        el.mailBodyIframe.classList.toggle('hidden', tabName !== 'html');
        el.mailBodyText.classList.toggle('hidden', tabName !== 'text');
        el.mailBodyHeaders.classList.toggle('hidden', tabName !== 'headers');
    }

    el.bodyTabs.forEach(tab => {
        tab.addEventListener('click', () => switchBodyTab(tab.dataset.tab));
    });

    // ==========================================================
    // Fullscreen Photo Gallery View
    // ==========================================================

    function switchToGalleryView() {
        el.explorerView.classList.add('hidden');
        el.welcomeView.classList.add('hidden');
        el.galleryView.classList.remove('hidden');
        state.galleryPage = 1;
        fetchGallery();
    }

    el.btnToggleGallery.addEventListener('click', switchToGalleryView);
    el.btnBackToExplorer.addEventListener('click', () => {
        el.galleryView.classList.add('hidden');
        el.explorerView.classList.remove('hidden');
    });

    async function fetchGallery() {
        el.galleryGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: var(--text-muted);">
                <div class="spinner" style="width: 32px; height: 32px; margin: 0 auto 14px auto;"></div>
                <span>Fotoğraflar taranıyor ve galeri oluşturuluyor...</span>
            </div>
        `;

        try {
            const params = new URLSearchParams({
                page: state.galleryPage,
                limit: 60
            });
            if (state.gallerySearch) params.append('search', state.gallerySearch);

            const data = await safeFetchJson(`/api/gallery?${params.toString()}`);

            state.galleryPhotos = data.photos;
            state.galleryTotalPages = data.totalPages || 1;
            state.galleryPage = data.page || 1;

            el.galleryTotalCountLabel.textContent = `${data.totalCount.toLocaleString()} Fotoğraf`;
            el.galleryPaginationLabel.textContent = `Sayfa ${state.galleryPage} / ${state.galleryTotalPages}`;
            el.btnGalleryPrev.disabled = state.galleryPage <= 1;
            el.btnGalleryNext.disabled = state.galleryPage >= state.galleryTotalPages;

            renderGalleryGrid(data.photos);
        } catch (err) {
            el.galleryGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--danger);">
                    <p>${err.message}</p>
                </div>
            `;
        }
    }

    function renderGalleryGrid(photos) {
        el.galleryGrid.innerHTML = '';
        if (photos.length === 0) {
            el.galleryGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 80px 20px; text-align: center; color: var(--text-muted);">
                    <i data-lucide="image-off" style="width: 56px; height: 56px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <h3>Fotoğraf Bulunamadı</h3>
                    <p style="font-size: 13px; margin-top: 6px;">PST arşivinizde görsel/fotoğraf formatında ek yer almıyor veya arama eşleşmedi.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const fragment = document.createDocumentFragment();

        photos.forEach((photo, index) => {
            const card = document.createElement('div');
            card.className = 'gallery-card';
            card.innerHTML = `
                <img src="${photo.previewUrl}" class="gallery-card-img" alt="${escapeHtml(photo.filename)}" loading="lazy">
                <div class="gallery-card-overlay">
                    <span class="gallery-card-name" title="${escapeHtml(photo.filename)}">${escapeHtml(photo.filename)}</span>
                    <span class="gallery-card-meta">${photo.formattedSize} • ${escapeHtml(photo.emailSender)}</span>
                    <span class="gallery-card-subject" title="${escapeHtml(photo.emailSubject)}">${escapeHtml(photo.emailSubject)}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                openLightbox(index);
            });

            fragment.appendChild(card);
        });

        el.galleryGrid.appendChild(fragment);
        lucide.createIcons();
    }

    let gallerySearchTimer = null;
    el.gallerySearchInput.addEventListener('input', (e) => {
        clearTimeout(gallerySearchTimer);
        gallerySearchTimer = setTimeout(() => {
            state.gallerySearch = e.target.value.trim();
            state.galleryPage = 1;
            fetchGallery();
        }, 300);
    });

    el.btnGalleryPrev.addEventListener('click', () => {
        if (state.galleryPage > 1) {
            state.galleryPage--;
            fetchGallery();
        }
    });

    el.btnGalleryNext.addEventListener('click', () => {
        if (state.galleryPage < state.galleryTotalPages) {
            state.galleryPage++;
            fetchGallery();
        }
    });

    // ZIP Download for all photos
    el.btnDownloadAllPhotosZip.addEventListener('click', () => {
        window.location.href = '/api/export/all-photos-zip';
        showToast('Tüm fotoğraflar ZIP olarak hazırlanıyor ve indiriliyor...', 'info');
    });

    // ==========================================================
    // Lightbox Modal
    // ==========================================================

    function openLightbox(index) {
        state.currentLightboxIndex = index;
        const photo = state.galleryPhotos[index];
        if (!photo) return;

        el.lightboxImage.src = photo.previewUrl;
        el.lightboxFilename.textContent = photo.filename;
        el.lightboxSize.textContent = photo.formattedSize;
        el.lightboxType.textContent = photo.mimeTag;
        el.lightboxFolder.textContent = photo.folderName;
        el.lightboxSender.textContent = photo.emailSender;
        el.lightboxDate.textContent = photo.emailDate;
        el.lightboxSubject.textContent = photo.emailSubject;
        el.lightboxBtnDownload.href = photo.downloadUrl;

        el.lightboxBtnGotoMail.onclick = () => {
            closeLightbox();
            el.galleryView.classList.add('hidden');
            el.explorerView.classList.remove('hidden');
            selectFolder(photo.folderId, photo.folderName);
            setTimeout(() => {
                selectMessage(photo.folderId, photo.msgIndex, `${photo.folderId}_${photo.msgIndex}`);
            }, 300);
        };

        el.lightboxPrev.classList.toggle('hidden', index <= 0);
        el.lightboxNext.classList.toggle('hidden', index >= state.galleryPhotos.length - 1);

        el.lightboxModal.classList.remove('hidden');
    }

    function openSingleImageLightbox(photo) {
        el.lightboxImage.src = photo.previewUrl;
        el.lightboxFilename.textContent = photo.filename;
        el.lightboxSize.textContent = photo.formattedSize;
        el.lightboxType.textContent = photo.mimeTag;
        el.lightboxFolder.textContent = 'Seçili E-Posta';
        el.lightboxSender.textContent = photo.emailSender;
        el.lightboxDate.textContent = photo.emailDate;
        el.lightboxSubject.textContent = photo.emailSubject;
        el.lightboxBtnDownload.href = photo.downloadUrl;
        el.lightboxBtnGotoMail.classList.add('hidden');

        el.lightboxPrev.classList.add('hidden');
        el.lightboxNext.classList.add('hidden');

        el.lightboxModal.classList.remove('hidden');
    }

    function closeLightbox() {
        el.lightboxModal.classList.add('hidden');
        el.lightboxImage.src = '';
    }

    el.lightboxClose.addEventListener('click', closeLightbox);
    el.lightboxBackdrop.addEventListener('click', closeLightbox);

    el.lightboxPrev.addEventListener('click', () => {
        if (state.currentLightboxIndex > 0) {
            openLightbox(state.currentLightboxIndex - 1);
        }
    });

    el.lightboxNext.addEventListener('click', () => {
        if (state.currentLightboxIndex < state.galleryPhotos.length - 1) {
            openLightbox(state.currentLightboxIndex + 1);
        }
    });

    // Keyboard navigation for Lightbox
    window.addEventListener('keydown', (e) => {
        if (!el.lightboxModal.classList.contains('hidden')) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft' && state.currentLightboxIndex > 0) {
                openLightbox(state.currentLightboxIndex - 1);
            }
            if (e.key === 'ArrowRight' && state.currentLightboxIndex < state.galleryPhotos.length - 1) {
                openLightbox(state.currentLightboxIndex + 1);
            }
        }
    });

    // ==========================================================
    // Export Modal & Disk Export
    // ==========================================================

    function openExportModal() {
        el.exportModal.classList.remove('hidden');
    }

    function closeExportModal() {
        el.exportModal.classList.add('hidden');
    }

    el.btnExportModal.addEventListener('click', openExportModal);
    el.btnExportQuick.addEventListener('click', openExportModal);
    el.btnExportPhotosDisk.addEventListener('click', openExportModal);
    el.exportModalClose.addEventListener('click', closeExportModal);
    el.exportModalBackdrop.addEventListener('click', closeExportModal);

    // Browse Folder for Disk Export
    el.btnBrowseExportFolder.addEventListener('click', async () => {
        try {
            showLoading('Klasör seçici açılıyor...');
            const data = await safeFetchJson('/api/system/browse-folder');
            hideLoading();
            if (data && data.selectedPath) {
                el.exportDiskPath.value = data.selectedPath;
            }
        } catch {
            hideLoading();
        }
    });

    // Start Disk Export
    el.btnStartDiskExport.addEventListener('click', async () => {
        const targetDir = el.exportDiskPath.value.trim();
        if (!targetDir) {
            showToast('Lütfen hedef bir klasör yolu seçin veya girin.', 'error');
            return;
        }

        const selectedType = document.querySelector('input[name="disk-export-type"]:checked')?.value || 'photos';

        showLoading('İçerikler hedef klasöre aktarılıyor...');
        try {
            const data = await safeFetchJson('/api/export/to-disk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetDir, exportType: selectedType })
            });

            closeExportModal();
            showToast(`${data.exportedCount} öğe başarıyla "${targetDir}" klasörüne aktarıldı!`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    // Helper: Escape HTML string
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
