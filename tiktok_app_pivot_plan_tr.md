## TikTok Odaklı App Geliştirme Planı

### MVP Aşama 1: TikTok Odaklı Temel Kurulum ve Manuel Akış

Bu aşama, kullanıcıların uygulamalarını TikTok pazarlaması için organize etmelerine ve manuel içerik üretimini bu yeni yapıya göre kolaylaştırmaya odaklanır. Otomasyon olmasa da, temel yapı kurulur.

1.  **Temel Terminoloji Değişiklikleri (UI Odaklı):**
    *   `Settings.jsx` ve `Layout.jsx` genelinde:
        *   **"Products" -> "Uygulamalarım":** Ana varlığınız.
        *   **"Creators" -> "App Tanıtım Yüzleri / Personaları":** TikTok'ta uygulamanızı temsil edecek veya hedef kitlenize hitap edecek kişi/karakter konsepti.
        *   **"Backgrounds" -> "TikTok Arka Planları / Şablonları":** Slayt gösterileri veya videolar için markalı, dikkat çekici görseller.

2.  **"Uygulamalarım" için Detaylandırma (`Settings.jsx`):**
    *   "Uygulamalarım" (eski Products) ayar ekranında, her bir "Uygulama" için aşağıdaki bilgilerin girilebileceği alanlar oluşturun:
        *   Uygulama Adı (Mevcut)
        *   Uygulama Logosu URL'si (Mevcut `logoUrl`)
        *   İlişkili TikTok Hesap Ad(lar)ı: Kullanıcının bu uygulama için kullanmayı düşündüğü TikTok kullanıcı adlarını manuel olarak girebileceği bir metin alanı. Firestore'da "Uygulama" dokümanında bir dizi olarak saklanmalı.
        *   (MVP için İsteğe Bağlı): Bu uygulamayla en çok ilişkilendirilecek "Varsayılan App Tanıtım Yüzü".
        *   (MVP için İsteğe Bağlı): Bu uygulamayla en çok ilişkilendirilecek "Varsayılan TikTok Arka Planı".
    *   Bu ek bilgileri Firestore'daki "Uygulama" (Product) dokümanına kaydedin.

3.  **Slayt Gösterisi Oluşturma Akışını "Uygulama" Odaklı Hale Getirme (`Layout.jsx`):**
    *   `creationMode === 'slideshow'` olduğunda:
        *   1. Adım: "Uygulamanızı Seçin": `selectedSlideshowProduct` dropdown'ı, kullanıcının "Uygulamalarım" listesini göstermeli ve bu seçim zorunlu olmalı.
        *   Otomatik Ön Bilgilendirme (Seçim Yok, Sadece Gösterim): Bir "Uygulama" seçildiğinde, eğer o uygulama için "İlişkili TikTok Hesap Ad(lar)ı", "Varsayılan App Tanıtım Yüzü", "Varsayılan TikTok Arka Planı" tanımlanmışsa, bunları UI'da gösterin.
        *   Kullanıcının Hala Seçecekleri: Slayt gösterisi türü, dil, konu/metin.
    *   Hedef: Kullanıcı bir "Uygulama" seçtiğinde, slayt gösterisinin o uygulama için olduğunu, hangi TikTok hesaplarıyla (konsept olarak) ilişkili olduğunu ve temel görsel varlıklarla başlayacağını netleştirmek.

4.  **Veri Akışı ve Kayıt (`Layout.jsx` -> `functions/index.js` -> Firestore):**
    *   `handleCommandSubmit` fonksiyonunda, `parseUserCommandCallable` çağrılırken `operationPayload.parameters` içine `product_id` (seçilen "Uygulama"nın ID'si) gönderilmeli. Eğer varsayılan yüz/arka plan varsa onların ID'leri de gönderilmeli.
    *   Backend (`performSlideshowGenerationTask` vb.), bu ID'leri alarak slayt gösterisini oluşturmalı.
    *   Oluşturulan jenerasyon kaydına `product_id`, `creator_id`, `background_id` gibi bilgileri kaydedin.

5.  **Placeholder Güncellemeleri (`Layout.jsx`):**
    *   Slayt gösterisi modu için placeholder: "Seçtiğiniz '@UygulamaAdı' için TikTok'a özel slayt gösterisi konusu/mesajı girin..."

### Epik Aşama 2: Kısmi Otomasyon ve Derin Entegrasyon

Bu aşama, MVP üzerine inşa edilerek TikTok otomasyonuna doğru daha somut adımlar atar ve kullanıcı deneyimini zenginleştirir.

1.  **"Uygulamalarım" için Gelişmiş Varlık Yönetimi (`Settings.jsx`):**
    *   Her "Uygulama" ayar ekranında, kullanıcıların şunları daha esnek bir şekilde yönetmesini sağlayın:
        *   Birden Fazla Tercih Edilen Tanıtım Yüzü.
        *   Birden Fazla Tercih Edilen TikTok Arka Planı.

2.  **Slayt Gösterisi Oluşturmada Esnek Varlık Seçimi (`Layout.jsx`):**
    *   Kullanıcı bir "Uygulama" seçtikten sonra, eğer uygulama için birden fazla tercih edilen yüz/arka plan tanımlanmışsa, kullanıcıya seçenek sunun veya rastgele kullanın.
    *   Eğer varsayılan tanımlanmamışsa, genel listelerden seçim yapmasına izin verin.

3.  **"Kampanya" Özelliğini TikTok Odaklı Olarak Geliştirme:**
    *   Çekirdek: Bir "Uygulama" seçimiyle başlar.
    *   Otomatik Varlık Kullanımı: Kampanya, seçilen "Uygulama"nın tercih edilen tanıtım yüzlerini ve arka planlarını kullanarak bir dizi içerik oluşturur.
    *   TikTok Hesap Entegrasyonu (Başlangıç): OAuth ile TikTok hesabı bağlama.
    *   İçerik Planlama ve Otomatik Yayın (Uzun Vadeli): Üretilen içeriklerin takvime göre TikTok'a otomatik yayınlanması.

4.  **"Uygulama" Bazlı Dashboard Filtreleme ve Analitik İpuçları (`Dashboard.jsx`):**
    *   Kullanıcıların "Uygulamalarım" listesinden seçerek sadece o uygulamaya ait jenerasyonları görmesini sağlayan filtreleme.
    *   (Gelecekte) TikTok performans metriklerini uygulama bazında gösterme.

5.  **Prompt Mühendisliğinde "Uygulama" Bilgilerinin Kullanımı (`functions/index.js`):**
    *   Backend'de AI'ye gönderilen prompt'lara, seçilen "Uygulama"nın adını, açıklamasını, ilişkili TikTok hesap adlarını dahil ederek daha hedefli içerikler üretmesini sağlayın. 