(function () {
  var POSTS_SOURCES = ['/data/posts.json', 'data/posts.json'];

  function fetchSequential(urls) {
    if (!window.AventurOODataLoader || typeof window.AventurOODataLoader.fetchSequential !== 'function') {
      return Promise.reject(new Error('Data loader is not available'));
    }
    return window.AventurOODataLoader.fetchSequential(urls);
  }

  function slugify(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\.html?$/i, '')      // heq .html / .htm
      .replace(/&/g, 'and')
      .replace(/[_\W]+/g, '-')       // gjithçka jo-alfanumerike ose _ -> -
      .replace(/^-+|-+$/g, '');
  }

  function titleize(slug) {
    return (slug || '')
      .split('-')
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join(' ');
  }
  function escapeHtml(str) {
    return (str == null ? '' : String(str))
      .replace(/[&<>"']/g, function (ch) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[ch];
      });
  }

  function getPostTimestamp(post) {
    if (!post) return 0;
    var candidates = [post.date, post.updated_at, post.published_at, post.created_at];
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i];
      if (!value) continue;
      var time = Date.parse(value);
      if (!isNaN(time)) return time;
    }
    return 0;
  }

  function formatDateString(dateValue) {
    if (!dateValue) return '';
    var raw = String(dateValue);
    var parts = raw.split('T');
    return parts[0] || raw;
  }

  function buildArticleUrl(post) {
    if (!post) return '#';
    var slug = post.slug ? encodeURIComponent(post.slug) : '';
    return slug ? '/article.html?slug=' + slug : '#';
  }

 const url = new URL(window.location.href);

  function getCatSub() {
    var cat = slugify(url.searchParams.get('cat'));
    var sub = slugify(url.searchParams.get('sub'));

    if (!cat) {
      var parts = location.pathname.replace(/\/+$/, '').split('/'); // p.sh. ["", "news", "politics.html"]
      if (parts[1]) cat = slugify(parts[1]);
      if (parts[2]) {
        var p2 = parts[2];
        if (p2 !== 'index' && p2 !== 'index.html') sub = slugify(p2);
      }
    }

    // opsionale: lexo edhe data-attr në <body data-cat="..." data-sub="...">
    var body = document.body;
    if (!cat && body.dataset.cat) cat = slugify(body.dataset.cat);
    if (!sub && body.dataset.sub) sub = slugify(body.dataset.sub);

    return { cat: cat, sub: sub };
  }

  function patchHeader(cat, sub) {
    var bc = document.querySelector('.breadcrumb');
    if (bc) {
      bc.innerHTML =
        '<li><a href="/">Home</a></li>' +
        (cat ? '<li><a href="/' + cat + '">' + titleize(cat) + '</a></li>' : '') +
        (sub ? '<li class="active">' + titleize(sub) + '</li>' : '');
    }
    var h1 = document.querySelector('.page-title');
    if (h1) h1.textContent = 'Category: ' + titleize(cat) + (sub ? ' — ' + titleize(sub) : '');
    var subt = document.querySelector('.page-subtitle');
    if (subt) subt.innerHTML = 'Showing all posts with category <i>' +
      titleize(cat) + (sub ? ' — ' + titleize(sub) : '') + '</i>';
  }

  function renderPost(p) {
    var dateTxt = (p.date || '').split('T')[0];
    var art = document.createElement('article');
    art.className = 'col-md-12 article-list';
    var articleUrl = '/article.html?slug=' + encodeURIComponent(p.slug);
    var figureHtml;
    if (p.cover) {
      figureHtml =
        '<figure>' +
          '<a href="' + articleUrl + '">' +
            '<img src="' + p.cover + '" alt="">' +
          '</a>' +
        '</figure>';
    } else {
      figureHtml =
        '<figure class="no-cover">' +
          '<a href="' + articleUrl + '">' +
            '<img src="/images/logo.png" alt="AventurOO Logo">' +
          '</a>' +
        '</figure>';
    }
    art.innerHTML =
      '<div class="inner">' +
        figureHtml +
        '<div class="details">' +
          '<div class="detail">' +
            '<div class="category"><a href="#">' + (p.category || '') + '</a></div>' +
            '<div class="time">' + (dateTxt || '') + '</div>' +
          '</div>' +
          '<h1><a href="' + articleUrl + '">' +
            (p.title || '') + '</a></h1>' +
          '<p>' + (p.excerpt || '') + '</p>' +
          '<footer>' +
            '<a class="btn btn-primary more" href="' + articleUrl + '">' +
              '<div>More</div><div><i class="ion-ios-arrow-thin-right"></i></div>' +
            '</a>' +
          '</footer>' +
        '</div>' +
      '</div>';
    return art;
  }

  function renderList(posts) {
    var box = document.getElementById('post-list');
    if (!box) return;
    box.innerHTML = '';
    if (!posts.length) {
      box.innerHTML = '<p class="lead">No posts yet for this category.</p>';
      return;
    }
    posts.forEach(function (p) { box.appendChild(renderPost(p)); });
  }


  function createSidebarArticle(post, variant) {
    var article = document.createElement('article');
    var articleUrl = buildArticleUrl(post);
    var title = escapeHtml(post && post.title ? post.title : '');
    var category = escapeHtml(post && post.category ? post.category : '');
    var excerpt = escapeHtml(post && post.excerpt ? post.excerpt : '');
    var dateTxt = escapeHtml(formatDateString(post && post.date));
    var cover = post && post.cover ? escapeHtml(post.cover) : '/images/logo.png';
    var figureClass = post && post.cover ? '' : ' class="no-cover"';

    if (variant === 'full') {
      article.className = 'article-fw';
      article.innerHTML =
        '<div class="inner">' +
          '<figure' + figureClass + '>' +
            '<a href="' + articleUrl + '">' +
              '<img src="' + cover + '" alt="' + title + '">' +
            '</a>' +
          '</figure>' +
          '<div class="details">' +
            '<div class="detail">' +
              '<div class="category"><a href="#">' + category + '</a></div>' +
              '<div class="time">' + dateTxt + '</div>' +
            '</div>' +
            '<h1><a href="' + articleUrl + '">' + title + '</a></h1>' +
            '<p>' + excerpt + '</p>' +
          '</div>' +
        '</div>';
    } else {
      article.className = 'article-mini';
      article.innerHTML =
        '<div class="inner">' +
          '<figure' + figureClass + '>' +
            '<a href="' + articleUrl + '">' +
              '<img src="' + cover + '" alt="' + title + '">' +
            '</a>' +
          '</figure>' +
          '<div class="padding">' +
            '<h1><a href="' + articleUrl + '">' + title + '</a></h1>' +
            '<div class="detail">' +
              '<div class="category"><a href="#">' + category + '</a></div>' +
              '<div class="time">' + dateTxt + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    return article;
  }

  function createLineDivider() {
    var line = document.createElement('div');
    line.className = 'line';
    return line;
  }

  function appendFallbackMessage(container, text) {
    if (!container) return;
    var message = document.createElement('p');
    message.className = 'text-muted sidebar-fallback';
    message.textContent = text;
    container.appendChild(message);
  }

  function renderRecentSidebar(posts) {
    var container = document.getElementById('sidebar-recent-posts');
    if (!container) return;
    container.innerHTML = '';

    if (!posts.length) {
      appendFallbackMessage(container, 'No recent posts available.');
      return;
    }

    var first = posts[0];
    if (first) {
      container.appendChild(createSidebarArticle(first, 'full'));
    }

    var minis = posts.slice(1, 3);
    if (minis.length) {
      container.appendChild(createLineDivider());
      minis.forEach(function (post) {
        container.appendChild(createSidebarArticle(post, 'mini'));
      });
    }

    if (posts.length < 3) {
      appendFallbackMessage(container, 'Only ' + posts.length + ' recent post' + (posts.length === 1 ? '' : 's') + ' available.');
    }
  }

  function renderMiniSidebar(posts) {
    var container = document.getElementById('sidebar-mini-articles');
    if (!container) return;
    container.innerHTML = '';

    if (!posts.length) {
      appendFallbackMessage(container, 'No additional stories available.');
      return;
    }

    posts.forEach(function (post) {
      container.appendChild(createSidebarArticle(post, 'mini'));
    });

    if (posts.length < 10) {
      appendFallbackMessage(container, 'No more stories available.');
    }
  }

  var ctx = getCatSub();
  patchHeader(ctx.cat, ctx.sub);

  fetchSequential(POSTS_SOURCES)
    .then(function (all) {
      all = Array.isArray(all) ? all : [];
      var allSorted = all.slice().sort(function (a, b) {
        return getPostTimestamp(b) - getPostTimestamp(a);
      });
      var filtered = all.filter(function (p) {
        var pCat = slugify(p.category);
        var pSub = slugify(p.subcategory || p.sub || '');
        return ctx.sub ? (pCat === ctx.cat && pSub === ctx.sub) : (pCat === ctx.cat);
      });

      var sortedByDate = filtered.slice().sort(function (a, b) {
        return getPostTimestamp(b) - getPostTimestamp(a);
      });

      renderRecentSidebar(allSorted.slice(0, 3));
      var additionalPosts = allSorted.slice(3, 13);
      renderMiniSidebar(additionalPosts);

      var PER_PAGE = 12;
      var pageParam = parseInt(url.searchParams.get('page'), 10);
      var page = !isNaN(pageParam) && pageParam > 0 ? pageParam : 1;
      var totalPages = Math.ceil(filtered.length / PER_PAGE);
      if (totalPages > 0 && page > totalPages) page = totalPages;

      var start = (page - 1) * PER_PAGE;
      var pagedPosts = filtered.slice(start, start + PER_PAGE);
      renderList(pagedPosts);

      if (typeof renderPagination === 'function') {
        var baseQuery = '?cat=' + ctx.cat + (ctx.sub ? '&sub=' + ctx.sub : '');
        renderPagination('pagination', filtered.length, PER_PAGE, page, baseQuery);
      }

      var infoBox = document.getElementById('pagination-info');
      if (infoBox) {
        var displayPage = totalPages === 0 ? 0 : page;
        infoBox.textContent = 'Showing ' + pagedPosts.length + ' results of ' + filtered.length + ' — Page ' + displayPage + ' of ' + totalPages;
      }
    })
    .catch(function (err) {
      console.error('posts load error', err);
    });
})();
