/**
 * Vercel Serverless Function: POST /api/create-user
 * Membuat user baru via Supabase Admin API (service role key)
 * Service role key AMAN disini karena berjalan di server, bukan browser
 *
 * Request body:
 *   { nama, email, password, role, spbu_id }
 *
 * Auth: hanya bisa dipanggil dengan Bearer token dari user yang sudah login
 *       dan memiliki role manager atau super_admin
 */

const SUPA_URL     = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;  // set di Vercel Environment Variables
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Verifikasi caller sudah login & punya role yang boleh ──
  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '').trim();

  if (!callerToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Ambil profil caller dari Supabase
  const callerRes = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id,role,spbu_id&limit=1`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${callerToken}`,
    }
  });

  if (!callerRes.ok) {
    return res.status(401).json({ error: 'Token tidak valid' });
  }

  const callerProfiles = await callerRes.json();
  if (!callerProfiles.length) {
    return res.status(401).json({ error: 'Profil tidak ditemukan' });
  }

  const caller = callerProfiles[0];
  const allowedRoles = ['manager', 'super_admin'];
  if (!allowedRoles.includes(caller.role)) {
    return res.status(403).json({ error: 'Tidak punya akses untuk membuat user' });
  }

  // ── 2. Validasi request body ──
  const { nama, email, password, role, spbu_id } = req.body;

  if (!nama || !email || !password || !role) {
    return res.status(400).json({ error: 'Nama, email, password, dan role wajib diisi' });
  }

  // Role yang boleh dibuat
  const allowedNewRoles = ['operator', 'manager'];
  if (!allowedNewRoles.includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid' });
  }

  // Manager hanya boleh buat operator, dan hanya untuk SPBU-nya sendiri
  if (caller.role === 'manager') {
    if (role !== 'operator') {
      return res.status(403).json({ error: 'Manager hanya bisa membuat akun operator' });
    }
    if (spbu_id && spbu_id !== caller.spbu_id) {
      return res.status(403).json({ error: 'Hanya bisa menambah operator untuk SPBU Anda sendiri' });
    }
  }

  // Tentukan spbu_id final
  const finalSpbuId = (caller.role === 'manager')
    ? caller.spbu_id   // manager selalu assign ke SPBU-nya
    : (spbu_id || null);

  // Password minimal 8 karakter
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password minimal 8 karakter' });
  }

  // ── 3. Buat user via Supabase Admin API ──
  const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,   // langsung confirmed, tidak perlu verifikasi email
      user_metadata: { nama, role }
    })
  });

  const createData = await createRes.json();

  if (!createRes.ok) {
    const msg = createData?.msg || createData?.message || 'Gagal membuat user';
    // Email sudah terdaftar
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }
    return res.status(400).json({ error: msg });
  }

  const newUserId = createData.id;

  // ── 4. Update profil dengan role & spbu_id yang benar ──
  // (trigger handle_new_user sudah insert row, kita update role & spbu-nya)
  const updateRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?id=eq.${newUserId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        nama,
        role,
        spbu_id: finalSpbuId,
        aktif: true,
      })
    }
  );

  if (!updateRes.ok) {
    // User sudah terbuat tapi profil gagal update — log tapi jangan error ke user
    console.error('Gagal update profil:', await updateRes.text());
  }

  return res.status(200).json({
    success: true,
    user: {
      id: newUserId,
      nama,
      email,
      role,
      spbu_id: finalSpbuId,
    }
  });
}
