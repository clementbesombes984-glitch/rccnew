document.documentElement.classList.add('js');
const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

/* Le header est fixe : sa hauteur réelle devient une variable de présentation
   commune à toutes les pages. La mesure est refaite uniquement lorsque le
   viewport change, afin que la réduction du header au scroll ne déplace pas
   brutalement le contenu déjà affiché. */
const syncHeaderOffset = () => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  document.documentElement.style.setProperty('--rcc-header-offset', `${Math.ceil(header.getBoundingClientRect().height)}px`);
};
syncHeaderOffset();
window.addEventListener('resize', syncHeaderOffset, { passive: true });
window.addEventListener('orientationchange', syncHeaderOffset, { passive: true });

const mobileNavLabels = [
  ['./index.html#accueil', 'Accueil'],
  ['./club.html', 'Le Club'],
  ['./equipes.html', 'Les Équipes'],
  ['./calendrier.html', 'Calendrier'],
  ['./matchs.html', 'Calendrier'],
  ['./senior.html', 'Les Équipes'],
  ['./ecole.html', 'Les Équipes'],
  ['./jeunes.html', 'Les Équipes'],
  ['./cadettes.html', 'Les Équipes'],
  ['./actualites.html', 'Actualités'],
  ['./galerie.html', 'Galerie'],
  ['./histoire.html', 'Le Club'],
  ['./partenaires.html', 'Partenaires'],
  ['./boutique.html', 'Boutique'],
  ['./vote-logo.html', 'Vote logo'],
  ['./nous-rejoindre.html', 'Contact'],
  ['./notifications.html', 'Notifications'],
  ['/cms-login', 'Administration']
];

