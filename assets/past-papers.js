// Past Papers UI for IGCSEfy

const PAST_PAPERS_READY_EVENT = "igcsefy:past-papers-ready";
const PAST_PAPER_SETTINGS_STORAGE_KEY = "igcsefy-settings";
const PAST_PAPER_PREVIEW_MODAL_ID = "igcsefy-pdf-preview-modal";
const PAST_PAPER_PREVIEW_STYLE_ID = "igcsefy-pdf-preview-style";
const PAST_PAPER_OPEN_DEFAULTS = {
  pdfOpeningMode: "preview",
  autoOpenMarkScheme: false,
  markSchemeOpenBehavior: "same-tab",
  afterDownloadBehavior: "stay",
  markAsInProgress: false
};

function escapePastPaperHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dispatchPastPapersReady(container, meta) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  const detail = Object.assign({
    mode: container && container.dataset ? (container.dataset.mode || "subject") : "subject",
    subject: container && container.dataset ? (container.dataset.subject || "") : "",
    rendered: true
  }, meta || null);

  const fire = () => {
    try {
      window.dispatchEvent(new CustomEvent(PAST_PAPERS_READY_EVENT, { detail }));
    } catch (error) {}
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(fire);
    });
    return;
  }

  window.setTimeout(fire, 0);
}

function readPastPaperOpenPreferences() {
  if (typeof window === "undefined" || !window.localStorage) {
    return Object.assign({}, PAST_PAPER_OPEN_DEFAULTS);
  }

  try {
    const raw = window.localStorage.getItem(PAST_PAPER_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return Object.assign({}, PAST_PAPER_OPEN_DEFAULTS);
    }

    const parsed = JSON.parse(raw);
    const prefs = parsed && parsed.studyPreferences && typeof parsed.studyPreferences === "object"
      ? parsed.studyPreferences
      : {};
    const next = Object.assign({}, PAST_PAPER_OPEN_DEFAULTS, prefs);

    next.pdfOpeningMode = next.pdfOpeningMode === "direct-download" ? "direct-download" : "preview";
    next.autoOpenMarkScheme = next.autoOpenMarkScheme === true;
    next.markSchemeOpenBehavior = next.markSchemeOpenBehavior === "side-by-side"
        ? "side-by-side"
        : "same-tab";
    next.afterDownloadBehavior = next.afterDownloadBehavior === "jump-next" ? "jump-next" : "stay";
    next.markAsInProgress = next.markAsInProgress === true;
    return next;
  } catch (error) {
    return Object.assign({}, PAST_PAPER_OPEN_DEFAULTS);
  }
}

function isPastPaperLightTheme() {
  if (typeof document === "undefined") {
    return false;
  }

  const root = document.documentElement;
  return root.dataset.theme === "light"
    || root.classList.contains("light")
    || (!root.classList.contains("dark") && root.dataset.theme !== "dark");
}

function isPastPaperPdfHref(href) {
  return /\.pdf(?:$|[?#])/i.test(String(href || "").trim());
}

function getPastPaperFileName(href) {
  try {
    const url = new URL(String(href || ""), window.location.href);
    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "paper.pdf");
  } catch (error) {
    const raw = String(href || "").split(/[?#]/)[0];
    const parts = raw.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "paper.pdf");
  }
}

function getPastPaperTrackKey(target) {
  if (!target || !target.closest) {
    return "";
  }

  const trigger = target.closest("[data-paper-file]");
  const item = target.closest("[data-track-key]");
  return String(
    (trigger && trigger.getAttribute("data-track-key"))
    || (item && item.getAttribute("data-track-key"))
    || ""
  ).trim();
}

function markPastPaperTrackAsInProgress(target) {
  const trackKey = getPastPaperTrackKey(target);
  if (!trackKey) {
    return;
  }

  const dataStore = ensureIgcsefyDataStore();
  const currentStatus = typeof dataStore.getPastPaperStatus === "function"
    ? dataStore.getPastPaperStatus(trackKey)
    : "none";

  if (currentStatus && currentStatus !== "none") {
    return;
  }

  dataStore.setPastPaperStatus(trackKey, "in_progress");
}

function downloadPastPaperFile(href) {
  if (typeof document === "undefined") {
    return;
  }

  const resolvedHref = String(href || "").trim();
  if (!resolvedHref) {
    return;
  }

  const link = document.createElement("a");
  link.href = resolvedHref;
  link.download = getPastPaperFileName(resolvedHref);
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getPastPaperController(target) {
  if (!target) {
    return null;
  }

  const candidates = [];
  const rootNode = typeof target.getRootNode === "function" ? target.getRootNode() : null;
  if (rootNode && rootNode.host && rootNode.host.parentNode && rootNode.host.parentNode.nodeType === 1) {
    candidates.push(rootNode.host.parentNode);
  }

  if (target.closest) {
    const globalDetail = target.closest("#pp-global-detail");
    const appRoot = target.closest("#past-papers-app");
    const subjectRoot = target.closest("[data-subject]");
    if (globalDetail) candidates.push(globalDetail);
    if (appRoot) candidates.push(appRoot);
    if (subjectRoot) candidates.push(subjectRoot);
  }

  return candidates.find(node => node && typeof node.querySelectorAll === "function") || null;
}

function getPastPaperTraversalRoot(target, controller) {
  const rootNode = target && typeof target.getRootNode === "function" ? target.getRootNode() : null;
  if (rootNode && rootNode.host && typeof rootNode.querySelectorAll === "function") {
    return rootNode;
  }

  if (controller && typeof controller.querySelector === "function") {
    const activeYearPanel = controller.querySelector(".pp-year-panel.active");
    if (activeYearPanel) {
      return activeYearPanel;
    }
  }

  return controller && typeof controller.querySelectorAll === "function" ? controller : null;
}

function resolvePastPaperTrackItem(root, trackKey) {
  if (!root || !trackKey || typeof root.querySelectorAll !== "function") {
    return null;
  }

  return Array.from(root.querySelectorAll(".pp-variant-item[data-track-key]")).find(item => {
    return item.dataset.trackKey === trackKey;
  }) || null;
}

function getPreferredPastPaperTarget(item, preferredKind) {
  if (!item || typeof item.querySelector !== "function") {
    return null;
  }

  const normalizedKind = String(preferredKind || "").trim();
  if (normalizedKind) {
    const sameKindTarget = item.querySelector(`[data-paper-file][data-file-kind="${normalizedKind}"]`);
    if (sameKindTarget) {
      return sameKindTarget;
    }
  }

  return item.querySelector('[data-paper-file][data-file-kind="qp"]')
    || item.querySelector('[data-paper-file][data-file-kind="ms"]')
    || item.querySelector("[data-paper-file]");
}

function isPastPaperActionVisible(node) {
  if (!node || !node.closest) {
    return false;
  }

  if (node.closest('.pp-dropdown-panel[data-open="false"]')) {
    return false;
  }
  if (node.closest(".pp-paper-panel") && !node.closest(".pp-paper-panel.is-open")) {
    return false;
  }
  if (node.closest(".pp-subject-session-panel") && !node.closest(".pp-subject-session-panel.is-open")) {
    return false;
  }
  if (node.closest(".pp-year-panel") && !node.closest(".pp-year-panel.active")) {
    return false;
  }

  return true;
}

function flashPastPaperJumpTarget(element) {
  if (!element || !element.classList) {
    return;
  }

  if (element.__igcsefySearchHitTimer) {
    clearTimeout(element.__igcsefySearchHitTimer);
    element.__igcsefySearchHitTimer = null;
    element.classList.remove("igcsefy-search-hit");
    void element.offsetWidth;
  }

  element.classList.add("igcsefy-search-hit");
  element.__igcsefySearchHitTimer = setTimeout(() => {
    element.classList.remove("igcsefy-search-hit");
    element.__igcsefySearchHitTimer = null;
  }, 2860);
}

function queuePastPaperTargetFocus(target) {
  if (!target) {
    return;
  }

  const applyFocus = () => {
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }
    }
    const highlightTarget = target.closest
      ? (target.closest(".pp-variant-item[data-track-key]") || target)
      : target;
    flashPastPaperJumpTarget(highlightTarget);
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(applyFocus);
    });
    return;
  }

  window.setTimeout(applyFocus, 40);
}

function jumpToNextPastPaper(sourceTrigger) {
  if (!sourceTrigger) {
    return;
  }

  const controller = getPastPaperController(sourceTrigger);
  const traversalRoot = getPastPaperTraversalRoot(sourceTrigger, controller);
  if (!traversalRoot) {
    return;
  }

  const currentTrackKey = getPastPaperTrackKey(sourceTrigger);
  const currentKind = String(sourceTrigger.getAttribute("data-file-kind") || "").trim();

  if (currentTrackKey) {
    const items = Array.from(traversalRoot.querySelectorAll(".pp-variant-item[data-track-key]"));
    const currentIndex = items.findIndex(item => item.dataset.trackKey === currentTrackKey);
    if (currentIndex === -1) {
      return;
    }

    const nextItem = items.slice(currentIndex + 1).find(Boolean);
    if (!nextItem) {
      return;
    }

    const nextTrackKey = String(nextItem.dataset.trackKey || "").trim();
    if (nextTrackKey && controller && typeof controller.__ppRevealTrackKey === "function") {
      controller.__ppRevealTrackKey(nextTrackKey);
    }

    const resolvedRoot = getPastPaperTraversalRoot(sourceTrigger, controller) || traversalRoot;
    const resolvedItem = resolvePastPaperTrackItem(resolvedRoot, nextTrackKey) || nextItem;
    const nextTarget = getPreferredPastPaperTarget(resolvedItem, currentKind);
    queuePastPaperTargetFocus(nextTarget);
    return;
  }

  const visibleTargets = Array.from(traversalRoot.querySelectorAll("[data-paper-file]")).filter(isPastPaperActionVisible);
  const currentIndex = visibleTargets.indexOf(sourceTrigger);
  if (currentIndex === -1) {
    return;
  }

  queuePastPaperTargetFocus(visibleTargets[currentIndex + 1] || null);
}

function handlePastPaperAfterDownload(sourceTrigger, options = {}) {
  const preferences = readPastPaperOpenPreferences();
  if (preferences.afterDownloadBehavior !== "jump-next") {
    return;
  }

  const run = () => {
    if (typeof window !== "undefined") {
      window.setTimeout(() => jumpToNextPastPaper(sourceTrigger), 0);
    }
  };

  if (options.closeViewer && window.__igcsefyPastPaperPreviewViewer && typeof window.__igcsefyPastPaperPreviewViewer.close === "function") {
    window.__igcsefyPastPaperPreviewViewer.close(run);
    return;
  }

  run();
}

function normalizePastPaperFileKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "ms") return "ms";
  if (normalized === "qp") return "qp";
  return normalized;
}

function stripPastPaperKindSuffix(label) {
  return String(label || "")
    .replace(/\s*[·-]\s*(QP|MS)\s*$/i, "")
    .trim();
}

function getPastPaperHrefFromTrigger(trigger) {
  return String(
    (trigger && (
      trigger.getAttribute("data-file-href")
      || trigger.getAttribute("href")
      || trigger.getAttribute("data-href")
    )) || ""
  ).trim();
}

function getPastPaperLabelFromTrigger(trigger, fallback) {
  return String(
    (trigger && (
      trigger.getAttribute("data-file-label")
      || trigger.getAttribute("aria-label")
      || trigger.textContent
    )) || fallback || "Paper preview"
  ).trim();
}

function getPastPaperDocumentFromTrigger(trigger, fallbackKind) {
  if (!trigger) {
    return null;
  }

  const href = getPastPaperHrefFromTrigger(trigger);
  if (!href) {
    return null;
  }

  const kind = normalizePastPaperFileKind(trigger.getAttribute("data-file-kind") || fallbackKind || "");
  const resolvedKind = kind === "ms" ? "ms" : "qp";

  return {
    kind: resolvedKind,
    href,
    label: getPastPaperLabelFromTrigger(trigger),
    fileName: getPastPaperFileName(href),
    shortLabel: resolvedKind === "ms" ? "Mark Scheme" : "Question Paper"
  };
}

function getAssociatedPastPaperDocuments(trigger) {
  const current = getPastPaperDocumentFromTrigger(trigger);
  const item = trigger && trigger.closest
    ? trigger.closest(".pp-variant-item[data-track-key]")
    : null;
  const qpTrigger = item
    ? item.querySelector('[data-paper-file][data-file-kind="qp"]')
    : (current && current.kind === "qp" ? trigger : null);
  const msTrigger = item
    ? item.querySelector('[data-paper-file][data-file-kind="ms"]')
    : (current && current.kind === "ms" ? trigger : null);
  const qp = getPastPaperDocumentFromTrigger(qpTrigger, "qp");
  const ms = getPastPaperDocumentFromTrigger(msTrigger, "ms");
  const titleSource = current || qp || ms;

  return {
    current,
    qp,
    ms,
    baseTitle: stripPastPaperKindSuffix(titleSource && titleSource.label)
      || (titleSource && titleSource.label)
      || "Paper preview"
  };
}

function resolvePastPaperMarkSchemeLayout(preferredBehavior) {
  if (
    preferredBehavior === "side-by-side"
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 639px)").matches
  ) {
    return "same-tab";
  }

  return preferredBehavior;
}

