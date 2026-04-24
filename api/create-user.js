const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verifikasi caller
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let userId;
  try {
    userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub;
  } catch { return res.status(401).json({ error: 'Token tidak valid' }); }

  const callerRes = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,spbu_id&limit=1`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  const callerProfiles = await callerRes.json();
  if (!callerProfiles?.length) return res.status(401).json({ error: 'Profil tidak ditemukan' });

  const caller = callerProfiles[0];
  if (!['manager', 'super_admin'].includes(caller.role)) {
    return res.status(403).json({ error: 'Tidak punya akses untuk membuat user' });
  }

  const { nama, email, password, role, spbu_id, mitra_id } = req.body;
  if (!nama || !email || !password || !role) {
    return res.status(400).json({ error: 'Nama, email, password, dan role wajib diisi' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });

  const allowedNewRoles = ['operator', 'manager', 'mitra'];
  if (!allowedNewRoles.includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid' });
  }

  // Manager hanya bisa buat operator SPBU-nya sendiri
  if (caller.role === 'manager') {
    if (role !== 'operator') return res.status(403).json({ error: 'Manager hanya bisa membuat akun operator' });
    if (spbu_id && spbu_id !== caller.spbu_id) return res.status(403).json({ error: 'Hanya bisa menambah operator untuk SPBU Anda sendiri' });
  }

  // Validasi mitra_id wajib ada jika role mitra
  if (role === 'mitra' && !mitra_id) {
    return res.status(400).json({ error: 'mitra_id wajib diisi untuk role mitra' });
  }

  const finalSpbuId = role === 'mitra' ? null
    : caller.role === 'manager' ? caller.spbu_id
    : (spbu_id || null);

  // Buat user di Supabase Auth
  const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { nama, role } })
  });

  const createData = await createRes.json();
  if (!createRes.ok) {
    const msg = createData?.msg || createData?.message || 'Gagal membuat user';
    if (msg.includes('already registered')) return res.status(409).json({ error: 'Email sudah terdaftar' });
    return res.status(400).json({ error: msg });
  }

  const newUserId = createData.id;

  // Update profil dengan role, spbu_id, dan mitra_id
  const profilePayload = { nama, role, spbu_id: finalSpbuId, aktif: true };
  if (role === 'mitra') profilePayload.mitra_id = mitra_id;

  await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${newUserId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(profilePayload)
  });

  return res.status(200).json({ success: true, user: { id: newUserId, nama, email, role, spbu_id: finalSpbuId, mitra_id: mitra_id || null } });
};