if (nav) {
  const clubLink = nav.querySelector('a.nav-text-link[href="./club.html"]:not([data-nav-dropdown-main])');
  if (clubLink && !clubLink.closest('[data-nav-dropdown]')) {
    const dropdown = document.createElement('div');
    dropdown.className = 'nav-dropdown';
    dropdown.dataset.navDropdown = '';
    dropdown.innerHTML = `
      <a class="nav-text-link nav-dropdown-main" href="./club.html" data-nav-dropdown-main aria-haspopup="true" aria-expanded="false">Le Club</a>
      <div class="nav-submenu" data-nav-submenu>
        <div class="nav-submenu-panel">
          <a href="./club.html">Le Club</a>
          <a href="./histoire.html">Histoire</a>
        </div>
      </div>
    `;
    clubLink.replaceWith(dropdown);
  }

  if (!nav.querySelector('.mobile-home-link') && !nav.querySelector('a[href="./index.html#accueil"]')) {
    const home = document.createElement('a');
    home.className = 'mobile-home-link';
    home.href = './index.html#accueil';
    home.textContent = 'Accueil';
    home.dataset.mobileLabel = 'Accueil';
    nav.prepend(home);
  }

  nav.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const match = mobileNavLabels.find(([target]) => href === target || href.endsWith(target.replace('./', '')));
    if (link.closest('[data-nav-submenu]')) {
      link.dataset.mobileLabel = link.textContent.trim();
    } else if (match) {
      link.dataset.mobileLabel = match[1];
    }
    if (link.classList.contains('nav-cta')) link.dataset.mobileLabel = 'Contact';
  });
  const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const activeGroups = {
    'index.html': 'index.html',
    'club.html': 'club.html',
    'histoire.html': 'club.html',
    'equipes.html': 'equipes.html',
    'senior.html': 'equipes.html',
    'ecole.html': 'equipes.html',
    'jeunes.html': 'equipes.html',
    'cadettes.html': 'equipes.html',
    'feminines.html': 'equipes.html',
    'calendrier.html': 'calendrier.html',
    'matchs.html': 'calendrier.html',
    'actualites.html': 'actualites.html',
    'actualite.html': 'actualites.html',
    'galerie.html': 'galerie.html',
    'partenaires.html': 'partenaires.html',
    'boutique.html': 'boutique.html',
    'vote-logo.html': 'vote-logo.html',
    'notifications.html': 'notifications.html',
    'nous-rejoindre.html': 'nous-rejoindre.html',
    'contact.html': 'nous-rejoindre.html'
  };
  const activeTarget = activeGroups[currentPage] || currentPage;
  nav.querySelectorAll('a').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('#')[0].replace('./', '').toLowerCase();
    const isExactPage = href === currentPage || (!href && currentPage === 'index.html');
    const isActiveGroup = href === activeTarget || (!href && activeTarget === 'index.html');
    link.classList.toggle('is-active', isExactPage || isActiveGroup);
    if (isExactPage) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  nav.querySelectorAll('[data-nav-dropdown]').forEach((dropdown) => {
    dropdown.classList.toggle('is-active', Boolean(dropdown.querySelector('a.is-active')));
  });

  function logoVoteIsOpen(settings = {}) {
    if (!settings.voteEnabled || !settings.showInMenu) return false;
    const now = new Date();
    const start = settings.startDate ? new Date(settings.startDate + 'T00:00:00') : null;
    const end = settings.endDate ? new Date(settings.endDate + 'T23:59:59') : null;
    if (start && !Number.isNaN(start.getTime()) && now < start) return false;
    if (end && !Number.isNaN(end.getTime()) && now > end) return false;
    return true;
  }

  fetch('./data/logo-vote.json', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then((config) => {
      if (!config || !logoVoteIsOpen(config.settings || {})) return;
      if (nav.querySelector('a[href="./vote-logo.html"]')) return;
      const link = document.createElement('a');
      link.className = 'nav-text-link logo-vote-nav-link';
      link.href = './vote-logo.html';
      link.textContent = 'Vote logo';
      link.dataset.mobileLabel = 'Vote logo';
      const clubDropdown = nav.querySelector('[data-nav-dropdown-main][href="./club.html"]')?.closest('[data-nav-dropdown]');
      const clubSubmenu = clubDropdown?.querySelector('.nav-submenu-panel');
      if (clubSubmenu && clubSubmenu.querySelector('a[href="./histoire.html"]')) {
        const subLink = document.createElement('a');
        subLink.href = './vote-logo.html';
        subLink.textContent = 'Vote nouveau logo';
        subLink.dataset.mobileLabel = 'Vote nouveau logo';
        clubSubmenu.appendChild(subLink);
      } else {
        const contact = nav.querySelector('.nav-cta');
        if (contact) contact.before(link);
        else nav.appendChild(link);
      }
      if (currentPage === 'vote-logo.html') link.classList.add('is-active');
    })
    .catch(() => {});

  const closeAllSubmenus = (except) => {
    nav.querySelectorAll('[data-nav-dropdown]').forEach((dropdown) => {
      if (dropdown === except) return;
      dropdown.classList.remove('is-submenu-open');
      dropdown.querySelector('[data-nav-dropdown-main]')?.setAttribute('aria-expanded', 'false');
    });
  };
  nav.querySelectorAll('[data-nav-dropdown-main]').forEach((mainLink) => {
    mainLink.addEventListener('click', (event) => {
      const dropdown = mainLink.closest('[data-nav-dropdown]');
      if (!dropdown) return;
      if (window.matchMedia('(min-width: 1121px)').matches) return;
      event.preventDefault();
      const isOpen = dropdown.classList.toggle('is-submenu-open');
      mainLink.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) closeAllSubmenus(dropdown);
    });
  });
  document.addEventListener('click', (event) => {
    nav.querySelectorAll('[data-nav-dropdown].is-submenu-open').forEach((dropdown) => {
      if (!dropdown.contains(event.target)) {
        dropdown.classList.remove('is-submenu-open');
        dropdown.querySelector('[data-nav-dropdown-main]')?.setAttribute('aria-expanded', 'false');
      }
    });
  });
}
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
  });
  nav.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (link && !link.matches('[data-nav-dropdown-main]')) {
      nav.classList.remove('is-open');
      nav.querySelectorAll('[data-nav-dropdown]').forEach((dropdown) => dropdown.classList.remove('is-submenu-open'));
      nav.querySelectorAll('[data-nav-dropdown-main]').forEach((mainLink) => mainLink.setAttribute('aria-expanded', 'false'));
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Ouvrir le menu');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    nav.querySelectorAll('[data-nav-dropdown]').forEach((dropdown) => dropdown.classList.remove('is-submenu-open'));
    nav.querySelectorAll('[data-nav-dropdown-main]').forEach((mainLink) => mainLink.setAttribute('aria-expanded', 'false'));
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
    toggle.focus();
  });
}

function mailBody(lines) {
  return lines.join('\n');
}

function buildMailto(form) {
  const data = new FormData(form);
  const name = data.get('name') || '';
  const email = data.get('email') || '';
  const subject = data.get('subject') || 'Contact depuis le site RCC';
  const phone = data.get('phone') || '';
  const message = data.get('message') || '';
  const target = document.querySelector('[data-cms="email"]')?.textContent?.trim() || 'lerccdemain@gmail.com';
  const body = mailBody(['Nom : ' + name, 'Email : ' + email, phone ? 'Téléphone : ' + phone : '', '', String(message)].filter(Boolean));
  return 'mailto:' + encodeURIComponent(target) + '?subject=' + encodeURIComponent(String(subject)) + '&body=' + encodeURIComponent(body);
}

