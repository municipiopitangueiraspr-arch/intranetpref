(() => {
  function boot() {
    const avatar = document.querySelector('.user-avatar');
    const parent = avatar?.parentElement;
    if (!avatar || !parent || parent.querySelector('.legacy-avatar-wrapper')) return;
    const name = document.getElementById('userName')?.textContent?.trim() || 'Usuário';
    const role = document.getElementById('userRole')?.textContent?.trim() || 'Conta institucional';
    const wrapper = document.createElement('div');
    wrapper.className = 'legacy-avatar-wrapper';
    wrapper.innerHTML = `<button type="button" class="legacy-avatar-btn" aria-expanded="false" aria-haspopup="menu" title="Menu do usuário"></button><div class="legacy-avatar-menu" role="menu"><div class="legacy-avatar-head"><strong>${name}</strong><span>${role}</span></div><a href="../perfil.html" role="menuitem"><i class="fas fa-user-circle"></i> Meu perfil</a><a href="gestao-atas.html" role="menuitem"><i class="fas fa-arrow-left"></i> Voltar ao módulo</a><div class="legacy-avatar-line"></div><button type="button" class="legacy-avatar-exit" role="menuitem"><i class="fas fa-right-from-bracket"></i> Sair</button></div>`;
    wrapper.querySelector('.legacy-avatar-btn').appendChild(avatar.cloneNode(true));
    avatar.replaceWith(wrapper);
    const menu = wrapper.querySelector('.legacy-avatar-menu');
    const btn = wrapper.querySelector('.legacy-avatar-btn');
    btn.addEventListener('click', e => { e.stopPropagation(); const open=menu.classList.toggle('is-open'); btn.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', e => { if (!wrapper.contains(e.target)) menu.classList.remove('is-open'); });
    wrapper.querySelector('.legacy-avatar-exit').addEventListener('click', () => document.getElementById('btnLogout')?.click());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
