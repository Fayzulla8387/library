// KITOB-AYLANMA — app.js (Firebase, tuzatilgan versiya)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKn1wa7HjvoONWad8XECyanxWpBvDWaoo",
  authDomain: "library-774f5.firebaseapp.com",
  databaseURL: "https://library-774f5-default-rtdb.firebaseio.com",
  projectId: "library-774f5",
  storageBucket: "library-774f5.firebasestorage.app",
  messagingSenderId: "369345397855",
  appId: "1:369345397855:web:72da1dbe0c3cb5189047ea",
  measurementId: "G-Y7DXZKW0VK",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const state = {
  user: null, profile: null, books: [], myBooks: [], requests: [],
  authMode: "login", registering: false, newRequests: 0, afterProfile: null,
};

// ---------- Yordamchilar ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

function showToast(message, kind = "success") {
  const colors = { success: "bg-emerald-700", error: "bg-red-600", info: "bg-stone-700" };
  const toast = document.createElement("div");
  toast.className = `${colors[kind] || colors.info} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg animate-fade`;
  toast.textContent = message;
  $("#toast-container").appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function formatPrice(n) {
  const rounded = Math.round(Number(n) || 0);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
}

function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
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
  sotish: { label: "Sotiladi", classes: "bg-violet-100 text-violet-800" },
};

// E'lon statusi: faqat "mavjud" e'lonlar umumiy katalogda ko'rinadi
const STATUS = {
  mavjud: { label: "Faol", classes: "bg-emerald-100 text-emerald-800" },
  ijarada: { label: "Ijarada", classes: "bg-blue-100 text-blue-800" },
  sotildi: { label: "Sotildi", classes: "bg-rose-100 text-rose-800" },
  berildi: { label: "Berib yuborildi", classes: "bg-amber-100 text-amber-800" },
  almashildi: { label: "Almashildi", classes: "bg-teal-100 text-teal-800" },
};
const CLOSE_ACTION = {
  sotish: ["sotildi", "Sotildi deb belgilash"],
  ijara: ["ijarada", "Ijaraga berildi"],
  bepul: ["berildi", "Berib yubordim"],
  almashish: ["almashildi", "Almashildi"],
};

