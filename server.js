const express = require('express');
const cors = require('cors');
const multer = require('multer');
const archiver = require('archiver');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { PSTFile } = require('pst-extractor');

// Process level safety to prevent sudden server crashes on other systems
process.on('uncaughtException', (err) => {
    console.error('[GÜVENLİK] Yakalanmamış İstisna:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[GÜVENLİK] Yakalanmamış Rejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 3800;

app.use(cors());
app.use(express.json({ limit: '2048mb' }));
app.use(express.urlencoded({ extended: true, limit: '2048mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for PST uploads with safe temp cleanup
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Clean up old temp uploads on startup (preserving .gitkeep)
try {
    const files = fs.readdirSync(uploadDir);
    for (const f of files) {
        if (f === '.gitkeep') continue;
        try { fs.unlinkSync(path.join(uploadDir, f)); } catch {}
    }
} catch {}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '.pst') || '.pst';
        const rawBase = path.basename(file.originalname || 'arsiv', ext);
        const safeBase = rawBase.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_').trim() || 'pst_dosyasi';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}-${safeBase}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024 * 1024 // 100 GB
    }
});

// Active PST State
let currentPstState = {
    pstFile: null,
    filePath: null,
    fileName: null,
    fileSize: 0,
    folderMap: new Map(), // id -> { id, name, fullPath, contentCount, unreadCount, folderObj, children }
    folderTree: [],
    folderMessagesCache: new Map(), // folderId -> array of summary objects
    galleryPhotos: [], // all photos extracted across the file
    galleryIndexed: false,
    totalEmails: 0,
    totalFolders: 0,
    totalPhotos: 0,
    totalAttachments: 0
};

// Helper: Format bytes to human readable
function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Determine if filename or mime is an image
function isImageAttachment(filename, mimeTag) {
    if (mimeTag && mimeTag.toLowerCase().startsWith('image/')) return true;
    if (!filename) return false;
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif', '.heic'].includes(ext);
}

// Helper: Format Date
function formatDate(dateObj) {
    if (!dateObj) return null;
    try {
        const d = new Date(dateObj);
        if (isNaN(d.getTime())) return null;
        return {
            iso: d.toISOString(),
            formatted: d.toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
    } catch {
        return null;
    }
}

// Helper: Extract buffer from PSTAttachment
function getAttachmentBuffer(attachment) {
    if (!attachment) return null;
    try {
        const stream = attachment.fileInputStream;
        if (!stream) return null;
        const size = (stream.length && typeof stream.length.toNumber === 'function') 
            ? stream.length.toNumber() 
            : (attachment.filesize || 0);
        
        if (size <= 0) return Buffer.alloc(0);
        const buf = Buffer.alloc(size);
        stream.readCompletely(buf);
        return buf;
    } catch (err) {
        console.error('Error reading attachment buffer:', err);
        return null;
    }
}

// Index folders recursively
function indexFolders(pstFile) {
    const rootFolder = pstFile.getRootFolder();
    const folderMap = new Map();
    let idCounter = 0;
    let totalEmails = 0;
    let totalFolders = 0;

    function traverse(folder, parentPath = '') {
        const id = 'f_' + (idCounter++);
        totalFolders++;
        const count = folder.contentCount || 0;
        totalEmails += count;
        
        let folderName = folder.displayName || (id === 'f_0' ? 'Kök Klasör' : 'Klasör ' + idCounter);
        const currentPath = parentPath ? `${parentPath} / ${folderName}` : folderName;

        const entry = {
            id,
            name: folderName,
            fullPath: currentPath,
            contentCount: count,
            unreadCount: folder.unreadCount || 0,
            folderObj: folder,
            children: []
        };

        folderMap.set(id, entry);

        if (folder.hasSubfolders) {
            try {
                const subFolders = folder.getSubFolders();
                if (subFolders && subFolders.length > 0) {
                    for (const sub of subFolders) {
                        try {
                            const child = traverse(sub, currentPath);
                            entry.children.push(child);
                        } catch (subErr) {
                            console.error(`Subfolder error in ${folderName}:`, subErr);
                        }
                    }
                }
            } catch (err) {
                console.error(`Error traversing subfolders for ${folderName}:`, err);
            }
        }

        return entry;
    }

    const tree = [traverse(rootFolder)];
    return { folderMap, folderTree: tree, totalEmails, totalFolders };
}

// Open and initialize PST
function openPstFile(rawFilePath) {
    let cleanPath = (rawFilePath || '').trim().replace(/^["']|["']$/g, '');
    cleanPath = path.normalize(cleanPath);

    if (!fs.existsSync(cleanPath)) {
        throw new Error('Dosya bulunamadı. Lütfen dosya yolunu kontrol edin: ' + cleanPath);
    }
    const stat = fs.statSync(cleanPath);

    // Safely close previous PST file handle to release lock and memory
    if (currentPstState && currentPstState.pstFile && currentPstState.pstFile.pstFD) {
        try {
            fs.closeSync(currentPstState.pstFile.pstFD);
        } catch (closeErr) {
            console.warn('Önceki PST kapatılırken uyarı:', closeErr.message);
        }
    }

    const pstFile = new PSTFile(cleanPath);

    const { folderMap, folderTree, totalEmails, totalFolders } = indexFolders(pstFile);

    currentPstState = {
        pstFile,
        filePath: cleanPath,
        fileName: path.basename(cleanPath),
        fileSize: stat.size,
        folderMap,
        folderTree,
        folderMessagesCache: new Map(),
        galleryPhotos: [],
        galleryIndexed: false,
        totalEmails,
        totalFolders,
        totalPhotos: 0,
        totalAttachments: 0
    };

    // Build photo index in background safely without crashing
    setTimeout(() => {
        try {
            buildGalleryIndex();
        } catch (bgErr) {
            console.error('Arka plan galeri indeksleme uyarısı:', bgErr.message);
        }
    }, 1000);

    return {
        fileName: currentPstState.fileName,
        filePath: currentPstState.filePath,
        fileSize: currentPstState.fileSize,
        formattedFileSize: formatBytes(currentPstState.fileSize),
        folderTree: serializeTree(currentPstState.folderTree),
        totalEmails: currentPstState.totalEmails,
        totalFolders: currentPstState.totalFolders
    };
}

function serializeTree(tree) {
    return tree.map(node => ({
        id: node.id,
        name: node.name,
        fullPath: node.fullPath,
        contentCount: node.contentCount,
        unreadCount: node.unreadCount,
        children: node.children ? serializeTree(node.children) : []
    }));
}

// Index messages in a folder
function getFolderMessages(folderId) {
    if (currentPstState.folderMessagesCache.has(folderId)) {
        return currentPstState.folderMessagesCache.get(folderId);
    }

    const folderEntry = currentPstState.folderMap.get(folderId);
    if (!folderEntry) return [];

    const folder = folderEntry.folderObj;
    const messages = [];
    const count = folder.contentCount || 0;

    if (count > 0) {
        try {
            folder.moveChildCursorTo(0);
            let msg = folder.getNextChild();
            let index = 0;

            while (msg != null && index < count) {
                try {
                    const numAttach = msg.numberOfAttachments || 0;
                    let hasPhotos = false;
                    let photoCount = 0;
                    const attachList = [];

                    if (numAttach > 0) {
                        for (let a = 0; a < numAttach; a++) {
                            try {
                                const att = msg.getAttachment(a);
                                if (att) {
                                    const fname = att.longFilename || att.filename || `ek_${a + 1}`;
                                    const isImg = isImageAttachment(fname, att.mimeTag);
                                    if (isImg) {
                                        hasPhotos = true;
                                        photoCount++;
                                    }
                                    attachList.push({
                                        index: a,
                                        filename: fname,
                                        filesize: att.filesize || 0,
                                        formattedSize: formatBytes(att.filesize || 0),
                                        mimeTag: att.mimeTag || (mime.lookup(fname) || 'application/octet-stream'),
                                        isImage: isImg,
                                        contentId: att.contentId || ''
                                    });
                                }
                            } catch (err) {
                                console.error(`Attachment read error in msg ${index}:`, err);
                            }
                        }
                    }

                    const dateObj = msg.clientSubmitTime || msg.messageDeliveryTime || msg.creationTime;
                    const formattedDate = formatDate(dateObj);

                    // Body snippet
                    let snippet = '';
                    try {
                        if (msg.body) {
                            snippet = msg.body.replace(/\s+/g, ' ').trim().substring(0, 140);
                        } else if (msg.bodyHTML) {
                            snippet = msg.bodyHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 140);
                        }
                    } catch {}

                    messages.push({
                        id: `${folderId}_${index}`,
                        folderId,
                        folderName: folderEntry.name,
                        index,
                        subject: msg.subject || '(Konusuz)',
                        senderName: msg.senderName || '',
                        senderEmail: msg.senderEmailAddress || '',
                        displayTo: msg.displayTo || '',
                        displayCC: msg.displayCC || '',
                        date: formattedDate,
                        importance: msg.importance || 1,
                        hasAttachments: numAttach > 0,
                        attachmentCount: numAttach,
                        hasPhotos,
                        photoCount,
                        attachments: attachList,
                        snippet
                    });
                } catch (msgLoopErr) {
                    console.error(`Error processing msg index ${index}:`, msgLoopErr);
                }

                index++;
                msg = folder.getNextChild();
            }
        } catch (err) {
            console.error(`Error reading messages from folder ${folderEntry.name}:`, err);
        }
    }

    currentPstState.folderMessagesCache.set(folderId, messages);
    return messages;
}

// Build global gallery index of all photos
function buildGalleryIndex() {
    if (currentPstState.galleryIndexed) return currentPstState.galleryPhotos;

    const photos = [];
    let totalAttach = 0;

    try {
        for (const [folderId, entry] of currentPstState.folderMap.entries()) {
            if (entry.contentCount > 0) {
                const msgs = getFolderMessages(folderId);
                for (const msg of msgs) {
                    totalAttach += msg.attachmentCount || 0;
                    if (msg.attachments && msg.attachments.length > 0) {
                        for (const att of msg.attachments) {
                            if (att.isImage) {
                                photos.push({
                                    id: `photo_${folderId}_${msg.index}_${att.index}`,
                                    folderId,
                                    folderName: entry.name,
                                    msgIndex: msg.index,
                                    attachIndex: att.index,
                                    filename: att.filename,
                                    filesize: att.filesize,
                                    formattedSize: att.formattedSize,
                                    mimeTag: att.mimeTag,
                                    emailSubject: msg.subject,
                                    emailSender: msg.senderName || msg.senderEmail,
                                    emailDate: msg.date ? msg.date.formatted : '',
                                    emailDateIso: msg.date ? msg.date.iso : '',
                                    previewUrl: `/api/attachment/${folderId}/${msg.index}/${att.index}`,
                                    downloadUrl: `/api/attachment/${folderId}/${msg.index}/${att.index}?download=1`
                                });
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('Galeri indeksleme sırasında hata:', err);
    }

    currentPstState.galleryPhotos = photos;
    currentPstState.totalPhotos = photos.length;
    currentPstState.totalAttachments = totalAttach;
    currentPstState.galleryIndexed = true;
    console.log(`Gallery index completed. Found ${photos.length} photos in ${totalAttach} attachments.`);
    return photos;
}

// API: Open PST via file path (Instant, zero copy, zero disk space)
app.post('/api/open', (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'Dosya yolu belirtilmedi.' });
        }
        const info = openPstFile(filePath);
        res.json({ success: true, ...info });
    } catch (err) {
        console.error('PST açma hatası:', err);
        res.status(500).json({ error: 'PST dosyası açılamadı: ' + err.message });
    }
});

// API: Upload PST
app.post('/api/upload', upload.single('pstFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Yüklenecek dosya seçilmedi.' });
        }
        const info = openPstFile(req.file.path);
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        info.fileName = originalName;
        currentPstState.fileName = originalName;
        res.json({ success: true, ...info });
    } catch (err) {
        console.error('Yükleme hatası:', err);
        res.status(500).json({ error: 'Dosya işlenemedi: ' + err.message });
    }
});

// API: Windows Native File Browser Dialog (STA Mode)
app.get('/api/system/browse-pst', (req, res) => {
    const psScript = path.join(__dirname, 'scripts', 'browse_file.ps1');
    execFile('powershell', ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript], { encoding: 'utf8' }, (error, stdout) => {
        if (error) {
            console.error('PowerShell Browse Error:', error);
            return res.json({ selectedPath: null });
        }
        const selected = (stdout || '').trim();
        res.json({ selectedPath: selected || null });
    });
});

// API: Windows Native Folder Browser Dialog (STA Mode)
app.get('/api/system/browse-folder', (req, res) => {
    const psScript = path.join(__dirname, 'scripts', 'browse_folder.ps1');
    execFile('powershell', ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript], { encoding: 'utf8' }, (error, stdout) => {
        if (error) {
            console.error('PowerShell Folder Browse Error:', error);
            return res.json({ selectedPath: null });
        }
        const selected = (stdout || '').trim();
        res.json({ selectedPath: selected || null });
    });
});

