# BISON — Business Integrated System for Oil Network
> PT Pertamina Patra Niaga · Sulawesi Tenggara · 2026
> Dikembangkan oleh: Sales Branch Manager (Didi Rushadi)

---

## STATUS SISTEM
**Last updated:** April 2026
**Live URL:** https://spbu-crm.vercel.app
**Repo:** https://github.com/ddrshd/spbu-crm
**Database:** Supabase — https://vjmsqwdzprajgqrpohzl.supabase.co

### State saat ini
- [ ] UI redesign FUELTRACK/BISON (CSS baru sudah di index.html, belum di-push)
- [x] Tab Tagihan + billing lifecycle selesai
- [x] Portal mitra (mitra.html) selesai
- [x] Generator kontrak (kontrak.html) selesai
- [x] Invoice PDF (invoice.html) selesai
- [x] CRUD kendaraan mitra selesai
- [x] Tab filter Mitra di Manajemen User selesai
- [ ] migration_billing.sql belum dikonfirmasi sudah dijalankan
- [ ] Nama BISON belum diapply ke semua file

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
    ├── save-kontrak.js ← Simpan kontrak (bypass RLS)
    └── billing.js      ← Generate/kirim/lunas invoice
```

---

## DATABASE SCHEMA

### Tabel utama
| Tabel | Fungsi |
|-------|--------|
| `profiles` | User data + role + spbu_id + mitra_id |
| `spbu` | Data SPBU (id, kode, nama, alamat) |
| `produk_harga` | Produk BBM + harga + aktif/nonaktif |
| `transaksi` | Semua transaksi BBM (mitra_id, nopol, produk, volume, total) |
| `mitra` | Data perusahaan/instansi mitra |
| `kendaraan_mitra` | Nopol kendaraan per mitra |
| `kontrak_mitra` | Kontrak kerjasama B2B |
| `tagihan_mitra` | Invoice billing lifecycle |

### Enum types
- `user_role`: operator, manager, super_admin, mitra
- `status_kontrak`: draft, aktif, expired, suspended
- `status_mitra`: aktif, nonaktif, suspended
- `mekanisme_bayar`: tunai, invoice_bulanan
- `status_tagihan`: draft, dikirim, menunggu, lunas, terlambat

### Kolom penting transaksi
```sql
transaksi: id, spbu_id, operator_id, shift_id, nopol, produk,
           produk_kode, volume, harga_per_liter, total, catatan,
           mitra_id, nopol_mitra, deleted_at, created_at
```

---

## ROLE SYSTEM

| Role | Akses | Login ke |
|------|-------|---------|
| `operator` | Input transaksi, riwayat, dashboard (SPBU sendiri) | index.html |
| `manager` | + Manajemen user, kontrak, tagihan, kendaraan (view) | index.html |
| `super_admin` | Full access + CRUD kendaraan mitra, semua SPBU | index.html |
| `mitra` | Portal mitra: transaksi, tagihan, kontrak armadanya | mitra.html |

---

## ENV VARIABLES (Vercel Dashboard)
```
SUPABASE_URL=https://vjmsqwdzprajgqrpohzl.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...  ← RAHASIA, jangan expose
```

---

## MIGRATIONS YANG SUDAH DIJALANKAN
- [x] migration.sql — schema dasar
- [x] migration_v2.sql — RLS user management
- [x] ALTER TYPE user_role ADD VALUE 'mitra' — dijalankan terpisah
- [x] migration_mitra_tahap2.sql — tabel mitra, kontrak, kendaraan, RLS
- [ ] migration_billing.sql — tabel tagihan_mitra ← BELUM DIKONFIRMASI

---

## DATA REAL YANG SUDAH ADA

### SPBU
- Tapak Kuda (kode: 7493104)
- Konggoasa

### User aktif
| Nama | Role | SPBU/Mitra |
|------|------|-----------|
| Didi (kamu) | super_admin | Semua |
| Jhey Tapak | manager | Tapak Kuda |
| Budi Wasesa | operator | Tapak Kuda |
| Wahyudin | operator | Konggoasa |
| Maharani | mitra | Badan Gizi Nasional |

### Mitra terdaftar
- Badan Gizi Nasional (invoice_bulanan)

### Kendaraan mitra
- DT 1234 AB — Pickup — Pertamax
- DT 5678 CD — Truk — Dexlite
- DT 9012 EF — Minibus — Pertamax

---

## OPEN ISSUES

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | migration_billing.sql perlu dijalankan | HIGH | Open |
| 2 | Nama BISON belum diapply ke semua file | MED | Open |
| 3 | UI redesign CSS baru perlu di-push | MED | Open |
| 4 | RLS kendaraan_mitra masih izinkan manager write | LOW | Open |
| 5 | Transaksi historis perlu di-link ke mitra via SQL | MED | Perlu konfirmasi |

---

## CARA UPDATE DOKUMEN INI

Setiap kali ada perubahan signifikan:
1. Update checklist di bagian STATUS SISTEM
2. Tambah/hapus baris di OPEN ISSUES
3. Commit dengan pesan: `docs: update BISON.md - [ringkasan perubahan]`

---

## TEMPLATE INSTRUKSI KE CLAUDE

Gunakan format ini untuk instruksi yang efisien:

```
**Target file:** index.html / mitra.html / api/billing.js
**Perubahan:** [deskripsi singkat]
**Constraint:** [apa yang tidak boleh berubah]
**Priority:** [blocker / high / normal]
**State:** Fitur X sudah jalan, fitur Y belum
```

---

## CHANGELOG

### April 2026
- Billing lifecycle: generate invoice, kirim, tandai lunas
- Invoice PDF (invoice.html) dengan rincian transaksi
- Tab Tagihan di index.html (manager) dan mitra.html (mitra)
- CRUD kendaraan mitra — super_admin only
- Tab filter Mitra di Manajemen User
- Role mitra di form tambah user (dropdown perusahaan + form inline tambah mitra baru)
- UI redesign: FUELTRACK branding, Pertamina colors, mobile-first
- Dual auto-calc volume ↔ total bayar (tanpa mode toggle)
- Remove shift UI dari form transaksi
- Auto-detect mitra dari nopol (badge B2B + mitra_id di payload transaksi)
- Tab Kontrak Mitra + sub-tab Kendaraan
- Generator kontrak PDF (kontrak.html)
- Portal mitra (mitra.html) — dashboard, transaksi, kendaraan, kontrak, tagihan
- Migration mitra B2B (tabel mitra, kontrak_mitra, kendaraan_mitra)

### Maret 2026
- Role-based access system (operator/manager/super_admin)
- Input transaksi dengan produk logo Pertamina
- Dashboard KPI + charts
- Manajemen User (create/edit/toggle)
- Data SPBU management
- Produk & Harga dengan toggle aktif

