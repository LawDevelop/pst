# PST Görüntüleyici Pro (Outlook Olmadan PST & OST Açıcı)

Bu uygulama, bilgisayarınızda **Microsoft Outlook** veya Microsoft Office yüklü olmasına gerek kalmadan `.pst` ve `.ost` dosyalarını açmanızı, e-postalarınızı okumanızı, ekleri incelemenizi ve özellikle **tüm fotoğrafları/görselleri tek bir tıkla görüntüleyip dışa aktarmanızı** sağlar.

---

## 🚀 Hızlı Başlangıç

1. `PST_Goruntuleyici_Baslat.bat` dosyasına çift tıklayın.
2. Otomatik olarak varsayılan internet tarayıcınızda `http://localhost:3800` adresi açılacaktır.
3. **"Bilgisayardan Gözat"** veya **"Dosya Aç"** butonuna basarak açmak istediğiniz `.pst` veya `.ost` dosyasını seçin.

---

## ✨ Öne Çıkan Özellikler

### 1. 🖼️ Özel Fotoğraf & Medya Galerisi
- Arşivinizdeki tüm e-postalarda yer alan fotoğrafları otomatik olarak tespit eder.
- Pinterest/Google Photos benzeri modern bir galeri ızgarasında sunar.
- Fotoğrafları tam boyutta inceleme (Lightbox), yakınlaştırma ve fotoğrafın hangi e-postadan geldiğini görme imkanı.
- **"Tüm Fotoğrafları İndir (ZIP)"** butonu ile tek tıkla tüm arşiv görsellerini bilgisayarınıza indirme.

### 2. 📧 Modern 3 Panelli E-Posta İstemcisi
- **Sol Panel:** PST içindeki tüm klasör hiyerarşisi (Gelen Kutusu, Gönderilenler, Arşiv, Özel Klasörler) ve mesaj sayıları.
- **Orta Panel:** Canlı arama (Konu, gönderen, içerik), sıralama ve filtreleme (Sadece Fotoğraflı / Sadece Ekli).
- **Sağ Panel:** Zengin HTML e-posta okuyucu, tam başlık bilgileri (Headers), ekler çubuğu.

### 3. 💾 Toplu Dışa Aktarma Seçenekleri
- **Tüm Fotoğrafları ZIP Olarak İndirme**
- **Tüm Ekleri Klasör Hiyerarşisinde ZIP Olarak İndirme**
- **E-Postaları Standart `.eml` veya `.html` Olarak Kaydetme**
- **Doğrudan Bilgisayardaki Bir Klasöre Çıkarma** (Örn: `D:\PST_Fotograflari`)

### 4. 🔒 %100 Güvenli & Çevrimdışı (Offline)
- Tüm işlemler tamamen sizin bilgisayarınızda yerel olarak çalışır.
- Hiçbir e-posta, şifre veya fotoğraf internete yüklenmez.

---

## 🛠️ Manuel Başlatma (Komut İstemi ile)

Eğer terminalden çalıştırmak isterseniz:

```bash
cd C:\Users\avemr\.gemini\antigravity\scratch\pst-viewer
npm install
node server.js
```

Ardından tarayıcınızda `http://localhost:3800` adresine gidin.
