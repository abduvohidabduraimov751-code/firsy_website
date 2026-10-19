/**
 * Nasiya Daftari — To'liq Ilova Logikasi (Authentication & Debt Management)
 */

'use strict';

// ==================== DOM YORDAMCHILARI ====================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Pul formatlash (1 000 000 so'm)
const formatMoney = (num) => {
  return Number(num || 0).toLocaleString('uz-UZ') + " so'm";
};

// Bugungi sana (YYYY-MM-DD)
const getTodayDate = () => new Date().toISOString().slice(0, 10);

// Xavfsiz matn
const escapeHtml = (str) => {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
};

// ==================== ILOVA HOLATI (STATE) ====================
let currentUser = null;
let debts = [];
let currentFilter = 'all';
let searchQuery = '';
let currentPaymentDebt = null;
let currentDeleteDebtId = null;
let currentReminderDebt = null;
let unsubscribeFirestore = null;

// ==================== TOAST BILDIRISHNOMALARI ====================
function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==================== AUTH ALERT (KIRISH VA RO'YXATDAN O'TISHDA) ====================
function setAuthAlert(msg, type = 'error') {
  const alertEl = $('#authAlert');
  if (!alertEl) return;
  if (!msg) {
    alertEl.style.display = 'none';
    alertEl.className = 'auth-alert';
    alertEl.textContent = '';
    return;
  }
  alertEl.className = `auth-alert ${type}`;
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
}

// Firebase xatolarini o'zbekchaga o'girish
function getUzbekAuthError(code, defaultMsg) {
  switch (code) {
    case 'auth/invalid-email':
      return "Email manzil noto'g'ri kiritildi.";
    case 'auth/user-not-found':
      return "Bunday email bilan foydalanuvchi topilmadi.";
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "Email yoki parol noto'g'ri kiritildi.";
    case 'auth/email-already-in-use':
      return "Ushbu email bilan allaqachon ro'yxatdan o'tilgan.";
    case 'auth/weak-password':
      return "Parol juda oddiy. Kamida 6 ta belgi bo'lishi kerak.";
    case 'auth/network-request-failed':
      return "Internet aloqasi mavjud emas.";
    case 'auth/popup-closed-by-user':
      return "Google orqali kirish oynasi yopildi.";
    case 'auth/operation-not-allowed':
      return "Firebase konsolida Email/Password yoqilmagan. Lokal rejimda davom etishingiz mumkin.";
    default:
      return defaultMsg || "Xatolik yuz berdi. Qayta urinib ko'ring.";
  }
}

// ==================== AUTHENTICATION VA FOYDALANUVCHILARNI BOSHQARISH ====================

// LocalStorage'da lokal foydalanuvchilarni saqlash (Firebase mavjud bo'lmaganda yoki oflaynda zaxira)
const LOCAL_USERS_KEY = 'nasiya_local_users_v1';
const DEMO_USER_ID = 'demo_user_account';

function getLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

// Kirish holatini tekshirish va UI yangilash
function updateAuthUI(user) {
  const authScreen = $('#authScreen');
  const mainApp = $('#mainApp');
  const userPill = $('#userPill');
  const fabAddBtn = $('#fabAddBtn');
  const authLoadingOverlay = $('#authLoadingOverlay');

  if (authLoadingOverlay) {
    authLoadingOverlay.style.opacity = '0';
    setTimeout(() => {
      authLoadingOverlay.style.display = 'none';
    }, 300);
  }

  if (user) {
    currentUser = user;
    if (authScreen) authScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    if (fabAddBtn) fabAddBtn.style.display = 'grid';

    // Header foydalanuvchi ma'lumotlarini yangilash
    if (userPill) {
      userPill.style.display = 'flex';
      const name = user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi';
      const initial = name.charAt(0).toUpperCase();

      const userAvatar = $('#userAvatar');
      const userNameText = $('#userNameText');
      const userEmailText = $('#userEmailText');

      if (userAvatar) {
        if (user.photoURL) {
          userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${escapeHtml(name)}">`;
        } else {
          userAvatar.textContent = initial;
        }
      }
      if (userNameText) userNameText.textContent = name;
      if (userEmailText) userEmailText.textContent = user.email || '';
    }

    // Foydalanuvchi ma'lumotlarini yuklash
    loadDebtsForUser(user.uid);
  } else {
    currentUser = null;
    debts = [];
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
    if (authScreen) authScreen.style.display = 'block';
    if (mainApp) mainApp.style.display = 'none';
    if (userPill) userPill.style.display = 'none';
    if (fabAddBtn) fabAddBtn.style.display = 'none';

    // Qayta bo'shatish
    renderCustomerGrid();
    renderStats();
  }
}

// 1. Firebase Auth listener
if (typeof auth !== 'undefined' && auth) {
  auth.onAuthStateChanged((user) => {
    // Agar foydalanuvchi Firebase orqali kirgan bo'lsa
    if (user) {
      localStorage.removeItem('nasiya_demo_session');
      localStorage.removeItem('nasiya_local_session');
      updateAuthUI(user);
    } else {
      // Demo yoki Lokal sessiyani tekshirish
      const demoSession = localStorage.getItem('nasiya_demo_session');
      const localSession = localStorage.getItem('nasiya_local_session');

      if (demoSession) {
        try {
          updateAuthUI(JSON.parse(demoSession));
        } catch {
          updateAuthUI(null);
        }
      } else if (localSession) {
        try {
          updateAuthUI(JSON.parse(localSession));
        } catch {
          updateAuthUI(null);
        }
      } else {
        updateAuthUI(null);
      }
    }
  });
} else {
  // Firebase Auth SDK mavjud bo'lmaganda lokal tekshirish
  setTimeout(() => {
    const localSession = localStorage.getItem('nasiya_local_session') || localStorage.getItem('nasiya_demo_session');
    if (localSession) {
      try {
        updateAuthUI(JSON.parse(localSession));
      } catch {
        updateAuthUI(null);
      }
    } else {
      updateAuthUI(null);
    }
  }, 300);
}

