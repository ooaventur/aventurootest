(function() {
  function getQuery() {
    var params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  }

  function createArticle(article) {
    var articleEl = document.createElement('article');
    articleEl.className = 'col-md-12 article-list';
    articleEl.innerHTML =
      '<div class="inner">'
      + '<figure><a href="' + article.link + '"><img src="' + article.image + '" alt="' + article.title + '"></a></figure>'
      + '<div class="details">'
      + '<div class="detail"><div class="category"><a href="#">' + article.category + '</a></div>'
      + '<time>' + article.date + '</time></div>'
      + '<h1><a href="' + article.link + '">' + article.title + '</a></h1>'
      + '<p>' + article.excerpt + '</p>'
      + '<footer><a class="btn btn-primary more" href="' + article.link + '"><div>More</div><div><i class="ion-ios-arrow-thin-right"></i></div></a></footer>'
      + '</div>'
      + '</div>';
    return articleEl;
  }

  document.addEventListener('DOMContentLoaded', function() {
    var q = getQuery();
    var input = document.querySelector('input[name="q"]');
    if (input) {
      input.value = q;
    }

    var resultInfo = document.querySelector('.search-result');
    var resultsContainer = document.getElementById('search-results');

    fetch('js/articles.json')
      .then(function(res) { return res.json(); })
      .then(function(articles) {
        var filtered = q ? articles.filter(function(a) {
          return a.title.toLowerCase().indexOf(q.toLowerCase()) !== -1;
        }) : articles;

        if (resultInfo) {
          if (q) {
            resultInfo.textContent = 'Search results for keyword "' + q + '" found in ' + filtered.length + ' posts.';
          } else {
            resultInfo.textContent = 'No search keyword provided.';
          }
        }

        if (resultsContainer) {
          resultsContainer.innerHTML = '';
          filtered.forEach(function(article) {
            resultsContainer.appendChild(createArticle(article));
          });
        }
      })
      .catch(function() {
        if (resultInfo) {
          resultInfo.textContent = 'Failed to load search results.';
        }
      });
  });
})();
