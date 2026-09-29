// =========================================================
//  KITOB-AYLANMA — app.js (Firebase versiyasi)
//  Barcha ilova logikasi shu yerda: Auth, CRUD, filtr, modal
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---------------------------------------------------------
// 1) FIREBASE SOZLAMALARI
//    Bu yerga o'zingizning Firebase loyihangiz konfiguratsiyasini kiriting.
//    Firebase Console -> Project settings -> General -> "Your apps" bo'limidan olinadi.
// ---------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCKn1wa7HjvoONWad8XECyanxWpBvDWaoo",
  authDomain: "library-774f5.firebaseapp.com",
  databaseURL: "https://library-774f5-default-rtdb.firebaseio.com",
  projectId: "library-774f5",
  storageBucket: "library-774f5.firebasestorage.app",
  messagingSenderId: "369345397855",
  appId: "1:369345397855:web:72da1dbe0c3cb5189047ea",
  measurementId: "G-Y7DXZKW0VK"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ---------------------------------------------------------
// 2) GLOBAL HOLAT (STATE)
// ---------------------------------------------------------
const state = {
  user: null,          // joriy tizimga kirgan foydalanuvchi (auth)
  profile: null,       // "profiles" to'plamidan olingan qo'shimcha ma'lumot
  books: [],           // katalogdagi barcha kitoblar
  myBooks: [],         // foydalanuvchining o'z kitoblari
  requests: [],        // foydalanuvchiga tegishli so'rovlar
  authMode: "login",   // "login" | "register"
};