// Tablarni almashtirish
const authTabLogin = $('#authTabLogin');
const authTabRegister = $('#authTabRegister');
const authLoginForm = $('#authLoginForm');
const authRegisterForm = $('#authRegisterForm');

if (authTabLogin && authTabRegister) {
  authTabLogin.onclick = () => {
    authTabLogin.classList.add('active');
    authTabRegister.classList.remove('active');
    authLoginForm.style.display = 'block';
    authRegisterForm.style.display = 'none';
    setAuthAlert(null);
  };

  authTabRegister.onclick = () => {
    authTabRegister.classList.add('active');
    authTabLogin.classList.remove('active');
    authLoginForm.style.display = 'none';
    authRegisterForm.style.display = 'block';
    setAuthAlert(null);
  };
}

// Parolni ko'rsatish/yashirish
const toggleLoginPwdBtn = $('#toggleLoginPwdBtn');
if (toggleLoginPwdBtn) {
  toggleLoginPwdBtn.onclick = () => {
    const input = $('#loginPassword');
    if (input.type === 'password') {
      input.type = 'text';
      toggleLoginPwdBtn.textContent = '🙈';
    } else {
      input.type = 'password';
      toggleLoginPwdBtn.textContent = '👁️';
    }
  };
}

const toggleRegPwdBtn = $('#toggleRegPwdBtn');
if (toggleRegPwdBtn) {
  toggleRegPwdBtn.onclick = () => {
    const input = $('#regPassword');
    if (input.type === 'password') {
      input.type = 'text';
      toggleRegPwdBtn.textContent = '🙈';
    } else {
      input.type = 'password';
      toggleRegPwdBtn.textContent = '👁️';
    }
  };
}

