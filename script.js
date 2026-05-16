/**
 * ZetaCore — Métodos de pago (solo local)
 * QR en assets: Mensual_Pago.jpeg, Perma_Pago.jpeg, Denuvo_Pago.jpeg,
 *               Mensual_Binance.jpeg, Perma_Binance.jpeg, Denuvo_Binance.jpeg
 */

(function () {
  "use strict";

  var WA_URL = "https://wa.me/59176045341";
  var GUARD_API_BASE = "https://zetacoreguard.zplir1501.workers.dev";

  function comprobanteApiUrl() {
    var host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "/api/comprobante";
    }
    return GUARD_API_BASE.replace(/\/$/, "") + "/pagos/comprobante";
  }

  var PLANS = {
    mensual: {
      id: "mensual",
      label: "Plan Mensual",
      bs: "69",
      usdt: "10",
      desc: "Acceso mensual completo a ZetaCore.",
    },
    permanente: {
      id: "permanente",
      label: "Plan Permanente + Activación Denuvo",
      bs: "399",
      usdt: "55",
      desc: "Acceso permanente a ZetaCore con activación Denuvo incluida.",
    },
    denuvo: {
      id: "denuvo",
      label: "Activación Denuvo",
      bs: "99",
      usdt: "14",
      desc: "Activación adicional para juegos con protección Denuvo.",
    },
  };

  var QR_FILES = {
    mensual: { bolivia: "Mensual_Pago.jpeg", binance: "Mensual_Binance.jpeg" },
    permanente: { bolivia: "Perma_Pago.jpeg", binance: "Perma_Binance.jpeg" },
    denuvo: { bolivia: "Denuvo_Pago.jpeg", binance: "Denuvo_Binance.jpeg" },
  };

  var state = {
    planId: null,
    selectedPlan: null,
    method: null,
    uiStep: 1,
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function showToast(msg, durationMs) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(showToast._tm);
    var ms = typeof durationMs === "number" && durationMs > 0 ? durationMs : 2600;
    showToast._tm = setTimeout(function () {
      t.classList.remove("is-visible");
    }, ms);
  }

  function setSteps(maxActive) {
    document.querySelectorAll(".steps__item").forEach(function (el) {
      var n = parseInt(el.getAttribute("data-step"), 10);
      el.classList.toggle("is-active", n <= maxActive);
    });
  }

  /** Paso 3–4 (QR, comprobante, WhatsApp): solo visible tras pulsar «Elegir método». */
  function setQrCheckoutTrayVisible(visible) {
    var qs = $("#qrSection");
    if (!qs) return;
    if (visible) qs.removeAttribute("hidden");
    else qs.setAttribute("hidden", "");
  }

  /** Lleva la vista al QR principal (paso 3), no a la miniatura de vista previa. */
  function scrollPaymentQrIntoView(behaviorSmooth) {
    var stage = $("#qrStage");
    var section = $("#qrSection");
    var el = stage || section;
    if (!el) return;
    var behavior = behaviorSmooth ? "smooth" : "auto";
    window.requestAnimationFrame(function () {
      try {
        el.scrollIntoView({ behavior: behavior, block: "start", inline: "nearest" });
      } catch (eScroll) {}
    });
  }

  function setUiStep(step) {
    var n = Math.max(1, Math.min(4, step | 0));
    state.uiStep = n;
    setSteps(n);
    var planesSec = $("#planes");
    if (planesSec) {
      if (n <= 1) {
        planesSec.classList.remove("plans-section--hidden-in-checkout");
      } else {
        planesSec.classList.add("plans-section--hidden-in-checkout");
      }
    }
  }

  /**
   * Clonar SVG con defs duplicados: al ocultar #planes, url(#id) debe resolver dentro del clon.
   */
  function remapSvgIdsInSubtree(root) {
    if (!root || !root.querySelectorAll) return;
    var nodesWithId = root.querySelectorAll("[id]");
    var map = {};
    var suffix = "zc" + String((Math.random() * 1e9) | 0);
    for (var i = 0; i < nodesWithId.length; i++) {
      var el = nodesWithId[i];
      var oldId = el.getAttribute("id");
      if (!oldId) continue;
      var newId = oldId + "-" + suffix;
      map[oldId] = newId;
      el.setAttribute("id", newId);
    }
    if (Object.keys(map).length === 0) return;

    var list = [root];
    var desc = root.querySelectorAll("*");
    for (var j = 0; j < desc.length; j++) {
      list.push(desc[j]);
    }

    function repUrlFragment(s) {
      if (!s || s.indexOf("url(#") === -1) return s;
      var out = s;
      for (var old in map) {
        if (!Object.prototype.hasOwnProperty.call(map, old)) continue;
        out = out.split("url(#" + old + ")").join("url(#" + map[old] + ")");
      }
      return out;
    }

    for (var k = 0; k < list.length; k++) {
      var n = list[k];
      if (!n.getAttributeNames) continue;
      var names = n.getAttributeNames();
      for (var a = 0; a < names.length; a++) {
        var attr = names[a];
        var v = n.getAttribute(attr);
        if (!v) continue;
        if (attr === "href" || attr === "xlink:href") {
          var hash = v.indexOf("#");
          if (hash !== -1) {
            var frag = v.slice(hash + 1);
            if (map[frag]) {
              n.setAttribute(attr, v.slice(0, hash + 1) + map[frag]);
            }
          }
        } else if (v.indexOf("url(#") !== -1) {
          n.setAttribute(attr, repUrlFragment(v));
        }
      }
    }
  }

  function syncFlowPlanStrip(planId) {
    var strip = $("#flowPlanStrip");
    var mount = $("#flowPlanIconMount");
    var nameEl = $("#flowPlanName");
    var priceEl = $("#flowPlanPrice");
    var descEl = $("#flowPlanDesc");
    var badge = $("#flowPlanPopularBadge");
    var plan = PLANS[planId];
    if (!plan || !strip) return;

    var card = document.querySelector('#planCards .plan-card[data-plan="' + planId + '"]');
    var srcIcon = null;
    if (card) {
      srcIcon = card.querySelector(".plan-card__top .plan-icon-wrap");
      if (!srcIcon) srcIcon = card.querySelector(".plan-icon-wrap");
    }

    var hex = $("#flowPlanIconHex");
    if (hex) {
      hex.innerHTML = "";
      if (srcIcon) {
        var clone = srcIcon.cloneNode(true);
        remapSvgIdsInSubtree(clone);
        hex.appendChild(clone);
      }
    } else if (mount) {
      mount.innerHTML = "";
      if (srcIcon) {
        var clone2 = srcIcon.cloneNode(true);
        remapSvgIdsInSubtree(clone2);
        mount.appendChild(clone2);
      }
    }

    var nameNode = card ? card.querySelector(".plan-card__name") : null;
    if (nameEl) {
      if (nameNode) nameEl.innerHTML = nameNode.innerHTML;
      else nameEl.textContent = plan.label;
    }
    if (priceEl) {
      priceEl.textContent = plan.bs + " Bs · " + plan.usdt + " USDT";
    }
    var descNode = card ? card.querySelector(".plan-card__desc") : null;
    if (descEl) {
      if (descNode) descEl.textContent = descNode.textContent.trim();
      else descEl.textContent = plan.desc;
    }
    if (badge) {
      if (planId === "permanente") badge.removeAttribute("hidden");
      else badge.setAttribute("hidden", "");
    }
    strip.removeAttribute("hidden");
    updateFlowCambiarMetodoVisibility();
  }

  /** «Cambiar método de pago» solo tras elegir QR o Binance (paso 3). */
  function updateFlowCambiarMetodoVisibility() {
    var btn = $("#flowCambiarMetodoBtn") || document.querySelector("#flowPlanStrip .js-cambiar-metodo");
    if (!btn) return;
    if (state.method) {
      btn.classList.remove("is-hidden-until-method");
      btn.removeAttribute("hidden");
    } else {
      btn.classList.add("is-hidden-until-method");
      btn.setAttribute("hidden", "");
    }
  }

  function hideFlowPlanStrip() {
    var strip = $("#flowPlanStrip");
    if (strip) strip.setAttribute("hidden", "");
  }

  function updatePickedPlanHighlight() {
    document.querySelectorAll("#planCards .plan-card").forEach(function (card) {
      var id = card.getAttribute("data-plan");
      card.classList.toggle("plan-card--picked", !!state.planId && id === state.planId);
    });
  }

  function getComprobanteFile() {
    var input = $("#comprobanteInput");
    if (!input || !input.files || input.files.length < 1) return null;
    return input.files[0];
  }

  /** Solo PNG / JPG (JPEG). Si el SO no informa MIME, se acepta por extensión .png / .jpg / .jpeg */
  function isComprobanteImageFile(f) {
    if (!f) return false;
    var t = (f.type || "").toLowerCase().trim();
    if (t === "image/png" || t === "image/jpeg" || t === "image/jpg" || t === "image/pjpeg") return true;
    if (t === "" || t === "application/octet-stream" || t === "binary/octet-stream") {
      var n = (f.name || "").toLowerCase();
      return /\.(png|jpe?g)$/.test(n);
    }
    return false;
  }

  function refreshWaHint() {
    var hint = $("#waHint");
    var waBtn = $("#btnWhatsapp");
    var dlBtn = $("#btnDescargarQr");
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
    if (!waBtn) return;
    var qrReady = !!(state.planId && state.method && dlBtn && !dlBtn.disabled);
    waBtn.disabled = !qrReady;
  }

  function showFlowPanel(show) {
    var panel = $("#flowPanel");
    if (!panel) return;
    if (show) {
      panel.classList.remove("flow-panel--hidden");
    } else {
      panel.classList.add("flow-panel--hidden");
      panel.classList.remove("flow-panel--method-chosen");
      setMainCheckoutMode(false);
    }
  }

  /** FAQ y redes: solo en la vista inicial; ocultas durante el checkout (plan elegido). */
  function setMainCheckoutMode(active) {
    var main = document.querySelector("main.main");
    if (!main) return;
    main.classList.toggle("main--checkout", !!active);
  }

  /** Tras elegir método: oculta tarjetas de pago + barra beneficios (sigue visible «Tu plan»). */
  function setCheckoutMethodLayout(methodChosen) {
    var panel = $("#flowPanel");
    if (panel) panel.classList.toggle("flow-panel--method-chosen", !!methodChosen);
  }

  function syncQrScanHeadIcon(method) {
    var mount = $("#qrScanHeadIconMount");
    if (!mount) return;
    mount.innerHTML = "";
    if (!method) return;
    var cardBtn = document.querySelector('.method-btn[data-method="' + method + '"]');
    var wrap = cardBtn && cardBtn.querySelector(".payment-method-icon-wrap");
    if (!wrap) return;
    var clone = wrap.cloneNode(true);
    remapSvgIdsInSubtree(clone);
    mount.appendChild(clone);
  }

  function cambiarMetodoPago() {
    if (!state.planId) return;
    state.method = null;
    document.querySelectorAll(".method-btn").forEach(function (b) {
      b.classList.remove("is-active");
    });
    resetQrUi();
    setQrCheckoutTrayVisible(false);
    setCheckoutMethodLayout(false);
    setUiStep(2);
    syncFlowPlanStrip(state.planId);
    var met = $("#metodoSection");
    if (met) {
      setTimeout(function () {
        met.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }

  function resetQrUi() {
    var img = $("#qrImage");
    var ph = $("#qrPlaceholder");
    var wrap = $("#qrWrap");
    var stage = $("#qrStage");
    if (img) {
      img.hidden = true;
      img.removeAttribute("src");
    }
    if (ph) {
      ph.hidden = false;
      ph.textContent = "Elige un plan y un método para ver el QR.";
    }
    if (wrap) wrap.classList.remove("qr-wrap--show");
    if (stage) stage.classList.remove("qr-stage--active");
    var headMount = $("#qrScanHeadIconMount");
    if (headMount) headMount.innerHTML = "";
    var b1 = $("#btnDescargarQr");
    var b2 = $("#btnWhatsapp");
    if (b1) b1.disabled = true;
    if (b2) b2.disabled = true;
    refreshWaHint();
  }

  function qrAssetUrl(file) {
    var base = (typeof window.ZC_ASSET_BASE === "string" && window.ZC_ASSET_BASE) || "assets/";
    if (base.slice(-1) !== "/") base += "/";
    try {
      return new URL(base + file, window.location.href).href;
    } catch (e) {
      return base + file;
    }
  }

  function showQr() {
    if (!state.planId || !state.method) return;

    var file = QR_FILES[state.planId][state.method];
    if (!file) return;

    var img = $("#qrImage");
    var ph = $("#qrPlaceholder");
    var wrap = $("#qrWrap");
    var stage = $("#qrStage");
    if (!img) return;

    var bust = "?v=" + Date.now();
    var path = qrAssetUrl(file) + bust;

    function fail(msg) {
      if (ph) {
        ph.hidden = false;
        ph.textContent = msg || "No se pudo cargar la imagen. Revisa la carpeta /assets/.";
      }
      img.hidden = true;
      if (wrap) wrap.classList.remove("qr-wrap--show");
      if (stage) stage.classList.remove("qr-stage--active");
      var b1 = $("#btnDescargarQr");
      var b2 = $("#btnWhatsapp");
      if (b1) b1.disabled = true;
      if (b2) b2.disabled = true;
      refreshWaHint();
      scrollPaymentQrIntoView(true);
    }

    function ok() {
      if (ph) ph.hidden = true;
      img.hidden = false;
      if (wrap) wrap.classList.add("qr-wrap--show");
      if (stage) stage.classList.add("qr-stage--active");
      var b1 = $("#btnDescargarQr");
      if (b1) b1.disabled = false;
      refreshWaHint();
      scrollPaymentQrIntoView(true);
    }

    img.onload = function () {
      ok();
    };
    img.onerror = function () {
      fail("No se encontró " + file + " en /assets/ (usa el servidor local, no file://).");
    };

    img.hidden = true;
    if (wrap) wrap.classList.remove("qr-wrap--show");
    if (stage) stage.classList.remove("qr-stage--active");
    if (ph) {
      ph.hidden = false;
      ph.textContent = "Cargando imagen…";
    }
    img.removeAttribute("src");
    window.requestAnimationFrame(function () {
      img.src = path;
      if (img.complete && img.naturalWidth > 0) {
        ok();
      }
    });
  }

  function resetPlanGridUi() {
    var grid = $("#planCards");
    var title = $("#planesTitle");
    var eb = $("#planSelectedEyebrow");
    if (eb) eb.setAttribute("hidden", "");
    if (grid) {
      grid.classList.remove("plans--checkout");
      grid.querySelectorAll(".plan-card").forEach(function (card) {
        card.classList.remove(
          "plan-card--hidden",
          "plan-card--checkout-focus",
          "is-selected",
        );
        var line = card.querySelector(".plan-card__price-line");
        var chg = card.querySelector(".js-cambiar-plan");
        if (line) line.setAttribute("hidden", "");
        if (chg) chg.setAttribute("hidden", "");
      });
    }
    if (title) title.textContent = "Planes";
  }

  function selectPlan(planId) {
    state.planId = planId;
    state.selectedPlan = planId;
    state.method = null;

    document.querySelectorAll(".method-btn").forEach(function (b) {
      b.classList.remove("is-active");
    });

    resetPlanGridUi();
    updatePickedPlanHighlight();
    syncFlowPlanStrip(planId);
    showFlowPanel(true);
    resetQrUi();
    setQrCheckoutTrayVisible(false);
    setCheckoutMethodLayout(false);
    /* Paso 2: oculta grilla de planes (setUiStep aplica .plans-section--hidden-in-checkout) */
    setUiStep(2);
    setMainCheckoutMode(true);

    var fp = $("#flowPanel");
    if (fp) {
      setTimeout(function () {
        fp.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  function selectMethod(method) {
    if (!state.planId) {
      showToast("Primero elige un plan.");
      return;
    }
    state.method = method;

    document.querySelectorAll(".method-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-method") === method);
    });

    syncQrScanHeadIcon(method);
    setCheckoutMethodLayout(true);
    setUiStep(3);
    setQrCheckoutTrayVisible(true);
    showQr();
    scrollPaymentQrIntoView(false);
    setTimeout(function () {
      scrollPaymentQrIntoView(true);
    }, 80);
    updateFlowCambiarMetodoVisibility();
  }

  function downloadQr() {
    var img = $("#qrImage");
    if (!img || !img.src || img.hidden) {
      showToast("No hay QR para descargar.");
      return;
    }
    var a = document.createElement("a");
    a.href = img.src;
    a.download = "ZetaCore_QR_" + state.planId + "_" + state.method + ".jpeg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Descarga iniciada.");
  }

  function openWhatsapp() {
    if (state.planId && state.method) setUiStep(4);
    window.location.href = WA_URL;
  }

  function goBackStep() {
    var s = state.uiStep || 1;
    if (s <= 1) return;

    if (s === 2) {
      setUiStep(1);
      showFlowPanel(false);
      hideFlowPlanStrip();
      setQrCheckoutTrayVisible(false);
      state.method = null;
      document.querySelectorAll(".method-btn").forEach(function (b) {
        b.classList.remove("is-active");
      });
      resetQrUi();
      updatePickedPlanHighlight();
      updateFlowCambiarMetodoVisibility();
      setCheckoutMethodLayout(false);
      var planes = $("#planes");
      if (planes) {
        setTimeout(function () {
          planes.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 60);
      }
      return;
    }

    if (s === 3) {
      cambiarMetodoPago();
      return;
    }

    if (s === 4) {
      setUiStep(3);
      if (state.planId && state.method) {
        showQr();
      }
      var qrSec = $("#qrSection");
      if (qrSec) {
        setTimeout(function () {
          qrSec.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
    }
  }

  function cambiarPlan() {
    state.method = null;

    document.querySelectorAll(".method-btn").forEach(function (b) {
      b.classList.remove("is-active");
    });

    resetPlanGridUi();
    updatePickedPlanHighlight();
    showFlowPanel(false);
    hideFlowPlanStrip();
    resetQrUi();
    setQrCheckoutTrayVisible(false);
    setCheckoutMethodLayout(false);
    updateFlowCambiarMetodoVisibility();
    setUiStep(1);

    var planes = $("#planes");
    if (planes) {
      setTimeout(function () {
        planes.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }

  var COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024;
  var comprobanteUploadSeq = 0;

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(new Error("read_failed"));
      };
      r.readAsDataURL(file);
    });
  }

  function uploadComprobanteToTelegram(file) {
    if (!file) return Promise.resolve();
    var seq = ++comprobanteUploadSeq;
    return readFileAsDataUrl(file)
      .then(function (dataUrl) {
        return fetch(comprobanteApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: dataUrl,
            filename: file.name,
            planId: state.planId || "",
            method: state.method || "",
          }),
        });
      })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return { ok: false, error: "bad_response" };
          })
          .then(function (j) {
            if (seq !== comprobanteUploadSeq) return;
            if (!res.ok || !j.ok) {
              var errMsg =
                (j && j.detail) ||
                (j && j.error) ||
                (res.status === 404
                  ? "API no encontrada (¿npm run dev en puerto 3001?)"
                  : "upload_failed");
              throw new Error(errMsg);
            }
            showToast("Comprobante enviado a Telegram.");
          });
      })
      .catch(function (err) {
        if (seq !== comprobanteUploadSeq) return;
        var detail = err && err.message ? String(err.message) : "error desconocido";
        showToast("No se pudo enviar a Telegram: " + detail, 7000);
      });
  }

  function syncComprobanteEmptyState() {
    comprobanteUploadSeq++;
    var primary = $("#comprobanteDropPrimary");
    var secondary = $("#comprobanteDropSecondary");
    var zone = $("#comprobanteDropZone");
    if (primary) primary.textContent = "Seleccionar imagen";
    if (secondary) {
      secondary.textContent = "PNG o JPG · máx. 10 MB.";
      secondary.classList.remove("comprobante-card__zone-secondary--warn");
    }
    if (zone) zone.classList.remove("comprobante-card__zone--has-file");
    refreshWaHint();
  }

  function onComprobanteChange(e) {
    var input = e.target;
    var f = input.files && input.files[0];
    var primary = $("#comprobanteDropPrimary");
    var secondary = $("#comprobanteDropSecondary");
    var zone = $("#comprobanteDropZone");
    if (!primary || !secondary) return;

    if (!f) {
      syncComprobanteEmptyState();
      return;
    }

    if (f.size > COMPROBANTE_MAX_BYTES) {
      input.value = "";
      primary.textContent = "Seleccionar imagen";
      secondary.textContent = "La imagen supera 10 MB. Elige otra más pequeña.";
      secondary.classList.add("comprobante-card__zone-secondary--warn");
      if (zone) zone.classList.remove("comprobante-card__zone--has-file");
      refreshWaHint();
      return;
    }

    if (!isComprobanteImageFile(f)) {
      input.value = "";
      primary.textContent = "Seleccionar imagen";
      secondary.textContent = "Solo PNG o JPG / JPEG.";
      secondary.classList.add("comprobante-card__zone-secondary--warn");
      if (zone) zone.classList.remove("comprobante-card__zone--has-file");
      showToast("Usa una imagen PNG o JPG.");
      refreshWaHint();
      return;
    }

    secondary.classList.remove("comprobante-card__zone-secondary--warn");
    secondary.textContent = "PNG o JPG · máx. 10 MB.";
    primary.textContent = f.name;
    if (zone) zone.classList.add("comprobante-card__zone--has-file");
    refreshWaHint();
    showToast("Enviando comprobante a Telegram…", 2200);
    uploadComprobanteToTelegram(f);
  }

  function formatDemoTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  /** Duración útil para seek (metadata o rango seekable tras carga por red). */
  function demoVideoDuration(video) {
    var d = video.duration;
    if (d && isFinite(d) && d > 0) return d;
    try {
      if (video.seekable && video.seekable.length > 0) {
        var end = video.seekable.end(video.seekable.length - 1);
        if (end && isFinite(end) && end > 0) return end;
      }
    } catch (eDur) {}
    return 0;
  }

  function demoCanSeek(video) {
    try {
      return video.seekable && video.seekable.length > 0 && video.seekable.end(0) > video.seekable.start(0);
    } catch (eSeek) {
      return false;
    }
  }

  function demoSetTime(video, t) {
    var d = demoVideoDuration(video);
    t = Math.max(0, t);
    if (d > 0) t = Math.min(t, Math.max(0, d - 0.05));
    try {
      if (typeof video.fastSeek === "function") {
        video.fastSeek(t);
      } else {
        video.currentTime = t;
      }
    } catch (eSet) {
      try {
        video.currentTime = t;
      } catch (eSet2) {}
    }
  }

  function initDemoPlayer() {
    var root = document.querySelector("[data-demo-player]");
    var video = $("#heroDemoVideo");
    if (!root || !video) return;

    var srcEl = video.querySelector("source");
    if (srcEl) {
      var host = location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        srcEl.setAttribute("src", "assets/zetacore-demo.mp4?v=4");
        try {
          video.load();
        } catch (eLoad) {}
      }
    }

    var btnPlay = root.querySelector('[data-demo-action="toggle-play"]');
    var iconPause = root.querySelector(".demo-dock__icon--pause");
    var iconPlay = root.querySelector(".demo-dock__icon--play");
    var fill = $("#demoProgressFill");
    var thumb = $("#demoProgressThumb");
    var track = $("#demoProgressTrack");
    var tCombined = $("#demoTimeCombined");
    var dragging = false;
    var seekbar = root.querySelector(".demo-dock__seekbar");
    var rafId = 0;

    function stopProgressRaf() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function tickProgress() {
      updateProgress();
      if (!video.paused) {
        rafId = requestAnimationFrame(tickProgress);
      }
    }

    function startProgressRaf() {
      stopProgressRaf();
      if (!video.paused) {
        rafId = requestAnimationFrame(tickProgress);
      }
    }

    function syncPlayUi() {
      var paused = video.paused;
      if (btnPlay) {
        btnPlay.setAttribute("aria-label", paused ? "Reanudar reproducción" : "Pausar reproducción");
      }
      if (iconPause) iconPause.toggleAttribute("hidden", paused);
      if (iconPlay) iconPlay.toggleAttribute("hidden", !paused);
    }

    function updateProgress() {
      var d = demoVideoDuration(video);
      var p = 0;
      if (d > 0) {
        p = (video.currentTime / d) * 100;
        if (p < 0) p = 0;
        if (p > 100) p = 100;
      }
      if (fill) fill.style.width = p + "%";
      if (thumb) thumb.style.left = p + "%";
      if (track) track.setAttribute("aria-valuenow", String(Math.round(p)));
      if (tCombined) {
        tCombined.textContent =
          formatDemoTime(video.currentTime) +
          " / " +
          formatDemoTime(demoVideoDuration(video));
      }
    }

    function seekFromClientX(clientX) {
      if (!track) return;
      var d = demoVideoDuration(video);
      if (d <= 0 && !demoCanSeek(video)) return;
      var rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      var r = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
      if (d > 0) demoSetTime(video, r * d);
      else if (demoCanSeek(video)) demoSetTime(video, video.seekable.start(0) + r * (video.seekable.end(0) - video.seekable.start(0)));
      updateProgress();
    }

    function onMetaOrDuration() {
      updateProgress();
      syncPlayUi();
      syncVolUi();
      startProgressRaf();
    }

    video.addEventListener("timeupdate", updateProgress);
    video.addEventListener("loadedmetadata", onMetaOrDuration);
    video.addEventListener("loadeddata", updateProgress);
    video.addEventListener("durationchange", updateProgress);
    video.addEventListener("progress", updateProgress);
    video.addEventListener("seeking", updateProgress);
    video.addEventListener("seeked", updateProgress);
    video.addEventListener("ratechange", updateProgress);
    video.addEventListener("play", function () {
      syncPlayUi();
      startProgressRaf();
    });
    video.addEventListener("playing", function () {
      syncPlayUi();
      startProgressRaf();
    });
    video.addEventListener("pause", function () {
      syncPlayUi();
      stopProgressRaf();
    });
    video.addEventListener("ended", function () {
      stopProgressRaf();
      updateProgress();
      syncPlayUi();
      try {
        video.currentTime = 0;
        video.play().catch(function () {});
      } catch (eLoop) {}
    });

    syncPlayUi();
    updateProgress();
    startProgressRaf();

    var dockRow = root.querySelector(".demo-shell__dock-row");
    if (dockRow) {
      dockRow.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-demo-action]");
        if (!btn || !dockRow.contains(btn)) return;
        var action = btn.getAttribute("data-demo-action");
        if (action === "toggle-play") return;
        if (action === "seek-back") {
          e.preventDefault();
          demoSetTime(video, video.currentTime - 5);
          updateProgress();
        } else if (action === "seek-fwd") {
          e.preventDefault();
          demoSetTime(video, video.currentTime + 5);
          updateProgress();
        }
      });
    }

    if (seekbar) {
      seekbar.addEventListener("click", function (e) {
        if (typeof e.button === "number" && e.button !== 0) return;
        e.preventDefault();
        seekFromClientX(e.clientX);
      });
    }

    if (btnPlay) {
      btnPlay.addEventListener("click", function () {
        if (video.paused) {
          video.play().catch(function () {});
        } else {
          video.pause();
        }
      });
    }

    var bBack = root.querySelector('[data-demo-action="seek-back"]');
    if (bBack) {
      bBack.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        demoSetTime(video, video.currentTime - 5);
        updateProgress();
      });
    }

    var bFwd = root.querySelector('[data-demo-action="seek-fwd"]');
    if (bFwd) {
      bFwd.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        demoSetTime(video, video.currentTime + 5);
        updateProgress();
      });
    }

    function onDocSeekMove(e) {
      if (!dragging) return;
      seekFromClientX(e.clientX);
    }

    function onDocSeekEnd() {
      dragging = false;
    }

    document.addEventListener("pointermove", onDocSeekMove);
    document.addEventListener("pointerup", onDocSeekEnd);
    document.addEventListener("pointercancel", onDocSeekEnd);

    var volRoot = $("#demoVolumeRoot");
    var volBtn = $("#demoVolBtn");
    var volPanel = $("#demoVolumePanel");
    var volTrack = $("#demoVolTrack");
    var volFill = $("#demoVolFill");
    var volPct = $("#demoVolPct");
    var iconVolOn = volBtn ? volBtn.querySelector(".demo-dock__icon--vol-on") : null;
    var iconVolMuted = volBtn ? volBtn.querySelector(".demo-dock__icon--vol-muted") : null;
    var volDragging = false;
    var finePointerHover = false;
    try {
      finePointerHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch (e2) {
      finePointerHover = false;
    }

    function volEffectivePct() {
      if (video.muted || video.volume === 0) return 0;
      return Math.round(video.volume * 100);
    }

    function syncVolUi() {
      var pct = volEffectivePct();
      if (volFill) volFill.style.height = pct + "%";
      if (volTrack) volTrack.setAttribute("aria-valuenow", String(pct));
      if (volPct) volPct.textContent = pct + "%";
      var muted = video.muted || video.volume === 0;
      if (iconVolOn) iconVolOn.toggleAttribute("hidden", muted);
      if (iconVolMuted) iconVolMuted.toggleAttribute("hidden", !muted);
    }

    function setVolFromClientY(clientY) {
      if (!volTrack) return;
      var rng = volTrack.querySelector(".demo-dock__vol-range");
      if (!rng) return;
      var rect = rng.getBoundingClientRect();
      if (rect.height <= 0) return;
      var t = (rect.bottom - clientY) / rect.height;
      t = Math.min(Math.max(0, t), 1);
      video.muted = false;
      video.volume = Math.round(t * 100) / 100;
      if (video.volume === 0) video.muted = true;
      syncVolUi();
    }

    function closeVolPanel() {
      if (!volRoot) return;
      volRoot.classList.remove("is-open");
      if (volBtn) volBtn.setAttribute("aria-expanded", "false");
      if (volPanel) volPanel.setAttribute("aria-hidden", "true");
    }

    video.addEventListener("volumechange", syncVolUi);
    syncVolUi();

    if (volBtn && volRoot) {
      volBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (finePointerHover) {
          if (volTrack) volTrack.focus();
          return;
        }
        volRoot.classList.toggle("is-open");
        var o = volRoot.classList.contains("is-open");
        volBtn.setAttribute("aria-expanded", o ? "true" : "false");
        if (volPanel) volPanel.setAttribute("aria-hidden", o ? "false" : "true");
        if (o && volTrack) {
          setTimeout(function () {
            volTrack.focus();
          }, 0);
        }
      });
    }

    document.addEventListener("click", function (e) {
      if (!volRoot || !volRoot.classList.contains("is-open")) return;
      if (!volRoot.contains(e.target)) closeVolPanel();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (volRoot && volRoot.classList.contains("is-open")) closeVolPanel();
    });

    if (volTrack) {
      volTrack.addEventListener("click", function (e) {
        setVolFromClientY(e.clientY);
      });

      volTrack.addEventListener("keydown", function (e) {
        var step = 0.05;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          video.muted = false;
          video.volume = Math.min(1, Math.round((video.volume + step) * 100) / 100);
          syncVolUi();
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          video.volume = Math.max(0, Math.round((video.volume - step) * 100) / 100);
          if (video.volume === 0) video.muted = true;
          syncVolUi();
        }
      });

      volTrack.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 && e.pointerType !== "touch") return;
        volDragging = true;
        try {
          volTrack.setPointerCapture(e.pointerId);
        } catch (err3) {}
        setVolFromClientY(e.clientY);
      });

      volTrack.addEventListener("pointermove", function (e) {
        if (!volDragging) return;
        setVolFromClientY(e.clientY);
      });

      function endVolDrag(e) {
        if (!volDragging) return;
        volDragging = false;
        try {
          if (e && e.pointerId != null) volTrack.releasePointerCapture(e.pointerId);
        } catch (err4) {}
      }

      volTrack.addEventListener("pointerup", endVolDrag);
      volTrack.addEventListener("pointercancel", endVolDrag);
      volTrack.addEventListener("lostpointercapture", function () {
        volDragging = false;
      });
    }

    if (track) {
      track.addEventListener("keydown", function (e) {
        var d = demoVideoDuration(video);
        if (d <= 0 && !demoCanSeek(video)) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          demoSetTime(video, video.currentTime - 5);
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          demoSetTime(video, video.currentTime + 5);
        } else if (e.key === "Home") {
          e.preventDefault();
          demoSetTime(video, 0);
        } else if (e.key === "End") {
          e.preventDefault();
          demoSetTime(video, d > 0 ? d : video.currentTime);
        }
        updateProgress();
      });

      function startSeekDrag(e) {
        if (e.button !== 0 && e.pointerType !== "touch") return;
        e.preventDefault();
        dragging = true;
        try {
          if (e.currentTarget && e.currentTarget.setPointerCapture) {
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        } catch (err) {}
        seekFromClientX(e.clientX);
      }

      track.addEventListener("pointerdown", startSeekDrag);
      if (seekbar && seekbar !== track) {
        seekbar.addEventListener("pointerdown", startSeekDrag);
      }

      track.addEventListener("lostpointercapture", function () {
        dragging = false;
      });
    }
  }

  function init() {
    document.querySelectorAll(".plan-card__btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".plan-card");
        if (card) selectPlan(card.getAttribute("data-plan"));
      });
    });

    document.querySelectorAll(".method-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectMethod(btn.getAttribute("data-method"));
      });
    });

    document.querySelectorAll(".js-cambiar-plan").forEach(function (btn) {
      btn.addEventListener("click", cambiarPlan);
    });

    document.querySelectorAll(".js-cambiar-metodo").forEach(function (btn) {
      btn.addEventListener("click", cambiarMetodoPago);
    });

    document.querySelectorAll(".js-flow-back").forEach(function (btn) {
      btn.addEventListener("click", goBackStep);
    });

    $("#btnDescargarQr").addEventListener("click", downloadQr);
    $("#btnWhatsapp").addEventListener("click", openWhatsapp);

    var fileInput = $("#comprobanteInput");
    var btnComprobante = $("#btnComprobanteElegir");
    if (btnComprobante && fileInput) {
      btnComprobante.addEventListener("click", function () {
        fileInput.click();
      });
    }
    if (fileInput) fileInput.addEventListener("change", onComprobanteChange);

    initDemoPlayer();
    setUiStep(1);
    setMainCheckoutMode(false);
    updateFlowCambiarMetodoVisibility();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
