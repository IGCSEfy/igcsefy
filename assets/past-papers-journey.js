/* Past Papers page motion
   Keep the subtle hero background parallax, but render page content immediately
   without the About-style reveal animation.
*/
(function(){
  if(!document.querySelector('.past-papers-journey')) return;

  if(typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined'){
    console.warn('GSAP/ScrollTrigger not loaded');
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll (Lenis) – keep identical to Subjects page
  var lenis;
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = (navigator.connection && navigator.connection.saveData) ? true : false;

  if(typeof Lenis !== 'undefined' && !prefersReduced && !saveData){
    lenis = new Lenis({ smoothWheel: true, duration: 1.05 });
    function raf(time){ lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function(t){ lenis.raf(t*1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // Past Papers page is the only place ScrollTrigger runs here, so on dynamic renders
  // we can safely reset all triggers to avoid duplicates / missed observers.

  function bind(){
    ScrollTrigger.getAll().forEach(function(st){
      try{ st.kill(); }catch(e){}
    });

    document.querySelectorAll('.past-papers-journey .reveal').forEach(function(el){
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.willChange = 'auto';
    });

    // Keep only the subtle hero background parallax.
    var heroBg = document.querySelector('.past-papers-journey .pp-hero-bg');
    if(heroBg){
      gsap.to(heroBg, {
        y: 50,
        ease: 'none',
        scrollTrigger: {
          trigger: '.past-papers-journey .pp-hero',
          start: 'top top',
          end: 'bottom top',
          scrub: true
        }
      });
    }
  }

  // Expose refresh hook for dynamic renders
  window.ppScrollRefresh = function(){
    bind();
    if(lenis && typeof lenis.resize === 'function'){
      try{ lenis.resize(); }catch(e){}
    }
    ScrollTrigger.refresh(true);
  };

  // Initial bind
  window.ppScrollRefresh();

})();
