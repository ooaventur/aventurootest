(function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || '';

  const POSTS_SOURCES = ['data/posts.json', '/data/posts.json'];

  function fetchSequential(urls) {
    return new Promise((resolve, reject) => {
      (function tryI(i) {
        if (i >= urls.length) return reject(new Error('No posts.json found'));
        fetch(urls[i], { cache: 'no-store' })
          .then(r => (r.ok ? resolve(r) : tryI(i + 1)))
          .catch(() => tryI(i + 1));
      })(0);
    });
  }

  async function load() {
    if (!slug) {
      showError('Post not specified.');
      return;
    }
    try {
      const res = await fetchSequential(POSTS_SOURCES);
      if (!res.ok) throw new Error('Network response was not ok');
      const posts = await res.json();
      const post = posts.find(p => p.slug === slug);
      if (!post) {
        showError('Post not found.');
        return;
      }
      renderPost(post);
    } catch (err) {
      console.error(err);
      showError('Failed to load post.');
    }
  }

  function renderPost(post) {
    const titleEl = document.querySelector('.main-article header h1');
    if (titleEl) titleEl.textContent = post.title;

    const dateEl = document.querySelector('.main-article header .details .date');
    if (dateEl) {
      const date = new Date(post.date);
      if (!isNaN(date)) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = `Posted on ${date.toLocaleDateString(undefined, options)}`;
      } else {
        dateEl.textContent = post.date;
      }
    }

    const authorEl = document.querySelector('.main-article .details .author');
    if (authorEl) {
      if (post.author) {
        authorEl.textContent = `By ${post.author}`;
      } else {
        authorEl.remove();
      }
    }

    const coverImg = document.querySelector('.main-article .featured img');
    if (coverImg) {
      if (post.cover) {
        coverImg.src = post.cover;
      } else {
        coverImg.remove();
      }
    }

    const bodyEl = document.querySelector('.main-article .main');
    if (bodyEl) {
      bodyEl.innerHTML = post.body || post.content || '';
    }

    const sourceEl = document.querySelector('.main-article .source');
    if (sourceEl) {
      if (post.source) {
        sourceEl.innerHTML = `<a href="${post.source}" rel="nofollow noopener">Source: Read the full article</a>`;
      } else {
        sourceEl.remove();
      }
    }

    const rightsEl = document.querySelector('.main-article .rights');
    if (rightsEl) {
      if (post.rights) {
        rightsEl.textContent = `All rights belong to ${post.rights}. This site cites the original article.`;
      } else {
        rightsEl.remove();
      }
    }
  }

  function showError(message) {
    const article = document.querySelector('.main-article');
    if (article) {
      article.innerHTML = `<p>${message}</p>`;
    } else {
      document.body.innerHTML = `<p>${message}</p>`;
    }
  }

function escapeHtml(s){return (s||"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));}
function hostFrom(u){ try{ return new URL(u).hostname.replace(/^www\./,''); } catch(e){ return ''; } }
function shortenUrl(u){
  try{
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./,'');
    let path = (url.pathname || '/').replace(/\/+/g,'/').slice(0,60);
    if(path.length > 1 && path.endsWith('/')) path = path.slice(0,-1);
    return host + (path === '/' ? '' : path) + (url.search ? '…' : '');
  } catch(e){ return u; }
}
function titleizeHost(host){
  if(!host) return '';
  // P.sh. bbc.co.uk -> BBC
  const base = host.split('.').slice(0,-1)[0].replace(/-/g,' ');
  return base ? base.replace(/\b\w/g,ch=>ch.toUpperCase()) : host;
}

// ... brenda renderimit të artikullit:
var sourceEl = document.querySelector('.article .source');
if (sourceEl) {
  if (post.source) {
    var host = hostFrom(post.source);
    var name = post.source_name || titleizeHost(host) || host || 'Source';
    var shortHref = shortenUrl(post.source);
    sourceEl.innerHTML = 'Source: <strong>' + escapeHtml(name) + '</strong> — '
      + '<a href="' + escapeHtml(post.source) + '" target="_blank" rel="nofollow noopener noreferrer">'
      + escapeHtml(shortHref) + '</a>';
  } else {
    sourceEl.remove();
  }
}
  
  load();
})();
