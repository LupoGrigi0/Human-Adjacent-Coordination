/**
 * HACS Emergence Particle System
 *
 * Particles represent AI instances in the coordination system.
 * They start scattered and gradually form connections as users explore.
 * The animation IS the metaphor - not decoration.
 *
 * By: Flair-2a84
 */

class EmergenceParticles {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.connections = [];
    this.animationId = null;
    this.isRunning = false;

    // Configuration
    this.config = {
      particleCount: 80,
      particleMinRadius: 1.5,
      particleMaxRadius: 3,
      connectionDistance: 150,
      connectionOpacity: 0.15,
      baseSpeed: 0.3,
      // Colors from our design system
      particleColor: { r: 168, g: 85, b: 247 },  // purple-500
      connectionColor: { r: 147, g: 51, b: 234 }, // purple-600
      accentColor: { r: 34, g: 211, b: 238 },     // cyan-400
    };

    // State
    this.scrollProgress = 0;
    this.mouseX = null;
    this.mouseY = null;
    this.lastScrollY = 0;
    this.scrollVelocity = 0;

    this.init();
  }

  init() {
    this.resize();
    this.createParticles();
    this.bindEvents();
    this.start();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.width = rect.width;
    this.height = rect.height;
  }

  createParticles() {
    this.particles = [];

    for (let i = 0; i < this.config.particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: this.config.particleMinRadius +
                Math.random() * (this.config.particleMaxRadius - this.config.particleMinRadius),
        vx: (Math.random() - 0.5) * this.config.baseSpeed,
        vy: (Math.random() - 0.5) * this.config.baseSpeed,
        // Each particle has a "role" that affects its color slightly
        role: Math.random(),
        // Phase for subtle pulsing
        phase: Math.random() * Math.PI * 2,
        // Connection strength (increases as system "coordinates")
        connectionStrength: 0,
      });
    }
  }

  bindEvents() {
    // Resize handler with debounce
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.resize();
        // Redistribute particles on resize
        this.particles.forEach(p => {
          p.x = Math.min(p.x, this.width);
          p.y = Math.min(p.y, this.height);
        });
      }, 100);
    });

    // Scroll handler - updates coordination level
    window.addEventListener('scroll', () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      this.scrollProgress = scrollHeight > 0 ? window.scrollY / scrollHeight : 0;

      // Calculate scroll velocity for momentum effects
      this.scrollVelocity = window.scrollY - this.lastScrollY;
      this.lastScrollY = window.scrollY;
    }, { passive: true });

    // Mouse movement for subtle interaction
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      this.mouseX = null;
      this.mouseY = null;
    });

    // Visibility API - pause when tab not visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    if (!this.isRunning) return;

    this.update();
    this.draw();

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  update() {
    const time = Date.now() * 0.001;

    // Coordination factor increases with scroll (0 to 1)
    const coordinationFactor = this.scrollProgress;

    this.particles.forEach((p, i) => {
      // Base movement
      p.x += p.vx;
      p.y += p.vy;

      // Subtle pulsing radius
      const pulse = Math.sin(time * 2 + p.phase) * 0.3;
      p.currentRadius = p.radius + pulse;

      // Boundary wrapping with smooth transition
      if (p.x < -10) p.x = this.width + 10;
      if (p.x > this.width + 10) p.x = -10;
      if (p.y < -10) p.y = this.height + 10;
      if (p.y > this.height + 10) p.y = -10;

      // As coordination increases, particles slow down and cluster more
      const speedFactor = 1 - (coordinationFactor * 0.5);
      p.vx *= 0.99;
      p.vy *= 0.99;

      // Add slight random drift
      p.vx += (Math.random() - 0.5) * 0.02 * speedFactor;
      p.vy += (Math.random() - 0.5) * 0.02 * speedFactor;

      // Clamp velocity
      const maxSpeed = this.config.baseSpeed * speedFactor;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      // Mouse interaction - gentle attraction
      if (this.mouseX !== null && this.mouseY !== null) {
        const dx = this.mouseX - p.x;
        const dy = this.mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200 && dist > 10) {
          const force = 0.0003 * (1 - dist / 200);
          p.vx += dx * force;
          p.vy += dy * force;
        }
      }

      // Update connection strength based on scroll
      p.connectionStrength = coordinationFactor;
    });

    // Decay scroll velocity
    this.scrollVelocity *= 0.9;
  }

  draw() {
    // Clear with slight fade for trail effect
    this.ctx.fillStyle = 'rgba(10, 10, 10, 0.2)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw connections first (behind particles)
    this.drawConnections();

    // Draw particles
    this.drawParticles();
  }

  drawConnections() {
    const { connectionDistance, connectionColor, accentColor } = this.config;
    const coordinationFactor = this.scrollProgress;

    // Connection distance increases with coordination
    const effectiveDistance = connectionDistance * (0.5 + coordinationFactor * 0.8);

    this.ctx.lineWidth = 1;

    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < effectiveDistance) {
          // Opacity based on distance and coordination level
          const baseOpacity = (1 - dist / effectiveDistance) * this.config.connectionOpacity;
          const opacity = baseOpacity * (0.3 + coordinationFactor * 0.7);

          // Color shifts toward cyan as coordination increases
          const r = connectionColor.r + (accentColor.r - connectionColor.r) * coordinationFactor * 0.3;
          const g = connectionColor.g + (accentColor.g - connectionColor.g) * coordinationFactor * 0.3;
          const b = connectionColor.b + (accentColor.b - connectionColor.b) * coordinationFactor * 0.3;

          this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    }
  }

  drawParticles() {
    const { particleColor, accentColor } = this.config;
    const coordinationFactor = this.scrollProgress;

    this.particles.forEach(p => {
      // Color based on role and coordination
      const roleBlend = p.role * coordinationFactor;
      const r = particleColor.r + (accentColor.r - particleColor.r) * roleBlend * 0.4;
      const g = particleColor.g + (accentColor.g - particleColor.g) * roleBlend * 0.4;
      const b = particleColor.b + (accentColor.b - particleColor.b) * roleBlend * 0.4;

      // Opacity increases slightly with coordination
      const opacity = 0.6 + coordinationFactor * 0.3;

      // Glow effect
      const gradient = this.ctx.createRadialGradient(
        p.x, p.y, 0,
        p.x, p.y, p.currentRadius * 3
      );
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${opacity * 0.3})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.currentRadius * 3, 0, Math.PI * 2);
      this.ctx.fill();

      // Core dot
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity + 0.2})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.currentRadius, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  // Public method to set coordination manually (for demos)
  setCoordination(level) {
    this.scrollProgress = Math.max(0, Math.min(1, level));
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.emergenceParticles = new EmergenceParticles('particle-canvas');
});
