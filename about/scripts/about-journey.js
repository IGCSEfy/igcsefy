(function () {
  'use strict';

  var surface = document.querySelector('[data-surface]');
  if (!surface) return;

  var root = document.documentElement;
  var motionNodes = Array.prototype.slice.call(document.querySelectorAll('[data-motion]'));
  var atmosphereNodes = Array.prototype.slice.call(document.querySelectorAll('[data-atmosphere]'));
  var threadProgress = document.querySelector('.about-thread-progress');
  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReducedMotion = reducedMotionQuery.matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var canAnimate = !prefersReducedMotion && !saveData;
  var lenis = null;
  var ticking = false;

  if (!canAnimate) {
    root.classList.add('reduced-motion');
    motionNodes.forEach(function (node) {
      node.style.opacity = '1';
      node.style.transform = 'none';
    });
    if (threadProgress) {
      threadProgress.style.transform = 'scaleY(1)';
    }
    return;
  }

  if (typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({
      duration: 1.05,
      smoothWheel: true,
      syncTouch: true,
      touchMultiplier: 1,
      wheelMultiplier: 0.92
    });

    function raf(time) {
      lenis.raf(time);
      window.requestAnimationFrame(raf);
    }

    window.requestAnimationFrame(raf);
    lenis.on('scroll', requestTick);
  } else {
    window.addEventListener('scroll', requestTick, { passive: true });
  }

  window.addEventListener('resize', requestTick);
  window.addEventListener('load', requestTick);
  window.addEventListener('pageshow', requestTick);
  requestTick();

  function requestTick() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateFrame);
  }

  function updateFrame() {
    ticking = false;

    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    var viewportCenter = viewportHeight * 0.5;
    var surfaceRect = surface.getBoundingClientRect();
    var pageProgress = clamp((-surfaceRect.top) / Math.max(surfaceRect.height - viewportHeight, 1), 0, 1);

    motionNodes.forEach(function (node) {
      var rect = node.getBoundingClientRect();
      var depth = parseFloat(node.getAttribute('data-depth') || '0.04');
      var center = rect.top + rect.height * 0.5;
      var travel = (center - viewportCenter) / viewportHeight;

      var revealInStart = viewportHeight * 1.06;
      var revealInDistance = viewportHeight * 0.92;
      var revealOutDistance = viewportHeight * 0.82;
      if (node.hasAttribute('data-motion-linger')) {
        revealInStart = viewportHeight * 1.0;
        revealInDistance = viewportHeight * 0.34;
        revealOutDistance = viewportHeight * 0.32;
      }

      var revealIn = clamp((revealInStart - rect.top) / revealInDistance, 0, 1);
      var revealOut = clamp(rect.bottom / revealOutDistance, 0, 1);
      var visibility = smoothstep(0, 1, Math.min(revealIn, revealOut));

      var directionX = node.classList.contains('about-node-right')
        ? -1
        : node.classList.contains('about-node-left')
          ? 1
          : 0;

      var driftY = -travel * depth * 150;
      var driftX = directionX * travel * depth * 28;
      var revealY = (1 - visibility) * 64;
      var scale = 0.95 + visibility * 0.05 - Math.abs(travel) * depth * 0.035;
      var opacity = clamp(0.16 + visibility * 0.84, 0, 1);

      node.style.opacity = opacity.toFixed(3);
      node.style.transform =
        'translate3d(' + driftX.toFixed(2) + 'px,' + (driftY + revealY).toFixed(2) + 'px,0) ' +
        'scale(' + scale.toFixed(4) + ')';
    });

    atmosphereNodes.forEach(function (node, index) {
      var depth = parseFloat(node.getAttribute('data-depth') || '0.06');
      var offsetY = (pageProgress - 0.5) * depth * 280;
      var offsetX = (index - 1) * (pageProgress - 0.5) * depth * 90;
      node.style.transform =
        'translate3d(' + offsetX.toFixed(2) + 'px,' + offsetY.toFixed(2) + 'px,0)';
    });

    if (threadProgress) {
      threadProgress.style.transform = 'scaleY(' + pageProgress.toFixed(4) + ')';
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function smoothstep(min, max, value) {
    var x = clamp((value - min) / Math.max(max - min, 0.00001), 0, 1);
    return x * x * (3 - 2 * x);
  }
})();