function ensurePastPaperPreviewViewer() {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  if (window.__igcsefyPastPaperPreviewViewer) {
    return window.__igcsefyPastPaperPreviewViewer;
  }

  const closeDurationMs = 350;
  const enterEasing = "cubic-bezier(0.16, 1, 0.3, 1)";
  const raf = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : callback => window.setTimeout(callback, 16);
  const cancelRaf = typeof window.cancelAnimationFrame === "function"
    ? window.cancelAnimationFrame.bind(window)
    : id => window.clearTimeout(id);

  if (!document.getElementById(PAST_PAPER_PREVIEW_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = PAST_PAPER_PREVIEW_STYLE_ID;
    style.textContent = `
      .igcsefy-pdf-preview {
        position: fixed;
        inset: 0;
        z-index: 5000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .igcsefy-pdf-preview__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(120, 113, 108, 0.18);
        opacity: 0;
        transition: opacity 400ms ease-out;
      }
      .igcsefy-pdf-preview__card {
        position: relative;
        z-index: 10;
        display: flex;
        flex-direction: column;
        width: min(900px, 100%);
        max-height: min(90vh, 100%);
        border-radius: 1.5rem;
        border: 1px solid rgba(255, 255, 255, 0.45);
        overflow: hidden;
        background: rgba(255, 255, 255, 0.6);
        backdrop-filter: blur(40px) saturate(1.5);
        -webkit-backdrop-filter: blur(40px) saturate(1.5);
        box-shadow:
          0 24px 80px rgba(0, 0, 0, 0.07),
          0 0 0 1px rgba(255, 255, 255, 0.35) inset,
          0 1px 0 rgba(255, 255, 255, 0.6) inset;
        opacity: 0;
        transform: scale(0.96) translateY(12px);
        transition:
          opacity 350ms ${enterEasing},
          transform 350ms ${enterEasing};
      }
      .igcsefy-pdf-preview[data-animating="true"] .igcsefy-pdf-preview__backdrop {
        opacity: 1;
      }
      .igcsefy-pdf-preview[data-animating="true"] .igcsefy-pdf-preview__card {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      .igcsefy-pdf-preview__close {
        position: absolute;
        top: 16px;
        right: 16px;
        z-index: 20;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #78716c;
        cursor: pointer;
        transition: background-color 150ms ease, color 150ms ease;
      }
      .igcsefy-pdf-preview__close:hover {
        color: #292524;
        background: rgba(255, 255, 255, 0.5);
      }
      .igcsefy-pdf-preview__close svg {
        width: 16px;
        height: 16px;
        display: block;
      }
      .igcsefy-pdf-preview__header {
        padding: 24px 24px 12px;
      }
      .igcsefy-pdf-preview__tabs {
        display: none;
        margin: 0 0 16px;
        padding-right: 44px;
      }
      .igcsefy-pdf-preview[data-layout="same-tab"] .igcsefy-pdf-preview__tabs {
        display: block;
      }
      .igcsefy-pdf-preview__tabs-shell {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border-radius: 999px;
        background: rgba(245, 245, 244, 0.72);
        box-shadow: inset 0 0 0 1px rgba(231, 229, 228, 0.4);
      }
      .igcsefy-pdf-preview__tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 16px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #78716c;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition:
          color 150ms ease,
          background-color 250ms ease,
          box-shadow 250ms ease,
          transform 250ms ease;
      }
      .igcsefy-pdf-preview__tab:hover {
        color: #44403c;
      }
      .igcsefy-pdf-preview__tab.is-active {
        background: rgba(255, 255, 255, 0.95);
        color: #1c1917;
        box-shadow:
          0 1px 3px rgba(28, 25, 23, 0.08),
          inset 0 0 0 1px rgba(231, 229, 228, 0.45);
      }
      .igcsefy-pdf-preview__tab[aria-disabled="true"] {
        opacity: 0.45;
        pointer-events: none;
      }
      .igcsefy-pdf-preview__tab-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #c4b7a2;
        opacity: 0;
        transition: opacity 150ms ease;
      }
      .igcsefy-pdf-preview__tab.is-loading .igcsefy-pdf-preview__tab-dot {
        opacity: 1;
        animation: igcsefyPastPaperPulse 1.2s ease-in-out infinite;
      }
      .igcsefy-pdf-preview__title {
        margin: 0;
        padding-right: 32px;
        color: #1c1917;
        font-size: 1.125rem;
        font-weight: 600;
        line-height: 1.2;
      }
      .igcsefy-pdf-preview__file {
        margin: 4px 0 0;
        color: #78716c;
        font-size: 0.875rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        letter-spacing: -0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .igcsefy-pdf-preview__file:empty {
        display: none;
      }
      .igcsefy-pdf-preview__frame-wrap {
        flex: 1;
        min-height: 0;
        padding: 0 24px;
      }
      .igcsefy-pdf-preview__frame-shell {
        position: relative;
        width: 100%;
        height: 50vh;
        min-height: 0;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.5);
        box-shadow: inset 0 0 0 1px rgba(231, 229, 228, 0.3);
        overflow: hidden;
      }
      .igcsefy-pdf-preview__frame-shell.is-switching .igcsefy-pdf-preview__frame {
        opacity: 0;
      }
      .igcsefy-pdf-preview__frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
        transition: opacity 200ms ease;
      }
      .igcsefy-pdf-preview__split {
        display: none;
        flex: 1;
        min-height: 0;
        padding: 0 24px;
      }
      .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__split {
        display: block;
      }
      .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__frame-wrap,
      .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__actions--single {
        display: none;
      }
      .igcsefy-pdf-preview__split-layout {
        display: grid;
        grid-template-columns:
          minmax(0, var(--igcsefy-split-primary, 50%))
          24px
          minmax(0, calc(100% - var(--igcsefy-split-primary, 50%) - 24px));
        align-items: stretch;
        height: min(62vh, 720px);
      }
      .igcsefy-pdf-preview__split-panel {
        min-width: 0;
        display: flex;
        flex-direction: column;
        border-radius: 1rem;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.4);
        box-shadow: inset 0 0 0 1px rgba(231, 229, 228, 0.3);
      }
      .igcsefy-pdf-preview__split-panel-head {
        padding: 14px 16px 10px;
      }
      .igcsefy-pdf-preview__split-panel-label {
        margin: 0;
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #78716c;
      }
      .igcsefy-pdf-preview__split-panel-file {
        margin: 4px 0 0;
        color: #a8a29e;
        font-size: 0.75rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        letter-spacing: -0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .igcsefy-pdf-preview__split-panel-frame {
        position: relative;
        flex: 1;
        min-height: 0;
      }
      .igcsefy-pdf-preview__split-iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
      }
      .igcsefy-pdf-preview__split-loader {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 10px;
        background: rgba(255, 255, 255, 0.35);
        color: #78716c;
        transition: opacity 200ms ease;
      }
      .igcsefy-pdf-preview__split-loader[hidden] {
        display: none;
      }
      .igcsefy-pdf-preview__split-spinner {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        border: 2px solid rgba(168, 162, 158, 0.3);
        border-top-color: rgba(120, 113, 108, 0.8);
        animation: igcsefyPastPaperSpin 0.85s linear infinite;
      }
      .igcsefy-pdf-preview__split-loader-copy {
        font-size: 0.75rem;
        color: #78716c;
      }
      .igcsefy-pdf-preview__split-divider {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        min-width: 24px;
        cursor: col-resize;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .igcsefy-pdf-preview__split-grabber {
        width: 6px;
        height: 56px;
        border-radius: 999px;
        background: rgba(120, 113, 108, 0.36);
        transition: background-color 150ms ease, transform 150ms ease;
      }
      .igcsefy-pdf-preview__split-divider:hover .igcsefy-pdf-preview__split-grabber {
        background: rgba(120, 113, 108, 0.58);
      }
      .igcsefy-pdf-preview[data-resizing="true"] .igcsefy-pdf-preview__split-grabber {
        background: rgba(68, 64, 60, 0.85);
        transform: scale(1.05);
      }
      .igcsefy-pdf-preview[data-resizing="true"] .igcsefy-pdf-preview__split-iframe {
        pointer-events: none;
      }
      .igcsefy-pdf-preview__drag-layer {
        position: absolute;
        inset: 0;
        z-index: 35;
        display: none;
        touch-action: none;
        background: transparent;
      }
      .igcsefy-pdf-preview[data-resizing="true"] .igcsefy-pdf-preview__drag-layer {
        display: block;
      }
      .igcsefy-pdf-preview[data-resizing-axis="x"] .igcsefy-pdf-preview__drag-layer {
        cursor: col-resize;
      }
      .igcsefy-pdf-preview[data-resizing-axis="y"] .igcsefy-pdf-preview__drag-layer {
        cursor: row-resize;
      }
      .igcsefy-pdf-preview__actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 20px 24px 24px;
      }
      .igcsefy-pdf-preview__actions--split {
        display: none;
      }
      .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__actions--split {
        display: flex;
      }
      .igcsefy-pdf-preview__actions-separator {
        color: #a8a29e;
        font-size: 1rem;
        line-height: 1;
      }
      .igcsefy-pdf-preview__action {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 999px;
        border: 1px solid rgba(214, 211, 209, 0.5);
        background: rgba(255, 255, 255, 0.4);
        color: #44403c;
        text-decoration: none;
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1;
        transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
      }
      .igcsefy-pdf-preview__action:hover {
        background: rgba(255, 255, 255, 0.7);
        color: #1c1917;
      }
      .igcsefy-pdf-preview__action svg {
        width: 14px;
        height: 14px;
        display: block;
      }
      .igcsefy-pdf-preview__preload {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
        pointer-events: none;
        border: 0;
      }
      .igcsefy-past-paper-toast-host {
        position: fixed;
        left: 50%;
        bottom: max(18px, env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 5100;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        pointer-events: none;
      }
      .igcsefy-past-paper-toast {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: #1c1917;
        color: #ffffff;
        padding: 10px 16px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 250ms ease, transform 250ms ease;
      }
      .igcsefy-past-paper-toast[data-visible="true"] {
        opacity: 1;
        transform: translateY(0);
      }
      .igcsefy-past-paper-toast svg {
        width: 14px;
        height: 14px;
        display: block;
        opacity: 0.78;
      }
      .igcsefy-past-paper-toast__label {
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1;
      }
      @keyframes igcsefyPastPaperPulse {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 1; }
      }
      @keyframes igcsefyPastPaperSpin {
        to { transform: rotate(360deg); }
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__backdrop {
        background: rgba(120, 113, 108, 0.18);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__card {
        background: rgba(30, 25, 20, 0.7);
        border-color: rgba(255, 255, 255, 0.08);
        box-shadow:
          0 24px 80px rgba(0, 0, 0, 0.3),
          0 0 0 1px rgba(255, 255, 255, 0.08) inset,
          0 1px 0 rgba(255, 255, 255, 0.12) inset;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__close {
        color: #a8a29e;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__close:hover {
        color: #f5f5f4;
        background: rgba(255, 255, 255, 0.1);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__title {
        color: #f5f5f4;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__file {
        color: #a8a29e;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__tabs-shell {
        background: rgba(255, 255, 255, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__tab {
        color: #a8a29e;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__tab:hover {
        color: #f5f5f4;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__tab.is-active {
        background: rgba(255, 255, 255, 0.12);
        color: #fafaf9;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__tab-dot {
        background: rgba(245, 245, 244, 0.75);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__frame-shell {
        background: rgba(0, 0, 0, 0.2);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-panel {
        background: rgba(255, 255, 255, 0.05);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-panel-label,
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-loader-copy {
        color: #a8a29e;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-panel-file {
        color: #d6d3d1;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-loader {
        background: rgba(0, 0, 0, 0.24);
        color: #d6d3d1;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-spinner {
        border-color: rgba(255, 255, 255, 0.16);
        border-top-color: rgba(250, 250, 249, 0.85);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-grabber {
        background: rgba(255, 255, 255, 0.22);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__split-divider:hover .igcsefy-pdf-preview__split-grabber {
        background: rgba(255, 255, 255, 0.42);
      }
      .igcsefy-pdf-preview[data-theme="dark"][data-resizing="true"] .igcsefy-pdf-preview__split-grabber {
        background: rgba(255, 255, 255, 0.75);
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__action {
        border-color: rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.05);
        color: #e7e5e4;
      }
      .igcsefy-pdf-preview[data-theme="dark"] .igcsefy-pdf-preview__action:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fafaf9;
      }
      @media (min-width: 640px) {
        .igcsefy-pdf-preview {
          padding: 24px;
        }
        .igcsefy-pdf-preview__header {
          padding: 32px 32px 12px;
        }
        .igcsefy-pdf-preview__title {
          font-size: 1.25rem;
        }
        .igcsefy-pdf-preview__frame-wrap {
          padding: 0 32px;
        }
        .igcsefy-pdf-preview__split {
          padding: 0 32px;
        }
        .igcsefy-pdf-preview__frame-shell {
          height: 55vh;
        }
        .igcsefy-pdf-preview__actions {
          padding: 24px 32px 32px;
        }
      }
      @media (min-width: 768px) {
        .igcsefy-pdf-preview {
          padding: 40px;
        }
        .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__card {
          width: min(1400px, 95vw);
        }
      }
      @media (max-width: 767px) {
        .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__split-layout {
          grid-template-columns: 1fr;
          grid-template-rows:
            minmax(0, var(--igcsefy-split-primary, 50%))
            24px
            minmax(0, calc(100% - var(--igcsefy-split-primary, 50%) - 24px));
          height: min(74vh, 820px);
        }
        .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__split-divider {
          cursor: row-resize;
        }
        .igcsefy-pdf-preview[data-layout="split"] .igcsefy-pdf-preview__split-grabber {
          width: 40px;
          height: 4px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  let root = null;
  let backdrop = null;
  let card = null;
  let tabShell = null;
  let tabQp = null;
  let tabMs = null;
  let tabMsDot = null;
  let frame = null;
  let frameShell = null;
  let singleWrap = null;
  let singleActions = null;
  let title = null;
  let fileName = null;
  let openInNewTab = null;
  let downloadLink = null;
  let splitWrap = null;
  let splitLayout = null;
  let splitDivider = null;
  let qpPanelFileName = null;
  let msPanelFileName = null;
  let qpFrame = null;
  let msFrame = null;
  let msLoader = null;
  let dragLayer = null;
  let splitActions = null;
  let openQpLink = null;
  let downloadQpLink = null;
  let openMsLink = null;
  let downloadMsLink = null;
  let preloadFrame = null;
  let closeButton = null;
  let mounted = false;
  let animating = false;
  let closeTimer = 0;
  let openRafA = 0;
  let openRafB = 0;
  let previousBodyOverflow = "";
  let lastActiveElement = null;
  let activeTrigger = null;
  let pendingOnClose = null;
  let currentView = null;
  let currentTab = "qp";
  let splitRatio = 50;
  let dragCleanup = null;
  let sameTabLoadToken = 0;
  let preloadToken = 0;
  let splitMsLoadToken = 0;
  let splitMsStartTimer = 0;
  let splitPointerId = null;

  const viewer = {
    root: null,
    open,
    close,
    syncTheme
  };

  const clearOpenAnimationFrames = () => {
    if (openRafA) {
      cancelRaf(openRafA);
      openRafA = 0;
    }
    if (openRafB) {
      cancelRaf(openRafB);
      openRafB = 0;
    }
  };

  const clearDragSession = () => {
    if (dragCleanup) {
      dragCleanup();
      dragCleanup = null;
    }
    if (splitDivider && splitPointerId !== null && typeof splitDivider.releasePointerCapture === "function") {
      try {
        splitDivider.releasePointerCapture(splitPointerId);
      } catch (error) {}
    }
    splitPointerId = null;
    if (dragLayer) {
      dragLayer.hidden = true;
    }
    if (root) {
      root.dataset.resizing = "false";
      root.dataset.resizingAxis = "x";
    }
  };

  const clearSplitMsStartTimer = () => {
    if (splitMsStartTimer) {
      window.clearTimeout(splitMsStartTimer);
      splitMsStartTimer = 0;
    }
  };

  const setAnimating = next => {
    animating = !!next;
    if (root) {
      root.setAttribute("data-animating", animating ? "true" : "false");
      root.setAttribute("aria-hidden", animating ? "false" : "true");
    }
  };

  const isStackedSplitLayout = () => {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 767px)").matches;
  };

  const setSplitRatio = nextRatio => {
    const min = isStackedSplitLayout() ? 35 : 32;
    const max = isStackedSplitLayout() ? 65 : 68;
    splitRatio = Math.max(min, Math.min(max, Number(nextRatio) || 50));
    if (splitLayout) {
      splitLayout.style.setProperty("--igcsefy-split-primary", splitRatio + "%");
    }
  };

  const syncSingleActionLinks = doc => {
    const href = doc && doc.href ? doc.href : "/";
    const file = doc && doc.fileName ? doc.fileName : "";

    if (openInNewTab) {
      openInNewTab.href = href;
      openInNewTab.hidden = !doc;
    }
    if (downloadLink) {
      downloadLink.href = href;
      downloadLink.download = file;
      downloadLink.hidden = !doc;
    }
  };

  const syncSplitActionLinks = (qpDoc, msDoc) => {
    if (openQpLink) {
      openQpLink.href = qpDoc && qpDoc.href ? qpDoc.href : "/";
      openQpLink.hidden = !qpDoc;
    }
    if (downloadQpLink) {
      downloadQpLink.href = qpDoc && qpDoc.href ? qpDoc.href : "/";
      downloadQpLink.download = qpDoc && qpDoc.fileName ? qpDoc.fileName : "";
      downloadQpLink.hidden = !qpDoc;
    }
    if (openMsLink) {
      openMsLink.href = msDoc && msDoc.href ? msDoc.href : "/";
      openMsLink.hidden = !msDoc;
    }
    if (downloadMsLink) {
      downloadMsLink.href = msDoc && msDoc.href ? msDoc.href : "/";
      downloadMsLink.download = msDoc && msDoc.fileName ? msDoc.fileName : "";
      downloadMsLink.hidden = !msDoc;
    }
  };

  const setLayout = layout => {
    if (!root) return;
    root.dataset.layout = layout || "single";
  };

  const syncTabState = () => {
    const hasSameTabView = !!(currentView && currentView.layout === "same-tab");
    const hasMarkScheme = !!(hasSameTabView && currentView.ms && currentView.ms.href);
    const isMsLoading = !!(hasMarkScheme && currentView.ms.loading);

    if (tabShell) {
      tabShell.hidden = !hasSameTabView;
    }
    if (tabQp) {
      tabQp.classList.toggle("is-active", hasSameTabView && currentTab === "qp");
      tabQp.setAttribute("aria-pressed", hasSameTabView && currentTab === "qp" ? "true" : "false");
    }
    if (tabMs) {
      tabMs.classList.toggle("is-active", hasSameTabView && currentTab === "ms");
      tabMs.classList.toggle("is-loading", isMsLoading);
      tabMs.setAttribute("aria-pressed", hasSameTabView && currentTab === "ms" ? "true" : "false");
      tabMs.setAttribute("aria-disabled", hasMarkScheme ? "false" : "true");
      tabMs.disabled = !hasMarkScheme;
      tabMs.title = hasMarkScheme ? "Mark Scheme" : "Not available";
    }
    if (tabMsDot) {
      tabMsDot.hidden = !isMsLoading;
    }
  };

  const applySingleDocument = (doc, options = {}) => {
    if (!doc || !frame) {
      return;
    }

    const token = ++sameTabLoadToken;
    title.textContent = currentView && currentView.baseTitle
      ? currentView.baseTitle
      : (doc.label || "Paper preview");
    fileName.textContent = doc.fileName || "";
    syncSingleActionLinks(doc);

    if (frameShell) {
      frameShell.classList.toggle("is-switching", !!options.animate);
    }

    frame.onload = () => {
      if (token !== sameTabLoadToken) {
        return;
      }
      if (frameShell) {
        frameShell.classList.remove("is-switching");
      }
      if (currentView && currentView.layout === "same-tab" && doc.kind === "ms" && currentView.ms) {
        currentView.ms.loading = false;
        currentView.ms.ready = true;
        syncTabState();
      }
      frame.onload = null;
    };

    frame.src = doc.href;
    frame.title = `${doc.label || "Paper preview"} PDF preview`;
  };

  const switchSameTab = nextTab => {
    if (!currentView || currentView.layout !== "same-tab") {
      return;
    }

    if (nextTab === "ms" && !(currentView.ms && currentView.ms.href)) {
      return;
    }

    currentTab = nextTab === "ms" ? "ms" : "qp";
    syncTabState();
    applySingleDocument(currentTab === "ms" ? currentView.ms : currentView.qp, {
      animate: true
    });
  };

  const beginMarkSchemePreload = msDoc => {
    if (!preloadFrame || !msDoc || !msDoc.href) {
      return;
    }

    const token = ++preloadToken;
    currentView.ms.loading = true;
    syncTabState();

    preloadFrame.onload = () => {
      if (!currentView || currentView.layout !== "same-tab" || token !== preloadToken) {
        return;
      }
      if (currentView.ms) {
        currentView.ms.loading = false;
        currentView.ms.ready = true;
      }
      syncTabState();
      preloadFrame.onload = null;
    };

    preloadFrame.src = msDoc.href;
  };

  const renderSingleView = request => {
    setLayout("single");
    currentView = {
      layout: "single",
      baseTitle: request.baseTitle || request.doc.label || "Paper preview",
      doc: request.doc
    };
    if (tabShell) {
      tabShell.hidden = true;
    }
    if (singleWrap) {
      singleWrap.hidden = false;
    }
    if (singleActions) {
      singleActions.hidden = false;
    }
    if (splitWrap) {
      splitWrap.hidden = true;
    }
    if (splitActions) {
      splitActions.hidden = true;
    }
    applySingleDocument(request.doc, { animate: false });
  };

  const renderSameTabView = request => {
    currentTab = "qp";
    currentView = {
      layout: "same-tab",
      baseTitle: request.baseTitle || request.qp.label || "Paper preview",
      qp: request.qp,
      ms: request.ms
        ? Object.assign({}, request.ms, {
            loading: true,
            ready: false
          })
        : null
    };

    setLayout("same-tab");
    if (singleWrap) {
      singleWrap.hidden = false;
    }
    if (singleActions) {
      singleActions.hidden = false;
    }
    if (splitWrap) {
      splitWrap.hidden = true;
    }
    if (splitActions) {
      splitActions.hidden = true;
    }
    syncTabState();
    applySingleDocument(request.qp, { animate: false });
    if (currentView.ms) {
      beginMarkSchemePreload(currentView.ms);
    }
  };

  const renderSplitView = request => {
    const defaultRatio = typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth < 1024
      ? 60
      : 50;

    currentView = {
      layout: "split",
      baseTitle: request.baseTitle || request.qp.label || "Paper preview",
      qp: request.qp,
      ms: request.ms
    };

    setLayout("split");
    if (tabShell) {
      tabShell.hidden = true;
    }
    if (singleWrap) {
      singleWrap.hidden = true;
    }
    if (singleActions) {
      singleActions.hidden = true;
    }
    if (splitWrap) {
      splitWrap.hidden = false;
    }
    if (splitActions) {
      splitActions.hidden = false;
    }

    title.textContent = currentView.baseTitle;
    fileName.textContent = "";
    syncSplitActionLinks(request.qp, request.ms);
    setSplitRatio(defaultRatio);

    if (qpPanelFileName) {
      qpPanelFileName.textContent = request.qp.fileName || "";
    }
    if (msPanelFileName) {
      msPanelFileName.textContent = request.ms.fileName || "";
    }
    if (qpFrame) {
      qpFrame.src = request.qp.href;
      qpFrame.title = `${request.qp.label || "Question Paper"} PDF preview`;
    }
    if (msLoader) {
      msLoader.hidden = false;
    }
    if (msFrame) {
      const token = ++splitMsLoadToken;
      clearSplitMsStartTimer();
      msFrame.onload = () => {
        if (token !== splitMsLoadToken) {
          return;
        }
        if (msLoader) {
          msLoader.hidden = true;
        }
        msFrame.onload = null;
      };
      msFrame.src = "about:blank";
      splitMsStartTimer = window.setTimeout(() => {
        splitMsStartTimer = 0;
        if (token !== splitMsLoadToken) {
          return;
        }
        msFrame.src = request.ms.href;
        msFrame.title = `${request.ms.label || "Mark Scheme"} PDF preview`;
      }, 60);
    }
  };

  const handleKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const buildRoot = () => {
    if (root) {
      return;
    }

    root = document.createElement("div");
    root.id = PAST_PAPER_PREVIEW_MODAL_ID;
    root.className = "igcsefy-pdf-preview";
    root.setAttribute("data-animating", "false");
    root.setAttribute("aria-hidden", "true");
    root.dataset.layout = "single";
    root.dataset.resizing = "false";
    root.dataset.resizingAxis = "x";
    root.innerHTML = `
      <div class="igcsefy-pdf-preview__backdrop" data-role="backdrop" aria-hidden="true"></div>
      <div class="igcsefy-pdf-preview__drag-layer" data-role="drag-layer" hidden aria-hidden="true"></div>
      <div class="igcsefy-pdf-preview__card" role="dialog" aria-modal="true" aria-labelledby="igcsefy-pdf-preview-title">
        <button type="button" class="igcsefy-pdf-preview__close" data-role="close" aria-label="Close preview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18"></path>
            <path d="M6 6L18 18"></path>
          </svg>
        </button>
        <div class="igcsefy-pdf-preview__header">
          <div class="igcsefy-pdf-preview__tabs" data-role="tabs" hidden>
            <div class="igcsefy-pdf-preview__tabs-shell">
              <button type="button" class="igcsefy-pdf-preview__tab is-active" data-role="tab-qp" aria-pressed="true">Question Paper</button>
              <button type="button" class="igcsefy-pdf-preview__tab" data-role="tab-ms" aria-pressed="false" aria-disabled="true">
                <span class="igcsefy-pdf-preview__tab-dot" data-role="tab-ms-dot" hidden></span>
                <span>Mark Scheme</span>
              </button>
            </div>
          </div>
          <h2 id="igcsefy-pdf-preview-title" class="igcsefy-pdf-preview__title">Paper preview</h2>
          <p class="igcsefy-pdf-preview__file" data-role="file-name"></p>
        </div>
        <div class="igcsefy-pdf-preview__frame-wrap" data-role="single-wrap">
          <div class="igcsefy-pdf-preview__frame-shell" data-role="frame-shell">
            <iframe class="igcsefy-pdf-preview__frame" data-role="frame" title="PDF preview"></iframe>
          </div>
        </div>
        <div class="igcsefy-pdf-preview__split" data-role="split-wrap" hidden>
          <div class="igcsefy-pdf-preview__split-layout" data-role="split-layout">
            <div class="igcsefy-pdf-preview__split-panel">
              <div class="igcsefy-pdf-preview__split-panel-head">
                <p class="igcsefy-pdf-preview__split-panel-label">Question Paper</p>
                <p class="igcsefy-pdf-preview__split-panel-file" data-role="split-qp-file"></p>
              </div>
              <div class="igcsefy-pdf-preview__split-panel-frame">
                <iframe class="igcsefy-pdf-preview__split-iframe" data-role="split-qp-frame" title="Question Paper PDF preview"></iframe>
              </div>
            </div>
            <div class="igcsefy-pdf-preview__split-divider" data-role="split-divider" aria-hidden="true">
              <div class="igcsefy-pdf-preview__split-grabber"></div>
            </div>
            <div class="igcsefy-pdf-preview__split-panel">
              <div class="igcsefy-pdf-preview__split-panel-head">
                <p class="igcsefy-pdf-preview__split-panel-label">Mark Scheme</p>
                <p class="igcsefy-pdf-preview__split-panel-file" data-role="split-ms-file"></p>
              </div>
              <div class="igcsefy-pdf-preview__split-panel-frame">
                <iframe class="igcsefy-pdf-preview__split-iframe" data-role="split-ms-frame" title="Mark Scheme PDF preview"></iframe>
                <div class="igcsefy-pdf-preview__split-loader" data-role="split-ms-loader">
                  <div class="igcsefy-pdf-preview__split-spinner" aria-hidden="true"></div>
                  <div class="igcsefy-pdf-preview__split-loader-copy">Loading mark scheme…</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="igcsefy-pdf-preview__actions igcsefy-pdf-preview__actions--single" data-role="single-actions">
          <a class="igcsefy-pdf-preview__action" data-role="new-tab" href="/" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 5h5v5"></path>
              <path d="M10 14L19 5"></path>
              <path d="M19 14v5h-5"></path>
              <path d="M5 10V5h5"></path>
            </svg>
            Open in new tab
          </a>
          <a class="igcsefy-pdf-preview__action" data-role="download" href="/" download>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v12"></path>
              <path d="M7 10l5 5 5-5"></path>
              <path d="M5 21h14"></path>
            </svg>
            Download
          </a>
        </div>
        <div class="igcsefy-pdf-preview__actions igcsefy-pdf-preview__actions--split" data-role="split-actions" hidden>
          <a class="igcsefy-pdf-preview__action" data-role="open-qp" href="/" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 5h5v5"></path>
              <path d="M10 14L19 5"></path>
              <path d="M19 14v5h-5"></path>
              <path d="M5 10V5h5"></path>
            </svg>
            Open QP
          </a>
          <a class="igcsefy-pdf-preview__action" data-role="download-qp" href="/" download>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v12"></path>
              <path d="M7 10l5 5 5-5"></path>
              <path d="M5 21h14"></path>
            </svg>
            Download QP
          </a>
          <span class="igcsefy-pdf-preview__actions-separator" aria-hidden="true">·</span>
          <a class="igcsefy-pdf-preview__action" data-role="open-ms" href="/" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 5h5v5"></path>
              <path d="M10 14L19 5"></path>
              <path d="M19 14v5h-5"></path>
              <path d="M5 10V5h5"></path>
            </svg>
            Open MS
          </a>
          <a class="igcsefy-pdf-preview__action" data-role="download-ms" href="/" download>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v12"></path>
              <path d="M7 10l5 5 5-5"></path>
              <path d="M5 21h14"></path>
            </svg>
            Download MS
          </a>
        </div>
        <iframe class="igcsefy-pdf-preview__preload" data-role="preload-frame" aria-hidden="true" tabindex="-1"></iframe>
      </div>
    `;

    backdrop = root.querySelector('[data-role="backdrop"]');
    dragLayer = root.querySelector('[data-role="drag-layer"]');
    card = root.querySelector(".igcsefy-pdf-preview__card");
    tabShell = root.querySelector('[data-role="tabs"]');
    tabQp = root.querySelector('[data-role="tab-qp"]');
    tabMs = root.querySelector('[data-role="tab-ms"]');
    tabMsDot = root.querySelector('[data-role="tab-ms-dot"]');
    frame = root.querySelector('[data-role="frame"]');
    frameShell = root.querySelector('[data-role="frame-shell"]');
    singleWrap = root.querySelector('[data-role="single-wrap"]');
    singleActions = root.querySelector('[data-role="single-actions"]');
    title = root.querySelector(".igcsefy-pdf-preview__title");
    fileName = root.querySelector('[data-role="file-name"]');
    openInNewTab = root.querySelector('[data-role="new-tab"]');
    downloadLink = root.querySelector('[data-role="download"]');
    splitWrap = root.querySelector('[data-role="split-wrap"]');
    splitLayout = root.querySelector('[data-role="split-layout"]');
    splitDivider = root.querySelector('[data-role="split-divider"]');
    qpPanelFileName = root.querySelector('[data-role="split-qp-file"]');
    msPanelFileName = root.querySelector('[data-role="split-ms-file"]');
    qpFrame = root.querySelector('[data-role="split-qp-frame"]');
    msFrame = root.querySelector('[data-role="split-ms-frame"]');
    msLoader = root.querySelector('[data-role="split-ms-loader"]');
    splitActions = root.querySelector('[data-role="split-actions"]');
    openQpLink = root.querySelector('[data-role="open-qp"]');
    downloadQpLink = root.querySelector('[data-role="download-qp"]');
    openMsLink = root.querySelector('[data-role="open-ms"]');
    downloadMsLink = root.querySelector('[data-role="download-ms"]');
    preloadFrame = root.querySelector('[data-role="preload-frame"]');
    closeButton = root.querySelector('[data-role="close"]');

    if (backdrop) {
      backdrop.addEventListener("click", () => close());
    }
    if (closeButton) {
      closeButton.addEventListener("click", () => close());
    }
    if (downloadLink) {
      downloadLink.addEventListener("click", event => {
        const href = String(downloadLink.getAttribute("href") || "").trim();
        if (!href) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        downloadPastPaperFile(href);
        handlePastPaperAfterDownload(activeTrigger, { closeViewer: true });
      });
    }
    if (downloadQpLink) {
      downloadQpLink.addEventListener("click", event => {
        const href = String(downloadQpLink.getAttribute("href") || "").trim();
        if (!href) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        downloadPastPaperFile(href);
        handlePastPaperAfterDownload(activeTrigger, { closeViewer: true });
      });
    }
    if (downloadMsLink) {
      downloadMsLink.addEventListener("click", event => {
        const href = String(downloadMsLink.getAttribute("href") || "").trim();
        if (!href) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        downloadPastPaperFile(href);
        handlePastPaperAfterDownload(activeTrigger, { closeViewer: true });
      });
    }
    if (tabQp) {
      tabQp.addEventListener("click", () => switchSameTab("qp"));
    }
    if (tabMs) {
      tabMs.addEventListener("click", () => switchSameTab("ms"));
    }
    if (splitDivider) {
      splitDivider.addEventListener("pointerdown", event => {
        if (!mounted || !splitLayout || root.dataset.layout !== "split") {
          return;
        }

        event.preventDefault();
        clearDragSession();
        const bounds = splitLayout.getBoundingClientRect();
        const axis = isStackedSplitLayout() ? "y" : "x";
        root.dataset.resizing = "true";
        root.dataset.resizingAxis = axis;
        if (dragLayer) {
          dragLayer.hidden = false;
        }
        splitPointerId = typeof event.pointerId === "number" ? event.pointerId : null;
        if (splitPointerId !== null && typeof splitDivider.setPointerCapture === "function") {
          try {
            splitDivider.setPointerCapture(splitPointerId);
          } catch (error) {}
        }

        const move = moveEvent => {
          const nextRatio = axis === "y"
            ? ((moveEvent.clientY - bounds.top) / bounds.height) * 100
            : ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
          setSplitRatio(nextRatio);
        };

        const stop = () => {
          clearDragSession();
        };

        const moveTarget = splitDivider;
        const fallbackTarget = document;
        moveTarget.addEventListener("pointermove", move);
        moveTarget.addEventListener("pointerup", stop, { once: true });
        moveTarget.addEventListener("pointercancel", stop, { once: true });
        fallbackTarget.addEventListener("pointermove", move);
        fallbackTarget.addEventListener("pointerup", stop, { once: true });
        fallbackTarget.addEventListener("pointercancel", stop, { once: true });
        dragCleanup = () => {
          moveTarget.removeEventListener("pointermove", move);
          moveTarget.removeEventListener("pointerup", stop);
          moveTarget.removeEventListener("pointercancel", stop);
          fallbackTarget.removeEventListener("pointermove", move);
          fallbackTarget.removeEventListener("pointerup", stop);
          fallbackTarget.removeEventListener("pointercancel", stop);
        };
      });
    }

    viewer.root = root;
    syncTheme();
  };

  const mountRoot = () => {
    buildRoot();
    if (mounted) {
      return;
    }
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    document.body.appendChild(root);
    mounted = true;
  };

  const unmountRoot = () => {
    clearOpenAnimationFrames();
    clearDragSession();
    clearSplitMsStartTimer();
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    document.removeEventListener("keydown", handleKeyDown);
    document.body.style.overflow = previousBodyOverflow || "";
    previousBodyOverflow = "";
    if (frame) {
      frame.src = "about:blank";
    }
    if (qpFrame) {
      qpFrame.src = "about:blank";
    }
    if (msFrame) {
      msFrame.src = "about:blank";
    }
    if (preloadFrame) {
      preloadFrame.src = "about:blank";
    }
    currentView = null;
    activeTrigger = null;
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
    mounted = false;
    setAnimating(false);
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    lastActiveElement = null;
  };

  function syncTheme() {
    if (!root) {
      return;
    }
    root.dataset.theme = isPastPaperLightTheme() ? "light" : "dark";
    if (card) {
      card.dataset.theme = root.dataset.theme;
    }
  }

  function close(afterClose) {
    if (typeof afterClose === "function") {
      pendingOnClose = afterClose;
    }
    if (!mounted || !root) {
      if (pendingOnClose) {
        const callback = pendingOnClose;
        pendingOnClose = null;
        callback();
      }
      return;
    }

    clearOpenAnimationFrames();
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    setAnimating(false);
    closeTimer = window.setTimeout(() => {
      unmountRoot();
      if (pendingOnClose) {
        const callback = pendingOnClose;
        pendingOnClose = null;
        callback();
      }
    }, closeDurationMs);
  }

  function open(href, label, sourceTrigger, options) {
    const resolvedHref = String(href || "").trim();
    if (!resolvedHref) {
      return;
    }

    const request = options && typeof options === "object" ? options : {};
    const primaryDoc = request.doc || request.qp || getPastPaperDocumentFromTrigger(sourceTrigger) || {
      kind: normalizePastPaperFileKind(sourceTrigger && sourceTrigger.getAttribute("data-file-kind")) || "qp",
      href: resolvedHref,
      label: label || "Paper preview",
      fileName: getPastPaperFileName(resolvedHref),
      shortLabel: "Question Paper"
    };
    const layout = request.layout || "single";

    buildRoot();
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    clearDragSession();
    clearOpenAnimationFrames();
    pendingOnClose = null;
    lastActiveElement = document.activeElement;
    activeTrigger = sourceTrigger || null;
    syncTheme();
    mountRoot();
    setAnimating(false);

    if (layout === "split" && request.qp && request.ms) {
      renderSplitView({
        baseTitle: request.baseTitle || stripPastPaperKindSuffix(request.qp.label),
        qp: request.qp,
        ms: request.ms
      });
    } else if (layout === "same-tab" && request.qp) {
      renderSameTabView({
        baseTitle: request.baseTitle || stripPastPaperKindSuffix(request.qp.label),
        qp: request.qp,
        ms: request.ms || null
      });
    } else {
      renderSingleView({
        baseTitle: request.baseTitle || primaryDoc.label,
        doc: primaryDoc
      });
    }

    openRafA = raf(() => {
      openRafA = 0;
      openRafB = raf(() => {
        openRafB = 0;
        setAnimating(true);
        if (closeButton && typeof closeButton.focus === "function") {
          closeButton.focus();
        }
      });
    });
  }

  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });
  }

  window.__igcsefyPastPaperPreviewViewer = viewer;
  return viewer;
}

function showPastPaperToast(message, kind) {
  if (typeof document === "undefined" || !document.body) {
    return;
  }

  ensurePastPaperPreviewViewer();

  let host = document.getElementById("igcsefy-past-paper-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "igcsefy-past-paper-toast-host";
    host.className = "igcsefy-past-paper-toast-host";
    document.body.appendChild(host);
  }

  host.innerHTML = "";

  const iconMarkup = kind === "external"
    ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M14 5h5v5"></path>
        <path d="M10 14L19 5"></path>
        <path d="M19 14v5h-5"></path>
        <path d="M5 10V5h5"></path>
      </svg>
    `
    : `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 8h.01"></path>
        <path d="M11 12h1v4h1"></path>
      </svg>
    `;

  const toast = document.createElement("div");
  toast.className = "igcsefy-past-paper-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `${iconMarkup}<span class="igcsefy-past-paper-toast__label">${escapePastPaperHtml(message)}</span>`;
  host.appendChild(toast);

  window.requestAnimationFrame(() => {
    toast.dataset.visible = "true";
  });

  const dismiss = () => {
    toast.dataset.visible = "false";
    window.setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      if (host && !host.childElementCount && host.parentNode) {
        host.parentNode.removeChild(host);
      }
    }, 220);
  };

  window.setTimeout(dismiss, 3000);
}

function handlePastPaperFileAction(target) {
  const trigger = target && target.closest ? target.closest("[data-paper-file]") : null;
  if (!trigger) {
    return;
  }

  const href = String(
    trigger.getAttribute("data-file-href")
    || trigger.getAttribute("href")
    || trigger.getAttribute("data-href")
    || ""
  ).trim();
  if (!href) {
    return;
  }

  const label = String(
    trigger.getAttribute("data-file-label")
    || trigger.getAttribute("aria-label")
    || trigger.textContent
    || "Paper preview"
  ).trim();
  const preferences = readPastPaperOpenPreferences();
  const relatedDocs = getAssociatedPastPaperDocuments(trigger);
  const isQuestionPaper = !!(relatedDocs.current && relatedDocs.current.kind === "qp");
  const hasMarkScheme = !!(relatedDocs.ms && relatedDocs.ms.href);
  const shouldAutoOpenMarkScheme = (
    preferences.pdfOpeningMode === "preview"
    && preferences.autoOpenMarkScheme
    && isQuestionPaper
  );

  if (preferences.markAsInProgress) {
    markPastPaperTrackAsInProgress(trigger);
  }

  if (shouldAutoOpenMarkScheme) {
    const behavior = resolvePastPaperMarkSchemeLayout(preferences.markSchemeOpenBehavior);
    const viewer = ensurePastPaperPreviewViewer();
    if (viewer && typeof viewer.open === "function") {
      if (behavior === "side-by-side" && hasMarkScheme) {
        viewer.open(href, label, trigger, {
          layout: "split",
          baseTitle: relatedDocs.baseTitle,
          qp: relatedDocs.qp || relatedDocs.current,
          ms: relatedDocs.ms
        });
        return;
      }

      if (behavior === "side-by-side" && !hasMarkScheme) {
        showPastPaperToast("No mark scheme available for this paper", "info");
      }

      viewer.open(href, label, trigger, {
        layout: "same-tab",
        baseTitle: relatedDocs.baseTitle,
        qp: relatedDocs.qp || relatedDocs.current,
        ms: hasMarkScheme ? relatedDocs.ms : null
      });
      return;
    }
  }

  if (preferences.pdfOpeningMode === "preview" && isPastPaperPdfHref(href)) {
    const viewer = ensurePastPaperPreviewViewer();
    if (viewer && typeof viewer.open === "function") {
      viewer.open(href, label, trigger);
      return;
    }
  }

  downloadPastPaperFile(href);
  handlePastPaperAfterDownload(trigger);
}

function ensureIgcsefyDataStore(){
  if(typeof window === 'undefined'){
    return {
      getSnapshot(){ return {}; },
      getRequestedLevel(){ return ''; },
      getSubjectLevel(_subject, fallback){ return fallback || 'core'; },
      setSubjectLevel(){ return {}; },
      setTrackedSubjects(){ return {}; },
      getSyllabusStates(){ return {}; },
      setSyllabusStates(){ return {}; },
      getSyllabusState(){ return 'not_started'; },
      setSyllabusState(){ return {}; },
      getPastPaperStatuses(){ return {}; },
      setPastPaperStatuses(){ return {}; },
      getPastPaperStatus(){ return 'none'; },
      setPastPaperStatus(){ return {}; },
      replaceSnapshot(){ return {}; }
    };
  }

  if(window.igcsefyDataStore){
    return window.igcsefyDataStore;
  }

  const CHANGE_EVENT = 'igcsefy:data-change';
  const ADAPTER_READY_EVENT = 'igcsefy:data-adapter-ready';
  const LEVELS = new Set(['core', 'extended']);
  const SYLLABUS_STATES = new Set(['in_progress', 'completed']);
  const PAST_PAPER_STATES = new Set(['in_progress', 'done', 'reviewed']);

  let snapshot = createEmptySnapshot();
  let remoteSaveTimer = 0;
  let remoteLoadStarted = false;
  let remoteSubscribed = false;

  function clone(value){
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(error){
      return value;
    }
  }

  function cleanRecord(record, allowedValues){
    const next = {};
    if(!record || typeof record !== 'object' || Array.isArray(record)) return next;
    Object.keys(record).forEach(key => {
      const value = record[key];
      if(allowedValues.has(value)){
        next[String(key)] = value;
      }
    });
    return next;
  }

  function normalizeTrackedSubjects(subjects){
    if(!Array.isArray(subjects)) return [];

    const seen = new Set();
    return subjects.map(subject => {
      const code = String(subject && subject.code ? subject.code : '').trim();
      const slug = String(subject && subject.slug ? subject.slug : '').trim();
      const name = String(subject && subject.name ? subject.name : code || slug).trim();
      const key = slug || code;

      if(!key || seen.has(key)) return null;
      seen.add(key);

      const entry = {
        code,
        slug,
        name: name || code || slug
      };

      if(subject && subject.hasDistinctLevels){
        entry.hasDistinctLevels = true;
      }

      if(subject && LEVELS.has(subject.level)){
        entry.level = subject.level;
      }

      return entry;
    }).filter(Boolean);
  }

  function normalizeSubjectPreferences(preferences){
    const next = {};
    if(!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return next;

    Object.keys(preferences).forEach(key => {
      const value = preferences[key];
      if(!value || typeof value !== 'object' || !LEVELS.has(value.level)) return;
      next[String(key)] = {
        level: value.level,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
      };
    });

    return next;
  }

  function normaliseSnapshot(input){
    if(!input || typeof input !== 'object' || Array.isArray(input)){
      return createEmptySnapshot();
    }

    return {
      trackedSubjects: normalizeTrackedSubjects(input.trackedSubjects),
      subjectPreferences: normalizeSubjectPreferences(input.subjectPreferences),
      syllabusTopicStates: cleanRecord(input.syllabusTopicStates, SYLLABUS_STATES),
      pastPaperStatuses: cleanRecord(input.pastPaperStatuses, PAST_PAPER_STATES),
      updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null
    };
  }

  function createEmptySnapshot(){
    return {
      trackedSubjects: [],
      subjectPreferences: {},
      syllabusTopicStates: {},
      pastPaperStatuses: {},
      updatedAt: null
    };
  }

  function serialiseSnapshot(input){
    const normalized = normaliseSnapshot(input);
    normalized.updatedAt = null;
    return JSON.stringify(normalized);
  }

  function emitStoreChange(reason, meta){
    try{
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
        detail: {
          reason,
          meta: meta || null,
          snapshot: clone(snapshot)
        }
      }));
    }catch(error){}
  }

  function resolveAdapter(){
    return window.igcsefyDataStoreAdapter || null;
  }

  function scheduleRemoteSave(reason){
    const adapter = resolveAdapter();
    if(!adapter || typeof adapter.save !== 'function') return;

    if(remoteSaveTimer){
      window.clearTimeout(remoteSaveTimer);
    }

    remoteSaveTimer = window.setTimeout(async () => {
      try{
        await adapter.save(clone(snapshot), { reason });
      }catch(error){
        console.error('IGCSEfy data sync failed:', error);
      }
    }, 160);
  }

  function setSnapshot(nextSnapshot, reason, options){
    const normalized = normaliseSnapshot(nextSnapshot);
    const currentSerialised = serialiseSnapshot(snapshot);
    const nextSerialised = serialiseSnapshot(normalized);

    if(currentSerialised === nextSerialised){
      return clone(snapshot);
    }

    snapshot = normalized;
    snapshot.updatedAt = new Date().toISOString();
    emitStoreChange(reason, options && options.meta);

    if(!(options && options.skipRemote)){
      scheduleRemoteSave(reason);
    }

    return clone(snapshot);
  }

  function updateSnapshot(mutator, reason, options){
    const draft = clone(snapshot);
    mutator(draft);
    return setSnapshot(draft, reason, options);
  }

  function getSubjectKey(subject){
    if(subject && typeof subject === 'object'){
      const slug = String(subject.slug || subject.subjectSlug || '').trim();
      if(slug) return slug;
      const code = String(subject.code || '').trim();
      if(code) return code;
    }
    return String(subject || '').trim();
  }

  function getSubjectPreferenceKeys(subject){
    const keys = [];
    if(subject && typeof subject === 'object'){
      const slug = String(subject.slug || subject.subjectSlug || '').trim();
      const code = String(subject.code || '').trim();
      if(slug) keys.push(slug);
      if(code && !keys.includes(code)) keys.push(code);
      return keys;
    }
    const value = String(subject || '').trim();
    return value ? [value] : [];
  }

  function getStoredSubjectPreference(subjectPreferences, subject){
    const keys = getSubjectPreferenceKeys(subject);
    for(const key of keys){
      const preferred = subjectPreferences[key];
      if(preferred && LEVELS.has(preferred.level)){
        return preferred;
      }
    }
    return null;
  }

  function applyTrackedSubjectPreferences(subjects, subjectPreferences){
    return normalizeTrackedSubjects(subjects).map(subject => {
      const preferred = getStoredSubjectPreference(subjectPreferences, subject);
      if(preferred){
        return Object.assign({}, subject, { level: preferred.level });
      }
      return subject;
    });
  }

  function getRequestedLevel(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      const value = String(params.get('level') || '').toLowerCase().trim();
      return LEVELS.has(value) ? value : '';
    }catch(error){
      return '';
    }
  }

  function initRemote(){
    const adapter = resolveAdapter();
    if(!adapter) return;

    if(!remoteLoadStarted && typeof adapter.load === 'function'){
      remoteLoadStarted = true;
      Promise.resolve(adapter.load())
        .then(remoteSnapshot => {
          if(remoteSnapshot){
            applyRemoteSnapshot(remoteSnapshot, 'remote-load');
          }
        })
        .catch(error => {
          remoteLoadStarted = false;
          console.error('IGCSEfy remote load failed:', error);
        });
    }

    if(!remoteSubscribed && typeof adapter.subscribe === 'function'){
      remoteSubscribed = true;
      try{
        adapter.subscribe(remoteSnapshot => {
          if(remoteSnapshot){
            applyRemoteSnapshot(remoteSnapshot, 'remote-update');
          }
        });
      }catch(error){
        remoteSubscribed = false;
        console.error('IGCSEFy remote subscription failed:', error);
      }
    }
  }

  window.addEventListener(ADAPTER_READY_EVENT, initRemote);

  const api = {
    getSnapshot(){
      initRemote();
      return clone(snapshot);
    },
    getRequestedLevel,
    getSubjectLevel(subject, fallback){
      initRemote();
      const requestedLevel = getRequestedLevel();
      if(requestedLevel) return requestedLevel;

      const preferred = getStoredSubjectPreference(snapshot.subjectPreferences, subject);
      return preferred ? preferred.level : (fallback || 'core');
    },
    replaceSnapshot(nextSnapshot, reason, options){
      return applyRemoteSnapshot(nextSnapshot, reason || 'remote-update', options);
    },
    setSubjectLevel(subject, level){
      if(!LEVELS.has(level)) return clone(snapshot);
      const keys = getSubjectPreferenceKeys(subject);
      if(!keys.length) return clone(snapshot);

      const existing = getStoredSubjectPreference(snapshot.subjectPreferences, subject);
      if(existing && existing.level === level){
        return clone(snapshot);
      }

      return updateSnapshot(draft => {
        const updatedAt = new Date().toISOString();
        keys.forEach(key => {
          draft.subjectPreferences[key] = { level, updatedAt };
        });
        draft.trackedSubjects = draft.trackedSubjects.map(item => {
          const itemKeys = getSubjectPreferenceKeys(item);
          return itemKeys.some(key => keys.includes(key)) ? Object.assign({}, item, { level }) : item;
        });
      }, 'subject-level', { meta: { subjectKey: keys[0], level } });
    },
    setTrackedSubjects(subjects){
      const normalizedSubjects = applyTrackedSubjectPreferences(subjects, snapshot.subjectPreferences);

      return updateSnapshot(draft => {
        draft.trackedSubjects = normalizedSubjects;
        const allowedKeys = new Set();
        normalizedSubjects.forEach(subject => {
          getSubjectPreferenceKeys(subject).forEach(key => allowedKeys.add(key));
        });
        Object.keys(draft.subjectPreferences).forEach(key => {
          if(!allowedKeys.has(key)){
            delete draft.subjectPreferences[key];
          }
        });
      }, 'tracked-subjects', { meta: { total: normalizedSubjects.length } });
    },
    getSyllabusStates(){
      initRemote();
      return Object.assign({}, snapshot.syllabusTopicStates);
    },
    setSyllabusStates(nextStates){
      return updateSnapshot(draft => {
        draft.syllabusTopicStates = cleanRecord(nextStates, SYLLABUS_STATES);
      }, 'syllabus-states');
    },
    getSyllabusState(topicKey){
      initRemote();
      return snapshot.syllabusTopicStates[topicKey] || 'not_started';
    },
    setSyllabusState(topicKey, state){
      const key = String(topicKey || '').trim();
      if(!key) return clone(snapshot);

      return updateSnapshot(draft => {
        if(!SYLLABUS_STATES.has(state)){
          delete draft.syllabusTopicStates[key];
          return;
        }
        draft.syllabusTopicStates[key] = state;
      }, 'syllabus-topic', { meta: { topicKey: key, state: state || 'not_started' } });
    },
    getPastPaperStatuses(){
      initRemote();
      return Object.assign({}, snapshot.pastPaperStatuses);
    },
    setPastPaperStatuses(nextStatuses){
      const normalizedStatuses = cleanRecord(nextStatuses, PAST_PAPER_STATES);
      const nextSnapshot = updateSnapshot(draft => {
        draft.pastPaperStatuses = normalizedStatuses;
      }, 'past-paper-statuses', { meta: { total: Object.keys(normalizedStatuses).length } });

      try{
        window.dispatchEvent(new CustomEvent('igcsefy:tracker-change', {
          detail: {
            store: Object.assign({}, nextSnapshot.pastPaperStatuses || {})
          }
        }));
      }catch(error){}

      return nextSnapshot;
    },
    getPastPaperStatus(trackKey){
      initRemote();
      return snapshot.pastPaperStatuses[trackKey] || 'none';
    },
    setPastPaperStatus(trackKey, status){
      const key = String(trackKey || '').trim();
      if(!key) return clone(snapshot);

      const nextSnapshot = updateSnapshot(draft => {
        if(!PAST_PAPER_STATES.has(status)){
          delete draft.pastPaperStatuses[key];
          return;
        }
        draft.pastPaperStatuses[key] = status;
      }, 'past-paper-status', { meta: { trackKey: key, status: status || 'none' } });

      try{
        window.dispatchEvent(new CustomEvent('igcsefy:tracker-change', {
          detail: {
            store: Object.assign({}, nextSnapshot.pastPaperStatuses || {})
          }
        }));
      }catch(error){}

      return nextSnapshot;
    }
  };

  function applyRemoteSnapshot(remoteSnapshot, reason, options){
    if(!remoteSnapshot){
      return clone(snapshot);
    }

    const normalized = normaliseSnapshot(remoteSnapshot);
    const subjectPreferences = normalizeSubjectPreferences(normalized.subjectPreferences);

    return setSnapshot({
      trackedSubjects: applyTrackedSubjectPreferences(normalized.trackedSubjects, subjectPreferences),
      subjectPreferences,
      syllabusTopicStates: Object.assign({}, normalized.syllabusTopicStates),
      pastPaperStatuses: Object.assign({}, normalized.pastPaperStatuses),
      updatedAt: normalized.updatedAt || null
    }, reason, { skipRemote: true });
  }

  window.igcsefyDataStore = api;
  initRemote();
  return api;
}