const FALLBACK_COVER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="#e7e5e0"/><text x="150" y="205" font-family="serif" font-size="52" fill="#a8a29e" text-anchor="middle">📖</text></svg>`
);

const coverOf = (b) => (b && b.cover_url && b.cover_url.trim() ? escapeHtml(b.cover_url) : FALLBACK_COVER);

// ---------- Navigatsiya ----------
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
$all("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.nav)));
$("#mobile-menu-btn").addEventListener("click", () => $("#mobile-nav").classList.toggle("hidden"));

// ---------- Modal ----------
function openModal(id) { const m = $("#" + id); m.classList.remove("hidden"); m.classList.add("flex"); }
function closeModal(id) { const m = $("#" + id); m.classList.add("hidden"); m.classList.remove("flex"); }
$all("[data-close-modal]").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
$all(".modal-backdrop").forEach((modal) =>
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal.id); })
);

// ---------- Kontakt ma'lumotlari ----------
// Qoida: telefon YOKI Telegramdan kamida bittasi majburiy (ikkalasi shart emas).
// Ilovada chat yo'q, kontaktsiz so'rov esa "boshi berk ko'cha" bo'ladi.
function normPhone(raw) {
  let p = String(raw || "").replace(/[\s\-().]/g, "");
  if (!p) return "";
  if (/^\d{9}$/.test(p)) p = "+998" + p;
  else if (/^998\d{9}$/.test(p)) p = "+" + p;
  return /^\+\d{9,15}$/.test(p) ? p : null; // null = noto'g'ri format
}
function normTelegram(raw) {
  const t = String(raw || "").trim().replace(/^(https?:\/\/)?t\.me\//i, "").replace(/^@/, "");
  if (!t) return "";
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(t) ? t : null;
}
function validateContacts(phoneRaw, tgRaw) {
  const phone = normPhone(phoneRaw);
  const telegram = normTelegram(tgRaw);
  if (phone === null) return { error: "Telefon raqami noto'g'ri. Masalan: +998 90 123 45 67" };
  if (telegram === null) return { error: "Telegram username noto'g'ri (5-32 belgi: harf, raqam, _)." };
  if (!phone && !telegram) return { error: "Telefon yoki Telegramdan kamida bittasini kiriting." };
  return { phone: phone || null, telegram: telegram || null };
}
const hasContact = () => !!(state.profile && (state.profile.phone || state.profile.telegram_username));
const PROFILE_NOTE = "Kitob egalari va so'rov yuborganlar siz bilan bog'lana olishi uchun telefon yoki Telegramdan kamida bittasi kerak.";

function openProfileModal(note) {
  const p = state.profile || {};
  const el = $("#profile-form").elements;
  el.full_name.value = p.full_name || "";
  el.phone.value = p.phone || "";
  el.telegram_username.value = p.telegram_username ? "@" + String(p.telegram_username).replace("@", "") : "";
  $("#profile-error").classList.add("hidden");
  $("#profile-modal-note").textContent = note || PROFILE_NOTE;
  openModal("profile-modal");
}

// Kontakt yo'q bo'lsa profil oynasini ochadi; saqlangach `after` bajariladi.
function requireContact(after, note) {
  if (hasContact()) return true;
  closeModal("book-modal");
  state.afterProfile = after || null;
  openProfileModal(note);
  return false;
}

function bindOpenProfile(root, after) {
  $all("[data-open-profile]", root).forEach((btn) =>
    btn.addEventListener("click", () => {
      const menu = $("#user-menu");
      if (menu) menu.classList.add("hidden");
      closeModal("book-modal");
      state.afterProfile = after || null;
      openProfileModal();
    })
  );
}

$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;
  const el = e.target.elements;
  const errEl = $("#profile-error");
  const fail = (m) => { errEl.textContent = m; errEl.classList.remove("hidden"); };
  const fullName = el.full_name.value.trim();
  const c = validateContacts(el.phone.value, el.telegram_username.value);
  if (!fullName) return fail("Ismingizni kiriting.");
  if (c.error) return fail(c.error);
  const btn = $("#profile-submit-btn");
  btn.disabled = true;
  try {
    const data = { full_name: fullName, phone: c.phone, telegram_username: c.telegram };
    if (!state.profile) data.created_at = new Date().toISOString();
    await setDoc(doc(db, "profiles", state.user.uid), data, { merge: true });
    await loadProfile(state.user.uid);
    renderAuthArea();
    closeModal("profile-modal");
    showToast("Kontakt ma'lumotlari saqlandi", "success");
    const next = state.afterProfile;
    state.afterProfile = null;
    if (next) next();
  } catch (ex) {
    fail("Saqlashda xatolik: " + ex.message);
  } finally {
    btn.disabled = false;
  }
});

// Menga kelgan yangi so'rovlar soni (menyuda qizil nishon)
async function refreshRequestBadge(announce = false) {
  if (!state.user) { state.newRequests = 0; return; }
  try {
    const s = await getDocs(query(collection(db, "requests"),
      where("owner_id", "==", state.user.uid), where("status", "==", "yangi")));
    state.newRequests = s.size;
  } catch (err) {
    state.newRequests = 0;
  }
  renderAuthArea();
  if (announce && state.newRequests) showToast(`Sizda ${state.newRequests} ta yangi so'rov bor`, "info");
}

// ---------- Auth ----------
function setAuthMode(mode) {
  state.authMode = mode;
  const reg = mode === "register";
  $("#auth-modal-title").textContent = reg ? "Ro'yxatdan o'tish" : "Tizimga kirish";
  $("#auth-fullname-wrap").classList.toggle("hidden", !reg);
  $("#auth-phone-wrap").classList.toggle("hidden", !reg);
  $("#auth-submit-btn").textContent = reg ? "Ro'yxatdan o'tish" : "Kirish";
  $("#auth-toggle-text").textContent = reg ? "Hisobingiz bormi?" : "Hisobingiz yo'qmi?";
  $("#auth-toggle-btn").textContent = reg ? "Kirish" : "Ro'yxatdan o'tish";
  $("#auth-error").classList.add("hidden");
  $("input[name=full_name]").required = reg;
}
$("#auth-toggle-btn").addEventListener("click", () => setAuthMode(state.authMode === "login" ? "register" : "login"));

function bindOpenAuth(root) {
  $all("[data-open-auth]", root).forEach((btn) =>
    btn.addEventListener("click", () => {
      closeModal("book-modal");
      setAuthMode(btn.dataset.openAuth);
      $("#auth-form").reset();
      openModal("auth-modal");
    })
  );
}
bindOpenAuth(document);

