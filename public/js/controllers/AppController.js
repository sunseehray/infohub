/**
 * AppController
 * Manages client-side page routing and the mobile navigation drawer.
 */
const AppController = (() => {

  // ── Routing ──────────────────────────────────────────────────────────────────

  function navigate(page) {
    // Show the correct page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');

    // Update desktop nav active state
    document.querySelectorAll('nav.desktop-nav a').forEach(a => a.classList.remove('active'));
    const dNavEl = document.getElementById('nav-' + page);
    if (dNavEl) dNavEl.classList.add('active');

    // Update mobile nav active state
    document.querySelectorAll('.mobile-nav a').forEach(a => a.classList.remove('active'));
    const mNavEl = document.getElementById('mnav-' + page);
    if (mNavEl) mNavEl.classList.add('active');

    window.scrollTo(0, 0);
  }

  // ── Mobile nav drawer ────────────────────────────────────────────────────────

  function toggleMobileNav() {
    const burger  = document.getElementById('burgerBtn');
    const nav     = document.getElementById('mobileNav');
    const overlay = document.getElementById('mobileOverlay');
    const isOpen  = nav.classList.toggle('open');
    burger.classList.toggle('open', isOpen);
    overlay.classList.toggle('visible', isOpen);
  }

  function closeMobileNav() {
    document.getElementById('mobileNav').classList.remove('open');
    document.getElementById('burgerBtn').classList.remove('open');
    document.getElementById('mobileOverlay').classList.remove('visible');
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    // Wire up logo
    document.querySelector('.logo')
      ?.addEventListener('click', e => { e.preventDefault(); navigate('home'); });

    // Wire desktop nav links
    document.getElementById('nav-home')
      ?.addEventListener('click', e => { e.preventDefault(); navigate('home'); });
    document.getElementById('nav-tasks')
      ?.addEventListener('click', e => { e.preventDefault(); navigate('tasks'); });

    // Wire mobile nav links
    document.getElementById('mnav-home')?.addEventListener('click', e => {
      e.preventDefault(); navigate('home'); closeMobileNav();
    });
    document.getElementById('mnav-tasks')?.addEventListener('click', e => {
      e.preventDefault(); navigate('tasks'); closeMobileNav();
    });

    // Burger button
    document.getElementById('burgerBtn')
      ?.addEventListener('click', toggleMobileNav);

    // Mobile overlay click-away
    document.getElementById('mobileOverlay')
      ?.addEventListener('click', closeMobileNav);

    // Dashboard task-widget links → navigate to tasks page
    document.querySelectorAll('.task-widget').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); navigate('tasks'); });
    });

    navigate('home');
  }

  return { init, navigate, closeMobileNav };

})();
