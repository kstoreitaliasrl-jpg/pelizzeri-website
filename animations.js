// ==========================================
// PAGE TRANSITION (enter)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('pageTransition');
    if (overlay) {
        overlay.classList.remove('slide-in');
        overlay.classList.add('slide-out');
        setTimeout(() => overlay.classList.remove('slide-out'), 600);
    }
});

document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto') || href.startsWith('http') || href.startsWith('tel')) return;
    link.addEventListener('click', e => {
        e.preventDefault();
        const overlay = document.getElementById('pageTransition');
        if (overlay) {
            overlay.classList.add('slide-in');
            setTimeout(() => { window.location.href = href; }, 560);
        } else {
            window.location.href = href;
        }
    });
});

// ==========================================
// PAGE LOADER
// ==========================================
window.addEventListener('load', () => {
    const loader = document.querySelector('.page-loader');
    if (loader) setTimeout(() => loader.classList.add('hide'), 800);
});

// ==========================================
// CUSTOM CURSOR (smooth ring)
// ==========================================
const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (dot) { dot.style.left = mouseX + 'px'; dot.style.top = mouseY + 'px'; }
});

(function animateRing() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    if (ring) { ring.style.left = ringX + 'px'; ring.style.top = ringY + 'px'; }
    requestAnimationFrame(animateRing);
})();

document.querySelectorAll('a, button, .featured-item, .gallery-item, .category-card').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
});

// ==========================================
// 1. SCROLL PROGRESS BAR
// ==========================================
const scrollBar = document.getElementById('scrollBar');
function updateScrollBar() {
    if (!scrollBar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollBar.style.width = ((window.scrollY / max) * 100) + '%';
}
window.addEventListener('scroll', updateScrollBar, { passive: true });

// ==========================================
// 2. PARALLAX HERO
// ==========================================
const heroImg = document.querySelector('.hero img');
window.addEventListener('scroll', () => {
    if (!heroImg) return;
    heroImg.style.transform = `scale(1) translateY(${window.scrollY * 0.28}px)`;
}, { passive: true });

// ==========================================
// 3. SCROLL VELOCITY SKEW
// ==========================================
let lastScrollY = window.scrollY;
let skewTicking = false;
window.addEventListener('scroll', () => {
    if (skewTicking) return;
    skewTicking = true;
    requestAnimationFrame(() => {
        const vel = window.scrollY - lastScrollY;
        const skew = Math.max(-5, Math.min(5, vel * 0.18));
        document.querySelectorAll('.gallery-item img, .featured-item img').forEach(img => {
            img.style.transform = `skewY(${skew}deg)`;
        });
        lastScrollY = window.scrollY;
        skewTicking = false;
    });
}, { passive: true });

// ==========================================
// 4. SCROLL REVEAL
// ==========================================
const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .img-wrap');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });
revealEls.forEach(el => observer.observe(el));
window.revealObserver = observer;

// ==========================================
// 5. NAVBAR SCROLL SHRINK
// ==========================================
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    if (!navbar) return;
    const shrink = window.scrollY > 60;
    navbar.style.padding = shrink ? '12px 60px' : '20px 60px';
    navbar.style.boxShadow = shrink ? '0 2px 20px rgba(0,0,0,0.07)' : 'none';
}, { passive: true });

// ==========================================
// 6. BACK TO TOP
// ==========================================
const backTop = document.getElementById('backTop');
window.addEventListener('scroll', () => {
    if (!backTop) return;
    backTop.classList.toggle('show', window.scrollY > 400);
}, { passive: true });
if (backTop) backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ==========================================
// 7. LIGHTBOX
// ==========================================
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxCounter = document.getElementById('lightboxCounter');

let lightboxImages = [];
let lightboxIndex = 0;

function buildLightboxList() {
    lightboxImages = Array.from(document.querySelectorAll('.gallery-item img, .featured-item img'));
}

function openLightbox(img) {
    if (!lightbox || !lightboxImg) return;
    lightboxIndex = lightboxImages.indexOf(img);
    lightboxImg.src = img.src;
    updateCounter();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    if (lightbox) { lightbox.classList.remove('active'); document.body.style.overflow = ''; }
}

function updateCounter() {
    if (lightboxCounter) lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
}