function translateAuthError(code) {
  if (!code) return "Xatolik yuz berdi. Qaytadan urinib ko'ring.";
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return "Email yoki parol noto'g'ri.";
  if (code.includes("email-already-in-use")) return "Bu email allaqachon ro'yxatdan o'tgan.";
  if (code.includes("weak-password")) return "Parol kamida 6 ta belgidan iborat bo'lishi kerak.";
  if (code.includes("invalid-email")) return "Email manzili noto'g'ri formatda.";
  if (code.includes("network-request-failed")) return "Internet aloqasi bilan muammo.";
  if (code.includes("operation-not-allowed")) return "Firebase'da Email/Password yoqilmagan.";
  if (code.includes("unauthorized-domain")) return "Bu domen Firebase 'Authorized domains' ro'yxatida yo'q.";
  return code;
}

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
      const c = validateContacts(fd.get("phone"), fd.get("telegram_username"));
      if (c.error) throw new Error(c.error); // akkaunt yaratilishidan oldin tekshiramiz
      state.registering = true; // onAuthStateChanged profil yozilguncha kutsin
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "profiles", cred.user.uid), {
          full_name: fullName,
          phone: c.phone,
          telegram_username: c.telegram,
          created_at: new Date().toISOString(),
        });
        state.user = cred.user;
        await loadProfile(cred.user.uid);
        renderAuthArea();
        updateAuthGuards();
      } finally {
        state.registering = false;
      }
      showToast("Xush kelibsiz, " + fullName + "!", "success");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Xush kelibsiz!", "success");
    }
    closeModal("auth-modal");
    form.reset();
  } catch (err) {
    errorEl.textContent = translateAuthError(err.code || err.message);
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    setAuthMode(state.authMode);
  }
});

async function handleSignOut() {
  await signOut(auth);
  showToast("Tizimdan chiqdingiz", "info");
  navigate("catalog");
}

async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "profiles", uid));
    state.profile = snap.exists() ? snap.data() : null;
  } catch (err) {
    state.profile = null;
  }
}

function renderAuthArea() {
  const area = $("#auth-area");
  if (state.user) {
    const name = state.profile?.full_name || state.user.email || "?";
    area.innerHTML = `
      <div class="relative">
        <button id="user-menu-btn" class="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-stone-200/60 transition-colors">
          <span class="h-8 w-8 rounded-full bg-emerald-700 text-white flex items-center justify-center text-sm font-semibold shrink-0">${escapeHtml(name.charAt(0).toUpperCase())}</span>
          <span class="hidden sm:block text-sm font-medium text-stone-700 max-w-[120px] truncate">${escapeHtml(name)}</span>
          ${state.newRequests ? `<span class="h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">${state.newRequests}</span>` : ""}
          ${!hasContact() ? `<span title="Kontakt kiriting" class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>` : ""}
        </button>
        <div id="user-menu" class="hidden absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 z-50">
          <button data-nav="mybooks" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">Mening kitoblarim</button>
          <button data-nav="myrequests" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">So'rovlarim${state.newRequests ? ` <span class="ml-1 px-1.5 rounded-full bg-red-500 text-white text-[10px]">${state.newRequests}</span>` : ""}</button>
          <button data-open-profile class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">Kontaktlarim${hasContact() ? "" : " ⚠️"}</button>
          <button id="signout-btn" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Chiqish</button>
        </div>
      </div>`;
    $("#user-menu-btn").addEventListener("click", () => $("#user-menu").classList.toggle("hidden"));
    $("#signout-btn").addEventListener("click", handleSignOut);
    bindOpenProfile(area);
    $all("[data-nav]", area).forEach((el) =>
      el.addEventListener("click", () => { navigate(el.dataset.nav); $("#user-menu").classList.add("hidden"); })
    );
  } else {
    area.innerHTML = `
      <button data-open-auth="login" class="px-3 sm:px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors">Kirish</button>
      <button data-open-auth="register" class="px-3 sm:px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors">Ro'yxatdan o'tish</button>`;
    bindOpenAuth(area);
  }
}

document.addEventListener("click", (e) => {
  const menu = $("#user-menu");
  if (menu && !menu.classList.contains("hidden") && !$("#auth-area").contains(e.target)) menu.classList.add("hidden");
});