const PAPERS_CONFIG = {
  "accounting-0452": {
    "code": "0452",
    "name": "Accounting",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1",
        "label": "Paper 1 \u2013 Multiple Choice",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2",
        "label": "Paper 2 \u2013 Structured Questions",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      }
    ]
  },
  "business-studies-0450": {
    "code": "0450",
    "name": "Business Studies",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1",
        "label": "Paper 1 \u2013 Short Answer and Structured Responses",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2",
        "label": "Paper 2 \u2013 Case Study",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      }
    ]
  },
  "economics-0455": {
    "code": "0455",
    "name": "Economics",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1",
        "label": "Paper 1 \u2013 Multiple Choice",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2",
        "label": "Paper 2 \u2013 Structured Questions",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      }
    ]
  },

  "biology-0610": {
    "code": "0610",
    "name": "Biology",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
	    { "id": "p1c", "label": "Paper 1 – Multiple Choice", "qpVariants": ["11","12","13"], "msVariants": ["11","12","13"] },
	    { "id": "p2e", "label": "Paper 2 – Multiple Choice", "qpVariants": ["21","22","23"], "msVariants": ["21","22","23"] },
	    { "id": "p3c", "label": "Paper 3 – Theory", "qpVariants": ["31","32","33"], "msVariants": ["31","32","33"] },
	    { "id": "p4e", "label": "Paper 4 – Theory", "qpVariants": ["41","42","43"], "msVariants": ["41","42","43"] },
      { "id": "p5",  "label": "Paper 5 – Practical Test", "qpVariants": ["51","52","53"], "msVariants": ["51","52","53"] },
      { "id": "p6",  "label": "Paper 6 – Alternative to Practical", "qpVariants": ["61","62","63"], "msVariants": ["61","62","63"] }
    ]
  },
  "chemistry-0620": {
    "code": "0620",
    "name": "Chemistry",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
	    { "id": "p1c", "label": "Paper 1 – Multiple Choice", "qpVariants": ["11","12","13"], "msVariants": ["11","12","13"] },
	    { "id": "p2e", "label": "Paper 2 – Multiple Choice", "qpVariants": ["21","22","23"], "msVariants": ["21","22","23"] },
	    { "id": "p3c", "label": "Paper 3 – Theory", "qpVariants": ["31","32","33"], "msVariants": ["31","32","33"] },
	    { "id": "p4e", "label": "Paper 4 – Theory", "qpVariants": ["41","42","43"], "msVariants": ["41","42","43"] },
      { "id": "p5",  "label": "Paper 5 – Practical Test", "qpVariants": ["51","52","53"], "msVariants": ["51","52","53"] },
      { "id": "p6",  "label": "Paper 6 – Alternative to Practical", "qpVariants": ["61","62","63"], "msVariants": ["61","62","63"] }
    ]
  },

  "mathematics-0580": {
    "code": "0580",
    "name": "Mathematics",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1c",
        "label": "Paper 1 \u2013 Non-Calculator",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2e",
        "label": "Paper 2 \u2013 Non-Calculator",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      },
      {
        "id": "p3c",
        "label": "Paper 3 \u2013 Calculator",
        "qpVariants": [
          "31",
          "32",
          "33"
        ],
        "msVariants": [
          "31",
          "32",
          "33"
        ]
      },
      {
        "id": "p4e",
        "label": "Paper 4 \u2013 Calculator",
        "qpVariants": [
          "41",
          "42",
          "43"
        ],
        "msVariants": [
          "41",
          "42",
          "43"
        ]
      }
    ]
  },
  "physics-0625": {
    "code": "0625",
    "name": "Physics",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1c",
        "label": "Paper 1 \u2013 Multiple Choice",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2e",
        "label": "Paper 2 \u2013 Multiple Choice",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      },
      {
        "id": "p3c",
        "label": "Paper 3 \u2013 Theory",
        "qpVariants": [
          "31",
          "32",
          "33"
        ],
        "msVariants": [
          "31",
          "32",
          "33"
        ]
      },
      {
        "id": "p4e",
        "label": "Paper 4 \u2013 Theory",
        "qpVariants": [
          "41",
          "42",
          "43"
        ],
        "msVariants": [
          "41",
          "42",
          "43"
        ]
      },
      {
        "id": "p5",
        "label": "Paper 5 \u2013 Practical Test",
        "qpVariants": [
          "51",
          "52",
          "53"
        ],
        "msVariants": [
          "51",
          "52",
          "53"
        ]
      },
      {
        "id": "p6",
        "label": "Paper 6 \u2013 Alternative to Practical",
        "qpVariants": [
          "61",
          "62",
          "63"
        ],
        "msVariants": [
          "61",
          "62",
          "63"
        ]
      }
    ]
  },
  "english-first-language-0500": {
    "code": "0500",
    "name": "First Language English",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1",
        "label": "Paper 1 \u2013 Reading",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2",
        "label": "Paper 2 \u2013 Directed Writing and Composition",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      }
    ]
  },
  "computer-science-0478": {
    "code": "0478",
    "name": "Computer Science",
    "years": [
      2025,
      2024,
      2023,
      2022,
      2021,
      2020
    ],
    "papers": [
      {
        "id": "p1",
        "label": "Paper 1 \u2013 Computer Systems",
        "qpVariants": [
          "11",
          "12",
          "13"
        ],
        "msVariants": [
          "11",
          "12",
          "13"
        ]
      },
      {
        "id": "p2",
        "label": "Paper 2 \u2013 Algorithms, Programming and Logic",
        "qpVariants": [
          "21",
          "22",
          "23"
        ],
        "msVariants": [
          "21",
          "22",
          "23"
        ]
      }
    ]
  }
};

function hasPastPapersForSubject(subjectSlug){
  const normalized = String(subjectSlug || "").trim().toLowerCase();
  if(!normalized){
    return false;
  }
  return !!PAPERS_CONFIG[normalized];
}

if(typeof window !== "undefined"){
  window.igcsefyHasPastPapersForSubject = hasPastPapersForSubject;
}


const MATH0580_FILESET = new Set([
  "/past-papers/mathematics-0580/2020/m/0580_m20_ms_12.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_ms_22.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_ms_32.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_ms_42.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_qp_12.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_qp_22.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_qp_32.pdf",
  "/past-papers/mathematics-0580/2020/m/0580_m20_qp_42.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_11.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_12.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_13.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_21.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_22.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_23.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_31.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_32.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_33.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_41.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_42.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_ms_43.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_11.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_12.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_13.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_21.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_22.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_23.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_31.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_32.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_33.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_41.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_42.pdf",
  "/past-papers/mathematics-0580/2020/s/0580_s20_qp_43.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_11.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_12.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_13.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_21.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_22.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_23.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_31.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_32.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_33.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_41.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_42.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_ms_43.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_11.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_12.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_13.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_21.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_22.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_23.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_31.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_32.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_33.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_41.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_42.pdf",
  "/past-papers/mathematics-0580/2020/w/0580_w20_qp_43.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_ms_12.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_ms_22.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_ms_32.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_ms_42.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_qp_12.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_qp_22.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_qp_32.pdf",
  "/past-papers/mathematics-0580/2021/m/0580_m21_qp_42.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_11.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_12.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_13.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_21.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_22.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_23.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_31.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_32.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_33.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_41.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_42.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_ms_43.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_11.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_12.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_13.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_21.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_22.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_23.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_31.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_32.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_33.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_41.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_42.pdf",
  "/past-papers/mathematics-0580/2021/s/0580_s21_qp_43.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_11.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_12.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_13.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_21.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_22.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_23.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_31.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_32.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_33.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_41.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_42.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_ms_43.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_11.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_12.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_13.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_21.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_22.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_23.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_31.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_32.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_33.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_41.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_42.pdf",
  "/past-papers/mathematics-0580/2021/w/0580_w21_qp_43.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_ms_12.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_ms_22.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_ms_32.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_ms_42.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_qp_12.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_qp_22.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_qp_32.pdf",
  "/past-papers/mathematics-0580/2022/m/0580_m22_qp_42.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_11.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_12.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_13.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_21.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_22.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_23.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_31.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_32.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_33.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_41.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_42.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_ms_43.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_11.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_12.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_13.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_21.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_22.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_23.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_31.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_32.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_33.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_41.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_42.pdf",
  "/past-papers/mathematics-0580/2022/s/0580_s22_qp_43.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_11.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_12.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_13.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_21.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_22.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_23.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_31.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_32.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_33.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_41.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_42.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_ms_43.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_11.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_12.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_13.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_21.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_22.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_23.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_31.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_32.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_33.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_41.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_42.pdf",
  "/past-papers/mathematics-0580/2022/w/0580_w22_qp_43.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_ms_12.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_ms_22.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_ms_32.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_ms_42.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_qp_12.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_qp_22.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_qp_32.pdf",
  "/past-papers/mathematics-0580/2023/m/0580_m23_qp_42.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_11.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_12.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_13.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_21.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_22.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_23.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_31.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_32.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_33.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_41.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_42.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_ms_43.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_11.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_12.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_13.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_21.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_22.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_23.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_31.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_32.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_33.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_41.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_42.pdf",
  "/past-papers/mathematics-0580/2023/s/0580_s23_qp_43.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_11.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_12.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_13.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_21.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_22.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_23.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_31.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_32.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_33.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_41.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_42.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_ms_43.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_11.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_12.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_13.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_21.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_22.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_23.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_31.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_32.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_33.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_41.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_42.pdf",
  "/past-papers/mathematics-0580/2023/w/0580_w23_qp_43.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_ms_12.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_ms_22.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_ms_32.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_ms_42.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_qp_12.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_qp_22.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_qp_32.pdf",
  "/past-papers/mathematics-0580/2024/m/0580_m24_qp_42.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_11.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_12.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_13.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_21.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_22.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_23.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_31.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_32.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_33.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_41.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_42.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_ms_43.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_11.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_12.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_13.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_21.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_22.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_23.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_31.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_32.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_33.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_41.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_42.pdf",
  "/past-papers/mathematics-0580/2024/s/0580_s24_qp_43.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_11.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_12.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_13.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_21.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_22.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_23.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_31.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_32.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_33.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_41.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_42.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_ms_43.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_11.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_12.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_13.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_21.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_22.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_23.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_31.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_32.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_33.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_41.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_42.pdf",
  "/past-papers/mathematics-0580/2024/w/0580_w24_qp_43.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_ms_12.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_ms_22.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_ms_32.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_ms_42.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_qp_12.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_qp_22.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_qp_32.pdf",
  "/past-papers/mathematics-0580/2025/m/0580_m25_qp_42.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_11.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_12.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_13.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_21.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_22.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_23.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_31.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_32.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_33.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_41.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_42.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_ms_43.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_11.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_12.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_13.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_21.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_22.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_23.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_31.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_32.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_33.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_41.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_42.pdf",
  "/past-papers/mathematics-0580/2025/s/0580_s25_qp_43.pdf"
]);

const PHYS0625_FILESET = new Set([
  "/past-papers/physics-0625/2020/m/0625_m20_ms_12.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_ms_22.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_ms_32.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_ms_42.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_ms_52.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_ms_62.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_qp_12.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_qp_22.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_qp_32.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_qp_42.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_qp_52.pdf",
  "/past-papers/physics-0625/2020/m/0625_m20_qp_62.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_11.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_12.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_13.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_21.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_22.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_23.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_31.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_32.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_41.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_42.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_43.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_51.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_52.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_53.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_61.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_62.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_ms_63.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_11.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_12.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_13.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_21.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_22.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_23.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_31.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_32.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_41.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_42.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_43.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_51.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_52.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_53.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_61.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_62.pdf",
  "/past-papers/physics-0625/2020/s/0625_s20_qp_63.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_11.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_12.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_13.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_21.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_22.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_23.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_31.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_32.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_33.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_41.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_42.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_43.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_51.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_52.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_53.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_61.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_62.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_ms_63.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_11.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_12.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_13.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_21.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_22.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_23.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_31.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_32.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_33.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_41.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_42.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_43.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_51.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_52.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_53.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_61.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_62.pdf",
  "/past-papers/physics-0625/2020/w/0625_w20_qp_63.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_ms_12.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_ms_22.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_ms_32.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_ms_42.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_ms_52.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_ms_62.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_qp_12.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_qp_22.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_qp_32.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_qp_42.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_qp_52.pdf",
  "/past-papers/physics-0625/2021/m/0625_m21_qp_62.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_11.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_12.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_13.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_21.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_22.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_23.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_31.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_32.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_33.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_41.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_42.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_43.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_51.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_52.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_53.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_61.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_62.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_ms_63.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_11.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_12.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_13.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_21.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_22.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_23.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_31.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_32.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_33.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_41.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_42.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_43.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_51.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_52.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_53.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_61.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_62.pdf",
  "/past-papers/physics-0625/2021/s/0625_s21_qp_63.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_11.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_12.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_13.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_21.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_22.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_23.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_31.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_32.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_33.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_41.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_42.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_43.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_51.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_52.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_53.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_61.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_62.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_ms_63.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_11.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_12.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_13.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_21.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_22.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_23.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_31.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_32.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_33.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_41.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_42.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_43.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_51.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_52.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_53.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_61.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_62.pdf",
  "/past-papers/physics-0625/2021/w/0625_w21_qp_63.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_ms_12.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_ms_22.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_ms_32.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_ms_42.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_ms_52.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_ms_62.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_qp_12.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_qp_22.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_qp_32.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_qp_42.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_qp_52.pdf",
  "/past-papers/physics-0625/2022/m/0625_m22_qp_62.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_11.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_12.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_13.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_21.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_22.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_23.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_31.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_32.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_33.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_41.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_42.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_43.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_51.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_52.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_53.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_61.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_62.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_ms_63.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_11.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_12.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_13.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_21.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_22.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_23.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_31.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_32.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_33.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_41.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_42.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_43.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_51.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_52.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_53.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_61.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_62.pdf",
  "/past-papers/physics-0625/2022/s/0625_s22_qp_63.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_11.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_12.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_13.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_21.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_22.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_23.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_31.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_32.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_33.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_41.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_42.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_43.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_51.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_52.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_53.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_61.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_62.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_ms_63.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_11.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_12.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_13.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_21.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_22.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_23.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_31.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_32.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_33.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_41.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_42.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_43.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_51.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_52.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_53.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_61.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_62.pdf",
  "/past-papers/physics-0625/2022/w/0625_w22_qp_63.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_ms_12.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_ms_22.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_ms_32.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_ms_42.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_ms_52.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_ms_62.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_qp_12.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_qp_22.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_qp_32.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_qp_42.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_qp_52.pdf",
  "/past-papers/physics-0625/2023/m/0625_m23_qp_62.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_11.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_12.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_13.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_21.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_22.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_23.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_31.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_32.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_33.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_41.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_42.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_43.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_51.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_52.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_53.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_61.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_62.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_ms_63.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_11.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_12.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_13.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_21.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_22.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_23.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_31.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_32.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_33.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_41.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_42.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_43.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_51.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_52.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_53.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_61.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_62.pdf",
  "/past-papers/physics-0625/2023/s/0625_s23_qp_63.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_11.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_12.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_13.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_21.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_22.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_23.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_31.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_32.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_33.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_41.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_42.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_43.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_51.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_52.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_53.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_61.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_62.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_ms_63.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_11.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_12.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_13.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_21.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_22.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_23.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_31.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_32.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_33.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_41.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_42.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_43.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_51.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_52.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_53.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_61.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_62.pdf",
  "/past-papers/physics-0625/2023/w/0625_w23_qp_63.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_ms_12.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_ms_22.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_ms_32.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_ms_42.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_ms_52.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_ms_62.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_qp_12.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_qp_22.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_qp_32.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_qp_42.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_qp_52.pdf",
  "/past-papers/physics-0625/2024/m/0625_m24_qp_62.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_11.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_12.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_13.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_21.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_22.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_23.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_31.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_32.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_33.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_41.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_42.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_43.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_51.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_52.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_53.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_61.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_62.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_ms_63.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_11.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_12.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_13.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_21.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_22.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_23.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_31.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_32.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_33.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_41.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_42.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_43.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_51.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_52.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_53.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_61.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_62.pdf",
  "/past-papers/physics-0625/2024/s/0625_s24_qp_63.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_11.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_12.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_13.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_21.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_22.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_23.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_31.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_32.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_33.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_41.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_42.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_43.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_51.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_52.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_53.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_61.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_62.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_ms_63.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_11.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_12.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_13.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_21.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_22.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_23.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_31.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_32.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_33.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_41.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_42.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_43.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_51.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_52.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_53.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_61.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_62.pdf",
  "/past-papers/physics-0625/2024/w/0625_w24_qp_63.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_ms_12.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_ms_22.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_ms_32.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_ms_42.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_ms_52.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_ms_62.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_qp_12.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_qp_22.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_qp_32.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_qp_42.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_qp_52.pdf",
  "/past-papers/physics-0625/2025/m/0625_m25_qp_62.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_11.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_12.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_13.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_21.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_22.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_23.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_31.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_32.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_33.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_41.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_42.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_43.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_51.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_52.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_53.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_61.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_62.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_ms_63.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_11.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_12.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_13.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_21.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_22.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_23.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_31.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_32.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_33.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_41.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_42.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_43.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_51.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_52.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_53.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_61.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_62.pdf",
  "/past-papers/physics-0625/2025/s/0625_s25_qp_63.pdf"
]);

const FLE0500_FILESET = new Set([
  "/past-papers/english-first-language-0500/2020/m/0500_m20_ms_12.pdf",
  "/past-papers/english-first-language-0500/2020/m/0500_m20_ms_22.pdf",
  "/past-papers/english-first-language-0500/2020/m/0500_m20_qp_12.pdf",
  "/past-papers/english-first-language-0500/2020/m/0500_m20_qp_22.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_ms_11.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_ms_12.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_ms_13.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_ms_21.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_ms_22.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_ms_23.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_qp_11.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_qp_12.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_qp_13.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_qp_21.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_qp_22.pdf",
  "/past-papers/english-first-language-0500/2020/s/0500_s20_qp_23.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_ms_11.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_ms_12.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_ms_13.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_ms_21.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_ms_22.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_ms_23.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_qp_11.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_qp_12.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_qp_13.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_qp_21.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_qp_22.pdf",
  "/past-papers/english-first-language-0500/2020/w/0500_w20_qp_23.pdf",
  "/past-papers/english-first-language-0500/2021/m/0500_m21_ms_12.pdf",
  "/past-papers/english-first-language-0500/2021/m/0500_m21_ms_22.pdf",
  "/past-papers/english-first-language-0500/2021/m/0500_m21_qp_12.pdf",
  "/past-papers/english-first-language-0500/2021/m/0500_m21_qp_22.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_ms_11.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_ms_12.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_ms_13.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_ms_21.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_ms_22.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_ms_23.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_qp_11.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_qp_12.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_qp_13.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_qp_21.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_qp_22.pdf",
  "/past-papers/english-first-language-0500/2021/s/0500_s21_qp_23.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_ms_11.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_ms_12.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_ms_13.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_ms_21.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_ms_22.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_ms_23.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_qp_11.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_qp_12.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_qp_13.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_qp_21.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_qp_22.pdf",
  "/past-papers/english-first-language-0500/2021/w/0500_w21_qp_23.pdf",
  "/past-papers/english-first-language-0500/2022/m/0500_m22_ms_12.pdf",
  "/past-papers/english-first-language-0500/2022/m/0500_m22_ms_22.pdf",
  "/past-papers/english-first-language-0500/2022/m/0500_m22_qp_12.pdf",
  "/past-papers/english-first-language-0500/2022/m/0500_m22_qp_22.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_ms_11.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_ms_12.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_ms_13.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_ms_21.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_ms_22.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_ms_23.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_qp_11.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_qp_12.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_qp_13.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_qp_21.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_qp_22.pdf",
  "/past-papers/english-first-language-0500/2022/s/0500_s22_qp_23.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_ms_11.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_ms_12.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_ms_13.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_ms_21.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_ms_22.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_ms_23.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_qp_11.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_qp_12.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_qp_13.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_qp_21.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_qp_22.pdf",
  "/past-papers/english-first-language-0500/2022/w/0500_w22_qp_23.pdf",
  "/past-papers/english-first-language-0500/2023/m/0500_m23_ms_12.pdf",
  "/past-papers/english-first-language-0500/2023/m/0500_m23_ms_22.pdf",
  "/past-papers/english-first-language-0500/2023/m/0500_m23_qp_12.pdf",
  "/past-papers/english-first-language-0500/2023/m/0500_m23_qp_22.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_ms_11.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_ms_12.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_ms_13.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_ms_21.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_ms_22.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_ms_23.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_qp_11.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_qp_12.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_qp_13.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_qp_21.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_qp_22.pdf",
  "/past-papers/english-first-language-0500/2023/s/0500_s23_qp_23.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_ms_11.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_ms_12.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_ms_13.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_ms_21.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_ms_22.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_ms_23.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_qp_11.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_qp_12.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_qp_13.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_qp_21.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_qp_22.pdf",
  "/past-papers/english-first-language-0500/2023/w/0500_w23_qp_23.pdf",
  "/past-papers/english-first-language-0500/2024/m/0500_m24_ms_12.pdf",
  "/past-papers/english-first-language-0500/2024/m/0500_m24_ms_22.pdf",
  "/past-papers/english-first-language-0500/2024/m/0500_m24_qp_12.pdf",
  "/past-papers/english-first-language-0500/2024/m/0500_m24_qp_22.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_ms_11.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_ms_12.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_ms_13.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_ms_21.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_ms_22.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_ms_23.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_qp_11.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_qp_12.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_qp_13.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_qp_21.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_qp_22.pdf",
  "/past-papers/english-first-language-0500/2024/s/0500_s24_qp_23.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_ms_11.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_ms_12.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_ms_13.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_ms_21.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_ms_22.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_ms_23.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_qp_11.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_qp_12.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_qp_13.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_qp_21.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_qp_22.pdf",
  "/past-papers/english-first-language-0500/2024/w/0500_w24_qp_23.pdf",
  "/past-papers/english-first-language-0500/2025/m/0500_m25_ms_12.pdf",
  "/past-papers/english-first-language-0500/2025/m/0500_m25_ms_22.pdf",
  "/past-papers/english-first-language-0500/2025/m/0500_m25_qp_12.pdf",
  "/past-papers/english-first-language-0500/2025/m/0500_m25_qp_22.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_ms_11.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_ms_12.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_ms_13.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_ms_21.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_ms_22.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_ms_23.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_qp_11.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_qp_12.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_qp_13.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_qp_21.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_qp_22.pdf",
  "/past-papers/english-first-language-0500/2025/s/0500_s25_qp_23.pdf"
]);

const ECON0455_FILESET = new Set([
  "/past-papers/economics-0455/2020/m/0455_m20_ms_12.pdf",
  "/past-papers/economics-0455/2020/m/0455_m20_ms_22.pdf",
  "/past-papers/economics-0455/2020/m/0455_m20_qp_12.pdf",
  "/past-papers/economics-0455/2020/m/0455_m20_qp_22.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_ms_11.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_ms_12.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_ms_13.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_ms_21.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_ms_22.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_ms_23.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_qp_11.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_qp_12.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_qp_13.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_qp_21.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_qp_22.pdf",
  "/past-papers/economics-0455/2020/s/0455_s20_qp_23.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_ms_11.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_ms_12.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_ms_13.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_ms_21.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_ms_22.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_ms_23.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_qp_11.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_qp_12.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_qp_13.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_qp_21.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_qp_22.pdf",
  "/past-papers/economics-0455/2020/w/0455_w20_qp_23.pdf",
  "/past-papers/economics-0455/2021/m/0455_m21_ms_12.pdf",
  "/past-papers/economics-0455/2021/m/0455_m21_ms_22.pdf",
  "/past-papers/economics-0455/2021/m/0455_m21_qp_12.pdf",
  "/past-papers/economics-0455/2021/m/0455_m21_qp_22.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_ms_11.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_ms_12.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_ms_13.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_ms_21.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_ms_22.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_ms_23.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_qp_11.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_qp_12.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_qp_13.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_qp_21.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_qp_22.pdf",
  "/past-papers/economics-0455/2021/s/0455_s21_qp_23.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_ms_11.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_ms_12.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_ms_13.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_ms_21.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_ms_22.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_ms_23.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_qp_11.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_qp_12.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_qp_13.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_qp_21.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_qp_22.pdf",
  "/past-papers/economics-0455/2021/w/0455_w21_qp_23.pdf",
  "/past-papers/economics-0455/2022/m/0455_m22_ms_22.pdf",
  "/past-papers/economics-0455/2022/m/0455_m22_qp_22.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_ms_11.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_ms_12.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_ms_13.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_ms_21.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_ms_22.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_ms_23.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_qp_11.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_qp_12.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_qp_13.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_qp_21.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_qp_22.pdf",
  "/past-papers/economics-0455/2022/s/0455_s22_qp_23.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_ms_11.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_ms_12.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_ms_13.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_ms_21.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_ms_22.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_ms_23.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_qp_11.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_qp_12.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_qp_13.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_qp_21.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_qp_22.pdf",
  "/past-papers/economics-0455/2022/w/0455_w22_qp_23.pdf",
  "/past-papers/economics-0455/2023/m/0455_m23_ms_12.pdf",
  "/past-papers/economics-0455/2023/m/0455_m23_ms_22.pdf",
  "/past-papers/economics-0455/2023/m/0455_m23_qp_12.pdf",
  "/past-papers/economics-0455/2023/m/0455_m23_qp_22.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_ms_11.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_ms_12.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_ms_13.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_ms_21.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_ms_22.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_ms_23.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_qp_11.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_qp_12.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_qp_13.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_qp_21.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_qp_22.pdf",
  "/past-papers/economics-0455/2023/s/0455_s23_qp_23.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_ms_11.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_ms_12.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_ms_13.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_ms_21.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_ms_22.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_ms_23.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_qp_11.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_qp_12.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_qp_13.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_qp_21.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_qp_22.pdf",
  "/past-papers/economics-0455/2023/w/0455_w23_qp_23.pdf",
  "/past-papers/economics-0455/2024/m/0455_m24_ms_12.pdf",
  "/past-papers/economics-0455/2024/m/0455_m24_ms_22.pdf",
  "/past-papers/economics-0455/2024/m/0455_m24_qp_12.pdf",
  "/past-papers/economics-0455/2024/m/0455_m24_qp_22.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_ms_11.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_ms_12.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_ms_13.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_ms_21.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_ms_22.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_ms_23.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_qp_11.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_qp_12.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_qp_13.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_qp_21.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_qp_22.pdf",
  "/past-papers/economics-0455/2024/s/0455_s24_qp_23.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_ms_11.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_ms_12.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_ms_13.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_ms_21.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_ms_22.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_ms_23.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_qp_11.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_qp_12.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_qp_13.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_qp_21.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_qp_22.pdf",
  "/past-papers/economics-0455/2024/w/0455_w24_qp_23.pdf",
  "/past-papers/economics-0455/2025/m/0455_m25_ms_12.pdf",
  "/past-papers/economics-0455/2025/m/0455_m25_ms_22.pdf",
  "/past-papers/economics-0455/2025/m/0455_m25_qp_12.pdf",
  "/past-papers/economics-0455/2025/m/0455_m25_qp_22.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_ms_11.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_ms_12.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_ms_13.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_ms_21.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_ms_22.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_ms_23.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_qp_11.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_qp_12.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_qp_13.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_qp_21.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_qp_22.pdf",
  "/past-papers/economics-0455/2025/s/0455_s25_qp_23.pdf"
]);

const ACC0452_FILESET = new Set([
  "/past-papers/accounting-0452/2020/m/0452_m20_ms_12.pdf",
  "/past-papers/accounting-0452/2020/m/0452_m20_ms_22.pdf",
  "/past-papers/accounting-0452/2020/m/0452_m20_qp_12.pdf",
  "/past-papers/accounting-0452/2020/m/0452_m20_qp_22.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_ms_11.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_ms_12.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_ms_13.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_ms_21.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_ms_22.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_ms_23.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_qp_11.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_qp_12.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_qp_13.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_qp_21.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_qp_22.pdf",
  "/past-papers/accounting-0452/2020/s/0452_s20_qp_23.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_ms_11.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_ms_12.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_ms_13.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_ms_21.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_ms_22.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_ms_23.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_qp_11.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_qp_12.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_qp_13.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_qp_21.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_qp_22.pdf",
  "/past-papers/accounting-0452/2020/w/0452_w20_qp_23.pdf",
  "/past-papers/accounting-0452/2021/m/0452_m21_ms_12.pdf",
  "/past-papers/accounting-0452/2021/m/0452_m21_ms_22.pdf",
  "/past-papers/accounting-0452/2021/m/0452_m21_qp_12.pdf",
  "/past-papers/accounting-0452/2021/m/0452_m21_qp_22.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_ms_11.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_ms_12.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_ms_13.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_ms_21.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_ms_22.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_ms_23.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_qp_11.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_qp_12.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_qp_13.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_qp_21.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_qp_22.pdf",
  "/past-papers/accounting-0452/2021/s/0452_s21_qp_23.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_ms_11.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_ms_12.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_ms_13.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_ms_21.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_ms_22.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_ms_23.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_qp_11.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_qp_12.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_qp_13.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_qp_21.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_qp_22.pdf",
  "/past-papers/accounting-0452/2021/w/0452_w21_qp_23.pdf",
  "/past-papers/accounting-0452/2022/m/0452_m22_ms_12.pdf",
  "/past-papers/accounting-0452/2022/m/0452_m22_ms_22.pdf",
  "/past-papers/accounting-0452/2022/m/0452_m22_qp_12.pdf",
  "/past-papers/accounting-0452/2022/m/0452_m22_qp_22.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_ms_11.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_ms_12.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_ms_13.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_ms_21.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_ms_22.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_ms_23.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_qp_11.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_qp_12.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_qp_13.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_qp_21.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_qp_22.pdf",
  "/past-papers/accounting-0452/2022/s/0452_s22_qp_23.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_ms_11.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_ms_12.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_ms_13.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_ms_21.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_ms_22.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_ms_23.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_qp_11.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_qp_12.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_qp_13.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_qp_21.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_qp_22.pdf",
  "/past-papers/accounting-0452/2022/w/0452_w22_qp_23.pdf",
  "/past-papers/accounting-0452/2023/m/0452_m23_ms_12.pdf",
  "/past-papers/accounting-0452/2023/m/0452_m23_ms_22.pdf",
  "/past-papers/accounting-0452/2023/m/0452_m23_qp_12.pdf",
  "/past-papers/accounting-0452/2023/m/0452_m23_qp_22.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_ms_11.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_ms_12.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_ms_13.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_ms_21.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_ms_22.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_ms_23.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_qp_11.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_qp_12.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_qp_13.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_qp_21.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_qp_22.pdf",
  "/past-papers/accounting-0452/2023/s/0452_s23_qp_23.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_ms_11.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_ms_12.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_ms_13.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_ms_21.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_ms_22.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_ms_23.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_qp_11.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_qp_12.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_qp_13.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_qp_21.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_qp_22.pdf",
  "/past-papers/accounting-0452/2023/w/0452_w23_qp_23.pdf",
  "/past-papers/accounting-0452/2024/m/0452_m24_ms_12.pdf",
  "/past-papers/accounting-0452/2024/m/0452_m24_ms_22.pdf",
  "/past-papers/accounting-0452/2024/m/0452_m24_qp_12.pdf",
  "/past-papers/accounting-0452/2024/m/0452_m24_qp_22.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_ms_11.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_ms_12.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_ms_13.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_ms_21.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_ms_22.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_ms_23.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_qp_11.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_qp_12.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_qp_13.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_qp_21.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_qp_22.pdf",
  "/past-papers/accounting-0452/2024/s/0452_s24_qp_23.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_ms_11.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_ms_12.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_ms_13.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_ms_21.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_ms_22.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_ms_23.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_qp_11.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_qp_12.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_qp_13.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_qp_21.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_qp_22.pdf",
  "/past-papers/accounting-0452/2024/w/0452_w24_qp_23.pdf",
  "/past-papers/accounting-0452/2025/m/0452_m25_ms_12.pdf",
  "/past-papers/accounting-0452/2025/m/0452_m25_ms_22.pdf",
  "/past-papers/accounting-0452/2025/m/0452_m25_qp_12.pdf",
  "/past-papers/accounting-0452/2025/m/0452_m25_qp_22.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_ms_11.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_ms_12.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_ms_13.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_ms_21.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_ms_22.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_ms_23.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_qp_11.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_qp_12.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_qp_13.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_qp_21.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_qp_22.pdf",
  "/past-papers/accounting-0452/2025/s/0452_s25_qp_23.pdf"
]);

