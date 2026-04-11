(function () {
  var ANALYTICS_ID = 'G-T6XYBEBL4Z';
  var ANALYTICS_READY_KEY = '__igcsefyAnalyticsReady';
  var SCRIPT_SELECTOR = 'script[src*="googletagmanager.com/gtag/js?id=' + ANALYTICS_ID + '"]';

  if (window[ANALYTICS_READY_KEY]) {
    return;
  }

  if (typeof window.gtag === 'function' || document.querySelector(SCRIPT_SELECTOR)) {
    window[ANALYTICS_READY_KEY] = true;
    return;
  }

  window[ANALYTICS_READY_KEY] = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ANALYTICS_ID);
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', ANALYTICS_ID);
})();
