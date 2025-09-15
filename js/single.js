  async function load() {
    if (!slug) {
      showError('Post not specified.');
      return;
    }
    try {
      const res = await fetch('/data/posts.json');
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
      bodyEl.innerHTML = post.body || '';
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

  load();
})();