// 2. Kirish formasi submit
if (authLoginForm) {
  authLoginForm.onsubmit = async (e) => {
    e.preventDefault();
    setAuthAlert(null);

    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    const submitBtn = $('#loginSubmitBtn');

    if (!email || !password) {
      setAuthAlert("Iltimos, email va parolni to'ldiring.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Kirilmoqda...</span> ⏳`;

    // 1-urinish: Firebase Auth orqali
    if (typeof auth !== 'undefined' && auth) {
      try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        showToast("Xush kelibsiz!", 'success');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Tizimga kirish</span> ➔`;
        return;
      } catch (err) {
        console.warn("Firebase kirish xatoligi:", err.code, err.message);

        // Agar Firebase loyihada auth yoqilmagan bo'lsa yoki offline bo'lsa, lokal bazadan tekshirish
        const localUsers = getLocalUsers();
        const foundUser = localUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

        if (foundUser && foundUser.password === password) {
          const userObj = {
            uid: foundUser.uid,
            email: foundUser.email,
            displayName: foundUser.displayName,
            isLocal: true
          };
          localStorage.setItem('nasiya_local_session', JSON.stringify(userObj));
          updateAuthUI(userObj);
          showToast("Xush kelibsiz, " + foundUser.displayName + "!", 'success');
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Tizimga kirish</span> ➔`;
          return;
        }

        // Agar lokal foydalanuvchi ham topilmasa, xatolik ko'rsatish
        setAuthAlert(getUzbekAuthError(err.code, err.message));
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Tizimga kirish</span> ➔`;
        return;
      }
    } else {
      // Lokal tekshirish
      const localUsers = getLocalUsers();
      const foundUser = localUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (foundUser && foundUser.password === password) {
        const userObj = {
          uid: foundUser.uid,
          email: foundUser.email,
          displayName: foundUser.displayName,
          isLocal: true
        };
        localStorage.setItem('nasiya_local_session', JSON.stringify(userObj));
        updateAuthUI(userObj);
        showToast("Xush kelibsiz!", 'success');
      } else {
        setAuthAlert("Email yoki parol noto'g'ri kiritildi.");
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Tizimga kirish</span> ➔`;
    }
  };
}

// 3. Ro'yxatdan o'tish formasi submit
if (authRegisterForm) {
  authRegisterForm.onsubmit = async (e) => {
    e.preventDefault();
    setAuthAlert(null);

    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const password = $('#regPassword').value;
    const passwordConfirm = $('#regPasswordConfirm').value;
    const submitBtn = $('#regSubmitBtn');

    if (password !== passwordConfirm) {
      setAuthAlert("Kiritilgan parollar bir-biriga mos kelmadi!");
      return;
    }

    if (password.length < 6) {
      setAuthAlert("Parol kamida 6 ta belgidan iborat bo'lishi kerak!");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Ro'yxatdan o'tilmoqda...</span> ⏳`;

    // 1-urinish: Firebase Auth
    if (typeof auth !== 'undefined' && auth) {
      try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        if (userCredential.user) {
          await userCredential.user.updateProfile({ displayName: name });
        }
        showToast("Muvaffaqiyatli ro'yxatdan o'tdingiz!", 'success');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Ro'yxatdan o'tish</span> ➔`;
        return;
      } catch (err) {
        console.warn("Firebase registratsiya xatoligi:", err.code, err.message);

        // Agar Firebase console'da email provayderi yoqilmagan bo'lsa (operation-not-allowed), avtomatik ravishda lokal foydalanuvchi sifatida yaratamiz!
        if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found' || err.code === 'auth/network-request-failed') {
          const localUsers = getLocalUsers();
          if (localUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
            setAuthAlert("Bu email manzili allaqachon ro'yxatdan o'tgan.");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Ro'yxatdan o'tish</span> ➔`;
            return;
          }

          const newUser = {
            uid: 'local_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            displayName: name,
            email: email,
            password: password,
            createdAt: new Date().toISOString()
          };

          localUsers.push(newUser);
          saveLocalUsers(localUsers);

          const userObj = {
            uid: newUser.uid,
            displayName: newUser.displayName,
            email: newUser.email,
            isLocal: true
          };

          localStorage.setItem('nasiya_local_session', JSON.stringify(userObj));
          updateAuthUI(userObj);
          showToast("Muvaffaqiyatli ro'yxatdan o'tdingiz!", 'success');
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Ro'yxatdan o'tish</span> ➔`;
          return;
        }

        setAuthAlert(getUzbekAuthError(err.code, err.message));
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Ro'yxatdan o'tish</span> ➔`;
        return;
      }
    } else {
      // Lokal saqlash
      const localUsers = getLocalUsers();
      if (localUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        setAuthAlert("Bu email manzili allaqachon ro'yxatdan o'tgan.");
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Ro'yxatdan o'tish</span> ➔`;
        return;
      }

      const newUser = {
        uid: 'local_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        displayName: name,
        email: email,
        password: password,
        createdAt: new Date().toISOString()
      };

      localUsers.push(newUser);
      saveLocalUsers(localUsers);

      const userObj = {
        uid: newUser.uid,
        displayName: newUser.displayName,
        email: newUser.email,
        isLocal: true
      };

      localStorage.setItem('nasiya_local_session', JSON.stringify(userObj));
      updateAuthUI(userObj);
      showToast("Muvaffaqiyatli ro'yxatdan o'tdingiz!", 'success');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Ro'yxatdan o'tish</span> ➔`;
    }
  };
}

// 4. Google orqali kirish
const googleLoginBtn = $('#googleLoginBtn');
if (googleLoginBtn) {
  googleLoginBtn.onclick = async () => {
    setAuthAlert(null);
    if (typeof auth !== 'undefined' && auth && typeof firebase !== 'undefined') {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        showToast("Google orqali muvaffaqiyatli kirildi!", 'success');
      } catch (err) {
        console.warn("Google sign-in error:", err);
        setAuthAlert(getUzbekAuthError(err.code, err.message));
      }
    } else {
      setAuthAlert("Firebase Auth xizmati ulanmagan. Iltimos, Demo yoki email orqali kiring.");
    }
  };
}

// 5. Mehmon / Demo rejimida kirish
const demoLoginBtn = $('#demoLoginBtn');
if (demoLoginBtn) {
  demoLoginBtn.onclick = () => {
    const demoUser = {
      uid: DEMO_USER_ID,
      displayName: "Mehmon Foydalanuvchi",
      email: "mehmon@nasiya.uz",
      isDemo: true
    };
    localStorage.setItem('nasiya_demo_session', JSON.stringify(demoUser));
    updateAuthUI(demoUser);
    showToast("Demo rejimida kirildi! Barcha imkoniyatlarni sinab ko'rishingiz mumkin.", 'info');

    // Agar demo foydalanuvchida qarzlar bo'lmasa, namunaviy qarzlar kiritamiz
    const demoDebtsKey = `nasiya_debts_${DEMO_USER_ID}`;
    if (!localStorage.getItem(demoDebtsKey)) {
      const sampleDebts = [
        {
          id: 'demo_1',
          name: "Jasur Rahimov",
          phone: "+998 90 123 45 67",
          amount: 2500000,
          startDate: "2024-10-01",
          dueDate: "2024-10-15",
          note: "Samsung smart televizor uchun",
          payments: [
            { id: 'p1', amount: 1000000, date: "2024-10-10", note: "Plastik kartadan" }
          ],
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo_2',
          name: "Dilshod Karimov",
          phone: "+998 94 987 65 43",
          amount: 800000,
          startDate: "2024-10-05",
          dueDate: "2024-11-01",
          note: "Oshxona buyumlari",
          payments: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo_3',
          name: "Malika Karimova",
          phone: "+998 97 555 44 33",
          amount: 1500000,
          startDate: "2024-09-15",
          dueDate: "2024-10-05",
          note: "Kiyim-kechak do'konidan",
          payments: [
            { id: 'p2', amount: 1500000, date: "2024-10-04", note: "Naqd to'liq to'landi" }
          ],
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem(demoDebtsKey, JSON.stringify(sampleDebts));
      debts = sampleDebts;
      render();
    }
  };
}

// 6. Tizimdan chiqish (Logout)
const logoutBtn = $('#logoutBtn');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    localStorage.removeItem('nasiya_demo_session');
    localStorage.removeItem('nasiya_local_session');

    if (typeof auth !== 'undefined' && auth && auth.currentUser) {
      try {
        await auth.signOut();
      } catch (err) {
        console.warn("SignOut error:", err);
      }
    }

    updateAuthUI(null);
    showToast("Tizimdan muvaffaqiyatli chiqildi.", 'info');
  };
}

// 7. Parolni tiklash (Forgot Password)
const forgotPasswordBtn = $('#forgotPasswordBtn');
const resetPasswordModalBackdrop = $('#resetPasswordModalBackdrop');
const closeResetModalBtn = $('#closeResetModalBtn');
const cancelResetModalBtn = $('#cancelResetModalBtn');
const resetPasswordForm = $('#resetPasswordForm');

if (forgotPasswordBtn && resetPasswordModalBackdrop) {
  forgotPasswordBtn.onclick = () => {
    resetPasswordModalBackdrop.classList.add('active');
  };
}

if (closeResetModalBtn && resetPasswordModalBackdrop) {
  closeResetModalBtn.onclick = () => resetPasswordModalBackdrop.classList.remove('active');
}

if (cancelResetModalBtn && resetPasswordModalBackdrop) {
  cancelResetModalBtn.onclick = () => resetPasswordModalBackdrop.classList.remove('active');
}

if (resetPasswordForm) {
  resetPasswordForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#resetEmailInput').value.trim();
    if (!email) return;

    if (typeof auth !== 'undefined' && auth) {
      try {
        await auth.sendPasswordResetEmail(email);
        resetPasswordModalBackdrop.classList.remove('active');
        showToast("Parolni tiklash havolasi emailingizga yuborildi!", 'success');
        resetPasswordForm.reset();
      } catch (err) {
        showToast(getUzbekAuthError(err.code, err.message), 'error');
      }
    } else {
      showToast("Lokal rejimda parolni administrator orqali yangilang.", 'info');
      resetPasswordModalBackdrop.classList.remove('active');
    }
  };
}

// ==================== MA'LUMOTLARNI SAQLASH VA YUKLASH ====================

function getDebtsStorageKey(uid) {
  return `nasiya_debts_${uid}`;
}

// Foydalanuvchining qarzlarini yuklash
function loadDebtsForUser(uid) {
  const localKey = getDebtsStorageKey(uid);
  try {
    const cached = localStorage.getItem(localKey);
    debts = cached ? JSON.parse(cached) : [];
  } catch {
    debts = [];
  }
  render();

  // Agar Firestore mavjud va internet ulangan bo'lsa, sinxronizatsiya qilamiz
  if (typeof db !== 'undefined' && db && !currentUser?.isDemo && !currentUser?.isLocal) {
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }

    try {
      unsubscribeFirestore = db.collection('users').doc(uid).collection('debts')
        .onSnapshot((snapshot) => {
          const remoteList = [];
          snapshot.forEach((doc) => {
            remoteList.push({ id: doc.id, ...doc.data() });
          });

          // Yangilangan ro'yxatni saqlash
          if (remoteList.length > 0 || debts.length === 0) {
            debts = remoteList;
            localStorage.setItem(localKey, JSON.stringify(debts));
            render();
          }
        }, (err) => {
          console.warn("Firestore access info:", err.message);
          // Oflayn yoki ruxsat yo'q bo'lsa lokal ma'lumotlar bilan ishlash davom etadi
        });
    } catch (e) {
      console.warn("Firestore subscription error:", e);
    }
  }
}

// Qarzni saqlash (Firestore + LocalStorage)
async function persistDebt(debtItem) {
  if (!currentUser) return;
  const localKey = getDebtsStorageKey(currentUser.uid);
  localStorage.setItem(localKey, JSON.stringify(debts));

  if (typeof db !== 'undefined' && db && !currentUser.isDemo && !currentUser.isLocal) {
    try {
      await db.collection('users').doc(currentUser.uid).collection('debts').doc(debtItem.id).set(debtItem);
    } catch (err) {
      console.warn("Firestore sync write failed, saved locally:", err.message);
    }
  }
}

// Qarzni o'chirish (Firestore + LocalStorage)
async function deleteDebtFromStorage(debtId) {
  if (!currentUser) return;
  const localKey = getDebtsStorageKey(currentUser.uid);
  debts = debts.filter((d) => d.id !== debtId);
  localStorage.setItem(localKey, JSON.stringify(debts));

  if (typeof db !== 'undefined' && db && !currentUser.isDemo && !currentUser.isLocal) {
    try {
      await db.collection('users').doc(currentUser.uid).collection('debts').doc(debtId).delete();
    } catch (err) {
      console.warn("Firestore delete failed:", err.message);
    }
  }
}

// ==================== MATEMATIK HISOBLASHLAR VA STATUS ====================

// Bitta qarz bo'yicha jami to'langan summa
const getPaidAmount = (debt) => {
  if (!debt.payments || !Array.isArray(debt.payments)) return 0;
  return debt.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
};

// Qolgan qarz summasi
const getRemainingAmount = (debt) => {
  return Math.max(0, Number(debt.amount || 0) - getPaidAmount(debt));
};

// Qarz holati (paid, partial, unpaid)
const getDebtStatus = (debt) => {
  const paid = getPaidAmount(debt);
  const total = Number(debt.amount || 0);
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
};

// Muddati o'tganmi?
const isDebtOverdue = (debt) => {
  if (getDebtStatus(debt) === 'paid') return false;
  if (!debt.dueDate) return false;
  return debt.dueDate < getTodayDate();
};

// ==================== RENDER QILISH (VIZUAL CHIZISH) ====================

function render() {
  renderStats();
  renderCustomerGrid();
}

// Moliyaviy KPI statistikasini chizish
function renderStats() {
  const totalDebt = debts.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalPaid = debts.reduce((sum, d) => sum + getPaidAmount(d), 0);
  const totalRemaining = totalDebt - totalPaid;

  // Unikal mijozlar soni (telefon yoki ism bo'yicha)
  const uniquePhones = new Set(debts.map((d) => d.phone?.trim()).filter(Boolean));
  const customerCount = uniquePhones.size || debts.length;

  const statTotalDebt = $('#statTotalDebt');
  const statTotalPaid = $('#statTotalPaid');
  const statTotalRemaining = $('#statTotalRemaining');
  const statCustomerCount = $('#statCustomerCount');

  if (statTotalDebt) statTotalDebt.textContent = formatMoney(totalDebt);
  if (statTotalPaid) statTotalPaid.textContent = formatMoney(totalPaid);
  if (statTotalRemaining) statTotalRemaining.textContent = formatMoney(totalRemaining);
  if (statCustomerCount) statCustomerCount.textContent = `${customerCount} ta`;

  // Muddati o'tganlar banneri
  const overdueCount = debts.filter(isDebtOverdue).length;
  const alertBanner = $('#overdueAlertBanner');
  const alertText = $('#overdueAlertText');

  if (alertBanner && alertText) {
    if (overdueCount > 0) {
      alertBanner.style.display = 'flex';
      alertText.textContent = `Diqqat! Sizda ${overdueCount} ta muddati o'tgan qarz mavjud!`;
    } else {
      alertBanner.style.display = 'none';
    }
  }
}