// API: Get Current Status / Tree
app.get('/api/status', (req, res) => {
    if (!currentPstState.pstFile) {
        return res.json({ isLoaded: false });
    }
    res.json({
        isLoaded: true,
        fileName: currentPstState.fileName,
        filePath: currentPstState.filePath,
        fileSize: currentPstState.fileSize,
        formattedFileSize: formatBytes(currentPstState.fileSize),
        folderTree: serializeTree(currentPstState.folderTree),
        totalEmails: currentPstState.totalEmails,
        totalFolders: currentPstState.totalFolders,
        totalPhotos: currentPstState.totalPhotos,
        totalAttachments: currentPstState.totalAttachments
    });
});

// API: Get Messages in Folder (with Search, Filter, Pagination)
app.get('/api/messages', (req, res) => {
    if (!currentPstState.pstFile) {
        return res.status(400).json({ error: 'Açık bir PST dosyası yok.' });
    }

    const { folderId, search, filter, sortBy, page = 1, limit = 50 } = req.query;
    let messages = [];

    if (folderId && currentPstState.folderMap.has(folderId)) {
        messages = getFolderMessages(folderId);
    } else {
        // All messages across all folders
        for (const fId of currentPstState.folderMap.keys()) {
            const folderMsgs = getFolderMessages(fId);
            messages = messages.concat(folderMsgs);
        }
    }

    // Filter
    let filtered = messages;
    if (search) {
        const q = search.toLowerCase().trim();
        filtered = filtered.filter(m => 
            (m.subject && m.subject.toLowerCase().includes(q)) ||
            (m.senderName && m.senderName.toLowerCase().includes(q)) ||
            (m.senderEmail && m.senderEmail.toLowerCase().includes(q)) ||
            (m.snippet && m.snippet.toLowerCase().includes(q))
        );
    }

    if (filter === 'attachments') {
        filtered = filtered.filter(m => m.hasAttachments);
    } else if (filter === 'photos') {
        filtered = filtered.filter(m => m.hasPhotos);
    }

    // Sort
    if (sortBy === 'date_asc') {
        filtered.sort((a, b) => new Date(a.date?.iso || 0) - new Date(b.date?.iso || 0));
    } else if (sortBy === 'sender') {
        filtered.sort((a, b) => (a.senderName || a.senderEmail || '').localeCompare(b.senderName || b.senderEmail || ''));
    } else if (sortBy === 'subject') {
        filtered.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
    } else {
        // Default: date_desc
        filtered.sort((a, b) => new Date(b.date?.iso || 0) - new Date(a.date?.iso || 0));
    }

    // Pagination
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.max(1, parseInt(limit, 10));
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / l) || 1;
    const startIndex = (p - 1) * l;
    const paginated = filtered.slice(startIndex, startIndex + l);

    res.json({
        messages: paginated,
        totalCount,
        page: p,
        totalPages,
        limit: l
    });
});

