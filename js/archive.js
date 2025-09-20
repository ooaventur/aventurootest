(function () {
  'use strict';

  var basePath = window.AventurOOBasePath || {
    resolve: function (value) { return value; },
    resolveAll: function (values) { return Array.isArray(values) ? values.slice() : []; },
    articleUrl: function (slug) {
      return slug ? '/article.html?slug=' + encodeURIComponent(slug) : '#';
    },
    categoryUrl: function (slug) {
      if (!slug) return '#';
      return '/category.html?cat=' + encodeURIComponent(slug);
    }
  };

  var monthListEl = document.querySelector('[data-archive-months]');
  var postsContainer = document.querySelector('[data-archive-posts]');
  if (!monthListEl || !postsContainer) {
    return;
  }

  var statusEl = document.querySelector('[data-archive-status]');
  var headingEl = document.querySelector('[data-archive-heading]');
  var summaryEl = document.querySelector('[data-archive-summary]');

  var ARCHIVE_MANIFEST_SOURCES = basePath.resolveAll
    ? basePath.resolveAll(['/data/archive/index.json', 'data/archive/index.json'])
    : ['/data/archive/index.json', 'data/archive/index.json'];

  var archiveManifestPromise = null;
  var archiveMonths = [];
  var archiveMonthCache = Object.create(null);
  var activeMonth = '';
  var currentLoadToken = 0;

  function fetchSequential(urls) {
    if (!window.AventurOODataLoader || typeof window.AventurOODataLoader.fetchSequential !== 'function') {
      return Promise.reject(new Error('Data loader is not available'));
    }
    return window.AventurOODataLoader.fetchSequential(urls);
  }

  function sanitizeMonthKey(value) {
    if (value == null) return '';
    var trimmed = String(value).trim();
    if (!trimmed) return '';
    var normalized = trimmed.replace(/[^0-9-]/g, '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(normalized) ? normalized : '';
  }

  function formatMonthLabel(monthKey) {
    var sanitized = sanitizeMonthKey(monthKey);
    if (!sanitized) return '';
    var parts = sanitized.split('-');
    if (parts.length !== 2) return sanitized;
    var year = Number(parts[0]);
    var monthIndex = Number(parts[1]) - 1;
    var date = new Date(year, monthIndex, 1);
    if (Number.isNaN(date.getTime())) {
      return sanitized;
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  function parseManifestMonths(manifest) {
    if (!manifest || typeof manifest !== 'object') return [];
    var rawMonths = Array.isArray(manifest.months) ? manifest.months : [];
    var seen = Object.create(null);
    var months = [];

    rawMonths.forEach(function (entry) {
      var key = '';
      var count = 0;
      if (typeof entry === 'string') {
        key = sanitizeMonthKey(entry);
      } else if (entry && typeof entry === 'object') {
        key = sanitizeMonthKey(entry.key || entry.month || entry.id || entry.value);
        var rawCount = entry.count != null ? Number(entry.count) : Number(entry.total_entries || entry.total || entry.length);
        if (!Number.isNaN(rawCount) && Number.isFinite(rawCount)) {
          count = Math.max(0, Math.floor(rawCount));
        }
      }
      if (!key || seen[key]) return;
      seen[key] = true;
      months.push({ key: key, count: count });
    });

    months.sort(function (a, b) {
      if (a.key === b.key) return 0;
      return a.key < b.key ? 1 : -1;
    });
    return months;
  }

  function buildArchiveMonthSources(monthKey) {
    var sanitized = sanitizeMonthKey(monthKey);
    if (!sanitized) return [];
    var sources = ['/data/archive/' + sanitized + '.json', 'data/archive/' + sanitized + '.json'];
    return basePath.resolveAll ? basePath.resolveAll(sources) : sources;
  }

  function getArchiveManifest() {
    if (archiveManifestPromise) {
      return archiveManifestPromise;
    }
    archiveManifestPromise = fetchSequential(ARCHIVE_MANIFEST_SOURCES)
      .catch(function (err) {
        console.warn('archive manifest load error', err);
        return null;
      })
      .then(function (manifest) {
        return manifest && typeof manifest === 'object' ? manifest : null;
      });
    return archiveManifestPromise;
  }

  function loadArchiveMonth(monthKey) {
    var sanitized = sanitizeMonthKey(monthKey);
    if (!sanitized) {
      return Promise.resolve([]);
    }
    if (archiveMonthCache[sanitized]) {
      return archiveMonthCache[sanitized];
    }
    var sources = buildArchiveMonthSources(sanitized);
    if (!sources.length) {
      var empty = Promise.resolve([]);
      archiveMonthCache[sanitized] = empty;
      return empty;
    }
    var promise = fetchSequential(sources)
      .then(function (items) { return Array.isArray(items) ? items : []; })
      .catch(function (err) {
        console.warn('archive month load error', sanitized, err);
        return [];
      });
    archiveMonthCache[sanitized] = promise;
    return promise;
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    if (!message) {
      statusEl.textContent = '';
      statusEl.setAttribute('hidden', 'hidden');
      statusEl.classList.remove('text-danger');
      return;
    }
    statusEl.textContent = message;
    statusEl.removeAttribute('hidden');
    if (isError) {
      statusEl.classList.add('text-danger');
    } else {
      statusEl.classList.remove('text-danger');
    }
  }

  function updateHeading(monthKey) {
    if (!headingEl) return;
    var label = formatMonthLabel(monthKey);
    if (label) {
      headingEl.textContent = 'Archive — ' + label;
    } else {
      headingEl.textContent = 'Archive';
    }
  }

  function updateSummary(manifest) {
    if (!summaryEl) return;
    if (!manifest || typeof manifest !== 'object') {
      summaryEl.textContent = 'Browse past months of AventurOO coverage.';
      return;
    }
    var total = Number(manifest.total_entries);
    if (Number.isNaN(total) || !Number.isFinite(total) || total <= 0) {
      summaryEl.textContent = 'Browse past months of AventurOO coverage.';
      return;
    }
    summaryEl.textContent = 'Browse ' + total + ' archived stories from previous months.';
  }

  function updateQueryParam(monthKey) {
    if (typeof window === 'undefined' || !window.history || typeof window.history.replaceState !== 'function') {
      return;
    }
    try {
      var url = new URL(window.location.href);
      if (monthKey) {
        url.searchParams.set('month', monthKey);
      } else {
        url.searchParams.delete('month');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (err) {
      // Ignore URL update errors
    }
  }

  function escapeHtml(value) {
    return (value == null ? '' : String(value)).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function stripHtml(value) {
    if (value == null) return '';
    return String(value).replace(/<[^>]*>/g, ' ');
  }

  function slugify(value) {
    return (value || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\.html?$/i, '')
      .replace(/&/g, 'and')
      .replace(/[_\W]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      var parsed = Date.parse(value);
      if (Number.isNaN(parsed)) return String(value);
      date = new Date(parsed);
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function resolveArticleUrl(post) {
    if (!post) return '#';
    var slug = post.slug || slugify(post.title || '');
    if (!slug) return '#';
    return typeof basePath.articleUrl === 'function' ? basePath.articleUrl(slug) : '#';
  }

  function resolveCategoryLink(post) {
    if (!post) return '#';
    var rawSlug = post.category_slug || post.category;
    var slug = typeof rawSlug === 'string' ? rawSlug.trim().replace(/^\/+|\/+$/g, '') : '';
    if (!slug) {
      slug = slugify(post.category || '');
    }
    if (!slug) return '#';
    return typeof basePath.categoryUrl === 'function' ? basePath.categoryUrl(slug) : '#';
  }

  function resolveImage(post) {
    if (post && post.cover) {
      return basePath.resolve ? basePath.resolve(post.cover) : post.cover;
    }
    return basePath.resolve ? basePath.resolve('/images/logo.png') : '/images/logo.png';
  }

  function createArchiveCard(post) {
    if (!post || !post.title) return null;

    var link = escapeHtml(resolveArticleUrl(post));
    var image = escapeHtml(resolveImage(post));
    var title = escapeHtml(stripHtml(post.title));
    var category = post.category ? escapeHtml(post.category) : '';
    var categoryLink = category ? escapeHtml(resolveCategoryLink(post)) : '#';
    var date = post.date ? escapeHtml(formatDate(post.date)) : '';
    var archivedAt = post.archived_at ? escapeHtml(formatDate(post.archived_at)) : '';
    var excerptText = post.excerpt ? stripHtml(post.excerpt) : '';
    var excerpt = excerptText ? escapeHtml(excerptText) : '';

    var article = document.createElement('article');
    article.className = 'col-md-12 article-list archive-article';

    var inner = document.createElement('div');
    inner.className = 'inner';

    var figure = document.createElement('figure');
    figure.innerHTML = '<a href="' + link + '"><img src="' + image + '" alt="' + title + '"></a>';
    inner.appendChild(figure);

    var details = document.createElement('div');
    details.className = 'details';

    var detail = document.createElement('div');
    detail.className = 'detail';
    if (category) {
      detail.innerHTML += '<div class="category"><a href="' + categoryLink + '">' + category + '</a></div>';
    }
    if (date) {
      detail.innerHTML += '<time>' + date + '</time>';
    }
    details.appendChild(detail);

    var titleEl = document.createElement('h1');
    titleEl.innerHTML = '<a href="' + link + '">' + title + '</a>';
    details.appendChild(titleEl);

    if (excerpt) {
      var excerptEl = document.createElement('p');
      excerptEl.innerHTML = excerpt;
      details.appendChild(excerptEl);
    }

    if (archivedAt) {
      var meta = document.createElement('div');
      meta.className = 'archive-meta text-muted';
      meta.textContent = 'Archived on ' + archivedAt;
      details.appendChild(meta);
    }

    var footer = document.createElement('footer');
    footer.innerHTML = '<a class="btn btn-primary more" href="' + link + '"><div>Read</div><div><i class="ion-ios-arrow-thin-right"></i></div></a>';
    details.appendChild(footer);

    inner.appendChild(details);
    article.appendChild(inner);
    return article;
  }

  function renderPosts(list, monthKey) {
    postsContainer.innerHTML = '';
    if (!Array.isArray(list) || !list.length) {
      var empty = document.createElement('div');
      empty.className = 'col-xs-12';
      var label = formatMonthLabel(monthKey) || 'this month';
      empty.innerHTML = '<p class="text-muted">No archived posts for ' + escapeHtml(label) + ' yet.</p>';
      postsContainer.appendChild(empty);
      return;
    }

    list.forEach(function (post) {
      var card = createArchiveCard(post);
      if (card) {
        postsContainer.appendChild(card);
      }
    });
  }

  function renderMonthList() {
    monthListEl.innerHTML = '';
    if (!archiveMonths.length) {
      var placeholder = document.createElement('li');
      placeholder.className = 'archive-month-item text-muted';
      placeholder.textContent = 'No archive months available yet.';
      monthListEl.appendChild(placeholder);
      return;
    }

    archiveMonths.forEach(function (entry) {
      var item = document.createElement('li');
      item.className = 'archive-month-item';

      var button = document.createElement('button');
      button.type = 'button';
      button.className = entry.key === activeMonth ? 'btn btn-primary btn-sm' : 'btn btn-default btn-sm';
      button.setAttribute('data-archive-month', entry.key);
      button.textContent = formatMonthLabel(entry.key) || entry.key;
      item.appendChild(button);

      if (entry.count > 0) {
        var badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = entry.count;
        item.appendChild(badge);
      }

      monthListEl.appendChild(item);
    });
  }

  function handleMonthClick(event) {
    var target = event.target;
    while (target && target !== monthListEl) {
      if (target.hasAttribute('data-archive-month')) {
        var monthKey = target.getAttribute('data-archive-month') || '';
        monthKey = sanitizeMonthKey(monthKey);
        if (monthKey && monthKey !== activeMonth) {
          activeMonth = monthKey;
          renderMonthList();
          selectMonth(monthKey);
        }
        break;
      }
      target = target.parentElement;
    }
  }

  function selectMonth(monthKey) {
    var sanitized = sanitizeMonthKey(monthKey);
    if (!sanitized) return;
    activeMonth = sanitized;
    updateHeading(sanitized);
    updateQueryParam(sanitized);
    setStatus('Loading ' + (formatMonthLabel(sanitized) || sanitized) + '…');

    var loadId = ++currentLoadToken;
    loadArchiveMonth(sanitized)
      .then(function (items) {
        if (loadId !== currentLoadToken) return;
        setStatus('');
        renderPosts(items, sanitized);
      })
      .catch(function (err) {
        if (loadId !== currentLoadToken) return;
        console.warn('archive month view error', sanitized, err);
        setStatus('Unable to load this archive month.', true);
        renderPosts([], sanitized);
      });
  }

  function getInitialMonth() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return sanitizeMonthKey(params.get('month') || params.get('m'));
    } catch (err) {
      return '';
    }
  }

  function initArchive() {
    monthListEl.addEventListener('click', handleMonthClick);

    setStatus('Loading archive…');

    getArchiveManifest()
      .then(function (manifest) {
        if (!manifest) {
          setStatus('Archive data is not available yet.', true);
          updateSummary(null);
          renderMonthList();
          renderPosts([], '');
          return;
        }

        archiveMonths = parseManifestMonths(manifest);
        updateSummary(manifest);

        if (!archiveMonths.length) {
          setStatus('Archive data is not available yet.', true);
          renderMonthList();
          renderPosts([], '');
          return;
        }

        var preferred = getInitialMonth();
        if (!preferred || !archiveMonths.some(function (entry) { return entry.key === preferred; })) {
          preferred = archiveMonths[0].key;
        }

        activeMonth = preferred;
        renderMonthList();
        setStatus('');
        selectMonth(preferred);
      })
      .catch(function (err) {
        console.warn('archive manifest error', err);
        setStatus('Archive data is not available yet.', true);
        renderMonthList();
        renderPosts([], '');
      });
  }

  document.addEventListener('DOMContentLoaded', initArchive);
})();
