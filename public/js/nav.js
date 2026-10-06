/**
 * HACS Navigation System
 *
 * Auto-hide navigation that appears on scroll-up, hides on scroll-down.
 * Mobile menu toggle functionality.
 *
 * By: Flair-2a84
 */

class Navigation {
  constructor() {
    this.nav = document.querySelector('.nav');
    this.toggle = document.querySelector('.nav__toggle');
    this.links = document.querySelector('.nav__links');

    if (!this.nav) return;

    this.lastScrollY = 0;
    this.scrollThreshold = 5;
    this.isHidden = false;
    this.isMobileMenuOpen = false;

    this.init();
  }

  init() {
    this.bindEvents();
    this.setActiveLink();
  }

  bindEvents() {
    // Scroll behavior
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    // Mobile toggle
    if (this.toggle) {
      this.toggle.addEventListener('click', () => this.toggleMobileMenu());
    }

    // Close mobile menu when clicking a link
    if (this.links) {
      this.links.querySelectorAll('.nav__link').forEach(link => {
        link.addEventListener('click', () => {
          if (this.isMobileMenuOpen) {
            this.toggleMobileMenu();
          }
        });
      });
    }

    // Close mobile menu on resize to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && this.isMobileMenuOpen) {
        this.closeMobileMenu();
      }
    });
  }

  handleScroll() {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - this.lastScrollY;

    // Don't hide nav at the very top
    if (currentScrollY < 100) {
      this.show();
      this.lastScrollY = currentScrollY;
      return;
    }

    // Scrolling down - hide nav (unless mobile menu is open)
    if (scrollDelta > this.scrollThreshold && !this.isMobileMenuOpen) {
      this.hide();
    }
    // Scrolling up - show nav
    else if (scrollDelta < -this.scrollThreshold) {
      this.show();
    }

    this.lastScrollY = currentScrollY;
  }

  hide() {
    if (!this.isHidden) {
      this.nav.classList.add('nav--hidden');
      this.isHidden = true;
    }
  }

  show() {
    if (this.isHidden) {
      this.nav.classList.remove('nav--hidden');
      this.isHidden = false;
    }
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;

    if (this.isMobileMenuOpen) {
      this.openMobileMenu();
    } else {
      this.closeMobileMenu();
    }
  }

  openMobileMenu() {
    this.links.classList.add('nav__links--open');
    this.toggle.setAttribute('aria-expanded', 'true');
    this.animateToggle(true);
  }

  closeMobileMenu() {
    this.links.classList.remove('nav__links--open');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.isMobileMenuOpen = false;
    this.animateToggle(false);
  }

  animateToggle(isOpen) {
    const bars = this.toggle.querySelectorAll('.nav__toggle-bar');
    if (bars.length < 3) return;

    if (isOpen) {
      bars[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      bars[1].style.opacity = '0';
      bars[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
      bars[0].style.transform = 'none';
      bars[1].style.opacity = '1';
      bars[2].style.transform = 'none';
    }
  }

  setActiveLink() {
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.nav__link');

    links.forEach(link => {
      const href = link.getAttribute('href');

      // Handle both exact matches and prefix matches for sections
      if (href === currentPath ||
          (currentPath.startsWith(href) && href !== '/')) {
        link.classList.add('nav__link--active');
      }
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.navigation = new Navigation();
});