// API: Get Full Message Details
app.get('/api/message/:folderId/:msgIndex', (req, res) => {
    if (!currentPstState.pstFile) {
        return res.status(400).json({ error: 'Açık bir PST dosyası yok.' });
    }

    const { folderId, msgIndex } = req.params;
    const folderEntry = currentPstState.folderMap.get(folderId);
    if (!folderEntry) {
        return res.status(404).json({ error: 'Klasör bulunamadı.' });
    }

    try {
        const folder = folderEntry.folderObj;
        const idx = parseInt(msgIndex, 10);
        folder.moveChildCursorTo(idx);
        const msg = folder.getNextChild();
        if (!msg) {
            return res.status(404).json({ error: 'Mesaj bulunamadı.' });
        }

        const attachments = [];
        const numAttach = msg.numberOfAttachments || 0;
        for (let a = 0; a < numAttach; a++) {
            try {
                const att = msg.getAttachment(a);
                if (att) {
                    const fname = att.longFilename || att.filename || `ek_${a + 1}`;
                    const isImg = isImageAttachment(fname, att.mimeTag);
                    attachments.push({
                        index: a,
                        filename: fname,
                        filesize: att.filesize || 0,
                        formattedSize: formatBytes(att.filesize || 0),
                        mimeTag: att.mimeTag || (mime.lookup(fname) || 'application/octet-stream'),
                        isImage: isImg,
                        contentId: att.contentId || '',
                        previewUrl: `/api/attachment/${folderId}/${idx}/${a}`,
                        downloadUrl: `/api/attachment/${folderId}/${idx}/${a}?download=1`
                    });
                }
            } catch (attErr) {
                console.error('Attachment err:', attErr);
            }
        }

        let bodyHTML = msg.bodyHTML || '';
        // If inline images exist with cid, rewrite them
        if (bodyHTML && attachments.length > 0) {
            attachments.forEach(att => {
                if (att.contentId) {
                    const cleanCid = att.contentId.replace(/^<|>$/g, '');
                    const cidRegex = new RegExp(`cid:${cleanCid}`, 'gi');
                    bodyHTML = bodyHTML.replace(cidRegex, att.previewUrl);
                }
            });
        }

        const dateObj = msg.clientSubmitTime || msg.messageDeliveryTime || msg.creationTime;

        res.json({
            id: `${folderId}_${idx}`,
            folderId,
            folderName: folderEntry.name,
            index: idx,
            subject: msg.subject || '(Konusuz)',
            senderName: msg.senderName || '',
            senderEmail: msg.senderEmailAddress || '',
            displayTo: msg.displayTo || '',
            displayCC: msg.displayCC || '',
            displayBCC: msg.displayBCC || '',
            date: formatDate(dateObj),
            importance: msg.importance || 1,
            bodyHTML,
            bodyText: msg.body || '',
            bodyRTF: msg.bodyRTF || '',
            headers: msg.transportMessageHeaders || '',
            attachments
        });
    } catch (err) {
        console.error('Error fetching message details:', err);
        res.status(500).json({ error: 'Mesaj okunamadı: ' + err.message });
    }
});

