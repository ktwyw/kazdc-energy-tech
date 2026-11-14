// Native disclosure and links also work without JavaScript.
(() => {
  const menu = document.querySelector(".language-menu");
  const summary = menu.querySelector("summary");
  document.addEventListener("click", event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      summary.focus();
    }
  });
  function syncLanguageLinks() {
    for (const link of menu.querySelectorAll("a[hreflang]")) {
      const destination = new URL(link.href);
      // Offline studies set their target queries directly because file URLs cannot be rewritten with history.
      if (location.protocol !== "file:") destination.search = location.search;
      destination.hash = location.hash;
      link.href = destination.href;
    }
  }
  syncLanguageLinks();
  menu.addEventListener("toggle", syncLanguageLinks);
  menu.addEventListener("click", syncLanguageLinks, true);
  window.addEventListener("hashchange", syncLanguageLinks);
  window.addEventListener("popstate", syncLanguageLinks);
})();