// ---------------------------------------------------------
// 3) YORDAMCHI FUNKSIYALAR
// ---------------------------------------------------------
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function showToast(message, kind = "success") {
  const container = $("#toast-container");
  const colors = {
    success: "bg-emerald-700",
    error: "bg-red-600",
    info: "bg-stone-700",
  };
  const toast = document.createElement("div");
  toast.className = `${colors[kind] || colors.info} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg animate-fade`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPrice(n) {
  // Intl.NumberFormat("uz-UZ") turli brauzerlarda (ICU ma'lumotlari to'liqligiga qarab)
  // vergul yoki bo'sh joy bilan formatlashi mumkin — shuning uchun ishonchli natija
  // uchun raqamlarni qo'lda, minglik guruhlarga bo'lib formatlaymiz.
  const rounded = Math.round(Number(n) || 0);
  const withSpaces = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return withSpaces + " so'm";
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "hozirgina";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return new Date(dateStr).toLocaleDateString("uz-UZ");
}

const TYPE_LABELS = {
  almashish: { label: "Almashish", classes: "bg-emerald-100 text-emerald-800" },
  bepul: { label: "Bepul", classes: "bg-amber-100 text-amber-800" },
  ijara: { label: "Ijara", classes: "bg-slate-200 text-slate-800" },
};

const FALLBACK_COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
      <rect width="300" height="400" fill="#e7e5e0"/>
      <text x="150" y="205" font-family="serif" font-size="52" fill="#a8a29e" text-anchor="middle">📖</text>
    </svg>
  `);

// ---------------------------------------------------------
// 4) NAVIGATSIYA (SPA — sahifa yangilanmasdan tab almashish)
// ---------------------------------------------------------
function navigate(view) {
  $all("[data-view]").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $all(".nav-tab").forEach((btn) => {
    const active = btn.dataset.nav === view;
    btn.classList.toggle("tab-active", active);
    btn.classList.toggle("tab-inactive", !active);
  });
  $("#mobile-nav").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "add") renderAddView();
  if (view === "mybooks") renderMyBooksView();
  if (view === "myrequests") renderMyRequestsView();
}

$all("[data-nav]").forEach((el) =>
  el.addEventListener("click", () => navigate(el.dataset.nav))
);

$("#mobile-menu-btn").addEventListener("click", () => {
  $("#mobile-nav").classList.toggle("hidden");
});

// ---------------------------------------------------------
// 5) MODAL BOSHQARUVI
// ---------------------------------------------------------
function openModal(id) {
  const modal = $("#" + id);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
function closeModal(id) {
  const modal = $("#" + id);
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}
$all("[data-close-modal]").forEach((btn) =>
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal))
);
$all(".modal-backdrop").forEach((modal) =>
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden"), modal.classList.remove("flex");
  })
);

// ---------------------------------------------------------
// 6) AUTENTIFIKATSIYA (Firebase Auth)
// ---------------------------------------------------------
function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  $("#auth-modal-title").textContent = isRegister ? "Ro'yxatdan o'tish" : "Tizimga kirish";
  $("#auth-fullname-wrap").classList.toggle("hidden", !isRegister);
  $("#auth-phone-wrap").classList.toggle("hidden", !isRegister);
  $("#auth-submit-btn").textContent = isRegister ? "Ro'yxatdan o'tish" : "Kirish";
  $("#auth-toggle-text").textContent = isRegister ? "Hisobingiz bormi?" : "Hisobingiz yo'qmi?";
  $("#auth-toggle-btn").textContent = isRegister ? "Kirish" : "Ro'yxatdan o'tish";
  $("#auth-error").classList.add("hidden");
  $("input[name=full_name]").required = isRegister;
}

$("#auth-toggle-btn").addEventListener("click", () => {
  setAuthMode(state.authMode === "login" ? "register" : "login");
});

$all("[data-open-auth]").forEach((btn) =>
  btn.addEventListener("click", () => {
    setAuthMode(btn.dataset.openAuth);
    $("#auth-form").reset();
    openModal("auth-modal");
  })
);

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const email = fd.get("email").trim();
  const password = fd.get("password");
  const errorEl = $("#auth-error");
  errorEl.classList.add("hidden");

  const submitBtn = $("#auth-submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Iltimos, kuting...";

  try {
    if (state.authMode === "register") {
      const fullName = fd.get("full_name").trim();
      const phone = fd.get("phone").trim();
      const telegram = fd.get("telegram_username").trim();

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "profiles", cred.user.uid), {
        full_name: fullName,
        phone: phone || null,
        telegram_username: telegram || null,
        created_at: new Date().toISOString(),
      });

      showToast("Xush kelibsiz, " + fullName + "!", "success");
      closeModal("auth-modal");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Xush kelibsiz!", "success");
      closeModal("auth-modal");
    }
    form.reset();
  } catch (err) {
    errorEl.textContent = translateAuthError(err.code || err.message);
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    setAuthMode(state.authMode);
  }
});

function translateAuthError(code) {
  if (!code) return "Xatolik yuz berdi. Qaytadan urinib ko'ring.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email yoki parol noto'g'ri.";
  if (code.includes("email-already-in-use")) return "Bu email allaqachon ro'yxatdan o'tgan.";
  if (code.includes("weak-password")) return "Parol kamida 6 ta belgidan iborat bo'lishi kerak.";
  if (code.includes("invalid-email")) return "Email manzili noto'g'ri formatda.";
  if (code.includes("network-request-failed")) return "Internet aloqasi bilan muammo. Qaytadan urinib ko'ring.";
  return code;
}

async function handleSignOut() {
  await signOut(auth);
  showToast("Tizimdan chiqdingiz", "info");
  navigate("catalog");
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "profiles", uid));
  state.profile = snap.exists() ? snap.data() : null;
}

function renderAuthArea() {
  const area = $("#auth-area");
  if (state.user) {
    const name = state.profile?.full_name || state.user.email;
    area.innerHTML = `
      <div class="relative">
        <button id="user-menu-btn" class="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-stone-200/60 transition-colors">
          <span class="h-8 w-8 rounded-full bg-emerald-700 text-white flex items-center justify-center text-sm font-semibold shrink-0">${escapeHtml(name.charAt(0).toUpperCase())}</span>
          <span class="hidden sm:block text-sm font-medium text-stone-700 max-w-[120px] truncate">${escapeHtml(name)}</span>
        </button>
        <div id="user-menu" class="hidden absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 z-50">
          <button data-nav="mybooks" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">Mening kitoblarim</button>
          <button data-nav="myrequests" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">So'rovlarim</button>
          <button id="signout-btn" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Chiqish</button>
        </div>
      </div>`;
    $("#user-menu-btn").addEventListener("click", () => $("#user-menu").classList.toggle("hidden"));
    $("#signout-btn").addEventListener("click", handleSignOut);
    $all("[data-nav]", area).forEach((el) =>
      el.addEventListener("click", () => { navigate(el.dataset.nav); $("#user-menu").classList.add("hidden"); })
    );
  } else {
    area.innerHTML = `
      <button data-open-auth="login" class="px-3 sm:px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors">Kirish</button>
      <button data-open-auth="register" class="px-3 sm:px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors">Ro'yxatdan o'tish</button>`;
    $all("[data-open-auth]", area).forEach((btn) =>
      btn.addEventListener("click", () => {
        setAuthMode(btn.dataset.openAuth);
        $("#auth-form").reset();
        openModal("auth-modal");
      })
    );
  }
}

// Global hujjat darajasidagi listener — foydalanuvchi menyusi tashqarisiga bosilganda yopilsin
// (faqat bitta marta ro'yxatdan o'tkaziladi, renderAuthArea har safar chaqirilganda emas)
document.addEventListener("click", (e) => {
  const area = $("#auth-area");
  const menu = $("#user-menu");
  if (menu && !menu.classList.contains("hidden") && !area.contains(e.target)) {
    menu.classList.add("hidden");
  }
});

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (state.user) {
    await loadProfile(state.user.uid);
  } else {
    state.profile = null;
  }
  renderAuthArea();
  updateAuthGuards();
  if ($('[data-view="mybooks"]').classList.contains("active")) renderMyBooksView();
  if ($('[data-view="myrequests"]').classList.contains("active")) renderMyRequestsView();
});

function updateAuthGuards() {
  const loggedIn = !!state.user;
  $("#add-auth-guard").classList.toggle("hidden", loggedIn);
  $("#add-book-form").classList.toggle("hidden", !loggedIn);
  $("#mybooks-auth-guard").classList.toggle("hidden", loggedIn);
  $("#mybooks-content").classList.toggle("hidden", !loggedIn);
  $("#myrequests-auth-guard").classList.toggle("hidden", loggedIn);
  $("#myrequests-content").classList.toggle("hidden", !loggedIn);
}

// ---------------------------------------------------------
// 7) KATALOG — kitoblarni yuklash, filtrlash, render qilish
// ---------------------------------------------------------
async function loadBooks() {
  $("#results-count").textContent = "Yuklanmoqda...";
  try {
    const snap = await getDocs(collection(db, "books"));
    let books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    books = books.filter((b) => b.is_active !== false);
    books.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // eng yangisi tepada
    state.books = books;
    populateGenreFilter();
    applyFilters();
  } catch (err) {
    showToast("Kitoblarni yuklashda xatolik: " + err.message, "error");
    $("#results-count").textContent = "Xatolik yuz berdi.";
  }
}

function populateGenreFilter() {
  const select = $("#filter-genre");
  const current = select.value;
  const genres = [...new Set(state.books.map((b) => b.genre).filter(Boolean))].sort();
  select.innerHTML = `<option value="">Barcha janrlar</option>` +
    genres.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
  select.value = current;
}

function applyFilters() {
  const q = $("#search-input").value.trim().toLowerCase();
  const type = $("#filter-type").value;
  const genre = $("#filter-genre").value;

  const filtered = state.books.filter((b) => {
    const matchesQuery = !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    const matchesType = !type || b.type === type;
    const matchesGenre = !genre || b.genre === genre;
    return matchesQuery && matchesType && matchesGenre;
  });

  renderBooksGrid(filtered, $("#books-grid"));
  $("#results-count").textContent = `${filtered.length} ta kitob topildi`;
  $("#empty-state").classList.toggle("hidden", filtered.length !== 0);
  $("#empty-state").classList.toggle("flex", filtered.length === 0);
}

$("#search-input").addEventListener("input", debounce(applyFilters, 200));
$("#filter-type").addEventListener("change", applyFilters);
$("#filter-genre").addEventListener("change", applyFilters);

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function bookCardHtml(book, { ownerActions = false } = {}) {
  const typeInfo = TYPE_LABELS[book.type] || { label: book.type, classes: "bg-stone-100 text-stone-700" };
  const cover = book.cover_url && book.cover_url.trim() ? escapeHtml(book.cover_url) : FALLBACK_COVER;
  const priceLine =
    book.type === "ijara" && book.rent_price
      ? `<p class="text-sm font-semibold text-slate-700 mt-1">${formatPrice(book.rent_price)}/kun</p>`
      : "";
  const location = [book.district, book.region].filter(Boolean).join(", ");

  return `
    <div class="group bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-md hover:border-stone-300 transition-all flex flex-col" data-book-id="${book.id}">
      <div class="book-cover w-full overflow-hidden bg-stone-100 relative">
        <img src="${cover}" alt="${escapeHtml(book.title)}" loading="lazy"
             onerror="this.src='${FALLBACK_COVER}'"
             class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
        <span class="absolute top-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full ${typeInfo.classes}">${typeInfo.label}</span>
      </div>
      <div class="p-3 flex flex-col flex-1">
        <h3 class="font-serif font-semibold text-stone-900 text-sm leading-snug line-clamp-2">${escapeHtml(book.title)}</h3>
        <p class="text-xs text-stone-500 mt-0.5 line-clamp-1">${escapeHtml(book.author)}</p>
        ${priceLine}
        ${location ? `<p class="text-[11px] text-stone-400 mt-1.5 flex items-center gap-1">📍 ${escapeHtml(location)}</p>` : ""}
        <div class="mt-auto pt-3">
          ${
            ownerActions
              ? `<div class="flex gap-2">
                   <button data-delete-book="${book.id}" class="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">O'chirish</button>
                 </div>`
              : `<button data-view-book="${book.id}" class="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors">Bog'lanish</button>`
          }
        </div>
      </div>
    </div>`;
}

function renderBooksGrid(books, container) {
  container.innerHTML = books.map((b) => bookCardHtml(b)).join("");
  $all("[data-view-book]", container).forEach((btn) =>
    btn.addEventListener("click", () => openBookModal(btn.dataset.viewBook))
  );
}

// ---------------------------------------------------------
// 8) KITOB QO'SHISH
// ---------------------------------------------------------
function renderAddView() {
  updateAuthGuards();
  if (!state.user) return;
  $("#add-book-form").reset();
  $("#rent-price-wrap").classList.add("hidden");
  $("input[name=rent_price]", $("#add-book-form")).required = false;
}

$("#type-select").addEventListener("change", (e) => {
  const isRent = e.target.value === "ijara";
  $("#rent-price-wrap").classList.toggle("hidden", !isRent);
  $("input[name=rent_price]", $("#add-book-form")).required = isRent;
});

$("#add-book-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) {
    showToast("Iltimos, avval tizimga kiring.", "error");
    return;
  }
  const fd = new FormData(e.target);
  const payload = {
    owner_id: state.user.uid,
    title: fd.get("title").trim(),
    author: fd.get("author").trim(),
    genre: fd.get("genre").trim() || null,
    condition: fd.get("condition"),
    type: fd.get("type"),
    rent_price: fd.get("type") === "ijara" ? Number(fd.get("rent_price")) || null : null,
    cover_url: fd.get("cover_url").trim() || null,
    region: fd.get("region").trim(),
    district: fd.get("district").trim(),
    neighborhood: fd.get("neighborhood").trim() || null,
    description: fd.get("description").trim() || null,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const submitBtn = $("#add-book-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saqlanmoqda...";

  try {
    await addDoc(collection(db, "books"), payload);
    showToast("E'loningiz muvaffaqiyatli joylashtirildi!", "success");
    e.target.reset();
    $("#rent-price-wrap").classList.add("hidden");
    await loadBooks();
    navigate("catalog");
  } catch (err) {
    showToast("Xatolik: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "E'lonni joylashtirish";
  }
});

// ---------------------------------------------------------
// 9) MENING KITOBLARIM
// ---------------------------------------------------------
async function renderMyBooksView() {
  updateAuthGuards();
  if (!state.user) return;

  $("#mybooks-grid").innerHTML = `<p class="col-span-full text-stone-400 text-sm">Yuklanmoqda...</p>`;
  try {
    const snap = await getDocs(query(collection(db, "books"), where("owner_id", "==", state.user.uid)));
    let mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    state.myBooks = mine;

    const grid = $("#mybooks-grid");
    grid.innerHTML = state.myBooks.map((b) => bookCardHtml(b, { ownerActions: true })).join("");
    $("#mybooks-empty").classList.toggle("hidden", state.myBooks.length !== 0);

    $all("[data-delete-book]", grid).forEach((btn) =>
      btn.addEventListener("click", () => deleteBook(btn.dataset.deleteBook))
    );
  } catch (err) {
    showToast("Xatolik: " + err.message, "error");
  }
}

async function deleteBook(bookId) {
  if (!confirm("Haqiqatan ham ushbu e'lonni o'chirmoqchimisiz?")) return;
  try {
    await deleteDoc(doc(db, "books", bookId));
    showToast("E'lon o'chirildi", "info");
    await renderMyBooksView();
    await loadBooks();
  } catch (err) {
    showToast("O'chirishda xatolik: " + err.message, "error");
  }
}

// ---------------------------------------------------------
// 10) KITOB DETAL / SO'ROV YUBORISH MODALI
// ---------------------------------------------------------
async function openBookModal(bookId) {
  const book = state.books.find((b) => b.id === bookId) || state.myBooks.find((b) => b.id === bookId);
  if (!book) return;

  const content = $("#book-modal-content");
  content.innerHTML = `<p class="text-stone-400 text-sm py-10 text-center">Yuklanmoqda...</p>`;
  openModal("book-modal");

  const ownerSnap = await getDoc(doc(db, "profiles", book.owner_id));
  const owner = ownerSnap.exists() ? ownerSnap.data() : null;

  const typeInfo = TYPE_LABELS[book.type] || { label: book.type, classes: "bg-stone-100 text-stone-700" };
  const cover = book.cover_url && book.cover_url.trim() ? escapeHtml(book.cover_url) : FALLBACK_COVER;
  const isOwnBook = state.user && state.user.uid === book.owner_id;
  const location = [book.neighborhood, book.district, book.region].filter(Boolean).join(", ");

  content.innerHTML = `
    <div class="flex gap-4">
      <img src="${cover}" onerror="this.src='${FALLBACK_COVER}'" alt="${escapeHtml(book.title)}" class="w-24 sm:w-28 book-cover object-cover rounded-xl border border-stone-200 shrink-0" />
      <div class="min-w-0">
        <span class="text-[11px] font-semibold px-2 py-1 rounded-full ${typeInfo.classes}">${typeInfo.label}</span>
        <h3 class="font-serif text-lg font-semibold text-stone-900 mt-1.5 leading-snug">${escapeHtml(book.title)}</h3>
        <p class="text-sm text-stone-500">${escapeHtml(book.author)}${book.genre ? " · " + escapeHtml(book.genre) : ""}</p>
        <p class="text-xs text-stone-400 mt-1">Holati: ${escapeHtml(book.condition)}</p>
        ${book.type === "ijara" && book.rent_price ? `<p class="text-sm font-semibold text-slate-700 mt-1">${formatPrice(book.rent_price)}/kun</p>` : ""}
      </div>
    </div>

    ${book.description ? `<p class="text-sm text-stone-600 mt-4 leading-relaxed">${escapeHtml(book.description)}</p>` : ""}
    ${location ? `<p class="text-sm text-stone-500 mt-3">📍 ${escapeHtml(location)}</p>` : ""}

    <div class="mt-5 pt-5 border-t border-stone-200">
      <p class="text-sm font-medium text-stone-700 mb-2">Kitob egasi</p>
      <p class="text-sm text-stone-600">${escapeHtml(owner?.full_name || "Foydalanuvchi")}</p>
      ${
        isOwnBook
          ? `<p class="text-sm text-stone-400 mt-3">Bu sizning e'loningiz.</p>`
          : state.user
          ? ownerContactAndRequestFormHtml(owner, book)
          : `<button data-open-auth="login" class="mt-3 w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold transition-colors">Bog'lanish uchun tizimga kiring</button>`
      }
    </div>
  `;

  $all("[data-open-auth]", content).forEach((btn) =>
    btn.addEventListener("click", () => {
      closeModal("book-modal");
      setAuthMode(btn.dataset.openAuth);
      openModal("auth-modal");
    })
  );

  const reqForm = $("#request-form", content);
  if (reqForm) {
    reqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = new FormData(reqForm).get("message").trim();
      if (!message) return;
      const submitBtn = $("button[type=submit]", reqForm);
      submitBtn.disabled = true;
      submitBtn.textContent = "Yuborilmoqda...";

      try {
        await addDoc(collection(db, "requests"), {
          book_id: book.id,
          requester_id: state.user.uid,
          owner_id: book.owner_id,
          message,
          status: "yangi",
          created_at: new Date().toISOString(),
        });
        showToast("So'rovingiz yuborildi!", "success");
        reqForm.reset();
        closeModal("book-modal");
      } catch (err) {
        showToast("Xatolik: " + err.message, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "So'rovni yuborish";
      }
    });
  }
}

function ownerContactAndRequestFormHtml(owner, book) {
  const hasContact = owner?.phone || owner?.telegram_username;
  const contactHtml = hasContact
    ? `<div class="flex flex-wrap gap-2 mt-3">
        ${owner.phone ? `<a href="tel:${escapeHtml(owner.phone)}" class="px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors">📞 ${escapeHtml(owner.phone)}</a>` : ""}
        ${owner.telegram_username ? `<a href="https://t.me/${escapeHtml(owner.telegram_username.replace("@", ""))}" target="_blank" rel="noopener" class="px-3 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-sm font-medium transition-colors">💬 ${escapeHtml(owner.telegram_username)}</a>` : ""}
      </div>`
    : `<p class="text-xs text-stone-400 mt-2">Bu foydalanuvchi kontakt ma'lumot qoldirmagan — quyidagi forma orqali ichki so'rov yuboring.</p>`;

  const defaultMessage =
    book.type === "ijara"
      ? `Assalomu alaykum! "${book.title}" kitobini ijaraga olmoqchi edim.`
      : book.type === "bepul"
      ? `Assalomu alaykum! "${book.title}" kitobini olsam bo'ladimi?`
      : `Assalomu alaykum! "${book.title}" kitobini almashishni xohlar edim.`;

  return `
    ${contactHtml}
    <form id="request-form" class="mt-4 space-y-2">
      <label class="block text-sm font-medium text-stone-700">Ichki so'rov yuborish</label>
      <textarea name="message" rows="3" required class="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:bg-white">${escapeHtml(defaultMessage)}</textarea>
      <button type="submit" class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold transition-colors">So'rovni yuborish</button>
    </form>`;
}