onAuthStateChanged(auth, async (user) => {
  if (state.registering) return;
  state.user = user || null;
  if (state.user) await loadProfile(state.user.uid);
  else state.profile = null;
  renderAuthArea();
  updateAuthGuards();
  if ($('[data-view="mybooks"]').classList.contains("active")) renderMyBooksView();
  if ($('[data-view="myrequests"]').classList.contains("active")) renderMyRequestsView();
  if (state.user) {
    if (!hasContact()) showToast("Profilingizda telefon yoki Telegram yo'q. Menyudagi \"Kontaktlarim\" orqali qo'shing.", "info");
    refreshRequestBadge(true);
  }
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

// ---------- Katalog ----------
async function loadBooks() {
  $("#results-count").textContent = "Yuklanmoqda...";
  try {
    const snap = await getDocs(collection(db, "books"));
    state.books = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.is_active !== false && (b.status || "mavjud") === "mavjud")
      .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? 1 : -1));
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
    const okQ = !q || (b.title || "").toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q);
    return okQ && (!type || b.type === type) && (!genre || b.genre === genre);
  });
  renderBooksGrid(filtered, $("#books-grid"));
  $("#results-count").textContent = `${filtered.length} ta kitob topildi`;
  $("#empty-state").classList.toggle("hidden", filtered.length !== 0);
  $("#empty-state").classList.toggle("flex", filtered.length === 0);
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
$("#search-input").addEventListener("input", debounce(applyFilters, 200));
$("#filter-type").addEventListener("change", applyFilters);
$("#filter-genre").addEventListener("change", applyFilters);

function priceText(b) {
  if (b.type === "ijara" && b.rent_price) return formatPrice(b.rent_price) + "/kun";
  if (b.type === "sotish" && b.sale_price) return formatPrice(b.sale_price);
  return "";
}

function ownerButtonsHtml(book, st) {
  const [closeVal, closeText] = CLOSE_ACTION[book.type] || CLOSE_ACTION.almashish;
  const info = STATUS[st] || STATUS.mavjud;
  const id = escapeHtml(book.id);
  const statusBtn = st === "mavjud"
    ? `<button data-set-status="${id}" data-status-value="${closeVal}" class="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors">${closeText}</button>`
    : `<button data-set-status="${id}" data-status-value="mavjud" class="w-full py-2 rounded-lg border border-emerald-300 text-emerald-800 text-xs font-medium hover:bg-emerald-50 transition-colors">Katalogga qaytarish</button>`;
  return `<div class="space-y-1.5">
    <p class="text-[11px] text-stone-500">Status: <span class="font-semibold px-1.5 py-0.5 rounded-full ${info.classes}">${info.label}</span>${st === "mavjud" ? "" : " · katalogda ko'rinmaydi"}</p>
    ${statusBtn}
    <button data-delete-book="${id}" class="w-full py-2 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">O'chirish</button>
  </div>`;
}