const CS0478_FILESET = new Set([
  "/past-papers/computer-science-0478/2020/m/0478_m20_ms_12.pdf",
  "/past-papers/computer-science-0478/2020/m/0478_m20_ms_22.pdf",
  "/past-papers/computer-science-0478/2020/m/0478_m20_qp_12.pdf",
  "/past-papers/computer-science-0478/2020/m/0478_m20_qp_22.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_ms_12.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_ms_13.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_ms_21.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_ms_22.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_ms_23.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_qp_12.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_qp_13.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_qp_21.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_qp_22.pdf",
  "/past-papers/computer-science-0478/2020/s/0478_s20_qp_23.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_ms_11.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_ms_12.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_ms_13.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_ms_21.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_ms_22.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_ms_23.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_qp_11.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_qp_12.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_qp_13.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_qp_21.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_qp_22.pdf",
  "/past-papers/computer-science-0478/2020/w/0478_w20_qp_23.pdf",
  "/past-papers/computer-science-0478/2021/m/0478_m21_ms_12.pdf",
  "/past-papers/computer-science-0478/2021/m/0478_m21_ms_22.pdf",
  "/past-papers/computer-science-0478/2021/m/0478_m21_qp_12.pdf",
  "/past-papers/computer-science-0478/2021/m/0478_m21_qp_22.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_ms_11.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_ms_12.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_ms_13.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_ms_21.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_ms_22.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_ms_23.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_qp_11.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_qp_12.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_qp_13.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_qp_21.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_qp_22.pdf",
  "/past-papers/computer-science-0478/2021/s/0478_s21_qp_23.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_ms_11.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_ms_12.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_ms_13.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_ms_21.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_ms_22.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_ms_23.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_qp_11.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_qp_12.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_qp_13.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_qp_21.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_qp_22.pdf",
  "/past-papers/computer-science-0478/2021/w/0478_w21_qp_23.pdf",
  "/past-papers/computer-science-0478/2022/m/0478_m22_ms_12.pdf",
  "/past-papers/computer-science-0478/2022/m/0478_m22_ms_22.pdf",
  "/past-papers/computer-science-0478/2022/m/0478_m22_qp_12.pdf",
  "/past-papers/computer-science-0478/2022/m/0478_m22_qp_22.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_ms_11.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_ms_12.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_ms_13.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_ms_21.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_ms_22.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_ms_23.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_qp_11.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_qp_12.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_qp_13.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_qp_21.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_qp_22.pdf",
  "/past-papers/computer-science-0478/2022/s/0478_s22_qp_23.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_ms_11.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_ms_12.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_ms_13.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_ms_21.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_ms_22.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_ms_23.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_qp_11.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_qp_12.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_qp_13.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_qp_21.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_qp_22.pdf",
  "/past-papers/computer-science-0478/2022/w/0478_w22_qp_23.pdf",
  "/past-papers/computer-science-0478/2023/m/0478_m23_ms_12.pdf",
  "/past-papers/computer-science-0478/2023/m/0478_m23_ms_22.pdf",
  "/past-papers/computer-science-0478/2023/m/0478_m23_qp_12.pdf",
  "/past-papers/computer-science-0478/2023/m/0478_m23_qp_22.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_ms_11.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_ms_12.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_ms_13.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_ms_21.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_ms_22.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_ms_23.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_qp_11.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_qp_12.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_qp_13.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_qp_21.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_qp_22.pdf",
  "/past-papers/computer-science-0478/2023/s/0478_s23_qp_23.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_ms_11.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_ms_12.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_ms_13.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_ms_21.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_ms_22.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_ms_23.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_qp_11.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_qp_12.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_qp_13.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_qp_21.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_qp_22.pdf",
  "/past-papers/computer-science-0478/2023/w/0478_w23_qp_23.pdf",
  "/past-papers/computer-science-0478/2024/m/0478_m24_ms_12.pdf",
  "/past-papers/computer-science-0478/2024/m/0478_m24_ms_22.pdf",
  "/past-papers/computer-science-0478/2024/m/0478_m24_qp_12.pdf",
  "/past-papers/computer-science-0478/2024/m/0478_m24_qp_22.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_ms_11.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_ms_12.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_ms_13.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_ms_21.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_ms_22.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_ms_23.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_qp_11.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_qp_12.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_qp_13.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_qp_21.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_qp_22.pdf",
  "/past-papers/computer-science-0478/2024/s/0478_s24_qp_23.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_ms_11.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_ms_12.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_ms_13.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_ms_21.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_ms_22.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_ms_23.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_qp_11.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_qp_12.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_qp_13.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_qp_21.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_qp_22.pdf",
  "/past-papers/computer-science-0478/2024/w/0478_w24_qp_23.pdf",
  "/past-papers/computer-science-0478/2025/m/0478_m25_ms_12.pdf",
  "/past-papers/computer-science-0478/2025/m/0478_m25_ms_22.pdf",
  "/past-papers/computer-science-0478/2025/m/0478_m25_qp_12.pdf",
  "/past-papers/computer-science-0478/2025/m/0478_m25_qp_22.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_ms_11.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_ms_12.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_ms_13.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_ms_21.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_ms_22.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_ms_23.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_qp_11.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_qp_12.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_qp_13.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_qp_21.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_qp_22.pdf",
  "/past-papers/computer-science-0478/2025/s/0478_s25_qp_23.pdf"
]);

const BUS0450_FILESET = new Set([
  "/past-papers/business-studies-0450/2020/m/0450_m20_ms_12.pdf",
  "/past-papers/business-studies-0450/2020/m/0450_m20_ms_22.pdf",
  "/past-papers/business-studies-0450/2020/m/0450_m20_qp_12.pdf",
  "/past-papers/business-studies-0450/2020/m/0450_m20_qp_22.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_ms_11.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_ms_12.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_ms_13.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_ms_21.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_ms_22.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_ms_23.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_qp_11.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_qp_12.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_qp_13.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_qp_21.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_qp_22.pdf",
  "/past-papers/business-studies-0450/2020/s/0450_s20_qp_23.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_ms_11.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_ms_12.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_ms_13.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_ms_21.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_ms_22.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_ms_23.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_qp_11.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_qp_12.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_qp_13.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_qp_21.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_qp_22.pdf",
  "/past-papers/business-studies-0450/2020/w/0450_w20_qp_23.pdf",
  "/past-papers/business-studies-0450/2021/m/0450_m21_ms_12.pdf",
  "/past-papers/business-studies-0450/2021/m/0450_m21_ms_22.pdf",
  "/past-papers/business-studies-0450/2021/m/0450_m21_qp_12.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_ms_11.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_ms_12.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_ms_13.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_ms_21.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_ms_22.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_ms_23.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_qp_11.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_qp_12.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_qp_13.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_qp_21.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_qp_22.pdf",
  "/past-papers/business-studies-0450/2021/s/0450_s21_qp_23.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_ms_11.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_ms_12.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_ms_13.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_ms_21.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_ms_22.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_ms_23.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_qp_11.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_qp_12.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_qp_13.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_qp_21.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_qp_22.pdf",
  "/past-papers/business-studies-0450/2021/w/0450_w21_qp_23.pdf",
  "/past-papers/business-studies-0450/2022/m/0450_m22_ms_12.pdf",
  "/past-papers/business-studies-0450/2022/m/0450_m22_ms_22.pdf",
  "/past-papers/business-studies-0450/2022/m/0450_m22_qp_12.pdf",
  "/past-papers/business-studies-0450/2022/m/0450_m22_qp_22.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_ms_11.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_ms_12.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_ms_13.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_ms_21.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_ms_22.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_ms_23.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_qp_11.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_qp_12.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_qp_13.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_qp_21.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_qp_22.pdf",
  "/past-papers/business-studies-0450/2022/s/0450_s22_qp_23.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_ms_11.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_ms_12.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_ms_13.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_ms_21.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_ms_22.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_ms_23.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_qp_11.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_qp_12.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_qp_13.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_qp_21.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_qp_22.pdf",
  "/past-papers/business-studies-0450/2022/w/0450_w22_qp_23.pdf",
  "/past-papers/business-studies-0450/2023/m/0450_m23_ms_12.pdf",
  "/past-papers/business-studies-0450/2023/m/0450_m23_ms_22.pdf",
  "/past-papers/business-studies-0450/2023/m/0450_m23_qp_12.pdf",
  "/past-papers/business-studies-0450/2023/m/0450_m23_qp_22.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_ms_11.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_ms_12.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_ms_13.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_ms_21.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_ms_22.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_ms_23.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_qp_11.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_qp_12.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_qp_13.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_qp_21.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_qp_22.pdf",
  "/past-papers/business-studies-0450/2023/s/0450_s23_qp_23.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_ms_11.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_ms_12.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_ms_13.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_ms_21.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_ms_22.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_ms_23.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_qp_11.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_qp_12.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_qp_13.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_qp_21.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_qp_22.pdf",
  "/past-papers/business-studies-0450/2023/w/0450_w23_qp_23.pdf",
  "/past-papers/business-studies-0450/2024/m/0450_m24_ms_12.pdf",
  "/past-papers/business-studies-0450/2024/m/0450_m24_ms_22.pdf",
  "/past-papers/business-studies-0450/2024/m/0450_m24_qp_12.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_ms_11.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_ms_12.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_ms_13.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_ms_21.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_ms_22.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_ms_23.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_qp_11.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_qp_12.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_qp_13.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_qp_21.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_qp_22.pdf",
  "/past-papers/business-studies-0450/2024/s/0450_s24_qp_23.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_ms_11.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_ms_12.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_ms_13.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_ms_21.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_ms_22.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_ms_23.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_qp_11.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_qp_12.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_qp_13.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_qp_21.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_qp_22.pdf",
  "/past-papers/business-studies-0450/2024/w/0450_w24_qp_23.pdf",
  "/past-papers/business-studies-0450/2025/m/0450_m25_ms_12.pdf",
  "/past-papers/business-studies-0450/2025/m/0450_m25_ms_22.pdf",
  "/past-papers/business-studies-0450/2025/m/0450_m25_qp_12.pdf",
  "/past-papers/business-studies-0450/2025/m/0450_m25_qp_22.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_ms_11.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_ms_12.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_ms_13.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_ms_21.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_ms_22.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_ms_23.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_qp_11.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_qp_12.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_qp_13.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_qp_21.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_qp_22.pdf",
  "/past-papers/business-studies-0450/2025/s/0450_s25_qp_23.pdf"
]);




let SESSION_LEVEL_FILES = null;
let PAST_PAPER_FILES = null;
async function loadPastPaperFiles(){
  if(PAST_PAPER_FILES) return PAST_PAPER_FILES;
  try{
    const res = await fetch("/assets/past-paper-files.json", {cache:"force-cache"});
    if(!res.ok) throw new Error("past paper manifest fetch failed");
    PAST_PAPER_FILES = await res.json();
  }catch(e){
    PAST_PAPER_FILES = {};
  }
  return PAST_PAPER_FILES;
}

async function loadSessionLevelFiles(){
  if(SESSION_LEVEL_FILES) return SESSION_LEVEL_FILES;
  try{
    const res = await fetch("/assets/session-level-files.json", {cache:"no-store"});
    if(!res.ok) throw new Error("manifest fetch failed");
    SESSION_LEVEL_FILES = await res.json();
  }catch(e){
    SESSION_LEVEL_FILES = {};
  }
  return SESSION_LEVEL_FILES;
}


let INSERT_FILES = null;
async function loadInsertFiles(){
  if(INSERT_FILES) return INSERT_FILES;
  try{
    const res = await fetch("/assets/insert-files.json", {cache:"no-store"});
    if(!res.ok) throw new Error("insert manifest fetch failed");
    INSERT_FILES = await res.json();
  }catch(e){
    INSERT_FILES = {};
  }
  return INSERT_FILES;
}

function getPastPaperSessionManifest(subjectSlug, year, session){
  if(!PAST_PAPER_FILES) return null;
  const subjectNode = PAST_PAPER_FILES[subjectSlug];
  const yearNode = subjectNode && subjectNode[String(year)];
  return (yearNode && yearNode[session]) || null;
}

function buildPastPaperManifestHref(subjectSlug, year, session, fileName){
  return `/past-papers/${subjectSlug}/${year}/${session}/${fileName}`;
}

function getConfidentialInstructionsMap(subjectSlug, year, sessionCode, paperNumber){
  const sessionManifest = getPastPaperSessionManifest(subjectSlug, year, sessionCode);
  const targetPaperNumber = paperNumber === null || paperNumber === undefined
    ? ""
    : String(paperNumber);
  const map = {};

  if(!sessionManifest || !Array.isArray(sessionManifest.ci)){
    return map;
  }

  sessionManifest.ci.forEach(entry => {
    const fileName = entry && entry.file ? entry.file : "";
    const match = fileName.match(/_ci_(\d+)\.pdf$/i);
    const variant = match ? String(match[1]) : "";

    if(!variant){
      return;
    }

    if(targetPaperNumber && variant.charAt(0) !== targetPaperNumber){
      return;
    }

    map[variant] = fileName;
  });

  return map;
}

function getPastPaperKindManifest(subjectSlug, year, sessionCode, kind, paperNumber){
  const sessionManifest = getPastPaperSessionManifest(subjectSlug, year, sessionCode);
  if(!sessionManifest) return {};
  if(kind === "qp" || kind === "ms"){
    return (sessionManifest[kind] && sessionManifest[kind][String(paperNumber)]) || {};
  }
  if(kind === "in"){
    return sessionManifest.in || {};
  }
  if(kind === "ci"){
    return getConfidentialInstructionsMap(subjectSlug, year, sessionCode, paperNumber);
  }
  return {};
}

function getPastPaperVariantFile(subjectSlug, year, sessionCode, type, variant){
  const paperNumber = String(variant || "").trim().charAt(0);
  const manifest = getPastPaperKindManifest(subjectSlug, year, sessionCode, type, paperNumber);
  return manifest[String(variant)] || "";
}

function getSessionManifestPaperNumbers(sessionManifest){
  const numbers = new Set();
  if(!sessionManifest) return [];
  Object.keys(sessionManifest.qp || {}).forEach(number => numbers.add(String(number)));
  Object.keys(sessionManifest.ms || {}).forEach(number => numbers.add(String(number)));
  Object.keys(sessionManifest.in || {}).forEach(variant => {
    if(variant) numbers.add(String(variant).charAt(0));
  });
  (sessionManifest.ci || []).forEach(entry => {
    const fileName = entry && entry.file ? entry.file : "";
    const match = fileName.match(/_ci_(\d+)\.pdf$/i);
    if(match && match[1]){
      numbers.add(String(match[1]).charAt(0));
    }
  });
  return Array.from(numbers)
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
}

function getPaperSectionId(section, index){
  if(section && section.id) return section.id;
  if(section && section.title){
    return String(section.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `section-${index}`;
  }
  return `section-${index}`;
}

function createSyntheticPaperDefinition(paperNumber){
  return {
    id: `paper-${paperNumber}`,
    label: `Paper ${paperNumber}`,
    qpVariants: [],
    msVariants: []
  };
}

function getPreferredSectionIndexForPaper(cfg, sections, paperNumber){
  const titles = sections.map(section => String(section.title || "").toLowerCase());
  const code = cfg && cfg.code ? String(cfg.code) : "";
  const preferredTitle = (title) => {
    const index = titles.indexOf(title);
    return index >= 0 ? index : -1;
  };

  if(code === "0580"){
    if(paperNumber === "1" || paperNumber === "3"){
      return preferredTitle("core");
    }
    if(paperNumber === "2" || paperNumber === "4"){
      return preferredTitle("extended");
    }
  }

  if(["0610", "0620", "0625", "0653"].includes(code)){
    if(paperNumber === "1" || paperNumber === "3"){
      return preferredTitle("core");
    }
    if(paperNumber === "2" || paperNumber === "4"){
      return preferredTitle("extended");
    }
    if(paperNumber === "5" || paperNumber === "6"){
      return preferredTitle("practical");
    }
  }

  return sections.length ? sections.length - 1 : 0;
}

function getRenderablePaperSections(subjectSlug, cfg, year, sessionCode){
  const baseSections = getPaperSections(subjectSlug, cfg).map((section, index) => ({
    id: getPaperSectionId(section, index),
    title: section.title,
    papers: (section.papers || []).slice()
  }));
  const sessionManifest = getPastPaperSessionManifest(subjectSlug, year, sessionCode);
  const existingPaperNumbers = {};

  if(!sessionManifest){
    return baseSections;
  }

  baseSections.forEach((section, sectionIndex) => {
    section.papers.forEach(paper => {
      const paperNumber = getPaperNumberFromDefinition(paper);
      if(paperNumber !== null && !Object.prototype.hasOwnProperty.call(existingPaperNumbers, String(paperNumber))){
        existingPaperNumbers[String(paperNumber)] = sectionIndex;
      }
    });
  });

  getSessionManifestPaperNumbers(sessionManifest).forEach(paperNumber => {
    if(Object.prototype.hasOwnProperty.call(existingPaperNumbers, paperNumber)){
      return;
    }

    const targetIndex = getPreferredSectionIndexForPaper(cfg, baseSections, paperNumber);
    const safeIndex = targetIndex >= 0 ? targetIndex : Math.max(0, baseSections.length - 1);
    if(!baseSections[safeIndex]){
      baseSections.push({
        id: getPaperSectionId({ title: null }, baseSections.length),
        title: null,
        papers: []
      });
    }
    baseSections[safeIndex].papers.push(createSyntheticPaperDefinition(paperNumber));
  });

  baseSections.forEach(section => {
    section.papers.sort((left, right) => {
      const leftNumber = getPaperNumberFromDefinition(left);
      const rightNumber = getPaperNumberFromDefinition(right);
      return (leftNumber === null ? 99 : leftNumber) - (rightNumber === null ? 99 : rightNumber);
    });
  });

  return baseSections;
}

function buildSessionExtraItems(subjectSlug, cfg, year, sessionCode){
  const sessionManifest = getPastPaperSessionManifest(subjectSlug, year, sessionCode);
  const extras = [];

  function buildLabel(kind, entry){
    const match = entry && entry.file ? entry.file.match(/_(\d+)\.pdf$/i) : null;
    if(kind === "er"){
      return entry && entry.code && entry.code !== cfg.code
        ? `Examiner Report · ${entry.code}`
        : "Examiner Report";
    }
    if(kind === "gt"){
      return entry && entry.code && entry.code !== cfg.code
        ? `Grade Thresholds · ${entry.code}`
        : "Grade Thresholds";
    }
    return kind.toUpperCase();
  }

  if(!sessionManifest){
    return extras;
  }

  ["gt", "er"].forEach(kind => {
    (sessionManifest[kind] || []).forEach(entry => {
      extras.push({
        type: kind,
        label: buildLabel(kind, entry),
        href: buildPastPaperManifestHref(subjectSlug, year, sessionCode, entry.file)
      });
    });
  });

  return extras;
}

function getInsertMap(subjectSlug, year, session){
  const sessionManifest = getPastPaperSessionManifest(subjectSlug, year, session);
  return sessionManifest ? (sessionManifest.in || null) : null;
}


function getSessionExtras(subjectSlug, year, session){
  return getPastPaperSessionManifest(subjectSlug, year, session);
}

function getSessionsForSubject(subjectSlug, year){
  const subjectNode = PAST_PAPER_FILES && PAST_PAPER_FILES[subjectSlug];
  const yearNode = subjectNode && subjectNode[String(year)];
  const order = { m: 0, s: 1, w: 2 };

  if(!yearNode){
    return [];
  }

  return Object.keys(yearNode)
    .filter(sessionCode => {
      const sessionManifest = yearNode[sessionCode];
      return !!sessionManifest && (
        Object.keys(sessionManifest.qp || {}).length
        || Object.keys(sessionManifest.ms || {}).length
        || Object.keys(sessionManifest.in || {}).length
        || (sessionManifest.ci || []).length
        || (sessionManifest.er || []).length
        || (sessionManifest.gt || []).length
      );
    })
    .sort((left, right) => (order[left] ?? 9) - (order[right] ?? 9));
}



function buildFilePath(subjectSlug, code, year, session, type, variant) {
  const shortYear = String(year).slice(-2);
  return `/past-papers/${subjectSlug}/${year}/${session}/${code}_${session}${shortYear}_${type}_${variant}.pdf`;
}

function hasAvailablePastPaperFile(subjectSlug, cfg, year, sessionCode, type, variant) {
  return !!getPastPaperVariantFile(subjectSlug, year, sessionCode, type, variant);
}

function getAvailableTrackerVariants(subjectSlug, cfg, year, sessionCode, paper) {
  const paperNumber = getPaperNumberFromDefinition(paper);
  const qpVariants = Object.keys(getPastPaperKindManifest(subjectSlug, year, sessionCode, "qp", paperNumber));
  const msVariants = Object.keys(getPastPaperKindManifest(subjectSlug, year, sessionCode, "ms", paperNumber));
  const ciVariants = Object.keys(getPastPaperKindManifest(subjectSlug, year, sessionCode, "ci", paperNumber));

  return Array.from(new Set([...(qpVariants || []), ...(msVariants || []), ...(ciVariants || [])]))
    .sort((a, b) => Number(a) - Number(b));
}


function getPaperSections(subjectSlug, cfg){
  const code = cfg.code;

  // Option A grouping (Core/Extended) for subjects with tiers
  if(code === "0580"){
    const core = cfg.papers.filter(p => p.id === "p1c" || p.id === "p3c");
    const ext  = cfg.papers.filter(p => p.id === "p2e" || p.id === "p4e");
    return [
      { title: "Core", papers: core },
      { title: "Extended", papers: ext },
    ].filter(s => s.papers.length);
  }

  // Sciences: Core/Extended plus Practical route (Paper 5 vs 6)
  if(["0610","0620","0625","0653"].includes(code)){
    const core = cfg.papers.filter(p => p.id === "p1c" || p.id === "p3c");
    const ext  = cfg.papers.filter(p => p.id === "p2e" || p.id === "p4e");
    const prac = cfg.papers.filter(p => p.id === "p5" || p.id === "p6");
    return [
      { title: "Core", papers: core },
      { title: "Extended", papers: ext },
      { title: "Practical", papers: prac },
    ].filter(s => s.papers.length);
  }

  // Default: no grouping
  return [{ title: null, papers: cfg.papers }];
}

function buildSeriesCard(subjectSlug, cfg, year, session) {
  const label = session === "m" ? "Feb/March" : (session === "s" ? "May/June" : "October/November");
  const sessionCode = session;
  const sessionYearShort = String(year).slice(-2);
  const idBase = `${subjectSlug}-${year}-${sessionCode}`;

  // Build paper rows first so we can skip empty sessions cleanly (no empty cards / headers)
  const sections = getRenderablePaperSections(subjectSlug, cfg, year, sessionCode);
  let paperIdx = 0;
  let anyRows = false;
  let bodyHtml = "";

  sections.forEach(section => {
    let sectionRowsHtml = "";

		    section.papers.forEach(paper => {
		      const thisPaperIdx = paperIdx;
		      const paperKeyBase = `${subjectSlug}|${cfg.code}|${year}|${sessionCode}|p${thisPaperIdx}`;
		      paperIdx += 1;
		      const paperNumber = getPaperNumberFromDefinition(paper);
		      const qpVariantMap = getPastPaperKindManifest(subjectSlug, year, sessionCode, "qp", paperNumber);
		      const msVariantMap = getPastPaperKindManifest(subjectSlug, year, sessionCode, "ms", paperNumber);
		      const ciVariantMap = getPastPaperKindManifest(subjectSlug, year, sessionCode, "ci", paperNumber);
		      const qpVariants = Object.keys(qpVariantMap);
		      const msVariants = Object.keys(msVariantMap);
		      const ciVariants = Object.keys(ciVariantMap);
		      const variantRows = getAvailableTrackerVariants(subjectSlug, cfg, year, sessionCode, paper);

      // If nothing exists for this paper in this series, remove the whole row
      if (qpVariants.length === 0 && msVariants.length === 0 && ciVariants.length === 0) return;

      anyRows = true;

      let rowHtml = `
      <div class="pp-paper-row reveal" data-paper-key="${paperKeyBase}">
        <div class="pp-paper-info">
          <h4>
            ${paper.label}
          </h4>
        </div>
        <div class="pp-paper-actions">
      `;

      
      // Insert dropdown (per-paper) — renders instantly using assets/insert-files.json (no delayed fetch probing).
      // Only shown if an insert file exists for any variant in this paper row.
      const insertMap = getInsertMap(subjectSlug, year, sessionCode);
      if (insertMap) {
        const insertPanelId = `${idBase}-p${thisPaperIdx}-in`;
        const insertVariants = Array.from(new Set([...(qpVariants||[]), ...(msVariants||[])]));
        const foundInserts = [];
        insertVariants.forEach(v => {
          const fileName = insertMap[v];
          if (fileName) {
            foundInserts.push({ v, href: `/past-papers/${subjectSlug}/${year}/${sessionCode}/${fileName}` });
          }
        });

	        if (foundInserts.length) {
	          const single = foundInserts.length === 1;
	          rowHtml += `
	            <div class="pp-dropdown">
	              <button class="pp-toggle" data-target="${insertPanelId}">
	                Insert
	              </button>
	              <div class="pp-dropdown-panel" id="${insertPanelId}" data-open="false" data-single="${single}">
	                ${foundInserts.map(item => `<a href="${item.href}" class="pp-link" download data-paper-file="true" data-file-href="${item.href}" data-file-kind="insert" data-file-label="${escapePastPaperHtml(`Insert · Variant ${item.v}`)}">Variant ${item.v}</a>`).join("")}
	              </div>
	            </div>
	          `;
	        }
	      }

	      rowHtml += `
	        </div>
	      `;

		// Variant rows (inline per-paper QP/MS actions)
		      if (variantRows.length) {
		        rowHtml += `
		          <div class="pp-variant-list">
		        `;
		        variantRows.forEach(variant => {
		          const hasQP = qpVariants.includes(variant);
		          const hasMS = msVariants.includes(variant);
		          const hasCI = ciVariants.includes(variant);
		          const qpFileName = qpVariantMap[String(variant)] || "";
		          const msFileName = msVariantMap[String(variant)] || "";
		          const ciFileName = ciVariantMap[String(variant)] || "";
		          const qpHref = hasQP ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, qpFileName) : "";
	          const msHref = hasMS ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, msFileName) : "";
		          const ciHref = hasCI ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, ciFileName) : "";
		          const trackKey = hasQP
		            ? `${paperKeyBase}|qp|v${variant}`
		            : `${paperKeyBase}|ms|v${variant}`;
				          rowHtml += `
					            <div class="pp-variant-item" data-track-key="${trackKey}" data-status="none">
					              <div class="pp-variant-item__row">
					                <div class="pp-variant-meta">
					                  <span class="pp-variant-label">Variant ${variant}</span>
					                </div>
					                <div class="pp-variant-actions">
					                  ${buildVariantStatusControl(trackKey)}
					                  ${hasQP ? `<a href="${qpHref}" class="pp-toggle pp-variant-action" download data-paper-file="true" data-file-href="${qpHref}" data-file-kind="qp" data-track-key="${trackKey}" data-file-label="${escapePastPaperHtml(`${paper.label} · Variant ${variant} · QP`)}">QP</a>` : ""}
					                  ${hasMS ? `<a href="${msHref}" class="pp-toggle pp-variant-action" download data-paper-file="true" data-file-href="${msHref}" data-file-kind="ms" data-track-key="${trackKey}" data-file-label="${escapePastPaperHtml(`${paper.label} · Variant ${variant} · MS`)}">MS</a>` : ""}
					                  ${hasCI ? `<a href="${ciHref}" class="pp-toggle pp-variant-action" download data-paper-file="true" data-file-href="${ciHref}" data-file-kind="ci" data-track-key="${trackKey}" data-file-label="${escapePastPaperHtml(`${paper.label} · Variant ${variant} · CI`)}">CI</a>` : ""}
					                </div>
					              </div>
				            </div>
		          `;
			        });
		        rowHtml += `
		          </div>
		        `;
		      }


	      rowHtml += `
	      </div>
	      `;

      sectionRowsHtml += rowHtml;
    });

    if (sectionRowsHtml) {
      if (section.title) {
        bodyHtml += `<div class="pp-paper-section"><h4 class="pp-paper-section-title reveal">${section.title}</h4></div>`;
      }
      bodyHtml += sectionRowsHtml;
    }
  });

  // If this series has zero rows, remove the entire session card
  if (!anyRows) return "";

  // Session-level extras (GT / ER / CI) live once per session folder, not per paper row.
  const extras = buildSessionExtraItems(subjectSlug, cfg, year, sessionCode);
  let extrasHtml = "";
  if (extras.length) {
    extrasHtml = `<div class="pp-session-pills">${extras.map(extra => `<button class="pp-toggle pp-session-file" type="button" data-paper-file="true" data-file-kind="${extra.type}" data-href="${extra.href}" data-file-label="${escapePastPaperHtml(extra.label)}">${extra.label}</button>`).join("")}</div>`;
  }

  return `
    <article class="pp-series-card reveal">
      <header class="pp-series-header">
        <div class="pp-series-header-main">
          <div class="pp-series-title">
            <h3>${label} ${year}</h3>
            <p class="muted">Series code: ${sessionCode}${sessionYearShort}</p>
            ${extrasHtml}
          
          </div>
        </div>
      </header>
      ${bodyHtml}
    </article>
  `;
}


function buildVariantStatusControl(trackKey) {
  return `
    <div class="pp-status-shell pp-status-shell--inline">
      <button class="pp-status pp-status--inline" type="button" data-status="none" data-track-key="${trackKey}" data-static-label="Track" aria-haspopup="menu" aria-expanded="false" aria-label="Tracking status: Not started. Activate to change.">
        <span class="pp-status__dot" aria-hidden="true"></span>
        <span class="pp-status__label">Track</span>
      </button>
      <div class="pp-status__menu" role="menu" data-open="false" aria-hidden="true">
        <button class="pp-status__option" type="button" role="menuitemradio" data-status-value="in_progress" aria-checked="false" tabindex="-1">In Progress</button>
        <button class="pp-status__option" type="button" role="menuitemradio" data-status-value="done" aria-checked="false" tabindex="-1">Done</button>
        <button class="pp-status__option" type="button" role="menuitemradio" data-status-value="reviewed" aria-checked="false" tabindex="-1">Reviewed</button>
        <button class="pp-status__option is-clear" type="button" role="menuitemradio" data-status-value="none" aria-checked="true" tabindex="-1">Clear</button>
      </div>
    </div>
  `;
}

const PAST_PAPER_SESSION_META = {
  m: {
    label: "Feb/March",
    searchLabel: "feb march",
    rank: 1
  },
  s: {
    label: "May/June",
    searchLabel: "may june",
    rank: 3
  },
  w: {
    label: "October/November",
    searchLabel: "oct nov",
    rank: 2
  }
};

const PAST_PAPER_SEARCH_SUBJECT_ALIASES = {
  "accounting-0452": ["accounting", "0452"],
  "business-studies-0450": ["business", "business studies", "0450"],
  "biology-0610": ["biology", "0610"],
  "chemistry-0620": ["chemistry", "chem", "0620"],
  "physics-0625": ["physics", "0625"],
  "computer-science-0478": ["computer science", "cs", "0478"],
  "mathematics-0580": ["mathematics", "maths", "math", "0580"],
  "english-first-language-0500": ["first language english", "english", "fle", "0500"]
};

