/* ALPOLA cloud sync — browser-safe publishable key only. */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://qnuyyserbcieytqkjjhn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_128aF9t0kyRjdPoGa5tMcg_QQIldJyo';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'alpola-supabase-auth-v1' }
  });
  let activeUser = null, businessId = null, syncingRemote = false, syncTimer = null, connectedUserId = null;

  const style = document.createElement('style');
  style.textContent = `
    #alpolaAuthGate{position:fixed;inset:0;z-index:99999;background:#f5f5f4;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto}
    #alpolaAuthGate .auth-card{width:min(100%,430px);background:white;border:1px solid #e5e5e5;border-radius:22px;padding:24px;box-shadow:0 18px 55px #0001}
    #alpolaAuthGate h1{font-size:25px;margin:0 0 6px}#alpolaAuthGate p{color:#666;font-size:13px;line-height:1.55}
    #alpolaAuthGate label{display:block;font-size:12px;color:#666;font-weight:700;margin:14px 0 6px}
    #alpolaAuthGate input{width:100%;padding:13px;border:1px solid #ddd;border-radius:11px;font:inherit}
    #alpolaAuthGate .auth-actions{display:flex;gap:8px;margin-top:16px}#alpolaAuthGate button{flex:1}
    #alpolaAuthMessage{font-size:13px;white-space:pre-wrap;margin-top:12px;color:#075e54}
    #alpolaAccountBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
    #alpolaCloudState{color:#075e54;font-weight:700}#alpolaSignOut{padding:8px 10px;background:#eee;color:#222;font-size:12px}
    @media(max-width:520px){#alpolaAuthGate .auth-card{padding:20px}}
  `;
  document.head.appendChild(style);
  const gate = document.createElement('div');
  gate.id = 'alpolaAuthGate';
  gate.innerHTML = `<div class="auth-card">
    <div style="font-weight:950;letter-spacing:-.5px;color:#171717;font-size:14px;margin-bottom:18px">ALPOLA <span style="color:#168b7c">COFFEE SHOP.</span></div>
    <h1>Masuk ke ALPOLA</h1>
    <p>Masuk atau buat akun untuk menyimpan menu, transaksi, dan pengeluaran di database online agar bisa diakses dari perangkat lain.</p>
    <form id="alpolaAuthForm">
      <label for="alpolaEmail">Email</label><input id="alpolaEmail" type="email" autocomplete="email" required placeholder="nama@email.com">
      <label for="alpolaPassword">Kata sandi</label><input id="alpolaPassword" type="password" autocomplete="current-password" minlength="6" required placeholder="Minimal 6 karakter">
      <div class="auth-actions"><button class="primary" id="alpolaLoginBtn" type="submit">Masuk</button><button class="soft" id="alpolaSignupBtn" type="button">Buat akun</button></div>
    </form>
    <div id="alpolaAuthMessage" role="status">Database online siap. Gunakan akun pribadi kamu.</div>
    <p style="font-size:11px;margin-bottom:0">Jangan bagikan kata sandi kepada siapa pun. Data akun dipisahkan berdasarkan akses pengguna.</p>
  </div>`;
  gate.style.display = 'none';
  document.body.appendChild(gate);

  function message(text, bad = false) {
    const el = document.getElementById('alpolaAuthMessage');
    el.textContent = text;
    el.style.color = bad ? '#b42318' : '#075e54';
  }
  function setBusy(busy) {
    document.getElementById('alpolaLoginBtn').disabled = busy;
    document.getElementById('alpolaSignupBtn').disabled = busy;
  }
  function appSnapshot() {
    const read = (key, fallback) => {
      try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
      catch (_) { return fallback; }
    };
    return {
      menu: read('alpola_menu', Array.isArray(menu) ? menu : []),
      sales: read('alpola_sales', Array.isArray(sales) ? sales : []),
      expenses: read('alpola_expenses', Array.isArray(expenses) ? expenses : []),
      pendingOrders: read('alpola_pending', Array.isArray(pendingOrders) ? pendingOrders : []),
      businessProfile: read('alpola_business_profile', {}),
      systemSettings: read('alpola_system_settings', {})
    };
  }
  function applySnapshot(data) {
    const safe = data && typeof data === 'object' ? data : {};
    const nextMenu = Array.isArray(safe.menu) ? safe.menu : (Array.isArray(menu) ? menu : []);
    const nextSales = Array.isArray(safe.sales) ? safe.sales : (Array.isArray(sales) ? sales : []);
    const nextExpenses = Array.isArray(safe.expenses) ? safe.expenses : (Array.isArray(expenses) ? expenses : []);
    const nextPending = Array.isArray(safe.pendingOrders) ? safe.pendingOrders : (Array.isArray(pendingOrders) ? pendingOrders : []);
    syncingRemote = true;
    try {
      menu = nextMenu; sales = nextSales; expenses = nextExpenses; pendingOrders = nextPending;
      localStorage.setItem('alpola_menu', JSON.stringify(menu));
      localStorage.setItem('alpola_sales', JSON.stringify(sales));
      localStorage.setItem('alpola_expenses', JSON.stringify(expenses));
      localStorage.setItem('alpola_pending', JSON.stringify(pendingOrders));
      if (safe.businessProfile && typeof safe.businessProfile === 'object') localStorage.setItem('alpola_business_profile', JSON.stringify(safe.businessProfile));
      if (safe.systemSettings && typeof safe.systemSettings === 'object') localStorage.setItem('alpola_system_settings', JSON.stringify(safe.systemSettings));
      if (typeof loadBusinessProfile === 'function') loadBusinessProfile();
      if (typeof loadSystemSettings === 'function') loadSystemSettings();
      if (typeof renderProducts === 'function') renderProducts();
      if (typeof renderCart === 'function') renderCart();
      if (typeof renderMenuTable === 'function') renderMenuTable();
      if (typeof renderReports === 'function') renderReports();
      if (typeof renderExpenses === 'function') renderExpenses();
      if (typeof renderPendingOrders === 'function') renderPendingOrders();
      if (typeof renderDashboard === 'function') renderDashboard();
    } finally { syncingRemote = false; }
  }
  async function ensureBusiness(user) {
    // Existing active membership takes precedence, so a cashier can join their owner's business.
    const membership = await client.from('alpola_memberships')
      .select('business_id,role,active').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle();
    if (membership.error) throw membership.error;
    if (membership.data) {
      const business = await client.from('alpola_businesses')
        .select('id,name,owner_user_id').eq('id', membership.data.business_id).single();
      if (business.error) throw business.error;
      window.alpolaAuthContext = { userId: user.id, email: user.email || '', role: membership.data.role, businessId: business.data.id, businessName: business.data.name };
      return business.data.id;
    }

    let { data, error } = await client.from('alpola_businesses')
      .select('id,name,owner_user_id').eq('owner_user_id', user.id).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) {
      const created = await client.from('alpola_businesses')
        .insert({ name: 'ALPOLA Coffee Shop', owner_user_id: user.id })
        .select('id,name,owner_user_id').single();
      if (created.error) throw created.error;
      data = created.data;
    }
    // Only the database owner policy permits this membership insertion.
    const ownerMembership = await client.from('alpola_memberships').upsert({
      business_id: data.id, user_id: user.id, role: 'owner', active: true
    }, { onConflict: 'business_id,user_id' });
    if (ownerMembership.error) throw ownerMembership.error;
    window.alpolaAuthContext = { userId: user.id, email: user.email || '', role: 'owner', businessId: data.id, businessName: data.name };
    return data.id;
  }

  window.alpolaListMembers = async function() {
    if (!activeUser || !businessId || !window.alpolaAuthContext || window.alpolaAuthContext.role !== 'owner') {
      throw new Error('Hanya pemilik yang boleh melihat akun anggota.');
    }
    const { data, error } = await client.from('alpola_memberships')
      .select('user_id,role,active,created_at').eq('business_id', businessId).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  };

  window.alpolaAddCashier = async function(userId) {
    if (!activeUser || !businessId || !window.alpolaAuthContext || window.alpolaAuthContext.role !== 'owner') {
      throw new Error('Hanya pemilik yang boleh menambahkan kasir.');
    }
    const id = String(userId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Masukkan User ID (UUID) akun yang sudah terdaftar.');
    }
    if (id.toLowerCase() === String(activeUser.id).toLowerCase()) {
      throw new Error('Akun pemilik tidak dapat ditambahkan sebagai kasir.');
    }
    const { error } = await client.from('alpola_memberships').upsert({
      business_id: businessId, user_id: id, role: 'cashier', active: true
    }, { onConflict: 'business_id,user_id' });
    if (error) throw error;
    return true;
  };

  window.alpolaSetCashierActive = async function(userId, active) {
    if (!activeUser || !businessId || !window.alpolaAuthContext || window.alpolaAuthContext.role !== 'owner') {
      throw new Error('Hanya pemilik yang boleh mengubah status kasir.');
    }
    const id = String(userId || '').trim();
    const { data, error } = await client.from('alpola_memberships')
      .update({ active: !!active }).eq('business_id', businessId).eq('user_id', id).eq('role', 'cashier')
      .select('user_id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Akun kasir tidak ditemukan atau tidak dapat diubah.');
    return true;
  };

  window.alpolaSaveBusinessProfile = async function(profile) {
    if (!activeUser || !businessId) throw new Error('Akun belum terhubung ke usaha.');
    if (!window.alpolaAuthContext || window.alpolaAuthContext.role !== 'owner') {
      throw new Error('Hanya pemilik usaha yang boleh mengubah profil usaha.');
    }
    const row = {
      name: String(profile.name || '').trim() || 'ALPOLA Coffee Shop',
      owner_name: String(profile.owner || '').trim(),
      phone: String(profile.phone || '').trim(),
      address: String(profile.address || '').trim(),
      note: String(profile.note || '').trim(),
      updated_at: new Date().toISOString()
    };
    const { error } = await client.from('alpola_businesses').update(row).eq('id', businessId);
    if (error) throw error;
    window.alpolaAuthContext.businessName = row.name;
    const bar = document.getElementById('alpolaBusinessName');
    if (bar) bar.textContent = row.name;
    return true;
  };

  async function loadBusinessRecord() {
    if (!businessId) return;
    const { data, error } = await client.from('alpola_businesses')
      .select('name,owner_name,phone,address,note').eq('id', businessId).single();
    if (error) throw error;
    const profile = {
      name: data.name || 'ALPOLA Coffee Shop',
      owner: data.owner_name || '',
      phone: data.phone || '',
      address: data.address || '',
      note: data.note || ''
    };
    syncingRemote = true;
    try { localStorage.setItem('alpola_business_profile', JSON.stringify(profile)); }
    finally { syncingRemote = false; }
    if (typeof loadBusinessProfile === 'function') loadBusinessProfile();
    window.alpolaAuthContext.businessName = profile.name;
  }

  async function syncNow() {
    if (!activeUser || !businessId || syncingRemote) return;
    const snapshot = appSnapshot();
    const { error } = await client.from('alpola_app_state').upsert({
      business_id: businessId,
      data: snapshot,
      updated_by: activeUser.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'business_id' });
    if (error) {
      console.error('ALPOLA cloud sync failed:', error);
      const state = document.getElementById('alpolaCloudState');
      if (state) { state.textContent = 'Belum tersinkron'; state.style.color = '#b42318'; }
      return;
    }
    const state = document.getElementById('alpolaCloudState');
    if (state) { state.textContent = 'Tersimpan online'; state.style.color = '#075e54'; }
  }
  function scheduleSync() {
    if (!activeUser || !businessId || syncingRemote) return;
    const state = document.getElementById('alpolaCloudState');
    if (state) { state.textContent = 'Menyimpan…'; state.style.color = '#8a5b00'; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow().catch(err => {
      console.error(err); message('Sinkronisasi gagal: ' + (err.message || 'periksa koneksi'), true);
    }), 900);
  }
  async function connectUser(user) {
    if (!user) return;
    if (connectedUserId === user.id && businessId) return;
    activeUser = user;
    message('Menghubungkan akun dan memuat data…');
    try {
      businessId = await ensureBusiness(user);
      await loadBusinessRecord();
      const { data: stateRow, error } = await client.from('alpola_app_state')
        .select('data,updated_at').eq('business_id', businessId).maybeSingle();
      if (error) throw error;
      if (stateRow && stateRow.data && (
        (Array.isArray(stateRow.data.menu) && stateRow.data.menu.length) ||
        (Array.isArray(stateRow.data.sales) && stateRow.data.sales.length) ||
        (Array.isArray(stateRow.data.expenses) && stateRow.data.expenses.length)
      )) {
        applySnapshot(stateRow.data);
      } else if (!stateRow) {
        const { error: insertError } = await client.from('alpola_app_state').insert({
          business_id: businessId, data: appSnapshot(), updated_by: user.id
        });
        if (insertError) throw insertError;
      } else {
        // If the cloud row exists but is still empty, preserve the current local starter data
        // instead of replacing the default menu with empty arrays.
        const localSnapshot = appSnapshot();
        const localHasData = ['menu', 'sales', 'expenses'].some(key =>
          Array.isArray(localSnapshot[key]) && localSnapshot[key].length > 0
        );
        if (localHasData) {
          applySnapshot(localSnapshot);
          await syncNow();
        } else {
          applySnapshot(stateRow.data);
        }
      }
      // The business row is authoritative for identity fields; the snapshot may be older.
      await loadBusinessRecord();
      connectedUserId = user.id;
      const roleLabel = window.alpolaAuthContext && window.alpolaAuthContext.role === 'owner' ? 'Pemilik' : 'Kasir';
      const roleEl = document.getElementById('currentRole');
      const accountEl = document.getElementById('accountStatus');
      if (roleEl) roleEl.textContent = roleLabel;
      if (accountEl) accountEl.textContent = 'Terhubung';
      gate.style.display = 'none';
      document.querySelector('.app').style.visibility = 'visible';
      addAccountBar(user.email || 'Akun ALPOLA');
      const state = document.getElementById('alpolaCloudState');
      if (state) state.textContent = 'Tersimpan online';
      if (stateRow && stateRow.updated_at) console.info('ALPOLA cloud data last updated:', stateRow.updated_at);
      message('Terhubung.');
    } catch (err) {
      console.error('ALPOLA connection error:', err);
      businessId = null; connectedUserId = null;
      gate.style.display = 'flex';
      message('Belum berhasil menghubungkan database: ' + (err.message || 'periksa konfigurasi Supabase'), true);
    }
  }
  function addAccountBar(email) {
    let bar = document.getElementById('alpolaAccountBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'alpolaAccountBar';
      const header = document.querySelector('.top');
      if (header) header.appendChild(bar);
    }
    bar.innerHTML = '<span id="alpolaCloudState">Tersimpan online</span><span aria-hidden="true">·</span><span id="alpolaUserEmail"></span><button id="alpolaSignOut" type="button">Keluar</button>';
    document.getElementById('alpolaUserEmail').textContent = email;
    document.getElementById('alpolaSignOut').onclick = async () => {
      if (!confirm('Keluar dari akun ALPOLA? Pastikan data sudah tersinkron.')) return;
      await syncNow();
      const { error } = await client.auth.signOut();
      if (error) { alert('Gagal keluar: ' + error.message); return; }
      activeUser = null; businessId = null; connectedUserId = null;
      gate.style.display = 'flex';
      document.querySelector('.app').style.visibility = 'hidden';
      bar.remove();
      message('Kamu sudah keluar. Masuk lagi untuk membuka data online.');
    };
  }

  document.querySelector('.app').style.visibility = 'hidden';
  document.getElementById('alpolaAuthForm').addEventListener('submit', async event => {
    event.preventDefault(); setBusy(true);
    const email = document.getElementById('alpolaEmail').value.trim();
    const password = document.getElementById('alpolaPassword').value;
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await connectUser(data.user);
    } catch (err) { message(err.message || 'Gagal masuk. Periksa email dan kata sandi.', true); }
    finally { setBusy(false); }
  });
  document.getElementById('alpolaSignupBtn').addEventListener('click', async () => {
    setBusy(true);
    const email = document.getElementById('alpolaEmail').value.trim();
    const password = document.getElementById('alpolaPassword').value;
    if (!email || password.length < 6) {
      message('Isi email yang valid dan kata sandi minimal 6 karakter.', true); setBusy(false); return;
    }
    try {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session && data.user) {
        await connectUser(data.user);
      } else {
        message('Pendaftaran diterima. Buka email untuk konfirmasi akun, lalu kembali dan masuk ke ALPOLA.');
      }
    } catch (err) { message(err.message || 'Gagal membuat akun.', true); }
    finally { setBusy(false); }
  });

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && ['alpola_menu','alpola_sales','alpola_expenses','alpola_pending','alpola_business_profile','alpola_system_settings'].includes(String(key))) scheduleSync();
  };
  client.auth.onAuthStateChange((event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && session.user) {
      if (connectedUserId !== session.user.id) Promise.resolve().then(() => connectUser(session.user));
    }
    if (event === 'SIGNED_OUT') {
      activeUser = null; businessId = null; connectedUserId = null;
      gate.style.display = 'flex';
      document.querySelector('.app').style.visibility = 'hidden';
    }
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) { gate.style.display = 'flex'; message('Tidak dapat memeriksa sesi akun: ' + error.message, true); return; }
    if (data.session && data.session.user) {
      connectUser(data.session.user);
    } else {
      gate.style.display = 'flex';
      document.querySelector('.app').style.visibility = 'hidden';
    }
  }).catch(err => { gate.style.display = 'flex'; message('Tidak dapat terhubung: ' + (err.message || 'koneksi bermasalah'), true); });
})();