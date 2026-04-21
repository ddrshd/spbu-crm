/**
 * POST /api/update-user
 * Update nama dan/atau password user
 * Hanya bisa diakses oleh manager (untuk operatornya) dan super_admin
 */

const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY    = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Verifikasi caller
  const callerRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?select=id,role,spbu_id&limit=1`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` } }
  );
  const callerProfiles = await callerRes.json();
  if (!callerProfiles?.length) return res.status(401).json({ error: 'Unauthorized' });

  const caller = callerProfiles[0];
  if (!['manager', 'super_admin'].includes(caller.role)) {
    return res.status(403).json({ error: 'Tidak punya akses' });
  }

  const { target_user_id, nama, password } = req.body;
  if (!target_user_id) return res.status(400).json({ error: 'target_user_id wajib diisi' });
  if (!nama && !password) return res.status(400).json({ error: 'Isi minimal nama atau password baru' });

  // Cek target user — manager hanya bisa edit operator di SPBU-nya
  const targetRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?id=eq.${target_user_id}&select=role,spbu_id&limit=1`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
  );
  const targets = await targetRes.json();
  if (!targets?.length) return res.status(404).json({ error: 'User tidak ditemukan' });

  const target = targets[0];
  if (caller.role === 'manager') {
    if (target.role !== 'operator' || target.spbu_id !== caller.spbu_id) {
      return res.status(403).json({ error: 'Hanya bisa edit operator SPBU Anda' });
    }
  }

  // Update password di Supabase Auth jika diisi
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });

    const pwRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${target_user_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ password })
    });
    if (!pwRes.ok) {
      const err = await pwRes.json();
      return res.status(400).json({ error: 'Gagal update password: ' + (err.message || 'unknown') });
    }
  }

  // Update nama di profiles jika diisi
  if (nama) {
    await fetch(
      `${SUPA_URL}/rest/v1/profiles?id=eq.${target_user_id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ nama })
      }
    );
  }

  return res.status(200).json({ success: true, updated: { nama: !!nama, password: !!password } });
};