function getRenderablePastPaperYears(subjectSlug, cfg) {
  const subjectNode = PAST_PAPER_FILES && PAST_PAPER_FILES[subjectSlug];

  if(!subjectNode){
    return [];
  }

  return Object.keys(subjectNode)
    .map(year => Number(year))
    .filter(year => getSessionsForSubject(subjectSlug, year).some(sessionCode => {
      const sessionManifest = getPastPaperSessionManifest(subjectSlug, year, sessionCode);
      return sessionManifest && (
        Object.keys(sessionManifest.qp || {}).length
        || Object.keys(sessionManifest.ms || {}).length
      );
    }))
    .sort((a, b) => b - a);
}

function getPaperNumberFromDefinition(paper) {
  const source = `${paper && paper.id ? paper.id : ""} ${paper && paper.label ? paper.label : ""}`;
  const match = source.match(/p\s*([1-9])/i);
  return match ? Number(match[1]) : null;
}

function normalizePastPaperSearchText(value) {
  let text = String(value || "").toLowerCase();

  text = text.replace(/may\s*\/\s*june|may\s+june|\bmj\b/g, " may june ");
  text = text.replace(/oct(?:ober)?\s*\/\s*nov(?:ember)?|oct(?:ober)?\s+nov(?:ember)?|\bon\b/g, " oct nov ");
  text = text.replace(/feb(?:ruary)?\s*\/\s*march|feb(?:ruary)?\s+march|\bfm\b/g, " feb march ");
  text = text.replace(/\bpaper\s*([1-9])\b/g, " paper $1 ");
  text = text.replace(/\bp\s*([1-9])\b/g, " p $1 ");
  text = text.replace(/\bvariant\s*([0-9]{1,2})\b/g, " variant $1 ");
  text = text.replace(/\bv\s*([0-9]{1,2})\b/g, " v $1 ");
  text = text.replace(/[^a-z0-9]+/g, " ");

  return text.replace(/\s+/g, " ").trim();
}

function matchesPastPaperAlias(normalizedQuery, queryTokens, alias) {
  if (!alias) return false;
  if (normalizedQuery.includes(alias)) return true;

  const aliasTokens = alias.split(" ").filter(Boolean);
  if (!aliasTokens.length) return false;

  return aliasTokens.every(aliasToken => queryTokens.some(token => {
    if (token.length < 2) return false;
    return token === aliasToken || token.startsWith(aliasToken) || aliasToken.startsWith(token);
  }));
}

function buildPastPaperSubjectSearchMeta() {
  const weakTokens = new Set(["first", "language", "studies", "science"]);

  return Object.keys(PAPERS_CONFIG).map(subjectSlug => {
    const cfg = PAPERS_CONFIG[subjectSlug];
    const aliases = new Set([cfg.name, cfg.code]);
    const slugName = subjectSlug.replace(/-\d+$/, "").replace(/-/g, " ");
    const nameTokens = String(cfg.name || "").toLowerCase().split(/\s+/).filter(Boolean);

    aliases.add(slugName);

    if (nameTokens[0] && !weakTokens.has(nameTokens[0])) {
      aliases.add(nameTokens[0]);
    }

    if (nameTokens.length > 1) {
      const lastToken = nameTokens[nameTokens.length - 1];
      if (lastToken && lastToken.length > 4 && !weakTokens.has(lastToken)) {
        aliases.add(lastToken);
      }
    }

    (PAST_PAPER_SEARCH_SUBJECT_ALIASES[subjectSlug] || []).forEach(alias => aliases.add(alias));

    return {
      subjectSlug,
      subjectName: cfg.name,
      subjectCode: cfg.code,
      aliases: Array.from(aliases)
        .map(normalizePastPaperSearchText)
        .filter(Boolean)
    };
  });
}

function parsePastPaperSearchQuery(rawValue, subjectMeta) {
  const normalized = normalizePastPaperSearchText(rawValue);
  const tokens = normalized ? normalized.split(" ") : [];
  const matchedSubjectSlugs = new Set();
  let matchedSubjectCode = null;

  subjectMeta.forEach(meta => {
    if (tokens.includes(meta.subjectCode)) {
      matchedSubjectCode = meta.subjectCode;
      matchedSubjectSlugs.add(meta.subjectSlug);
    }

    meta.aliases.forEach(alias => {
      if (alias === meta.subjectCode) return;
      if (matchesPastPaperAlias(normalized, tokens, alias)) {
        matchedSubjectSlugs.add(meta.subjectSlug);
      }
    });
  });

  let session = null;
  if (normalized.includes("may june")) {
    session = "s";
  } else if (normalized.includes("oct nov")) {
    session = "w";
  } else if (normalized.includes("feb march")) {
    session = "m";
  }

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const paperMatch = normalized.match(/\b(?:paper|p)\s+([1-9])\b/);
  const variantMatch = normalized.match(/\b(?:variant|v)\s+([0-9]{1,2})\b/);

  return {
    raw: rawValue,
    normalized,
    tokens,
    subjectCode: matchedSubjectCode,
    subjectSlugs: matchedSubjectSlugs,
    year: yearMatch ? Number(yearMatch[1]) : null,
    session,
    paper: paperMatch ? Number(paperMatch[1]) : null,
    variant: variantMatch ? variantMatch[1].padStart(2, "0") : null
  };
}

function buildPastPaperSearchIndex(subjectMeta) {
  const subjectLookup = new Map(subjectMeta.map(meta => [meta.subjectSlug, meta]));
  const index = [];

  Object.keys(PAPERS_CONFIG).forEach(subjectSlug => {
    const cfg = PAPERS_CONFIG[subjectSlug];
    const meta = subjectLookup.get(subjectSlug);
    const years = getRenderablePastPaperYears(subjectSlug, cfg);

    years.forEach(year => {
      const sessions = getSessionsForSubject(subjectSlug, year);

      sessions.forEach(sessionCode => {
        const sections = getRenderablePaperSections(subjectSlug, cfg, year, sessionCode);
        let paperIdx = 0;
        const sessionMeta = PAST_PAPER_SESSION_META[sessionCode];

        sections.forEach(section => {
          section.papers.forEach(paper => {
            const thisPaperIdx = paperIdx;
            const paperKeyBase = `${subjectSlug}|${cfg.code}|${year}|${sessionCode}|p${thisPaperIdx}`;
            const paperNumber = getPaperNumberFromDefinition(paper);
            const qpVariants = Object.keys(getPastPaperKindManifest(subjectSlug, year, sessionCode, "qp", paperNumber));
            const msVariants = Object.keys(getPastPaperKindManifest(subjectSlug, year, sessionCode, "ms", paperNumber));
            const variants = getAvailableTrackerVariants(subjectSlug, cfg, year, sessionCode, paper);

            paperIdx += 1;

            if (!variants.length) return;

            variants.forEach(variant => {
              const trackKey = qpVariants.includes(variant)
                ? `${paperKeyBase}|qp|v${variant}`
                : `${paperKeyBase}|ms|v${variant}`;
              const searchText = normalizePastPaperSearchText([
                meta.subjectName,
                meta.subjectCode,
                year,
                sessionMeta ? sessionMeta.label : "",
                `paper ${paperNumber || ""}`,
                `variant ${variant}`,
                paper.label
              ].join(" "));

              index.push({
                subjectSlug,
                subjectName: meta.subjectName,
                subjectCode: meta.subjectCode,
                year,
                session: sessionCode,
                sessionLabel: sessionMeta ? sessionMeta.label : "",
                sessionRank: sessionMeta ? sessionMeta.rank : 0,
                paperNumber,
                paperLabel: paper.label,
                variant,
                paperKeyBase,
                trackKey,
                searchText,
                element: null
              });
            });
          });
        });
      });
    });
  });

  return index;
}

function findPastPaperSearchMatches(searchIndex, parsedQuery, limit) {
  if (!parsedQuery.normalized) return [];

  return searchIndex
    .map(entry => {
      let score = 0;

      if (parsedQuery.subjectCode && entry.subjectCode !== parsedQuery.subjectCode) {
        return null;
      }

      if (parsedQuery.subjectSlugs.size && !parsedQuery.subjectSlugs.has(entry.subjectSlug)) {
        return null;
      }

      if (parsedQuery.subjectCode === entry.subjectCode) {
        score += 5;
      }

      if (parsedQuery.subjectSlugs.has(entry.subjectSlug)) {
        score += 4;
      }

      if (parsedQuery.year && entry.year === parsedQuery.year) {
        score += 4;
      }

      if (parsedQuery.paper && entry.paperNumber === parsedQuery.paper) {
        score += 3;
      }

      if (parsedQuery.session && entry.session === parsedQuery.session) {
        score += 3;
      }

      if (parsedQuery.variant && entry.variant === parsedQuery.variant) {
        score += 2;
      }

      if (!score && entry.searchText.includes(parsedQuery.normalized)) {
        score = 1;
      }

      if (!score) return null;

      return {
        entry,
        score
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.entry.year !== a.entry.year) return b.entry.year - a.entry.year;
      if (b.entry.sessionRank !== a.entry.sessionRank) return b.entry.sessionRank - a.entry.sessionRank;
      if (a.entry.paperNumber !== b.entry.paperNumber) return (a.entry.paperNumber || 99) - (b.entry.paperNumber || 99);
      return Number(a.entry.variant) - Number(b.entry.variant);
    })
    .slice(0, limit)
    .map(match => match.entry);
}


function renderPastPapersForSubject(container, subjectSlug) {
  container.__ppActiveSubject = subjectSlug;
  container.__ppActivateYear = null;

  const cfg = PAPERS_CONFIG[subjectSlug];
  if (!cfg) {
    container.innerHTML = `<p class="muted">Past papers for this subject are coming soon.</p>`;
    return;
  }

  const yearsForUI = getRenderablePastPaperYears(subjectSlug, cfg);
  let html = "";

  html += `
    <p class="muted reveal">
      Browse Cambridge IGCSE ${cfg.name} (${cfg.code}) past papers by year and series.
    </p>
  `;

  html += `<div class="pp-year-pills">`;
  yearsForUI.forEach((y, idx) => {
    html += `
      <button class="pp-year-pill reveal ${idx === 0 ? "active" : ""}" data-year="${y}">
        ${y}
      </button>
    `;
  });
  html += `</div>`;

  html += `<div class="pp-year-panels">`;

  const yearsToRender = yearsForUI;

  yearsToRender.forEach((y, idx) => {
    const sessions = getSessionsForSubject(subjectSlug, y);
    const cards = sessions.map(s => buildSeriesCard(subjectSlug, cfg, y, s));
    const yearBody = cards.join("");
    if (!yearBody) return; // safety: skip fully empty years

    html += `
      <div class="pp-year-panel ${idx === 0 ? "active" : ""}" data-year-panel="${y}">
        ${yearBody}
      </div>
    `;
  });

  html += `</div>`;

  container.innerHTML = html;

  // Past Papers page scrollytelling: re-bind ScrollTrigger after dynamic render
  if (typeof window !== "undefined" && typeof window.ppScrollRefresh === "function") {
    window.ppScrollRefresh();
  }

  const pills = container.querySelectorAll(".pp-year-pill");
  const panels = container.querySelectorAll(".pp-year-panel");
  const activateYear = (year, shouldRefresh = true) => {
    const targetYear = String(year);
    let matched = false;

    pills.forEach(pill => {
      const isActive = pill.dataset.year === targetYear;
      pill.classList.toggle("active", isActive);
      if (isActive) matched = true;
    });

    panels.forEach(panel => {
      panel.classList.toggle("active", panel.dataset.yearPanel === targetYear);
    });

    if (!matched && pills[0]) {
      const fallbackYear = pills[0].dataset.year;
      pills[0].classList.add("active");
      panels.forEach(panel => {
        panel.classList.toggle("active", panel.dataset.yearPanel === fallbackYear);
      });
    }

    if (shouldRefresh && typeof window !== "undefined" && typeof window.ppScrollRefresh === "function") {
      requestAnimationFrame(() => window.ppScrollRefresh());
    }
  };

  container.__ppActivateYear = year => activateYear(year, true);

  pills.forEach(pill => {
    pill.addEventListener("click", () => activateYear(pill.dataset.year, true));
  });

  
  // Smooth accordion helpers (works across all devices)
  const closePanel = (p) => {
    if (!p) return;
    p.setAttribute("data-open", "false");
    // If it was set to 'none' while open, lock it to a pixel value before collapsing
    p.style.maxHeight = `${p.scrollHeight}px`;
    // next frame so the browser registers the height before transitioning to 0
    requestAnimationFrame(() => {
      p.style.maxHeight = "0px";
    });
  };

  const openPanel = (p) => {
    if (!p) return;
    p.setAttribute("data-open", "true");
    // Start from 0 then expand to exact content height
    p.style.maxHeight = "0px";
    requestAnimationFrame(() => {
      // Add a small buffer to avoid 1px clipping on some Chrome subpixel/font renders
      // (shows up as the last variant getting cut by the bubble edge on certain resolutions)
      p.style.maxHeight = `${p.scrollHeight + 12}px`;
    });
  };

  // Keep max-height in px to avoid a 1-frame snap/glitch when switching to 'none'
  // (Safari is particularly sensitive here). We'll re-measure after opening.
  container.querySelectorAll(".pp-dropdown-panel").forEach(p => {
    p.style.maxHeight = "0px";
  });

  // --- Layout stability: keep QP/MS pills from shifting horizontally on expand ---
  // The paper row uses `justify-content: space-between`, so if a dropdown wrapper grows wider
  // when its in-flow panel opens (because of link contents), the actions block's left edge moves.
  // We lock each `.pp-dropdown` wrapper to the pixel width of its `.pp-toggle` button.
  const lockDropdownWidths = () => {
    container.querySelectorAll(".pp-dropdown").forEach(dd => {
      const btn = dd.querySelector(":scope > .pp-toggle");
      const panel = dd.querySelector(":scope > .pp-dropdown-panel");
      if (!btn || !panel) return;

      // Reset any previous lock so we can measure the natural button width.
      dd.style.width = "";
      // Force a layout read.
      const w = Math.ceil(btn.getBoundingClientRect().width);
      if (w > 0) dd.style.width = `${w}px`;
      // Panel should follow the wrapper width.
      panel.style.width = "100%";
    });
  };

  lockDropdownWidths();
  // Re-lock on resize / font load changes.
  window.addEventListener("resize", lockDropdownWidths, { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(lockDropdownWidths).catch(()=>{});
  }


  const bindToggleButtons = () => {
    container.querySelectorAll(".pp-toggle[data-target]").forEach(btn => {
      if (btn.__ppBound) return;
      btn.__ppBound = true;

      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const panel = container.querySelector(`#${targetId}`);
        if (!panel) return;

        const row = btn.closest(".pp-paper-row");
        const isOpen = panel.getAttribute("data-open") === "true";

        closeAllStatusMenus(container);

        // Close all panels first (prevents overlap + keeps layout tidy)
        container.querySelectorAll(".pp-dropdown-panel[data-open='true']").forEach(p => closePanel(p));
        container.querySelectorAll(".pp-paper-row").forEach(r => r.classList.remove("is-open"));

        // Toggle current
        if (!isOpen) {
          openPanel(panel);
          if (row) row.classList.add("is-open");

          // Re-measure once the panel is open (handles font wrapping / device widths)
          // without ever switching max-height to 'none' (prevents flicker).
          const remeasure = () => {
            if (panel.getAttribute("data-open") === "true") {
              panel.style.maxHeight = `${panel.scrollHeight + 12}px`;
            }
          };

          // A few staged remeasures fixes late font loading and Chrome's occasional 1-frame
          // height mismatch on large screens.
          requestAnimationFrame(remeasure);
          setTimeout(remeasure, 180);
          setTimeout(remeasure, 420);

          // If supported, remeasure after webfonts finish loading.
          if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(remeasure).catch(()=>{});
          }

          // Keep height correct if anything inside changes while open (rare, but safe).
          if (window.ResizeObserver && !panel.__ppResizeObserver) {
            panel.__ppResizeObserver = new ResizeObserver(remeasure);
            panel.__ppResizeObserver.observe(panel);
          }
        }

        // Past Papers scrollytelling: accordion open/close changes height.
        // Refresh ScrollTrigger/Lenis safely (no layout changes).
        if (typeof window !== "undefined" && typeof window.ppScrollRefresh === "function") {
          requestAnimationFrame(() => window.ppScrollRefresh());
        }
      });
    });
  };

  bindToggleButtons();

  if(!container.__ppFileActionHandler){
    container.__ppFileActionHandler = (event) => {
      const trigger = event.target.closest("[data-paper-file]");
      if(!trigger || !container.contains(trigger)){
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handlePastPaperFileAction(trigger);
    };
    container.addEventListener("click", container.__ppFileActionHandler);
  }
}



// Close any open variant menus when clicking outside
document.addEventListener("click", (e) => {
  if(!e.target.closest(".pp-status-shell")){
    closeAllStatusMenus(document);
  }

  const openPanels = document.querySelectorAll(".pp-dropdown-panel[data-open='true']");
  if(!openPanels.length) return;

  const clickedInside = e.target.closest(".pp-dropdown");
  if(clickedInside) return;

  // Soft close animation for any open panels
  openPanels.forEach(p => {
    p.setAttribute("data-open","false");
    // If the panel was left with max-height: none, lock it first so it can animate closed
    const currentHeight = p.scrollHeight;
    p.style.maxHeight = `${currentHeight}px`;
    requestAnimationFrame(() => {
      p.style.maxHeight = "0px";
    });
  });
  document.querySelectorAll(".pp-paper-row.is-open").forEach(r => r.classList.remove("is-open"));
});

async function renderGlobalPastPapers(container){
  const slugs = Object.keys(PAPERS_CONFIG);
  if(!slugs.length){
    container.innerHTML = '<p class="muted">Past papers are coming soon.</p>';
    return;
  }

  const initial = slugs[0];
  const subjectMeta = buildPastPaperSubjectSearchMeta();
  const searchIndex = buildPastPaperSearchIndex(subjectMeta);
  const searchIndexByTrackKey = new Map(searchIndex.map(entry => [entry.trackKey, entry]));
  let activeSubject = null;
  let activeResults = [];
  let activeResultIndex = -1;
  let searchTimer = null;
  let highlightDelayTimer = null;
  let activeHighlightedHit = null;
  let suppressNextInput = false;
  let suppressNextInputRaf = null;
  let subjectRenderToken = 0;

  container.innerHTML = `
    <div class="pp-global-layout">
      <aside class="pp-global-sidebar">
        <h2 class="pp-global-heading">Subjects</h2>
        <div class="pp-subject-list">
          ${slugs.map((slug, i)=>{
            const cfg = PAPERS_CONFIG[slug];
            return `<button class="pp-subject-pill ${i===0?'active':''}" type="button" data-subject="${slug}" aria-label="${cfg.name} past papers">
              <span class="pp-subject-pill__meta">
                <span class="pp-subject-pill__name">${cfg.name}</span>
                <span class="pp-subject-pill__code">${cfg.code}</span>
              </span>
              <span class="pp-subject-pill__chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
            </button>`;
          }).join('')}
        </div>
      </aside>
      <section class="pp-global-main">
        <div id="pp-global-detail"></div>
      </section>
    </div>
  `;

  const detail = container.querySelector('#pp-global-detail');
  const pills = container.querySelectorAll('.pp-subject-pill');
  let searchUi = null;
  let searchUiCleanup = null;
  let searchValue = "";

  const closeSearchResults = () => {
    if(!searchUi || !searchUi.results) return;
    activeResultIndex = -1;
    searchUi.results.hidden = true;
    searchUi.results.innerHTML = "";
  };

  const beginInputSuppression = () => {
    suppressNextInput = true;
    if (suppressNextInputRaf) {
      cancelAnimationFrame(suppressNextInputRaf);
      suppressNextInputRaf = null;
    }
    suppressNextInputRaf = requestAnimationFrame(() => {
      suppressNextInput = false;
      suppressNextInputRaf = null;
    });
  };

  const getDetailSearchNodes = () => {
    const zipHost = detail.querySelector(".past-papers-zip-host");
    if(zipHost && zipHost.shadowRoot){
      return zipHost.shadowRoot.querySelectorAll(".pp-variant-item[data-track-key]");
    }
    return detail.querySelectorAll(".pp-variant-item[data-track-key]");
  };

  const syncSearchTargetRefs = () => {
    searchIndex.forEach(entry => {
      entry.element = null;
    });

    if (!activeSubject) return;

    getDetailSearchNodes().forEach(node => {
      const match = searchIndexByTrackKey.get(node.dataset.trackKey);
      if (match) {
        match.element = node;
      }
    });
  };

  const highlightHit = (element) => {
    if (!element) return;

    if (activeHighlightedHit && activeHighlightedHit !== element) {
      if (activeHighlightedHit.__igcsefySearchHitTimer) {
        clearTimeout(activeHighlightedHit.__igcsefySearchHitTimer);
        activeHighlightedHit.__igcsefySearchHitTimer = null;
      }
      activeHighlightedHit.classList.remove("igcsefy-search-hit");
    }

    if (element.__igcsefySearchHitTimer) {
      clearTimeout(element.__igcsefySearchHitTimer);
      element.__igcsefySearchHitTimer = null;
      element.classList.remove("igcsefy-search-hit");
      void element.offsetWidth;
    }

    element.classList.add("igcsefy-search-hit");
    activeHighlightedHit = element;
    element.__igcsefySearchHitTimer = setTimeout(() => {
      element.classList.remove("igcsefy-search-hit");
      if (activeHighlightedHit === element) {
        activeHighlightedHit = null;
      }
      element.__igcsefySearchHitTimer = null;
    }, 2860);
  };

  const scrollToAndHighlight = (element) => {
    if (!element) return;

    if (highlightDelayTimer) {
      clearTimeout(highlightDelayTimer);
      highlightDelayTimer = null;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightDelayTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        highlightHit(element);
        highlightDelayTimer = null;
      });
    }, 160);
  };

  const setActiveResultIndex = (nextIndex) => {
    if(!searchUi || !searchUi.results) return;
    activeResultIndex = nextIndex;
    searchUi.results.querySelectorAll(".pp-search-result").forEach((button, index) => {
      button.classList.toggle("is-active", index === activeResultIndex);
    });
  };

  const renderSearchResults = () => {
    if(!searchUi || !searchUi.input || !searchUi.results) return;

    if (!searchValue.trim()) {
      activeResults = [];
      closeSearchResults();
      return;
    }

    if (!activeResults.length) {
      activeResultIndex = -1;
      searchUi.results.hidden = false;
      searchUi.results.innerHTML = `<div class="pp-search-empty">No matches found.</div>`;
      return;
    }

    activeResultIndex = -1;
    searchUi.results.hidden = false;
    searchUi.results.innerHTML = activeResults.map((entry, index) => `
      <button class="pp-search-result" type="button" data-index="${index}">
        <span class="pp-search-result-title">${entry.subjectName} (${entry.subjectCode}) | ${entry.sessionLabel} ${entry.year} | Paper ${entry.paperNumber} | Variant ${entry.variant}</span>
        <span class="pp-search-result-meta">${entry.paperLabel}</span>
      </button>
    `).join("");
  };

  const runSearch = () => {
    if(!searchUi || !searchUi.input) return;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }

    searchValue = searchUi.input.value || "";
    const parsed = parsePastPaperSearchQuery(searchValue, subjectMeta);
    activeResults = findPastPaperSearchMatches(searchIndex, parsed, 10);
    renderSearchResults();
  };

  const bindSearchUi = () => {
    if(searchUiCleanup){
      searchUiCleanup();
      searchUiCleanup = null;
    }

    searchUi = detail.__ppGlobalSearchElements || null;
    if(!searchUi || !searchUi.input || !searchUi.results || !searchUi.clear){
      return;
    }

    searchUi.input.value = searchValue;
    searchUi.clear.hidden = !searchValue.trim();

    if(searchValue.trim()){
      activeResults = findPastPaperSearchMatches(
        searchIndex,
        parsePastPaperSearchQuery(searchValue, subjectMeta),
        10
      );
      renderSearchResults();
    } else {
      closeSearchResults();
    }

    const handleInput = () => {
      if (suppressNextInput) return;
      searchValue = searchUi.input.value || "";
      searchUi.clear.hidden = !searchValue.trim();
      queueSearch();
    };

    const handleFocus = () => {
      if (searchValue.trim()) {
        runSearch();
      }
    };

    const handleKeydown = (e) => {
      if (e.key === "ArrowDown") {
        const previousIndex = activeResultIndex;
        runSearch();
        if (!activeResults.length) return;
        e.preventDefault();
        const safeIndex = previousIndex >= activeResults.length ? -1 : previousIndex;
        setActiveResultIndex(safeIndex < activeResults.length - 1 ? safeIndex + 1 : 0);
        return;
      }

      if (e.key === "ArrowUp") {
        const previousIndex = activeResultIndex;
        runSearch();
        if (!activeResults.length) return;
        e.preventDefault();
        const safeIndex = previousIndex >= activeResults.length ? -1 : previousIndex;
        setActiveResultIndex(safeIndex > 0 ? safeIndex - 1 : activeResults.length - 1);
        return;
      }

      if (e.key === "Enter") {
        const selectedIndex = activeResultIndex;
        runSearch();
        const chosen = selectedIndex >= 0 && activeResults[selectedIndex] ? activeResults[selectedIndex] : activeResults[0];
        if (!chosen) return;
        e.preventDefault();
        void selectSearchResult(chosen);
        return;
      }

      if (e.key === "Escape") {
        activeResults = [];
        closeSearchResults();
      }
    };

    const handleClearPointerDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleClearClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginInputSuppression();

      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
      }

      if (highlightDelayTimer) {
        clearTimeout(highlightDelayTimer);
        highlightDelayTimer = null;
      }

      searchValue = "";
      searchUi.input.value = "";
      searchUi.clear.hidden = true;
      activeResults = [];
      closeSearchResults();
      searchUi.input.focus({ preventScroll: true });
    };

    const handleResultsMove = (e) => {
      const button = e.target.closest(".pp-search-result[data-index]");
      if (!button) return;
      setActiveResultIndex(Number(button.dataset.index));
    };

    const handleResultsLeave = () => {
      setActiveResultIndex(-1);
    };

    const handleResultsClick = (e) => {
      const button = e.target.closest(".pp-search-result[data-index]");
      if (!button) return;
      const entry = activeResults[Number(button.dataset.index)];
      if (!entry) return;
      void selectSearchResult(entry);
    };

    searchUi.input.addEventListener("input", handleInput);
    searchUi.input.addEventListener("focus", handleFocus);
    searchUi.input.addEventListener("keydown", handleKeydown);
    searchUi.clear.addEventListener("pointerdown", handleClearPointerDown);
    searchUi.clear.addEventListener("click", handleClearClick);
    searchUi.results.addEventListener("mousemove", handleResultsMove);
    searchUi.results.addEventListener("mouseleave", handleResultsLeave);
    searchUi.results.addEventListener("click", handleResultsClick);

    searchUiCleanup = () => {
      searchUi.input.removeEventListener("input", handleInput);
      searchUi.input.removeEventListener("focus", handleFocus);
      searchUi.input.removeEventListener("keydown", handleKeydown);
      searchUi.clear.removeEventListener("pointerdown", handleClearPointerDown);
      searchUi.clear.removeEventListener("click", handleClearClick);
      searchUi.results.removeEventListener("mousemove", handleResultsMove);
      searchUi.results.removeEventListener("mouseleave", handleResultsLeave);
      searchUi.results.removeEventListener("click", handleResultsClick);
    };
  };

  const setSubject = async (slug)=>{
    const renderToken = ++subjectRenderToken;
    pills.forEach(p=>p.classList.toggle('active', p.dataset.subject===slug));

    const needsRender = activeSubject !== slug || detail.__ppActiveSubject !== slug || !detail.childElementCount;
    activeSubject = slug;

    if (needsRender) {
      await renderSubjectPastPapersZip(detail, slug, { embeddedGlobalBrowser: true });
    }

    if(renderToken !== subjectRenderToken){
      return;
    }

    bindSearchUi();
    syncSearchTargetRefs();

    // Past Papers scrollytelling: refresh triggers after subject swap
    if (typeof window !== "undefined" && typeof window.ppScrollRefresh === "function") {
      window.ppScrollRefresh();
    }
  };

  const selectSearchResult = async (entry) => {
    if (!entry) return;

    await setSubject(entry.subjectSlug);

    if (typeof detail.__ppRevealTrackKey === "function") {
      detail.__ppRevealTrackKey(entry.trackKey);
    } else if (typeof detail.__ppActivateYear === "function") {
      detail.__ppActivateYear(entry.year);
    }

    syncSearchTargetRefs();

    const targetEntry = searchIndexByTrackKey.get(entry.trackKey);
    const target = targetEntry ? targetEntry.element : null;

    closeSearchResults();

    if (!target) return;

    scrollToAndHighlight(target);
  };

  const queueSearch = () => {
    if(!searchUi || !searchUi.input) return;
    if (searchTimer) {
      clearTimeout(searchTimer);
    }

    searchTimer = setTimeout(runSearch, 150);
  };

  document.addEventListener("click", (e) => {
    if(!searchUi || !searchUi.host){
      return;
    }
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    if (!path.includes(searchUi.host)) {
      closeSearchResults();
    }
  });

  pills.forEach(p=>p.addEventListener('click', ()=>{
    void setSubject(p.dataset.subject).then(() => {
      closeSearchResults();
    });
  }));
  await setSubject(initial);
}

/* ------------------------------
   Tracker
   ------------------------------ */
const TRACKER_STATUS_META = {
  none: {
    label: "Not started",
    buttonLabel: "Track",
    complete: false
  },
  in_progress: {
    label: "In progress",
    buttonLabel: "In progress",
    complete: false
  },
  done: {
    label: "Done",
    buttonLabel: "Done",
    complete: true
  },
  reviewed: {
    label: "Reviewed",
    buttonLabel: "Reviewed",
    complete: true
  }
};

function normalizeTrackerValue(value){
  if(value === true || value === 1 || value === "1" || value === "true"){
    return "done";
  }
  if(value === "in-progress"){
    return "in_progress";
  }
  if(value === "in_progress" || value === "done" || value === "reviewed"){
    return value;
  }
  return null;
}

function readTracker(){
  return ensureIgcsefyDataStore().getPastPaperStatuses();
}

function writeTracker(store){
  const dataStore = ensureIgcsefyDataStore();
  const current = dataStore.getPastPaperStatuses();
  const next = {};

  Object.keys(store || {}).forEach(trackKey => {
    const status = normalizeTrackerValue(store[trackKey]);
    if(status){
      next[trackKey] = status;
    }
  });

  Object.keys(current).forEach(trackKey => {
    if(!Object.prototype.hasOwnProperty.call(next, trackKey)){
      dataStore.setPastPaperStatus(trackKey, 'none');
    }
  });

  Object.keys(next).forEach(trackKey => {
    dataStore.setPastPaperStatus(trackKey, next[trackKey]);
  });
}

function emitTrackerChange(store){
  if(typeof window === "undefined" || typeof window.dispatchEvent !== "function"){
    return;
  }
  try{
    window.dispatchEvent(new CustomEvent("igcsefy:tracker-change", {
      detail: {
        store: Object.assign({}, store || {})
      }
    }));
  }catch(e){}
}

function getTrackerStatus(store, trackKey){
  return store && TRACKER_STATUS_META[store[trackKey]] ? store[trackKey] : "none";
}

function setTrackerStatus(trackKey, status){
  const nextSnapshot = ensureIgcsefyDataStore().setPastPaperStatus(trackKey, status);
  return Object.assign({}, nextSnapshot.pastPaperStatuses || {});
}

function isCompleteStatus(status){
  return !!(TRACKER_STATUS_META[status] && TRACKER_STATUS_META[status].complete);
}

function syncVariantStatusUI(item, status){
  if(!item) return;

  const resolved = TRACKER_STATUS_META[status] ? status : "none";
  const meta = TRACKER_STATUS_META[resolved];
  item.dataset.status = resolved;

  const trigger = item.querySelector(".pp-status");
  if(trigger){
    trigger.dataset.status = resolved;
    const staticLabel = trigger.dataset.staticLabel;
    if(staticLabel){
      trigger.setAttribute("aria-label", `${staticLabel}. Tracking status: ${meta.label}. Activate to change.`);
    }else{
      trigger.setAttribute("aria-label", `Tracking status: ${meta.label}. Activate to change.`);
    }
    const label = trigger.querySelector(".pp-status__label");
    if(label){
      label.textContent = staticLabel || meta.buttonLabel || meta.label;
    }
  }

  item.querySelectorAll(".pp-status__option").forEach(option => {
    const value = option.dataset.statusValue || "none";
    const active = value === resolved;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-checked", active ? "true" : "false");
  });
}

function refreshTrackerHostHeight(shell){
  if(!shell) return;

  const item = shell.closest(".pp-variant-item");
  const menu = shell.querySelector(".pp-status__menu");
  const panel = shell.closest(".pp-dropdown-panel");
  const open = shell.classList.contains("is-open");

  if(item){
    let space = "0px";
    if(open && menu){
      space = `${menu.scrollHeight + 10}px`;
    }
    item.style.setProperty("--pp-status-space", space);
    item.classList.toggle("is-status-open", open);
  }

  if(panel && panel.getAttribute("data-open") === "true"){
    requestAnimationFrame(() => {
      panel.style.maxHeight = `${panel.scrollHeight + 12}px`;
    });
  }
}

