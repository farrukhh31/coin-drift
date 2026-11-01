// Coin Drift sign in / sign up. Same API and validation rules as before (the server is the real gatekeeper);
// adds in-place Log in / Sign up switching, a password strength meter and the signals that drive the 3D cube (auth3d.js).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form'), go = $('go'), err = $('err'), pw = $('password'), eye = $('eye'), meter = $('meter');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches;
  var mode = null, sending = false, ticket = null;
  var cd = function (fn, a) { try { if (window.CD3D) window.CD3D[fn](a); } catch (e) {} }; // the 3D scene is optional

  var COPY = {
    login: { title: 'Welcome back', sub: 'Sign in to play Coin Drift.', btn: 'Log in', alt: 'New here?', link: 'Create an account', href: '/signup', doc: 'Coin Drift - Log in' },
    signup: { title: 'Join the drift', sub: 'Create your account and track every run.', btn: 'Create account', alt: 'Already have an account?', link: 'Log in', href: '/login', doc: 'Coin Drift - Sign up' }
  };

  function clearErr() { err.textContent = ''; err.classList.remove('shake'); form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); }); }
  function fail(msg, input) {
    err.textContent = msg; err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake');
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    cd('error');
  }

  function setMode(m, push, animate) {
    if (m === mode) return;
    var first = mode === null; mode = m;
    var c = COPY[m], signup = m === 'signup';
    document.body.dataset.mode = m; document.title = c.doc;
    $('title').textContent = c.title; $('sub').textContent = c.sub; $('golbl').textContent = c.btn;
    $('alt').textContent = c.alt; $('altlink').textContent = c.link; $('altlink').href = c.href;
    $('tab-login').setAttribute('aria-current', signup ? 'false' : 'page'); $('tab-signup').setAttribute('aria-current', signup ? 'page' : 'false');
    document.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.dataset.for !== m; });
    pw.autocomplete = signup ? 'new-password' : 'current-password';
    clearErr(); go.classList.remove('ok', 'busy'); strength();
    if (push) history.pushState({}, '', '/' + m);
    if (animate && !first) cd('mode', m);
  }
  function step2(on, msg) { // second factor step: swap the form for a single code field
    ticket = on ? ticket : null; document.body.classList.toggle('step2', on);
    $('f2fa').hidden = !on; $('back2fa').hidden = !on; $('code').value = '';
    if (on) { $('title').textContent = 'Two-step check'; $('sub').textContent = 'Open your authenticator app and enter the 6-digit code.'; $('golbl').textContent = 'Verify'; document.title = 'Coin Drift - Verify'; cd('pass', 0); setTimeout(function () { $('code').focus(); }, 60); }
    else { var c = COPY[mode]; $('title').textContent = c.title; $('sub').textContent = c.sub; $('golbl').textContent = c.btn; document.title = c.doc; }
    clearErr(); if (msg) fail(msg);
  }
  $('backlink').addEventListener('click', function (e) { e.preventDefault(); step2(false); pw.value = ''; strength(); var f = $('identifier'); if (f) f.focus(); });
  function modeOf(href) { return /\/signup\/?$/.test(href) ? 'signup' : 'login'; }
  ['tab-login', 'tab-signup', 'altlink'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // let "open in new tab" work
      e.preventDefault(); if (!sending) setMode(modeOf($(id).getAttribute('href')), true, true);
    });
  });
  addEventListener('popstate', function () { setMode(modeOf(location.pathname), false, true); });

  // ----- password: show/hide, strength, and the cube covering its eyes -----
  function passState() { cd('pass', document.activeElement === pw ? (pw.type === 'text' ? 0.5 : 1) : 0); }
  eye.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the caret in the field
  eye.addEventListener('click', function () {
    var show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); passState();
  });
  pw.addEventListener('focus', passState); pw.addEventListener('blur', function () { setTimeout(passState, 0); });
  function strength() {
    var v = pw.value, s = 0, txt = '8+ chars, a letter and a number';
    if (v) {
      if (v.length >= 8) s++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++; if (v.length >= 12) s++; if (/[^A-Za-z0-9]/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v))) s++;
      s = Math.max(1, s);
      txt = v.length < 8 ? 'Too short (8+ needed)' : !(/[A-Za-z]/.test(v) && /\d/.test(v)) ? 'Add a letter and a number' : ['', '', 'Okay', 'Good', 'Strong'][s] || 'Okay';
    }
    meter.className = 'meter' + (v ? ' s' + s : ''); $('mtxt').textContent = txt;
  }
  pw.addEventListener('input', strength);

  // ----- the cube looks at the form while you type -----
  form.addEventListener('focusin', function (e) { if (e.target.tagName === 'INPUT') cd('focus', true); });
  form.addEventListener('focusout', function () { setTimeout(function () { if (!form.contains(document.activeElement)) cd('focus', false); }, 0); });
  form.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });

  // ----- submit -----
  form.addEventListener('submit', async function (e) {
    e.preventDefault(); if (sending) return; clearErr();
    var signup = mode === 'signup', password = pw.value, body, url = signup ? '/api/signup' : '/api/login';
    if (ticket) {
      body = { ticket: ticket, code: $('code').value.trim() }; url = '/api/login/2fa';
      if (!body.code) return fail('Enter the code from your authenticator app.', $('code'));
    } else if (signup) {
      body = { username: $('username').value.trim(), email: $('email').value.trim(), password: password };
      if (!/^[A-Za-z0-9_]{3,20}$/.test(body.username)) return fail('Username: 3-20 letters, numbers or underscores.', $('username'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) return fail('Enter a valid email address.', $('email'));
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return fail('Password: 8+ characters with a letter and a number.', pw);
    } else {
      body = { identifier: $('identifier').value.trim(), password: password };
      if (!body.identifier) return fail('Fill in both fields.', $('identifier'));
      if (!password) return fail('Fill in both fields.', pw);
    }
    sending = true; go.classList.add('busy');
    try {
      var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d.need2fa) { ticket = d.ticket; sending = false; go.classList.remove('busy'); step2(true); return; }
      if (d.expired) { sending = false; go.classList.remove('busy'); step2(false, d.error); return; }
      if (r.ok) { // celebrate, then head to the dashboard
        go.classList.remove('busy'); go.classList.add('ok'); $('golbl').textContent = ticket ? 'Verified!' : signup ? 'Account created!' : "You're in!";
        cd('pass', 0); cd('success');
        setTimeout(function () { location.href = '/dashboard'; }, reduce ? 0 : 1150);
        return;
      }
      fail(d.error || 'Something went wrong.', ticket ? $('code') : null);
    } catch (x) { fail('Network error. Try again.'); }
    sending = false; go.classList.remove('busy');
  });

  setMode(modeOf(location.pathname), false, false);
  if (!coarse) { var f = form.querySelector('.field:not([hidden]) input'); if (f) f.focus(); }
})();
