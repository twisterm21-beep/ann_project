const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals = document.querySelectorAll(".reveal");

reveals.forEach((item, index) => {
  item.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 80}ms`);
});

const revealVisibleItems = () => {
  reveals.forEach(item => {
    const rect = item.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;

    if (isVisible) {
      item.classList.add("is-visible");
    }
  });
};

const scrollToCurrentHash = () => {
  if (!window.location.hash) {
    return;
  }

  const target = document.querySelector(window.location.hash);

  if (target) {
    target.scrollIntoView({ block: "start" });
    requestAnimationFrame(revealVisibleItems);
  }
};

if (!prefersReducedMotion && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.16 }
  );

  reveals.forEach(item => observer.observe(item));
  window.addEventListener("load", revealVisibleItems);
  window.addEventListener("load", () => setTimeout(scrollToCurrentHash, 80));
  window.addEventListener("hashchange", () => requestAnimationFrame(revealVisibleItems));
  setTimeout(revealVisibleItems, 120);
} else {
  reveals.forEach(item => item.classList.add("is-visible"));
}

const navLinks = Array.from(document.querySelectorAll(".nav a"));
const navSections = navLinks
  .map(link => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window && navSections.length) {
  const spy = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = `#${entry.target.id}`;
          navLinks.forEach(link =>
            link.classList.toggle("is-active", link.getAttribute("href") === id)
          );
        }
      }
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );

  navSections.forEach(section => spy.observe(section));
}

if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
  const root = document.documentElement;
  const hero = document.querySelector(".hero");
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let rafId = null;
  let heroVisible = true;

  const step = () => {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    root.style.setProperty("--tilt-x", `${currentX.toFixed(2)}px`);
    root.style.setProperty("--tilt-y", `${currentY.toFixed(2)}px`);

    // Stop the loop once movement has settled — no perpetual rAF.
    if (Math.abs(targetX - currentX) < 0.1 && Math.abs(targetY - currentY) < 0.1) {
      rafId = null;
      return;
    }

    rafId = requestAnimationFrame(step);
  };

  const kick = () => {
    if (rafId === null && heroVisible) {
      rafId = requestAnimationFrame(step);
    }
  };

  window.addEventListener(
    "mousemove",
    event => {
      if (!heroVisible) {
        return;
      }
      targetX = (event.clientX / window.innerWidth - 0.5) * 14;
      targetY = (event.clientY / window.innerHeight - 0.5) * 14;
      kick();
    },
    { passive: true }
  );

  // Only animate while the hero is actually on screen.
  if (hero && "IntersectionObserver" in window) {
    const heroObserver = new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      if (!heroVisible && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
    heroObserver.observe(hero);
  }
}