function closeStatusMenu(shell){
  if(!shell) return;
  shell.classList.remove("is-open");

  const trigger = shell.querySelector(".pp-status");
  const menu = shell.querySelector(".pp-status__menu");
  if(trigger){
    trigger.setAttribute("aria-expanded", "false");
  }
  if(menu){
    menu.setAttribute("data-open", "false");
    menu.setAttribute("aria-hidden", "true");
    menu.querySelectorAll(".pp-status__option").forEach(option => {
      option.tabIndex = -1;
    });
  }

  refreshTrackerHostHeight(shell);
}

function closeAllStatusMenus(scope, exceptShell){
  const root = scope && scope.querySelectorAll ? scope : document;
  root.querySelectorAll(".pp-status-shell.is-open").forEach(shell => {
    if(shell !== exceptShell){
      closeStatusMenu(shell);
    }
  });
}

function openStatusMenu(scope, shell, focusMode){
  if(!shell) return;
  closeAllStatusMenus(scope, shell);

  const trigger = shell.querySelector(".pp-status");
  const menu = shell.querySelector(".pp-status__menu");
  if(!trigger || !menu) return;

  shell.classList.add("is-open");
  menu.setAttribute("data-open", "true");
  menu.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelectorAll(".pp-status__option").forEach(option => {
    option.tabIndex = 0;
  });

  refreshTrackerHostHeight(shell);

  if(!focusMode){
    return;
  }

  const options = Array.from(menu.querySelectorAll(".pp-status__option"));
  if(!options.length){
    return;
  }

  let target = null;
  if(focusMode === "first"){
    target = options[0];
  }else if(focusMode === "last"){
    target = options[options.length - 1];
  }else{
    target = options.find(option => option.classList.contains("is-active")) || options[0];
  }

  if(target){
    target.focus();
  }
}

function updatePaperCompletion(root, store = readTracker()){
  root.querySelectorAll(".pp-paper-row[data-paper-key]").forEach(row=>{
    const items = row.querySelectorAll(".pp-variant-item[data-track-key]");
    if(!items.length){
      row.classList.remove("is-complete");
      return;
    }
    let completeCount = 0;
    items.forEach(item => {
      if(isCompleteStatus(getTrackerStatus(store, item.dataset.trackKey))){
        completeCount += 1;
      }
    });
    row.classList.toggle("is-complete", completeCount === items.length);
  });
}

function syncPastPaperTrackerRoot(root, store = readTracker()){
  if(!root) return;

  root.querySelectorAll(".pp-variant-item[data-track-key]").forEach(item => {
    syncVariantStatusUI(item, getTrackerStatus(store, item.dataset.trackKey));
  });

  updatePaperCompletion(root, store);
}

function hydratePastPaperTracker(root){
  if(!root) return;

  syncPastPaperTrackerRoot(root);

  // One-time event binding per root
  if(root.__ppTrackerBound) return;
  root.__ppTrackerBound = true;

  if(typeof window !== "undefined" && typeof window.addEventListener === "function"){
    root.__ppTrackerChangeHandler = event => {
      const detail = event && event.detail ? event.detail : null;
      const store = detail && detail.store && typeof detail.store === "object"
        ? detail.store
        : readTracker();
      syncPastPaperTrackerRoot(root, store);
    };
    window.addEventListener("igcsefy:tracker-change", root.__ppTrackerChangeHandler);
  }

  root.addEventListener('click', (e)=>{
    const option = e.target.closest(".pp-status__option");
    if(option){
      e.preventDefault();
      e.stopPropagation();

      const item = option.closest(".pp-variant-item[data-track-key]");
      const shell = option.closest(".pp-status-shell");
      if(!item || !shell) return;

      const nextStatus = option.dataset.statusValue || "none";
      const nextStore = setTrackerStatus(item.dataset.trackKey, nextStatus);
      syncVariantStatusUI(item, nextStatus);
      closeStatusMenu(shell);

      const trigger = shell.querySelector(".pp-status");
      if(trigger){
        trigger.focus();
      }

      updatePaperCompletion(root, nextStore);
      return;
    }

    const trigger = e.target.closest(".pp-status");
    if(!trigger) return;

    e.preventDefault();
    e.stopPropagation();

    const shell = trigger.closest(".pp-status-shell");
    if(!shell) return;

    if(shell.classList.contains("is-open")){
      closeStatusMenu(shell);
      return;
    }

    openStatusMenu(root, shell, null);
  }, {passive:false});

  root.addEventListener("keydown", (e) => {
    const trigger = e.target.closest(".pp-status");
    if(trigger){
      const shell = trigger.closest(".pp-status-shell");
      if(!shell) return;

      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        openStatusMenu(root, shell, "active");
        return;
      }

      if(e.key === "ArrowDown"){
        e.preventDefault();
        openStatusMenu(root, shell, "first");
        return;
      }

      if(e.key === "ArrowUp"){
        e.preventDefault();
        openStatusMenu(root, shell, "last");
        return;
      }

      if(e.key === "Escape" && shell.classList.contains("is-open")){
        e.preventDefault();
        closeStatusMenu(shell);
      }
      return;
    }

    const option = e.target.closest(".pp-status__option");
    if(!option) return;

    const shell = option.closest(".pp-status-shell");
    if(!shell) return;

    const options = Array.from(shell.querySelectorAll(".pp-status__option"));
    const index = options.indexOf(option);
    if(index === -1) return;

    if(e.key === "ArrowDown"){
      e.preventDefault();
      options[(index + 1) % options.length].focus();
      return;
    }

    if(e.key === "ArrowUp"){
      e.preventDefault();
      options[(index - 1 + options.length) % options.length].focus();
      return;
    }

    if(e.key === "Home"){
      e.preventDefault();
      options[0].focus();
      return;
    }

    if(e.key === "End"){
      e.preventDefault();
      options[options.length - 1].focus();
      return;
    }

    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      option.click();
      return;
    }

    if(e.key === "Escape"){
      e.preventDefault();
      closeStatusMenu(shell);
      const nextTrigger = shell.querySelector(".pp-status");
      if(nextTrigger){
        nextTrigger.focus();
      }
    }
  });
}

const SUBJECT_PAST_PAPERS_ZIP_CSS_PATH = "/assets/past-papers-zip/styles/index-C2S2iisq.css";
let subjectPastPapersZipCssPromise = null;

const SUBJECT_PAST_PAPERS_ZIP_STATUS = [
  {
    value: "in_progress",
    label: "In Progress",
    dot: "bg-amber-400",
    active: "text-amber-300 bg-amber-400/10"
  },
  {
    value: "done",
    label: "Done",
    dot: "bg-emerald-400",
    active: "text-emerald-300 bg-emerald-400/10"
  },
  {
    value: "reviewed",
    label: "Reviewed",
    dot: "bg-sky-400",
    active: "text-sky-300 bg-sky-400/10"
  }
];

const SUBJECT_PAST_PAPERS_ZIP_SESSION_LABELS = {
  m: "Feb/March",
  s: "May/June",
  w: "Oct/Nov"
};

function loadSubjectPastPapersZipCss(){
  if(!subjectPastPapersZipCssPromise){
    subjectPastPapersZipCssPromise = fetch(SUBJECT_PAST_PAPERS_ZIP_CSS_PATH, { cache: "no-store" })
      .then(res => {
        if(!res.ok){
          throw new Error("Past Papers ZIP CSS not found");
        }
        return res.text();
      });
  }
  return subjectPastPapersZipCssPromise;
}

function escapePastPapersZipHtml(value){
  return escapePastPaperHtml(value);
}

function createPastPapersZipSlug(value){
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";
}

function parsePastPapersZipPaperMeta(paper){
  const rawLabel = String((paper && paper.label) || "");
  const match = rawLabel.match(/^(Paper\s+(\d+))\s*[–-]\s*(.+)$/);
  const paperNumber = match
    ? match[2]
    : (((paper && paper.id) || "").match(/p(\d+)/i) || [])[1] || "";

  if(match){
    return {
      number: paperNumber,
      name: match[1],
      detail: match[3]
    };
  }

  return {
    number: paperNumber,
    name: paperNumber ? `Paper ${paperNumber}` : rawLabel,
    detail: rawLabel && !/^Paper\s+\d+$/i.test(rawLabel) ? rawLabel : ""
  };
}

function getPastPapersZipStatusMeta(status){
  return SUBJECT_PAST_PAPERS_ZIP_STATUS.find(item => item.value === status) || null;
}

function getSubjectPastPapersZipSections(subjectSlug, cfg){
  return getPaperSections(subjectSlug, cfg).map((section, index) => ({
    id: section.title ? createPastPapersZipSlug(section.title) : `all-${index}`,
    label: section.title || "All",
    hidden: !section.title,
    papers: section.papers || []
  }));
}

function buildSubjectPastPapersZipSessionExtras(subjectSlug, year, sessionCode){
  const cfg = PAPERS_CONFIG[subjectSlug];
  if(!cfg){
    return [];
  }
  return buildSessionExtraItems(subjectSlug, cfg, year, sessionCode);
}

function buildSubjectPastPapersZipModel(subjectSlug){
  const cfg = PAPERS_CONFIG[subjectSlug];
  if(!cfg){
    return null;
  }

  const sections = getSubjectPastPapersZipSections(subjectSlug, cfg);
  const years = getRenderablePastPaperYears(subjectSlug, cfg)
    .map(year => {
      const sessionYearShort = String(year).slice(-2);
      const sessions = getSessionsForSubject(subjectSlug, year)
        .map(sessionCode => {
          let paperIdx = 0;
          const renderableSections = getRenderablePaperSections(subjectSlug, cfg, year, sessionCode)
            .map((section, index) => ({
              id: getPaperSectionId(section, index),
              label: section.title,
              hidden: !section.title,
              papers: section.papers || []
            }));
          const groups = sections.map(section => {
            const renderableSection = renderableSections.find(entry => entry.id === section.id) || {
              id: section.id,
              label: section.label,
              hidden: section.hidden,
              papers: []
            };
            const papers = [];

            renderableSection.papers.forEach(paper => {
              const thisPaperIdx = paperIdx;
              const paperKeyBase = `${subjectSlug}|${cfg.code}|${year}|${sessionCode}|p${thisPaperIdx}`;
              paperIdx += 1;

              const paperNumber = getPaperNumberFromDefinition(paper);
              const qpVariantMap = getPastPaperKindManifest(subjectSlug, year, sessionCode, "qp", paperNumber);
              const msVariantMap = getPastPaperKindManifest(subjectSlug, year, sessionCode, "ms", paperNumber);
              const ciVariantMap = getPastPaperKindManifest(subjectSlug, year, sessionCode, "ci", paperNumber);
              const qpVariants = Object.keys(qpVariantMap);
              const msVariants = Object.keys(msVariantMap);
              const ciVariants = Object.keys(ciVariantMap);
              const variants = getAvailableTrackerVariants(subjectSlug, cfg, year, sessionCode, paper);

              if(!qpVariants.length && !msVariants.length && !ciVariants.length){
                return;
              }

              const paperMeta = parsePastPapersZipPaperMeta(paper);
              papers.push({
                id: paper.id,
                number: paperMeta.number,
                name: paperMeta.name,
                detail: paperMeta.detail,
                searchSource: `${paperMeta.name} ${paperMeta.detail} ${paper.label || ""}`.toLowerCase(),
                variants: variants.map(variant => {
                  const hasQP = qpVariants.includes(variant);
                  const hasMS = msVariants.includes(variant);
                  const hasCI = ciVariants.includes(variant);
                  const insertMap = getInsertMap(subjectSlug, year, sessionCode);
                  const insertFileName = insertMap && insertMap[String(variant)];
                  const inHref = insertFileName
                    ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, insertFileName)
                    : "";
                  const ciHref = hasCI
                    ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, ciVariantMap[String(variant)])
                    : "";
                  return {
                    id: `v${variant}`,
                    label: String(variant),
                    trackKey: hasQP
                      ? `${paperKeyBase}|qp|v${variant}`
                      : `${paperKeyBase}|ms|v${variant}`,
                    qpHref: hasQP
                      ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, qpVariantMap[String(variant)])
                      : "",
                    msHref: hasMS
                      ? buildPastPaperManifestHref(subjectSlug, year, sessionCode, msVariantMap[String(variant)])
                      : "",
                    ciHref,
                    inHref
                  };
                })
              });
            });

            return {
              id: section.id,
              label: section.label,
              hidden: section.hidden,
              papers
            };
          });

          if(!groups.some(group => group.papers.length)){
            return null;
          }

          return {
            id: `${year}-${sessionCode}`,
            year,
            sessionCode,
            label: SUBJECT_PAST_PAPERS_ZIP_SESSION_LABELS[sessionCode] || sessionCode.toUpperCase(),
            code: `${sessionCode}${sessionYearShort}`,
            extras: buildSubjectPastPapersZipSessionExtras(subjectSlug, year, sessionCode),
            groups
          };
        })
        .filter(Boolean);

      return {
        year,
        sessions
      };
    })
    .filter(yearEntry => yearEntry.sessions.length);

  return {
    subjectSlug,
    cfg,
    years,
    sections,
    visibleGroups: sections.filter(section => !section.hidden),
    showGroupControl: sections.filter(section => !section.hidden).length > 1,
    defaultGroupId: sections[0] ? sections[0].id : null
  };
}

function resolveUnavailablePastPapersSubjectMeta(subjectSlug, container){
  const slug = String(subjectSlug || "").trim();

  try{
    if(typeof extractSubjectMeta === "function"){
      const meta = extractSubjectMeta(
        {},
        `syllabus-${slug}`,
        `resources/${slug}/syllabus.json`,
        container || null
      );
      if(meta && (meta.name || meta.code || meta.slug)){
        return {
          slug: meta.slug || slug,
          name: meta.name || (typeof formatSubjectNameFromSlug === "function" ? formatSubjectNameFromSlug(slug) : slug),
          code: meta.code || (((slug.match(/(\d{4})$/) || [])[1]) || "")
        };
      }
    }
  }catch(error){}

  const code = ((slug.match(/(\d{4})$/) || [])[1]) || "";
  const name = typeof formatSubjectNameFromSlug === "function"
    ? formatSubjectNameFromSlug(slug)
    : slug
        .replace(/-\d{4}$/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());

  return {
    slug,
    name: name || "Subject",
    code
  };
}

function renderUnavailableSubjectPastPapersZip(container, subjectSlug, options = {}, message){
  const embeddedGlobalBrowser = !!(options && options.embeddedGlobalBrowser);
  const meta = resolveUnavailablePastPapersSubjectMeta(subjectSlug, container);
  const tabsRoot = container.closest("[data-tabs]");
  const embeddedSubjectTabs = !embeddedGlobalBrowser && !!tabsRoot;

  container.__ppActiveSubject = subjectSlug;
  container.__ppActivateYear = null;
  container.__ppRevealTrackKey = null;
  if(container.__ppThemeObserver){
    container.__ppThemeObserver.disconnect();
    container.__ppThemeObserver = null;
  }

  container.innerHTML = "";
  const host = document.createElement("div");
  host.className = "past-papers-zip-host";
  host.style.display = "block";
  container.appendChild(host);

  const resolveShellTheme = () => {
    const root = document.documentElement;
    return root.dataset.theme === "light"
      || root.classList.contains("light")
      || (!root.classList.contains("dark") && root.dataset.theme !== "dark")
      ? "light"
      : "dark";
  };

  const shadow = host.attachShadow({ mode: "open" });
  let shell = null;
  let syllabusTabButton = null;
  let pastPapersTabButton = null;

  function applyShellTabVisualState(){
    const isLight = resolveShellTheme() === "light";
    const tabsWrap = syllabusTabButton && syllabusTabButton.parentElement;
    const tabs = [syllabusTabButton, pastPapersTabButton].filter(Boolean);
    if(tabsWrap){
      tabsWrap.style.background = isLight ? "#FFFFFF" : "rgba(255,255,255,.05)";
      tabsWrap.style.boxShadow = isLight ? "0 0 0 1px #E9E3D8 inset" : "";
    }
    tabs.forEach((button) => {
      const isActive = button.classList.contains("is-active");
      if(isLight){
        button.style.background = isActive ? "#000000" : "transparent";
        button.style.color = isActive ? "#FFFFFF" : "#666666";
        button.style.boxShadow = "none";
      }else{
        button.style.background = isActive ? "#FFFFFF" : "transparent";
        button.style.color = isActive ? "#000000" : "rgba(255,255,255,.5)";
        button.style.boxShadow = isActive ? "0 1px 3px rgba(0,0,0,.1)" : "none";
      }
    });
  }

  const syncHostTheme = () => {
    const resolvedTheme = resolveShellTheme();
    host.dataset.theme = resolvedTheme;
    if(shell){
      shell.dataset.theme = resolvedTheme;
      applyShellTabVisualState();
    }
  };

  const themeObserver = new MutationObserver(syncHostTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"]
  });
  container.__ppThemeObserver = themeObserver;

  shadow.innerHTML = embeddedSubjectTabs ? `
    <style>
      :host{ display:block; }
      .subject-section-shell{
        min-height:100vh;
        background:#0A0A0B;
        color:#fff;
      }
      .subject-section-shell__header{
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .subject-section-shell__inner{
        width:100%;
        max-width:56rem;
        margin:0 auto;
        padding:0 1.5rem;
      }
      .subject-section-shell__header .subject-section-shell__inner{
        padding-top:2rem;
        padding-bottom:2rem;
      }
      .subject-section-shell__body{
        padding-top:2rem;
        padding-bottom:4rem;
      }
      .subject-section-shell__crumb{
        margin:0 0 1.25rem;
        display:flex;
        align-items:center;
        gap:.5rem;
        font-size:.875rem;
        color:rgba(255,255,255,.3);
        letter-spacing:.01em;
      }
      .subject-section-shell__crumb-current{
        color:rgba(255,255,255,.6);
      }
      .subject-section-shell__head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        flex-wrap:wrap;
        gap:1rem;
      }
      .subject-section-shell__meta{
        min-width:min(100%,24rem);
      }
      .subject-section-shell__title{
        margin:0;
        font-size:1.5rem;
        line-height:2rem;
        letter-spacing:-.025em;
        font-weight:600;
      }
      .subject-section-shell__subtitle{
        margin:.25rem 0 0;
        font-size:.875rem;
        color:rgba(255,255,255,.4);
      }
      .subject-section-shell__tabs{
        display:flex;
        gap:.25rem;
        padding:.25rem;
        border-radius:9999px;
        background:rgba(255,255,255,.05);
      }
      .subject-section-shell__tab{
        appearance:none;
        min-height:auto;
        padding:.5rem 1.25rem;
        border:0;
        border-radius:9999px;
        background:transparent;
        color:rgba(255,255,255,.5);
        font:inherit;
        font-size:.875rem;
        font-weight:500;
        line-height:1.25rem;
        transition:
          background-color .2s ease,
          color .2s ease,
          box-shadow .2s ease;
      }
      .subject-section-shell__tab:hover{
        color:rgba(255,255,255,.8);
      }
      .subject-section-shell__tab.is-active{
        background:#fff;
        color:#000;
        box-shadow:0 1px 3px rgba(0,0,0,.1);
      }
      .subject-section-shell__content,
      .pp-subject-empty-state{
        width:100%;
        margin-top:2rem;
      }
      .subject-section-shell__empty-copy,
      .pp-subject-empty-copy{
        margin:0;
        font-size:.95rem;
        line-height:1.7;
        color:rgba(255,255,255,.72);
      }
      .subject-section-shell[data-theme="light"]{
        background:#F1EFE7;
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__header{
        border-bottom-color:#E9E3D8;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__crumb,
      .subject-section-shell[data-theme="light"] .subject-section-shell__subtitle,
      .subject-section-shell[data-theme="light"] .subject-section-shell__empty-copy,
      .pp-subject-shell[data-theme="light"] .pp-subject-empty-copy{
        color:#666666;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__crumb-current,
      .subject-section-shell[data-theme="light"] .subject-section-shell__title{
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tabs{
        background:#FFFFFF;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tab{
        color:#666666;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tab:hover{
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tab.is-active{
        background:#000000;
        color:#FFFFFF;
        box-shadow:none;
      }
      @media (max-width:640px){
        .subject-section-shell__inner{
          padding:0 1rem;
        }
        .subject-section-shell__header .subject-section-shell__inner{
          padding-top:1.5rem;
          padding-bottom:1.5rem;
        }
      }
    </style>
    <div class="subject-section-shell" data-theme="${escapePastPapersZipHtml(resolveShellTheme())}">
      <div class="subject-section-shell__header">
        <div class="subject-section-shell__inner">
          <div class="subject-section-shell__crumb">
            <span>${escapePastPapersZipHtml(meta.name)}</span>
            <span>/</span>
            <span class="subject-section-shell__crumb-current">Past Papers</span>
          </div>
          <div class="subject-section-shell__head">
            <div class="subject-section-shell__meta">
              <h1 class="subject-section-shell__title">${escapePastPapersZipHtml(meta.name)}</h1>
              <p class="subject-section-shell__subtitle">Cambridge IGCSE${meta.code ? ` · ${escapePastPapersZipHtml(meta.code)}` : ""}</p>
            </div>
            <div class="subject-section-shell__tabs">
              <button type="button" data-top-tab="syllabus" class="subject-section-shell__tab">Syllabus</button>
              <button type="button" data-top-tab="past-papers" class="subject-section-shell__tab is-active">Past Papers</button>
            </div>
          </div>
        </div>
      </div>
      <div class="subject-section-shell__inner subject-section-shell__body">
        <div class="subject-section-shell__content pp-subject-empty-state">
          <p class="subject-section-shell__empty-copy pp-subject-empty-copy">${escapePastPapersZipHtml(message || "Past papers for this subject are coming soon.")}</p>
        </div>
      </div>
    </div>
  ` : `
    <style>
      :host{ display:block; }
      .pp-subject-shell{
        min-height:${embeddedGlobalBrowser ? "0" : "100vh"};
        background:${embeddedGlobalBrowser ? "transparent" : "#0A0A0B"};
        color:#fff;
      }
      .pp-subject-shell__header{
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .pp-subject-shell__inner{
        max-width:${embeddedGlobalBrowser ? "none" : "56rem"};
        width:100%;
        margin:0 auto;
        padding:0 1.5rem;
      }
      .pp-subject-shell__header .pp-subject-shell__inner{
        padding-top:${embeddedGlobalBrowser ? "1.35rem" : "2rem"};
        padding-bottom:${embeddedGlobalBrowser ? "1.35rem" : "2rem"};
      }
      .pp-subject-shell__body{
        padding-top:${embeddedGlobalBrowser ? "1.35rem" : "2rem"};
        padding-bottom:${embeddedGlobalBrowser ? "1.5rem" : "4rem"};
      }
      .pp-subject-shell__crumb{
        margin:0 0 1.25rem;
        display:flex;
        align-items:center;
        gap:.5rem;
        font-size:.875rem;
        color:rgba(255,255,255,.3);
        letter-spacing:.01em;
      }
      .pp-subject-shell__crumb-current{
        color:rgba(255,255,255,.6);
      }
      .pp-subject-shell__head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        flex-wrap:wrap;
        gap:1rem;
      }
      .pp-subject-shell__meta{
        min-width:min(100%,24rem);
      }
      .pp-subject-shell__title{
        margin:0;
        font-size:1.5rem;
        line-height:2rem;
        letter-spacing:-.025em;
        font-weight:600;
      }
      .pp-subject-shell__subtitle{
        margin:.25rem 0 0;
        font-size:.875rem;
        color:rgba(255,255,255,.4);
      }
      .pp-subject-shell__tabs{
        display:flex;
        gap:.25rem;
        padding:.25rem;
        border-radius:9999px;
        background:rgba(255,255,255,.05);
      }
      .pp-subject-shell__tab{
        appearance:none;
        min-height:auto;
        padding:.5rem 1.25rem;
        border:0;
        border-radius:9999px;
        background:transparent;
        color:rgba(255,255,255,.5);
        font:inherit;
        font-size:.875rem;
        font-weight:500;
        line-height:1.25rem;
        transition:all .2s ease;
      }
      .pp-subject-shell__tab:hover{
        color:rgba(255,255,255,.8);
      }
      .pp-subject-shell__tab.is-active{
        background:#fff;
        color:#000;
        box-shadow:0 1px 3px rgba(0,0,0,.1);
      }
      .pp-subject-empty-state{
        padding:.25rem 0 0;
      }
      .pp-subject-empty-copy{
        margin:0;
        font-size:.95rem;
        line-height:1.7;
        color:rgba(255,255,255,.72);
      }
      :host([data-theme="light"]) .pp-subject-shell,
      :host-context(html.light) .pp-subject-shell,
      .pp-subject-shell[data-theme="light"]{
        background:${embeddedGlobalBrowser ? "transparent" : "#F1EFE7"};
        color:#000000;
      }
      :host([data-theme="light"]) .pp-subject-shell__header,
      :host-context(html.light) .pp-subject-shell__header,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__header{
        border-bottom-color:#E9E3D8;
      }
      :host([data-theme="light"]) .pp-subject-shell__crumb,
      :host([data-theme="light"]) .pp-subject-shell__subtitle,
      :host-context(html.light) .pp-subject-shell__crumb,
      :host-context(html.light) .pp-subject-shell__subtitle,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__crumb,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__subtitle{
        color:#666666;
      }
      :host([data-theme="light"]) .pp-subject-shell__crumb-current,
      :host([data-theme="light"]) .pp-subject-shell__title,
      :host-context(html.light) .pp-subject-shell__crumb-current,
      :host-context(html.light) .pp-subject-shell__title,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__crumb-current,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__title{
        color:#000000;
      }
      :host([data-theme="light"]) .pp-subject-shell__tabs,
      :host-context(html.light) .pp-subject-shell__tabs,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__tabs{
        background:#FFFFFF;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      :host([data-theme="light"]) .pp-subject-shell__tab,
      :host-context(html.light) .pp-subject-shell__tab,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__tab{
        color:#666666;
      }
      :host([data-theme="light"]) .pp-subject-shell__tab:hover,
      :host-context(html.light) .pp-subject-shell__tab:hover,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__tab:hover{
        color:#000000;
      }
      :host([data-theme="light"]) .pp-subject-shell__tab.is-active,
      :host-context(html.light) .pp-subject-shell__tab.is-active,
      .pp-subject-shell[data-theme="light"] .pp-subject-shell__tab.is-active{
        background:#000000;
        color:#FFFFFF;
        box-shadow:none;
      }
      :host([data-theme="light"]) .pp-subject-empty-copy,
      :host-context(html.light) .pp-subject-empty-copy,
      .pp-subject-shell[data-theme="light"] .pp-subject-empty-copy{
        color:#666666;
      }
      @media (max-width:640px){
        .pp-subject-shell__inner{
          padding:0 1rem;
        }
        .pp-subject-shell__header .pp-subject-shell__inner{
          padding-top:1.5rem;
          padding-bottom:1.5rem;
        }
      }
    </style>
    <div class="pp-subject-shell" data-theme="${escapePastPapersZipHtml(resolveShellTheme())}">
      <div class="pp-subject-shell__header">
        <div class="pp-subject-shell__inner">
          <div class="pp-subject-shell__crumb">
            <span>${escapePastPapersZipHtml(meta.name)}</span>
            <span>/</span>
            <span class="pp-subject-shell__crumb-current">Past Papers</span>
          </div>
          <div class="pp-subject-shell__head">
            <div class="pp-subject-shell__meta">
              <h1 class="pp-subject-shell__title">${escapePastPapersZipHtml(meta.name)}</h1>
              <p class="pp-subject-shell__subtitle">Cambridge IGCSE${meta.code ? ` · ${escapePastPapersZipHtml(meta.code)}` : ""}</p>
            </div>
            ${embeddedGlobalBrowser ? "" : `
              <div class="pp-subject-shell__tabs">
                <button type="button" data-top-tab="syllabus" class="pp-subject-shell__tab">Syllabus</button>
                <button type="button" data-top-tab="past-papers" class="pp-subject-shell__tab is-active">Past Papers</button>
              </div>
            `}
          </div>
        </div>
      </div>
      <div class="pp-subject-shell__inner pp-subject-shell__body">
        <div class="pp-subject-empty-state">
          <p class="pp-subject-empty-copy">${escapePastPapersZipHtml(message || "Past papers for this subject are coming soon.")}</p>
        </div>
      </div>
    </div>
  `;

  shell = shadow.querySelector(embeddedSubjectTabs ? ".subject-section-shell" : ".pp-subject-shell");
  syllabusTabButton = shadow.querySelector('[data-top-tab="syllabus"]');
  pastPapersTabButton = shadow.querySelector('[data-top-tab="past-papers"]');
  syncHostTheme();

  function setShellTab(nextTab){
    if(syllabusTabButton){
      syllabusTabButton.classList.toggle("is-active", nextTab !== "past-papers");
    }
    if(pastPapersTabButton){
      pastPapersTabButton.classList.toggle("is-active", nextTab === "past-papers");
    }
    applyShellTabVisualState();
  }

  function syncShellTabWithActivePanel(){
    if(!tabsRoot) return;
    const activeTab = tabsRoot.querySelector('[role="tab"][aria-selected="true"]');
    const activePanelId = activeTab ? String(activeTab.getAttribute("aria-controls") || "") : "";
    setShellTab(activePanelId === "tab-syl" ? "syllabus" : "past-papers");
  }

  if(tabsRoot){
    if(container.__ppSubjectTabSyncHandler){
      tabsRoot.removeEventListener("igcsefy:subject-tab-change", container.__ppSubjectTabSyncHandler);
    }
    container.__ppSubjectTabSyncHandler = syncShellTabWithActivePanel;
    tabsRoot.addEventListener("igcsefy:subject-tab-change", syncShellTabWithActivePanel);
    syncShellTabWithActivePanel();
  }

  if(syllabusTabButton){
    syllabusTabButton.addEventListener("click", () => {
      if(tabsRoot && typeof setActiveSubjectTab === "function"){
        setActiveSubjectTab(tabsRoot, "tab-syl");
        return;
      }
      const level = typeof ensureIgcsefyDataStore === "function"
        ? ensureIgcsefyDataStore().getSubjectLevel({ slug: meta.slug, code: meta.code, name: meta.name }, "core")
        : "core";
      window.location.href = `/subjects/${meta.slug}/?level=${encodeURIComponent(level)}`;
    });
  }

  if(pastPapersTabButton){
    pastPapersTabButton.addEventListener("click", () => {
      if(tabsRoot && typeof setActiveSubjectTab === "function"){
        setActiveSubjectTab(tabsRoot, "tab-pp");
      }
    });
  }
}