// Mijozlar kartalarini chizish
function renderCustomerGrid() {
  const grid = $('#customerGrid');
  if (!grid) return;

  const query = searchQuery.toLowerCase().trim();

  // Filtrlash
  const filtered = debts.filter((d) => {
    // Qidiruv mosligi
    const matchQuery = !query ||
      (d.name && d.name.toLowerCase().includes(query)) ||
      (d.phone && d.phone.includes(query)) ||
      (d.note && d.note.toLowerCase().includes(query));

    if (!matchQuery) return false;

    // Filter chip mosligi
    if (currentFilter === 'all') return true;
    if (currentFilter === 'overdue') return isDebtOverdue(d);
    return getDebtStatus(d) === currentFilter;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h3 style="margin: 0 0 6px; font-size: 17px; font-weight: 700;">Hozircha qarzlar mavjud emas</h3>
        <p style="margin: 0; font-size: 13.5px;">"+ Yangi Qarz" tugmasi orqali yangi mijoz qarzini yozib boring.</p>
      </div>
    `;
    return;
  }

  // Tartiblash (muddati o'tganlar oldin, so'ngra yangilari)
  filtered.sort((a, b) => {
    const aOverdue = isDebtOverdue(a);
    const bOverdue = isDebtOverdue(b);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  grid.innerHTML = filtered.map((d) => {
    const paid = getPaidAmount(d);
    const remaining = getRemainingAmount(d);
    const status = getDebtStatus(d);
    const overdue = isDebtOverdue(d);
    const pct = Math.min(100, Math.round((paid / (d.amount || 1)) * 100));

    // Status nishoni
    let badgeHtml = '';
    if (overdue) {
      badgeHtml = `<span class="badge overdue">🚨 Muddati o'tgan</span>`;
    } else if (status === 'paid') {
      badgeHtml = `<span class="badge paid">🟢 To'liq to'langan</span>`;
    } else if (status === 'partial') {
      badgeHtml = `<span class="badge partial">🟡 Qisman: ${pct}%</span>`;
    } else {
      badgeHtml = `<span class="badge unpaid">🔴 To'lanmagan</span>`;
    }

    const cleanPhone = (d.phone || '').replace(/\s+/g, '');

    return `
      <div class="customer-card" data-id="${d.id}">
        <div class="card-top">
          <div class="card-customer-info">
            <h3 class="customer-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</h3>
            <p class="customer-phone">
              <span>📞</span>
              <a href="tel:${cleanPhone}">${escapeHtml(d.phone || "Telefon yo'q")}</a>
            </p>
          </div>
          <div>${badgeHtml}</div>
        </div>

        <!-- 3-ustunli summalar -->
        <div class="card-amounts">
          <div>
            <div class="amount-col-title">Jami Nasiya</div>
            <div class="amount-col-val total">${formatMoney(d.amount)}</div>
          </div>
          <div>
            <div class="amount-col-title">To'langan</div>
            <div class="amount-col-val paid">${formatMoney(paid)}</div>
          </div>
          <div>
            <div class="amount-col-title">Qolgan Qarz</div>
            <div class="amount-col-val remaining">${formatMoney(remaining)}</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="card-progress-wrap">
          <div class="progress-labels">
            <span>To'lov foizi</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%;"></div>
          </div>
        </div>

        <!-- Sanalar va Izoh -->
        <div class="card-meta">
          <div class="meta-row">
            <span>📅 Berilgan: <b>${d.startDate || '—'}</b></span>
            <span>⏳ Qaytarish: <b style="${overdue ? 'color: var(--bad);' : ''}">${d.dueDate || '—'}</b></span>
          </div>
          ${d.note ? `<div class="meta-note">💬 ${escapeHtml(d.note)}</div>` : ''}
        </div>

        <!-- Amal tugmalari -->
        <div class="card-actions">
          ${status !== 'paid' ? `
            <button class="btn-card-pay" data-action="pay" data-id="${d.id}" title="To'lov qo'shish">
              💰 To'lov
            </button>
          ` : ''}
          <button class="btn-card-edit" data-action="edit" data-id="${d.id}" title="Tahrirlash">
            ✏️ Tahrir
          </button>
          <button class="btn-card-hist" data-action="history" data-id="${d.id}" title="To'lovlar tarixi">
            📜 Tarix (${(d.payments && d.payments.length) || 0})
          </button>
          ${remaining > 0 ? `
            <button class="btn-card-remind" data-action="remind" data-id="${d.id}" title="Eslatma yuborish">
              📲 Eslatma
            </button>
          ` : ''}
          <button class="btn-card-del" data-action="delete" data-id="${d.id}" title="O'chirish">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== QARZ QO'SHISH VA TAHRIRLASH MODALI ====================
const customerModalBackdrop = $('#customerModalBackdrop');
const customerForm = $('#customerForm');
const openAddModalBtn = $('#openAddModalBtn');
const fabAddBtn = $('#fabAddBtn');
const closeCustomerModalBtn = $('#closeCustomerModalBtn');
const cancelCustomerModalBtn = $('#cancelCustomerModalBtn');
const modalTitle = $('#modalTitle');

function openCustomerModal(debtToEdit = null) {
  if (!customerModalBackdrop || !customerForm) return;

  customerForm.reset();

  if (debtToEdit) {
    if (modalTitle) modalTitle.textContent = "Qarzni Tahrirlash";
    $('#customerId').value = debtToEdit.id;
    $('#inputName').value = debtToEdit.name || '';
    $('#inputPhone').value = debtToEdit.phone || '+998 ';
    $('#inputDebt').value = debtToEdit.amount || '';
    $('#inputStartDate').value = debtToEdit.startDate || getTodayDate();
    $('#inputDueDate').value = debtToEdit.dueDate || '';
    $('#inputNote').value = debtToEdit.note || '';
  } else {
    if (modalTitle) modalTitle.textContent = "Yangi Qarz Yozish";
    $('#customerId').value = '';
    $('#inputPhone').value = '+998 ';
    $('#inputStartDate').value = getTodayDate();
    
    // Qaytarish muddatini standart 1 oy keyinga qo'yish
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    $('#inputDueDate').value = nextMonth.toISOString().slice(0, 10);
  }

  customerModalBackdrop.classList.add('active');
}

function closeCustomerModal() {
  if (customerModalBackdrop) customerModalBackdrop.classList.remove('active');
}

if (openAddModalBtn) openAddModalBtn.onclick = () => openCustomerModal();
if (fabAddBtn) fabAddBtn.onclick = () => openCustomerModal();
if (closeCustomerModalBtn) closeCustomerModalBtn.onclick = closeCustomerModal;
if (cancelCustomerModalBtn) cancelCustomerModalBtn.onclick = closeCustomerModal;

// Formani saqlash
if (customerForm) {
  customerForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast("Iltimos, avval tizimga kiring!", 'error');
      return;
    }

    const editId = $('#customerId').value;
    const name = $('#inputName').value.trim();
    const phone = $('#inputPhone').value.trim();
    const amount = Number($('#inputDebt').value);
    const startDate = $('#inputStartDate').value;
    const dueDate = $('#inputDueDate').value;
    const note = $('#inputNote').value.trim();

    if (!name || !amount || !startDate || !dueDate) {
      showToast("Iltimos, barcha majburiy maydonlarni to'ldiring!", 'error');
      return;
    }

    if (editId) {
      // Mavjud qarzni tahrirlash
      const index = debts.findIndex((d) => d.id === editId);
      if (index !== -1) {
        debts[index] = {
          ...debts[index],
          name,
          phone,
          amount,
          startDate,
          dueDate,
          note,
          updatedAt: new Date().toISOString()
        };
        await persistDebt(debts[index]);
        showToast("Mijoz qarzi muvaffaqiyatli yangilandi!", 'success');
      }
    } else {
      // Yangi qarz qo'shish
      const newDebt = {
        id: 'debt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name,
        phone,
        amount,
        startDate,
        dueDate,
        note,
        payments: [],
        createdAt: new Date().toISOString()
      };
      debts.unshift(newDebt);
      await persistDebt(newDebt);
      showToast("Yangi qarz muvaffaqiyatli saqlandi!", 'success');
    }

    closeCustomerModal();
    render();
  };
}

// ==================== TO'LOV QO'SHISH MODALI ====================
const paymentModalBackdrop = $('#paymentModalBackdrop');
const paymentForm = $('#paymentForm');
const closePaymentModalBtn = $('#closePaymentModalBtn');
const cancelPaymentModalBtn = $('#cancelPaymentModalBtn');
const paymentCustomerDetails = $('#paymentCustomerDetails');
const paymentHistoryList = $('#paymentHistoryList');

function openPaymentModal(debt) {
  if (!paymentModalBackdrop || !debt) return;
  currentPaymentDebt = debt;

  const paid = getPaidAmount(debt);
  const remaining = getRemainingAmount(debt);

  if (paymentCustomerDetails) {
    paymentCustomerDetails.innerHTML = `
      <div style="background: var(--bg); padding: 12px; border-radius: 12px; border: 1px solid var(--bd);">
        <div style="font-weight: 800; font-size: 15px; margin-bottom: 4px;">${escapeHtml(debt.name)}</div>
        <div style="font-size: 13px; color: var(--mut);">
          Jami qarz: <b>${formatMoney(debt.amount)}</b> | Qolgan: <b style="color: var(--bad);">${formatMoney(remaining)}</b>
        </div>
      </div>
    `;
  }

  $('#paymentCustomerId').value = debt.id;
  $('#paymentAmount').value = remaining > 0 ? remaining : '';
  $('#paymentAmount').max = remaining;
  $('#paymentDate').value = getTodayDate();
  $('#paymentNote').value = '';

  renderPaymentHistory(debt);
  paymentModalBackdrop.classList.add('active');
}

function closePaymentModal() {
  if (paymentModalBackdrop) paymentModalBackdrop.classList.remove('active');
  currentPaymentDebt = null;
}

function renderPaymentHistory(debt) {
  if (!paymentHistoryList) return;
  const list = debt.payments || [];
  if (list.length === 0) {
    paymentHistoryList.innerHTML = `<div style="color: var(--mut); padding: 12px; text-align: center; font-size: 13px;">Hali hech qanday to'lov amalga oshirilmagan.</div>`;
    return;
  }

  paymentHistoryList.innerHTML = list.map((p) => `
    <div class="history-item">
      <div>
        <div class="history-date">📅 ${p.date || '—'}</div>
        ${p.note ? `<div style="font-size: 12px; color: var(--mut); margin-top: 2px;">💬 ${escapeHtml(p.note)}</div>` : ''}
      </div>
      <div class="history-amount">+${formatMoney(p.amount)}</div>
    </div>
  `).join('');
}

