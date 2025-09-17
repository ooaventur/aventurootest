(function (global) {
  'use strict';

  var fetch = global.fetch;

  function normalizeUrls(urls) {
    if (!Array.isArray(urls)) return [];
    return urls
      .map(function (url) { return typeof url === 'string' ? url.trim() : ''; })
      .filter(function (url) { return !!url; });
  }

  function isJsonResponse(response) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') {
      return false;
    }
    var contentType = response.headers.get('content-type');
    if (!contentType) return false;
    return contentType.toLowerCase().indexOf('json') !== -1;
  }

  function fetchSequential(urls, options) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var list = normalizeUrls(urls);
    if (!list.length) {
      return Promise.reject(new Error('No matching resource found'));
    }

    var settings = Object.assign({ cache: 'no-store' }, options || {});

    return new Promise(function (resolve, reject) {
      var index = 0;
      var done = false;

      function finish(result, isError) {
        if (done) return;
        done = true;
        if (isError) reject(result); else resolve(result);
      }

      function tryNext() {
        if (done) return;
        if (index >= list.length) {
          finish(new Error('No matching resource found'), true);
          return;
        }

        var currentUrl = list[index++];

        fetch(currentUrl, settings)
          .then(function (response) {
            if (!response || !response.ok || !isJsonResponse(response)) {
              tryNext();
              return;
            }
            return response.json()
              .then(function (json) {
                finish(json, false);
              })
              .catch(function () {
                tryNext();
              });
          })
          .catch(function () {
            tryNext();
          });
      }

      tryNext();
    });
  }

  var loader = global.AventurOODataLoader || {};
  loader.fetchSequential = fetchSequential;
  global.AventurOODataLoader = loader;
})(typeof window !== 'undefined' ? window : this);
