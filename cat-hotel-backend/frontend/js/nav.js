// Injects a shared header/footer into every page (this is a plain
// static site with no build step, so this is the simplest way to
// avoid copy-pasting the nav markup into six HTML files) and adapts
// the nav links based on whether a LINE Login session exists.

const BRAND_MARK_SVG = `
<svg class="brand-mark" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M8 6L11 12M24 6L21 12" stroke="#2B2420" stroke-width="2" stroke-linecap="round"/>
  <circle cx="16" cy="18" r="10" fill="#D9A62E"/>
  <circle cx="12.5" cy="16.5" r="1.1" fill="#2B2420"/>
  <circle cx="19.5" cy="16.5" r="1.1" fill="#2B2420"/>
  <path d="M14.5 21c1 0.8 2 0.8 3 0" stroke="#2B2420" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

function headerHTML(active) {
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;

  return `
    <div class="wrap">
      <a class="brand" href="index.html">${BRAND_MARK_SVG}Catnap Hotel</a>
      <nav class="main-nav">
        ${link('index.html', 'หน้าแรก', 'home')}
        ${link('booking.html', 'จองห้องพัก', 'booking')}
        <span id="nav-auth-slot">${link('login.html', 'เข้าสู่ระบบ', 'login')}</span>
      </nav>
    </div>
  `;
}

function footerHTML() {
  return `
    <div class="wrap">
      <p>Catnap Hotel · ที่พักส่วนตัวสำหรับน้องแมว 8 ห้อง · สอบถามผ่าน LINE Official Account ได้ตลอดเวลา</p>
    </div>
  `;
}

/** Fetches the current session, or null if not signed in. Never throws. */
async function getSession() {
  try {
    const { data } = await api.get('/api/v1/auth/session');
    return data;
  } catch (_) {
    return null;
  }
}

async function renderNav(active) {
  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');
  if (headerEl) headerEl.innerHTML = headerHTML(active);
  if (footerEl) footerEl.innerHTML = footerHTML();

  const user = await getSession();
  const slot = document.getElementById('nav-auth-slot');
  if (slot && user) {
    slot.innerHTML = `<a href="profile.html" class="${active === 'profile' ? 'active' : ''}">${user.display_name} · ${user.points_balance} แต้ม</a>`;
  }
  return user;
}