function bookCardHtml(book, { ownerActions = false } = {}) {
  const st = book.status || "mavjud";
  const typeInfo = TYPE_LABELS[book.type] || { label: book.type, classes: "bg-stone-100 text-stone-700" };
  const priceLine = priceText(book)
    ? `<p class="text-sm font-semibold text-slate-700 mt-1">${priceText(book)}</p>` : "";
  const location = [book.district, book.region].filter(Boolean).join(", ");
  return `
    <div class="group bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-md hover:border-stone-300 transition-all flex flex-col ${st !== "mavjud" ? "opacity-75" : ""}">
      <div class="book-cover w-full overflow-hidden bg-stone-100 relative">
        <img src="${coverOf(book)}" alt="${escapeHtml(book.title)}" loading="lazy" data-cover
             class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
        <span class="absolute top-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full ${typeInfo.classes}">${typeInfo.label}</span>
      </div>
      <div class="p-3 flex flex-col flex-1">
        <h3 class="font-serif font-semibold text-stone-900 text-sm leading-snug line-clamp-2">${escapeHtml(book.title)}</h3>
        <p class="text-xs text-stone-500 mt-0.5 line-clamp-1">${escapeHtml(book.author)}</p>
        ${priceLine}
        ${location ? `<p class="text-[11px] text-stone-400 mt-1.5 flex items-center gap-1">📍 ${escapeHtml(location)}</p>` : ""}
        <div class="mt-auto pt-3">
          ${ownerActions
            ? ownerButtonsHtml(book, st)
            : `<button data-view-book="${escapeHtml(book.id)}" class="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors">Bog'lanish</button>`}
        </div>
      </div>
    </div>`;
}

// onerror atributi o'rniga — xavfsizroq
function bindCoverFallback(root) {
  $all("img[data-cover], img[data-fallback]", root).forEach((img) => {
    img.addEventListener("error", () => { if (img.src !== FALLBACK_COVER) img.src = FALLBACK_COVER; }, { once: true });
  });
}

function renderBooksGrid(books, container) {
  container.innerHTML = books.map((b) => bookCardHtml(b)).join("");
  bindCoverFallback(container);
  $all("[data-view-book]", container).forEach((btn) =>
    btn.addEventListener("click", () => openBookModal(btn.dataset.viewBook))
  );
}

// ---------- Kitob qo'shish ----------
function renderAddView() {
  updateAuthGuards();
  if (!state.user) return;
  $("#add-book-form").reset();
  $("#rent-price-wrap").classList.add("hidden");
  $("input[name=rent_price]", $("#add-book-form")).required = false;
  $("#sale-price-wrap").classList.add("hidden");
  $("input[name=sale_price]", $("#add-book-form")).required = false;
  resetCoverPicker();
}

$("#type-select").addEventListener("change", (e) => {
  const isRent = e.target.value === "ijara";
  const isSale = e.target.value === "sotish";
  $("#rent-price-wrap").classList.toggle("hidden", !isRent);
  $("input[name=rent_price]", $("#add-book-form")).required = isRent;
  $("#sale-price-wrap").classList.toggle("hidden", !isSale);
  $("input[name=sale_price]", $("#add-book-form")).required = isSale;
});

// Muqova rasmi (ixtiyoriy): brauzerda 360x480 (3:4) JPEG ga kichraytirilib,
// matn (data URL) sifatida Firestore'ga saqlanadi. Firebase Storage kerak emas.
let coverDataUrl = null;
let coverPending = null;

function fileToCover(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const W = 360, H = 480;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(W / img.width, H / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Rasmni o'qib bo'lmadi. JPG yoki PNG tanlang.")); };
    img.src = url;
  });
}

function resetCoverPicker() {
  coverDataUrl = null;
  coverPending = null;
  const input = $("#cover-file");
  if (input) input.value = "";
  $("#cover-preview-wrap").classList.add("hidden");
}

$("#cover-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return resetCoverPicker();
  if (!file.type.startsWith("image/")) { resetCoverPicker(); return showToast("Faqat rasm faylini tanlang.", "error"); }
  if (file.size > 10 * 1024 * 1024) { resetCoverPicker(); return showToast("Rasm 10 MB dan oshmasligi kerak.", "error"); }
  coverPending = fileToCover(file)
    .then((data) => {
      coverDataUrl = data;
      $("#cover-preview").src = data;
      $("#cover-preview-wrap").classList.remove("hidden");
    })
    .catch((err) => { resetCoverPicker(); showToast(err.message, "error"); });
});
$("#cover-remove").addEventListener("click", resetCoverPicker);

$("#add-book-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return showToast("Iltimos, avval tizimga kiring.", "error");
  if (!requireContact(null, "E'lon joylashtirish uchun avval kontaktingizni kiriting: xaridor yoki o'quvchi siz bilan shu orqali bog'lanadi.")) return;
  if (coverPending) await coverPending; // rasm hali kichraytirilayotgan bo'lsa, kutamiz
  const fd = new FormData(e.target);
  const val = (k) => (fd.get(k) || "").toString().trim();
  const payload = {
    owner_id: state.user.uid,
    title: val("title"),
    author: val("author"),
    genre: val("genre") || null,
    condition: val("condition"),
    type: val("type"),
    rent_price: val("type") === "ijara" ? Number(val("rent_price")) || null : null,
    sale_price: val("type") === "sotish" ? Number(val("sale_price")) || null : null,
    cover_url: coverDataUrl || val("cover_url") || null,
    region: val("region"),
    district: val("district"),
    neighborhood: val("neighborhood") || null,
    description: val("description") || null,
    status: "mavjud",
    is_active: true,
    created_at: new Date().toISOString(),
  };
  const submitBtn = $("#add-book-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saqlanmoqda...";
  try {
    await addDoc(collection(db, "books"), payload);
    resetCoverPicker();
    showToast("E'loningiz muvaffaqiyatli joylashtirildi!", "success");
    e.target.reset();
    $("#rent-price-wrap").classList.add("hidden");
    $("#sale-price-wrap").classList.add("hidden");
    await loadBooks();
    navigate("catalog");
  } catch (err) {
    showToast("Xatolik: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "E'lonni joylashtirish";
  }
});

// ---------- Mening kitoblarim ----------
async function renderMyBooksView() {
  updateAuthGuards();
  if (!state.user) return;
  const grid = $("#mybooks-grid");
  grid.innerHTML = `<p class="col-span-full text-stone-400 text-sm">Yuklanmoqda...</p>`;
  try {
    const snap = await getDocs(query(collection(db, "books"), where("owner_id", "==", state.user.uid)));
    state.myBooks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? 1 : -1));
    grid.innerHTML = state.myBooks.map((b) => bookCardHtml(b, { ownerActions: true })).join("");
    bindCoverFallback(grid);
    $("#mybooks-empty").classList.toggle("hidden", state.myBooks.length !== 0);
    $all("[data-set-status]", grid).forEach((btn) =>
      btn.addEventListener("click", () => setBookStatus(btn.dataset.setStatus, btn.dataset.statusValue))
    );
    $all("[data-delete-book]", grid).forEach((btn) =>
      btn.addEventListener("click", () => deleteBook(btn.dataset.deleteBook))
    );
  } catch (err) {
    grid.innerHTML = "";
    showToast("Xatolik: " + err.message, "error");
  }
}

async function setBookStatus(bookId, status) {
  try {
    await updateDoc(doc(db, "books", bookId), { status });
    showToast(status === "mavjud" ? "E'lon katalogga qaytarildi" : "Status yangilandi, e'lon katalogdan olib tashlandi", "info");
    await renderMyBooksView();
    await loadBooks();
  } catch (err) {
    showToast("Statusni yangilashda xatolik: " + err.message, "error");
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

// ---------- Kitob modali / so'rov ----------
async function openBookModal(bookId) {
  const book = state.books.find((b) => b.id === bookId) || state.myBooks.find((b) => b.id === bookId);
  if (!book) return;
  const content = $("#book-modal-content");
  content.innerHTML = `<p class="text-stone-400 text-sm py-10 text-center">Yuklanmoqda...</p>`;
  openModal("book-modal");

  let owner = null;
  if (state.user) { // profillar faqat kirganlarga ochiq
    try {
      const ownerSnap = await getDoc(doc(db, "profiles", book.owner_id));
      owner = ownerSnap.exists() ? ownerSnap.data() : null;
    } catch (err) {
      showToast("Egasi ma'lumotini olishda xatolik", "error");
    }
  }

  const typeInfo = TYPE_LABELS[book.type] || { label: book.type, classes: "bg-stone-100 text-stone-700" };
  const isOwnBook = state.user && state.user.uid === book.owner_id;
  const location = [book.neighborhood, book.district, book.region].filter(Boolean).join(", ");

  content.innerHTML = `
    <div class="flex gap-4">
      <img src="${coverOf(book)}" data-fallback alt="${escapeHtml(book.title)}" class="w-24 sm:w-28 book-cover object-cover rounded-xl border border-stone-200 shrink-0" />
      <div class="min-w-0">
        <span class="text-[11px] font-semibold px-2 py-1 rounded-full ${typeInfo.classes}">${typeInfo.label}</span>
        <h3 class="font-serif text-lg font-semibold text-stone-900 mt-1.5 leading-snug">${escapeHtml(book.title)}</h3>
        <p class="text-sm text-stone-500">${escapeHtml(book.author)}${book.genre ? " · " + escapeHtml(book.genre) : ""}</p>
        <p class="text-xs text-stone-400 mt-1">Holati: ${escapeHtml(book.condition)}</p>
        ${priceText(book) ? `<p class="text-sm font-semibold text-slate-700 mt-1">${priceText(book)}</p>` : ""}
      </div>
    </div>
    ${book.description ? `<p class="text-sm text-stone-600 mt-4 leading-relaxed">${escapeHtml(book.description)}</p>` : ""}
    ${location ? `<p class="text-sm text-stone-500 mt-3">📍 ${escapeHtml(location)}</p>` : ""}
    <div class="mt-5 pt-5 border-t border-stone-200">
      ${state.user ? `<p class="text-sm font-medium text-stone-700 mb-2">Kitob egasi</p>
        <p class="text-sm text-stone-600">${escapeHtml(owner?.full_name || "Foydalanuvchi")}</p>` : ""}
      ${isOwnBook
        ? `<p class="text-sm text-stone-400 mt-3">Bu sizning e'loningiz.</p>`
        : state.user
        ? ownerContactAndRequestFormHtml(owner, book)
        : `<button data-open-auth="login" class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold transition-colors">Bog'lanish uchun tizimga kiring</button>`}
    </div>`;

  bindCoverFallback(content);
  bindOpenAuth(content);
  bindOpenProfile(content, () => openBookModal(book.id));

  const reqForm = $("#request-form", content);
  if (reqForm) {
    reqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!requireContact(() => openBookModal(book.id), "So'rov yuborishdan oldin kontaktingizni kiriting: kitob egasi siz bilan shu orqali bog'lanadi.")) return;
      const message = new FormData(reqForm).get("message").trim();
      if (!message) return;
      const submitBtn = $("button[type=submit]", reqForm);
      submitBtn.disabled = true;
      submitBtn.textContent = "Yuborilmoqda...";
      try {
        // ID = kitob_foydalanuvchi: bir kishi bitta kitobga faqat bir marta so'rov yubora oladi
        const me = state.profile;
        await setDoc(doc(db, "requests", `${book.id}_${state.user.uid}`), {
          book_id: book.id,
          requester_id: state.user.uid,
          owner_id: book.owner_id,
          requester_name: me.full_name,
          requester_phone: me.phone || null,
          requester_telegram: me.telegram_username || null,
          message,
          status: "yangi",
          created_at: new Date().toISOString(),
        });
        showToast("So'rovingiz yuborildi!", "success");
        closeModal("book-modal");
      } catch (err) {
        showToast(err.code === "permission-denied"
          ? "Siz bu kitobga allaqachon so'rov yuborgansiz (yoki e'lon endi mavjud emas)."
          : "Xatolik: " + err.message, "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "So'rovni yuborish";
      }
    });
  }
}

function ownerContactAndRequestFormHtml(owner, book) {
  const tg = owner?.telegram_username ? String(owner.telegram_username).replace("@", "") : "";
  const hasContact = owner?.phone || tg;
  const contactHtml = hasContact
    ? `<div class="flex flex-wrap gap-2 mt-3">
        ${owner.phone ? `<a href="tel:${escapeHtml(owner.phone)}" class="px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors">📞 ${escapeHtml(owner.phone)}</a>` : ""}
        ${tg ? `<a href="https://t.me/${encodeURIComponent(tg)}" target="_blank" rel="noopener" class="px-3 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-sm font-medium transition-colors">💬 @${escapeHtml(tg)}</a>` : ""}
      </div>`
    : `<p class="text-xs text-stone-400 mt-2">Bu foydalanuvchi kontakt ma'lumot qoldirmagan — quyidagi forma orqali ichki so'rov yuboring.</p>`;

  const me = state.profile || {};
  const mine = [me.phone, me.telegram_username && "@" + String(me.telegram_username).replace("@", "")].filter(Boolean).join(" · ");
  const t = book.title;
  const defaultMessage = book.type === "sotish"
    ? `Assalomu alaykum! "${t}" kitobini sotib olmoqchi edim.`
    : book.type === "ijara"
    ? `Assalomu alaykum! "${t}" kitobini ijaraga olmoqchi edim.`
    : book.type === "bepul"
    ? `Assalomu alaykum! "${t}" kitobini olsam bo'ladimi?`
    : `Assalomu alaykum! "${t}" kitobini almashishni xohlar edim.`;

  return `
    ${contactHtml}
    <form id="request-form" class="mt-4 space-y-2">
      <label class="block text-sm font-medium text-stone-700">Ichki so'rov yuborish</label>
      <p class="text-xs text-stone-500">Egasiga ko'rinadigan kontaktingiz: <b>${mine ? escapeHtml(mine) : "kiritilmagan"}</b> · <button type="button" data-open-profile class="text-emerald-700 hover:underline">${mine ? "o'zgartirish" : "kiritish"}</button></p>
      <textarea name="message" rows="3" required maxlength="1000" class="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:bg-white">${escapeHtml(defaultMessage)}</textarea>
      <button type="submit" class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold transition-colors">So'rovni yuborish</button>
    </form>`;
}

