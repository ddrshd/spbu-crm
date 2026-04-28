const SUPA_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function getCaller(token) {
  let userId;
  try { userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub; }
  catch { return null; }
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,spbu_id&limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const p = await r.json();
  return p?.[0] || null;
}

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=representation',
      ...(opts.headers || {})
    }
  });
  const data = await res.json();
  return { data: Array.isArray(data) ? data : [data], ok: res.ok, status: res.status };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const caller = await getCaller(token);
  if (!caller || !['manager','super_admin'].includes(caller.role))
    return res.status(403).json({ error: 'Akses ditolak' });

  const { action } = req.body;

  // ─── GENERATE INVOICE ────────────────────────────────────────
  if (action === 'generate') {
    const { mitra_id, spbu_id, periode_mulai, periode_selesai, kontrak_id, catatan } = req.body;
    if (!mitra_id || !spbu_id || !periode_mulai || !periode_selesai)
      return res.status(400).json({ error: 'mitra_id, spbu_id, periode_mulai, periode_selesai wajib' });

    if (caller.role === 'manager' && spbu_id !== caller.spbu_id)
      return res.status(403).json({ error: 'Manager hanya bisa generate untuk SPBU-nya' });

    // Ambil transaksi periode ini
    const trxRes = await supaFetch(
      `/rest/v1/transaksi?mitra_id=eq.${mitra_id}&spbu_id=eq.${spbu_id}` +
      `&created_at=gte.${periode_mulai}T00:00:00&created_at=lte.${periode_selesai}T23:59:59` +
      `&deleted_at=is.null&select=id,total,volume,produk,nopol,created_at`
    );

    if (!trxRes.ok) return res.status(400).json({ error: 'Gagal ambil transaksi' });

    const trx = trxRes.data;
    const totalTagihan  = trx.reduce((s, t) => s + parseInt(t.total), 0);
    const totalVolume   = trx.reduce((s, t) => s + parseFloat(t.volume), 0);

    const insertRes = await supaFetch('/rest/v1/tagihan_mitra', {
      method: 'POST',
      body: JSON.stringify({
        nomor_invoice: '',
        mitra_id, spbu_id,
        kontrak_id: kontrak_id || null,
        periode_mulai, periode_selesai,
        total_transaksi: trx.length,
        total_volume: Math.round(totalVolume * 100) / 100,
        total_tagihan: totalTagihan,
        status: 'draft',
        catatan: catatan || null,
        dibuat_oleh: caller.id,
      })
    });

    if (!insertRes.ok) return res.status(400).json({ error: insertRes.data[0]?.message || 'Gagal generate' });
    return res.status(200).json({ success: true, tagihan: insertRes.data[0], transaksi: trx });
  }

  // ─── KIRIM INVOICE ───────────────────────────────────────────
  if (action === 'kirim') {
    const { tagihan_id } = req.body;
    if (!tagihan_id) return res.status(400).json({ error: 'tagihan_id wajib' });

    const updRes = await supaFetch(`/rest/v1/tagihan_mitra?id=eq.${tagihan_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'dikirim',
        dikirim_pada: new Date().toISOString(),
        dikirim_oleh: caller.id,
      })
    });
    if (!updRes.ok) return res.status(400).json({ error: 'Gagal update status' });
    return res.status(200).json({ success: true, tagihan: updRes.data[0] });
  }

  // ─── TANDAI LUNAS ────────────────────────────────────────────
  if (action === 'lunas') {
    const { tagihan_id } = req.body;
    if (!tagihan_id) return res.status(400).json({ error: 'tagihan_id wajib' });

    const updRes = await supaFetch(`/rest/v1/tagihan_mitra?id=eq.${tagihan_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'lunas',
        lunas_pada: new Date().toISOString(),
        ditandai_lunas_oleh: caller.id,
      })
    });
    if (!updRes.ok) return res.status(400).json({ error: 'Gagal tandai lunas' });
    return res.status(200).json({ success: true, tagihan: updRes.data[0] });
  }

  // ─── UPDATE STATUS MANUAL ────────────────────────────────────
  if (action === 'update_status') {
    const { tagihan_id, status } = req.body;
    const allowed = ['draft','dikirim','menunggu','terlambat'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
    const updRes = await supaFetch(`/rest/v1/tagihan_mitra?id=eq.${tagihan_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (!updRes.ok) return res.status(400).json({ error: 'Gagal update' });
    return res.status(200).json({ success: true, tagihan: updRes.data[0] });
  }

  return res.status(400).json({ error: 'Action tidak dikenal' });
};
