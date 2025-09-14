(function () {
  // --------- CONFIG & HELPERS ----------
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  // Burimi i të dhënave të menysë:
  // 1) data-menu-src në #menu-list (nëse e vendos)
  // 2) data/menu.json (relative)
  // 3) /data/menu.json (absolute)
  function getMenuSources() {
    var ctn = $('#menu-list');
    var srcAttr = ctn ? ctn.getAttribute('data-menu-src') : null;
    var list = [];
    if (srcAttr) list.push(srcAttr);
    list.push('data/menu.json', '/data/menu.json');
    return list;
  }

  function fetchSequential(urls) {
    return new Promise(function(resolve, reject){
      function tryNext(i){
        if (i >= urls.length) return reject(new Error('No menu.json found'));
        fetch(urls[i], { cache: 'no-store' })
          .then(function(r){ return r.ok ? resolve(r) : tryNext(i+1); })
          .catch(function(){ tryNext(i+1); });
      }
      tryNext(0);
    });
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildLink(aData) {
    var a = document.createElement('a');
    a.href = aData.href || '#';
    if (aData.icon) {
      // Ikona opsionale (Ionicons)
      a.innerHTML = '<i class="icon ' + aData.icon + '"></i> ' + (aData.title || '');
    } else {
      a.textContent = aData.title || '';
    }
    if (aData.target) a.target = aData.target;
    return a;
  }

  function buildDropdown(children) {
    var ul = el('ul', 'dropdown-menu');
    children.forEach(function (child) {
      if (child.divider) { ul.appendChild(el('li', 'divider')); return; }
      ul.appendChild(buildItem(child));
    });
    return ul;
  }

  function buildMegaColumns(cols) {
    var dd = el('div', 'dropdown-menu megamenu');
    var inner = el('div', 'megamenu-inner');
    var row = el('div', 'row');
    cols.forEach(function (col) {
      var c = el('div', 'col-md-3');
      if (col.title) c.appendChild(el('h2', 'megamenu-title', col.title));
      if (col.links && col.links.length) {
        var ul = el('ul', 'vertical-menu');
        col.links.forEach(function (lnk) {
          var li = document.createElement('li');
          li.appendChild(buildLink({ title: lnk.title, href: lnk.href || '#', target: lnk.target }));
          ul.appendChild(li);
        });
        c.appendChild(ul);
      }
      row.appendChild(c);
    });
    inner.appendChild(row); dd.appendChild(inner);
    return dd;
  }

  function buildItem(item) {
    var li = document.createElement('li');

    // Mega-menu
    if (item.megaColumns && item.megaColumns.length) {
      li.className = 'dropdown magz-dropdown magz-dropdown-megamenu';
      var a = buildLink({ title: item.title, href: item.href || '#' });
      a.innerHTML = (item.title || '') +
        ' <i class="ion-ios-arrow-right"></i>' +
        (item.badge ? ' <div class="badge">' + item.badge + '</div>' : '');
      li.appendChild(a);
      li.appendChild(buildMegaColumns(item.megaColumns));
      return li;
    }

    // Dropdown klasik
    if (item.children && item.children.length) {
      li.className = 'dropdown magz-dropdown';
      var a2 = buildLink({ title: item.title, href: item.href || '#' });
      a2.innerHTML = (item.title || '') +
        ' <i class="ion-ios-arrow-right"></i>' +
        (item.badge ? ' <div class="badge">' + item.badge + '</div>' : '');
      li.appendChild(a2);
      li.appendChild(buildDropdown(item.children));
      return li;
    }

    // Leaf
    li.appendChild(buildLink(item));
    return li;
  }

  function addTabletHeader(root, cfg) {
    if (!cfg || !cfg.show) return;
    var liTitle = el('li', 'for-tablet nav-title');
    liTitle.appendChild(el('a', null, cfg.title || 'Menu'));
    var liLogin = el('li', 'for-tablet');
    liLogin.appendChild(buildLink({ title: 'Login', href: cfg.loginHref || 'login.html' }));
    var liRegister = el('li', 'for-tablet');
    liRegister.appendChild(buildLink({ title: 'Register', href: cfg.registerHref || 'register.html' }));
    root.appendChild(liTitle);
    root.appendChild(liLogin);
    root.appendChild(liRegister);
  }

  // Active-state: gjej linkun që përputhet më mirë me URL-në aktuale
  function pathnameNoSlash(p){ return (p || '').replace(/\/+$/,''); }
  function matchScore(href) {
    var cur = pathnameNoSlash(location.pathname);
    var aPath;
    try { aPath = pathnameNoSlash(new URL(href, location.origin).pathname); }
    catch(e){ return -1; }
    if (!aPath) return -1;
    if (cur === aPath) return aPath.length + 1000; // saktësisht kjo faqe
    if (aPath !== '/' && cur.indexOf(aPath + '/') === 0) return aPath.length; // prind i shtegut
    return -1;
  }

  function applyActiveState(root) {
    var links = $all('a[href]', root);
    var best = { score: -1, a: null };
    links.forEach(function(a){
      var s = matchScore(a.getAttribute('href'));
      if (s > best.score) best = { score: s, a: a };
    });
    if (!best.a) return;

    // vendos 'active' te li i linkut dhe te prindërit dropdown/mega
    var li = best.a.closest('li');
    if (li) li.classList.add('active');

    var parent = li ? li.parentElement : null;
    while (parent) {
      var pli = parent.closest('li.dropdown');
      if (pli) pli.classList.add('active');
      parent = pli ? pli.parentElement : null;
    }
  }

  function renderMenu(data) {
    var root = document.querySelector('#menu-list .nav-list');
    if (!root) return;
    root.innerHTML = '';
    addTabletHeader(root, data.tabletHeader);
    (data.items || []).forEach(function (item) {
      root.appendChild(buildItem(item));
    });
    applyActiveState(root);
  }

  // ---------- BOOT ----------
  document.addEventListener('DOMContentLoaded', function () {
    var sources = getMenuSources();
    fetchSequential(sources)
      .then(function (r) { return r.json(); })
      .then(renderMenu)
      .catch(function (err) {
        console.error('Menu load error:', err);
        renderMenu({
          tabletHeader: { show: true },
          items: [{ title: 'Home', href: 'index.html' }]
        });
      });
  });
})();