// ---------------------------------------------------------
// 11) SO'ROVLARIM
// ---------------------------------------------------------
async function renderMyRequestsView() {
  updateAuthGuards();
  if (!state.user) return;

  $("#requests-list").innerHTML = `<p class="text-stone-400 text-sm">Yuklanmoqda...</p>`;

  try {
    const [outSnap, inSnap] = await Promise.all([
      getDocs(query(collection(db, "requests"), where("requester_id", "==", state.user.uid))),
      getDocs(query(collection(db, "requests"), where("owner_id", "==", state.user.uid))),
    ]);

    const merged = new Map();
    outSnap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
    inSnap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
    let requests = [...merged.values()];
    requests.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    // Har bir so'rovga tegishli kitob ma'lumotini (nomi, muqovasi) alohida yuklab olamiz
    const bookCache = new Map();
    await Promise.all(
      [...new Set(requests.map((r) => r.book_id))].map(async (bookId) => {
        const bSnap = await getDoc(doc(db, "books", bookId));
        bookCache.set(bookId, bSnap.exists() ? bSnap.data() : null);
      })
    );
    requests = requests.map((r) => ({ ...r, _book: bookCache.get(r.book_id) }));

    state.requests = requests;
    const list = $("#requests-list");

    if (state.requests.length === 0) {
      list.innerHTML = "";
      $("#requests-empty").classList.remove("hidden");
      return;
    }
    $("#requests-empty").classList.add("hidden");

    list.innerHTML = state.requests
      .map((r) => {
        const isMine = r.requester_id === state.user.uid;
        const bookTitle = r._book?.title || "Kitob (o'chirilgan)";
        const bookCover = r._book?.cover_url && r._book.cover_url.trim() ? escapeHtml(r._book.cover_url) : FALLBACK_COVER;
        return `
          <div class="bg-white border border-stone-200 rounded-xl p-4 flex gap-3">
            <img src="${bookCover}" onerror="this.src='${FALLBACK_COVER}'" class="w-12 h-16 object-cover rounded-lg border border-stone-200 shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-stone-900 truncate">${escapeHtml(bookTitle)}</p>
                <span class="text-[11px] px-2 py-0.5 rounded-full ${isMine ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"} shrink-0">${isMine ? "Men yubordim" : "Menga kelgan"}</span>
              </div>
              <p class="text-sm text-stone-500 mt-1 line-clamp-2">${escapeHtml(r.message)}</p>
              <p class="text-[11px] text-stone-400 mt-1.5">${timeAgo(r.created_at)}</p>
            </div>
          </div>`;
      })
      .join("");
  } catch (err) {
    showToast("Xatolik: " + err.message, "error");
  }
}

// ---------------------------------------------------------
// 12) ISHGA TUSHIRISH (INIT)
// ---------------------------------------------------------
async function init() {
  renderAuthArea();
  updateAuthGuards();
  await loadBooks();
}

init();