async function renderSubjectPastPapersZip(container, subjectSlug, options = {}){
  const embeddedGlobalBrowser = !!(options && options.embeddedGlobalBrowser);
  const model = buildSubjectPastPapersZipModel(subjectSlug);
  const dataStore = ensureIgcsefyDataStore();
  container.__ppActiveSubject = subjectSlug;
  container.__ppActivateYear = null;
  container.__ppRevealTrackKey = null;
  if(container.__ppThemeObserver){
    container.__ppThemeObserver.disconnect();
    container.__ppThemeObserver = null;
  }
  if(!model){
    renderUnavailableSubjectPastPapersZip(
      container,
      subjectSlug,
      options,
      "Past papers for this subject are coming soon."
    );
    return;
  }

  if(!model.years.length){
    renderUnavailableSubjectPastPapersZip(
      container,
      subjectSlug,
      options,
      "No past paper files are available for this subject yet."
    );
    return;
  }

  try{
    const subjectRef = {
      code: model.cfg.code,
      slug: subjectSlug,
      name: model.cfg.name
    };

    const getPreferredGroupId = () => {
      const preferredLevel = dataStore.getSubjectLevel(subjectRef, model.defaultGroupId || 'core');
      return model.visibleGroups.some(group => group.id === preferredLevel)
        ? preferredLevel
        : model.defaultGroupId;
    };

    const cssText = await loadSubjectPastPapersZipCss();
    const tabsRoot = container.closest("[data-tabs]");
    const embeddedSubjectTabs = !embeddedGlobalBrowser && !!tabsRoot;
    const navigationIntent = typeof readSubjectNavigationIntent === "function"
      ? readSubjectNavigationIntent()
      : null;
    const initialSubjectDestination = typeof resolveInitialSubjectDestination === "function"
      ? resolveInitialSubjectDestination(navigationIntent)
      : "syllabus";

    container.innerHTML = "";
    const host = document.createElement("div");
    host.className = "past-papers-zip-host";
    host.style.display = "block";
    container.appendChild(host);
    let shell = null;
    let body = null;

    const resolveShellTheme = () => {
      const root = document.documentElement;
      return root.dataset.theme === "light"
        || root.classList.contains("light")
        || (!root.classList.contains("dark") && root.dataset.theme !== "dark")
        ? "light"
        : "dark";
    };

    const syncHostTheme = () => {
      const resolvedTheme = resolveShellTheme();
      host.dataset.theme = resolvedTheme;
      if(shell){
        shell.dataset.theme = resolvedTheme;
        applyShellTabVisualState();
      }
      if(body && body.childElementCount){
        renderBody();
      }
    };
    syncHostTheme();
    const themeObserver = new MutationObserver(syncHostTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });
    container.__ppThemeObserver = themeObserver;

    const shadow = host.attachShadow({ mode: "open" });
    container.__ppSearchRoot = shadow;
    shadow.innerHTML = `
      <style>
        ${cssText}
        ${embeddedSubjectTabs ? `
        .subject-section-shell{
          background:#0A0A0B;
          color:#fff;
        }
        .subject-section-shell__header{
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .subject-section-shell__inner{
          width:100%;
          max-width:56rem;
          margin:0 auto;
          padding:0 1.5rem;
        }
        .subject-section-shell__header .subject-section-shell__inner{
          padding-top:2rem;
          padding-bottom:2rem;
        }
        .subject-section-shell__body{
          padding-top:2rem;
          padding-bottom:4rem;
        }
        .subject-section-shell__crumb{
          margin:0 0 1.25rem;
          display:flex;
          align-items:center;
          gap:.5rem;
          font-size:.875rem;
          color:rgba(255,255,255,.3);
          letter-spacing:.01em;
        }
        .subject-section-shell__crumb-current{
          color:rgba(255,255,255,.6);
        }
        .subject-section-shell__head{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          flex-wrap:wrap;
          gap:1rem;
        }
        .subject-section-shell__meta{
          min-width:min(100%,24rem);
        }
        .subject-section-shell__title{
          margin:0;
          font-size:1.5rem;
          line-height:2rem;
          letter-spacing:-.025em;
          font-weight:600;
        }
        .subject-section-shell__subtitle{
          margin:.25rem 0 0;
          font-size:.875rem;
          color:rgba(255,255,255,.4);
        }
        .subject-section-shell__tabs{
          display:flex;
          gap:.25rem;
          padding:.25rem;
          border-radius:9999px;
          background:rgba(255,255,255,.05);
        }
        .subject-section-shell__tab{
          appearance:none;
          min-height:auto;
          padding:.5rem 1.25rem;
          border:0;
          border-radius:9999px;
          background:transparent;
          color:rgba(255,255,255,.5);
          font:inherit;
          font-size:.875rem;
          font-weight:500;
          line-height:1.25rem;
          transition:background-color .2s ease,color .2s ease,box-shadow .2s ease;
        }
        .subject-section-shell__tab:hover{
          color:rgba(255,255,255,.8);
        }
        .subject-section-shell__tab.is-active{
          background:#fff;
          color:#000;
          box-shadow:0 1px 3px rgba(0,0,0,.1);
        }
        .subject-section-shell__content{
          width:100%;
          margin-top:2rem;
        }
        .subject-section-shell[data-theme="light"]{
          background:#F1EFE7;
          color:#000000;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__header{
          border-bottom-color:#E9E3D8;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__crumb,
        .subject-section-shell[data-theme="light"] .subject-section-shell__subtitle{
          color:#666666;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__crumb-current,
        .subject-section-shell[data-theme="light"] .subject-section-shell__title{
          color:#000000;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__tabs{
          background:#FFFFFF;
          box-shadow:0 0 0 1px #E9E3D8 inset;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__tab{
          color:#666666;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__tab:hover{
          color:#000000;
        }
        .subject-section-shell[data-theme="light"] .subject-section-shell__tab.is-active{
          background:#000000;
          color:#FFFFFF;
          box-shadow:none;
        }
        @media (max-width:640px){
          .subject-section-shell__inner{
            padding:0 1rem;
          }
          .subject-section-shell__header .subject-section-shell__inner{
            padding-top:1.5rem;
            padding-bottom:1.5rem;
          }
        }
        ` : ""}
        :host{
          display:block;
        }
        .pp-subject-shell{
          --pp-jump-text: rgba(255,255,255,.97);
          --pp-jump-text-soft: rgba(255,255,255,.72);
          --pp-jump-glow: 0 0 14px rgba(255,255,255,.12);
          --pp-jump-glow-soft: 0 0 12px rgba(255,255,255,.08);
          --pp-jump-duration: 2800ms;
          --pp-surface-motion: 180ms cubic-bezier(.22, 1, .36, 1);
          --pp-panel-motion: 300ms cubic-bezier(.22, 1, .36, 1);
          min-height:${embeddedGlobalBrowser ? "0" : "100vh"};
          background:${embeddedGlobalBrowser ? "transparent" : "#0A0A0B"};
          color:#fff;
        }
        .pp-subject-shell__header{
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .pp-subject-shell__inner{
          max-width:${embeddedGlobalBrowser ? "none" : "56rem"};
          width:100%;
          margin:0 auto;
          padding:0 1.5rem;
        }
        .pp-subject-shell__header .pp-subject-shell__inner{
          padding-top:${embeddedGlobalBrowser ? "1.35rem" : "2rem"};
          padding-bottom:${embeddedGlobalBrowser ? "1.35rem" : "2rem"};
        }
        .pp-subject-shell__body{
          padding-top:${embeddedGlobalBrowser ? "1.35rem" : "2rem"};
          padding-bottom:${embeddedGlobalBrowser ? "1.5rem" : "4rem"};
        }
        .pp-subject-shell__crumb{
          margin:0 0 1.25rem;
          display:flex;
          align-items:center;
          gap:.5rem;
          font-size:.875rem;
          color:rgba(255,255,255,.3);
          letter-spacing:.01em;
        }
        .pp-subject-shell__crumb-current{
          color:rgba(255,255,255,.6);
        }
        .pp-subject-shell__head{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          flex-wrap:wrap;
          gap:1rem;
        }
        .pp-subject-shell__meta{
          min-width:min(100%,24rem);
        }
        .pp-subject-shell__title{
          margin:0;
          font-size:1.5rem;
          line-height:2rem;
          letter-spacing:-.025em;
          font-weight:600;
        }
        .pp-subject-shell__subtitle{
          margin:.25rem 0 0;
          font-size:.875rem;
          color:rgba(255,255,255,.4);
        }
        .pp-subject-body-copy{
          margin:0 0 1.5rem;
          font-size:.875rem;
          line-height:1.6;
          letter-spacing:.01em;
          color:rgba(255,255,255,.3);
        }
        .pp-subject-shell__tabs{
          display:flex;
          gap:.25rem;
          padding:.25rem;
          border-radius:9999px;
          background:rgba(255,255,255,.05);
        }
        .pp-subject-shell__tab{
          appearance:none;
          min-height:auto;
          padding:.5rem 1.25rem;
          border:0;
          border-radius:9999px;
          background:transparent;
          color:rgba(255,255,255,.5);
          font:inherit;
          font-size:.875rem;
          font-weight:500;
          line-height:1.25rem;
          transition:all .2s ease;
        }
        .pp-subject-shell__tab:hover{
          color:rgba(255,255,255,.8);
        }
        .pp-subject-shell__tab.is-active{
          background:#fff;
          color:#000;
          box-shadow:0 1px 3px rgba(0,0,0,.1);
        }
        .pp-subject-filters{
          display:flex;
          flex-direction:column;
          gap:1rem;
          margin:0 0 1.5rem;
        }
        .pp-subject-filter-group{
          display:inline-flex;
          align-items:center;
          gap:.25rem;
          align-self:flex-start;
          padding:.25rem;
          border-radius:1rem;
          background:#111;
          border:1px solid #252525;
        }
        .pp-subject-filter-button{
          appearance:none;
          min-height:auto;
          padding:.375rem 1rem;
          border:0;
          border-radius:.85rem;
          background:transparent;
          color:rgba(255,255,255,.35);
          font:inherit;
          font-size:.875rem;
          font-weight:500;
          line-height:1.25rem;
          transition:all .2s ease;
        }
        .pp-subject-filter-button:hover{
          color:rgba(255,255,255,.65);
        }
        .pp-subject-filter-button.is-active{
          background:#fff;
          color:#000;
          box-shadow:0 1px 3px rgba(0,0,0,.1);
        }
        .pp-subject-session-card{
          position:relative;
          border-radius:1.5rem;
          background:#111;
          border:1px solid #252525;
          box-shadow:0 18px 40px rgba(0,0,0,.6);
          transition:background-color .3s ease,box-shadow .3s ease,border-color .3s ease;
        }
        .pp-subject-session-card:hover{
          background:#161616;
          border-color:#2e2e2e;
        }
        .pp-subject-session-card.is-open{
          background:#161616;
          border-color:#2e2e2e;
          box-shadow:0 18px 40px rgba(0,0,0,.6);
        }
        .pp-subject-session-dot{
          background:rgba(255,255,255,.2);
          transition:transform .3s ease,background-color .3s ease;
        }
        .pp-subject-session-card:hover .pp-subject-session-dot{
          background:rgba(255,255,255,.35);
        }
        .pp-subject-session-card.is-open .pp-subject-session-dot{
          background:#fff;
          transform:scale(1.1);
        }
        .pp-subject-session-title{
          color:rgba(255,255,255,.5);
          transition:color .2s ease;
        }
        .pp-subject-session-card:hover .pp-subject-session-title{
          color:rgba(255,255,255,.75);
        }
        .pp-subject-session-card.is-open .pp-subject-session-title{
          color:#fff;
        }
        .pp-subject-session-chevron{
          transition:transform .25s ease;
        }
        .pp-subject-session-card.is-open .pp-subject-session-chevron{
          transform:rotate(90deg);
        }
        .pp-subject-session-panel{
          display:grid;
          grid-template-rows:0fr;
          opacity:0;
          visibility:hidden;
          pointer-events:none;
          transition:
            grid-template-rows var(--pp-panel-motion),
            opacity .2s ease,
            visibility 0s linear .3s;
        }
        .pp-subject-session-panel.is-open{
          grid-template-rows:1fr;
          opacity:1;
          visibility:visible;
          pointer-events:auto;
          transition:
            grid-template-rows var(--pp-panel-motion),
            opacity .2s ease,
            visibility 0s;
        }
        .pp-subject-session-panel__inner{
          min-height:0;
          overflow:hidden;
          transform:translateY(-4px);
          transition:transform var(--pp-panel-motion);
        }
        .pp-subject-session-panel.is-open .pp-subject-session-panel__inner{
          transform:translateY(0);
        }
        .pp-paper-row{
          position:relative;
          border-radius:1rem;
          overflow:hidden;
          transition:background-color .2s ease;
        }
        .pp-paper-row:hover{
          background:transparent;
        }
        .pp-paper-toggle{
          background:transparent;
          transition:background-color .2s ease;
        }
        .pp-paper-toggle:hover{
          background:rgba(255,255,255,.03);
        }
        .pp-paper-row.is-open .pp-paper-toggle{
          background:rgba(255,255,255,.05);
        }
        .pp-paper-title{
          color:rgba(255,255,255,.5);
          transition:color .15s ease;
        }
        .pp-paper-toggle:hover .pp-paper-title{
          color:rgba(255,255,255,.7);
        }
        .pp-paper-row.is-open .pp-paper-title{
          color:rgba(255,255,255,.85);
        }
        .pp-paper-chevron{
          transition:transform .2s ease;
        }
        .pp-paper-row.is-open .pp-paper-chevron{
          transform:rotate(90deg);
        }
        .pp-paper-panel{
          display:grid;
          grid-template-rows:0fr;
          opacity:0;
          visibility:hidden;
          pointer-events:none;
          transition:
            grid-template-rows var(--pp-panel-motion),
            opacity .2s ease,
            visibility 0s linear .3s;
        }
        .pp-paper-panel.is-open{
          grid-template-rows:1fr;
          opacity:1;
          visibility:visible;
          pointer-events:auto;
          transition:
            grid-template-rows var(--pp-panel-motion),
            opacity .2s ease,
            visibility 0s;
        }
        .pp-paper-panel__inner{
          min-height:0;
          overflow:hidden;
          transform:translateY(-4px);
          transition:transform var(--pp-panel-motion);
        }
        .pp-paper-panel.is-open .pp-paper-panel__inner{
          transform:translateY(0);
        }
        .pp-variant-item{
          position:relative;
          border-radius:1rem;
          background:transparent;
          overflow:visible;
          isolation:isolate;
          box-shadow:none;
          transition:background-color .18s ease;
        }
        .pp-variant-clear{
          opacity:0;
          transform:translateX(-4px);
          pointer-events:none;
          transition:opacity .2s ease,transform .2s ease,color .15s ease;
        }
        .pp-variant-clear.is-visible{
          opacity:1;
          transform:translateX(0);
          pointer-events:auto;
        }
        .pp-variant-item.igcsefy-search-hit{
          background:transparent;
          box-shadow:none;
        }
        .pp-variant-copy,
        .pp-variant-label,
        .pp-variant-file{
          position:relative;
          z-index:0;
        }
        .pp-variant-file{
          display:inline-flex;
          align-items:center;
          justify-content:center;
        }
        .pp-variant-label,
        .pp-variant-file{
          transition:color var(--pp-surface-motion),text-shadow var(--pp-surface-motion);
        }
        .pp-variant-copy::before{
          content:'';
          position:absolute;
          inset:-.35rem -.55rem;
          border-radius:999px;
          background:radial-gradient(ellipse at center, rgba(255,255,255,.14) 0%, rgba(255,255,255,.08) 42%, transparent 74%);
          filter:blur(10px);
          opacity:0;
          transition:opacity 220ms ease;
          pointer-events:none;
          z-index:-1;
        }
        @keyframes ppSearchSpotlight{
          0%{
            opacity:0;
            transform:scale(.96);
          }
          12%{
            opacity:.08;
            transform:scale(.985);
          }
          28%{
            opacity:.46;
            transform:scale(1);
          }
          44%{
            opacity:.76;
            transform:scale(1.012);
          }
          80%{
            opacity:.66;
            transform:scale(1.018);
          }
          100%{
            opacity:0;
            transform:scale(1.03);
          }
        }
        @keyframes ppSearchVariantLabel{
          0%{
            color:rgba(255,255,255,.4);
            text-shadow:0 0 0 rgba(255,255,255,0);
          }
          14%{
            color:rgba(255,255,255,.5);
            text-shadow:0 0 6px rgba(255,255,255,.03);
          }
          30%{
            color:rgba(255,255,255,.84);
            text-shadow:0 0 9px rgba(255,255,255,.07);
          }
          76%{
            color:var(--pp-jump-text);
            text-shadow:var(--pp-jump-glow);
          }
          100%{
            color:rgba(255,255,255,.4);
            text-shadow:0 0 0 rgba(255,255,255,0);
          }
        }
        .pp-variant-item.igcsefy-search-hit .pp-variant-label,
        .pp-variant-item.igcsefy-search-hit .pp-variant-file{
          animation:ppSearchVariantLabel var(--pp-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
        }
        .pp-variant-item.igcsefy-search-hit .pp-variant-copy::before{
          animation:ppSearchSpotlight var(--pp-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
        }
        @media (prefers-reduced-motion: reduce){
          .pp-variant-label,
          .pp-variant-file,
          .pp-variant-copy::before{
            transition:none;
          }
        }
        .pp-subject-search{
          position:relative;
          width:min(100%, ${embeddedGlobalBrowser ? "44rem" : "28rem"});
          margin:0 0 2rem;
          z-index:14;
        }
        .pp-subject-search [data-role="search-input"]{
          width:100%;
          min-width:0;
          padding:.84rem ${embeddedGlobalBrowser ? "2.95rem" : "1rem"} .84rem 2.25rem;
          border:1px solid #252525;
          border-radius:1.5rem;
          background:#111;
          color:#fff;
          font-size:${embeddedGlobalBrowser ? ".9rem" : ".9rem"};
          line-height:1.35;
          transition:border-color .2s ease, background-color .2s ease;
        }
        .pp-subject-search [data-role="search-input"]::placeholder{
          color:rgba(255,255,255,.25);
        }
        .pp-subject-search [data-role="search-input"]:focus{
          outline:none;
        }
        .pp-subject-search [data-role="search-input"]:focus-visible{
          border-color:#3a3a3a;
          background:#161616;
        }
        .pp-subject-search__clear{
          position:absolute;
          right:.7rem;
          top:50%;
          transform:translateY(-50%);
          width:1.5rem;
          height:1.5rem;
          border:0;
          border-radius:9999px;
          background:transparent;
          color:rgba(255,255,255,.38);
          font:inherit;
          font-size:.95rem;
          cursor:pointer;
          transition:color .2s ease;
        }
        .pp-subject-search__clear:hover{
          color:rgba(255,255,255,.72);
        }
        .pp-subject-search__clear[hidden]{
          display:none;
        }
        .pp-subject-search__results{
          position:absolute;
          top:calc(100% + .72rem);
          left:0;
          right:0;
          display:grid;
          gap:.35rem;
          max-height:min(52vh,26rem);
          overflow-x:hidden;
          overflow-y:auto;
          overscroll-behavior:contain;
          -webkit-overflow-scrolling:touch;
          scrollbar-gutter:stable;
          scrollbar-width:thin;
          scrollbar-color:rgba(255,255,255,.16) transparent;
          padding:.42rem;
          border-radius:1.45rem;
          border:1px solid #252525;
          background:#111;
          box-shadow:
            0 28px 80px rgba(0,0,0,.38);
          backdrop-filter:blur(24px) saturate(1.8);
          -webkit-backdrop-filter:blur(24px) saturate(1.8);
        }
        .pp-subject-search__results::-webkit-scrollbar{
          width:10px;
        }
        .pp-subject-search__results::-webkit-scrollbar-track{
          background:transparent;
        }
        .pp-subject-search__results::-webkit-scrollbar-thumb{
          background:rgba(255,255,255,.14);
          border:2px solid transparent;
          border-radius:9999px;
          background-clip:padding-box;
        }
        .pp-subject-search__results::-webkit-scrollbar-thumb:hover{
          background:rgba(255,255,255,.22);
          background-clip:padding-box;
        }
        .pp-subject-search__results[hidden]{
          display:none;
        }
        .pp-search-result{
          width:100%;
          display:block;
          padding:.85rem .95rem;
          border:0;
          border-radius:1.05rem;
          background:rgba(255,255,255,.015);
          color:inherit;
          text-align:left;
          cursor:pointer;
          transition:background-color .16s ease, transform .16s ease, box-shadow .16s ease;
        }
        .pp-search-result:hover,
        .pp-search-result.is-active{
          background:rgba(255,255,255,.085);
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);
          transform:translateY(-1px);
        }
        .pp-search-result-title{
          display:block;
          color:#f5f5f5;
          font-size:.88rem;
          font-weight:600;
          line-height:1.3;
          letter-spacing:-.015em;
        }
        .pp-search-result-meta,
        .pp-search-empty{
          display:block;
          margin-top:.28rem;
          color:rgba(245,245,245,.52);
          font-size:.72rem;
          line-height:1.35;
        }
        .pp-search-empty{
          padding:.65rem .8rem;
        }
        @media (prefers-reduced-motion: reduce){
          .pp-subject-session-card,
          .pp-subject-session-dot,
          .pp-subject-session-title,
          .pp-subject-session-chevron,
          .pp-subject-session-panel,
          .pp-paper-toggle,
          .pp-paper-title,
          .pp-paper-chevron,
          .pp-paper-panel{
            transition:none;
          }
        }
        :host([data-theme="light"]) .pp-subject-shell,
        :host-context(html.light) .pp-subject-shell{
          --pp-jump-text:#000000;
          --pp-jump-text-soft:#666666;
          --pp-jump-glow:0 0 14px rgba(0,0,0,.08);
          --pp-jump-glow-soft:0 0 12px rgba(0,0,0,.05);
          background:${embeddedGlobalBrowser ? "transparent" : "#F1EFE7"};
          color:#000000;
        }
        :host([data-theme="light"]) .pp-subject-shell__header,
        :host-context(html.light) .pp-subject-shell__header{
          border-bottom-color:#E9E3D8;
        }
        :host([data-theme="light"]) .pp-subject-shell__title,
        :host([data-theme="light"]) .pp-search-result-title,
        :host-context(html.light) .pp-subject-shell__title,
        :host-context(html.light) .pp-search-result-title{
          color:#000000;
        }
        :host([data-theme="light"]) .pp-subject-shell__crumb,
        :host([data-theme="light"]) .pp-subject-shell__crumb-current,
        :host([data-theme="light"]) .pp-subject-shell__subtitle,
        :host([data-theme="light"]) .pp-subject-body-copy,
        :host([data-theme="light"]) .pp-subject-session-code,
        :host([data-theme="light"]) .pp-subject-session-meta,
        :host([data-theme="light"]) .pp-paper-meta,
        :host([data-theme="light"]) .pp-paper-detail,
        :host([data-theme="light"]) .pp-subject-search__clear,
        :host([data-theme="light"]) .pp-search-result-meta,
        :host([data-theme="light"]) .pp-search-empty,
        :host([data-theme="light"]) .pp-variant-label,
        :host([data-theme="light"]) .pp-variant-clear,
        :host([data-theme="light"]) .pp-subject-session-chevron,
        :host([data-theme="light"]) .pp-paper-chevron,
        :host-context(html.light) .pp-subject-shell__crumb,
        :host-context(html.light) .pp-subject-shell__crumb-current,
        :host-context(html.light) .pp-subject-shell__subtitle,
        :host-context(html.light) .pp-subject-body-copy,
        :host-context(html.light) .pp-subject-session-code,
        :host-context(html.light) .pp-subject-session-meta,
        :host-context(html.light) .pp-paper-meta,
        :host-context(html.light) .pp-paper-detail,
        :host-context(html.light) .pp-subject-search__clear,
        :host-context(html.light) .pp-search-result-meta,
        :host-context(html.light) .pp-search-empty,
        :host-context(html.light) .pp-variant-label,
        :host-context(html.light) .pp-variant-clear,
        :host-context(html.light) .pp-subject-session-chevron,
        :host-context(html.light) .pp-paper-chevron{
          color:#666666;
        }
        :host([data-theme="light"]) .pp-subject-shell__tabs,
        :host-context(html.light) .pp-subject-shell__tabs,
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__tabs{
          background:#FFFFFF;
          box-shadow:0 0 0 1px #E9E3D8 inset;
        }
        :host([data-theme="light"]) .pp-subject-shell__tab,
        :host-context(html.light) .pp-subject-shell__tab,
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__tab{
          color:#666666;
        }
        :host([data-theme="light"]) .pp-subject-shell__tab:hover,
        :host([data-theme="light"]) .pp-paper-row.is-open .pp-paper-title,
        :host([data-theme="light"]) .pp-variant-file:hover,
        :host([data-theme="light"]) .pp-subject-search__clear:hover,
        :host-context(html.light) .pp-subject-shell__tab:hover,
        :host-context(html.light) .pp-paper-row.is-open .pp-paper-title,
        :host-context(html.light) .pp-variant-file:hover,
        :host-context(html.light) .pp-subject-search__clear:hover,
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__tab:hover{
          color:#000000;
        }
        :host([data-theme="light"]) .pp-subject-shell__tab.is-active,
        :host-context(html.light) .pp-subject-shell__tab.is-active,
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__tab.is-active{
          background:#000000;
          color:#FFFFFF;
          box-shadow:none;
        }
        :host([data-theme="light"]) .pp-subject-filter-group,
        :host-context(html.light) .pp-subject-filter-group,
        .pp-subject-shell[data-theme="light"] .pp-subject-filter-group{
          background:#FFFFFF !important;
          border-color:#E9E3D8 !important;
          box-shadow:none;
          padding:.25rem;
          gap:.25rem;
        }
        :host([data-theme="light"]) .pp-subject-filter-button,
        :host-context(html.light) .pp-subject-filter-button,
        .pp-subject-shell[data-theme="light"] .pp-subject-filter-button{
          color:#666666 !important;
          background:transparent !important;
        }
        :host([data-theme="light"]) .pp-subject-filter-button:hover,
        :host-context(html.light) .pp-subject-filter-button:hover,
        .pp-subject-shell[data-theme="light"] .pp-subject-filter-button:hover{
          background:rgba(0,0,0,.05) !important;
          color:#000000 !important;
        }
        :host([data-theme="light"]) .pp-subject-filter-button.is-active,
        :host-context(html.light) .pp-subject-filter-button.is-active,
        .pp-subject-shell[data-theme="light"] .pp-subject-filter-button.is-active{
          background:#000000 !important;
          color:#FFFFFF !important;
          box-shadow:none;
        }
        :host([data-theme="light"]) .pp-subject-session-card,
        :host-context(html.light) .pp-subject-session-card{
          background:#FFFFFF;
          border-color:#E9E3D8;
          box-shadow:0 18px 40px rgba(0,0,0,.08);
        }
        :host([data-theme="light"]) .pp-subject-session-card:hover,
        :host([data-theme="light"]) .pp-subject-session-card.is-open,
        :host-context(html.light) .pp-subject-session-card:hover,
        :host-context(html.light) .pp-subject-session-card.is-open{
          background:#FFFFFF;
          border-color:#E9E3D8;
          box-shadow:0 18px 40px rgba(0,0,0,.08);
        }
        :host([data-theme="light"]) .pp-subject-session-dot,
        :host-context(html.light) .pp-subject-session-dot{
          background:rgba(0,0,0,.18);
        }
        :host([data-theme="light"]) .pp-subject-session-card:hover .pp-subject-session-dot,
        :host-context(html.light) .pp-subject-session-card:hover .pp-subject-session-dot{
          background:rgba(0,0,0,.35);
        }
        :host([data-theme="light"]) .pp-subject-session-card.is-open .pp-subject-session-dot,
        :host-context(html.light) .pp-subject-session-card.is-open .pp-subject-session-dot{
          background:#000000;
        }
        :host([data-theme="light"]) .pp-subject-session-title,
        :host([data-theme="light"]) .pp-paper-title,
        :host-context(html.light) .pp-subject-session-title,
        :host-context(html.light) .pp-paper-title{
          color:#000000;
        }
        :host([data-theme="light"]) .pp-subject-session-card:hover .pp-subject-session-title,
        :host([data-theme="light"]) .pp-subject-session-card.is-open .pp-subject-session-title,
        :host([data-theme="light"]) .pp-paper-toggle:hover .pp-paper-title,
        :host-context(html.light) .pp-subject-session-card:hover .pp-subject-session-title,
        :host-context(html.light) .pp-subject-session-card.is-open .pp-subject-session-title,
        :host-context(html.light) .pp-paper-toggle:hover .pp-paper-title{
          color:#000000;
        }
        :host([data-theme="light"]) .pp-paper-toggle:hover,
        :host-context(html.light) .pp-paper-toggle:hover{
          background:rgba(0,0,0,.03);
        }
        :host([data-theme="light"]) .pp-paper-row.is-open .pp-paper-toggle,
        :host-context(html.light) .pp-paper-row.is-open .pp-paper-toggle{
          background:rgba(0,0,0,.04);
        }
        :host([data-theme="light"]) .pp-variant-copy::before,
        :host-context(html.light) .pp-variant-copy::before{
          background:radial-gradient(ellipse at center, rgba(0,0,0,.08) 0%, rgba(0,0,0,.04) 42%, transparent 74%);
        }
        :host([data-theme="light"]) .pp-subject-search svg,
        :host-context(html.light) .pp-subject-search svg{
          color:#666666;
        }
        :host([data-theme="light"]) .pp-subject-search [data-role="search-input"],
        :host-context(html.light) .pp-subject-search [data-role="search-input"]{
          background:#FFFFFF !important;
          border-color:#E9E3D8 !important;
          color:#000000 !important;
        }
        :host([data-theme="light"]) .pp-subject-search [data-role="search-input"]::placeholder,
        :host-context(html.light) .pp-subject-search [data-role="search-input"]::placeholder{
          color:#666666;
        }
        :host([data-theme="light"]) .pp-subject-search [data-role="search-input"]:focus-visible,
        :host-context(html.light) .pp-subject-search [data-role="search-input"]:focus-visible{
          border-color:#000000 !important;
          background:#FFFFFF !important;
        }
        :host([data-theme="light"]) .pp-subject-search__results,
        :host-context(html.light) .pp-subject-search__results{
          border-color:#E9E3D8;
          background:#FFFFFF;
          box-shadow:0 28px 80px rgba(0,0,0,.08);
          scrollbar-color:rgba(0,0,0,.18) transparent;
        }
        :host([data-theme="light"]) .pp-subject-search__results::-webkit-scrollbar-thumb,
        :host-context(html.light) .pp-subject-search__results::-webkit-scrollbar-thumb{
          background:rgba(0,0,0,.18);
          background-clip:padding-box;
        }
        :host([data-theme="light"]) .pp-subject-search__results::-webkit-scrollbar-thumb:hover,
        :host-context(html.light) .pp-subject-search__results::-webkit-scrollbar-thumb:hover{
          background:rgba(0,0,0,.28);
          background-clip:padding-box;
        }
        :host([data-theme="light"]) .pp-search-result,
        :host-context(html.light) .pp-search-result{
          background:rgba(255,255,255,.96);
        }
        :host([data-theme="light"]) .pp-search-result:hover,
        :host([data-theme="light"]) .pp-search-result.is-active,
        :host-context(html.light) .pp-search-result:hover,
        :host-context(html.light) .pp-search-result.is-active{
          background:rgba(0,0,0,.04);
          box-shadow:inset 0 0 0 1px rgba(0,0,0,.04);
        }
        :host([data-theme="light"]) .pp-variant-status-pill,
        :host-context(html.light) .pp-variant-status-pill{
          background:transparent;
          border:0;
          color:#666666 !important;
          box-shadow:none;
        }
        :host([data-theme="light"]) .pp-variant-status-pill:hover,
        :host-context(html.light) .pp-variant-status-pill:hover{
          background:transparent;
          color:#000000 !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill__dot,
        :host-context(html.light) .pp-variant-status-pill__dot{
          background:rgba(0,0,0,.16) !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill[aria-pressed="true"][data-status-value="in_progress"],
        :host-context(html.light) .pp-variant-status-pill[aria-pressed="true"][data-status-value="in_progress"]{
          background:rgba(245,158,11,.12);
          border-color:rgba(217,119,6,.28);
          color:#B45309 !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill[aria-pressed="true"][data-status-value="done"],
        :host-context(html.light) .pp-variant-status-pill[aria-pressed="true"][data-status-value="done"]{
          background:rgba(16,185,129,.12);
          border-color:rgba(16,185,129,.24);
          color:#047857 !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill[aria-pressed="true"][data-status-value="reviewed"],
        :host-context(html.light) .pp-variant-status-pill[aria-pressed="true"][data-status-value="reviewed"]{
          background:rgba(56,189,248,.12);
          border-color:rgba(56,189,248,.26);
          color:#0369A1 !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill[aria-pressed="true"][data-status-value="in_progress"] .pp-variant-status-pill__dot,
        :host-context(html.light) .pp-variant-status-pill[aria-pressed="true"][data-status-value="in_progress"] .pp-variant-status-pill__dot{
          background:#D97706 !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill[aria-pressed="true"][data-status-value="done"] .pp-variant-status-pill__dot,
        :host-context(html.light) .pp-variant-status-pill[aria-pressed="true"][data-status-value="done"] .pp-variant-status-pill__dot{
          background:#10B981 !important;
        }
        :host([data-theme="light"]) .pp-variant-status-pill[aria-pressed="true"][data-status-value="reviewed"] .pp-variant-status-pill__dot,
        :host-context(html.light) .pp-variant-status-pill[aria-pressed="true"][data-status-value="reviewed"] .pp-variant-status-pill__dot{
          background:#38BDF8 !important;
        }
        :host([data-theme="light"]) .pp-variant-clear:hover,
        :host-context(html.light) .pp-variant-clear:hover{
          color:#000000;
        }
        :host([data-theme="light"]) .pp-variant-file,
        :host([data-theme="light"]) .pp-subject-session-panel__inner a,
        :host-context(html.light) .pp-variant-file,
        :host-context(html.light) .pp-subject-session-panel__inner a{
          background:#FFFFFF;
          border:1px solid #E9E3D8;
          color:#666666 !important;
        }
        :host([data-theme="light"]) .pp-variant-file:hover,
        :host([data-theme="light"]) .pp-subject-session-panel__inner a:hover,
        :host-context(html.light) .pp-variant-file:hover,
        :host-context(html.light) .pp-subject-session-panel__inner a:hover{
          background:rgba(0,0,0,.04);
          border-color:#E9E3D8;
          color:#000000 !important;
        }
        .pp-subject-shell[data-theme="light"]{
          --pp-jump-text:#000000;
          --pp-jump-text-soft:#666666;
          --pp-jump-glow:0 0 14px rgba(0,0,0,.08);
          --pp-jump-glow-soft:0 0 12px rgba(0,0,0,.05);
          background:${embeddedGlobalBrowser ? "transparent" : "#F1EFE7"};
          color:#000000;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__header{
          border-bottom-color:#E9E3D8;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__title,
        .pp-subject-shell[data-theme="light"] .pp-search-result-title,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-title,
        .pp-subject-shell[data-theme="light"] .pp-paper-title{
          color:#000000;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__crumb,
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__crumb-current,
        .pp-subject-shell[data-theme="light"] .pp-subject-shell__subtitle,
        .pp-subject-shell[data-theme="light"] .pp-subject-body-copy,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-code,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-meta,
        .pp-subject-shell[data-theme="light"] .pp-paper-meta,
        .pp-subject-shell[data-theme="light"] .pp-paper-detail,
        .pp-subject-shell[data-theme="light"] .pp-subject-search__clear,
        .pp-subject-shell[data-theme="light"] .pp-search-result-meta,
        .pp-subject-shell[data-theme="light"] .pp-search-empty,
        .pp-subject-shell[data-theme="light"] .pp-variant-label,
        .pp-subject-shell[data-theme="light"] .pp-variant-clear,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-chevron,
        .pp-subject-shell[data-theme="light"] .pp-paper-chevron{
          color:#666666;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-session-card{
          background:#FFFFFF;
          border-color:#E9E3D8;
          box-shadow:0 18px 40px rgba(0,0,0,.08);
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-session-card:hover,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-card.is-open{
          background:#FFFFFF;
          border-color:#E9E3D8;
          box-shadow:0 18px 40px rgba(0,0,0,.08);
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-session-dot{
          background:rgba(0,0,0,.18);
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-session-card:hover .pp-subject-session-dot{
          background:rgba(0,0,0,.35);
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-session-card.is-open .pp-subject-session-dot{
          background:#000000;
        }
        .pp-subject-shell[data-theme="light"] .pp-paper-toggle:hover{
          background:rgba(0,0,0,.03);
        }
        .pp-subject-shell[data-theme="light"] .pp-paper-row.is-open .pp-paper-toggle{
          background:rgba(0,0,0,.04);
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-search svg{
          color:#666666;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-search [data-role="search-input"]{
          background:#FFFFFF !important;
          border-color:#E9E3D8 !important;
          color:#000000 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-search [data-role="search-input"]::placeholder{
          color:#666666;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-search [data-role="search-input"]:focus-visible{
          border-color:#000000 !important;
          background:#FFFFFF !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-subject-search__results{
          border-color:#E9E3D8;
          background:#FFFFFF;
          box-shadow:0 28px 80px rgba(0,0,0,.08);
          scrollbar-color:rgba(0,0,0,.18) transparent;
        }
        .pp-subject-shell[data-theme="light"] .pp-search-result{
          background:rgba(255,255,255,.96);
        }
        .pp-subject-shell[data-theme="light"] .pp-search-result:hover,
        .pp-subject-shell[data-theme="light"] .pp-search-result.is-active{
          background:rgba(0,0,0,.04);
          box-shadow:inset 0 0 0 1px rgba(0,0,0,.04);
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill{
          background:transparent;
          border:0;
          color:#666666 !important;
          box-shadow:none;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill:hover{
          background:transparent;
          color:#000000 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill__dot{
          background:rgba(0,0,0,.16) !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill[aria-pressed="true"][data-status-value="in_progress"]{
          background:rgba(245,158,11,.12);
          border-color:rgba(217,119,6,.28);
          color:#B45309 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill[aria-pressed="true"][data-status-value="done"]{
          background:rgba(16,185,129,.12);
          border-color:rgba(16,185,129,.24);
          color:#047857 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill[aria-pressed="true"][data-status-value="reviewed"]{
          background:rgba(56,189,248,.12);
          border-color:rgba(56,189,248,.26);
          color:#0369A1 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill[aria-pressed="true"][data-status-value="in_progress"] .pp-variant-status-pill__dot{
          background:#D97706 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill[aria-pressed="true"][data-status-value="done"] .pp-variant-status-pill__dot{
          background:#10B981 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-status-pill[aria-pressed="true"][data-status-value="reviewed"] .pp-variant-status-pill__dot{
          background:#38BDF8 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-file,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-panel__inner a{
          background:#FFFFFF;
          border:1px solid #E9E3D8;
          color:#666666 !important;
        }
        .pp-subject-shell[data-theme="light"] .pp-variant-file:hover,
        .pp-subject-shell[data-theme="light"] .pp-subject-session-panel__inner a:hover{
          background:rgba(0,0,0,.04);
          border-color:#E9E3D8;
          color:#000000 !important;
        }
        @media (max-width:640px){
          .pp-subject-shell__inner{
            padding:0 1rem;
          }
          .pp-subject-shell__header .pp-subject-shell__inner{
            padding-top:1.5rem;
            padding-bottom:1.5rem;
          }
          .pp-subject-search{
            width:100%;
          }
        }
      </style>
      <div class="${embeddedSubjectTabs ? 'subject-section-shell pp-subject-shell' : 'pp-subject-shell'}" data-theme="${escapePastPapersZipHtml(host.dataset.theme || 'dark')}">
        <div class="${embeddedSubjectTabs ? 'subject-section-shell__header pp-subject-shell__header' : 'pp-subject-shell__header'}">
          <div class="${embeddedSubjectTabs ? 'subject-section-shell__inner pp-subject-shell__inner' : 'pp-subject-shell__inner'}">
            <div class="${embeddedSubjectTabs ? 'subject-section-shell__crumb pp-subject-shell__crumb' : 'pp-subject-shell__crumb'}">
              <span>${escapePastPapersZipHtml(model.cfg.name)}</span>
              <span>/</span>
              <span class="${embeddedSubjectTabs ? 'subject-section-shell__crumb-current pp-subject-shell__crumb-current' : 'pp-subject-shell__crumb-current'}">Past Papers</span>
            </div>
            <div class="${embeddedSubjectTabs ? 'subject-section-shell__head pp-subject-shell__head' : 'pp-subject-shell__head'}">
              <div class="${embeddedSubjectTabs ? 'subject-section-shell__meta pp-subject-shell__meta' : 'pp-subject-shell__meta'}">
                <h1 class="${embeddedSubjectTabs ? 'subject-section-shell__title pp-subject-shell__title' : 'pp-subject-shell__title'}">${escapePastPapersZipHtml(model.cfg.name)}</h1>
                <p class="${embeddedSubjectTabs ? 'subject-section-shell__subtitle pp-subject-shell__subtitle' : 'pp-subject-shell__subtitle'}">Cambridge IGCSE · ${escapePastPapersZipHtml(model.cfg.code)}</p>
              </div>
              ${embeddedGlobalBrowser ? "" : `
                <div class="${embeddedSubjectTabs ? 'subject-section-shell__tabs pp-subject-shell__tabs' : 'pp-subject-shell__tabs'}">
                  <button type="button" data-top-tab="syllabus" class="${embeddedSubjectTabs ? 'subject-section-shell__tab pp-subject-shell__tab' : 'pp-subject-shell__tab'}">Syllabus</button>
                  <button type="button" data-top-tab="past-papers" class="${embeddedSubjectTabs ? 'subject-section-shell__tab pp-subject-shell__tab is-active' : 'pp-subject-shell__tab is-active'}">Past Papers</button>
                </div>
              `}
            </div>
          </div>
        </div>
        <div class="${embeddedSubjectTabs ? 'subject-section-shell__inner subject-section-shell__body pp-subject-shell__inner pp-subject-shell__body' : 'pp-subject-shell__inner pp-subject-shell__body'}">
          <div>
            <div class="pp-subject-search">
              <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              <input data-role="search-input" type="text" placeholder="Search papers..." class="w-full rounded-2xl pl-9 ${embeddedGlobalBrowser ? "pr-11" : "pr-4"} py-2.5 text-sm text-white placeholder-white/25 focus:outline-none transition-all duration-200" style="background:#111;border:1px solid #252525;">
              ${embeddedGlobalBrowser ? `<button type="button" data-role="search-clear" class="pp-subject-search__clear" aria-label="Clear search" hidden>&times;</button>` : ""}
              ${embeddedGlobalBrowser ? `<div data-role="search-results" class="pp-subject-search__results" hidden></div>` : ""}
            </div>
            <div data-role="subject-body"></div>
          </div>
        </div>
      </div>
    `;

    shell = shadow.querySelector('.pp-subject-shell');
    const syllabusTabButton = shadow.querySelector('[data-top-tab="syllabus"]');
    const pastPapersTabButton = shadow.querySelector('[data-top-tab="past-papers"]');
    const searchInput = shadow.querySelector('[data-role="search-input"]');
    const searchClear = shadow.querySelector('[data-role="search-clear"]');
    const searchResults = shadow.querySelector('[data-role="search-results"]');
    body = shadow.querySelector('[data-role="subject-body"]');
    const state = {
      search: "",
      selectedYear: model.years[0].year,
      selectedGroupId: getPreferredGroupId(),
      openSessions: Object.create(null),
      openPapers: Object.create(null)
    };
    let suppressTrackerRender = false;
    let activeVariantHighlight = null;

    if(model.showGroupControl && (state.selectedGroupId === 'core' || state.selectedGroupId === 'extended')){
      dataStore.setSubjectLevel(subjectRef, state.selectedGroupId);
    }

    container.__ppGlobalSearchElements = embeddedGlobalBrowser && searchInput && searchClear && searchResults
      ? { input: searchInput, clear: searchClear, results: searchResults, host }
      : null;

    syncHostTheme();

    shadow.addEventListener("click", event => {
      const trigger = event.target.closest("[data-paper-file]");
      if(!trigger){
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handlePastPaperFileAction(trigger);
    });

    function applyShellTabVisualState(){
      const isLight = resolveShellTheme() === "light";
      const tabsWrap = syllabusTabButton && syllabusTabButton.parentElement;
      const tabs = [syllabusTabButton, pastPapersTabButton].filter(Boolean);
      if(tabsWrap){
        tabsWrap.style.background = isLight ? "#FFFFFF" : "rgba(255,255,255,.05)";
        tabsWrap.style.boxShadow = isLight ? "0 0 0 1px #E9E3D8 inset" : "";
      }
      tabs.forEach((button) => {
        const isActive = button.classList.contains("is-active");
        if(isLight){
          button.style.background = isActive ? "#000000" : "transparent";
          button.style.color = isActive ? "#FFFFFF" : "#666666";
          button.style.boxShadow = "none";
        }else{
          button.style.background = isActive ? "#FFFFFF" : "transparent";
          button.style.color = isActive ? "#000000" : "rgba(255,255,255,.5)";
          button.style.boxShadow = isActive ? "0 1px 3px rgba(0,0,0,.1)" : "none";
        }
      });
    }

    function setShellTab(nextTab){
      if(syllabusTabButton){
        syllabusTabButton.classList.toggle("is-active", nextTab !== "past-papers");
      }
      if(pastPapersTabButton){
        pastPapersTabButton.classList.toggle("is-active", nextTab === "past-papers");
      }
      applyShellTabVisualState();
    }

    function syncShellTabWithActivePanel(){
      if(!tabsRoot) return;
      const activeTab = tabsRoot.querySelector('[role="tab"][aria-selected="true"]');
      const activePanelId = activeTab ? String(activeTab.getAttribute("aria-controls") || "") : "";
      setShellTab(activePanelId === "tab-syl" ? "syllabus" : "past-papers");
    }

    if(tabsRoot){
      if(container.__ppSubjectTabSyncHandler){
        tabsRoot.removeEventListener("igcsefy:subject-tab-change", container.__ppSubjectTabSyncHandler);
      }
      container.__ppSubjectTabSyncHandler = syncShellTabWithActivePanel;
      tabsRoot.addEventListener("igcsefy:subject-tab-change", syncShellTabWithActivePanel);
      if(initialSubjectDestination === "past-papers"){
        setActiveSubjectTab(tabsRoot, "tab-pp");
      }
      syncShellTabWithActivePanel();
    }

    if(syllabusTabButton){
      syllabusTabButton.addEventListener("click", () => {
        if(tabsRoot){
          setActiveSubjectTab(tabsRoot, "tab-syl");
          return;
        }
        const level = dataStore.getSubjectLevel(subjectRef, 'core');
        window.location.href = `/subjects/${subjectSlug}/?level=${encodeURIComponent(level)}`;
      });
    }

    if(pastPapersTabButton){
      pastPapersTabButton.addEventListener("click", () => {
        if(tabsRoot){
          setActiveSubjectTab(tabsRoot, "tab-pp");
        }
      });
    }

    function getCurrentYearEntry(){
      return model.years.find(entry => String(entry.year) === String(state.selectedYear)) || model.years[0];
    }

    function getVisibleCards(){
      const yearEntry = getCurrentYearEntry();
      const query = embeddedGlobalBrowser ? "" : state.search.trim().toLowerCase();

      return yearEntry.sessions
        .map(session => {
          const selectedGroup = session.groups.find(group => group.id === state.selectedGroupId) || session.groups[0];
          const papers = (selectedGroup && selectedGroup.papers ? selectedGroup.papers : [])
            .filter(paper => !query || paper.searchSource.includes(query));

          if(!papers.length){
            return null;
          }

          return {
            year: yearEntry.year,
            session,
            groupId: selectedGroup ? selectedGroup.id : "all",
            papers,
            renderKey: `${yearEntry.year}-${session.sessionCode}-${selectedGroup ? selectedGroup.id : "all"}`
          };
        })
        .filter(Boolean);
    }

    function ensureExpansionState(cards){
      const sessionKeys = cards.map(card => card.renderKey);
      const hasExistingSessionState = sessionKeys.some(key =>
        Object.prototype.hasOwnProperty.call(state.openSessions, key)
      );

      sessionKeys.forEach(key => {
        if(!Object.prototype.hasOwnProperty.call(state.openSessions, key)){
          state.openSessions[key] = false;
        }
      });

      if(!hasExistingSessionState && sessionKeys[0]){
        state.openSessions[sessionKeys[0]] = true;
      }

      cards.forEach(card => {
        card.papers.forEach(paper => {
          const paperKey = `${card.renderKey}|${paper.id}`;
          if(!Object.prototype.hasOwnProperty.call(state.openPapers, paperKey)){
            state.openPapers[paperKey] = false;
          }
        });
      });
    }

    function revealTrackKey(trackKey){
      if(!trackKey) return false;

      for(const yearEntry of model.years){
        for(const session of yearEntry.sessions){
          for(const group of session.groups){
            for(const paper of group.papers){
              if(!paper.variants.some(variant => variant.trackKey === trackKey)){
                continue;
              }

              const renderKey = `${yearEntry.year}-${session.sessionCode}-${group.id}`;
              const paperKey = `${renderKey}|${paper.id}`;

              state.selectedYear = yearEntry.year;
              state.selectedGroupId = group.id;
              state.openSessions[renderKey] = true;
              state.openPapers[paperKey] = true;
              renderBody();
              return true;
            }
          }
        }
      }

      return false;
    }

    function renderVariantRow(paper, variant, trackerStore){
      const status = getTrackerStatus(trackerStore, variant.trackKey);
      const activeStatus = getPastPapersZipStatusMeta(status);
      const paperLabel = paper && paper.name
        ? paper.detail
          ? `${paper.name} ${paper.detail}`
          : paper.name
        : "Paper";

      return `
        <div class="pp-variant-item flex flex-col sm:flex-row sm:items-center gap-3 py-3 px-4 rounded-2xl" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" data-status="${escapePastPapersZipHtml(status)}">
          <div class="pp-variant-copy flex items-center gap-2 w-28 flex-shrink-0">
            <span data-role="variant-indicator" class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeStatus ? activeStatus.dot : "bg-white/10"}"></span>
            <span class="pp-variant-label text-xs text-white/40 font-medium">Variant ${escapePastPapersZipHtml(variant.label)}</span>
          </div>
          <div class="flex items-center gap-1.5 flex-1 flex-wrap">
            ${SUBJECT_PAST_PAPERS_ZIP_STATUS.map(option => {
              const isActive = status === option.value;
              return `
                <button type="button" data-action="set-status" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" data-status-value="${option.value}" aria-pressed="${isActive ? "true" : "false"}" class="pp-variant-status-pill flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 ${isActive ? option.active : "text-white/20 hover:text-white/45"}">
                  <span data-role="status-pill-dot" class="pp-variant-status-pill__dot w-1 h-1 rounded-full transition-colors ${isActive ? option.dot : "bg-white/15"}"></span>
                  ${option.label}
                </button>
              `;
            }).join("")}
            <button type="button" data-action="clear-status" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" aria-hidden="${status === "none" ? "true" : "false"}" tabindex="${status === "none" ? "-1" : "0"}" class="pp-variant-clear px-3 py-1 rounded-full text-[11px] text-white/20 hover:text-white/40 transition-colors duration-150 ${status !== "none" ? "is-visible" : ""}">Clear</button>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${variant.qpHref
              ? `<a href="${escapePastPapersZipHtml(variant.qpHref)}" download data-paper-file="true" data-file-kind="qp" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" data-file-href="${escapePastPapersZipHtml(variant.qpHref)}" data-file-label="${escapePastPapersZipHtml(`${paperLabel} · Variant ${variant.label} · QP`)}" class="pp-variant-file px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-white/50 bg-white/[0.07] hover:bg-white/[0.12] hover:text-white/85 transition-all duration-200">QP</a>`
              : ""}
            ${variant.msHref
              ? `<a href="${escapePastPapersZipHtml(variant.msHref)}" download data-paper-file="true" data-file-kind="ms" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" data-file-href="${escapePastPapersZipHtml(variant.msHref)}" data-file-label="${escapePastPapersZipHtml(`${paperLabel} · Variant ${variant.label} · MS`)}" class="pp-variant-file px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-white/50 bg-white/[0.07] hover:bg-white/[0.12] hover:text-white/85 transition-all duration-200">MS</a>`
              : ""}
            ${variant.ciHref
              ? `<a href="${escapePastPapersZipHtml(variant.ciHref)}" download data-paper-file="true" data-file-kind="ci" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" data-file-href="${escapePastPapersZipHtml(variant.ciHref)}" data-file-label="${escapePastPapersZipHtml(`${paperLabel} · Variant ${variant.label} · CI`)}" class="pp-variant-file px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-white/50 bg-white/[0.07] hover:bg-white/[0.12] hover:text-white/85 transition-all duration-200">CI</a>`
              : ""}
            ${variant.inHref
              ? `<a href="${escapePastPapersZipHtml(variant.inHref)}" download data-paper-file="true" data-file-kind="insert" data-track-key="${escapePastPapersZipHtml(variant.trackKey)}" data-file-href="${escapePastPapersZipHtml(variant.inHref)}" data-file-label="${escapePastPapersZipHtml(`${paperLabel} · Variant ${variant.label} · Insert`)}" class="pp-variant-file px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-white/50 bg-white/[0.07] hover:bg-white/[0.12] hover:text-white/85 transition-all duration-200">IN</a>`
              : ""}
          </div>
        </div>
      `;
    }

    function syncVariantRowStatus(item, status){
      if(!item) return;

      const resolved = TRACKER_STATUS_META[status] ? status : "none";
      const activeStatus = getPastPapersZipStatusMeta(resolved);
      item.dataset.status = resolved;

      const indicator = item.querySelector('[data-role="variant-indicator"]');
      if(indicator){
        indicator.className = `w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeStatus ? activeStatus.dot : "bg-white/10"}`;
      }

      item.querySelectorAll('[data-action="set-status"]').forEach(button => {
        const value = button.dataset.statusValue || "";
        const option = SUBJECT_PAST_PAPERS_ZIP_STATUS.find(entry => entry.value === value);
        if(!option) return;

        const isActive = resolved === value;
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.className = `pp-variant-status-pill flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 ${isActive ? option.active : "text-white/20 hover:text-white/45"}`;

        const dot = button.querySelector('[data-role="status-pill-dot"]');
        if(dot){
          dot.className = `pp-variant-status-pill__dot w-1 h-1 rounded-full transition-colors ${isActive ? option.dot : "bg-white/15"}`;
        }
      });

      const clearButton = item.querySelector('[data-action="clear-status"]');
      if(clearButton){
        const isVisible = resolved !== "none";
        clearButton.classList.toggle("is-visible", isVisible);
        clearButton.setAttribute("aria-hidden", isVisible ? "false" : "true");
        clearButton.tabIndex = isVisible ? 0 : -1;
      }
    }

    function renderPaperRow(card, paper, trackerStore){
      const paperKey = `${card.renderKey}|${paper.id}`;
      const isOpen = !!state.openPapers[paperKey];

      return `
        <div class="pp-paper-row ${isOpen ? "is-open" : ""}" data-paper-key="${escapePastPapersZipHtml(paperKey)}">
          <button type="button" data-action="toggle-paper" data-paper-key="${escapePastPapersZipHtml(paperKey)}" aria-expanded="${isOpen ? "true" : "false"}" class="pp-paper-toggle w-full flex items-center gap-3 px-4 py-3.5 text-left group rounded-2xl">
            <span class="text-[10px] font-mono text-white/25 w-5 flex-shrink-0 text-center">${escapePastPapersZipHtml(paper.number || paper.name.replace(/[^0-9]/g, ""))}</span>
            <div class="flex-1">
              <span class="pp-paper-title text-sm font-medium">${escapePastPapersZipHtml(paper.name)}</span>
              ${paper.detail ? `<span class="pp-paper-detail text-white/25 text-xs ml-2">${escapePastPapersZipHtml(paper.detail)}</span>` : ""}
            </div>
            <div class="flex items-center gap-3">
              <span class="pp-paper-meta text-[11px] text-white/20 tabular-nums">${paper.variants.length}v</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="pp-paper-chevron text-white/20">
                <path d="M9 18l6-6-6-6"></path>
              </svg>
            </div>
          </button>
          <div class="pp-paper-panel ${isOpen ? "is-open" : ""}">
            <div class="pp-paper-panel__inner">
              <div class="px-3 pb-2 space-y-0.5">${paper.variants.map(variant => renderVariantRow(paper, variant, trackerStore)).join("")}</div>
            </div>
          </div>
        </div>
      `;
    }

    function renderSessionCard(card, trackerStore){
      const isOpen = !!state.openSessions[card.renderKey];
      const variantCount = card.papers.reduce((total, paper) => total + paper.variants.length, 0);

      return `
        <div class="pp-subject-session-card ${isOpen ? "is-open" : ""}" data-session-card="${escapePastPapersZipHtml(card.renderKey)}">
          <button type="button" data-action="toggle-session" data-session-key="${escapePastPapersZipHtml(card.renderKey)}" class="w-full flex items-center gap-4 px-5 py-4 text-left group">
            <div class="pp-subject-session-dot w-1.5 h-1.5 rounded-full flex-shrink-0"></div>
            <div class="flex-1 flex items-center gap-3 min-w-0">
              <span class="pp-subject-session-title text-sm font-semibold">${escapePastPapersZipHtml(card.session.label)} ${card.year}</span>
              <span class="pp-subject-session-code text-[10px] font-mono text-white/20 tracking-wider">${escapePastPapersZipHtml(card.session.code)}</span>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
              <span class="pp-subject-session-meta text-[11px] text-white/20 hidden sm:block">${card.papers.length} papers · ${variantCount} variants</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pp-subject-session-chevron text-white/20">
                <path d="M9 18l6-6-6-6"></path>
              </svg>
            </div>
          </button>
          <div class="pp-subject-session-panel ${isOpen ? "is-open" : ""}">
            <div class="pp-subject-session-panel__inner">
              <div class="px-3 pb-3 space-y-1">
              ${card.session.extras.length
                ? `<div class="px-1 pb-2 flex flex-wrap gap-2">
                    ${card.session.extras.map(extra => `
                      <a href="${escapePastPapersZipHtml(extra.href)}" download data-paper-file="true" data-file-kind="${escapePastPapersZipHtml(extra.type || "extra")}" data-file-href="${escapePastPapersZipHtml(extra.href)}" data-file-label="${escapePastPapersZipHtml(extra.label)}" class="px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-white/50 bg-white/[0.07] hover:bg-white/[0.12] hover:text-white/85 transition-all duration-200">${escapePastPapersZipHtml(extra.label)}</a>
                    `).join("")}
                  </div>`
                : ""}
              ${card.papers.map(paper => renderPaperRow(card, paper, trackerStore)).join("")}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderBody(){
      const rootTheme = document.documentElement;
      const isLightTheme = rootTheme.dataset.theme === "light"
        || rootTheme.classList.contains("light")
        || (!rootTheme.classList.contains("dark") && rootTheme.dataset.theme !== "dark");
      const yearEntry = getCurrentYearEntry();
      const visibleCards = getVisibleCards();
      const trackerStore = readTracker();
      const filterGroupStyle = isLightTheme
        ? ' style="background:#FFFFFF;border:1px solid #E9E3D8;box-shadow:none;padding:.25rem;gap:.25rem;"'
        : '';
      const filterButtonStyle = (isActive) => isLightTheme
        ? ` style="background:${isActive ? '#000000' : 'transparent'};color:${isActive ? '#FFFFFF' : '#666666'};box-shadow:none;"`
        : '';

      ensureExpansionState(visibleCards);

      body.innerHTML = `
        <p class="pp-subject-body-copy">Browse Cambridge IGCSE ${escapePastPapersZipHtml(model.cfg.name)} (${escapePastPapersZipHtml(model.cfg.code)}) past papers by year and series.</p>
        <div class="pp-subject-filters" style="display:flex;flex-direction:row;align-items:center;gap:1rem;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:.125rem;">
          <div class="pp-subject-filter-group"${filterGroupStyle}>
            ${model.years.map(entry => `
              <button type="button" data-action="select-year" data-year="${entry.year}" class="pp-subject-filter-button ${String(entry.year) === String(yearEntry.year) ? "is-active" : ""}"${filterButtonStyle(String(entry.year) === String(yearEntry.year))}>${entry.year}</button>
            `).join("")}
          </div>
          ${model.showGroupControl
            ? `<div class="pp-subject-filter-group"${filterGroupStyle}>
                ${model.visibleGroups.map(group => `
                  <button type="button" data-action="select-group" data-group-id="${escapePastPapersZipHtml(group.id)}" class="pp-subject-filter-button ${state.selectedGroupId === group.id ? "is-active" : ""}"${filterButtonStyle(state.selectedGroupId === group.id)}>${escapePastPapersZipHtml(group.label)}</button>
                `).join("")}
              </div>`
            : ""}
        </div>
        <div class="space-y-2">
          ${visibleCards.map(card => renderSessionCard(card, trackerStore)).join("")}
        </div>
      `;
    }

    body.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if(!actionTarget) return;

      const action = actionTarget.dataset.action;
      if(action === "select-year"){
        state.selectedYear = Number(actionTarget.dataset.year);
        renderBody();
        return;
      }

      if(action === "select-group"){
        state.selectedGroupId = actionTarget.dataset.groupId;
        if(state.selectedGroupId === 'core' || state.selectedGroupId === 'extended'){
          dataStore.setSubjectLevel(subjectRef, state.selectedGroupId);
        }
        renderBody();
        return;
      }

      if(action === "toggle-session"){
        const sessionKey = actionTarget.dataset.sessionKey;
        const nextOpen = !state.openSessions[sessionKey];
        state.openSessions[sessionKey] = nextOpen;

        const sessionCard = actionTarget.closest("[data-session-card]");
        if(sessionCard){
          sessionCard.classList.toggle("is-open", nextOpen);
          const panel = sessionCard.querySelector(".pp-subject-session-panel");
          if(panel){
            panel.classList.toggle("is-open", nextOpen);
          }
        } else {
          renderBody();
        }
        return;
      }

      if(action === "toggle-paper"){
        const paperKey = actionTarget.dataset.paperKey;
        const nextOpen = !state.openPapers[paperKey];
        state.openPapers[paperKey] = nextOpen;

        const paperRow = actionTarget.closest(".pp-paper-row[data-paper-key]");
        if(paperRow){
          paperRow.classList.toggle("is-open", nextOpen);
          actionTarget.setAttribute("aria-expanded", nextOpen ? "true" : "false");
          const panel = paperRow.querySelector(".pp-paper-panel");
          if(panel){
            panel.classList.toggle("is-open", nextOpen);
          }
        }else{
          renderBody();
        }
        return;
      }

      if(action === "set-status" || action === "clear-status"){
        const trackKey = actionTarget.dataset.trackKey;
        const item = actionTarget.closest(".pp-variant-item[data-track-key]");
        const currentStatus = item?.dataset.status || getTrackerStatus(readTracker(), trackKey);
        const requestedStatus = action === "clear-status" ? "none" : actionTarget.dataset.statusValue;
        const nextStatus = currentStatus === requestedStatus ? "none" : requestedStatus;
        suppressTrackerRender = true;
        setTrackerStatus(trackKey, nextStatus);
        if(item){
          syncVariantRowStatus(item, nextStatus);
        }else{
          renderBody();
        }
        return;
      }
    });

    if(!embeddedGlobalBrowser){
      searchInput.addEventListener("input", () => {
        state.search = searchInput.value || "";
        renderBody();
      });
    }

    function revealTrackFromLocation(){
      let params;
      try{
        params = new URLSearchParams(window.location.search || "");
      }catch(error){
        return;
      }

      const requestedTrackKey = String(params.get("track") || "").trim();
      if(!requestedTrackKey || !requestedTrackKey.startsWith(`${subjectSlug}|`)){
        return;
      }

      if(container.__ppLastRevealedTrackKey === requestedTrackKey){
        return;
      }

      const didReveal = revealTrackKey(requestedTrackKey);
      if(!didReveal){
        return;
      }

      container.__ppLastRevealedTrackKey = requestedTrackKey;

      requestAnimationFrame(() => {
        const target = Array.from(
          shadow.querySelectorAll(".pp-variant-item[data-track-key]")
        ).find(item => item.dataset.trackKey === requestedTrackKey);

        if(!target){
          return;
        }

        target.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
          flashVariantHit(target);
        }, 140);
      });
    }

    container.__ppActivateYear = year => {
      state.selectedYear = Number(year);
      renderBody();
    };
    container.__ppRevealTrackKey = revealTrackKey;

    if(container.__ppSubjectZipTrackerHandler){
      window.removeEventListener("igcsefy:tracker-change", container.__ppSubjectZipTrackerHandler);
    }
    container.__ppSubjectZipTrackerHandler = () => {
      if(suppressTrackerRender){
        suppressTrackerRender = false;
        return;
      }
      renderBody();
    };
    window.addEventListener("igcsefy:tracker-change", container.__ppSubjectZipTrackerHandler);

    if(container.__ppSubjectPreferenceHandler){
      window.removeEventListener("igcsefy:data-change", container.__ppSubjectPreferenceHandler);
    }
    container.__ppSubjectPreferenceHandler = () => {
      const nextGroupId = getPreferredGroupId();
      if(!nextGroupId || nextGroupId === state.selectedGroupId) return;
      state.selectedGroupId = nextGroupId;
      renderBody();
    };
    window.addEventListener("igcsefy:data-change", container.__ppSubjectPreferenceHandler);

    const flashVariantHit = (element) => {
      if (!element) {
        return;
      }

      if (activeVariantHighlight && activeVariantHighlight !== element) {
        if (activeVariantHighlight.__igcsefySearchHitTimer) {
          clearTimeout(activeVariantHighlight.__igcsefySearchHitTimer);
          activeVariantHighlight.__igcsefySearchHitTimer = null;
        }
        activeVariantHighlight.classList.remove("igcsefy-search-hit");
      }

      if (element.__igcsefySearchHitTimer) {
        clearTimeout(element.__igcsefySearchHitTimer);
        element.__igcsefySearchHitTimer = null;
        element.classList.remove("igcsefy-search-hit");
        void element.offsetWidth;
      }

      element.classList.add("igcsefy-search-hit");
      activeVariantHighlight = element;
      element.__igcsefySearchHitTimer = window.setTimeout(() => {
        element.classList.remove("igcsefy-search-hit");
        if (activeVariantHighlight === element) {
          activeVariantHighlight = null;
        }
        element.__igcsefySearchHitTimer = null;
      }, 2860);
    };

    renderBody();
    revealTrackFromLocation();
  }catch(error){
    console.error("Failed to render subject Past Papers ZIP UI:", error);
    renderPastPapersForSubject(container, subjectSlug);
    hydratePastPaperTracker(container);
  }
}