// API: Stream Attachment / Photo
app.get('/api/attachment/:folderId/:msgIndex/:attachIndex', (req, res) => {
    if (!currentPstState.pstFile) {
        return res.status(400).send('PST dosyası açık değil.');
    }

    const { folderId, msgIndex, attachIndex } = req.params;
    const download = req.query.download === '1';

    const folderEntry = currentPstState.folderMap.get(folderId);
    if (!folderEntry) return res.status(404).send('Klasör bulunamadı.');

    try {
        const folder = folderEntry.folderObj;
        folder.moveChildCursorTo(parseInt(msgIndex, 10));
        const msg = folder.getNextChild();
        if (!msg) return res.status(404).send('Mesaj bulunamadı.');

        const att = msg.getAttachment(parseInt(attachIndex, 10));
        if (!att) return res.status(404).send('Ek bulunamadı.');

        const buffer = getAttachmentBuffer(att);
        if (!buffer) return res.status(404).send('Ek içeriği boş veya okunamadı.');

        const fname = att.longFilename || att.filename || `ek_${attachIndex}`;
        const mimeType = att.mimeTag || mime.lookup(fname) || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (download) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
        } else {
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fname)}"`);
        }

        res.end(buffer);
    } catch (err) {
        console.error('Error streaming attachment:', err);
        res.status(500).send('Ek akışı sırasında hata: ' + err.message);
    }
});

