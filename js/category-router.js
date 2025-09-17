(function () {
  var basePath = window.AventurOOBasePath || {
    sectionUrl: function (slug) {
      if (!slug) return '#';
      var normalized = String(slug).trim().replace(/^\/+|\/+$/g, '');
      return normalized ? '/' + normalized + '/' : '#';
    }
  };

  // --- Helpers ---
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function noSlash(s){ return (s||'').replace(/^\/+|\/+$/g,''); }
  function normalizeSlug(value){
    return noSlash((value || '')
      .toString()
      .trim())
      .toLowerCase()
      .replace(/\.html?$/i, '')
      .replace(/&/g, 'and')
      .replace(/[_\W]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function titleCaseFromSlug(slug){
    return (slug||'').split('-').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
  }

  // Parametrat nga URL
  var params = new URLSearchParams(location.search);
  var catSlug = normalizeSlug(params.get('cat') || '');
  var subSlug = normalizeSlug(params.get('sub') || '');

  // Fallback nëse s’ka cat
  if (!catSlug) { catSlug = 'news'; }
@@ -45,49 +53,50 @@
  }

  function findInTaxonomy(tax, catSlug, subSlug){
    var cat = (tax.categories || []).find(function(c){ return c.slug === catSlug; });
    var sub = cat && subSlug ? (cat.subs || []).find(function(s){ return s.slug === subSlug; }) : null;
    return { cat: cat, sub: sub };
  }

  function applyPageLabels(catTitle, subTitle){
    var crumbActive = $('.breadcrumb .active');
    var pageTitle   = $('.page-title');
    var pageSub     = $('.page-subtitle');

    var fullTitle = subTitle ? (catTitle + ' — ' + subTitle) : catTitle;

    if (crumbActive) crumbActive.textContent = subTitle || catTitle || 'Category';
    if (pageTitle)   pageTitle.textContent   = 'Category: ' + (subTitle || catTitle || 'News');
    if (pageSub)     pageSub.innerHTML       = 'Showing all posts with category <i>' + (subTitle || catTitle || 'News') + '</i>';

    // Ndrysho titullin e dokumentit
    document.title = fullTitle + ' — Magz';

    // Opsionale: vendos kategorinë si etiketë te artikujt demo
    $all('.article-list .details .detail .category a').forEach(function(a){
      a.textContent = catTitle || 'News';
      var href = basePath.sectionUrl ? basePath.sectionUrl(catSlug) : '/' + catSlug;
      a.setAttribute('href', href);
    });
  }

  function runWithTaxonomy(tax){
    var found = findInTaxonomy(tax, catSlug, subSlug);

    var catTitle = (found.cat && found.cat.title) || titleCaseFromSlug(catSlug);
    var subTitle = (found.sub && found.sub.title) || (subSlug ? titleCaseFromSlug(subSlug) : '');

    applyPageLabels(catTitle, subTitle);
  }

  // Nis
  document.addEventListener('DOMContentLoaded', function(){
    fetchSequential(TAXO_SOURCES)
      .then(function(r){ return r.json(); })
      .then(runWithTaxonomy)
      .catch(function(){
        // Fallback pa taxonomy.json
        applyPageLabels(titleCaseFromSlug(catSlug), subSlug ? titleCaseFromSlug(subSlug) : '');
      });
  });
})();
