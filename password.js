/**
 * BISON - Modal ganti password (dipakai login.html, index.html, mitra.html)
 *
 * BisonPassword.open({ client, forced, onLogout, passwordLama }) -> Promise<boolean>
 *   client   : Supabase client halaman tsb
 *   forced   : true = wajib ganti (tidak bisa ditutup, hanya "Keluar")
 *   onLogout : dipanggil saat user pilih Keluar di mode forced
 * Resolve true jika password berhasil diganti, false jika dibatalkan.
 */
(function () {
  const KATA_TERLARANG = ['pertamina', 'patraniaga', 'bison', 'spbu', '123456', 'password', 'qwerty'];

  const CSS = `
  .bpw-overlay{position:fixed;inset:0;background:rgba(13,27,62,.55);z-index:99999;display:none;
    align-items:flex-end;justify-content:center;font-family:'Inter',system-ui,-apple-system,sans-serif;}
  .bpw-overlay.show{display:flex;}
  @media(min-width:560px){.bpw-overlay{align-items:center;}}
  .bpw-box{background:#fff;width:100%;max-width:420px;border-radius:16px 16px 0 0;padding:20px 18px 18px;
    padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.18);
    max-height:92vh;overflow-y:auto;color:#0D1B3E;}
  @media(min-width:560px){.bpw-box{border-radius:16px;}}
  .bpw-title{font-size:17px;font-weight:700;margin-bottom:4px;}
  .bpw-sub{font-size:12.5px;color:#6b7280;line-height:1.5;margin-bottom:14px;}
  .bpw-sub.warn{background:#FFF7E6;border:1px solid #F5C77E;color:#7C2D12;padding:9px 11px;border-radius:8px;}
  .bpw-field{margin-bottom:11px;}
  .bpw-label{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;color:#374151;margin-bottom:5px;text-transform:uppercase;}
  .bpw-wrap{position:relative;}
  .bpw-input{width:100%;box-sizing:border-box;padding:11px 42px 11px 12px;font-size:15px;border:1.5px solid #d1d5db;
    border-radius:9px;outline:none;font-family:inherit;color:#0D1B3E;background:#fff;}
  .bpw-input:focus{border-color:#1A56C8;}
  .bpw-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;
    font-size:16px;cursor:pointer;padding:6px;}
  .bpw-rules{list-style:none;padding:0;margin:2px 0 12px;font-size:11.5px;line-height:1.7;}
  .bpw-rules li{color:#9ca3af;}
  .bpw-rules li.ok{color:#059669;}
  .bpw-rules li.bad{color:#DC2626;}
  .bpw-err{display:none;background:#FEF2F2;border:1px solid rgba(220,38,38,.25);color:#DC2626;font-size:12.5px;
    padding:8px 11px;border-radius:8px;margin-bottom:11px;}
  .bpw-btn{width:100%;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;
    font-family:inherit;background:#1A56C8;color:#fff;}
  .bpw-btn:disabled{opacity:.5;cursor:not-allowed;}
  .bpw-link{display:block;width:100%;margin-top:8px;padding:10px;border:none;background:none;font-size:13px;
    color:#6b7280;cursor:pointer;font-family:inherit;}
  `;

  const HTML = `
  <div class="bpw-box" role="dialog" aria-modal="true">
    <div class="bpw-title" id="bpw-title">Ganti Password</div>
    <div class="bpw-sub" id="bpw-sub"></div>
    <div class="bpw-field">
      <label class="bpw-label" for="bpw-lama" id="bpw-lama-label">Password lama</label>
      <div class="bpw-wrap"><input class="bpw-input" id="bpw-lama" type="password" autocomplete="current-password"/>
        <button type="button" class="bpw-eye" data-for="bpw-lama">&#128065;</button></div>
    </div>
    <div class="bpw-field">
      <label class="bpw-label" for="bpw-baru">Password baru</label>
      <div class="bpw-wrap"><input class="bpw-input" id="bpw-baru" type="password" autocomplete="new-password"/>
        <button type="button" class="bpw-eye" data-for="bpw-baru">&#128065;</button></div>
    </div>
    <ul class="bpw-rules" id="bpw-rules">
      <li data-r="len">&bull; Minimal 8 karakter</li>
      <li data-r="mix">&bull; Berisi huruf dan angka</li>
      <li data-r="kata">&bull; Tidak mengandung "pertamina", "bison", "spbu", "123456", atau bagian email</li>
    </ul>
    <div class="bpw-field">
      <label class="bpw-label" for="bpw-ulang">Ulangi password baru</label>
      <div class="bpw-wrap"><input class="bpw-input" id="bpw-ulang" type="password" autocomplete="new-password"/>
        <button type="button" class="bpw-eye" data-for="bpw-ulang">&#128065;</button></div>
    </div>
    <div class="bpw-err" id="bpw-err"></div>
    <button type="button" class="bpw-btn" id="bpw-submit">Simpan Password</button>
    <button type="button" class="bpw-link" id="bpw-cancel">Batal</button>
  </div>`;

  let overlay = null, state = null;

  function el(id) { return document.getElementById(id); }

  function cekAturan(pw, email) {
    const low = (pw || '').toLowerCase();
    const lokal = String(email || '').split('@')[0].toLowerCase();
    return {
      len:  pw.length >= 8 && pw.length <= 72,
      mix:  /[A-Za-z]/.test(pw) && /\d/.test(pw),
      kata: !KATA_TERLARANG.some(k => low.includes(k)) && !(lokal.length >= 4 && low.includes(lokal)),
    };
  }

  function ensureDom() {
    if (overlay) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.className = 'bpw-overlay';
    overlay.innerHTML = HTML;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.bpw-eye').forEach(b => b.addEventListener('click', () => {
      const inp = el(b.dataset.for);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      b.textContent = inp.type === 'password' ? '\u{1F441}' : '\u{1F648}';
    }));
    el('bpw-baru').addEventListener('input', renderRules);
    el('bpw-submit').addEventListener('click', submit);
    el('bpw-cancel').addEventListener('click', cancel);
    overlay.querySelectorAll('.bpw-input').forEach(i =>
      i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
  }

  function renderRules() {
    const pw = el('bpw-baru').value;
    const r = cekAturan(pw, state?.email);
    el('bpw-rules').querySelectorAll('li').forEach(li => {
      li.className = !pw ? '' : (r[li.dataset.r] ? 'ok' : 'bad');
    });
  }

  function showErr(msg) {
    const e = el('bpw-err');
    e.textContent = msg; e.style.display = msg ? 'block' : 'none';
  }

  function close(result) {
    overlay.classList.remove('show');
    const s = state; state = null;
    if (s) s.resolve(result);
  }

  async function cancel() {
    if (!state) return;
    if (state.forced) {
      if (state.onLogout) await state.onLogout();
      close(false);
    } else {
      close(false);
    }
  }

  async function submit() {
    if (!state || state.busy) return;
    const lama = el('bpw-lama').value;
    const baru = el('bpw-baru').value;
    const ulang = el('bpw-ulang').value;
    showErr('');

    if (!lama) return showErr(state.forced ? 'Isi password sementara Anda' : 'Isi password lama');
    const r = cekAturan(baru, state.email);
    if (!r.len)  return showErr('Password baru minimal 8 karakter');
    if (!r.mix)  return showErr('Password baru harus berisi huruf dan angka');
    if (!r.kata) return showErr('Password baru mengandung kata yang mudah ditebak');
    if (baru === lama) return showErr('Password baru harus berbeda dari password lama');
    if (baru !== ulang) return showErr('Ulangi password tidak sama');

    const btn = el('bpw-submit');
    state.busy = true; btn.disabled = true; btn.textContent = 'Menyimpan...';
    try {
      const { data: { session } } = await state.client.auth.getSession();
      if (!session) throw new Error('Sesi berakhir, silakan login ulang');
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ password_lama: lama, password_baru: baru }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Gagal mengganti password');
      close(true);
    } catch (e) {
      showErr(e.message);
    } finally {
      if (state) state.busy = false;
      btn.disabled = false; btn.textContent = 'Simpan Password';
    }
  }

  async function open({ client, forced = false, onLogout = null, passwordLama = '' } = {}) {
    ensureDom();
    if (state) close(false);
    const { data: { session } } = await client.auth.getSession();

    ['bpw-lama', 'bpw-baru', 'bpw-ulang'].forEach(id => { el(id).value = ''; el(id).type = 'password'; });
    overlay.querySelectorAll('.bpw-eye').forEach(b => b.textContent = '\u{1F441}');
    showErr('');

    el('bpw-title').textContent = forced ? 'Buat Password Baru' : 'Ganti Password';
    const sub = el('bpw-sub');
    sub.className = 'bpw-sub' + (forced ? ' warn' : '');
    sub.textContent = forced
      ? 'Password Anda saat ini diberikan oleh administrator. Demi keamanan, buat password Anda sendiri sebelum melanjutkan.'
      : 'Setelah diganti, akun Anda akan otomatis keluar dari perangkat lain.';
    el('bpw-lama-label').textContent = forced ? 'Password sementara (dari admin)' : 'Password lama';
    // Dari halaman login: password lama sudah diketik user -> isi otomatis & sembunyikan
    el('bpw-lama').value = passwordLama || '';
    el('bpw-lama').closest('.bpw-field').style.display = passwordLama ? 'none' : '';
    el('bpw-cancel').textContent = forced ? 'Keluar' : 'Batal';

    return new Promise(resolve => {
      state = { client, forced, onLogout, resolve, email: session?.user?.email || '', busy: false };
      renderRules();
      overlay.classList.add('show');
      setTimeout(() => el(passwordLama ? 'bpw-baru' : 'bpw-lama').focus(), 50);
    });
  }

  window.BisonPassword = { open };
})();