async function renderPastPapers(){
  const container = document.getElementById("past-papers-app");
  if (!container) return;
  const mode = container.dataset.mode || "subject";

  const prewarmPastPaperData = () => {
    if(!container.__ppDataPromise){
      container.__ppDataPromise = loadPastPaperFiles().catch(error => {
        container.__ppDataPromise = null;
        throw error;
      });
    }
    return container.__ppDataPromise;
  };

  const startRender = async () => {
    if (container.__ppRendered || container.__ppRendering) return;
    container.__ppRendering = true;
    await prewarmPastPaperData();

    try{
      if(mode === "global"){
        await renderGlobalPastPapers(container);
      } else {
        const subjectSlug = container.dataset.subject;
        await renderSubjectPastPapersZip(container, subjectSlug);
      }

      container.__ppRendered = true;
    }finally{
      container.__ppRendering = false;
    }

    // Past Papers scrollytelling: ensure triggers observe freshly rendered nodes.
    if (typeof window !== "undefined" && typeof window.ppScrollRefresh === "function") {
      requestAnimationFrame(() => window.ppScrollRefresh());
    }

    dispatchPastPapersReady(container);
  };

  startRender().catch(error => {
    console.error("Failed to initialize Past Papers:", error);
    dispatchPastPapersReady(container, { rendered: false, error: true });
  });
}

document.addEventListener("DOMContentLoaded", renderPastPapers);
