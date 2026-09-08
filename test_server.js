const http = require('http');
const path = require('path');
const fs = require('fs');

async function runTests() {
    console.log('=== PST Viewer Test Başlatılıyor ===');

    const samplePst = path.resolve('node_modules/pst-extractor/example/testdata/enron.pst');
    if (!fs.existsSync(samplePst)) {
        console.error('Test PST dosyası bulunamadı:', samplePst);
        process.exit(1);
    }
    console.log('1. Test PST dosyası mevcut:', samplePst);

    // Helper request
    function makeRequest(pathName, method = 'GET', postData = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 3800,
                path: pathName,
                method: method,
                headers: {}
            };
            if (postData) {
                const jsonStr = JSON.stringify(postData);
                options.headers['Content-Type'] = 'application/json';
                options.headers['Content-Length'] = Buffer.byteLength(jsonStr);
            }

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
                });
            });

            req.on('error', reject);
            if (postData) req.write(JSON.stringify(postData));
            req.end();
        });
    }

    try {
        // Test 1: Open PST
        console.log('2. /api/open testi...');
        const openRes = await makeRequest('/api/open', 'POST', { filePath: samplePst });
        console.log('Open status:', openRes.statusCode);
        const openJson = JSON.parse(openRes.body);
        console.log('Open response:', {
            fileName: openJson.fileName,
            totalEmails: openJson.totalEmails,
            totalFolders: openJson.totalFolders,
            folderTreeCount: openJson.folderTree.length
        });
        if (openJson.totalEmails <= 0) throw new Error('E-posta sayısı 0 döndü');

        // Test 2: Get Status
        console.log('3. /api/status testi...');
        const statusRes = await makeRequest('/api/status');
        const statusJson = JSON.parse(statusRes.body);
        console.log('Status response isLoaded:', statusJson.isLoaded, 'totalEmails:', statusJson.totalEmails);

        // Test 3: Get Messages
        console.log('4. /api/messages testi...');
        const msgsRes = await makeRequest('/api/messages?limit=10');
        const msgsJson = JSON.parse(msgsRes.body);
        console.log('Messages totalCount:', msgsJson.totalCount, 'fetched:', msgsJson.messages.length);
        if (msgsJson.messages.length === 0) throw new Error('Mesajlar boş geldi');

        const firstMsg = msgsJson.messages[0];
        console.log('İlk mesaj örneği:', {
            id: firstMsg.id,
            subject: firstMsg.subject,
            senderName: firstMsg.senderName,
            hasAttachments: firstMsg.hasAttachments
        });

        // Test 4: Get Message Detail
        console.log(`5. /api/message/${firstMsg.folderId}/${firstMsg.index} detayı testi...`);
        const detailRes = await makeRequest(`/api/message/${firstMsg.folderId}/${firstMsg.index}`);
        const detailJson = JSON.parse(detailRes.body);
        console.log('Mesaj Detay Başarılı. Ek sayısı:', detailJson.attachments.length, 'HTML uzunluğu:', detailJson.bodyHTML.length);

        // Test 5: Gallery endpoint
        console.log('6. /api/gallery testi...');
        const galleryRes = await makeRequest('/api/gallery');
        const galleryJson = JSON.parse(galleryRes.body);
        console.log('Galeri toplam fotoğraf sayısı:', galleryJson.totalCount);

        // Test 6: Export EML
        console.log('7. /api/export/email-eml testi...');
        const emlRes = await makeRequest(`/api/export/email-eml/${firstMsg.folderId}/${firstMsg.index}`);
        console.log('EML status:', emlRes.statusCode, 'Content-Type:', emlRes.headers['content-type']);
        if (!emlRes.headers['content-type'].includes('message/rfc822')) {
            throw new Error('EML content-type beklenen formatta değil');
        }

        console.log('\n==========================================');
        console.log('  TÜM TESTLER BAŞARIYLA TAMAMLANDI! (100%)');
        console.log('==========================================');
        process.exit(0);
    } catch (err) {
        console.error('Test hatası:', err);
        process.exit(1);
    }
}

// Start server in background for testing
const { fork } = require('child_process');
const serverProcess = fork('server.js', { stdio: 'pipe' });
serverProcess.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('PST Görüntüleyici ve Fotoğraf Çıkarıcı Yayında!')) {
        setTimeout(runTests, 500);
    }
});
serverProcess.stderr.on('data', (d) => console.error('Server err:', d.toString()));
