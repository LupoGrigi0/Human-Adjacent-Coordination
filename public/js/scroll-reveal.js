/**
 * HACS Scroll Reveal System
 *
 * Progressive disclosure through scroll-triggered animations.
 * Uses Intersection Observer for performance.
 *
 * By: Flair-2a84
 */

class ScrollReveal {
  constructor() {
    this.elements = document.querySelectorAll('.reveal');
    if (this.elements.length === 0) return;

    this.init();
  }

  init() {
    // Check for Intersection Observer support
    if (!('IntersectionObserver' in window)) {
      // Fallback: show all elements immediately
      this.elements.forEach(el => el.classList.add('reveal--visible'));
      return;
    }

    this.createObserver();
    this.observe();
  }

  createObserver() {
    const options = {
      root: null, // viewport
      rootMargin: '0px 0px -10% 0px', // trigger slightly before element enters
      threshold: 0.1, // 10% visible triggers
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--visible');
          // Unobserve after revealing (one-time animation)
          this.observer.unobserve(entry.target);
        }
      });
    }, options);
  }

  observe() {
    this.elements.forEach(el => {
      this.observer.observe(el);
    });
  }

  // Public method to add new elements dynamically
  add(element) {
    if (element && this.observer) {
      this.observer.observe(element);
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.scrollReveal = new ScrollReveal();
});
