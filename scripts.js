// PrintFold promo page — light progressive enhancement.
// Reveals sections on scroll and keeps nav anchors smooth.

(function () {
  "use strict";

  // Tag elements that should animate in as they enter the viewport.
  var revealTargets = document.querySelectorAll(
    ".hero-inner, .feature, .step, .img-wide, .cta-band-inner"
  );

  if (!("IntersectionObserver" in window) || !revealTargets.length) {
    // No observer support: show everything immediately.
    revealTargets.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  revealTargets.forEach(function (el, i) {
    el.classList.add("reveal");
    // Gentle stagger for grouped items.
    el.style.transitionDelay = (i % 3) * 60 + "ms";
    observer.observe(el);
  });
})();
