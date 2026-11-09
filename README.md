# 📽️ Portal Operator Presentasi Canva Real-Time

Sistem portal otomatisasi presentasi Canva untuk operator proyektor dan peserta acara / kelas / seminar.

---

## ⚡ Cara Menjalankan

Cukup klik dua kali file:
```
start-portal.bat
```
Atau melalui terminal:
```bash
npm start
```

Secara otomatis, server akan berjalan dan membuka 2 jendela:
1. **Dashboard Admin Operator**: `http://localhost:3333/admin`
2. **Layar Proyektor Fullscreen**: `http://localhost:3333/projector`

---

## 📱 Alur Penggunaan

### 1. Peserta Mengisi Form (HP / Laptop)
- Hubungkan perangkat ke **jaringan Wi-Fi yang sama**.
- Peserta cukup scan **QR Code** yang tertera di proyektor/laptop operator, atau ketik alamat IP yang muncul (contoh: `http://192.168.1.36:3333`).
- Peserta mengisi:
  * Nama Lengkap / Kelompok
  * Judul Presentasi
  * Link Canva (Izin: *"Siapa saja yang memiliki tautan bisa melihat"*)
- Klik **Kirim Slide**. Peserta akan mendapatkan nomor urutan dan live update status.

### 2. Operator Mengontrol Proyektor (`/admin`)
- Di layar operator, daftar peserta yang baru mendaftar akan langsung muncul secara otomatis (disertai suara notifikasi *chime*).
- Operator dapat:
  * Klik tombol **▶ Tampilkan** pada nama peserta ➔ Layar proyektor langsung memuat slide Canva peserta tersebut dengan transisi intro nama.
  * Klik **⏭ Selanjutnya** ketika peserta selesai ➔ Otomatis berganti ke slide peserta berikutnya.
  * Klik **⏮ Sebelumnya** untuk kembali ke pembicara sebelumnya.
  * Klik **⏹ Layar Standby** jika sedang sesi tanya jawab, istirahat, atau menunggu giliran (menampilkan QR code & nama pembicara berikutnya).
  * Geser urutan maju (⬆ / ⬇) jika ada peserta yang bertukar giliran.

### 3. Tampilan Proyektor (`/projector`)
- Pindahkan jendela `http://localhost:3333/projector` ke layar kedua (monitor/kabel HDMI proyektor).
- Tekan **F11** pada keyboard untuk mode Fullscreen tanpa batas.
- Dilengkapi autohide HUD, animasi transisi antar peserta, dan tombol pembuka darurat jika diperlukan.

---

## 🛡️ Catatan Izin Link Canva (Penting)
Pastikan teman-teman/peserta mengatur izin link Canva mereka sebelum disalin:
1. Klik tombol **Bagikan** (*Share*) di Canva.
2. Di bagian tautan kolaborasi, pilih **"Siapa saja yang memiliki tautan" ➔ "Dapat melihat"**.
3. Klik **Salin tautan** (*Copy link*).