function lightboxNav(dir) {
    lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
    lightboxImg.style.opacity = '0';
    setTimeout(() => {
        lightboxImg.src = lightboxImages[lightboxIndex].src;
        lightboxImg.style.opacity = '1';
        updateCounter();
    }, 200);
}

if (lightboxImg) lightboxImg.style.transition = 'opacity 0.2s ease';

buildLightboxList();

document.querySelectorAll('.gallery-item, .featured-item').forEach(el => {
    el.addEventListener('click', () => {
        const img = el.querySelector('img');
        if (img) openLightbox(img);
    });
});

if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'ArrowLeft') lightboxNav(-1);
});

// Lightbox swipe
let touchStartX = 0;
if (lightbox) {
    lightbox.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; });
    lightbox.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) lightboxNav(diff > 0 ? 1 : -1);
    });
}

// ==========================================
// 8. 3D TILT EFFECT
// ==========================================
document.querySelectorAll('.gallery-item, .featured-item, .category-img').forEach(el => {
    el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(700px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) scale(1.02)`;
        el.style.transition = 'transform 0.1s ease';
    });
    el.addEventListener('mouseleave', () => {
        el.style.transform = 'perspective(700px) rotateY(0) rotateX(0) scale(1)';
        el.style.transition = 'transform 0.6s ease';
    });
});

// ==========================================
// 9. MAGNETIC BUTTON
// ==========================================
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mousemove', e => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.28}px, ${y * 0.28}px)`;
        btn.style.transition = 'transform 0.1s ease';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate(0,0)';
        btn.style.transition = 'transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)';
    });
});

// ==========================================
// 10. TYPEWRITER EFFECT
// ==========================================
function runTypewriter(el, text, delay) {
    clearTimeout(el._twTimer);
    el.textContent = '';
    el.classList.add('typewriter-typing');
    let i = 0;
    const type = () => {
        if (i < text.length) {
            el.textContent += text.charAt(i++);
            el._twTimer = setTimeout(type, 55 + Math.random() * 35);
        } else {
            el.classList.remove('typewriter-typing');
        }
    };
    el._twTimer = setTimeout(type, delay !== undefined ? delay : 1600);
}
window.runTypewriter = runTypewriter;

document.querySelectorAll('.typewriter-text').forEach(el => {
    const text = el.dataset.text || el.textContent;
    runTypewriter(el, text, 1600);
});

// ==========================================
// 11. SPLIT WORD REVEAL
// ==========================================
document.querySelectorAll('.split-word').forEach(el => {
    const words = el.textContent.trim().split(' ');
    el.innerHTML = words.map((w, i) =>
        `<span class="word" style="transition-delay:${i * 0.07}s">${w}&nbsp;</span>`
    ).join('');
});

const wordObs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); wordObs.unobserve(e.target); } });
}, { threshold: 0.2 });
document.querySelectorAll('.split-word').forEach(el => wordObs.observe(el));

// ==========================================
// 12. COUNTER ANIMATION
// ==========================================
function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1800;
    const startTime = performance.now();
    const step = (now) => {
        const p = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target);
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

const counterObs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { animateCounter(e.target); counterObs.unobserve(e.target); } });
}, { threshold: 0.5 });
document.querySelectorAll('.counter-num').forEach(el => counterObs.observe(el));

// ==========================================
// HORIZONTAL SCROLL DRAG
// ==========================================
const hTrack = document.getElementById('hscrollTrack');
if (hTrack) {
    let isDown = false, startX, scrollLeft;
    hTrack.addEventListener('mousedown', e => {
        isDown = true; hTrack.style.cursor = 'grabbing';
        startX = e.pageX - hTrack.offsetLeft;
        scrollLeft = hTrack.scrollLeft;
    });
    hTrack.addEventListener('mouseleave', () => { isDown = false; hTrack.style.cursor = 'grab'; });
    hTrack.addEventListener('mouseup', () => { isDown = false; hTrack.style.cursor = 'grab'; });
    hTrack.addEventListener('mousemove', e => {
        if (!isDown) return; e.preventDefault();
        const x = e.pageX - hTrack.offsetLeft;
        hTrack.scrollLeft = scrollLeft - (x - startX) * 1.4;
    });
}

// ==========================================
// MOBILE MENU
// ==========================================
function toggleMenu() {
    document.getElementById('mobileMenu').classList.toggle('open');
}

