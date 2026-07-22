/**
 * Scroll fluido: hero (demo), planes y checkout.
 * Pausa el video al scrollear; oculta fondos fijos pesados por zona.
 */
(function () {
  "use strict";

  function init() {
    var root = document.documentElement;
    if (!root || typeof window.IntersectionObserver !== "function") return;

    var heroBlock = document.querySelector(".hero-video-block");
    var planesSection = document.getElementById("planes");
    var flowPanel = document.getElementById("flowPanel");
    var demoVideo = document.getElementById("heroDemoVideo");

    var videoWasPlaying = false;
    var heroInView = false;
    var planesInView = false;

    function pauseDemoVideo() {
      if (!demoVideo || demoVideo.paused) return;
      videoWasPlaying = true;
      try {
        demoVideo.pause();
      } catch (_) {}
    }

    function canResumeDemoVideo() {
      if (demoVideo && demoVideo.dataset.userPaused === "1") return false;
      if (!heroInView || planesInView) return false;
      if (flowPanel && !flowPanel.classList.contains("flow-panel--hidden")) return false;
      return true;
    }

    function resumeDemoVideo() {
      if (!demoVideo || !videoWasPlaying || !canResumeDemoVideo()) return;
      videoWasPlaying = false;
      try {
        var p = demoVideo.play();
        if (p && typeof p.catch === "function") p.catch(function () {});
      } catch (_) {}
    }

    if (demoVideo) {
      demoVideo.addEventListener("play", function () {
        if (!demoVideo.paused) delete demoVideo.dataset.userPaused;
      });
    }

    if (heroBlock) {
      var heroIo = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            heroInView = entries[i].isIntersecting;
            if (heroInView) {
              root.classList.add("zc-hero-inview");
            } else {
              root.classList.remove("zc-hero-inview");
              pauseDemoVideo();
            }
          }
        },
        { root: null, rootMargin: "0px", threshold: 0.08 },
      );
      heroIo.observe(heroBlock);
    }

    if (planesSection) {
      var planesIo = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            planesInView = entries[i].isIntersecting;
            if (planesInView) {
              root.classList.add("zc-planes-inview");
              pauseDemoVideo();
            } else {
              root.classList.remove("zc-planes-inview");
              resumeDemoVideo();
            }
          }
        },
        { root: null, rootMargin: "120px 0px 120px 0px", threshold: 0 },
      );
      planesIo.observe(planesSection);
    }

    var SCROLL_IDLE_MS = 180;
    var scrollIdleTimer = 0;

    function onScrollActivity() {
      root.classList.add("zc-is-scrolling");
      pauseDemoVideo();
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(function () {
        root.classList.remove("zc-is-scrolling");
        resumeDemoVideo();
      }, SCROLL_IDLE_MS);
    }

    var passive = { passive: true };
    window.addEventListener("scroll", onScrollActivity, passive);
    window.addEventListener("wheel", onScrollActivity, passive);
    window.addEventListener("touchmove", onScrollActivity, passive);

    if ("onscrollend" in window) {
      window.addEventListener(
        "scrollend",
        function () {
          if (scrollIdleTimer) {
            clearTimeout(scrollIdleTimer);
            scrollIdleTimer = 0;
          }
          root.classList.remove("zc-is-scrolling");
          resumeDemoVideo();
        },
        passive,
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