document.querySelectorAll('.join-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.matches('[data-contact-form]')) {
      window.location.href = buildMailto(form);
      return;
    }
    const data = new FormData(form);
    const target = document.querySelector('[data-cms="email"]')?.textContent?.trim() || 'lerccdemain@gmail.com';
    const name = data.get('name') || '';
    const email = data.get('email') || '';
    const message = data.get('message') || '';
    const body = mailBody(['Nom : ' + name, 'Email : ' + email, '', String(message)]);
    window.location.href = 'mailto:' + encodeURIComponent(target) + '?subject=' + encodeURIComponent('Nous rejoindre - RCC') + '&body=' + encodeURIComponent(body);
  });
});

const revealTargets = () => document.querySelectorAll('section, .card, .news-grid article, .match, .player-card, .staff-card, .partner-card, .project-card, .gallery-album, .countdown-card, .last-result-card');
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px 80px 0px' });
  requestAnimationFrame(() => {
    revealTargets().forEach((node) => {
      node.setAttribute('data-reveal', '');
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.96) {
        node.classList.add('is-visible');
      }
      observer.observe(node);
    });
  });
  setTimeout(() => {
    document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach((node) => node.classList.add('is-visible'));
  }, 900);
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const heroArt = document.querySelector('.hero .hero-art');
  if (heroArt) {
    window.addEventListener('scroll', () => {
      const y = Math.min(28, window.scrollY * 0.035);
      heroArt.style.setProperty('--parallax-y', y + 'px');
    }, { passive: true });
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

let deferredInstallPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

function createInstallButton() {
  if (isStandalone || document.querySelector('[data-install-app]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'install-app-button';
  button.dataset.installApp = '';
  button.textContent = "Installer l'application RCC";
  button.hidden = true;
  document.body.appendChild(button);

  button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    button.hidden = true;
  });
}

createInstallButton();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = document.querySelector('[data-install-app]');
  if (button && window.matchMedia('(max-width: 900px)').matches) {
    button.hidden = false;
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const button = document.querySelector('[data-install-app]');
  if (button) button.hidden = true;
});



// Alimente le bandeau transparent du hero avec le prochain match et la dernière actualité.
(() => {
  const matchSource = document.querySelector('[data-next-match]');
  const matchTarget = document.querySelector('[data-next-match-hero]');
  const newsGrid = document.querySelector('.news-grid');
  const newsRail = document.querySelector('[data-hero-news-rail]');
  const mobileNewsRail = window.matchMedia('(max-width: 720px)');

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const syncMatch = () => {
    if (!matchSource || !matchTarget) return;
    const title = clean(matchSource.querySelector('h3')?.textContent);
    const description = clean(matchSource.querySelector('p')?.textContent);
    const date = clean(matchSource.querySelector('[data-date], time, .match-date, .countdown-date')?.textContent);
    const titleTarget = matchTarget.querySelector('strong');
    const descriptionTarget = matchTarget.querySelector('.hero-match-content span');
    const dateTarget = matchTarget.querySelector('.hero-match-date');
    if (title && titleTarget) titleTarget.textContent = title;
    if (description && descriptionTarget) descriptionTarget.textContent = description;
    if (date && dateTarget) dateTarget.textContent = date;
  };

  const syncNews = () => {
    if (!newsGrid || !newsRail) return;
    const articles = [...newsGrid.querySelectorAll('article')].slice(0, 1);
    if (!articles.length) return;
    newsRail.innerHTML = '';
    articles.forEach((article, index) => {
      const sourceLink = article.querySelector('a[href]');
      const title = clean(article.querySelector('h3')?.textContent) || `Actualité ${index + 1}`;
      const link = document.createElement('a');
      link.href = mobileNewsRail.matches
        ? (sourceLink?.getAttribute('href') || article.dataset.newsUrl || './actualites.html')
        : './actualites.html';
      const number = document.createElement('span');
      number.textContent = 'Actualité';
      const strong = document.createElement('strong');
      strong.textContent = title;
      link.append(number, strong);
      newsRail.appendChild(link);
    });
  };

  syncMatch();
  syncNews();
  mobileNewsRail.addEventListener?.('change', syncNews);
  if (matchSource) new MutationObserver(syncMatch).observe(matchSource, { childList: true, subtree: true, characterData: true });
  if (newsGrid) new MutationObserver(syncNews).observe(newsGrid, { childList: true, subtree: true, characterData: true });
})();


// Fondu cinématique des photos du club dans le hero.
(() => {
  const hero = document.querySelector('[data-cinematic-hero]');
  if (!hero) return;
  const slides = [...hero.querySelectorAll('[data-cinematic-slide]')];
  if (slides.length < 2) return;

  let current = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null;

  const show = (index) => {
    slides[current]?.classList.remove('is-active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('is-active');
  };

  const start = () => {
    if (reducedMotion.matches || document.hidden || timer) return;
    timer = window.setInterval(() => show(current + 1), 8000);
  };

  const stop = () => {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  };

  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  reducedMotion.addEventListener?.('change', () => reducedMotion.matches ? stop() : start());
  start();
})();
