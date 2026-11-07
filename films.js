(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const dateLong = value => new Intl.DateTimeFormat('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  }).format(new Date(value + 'T12:00:00'));
  const dateMonth = value => new Intl.DateTimeFormat('en-GB', {
    month:'long', year:'numeric'
  }).format(new Date(value + 'T12:00:00'));
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && value != null) el.textContent = value;
  };
  const setAttr = (selector, name, value) => {
    const el = document.querySelector(selector);
    if (el && value) el.setAttribute(name, value);
  };
  const meta = parts => parts.filter(Boolean).map(esc).join(' <span>·</span> ');
  const trailer = (film, prefix) => {
    setAttr('[data-' + prefix + '-trailer]', 'src', film.trailerEmbed);
    setAttr('[data-' + prefix + '-trailer]', 'title', film.title + ' official trailer');
    const link = document.querySelector('[data-' + prefix + '-trailer-link]');
    if (link && film.trailerUrl) {
      link.href = film.trailerUrl;
      link.textContent = 'watch the official trailer on ' + (film.trailerSource || 'the film website') + ' ↗';
    }
  };

  function renderCurrent(film) {
    setText('[data-current-title]', film.title);
    setText('[data-current-date]', dateLong(film.screeningDate) + ' · ' + film.screeningTime);
    setText('[data-current-synopsis]', film.synopsis);
    setText('[data-current-rating]', film.rating);
    setText('[data-current-breadcrumb]', film.title);
    setText('[data-current-meta]', '');
    const metaEl = document.querySelector('[data-current-meta]');
    if (metaEl) metaEl.innerHTML = meta([film.year, film.genre, film.runtime]);
    setAttr('[data-current-poster]', 'src', film.poster);
    setAttr('[data-current-poster]', 'alt', film.posterAlt || (film.title + ' poster'));
    trailer(film, 'current');
    document.title = film.title + ' — Ringstead Cinema';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = film.title + ' at Ringstead Cinema, ' + dateLong(film.screeningDate) + ' at ' + film.screeningTime + '.';
  }

  function renderComing(film) {
    setText('[data-coming-title]', film.title);
    setText('[data-coming-date]', dateLong(film.screeningDate) + ' · ' + film.screeningTime);
    setText('[data-coming-date-short]', dateLong(film.screeningDate));
    setText('[data-coming-synopsis]', film.synopsis);
    setText('[data-coming-rating]', film.rating);
    const metaEl = document.querySelector('[data-coming-meta]');
    if (metaEl) metaEl.innerHTML = meta([film.year, film.runtime, film.rating ? 'Certificate ' + film.rating : '']);
    setText('[data-coming-director]', film.director);
    setText('[data-coming-cast]', film.cast);
    setText('[data-coming-distributor]', film.distributor);
    trailer(film, 'coming');
    const infoTitle = document.querySelector('[data-coming-page-title]');
    if (infoTitle) document.title = film.title + ' — Coming Soon at Ringstead Cinema';
    const description = document.querySelector('meta[name="description"]');
    if (description && document.querySelector('[data-coming-page-title]')) {
      description.content = film.title + ' at Ringstead Cinema, ' + dateLong(film.screeningDate) + '.';
    }
  }

  function renderRecent(films) {
    const target = document.querySelector('[data-recent-films]');
    if (!target) return;
    target.innerHTML = films.slice(0, 3).map(film => `
      <a class="past-card" href="past-films.html#${esc(film.id)}">
        <img src="${esc(film.poster)}" alt="${esc(film.posterAlt || (film.title + ' poster'))}">
        <span><strong>${esc(film.title)}</strong><small>${esc(film.month)}</small></span>
      </a>`).join('');
  }

  function renderArchive(films) {
    const target = document.querySelector('[data-archive-films]');
    if (!target) return;
    target.innerHTML = films.map(film => `
      <article id="${esc(film.id)}" class="archive-card">
        <img src="${esc(film.poster)}" alt="${esc(film.posterAlt || (film.title + ' poster'))}">
        <div><span class="eyebrow">${esc(film.month)}</span><h2>${esc(film.title)}</h2>
        <p>${esc(film.genre || '')}</p>
        ${film.informationUrl ? '<a class="text-link" href="' + esc(film.informationUrl) + '" target="_blank" rel="noopener">Film information ↗</a>' : ''}
        </div>
      </article>`).join('');
  }

  async function init() {
    try {
      const response = await fetch('films.json', {cache:'no-cache'});
      if (!response.ok) throw new Error('Film information could not be loaded.');
      const data = await response.json();
      if (data.current) renderCurrent(data.current);
      if (data.comingSoon) renderComing(data.comingSoon);
      if (Array.isArray(data.previousScreenings)) {
        renderRecent(data.previousScreenings);
        renderArchive(data.previousScreenings);
      }
    } catch (error) {
      console.error('Ringstead Cinema film data:', error);
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();