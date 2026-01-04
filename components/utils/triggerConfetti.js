/**
 * Triggers a confetti celebration effect from both sides
 * Only runs on client-side
 */
export default async function triggerConfetti() {
  if (typeof window === 'undefined') return;
  
  try {
    const confetti = (await import('canvas-confetti')).default;
    
    const duration = 150;
    const end = Date.now() + duration;

    const colors = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff69b4', '#ffd700', '#ffffff'];

    // Scale values based on screen width
    const screenWidth = window.innerWidth;
    // Velocity: Mobile (~400px) = ~40, Desktop (~1920px) = ~90
    const startVelocity = Math.min(90, Math.max(40, screenWidth * 0.045)) * 0.7;
    // Drift: More drift on larger screens to push particles towards center
    // Mobile = ~0.5, Desktop = ~2
    const drift = Math.min(2, Math.max(0.5, screenWidth * 0.001)) * 2;
    // Ticks (fadeout): Longer on larger screens so particles stay visible
    // Mobile = ~300, Desktop = ~600
    const ticks = Math.min(600, Math.max(300, screenWidth * 0.3)) * 0.2;

    // Particles: Mobile = ~3, Desktop = ~8
    const particleCount = Math.round(Math.min(8, Math.max(3, screenWidth * 0.004))) * 2;
    
    const gravity = 1.2;

    // Cannon from left side
    function fireLeft() {
      confetti({
        particleCount,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.6 },
        colors: colors,
        zIndex: 9999,
        startVelocity: startVelocity,
        gravity: gravity,
        drift: drift,
        scalar: 1.3,
        ticks: ticks,
        shapes: ['square', 'circle']
      });
    }

    // Cannon from right side
    function fireRight() {
      confetti({
        particleCount,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.6 },
        colors: colors,
        zIndex: 9999,
        startVelocity: startVelocity,
        gravity: gravity,
        drift: -drift,
        scalar: 1.3,
        ticks: ticks,
        shapes: ['square', 'circle']
      });
    }

    // Fire continuously from both sides
    (function frame() {
      fireLeft();
      fireRight();

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());

  } catch (error) {
    console.error('Error triggering confetti:', error);
  }
}

