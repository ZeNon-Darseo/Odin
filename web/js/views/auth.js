import { api, errorText } from '../api.js';
import { esc, icon, toast, bindPasswordToggles } from '../ui.js';
import { t } from '../i18n.js';
import { isStaff } from '../roles.js';

export function authFormHtml(mode) {
  if (mode === 'register') {
    return `
    <form id="auth-form" novalidate>
      <div class="field"><label for="f-name">${t('auth.name')}</label><input class="input" id="f-name" name="name" autocomplete="name" placeholder="${esc(t('auth.namePh'))}" required></div>
      <div class="field"><label for="f-email">${t('auth.email')}</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" placeholder="${esc(t('auth.emailPh'))}" required></div>
      <div class="field"><label for="f-phone">${t('auth.phone')} <span class="form-hint">${t('auth.optional')}</span></label><input class="input" id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="${esc(t('auth.phonePh'))}"></div>
      <div class="field"><label for="f-password">${t('auth.password')}</label>
        <div class="password-wrap"><input class="input" id="f-password" name="password" type="password" autocomplete="new-password" placeholder="${esc(t('auth.passwordNewPh'))}" required><button type="button" class="icon-btn" data-toggle-password aria-label="${esc(t('auth.showPassword'))}">${icon('eye')}</button></div>
      </div>
      <p class="form-error" id="auth-error" hidden></p>
      <button class="btn btn-primary btn-block" type="submit" id="auth-submit">${t('auth.create')} ${icon('arrowRight')}</button>
    </form>`;
  }
  return `
  <form id="auth-form" novalidate>
    <div class="field"><label for="f-email">${t('auth.email')}</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" placeholder="${esc(t('auth.emailPh'))}" required></div>
    <div class="field"><label for="f-password">${t('auth.password')}</label>
      <div class="password-wrap"><input class="input" id="f-password" name="password" type="password" autocomplete="current-password" placeholder="${esc(t('auth.passwordPh'))}" required><button type="button" class="icon-btn" data-toggle-password aria-label="${esc(t('auth.showPassword'))}">${icon('eye')}</button></div>
    </div>
    <p class="form-error" id="auth-error" hidden></p>
    <button class="btn btn-primary btn-block" type="submit" id="auth-submit">${t('auth.login')} ${icon('arrowRight')}</button>
  </form>`;
}

export function bindAuthForm(root, { mode, onSuccess }) {
  const form = root.querySelector('#auth-form');
  const error = root.querySelector('#auth-error');
  const submit = root.querySelector('#auth-submit');
  bindPasswordToggles(root);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    const original = submit.innerHTML;
    submit.innerHTML = mode === 'register' ? t('auth.creating') : t('auth.loggingIn');
    try {
      const result = await api(mode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body: data });
      toast(t(mode === 'register' ? 'auth.welcome' : 'auth.welcomeBack', { name: result.user.name }), 'success');
      onSuccess(result.user);
    } catch (err) {
      error.textContent = errorText(err);
      error.hidden = false;
      submit.disabled = false;
      submit.innerHTML = original;
    }
  });
}

export function authView(state, { mode }) {
  const register = mode === 'register';
  const next = state.next ? `?next=${encodeURIComponent(state.next)}` : '';
  return `
  <div class="auth-shell">
    <div class="auth-card">
      <div class="head">
        <span class="brand-mark">${icon('bubble')}</span>
        <h1>${register ? t('auth.regTitle') : t('auth.loginTitle')}</h1>
        <p>${register ? t('auth.regLead') : t('auth.loginLead')}</p>
      </div>
      ${authFormHtml(mode)}
      <p class="auth-alt">${register
        ? `${t('auth.haveAccount')} <a href="/login/${next}">${t('auth.loginLink')}</a>`
        : `${t('auth.noAccount')} <a href="/register/${next}">${t('auth.registerLink')}</a>`}</p>
    </div>
  </div>`;
}

export function mountAuth(root, state, { mode, navigate, setUser }) {
  bindAuthForm(root, {
    mode,
    onSuccess: (user) => {
      setUser(user);
      navigate(state.next || (isStaff(user) ? '/admin/' : '/account/'));
    },
  });
}
