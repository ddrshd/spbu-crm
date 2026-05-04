# BISON — Business Integrated System for Oil Network
> PT Pertamina Patra Niaga · Sulawesi Tenggara · 2026
> Dikembangkan oleh: Didi Rushadi — Sales Branch Manager

---

## STATUS SISTEM
**Last updated:** 29 April 2026
**Live URL:** https://spbu-crm.vercel.app
**Repo:** https://github.com/ddrshd/spbu-crm
**Database:** Supabase — https://vjmsqwdzprajgqrpohzl.supabase.co

### State saat ini
- [x] UI redesign BISON — light mode, logo BISON asli embedded di login + topbar
- [x] Login fix EDC A920 — lazy Supabase init, CDN di head
- [x] Billing lifecycle + invoice PDF selesai
- [x] Portal mitra (mitra.html) + fix redirect dari invoice.html
- [x] Generator kontrak (kontrak.html)
- [x] CRUD kendaraan mitra (super_admin only)
- [x] Tab Mitra di Manajemen User + inline tambah mitra baru
- [x] Guard redirect mitra dari index.html ke mitra.html
- [x] Security Advisor: 0 errors, 16 warnings — semua fixed
- [x] migration_billing.sql confirmed dijalankan
- [x] Hint kembalian dihapus dari field Total Bayar
- [ ] Notifikasi WA ke mitra via n8n + Fonnte — belum dibangun
- [ ] Billing block nopol jika tagihan overdue — belum dibangun
- [ ] Maharani role fix — perlu dikonfirmasi via SQL

---

## FILE STRUCTURE

```
spbu-crm/
├── index.html          ← App utama (operator/manager/super_admin)
├── login.html          ← Login + redirect by role
├── mitra.html          ← Portal mitra B2B
├── kontrak.html        ← Generator kontrak PDF
├── invoice.html        ← Invoice/tagihan PDF
├── manifest.json
├── vercel.json
├── BISON.md            ← Dokumen ini
└── api/
    ├── create-user.js  ← Buat user baru (support role mitra)
    ├── toggle-user.js  ← Aktif/nonaktif user
    ├── update-user.js  ← Edit nama & password
    ├── save-kontrak.js ← Simpan kontrak (JWT decode + service key)
    └── billing.js      ← Generate/kirim/lunas invoice
```

---

## DATABASE SCHEMA

### Tabel utama
| Tabel | Fungsi |
|-------|--------|
| `profiles` | User: role, spbu_id, mitra_id, aktif |
| `spbu` | Data SPBU (id, kode, nama, alamat, aktif) |
| `produk_harga` | Produk BBM + harga + aktif/nonaktif + urutan |
| `transaksi` | Semua transaksi (mitra_id, nopol, produk, volume, total, deleted_at) |
| `mitra` | Perusahaan/instansi mitra B2B |
| `kendaraan_mitra` | Nopol kendaraan per mitra |
| `kontrak_mitra` | Kontrak kerjasama B2B |
| `tagihan_mitra` | Invoice billing lifecycle |

### Enum types
- `user_role`: operator, manager, super_admin, mitra
- `status_kontrak`: draft, aktif, expired, suspended
- `status_mitra`: aktif, nonaktif, suspended
- `mekanisme_bayar`: tunai, invoice_bulanan
- `status_tagihan`: draft, dikirim, menunggu, lunas, terlambat

---

## ROLE SYSTEM
| Role | Akses | Login ke |
|------|-------|---------|
| `operator` | Input transaksi, riwayat, dashboard SPBU sendiri | index.html |
| `manager` | + Manajemen user, kontrak, tagihan, kendaraan view | index.html |
| `super_admin` | Full access + CRUD kendaraan, semua SPBU | index.html |
| `mitra` | Portal mitra: transaksi, tagihan, kontrak armada | mitra.html |

---

## ENV VARIABLES (Vercel)
```
SUPABASE_URL=https://vjmsqwdzprajgqrpohzl.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...  ← RAHASIA
```

---

## MIGRATIONS STATUS
- [x] migration.sql — schema dasar
- [x] migration_v2.sql — RLS user management
- [x] ALTER TYPE user_role ADD VALUE 'mitra'
- [x] migration_mitra_tahap2.sql — tabel mitra, kontrak, kendaraan, RLS
- [x] migration_billing.sql — tabel tagihan_mitra
- [x] security_fix.sql — fix 8 security errors
- [x] security_warnings_fix.sql — fix 16 warnings

---

## DATA REAL

### SPBU
| Nama | Kode |
|------|------|
| Tapak Kuda | 7493104 |
| Konggoasa | — |

### Users
| Nama | Role | SPBU/Mitra |
|------|------|-----------|
| Didi | super_admin | Semua |
| Jhey Tapak | manager | Tapak Kuda |
| Budi Wasesa | operator | Tapak Kuda |
| Wahyudin | operator | Konggoasa |
| Maharani | mitra | Badan Gizi Nasional |