// API: Get Photo Gallery
app.get('/api/gallery', (req, res) => {
    if (!currentPstState.pstFile) {
        return res.status(400).json({ error: 'Açık bir PST dosyası yok.' });
    }

    const { folderId, search, page = 1, limit = 60 } = req.query;
    let photos = buildGalleryIndex();

    if (folderId && folderId !== 'all') {
        photos = photos.filter(p => p.folderId === folderId);
    }

    if (search) {
        const q = search.toLowerCase().trim();
        photos = photos.filter(p => 
            (p.filename && p.filename.toLowerCase().includes(q)) ||
            (p.emailSubject && p.emailSubject.toLowerCase().includes(q)) ||
            (p.emailSender && p.emailSender.toLowerCase().includes(q))
        );
    }

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.max(1, parseInt(limit, 10));
    const totalCount = photos.length;
    const totalPages = Math.ceil(totalCount / l) || 1;
    const startIndex = (p - 1) * l;
    const paginated = photos.slice(startIndex, startIndex + l);

    res.json({
        photos: paginated,
        totalCount,
        page: p,
        totalPages,
        limit: l
    });
});

// API: Download Single Email as EML
app.get('/api/export/email-eml/:folderId/:msgIndex', (req, res) => {
    if (!currentPstState.pstFile) return res.status(400).send('PST açık değil.');
    const { folderId, msgIndex } = req.params;
    const folderEntry = currentPstState.folderMap.get(folderId);
    if (!folderEntry) return res.status(404).send('Klasör bulunamadı.');

    try {
        const folder = folderEntry.folderObj;
        folder.moveChildCursorTo(parseInt(msgIndex, 10));
        const msg = folder.getNextChild();
        if (!msg) return res.status(404).send('Mesaj bulunamadı.');

        const boundary = '----=_Part_' + Date.now() + '_' + Math.random().toString(36).substring(2);
        let eml = '';

        // Headers
        eml += `From: ${msg.senderName ? `"${msg.senderName}" ` : ''}<${msg.senderEmailAddress || 'unknown@example.com'}>\r\n`;
        if (msg.displayTo) eml += `To: ${msg.displayTo}\r\n`;
        if (msg.displayCC) eml += `Cc: ${msg.displayCC}\r\n`;
        eml += `Subject: =?UTF-8?B?${Buffer.from(msg.subject || '(Konusuz)').toString('base64')}?=\r\n`;
        const dateObj = msg.clientSubmitTime || msg.messageDeliveryTime || new Date();
        eml += `Date: ${new Date(dateObj).toUTCString()}\r\n`;
        eml += `MIME-Version: 1.0\r\n`;
        eml += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

        // Body
        eml += `--${boundary}\r\n`;
        if (msg.bodyHTML) {
            eml += `Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
            eml += Buffer.from(msg.bodyHTML).toString('base64') + '\r\n\r\n';
        } else {
            eml += `Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
            eml += Buffer.from(msg.body || '').toString('base64') + '\r\n\r\n';
        }

        // Attachments
        const numAttach = msg.numberOfAttachments || 0;
        for (let a = 0; a < numAttach; a++) {
            const att = msg.getAttachment(a);
            if (att) {
                const buf = getAttachmentBuffer(att);
                if (buf) {
                    const fname = att.longFilename || att.filename || `attachment_${a + 1}`;
                    const mimeType = att.mimeTag || mime.lookup(fname) || 'application/octet-stream';
                    eml += `--${boundary}\r\n`;
                    eml += `Content-Type: ${mimeType}; name="${fname}"\r\n`;
                    eml += `Content-Disposition: attachment; filename="${fname}"\r\n`;
                    eml += `Content-Transfer-Encoding: base64\r\n\r\n`;
                    eml += buf.toString('base64') + '\r\n\r\n';
                }
            }
        }
        eml += `--${boundary}--\r\n`;

        const safeSubject = (msg.subject || 'email').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_').substring(0, 50);
        res.setHeader('Content-Type', 'message/rfc822');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeSubject)}.eml"`);
        res.send(Buffer.from(eml, 'utf-8'));
    } catch (err) {
        console.error('EML export err:', err);
        res.status(500).send('EML export hatası: ' + err.message);
    }
});

