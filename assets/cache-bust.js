(function () {
  function applyCacheBust() {
    var v = Date.now();
    var images = document.querySelectorAll('img[data-src]');
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var src = img.getAttribute('data-src');
      if (!src) continue;
      var sep = src.indexOf('?') === -1 ? '?' : '&';
      img.src = src + sep + 'v=' + v;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCacheBust);
  } else {
    applyCacheBust();
  }
})();
