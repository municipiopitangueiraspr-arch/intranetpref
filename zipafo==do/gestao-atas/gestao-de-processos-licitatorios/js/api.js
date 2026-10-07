// Simula chamadas à API usando os dados mockados
const API = {
  // Processos
  getProcessos: () => Promise.resolve(window.mockData.processos),
  getProcessoById: (id) =>
    Promise.resolve(window.mockData.processos.find((p) => p.id === id)),
  createProcesso: (processo) => {
    processo.id = Date.now();
    window.mockData.processos.push(processo);
    return Promise.resolve(processo);
  },
  updateProcesso: (id, data) => {
    const index = window.mockData.processos.findIndex((p) => p.id === id);
    if (index !== -1) {
      window.mockData.processos[index] = {
        ...window.mockData.processos[index],
        ...data,
      };
      return Promise.resolve(window.mockData.processos[index]);
    }
    return Promise.reject("Processo não encontrado");
  },
  deleteProcesso: (id) => {
    window.mockData.processos = window.mockData.processos.filter(
      (p) => p.id !== id,
    );
    return Promise.resolve();
  },

  // Tarefas
  getTarefas: () => Promise.resolve(window.mockData.tarefas),
  getTarefasByProcesso: (processoId) =>
    Promise.resolve(
      window.mockData.tarefas.filter((t) => t.processoId === processoId),
    ),

  // Prazos
  getPrazos: () => Promise.resolve(window.mockData.prazos),

  // Usuários
  getUsuarios: () => Promise.resolve(window.mockData.usuarios),

  // Setores
  getSetores: () => Promise.resolve(window.mockData.setores),

  // Modelos
  getModelos: () => Promise.resolve(window.mockData.modelos),

  // Fluxos
  getFluxos: () => Promise.resolve(window.mockData.fluxos),
};