// API: Download Single Email as Standalone HTML
app.get('/api/export/email-html/:folderId/:msgIndex', (req, res) => {
    if (!currentPstState.pstFile) return res.status(400).send('PST açık değil.');
    const { folderId, msgIndex } = req.params;
    const folderEntry = currentPstState.folderMap.get(folderId);
    if (!folderEntry) return res.status(404).send('Klasör bulunamadı.');

    try {
        const folder = folderEntry.folderObj;
        folder.moveChildCursorTo(parseInt(msgIndex, 10));
        const msg = folder.getNextChild();
        if (!msg) return res.status(404).send('Mesaj bulunamadı.');

        const dateFormatted = formatDate(msg.clientSubmitTime || msg.messageDeliveryTime)?.formatted || '';
        const bodyContent = msg.bodyHTML || `<pre style="white-space:pre-wrap;font-family:inherit;">${(msg.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

        const fullHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>${msg.subject || '(Konusuz)'}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #1e293b; }
        .email-container { max-width: 900px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; }
        .email-header { padding: 24px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
        .email-header h1 { margin: 0 0 16px 0; font-size: 20px; color: #0f172a; }
        .meta-row { display: flex; margin-bottom: 6px; font-size: 14px; }
        .meta-label { width: 80px; font-weight: 600; color: #64748b; }
        .meta-value { flex: 1; color: #334155; }
        .email-body { padding: 28px; font-size: 15px; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>${msg.subject || '(Konusuz)'}</h1>
            <div class="meta-row"><span class="meta-label">Kimden:</span><span class="meta-value">${msg.senderName || ''} &lt;${msg.senderEmailAddress || ''}&gt;</span></div>
            <div class="meta-row"><span class="meta-label">Kime:</span><span class="meta-value">${msg.displayTo || '-'}</span></div>
            ${msg.displayCC ? `<div class="meta-row"><span class="meta-label">Bilgi:</span><span class="meta-value">${msg.displayCC}</span></div>` : ''}
            <div class="meta-row"><span class="meta-label">Tarih:</span><span class="meta-value">${dateFormatted}</span></div>
        </div>
        <div class="email-body">
            ${bodyContent}
        </div>
    </div>
</body>
</html>`;

        const safeSubject = (msg.subject || 'email').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_').substring(0, 50);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeSubject)}.html"`);
        res.send(Buffer.from(fullHtml, 'utf-8'));
    } catch (err) {
        console.error('HTML export err:', err);
        res.status(500).send('HTML export hatası: ' + err.message);
    }
});

