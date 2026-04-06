/* About page scrollytelling (About-only) */
(function(){
  if(!document.querySelector('.about-journey')) return;

  if(typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined'){
    console.warn('GSAP/ScrollTrigger not loaded');
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll (Lenis)
  var lenis;
  if(typeof Lenis !== 'undefined'){
    lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    function raf(time){ lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function(t){ lenis.raf(t*1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // Reveal animations
  gsap.utils.toArray('.about-journey .reveal').forEach(function(el){
    // Founder copy is handled as a single staggered reveal (below)
    if(el.closest && el.closest('.j-founder-copy')) return;
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' }
    });
  });

  // About the Founder: clean staggered copy reveal
  var founderCopy = document.querySelector('.about-journey .j-founder-copy');
  if(founderCopy){
    var founderLines = gsap.utils.toArray(founderCopy.querySelectorAll('.reveal'));
    gsap.to(founderLines, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      stagger: 0.14,
      scrollTrigger: { trigger: founderCopy, start: 'top 85%' }
    });
  }

  // Hero background parallax
  gsap.to('.about-journey .j-hero-bg', {
    y: 60,
    ease: 'none',
    scrollTrigger: {
      trigger: '.about-journey .j-hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true
    }
  });

  // Pin steps
  var steps = gsap.utils.toArray('.about-journey .j-step');
  if(steps.length){
    ScrollTrigger.create({
      trigger: '.about-journey .j-pin',
      start: 'top top',
      end: '+=900',
      pin: true,
      scrub: true
    });

    gsap.fromTo(steps,
      { opacity: 0.2, y: 18 },
      {
        opacity: 1,
        y: 0,
        stagger: 0.22,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.about-journey .j-pin',
          start: 'top top',
          end: '+=900',
          scrub: true
        }
      }
    );
  }

  // Counters
  function animateCounter(el, to){
    var obj = { val: 0 };
    gsap.to(obj, {
      val: to,
      duration: 1.2,
      ease: 'power2.out',
      onUpdate: function(){
        var v = Math.round(obj.val);
        el.textContent = v.toLocaleString();
      }
    });
  }

  ScrollTrigger.batch('.about-journey .j-stat-num', {
    start: 'top 85%',
    once: true,
    onEnter: function(batch){
      batch.forEach(function(el){
        var to = parseInt(el.dataset.count || '0', 10);
        animateCounter(el, to);
      });
    }
  });

  // SVG draw
  var path = document.querySelector('#journeyPath');
  if(path && path.getTotalLength){
    var length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    gsap.to(path, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '.about-journey .j-svg',
        start: 'top 80%',
        end: 'bottom 40%',
        scrub: true
      }
    });
  }

  // Feature cards
  gsap.utils.toArray('.about-journey .j-card').forEach(function(card){
    gsap.to(card, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: card, start: 'top 85%' }
    });
  });

  // Horizontal scroll track
  var track = document.querySelector('.about-journey .j-track');
  var hscroll = document.querySelector('.about-journey .j-hscroll');
  if(track && hscroll){
    var getDistance = function(){
      return track.scrollWidth - document.documentElement.clientWidth;
    };

    gsap.to(track, {
      x: function(){ return -getDistance(); },
      ease: 'none',
      scrollTrigger: {
        trigger: hscroll,
        start: 'top top',
        end: function(){ return '+=' + Math.max(getDistance(), 600); },
        pin: true,
        scrub: true,
        invalidateOnRefresh: true
      }
    });
  }

  // CTA breathing
  gsap.to('.about-journey .j-cta-bg', {
    opacity: 0.55,
    duration: 2.4,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1
  });

  // About page stays in dark mode for now (no theme toggle)

})();
