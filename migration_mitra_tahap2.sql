-- ============================================================
-- SPBU CRM — Migration Mitra B2B (TAHAP 2)
-- Jalankan ini SETELAH berhasil run:
--   ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'mitra';
-- ============================================================

-- ─── 1. ENUM BARU ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE mekanisme_bayar AS ENUM ('tunai', 'invoice_bulanan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_kontrak AS ENUM ('draft', 'aktif', 'expired', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_mitra AS ENUM ('aktif', 'nonaktif', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. TABEL MITRA ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mitra (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spbu_id          UUID REFERENCES spbu(id),
  nama_perusahaan  TEXT NOT NULL,
  npwp             TEXT,
  alamat           TEXT,
  pic_nama         TEXT NOT NULL,
  pic_telp         TEXT,
  pic_email        TEXT,
  mekanisme_bayar  mekanisme_bayar NOT NULL DEFAULT 'tunai',
  status           status_mitra NOT NULL DEFAULT 'aktif',
  catatan          TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS mitra_updated_at ON mitra;
CREATE TRIGGER mitra_updated_at
  BEFORE UPDATE ON mitra
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 3. TABEL KONTRAK MITRA ─────────────────────────────────
CREATE TABLE IF NOT EXISTS kontrak_mitra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitra_id          UUID NOT NULL REFERENCES mitra(id),
  spbu_id           UUID NOT NULL REFERENCES spbu(id),
  nomor_kontrak     TEXT UNIQUE NOT NULL DEFAULT '',
  tanggal_mulai     DATE NOT NULL,
  tanggal_selesai   DATE NOT NULL,
  volume_estimasi   NUMERIC(10,2),
  status            status_kontrak NOT NULL DEFAULT 'draft',
  syarat_pembayaran TEXT,
  ketentuan_khusus  TEXT,
  catatan_internal  TEXT,
  dibuat_oleh       UUID REFERENCES auth.users(id),
  disetujui_oleh    TEXT,
  jabatan_penanda   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS kontrak_updated_at ON kontrak_mitra;
CREATE TRIGGER kontrak_updated_at
  BEFORE UPDATE ON kontrak_mitra
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-generate nomor kontrak
CREATE OR REPLACE FUNCTION generate_nomor_kontrak()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  yr  TEXT := TO_CHAR(NOW(), 'YYYY');
  seq INT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
  FROM kontrak_mitra
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.nomor_kontrak := 'KTR/' || yr || '/' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_nomor_kontrak ON kontrak_mitra;
CREATE TRIGGER auto_nomor_kontrak
  BEFORE INSERT ON kontrak_mitra
  FOR EACH ROW
  WHEN (NEW.nomor_kontrak IS NULL OR NEW.nomor_kontrak = '')
  EXECUTE FUNCTION generate_nomor_kontrak();

-- ─── 4. TABEL KENDARAAN MITRA ───────────────────────────────
CREATE TABLE IF NOT EXISTS kendaraan_mitra (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitra_id   UUID NOT NULL REFERENCES mitra(id) ON DELETE CASCADE,
  nopol      TEXT NOT NULL,
  jenis      TEXT,
  produk_bbm TEXT,
  aktif      BOOLEAN DEFAULT TRUE,
  catatan    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mitra_id, nopol)
);

CREATE INDEX IF NOT EXISTS idx_kendaraan_nopol ON kendaraan_mitra(nopol);

-- ─── 5. TAMBAH KOLOM KE PROFILES & TRANSAKSI ────────────────
ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS mitra_id UUID REFERENCES mitra(id);
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS mitra_id UUID REFERENCES mitra(id);
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS nopol_mitra BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_transaksi_mitra ON transaksi(mitra_id);

-- ─── 6. VIEW TAGIHAN MITRA ──────────────────────────────────
CREATE OR REPLACE VIEW v_tagihan_mitra AS
  SELECT
    t.mitra_id,
    m.nama_perusahaan,
    DATE_TRUNC('month', t.created_at) AS bulan,
    COUNT(*)                          AS jumlah_transaksi,
    ROUND(SUM(t.volume)::NUMERIC, 2)  AS total_volume,
    SUM(t.total)                      AS total_tagihan,
    COUNT(DISTINCT t.nopol)           AS jumlah_kendaraan
  FROM transaksi t
  JOIN mitra m ON m.id = t.mitra_id
  WHERE t.deleted_at IS NULL
  GROUP BY t.mitra_id, m.nama_perusahaan, DATE_TRUNC('month', t.created_at);

GRANT SELECT ON v_tagihan_mitra TO authenticated;

-- ─── 7. RLS ─────────────────────────────────────────────────
ALTER TABLE mitra           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kontrak_mitra   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kendaraan_mitra ENABLE ROW LEVEL SECURITY;

-- Drop policy lama jika ada
DROP POLICY IF EXISTS "mitra_read"      ON mitra;
DROP POLICY IF EXISTS "mitra_manage"    ON mitra;
DROP POLICY IF EXISTS "kontrak_read"    ON kontrak_mitra;
DROP POLICY IF EXISTS "kontrak_manage"  ON kontrak_mitra;
DROP POLICY IF EXISTS "kendaraan_read"  ON kendaraan_mitra;
DROP POLICY IF EXISTS "kendaraan_manage" ON kendaraan_mitra;
DROP POLICY IF EXISTS "transaksi_read"  ON transaksi;

-- Mitra policies
CREATE POLICY "mitra_read" ON mitra FOR SELECT USING (
  get_user_role() IN ('super_admin', 'manager', 'operator')
  OR (get_user_role() = 'mitra' AND id = (
    SELECT mitra_id FROM profiles WHERE id = auth.uid()
  ))
);
CREATE POLICY "mitra_manage" ON mitra FOR ALL USING (
  get_user_role() IN ('super_admin', 'manager')
);

-- Kontrak policies
CREATE POLICY "kontrak_read" ON kontrak_mitra FOR SELECT USING (
  get_user_role() IN ('super_admin', 'manager', 'operator')
  OR (get_user_role() = 'mitra' AND mitra_id = (
    SELECT mitra_id FROM profiles WHERE id = auth.uid()
  ))
);
CREATE POLICY "kontrak_manage" ON kontrak_mitra FOR ALL USING (
  get_user_role() IN ('super_admin', 'manager')
);

-- Kendaraan policies
CREATE POLICY "kendaraan_read" ON kendaraan_mitra FOR SELECT USING (
  get_user_role() IN ('super_admin', 'manager', 'operator')
  OR (get_user_role() = 'mitra' AND mitra_id = (
    SELECT mitra_id FROM profiles WHERE id = auth.uid()
  ))
);
CREATE POLICY "kendaraan_manage" ON kendaraan_mitra FOR ALL USING (
  get_user_role() IN ('super_admin', 'manager')
);

-- Update RLS transaksi agar mitra bisa lihat transaksinya
CREATE POLICY "transaksi_read" ON transaksi FOR SELECT USING (
  deleted_at IS NULL
  AND (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'manager'  AND spbu_id = get_user_spbu())
    OR (get_user_role() = 'operator' AND operator_id = auth.uid())
    OR (get_user_role() = 'mitra'    AND mitra_id = (
      SELECT mitra_id FROM profiles WHERE id = auth.uid()
    ))
  )
);

-- ─── VERIFIKASI ──────────────────────────────────────────────
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_name = t.table_name AND table_schema = 'public') AS jumlah_kolom
FROM (VALUES ('mitra'),('kontrak_mitra'),('kendaraan_mitra')) AS t(table_name)
ORDER BY table_name;
