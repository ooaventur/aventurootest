(function () {
  var basePath = window.AventurOOBasePath || {
    resolve: function (value) { return value; },
    resolveAll: function (values) { return Array.isArray(values) ? values.slice() : []; },
    articleUrl: function (slug) { return slug ? '/article.html?slug=' + encodeURIComponent(slug) : '#'; },
    categoryUrl: function (slug) {
      if (!slug) return '#';
      return '/category.html?cat=' + encodeURIComponent(slug);
    },
    sectionUrl: function (slug) {
      if (!slug) return '#';
      var normalized = String(slug).trim().replace(/^\/+|\/+$/g, '');
      return normalized ? '/' + normalized + '/' : '#';
    }
  };

  var DEFAULT_IMAGE = basePath.resolve ? basePath.resolve('/images/logo.png') : '/images/logo.png';
  var HOME_URL = basePath.resolve ? basePath.resolve('/') : '/';
  var POSTS_MANIFEST_SOURCES = ['/data/posts/manifest.json', 'data/posts/manifest.json'];
  var LEGACY_POSTS_SOURCES = ['/data/posts.json', 'data/posts.json'];

  var TAXONOMY_SOURCES = ['/data/taxonomy.json', 'data/taxonomy.json'];

  function fetchSequential(urls) {
    if (!window.AventurOODataLoader || typeof window.AventurOODataLoader.fetchSequential !== 'function') {
      return Promise.reject(new Error('Data loader is not available'));
    }
    return window.AventurOODataLoader.fetchSequential(urls);
  }
  function manifestCategoryEntry(manifest, slug) {
    if (!manifest || typeof manifest !== 'object') return null;
    var categories = manifest.categories;
    if (!categories || typeof categories !== 'object') return null;

    var normalizedSlug = slugify(slug);
    var entry = categories[normalizedSlug] || categories[slug];
    if (!entry) return null;

    var months = [];
    var chunkCandidates = [];
    var count = 0;

    function pushMonth(value) {
      var raw = value == null ? '' : String(value).trim();
      if (!raw) return;
      months.push(raw);
    }

    function assignCount(value) {
      var num = parseInt(value, 10);
      if (!isNaN(num) && num > count) {
        count = num;
      }
    }

    if (Array.isArray(entry)) {
      entry.forEach(pushMonth);
      assignCount(entry.length);
    } else if (entry && typeof entry === 'object') {
      if (Array.isArray(entry.months)) {
        entry.months.forEach(pushMonth);
      }
      if (Array.isArray(entry.archives)) {
        entry.archives.forEach(pushMonth);
      }
      if (entry.month) {
        pushMonth(entry.month);
      }
      if (entry.archive) {
        pushMonth(entry.archive);
      }

      if ('count' in entry) assignCount(entry.count);
      if ('post_count' in entry) assignCount(entry.post_count);
      if ('total' in entry) assignCount(entry.total);
      if ('size' in entry) assignCount(entry.size);
      if ('items' in entry) assignCount(entry.items);
      if ('posts' in entry) assignCount(entry.posts);

      if (Array.isArray(entry.chunks)) {
        chunkCandidates = entry.chunks.slice();
      } else if (Array.isArray(entry.partitions)) {
        chunkCandidates = entry.partitions.slice();
      } else if (Array.isArray(entry.files)) {
        chunkCandidates = entry.files.slice();
      } else if (Array.isArray(entry.paths)) {
        chunkCandidates = entry.paths.slice();
      } else if (entry.chunk != null) {
        chunkCandidates = [entry.chunk];
      } else if (entry.partition != null) {
        chunkCandidates = [entry.partition];
      } else if (entry.path != null) {
        chunkCandidates = [entry.path];
      } else if (entry.feed != null) {
        chunkCandidates = [entry.feed];
      }
    } else {
      pushMonth(entry);
      assignCount(months.length);
    }

    return {
      months: sanitizeMonthList(months),
      chunks: Array.isArray(chunkCandidates) ? chunkCandidates.slice() : [],
      count: count
    };
  }

  function sanitizeMonthList(months) {
    var seen = Object.create(null);
    var sanitized = [];
    months
      .map(function (value) { return value == null ? '' : String(value).trim(); })
      .forEach(function (value) {
        if (!value) return;
        var normalized = value.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(normalized)) return;
        if (seen[normalized]) return;
        seen[normalized] = true;
        sanitized.push(normalized);
      });

    return sanitized;
  }

  function manifestMonthsFor(manifest, slug) {
    var entry = manifestCategoryEntry(manifest, slug);
    if (!entry) return [];
    return Array.isArray(entry.months) ? entry.months.slice() : [];
  }

  function manifestHasCategory(manifest, slug) {
    var entry = manifestCategoryEntry(manifest, slug);
    if (!entry) return false;
    if (entry.chunks && entry.chunks.length) return true;
    return Array.isArray(entry.months) && entry.months.length > 0;
  }

  function resolveManifestCategorySlug(manifest, slug) {
    var normalized = resolveKnownCategorySlug(slug);
    if (!normalized) return '';
    if (manifestHasCategory(manifest, normalized)) {
      return normalized;
    }

    var visited = Object.create(null);
    var current = normalized;
    while (current && !visited[current]) {
      visited[current] = true;
      var parent = CATEGORY_PARENT_LOOKUP[current];
      if (!parent) break;
      var parentNormalized = slugify(parent);
      if (!parentNormalized) break;
      if (manifestHasCategory(manifest, parentNormalized)) {
        return parentNormalized;
      }
      current = parentNormalized;
    }

    return normalized;
  }

  function buildCategorySourceList(slug, monthKey) {
    var normalizedSlug = slugify(slug);
    var month = monthKey == null ? '' : String(monthKey).trim();
    if (!normalizedSlug || !month) return [];

    var safeMonth = month.replace(/[^0-9-]/g, '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(safeMonth)) return [];

    var primary = '/data/posts/' + normalizedSlug + '/' + safeMonth + '.json';
    var secondary = 'data/posts/' + normalizedSlug + '/' + safeMonth + '.json';
    return [primary, secondary];
  }

  function loadCategoryMonth(slug, monthKey) {
    var normalizedSlug = slugify(slug);
    var month = monthKey == null ? '' : String(monthKey).trim();
    if (!normalizedSlug || !month) {
      return Promise.resolve([]);
    }

    var cacheKey = normalizedSlug + '|' + month;
    if (CATEGORY_MONTH_CACHE[cacheKey]) {
      return CATEGORY_MONTH_CACHE[cacheKey];
    }

    var sources = buildCategorySourceList(normalizedSlug, month);
    if (!sources.length) {
      var empty = Promise.resolve([]);
      CATEGORY_MONTH_CACHE[cacheKey] = empty;
      return empty;
    }

    var promise = fetchSequential(sources)
      .then(function (items) {
        return Array.isArray(items) ? items : [];
      })
      .catch(function (err) {
        console.warn('category month load error', normalizedSlug, month, err);
        return [];
      });

    CATEGORY_MONTH_CACHE[cacheKey] = promise;
    return promise;
  }

  function manifestChunkDescriptors(manifest, slug) {
    var entry = manifestCategoryEntry(manifest, slug);
    if (!entry) return [];

    var rawChunks = Array.isArray(entry.chunks) ? entry.chunks.slice() : [];
    var descriptors = [];

    rawChunks.forEach(function (descriptor) {
      var normalized = normalizeChunkDescriptor(descriptor, slug);
      if (normalized) {
        descriptors.push(normalized);
      }
    });

    if (!descriptors.length) {
      var months = Array.isArray(entry.months) ? entry.months : [];
      months.forEach(function (month) {
        var normalizedMonth = normalizeChunkDescriptor({ month: month }, slug);
        if (normalizedMonth) {
          descriptors.push(normalizedMonth);
        }
      });
    }

    return descriptors;
  }

  function normalizeChunkDescriptor(descriptor, slug) {
    if (descriptor == null) {
      return null;
    }

    if (Array.isArray(descriptor)) {
      if (descriptor.length === 0) return null;
      if (descriptor.length === 1 && typeof descriptor[0] === 'string' && /^\d{4}-\d{2}$/.test(descriptor[0])) {
        return normalizeChunkDescriptor(descriptor[0], slug);
      }
      return createSourceDescriptor(descriptor, slug, 0);
    }

    if (typeof descriptor === 'string') {
      var trimmed = descriptor.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}$/.test(trimmed.slice(0, 7))) {
        var monthList = sanitizeMonthList([trimmed]);
        if (!monthList.length) return null;
        return { type: 'month', month: monthList[0], count: 0 };
      }
      return createSourceDescriptor([trimmed], slug, 0);
    }

    if (typeof descriptor === 'object') {
      if (Array.isArray(descriptor.items)) {
        return {
          type: 'inline',
          items: descriptor.items.slice(),
          count: typeof descriptor.count === 'number' ? descriptor.count : descriptor.items.length
        };
      }
      if (Array.isArray(descriptor.posts)) {
        return {
          type: 'inline',
          items: descriptor.posts.slice(),
          count: typeof descriptor.count === 'number' ? descriptor.count : descriptor.posts.length
        };
      }
      if (descriptor.month) {
        var normalizedMonth = sanitizeMonthList([descriptor.month]);
        if (normalizedMonth.length) {
          var monthCount = 0;
          if ('count' in descriptor) {
            monthCount = parseInt(descriptor.count, 10);
            if (isNaN(monthCount)) monthCount = 0;
          }
          return { type: 'month', month: normalizedMonth[0], count: monthCount };
        }
      }

      var urlList = [];
      if (Array.isArray(descriptor.urls)) {
        urlList = descriptor.urls.slice();
      } else if (Array.isArray(descriptor.sources)) {
        urlList = descriptor.sources.slice();
      } else if (Array.isArray(descriptor.paths)) {
        urlList = descriptor.paths.slice();
      } else if (Array.isArray(descriptor.files)) {
        urlList = descriptor.files.slice();
      }

      if (!urlList.length) {
        var single = descriptor.url || descriptor.src || descriptor.path || descriptor.file || descriptor.partition || descriptor.feed || descriptor.href || descriptor.resource;
        if (single) {
          urlList = [single];
        }
      }

      if (!urlList.length && descriptor.id && typeof descriptor.id === 'string') {
        urlList = [descriptor.id];
      }

      if (urlList.length) {
        var count = 0;
        if ('count' in descriptor) {
          count = parseInt(descriptor.count, 10);
          if (isNaN(count)) count = 0;
        } else if ('size' in descriptor) {
          count = parseInt(descriptor.size, 10);
          if (isNaN(count)) count = 0;
        } else if ('total' in descriptor) {
          count = parseInt(descriptor.total, 10);
          if (isNaN(count)) count = 0;
        }
        return createSourceDescriptor(urlList, slug, count);
      }
    }

    return null;
  }

  function createSourceDescriptor(urlList, slug, count) {
    var urls = sanitizeChunkUrls(urlList, slug);
    if (!urls.length) return null;
    return { type: 'sources', urls: urls, count: typeof count === 'number' ? count : 0 };
  }

  function sanitizeChunkUrls(urls, slug) {
    if (!Array.isArray(urls)) return [];
    var seen = Object.create(null);
    var list = [];
    urls.forEach(function (value) {
      var raw = value == null ? '' : String(value).trim();
      if (!raw) return;
      var candidates = buildChunkUrlCandidates(raw, slug);
      candidates.forEach(function (candidate) {
        if (!candidate || seen[candidate]) return;
        seen[candidate] = true;
        list.push(candidate);
      });
    });
    return list;
  }

  function buildChunkUrlCandidates(path, slug) {
    if (!path) return [];
    var cleaned = String(path).trim();
    if (!cleaned) return [];

    if (slug) {
      cleaned = cleaned.replace(/\{slug\}/g, slug);
      cleaned = cleaned.replace(/\{category\}/g, slug);
    }

    if (/^(https?:)?\/\//i.test(cleaned)) {
      return [cleaned];
    }

    if (cleaned.charAt(0) === '.') {
      cleaned = cleaned.replace(/^\.\//, '');
    }

    if (cleaned.indexOf('/') === -1 && slug) {
      cleaned = 'data/posts/' + slug + '/' + cleaned;
    }

    if (cleaned.charAt(0) === '/') {
      var withoutLeading = cleaned.replace(/^\/+/, '');
      if (withoutLeading) {
        return [cleaned, withoutLeading];
      }
      return [cleaned];
    }

    var normalized = cleaned.replace(/^\/+/, '');
    return ['/' + normalized, normalized];
  }

  function createPartitionedCategoryLoader(manifest, slug) {
    var normalizedSlug = slugify(slug);
    if (!normalizedSlug) return null;

    var descriptors = manifestChunkDescriptors(manifest, normalizedSlug);
    if (!descriptors.length) return null;

    var chunkLoaders = [];
    descriptors.forEach(function (descriptor) {
      if (!descriptor) return;
      if (descriptor.type === 'month') {
        var monthKey = descriptor.month;
        if (!monthKey) return;
        chunkLoaders.push({
          load: function () {
            return loadCategoryMonth(normalizedSlug, monthKey).then(function (items) {
              return Array.isArray(items) ? items : [];
            });
          },
          count: typeof descriptor.count === 'number' ? descriptor.count : 0,
          key: monthKey
        });
      } else if (descriptor.type === 'inline') {
        var inlineItems = Array.isArray(descriptor.items) ? descriptor.items.slice() : [];
        chunkLoaders.push({
          load: function () {
            return Promise.resolve(inlineItems.slice());
          },
          count: typeof descriptor.count === 'number' ? descriptor.count : inlineItems.length,
          key: 'inline'
        });
      } else if (descriptor.type === 'sources') {
        var urls = descriptor.urls;
        if (!Array.isArray(urls) || !urls.length) return;
        chunkLoaders.push({
          load: function () {
            return fetchSequential(urls)
              .then(function (items) {
                return Array.isArray(items) ? items : [];
              })
              .catch(function (err) {
                console.warn('category chunk load error', normalizedSlug, urls[0], err);
                return [];
              });
          },
          count: typeof descriptor.count === 'number' ? descriptor.count : 0,
          key: urls[0] || ''
        });
      }
    });

    if (!chunkLoaders.length) {
      return null;
    }

    var chunkPromises = [];
    var loadedChunks = [];
    var deliveredIndex = 0;
    var exhausted = false;

    function fetchChunk(index) {
      if (chunkPromises[index]) {
        return chunkPromises[index];
      }
      var loader = chunkLoaders[index];
      if (!loader) {
        var empty = Promise.resolve([]);
        chunkPromises[index] = empty;
        loadedChunks[index] = [];
        return empty;
      }
      var promise = loader.load()
        .then(function (items) {
          var list = Array.isArray(items) ? items : [];
          loadedChunks[index] = list;
          return list;
        })
        .catch(function (err) {
          console.warn('category chunk fetch error', normalizedSlug, loader.key || index, err);
          loadedChunks[index] = [];
          return [];
        });
      chunkPromises[index] = promise;
      return promise;
    }

    function totalLoaded() {
      var total = 0;
      for (var i = 0; i < loadedChunks.length; i++) {
        if (loadedChunks[i]) {
          total += loadedChunks[i].length;
        }
      }
      return total;
    }

    function collectLoaded(limit) {
      var aggregated = [];
      for (var i = 0; i < loadedChunks.length; i++) {
        if (!loadedChunks[i] || !loadedChunks[i].length) continue;
        Array.prototype.push.apply(aggregated, loadedChunks[i]);
        if (limit && aggregated.length >= limit) {
          break;
        }
      }
      if (limit && aggregated.length > limit) {
        aggregated.length = limit;
      }
      return aggregated;
    }

    function hasMore() {
      if (exhausted) return false;
      if (deliveredIndex < chunkLoaders.length) return true;
      for (var i = deliveredIndex; i < chunkLoaders.length; i++) {
        if (!chunkPromises[i]) return true;
        if (loadedChunks[i] && loadedChunks[i].length) return true;
      }
      return false;
    }

    function deliverFrom(index) {
      if (index >= chunkLoaders.length) {
        exhausted = true;
        deliveredIndex = chunkLoaders.length;
        return Promise.resolve({ items: [], done: true });
      }
      return fetchChunk(index).then(function (items) {
        deliveredIndex = index + 1;
        if (!items.length) {
          if (deliveredIndex >= chunkLoaders.length) {
            exhausted = true;
            return { items: [], done: true };
          }
          return deliverFrom(deliveredIndex);
        }
        if (deliveredIndex >= chunkLoaders.length) {
          exhausted = true;
        }
        return { items: items.slice(), done: !hasMore() };
      });
    }

    function ensureCount(count) {
      var desired = typeof count === 'number' && count > 0 ? count : 0;
      function loadSequential(index) {
        if (!desired) {
          return Promise.resolve();
        }
        if (totalLoaded() >= desired) {
          return Promise.resolve();
        }
        if (index >= chunkLoaders.length) {
          return Promise.resolve();
        }
        return fetchChunk(index).then(function () {
          return loadSequential(index + 1);
        });
      }
      return loadSequential(0).then(function () {
        var limit = desired > 0 ? desired : 0;
        return collectLoaded(limit && limit > 0 ? limit : 0);
      });
    }

    var manifestEntry = manifestCategoryEntry(manifest, normalizedSlug) || { count: 0 };
    var totalCount = 0;
    if (manifestEntry && typeof manifestEntry.count === 'number' && manifestEntry.count > 0) {
      totalCount = manifestEntry.count;
    } else {
      for (var i = 0; i < chunkLoaders.length; i++) {
        var loaderCount = typeof chunkLoaders[i].count === 'number' ? chunkLoaders[i].count : 0;
        if (loaderCount > 0) {
          totalCount += loaderCount;
        }
      }
    }

    return {
      slug: normalizedSlug,
      loadNext: function () {
        return deliverFrom(deliveredIndex);
      },
      ensureCount: ensureCount,
      hasMore: hasMore,
      getKnownTotal: function () {
        return totalCount;
      },
      getLoadedCount: totalLoaded,
      peekLoaded: function () {
        return collectLoaded(0);
      }
    };
  }

  function createArrayFeedLoader(items, chunkSize) {
    var list = Array.isArray(items) ? items.slice() : [];
    var size = typeof chunkSize === 'number' && chunkSize > 0 ? chunkSize : 12;
    var pointer = 0;

    return {
      slug: '',
      loadNext: function () {
        if (pointer >= list.length) {
          return Promise.resolve({ items: [], done: true });
        }
        var next = list.slice(pointer, pointer + size);
        pointer += size;
        return Promise.resolve({ items: next, done: pointer >= list.length });
      },
      ensureCount: function (count) {
        var desired = typeof count === 'number' && count > 0 ? count : list.length;
        var limit = Math.min(desired, list.length);
        return Promise.resolve(list.slice(0, limit));
      },
      hasMore: function () {
        return pointer < list.length;
      },
      getKnownTotal: function () {
        return list.length;
      },
      getLoadedCount: function () {
        return Math.min(pointer, list.length);
      },
      peekLoaded: function () {
        var end = Math.min(pointer, list.length);
        return list.slice(0, end);
      }
    };
  }

  function loadLegacyPosts() {
    return fetchSequential(LEGACY_POSTS_SOURCES)
      .then(function (all) {
        var list = Array.isArray(all) ? all : [];
        return { siteWide: list.slice(), page: list.slice() };
      })
      .catch(function (err) {
        console.warn('legacy posts load error', err);
        return { siteWide: [], page: [] };
      });
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
  function resolvePostCategorySlugs(post) {
    if (!post) return [];

    var slugs = [];
    var seen = Object.create(null);

    function appendSlug(value) {
      if (value == null) return;
      var trimmed = String(value).trim();
      if (!trimmed) return;
      var normalized = slugify(trimmed);
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      slugs.push(normalized);
    }

    var rawSlug = post.category_slug;
    if (rawSlug != null && String(rawSlug).trim()) {
      appendSlug(rawSlug);

      var rawSegments = String(rawSlug).split('/');
      if (rawSegments.length > 1) {
        var lastRawSegment = rawSegments[rawSegments.length - 1];
        appendSlug(lastRawSegment);
      }
    }

    var subcategory = post.subcategory;
    appendSlug(subcategory);

    if (subcategory != null && String(subcategory).indexOf('/') !== -1) {
      var subSegments = String(subcategory).split('/');
      var lastSubSegment = subSegments[subSegments.length - 1];
      appendSlug(lastSubSegment);
    }

    var category = post.category;
    appendSlug(category);
    if (category != null && String(category).indexOf('/') !== -1) {
      var categorySegments = String(category).split('/');
      var lastCategorySegment = categorySegments[categorySegments.length - 1];
      appendSlug(lastCategorySegment);
    }

    return slugs;
  }

  function resolvePostCategorySlug(post, preferredSlug) {
    var slugs = resolvePostCategorySlugs(post);
    if (!slugs.length) return '';

    var preferred = preferredSlug ? slugify(preferredSlug) : '';
    if (preferred) {
      for (var i = 0; i < slugs.length; i++) {
        if (slugs[i] === preferred) {
          return slugs[i];
        }
      }
    }

    return slugs[0];
  }


  var LABEL_PRIORITY_SUBCATEGORY = 1;
  var LABEL_PRIORITY_SLUG = 2;
  var LABEL_PRIORITY_CATEGORY = 3;
  var LABEL_PRIORITY_FALLBACK = 99;

  function resolvePostCategoryLabelInfo(post) {
    if (!post) {
      return { label: '', priority: LABEL_PRIORITY_FALLBACK };
    }

    var subcategory = post.subcategory;
    if (subcategory != null && String(subcategory).trim()) {
      return {
        label: String(subcategory).trim(),
        priority: LABEL_PRIORITY_SUBCATEGORY
      };
    }

    var rawSlug = post.category_slug;
    if (rawSlug != null && String(rawSlug).trim()) {
      var slugValue = String(rawSlug).trim();
      var normalized = slugify(slugValue);
      var formatted = normalized
        ? resolveCategoryLabelFromSlug(normalized, slugValue)
        : slugValue;
      return {
        label: formatted,
        priority: LABEL_PRIORITY_SLUG
      };
    }

    var category = post.category;
    if (category != null && String(category).trim()) {
      var categoryValue = String(category).trim();
      var normalizedCategory = slugify(categoryValue);
      var formattedCategory = normalizedCategory
        ? resolveCategoryLabelFromSlug(normalizedCategory, categoryValue)
        : categoryValue;
      return {
        label: formattedCategory,
        priority: LABEL_PRIORITY_CATEGORY
      };
    }

    return { label: '', priority: LABEL_PRIORITY_FALLBACK };
  }

  function resolvePostCategoryLabel(post) {
    return resolvePostCategoryLabelInfo(post).label;
  }


  function titleize(slug) {
    return (slug || '')
      .split('-')
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join(' ');
  }
   var CATEGORY_TITLE_LOOKUP = Object.create(null);
  var CATEGORY_PARENT_LOOKUP = Object.create(null);
  var CATEGORY_MONTH_CACHE = Object.create(null);

  function registerCategoryParent(childSlug, parentSlug) {
    var child = slugify(childSlug);
    var parent = slugify(parentSlug);
    if (!child || !parent || child === parent) return;
    if (!CATEGORY_PARENT_LOOKUP[child]) {
      CATEGORY_PARENT_LOOKUP[child] = parent;
    }
  }

  function populateCategoryLookup(data) {
    if (!data || typeof data !== 'object') return;
    var categories = Array.isArray(data.categories) ? data.categories : [];
    categories.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var slug = slugify(entry.slug);
      if (!slug) return;
      var title = entry.title != null ? String(entry.title).trim() : '';
      if (!title) {
        title = titleize(slug);
      }
      CATEGORY_TITLE_LOOKUP[slug] = title;

      var parent = entry.group;
      if (Array.isArray(parent)) {
        if (parent.length) {
          registerCategoryParent(slug, parent[0]);
        }
      } else if (parent != null) {
        registerCategoryParent(slug, parent);
      }
    });
  }

  function resolveKnownCategorySlug(slug) {
    var normalized = slugify(slug);
    if (!normalized) return '';
    if (CATEGORY_TITLE_LOOKUP[normalized]) {
      return normalized;
    }

    var segments = normalized.split('-');
    for (var i = segments.length - 1; i >= 0; i--) {
      var candidate = segments.slice(i).join('-');
      if (candidate && CATEGORY_TITLE_LOOKUP[candidate]) {
        return candidate;
      }
    }

    return normalized;
  }

    function resolveCategoryLabelFromSlug(slug, rawLabel) {
    var normalizedSlug = slugify(slug);
    var trimmed = rawLabel == null ? '' : String(rawLabel).trim();

    if (!normalizedSlug) {
      return trimmed;
    }

    var lookupTitle = CATEGORY_TITLE_LOOKUP[normalizedSlug];
    if (lookupTitle) {
      return lookupTitle;
    }

    if (!trimmed) {
      return titleize(normalizedSlug);
    }

    var slugFromLabel = slugify(trimmed);
    if (slugFromLabel === normalizedSlug) {
      var pretty = titleize(normalizedSlug);
      var lowerTrimmed = trimmed.toLowerCase();
      if (
        lowerTrimmed === normalizedSlug ||
        trimmed === pretty ||
        lowerTrimmed === pretty.toLowerCase()
      ) {
        return pretty;
      }
    }

    return trimmed;
  }

  var HTML_ESCAPE = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHtml(value) {
    return (value == null ? '' : String(value)).replace(/[&<>"']/g, function (ch) {
      return HTML_ESCAPE[ch];
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
    if (!post || !post.slug) return '#';
    var slug = encodeURIComponent(post.slug);
    if (basePath.articleUrl) {
      return basePath.articleUrl(post.slug);
    }
    return slug ? '/article.html?slug=' + slug : '#';
  }

  function buildCategoryUrl(slug) {
    if (!slug) return '#';
    if (basePath.categoryUrl) {
      return basePath.categoryUrl(slug);
    }
    return '/category.html?cat=' + encodeURIComponent(slug);
  }

  var url = new URL(window.location.href);

  function getCatSub() {
    var catParam = url.searchParams.get('cat');
    var subParam = url.searchParams.get('sub');

    var cat = slugify(catParam);
    var alias = slugify(subParam);
    var label = '';

    if (alias) {
      cat = alias;
      label = subParam || '';
    } else if (catParam) {
      label = catParam;
    }

    if (!cat) {
      var pathName = window.location && window.location.pathname
        ? window.location.pathname
        : '';
      var trimmedPath = pathName.replace(/\/+$/, '');
      var segments = trimmedPath.split('/');
      for (var i = segments.length - 1; i >= 0; i--) {
        var segment = segments[i];
        if (!segment) continue;

        var decoded = segment;
        try {
          decoded = decodeURIComponent(segment);
        } catch (err) {
          // ignore decode errors and fall back to the raw segment
        }

        var cleaned = decoded.replace(/\.html?$/i, '');
        if (!cleaned || /^index$/i.test(cleaned)) continue;

        var derived = slugify(cleaned);
        if (derived) {
          cat = derived;
          label = cleaned;
          break;
        }
      }
    }

    // opsionale: lexo edhe data-attr në <body data-cat="..." data-sub="...">
    var body = document.body;
    if (!cat && body.dataset.cat) {
      cat = slugify(body.dataset.cat);
      label = body.dataset.cat;
    }
    if (!cat && body.dataset.sub) {
      cat = slugify(body.dataset.sub);
      label = body.dataset.sub;
    }

    if (label) {
      label = String(label)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    label = resolveCategoryLabelFromSlug(cat, label);

    return { cat: cat, label: label };
  }

  function patchHeader(ctx) {
    var cat = ctx && ctx.cat ? ctx.cat : '';
    var label = '';
    if (ctx && ctx.label) {
      label = String(ctx.label).trim();
    }
    var resolvedLabel = resolveCategoryLabelFromSlug(cat, label);
    if (ctx && resolvedLabel !== label) {
      ctx.label = resolvedLabel;
    }
    label = resolvedLabel;

    var bc = document.querySelector('.breadcrumb');
    if (bc) {
      var parts = ['<li><a href="' + HOME_URL + '">Home</a></li>'];
      if (cat) {
        var catUrl = buildCategoryUrl(cat);
        parts.push('<li class="active"><a href="' + escapeHtml(catUrl) + '">' + escapeHtml(label) + '</a></li>');
      }
      bc.innerHTML = parts.join('');
    }
    var h1 = document.querySelector('.page-title');
    if (h1) {
      h1.textContent = cat ? 'Category: ' + label : 'Category';
    }
    var subt = document.querySelector('.page-subtitle');
    if (subt) {
      subt.innerHTML = cat
        ? 'Showing all posts with category <i>' + escapeHtml(label) + '</i>'
        : 'Showing all posts.';
    }
  }

  function renderPost(p) {
    var dateTxt = (p.date || '').split('T')[0];
    var art = document.createElement('article');
    art.className = 'col-md-12 article-list';
    var articleUrl = buildArticleUrl(p);
    var hasCover = p.cover && String(p.cover).trim();
    var coverSrc = hasCover ? (basePath.resolve ? basePath.resolve(p.cover) : p.cover) : DEFAULT_IMAGE;
    var coverAlt = (p.title ? String(p.title) : 'AventurOO') + ' cover image';
    var figureClass = hasCover ? '' : ' class="no-cover"';
    var figureHtml =
      '<figure' + figureClass + '>' +
        '<a href="' + articleUrl + '">' +
          '<img src="' + escapeHtml(coverSrc) + '" alt="' + escapeHtml(coverAlt) + '">' +
        '</a>' +
      '</figure>';
    var categoryName = resolvePostCategoryLabel(p);
    var preferredSlug = ctx && ctx.cat ? ctx.cat : '';
    var categorySlug = resolvePostCategorySlug(p, preferredSlug);
    var categoryLink = categorySlug ? buildCategoryUrl(categorySlug) : '#';
    var categoryHtml = categoryName
      ? '<div class="category"><a href="' + escapeHtml(categoryLink) + '">' + escapeHtml(categoryName) + '</a></div>'
      : '';
    art.innerHTML =
      '<div class="inner">' +
        figureHtml +
        '<div class="details">' +
          '<div class="detail">' +
            categoryHtml +
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

  function createSidebarArticle(post, variant) {
    var article = document.createElement('article');
    var articleUrl = buildArticleUrl(post);
    var title = escapeHtml(post && post.title ? post.title : '');
    var rawLabel = resolvePostCategoryLabel(post);
    var category = escapeHtml(rawLabel);
    var preferredSlug = ctx && ctx.cat ? ctx.cat : '';
    var categorySlug = resolvePostCategorySlug(post, preferredSlug);
    var categoryHref = categorySlug ? buildCategoryUrl(categorySlug) : '#';
    var categoryAnchor = category
      ? '<div class="category"><a href="' + escapeHtml(categoryHref) + '">' + category + '</a></div>'
      : '';
    var excerpt = escapeHtml(post && post.excerpt ? post.excerpt : '');
    var dateTxt = escapeHtml(formatDateString(post && post.date));
    var hasCover = post && post.cover;
    var coverSrc = hasCover ? (basePath.resolve ? basePath.resolve(post.cover) : post.cover) : DEFAULT_IMAGE;
    var cover = escapeHtml(coverSrc);
    var figureClass = hasCover ? '' : ' class="no-cover"';
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
              categoryAnchor +
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
              categoryAnchor +
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

  function sortPostsByDate(posts) {
    return (Array.isArray(posts) ? posts.slice() : []).sort(function (a, b) {
      return getPostTimestamp(b) - getPostTimestamp(a);
    });
  }

  function filterPostsForCategory(posts, slug) {
    var list = Array.isArray(posts) ? posts : [];
    var normalized = slugify(slug);
    if (!normalized) {
      return list.slice();
    }
    return list.filter(function (post) {
      var slugs = resolvePostCategorySlugs(post);
      return slugs.indexOf(normalized) !== -1;
    });
  }

  var categoryLabelLocked = false;

  function maybeUpdateCategoryLabelFromPosts(posts) {
    if (!ctx || !ctx.cat || categoryLabelLocked) return;
    if (!Array.isArray(posts) || !posts.length) return;

    var currentLabel = ctx.label ? String(ctx.label).trim() : '';
    if (currentLabel && slugify(currentLabel) !== ctx.cat) {
      categoryLabelLocked = true;
      return;
    }

    var best = null;
    for (var i = 0; i < posts.length; i++) {
      var info = resolvePostCategoryLabelInfo(posts[i]);
      if (!info || !info.label) continue;
      if (!best || info.priority < best.priority) {
        best = info;
      }
      if (best && best.priority === LABEL_PRIORITY_SUBCATEGORY) {
        break;
      }
    }

    if (best && best.label) {
      ctx.label = best.label;
      categoryLabelLocked = true;
      patchHeader(ctx);
    }
  }

  function renderSidebarSections(primaryPosts, fallbackPosts) {
    var source = Array.isArray(primaryPosts) ? primaryPosts.slice() : [];
    if (!source.length && Array.isArray(fallbackPosts)) {
      source = fallbackPosts.slice();
    }
    var sorted = sortPostsByDate(source);
    renderRecentSidebar(sorted.slice(0, 3));
    renderMiniSidebar(sorted.slice(3, 13));
  }

  function initializeFromManifest(manifest, ctx) {
    if (!manifest || typeof manifest !== 'object') {
      return Promise.resolve(null);
    }

    var siteWideSlug = manifestHasCategory(manifest, 'all') ? 'all' : '';
    var siteWideLoader = siteWideSlug ? createPartitionedCategoryLoader(manifest, siteWideSlug) : null;

    var categorySlug = '';
    if (ctx && ctx.cat) {
      categorySlug = resolveManifestCategorySlug(manifest, ctx.cat);
    } else if (siteWideSlug) {
      categorySlug = siteWideSlug;
    } else if (manifest && manifest.categories) {
      var keys = Object.keys(manifest.categories);
      if (keys.length) {
        categorySlug = keys[0];
      }
    }

    var pageLoader = categorySlug ? createPartitionedCategoryLoader(manifest, categorySlug) : null;
    if (!pageLoader && siteWideLoader) {
      pageLoader = siteWideLoader;
    }

    if (!pageLoader) {
      return Promise.resolve(null);
    }

    if (siteWideLoader && siteWideLoader.slug === pageLoader.slug) {
      siteWideLoader = pageLoader;
    }

    var sidebarSource = siteWideLoader || pageLoader;
    var sidebarLimit = 13;
    var sidebarPromise = sidebarSource
      ? sidebarSource.ensureCount(sidebarLimit).catch(function (err) {
          console.warn('sidebar ensure error', err);
          return [];
        })
      : Promise.resolve([]);

    return sidebarPromise.then(function (sidebarPosts) {
      return {
        manifest: manifest,
        pageLoader: pageLoader,
        siteWideLoader: siteWideLoader,
        sidebarPosts: Array.isArray(sidebarPosts) ? sidebarPosts.slice() : [],
        usedLegacy: false
      };
    });
  }

  function initializeFromLegacy(ctx) {
    return loadLegacyPosts().then(function (data) {
      var siteWidePosts = data && Array.isArray(data.siteWide) ? data.siteWide.slice() : [];
      var pagePosts = data && Array.isArray(data.page) ? data.page.slice() : [];

      if (!siteWidePosts.length && pagePosts.length) {
        siteWidePosts = pagePosts.slice();
      }

      if (!ctx || !ctx.cat) {
        pagePosts = siteWidePosts.slice();
      } else if (!pagePosts.length && siteWidePosts.length) {
        pagePosts = siteWidePosts.slice();
      }

      var filtered = ctx && ctx.cat ? filterPostsForCategory(pagePosts, ctx.cat) : pagePosts.slice();
      var loader = createArrayFeedLoader(filtered, 12);
      return {
        manifest: null,
        pageLoader: loader,
        siteWideLoader: null,
        sidebarPosts: siteWidePosts.slice(),
        initialPagePosts: filtered.slice(),
        usedLegacy: true
      };
    });
  }

  function initializePageData(manifest, ctx) {
    return initializeFromManifest(manifest, ctx).then(function (result) {
      if (result) return result;
      return initializeFromLegacy(ctx);
    });
  }

  function setupIncrementalFeed(loader) {
    var listBox = document.getElementById('post-list');
    var infoBox = document.getElementById('pagination-info');
    var paginationContainer = document.getElementById('pagination');

    if (!loader) {
      if (listBox) {
        listBox.innerHTML = '<p class="lead">No posts yet for this category.</p>';
      }
      if (infoBox) {
        infoBox.textContent = 'No results found.';
      }
      if (paginationContainer) {
        paginationContainer.innerHTML = '';
      }
      return;
    }

    if (!listBox) return;

    infoBox = infoBox || document.getElementById('pagination-info');
    paginationContainer = paginationContainer || document.getElementById('pagination');
    var loadMoreWrapper = paginationContainer;

    listBox.innerHTML = '';

    var sentinel = document.createElement('div');
    sentinel.className = 'post-list-sentinel';
    listBox.appendChild(sentinel);

    var loadMoreButton = document.createElement('button');
    loadMoreButton.type = 'button';
    loadMoreButton.className = 'btn btn-primary load-more';
    loadMoreButton.textContent = 'Load more';

    if (loadMoreWrapper) {
      loadMoreWrapper.innerHTML = '';
      loadMoreWrapper.appendChild(loadMoreButton);
    } else if (listBox.parentNode) {
      loadMoreWrapper = document.createElement('div');
      loadMoreWrapper.className = 'post-list-controls';
      loadMoreWrapper.appendChild(loadMoreButton);
      listBox.parentNode.appendChild(loadMoreWrapper);
    }

    var knownTotal = typeof loader.getKnownTotal === 'function' ? loader.getKnownTotal() : 0;
    var loadedCount = 0;
    var loading = false;
    var finished = false;
    var observer = null;

    function updateInfoBox(emptyState) {
      if (!infoBox) return;
      if (emptyState) {
        infoBox.textContent = 'No results found.';
        return;
      }
      if (!loadedCount) {
        infoBox.textContent = 'Loading…';
        return;
      }
      if (knownTotal > 0) {
        var displayCount = Math.min(loadedCount, knownTotal);
        infoBox.textContent = 'Showing ' + displayCount + ' of ' + knownTotal + ' results.';
      } else {
        infoBox.textContent = 'Showing ' + loadedCount + ' results.';
      }
    }

    function setButtonState(isLoading) {
      if (!loadMoreButton) return;
      if (isLoading) {
        loadMoreButton.disabled = true;
        loadMoreButton.classList.add('loading');
        loadMoreButton.textContent = 'Loading…';
      } else {
        loadMoreButton.classList.remove('loading');
        loadMoreButton.disabled = finished;
        if (finished) {
          loadMoreButton.textContent = loadedCount ? 'All posts loaded' : 'No more posts';
        } else {
          loadMoreButton.textContent = 'Load more';
        }
      }
    }

    function appendPosts(posts) {
      if (!Array.isArray(posts) || !posts.length) return;
      posts.forEach(function (post) {
        var card = renderPost(post);
        if (!card) return;
        listBox.insertBefore(card, sentinel);
        loadedCount += 1;
      });
      maybeUpdateCategoryLabelFromPosts(posts);
      updateInfoBox();
    }

    function finish() {
      finished = true;
      if (observer) {
        observer.disconnect();
      }
      setButtonState(false);
      if (sentinel && sentinel.parentNode) {
        sentinel.parentNode.removeChild(sentinel);
      }
      if (!loadedCount) {
        listBox.innerHTML = '<p class="lead">No posts yet for this category.</p>';
        updateInfoBox(true);
        if (loadMoreWrapper && loadMoreWrapper !== paginationContainer && loadMoreWrapper.parentNode) {
          loadMoreWrapper.parentNode.removeChild(loadMoreWrapper);
        } else if (loadMoreButton) {
          loadMoreButton.disabled = true;
        }
      } else {
        updateInfoBox();
        if (loadMoreButton) {
          loadMoreButton.disabled = true;
          loadMoreButton.classList.add('disabled');
        }
      }
    }

    function handleResult(result) {
      loading = false;
      setButtonState(false);
      var items = result && Array.isArray(result.items) ? result.items : [];
      if (ctx && ctx.cat) {
        items = filterPostsForCategory(items, ctx.cat);
      }
      if (items.length) {
        appendPosts(items);
      }
      var done = result && result.done;
      if (!items.length && !done && typeof loader.hasMore === 'function' && loader.hasMore()) {
        Promise.resolve().then(requestMore);
        return;
      }
      if (done || !loader.hasMore || !loader.hasMore()) {
        finish();
      } else {
        updateInfoBox();
      }
    }

    function handleError(err) {
      loading = false;
      setButtonState(false);
      console.error('category chunk load error', err);
      if (!loadedCount) {
        updateInfoBox(true);
      }
    }

    function requestMore() {
      if (loading || finished) return;
      loading = true;
      setButtonState(true);
      loader.loadNext().then(handleResult).catch(handleError);
    }

    loadMoreButton.addEventListener('click', function () {
      requestMore();
    });

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            requestMore();
          }
        });
      }, { rootMargin: '0px 0px 200px 0px' });
      observer.observe(sentinel);
    }

    updateInfoBox();
    requestMore();
  }

  function bootstrapFromState(state) {
    if (!state) {
      renderSidebarSections([], []);
      setupIncrementalFeed(null);
      return;
    }

    var pageLoader = state.pageLoader || null;
    var sidebarPosts = Array.isArray(state.sidebarPosts) ? state.sidebarPosts.slice() : [];
    var fallbackSidebar = [];

    if (Array.isArray(state.initialPagePosts) && state.initialPagePosts.length) {
      fallbackSidebar = state.initialPagePosts.slice();
    } else if (pageLoader && typeof pageLoader.peekLoaded === 'function') {
      var preloaded = pageLoader.peekLoaded();
      if (Array.isArray(preloaded) && preloaded.length) {
        fallbackSidebar = preloaded.slice();
      }
    }

    renderSidebarSections(sidebarPosts, fallbackSidebar);

    if (Array.isArray(state.initialPagePosts) && state.initialPagePosts.length) {
      maybeUpdateCategoryLabelFromPosts(state.initialPagePosts);
    } else if (fallbackSidebar.length) {
      maybeUpdateCategoryLabelFromPosts(fallbackSidebar);
    }

    setupIncrementalFeed(pageLoader);
  }

  var ctx = getCatSub();
  patchHeader(ctx);
  
  var manifestPromise = fetchSequential(POSTS_MANIFEST_SOURCES)
    .catch(function (err) {
      console.warn('posts manifest load error', err);
      return null;
    });

  var taxonomyPromise = fetchSequential(TAXONOMY_SOURCES)
    .then(function (taxonomy) {
      populateCategoryLookup(taxonomy);
    })
    .catch(function (err) {
      console.warn('taxonomy load error', err);
    })
    .then(function () {
      var updatedLabel = resolveCategoryLabelFromSlug(ctx.cat, ctx.label);
      if (updatedLabel !== ctx.label) {
        ctx.label = updatedLabel;
        patchHeader(ctx);
      }
    });

  taxonomyPromise
    .then(function () {
      return manifestPromise;
    })
    .then(function (manifest) {
      return initializePageData(manifest, ctx);
    })
    .then(function (state) {
      bootstrapFromState(state);
    })
    .catch(function (err) {
      console.error('posts load error', err);
      initializeFromLegacy(ctx)
        .then(function (fallbackState) {
          bootstrapFromState(fallbackState);
        })
        .catch(function (legacyErr) {
          console.error('legacy posts fallback error', legacyErr);
          bootstrapFromState(null);
        });
    });
})()
