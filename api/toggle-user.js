/**
 * Vercel Serverless Function: POST /api/toggle-user
 * Aktifkan / nonaktifkan user (soft disable)
 *
 * Request body: { target_user_id, aktif: true|false }
 */

const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY    = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader  = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '').trim();
  if (!callerToken) return res.status(401).json({ error: 'Unauthorized' });

  // Verifikasi caller
  const callerRes = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id,role,spbu_id&limit=1`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${callerToken}` }
  });
  const callerProfiles = await callerRes.json();
  if (!callerProfiles.length) return res.status(401).json({ error: 'Unauthorized' });

  const caller = callerProfiles[0];
  if (!['manager', 'super_admin'].includes(caller.role)) {
    return res.status(403).json({ error: 'Tidak punya akses' });
  }

  const { target_user_id, aktif } = req.body;
  if (!target_user_id || aktif === undefined) {
    return res.status(400).json({ error: 'target_user_id dan aktif wajib diisi' });
  }

  // Cek target user — manager hanya bisa toggle operator SPBU-nya
  const targetRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?id=eq.${target_user_id}&select=role,spbu_id&limit=1`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
  );
  const targets = await targetRes.json();
  if (!targets.length) return res.status(404).json({ error: 'User tidak ditemukan' });

  const target = targets[0];

  if (caller.role === 'manager') {
    if (target.role !== 'operator' || target.spbu_id !== caller.spbu_id) {
      return res.status(403).json({ error: 'Hanya bisa menonaktifkan operator SPBU Anda' });
    }
  }

  // Update di profiles (aktif flag)
  await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${target_user_id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ aktif })
  });

  // Juga disable/enable di Supabase Auth supaya user tidak bisa login
  await fetch(`${SUPA_URL}/auth/v1/admin/users/${target_user_id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ ban_duration: aktif ? 'none' : '876000h' })
  });

  return res.status(200).json({ success: true, aktif });
}
