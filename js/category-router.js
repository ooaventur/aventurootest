(function () {
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

  // Burimet e mundshme për taxonomy
  var TAXO_SOURCES = [
    'data/taxonomy.json',
    '/data/taxonomy.json',
    'data/toxanomi.json',
    '/data/toxanomi.json'
  ];

  function fetchSequential(urls) {
    return new Promise(function(resolve, reject){
      (function tryI(i){
        if (i >= urls.length) return reject(new Error('No taxonomy file found'));
        fetch(urls[i], { cache: 'no-store' })
          .then(function(r){ return r.ok ? resolve(r) : tryI(i+1); })
          .catch(function(){ tryI(i+1); });
      })(0);
    });
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
      a.setAttribute('href', '/' + catSlug);
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
