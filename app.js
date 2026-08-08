/* Nasiya Daftari - Main Application Logic (Firebase Firestore bilan) */

class NasiyaApp {
  constructor() {
    this.customers = [];
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.editingCustomerId = null;
    this.deletingCustomerId = null;
    this.payingCustomerId = null;

    this.initElements();
    this.initEventListeners();
    this.initFirestoreListener();
  }

  // Firestore bilan real vaqtda sinxronlash
  initFirestoreListener() {
    db.collection('customers').orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        this.customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this.render();
      }, (error) => {
        console.error('Firestore xatolik:', error);
        this.showToast("Ma'lumotlarni yuklashda xatolik yuz berdi. Internetni tekshiring!", 'error');
      });
  }

  initElements() {
    this.gridEl = document.getElementById('customerGrid');
    this.searchInput = document.getElementById('searchInput');
    this.filterChips = document.querySelectorAll('.filter-chip');
    
    // Stats elements
    this.statTotalDebt = document.getElementById('statTotalDebt');
    this.statTotalPaid = document.getElementById('statTotalPaid');
    this.statTotalRemaining = document.getElementById('statTotalRemaining');
    this.statCustomerCount = document.getElementById('statCustomerCount');
    this.alertBanner = document.getElementById('overdueAlertBanner');
    this.alertText = document.getElementById('overdueAlertText');

    // Customer Modal
    this.customerModal = document.getElementById('customerModalBackdrop');
    this.customerForm = document.getElementById('customerForm');
    this.modalTitle = document.getElementById('modalTitle');
    this.inputName = document.getElementById('inputName');
    this.inputPhone = document.getElementById('inputPhone');
    this.inputDebt = document.getElementById('inputDebt');
    this.inputStartDate = document.getElementById('inputStartDate');
    this.inputDueDate = document.getElementById('inputDueDate');
    this.inputNote = document.getElementById('inputNote');
    this.customerIdInput = document.getElementById('customerId');

    // Payment Modal
    this.paymentModal = document.getElementById('paymentModalBackdrop');
    this.paymentForm = document.getElementById('paymentForm');
    this.paymentCustomerId = document.getElementById('paymentCustomerId');
    this.paymentAmount = document.getElementById('paymentAmount');
    this.paymentDate = document.getElementById('paymentDate');
    this.paymentNote = document.getElementById('paymentNote');
    this.paymentCustomerDetails = document.getElementById('paymentCustomerDetails');
    this.paymentHistoryList = document.getElementById('paymentHistoryList');

    // Delete Modal
    this.deleteModal = document.getElementById('deleteModalBackdrop');
    this.deleteConfirmText = document.getElementById('deleteConfirmText');

    // Buttons
    this.openAddModalBtn = document.getElementById('openAddModalBtn');
    this.fabAddBtn = document.getElementById('fabAddBtn');
    this.closeCustomerModalBtn = document.getElementById('closeCustomerModalBtn');
    this.cancelCustomerModalBtn = document.getElementById('cancelCustomerModalBtn');
    this.closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
    this.cancelPaymentModalBtn = document.getElementById('cancelPaymentModalBtn');
    this.closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
    this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    this.exportCsvBtn = document.getElementById('exportCsvBtn');
    this.backupJsonBtn = document.getElementById('backupJsonBtn');
    this.restoreJsonBtn = document.getElementById('restoreJsonBtn');
    this.restoreFileInput = document.getElementById('restoreFileInput');
    this.toastContainer = document.getElementById('toastContainer');
    this.filterOverdueBtn = document.getElementById('filterOverdueBtn');
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
  }

  initEventListeners() {
    // Theme toggle
    this.themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.body.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.body.setAttribute('data-theme', newTheme);
      this.themeToggleBtn.textContent = newTheme === 'light' ? '☀️' : '🌙';
    });

    // Search
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderGrid();
    });

    // Filters
    this.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilter = chip.getAttribute('data-filter');
        this.renderGrid();
      });
    });

    this.filterOverdueBtn.addEventListener('click', () => {
      this.filterChips.forEach(c => c.classList.remove('active'));
      const overdueChip = document.querySelector('.filter-chip[data-filter="overdue"]');
      if (overdueChip) overdueChip.classList.add('active');
      this.activeFilter = 'overdue';
      this.renderGrid();
    });

    // Open Add Modal
    const openAdd = () => {
      this.editingCustomerId = null;
      this.modalTitle.textContent = "Yangi Qarz Yozish";
      this.customerForm.reset();
      this.customerIdInput.value = '';
      this.inputPhone.value = '+998 ';
      const today = new Date().toISOString().split('T')[0];
      this.inputStartDate.value = today;
      this.inputDueDate.value = today;
      this.openModal(this.customerModal);
    };

    this.openAddModalBtn.addEventListener('click', openAdd);
    this.fabAddBtn.addEventListener('click', openAdd);

    // Customer Form Submit
    this.customerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveCustomerForm();
    });

    // Payment Form Submit
    this.paymentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePaymentForm();
    });

    // Close Modals
    this.closeCustomerModalBtn.addEventListener('click', () => this.closeModal(this.customerModal));
    this.cancelCustomerModalBtn.addEventListener('click', () => this.closeModal(this.customerModal));
    this.closePaymentModalBtn.addEventListener('click', () => this.closeModal(this.paymentModal));
    this.cancelPaymentModalBtn.addEventListener('click', () => this.closeModal(this.paymentModal));
    this.closeDeleteModalBtn.addEventListener('click', () => this.closeModal(this.deleteModal));
    this.cancelDeleteBtn.addEventListener('click', () => this.closeModal(this.deleteModal));

    // Confirm Delete
    this.confirmDeleteBtn.addEventListener('click', () => {
      if (this.deletingCustomerId) {
        db.collection('customers').doc(this.deletingCustomerId).delete()
          .then(() => {
            this.closeModal(this.deleteModal);
            this.showToast("Qarz yozuvi o'chirildi", 'info');
            this.deletingCustomerId = null;
          })
          .catch((err) => {
            console.error(err);
            this.showToast("O'chirishda xatolik yuz berdi!", 'error');
          });
      }
    });

    // Export CSV
    this.exportCsvBtn.addEventListener('click', () => this.exportToCsv());

    // Backup & Restore JSON
    if (this.backupJsonBtn) {
      this.backupJsonBtn.addEventListener('click', () => this.exportToJsonBackup());
    }
    if (this.restoreJsonBtn && this.restoreFileInput) {
      this.restoreJsonBtn.addEventListener('click', () => this.restoreFileInput.click());
      this.restoreFileInput.addEventListener('change', (e) => this.importFromJsonBackup(e));
    }
  }

  openModal(modal) {
    modal.classList.add('active');
  }

  closeModal(modal) {
    modal.classList.remove('active');
  }

  formatMoney(amount) {
    return amount.toLocaleString('uz-UZ') + " so'm";
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return dateStr;
  }

  getCustomerStatus(customer) {
    const remaining = customer.debtAmount - customer.paidAmount;
    if (remaining <= 0) {
      return { key: 'paid', label: "To'liq to'langan 🟢", class: 'status-paid' };
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (customer.dueDate < today) {
      return { key: 'overdue', label: "Muddati o'tgan 🚨", class: 'status-overdue' };
    }

    if (customer.paidAmount > 0) {
      return { key: 'partial', label: "Qisman to'langan 🟡", class: 'status-partial' };
    }

    return { key: 'unpaid', label: "To'lanmagan 🔴", class: 'status-unpaid' };
  }

  render() {
    this.renderStats();
    this.renderGrid();
  }

  renderStats() {
    let totalDebt = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let overdueCount = 0;

    const today = new Date().toISOString().split('T')[0];

    this.customers.forEach(c => {
      totalDebt += c.debtAmount;
      totalPaid += c.paidAmount;
      const rem = c.debtAmount - c.paidAmount;
      totalRemaining += Math.max(0, rem);

      if (rem > 0 && c.dueDate < today) {
        overdueCount++;
      }
    });

    this.statTotalDebt.textContent = this.formatMoney(totalDebt);
    this.statTotalPaid.textContent = this.formatMoney(totalPaid);
    this.statTotalRemaining.textContent = this.formatMoney(totalRemaining);
    this.statCustomerCount.textContent = this.customers.length + " ta";

    if (overdueCount > 0) {
      this.alertBanner.style.display = 'flex';
      this.alertText.textContent = `Diqqat! Sizda ${overdueCount} ta muddati o'tgan qarz bor!`;
    } else {
      this.alertBanner.style.display = 'none';
    }
  }

  renderGrid() {
    this.gridEl.innerHTML = '';

    const filtered = this.customers.filter(customer => {
      // Search check
      const matchesSearch = customer.name.toLowerCase().includes(this.searchQuery) ||
                            customer.phone.toLowerCase().includes(this.searchQuery);
      if (!matchesSearch) return false;

      // Filter check
      const status = this.getCustomerStatus(customer);
      if (this.activeFilter === 'all') return true;
      return status.key === this.activeFilter;
    });

    if (filtered.length === 0) {
      this.gridEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📭</div>
          <p>Hech qanday qarz yozuvi topilmadi</p>
        </div>
      `;
      return;
    }

    filtered.forEach(customer => {
      const remaining = customer.debtAmount - customer.paidAmount;
      const status = this.getCustomerStatus(customer);

      const card = document.createElement('div');
      card.className = 'customer-card';
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="customer-name">${customer.name}</div>
            <div class="customer-phone">📱 ${customer.phone}</div>
          </div>
          <span class="status-badge ${status.class}">${status.label}</span>
        </div>

        <div class="card-details">
          <div class="detail-item">
            <span>Nasiya summasi</span>
            <strong>${this.formatMoney(customer.debtAmount)}</strong>
          </div>
          <div class="detail-item">
            <span>Qolgan qarz</span>
            <strong style="color: ${remaining > 0 ? '#ef4444' : '#10b981'};">${this.formatMoney(Math.max(0, remaining))}</strong>
          </div>
          <div class="detail-item">
            <span>Berilgan sana</span>
            <span>${this.formatDate(customer.startDate)}</span>
          </div>
          <div class="detail-item">
            <span>Qaytarish muddati</span>
            <span style="font-weight: 600; color: ${status.key === 'overdue' ? '#ef4444' : 'inherit'}">${this.formatDate(customer.dueDate)}</span>
          </div>
          ${customer.note ? `<div class="note-text">📝 ${customer.note}</div>` : ''}
        </div>

        <div class="card-actions">
          <button class="btn btn-success pay-btn" data-id="${customer.id}">+ To'lov</button>
          <button class="btn btn-secondary sms-btn" data-id="${customer.id}" title="SMS eslatma">📱 SMS</button>
          <button class="btn btn-secondary tg-btn" data-id="${customer.id}" title="Telegram eslatma">✈️ TG</button>
          <button class="btn btn-secondary wa-btn" data-id="${customer.id}" title="WhatsApp eslatma">💬 WA</button>
          <button class="btn btn-secondary edit-btn" data-id="${customer.id}" title="Tahrirlash">✏️</button>
          <button class="btn btn-danger delete-btn" data-id="${customer.id}" title="O'chirish">🗑️</button>
        </div>
      `;

      // Add Event Listeners to Buttons
      card.querySelector('.pay-btn').addEventListener('click', () => this.openPaymentModal(customer.id));
      card.querySelector('.sms-btn').addEventListener('click', () => this.sendSmsReminder(customer));
      card.querySelector('.tg-btn').addEventListener('click', () => this.sendTelegramReminder(customer));
      card.querySelector('.wa-btn').addEventListener('click', () => this.sendWhatsAppReminder(customer));
      card.querySelector('.edit-btn').addEventListener('click', () => this.openEditCustomerModal(customer));
      card.querySelector('.delete-btn').addEventListener('click', () => this.openDeleteModal(customer));

      this.gridEl.appendChild(card);
    });
  }

  saveCustomerForm() {
    const id = this.customerIdInput.value;
    const name = this.inputName.value.trim();
    const phone = this.inputPhone.value.trim();
    const debtAmount = parseFloat(this.inputDebt.value);
    const startDate = this.inputStartDate.value;
    const dueDate = this.inputDueDate.value;
    const note = this.inputNote.value.trim();

    if (!name || !phone || isNaN(debtAmount) || !startDate || !dueDate) {
      alert("Iltimos, barcha majburiy maydonlarni to'ldiring!");
      return;
    }

    if (id) {
      // Edit existing
      db.collection('customers').doc(id).update({
        name, phone, debtAmount, startDate, dueDate, note
      }).then(() => {
        this.showToast("Mijoz qarzi yangilandi! ✨", 'success');
        this.closeModal(this.customerModal);
      }).catch((err) => {
        console.error(err);
        this.showToast("Yangilashda xatolik yuz berdi!", 'error');
      });
    } else {
      // Create new
      db.collection('customers').add({
        name,
        phone,
        debtAmount,
        paidAmount: 0,
        startDate,
        dueDate,
        note,
        payments: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        this.showToast("Yangi qarz yozuvi yaratildi! 📝", 'success');
        this.closeModal(this.customerModal);
      }).catch((err) => {
        console.error(err);
        this.showToast("Saqlashda xatolik yuz berdi!", 'error');
      });
    }
  }

  openEditCustomerModal(customer) {
    this.editingCustomerId = customer.id;
    this.modalTitle.textContent = "Qarzni Tahrirlash";
    this.customerIdInput.value = customer.id;
    this.inputName.value = customer.name;
    this.inputPhone.value = customer.phone;
    this.inputDebt.value = customer.debtAmount;
    this.inputStartDate.value = customer.startDate;
    this.inputDueDate.value = customer.dueDate;
    this.inputNote.value = customer.note || '';
    this.openModal(this.customerModal);
  }

  openPaymentModal(customerId) {
    const customer = this.customers.find(c => c.id === customerId);
    if (!customer) return;

    this.payingCustomerId = customer.id;
    this.paymentCustomerId.value = customer.id;
    this.paymentAmount.value = '';
    this.paymentDate.value = new Date().toISOString().split('T')[0];
    this.paymentNote.value = '';

    const remaining = customer.debtAmount - customer.paidAmount;
    this.paymentCustomerDetails.innerHTML = `
      <div style="background: var(--bg-card); padding: 12px; border-radius: 10px; border: 1px solid var(--border-color);">
        <div style="font-weight: 700; font-size: 1.05rem;">${customer.name}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 6px;">${customer.phone}</div>
        <div style="display: flex; justify-content: space-between;">
          <span>Qolgan qarz:</span>
          <strong style="color: #ef4444;">${this.formatMoney(Math.max(0, remaining))}</strong>
        </div>
      </div>
    `;

    // Render payment history
    this.renderPaymentHistory(customer);
    this.openModal(this.paymentModal);
  }

  renderPaymentHistory(customer) {
    this.paymentHistoryList.innerHTML = '';
    if (!customer.payments || customer.payments.length === 0) {
      this.paymentHistoryList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 10px;">Hali to'lovlar kiritilmagan</div>`;
      return;
    }

    customer.payments.forEach(p => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div>
          <strong style="color: #10b981;">+${this.formatMoney(p.amount)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${this.formatDate(p.date)} ${p.note ? '• ' + p.note : ''}</div>
        </div>
      `;
      this.paymentHistoryList.appendChild(item);
    });
  }

  savePaymentForm() {
    const customer = this.customers.find(c => c.id === this.payingCustomerId);
    if (!customer) return;

    const amount = parseFloat(this.paymentAmount.value);
    const date = this.paymentDate.value;
    const note = this.paymentNote.value.trim();

    if (isNaN(amount) || amount <= 0 || !date) {
      alert("Iltimos, to'g'ri to'lov summasini kiritib tanlang!");
      return;
    }

    const newPayment = {
      id: 'p_' + Date.now(),
      amount,
      date,
      note
    };

    db.collection('customers').doc(customer.id).update({
      payments: firebase.firestore.FieldValue.arrayUnion(newPayment),
      paidAmount: firebase.firestore.FieldValue.increment(amount)
    }).then(() => {
      this.showToast(`${this.formatMoney(amount)} to'lov kiritildi! 💵`, 'success');
      this.closeModal(this.paymentModal);
    }).catch((err) => {
      console.error(err);
      this.showToast("To'lovni saqlashda xatolik yuz berdi!", 'error');
    });
  }

  openDeleteModal(customer) {
    this.deletingCustomerId = customer.id;
    this.deleteConfirmText.textContent = `Rostdan ham "${customer.name}" mijozining qarz yozuvini o'chirmoqchimisiz?`;
    this.openModal(this.deleteModal);
  }

  generateReminderText(customer) {
    const remaining = customer.debtAmount - customer.paidAmount;
    const formattedAmount = this.formatMoney(Math.max(0, remaining));
    const dueDateFormatted = this.formatDate(customer.dueDate);

    return `Salom ${customer.name}. Sizning ${formattedAmount} miqdoridagi qarzingizni qaytarish muddati ${dueDateFormatted} kuni edi. Iltimos, to'lovni amalga oshirishingizni so'raymiz. Rahmat!`;
  }

  sendSmsReminder(customer) {
    const msg = this.generateReminderText(customer);
    const cleanPhone = customer.phone.replace(/[^0-9+]/g, '');
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(msg)}`;
    window.open(smsUrl, '_blank');
  }

  sendWhatsAppReminder(customer) {
    const msg = this.generateReminderText(customer);
    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  }

  sendTelegramReminder(customer) {
    const msg = this.generateReminderText(customer);
    const tgUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(msg)}`;
    window.open(tgUrl, '_blank');
    this.showToast(`"${customer.name}" ga Telegram eslatmasi tayyorlandi!`, 'info');
  }

  showToast(message, type = 'success') {
    if (!this.toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'info') icon = 'ℹ️';
    
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  exportToJsonBackup() {
    if (this.customers.length === 0) {
      this.showToast("Zaxiraga saqlash uchun ma'lumotlar yo'q!", 'error');
      return;
    }

    const dataObj = {
      app: "NasiyaDaftari",
      version: "3.0-firebase",
      exportedAt: new Date().toISOString(),
      customers: this.customers
    };

    const jsonStr = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Nasiya_Daftari_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("Zaxira fayli yuklab olindi! 💾", 'success');
  }

  importFromJsonBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        let importedCustomers = [];
        
        if (Array.isArray(parsed)) {
          importedCustomers = parsed;
        } else if (parsed && Array.isArray(parsed.customers)) {
          importedCustomers = parsed.customers;
        } else {
          throw new Error("Fayl formati noto'g'ri!");
        }

        if (importedCustomers.length === 0) {
          this.showToast("Faylda hech qanday qarz ma'lumotlari topilmadi!", 'error');
          return;
        }

        // Har bir mijozni Firestore'ga alohida qo'shamiz
        const batch = db.batch();
        importedCustomers.forEach(c => {
          const docRef = db.collection('customers').doc();
          const { id, ...data } = c;
          batch.set(docRef, {
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });

        batch.commit().then(() => {
          this.showToast(`${importedCustomers.length} ta nasiya yozuvi tiklandi! 📥`, 'success');
        }).catch((err) => {
          console.error(err);
          this.showToast("Tiklashda xatolik yuz berdi!", 'error');
        });
      } catch (err) {
        this.showToast("JSON faylni o'qishda xatolik yuz berdi!", 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  exportToCsv() {
    if (this.customers.length === 0) {
      this.showToast("Eksport qilish uchun ma'lumotlar yo'q!", 'error');
      return;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM for Uzbek characters in Excel
    csvContent += "Ismi;Telefon;Nasiya Summasi;To'langan Summa;Qolgan Qarz;Berilgan Sana;Qaytarish Muddati;Status;Izoh\n";

    this.customers.forEach(c => {
      const remaining = c.debtAmount - c.paidAmount;
      const status = this.getCustomerStatus(c).label;
      const row = [
        `"${c.name}"`,
        `"${c.phone}"`,
        c.debtAmount,
        c.paidAmount,
        Math.max(0, remaining),
        `"${this.formatDate(c.startDate)}"`,
        `"${this.formatDate(c.dueDate)}"`,
        `"${status}"`,
        `"${c.note || ''}"`
      ];
      csvContent += row.join(";") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Nasiya_Daftari_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("CSV eksport muvaffaqiyatli amalga oshirildi! 📊", 'success');
  }
}

// Initialize Application when DOM is Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new NasiyaApp();

  // Register Service Worker for PWA Offline Support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker muvaffaqiyatli ro\'yxatdan o\'tdi:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker ro\'yxatdan o\'tishda xatolik:', err);
        });
    });
  }
});