// ==========================================
// ADMIN SIDEBAR
// ==========================================
const _asbHTML = `
  <div id="adminSidebarOverlay"></div>
  <div id="adminSidebar">
    <button class="asb-close" id="asbClose">&#x2715;</button>
    <div class="asb-logo">A. Pelizzeri</div>
    <div class="asb-lock">&#x1F512;</div>
    <div class="asb-fg">
      <label>Username</label>
      <input type="text" id="asbUser" placeholder="Username" autocomplete="username"/>
    </div>
    <div class="asb-fg">
      <label>Password</label>
      <div class="asb-pw">
        <input type="password" id="asbPass" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" autocomplete="current-password"/>
        <button class="asb-eye" id="asbEye" type="button">&#x1F441;</button>
      </div>
    </div>
    <button class="asb-login-btn" id="asbLoginBtn">Login</button>
    <div class="asb-err" id="asbErr"></div>
    <div class="asb-note">
      <div class="asb-note-divider"></div>
      <div class="asb-note-tagline">Antonio Pelizzeri</div>
      <div class="asb-note-item">Napoli, Italia</div>
      <div class="asb-note-item">info@antoniopelizzeri.it</div>
      <div class="asb-note-item">Architetto &amp; Pittore</div>
      <div class="asb-note-socials">
        <a href="https://www.facebook.com/Antonio%20Pelizzeri" target="_blank" rel="noopener" class="asb-social-btn">Facebook</a>
      </div>
      <div class="asb-note-copy">&copy; 2026 Antonio Pelizzeri</div>
    </div>
  </div>
`;
document.addEventListener('DOMContentLoaded', function () {
    document.body.insertAdjacentHTML('beforeend', _asbHTML);
    document.getElementById('adminSidebarOverlay').addEventListener('click', closeAdminSidebar);
    document.getElementById('asbClose').addEventListener('click', closeAdminSidebar);
    document.getElementById('asbEye').addEventListener('click', function () {
        const p = document.getElementById('asbPass');
        p.type = p.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('asbLoginBtn').addEventListener('click', doAdminLogin);
    document.getElementById('asbUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdminLogin(); });
    document.getElementById('asbPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdminLogin(); });
});

function openAdminSidebar() {
    document.getElementById('adminSidebar').classList.add('asb-open');
    document.getElementById('adminSidebarOverlay').classList.add('asb-open');
    document.getElementById('asbErr').textContent = '';
    document.getElementById('asbLoginBtn').disabled = false;
    document.getElementById('asbLoginBtn').textContent = 'Login';
    setTimeout(() => document.getElementById('asbUser').focus(), 350);
}

function closeAdminSidebar() {
    document.getElementById('adminSidebar').classList.remove('asb-open');
    document.getElementById('adminSidebarOverlay').classList.remove('asb-open');
}

async function doAdminLogin() {
    const btn = document.getElementById('asbLoginBtn');
    const err = document.getElementById('asbErr');
    const user = document.getElementById('asbUser').value.trim();
    const pass = document.getElementById('asbPass').value;
    let popup = null;
    if (!user || !pass) { err.textContent = 'Username aur password dono darj karo.'; return; }
    btn.disabled = true; btn.textContent = 'Logging in\u2026'; err.textContent = '';
    popup = window.open('', '_blank');
    try {
        const r = await fetch('http://localhost:4000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const d = await r.json();
        if (r.ok) {
            btn.textContent = '\u2713 Done! Redirecting\u2026';
            const dashboardUrl = 'http://localhost:4000/dashboard?ap_tk=' + encodeURIComponent(d.token);
            if (popup) {
                popup.opener = null;
                popup.location = dashboardUrl;
            } else {
                window.location.href = dashboardUrl;
            }
            document.getElementById('asbUser').value = '';
            document.getElementById('asbPass').value = '';
            err.textContent = '';
            closeAdminSidebar();
            btn.disabled = false;
            btn.textContent = 'Login';
        } else {
            if (popup) popup.close();
            err.textContent = d.error || 'Login fail.';
            btn.disabled = false; btn.textContent = 'Login';
        }
    } catch (e) {
        if (popup) popup.close();
        err.textContent = 'Server nahi mila. Admin server chal raha hai? (localhost:4000)';
        btn.disabled = false; btn.textContent = 'Login';
    }
}

