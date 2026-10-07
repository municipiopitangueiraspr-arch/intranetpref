const Router = {
  init: () => {
    window.addEventListener("hashchange", Router.handleRoute);
    Router.handleRoute();
  },
  handleRoute: () => {
    console.log("handleRoute chamado", window.location.hash);
    // resto do código
  },
  handleRoute: () => {
    const hash = window.location.hash || "#/";
    const path = hash.substring(1);
    const parts = path.split("/");
    const page = parts[0] || "dashboard";
    const id = parts[1];

    if (typeof window[`${page}Module`] !== "undefined") {
      window[`${page}Module`].init(id);
    } else {
      window.location.hash = "#/";
    }

    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
      link.classList.remove("active");
      if (link.dataset.page === page) {
        link.classList.add("active");
      }
    });
  },
  navigate: (path) => {
    window.location.hash = path;
  },
};