if (closePaymentModalBtn) closePaymentModalBtn.onclick = closePaymentModal;
if (cancelPaymentModalBtn) cancelPaymentModalBtn.onclick = closePaymentModal;

if (paymentForm) {
  paymentForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentPaymentDebt) return;

    const amount = Number($('#paymentAmount').value);
    const date = $('#paymentDate').value;
    const note = $('#paymentNote').value.trim();

    if (!amount || amount <= 0 || !date) {
      showToast("To'lov summasi va sanasini to'g'ri kiriting!", 'error');
      return;
    }

    const remaining = getRemainingAmount(currentPaymentDebt);
    if (amount > remaining) {
      showToast(`To'lov summasi qolgan qarzdan (${formatMoney(remaining)}) ko'p bo'lishi mumkin emas!`, 'error');
      return;
    }

    if (!currentPaymentDebt.payments) {
      currentPaymentDebt.payments = [];
    }

    const paymentRecord = {
      id: 'pay_' + Date.now().toString(36),
      amount,
      date,
      note,
      createdAt: new Date().toISOString()
    };

    currentPaymentDebt.payments.unshift(paymentRecord);
    await persistDebt(currentPaymentDebt);

    showToast(`Muvaffaqiyatli to'landi: ${formatMoney(amount)}`, 'success');
    closePaymentModal();
    render();
  };
}

