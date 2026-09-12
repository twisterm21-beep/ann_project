// Load decorative photos only when their section approaches the viewport.
const photoTargets = document.querySelectorAll('.section, .places, .place-card, .cta');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('photo-on');
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: '250px 0px' });
  photoTargets.forEach(element => observer.observe(element));
} else {
  photoTargets.forEach(element => element.classList.add('photo-on'));
}

const navLinks = Array.from(document.querySelectorAll('.nav a'));
const navSections = navLinks.map(link => ({
  link,
  section: document.getElementById(link.hash.slice(1)),
})).filter(item => item.section);

if (navSections.length) {
  let positions = [];
  let frame = null;
  let activeLink;
  const updateActiveLink = () => {
    frame = null;
    const marker = window.scrollY + window.innerHeight * 0.35;
    let current = null;
    for (const item of positions) {
      if (item.top <= marker) current = item.link;
    }
    // Short final sections cannot always reach the marker before the page ends.
    if (window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2) {
      current = navSections[navSections.length - 1].link;
    }
    if (current === activeLink) return;
    activeLink = current;
    navLinks.forEach(link => {
      link.classList.toggle('is-active', link === current);
      if (link === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const queueUpdate = () => {
    if (frame === null) frame = requestAnimationFrame(updateActiveLink);
  };
  const measureSections = () => {
    positions = navSections.map(({ link, section }) => ({
      link,
      top: section.getBoundingClientRect().top + window.scrollY,
    }));
    queueUpdate();
  };
  // Geometry is measured on layout changes, not on every scroll frame.
  window.addEventListener('scroll', queueUpdate, { passive: true });
  window.addEventListener('resize', measureSections);
  window.addEventListener('load', measureSections, { once: true });
  window.addEventListener('hashchange', queueUpdate);
  if ('ResizeObserver' in window) new ResizeObserver(measureSections).observe(document.body);
  measureSections();
}