// ---------- So'rovlarim ----------
const REQ_STATUS = {
  yangi: { label: "Kutilmoqda", classes: "bg-stone-100 text-stone-600" },
  qabul: { label: "Qabul qilindi", classes: "bg-emerald-100 text-emerald-700" },
  rad: { label: "Rad etildi", classes: "bg-red-100 text-red-700" },
};

function contactLinksHtml(phone, telegram) {
  const tg = telegram ? String(telegram).replace("@", "") : "";
  const links = [];
  if (phone) links.push(`<a href="tel:${escapeHtml(phone)}" class="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium">📞 ${escapeHtml(phone)}</a>`);
  if (tg) links.push(`<a href="https://t.me/${encodeURIComponent(tg)}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-medium">💬 @${escapeHtml(tg)}</a>`);
  return links.length ? `<div class="flex flex-wrap gap-2 mt-2">${links.join("")}</div>` : "";
}

async function setRequestStatus(id, status) {
  try {
    await updateDoc(doc(db, "requests", id), { status });
    showToast(status === "qabul" ? "So'rov qabul qilindi. Endi u bilan bog'laning." : "So'rov rad etildi", "info");
    await renderMyRequestsView();
    refreshRequestBadge();
  } catch (err) {
    showToast("Xatolik: " + err.message, "error");
  }
}

