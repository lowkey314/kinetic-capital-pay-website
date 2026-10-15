document.addEventListener('DOMContentLoaded', function () {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const open = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (navMenu && navMenu.classList.contains('open')) navMenu.classList.remove('open');
      }
    });
  });

  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      const email = form.querySelector('input[type="email"]');
      const name = form.querySelector('input[name="name"]');
      if (!email.value || !name.value) {
        e.preventDefault();
        alert('Please fill in your name and email before sending.');
      } else {
        const submit = form.querySelector('button[type="submit"]');
        if (submit) {
          submit.disabled = true;
          submit.textContent = 'Sending…';
        }
      }
    });
  }
});
