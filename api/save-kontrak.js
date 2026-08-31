/**
 * POST /api/save-kontrak
 * Simpan kontrak mitra ke tabel kontrak_mitra
 * Hanya bisa diakses oleh manager dan super_admin
 */

const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Generate nomor kontrak unik: KTR/YYYY/NNNN
// Cek nomor terakhir di DB lalu increment
async function generateNomorKontrak(spbuId) {
  const year = new Date().getFullYear();
  const prefix = `KTR/${year}/`;

  // Ambil nomor kontrak terakhir tahun ini
  const res = await fetch(
    `${SUPA_URL}/rest/v1/kontrak_mitra?nomor_kontrak=like.${encodeURIComponent(prefix + '%')}&select=nomor_kontrak&order=nomor_kontrak.desc&limit=1`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    }
  );
  const rows = await res.json();

  let urutan = 1;
  if (rows?.length && rows[0].nomor_kontrak) {
    const parts = rows[0].nomor_kontrak.split('/');
    const lastNum = parseInt(parts[parts.length - 1]) || 0;
    urutan = lastNum + 1;
  }

  return `${prefix}${String(urutan).padStart(4, '0')}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Decode user ID dari JWT payload
  let userId;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    userId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Token tidak valid' });
  }

  if (!userId) return res.status(401).json({ error: 'User ID tidak ditemukan' });

  // Ambil profil caller
  const callerRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,spbu_id&limit=1`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    }
  );
  const profiles = await callerRes.json();
  if (!profiles?.length) return res.status(401).json({ error: 'Profil tidak ditemukan' });

  const caller = profiles[0];
  if (!['manager', 'super_admin'].includes(caller.role)) {
    return res.status(403).json({ error: 'Hanya manager atau super admin yang bisa menyimpan kontrak' });
  }

  const {
    mitra_id, spbu_id, tanggal_mulai, tanggal_selesai,
    volume_estimasi, syarat_pembayaran, ketentuan_khusus,
    disetujui_oleh, jabatan_penanda, status
  } = req.body;

  if (!mitra_id || !spbu_id || !tanggal_mulai || !tanggal_selesai) {
    return res.status(400).json({
      error: 'mitra_id, spbu_id, tanggal_mulai, tanggal_selesai wajib diisi'
    });
  }

  // Manager hanya bisa simpan untuk SPBU-nya sendiri
  if (caller.role === 'manager' && spbu_id !== caller.spbu_id) {
    return res.status(403).json({ error: 'Manager hanya bisa membuat kontrak untuk SPBU-nya sendiri' });
  }

  // Generate nomor kontrak unik — retry sampai 3x jika collision
  let nomorKontrak;
  let insertRes, data;

  for (let attempt = 1; attempt <= 3; attempt++) {
    nomorKontrak = await generateNomorKontrak(spbu_id);

    insertRes = await fetch(`${SUPA_URL}/rest/v1/kontrak_mitra`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        mitra_id,
        spbu_id,
        nomor_kontrak:     nomorKontrak,
        tanggal_mulai,
        tanggal_selesai,
        volume_estimasi:   volume_estimasi   || null,
        syarat_pembayaran: syarat_pembayaran || null,
        ketentuan_khusus:  ketentuan_khusus  || null,
        disetujui_oleh:    disetujui_oleh    || null,
        jabatan_penanda:   jabatan_penanda   || null,
        status:            status            || 'aktif',
        dibuat_oleh:       caller.id,
      })
    });

    data = await insertRes.json();

    // Jika bukan duplicate key error, break loop
    if (insertRes.ok) break;
    if (!JSON.stringify(data).includes('duplicate key')) break;

    // Duplicate: tunggu sebentar lalu retry
    await new Promise(r => setTimeout(r, 100 * attempt));
  }

  if (!insertRes.ok) {
    console.error('Insert kontrak error:', data);
    return res.status(400).json({
      error: data.message || data.error || 'Gagal menyimpan kontrak'
    });
  }

  const kontrak = Array.isArray(data) ? data[0] : data;
  return res.status(200).json({ success: true, kontrak });
};
