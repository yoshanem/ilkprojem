# TR-YÖS Deneme Uygulaması

Tarayıcıda çalışan, kurulum gerektirmeyen bir TR-YÖS deneme sınavı uygulaması.

## Çalıştırma

`index.html` dosyasını tarayıcıda açmanız yeterli. Sunucu, derleme ya da bağımlılık gerekmez.

## Özellikler

- **Bölümler:** Temel Düşünme (IQ), Matematik, Geometri — istediğiniz bölümleri seçin
- **Ayarlanabilir sınav:** soru sayısı, süre (varsayılan soru başına 1,5 dk), soru karıştırma
- **Net hesabı:** 4 yanlış / 3 yanlış 1 doğruyu götürür ya da cezasız
- **Sınav ekranı:** geri sayım, soru haritası, "sonra bak" işareti, cevap silme
- **Klavye:** A–E şık seçer, ← → sorular arasında gezer
- **Kaldığın yerden devam:** sayfa yenilense de sınav kaybolmaz (localStorage)
- **Sonuç:** toplam ve bölüm bazında doğru/yanlış/boş/net, soru soru çözümlü inceleme
- **Geçmiş:** son 20 denemenin sonuçları

## Soru ekleme

Sorular `js/questions.js` içindedir. Yeni soru eklemek için aynı formatta bir nesne ekleyin:

```js
{ id: "mat16", section: "mat", text: "Soru metni",
  options: ["A şıkkı", "B", "C", "D", "E"], answer: 2, // 0=A ... 4=E
  explanation: "Çözüm açıklaması" },
```

Ardından soru bankasını doğrulayın:

```sh
node scripts/validate.js
```

> Not: Bankadaki sorular özgün örnek sorulardır; resmî ÖSYM soruları değildir.
