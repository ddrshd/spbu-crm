/**
 * POST /api/save-kontrak
 * Simpan kontrak mitra ke tabel kontrak_mitra
 * Hanya bisa diakses oleh manager dan super_admin
 */

const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY    = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifikasi caller
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const callerRes = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id,role,spbu_id&limit=1`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
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
    return res.status(400).json({ error: 'mitra_id, spbu_id, tanggal_mulai, tanggal_selesai wajib diisi' });
  }

  // Manager hanya bisa simpan kontrak untuk SPBU-nya sendiri
  if (caller.role === 'manager' && spbu_id !== caller.spbu_id) {
    return res.status(403).json({ error: 'Manager hanya bisa membuat kontrak untuk SPBU-nya sendiri' });
  }

  const { data, error } = await fetch(`${SUPA_URL}/rest/v1/kontrak_mitra`, {
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
      nomor_kontrak: '',  // auto-generate oleh trigger
      tanggal_mulai,
      tanggal_selesai,
      volume_estimasi: volume_estimasi || null,
      syarat_pembayaran: syarat_pembayaran || null,
      ketentuan_khusus: ketentuan_khusus || null,
      disetujui_oleh: disetujui_oleh || null,
      jabatan_penanda: jabatan_penanda || null,
      status: status || 'aktif',
      dibuat_oleh: caller.id,
    })
  }).then(r => r.json().then(d => ({ data: d, error: r.ok ? null : d })));

  if (error) {
    return res.status(400).json({ error: error.message || 'Gagal menyimpan kontrak' });
  }

  return res.status(200).json({ success: true, kontrak: Array.isArray(data) ? data[0] : data });
};
