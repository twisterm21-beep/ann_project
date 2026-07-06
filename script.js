const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals = document.querySelectorAll(".reveal");

reveals.forEach((item, index) => {
  item.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 80}ms`);
});

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
} else {
  reveals.forEach(item => item.classList.add("is-visible"));
}

if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  document.addEventListener("mousemove", event => {
    targetX = (event.clientX / window.innerWidth - 0.5) * 14;
    targetY = (event.clientY / window.innerHeight - 0.5) * 14;
  });

  const animatePointer = () => {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    document.documentElement.style.setProperty("--tilt-x", `${currentX}px`);
    document.documentElement.style.setProperty("--tilt-y", `${currentY}px`);
    requestAnimationFrame(animatePointer);
  };

  animatePointer();
}