// API: Export All Photos as ZIP (Streamed)
app.get('/api/export/all-photos-zip', (req, res) => {
    if (!currentPstState.pstFile) return res.status(400).send('PST açık değil.');

    const photos = buildGalleryIndex();
    if (photos.length === 0) {
        return res.status(404).send('Dışa aktarılacak fotoğraf bulunamadı.');
    }

    const archive = archiver('zip', { zlib: { level: 5 } });
    const zipName = `PST_Fotograflar_${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    archive.pipe(res);

    archive.on('error', err => {
        console.error('Archive error:', err);
        if (!res.headersSent) res.status(500).send('ZIP oluşturma hatası');
    });

    const usedNames = new Set();

    for (const p of photos) {
        try {
            const folderEntry = currentPstState.folderMap.get(p.folderId);
            if (folderEntry) {
                const folder = folderEntry.folderObj;
                folder.moveChildCursorTo(p.msgIndex);
                const msg = folder.getNextChild();
                if (msg) {
                    const att = msg.getAttachment(p.attachIndex);
                    if (att) {
                        const buf = getAttachmentBuffer(att);
                        if (buf && buf.length > 0) {
                            let filename = p.filename || `foto_${p.folderId}_${p.msgIndex}_${p.attachIndex}.jpg`;
                            // Ensure unique filename
                            let counter = 1;
                            let uniqueName = filename;
                            while (usedNames.has(uniqueName)) {
                                const ext = path.extname(filename);
                                const base = path.basename(filename, ext);
                                uniqueName = `${base}_${counter++}${ext}`;
                            }
                            usedNames.add(uniqueName);

                            archive.append(buf, { name: uniqueName });
                        }
                    }
                }
            }
        } catch (photoErr) {
            console.error('Error adding photo to zip:', photoErr);
        }
    }

    archive.finalize();
});

// API: Export All Attachments as ZIP (Streamed)
app.get('/api/export/all-attachments-zip', (req, res) => {
    if (!currentPstState.pstFile) return res.status(400).send('PST açık değil.');

    const archive = archiver('zip', { zlib: { level: 5 } });
    const zipName = `PST_Tum_Ekler_${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    archive.pipe(res);

    archive.on('error', err => {
        console.error('Archive error:', err);
        if (!res.headersSent) res.status(500).send('ZIP oluşturma hatası');
    });

    for (const [folderId, folderEntry] of currentPstState.folderMap.entries()) {
        if (folderEntry.contentCount > 0) {
            const folder = folderEntry.folderObj;
            const count = folder.contentCount;
            const folderCleanName = folderEntry.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_');

            for (let m = 0; m < count; m++) {
                try {
                    folder.moveChildCursorTo(m);
                    const msg = folder.getNextChild();
                    if (msg && msg.numberOfAttachments > 0) {
                        for (let a = 0; a < msg.numberOfAttachments; a++) {
                            const att = msg.getAttachment(a);
                            if (att) {
                                const buf = getAttachmentBuffer(att);
                                if (buf && buf.length > 0) {
                                    const fname = att.longFilename || att.filename || `ek_${a + 1}`;
                                    const safeSubject = (msg.subject || 'isimsiz').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_').substring(0, 30);
                                    const zipPath = `${folderCleanName}/${m + 1}_${safeSubject}/${fname}`;
                                    archive.append(buf, { name: zipPath });
                                }
                            }
                        }
                    }
                } catch (msgErr) {
                    console.error('Error processing msg for zip:', msgErr);
                }
            }
        }
    }

    archive.finalize();
});

// API: Export directly to local folder on disk
app.post('/api/export/to-disk', (req, res) => {
    if (!currentPstState.pstFile) return res.status(400).json({ error: 'PST açık değil.' });

    const { targetDir, exportType } = req.body;
    if (!targetDir || !fs.existsSync(targetDir)) {
        return res.status(400).json({ error: 'Geçersiz hedef klasör yolu.' });
    }

    try {
        let exportedCount = 0;

        if (exportType === 'photos') {
            const photos = buildGalleryIndex();
            const photoDir = path.join(targetDir, 'PST_Fotograflari');
            if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

            const usedNames = new Set();
            for (const p of photos) {
                const folderEntry = currentPstState.folderMap.get(p.folderId);
                if (folderEntry) {
                    const folder = folderEntry.folderObj;
                    folder.moveChildCursorTo(p.msgIndex);
                    const msg = folder.getNextChild();
                    if (msg) {
                        const att = msg.getAttachment(p.attachIndex);
                        if (att) {
                            const buf = getAttachmentBuffer(att);
                            if (buf && buf.length > 0) {
                                let filename = p.filename || `foto_${p.folderId}_${p.msgIndex}_${p.attachIndex}.jpg`;
                                let counter = 1;
                                let uniqueName = filename;
                                while (usedNames.has(uniqueName)) {
                                    const ext = path.extname(filename);
                                    const base = path.basename(filename, ext);
                                    uniqueName = `${base}_${counter++}${ext}`;
                                }
                                usedNames.add(uniqueName);

                                fs.writeFileSync(path.join(photoDir, uniqueName), buf);
                                exportedCount++;
                            }
                        }
                    }
                }
            }
        } else if (exportType === 'attachments') {
            const attachDir = path.join(targetDir, 'PST_Ekleri');
            for (const [folderId, folderEntry] of currentPstState.folderMap.entries()) {
                if (folderEntry.contentCount > 0) {
                    const folder = folderEntry.folderObj;
                    const count = folder.contentCount;
                    const folderCleanName = folderEntry.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_');

                    for (let m = 0; m < count; m++) {
                        folder.moveChildCursorTo(m);
                        const msg = folder.getNextChild();
                        if (msg && msg.numberOfAttachments > 0) {
                            const safeSubject = (msg.subject || 'isimsiz').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_').substring(0, 30);
                            const msgDir = path.join(attachDir, folderCleanName, `${m + 1}_${safeSubject}`);
                            if (!fs.existsSync(msgDir)) fs.mkdirSync(msgDir, { recursive: true });

                            for (let a = 0; a < msg.numberOfAttachments; a++) {
                                const att = msg.getAttachment(a);
                                if (att) {
                                    const buf = getAttachmentBuffer(att);
                                    if (buf && buf.length > 0) {
                                        const fname = att.longFilename || att.filename || `ek_${a + 1}`;
                                        fs.writeFileSync(path.join(msgDir, fname), buf);
                                        exportedCount++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if (exportType === 'emails') {
            const emailDir = path.join(targetDir, 'PST_Epostalar_EML');
            for (const [folderId, folderEntry] of currentPstState.folderMap.entries()) {
                if (folderEntry.contentCount > 0) {
                    const folder = folderEntry.folderObj;
                    const count = folder.contentCount;
                    const folderCleanName = folderEntry.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_');
                    const targetFolderDir = path.join(emailDir, folderCleanName);
                    if (!fs.existsSync(targetFolderDir)) fs.mkdirSync(targetFolderDir, { recursive: true });

                    for (let m = 0; m < count; m++) {
                        folder.moveChildCursorTo(m);
                        const msg = folder.getNextChild();
                        if (msg) {
                            const safeSubject = (msg.subject || `mail_${m + 1}`).replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '_').substring(0, 40);
                            const boundary = '----=_Part_' + Date.now() + '_' + Math.random().toString(36).substring(2);
                            let eml = `From: ${msg.senderName ? `"${msg.senderName}" ` : ''}<${msg.senderEmailAddress || ''}>\r\n`;
                            if (msg.displayTo) eml += `To: ${msg.displayTo}\r\n`;
                            if (msg.displayCC) eml += `Cc: ${msg.displayCC}\r\n`;
                            eml += `Subject: =?UTF-8?B?${Buffer.from(msg.subject || '(Konusuz)').toString('base64')}?=\r\n`;
                            const dateObj = msg.clientSubmitTime || msg.messageDeliveryTime || new Date();
                            eml += `Date: ${new Date(dateObj).toUTCString()}\r\n`;
                            eml += `MIME-Version: 1.0\r\n`;
                            eml += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

                            eml += `--${boundary}\r\n`;
                            if (msg.bodyHTML) {
                                eml += `Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
                                eml += Buffer.from(msg.bodyHTML).toString('base64') + '\r\n\r\n';
                            } else {
                                eml += `Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
                                eml += Buffer.from(msg.body || '').toString('base64') + '\r\n\r\n';
                            }
                            eml += `--${boundary}--\r\n`;

                            fs.writeFileSync(path.join(targetFolderDir, `${m + 1}_${safeSubject}.eml`), Buffer.from(eml, 'utf-8'));
                            exportedCount++;
                        }
                    }
                }
            }
        }

        res.json({ success: true, exportedCount, targetDir });
    } catch (err) {
        console.error('Export to disk error:', err);
        res.status(500).json({ error: 'Klasöre aktarma sırasında hata: ' + err.message });
    }
});

// Global JSON Error Handler (Never return HTML errors)
app.use((err, req, res, next) => {
    console.error('Global Express Error:', err);
    res.status(500).json({
        error: err.message || 'Sunucu tarafında beklenmeyen bir hata oluştu.'
    });
});

// Start Server with infinite timeouts for large file uploads
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  PST Görüntüleyici ve Fotoğraf Çıkarıcı Yayında!`);
    console.log(`  Adres: http://localhost:${PORT}`);
    console.log(`====================================================`);
});

// Configure server timeouts for large multi-gigabyte PST file uploads
server.timeout = 0; // Disable socket inactivity timeout
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
if (typeof server.requestTimeout !== 'undefined') {
    server.requestTimeout = 0; // Node 18+ disable request timeout
}
