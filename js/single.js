(function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || '';

  const basePath = window.AventurOOBasePath || {
    resolve: (value) => value,
    resolveAll: (values) => (Array.isArray(values) ? values.slice() : []),
    articleUrl: (slugValue) => `/article.html?slug=${encodeURIComponent(slugValue)}`,
    categoryUrl: (slugValue, subSlug) => {
      if (!slugValue) return '#';
      const query = `?cat=${encodeURIComponent(slugValue)}` + (subSlug ? `&sub=${encodeURIComponent(subSlug)}` : '');
      return `/category.html${query}`;
    }
  };

  const POSTS_SOURCES = basePath.resolveAll ? basePath.resolveAll(['/data/posts.json', 'data/posts.json']) : ['/data/posts.json', 'data/posts.json'];
  const articleContainer = document.querySelector('.main-article');

  function fetchSequential(urls) {
    if (!window.AventurOODataLoader || typeof window.AventurOODataLoader.fetchSequential !== 'function') {
      return Promise.reject(new Error('Data loader is not available'));
    }
    return window.AventurOODataLoader.fetchSequential(urls);
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

  function parseDateValue(value) {
    if (!value) return 0;
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  async function load() {
    if (!slug) {
      showError('Post not specified.');
      renderRelated([], null);
      return;
    }
    try {
   const data = await fetchSequential(POSTS_SOURCES);
      const posts = Array.isArray(data) ? data : [];
      const post = posts.find(p => p && p.slug === slug);
      if (!post) {
        showError('Post not found.');
        renderRelated(posts, null);
        return;
      }
      renderPost(post);
      renderRelated(posts, post);
    } catch (err) {
      console.error(err);
      showError('Failed to load post.');
      renderRelated([], null);
    }
  }

  function escapeHtml(s){return (s||"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));}
  function hostFrom(u){ try{ return new URL(u).hostname.replace(/^www\./,''); } catch(e){ return ''; } }
  function shortenUrl(u){
    try{
      const url = new URL(u);
      const host = url.hostname.replace(/^www\./,'');
      let path = (url.pathname || '/').replace(/\/+/g,'/').slice(0,60);
      if(path.length > 1 && path.endsWith('/')) path = path.slice(0,-1);
      return host + (path === '/' ? '' : path) + (url.search ? '…' : '');
    } catch(e){ return u; }
  }
  function titleizeHost(host){
    if(!host) return '';
    const base = host.split('.').slice(0,-1)[0].replace(/-/g,' ');
    return base ? base.replace(/\b\w/g,ch=>ch.toUpperCase()) : host;
  }

  function extractFirstImage(html) {
    if (!html) return '';
    const template = document.createElement('template');
    template.innerHTML = html;
    const img = template.content.querySelector('img[src]');
    if (!img) return '';
    const src = img.getAttribute('src');
    return src ? src.trim() : '';
  }

  function renderPost(post) {
    const titleEl = document.querySelector('.main-article header h1');
    if (titleEl) titleEl.textContent = post.title;

    const dateEl = document.querySelector('.main-article header .details .date');
    if (dateEl) {
      const date = new Date(post.date);
      if (!isNaN(date)) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = `Posted on ${date.toLocaleDateString(undefined, options)}`;
      } else {
        dateEl.textContent = post.date || '';
      }
    }

    const authorEl = document.querySelector('.main-article .details .author');
    if (authorEl) {
      let authorTxt = post.author;
      if (!authorTxt) {
        const host = hostFrom(post.source);
        authorTxt = post.source_name || titleizeHost(host) || host || '';
      }
      if (authorTxt) authorEl.textContent = `By ${authorTxt}`;
      else authorEl.remove();
    }

    const coverImg = document.querySelector('.main-article .featured img');
    if (coverImg) {
      const placeholderSrc = basePath.resolve ? basePath.resolve('/images/logo.png') : '/images/logo.png';
      let attemptedBodyFallback = false;
      let attemptedPlaceholder = false;
      const handleCoverError = () => {
        if (!attemptedBodyFallback) {
          attemptedBodyFallback = true;
          const fallbackSrc = extractFirstImage(post.body || post.content || '');
          if (fallbackSrc && coverImg.src !== fallbackSrc) {
            coverImg.src = fallbackSrc;
            return;
          }
        }
        if (!attemptedPlaceholder) {
          attemptedPlaceholder = true;
          if (coverImg.src !== placeholderSrc) {
            coverImg.src = placeholderSrc;
            return;
          }
        }
        coverImg.removeEventListener('error', handleCoverError);
        if (coverImg.parentElement) coverImg.remove();
      };

      coverImg.addEventListener('error', handleCoverError);

      coverImg.loading = 'lazy';
      coverImg.decoding = 'async';
      coverImg.referrerPolicy = 'no-referrer';
      coverImg.alt = (post.title || 'Cover') + (post.source_name ? (' — ' + post.source_name) : '');

      if (post.cover) {
        coverImg.src = basePath.resolve ? basePath.resolve(post.cover) : post.cover;
      } else {
        coverImg.removeEventListener('error', handleCoverError);
        coverImg.remove();
      }
    }

    const bodyEl = document.querySelector('.main-article .main');
    if (bodyEl) {
      bodyEl.innerHTML = post.body || post.content || '';
    }

    const sourceEl = document.querySelector('.main-article .source');
    if (sourceEl) {
      if (post.source) {
        const host = hostFrom(post.source);
        const name = post.source_name || titleizeHost(host) || host || 'Source';
        const shortHref = shortenUrl(post.source);
        sourceEl.innerHTML =
          'Source: <strong>' + escapeHtml(name) + '</strong> — ' +
          '<a href="' + escapeHtml(post.source) + '" target="_blank" rel="nofollow noopener noreferrer">' +
          escapeHtml(shortHref) + '</a>';
      } else {
        sourceEl.remove();
      }
    }

    const rightsEl = document.querySelector('.main-article .rights');
    if (rightsEl) {
      const host = hostFrom(post.source);
      const owner = (post.rights && post.rights !== 'Unknown')
        ? post.rights
        : (post.source_name || host || 'the original publisher');
      rightsEl.innerHTML =
        `This post cites partial content from <strong>${escapeHtml(owner)}</strong>. ` +
        `All material remains the property of the original author and publisher; ` +
        `we do not perform editorial modification and do not republish the full article. ` +
        `To read the complete piece, please visit the ` +
        `<a href="${escapeHtml(post.source || '')}" target="_blank" rel="nofollow noopener noreferrer">original page</a>.`;
    }
  }

  function renderRelated(allPosts, currentPost) {
    const container = document.getElementById('related-posts');
    if (!container) return;

    function showMessage(text) {
      container.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = 'col-xs-12 text-muted';
      empty.textContent = text;
      container.appendChild(empty);
    }

    if (!currentPost) {
      showMessage('Related posts not available.');
      return;
    }

    const list = Array.isArray(allPosts) ? allPosts : [];
    if (!list.length) {
      showMessage('No related posts yet.');
      return;
    }

    const currentSlug = currentPost.slug;
    const currentCat = slugify(currentPost.category);
    const currentSub = slugify(currentPost.subcategory || currentPost.sub || '');

    const candidates = [];

    function pushCandidates(items) {
      items.forEach(post => {
        if (!post || !post.slug || !post.title) return;
        if (post.slug === currentSlug) return;
        if (candidates.some(existing => existing.slug === post.slug)) return;
        candidates.push(post);
      });
    }

    if (currentCat && currentSub) {
      pushCandidates(list.filter(post =>
        slugify(post.category) === currentCat &&
        slugify(post.subcategory || post.sub || '') === currentSub
      ));
    }

    if (currentCat) {
      pushCandidates(list.filter(post => slugify(post.category) === currentCat));
    }

    pushCandidates(list);

    const selected = candidates
      .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date))
      .slice(0, 2);

    if (!selected.length) {
      showMessage('No related posts yet.');
      return;
    }

    container.innerHTML = '';
    selected.forEach(post => container.appendChild(createRelatedCard(post)));
  }

  function createRelatedCard(post) {
    const article = document.createElement('article');
    article.className = 'article related col-md-6 col-sm-6 col-xs-12';

  const articleUrl = basePath.articleUrl ? basePath.articleUrl(post.slug) : '/article.html?slug=' + encodeURIComponent(post.slug);

    const inner = document.createElement('div');
    inner.className = 'inner';

    const figure = document.createElement('figure');
    const figureLink = document.createElement('a');
    figureLink.href = articleUrl;

    const img = document.createElement('img');
    if (post.cover) {
      img.src = post.cover;
      img.alt = post.title || 'Related article';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer-when-downgrade';
    } else {
      img.src = basePath.resolve ? basePath.resolve('/images/logo.png') : '/images/logo.png';
      img.alt = 'AventurOO Logo';
    }
    figureLink.appendChild(img);
    figure.appendChild(figureLink);
    inner.appendChild(figure);

    const padding = document.createElement('div');
    padding.className = 'padding';

    const titleEl = document.createElement('h2');
    const titleLink = document.createElement('a');
    titleLink.href = articleUrl;
    titleLink.textContent = post.title || '';
    titleEl.appendChild(titleLink);
    padding.appendChild(titleEl);

    const detail = document.createElement('div');
    detail.className = 'detail';
    let hasDetail = false;

    if (post.category) {
      const catDiv = document.createElement('div');
      catDiv.className = 'category';
      const catLink = document.createElement('a');
      const catSlug = slugify(post.category);
      const subSlug = slugify(post.subcategory || post.sub || '');
      if (catSlug) {
        catLink.href = basePath.categoryUrl
          ? basePath.categoryUrl(catSlug, subSlug)
          : (subSlug
            ? `/category.html?cat=${encodeURIComponent(catSlug)}&sub=${encodeURIComponent(subSlug)}`
            : `/category.html?cat=${encodeURIComponent(catSlug)}`);
      } else {
        catLink.href = '#';
      }
      catLink.textContent = post.category;
      catDiv.appendChild(catLink);
      detail.appendChild(catDiv);
      hasDetail = true;
    }

    const formattedDate = formatDate(post.date);
    if (formattedDate) {
      const timeDiv = document.createElement('div');
      timeDiv.className = 'time';
      timeDiv.textContent = formattedDate;
      detail.appendChild(timeDiv);
      hasDetail = true;
    }

    if (hasDetail) {
      padding.appendChild(detail);
    }

    inner.appendChild(padding);
    article.appendChild(inner);
    return article;
  }

  function showError(message) {
    const article = document.querySelector('.main-article');
    if (article) {
      article.innerHTML = `<p>${message}</p>`;
    } else {
      document.body.innerHTML = `<p>${message}</p>`;
    }
  }

  load();
})();
