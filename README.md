# 51 Okey Online

Kanlı 51 Okey — telefon ve tablete uygun online masa.

```bash
npm install
npm test
npm run dev
```

- Oyun: http://localhost:5173
- Sunucu: http://localhost:3001

Telefondan denemek için bilgisayar ve telefon aynı Wi-Fi’de olsun; Vite `host: true` açık.

## Google Play (Android)

Sunucuyu internete açtıktan sonra istemciyi o adrese bağla:

```bash
# client/.env.production
VITE_SERVER_URL=https://senin-sunucun.com
```

```bash
cd client
npx cap add android
npm run android:sync
npm run android:open
```

Android Studio’dan APK/AAB üret. Play Console için imza, ikon ve gizlilik politikası gerekir.