// ==================== O'CHIRISHNI TASDIQLASH MODALI ====================
const deleteModalBackdrop = $('#deleteModalBackdrop');
const closeDeleteModalBtn = $('#closeDeleteModalBtn');
const cancelDeleteBtn = $('#cancelDeleteBtn');
const confirmDeleteBtn = $('#confirmDeleteBtn');
const deleteConfirmText = $('#deleteConfirmText');

function openDeleteModal(debt) {
  if (!deleteModalBackdrop || !debt) return;
  currentDeleteDebtId = debt.id;
  if (deleteConfirmText) {
    deleteConfirmText.textContent = `Rostdan ham "${debt.name}" mijozining qarz yozuvini butunlay o'chirmoqchimisiz?`;
  }
  deleteModalBackdrop.classList.add('active');
}

function closeDeleteModal() {
  if (deleteModalBackdrop) deleteModalBackdrop.classList.remove('active');
  currentDeleteDebtId = null;
}

if (closeDeleteModalBtn) closeDeleteModalBtn.onclick = closeDeleteModal;
if (cancelDeleteBtn) cancelDeleteBtn.onclick = closeDeleteModal;

if (confirmDeleteBtn) {
  confirmDeleteBtn.onclick = async () => {
    if (!currentDeleteDebtId) return;
    await deleteDebtFromStorage(currentDeleteDebtId);
    showToast("Qarz yozuvi muvaffaqiyatli o'chirildi.", 'info');
    closeDeleteModal();
    render();
  };
}

