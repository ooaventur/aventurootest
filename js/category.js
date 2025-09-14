(function() {
  // lexon cat/sub nga query ose nga path
  function qp(k){ return new URLSearchParams(location.search).get(k) || ''; }
  var cat = (qp('cat') || (location.pathname.split('/')[1] || '')).toLowerCase();
  var sub = (qp('sub') || (location.pathname.split('/')[2] || '')).toLowerCase();

  function titleCase(s){ return (s||'').replace(/[-_]/g,' ')
    .replace(/\b\w/g, m=>m.toUpperCase()).trim(); }

  var bcActive = document.querySelector('.breadcrumb .active');
  var pageTitle = document.querySelector('.page-title');
  var pageSubtitle = document.querySelector('.page-subtitle');
  var listRoot = document.getElementById('post-list');

  var label = titleCase(cat) + (sub ? ' — ' + titleCase(sub) : '');
  if (bcActive) bcActive.textContent = titleCase(sub || cat);
  if (pageTitle) pageTitle.textContent = 'Category: ' + label;
  if (pageSubtitle) pageSubtitle.innerHTML = 'Showing all posts with category <i>' + label + '</i>';

  function articleHTML(p){
    var hrefSingle = '/single.html?slug=' + encodeURIComponent(p.slug);
    var catLabel = titleCase(p.category) + (p.subcategory ? ' / ' + titleCase(p.subcategory) : '');
    return (
      '<article class="col-md-12 article-list">' +
        '<div class="inner">' +
          '<figure><a href="'+ hrefSingle +'"><img src="'+ (p.cover||'/images/news/img01.jpg') +'" alt=""></a></figure>' +
          '<div class="details">' +
            '<div class="detail">' +
              '<div class="category"><a href="#">'+ catLabel +'</a></div>' +
              '<div class="time">'+ (p.date||'') +'</div>' +
            '</div>' +
            '<h1><a href="'+ hrefSingle +'">'+ (p.title||'') +'</a></h1>' +
            '<p>'+ (p.excerpt||'') +'</p>' +
            '<footer>' +
              '<a class="btn btn-primary more" href="'+ hrefSingle +'"><div>More</div><div><i class="ion-ios-arrow-thin-right"></i></div></a>' +
            '</footer>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  fetch('/data/posts.json', {cache:'no-store'})
    .then(r => r.json())
    .then(items => {
      if (!Array.isArray(items)) items = [];
      var out = [];
      for (var i=0;i<items.length;i++){
        var p = items[i] || {};
        var c = (p.category||'').toLowerCase();
        var s = (p.subcategory||'').toLowerCase();
        if (!s && c.includes('/')) { var parts=c.split('/',2); c=parts[0]; s=parts[1]||''; }
        if (c !== cat) continue;
        if (sub && s !== sub) continue;
        out.push(p);
      }
      var html = out.slice(0, 8).map(articleHTML).join('') || '<p><em>No posts yet for this category.</em></p>';
      if (listRoot) listRoot.innerHTML = html;
    })
    .catch(err => {
      if (listRoot) listRoot.innerHTML = '<p><em>Could not load posts.</em></p>';
      console.error(err);
    });
})();

