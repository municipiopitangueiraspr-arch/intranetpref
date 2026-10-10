/* PWA de instalação móvel: não publica o manifesto para navegadores desktop. */
(() => {
  const nav = window.navigator || {};
  const ua = String(nav.userAgent || "");
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const iPadDesktopMode = /Macintosh/i.test(ua) && Number(nav.maxTouchPoints || 0) > 1;
  const mobile = nav.userAgentData?.mobile === true || mobileUserAgent || iPadDesktopMode;

  window.__INTRANET_MOBILE_PWA__ = mobile;
  if (!mobile) return;

  const manifestHref = document.currentScript?.dataset.manifestHref;
  if (!manifestHref || document.querySelector('link[rel="manifest"]')) return;

  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = manifestHref;
  document.head.appendChild(link);
})();
