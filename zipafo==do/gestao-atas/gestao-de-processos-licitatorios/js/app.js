document.addEventListener("DOMContentLoaded", () => {
  // Inicializa o roteador
  Router.init();

  // Configuração da busca (pode ser expandida)
  const searchInput = document.querySelector(".search-bar input");
  searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      // Implementar busca global
      console.log("Buscar por:", e.target.value);
    }
  });

  // Notificações (simulação)
  const notifications = document.querySelector(".notifications");
  notifications.addEventListener("click", () => {
    alert("Você tem 3 notificações.");
  });

  // Menu do usuário (simulação)
  const userDropdown = document.querySelector(".user-dropdown");
  userDropdown.addEventListener("click", () => {
    // Poderia abrir um menu dropdown
  });
});
