'use strict';

// Publish only after every field is supplied and verified by the school.
const mentorProfile = {
  verified: false,
  photo: '',
  photoAlt: '',
  name: '',
  experience: '',
  geography: '',
  competencies: '',
  story: '',
};
const mentorSection = document.getElementById('mentor');
const mentorFields = ['photo', 'photoAlt', 'name', 'experience', 'geography', 'competencies', 'story'];
if (mentorSection && mentorProfile.verified && mentorFields.every(key => typeof mentorProfile[key] === 'string' && mentorProfile[key].trim())) {
  const portrait = new Image();
  portrait.width = 800;
  portrait.height = 1000;
  portrait.alt = mentorProfile.photoAlt;
  portrait.decoding = 'async';
  portrait.addEventListener('load', () => { mentorSection.hidden = false; }, { once: true });
  portrait.src = mentorProfile.photo;
  mentorSection.querySelector('.mentor-photo').append(portrait);
  document.getElementById('mentor-name').textContent = mentorProfile.name;
  mentorSection.querySelectorAll('[data-mentor]').forEach(node => { node.textContent = mentorProfile[node.dataset.mentor]; });
}

const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const mobileLayout = window.matchMedia('(max-width: 1279px)');
if (menuToggle && nav) {
  document.documentElement.classList.add('menu-ready');
  menuToggle.hidden = false;
  const setMenu = (open, returnFocus = false) => {
    menuToggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    if (returnFocus) menuToggle.focus();
  };
  menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !mobileLayout.matches) return;
    setMenu(false);
    const target = document.getElementById(link.hash.slice(1));
    if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') setMenu(false, true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header') && menuToggle.getAttribute('aria-expanded') === 'true') setMenu(false);
  });
  mobileLayout.addEventListener('change', () => {
    const focusWillHide = mobileLayout.matches && nav.contains(document.activeElement);
    setMenu(false, focusWillHide);
  });
}

const navLinks = Array.from(document.querySelectorAll('.nav a'));
const navSections = navLinks.map(link => ({ link, section: document.getElementById(link.hash.slice(1)) })).filter(item => item.section);
if (navSections.length) {
  let positions = [];
  let frame = null;
  let activeLink;
  const updateActiveLink = () => {
    frame = null;
    const marker = window.scrollY + window.innerHeight * 0.35;
    let current = null;
    for (const item of positions) { if (item.top <= marker) current = item.link; }
    if (window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2) current = navSections[navSections.length - 1].link;
    if (current === activeLink) return;
    activeLink = current;
    navLinks.forEach(link => {
      link.classList.toggle('is-active', link === current);
      if (link === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const queueUpdate = () => { if (frame === null) frame = requestAnimationFrame(updateActiveLink); };
  const measureSections = () => {
    positions = navSections.map(({ link, section }) => ({ link, top: section.getBoundingClientRect().top + window.scrollY }));
    queueUpdate();
  };
  window.addEventListener('scroll', queueUpdate, { passive: true });
  window.addEventListener('resize', measureSections);
  window.addEventListener('load', measureSections, { once: true });
  window.addEventListener('hashchange', queueUpdate);
  if ('ResizeObserver' in window) new ResizeObserver(measureSections).observe(document.body);
  measureSections();
}