// ==================== SMS / TELEGRAM ESLATMA MODALI ====================
const reminderModalBackdrop = $('#reminderModalBackdrop');
const closeReminderModalBtn = $('#closeReminderModalBtn');
const reminderMessageText = $('#reminderMessageText');
const copyReminderBtn = $('#copyReminderBtn');
const sendTelegramBtn = $('#sendTelegramBtn');
const sendSmsBtn = $('#sendSmsBtn');

function openReminderModal(debt) {
  if (!reminderModalBackdrop || !debt) return;
  currentReminderDebt = debt;

  const remaining = getRemainingAmount(debt);
  const msg = `Assalomu alaykum ${debt.name}! Nasiya Daftari orqali eslatma: sizning ${formatMoney(remaining)} miqdoridagi qarzingizni qaytarish muddati ${debt.dueDate || 'belgilangan sana'}da edi. Iltimos, hisob-kitobni amalga oshirishingizni so'raymiz. Rahmat!`;

  if (reminderMessageText) reminderMessageText.value = msg;
  reminderModalBackdrop.classList.add('active');
}

function closeReminderModal() {
  if (reminderModalBackdrop) reminderModalBackdrop.classList.remove('active');
  currentReminderDebt = null;
}

if (closeReminderModalBtn) closeReminderModalBtn.onclick = closeReminderModal;