### Kendaraan Mitra (Badan Gizi Nasional)
| Nopol | Jenis | Produk |
|-------|-------|--------|
| DT1234AB | Pickup | Pertamax |
| DT5678CD | Truk | Dexlite |
| DT9012EF | Minibus | Pertamax |

---

## OPEN ISSUES
| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | Maharani role fix via SQL | MED | Pending |
| 2 | Notifikasi WA via n8n + Fonnte | HIGH | Belum dibangun |
| 3 | Billing block nopol saat overdue | MED | Belum dibangun |
| 4 | RLS kendaraan_mitra masih izinkan manager write | LOW | Open |

---

## TEMPLATE INSTRUKSI KE CLAUDE
```
**Sesi:** BISON B2B Fuel Management
**State terakhir:** [ringkasan STATUS SISTEM di atas]
**Target:** [nama file]
**Perubahan:** [1 hal per pesan]
**Constraint:** [apa yang tidak boleh rusak]
**Priority:** blocker / high / normal
```

---

## CHANGELOG

### 29 April 2026

#### Security
- **Fix 8 Security Errors** (`security_fix.sql`): RLS enabled pada `public.operator`, rebuild `v_operators` dan `v_user_list` tanpa join ke `auth.users`, recreate 5 views dengan `SECURITY INVOKER` bukan SECURITY DEFINER, revoke akses `anon` dari semua views
- **Fix 16 Security Warnings** (`security_warnings_fix.sql`): tambah `SET search_path = ''` pada 6 fungsi (set_updated_at, audit_transaksi, get_user_role, get_user_spbu, handle_new_user, generate_nomor_invoice), revoke EXECUTE dari PUBLIC/anon, aktifkan Leaked Password Protection via Supabase Dashboard
- Result: **Security Advisor → 0 errors, 0 warnings**

#### Bug Fix
- **Login EDC A920**: fix `Cannot access 'sb' before initialization` — lazy init `getSb()`, CDN dipindah ke `<head>`, session check via `DOMContentLoaded`, pesan error bahasa Indonesia
- **Mitra akses index.html**: tambah guard di `init()` — `if (profile.role === 'mitra') redirect ke mitra.html` sebelum apapun dirender
- **Invoice tombol Kembali**: fix hardcoded ke `index.html` — sekarang dinamis: mitra → `mitra.html`, lainnya → `index.html`
- **Hint kembalian dihapus**: field Total Bayar tidak lagi tampilkan keterangan liter maupun rupiah kembalian; hint volume tetap tampil saat input volume

#### UI/UX — BISON Rebrand
- **login.html light mode**: background putih bersih, logo BISON PNG asli embedded base64 (~304KB), 4 feature cards (B2B Solution, Digital Monitoring, Smart Contract, Billing & Invoice) menggantikan role pills
- **Topbar index.html**: background putih harmonis dengan logo, logo BISON 90×36px embedded, tab text navy, stripe tri-warna merah-biru-hijau solid
- **Fix logo terpotong Android**: hapus `max-height:100px`, `overflow:visible`, width `80%` max `280px`, padding dikurangi, `padding-top:28px` pada wrap
- **Topbar warna**: navy → putih; user chip, conn dot, logout btn disesuaikan untuk white background

#### Deliverables
- **BISON-Presentation.pptx**: 10 slide profesional (Cover, Masalah, Solusi, 4 Fitur, Data Pilot, Skala Nasional, Penutup) dengan warna Pertamina, space mockup tersedia di slide 1/4/5/6/7
- **Prompt pack presentasi**: 5 prompt untuk ChatGPT/Canva/Gamma/HeyGen siap pakai
- **Panduan commit convention**: prefix feat/fix/ui/db/docs, rollback workflow, script `push-bison.sh`
- **BISON.md living document**: panduan setup, template instruksi Claude, changelog

---

### 28–29 April 2026

#### Fitur Baru
- **Billing lifecycle** (`api/billing.js`): generate invoice dari transaksi periode, kirim ke mitra, tandai lunas — status tracking draft → dikirim → menunggu → lunas/terlambat
- **invoice.html**: halaman invoice PDF profesional — kop surat Pertamina, rincian per kendaraan & produk, summary volume & total, ruang TTD, toolbar status untuk manager
- **Tab Tagihan index.html** (Manager & Super Admin): 4 summary cards, filter status, modal generate invoice dengan preview jumlah transaksi sebelum generate
- **Tab Tagihan mitra.html**: summary belum lunas/terlambat/lunas, list card per invoice, link ke invoice PDF
- **CRUD kendaraan mitra**: tambah, edit, aktifkan/nonaktifkan, hapus — super_admin only, manager view-only
- **Tab Mitra di Manajemen User**: filter Semua/Operator/Manager/Mitra, kolom "SPBU / Perusahaan" adaptif, badge mitra warna amber
- **Form Tambah User role Mitra**: dropdown pilih perusahaan + tombol "+ Baru" untuk tambah mitra langsung dari modal
- **Kolom SPBU di Riwayat**: manager & super_admin lihat nama SPBU per transaksi, export CSV include kolom SPBU
- **Badge B2B**: nopol mitra ditandai badge hijau di tabel riwayat

