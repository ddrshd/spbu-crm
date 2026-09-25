/**
 * POST /api/change-password
 * User mengganti password-nya sendiri.
 * Body: { password_lama, password_baru }
 *
 * 1. Validasi token caller (GET /auth/v1/user)
 * 2. Validasi aturan password baru (server-side, tidak bisa dilewati)
 * 3. Verifikasi password lama
 * 4. Update password (lewat endpoint user → ikut aturan Supabase Auth + leaked password check)
 * 5. Hapus flag wajib_ganti_password (service key) + verifikasi
 * 6. Keluarkan sesi di perangkat lain
 */

const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY    = process.env.SUPABASE_ANON_KEY;

const KATA_TERLARANG = ['pertamina', 'patraniaga', 'bison', 'spbu', '123456', 'password', 'qwerty'];

function cekAturanPassword(pw, email) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password minimal 8 karakter';
  if (pw.length > 72) return 'Password maksimal 72 karakter';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password harus berisi huruf dan angka';
  const low = pw.toLowerCase();
  const kata = KATA_TERLARANG.find(k => low.includes(k));
  if (kata) return `Password tidak boleh mengandung "${kata}"`;
  const lokal = String(email || '').split('@')[0].toLowerCase();
  if (lokal.length >= 4 && low.includes(lokal)) return 'Password tidak boleh mengandung bagian dari email';
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // 1. Validasi token → ambil user
  const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  const user = await userRes.json().catch(() => null);
  if (!userRes.ok || !user?.id || !user?.email) {
    return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
  }

  const { password_lama, password_baru } = req.body || {};
  if (!password_baru) {
    return res.status(400).json({ error: 'Password baru wajib diisi' });
  }

  // Password lama boleh kosong HANYA untuk akun yang masih wajib ganti
  // (login pertama / setelah reset — user baru saja login dengan password sementara)
  if (!password_lama) {
    const pRes = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${user.id}&select=wajib_ganti_password&limit=1`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const rows = pRes.ok ? await pRes.json().catch(() => []) : [];
    if (rows?.[0]?.wajib_ganti_password !== true) {
      return res.status(400).json({ error: 'Password lama wajib diisi' });
    }
  }

  if (password_lama && password_lama === password_baru) {
    return res.status(400).json({ error: 'Password baru harus berbeda dari password lama' });
  }

  // 2. Aturan password
  const aturanErr = cekAturanPassword(password_baru, user.email);
  if (aturanErr) return res.status(400).json({ error: aturanErr });

  // 3. Verifikasi password lama (dilewati untuk login pertama, lihat di atas)
  if (password_lama) {
    const verRes = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ email: user.email, password: password_lama })
    });
    if (!verRes.ok) {
      return res.status(400).json({ error: 'Password lama salah' });
    }
  }

  // 4. Update password via endpoint user (ikut aturan & leaked-password check Supabase)
  let updRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ password: password_baru })
  });

  if (!updRes.ok) {
    const err = await updRes.json().catch(() => ({}));
    const code = err.error_code || err.code || '';
    const msg  = err.msg || err.message || err.error_description || '';

    if (code === 'weak_password' || /weak|pwned|leaked/i.test(msg)) {
      return res.status(400).json({ error: 'Password terlalu lemah atau pernah bocor di internet. Gunakan password lain.' });
    }
    if (code === 'same_password') {
      return res.status(400).json({ error: 'Password baru harus berbeda dari password lama' });
    }
    if (code === 'reauthentication_needed') {
      // Token caller valid (langkah 1) + password lama terverifikasi / akun wajib ganti → aman via admin API
      updRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ password: password_baru })
      });
      if (!updRes.ok) return res.status(500).json({ error: 'Gagal menyimpan password baru' });
    } else {
      return res.status(400).json({ error: 'Gagal menyimpan password: ' + (msg || 'unknown') });
    }
  }

  // 5. Hapus flag wajib ganti + catat waktu — verifikasi baris ter-update
  const patchRes = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ wajib_ganti_password: false, password_diganti_at: new Date().toISOString() })
  });
  const patched = patchRes.ok ? await patchRes.json().catch(() => []) : [];
  if (!patchRes.ok || !patched?.length) {
    // Password sudah berganti; hanya flag yang gagal. Beri tahu jelas.
    return res.status(500).json({
      error: 'Password sudah diganti, tapi status akun gagal diperbarui. Hubungi administrator.',
      password_changed: true,
    });
  }

  // 6. Keluarkan sesi lain (termasuk sesi dari verifikasi langkah 3)
  const logoutRes = await fetch(`${SUPA_URL}/auth/v1/logout?scope=others`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
  });

  return res.status(200).json({ success: true, sesi_lain_dikeluarkan: logoutRes.ok });
};
