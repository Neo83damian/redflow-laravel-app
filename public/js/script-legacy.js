        // SYSTEM ACCOUNTS DATA STORE. No accounts are hardcoded here — every
        // account (Admin included) lives only in the database and is loaded
        // via bootstrapRedflowData() / the /login /register /api/users
        // endpoints. This array is just a local cache of what the server
        // has already sent this browser.
        let systemUsers = JSON.parse(localStorage.getItem('redflow_system_users')) || [];

        // GLOBAL DONORS DATA STORE. No sample donors are hardcoded here —
        // every donor is created through the app (Donor Masterlist "Add
        // Donor" form) and persisted in MySQL via DonorController. This
        // array is just a local cache, populated by bootstrapRedflowData().
        let donorsData = JSON.parse(localStorage.getItem('redflow_donors_masterlist')) || [];

        // GLOBAL HISTORY RECORDS DATA STORE. No sample records are
        // hardcoded here — every record is created through the app
        // (approveAndCommitHistoryRecord) and persisted in MySQL via
        // DonationRecordController. Populated by bootstrapRedflowData().
        let monitoringRecords = JSON.parse(localStorage.getItem('redflow_monitoring_records')) || [];

        // LOGGED-IN USER'S OWN PROFILE. No placeholder identity is
        // hardcoded here — this is filled in from the real account record
        // (via /login and /api/profile) the moment a Staff/Admin logs in.
        let staffData = JSON.parse(localStorage.getItem('redflow_staff_profile')) || {
            name: "",
            role: "",
            sex: "",
            bday: "",
            address: "",
            email: "",
            contact: "",
            avatar: "picture.jpg"
        };

        let activeCameraStream = null;
        let isViewingStaff = true;
        let activeSelectedDonorId = null;

        // Fetches the shared, database-backed Donor Masterlist, History
        // Records, (for Admin) the full account list, Notifications, and the
        // donor-focused Audit Log — then re-renders the views that already
        // read from these local arrays/localStorage keys. This makes those
        // views reflect real MySQL data (shared across every device/browser)
        // instead of only whatever was in this one browser's localStorage.
        async function bootstrapRedflowData() {
            try {
                const [donorsRes, recordsRes, notifsRes, auditRes] = await Promise.all([
                    fetch('/api/donors', { headers: { 'Accept': 'application/json' } }),
                    fetch('/api/donation-records', { headers: { 'Accept': 'application/json' } }),
                    fetch('/api/notifications', { headers: { 'Accept': 'application/json' } }),
                    fetch('/api/audit-log', { headers: { 'Accept': 'application/json' } }),
                ]);

                if (donorsRes.ok) {
                    const { donors } = await donorsRes.json();
                    donorsData = donors;
                    localStorage.setItem('redflow_donors_masterlist', JSON.stringify(donorsData));
                }
                if (recordsRes.ok) {
                    const { records } = await recordsRes.json();
                    monitoringRecords = records;
                    localStorage.setItem('redflow_monitoring_records', JSON.stringify(monitoringRecords));
                }
                if (notifsRes.ok) {
                    const { notifications } = await notifsRes.json();
                    saveNotificationsStore(notifications);
                }
                if (auditRes.ok) {
                    const { entries } = await auditRes.json();
                    localStorage.setItem('redflow_audit_log', JSON.stringify(entries));
                }

                const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
                if (currentUser && currentUser.role === 'Admin') {
                    const usersRes = await fetch('/api/users', { headers: { 'Accept': 'application/json' } });
                    if (usersRes.ok) {
                        const { users } = await usersRes.json();
                        systemUsers = users;
                        localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));
                    }
                }
            } catch (err) {
                showAlertBox('Warning: Could not load the latest data from the server. Showing the last saved copy on this device instead.');
            }

            renderDonorCards();
            renderMonitoringTable();
            renderAdminApprovalPageView();
            renderUsersLogView();
            updateNotificationBadge();
        }

        // PERSISTENT LOGIN CHECK ON DOM LOAD
        window.addEventListener('DOMContentLoaded', () => {
            const isLoggedIn = localStorage.getItem('redflow_logged_in');
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            if (isLoggedIn === 'true' && currentUser) {
                document.getElementById('loginView').classList.add('hidden');
                document.getElementById('mainAppContainer').style.display = 'block';
                setupSidebarByRole(currentUser);
                isSidebarOpen = window.innerWidth > 768;
                applySidebarState();
                setTimeout(() => { bootstrapRedflowData(); }, 100);
            }
        });

        function setupSidebarByRole(user) {
            const sidebarMenuContainer = document.getElementById('sidebarMenuContainer');
            if (!sidebarMenuContainer) return;

            if (user && user.role === 'Admin') {
                sidebarMenuContainer.innerHTML = `
                    <button class="side-custom-btn" onclick="switchMainPage('home', this); renderDonorCards();"><i class="fa-solid fa-address-book" style="margin-right:8px;"></i> Donor Masterlist</button>
                    <button class="side-custom-btn" onclick="switchMainPage('statistics', this); updateStatisticsData();"><i class="fa-solid fa-chart-pie" style="margin-right:8px;"></i> Statistics Dashboard</button>
                    <button class="side-custom-btn" onclick="switchMainPage('approvals', this); renderAdminApprovalPageView();"><i class="fa-solid fa-user-check" style="margin-right:8px;"></i> Approval Verification</button>
                    <button class="side-custom-btn" onclick="switchMainPage('userslog', this); renderUsersLogView();"><i class="fa-solid fa-users-rectangle" style="margin-right:8px;"></i> Users Log</button>
                    <button class="side-custom-btn" onclick="switchMainPage('auditlog', this); renderAuditLogView();"><i class="fa-solid fa-shield-halved" style="margin-right:8px;"></i> Audit Log</button>
                    <button class="side-custom-btn" style="background-color:var(--success-green);" onclick="exportDonorMasterlistCSV()"><i class="fa-solid fa-file-export" style="margin-right:8px;"></i> Export Masterlist</button>
                    <button class="side-custom-btn" onclick="toggleDarkMode()">Dark Mode</button>
                    <button class="side-custom-btn" onclick="switchMainPage('settings', this)">Account Security</button>
                `;
            } else {
                sidebarMenuContainer.innerHTML = `
                    <button class="side-custom-btn" onclick="switchMainPage('home', this); renderDonorCards();"><i class="fa-solid fa-address-book" style="margin-right:8px;"></i> Donor Masterlist</button>
                    <button class="side-custom-btn" onclick="toggleDarkMode()">Dark Mode</button>
                    <button class="side-custom-btn" onclick="switchMainPage('about', this); loadSubModule('faq')">FAQ</button>
                    <button class="side-custom-btn" onclick="switchMainPage('settings', this)">Account Security</button>
                `;
            }
        }
        function updateStatisticsData() {
            const totalPendingElem = document.getElementById('statTotalPending');
            const numberAdminElem = document.getElementById('statNumberAdmin');
            const numberStaffElem = document.getElementById('statNumberStaff');
            const numberDonorsElem = document.getElementById('statNumberDonors');
            if (totalPendingElem) {
                const pendingCount = systemUsers.filter(u => u.role === 'Staff' && u.status === 'Pending').length;
                totalPendingElem.innerText = pendingCount;
            }
            if (numberAdminElem) numberAdminElem.innerText = systemUsers.filter(u => u.role === 'Admin').length;
            if (numberStaffElem) numberStaffElem.innerText = systemUsers.filter(u => u.role === 'Staff' && u.status === 'Approved').length;
            if (numberDonorsElem) numberDonorsElem.innerText = donorsData.length;
            const numberHistoryElem = document.getElementById('statNumberHistory');
            if (numberHistoryElem) numberHistoryElem.innerText = monitoringRecords.length;
            const monthlyDateInput = document.getElementById('monthlyDonationsDate');
            const todayStr = new Date().toISOString().split('T')[0];
            if (monthlyDateInput && !monthlyDateInput.value) monthlyDateInput.value = todayStr;
            if (monthlyDateInput) renderMonthlyDonationsChart(monthlyDateInput.value.split('-')[0]);
            renderBloodTypeAvailability();
        }
        function renderMonthlyDonationsChart(year) {
            const chartElem = document.getElementById('monthlyDonationsChart');
            const labelsElem = document.getElementById('monthlyDonationsLabels');
            if (!chartElem || !labelsElem) return;
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const counts = new Array(12).fill(0);
            // NOTE: Counts are built from each record's completed transaction
            // history PLUS its current donation (donationDate) -- see below.
            // This makes a History Record count toward Monthly Donations
            // immediately when it's created/updated, under whichever year
            // the donation date falls in, while still correctly subtracting
            // a record's totals the moment that History Record is deleted
            // (since both its transactions and its current donation leave
            // the pool with it).
            monitoringRecords.forEach(rec => {
                if (Array.isArray(rec.transactions)) {
                    rec.transactions.forEach(tx => {
                        if (tx.date && tx.date.startsWith(String(year))) {
                            const monthIdx = parseInt(tx.date.split('-')[1], 10) - 1;
                            if (monthIdx >= 0 && monthIdx < 12) counts[monthIdx]++;
                        }
                    });
                }
                // UPDATED: also count the record's current donation (donationDate)
                // itself, not just its past/superseded transactions. This is what
                // makes a newly created or updated History Record show up in
                // Monthly Donations right away, under whatever year it was made
                // in. When that donation is later superseded, it moves into
                // "transactions" above and the new one takes its place here, so
                // every real donation is still counted exactly once. Deleting the
                // History Record removes this record entirely, so the count goes
                // back down correctly.
                if (rec.donationDate && rec.donationDate !== 'N/A' && rec.donationDate.startsWith(String(year))) {
                    const monthIdx = parseInt(rec.donationDate.split('-')[1], 10) - 1;
                    if (monthIdx >= 0 && monthIdx < 12) counts[monthIdx]++;
                }
            });
            const maxCount = Math.max(...counts, 1);
            chartElem.innerHTML = counts.map(c => `
                <div class="monthly-chart-col">
                    <div class="monthly-chart-count">${c}</div>
                    <div class="monthly-chart-bar" style="height:${c > 0 ? (c / maxCount * 100) : 1}%;"></div>
                </div>
            `).join('');
            labelsElem.innerHTML = monthNames.map(m => `<span>${m}</span>`).join('');
        }
        function renderBloodTypeAvailability() {
            const listElem = document.getElementById('bloodTypeAvailabilityList');
            if (!listElem) return;
            const bloodTypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
            const countByType = {};
            bloodTypes.forEach(bt => countByType[bt] = 0);
            donorsData.forEach(donor => {
                if (countByType.hasOwnProperty(donor.bloodType)) {
                    countByType[donor.bloodType]++;
                }
            });
            const maxCount = Math.max(...Object.values(countByType), 1);
            listElem.innerHTML = bloodTypes.map(bt => `
                <div class="blood-avail-row">
                    <div class="blood-avail-row-top">
                        <span>${bt}</span>
                        <span>${countByType[bt]}</span>
                    </div>
                    <div class="blood-avail-track">
                        <div class="blood-avail-fill" style="width:${(countByType[bt] / maxCount * 100)}%;"></div>
                    </div>
                </div>
            `).join('');
        }

        function renderAdminApprovalPageView() {
            const container = document.getElementById('adminApprovalPageViewList');
            if (!container) return;

            const pendingStaff = systemUsers.filter(u => u.role === 'Staff' && u.status === 'Pending');
            if (pendingStaff.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No pending staff approvals at this time.</div>';
                return;
            }

            container.innerHTML = `
                <table class="approval-table">
                    <thead>
                        <tr>
                            <th>User Role</th>
                            <th>Name</th>
                            <th>Contact / Location</th>
                            <th>ID Front</th>
                            <th>ID Back</th>
                            <th>Face Document</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingStaff.map(staff => {
                            const idFront = staff.idFront || 'picture.jpg';
                            const idBack = staff.idBack || 'picture.jpg';
                            const faceDoc = staff.faceDoc || 'picture.jpg';
                            return `
                            <tr>
                                <td><span class="approval-role-badge">${staff.role}</span></td>
                                <td style="font-weight:bold;">${staff.name}</td>
                                <td>
                                    <div>${staff.email}</div>
                                    <div style="color:var(--text-muted); font-size:12px;">${staff.contact || ''}${staff.brgy ? ' | Brgy. ' + staff.brgy : ''}</div>
                                </td>
                                <td><img class="approval-doc-thumb" src="${idFront}" onerror="this.src='picture.jpg'" onclick="openImageZoom('${idFront}')"></td>
                                <td><img class="approval-doc-thumb" src="${idBack}" onerror="this.src='picture.jpg'" onclick="openImageZoom('${idBack}')"></td>
                                <td><img class="approval-doc-thumb" src="${faceDoc}" onerror="this.src='picture.jpg'" onclick="openImageZoom('${faceDoc}')"></td>
                                <td>
                                    <button onclick="approveStaff('${staff.id}'); renderAdminApprovalPageView(); updateStatisticsData();" style="background:var(--success-green); color:white; border:none; padding:7px 12px; border-radius:6px; font-weight:bold; cursor:pointer; margin-right:6px; font-size:12px; white-space:nowrap;"><i class="fa-solid fa-check"></i> Approve</button>
                                    <button onclick="rejectStaff('${staff.id}'); renderAdminApprovalPageView(); updateStatisticsData();" style="background:var(--primary-red); color:white; border:none; padding:7px 12px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; white-space:nowrap;"><i class="fa-solid fa-xmark"></i> Reject</button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            `;
        }

        function openImageZoom(src) {
            document.getElementById('imageZoomTarget').src = src;
            document.getElementById('imageZoomOverlay').style.display = 'flex';
        }

        function closeImageZoom() {
            document.getElementById('imageZoomOverlay').style.display = 'none';
        }

        function isAdminUser() {
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            return !!(currentUser && currentUser.role === 'Admin');
        }

        let selectedUserIds = new Set();
        let currentRenderedUserIds = [];

        function renderUsersLogView() {
            const container = document.getElementById('usersLogContainer');
            if (!container) return;
            const adminMode = isAdminUser();

            currentRenderedUserIds = systemUsers.map(u => u.id);
            selectedUserIds.clear();
            refreshUsersDeleteBtn();
            const bulkBar = document.getElementById('usersBulkBar');
            if (bulkBar) bulkBar.style.display = adminMode ? 'flex' : 'none';
            const selectAllBox = document.getElementById('usersSelectAll');
            if (selectAllBox) selectAllBox.checked = false;

            if (systemUsers.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No registered users found.</div>';
                return;
            }

            container.innerHTML = `
                <div class="approval-table-wrapper">
                    <table class="approval-table">
                        <thead>
                            <tr>
                                ${adminMode ? `<th style="width:30px;"></th>` : ''}
                                <th>Timestamp</th>
                                <th>User Name</th>
                                <th>User Role</th>
                                <th>Contact</th>
                                <th>Action Taken</th>
                                ${adminMode ? `<th>Action</th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${systemUsers.map(user => `
                                <tr>
                                    ${adminMode ? `<td><input type="checkbox" class="admin-row-checkbox" style="margin-right:0;" onchange="toggleUserSelect('${user.id}', this.checked)"></td>` : ''}
                                    <td style="white-space:nowrap;">${formatLoginTimestamp(user.registeredAt)}</td>
                                    <td style="font-weight:bold;">${user.name}</td>
                                    <td><span style="font-size:11px; background:${user.role === 'Admin' ? 'var(--primary-red)' : 'var(--sidebar-btn-bg)'}; color:white; padding:2px 8px; border-radius:4px;">${user.role}</span></td>
                                    <td>${user.contact || 'N/A'}</td>
                                    <td>
                                        ${user.actionTaken || 'Registered'}
                                        <span style="display:block; font-size:11px; font-weight:bold; margin-top:2px; color:${user.status === 'Approved' ? '#2e7d32' : '#f57f17'};">${user.status || 'Approved'}</span>
                                    </td>
                                    ${adminMode ? `<td><button class="admin-bulk-delete-btn active" style="padding:6px 12px;" onclick="deleteSingleUser('${user.id}')"><i class="fa-solid fa-trash"></i> DELETE</button></td>` : ''}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function deleteSingleUser(userId) {
            if (userId === 'admin_1') { showAlertBox('The primary Admin account cannot be deleted.'); return; }
            if (!confirm('Are you sure you want to delete this user account?')) return;
            systemUsers = systemUsers.filter(u => u.id !== userId);
            localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));
            renderUsersLogView();
            updateStatisticsData();
        }

        function formatLoginTimestamp(isoString) {
            if (!isoString) return 'Not yet logged in';
            const dateObj = new Date(isoString);
            if (isNaN(dateObj.getTime())) return 'Not yet logged in';
            const datePart = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const timePart = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            return `${datePart}, ${timePart}`;
        }

        // ============ ACCOUNT NOTIFICATIONS (per-user login activity & approval alerts) ============
        function loadNotificationsStore() {
            return JSON.parse(localStorage.getItem('redflow_notifications')) || {};
        }

        function saveNotificationsStore(store) {
            localStorage.setItem('redflow_notifications', JSON.stringify(store));
        }

        // Adds a notification entry for a specific user account (by user id).
        function pushNotification(userId, message) {
            if (!userId) return;
            const store = loadNotificationsStore();
            if (!store[userId]) store[userId] = [];
            store[userId].unshift({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                message: message,
                timestamp: new Date().toISOString(),
                read: false
            });
            saveNotificationsStore(store);
            updateNotificationBadge();
        }

        function getCurrentUserNotifications() {
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            if (!currentUser) return [];
            const store = loadNotificationsStore();
            return store[currentUser.id] || [];
        }

        // Shows/hides the small red dot on the bottom nav "Notification" icon
        // whenever the logged-in account has at least one unread notification.
        function updateNotificationBadge() {
            const dot = document.getElementById('notifBadgeDot');
            if (!dot) return;
            const hasUnread = getCurrentUserNotifications().some(n => !n.read);
            dot.style.display = hasUnread ? 'block' : 'none';
        }

        // Renders the logged-in user's own notifications: who logged in / used
        // their account, and (for Staff) their account approval message.
        function renderNotificationsView() {
            const container = document.getElementById('notificationsListContainer');
            if (!container) return;
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            const notifs = getCurrentUserNotifications();

            if (notifs.length === 0) {
                container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:30px 10px;">No notifications yet.</p>`;
            } else {
                container.innerHTML = notifs.map(n => `
                    <div class="notif-item ${n.read ? '' : 'unread'}">
                        <div class="notif-item-main">
                            <div class="notif-item-icon"><i class="fa-solid fa-bell"></i></div>
                            <div>
                                <p class="notif-item-message">${n.message}</p>
                                <span class="notif-item-time">${formatLoginTimestamp(n.timestamp)}</span>
                            </div>
                        </div>
                        <button class="notif-item-delete-btn" title="Delete notification" onclick="deleteNotification('${n.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `).join('');
            }

            // Mark all as read now that the account owner has viewed them.
            if (currentUser) {
                const store = loadNotificationsStore();
                if (store[currentUser.id]) {
                    store[currentUser.id].forEach(n => n.read = true);
                    saveNotificationsStore(store);
                }
            }
            updateNotificationBadge();
        }

        // Lets the logged-in account owner (Staff or Admin) delete a single
        // notification of their own. Only removes it from that user's own list.
        async function deleteNotification(notifId) {
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            if (!currentUser) return;
            try {
                await fetch(`/api/notifications/${notifId}`, { method: 'DELETE', headers: { 'X-CSRF-TOKEN': csrfToken() } });
            } catch (err) { /* fall through and still update the local view */ }
            const store = loadNotificationsStore();
            if (!store[currentUser.id]) return;
            store[currentUser.id] = store[currentUser.id].filter(n => n.id !== notifId);
            saveNotificationsStore(store);
            renderNotificationsView();
        }

        // Lets the logged-in account owner clear all of their own notifications at once.
        async function clearAllNotifications() {
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            if (!currentUser) return;
            const notifs = getCurrentUserNotifications();
            if (notifs.length === 0) return;
            if (!confirm('Are you sure you want to delete all your notifications?')) return;
            try {
                await fetch('/api/notifications', { method: 'DELETE', headers: { 'X-CSRF-TOKEN': csrfToken() } });
            } catch (err) { /* fall through and still update the local view */ }
            const store = loadNotificationsStore();
            store[currentUser.id] = [];
            saveNotificationsStore(store);
            renderNotificationsView();
        }

        function toggleUserSelect(id, checked) {
            if (checked) selectedUserIds.add(id); else selectedUserIds.delete(id);
            refreshUsersDeleteBtn();
        }

        function refreshUsersDeleteBtn() {
            const btn = document.getElementById('usersDeleteBtn');
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-trash"></i> DELETE (${selectedUserIds.size})`;
            btn.classList.toggle('active', selectedUserIds.size > 0);
        }

        function toggleSelectAllUsers(checked) {
            document.querySelectorAll('#usersLogContainer .admin-row-checkbox').forEach(cb => cb.checked = checked);
            if (checked) currentRenderedUserIds.forEach(id => selectedUserIds.add(id));
            else selectedUserIds.clear();
            refreshUsersDeleteBtn();
        }

        function deleteSelectedUsers() {
            if (selectedUserIds.size === 0) return;
            if (selectedUserIds.has('admin_1')) {
                showAlertBox('The primary Admin account cannot be deleted.');
                return;
            }
            if (!confirm(`Are you sure you want to delete ${selectedUserIds.size} selected user(s)?`)) return;
            systemUsers = systemUsers.filter(u => !selectedUserIds.has(u.id));
            localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));
            selectedUserIds.clear();
            renderUsersLogView();
            updateStatisticsData();
        }

        // ============ LOGIN LOCKOUT (5 failed attempts = 60 second wait) ============
        const LOGIN_MAX_ATTEMPTS = 5;
        const LOGIN_LOCKOUT_MS = 60000;

        function getLoginAttemptsStore() {
            return JSON.parse(localStorage.getItem('redflow_login_attempts')) || {};
        }
        function saveLoginAttemptsStore(store) {
            localStorage.setItem('redflow_login_attempts', JSON.stringify(store));
        }
        // Returns remaining lockout seconds (0 if not locked) for this email.
        function getRemainingLockoutSeconds(email) {
            const store = getLoginAttemptsStore();
            const entry = store[email];
            if (!entry || !entry.lockUntil) return 0;
            const remainingMs = entry.lockUntil - Date.now();
            return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
        }
        function registerFailedLoginAttempt(email) {
            const store = getLoginAttemptsStore();
            const entry = store[email] || { count: 0, lockUntil: 0 };
            entry.count = (entry.count || 0) + 1;
            if (entry.count >= LOGIN_MAX_ATTEMPTS) {
                entry.lockUntil = Date.now() + LOGIN_LOCKOUT_MS;
                entry.count = 0;
            }
            store[email] = entry;
            saveLoginAttemptsStore(store);
        }
        function clearFailedLoginAttempts(email) {
            const store = getLoginAttemptsStore();
            if (store[email]) {
                delete store[email];
                saveLoginAttemptsStore(store);
            }
        }

        function csrfToken() {
            const meta = document.querySelector('meta[name="csrf-token"]');
            return meta ? meta.content : '';
        }

        // ============================================================
        // GLOBAL CSRF / SESSION-EXPIRY GUARD
        // ============================================================
        // Wraps window.fetch so that if the session token has expired
        // (Laravel returns HTTP 419 "Page Expired" — the "CSRF token
        // mismatch" error) the person gets a clear message and the page
        // reloads to a fresh, valid token, instead of every POST/PUT/DELETE
        // silently failing with a confusing error. Every existing fetch()
        // call above (login, register, donors, records, notifications,
        // audit log, profile, etc.) is unaffected for normal responses —
        // this only intercepts the specific 419 case.
        (function () {
            const nativeFetch = window.fetch.bind(window);
            let csrfAlertShown = false;
            window.fetch = async function (...args) {
                const response = await nativeFetch(...args);
                if (response.status === 419 && !csrfAlertShown) {
                    csrfAlertShown = true;
                    showAlertBox('Your session has expired for security reasons. The page will now refresh — please try again.');
                    setTimeout(() => window.location.reload(), 1800);
                }
                return response;
            };
        })();

        async function handleLogin() {
            const email = document.getElementById('loginEmail').value.trim().toLowerCase();
            const password = document.getElementById('loginPassword').value;

            // BLOCK LOGIN ATTEMPTS WHILE THIS EMAIL IS LOCKED OUT (client-side pre-check;
            // the real 5-attempt / 60s lockout is enforced server-side in AuthController)
            const remainingLockSeconds = getRemainingLockoutSeconds(email);
            if (remainingLockSeconds > 0) {
                showAlertBox(`Error: Too many failed login attempts. Please wait ${remainingLockSeconds} second(s) before trying again.`);
                return;
            }

            let response, result;
            try {
                response = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': csrfToken()
                    },
                    body: JSON.stringify({ email, password })
                });
                result = await response.json();
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
                return;
            }

            if (!response.ok) {
                if (response.status === 423) {
                    // Locked out server-side (5 failed attempts within 60s)
                    showAlertBox(result.message || 'Error: Too many failed login attempts. Please wait before trying again.');
                } else if (response.status === 403) {
                    showAlertBox(result.message || 'Your Staff Account is still waiting for Admin approval.');
                } else {
                    registerFailedLoginAttempt(email);
                    showAlertBox(result.message || 'Error: Incorrect Email or Password! Please check your credentials.');
                }
                return;
            }

            const user = result.user;

            // Refresh the CSRF meta tag with the new token session()->regenerate()
            // just issued server-side — see the comment in AuthController::login().
            // Without this, the next write request (change password, create a
            // donor, logout, etc.) would fail with a stale-token 419 error.
            if (result.csrf_token) {
                const csrfMeta = document.querySelector('meta[name="csrf-token"]');
                if (csrfMeta) csrfMeta.content = result.csrf_token;
            }

            // CORRECT CREDENTIALS: CLEAR ANY PRIOR FAILED-ATTEMPT COUNT FOR THIS EMAIL
            clearFailedLoginAttempts(email);

            // Keep systemUsers (local cache used by the rest of the app) in sync with the server record
            const loggedInUserIdx = systemUsers.findIndex(u => u.id === user.id || u.email === user.email);
            if (loggedInUserIdx !== -1) {
                systemUsers[loggedInUserIdx] = user;
            } else {
                systemUsers.push(user);
            }
            localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));

            localStorage.setItem('redflow_logged_in', 'true');
            localStorage.setItem('redflow_current_user', JSON.stringify(user));

            // Login notification is created server-side (AuthController::login),
            // so it already shows up once bootstrapRedflowData() below fetches it
            // — no need to push a duplicate client-side notification here.

            // Sync staff profile display
            staffData.name = user.name;
            staffData.role = user.role;
            staffData.email = user.email || staffData.email;
            staffData.contact = user.contact || staffData.contact;
            localStorage.setItem('redflow_staff_profile', JSON.stringify(staffData));

            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('mainAppContainer').style.display = 'block';
            
            setupSidebarByRole(user);
            isSidebarOpen = window.innerWidth > 768;
            applySidebarState();

            await bootstrapRedflowData();
            showAlertBox(`Logged in successfully as ${user.role}!`);
        }

        // ============ STAFF SIGN UP WIZARD (8 steps, ID + Selfie verification) ============
        let suData = {};
        let suSelfieStream = null;
        let suSelfieCaptured = false;

        function openSignupWizard() {
            // Reset all wizard state and fields every time it's opened fresh.
            suData = { frontId: null, backId: null, faceDoc: null };
            suSelfieCaptured = false;
            const ids = ['suFullname','suContact','suDob','suGender','suBrgy','suEmail','suPassword','suConfirmPassword'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            document.getElementById('suTermsConsent').checked = false;
            document.getElementById('suPrivacyConsent').checked = false;
            document.getElementById('suIdFrontStatus').textContent = 'Tap to take photo or upload';
            document.getElementById('suIdFrontStatus').style.color = '';
            document.getElementById('suIdFrontPreview').style.display = 'none';
            document.getElementById('suIdBackStatus').textContent = 'Tap to take photo or upload';
            document.getElementById('suIdBackStatus').style.color = '';
            document.getElementById('suIdBackPreview').style.display = 'none';
            goToSignupStep(1);
            openModal('signupModal');
        }

        function closeSignupWizard() {
            stopSuSelfieCamera();
            closeModal('signupModal');
        }

        // ============ FORGOT PASSWORD (email OTP recovery) ============
        let fpGeneratedCode = '';
        let fpTargetEmail = '';

        function openForgotPasswordModal() {
            fpGeneratedCode = '';
            fpTargetEmail = '';
            document.getElementById('fpEmailInput').value = '';
            document.querySelectorAll('.fp-otp').forEach(input => input.value = '');
            document.getElementById('fpNewPassword').value = '';
            document.getElementById('fpConfirmPassword').value = '';
            goToFpStep(1);
            openModal('forgotPasswordModal');
        }

        function closeForgotPasswordModal() {
            closeModal('forgotPasswordModal');
        }

        function goToFpStep(stepNumber) {
            document.querySelectorAll('#forgotPasswordModal .su-step').forEach(panel => panel.classList.remove('active'));
            document.getElementById('fp-step-' + stepNumber).classList.add('active');
        }

        async function validateFpStep1() {
            const email = document.getElementById('fpEmailInput').value.trim().toLowerCase();
            if (!email) {
                showAlertBox('Please enter your registered email address.');
                return;
            }

            fpTargetEmail = email;
            const btn = document.getElementById('fpSendCodeBtn');
            btn.textContent = 'Sending...';
            btn.disabled = true;

            try {
                const response = await fetch('/forgot-password/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ email })
                });
                const result = await response.json();
                btn.textContent = 'Send Code';
                btn.disabled = false;

                if (!response.ok) {
                    showAlertBox(result.message || 'Error: No account found with that email address.');
                    return;
                }
                document.getElementById('fpEmailTargetText').textContent = `Check ${email} for your 6-digit code.`;
                goToFpStep(2);
            } catch (err) {
                btn.textContent = 'Send Code';
                btn.disabled = false;
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        async function resendFpCode() {
            try {
                const response = await fetch('/forgot-password/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ email: fpTargetEmail })
                });
                if (!response.ok) throw new Error('resend failed');
                showAlertBox(`A new verification code has been resent to ${fpTargetEmail}.`);
            } catch (err) {
                showAlertBox('Error: Failed to resend the code. Please try again.');
            }
        }

        async function validateFpStep2() {
            const otpInputs = document.querySelectorAll('.fp-otp');
            let enteredCode = '';
            otpInputs.forEach(input => { enteredCode += input.value.trim(); });

            if (enteredCode.length < 6) {
                showAlertBox('Please enter the complete 6-digit verification code.');
                return;
            }

            try {
                const response = await fetch('/forgot-password/verify-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ email: fpTargetEmail, code: enteredCode })
                });
                const result = await response.json();
                if (!response.ok) {
                    showAlertBox(result.message || 'Error: Invalid verification code. Please try again.');
                    return;
                }
                fpGeneratedCode = enteredCode;
                goToFpStep(3);
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        async function validateFpResetPassword() {
            const p1 = document.getElementById('fpNewPassword').value;
            const p2 = document.getElementById('fpConfirmPassword').value;

            if (!p1 || !p2) {
                showAlertBox('Please fill in both password fields.');
                return;
            }
            const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
            if (!passwordRegex.test(p1)) {
                showAlertBox('Password must be at least 8 characters long and contain both numbers and symbols.');
                return;
            }
            if (p1 !== p2) {
                showAlertBox('Error: Passwords do not match!');
                return;
            }

            try {
                const response = await fetch('/forgot-password/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ email: fpTargetEmail, code: fpGeneratedCode, password: p1 })
                });
                const result = await response.json();
                if (!response.ok) {
                    showAlertBox(result.message || 'Error: Could not reset your password. Please try again.');
                    return;
                }
                showAlertBox('Password successfully reset! You may now log in with your new password.');
                closeForgotPasswordModal();
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        function goToSignupStep(stepNumber) {
            document.querySelectorAll('#signupModal .su-step').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById('su-step-' + stepNumber).classList.add('active');
            if (stepNumber === 5) {
                startSuSelfieCamera();
            }
        }

        function validateSuStep1() {
            const termsChecked = document.getElementById('suTermsConsent').checked;
            const privacyChecked = document.getElementById('suPrivacyConsent').checked;
            if (!termsChecked || !privacyChecked) {
                showAlertBox('Please check and agree to both the Terms and Conditions and Data Privacy Policy before proceeding.');
                return;
            }
            goToSignupStep(2);
        }

        function validateSuStep2() {
            const fullname = document.getElementById('suFullname').value.trim();
            const contact = document.getElementById('suContact').value.trim();
            const dob = document.getElementById('suDob').value;
            const gender = document.getElementById('suGender').value;
            if (!fullname || !contact || !dob || !gender) {
                showAlertBox('Please fill out all required fields before proceeding.');
                return;
            }
            suData.fullname = fullname;
            suData.contact = contact;
            suData.dob = dob;
            suData.gender = gender;
            suData.role = 'Staff';
            goToSignupStep(3);
        }

        function validateSuStep3() {
            const brgy = document.getElementById('suBrgy').value;
            if (!brgy) {
                showAlertBox('Please select your Barangay.');
                return;
            }
            suData.brgy = brgy;
            goToSignupStep(4);
        }

        function handleSuIdUpload(input, side) {
            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (side === 'front') {
                        suData.frontId = e.target.result;
                        document.getElementById('suIdFrontStatus').textContent = '✓ Front ID Captured';
                        document.getElementById('suIdFrontStatus').style.color = 'var(--success-green)';
                        const prev = document.getElementById('suIdFrontPreview');
                        prev.src = e.target.result;
                        prev.style.display = 'block';
                    } else {
                        suData.backId = e.target.result;
                        document.getElementById('suIdBackStatus').textContent = '✓ Back ID Captured';
                        document.getElementById('suIdBackStatus').style.color = 'var(--success-green)';
                        const prev = document.getElementById('suIdBackPreview');
                        prev.src = e.target.result;
                        prev.style.display = 'block';
                    }
                };
                reader.readAsDataURL(input.files[0]);
            }
        }

        function validateSuStep4() {
            if (!suData.frontId || !suData.backId) {
                showAlertBox('Please capture or upload both the Front and Back of your ID before proceeding.');
                return;
            }
            goToSignupStep(5);
        }

        async function startSuSelfieCamera() {
            suSelfieCaptured = false;
            const video = document.getElementById('suSelfieVideo');
            const preview = document.getElementById('suSelfiePreview');
            const actionBtn = document.getElementById('suSelfieActionBtn');
            const retakeBtn = document.getElementById('suRetakeBtn');
            const instruction = document.getElementById('suSelfieInstruction');

            video.style.display = 'block';
            preview.style.display = 'none';
            actionBtn.textContent = 'Capture Photo';
            retakeBtn.style.display = 'none';
            instruction.textContent = 'Hold phone still, look forward.';

            try {
                suSelfieStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                video.srcObject = suSelfieStream;
            } catch (err) {
                console.warn('Front camera access unavailable:', err);
                instruction.textContent = 'Camera unavailable. You may skip this step.';
            }
        }

        function stopSuSelfieCamera() {
            if (suSelfieStream) {
                suSelfieStream.getTracks().forEach(track => track.stop());
                suSelfieStream = null;
            }
        }

        function captureSuSelfie() {
            if (!suSelfieCaptured) {
                const video = document.getElementById('suSelfieVideo');
                const canvas = document.getElementById('suSelfieCanvas');
                const preview = document.getElementById('suSelfiePreview');
                const retakeBtn = document.getElementById('suRetakeBtn');
                const actionBtn = document.getElementById('suSelfieActionBtn');
                const instruction = document.getElementById('suSelfieInstruction');

                canvas.width = video.videoWidth || 300;
                canvas.height = video.videoHeight || 300;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const dataUrl = canvas.toDataURL('image/png');
                preview.src = dataUrl;
                suData.faceDoc = dataUrl;
                video.style.display = 'none';
                preview.style.display = 'block';

                stopSuSelfieCamera();

                suSelfieCaptured = true;
                instruction.textContent = 'Review your photo. Retake if blur.';
                actionBtn.textContent = 'Proceed';
                retakeBtn.style.display = 'block';
            } else {
                goToSignupStep(6);
            }
        }

        function retakeSuSelfie() {
            startSuSelfieCamera();
        }

        function validateSuStep6() {
            const email = document.getElementById('suEmail').value.trim().toLowerCase();
            const p1 = document.getElementById('suPassword').value;
            const p2 = document.getElementById('suConfirmPassword').value;

            if (!email || !p1 || !p2) {
                showAlertBox('Please complete all fields.');
                return;
            }

            const exists = systemUsers.find(u => u.email.toLowerCase() === email);
            if (exists) {
                showAlertBox('This email already has a registered account.');
                return;
            }

            const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
            if (!passwordRegex.test(p1)) {
                showAlertBox('Password must be at least 8 characters long and contain both numbers and symbols.');
                return;
            }
            if (p1 !== p2) {
                showAlertBox('Passwords do not match!');
                return;
            }

            suData.email = email;
            suData.password = p1;

            document.getElementById('suSummaryFullname').value = suData.fullname || '';
            document.getElementById('suSummaryContact').value = suData.contact || '';
            document.getElementById('suSummaryGender').value = suData.gender || '';
            document.getElementById('suSummaryRole').value = suData.role || 'Staff';
            document.getElementById('suSummaryDob').value = suData.dob || '';
            document.getElementById('suSummaryBrgy').value = suData.brgy || '';
            document.getElementById('suSummaryEmail').value = suData.email || '';
            document.getElementById('suSummaryAvatar').src = suData.faceDoc || 'picture.jpg';

            goToSignupStep(7);
        }

        async function confirmSuSignup() {
            const fullname = document.getElementById('suSummaryFullname').value.trim();
            const contact = document.getElementById('suSummaryContact').value.trim();
            const gender = document.getElementById('suSummaryGender').value.trim();
            const dob = document.getElementById('suSummaryDob').value.trim();
            const brgy = document.getElementById('suSummaryBrgy').value.trim();
            const email = document.getElementById('suSummaryEmail').value.trim().toLowerCase();

            if (!fullname || !contact || !email || !brgy) {
                showAlertBox('Please make sure Full Name, Contact Number, Barangay, and Email Address are filled out.');
                return;
            }

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({
                        name: fullname, email, password: suData.password,
                        contact, brgy, gender, dob,
                        idFront: suData.frontId || null, idBack: suData.backId || null, faceDoc: suData.faceDoc || null
                    })
                });
                const result = await response.json();
                if (!response.ok) {
                    showAlertBox(result.message || 'Error: Could not complete registration. Please check your details and try again.');
                    return;
                }

                systemUsers.push(result.user);
                localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));

                goToSignupStep(8);
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        function renderStaffApprovalList() {
            const listContainer = document.getElementById('pendingStaffList');
            if(!listContainer) return;
            
            const pendingStaff = systemUsers.filter(u => u.role === 'Staff' && u.status === 'Pending');
            
            if(pendingStaff.length === 0) {
                listContainer.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);">No pending staff approvals at this time.</div>';
                return;
            }

            listContainer.innerHTML = pendingStaff.map(staff => `
                <div style="background:var(--card-bg); border:1px solid var(--border-color); padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold; color:var(--text-dark);">${staff.name}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${staff.email} | ${staff.contact}</div>
                        <div style="font-size:11px; color:var(--primary-red); font-weight:bold;">Barangay: ${staff.brgy}</div>
                    </div>
                    <div>
                        <button onclick="approveStaff('${staff.id}'); renderStaffApprovalList(); renderAdminApprovalPageView(); updateStatisticsData();" style="background:var(--success-green); color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:5px;"><i class="fa-solid fa-check"></i> Approve</button>
                        <button onclick="rejectStaff('${staff.id}'); renderStaffApprovalList(); renderAdminApprovalPageView(); updateStatisticsData();" style="background:var(--primary-red); color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;"><i class="fa-solid fa-xmark"></i> Reject</button>
                    </div>
                </div>
            `).join('');
        }

        async function approveStaff(staffId) {
            const idx = systemUsers.findIndex(u => u.id === staffId);
            if (idx === -1) return;
            try {
                const response = await fetch(`/admin/staff/${staffId}/approve`, {
                    method: 'PATCH',
                    headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() }
                });
                if (!response.ok) { showAlertBox('Error: Could not approve this staff account. Please try again.'); return; }

                systemUsers[idx].status = 'Approved';
                systemUsers[idx].actionTaken = 'Approved';
                systemUsers[idx].registeredAt = new Date().toISOString();
                localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));

                // The staff-approved notification is created server-side
                // (Admin\StaffApprovalController::approve) for that staff
                // account's own Notification tab the next time they load the app.

                showAlertBox(`${systemUsers[idx].name} has been approved as Staff! They can now log in.`);
                renderUsersLogView();
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        async function rejectStaff(staffId) {
            if (!confirm('Are you sure you want to reject this staff sign-up request?')) return;
            try {
                const response = await fetch(`/admin/staff/${staffId}/reject`, {
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() }
                });
                if (!response.ok) { showAlertBox('Error: Could not reject this staff account. Please try again.'); return; }

                systemUsers = systemUsers.filter(u => u.id !== staffId);
                localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));
                showAlertBox('The staff sign-up request has been rejected.');
                renderUsersLogView();
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        // SINGLE SOURCE OF TRUTH FOR SIDEBAR STATE (prevents "closed" and "open"
        // classes from ever getting out of sync, so the menu always ends up
        // fully open or fully closed - no leftover sliver, just like Gmail).
        let isSidebarOpen = window.innerWidth > 768;

        function applySidebarState() {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('main-content');
            if (!sidebar) return;
            sidebar.style.transform = '';
            if (isSidebarOpen) {
                sidebar.classList.add('open');
                sidebar.classList.remove('closed');
                if (mainContent) mainContent.classList.remove('expanded');
            } else {
                sidebar.classList.remove('open');
                sidebar.classList.add('closed');
                // On desktop the sidebar takes up space via margin-left on
                // main-content, so main-content must also collapse back or
                // a "leftover" gap is left behind where the sidebar used to be.
                if (mainContent) mainContent.classList.add('expanded');
            }
        }

        function toggleSidebar() {
            isSidebarOpen = !isSidebarOpen;
            applySidebarState();
        }

        // GMAIL-STYLE SWIPE TO CLOSE SIDEBAR MENU
        (function setupSidebarSwipeGesture() {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;
            const sidebarWidth = 280;
            let touchStartX = 0;
            let touchCurrentX = 0;
            let isDraggingSidebar = false;

            sidebar.addEventListener('touchstart', (e) => {
                if (!isSidebarOpen) return;
                touchStartX = e.touches[0].clientX;
                touchCurrentX = touchStartX;
                isDraggingSidebar = true;
                sidebar.style.transition = 'none';
            }, { passive: true });

            sidebar.addEventListener('touchmove', (e) => {
                if (!isDraggingSidebar) return;
                touchCurrentX = e.touches[0].clientX;
                const deltaX = touchCurrentX - touchStartX;
                if (deltaX < 0) {
                    sidebar.style.transform = `translateX(${deltaX}px)`;
                }
            }, { passive: true });

            sidebar.addEventListener('touchend', () => {
                if (!isDraggingSidebar) return;
                isDraggingSidebar = false;
                sidebar.style.transition = '';
                const deltaX = touchCurrentX - touchStartX;
                touchStartX = 0;
                touchCurrentX = 0;
                if (deltaX < -(sidebarWidth * 0.3)) {
                    // Swipe passed the threshold - close it completely, no residue.
                    isSidebarOpen = false;
                }
                applySidebarState();
            });
        })();

        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
        }

        function toggleDropdown(id) {
            const drop = document.getElementById(id);
            drop.style.display = (drop.style.display === 'block') ? 'none' : 'block';
        }

        function switchMainPage(pageName, navBtnElement) {
            const pages = document.querySelectorAll('.page-view');
            pages.forEach(p => p.classList.remove('active'));

            const target = document.getElementById(`page-${pageName}`);
            if (target) target.classList.add('active');

            if (navBtnElement) {
                if (navBtnElement.classList.contains('side-custom-btn')) {
                    const sideItems = document.querySelectorAll('.side-custom-btn');
                    sideItems.forEach(n => n.classList.remove('active'));
                    navBtnElement.classList.add('active');
                } else {
                    const navItems = document.querySelectorAll('.bottom-nav-item');
                    navItems.forEach(n => n.classList.remove('active'));
                    navBtnElement.classList.add('active');
                }
            }

            // On mobile, tapping any bottom navigation item should always
            // close the sidebar menu completely (no leftover open sliver),
            // same behavior as swiping it closed.
            if (window.innerWidth <= 768 && isSidebarOpen) {
                isSidebarOpen = false;
                applySidebarState();
            }
        }

        // Switches between the "About Us" and "FAQ" sub-panels inside the
        // About page without affecting any other page/section.
        function loadSubModule(moduleName) {
            const aboutPanel = document.getElementById('aboutSubPanel');
            const faqPanel = document.getElementById('faqSubPanel');
            const aboutBtn = document.getElementById('aboutTabBtn');
            const faqBtn = document.getElementById('faqTabBtn');
            if (!aboutPanel || !faqPanel) return;

            if (moduleName === 'faq') {
                aboutPanel.classList.remove('active');
                faqPanel.classList.add('active');
                if (aboutBtn) aboutBtn.classList.remove('active');
                if (faqBtn) faqBtn.classList.add('active');
            } else {
                faqPanel.classList.remove('active');
                aboutPanel.classList.add('active');
                if (faqBtn) faqBtn.classList.remove('active');
                if (aboutBtn) aboutBtn.classList.add('active');
            }
        }

        // Expands/collapses a single FAQ question's answer, arrow rotates via CSS.
        function toggleFaqItem(buttonEl) {
            const item = buttonEl.closest('.faq-item');
            if (item) item.classList.toggle('open');
        }

        function handleProfileImageUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('profileAvatarImg').src = e.target.result;
                    if (isViewingStaff) {
                        document.getElementById('headerAvatarImg').src = e.target.result;
                        staffData.avatar = e.target.result;
                        localStorage.setItem('redflow_staff_profile', JSON.stringify(staffData));
                    }
                    showAlertBox('Profile photo updated successfully!');
                };
                reader.readAsDataURL(file);
            }
        }
function handleWizardAvatarUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('wizardAvatarPreview').src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        }

        function handleSuAvatarUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('suSummaryAvatar').src = e.target.result;
                    suData.faceDoc = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        }

        function togglePasswordVisibility(fieldId, buttonElement) {
            const inputField = document.getElementById(fieldId);
            const icon = buttonElement.querySelector('i');
            if (inputField.type === 'password') {
                inputField.type = 'text';
                icon.className = 'fa-solid fa-eye-slash';
            } else {
                inputField.type = 'password';
                icon.className = 'fa-solid fa-eye';
            }
        }

        async function confirmLogout() {
            closeModal('logoutModal');
            try {
                const response = await fetch('/logout', { method: 'POST', headers: { 'X-CSRF-TOKEN': csrfToken() } });
                const result = await response.json();
                // Refresh the CSRF meta tag with the new token the server just
                // issued, since this is a single-page app and the page itself
                // is never reloaded on logout — without this, the very next
                // login or forgot-password request would fail with a stale
                // "CSRF token mismatch" (419) error.
                if (result && result.csrf_token) {
                    const meta = document.querySelector('meta[name="csrf-token"]');
                    if (meta) meta.content = result.csrf_token;
                }
            } catch (err) { /* still clear the local session even if the request failed */ }
            localStorage.removeItem('redflow_logged_in');
            localStorage.removeItem('redflow_current_user');
            document.getElementById('mainAppContainer').style.display = 'none';
            document.getElementById('loginView').classList.remove('hidden');
            showAlertBox('You have logged out.');
        }

        async function validateAndChangePassword() {
            const currentPass = document.getElementById('currentPassInput').value;
            const newPass = document.getElementById('newPassInput').value;
            const confirmPass = document.getElementById('confirmPassInput').value;

            if (!currentPass) {
                showAlertBox('Error: Please enter your current password.');
                return;
            }

            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user'));
            if (!currentUser) {
                showAlertBox('Error: No logged in account found.');
                return;
            }

            const hasLength = newPass.length >= 8;
            const hasNumber = /[0-9]/.test(newPass);
            const hasSymbol = /[^A-Za-z0-9]/.test(newPass);
            if (!hasLength || !hasNumber || !hasSymbol) {
                showAlertBox('Error: Password must be at least 8 characters with numbers & symbols.');
                return;
            }
            if (newPass !== confirmPass) {
                showAlertBox('Error: New Password and Confirm New Password do not match.');
                return;
            }
            if (newPass === currentPass) {
                showAlertBox('Error: New Password must be different from your Current Password.');
                return;
            }

            // CURRENT PASSWORD IS VERIFIED SERVER-SIDE AGAINST THE BCRYPT HASH,
            // AND THE NEW PASSWORD IS RE-HASHED WITH BCRYPT BEFORE SAVING
            try {
                const response = await fetch('/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ current_password: currentPass, password: newPass })
                });
                const result = await response.json();
                if (!response.ok) {
                    showAlertBox(result.message || 'Error: Current Password is incorrect.');
                    return;
                }

                showAlertBox('Password updated successfully!');
                document.getElementById('currentPassInput').value = '';
                document.getElementById('newPassInput').value = '';
                document.getElementById('confirmPassInput').value = '';
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please check your connection and try again.');
            }
        }

        function openStaffProfile() {
            isViewingStaff = true;
            const currentUser = JSON.parse(localStorage.getItem('redflow_current_user')) || staffData;
            const container = document.getElementById('profile-container-box');
            container.innerHTML = `
                <button onclick="switchMainPage('home', document.querySelector('.bottom-nav-item'))" style="background:none; border:none; color:var(--primary-red); font-weight:bold; cursor:pointer; float:left; margin-bottom:10px;"><i class="fa-solid fa-arrow-left"></i> Back</button>
                <h2>ACCOUNT INFORMATION</h2>
                
                <input type="file" id="profileImageFile" accept="image/*" style="display: none;" onchange="handleProfileImageUpload(event)">
                
                <div class="profile-avatar-large" onclick="document.getElementById('profileImageFile').click()" title="Click to change photo">
                    <img id="profileAvatarImg" src="${staffData.avatar || 'picture.jpg'}" alt="Profile" onerror="this.onerror=null;this.src='picture.jpg'">
                </div>
                <div class="profile-photo-change-text" onclick="document.getElementById('profileImageFile').click()">
                    <i class="fa-solid fa-camera"></i> Click to change photo
                </div>
                
                <form onsubmit="event.preventDefault();">
                    <div class="form-group-custom">
                        <label>FULL NAME</label>
                        <input type="text" id="staff_name" value="${currentUser.name || staffData.name}" required>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>ROLE</label>
                            <input type="text" id="staff_role" value="${currentUser.role || staffData.role}" readonly style="background:#f5f5f5;">
                        </div>
                        <div class="form-group-custom">
                            <label>SEX</label>
                            <select id="staff_sex">
                                <option value="Male" ${staffData.sex === 'Male' ? 'selected' : ''}>Male</option>
                                <option value="Female" ${staffData.sex === 'Female' ? 'selected' : ''}>Female</option>
                                <option value="Other" ${staffData.sex === 'Other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group-custom">
                        <label>BIRTHDAY</label>
                        <input type="date" id="staff_bday" value="${staffData.bday}" required>
                    </div>
                    <div class="form-group-custom">
                        <label>COMPLETE ADDRESS</label>
                        <input type="text" id="staff_address" value="${staffData.address}" required>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>EMAIL ADDRESS</label>
                            <input type="email" id="staff_email" value="${staffData.email || currentUser.email || ''}" placeholder="halimbawa@gmail.com">
                        </div>
                        <div class="form-group-custom">
                            <label>CONTACT NUMBER</label>
                            <input type="tel" id="staff_contact" value="${staffData.contact || currentUser.contact || ''}" placeholder="+639xxxxxxxxx">
                        </div>
                    </div>
                    
                    <button type="button" onclick="updateStaffProfileData()" style="width: 100%; padding: 14px; background-color: var(--success-green); color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 15px;">Update</button>
                </form>
            `;
            switchMainPage('profile', null);
        }

        async function updateStaffProfileData() {
            staffData.name = document.getElementById('staff_name').value;
            staffData.sex = document.getElementById('staff_sex').value;
            staffData.bday = document.getElementById('staff_bday').value;
            staffData.address = document.getElementById('staff_address').value;
            staffData.email = document.getElementById('staff_email').value.trim().toLowerCase();
            staffData.contact = document.getElementById('staff_contact').value.trim();

            try {
                const response = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({
                        name: staffData.name, sex: staffData.sex, bday: staffData.bday,
                        address: staffData.address, email: staffData.email, contact: staffData.contact
                    })
                });
                const result = await response.json();
                if (!response.ok) {
                    showAlertBox(result.message || 'Error: Could not update your profile. Please try again.');
                    return;
                }
                localStorage.setItem('redflow_staff_profile', JSON.stringify(staffData));

                // KEEP THE LOGGED-IN USER'S RECORD (systemUsers + currentUser) IN SYNC
                localStorage.setItem('redflow_current_user', JSON.stringify(result.user));
                const userIdx = systemUsers.findIndex(u => u.id === result.user.id);
                if (userIdx !== -1) {
                    systemUsers[userIdx] = result.user;
                    localStorage.setItem('redflow_system_users', JSON.stringify(systemUsers));
                }
                showAlertBox('Profile updated successfully!');
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please try again.');
            }
        }

        // ============ AUDIT TRAIL / SENSITIVE DATA ACCESS LOG (RA 10173 compliance) ============
        const AUDIT_LOG_MAX_ENTRIES = 500;
        function getCurrentUserForAudit() {
            const cu = JSON.parse(localStorage.getItem('redflow_current_user'));
            return cu || { id: 'unknown', name: 'Unknown User', role: 'Unknown' };
        }
        function logAuditEvent(action, donor, details) {
            if (!donor) return;
            const actingUser = getCurrentUserForAudit();
            const auditLog = JSON.parse(localStorage.getItem('redflow_audit_log')) || [];
            auditLog.unshift({
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                timestamp: new Date().toISOString(),
                userId: actingUser.id,
                userName: actingUser.name,
                userRole: actingUser.role,
                action: action,
                donorId: donor.id,
                donorName: donor.name,
                details: details || ''
            });
            if (auditLog.length > AUDIT_LOG_MAX_ENTRIES) auditLog.length = AUDIT_LOG_MAX_ENTRIES;
            localStorage.setItem('redflow_audit_log', JSON.stringify(auditLog));
        }

        let selectedAuditLogIds = new Set();
        let currentRenderedAuditLogIds = [];

        function auditActionBadgeColor(action) {
            if (action === 'Update') return { bg: 'var(--warning-orange)', fg: '#222' };
            if (action === 'Create') return { bg: 'var(--success-green)', fg: '#fff' };
            if (action === 'Export') return { bg: '#6f42c1', fg: '#fff' };
            return { bg: '#1976d2', fg: '#fff' }; // View, and any other action
        }

        function renderAuditLogView() {
            const container = document.getElementById('auditLogContainer');
            if (!container) return;
            const auditLog = JSON.parse(localStorage.getItem('redflow_audit_log')) || [];

            currentRenderedAuditLogIds = auditLog.map(entry => entry.id);
            selectedAuditLogIds.clear();
            refreshAuditLogDeleteBtn();
            const bulkBar = document.getElementById('auditLogBulkBar');
            if (bulkBar) bulkBar.style.display = 'flex';
            const selectAllBox = document.getElementById('auditLogSelectAll');
            if (selectAllBox) selectAllBox.checked = false;

            if (auditLog.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No sensitive data access has been logged yet.</p>';
                return;
            }
            container.innerHTML = auditLog.map(entry => {
                const badge = auditActionBadgeColor(entry.action);
                return `
                <div style="background:var(--bg-light); border:1px solid var(--border-color); border-radius:8px; padding:12px 15px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                        <input type="checkbox" class="admin-row-checkbox" style="margin-top:4px;" onchange="toggleAuditLogSelect('${entry.id}', this.checked)">
                        <div>
                            <div style="font-weight:bold; color:var(--text-dark); font-size:14px;">${entry.action} — ${entry.donorName}</div>
                            <div style="font-size:12px; color:var(--text-muted);">By: ${entry.userName} (${entry.userRole}) &middot; ${formatLoginTimestamp(entry.timestamp)}</div>
                            ${entry.details ? `<div style="font-size:12px; color:var(--text-dark); margin-top:4px; background:#fff; border:1px solid var(--border-color); border-radius:6px; padding:6px 8px;"><strong>Changes:</strong> ${entry.details}</div>` : ''}
                        </div>
                    </div>
                    <span style="font-size:11px; font-weight:bold; padding:4px 10px; border-radius:12px; background:${badge.bg}; color:${badge.fg};">${entry.action}</span>
                </div>
            `;
            }).join('');
        }

        function toggleAuditLogSelect(id, checked) {
            if (checked) selectedAuditLogIds.add(id); else selectedAuditLogIds.delete(id);
            refreshAuditLogDeleteBtn();
        }

        function refreshAuditLogDeleteBtn() {
            const btn = document.getElementById('auditLogDeleteBtn');
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-trash"></i> DELETE (${selectedAuditLogIds.size})`;
            btn.classList.toggle('active', selectedAuditLogIds.size > 0);
        }

        function toggleSelectAllAuditLog(checked) {
            document.querySelectorAll('#auditLogContainer .admin-row-checkbox').forEach(cb => cb.checked = checked);
            if (checked) currentRenderedAuditLogIds.forEach(id => selectedAuditLogIds.add(id));
            else selectedAuditLogIds.clear();
            refreshAuditLogDeleteBtn();
        }

        async function deleteSelectedAuditLogEntries() {
            if (selectedAuditLogIds.size === 0) return;
            if (!confirm(`Are you sure you want to delete ${selectedAuditLogIds.size} selected audit log entr${selectedAuditLogIds.size === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
            try {
                await fetch('/api/audit-log/bulk', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ ids: Array.from(selectedAuditLogIds) })
                });
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please try again.');
                return;
            }
            let auditLog = JSON.parse(localStorage.getItem('redflow_audit_log')) || [];
            auditLog = auditLog.filter(entry => !selectedAuditLogIds.has(entry.id));
            localStorage.setItem('redflow_audit_log', JSON.stringify(auditLog));
            selectedAuditLogIds.clear();
            renderAuditLogView();
            showAlertBox('Selected audit log entries deleted successfully!');
        }

        async function clearAuditLog() {
            if (!confirm('Are you sure you want to clear the entire audit log? This cannot be undone.')) return;
            try {
                await fetch('/api/audit-log', { method: 'DELETE', headers: { 'X-CSRF-TOKEN': csrfToken() } });
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please try again.');
                return;
            }
            localStorage.removeItem('redflow_audit_log');
            renderAuditLogView();
            showAlertBox('Audit log cleared successfully!');
        }

        // ============ EXPORT DONOR MASTERLIST (CSV — opens directly in Excel) ============
        function exportDonorMasterlistCSV() {
            if (!donorsData || donorsData.length === 0) {
                showAlertBox('Cannot export: the Donor Masterlist is currently empty.');
                return;
            }
            const headers = ['ID', 'Full Name', 'Blood Type', 'Barangay', 'Contact', 'Birthday', 'Last Donation', 'Times Donated', 'Weight (kg)', 'Eligibility Status', 'Allergies', 'Medical Conditions', 'Deferral/Screening Notes', 'Emergency Contact Name', 'Emergency Contact Number'];
            const escapeCsv = (val) => {
                const str = String(val === undefined || val === null ? '' : val);
                return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
            };
            const rows = donorsData.map(d => [
                d.id, d.name, d.bloodType, d.brgy, d.contact, d.bday, d.lastDonation, d.timesDonated,
                d.weight || 'N/A', d.eligibilityStatus || 'Eligible', d.allergies || 'None', d.medicalConditions || 'None',
                d.deferralReason || '', d.emergencyContactName || '', d.emergencyContactNumber || ''
            ].map(escapeCsv).join(','));
            const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const todayStr = new Date().toISOString().split('T')[0];
            link.href = url;
            link.download = `REDFLOW_Donor_Masterlist_${todayStr}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Exporting the full masterlist (including health fields) counts as
            // a bulk sensitive-data access, so it is logged too.
            const actingUser = getCurrentUserForAudit();
            const auditLog = JSON.parse(localStorage.getItem('redflow_audit_log')) || [];
            auditLog.unshift({
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                timestamp: new Date().toISOString(),
                userId: actingUser.id,
                userName: actingUser.name,
                userRole: actingUser.role,
                action: 'Export',
                donorId: 'ALL',
                donorName: `Full Masterlist (${donorsData.length} donors)`
            });
            if (auditLog.length > AUDIT_LOG_MAX_ENTRIES) auditLog.length = AUDIT_LOG_MAX_ENTRIES;
            localStorage.setItem('redflow_audit_log', JSON.stringify(auditLog));

            showAlertBox('Donor Masterlist exported successfully! Check your downloads folder.');
        }

        function openDonorProfile(donor) {
            isViewingStaff = false;
            activeSelectedDonorId = donor.id;
            logAuditEvent('View', donor);
            const middleNameValue = donor.middleName && donor.middleName.trim() !== "" ? donor.middleName : "N/A";
            const container = document.getElementById('profile-container-box');
            container.innerHTML = `
                <button onclick="switchMainPage('home', document.querySelector('.bottom-nav-item'))" style="background:none; border:none; color:var(--primary-red); font-weight:bold; cursor:pointer; float:left; margin-bottom:10px;"><i class="fa-solid fa-arrow-left"></i> Back</button>
                <h2>ACCOUNT INFORMATION</h2>
                
                <input type="file" id="profileImageFile" accept="image/*" style="display: none;" onchange="handleProfileImageUpload(event)">
                
                <div class="profile-avatar-large" onclick="document.getElementById('profileImageFile').click()" title="Click to change photo">
                    <img id="profileAvatarImg" src="${donor.avatar || 'picture.jpg'}" alt="Profile" onerror="this.onerror=null;this.src='picture.jpg'">
                </div>
                <div class="profile-photo-change-text" onclick="document.getElementById('profileImageFile').click()">
                    <i class="fa-solid fa-camera"></i> Click to change photo
                </div>
                
                <form onsubmit="event.preventDefault();">
                    <input type="hidden" id="prof_donorId" value="${donor.id}">
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>FIRST NAME</label>
                            <input type="text" id="prof_firstName" value="${donor.firstName || donor.name.split(' ')[0]}" required>
                        </div>
                        <div class="form-group-custom">
                            <label>MIDDLE NAME</label>
                            <input type="text" id="prof_middleName" value="${middleNameValue}">
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>SURNAME</label>
                            <input type="text" id="prof_surname" value="${donor.surname || donor.name.split(' ').slice(1).join(' ')}" required>
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>EXT. NAME</label>
                            <select id="prof_ext">
                                <option value="" ${!donor.ext ? 'selected' : ''}>None</option>
                                <option value="Jr." ${donor.ext === 'Jr.' ? 'selected' : ''}>Jr.</option>
                                <option value="Sr." ${donor.ext === 'Sr.' ? 'selected' : ''}>Sr.</option>
                                <option value="II" ${donor.ext === 'II' ? 'selected' : ''}>II</option>
                                <option value="III" ${donor.ext === 'III' ? 'selected' : ''}>III</option>
                                <option value="IV" ${donor.ext === 'IV' ? 'selected' : ''}>IV</option>
                                <option value="V" ${donor.ext === 'V' ? 'selected' : ''}>V</option>
                            </select>
                        </div>
                        <div class="form-group-custom">
                            <label>BLOOD TYPE${(donor.bloodType && !isAdminUser()) ? ' <i class="fa-solid fa-lock" style="font-size:11px; color:var(--text-muted);" title="Only an Admin can edit Blood Type once it has been set"></i>' : ''}</label>
                            <select id="prof_bloodType" ${(donor.bloodType && !isAdminUser()) ? 'disabled title="Only an Admin can edit Blood Type once it has been set"' : ''}>
                                <option value="A+" ${donor.bloodType === 'A+' ? 'selected' : ''}>A+</option>
                                <option value="A-" ${donor.bloodType === 'A-' ? 'selected' : ''}>A-</option>
                                <option value="B+" ${donor.bloodType === 'B+' ? 'selected' : ''}>B+</option>
                                <option value="B-" ${donor.bloodType === 'B-' ? 'selected' : ''}>B-</option>
                                <option value="AB+" ${donor.bloodType === 'AB+' ? 'selected' : ''}>AB+</option>
                                <option value="AB-" ${donor.bloodType === 'AB-' ? 'selected' : ''}>AB-</option>
                                <option value="O+" ${donor.bloodType === 'O+' ? 'selected' : ''}>O+</option>
                                <option value="O-" ${donor.bloodType === 'O-' ? 'selected' : ''}>O-</option>
                            </select>
                            ${(donor.bloodType && !isAdminUser()) ? '<div style="font-size:10px; color:var(--text-muted); margin-top:3px;">Locked — only an Admin can edit Blood Type once set.</div>' : ''}
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>BIRTHDAY (DATE OF BIRTH)</label>
                            <input type="date" id="prof_bday" value="${donor.bday || ''}" required>
                        </div>
                        <div class="form-group-custom">
                            <label>SEX</label>
                            <select id="prof_sex">
                                <option value="Male" ${donor.sex === 'Male' ? 'selected' : ''}>Male</option>
                                <option value="Female" ${donor.sex === 'Female' ? 'selected' : ''}>Female</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>CONTACT NUMBER</label>
                            <input type="text" id="prof_contact" value="${donor.contact || ''}" required>
                        </div>
                        <div class="form-group-custom">
                            <label>LOCATION</label>
                            <input type="text" id="prof_location" value="${donor.brgy}, Irosin, Sorsogon, Bicol, Philippines" required>
                        </div>
                    </div>
                    
                    <div style="margin-top:25px; margin-bottom:10px; border-top:1px solid var(--border-color); padding-top:15px;">
                        <div style="font-weight:bold; color:var(--primary-red); font-size:14px; letter-spacing:0.5px; text-transform:uppercase;">Health &amp; Additional Information</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">For reference only. Final medical screening and eligibility must always be confirmed by authorized health personnel.</div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>WEIGHT (KG)</label>
                            <input type="text" id="prof_weight" value="${donor.weight && donor.weight !== 'N/A' ? donor.weight : ''}" placeholder="e.g. 60">
                        </div>
                        <div class="form-group-custom">
                            <label>DONATION ELIGIBILITY STATUS</label>
                            <select id="prof_eligibilityStatus">
                                <option value="Eligible" ${donor.eligibilityStatus === 'Eligible' || !donor.eligibilityStatus ? 'selected' : ''}>Eligible</option>
                                <option value="Deferred" ${donor.eligibilityStatus === 'Deferred' ? 'selected' : ''}>Deferred</option>
                                <option value="Under Review" ${donor.eligibilityStatus === 'Under Review' ? 'selected' : ''}>Under Review</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>KNOWN ALLERGIES</label>
                            <input type="text" id="prof_allergies" value="${donor.allergies && donor.allergies !== 'None' ? donor.allergies : ''}" placeholder="None">
                        </div>
                        <div class="form-group-custom">
                            <label>EXISTING MEDICAL CONDITIONS</label>
                            <input type="text" id="prof_medicalConditions" value="${donor.medicalConditions && donor.medicalConditions !== 'None' ? donor.medicalConditions : ''}" placeholder="None">
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom" style="flex:1 1 100%;">
                            <label>DEFERRAL / SCREENING NOTES</label>
                            <input type="text" id="prof_deferralReason" value="${donor.deferralReason || ''}" placeholder="Reason if Deferred or Under Review">
                        </div>
                    </div>
                    <div class="form-row-dual">
                        <div class="form-group-custom">
                            <label>EMERGENCY CONTACT NAME</label>
                            <input type="text" id="prof_emergencyContactName" value="${donor.emergencyContactName || ''}" placeholder="Full name">
                        </div>
                        <div class="form-group-custom">
                            <label>EMERGENCY CONTACT NUMBER</label>
                            <input type="text" id="prof_emergencyContactNumber" value="${donor.emergencyContactNumber || ''}" placeholder="+639XXXXXXXXX">
                        </div>
                    </div>

                    <button type="button" onclick="updateDonorProfileData()" style="width: 100%; padding: 14px; background-color: var(--success-green); color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 15px;">Update</button>
                    
                    <button type="button" class="action-main-btn" onclick="openCreateHistoryForm()">Create History Record</button>
                </form>
            `;
            switchMainPage('profile', null);
        }
    async function updateDonorProfileData() {
            const donorId = parseInt(document.getElementById('prof_donorId').value);
            const fName = document.getElementById('prof_firstName').value;
            let mName = document.getElementById('prof_middleName').value.trim();
            if (mName === "N/A" || mName === "") {
                mName = "";
            }
            const lName = document.getElementById('prof_surname').value;
            const ext = document.getElementById('prof_ext').value.trim();
            const fullName = `${fName} ${mName ? mName + ' ' : ''}${lName}${ext ? ' ' + ext : ''}`;
            let bloodType = document.getElementById('prof_bloodType').value;
            const rawLoc = document.getElementById('prof_location').value;
            const brgyOnly = rawLoc.split(',')[0].trim();
            const contact = document.getElementById('prof_contact').value;
            const bday = document.getElementById('prof_bday').value;
            const avatar = document.getElementById('profileAvatarImg').src;

            const existingDonorRecord = donorsData.find(d => d.id === donorId);

            // NEW: BLOOD TYPE EDIT LOCK — once a Blood Type has been set by
            // staff, only an Admin may change it. Enforced here as well as in
            // the form (disabled field) in case of tampering.
            if (existingDonorRecord && existingDonorRecord.bloodType && !isAdminUser() && bloodType !== existingDonorRecord.bloodType) {
                bloodType = existingDonorRecord.bloodType;
                showAlertBox('Blood Type is locked and can only be changed by an Admin. The rest of the profile was updated.');
            }

            // NEW: BLOOD TYPE CROSS-VALIDATION — a blood type change is a
            // critical edit, so require explicit confirmation before it is
            // allowed to overwrite the existing record (guards against typos).
            if (existingDonorRecord && existingDonorRecord.bloodType && existingDonorRecord.bloodType !== bloodType) {
                const confirmBloodTypeChange = confirm(`Blood type change detected for ${fullName}:\n${existingDonorRecord.bloodType} → ${bloodType}\n\nThis is a critical field. Confirm this is a verified correction and NOT a typo before proceeding.`);
                if (!confirmBloodTypeChange) {
                    showAlertBox('Update cancelled. Blood type on record was not changed.');
                    return;
                }
            }
            // Cross-check against this donor's own History Records for mismatches
            const mismatchedHistoryRecord = monitoringRecords.find(r => r.donorId && String(r.donorId) === String(donorId) && r.bloodType && r.bloodType !== bloodType);
            if (mismatchedHistoryRecord) {
                showAlertBox(`Warning: A History Record on file for this donor shows blood type ${mismatchedHistoryRecord.bloodType}, which no longer matches ${bloodType}. Please verify before relying on this record.`);
            }

            // NEW: Health & Additional Information fields (additive, does not
            // touch any existing field above).
            const weightField = document.getElementById('prof_weight');
            const eligibilityField = document.getElementById('prof_eligibilityStatus');
            const allergiesField = document.getElementById('prof_allergies');
            const medicalConditionsField = document.getElementById('prof_medicalConditions');
            const deferralReasonField = document.getElementById('prof_deferralReason');
            const emergencyNameField = document.getElementById('prof_emergencyContactName');
            const emergencyNumberField = document.getElementById('prof_emergencyContactNumber');

            const weight = weightField && weightField.value.trim() !== '' ? weightField.value.trim() : 'N/A';
            const eligibilityStatus = eligibilityField ? eligibilityField.value : 'Eligible';
            const allergies = allergiesField && allergiesField.value.trim() !== '' ? allergiesField.value.trim() : 'None';
            const medicalConditions = medicalConditionsField && medicalConditionsField.value.trim() !== '' ? medicalConditionsField.value.trim() : 'None';
            const deferralReason = deferralReasonField ? deferralReasonField.value.trim() : '';
            const emergencyContactName = emergencyNameField ? emergencyNameField.value.trim() : '';
            const emergencyContactNumber = emergencyNumberField ? emergencyNumberField.value.trim() : '';

            const donorIndex = donorsData.findIndex(d => d.id === donorId);
            if (donorIndex !== -1) {
                const beforeEdit = donorsData[donorIndex];
                const afterEdit = {
                    ...beforeEdit,
                    name: fullName,
                    firstName: fName,
                    middleName: mName,
                    surname: lName,
                    ext: ext,
                    bloodType: bloodType,
                    brgy: brgyOnly,
                    contact: contact,
                    bday: bday,
                    avatar: avatar,
                    weight: weight,
                    eligibilityStatus: eligibilityStatus,
                    allergies: allergies,
                    medicalConditions: medicalConditions,
                    deferralReason: deferralReason,
                    emergencyContactName: emergencyContactName,
                    emergencyContactNumber: emergencyContactNumber
                };
                // NEW: work out exactly which fields changed so the Audit Log
                // can show what the user edited.
                const trackedFields = {
                    name: 'Name', bloodType: 'Blood Type', brgy: 'Barangay',
                    contact: 'Contact Number', bday: 'Birthday', weight: 'Weight',
                    eligibilityStatus: 'Eligibility Status', allergies: 'Allergies',
                    medicalConditions: 'Medical Conditions', deferralReason: 'Deferral Notes',
                    emergencyContactName: 'Emergency Contact Name', emergencyContactNumber: 'Emergency Contact Number'
                };
                const changeDetails = Object.keys(trackedFields)
                    .filter(key => (beforeEdit[key] || '') !== (afterEdit[key] || ''))
                    .map(key => `${trackedFields[key]}: "${beforeEdit[key] || 'N/A'}" → "${afterEdit[key] || 'N/A'}"`);

                donorsData[donorIndex] = afterEdit;
                try {
                    const response = await fetch(`/api/donors/${donorsData[donorIndex].id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                        body: JSON.stringify(donorsData[donorIndex])
                    });
                    if (response.ok) {
                        const { donor: savedDonor } = await response.json();
                        donorsData[donorIndex] = savedDonor;
                    } else {
                        showAlertBox('Warning: Could not save these changes to the server. They are only saved on this device for now.');
                    }
                } catch (err) {
                    showAlertBox('Warning: Could not reach the server. These changes are only saved on this device for now.');
                }
                localStorage.setItem('redflow_donors_masterlist', JSON.stringify(donorsData));
                // Audit Log entry is now written server-side by
                // DonorController::update (AuditLog::recordDonorAction), so no
                // separate client-only logAuditEvent() call is made here to
                // avoid a duplicate entry showing up before the next refresh.
            }
            renderDonorCards();
            updateStatisticsData();
            showAlertBox('Donor profile updated successfully!');
        }

        function openCreateHistoryForm() {
            const donorId = document.getElementById('prof_donorId') ? document.getElementById('prof_donorId').value : '';
            const donorRecord = donorsData.find(d => String(d.id) === String(donorId));
            const fName = document.getElementById('prof_firstName').value;
            const mName = document.getElementById('prof_middleName').value;
            const lName = document.getElementById('prof_surname').value;
            const validMName = (mName && mName !== "N/A") ? mName + ' ' : '';
            const fullName = `${fName} ${validMName}${lName}`;
            const bloodType = document.getElementById('prof_bloodType').value;
            const rawLoc = document.getElementById('prof_location').value;

            // SUGGEST THE NEXT DONATION COUNT BASED ON THE DONOR'S CURRENT RECORD
            const currentTimesDonated = donorRecord && donorRecord.timesDonated && donorRecord.timesDonated !== 'N/A' ? parseInt(donorRecord.timesDonated, 10) || 0 : 0;
            const suggestedTimesDonated = currentTimesDonated + 1;
            const todayStr = new Date().toISOString().split('T')[0];
            const priorLastDonation = donorRecord && donorRecord.lastDonation ? donorRecord.lastDonation : 'N/A';

            document.getElementById('history_form_donorId').value = donorId;
            document.getElementById('history_form_name').value = fullName;
            document.getElementById('history_form_location').value = rawLoc.includes('Irosin') ? rawLoc : `${rawLoc}, Irosin, Sorsogon, Bicol, Philippines`;
            document.getElementById('history_form_bloodType').value = bloodType;
            // NEW: Blood Type edit lock also applies here — only an Admin may
            // change it once it has already been set on the donor's record.
            document.getElementById('history_form_bloodType').disabled = !!(bloodType && !isAdminUser());
            document.getElementById('history_form_lastDonation').value = priorLastDonation;
            document.getElementById('history_form_newDonation').value = todayStr;
            document.getElementById('history_form_times').value = String(suggestedTimesDonated);
            document.getElementById('history_form_amount').value = "1 unit";
            document.getElementById('history_form_status').value = "Pending";
            switchMainPage('create-history-form', null);
        }

        async function approveAndCommitHistoryRecord() {
            const donorId = document.getElementById('history_form_donorId').value;
            const name = document.getElementById('history_form_name').value;
            const location = document.getElementById('history_form_location').value;
            let bloodType = document.getElementById('history_form_bloodType').value;
            // NEW: Blood Type edit lock — if a non-Admin somehow altered this
            // field, fall back to the donor's Blood Type of record.
            const donorForBloodTypeLock = donorsData.find(d => String(d.id) === String(donorId));
            if (donorForBloodTypeLock && donorForBloodTypeLock.bloodType && !isAdminUser() && bloodType !== donorForBloodTypeLock.bloodType) {
                bloodType = donorForBloodTypeLock.bloodType;
            }
            const priorLastDonation = document.getElementById('history_form_lastDonation').value;
            const newDonation = document.getElementById('history_form_newDonation').value;
            const timesDonated = document.getElementById('history_form_times').value.trim();
            const amount = document.getElementById('history_form_amount').value.trim();
            const status = document.getElementById('history_form_status').value;

            // VALIDATION: BLANK OR ZERO TIMES DONATED / AMOUNT MUST NOT BE APPROVED
            const timesDonatedNum = parseInt(timesDonated, 10);
            const amountNum = parseFloat(amount);
            if (!newDonation || timesDonated === '' || amount === '' || isNaN(timesDonatedNum) || timesDonatedNum <= 0 || isNaN(amountNum) || amountNum <= 0) {
                showAlertBox('Cannot proceed: New Donation date must be set, and Times Donated / Amount cannot be blank or zero.');
                return;
            }
            if (status !== 'Approved') {
                showAlertBox('Please select status as "Approved" to create and push record to history.');
                return;
            }
              // PREVENT DUPLICATE HISTORY ENTRIES: EACH DONOR MAY ONLY HAVE ONE
            // HISTORY RECORD. IF ONE ALREADY EXISTS (MATCHED BY DONOR ID, OR
            // BY NAME AS A FALLBACK), UPDATE IT IN PLACE AND APPEND THIS
            // DONATION TO ITS TRANSACTION LOG INSTEAD OF CREATING A NEW ROW.
            let existingIndex = monitoringRecords.findIndex(r => donorId && String(r.donorId) === String(donorId));
            if (existingIndex === -1) {
                existingIndex = monitoringRecords.findIndex(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
            }

            // NOTE: A brand-new "New Donation" is NOT yet a "Last Donation" -- it
            // only becomes part of the LAST DONATION TRANSACTION history once a
            // *subsequent* New Donation supersedes it. So we push the record's
            // PREVIOUS donation date (the one now being replaced) into the
            // transaction log -- never the just-entered New Donation itself.
            if (existingIndex !== -1) {
                const existingRecord = monitoringRecords[existingIndex];
                if (!Array.isArray(existingRecord.transactions)) existingRecord.transactions = [];
                const previousDonationDate = existingRecord.donationDate || priorLastDonation;
                if (previousDonationDate && previousDonationDate !== 'N/A') {
                    existingRecord.transactions.push({ date: previousDonationDate, timesDonated: existingRecord.timesDonated, amount: existingRecord.amount });
                }
                existingRecord.donorId = donorId || existingRecord.donorId || null;
                existingRecord.location = location;
                existingRecord.bloodType = bloodType;
                existingRecord.lastDonation = previousDonationDate;
                existingRecord.donationDate = newDonation;
                existingRecord.timesDonated = timesDonated;
                existingRecord.amount = amount;
            } else {
                // First-ever history record for this donor: if they already had a
                // recorded Last Donation on the masterlist (but no history entry
                // yet), carry that one entry into the transaction log. Otherwise
                // the transaction log starts empty since there is no completed
                // Last Donation yet -- only this pending New Donation.
                const initialTransactions = [];
                if (priorLastDonation && priorLastDonation !== 'N/A') {
                    initialTransactions.push({ date: priorLastDonation, timesDonated: '', amount: '' });
                }
                const newRecord = {
                    id: Date.now(),
                    donorId: donorId || null,
                    name: name,
                    location: location,
                    bloodType: bloodType,
                    timesDonated: timesDonated,
                    donationDate: newDonation,
                    lastDonation: priorLastDonation,
                    amount: amount,
                    transactions: initialTransactions
                };
                monitoringRecords.push(newRecord);
            }

            // PERSIST THE RECORD TO THE DATABASE (shared across every device/
            // browser). The New-Donation-vs-Last-Donation logic above is
            // unchanged — this just saves whatever object it already built.
            const recordToSave = existingIndex !== -1 ? monitoringRecords[existingIndex] : monitoringRecords[monitoringRecords.length - 1];
            try {
                const response = await fetch('/api/donation-records', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify(recordToSave)
                });
                if (response.ok) {
                    const { record: savedRecord } = await response.json();
                    if (existingIndex !== -1) {
                        monitoringRecords[existingIndex] = savedRecord;
                    } else {
                        monitoringRecords[monitoringRecords.length - 1] = savedRecord;
                    }
                } else {
                    showAlertBox('Warning: Could not save this record to the server. It is only saved on this device for now.');
                }
            } catch (err) {
                showAlertBox('Warning: Could not reach the server. This record is only saved on this device for now.');
            }
            localStorage.setItem('redflow_monitoring_records', JSON.stringify(monitoringRecords));

            // UPDATE THE DONOR'S MASTERLIST RECORD SO LAST DONATION & TIMES DONATED REFLECT THIS NEW RECORD
            let donorIndex = donorsData.findIndex(d => String(d.id) === String(donorId));
            if (donorIndex === -1) {
                donorIndex = donorsData.findIndex(d => d.name.trim().toLowerCase() === name.trim().toLowerCase());
            }
            if (donorIndex !== -1) {
                donorsData[donorIndex].lastDonation = newDonation;
                donorsData[donorIndex].timesDonated = timesDonated;
                try {
                    const donorSaveRes = await fetch(`/api/donors/${donorsData[donorIndex].id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                        body: JSON.stringify(donorsData[donorIndex])
                    });
                    if (donorSaveRes.ok) {
                        const { donor: savedDonor } = await donorSaveRes.json();
                        donorsData[donorIndex] = savedDonor;
                    }
                } catch (err) { /* keep local update even if the sync failed */ }
                localStorage.setItem('redflow_donors_masterlist', JSON.stringify(donorsData));
                renderDonorCards();
            }

            renderMonitoringTable();
            updateStatisticsData();
            showAlertBox('History record approved and created successfully!');
            switchMainPage('history', document.querySelectorAll('.bottom-nav-item')[2]);
        }

        let selectedDonorIds = new Set();
        let currentRenderedDonorIds = [];

        function renderDonorCards(filteredList = null) {
            const wrapper = document.getElementById('donor-cards-wrapper');
            wrapper.innerHTML = '';
            const listToRender = filteredList || donorsData;
            const adminMode = isAdminUser();

            const countLabel = document.getElementById('donor-count-label');
            if (countLabel) {
                countLabel.innerText = `${listToRender.length} Donors List`;
            }

            currentRenderedDonorIds = listToRender.map(d => d.id);
            selectedDonorIds.clear();
            refreshDonorDeleteBtn();
            const bulkBar = document.getElementById('donorBulkBar');
            if (bulkBar) bulkBar.style.display = adminMode ? 'flex' : 'none';
            const selectAllBox = document.getElementById('donorSelectAll');
            if (selectAllBox) selectAllBox.checked = false;

            if (listToRender.length === 0) {
                wrapper.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">No donors found.</div>`;
                return;
            }
            listToRender.forEach(donor => {
                const card = document.createElement('div');
                card.className = 'donor-card-item';
                card.setAttribute('data-abo', donor.bloodType);
                card.setAttribute('data-brgy', donor.brgy);
                card.setAttribute('data-name', donor.name);
                const fullLocationText = `${donor.brgy}, Irosin, Sorsogon, Bicol, Philippines`;
                const lastDonationDate = donor.lastDonation || 'N/A';
                const timesDonatedCount = donor.timesDonated || '1';
                card.innerHTML = `
                    ${adminMode ? `<input type="checkbox" class="admin-row-checkbox" onchange="toggleDonorSelect(${donor.id}, this.checked)">` : ''}
                    <div class="donor-avatar-area">
                        <div class="avatar-circle">
                            <img src="${donor.avatar || 'picture.jpg'}" alt="Donor" onerror="this.src='picture.jpg'">
                        </div>
                    </div>
                    <div class="donor-details-area">
                        <h4 class="donor-name-title">${donor.name}</h4>
                        <div class="donor-meta-tags">
                            <span class="badge-abo">${donor.bloodType}</span>
                            <span class="badge-brgy">${fullLocationText}</span>
                        </div>
                        <p class="last-donated-text">Last Donation: <strong>${lastDonationDate}</strong> | Times Donated: <strong>${timesDonatedCount}</strong></p>
                    </div>
                    <div class="donor-action-buttons">
                        <a href="tel:${donor.contact}" class="action-btn-custom contact-btn"><i class="fa-solid fa-phone"></i> CALL</a>
                        <button class="action-btn-custom request-btn" onclick='openDonorProfile(${JSON.stringify(donor)})'>VIEW</button>
                    </div>
                `;
                wrapper.appendChild(card);
            });
        }

        function toggleDonorSelect(id, checked) {
            if (checked) selectedDonorIds.add(id); else selectedDonorIds.delete(id);
            refreshDonorDeleteBtn();
        }

        function refreshDonorDeleteBtn() {
            const btn = document.getElementById('donorDeleteBtn');
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-trash"></i> DELETE (${selectedDonorIds.size})`;
            btn.classList.toggle('active', selectedDonorIds.size > 0);
        }

        function toggleSelectAllDonors(checked) {
            document.querySelectorAll('#donor-cards-wrapper .admin-row-checkbox').forEach(cb => cb.checked = checked);
            if (checked) currentRenderedDonorIds.forEach(id => selectedDonorIds.add(id));
            else selectedDonorIds.clear();
            refreshDonorDeleteBtn();
        }

        async function deleteSelectedDonors() {
            if (selectedDonorIds.size === 0) return;
            if (!confirm(`Are you sure you want to delete ${selectedDonorIds.size} selected donor(s)?`)) return;
            try {
                await fetch('/api/donors', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ ids: Array.from(selectedDonorIds) })
                });
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please try again.');
                return;
            }
            donorsData = donorsData.filter(d => !selectedDonorIds.has(d.id));
            localStorage.setItem('redflow_donors_masterlist', JSON.stringify(donorsData));
            selectedDonorIds.clear();
            renderDonorCards();
            updateStatisticsData();
        }

        let selectedRecordIds = new Set();
        let currentRenderedRecordIds = [];

        function renderMonitoringTable(filteredList = monitoringRecords) {
            const container = document.getElementById('monitoring-table-container');
            container.innerHTML = '';
            const adminMode = isAdminUser();

            currentRenderedRecordIds = filteredList.map(r => r.id);
            selectedRecordIds.clear();
            refreshHistoryDeleteBtn();
            const bulkBar = document.getElementById('historyBulkBar');
            if (bulkBar) bulkBar.style.display = adminMode ? 'flex' : 'none';
            const selectAllBox = document.getElementById('historySelectAll');
            if (selectAllBox) selectAllBox.checked = false;

            if (filteredList.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">No records found.</div>`;
                return;
            }
            filteredList.forEach((record) => {
                const originalIndex = monitoringRecords.findIndex(r => r.id === record.id);
                const card = document.createElement('div');
                card.style.cssText = "background:var(--card-bg); border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.06); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; cursor:pointer;";
                card.onclick = () => openRecordDetail(originalIndex);
                card.innerHTML = `
                    <div style="display:flex; align-items:center;">
                        ${adminMode ? `<input type="checkbox" class="admin-row-checkbox" onclick="event.stopPropagation();" onchange="toggleRecordSelect(${record.id}, this.checked)">` : ''}
                        <div>
                            <div style="font-size:18px; font-weight:bold; color:#111; margin-bottom:5px;">${record.name}</div>
                            <div style="font-size:14px; color:#555; margin-bottom:4px;">Times Donated: ${record.timesDonated || '1'}</div>
                            <div style="font-size:14px; color:#555;">${record.donationDate || '2026-08-18'}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span style="background:var(--primary-red); color:white; padding:6px 14px; border-radius:6px; font-weight:bold; font-size:15px;">${record.bloodType}</span>
                        <i class="fa-solid fa-chevron-right" style="color:#aaa; font-size:18px;"></i>
                    </div>
                `;
                container.appendChild(card);
            });
        }
    function toggleRecordSelect(id, checked) {
            if (checked) selectedRecordIds.add(id); else selectedRecordIds.delete(id);
            refreshHistoryDeleteBtn();
        }

        function refreshHistoryDeleteBtn() {
            const btn = document.getElementById('historyDeleteBtn');
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-trash"></i> DELETE (${selectedRecordIds.size})`;
            btn.classList.toggle('active', selectedRecordIds.size > 0);
        }

        function toggleSelectAllRecords(checked) {
            document.querySelectorAll('#monitoring-table-container .admin-row-checkbox').forEach(cb => cb.checked = checked);
            if (checked) currentRenderedRecordIds.forEach(id => selectedRecordIds.add(id));
            else selectedRecordIds.clear();
            refreshHistoryDeleteBtn();
        }

        async function deleteSelectedRecords() {
            if (selectedRecordIds.size === 0) return;
            if (!confirm(`Are you sure you want to delete ${selectedRecordIds.size} selected history record(s)?`)) return;
            try {
                await fetch('/api/donation-records', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify({ ids: Array.from(selectedRecordIds) })
                });
            } catch (err) {
                showAlertBox('Error: Could not reach the server. Please try again.');
                return;
            }
            monitoringRecords = monitoringRecords.filter(r => !selectedRecordIds.has(r.id));
            localStorage.setItem('redflow_monitoring_records', JSON.stringify(monitoringRecords));
            selectedRecordIds.clear();
            renderMonitoringTable();
            updateStatisticsData();
        }

        function filterHistoryRecords() {
            const query = document.getElementById('history-search-input').value.toLowerCase();
            const filtered = monitoringRecords.filter(rec => 
                rec.name.toLowerCase().includes(query) || rec.bloodType.toLowerCase().includes(query)
            );
            renderMonitoringTable(filtered);
        }

        function formatDateLong(dateStr) {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            const d = new Date(dateStr + 'T00:00:00');
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }

        let currentOpenRecordIndex = null;

        function openRecordDetail(index) {
            currentOpenRecordIndex = index;
            const rec = monitoringRecords[index];
            document.getElementById('detail_name').innerText = rec.name;
            document.getElementById('detail_location').innerText = rec.location || 'N/A';
            document.getElementById('detail_bloodType').innerText = rec.bloodType;
            document.getElementById('detail_newDonation').innerText = rec.donationDate || '2026-08-18';
            document.getElementById('detail_lastDonation').innerText = rec.lastDonation || 'N/A';
            document.getElementById('detail_timesDonated').innerText = rec.timesDonated || '1';
            document.getElementById('detail_amount').innerText = rec.amount || '1 unit';

            // LAST DONATION TRANSACTION LIST - SHOWS THE DONOR'S FULL DONATION
            // HISTORY (EVERY PAST TRANSACTION DATE), MOST RECENT FIRST.
            const txContainer = document.getElementById('lastDonationTransactionList');
            if (txContainer) {
                const transactions = Array.isArray(rec.transactions) ? rec.transactions.slice().reverse() : [];
                if (transactions.length === 0) {
                    txContainer.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:14px;">No prior donation transactions yet.</div>';
                } else {
                    txContainer.innerHTML = transactions.map(tx => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px solid #f0f0f0;">
                            <div style="font-size:15px; color:#333;"><span style="font-weight:bold;">Last Donation:</span> ${formatDateLong(tx.date)}</div>
                            <div style="font-size:13px; color:#888;">${tx.timesDonated || ''} time(s) &bull; ${tx.amount || ''}</div>
                        </div>
                    `).join('');
                }
            }

            switchMainPage('single-record', null);
        }

        // ADDED: Lets Admin/Staff edit the Last Donation date of an existing
        // History Record — previously view-only. Reuses the same save
        // endpoint as creating a record (upsert by record_uid), so the New
        // Donation-vs-Last-Donation logic and all other fields stay intact.
        let editLastDonationRecordIndex = null;

        function openEditLastDonationModal() {
            const rec = monitoringRecords[currentOpenRecordIndex];
            if (!rec) return;
            editLastDonationRecordIndex = currentOpenRecordIndex;
            document.getElementById('editLastDonationInput').value = rec.lastDonation && rec.lastDonation !== 'N/A' ? rec.lastDonation : '';
            openModal('editLastDonationModal');
        }

        async function saveEditedLastDonation() {
            const newDate = document.getElementById('editLastDonationInput').value;
            if (!newDate) {
                showAlertBox('Please choose a valid date.');
                return;
            }
            if (editLastDonationRecordIndex === null) return;

            const rec = monitoringRecords[editLastDonationRecordIndex];
            rec.lastDonation = newDate;

            try {
                const response = await fetch('/api/donation-records', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify(rec)
                });
                if (response.ok) {
                    const { record: savedRecord } = await response.json();
                    monitoringRecords[editLastDonationRecordIndex] = savedRecord;
                } else {
                    showAlertBox('Warning: Could not save this change to the server. It is only saved on this device for now.');
                }
            } catch (err) {
                showAlertBox('Warning: Could not reach the server. This change is only saved on this device for now.');
            }
            localStorage.setItem('redflow_monitoring_records', JSON.stringify(monitoringRecords));

            closeModal('editLastDonationModal');
            document.getElementById('detail_lastDonation').innerText = newDate;
            renderMonitoringTable();
            showAlertBox('Last Donation date updated successfully!');
        }
  
        function goToWizardStep(stepNum) {
            document.getElementById('wizard-step-0').style.display = 'none';
            document.getElementById('wizard-step-1').style.display = 'none';
            document.getElementById('wizard-step-2').style.display = 'none';
            document.getElementById('wizard-step-3').style.display = 'none';
            document.getElementById('wizard-step-4').style.display = 'none';
            if (stepNum !== 3 && activeCameraStream) {
                activeCameraStream.getTracks().forEach(track => track.stop());
                activeCameraStream = null;
            }
            if (stepNum === 0) {
                document.getElementById('wizard-step-0').style.display = 'block';
            } else if (stepNum === 1) {
                document.getElementById('wizard-step-1').style.display = 'block';
            } else if (stepNum === 2) {
                document.getElementById('wizard-step-2').style.display = 'block';
            } else if (stepNum === 3) {
                document.getElementById('wizard-step-3').style.display = 'block';
                // Reset capture state so re-entering this step always starts
                // fresh at "Capture Photo" (never stuck showing "Proceed").
                wizardSelfieCaptured = false;
                const retakeBtn = document.getElementById('wizardRetakeBtn');
                const actionBtn = document.getElementById('wizardSelfieActionBtn');
                const instruction = document.getElementById('wizardSelfieInstruction');
                const previewElem = document.getElementById('capturedPhotoPreview');
                if (retakeBtn) retakeBtn.style.display = 'none';
                if (actionBtn) actionBtn.textContent = 'Capture Photo';
                if (instruction) instruction.textContent = 'Hold phone still, look forward.';
                if (previewElem) previewElem.style.display = 'none';
                startLiveCamera();
            } else if (stepNum === 4) {
                document.getElementById('wizard-step-4').style.display = 'block';
                populateReviewStep();
            }
        }

        function validateStep1AndProceed() {
            const fName = document.getElementById('w_firstName').value.trim();
            const lName = document.getElementById('w_lastName').value.trim();
            const bday = document.getElementById('w_bday').value;
            const contact = document.getElementById('w_contact').value.trim();
            const bloodType = document.getElementById('w_bloodType').value;
            const role = document.getElementById('w_role').value;
            if (!fName || !lName || !bday || !contact || !bloodType || !role) {
                showAlertBox('Please complete all required fields.');
                return;
            }
            // NEW: Blood Type confirmation check — Blood Type is a critical
            // field, so require the user to explicitly confirm it is correct
            // before moving on. Uses the same styled confirmation card as
            // the Logout modal instead of the plain browser confirm().
            document.getElementById('bloodTypeConfirmMessage').innerText = `You entered Blood Type: ${bloodType}. Are you sure this is correct?`;
            openModal('bloodTypeConfirmModal');
        }

        function confirmBloodTypeAndProceed() {
            closeModal('bloodTypeConfirmModal');
            goToWizardStep(2);
        }

        function validateStep2AndProceed() {
            const barangay = document.getElementById('w_barangay').value;
            if (!barangay) {
                showAlertBox('Please select your Barangay.');
                return;
            }
            goToWizardStep(3);
        }

        function toggleMiddleName(checkbox) {
            const middleInput = document.getElementById('w_middleName');
            if (checkbox.checked) {
                middleInput.value = '';
                middleInput.disabled = true;
            } else {
                middleInput.value = '';
                middleInput.disabled = false;
            }
        }

        async function startLiveCamera() {
            const videoElem = document.getElementById('liveCameraStream');
            const previewElem = document.getElementById('capturedPhotoPreview');
            const placeholder = document.getElementById('cameraPlaceholder');
            
            videoElem.style.display = 'block';
            previewElem.style.display = 'none';
            placeholder.style.display = 'none';
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                activeCameraStream = stream;
                videoElem.srcObject = stream;
            } catch (err) {
                console.warn('Camera access unavailable:', err);
                videoElem.style.display = 'none';
                placeholder.style.display = 'block';
            }
        }

        let wizardSelfieCaptured = false;

        function captureSelfiePhoto() {
            const videoElem = document.getElementById('liveCameraStream');
            const canvasElem = document.getElementById('capturedCanvas');
            const previewElem = document.getElementById('capturedPhotoPreview');
            const retakeBtn = document.getElementById('wizardRetakeBtn');
            const actionBtn = document.getElementById('wizardSelfieActionBtn');
            const instruction = document.getElementById('wizardSelfieInstruction');

            if (!wizardSelfieCaptured) {
                // FIRST CLICK: TAKE THE PHOTO, SHOW A PREVIEW, THEN REVEAL RETAKE/PROCEED
                if (videoElem.style.display !== 'none' && activeCameraStream) {
                    canvasElem.width = videoElem.videoWidth || 320;
                    canvasElem.height = videoElem.videoHeight || 240;
                    const ctx = canvasElem.getContext('2d');
                    ctx.drawImage(videoElem, 0, 0, canvasElem.width, canvasElem.height);

                    const dataUrl = canvasElem.toDataURL('image/png');
                    previewElem.src = dataUrl;
                    document.getElementById('wizardAvatarPreview').src = dataUrl;
                    videoElem.style.display = 'none';
                    previewElem.style.display = 'block';

                    activeCameraStream.getTracks().forEach(track => track.stop());
                    activeCameraStream = null;
                }

                wizardSelfieCaptured = true;
                if (instruction) instruction.textContent = 'Review your photo. Retake if blur.';
                if (actionBtn) actionBtn.textContent = 'Proceed';
                if (retakeBtn) retakeBtn.style.display = 'block';
            } else {
                // SECOND CLICK (NOW LABELED "PROCEED"): CONTINUE TO THE NEXT STEP
                goToWizardStep(4);
            }
        }

        function skipSelfieCapture() {
            // Allow staff to skip taking a camera photo entirely and move on
            // with the default avatar placeholder.
            wizardSelfieCaptured = false;
            if (activeCameraStream) {
                activeCameraStream.getTracks().forEach(track => track.stop());
                activeCameraStream = null;
            }
            goToWizardStep(4);
        }

        function retakeSelfiePhoto() {
            wizardSelfieCaptured = false;
            const previewElem = document.getElementById('capturedPhotoPreview');
            const retakeBtn = document.getElementById('wizardRetakeBtn');
            const actionBtn = document.getElementById('wizardSelfieActionBtn');
            const instruction = document.getElementById('wizardSelfieInstruction');
            previewElem.style.display = 'none';
            if (retakeBtn) retakeBtn.style.display = 'none';
            if (actionBtn) actionBtn.textContent = 'Capture Photo';
            if (instruction) instruction.textContent = 'Hold phone still, look forward.';
            startLiveCamera();
        }

        function populateReviewStep() {
            document.getElementById('rev_firstName').value = document.getElementById('w_firstName').value;
            document.getElementById('rev_middleName').value = document.getElementById('w_middleName').value;
            document.getElementById('rev_lastName').value = document.getElementById('w_lastName').value;
            document.getElementById('rev_ext').value = document.getElementById('w_ext').value;
            document.getElementById('rev_bloodType').value = document.getElementById('w_bloodType').value;
            document.getElementById('rev_bday').value = document.getElementById('w_bday').value;
            document.getElementById('rev_contact').value = document.getElementById('w_contact').value;
            document.getElementById('rev_location').value = document.getElementById('w_barangay').value;
        }

        async function commitNewDonor() {
            const fName = document.getElementById('rev_firstName').value;
            let mName = document.getElementById('rev_middleName').value.trim();
            if (mName === "N/A") mName = "";
            const lName = document.getElementById('rev_lastName').value;
            const ext = document.getElementById('rev_ext').value.trim();
            const validMName = mName ? mName + ' ' : '';
            const validExt = ext ? ' ' + ext : '';
            const fullName = `${fName} ${validMName}${lName}${validExt}`;
            const bloodType = document.getElementById('rev_bloodType').value;
            const brgy = document.getElementById('rev_location').value;
            const contact = document.getElementById('rev_contact').value;
            const bday = document.getElementById('rev_bday').value;
            const avatarSrc = document.getElementById('wizardAvatarPreview').src || 'picture.jpg';
            const newDonorId = donorsData.length + 1;

            // NEW: read Health & Additional Information from wizard step 2 (falls
            // back to safe defaults if a field is left blank).
            const wWeightField = document.getElementById('w_weight');
            const wEligibilityField = document.getElementById('w_eligibilityStatus');
            const wAllergiesField = document.getElementById('w_allergies');
            const wMedicalConditionsField = document.getElementById('w_medicalConditions');
            const wDeferralReasonField = document.getElementById('w_deferralReason');
            const wEmergencyNameField = document.getElementById('w_emergencyContactName');
            const wEmergencyNumberField = document.getElementById('w_emergencyContactNumber');

            const newWeight = wWeightField && wWeightField.value.trim() !== '' ? wWeightField.value.trim() : 'N/A';
            const newEligibilityStatus = wEligibilityField ? wEligibilityField.value : 'Eligible';
            const newAllergies = wAllergiesField && wAllergiesField.value.trim() !== '' ? wAllergiesField.value.trim() : 'None';
            const newMedicalConditions = wMedicalConditionsField && wMedicalConditionsField.value.trim() !== '' ? wMedicalConditionsField.value.trim() : 'None';
            const newDeferralReason = wDeferralReasonField ? wDeferralReasonField.value.trim() : '';
            const newEmergencyContactName = wEmergencyNameField ? wEmergencyNameField.value.trim() : '';
            const newEmergencyContactNumber = wEmergencyNumberField ? wEmergencyNumberField.value.trim() : '';

            const newDonorObj = {
                id: newDonorId,
                name: fullName,
                firstName: fName,
                middleName: mName,
                surname: lName,
                ext: ext,
                bloodType: bloodType,
                brgy: brgy,
                verified: true,
                contact: contact,
                bday: bday,
                lastDonation: "N/A",
                timesDonated: "0",
                avatar: avatarSrc,
                weight: newWeight,
                allergies: newAllergies,
                medicalConditions: newMedicalConditions,
                eligibilityStatus: newEligibilityStatus,
                deferralReason: newDeferralReason,
                emergencyContactName: newEmergencyContactName,
                emergencyContactNumber: newEmergencyContactNumber
            };

            // PERSIST TO THE DATABASE — the server assigns the real id (avoids
            // id collisions across devices/browsers); we swap it in below.
            try {
                const response = await fetch('/api/donors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
                    body: JSON.stringify(newDonorObj)
                });
                if (response.ok) {
                    const { donor: savedDonor } = await response.json();
                    Object.assign(newDonorObj, savedDonor);
                } else {
                    showAlertBox('Warning: Could not save this donor to the server. It is only saved on this device for now.');
                }
            } catch (err) {
                showAlertBox('Warning: Could not reach the server. This donor is only saved on this device for now.');
            }

            donorsData.push(newDonorObj);
            localStorage.setItem('redflow_donors_masterlist', JSON.stringify(donorsData));
            renderDonorCards();
            updateStatisticsData();
            showAlertBox('Donor successfully created! A History Record can be added once the donor actually donates.');
            resetDonorWizardForm();
            goToWizardStep(0);
            switchMainPage('home', document.querySelectorAll('.bottom-nav-item')[0]);
        }

        // NEW: Clears every field in the Add Donor wizard (Steps 1-4) so that
        // starting a new entry never shows leftover data from the donor that
        // was just created.
        function resetDonorWizardForm() {
            const textFieldIds = [
                'w_firstName', 'w_middleName', 'w_lastName', 'w_contact',
                'w_weight', 'w_allergies', 'w_medicalConditions',
                'w_deferralReason', 'w_emergencyContactName', 'w_emergencyContactNumber'
            ];
            textFieldIds.forEach(id => {
                const field = document.getElementById(id);
                if (field) field.value = '';
            });
            const contactField = document.getElementById('w_contact');
            if (contactField) contactField.value = '+63';

            const bdayField = document.getElementById('w_bday');
            if (bdayField) bdayField.value = '';

            const noMiddleBox = document.getElementById('w_noMiddle');
            if (noMiddleBox) noMiddleBox.checked = false;
            const middleField = document.getElementById('w_middleName');
            if (middleField) middleField.disabled = false;

            const selectDefaultIds = ['w_ext', 'w_bloodType', 'w_role', 'w_barangay'];
            selectDefaultIds.forEach(id => {
                const field = document.getElementById(id);
                if (field) field.selectedIndex = 0;
            });

            const eligibilityField = document.getElementById('w_eligibilityStatus');
            if (eligibilityField) eligibilityField.value = 'Eligible';

            const avatarPreview = document.getElementById('wizardAvatarPreview');
            if (avatarPreview) avatarPreview.src = 'picture.jpg';

            wizardSelfieCaptured = false;
        }

        let currentAboFilter = 'All';
        let currentBrgyFilter = 'All Brgys.';

        function filterDonorsList() {
            const query = document.getElementById('donor-search-input').value.toLowerCase().trim();
            const filtered = donorsData.filter(donor => {
                const matchesSearch = donor.name.toLowerCase().includes(query) || 
                                      donor.brgy.toLowerCase().includes(query) || 
                                      donor.bloodType.toLowerCase().includes(query);
                const matchesAbo = (currentAboFilter === 'All' || donor.bloodType === currentAboFilter);
                const matchesBrgy = (currentBrgyFilter === 'All Brgys.' || donor.brgy === currentBrgyFilter);
                return matchesSearch && matchesAbo && matchesBrgy;
            });
            renderDonorCards(filtered);
        }

        function filterByAbo(type) {
            currentAboFilter = type;
            toggleDropdown('abo-dropdown');
            filterDonorsList();
        }

        function filterByBrgy(brgy) {
            currentBrgyFilter = brgy;
            toggleDropdown('brgy-dropdown');
            filterDonorsList();
        }

        function openModal(modalId) {
            document.getElementById(modalId).style.display = 'flex';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        // CUSTOM ALERT BOX - REPLACES PLAIN BROWSER showAlertBox() WITH A CLEARLY
        // VISIBLE STYLED CARD (SAME LOOK & FEEL AS THE LOGOUT CONFIRMATION BOX).
        function showAlertBox(message) {
            const card = document.getElementById('alertBoxCard');
            const icon = document.getElementById('alertBoxIcon');
            const title = document.getElementById('alertBoxTitle');
            const msgElem = document.getElementById('alertBoxMessage');

            let type = 'info';
            let iconClass = 'fa-solid fa-circle-info';
            let titleText = 'Notice';
            const lower = String(message).toLowerCase();
            if (lower.startsWith('error') || lower.includes('cannot') || lower.includes('incorrect') || lower.includes('not found') || lower.includes('rejected')) {
                type = 'error';
                iconClass = 'fa-solid fa-circle-exclamation';
                titleText = 'Error';
            } else if (lower.includes('please') || lower.includes('waiting for') || lower.includes('select')) {
                type = 'warning';
                iconClass = 'fa-solid fa-triangle-exclamation';
                titleText = 'Please Check';
            } else if (lower.includes('successfully') || lower.includes('approved') || lower.includes('created') || lower.includes('updated') || lower.includes('submitted') || lower.includes('logged')) {
                type = 'success';
                iconClass = 'fa-solid fa-circle-check';
                titleText = 'Success';
            }

            card.classList.remove('type-info', 'type-error', 'type-warning', 'type-success');
            card.classList.add('type-' + type);
            icon.innerHTML = `<i class="${iconClass}"></i>`;
            title.innerText = titleText;
            msgElem.innerText = message;
            openModal('alertBoxModal');
        }

        // ============================================================
        // EXPLICIT GLOBAL EXPORTS (window.functionName = functionName)
        // ============================================================
        // This file is loaded as a plain classic <script> (not a JS module),
        // so every top-level "function x(){}" above is already a property
        // of window automatically -- these lines do not change any behavior,
        // they just make that explicit and future-proof (e.g. if this file
        // is ever bundled, minified, or loaded as type="module" later, every
        // onclick="functionName()" handler in the HTML will keep working).
        window.applySidebarState = applySidebarState;
        window.approveAndCommitHistoryRecord = approveAndCommitHistoryRecord;
        window.approveStaff = approveStaff;
        window.auditActionBadgeColor = auditActionBadgeColor;
        window.bootstrapRedflowData = bootstrapRedflowData;
        window.captureSelfiePhoto = captureSelfiePhoto;
        window.captureSuSelfie = captureSuSelfie;
        window.clearAllNotifications = clearAllNotifications;
        window.clearAuditLog = clearAuditLog;
        window.clearFailedLoginAttempts = clearFailedLoginAttempts;
        window.closeForgotPasswordModal = closeForgotPasswordModal;
        window.closeImageZoom = closeImageZoom;
        window.closeModal = closeModal;
        window.closeSignupWizard = closeSignupWizard;
        window.commitNewDonor = commitNewDonor;
        window.confirmBloodTypeAndProceed = confirmBloodTypeAndProceed;
        window.confirmLogout = confirmLogout;
        window.confirmSuSignup = confirmSuSignup;
        window.csrfToken = csrfToken;
        window.deleteNotification = deleteNotification;
        window.deleteSelectedAuditLogEntries = deleteSelectedAuditLogEntries;
        window.deleteSelectedDonors = deleteSelectedDonors;
        window.deleteSelectedRecords = deleteSelectedRecords;
        window.deleteSelectedUsers = deleteSelectedUsers;
        window.deleteSingleUser = deleteSingleUser;
        window.exportDonorMasterlistCSV = exportDonorMasterlistCSV;
        window.filterByAbo = filterByAbo;
        window.filterByBrgy = filterByBrgy;
        window.filterDonorsList = filterDonorsList;
        window.filterHistoryRecords = filterHistoryRecords;
        window.formatDateLong = formatDateLong;
        window.formatLoginTimestamp = formatLoginTimestamp;
        window.getCurrentUserForAudit = getCurrentUserForAudit;
        window.getCurrentUserNotifications = getCurrentUserNotifications;
        window.getLoginAttemptsStore = getLoginAttemptsStore;
        window.getRemainingLockoutSeconds = getRemainingLockoutSeconds;
        window.goToFpStep = goToFpStep;
        window.goToSignupStep = goToSignupStep;
        window.goToWizardStep = goToWizardStep;
        window.handleLogin = handleLogin;
        window.handleProfileImageUpload = handleProfileImageUpload;
        window.handleSuAvatarUpload = handleSuAvatarUpload;
        window.handleSuIdUpload = handleSuIdUpload;
        window.isAdminUser = isAdminUser;
        window.loadNotificationsStore = loadNotificationsStore;
        window.loadSubModule = loadSubModule;
        window.logAuditEvent = logAuditEvent;
        window.openCreateHistoryForm = openCreateHistoryForm;
        window.openDonorProfile = openDonorProfile;
        window.openEditLastDonationModal = openEditLastDonationModal;
        window.openForgotPasswordModal = openForgotPasswordModal;
        window.openImageZoom = openImageZoom;
        window.openModal = openModal;
        window.openRecordDetail = openRecordDetail;
        window.openSignupWizard = openSignupWizard;
        window.openStaffProfile = openStaffProfile;
        window.populateReviewStep = populateReviewStep;
        window.pushNotification = pushNotification;
        window.refreshAuditLogDeleteBtn = refreshAuditLogDeleteBtn;
        window.refreshDonorDeleteBtn = refreshDonorDeleteBtn;
        window.refreshHistoryDeleteBtn = refreshHistoryDeleteBtn;
        window.refreshUsersDeleteBtn = refreshUsersDeleteBtn;
        window.registerFailedLoginAttempt = registerFailedLoginAttempt;
        window.rejectStaff = rejectStaff;
        window.renderAdminApprovalPageView = renderAdminApprovalPageView;
        window.renderAuditLogView = renderAuditLogView;
        window.renderBloodTypeAvailability = renderBloodTypeAvailability;
        window.renderDonorCards = renderDonorCards;
        window.renderMonitoringTable = renderMonitoringTable;
        window.renderMonthlyDonationsChart = renderMonthlyDonationsChart;
        window.renderNotificationsView = renderNotificationsView;
        window.renderStaffApprovalList = renderStaffApprovalList;
        window.renderUsersLogView = renderUsersLogView;
        window.resendFpCode = resendFpCode;
        window.resetDonorWizardForm = resetDonorWizardForm;
        window.retakeSelfiePhoto = retakeSelfiePhoto;
        window.retakeSuSelfie = retakeSuSelfie;
        window.saveEditedLastDonation = saveEditedLastDonation;
        window.saveLoginAttemptsStore = saveLoginAttemptsStore;
        window.saveNotificationsStore = saveNotificationsStore;
        window.setupSidebarByRole = setupSidebarByRole;
        window.showAlertBox = showAlertBox;
        window.skipSelfieCapture = skipSelfieCapture;
        window.startLiveCamera = startLiveCamera;
        window.startSuSelfieCamera = startSuSelfieCamera;
        window.stopSuSelfieCamera = stopSuSelfieCamera;
        window.switchMainPage = switchMainPage;
        window.toggleAuditLogSelect = toggleAuditLogSelect;
        window.toggleDarkMode = toggleDarkMode;
        window.toggleDonorSelect = toggleDonorSelect;
        window.toggleDropdown = toggleDropdown;
        window.toggleFaqItem = toggleFaqItem;
        window.toggleMiddleName = toggleMiddleName;
        window.togglePasswordVisibility = togglePasswordVisibility;
        window.toggleSelectAllAuditLog = toggleSelectAllAuditLog;
        window.toggleSelectAllDonors = toggleSelectAllDonors;
        window.toggleSelectAllRecords = toggleSelectAllRecords;
        window.toggleSelectAllUsers = toggleSelectAllUsers;
        window.toggleSidebar = toggleSidebar;
        window.toggleUserSelect = toggleUserSelect;
        window.updateNotificationBadge = updateNotificationBadge;
        window.updateStaffProfileData = updateStaffProfileData;
        window.updateStatisticsData = updateStatisticsData;
        window.validateAndChangePassword = validateAndChangePassword;
        window.validateFpResetPassword = validateFpResetPassword;
        window.validateFpStep1 = validateFpStep1;
        window.validateFpStep2 = validateFpStep2;
        window.validateStep1AndProceed = validateStep1AndProceed;
        window.validateStep2AndProceed = validateStep2AndProceed;
        window.validateSuStep1 = validateSuStep1;
        window.validateSuStep2 = validateSuStep2;
        window.validateSuStep3 = validateSuStep3;
        window.validateSuStep4 = validateSuStep4;
        window.validateSuStep6 = validateSuStep6;
