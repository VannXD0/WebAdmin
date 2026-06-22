const DB_URL = "https://module-database-d76ed-default-rtdb.firebaseio.com/";
const USER_DB = "https://admin-login-ab66b-default-rtdb.firebaseio.com/users/";
let currentModuleTier = 'all';
const TIER_NODE_MAP = {
    free: 'license_free', aquarius: 'license_aquarius', sagitarius: 'license_sagitarius',
    pisces: 'license_pisces', capricorn: 'license_capricorn', goddata: 'license_goddata', aries: 'license_aries'
};

const CURRENT_USER = localStorage.getItem('xk_username');
const USER_ROLE = localStorage.getItem('xk_role');
let userCredit = parseInt(localStorage.getItem('xk_credit') || -1);
const DEVICE_ID = localStorage.getItem('xk_device_id') || '';

if (!CURRENT_USER || !USER_ROLE) {
    window.location.href = 'login.html';
}

const moduleCountEl = document.getElementById('moduleCount');
const apkCountEl = document.getElementById('apkCount');
const lastSyncEl = document.getElementById('lastSync');

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '<', '>': '>' }[m]));
}

function sanitizeDbKey(value) {
    if (!value) return '';
    return String(value).trim().replace(/[\.\#\$\[\]\/\s]/g, '_');
}

function setHeaderDescription() {
    // Tambahan agar tampilan seperti sebelumnya ada penjelasan admin/reseller.
    // index.html mungkin tidak punya elemen ini, jadi fallback aman.
    const roleEl = document.getElementById('displayRole');
    let desc = document.getElementById('displayRoleDesc');
    if (!roleEl) return;

    if (!desc) {
        // kalau belum ada, buat elemen kecil setelah role.
        desc = document.createElement('span');
        desc.id = 'displayRoleDesc';
        desc.className = 'text-[10px] text-slate-400 ml-2';
        roleEl.insertAdjacentElement('afterend', desc);
    }

    if (USER_ROLE === 'admin') {
        desc.textContent = '• ADMIN: full access';
    } else if (USER_ROLE === 'reseller') {
        desc.textContent = '• RESELLER: credit-based';
    } else {
        desc.textContent = `• ${USER_ROLE.toUpperCase()}`;
    }
}

function updateCreditUI() {
    const badge = document.getElementById('creditBadge');
    const modBtn = document.getElementById('generateModuleBtn');
    const apkBtn = document.getElementById('generateApkBtn');

    const roleSpan = document.getElementById('displayRole');
    if (roleSpan) {
        roleSpan.textContent = (USER_ROLE || '').toUpperCase();
        roleSpan.className = USER_ROLE === 'admin'
            ? 'px-2 py-0.5 rounded text-[10px] bg-purple-900/60 text-purple-300 border border-purple-500/30'
            : 'px-2 py-0.5 rounded text-[10px] bg-cyan-900/60 text-cyan-300 border border-cyan-500/30';
    }

    if (badge) {
        if (USER_ROLE === 'reseller') {
            badge.textContent = `💰 Credit: ${userCredit}`;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (modBtn && apkBtn) {
        modBtn.disabled = USER_ROLE === 'reseller' && userCredit <= 0;
        apkBtn.disabled = USER_ROLE === 'reseller' && userCredit <= 0;
    }

    setHeaderDescription();

    const usernameEl = document.getElementById('displayUsername');
    if (usernameEl) usernameEl.textContent = CURRENT_USER;
}

async function deductCredit() {
    if (USER_ROLE !== 'reseller') return true;
    if (userCredit <= 0) {
        alert('❌ Credit habis. Anda tidak dapat membuat lisensi baru.');
        return false;
    }

    const newCredit = userCredit - 1;
    try {
        const res = await fetch(`${USER_DB}${CURRENT_USER}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credit: newCredit })
        });

        if (!res.ok) throw new Error('Gagal update credit');

        userCredit = newCredit;
        localStorage.setItem('xk_credit', newCredit);
        updateCreditUI();

        if (newCredit <= 0) {
            alert('⚠️ Credit sekarang habis. Anda akan logout.');
            handleLogout();
        }

        return true;
    } catch (e) {
        alert('❌ Gagal mengurangi credit. Coba lagi.');
        return false;
    }
}

function handleLogout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

function setSummary(totalModule = 0, totalApk = 0) {
    if (moduleCountEl) moduleCountEl.textContent = totalModule;
    if (apkCountEl) apkCountEl.textContent = totalApk;
    if (lastSyncEl) {
        lastSyncEl.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
}

function initDashboard() {
    loadModuleKeys(currentModuleTier);
    loadApkKeys();
    updateCreditUI();

    if (USER_ROLE === 'reseller' && userCredit <= 0) {
        alert('Credit habis, Anda akan logout.');
        handleLogout();
        return;
    }
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
}

function requireFields(map) {
    // map: { fieldName: value }
    for (const k in map) {
        if (!map[k]) return k;
    }
    return null;
}

async function generateModule() {
    if (USER_ROLE === 'reseller' && userCredit <= 0) {
        alert('❌ Credit habis. Tidak bisa generate.');
        return;
    }

    const prefix = getInputValue('modKeyPrefix') || 'XK';
    const limit = getInputValue('modLimit');
    const exp = getInputValue('modExp');
    let password = getInputValue('modPass');
    const deviceId = getInputValue('modDeviceId');
    const tier = getInputValue('modTier');
    const nodeName = TIER_NODE_MAP[tier];

    const missing = requireFields({ limit, exp, tier });
    if (missing || !nodeName) {
        alert('Isi limit, tanggal expired, dan pilih tier yang valid!');
        return;
    }

    if (!password) password = Math.random().toString(36).substring(2, 8).toUpperCase();

    const keySuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const key = `${prefix.toUpperCase()}-${keySuffix}`;

    const devices = {};
    if (deviceId) devices[deviceId] = true;

    const payload = {
        key,
        expired: exp,
        device_limit: parseInt(limit, 10),
        password,
        status: 'active',
        devices,
        tier
    };

    const storedKey = sanitizeDbKey(key);

    try {
        const response = await fetch(`${DB_URL}${nodeName}/${storedKey}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const t = await response.text().catch(() => '');
            throw new Error(`Gagal menyimpan (HTTP ${response.status}) ${t}`.trim());
        }

        const success = await deductCredit();
        if (!success) {
            await fetch(`${DB_URL}${nodeName}/${storedKey}.json`, { method: 'DELETE' });
            return;
        }

        alert(`✅ LICENSE CREATED\n🔑 KEY: ${key}\n🔒 PASS: ${password}\n🏷️ TIER: ${tier}\n📅 EXP: ${exp}\n📱 LIMIT: ${limit}`);

        const modExpEl = document.getElementById('modExp');
        const modPassEl = document.getElementById('modPass');
        const modDeviceIdEl = document.getElementById('modDeviceId');
        if (modExpEl) modExpEl.value = '';
        if (modPassEl) modPassEl.value = '';
        if (modDeviceIdEl) modDeviceIdEl.value = '';

        loadModuleKeys(currentModuleTier);
    } catch (err) {
        alert('❌ Gagal: ' + (err?.message || String(err)));
    }
}

async function generateApk() {
    if (USER_ROLE === 'reseller' && userCredit <= 0) {
        alert('❌ Credit habis. Tidak bisa generate.');
        return;
    }

    const deviceId = getInputValue('apkDeviceId');
    const username = getInputValue('apkUser');
    let password = getInputValue('apkPass');
    const exp = getInputValue('apkExp');
    const limit = getInputValue('apkLimit');
    const tier = getInputValue('apkTier');

    const missing = requireFields({ deviceId, username, exp, limit, tier });
    if (missing) {
        alert('Isi device ID, username, expired date, device limit, dan tier!');
        return;
    }

    if (!password) password = Math.random().toString(36).substring(2, 8).toUpperCase();

    const key = 'APK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const sanitizedDeviceId = sanitizeDbKey(deviceId);

    const payload = {
        device_id: deviceId,
        username,
        expired: exp,
        password,
        key,
        tier,
        device_limit: parseInt(limit, 10),
        status: 'active',
        devices: {}
    };

    try {
        const response = await fetch(`${DB_URL}apk_access/${sanitizedDeviceId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const t = await response.text().catch(() => '');
            throw new Error(`Gagal menyimpan (HTTP ${response.status}) ${t}`.trim());
        }

        const success = await deductCredit();
        if (!success) {
            await fetch(`${DB_URL}apk_access/${sanitizedDeviceId}.json`, { method: 'DELETE' });
            return;
        }

        alert(`✅ APK LICENSE CREATED\n🆔 DEVICE: ${deviceId}\n🔑 KEY: ${key}\n👤 USER: ${username}\n🔒 PASS: ${password}\n🏷️ TIER: ${tier}\n📅 EXP: ${exp}`);

        const apkDeviceIdEl = document.getElementById('apkDeviceId');
        const apkUserEl = document.getElementById('apkUser');
        const apkExpEl = document.getElementById('apkExp');
        const apkPassEl = document.getElementById('apkPass');
        if (apkDeviceIdEl) apkDeviceIdEl.value = '';
        if (apkUserEl) apkUserEl.value = '';
        if (apkExpEl) apkExpEl.value = '';
        if (apkPassEl) apkPassEl.value = '';

        loadApkKeys();
    } catch (err) {
        alert('❌ Gagal: ' + (err?.message || String(err)));
    }
}

function setModuleTier(tier) {
    currentModuleTier = tier;
    document.querySelectorAll('#moduleTierTabs .tier-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tier === tier);
    });
    loadModuleKeys(tier);
}

async function loadModuleKeys(tier = 'all') {
    const tbody = document.getElementById('moduleTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">Loading...</td></tr>';

    let nodesToFetch = [];
    if (tier === 'all') {
        nodesToFetch = Object.values(TIER_NODE_MAP);
    } else {
        const node = TIER_NODE_MAP[tier];
        if (node) nodesToFetch.push(node);
        else {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">Invalid tier</td></tr>';
            return;
        }
    }

    try {
        const allData = [];
        const fetchPromises = nodesToFetch.map(async (nodeName) => {
            const res = await fetch(`${DB_URL}${nodeName}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status} on ${nodeName}`);
            const data = await res.json();

            if (data && data !== 'null') {
                for (let key in data) {
                    // key di sini = stored key (sudah sanitize). Kita simpan sebagai stored_key.
                    data[key]._node = nodeName;
                    data[key]._stored_key = key;
                    allData.push({ key, ...data[key] });
                }
            }
        });

        await Promise.all(fetchPromises);

        if (allData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">No module licenses found</td></tr>';
            setSummary(0, parseInt(apkCountEl?.textContent || '0', 10) || 0);
            return;
        }

        tbody.innerHTML = '';

        for (let item of allData) {
            if (!item.key) continue;

            const devices = item.devices || {};
            const deviceIds = Object.keys(devices);
            const registeredCount = deviceIds.length;
            const limit = item.device_limit;

            const hwidHtml = deviceIds.length
                ? `<div class="device-list-container">${deviceIds.map(id => `<span class="device-chip" title="${escapeHtml(id)}">${escapeHtml(id.substring(0,12))}...</span>`).join('')}</div>`
                : '<span class="text-slate-500 text-xs">None</span>';

            const slotInfo = `<span class="slot-indicator text-${registeredCount >= limit ? 'rose' : 'emerald'}-400">${registeredCount}/${limit}</span>`;
            const statusBadge = item.status === 'active'
                ? '<span class="bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded">ACTIVE</span>'
                : '<span class="bg-rose-950 text-rose-400 px-2 py-0.5 rounded">BANNED</span>';

            const expiredClass = (new Date(item.expired) < new Date()) ? 'text-rose-400' : 'text-emerald-400';
            const tierDisplay = item.tier ? item.tier.toUpperCase() : (item._node.replace('license_','').toUpperCase());

            const storedKey = item._stored_key || item.key;

            const deleteBtn = (USER_ROLE !== 'reseller')
                ? `<button onclick="deleteModule('${escapeHtml(storedKey)}', '${escapeHtml(item._node)}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash-can"></i></button>`
                : '';

            const row = `<tr class="border-b border-slate-800 hover:bg-slate-900/40">
                    <td class="p-3 font-mono font-bold text-amber-400">${escapeHtml(item.key)}</td>
                    <td class="p-3 text-yellow-400">${escapeHtml(tierDisplay)}</td>
                    <td class="p-3 text-blue-400">${limit}${slotInfo}</td>
                    <td class="p-3">${hwidHtml}</td>
                    <td class="p-3 font-mono">${escapeHtml(item.password)}</td>
                    <td class="p-3 ${expiredClass}">${escapeHtml(item.expired)}</td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3 text-center">
                        <button onclick="editModule('${escapeHtml(storedKey)}', '${escapeHtml(item._node)}')" class="text-amber-400 hover:text-amber-300 mr-2"><i class="fa-solid fa-edit"></i></button>
                        <button onclick="resetModuleDevices('${escapeHtml(storedKey)}', '${escapeHtml(item._node)}')" class="text-cyan-400 hover:text-cyan-300 mr-2"><i class="fa-solid fa-arrows-rotate"></i></button>
                        <button onclick="toggleModuleStatus('${escapeHtml(storedKey)}', '${escapeHtml(item.status)}', '${escapeHtml(item._node)}')" class="text-indigo-400 hover:text-indigo-300 mr-2"><i class="fa-solid fa-ban"></i></button>
                        ${deleteBtn}
                    </td>
                </tr>`;

            tbody.insertAdjacentHTML('beforeend', row);
        }

        setSummary(allData.length, parseInt(apkCountEl?.textContent || '0', 10) || 0);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-400">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
}

async function loadApkKeys() {
    const tbody = document.getElementById('apkTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-slate-500">Loading...</td></tr>';

    try {
        const res = await fetch(`${DB_URL}apk_access.json`);
        const data = await res.json();

        if (!data || data === 'null') {
            tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-slate-500">No APK licenses found</td></tr>';
            setSummary(parseInt(moduleCountEl?.textContent || '0', 10) || 0, 0);
            return;
        }

        tbody.innerHTML = '';

        const rowIds = Object.keys(data);

        for (let nodeId of rowIds) {
            const item = data[nodeId];
            if (!item || !item.key) continue;

            const deviceIds = Object.keys(item.devices || {});
            const registeredCount = deviceIds.length;
            const limit = item.device_limit;

            const hwidHtml = deviceIds.length
                ? `<div class="device-list-container">${deviceIds.map(id => `<span class="device-chip" title="${escapeHtml(id)}">${escapeHtml(id.substring(0,12))}...</span>`).join('')}</div>`
                : '<span class="text-slate-500 text-xs">None</span>';

            const slotInfo = `<span class="slot-indicator text-${registeredCount >= limit ? 'rose' : 'emerald'}-400">${registeredCount}/${limit}</span>`;
            const statusBadge = item.status === 'active'
                ? '<span class="bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded">ACTIVE</span>'
                : '<span class="bg-rose-950 text-rose-400 px-2 py-0.5 rounded">BANNED</span>';

            const expiredClass = (new Date(item.expired) < new Date()) ? 'text-rose-400' : 'text-emerald-400';
            const tierClass = getTierClass(item.tier);

            const deleteBtn = (USER_ROLE !== 'reseller')
                ? `<button onclick="deleteApk('${escapeHtml(nodeId)}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash-can"></i></button>`
                : '';

            const row = `<tr class="border-b border-slate-800 hover:bg-slate-900/40">
                    <td class="p-3 font-mono text-slate-500 text-[11px]">${escapeHtml(nodeId)}</td>
                    <td class="p-3 font-mono font-bold text-emerald-400">${escapeHtml(item.key)}</td>
                    <td class="p-3 text-white">${escapeHtml(item.username || '-')}</td>
                    <td class="p-3"><span class="${tierClass} text-xs font-bold">${escapeHtml(item.tier)}</span></td>
                    <td class="p-3 text-cyan-400">${limit}${slotInfo}</td>
                    <td class="p-3">${hwidHtml}</td>
                    <td class="p-3 font-mono">${escapeHtml(item.password)}</td>
                    <td class="p-3 ${expiredClass}">${escapeHtml(item.expired)}</td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3 text-center">
                        <button onclick="editApk('${escapeHtml(nodeId)}')" class="text-amber-400 hover:text-amber-300 mr-2"><i class="fa-solid fa-edit"></i></button>
                        <button onclick="resetApkDevices('${escapeHtml(nodeId)}')" class="text-cyan-400 hover:text-cyan-300 mr-2"><i class="fa-solid fa-arrows-rotate"></i></button>
                        <button onclick="toggleApkStatus('${escapeHtml(nodeId)}', '${escapeHtml(item.status)}')" class="text-indigo-400 hover:text-indigo-300 mr-2"><i class="fa-solid fa-ban"></i></button>
                        ${deleteBtn}
                    </td>
                </tr>`;

            tbody.insertAdjacentHTML('beforeend', row);
        }

        setSummary(parseInt(moduleCountEl?.textContent || '0', 10) || 0, rowIds.length);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-red-400">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function getTierClass(tier) {
    const map = { Basic:'text-slate-400', Ultra:'text-blue-400', Vixo:'text-cyan-400', Delta:'text-yellow-500', Sonic:'text-orange-500', Lunar:'text-purple-400', Athena:'text-red-500', Private:'text-green-400' };
    return map[tier] || 'text-white';
}

async function editModule(keyStored, nodeName) {
    const url = `${DB_URL}${nodeName}/${keyStored}.json`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data) return;

    let newLimit = prompt('Device limit:', data.device_limit);
    if (newLimit === null) return;

    let newExp = prompt('Expired (YYYY-MM-DD):', data.expired);
    if (newExp === null) return;

    let newPass = prompt('Password:', data.password);
    if (newPass === null) return;

    const update = {
        device_limit: parseInt(newLimit, 10),
        expired: newExp,
        password: newPass,
        status: data.status,
        key: data.key,
        tier: data.tier
    };

    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
    loadModuleKeys(currentModuleTier);
}

async function resetModuleDevices(keyStored, nodeName) {
    if (confirm('Reset semua HWID yang terdaftar untuk module ini?')) {
        await fetch(`${DB_URL}${nodeName}/${keyStored}/devices.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        loadModuleKeys(currentModuleTier);
    }
}

async function toggleModuleStatus(keyStored, current, nodeName) {
    const newStatus = current === 'active' ? 'banned' : 'active';
    if (confirm(`Ubah status menjadi ${newStatus.toUpperCase()}?`))
        await fetch(`${DB_URL}${nodeName}/${keyStored}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    loadModuleKeys(currentModuleTier);
}

async function deleteModule(keyStored, nodeName) {
    if (USER_ROLE === 'reseller') {
        alert('❌ Reseller tidak bisa menghapus lisensi.');
        return;
    }

    if (confirm(`Hapus license module ${keyStored} permanen?`))
        await fetch(`${DB_URL}${nodeName}/${keyStored}.json`, { method: 'DELETE' });

    loadModuleKeys(currentModuleTier);
}

async function editApk(nodeId) {
    const url = `${DB_URL}apk_access/${nodeId}.json`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data) return;

    let newUser = prompt('Username:', data.username);
    if (newUser === null) return;

    let newTier = prompt('Tier (Basic/Ultra/...):', data.tier);
    if (newTier === null) return;

    let newLimit = prompt('Device limit:', data.device_limit);
    if (newLimit === null) return;

    let newExp = prompt('Expired (YYYY-MM-DD):', data.expired);
    if (newExp === null) return;

    let newPass = prompt('Password:', data.password);
    if (newPass === null) return;

    const update = {
        username: newUser,
        tier: newTier,
        device_limit: parseInt(newLimit, 10),
        expired: newExp,
        password: newPass
    };

    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
    loadApkKeys();
}

async function resetApkDevices(nodeId) {
    if (confirm('Reset semua HWID yang terdaftar untuk APK ini?')) {
        await fetch(`${DB_URL}apk_access/${nodeId}/devices.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        loadApkKeys();
    }
}

async function toggleApkStatus(nodeId, current) {
    const newStatus = current === 'active' ? 'banned' : 'active';
    if (confirm(`Ubah status menjadi ${newStatus.toUpperCase()}?`))
        await fetch(`${DB_URL}apk_access/${nodeId}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    loadApkKeys();
}

async function deleteApk(nodeId) {
    if (USER_ROLE === 'reseller') {
        alert('❌ Reseller tidak bisa menghapus lisensi.');
        return;
    }

    if (confirm(`Hapus APK license ${nodeId} permanen?`))
        await fetch(`${DB_URL}apk_access/${nodeId}.json`, { method: 'DELETE' });

    loadApkKeys();
}

window.onload = initDashboard;

