(function () {
  'use strict';

  const FALLBACK_IMAGE = './assets/uploads/img21739872392103.jpg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  };

  const localImage = (value) => {
    if (!value) return FALLBACK_IMAGE;
    try {
      const url = new URL(value, window.location.href);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : FALLBACK_IMAGE;
    } catch { return FALLBACK_IMAGE; }
  };

  const articleImage = (article) => {
    if (article.source !== 'facebook') return localImage(article.image);
    try {
      const url = new URL(article.image);
      return String(article.image).length <= 4096 && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
        ![...url.searchParams.keys()].some(key => /token|appsecret|authorization/i.test(key)) &&
        ['fbcdn.net', 'fbsbx.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : FALLBACK_IMAGE;
    } catch { return FALLBACK_IMAGE; }
  };

  const articleUrl = (article, index) => {
    const id = article.id || article.slug || `${article.date || index}-${article.title || 'actualite'}`;
    return `./actualite.html?id=${encodeURIComponent(id)}`;
  };

  function setupHeader() {
    const header = document.querySelector('.site-header');
    const nav = document.querySelector('[data-nav]');
    const toggle = document.querySelector('[data-menu-toggle]');
    if (!header || !nav || !toggle) return;

    let queued = false;
    const updateHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 28);
      queued = false;
    };
    window.addEventListener('scroll', () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(updateHeader);
      }
    }, { passive: true });
    updateHeader();

    const syncMenu = () => {
      const open = nav.classList.contains('is-open');
      document.body.classList.toggle('co-menu-open', open);
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    };
    new MutationObserver(syncMenu).observe(nav, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) toggle.click();
    });
    syncMenu();
  }

  /* Nouveau bloc : cluster utilitaire cote droit de l'en-tete (boutique + CTA),
     injecte en JS pour apparaitre uniformement sur toutes les pages sans dupliquer
     de HTML -- rien n'est retire, ce sont des liens vers des pages deja existantes. */
  function setupHeaderUtility() {
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('[data-menu-toggle]');
    /* Le design V3.6.3 fournit deja son propre cluster natif (.header-quicklinks,
       ecrit dans le HTML) : ne pas injecter le notre par-dessus. */
    if (!header || !toggle || header.querySelector('.co-header-utility') || header.querySelector('.header-quicklinks')) return;

    const utility = document.createElement('div');
    utility.className = 'co-header-utility';
    utility.innerHTML = `
      <a href="./boutique.html" class="co-header-utility-icon" aria-label="Boutique" title="Boutique">🛍</a>
      <a href="./nous-rejoindre.html" class="co-header-utility-cta">Nous rejoindre</a>
    `;
    toggle.insertAdjacentElement('afterend', utility);
  }

  async function setupHero() {
    const hero = document.querySelector('[data-co-hero]');
    if (!hero) return;

    const content = hero.querySelector('[data-co-hero-content]');
    const story = hero.querySelector('[data-co-hero-story]');
    const title = hero.querySelector('[data-co-hero-title]');
    const summary = hero.querySelector('[data-co-hero-summary]');
    const meta = hero.querySelector('[data-co-hero-meta]');
    const primary = hero.querySelector('[data-co-hero-primary]');
    const media = hero.querySelector('[data-cinematic-hero]');
    const images = [...hero.querySelectorAll('[data-co-hero-image], [data-cinematic-slide]')];
    const controls = hero.querySelector('[data-co-hero-controls]');
    const dots = hero.querySelector('[data-co-hero-dots]');
    const previous = hero.querySelector('[data-co-hero-previous]');
    const next = hero.querySelector('[data-co-hero-next]');
    let articles = [];
    let active = 0;
    let imageLayer = 0;
    let interval = 0;
    let transition = 0;
    let paused = false;
    let imageRequest = 0;
    let refreshPending = false;

    const loadArticles = async () => {
      const [manual, facebook] = await Promise.all([
        fetch('./data/news.json', {cache:'no-store'}).then(r => {if (!r.ok) throw new Error('manual_news'); return r.json();}),
        fetch('/api/facebook-news?limit=20', {cache:'no-store', signal:AbortSignal.timeout(6000)})
          .then(r => {if (!r.ok) throw new Error('facebook_news'); return r.json();})
          .catch(() => ({news:[]}))
      ]);
      const combined = [...(Array.isArray(manual) ? manual : manual.news || []),
        ...(Array.isArray(facebook.news) ? facebook.news.map(item => ({...item, source:'facebook'})) : [])];
      return [...new Map(combined.filter(item => item.published !== false).map((item,index) =>
        [item.id || item.slug || `manual-${index}`, item])).values()]
        .sort((a,b) => (Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,3);
    };

    try {
      articles = await loadArticles();
    } catch (error) {
      console.warn('[RCC redesign] Hero actualités indisponible.', error.message);
    }

    if (!articles.length) {
      controls.hidden = true;
      return;
    }
    // The article carousel now owns these existing image layers; stop unrelated
    // cinematic photos without changing their CSS, gradients or object-fit.
    if (media) media.dataset.newsManaged = 'true';

    const updateDots = () => {
      [...dots.children].forEach((dot, index) => dot.setAttribute('aria-current', String(index === active)));
    };

    const swapImage = (article) => {
      if (!images.length) return;
      const request = ++imageRequest;
      const nextLayer = imageLayer === 0 ? 1 : 0;
      const target = images[nextLayer] || images[0];
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      const src = articleImage(article);
      image.onload = () => {
        if (request !== imageRequest) return;
        target.referrerPolicy = 'no-referrer';
        target.src = image.src;
        images.forEach(layer => layer.classList.remove('is-active'));
        target.classList.add('is-active');
        imageLayer = images.indexOf(target);
      };
      image.onerror = () => {
        if (request !== imageRequest || image.dataset.fallback === 'true') return;
        image.dataset.fallback = 'true';
        image.src = FALLBACK_IMAGE;
      };
      // Keep the complete signed URL. Browser cache keys include its query,
      // so a renewed signature cannot reuse the expired URL's response.
      image.src = src;
    };

    const applyArticle = (article, index) => {
      const url = articleUrl(article, index);
      title.textContent = article.title || 'Actualité du RCC';
      summary.textContent = String(article.summary || article.body || 'Retrouvez les dernières nouvelles du Racing Club Cubzaguais.').replace(/\s+/g, ' ').trim();
      meta.textContent = [article.category || 'Club', formatDate(article.date)].filter(Boolean).join(' · ');
      story.href = url;
      story.setAttribute('aria-label', `Lire l’actualité : ${article.title || 'Actualité du RCC'}`);
      if (primary) primary.href = url;
      swapImage(article);
      updateDots();
    };

    const show = (index, immediate) => {
      active = (index + articles.length) % articles.length;
      window.clearTimeout(transition);
      if (immediate || reduceMotion) {
        applyArticle(articles[active], active);
        content.classList.remove('is-changing');
        return;
      }
      content.classList.add('is-changing');
      transition = window.setTimeout(() => {
        applyArticle(articles[active], active);
        content.classList.remove('is-changing');
      }, 260);
    };

    const stop = () => window.clearInterval(interval);
    const start = () => {
      stop();
      if (!reduceMotion && articles.length > 1 && !paused && !document.hidden) {
        interval = window.setInterval(() => show(active + 1, false), 6000);
      }
    };
    const select = (index) => { show(index, false); start(); };

    const renderDots = () => {
      dots.innerHTML = articles.map((article, index) => `<button class="co-hero-dot" type="button" aria-label="Afficher l’actualité ${index + 1}" aria-current="${index === active}"></button>`).join('');
      [...dots.children].forEach((dot, index) => dot.addEventListener('click', () => select(index)));
    };
    renderDots();
    previous.addEventListener('click', () => select(active - 1));
    next.addEventListener('click', () => select(active + 1));
    hero.addEventListener('mouseenter', () => { paused = true; stop(); });
    hero.addEventListener('mouseleave', () => { paused = false; start(); });
    hero.addEventListener('focusin', () => { paused = true; stop(); });
    hero.addEventListener('focusout', (event) => {
      if (!hero.contains(event.relatedTarget)) { paused = false; start(); }
    });
    const refresh = async () => {
      if (document.hidden || refreshPending) return;
      refreshPending = true;
      try {
        const fresh = await loadArticles();
        if (fresh.length) {
          const id = articles[active]?.id;
          articles = fresh;
          active = Math.max(0, articles.findIndex(article => article.id === id));
          renderDots();
          show(active, true);
          controls.hidden = articles.length < 2;
        }
      } catch { /* Keep the already displayed articles if a refresh fails. */ }
      finally {refreshPending = false;start();}
    };
    document.addEventListener('visibilitychange', () => {start();if (!document.hidden) refresh();});
    window.addEventListener('pageshow', event => {if (event.persisted) refresh();});

    controls.hidden = articles.length < 2;
    show(0, true);
    start();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupHeader();
    setupHeaderUtility();
    setupHero();
  });
})();
