(function () {
  var POSTS_SOURCES = ['data/posts.json', '/data/posts.json'];

  function fetchSequential(urls) {
    return new Promise(function(resolve, reject){
      (function tryI(i){
        if (i >= urls.length) return reject(new Error('No posts.json found'));
        fetch(urls[i], { cache: 'no-store' })
          .then(function(r){ return r.ok ? resolve(r) : tryI(i + 1); })
          .catch(function(){ tryI(i + 1); });
      })(0);
    });
  }

  function slugify(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\.html?$/i, '')      // heq .html / .htm
      .replace(/&/g, 'and')
      .replace(/[^\w]+/g, '-')       // gjithçka jo-alfanumerike -> -
      .replace(/^-+|-+$/g, '');
  }

  function titleize(slug) {
    return (slug || '')
      .split('-')
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join(' ');
  }

  function getCatSub() {
    var articleUrl = '/article.html?slug=' + encodeURIComponent(p.slug);
'<a href="' + articleUrl + '"> ... </a>'

    var cat = slugify(url.searchParams.get('cat'));
    var sub = slugify(url.searchParams.get('sub'));

    if (!cat) {
      var parts = location.pathname.replace(/\/+$/, '').split('/'); // p.sh. ["", "news", "politics.html"]
      if (parts[1]) cat = slugify(parts[1]);
      if (parts[2]) sub = slugify(parts[2]);
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
    art.innerHTML =
      '<div class="inner">' +
        '<figure>' +
          '<a href="' + (p.source || '#') + '" target="_blank" rel="noopener">' +
            '<img src="' + (p.cover || '/images/news/img01.jpg') + '" alt="">' +
          '</a>' +
        '</figure>' +
        '<div class="details">' +
          '<div class="detail">' +
            '<div class="category"><a href="#">' + (p.category || '') + '</a></div>' +
            '<div class="time">' + (dateTxt || '') + '</div>' +
          '</div>' +
          '<h1><a href="' + (p.source || '#') + '" target="_blank" rel="noopener">' +
            (p.title || '') + '</a></h1>' +
          '<p>' + (p.excerpt || '') + '</p>' +
          '<footer>' +
            '<a class="btn btn-primary more" href="' + (p.source || '#') + '" target="_blank" rel="noopener">' +
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

  var ctx = getCatSub();
  patchHeader(ctx.cat, ctx.sub);

  fetchSequential(POSTS_SOURCES)
    .then(function (r) { return r.json(); })
    .then(function (all) {
      all = Array.isArray(all) ? all : [];
      var filtered = all.filter(function (p) {
        var pCat = slugify(p.category);
        var pSub = slugify(p.subcategory || p.sub || '');
        return ctx.sub ? (pCat === ctx.cat && pSub === ctx.sub) : (pCat === ctx.cat);
      });
      renderList(filtered);
    })
    .catch(function (err) {
      console.error('posts load error', err);
    });
})();
