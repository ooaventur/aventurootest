(function () {
  var MENU_JSON_URL = '/data/menu.json';

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
      a.innerHTML = '<i class="icon ' + aData.icon + '"></i> ' + (aData.title || '');
    } else {
      a.textContent = aData.title || '';
    }
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
          li.appendChild(buildLink({ title: lnk.title, href: lnk.href || '#' }));
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

    if (item.megaColumns && item.megaColumns.length) {
      li.className = 'dropdown magz-dropdown magz-dropdown-megamenu';
      var a = buildLink({ title: item.title, href: item.href || '#' });
      a.innerHTML = (item.title || '') + ' <i class="ion-ios-arrow-right"></i>' + (item.badge ? ' <div class="badge">' + item.badge + '</div>' : '');
      li.appendChild(a);
      li.appendChild(buildMegaColumns(item.megaColumns));
      return li;
    }

    if (item.children && item.children.length) {
      li.className = 'dropdown magz-dropdown';
      var a2 = buildLink({ title: item.title, href: item.href || '#' });
      a2.innerHTML = (item.title || '') + ' <i class="ion-ios-arrow-right"></i>' + (item.badge ? ' <div class="badge">' + item.badge + '</div>' : '');
      li.appendChild(a2);
      li.appendChild(buildDropdown(item.children));
      return li;
    }

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

  function renderMenu(data) {
    var root = document.querySelector('#menu-list .nav-list');
    if (!root) return;
    root.innerHTML = '';
    addTabletHeader(root, data.tabletHeader);
    (data.items || []).forEach(function (item) {
      root.appendChild(buildItem(item));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetch(MENU_JSON_URL, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(renderMenu)
      .catch(function (err) {
        console.error('Menu load error:', err);
        renderMenu({ tabletHeader: { show: true }, items: [{ title: 'Home', href: 'index.html' }] });
      });
  });
})();
