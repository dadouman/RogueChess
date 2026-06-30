// Toasts « dopamine » du mode Aventure : notification éphémère (icône + titre +
// texte) injectée dans #adventureToasts. Widget autonome (DOM seul).

export function showAdventureToast({ icon = '✨', title = '', text = '', kind = '' } = {}) {
  const host = document.querySelector('#adventureToasts');
  if (!host) {
    return;
  }
  const toast = document.createElement('div');
  toast.className = `adv-toast${kind ? ` is-${kind}` : ''}`;
  toast.setAttribute('role', 'status');

  const iconEl = document.createElement('div');
  iconEl.className = 'adv-toast-icon';
  iconEl.textContent = icon;

  const body = document.createElement('div');
  body.className = 'adv-toast-body';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  body.append(titleEl);
  if (text) {
    const textEl = document.createElement('span');
    textEl.textContent = text;
    body.append(textEl);
  }

  toast.append(iconEl, body);
  host.append(toast);

  // Retire le toast après l'animation de sortie (var(--toast-life) 2.4s + 0.36s).
  setTimeout(() => {
    toast.remove();
  }, 3000);
}