if (copyReminderBtn) {
  copyReminderBtn.onclick = async () => {
    const text = reminderMessageText?.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Eslatma matni nusxalandi!", 'success');
    } catch {
      reminderMessageText.select();
      document.execCommand('copy');
      showToast("Eslatma matni nusxalandi!", 'success');
    }
  };
}

if (sendTelegramBtn) {
  sendTelegramBtn.onclick = () => {
    const text = encodeURIComponent(reminderMessageText?.value || '');
    window.open(`https://t.me/share/url?url=&text=${text}`, '_blank');
  };
}

if (sendSmsBtn) {
  sendSmsBtn.onclick = () => {
    if (!currentReminderDebt) return;
    const cleanPhone = (currentReminderDebt.phone || '').replace(/\s+/g, '');
    const text = encodeURIComponent(reminderMessageText?.value || '');
    window.location.href = `sms:${cleanPhone}?body=${text}`;
  };
}

// ==================== EVENT DELEGATION (KARTA BOSILGANDA) ====================
const customerGrid = $('#customerGrid');
if (customerGrid) {
  customerGrid.onclick = (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const debt = debts.find((d) => d.id === id);
    if (!debt) return;

    if (action === 'pay') {
      openPaymentModal(debt);
    } else if (action === 'edit') {
      openCustomerModal(debt);
    } else if (action === 'history') {
      openPaymentModal(debt);
    } else if (action === 'remind') {
      openReminderModal(debt);
    } else if (action === 'delete') {
      openDeleteModal(debt);
    }
  };
}

// ==================== QIDIRUV VA FILTRLAR ====================
const searchInput = $('#searchInput');
if (searchInput) {
  searchInput.oninput = (e) => {
    searchQuery = e.target.value;
    renderCustomerGrid();
  };
}

const filterChips = $$('.filter-chip');
filterChips.forEach((chip) => {
  chip.onclick = () => {
    filterChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter || 'all';
    renderCustomerGrid();
  };
});

// Muddati o'tganlarni ko'rish tugmasi (Bannerdagi)
const filterOverdueBtn = $('#filterOverdueBtn');
if (filterOverdueBtn) {
  filterOverdueBtn.onclick = () => {
    const overdueChip = document.querySelector('.filter-chip[data-filter="overdue"]');
    if (overdueChip) overdueChip.click();
  };
}

// ==================== CSV EKSPORT VA ZAXIRA / TIKLASH ====================

// CSV yuklab olish (Excel uchun UTF-8 BOM bilan)
const exportCsvBtn = $('#exportCsvBtn');
if (exportCsvBtn) {
  exportCsvBtn.onclick = () => {
    if (!debts.length) {
      showToast("Eksport qilish uchun qarzlar mavjud emas.", 'error');
      return;
    }

    const headers = ["F.I.Sh", "Telefon", "Jami Qarz", "To'langan", "Qolgan", "Berilgan Sana", "Qaytarish Muddati", "Holati", "Izoh"];
    const rows = debts.map((d) => {
      const paid = getPaidAmount(d);
      const remaining = getRemainingAmount(d);
      const status = isDebtOverdue(d) ? "Muddati o'tgan" : getDebtStatus(d) === 'paid' ? "To'liq to'langan" : getDebtStatus(d) === 'partial' ? "Qisman" : "To'lanmagan";

      return [
        d.name,
        d.phone,
        d.amount,
        paid,
        remaining,
        d.startDate,
        d.dueDate,
        status,
        d.note
      ].map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = '\ufeff' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nasiya_daftari_${getTodayDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("CSV fayl muvaffaqiyatli yuklab olindi!", 'success');
  };
}

// JSON zaxira fayl
const backupJsonBtn = $('#backupJsonBtn');
if (backupJsonBtn) {
  backupJsonBtn.onclick = () => {
    if (!debts.length) {
      showToast("Zaxiralash uchun qarzlar mavjud emas.", 'error');
      return;
    }
    const dataStr = JSON.stringify(debts, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nasiya_zaxira_${getTodayDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Zaxira nusxasi yuklandi!", 'success');
  };
}

// JSON zaxiradan tiklash
const restoreJsonBtn = $('#restoreJsonBtn');
const restoreFileInput = $('#restoreFileInput');

if (restoreJsonBtn && restoreFileInput) {
  restoreJsonBtn.onclick = () => restoreFileInput.click();

  restoreFileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!Array.isArray(imported)) {
        throw new Error("Fayl formati noto'g'ri (Massiv bo'lishi kerak)");
      }

      debts = imported;
      if (currentUser) {
        localStorage.setItem(getDebtsStorageKey(currentUser.uid), JSON.stringify(debts));
        // Har birini Firestorega ham sinxronlash
        for (const item of debts) {
          await persistDebt(item);
        }
      }

      render();
      showToast("Ma'lumotlar muvaffaqiyatli tiklandi!", 'success');
    } catch (err) {
      showToast("Xatolik: Fayl noto'g'ri formatda!", 'error');
    }
    restoreFileInput.value = '';
  };
}

// ==================== MAVZU (DARK / LIGHT THEME) ====================
const themeToggleBtn = $('#themeToggleBtn');

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    document.body.classList.add('dark');
    if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
  } else {
    document.documentElement.dataset.theme = 'light';
    document.body.classList.remove('dark');
    if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
  }
  localStorage.setItem('nasiya_theme', theme);
}

if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    const currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };
}

// Dastlabki mavzuni o'rnatish
const savedTheme = localStorage.getItem('nasiya_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

// Dastlabki render
render();
