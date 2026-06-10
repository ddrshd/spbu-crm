/**
 * POST /api/update-user
 * - get_only: true  → kembalikan email user (tidak ada update)
 * - Update nama, email, dan/atau password user
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

  const { target_user_id, nama, password, email, get_only } = req.body;
  if (!target_user_id) return res.status(400).json({ error: 'target_user_id wajib diisi' });

  // Ambil data target user dari Auth (butuh service key)
  const authRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${target_user_id}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    }
  });
  const authUser = await authRes.json();
  if (!authRes.ok || !authUser?.id) {
    return res.status(404).json({ error: 'User tidak ditemukan di Auth' });
  }

  // ── MODE: get_only → kembalikan email saja ───────────────────
  if (get_only) {
    return res.status(200).json({ email: authUser.email || '' });
  }

  // ── Validasi: minimal satu field diisi ───────────────────────
  if (!nama && !password && !email) {
    return res.status(400).json({ error: 'Isi minimal satu field yang ingin diubah' });
  }

  // Ambil profil target untuk cek role
  const targetRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?id=eq.${target_user_id}&select=role,spbu_id&limit=1`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
  );
  const targets = await targetRes.json();
  if (!targets?.length) return res.status(404).json({ error: 'Profil tidak ditemukan' });

  const target = targets[0];

  // ── Isolasi manager: hanya bisa edit operator SPBU-nya ───────
  if (caller.role === 'manager') {
    if (target.role !== 'operator' || target.spbu_id !== caller.spbu_id) {
      return res.status(403).json({ error: 'Hanya bisa edit operator SPBU Anda' });
    }
  }

  const updated = { nama: false, email: false, password: false };

  // ── Update password ──────────────────────────────────────────
  if (password) {
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter' });
    }
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
    updated.password = true;
  }

  // ── Update email ─────────────────────────────────────────────
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid' });
    }
    const emailRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${target_user_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ email, email_confirm: true }) // email_confirm: langsung aktif tanpa verifikasi
    });
    if (!emailRes.ok) {
      const err = await emailRes.json();
      return res.status(400).json({ error: 'Gagal update email: ' + (err.message || 'unknown') });
    }
    updated.email = true;
  }

  // ── Update nama di profiles ───────────────────────────────────
  if (nama) {
    const namaRes = await fetch(
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
    if (!namaRes.ok) {
      const err = await namaRes.json();
      return res.status(400).json({ error: 'Gagal update nama: ' + (err.message || 'unknown') });
    }
    updated.nama = true;
  }

  return res.status(200).json({ success: true, updated });
};