#### UI Improvements
- Remove mode toggle Volume↔Total — dual auto-calc tanpa switch: isi salah satu, yang lain otomatis
- Placeholder nopol ganti ke `DT1234AB` (tanpa spasi)
- Remove fitur shift aktif dari form input transaksi
- Rename: "Catat Transaksi BBM Non-Subsidi" → "Catat Transaksi BBM"
- Kendaraan mitra: kolom Aksi hanya muncul untuk super_admin, guard di fungsi edit/delete/toggle

#### API Updates
- `api/create-user.js`: support `mitra_id`, validasi role mitra, manager hanya bisa buat operator SPBU-nya
- `switchSubtab()` untuk navigasi Kontrak Aktif ↔ Kendaraan Mitra

---

### 21–22 April 2026

#### Fitur Baru
- **kontrak.html**: generator kontrak PDF — 7 pasal standar B2B BBM, auto-populate data mitra & SPBU, preview overlay, cetak PDF, simpan ke database
- **api/save-kontrak.js**: simpan kontrak ke `kontrak_mitra` dengan JWT decode + service key bypass RLS
- **Tab Kontrak Mitra index.html**: daftar kontrak aktif, progress bar durasi, preview inline, sub-tab Kendaraan
- **Auto-detect mitra**: input nopol → badge B2B muncul, `mitra_id` & `nopol_mitra` ter-inject ke payload transaksi
- **Portal mitra (mitra.html)**: dashboard, riwayat transaksi armada, daftar kendaraan, kontrak, tagihan
- **api/update-user.js**: edit nama & password user, modal edit di Manajemen User

#### Bug Fix
- Fix `save-kontrak.js`: query profiles tanpa filter `id` ambil profil acak → fix dengan `eq('id', callerId)`
- Fix orphan code `toggleUser` duplikat menyebabkan braces tidak seimbang
- Fix nested backtick invalid di `renderKontrakList` — pisah ke fungsi terpisah `getProgressColor()`
- Fix deploy `index.html` 167KB — GitHub web editor tidak reliable, gunakan terminal + `push.sh`
- Fix transaksi tidak muncul di portal mitra — `mitra_id` belum ter-inject → tambah auto-detect di `checkRepeat` + payload insert

#### Refactor
- Merge tab Operator ke tab Manajemen User (redundant dihapus)
- Toggle aktif/nonaktif produk BBM (super_admin), manager view-only
- `renderProdukGrid` filter hanya produk aktif untuk form input operator

---

### 20–21 April 2026

#### Fondasi
- Role-based access system: operator / manager / super_admin / mitra
- Input transaksi BBM real-time dengan logo produk Pertamina base64
- Dashboard KPI: revenue, volume, repeat customer, doughnut chart produk, bar chart per jam
- Manajemen User: create via API, edit nama+password, toggle aktif/nonaktif
- Data SPBU management (super_admin)
- Produk & Harga: toggle aktif, edit harga inline
- Login page dengan redirect by role
- Migration SQL: schema dasar, RLS policies, enum types
- Setup Vercel serverless API + Supabase + GitHub deployment
- `manifest.json` PWA capability

---

## SQL REFERENSI CEPAT

### Fix Maharani role mitra
```sql
UPDATE profiles
SET role = 'mitra',
    mitra_id = (SELECT id FROM mitra WHERE nama_perusahaan ILIKE '%badan gizi%' LIMIT 1)
WHERE nama ILIKE '%maharani%';
```

### Link transaksi historis ke mitra
```sql
UPDATE transaksi t
SET mitra_id = k.mitra_id, nopol_mitra = t.nopol
FROM kendaraan_mitra k
WHERE UPPER(REPLACE(t.nopol, ' ', '')) = UPPER(REPLACE(k.nopol, ' ', ''))
  AND t.mitra_id IS NULL AND t.deleted_at IS NULL;
```

### Cek semua user aktif
```sql
SELECT p.nama, p.role, p.aktif, s.nama AS spbu, m.nama_perusahaan AS mitra
FROM profiles p
LEFT JOIN spbu s ON s.id = p.spbu_id
LEFT JOIN mitra m ON m.id = p.mitra_id
ORDER BY p.role, p.nama;
```

### Auto-generate Changelog (GitHub Actions)
File: `.github/workflows/update-changelog.yml`
Setiap push ke main → baris commit message ditambahkan ke section "Auto-generated" di BISON.md