async function renderMyRequestsView() {
  updateAuthGuards();
  if (!state.user) return;
  const uid = state.user.uid;
  const list = $("#requests-list");
  list.innerHTML = `<p class="text-stone-400 text-sm">Yuklanmoqda...</p>`;
  try {
    const [outSnap, inSnap] = await Promise.all([
      getDocs(query(collection(db, "requests"), where("requester_id", "==", uid))),
      getDocs(query(collection(db, "requests"), where("owner_id", "==", uid))),
    ]);
    const merged = new Map();
    [...outSnap.docs, ...inSnap.docs].forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
    const requests = [...merged.values()].sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? 1 : -1));
    state.requests = requests;

    const bookCache = new Map();
    const ownerCache = new Map();
    const fetchInto = (cache, col, id) => getDoc(doc(db, col, id))
      .then((s) => cache.set(id, s.exists() ? s.data() : null)).catch(() => cache.set(id, null));
    await Promise.all([
      ...[...new Set(requests.map((r) => r.book_id))].map((id) => fetchInto(bookCache, "books", id)),
      // qabul qilingan so'rovda kitob egasining kontaktini ko'rsatamiz (e'lon katalogdan olingan bo'lsa ham)
      ...[...new Set(requests.filter((r) => r.requester_id === uid && r.status === "qabul").map((r) => r.owner_id))]
        .map((id) => fetchInto(ownerCache, "profiles", id)),
    ]);

    if (requests.length === 0) {
      list.innerHTML = "";
      $("#requests-empty").classList.remove("hidden");
      return;
    }
    $("#requests-empty").classList.add("hidden");

    list.innerHTML = requests.map((r) => {
      const isMine = r.requester_id === uid;
      const book = bookCache.get(r.book_id);
      const st = REQ_STATUS[r.status] || REQ_STATUS.yangi;
      const stLabel = !isMine && r.status === "yangi" ? "Yangi" : st.label;
      let extra = "";
      if (isMine) {
        const o = ownerCache.get(r.owner_id);
        if (r.status === "qabul") extra = `<p class="text-xs text-emerald-700 mt-2">Kitob egasi so'rovingizni qabul qildi. Bog'laning:</p>${o ? contactLinksHtml(o.phone, o.telegram_username) : ""}`;
        else if (r.status === "rad") extra = `<p class="text-xs text-red-600 mt-2">Afsuski, egasi bu so'rovni rad etdi.</p>`;
      } else {
        const who = r.requester_name ? `<p class="text-xs text-stone-500 mt-2">Kimdan: <span class="font-medium text-stone-700">${escapeHtml(r.requester_name)}</span></p>` : "";
        extra = who + (contactLinksHtml(r.requester_phone, r.requester_telegram) || `<p class="text-xs text-stone-400 mt-1">Kontakt ko'rsatilmagan.</p>`);
        if (r.status === "yangi") extra += `<div class="flex gap-2 mt-3">
          <button data-req-status="${escapeHtml(r.id)}" data-req-value="qabul" class="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold">Qabul qilish</button>
          <button data-req-status="${escapeHtml(r.id)}" data-req-value="rad" class="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium">Rad etish</button>
        </div>`;
      }
      return `
        <div class="bg-white border border-stone-200 rounded-xl p-4 flex gap-3">
          <img src="${coverOf(book)}" data-fallback class="w-12 h-16 object-cover rounded-lg border border-stone-200 shrink-0" alt="" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-stone-900 truncate">${escapeHtml(book?.title || "Kitob (o'chirilgan)")}</p>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${isMine ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"} shrink-0">${isMine ? "Men yubordim" : "Menga kelgan"}</span>
            </div>
            <p class="text-sm text-stone-500 mt-1 line-clamp-2">${escapeHtml(r.message)}</p>
            ${extra}
            <p class="text-[11px] text-stone-400 mt-2">${timeAgo(r.created_at)} · <span class="px-1.5 py-0.5 rounded-full ${st.classes}">${stLabel}</span></p>
          </div>
        </div>`;
    }).join("");
    bindCoverFallback(list);
    $all("[data-req-status]", list).forEach((btn) =>
      btn.addEventListener("click", () => setRequestStatus(btn.dataset.reqStatus, btn.dataset.reqValue))
    );
  } catch (err) {
    list.innerHTML = "";
    showToast("Xatolik: " + err.message, "error");
  }
}

// ---------- Init ----------
(async function init() {
  renderAuthArea();
  updateAuthGuards();
  await loadBooks();
})();
