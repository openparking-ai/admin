/* global document, window, ResizeObserver, URLSearchParams */
// A made-up extra page, for the checks only: says what the host handed it, follows the
// host's messages, and tells the host its height and that something changed -- the
// shape a host's page speaks (src/extras.js). Never part of the built site.
(function () {
  var q = new URLSearchParams(window.location.search);
  var id = q.get('framed');
  var show = function (key, value) { document.querySelector('[data-' + key + ']').textContent = key + ': ' + value; };
  var language = q.get('language');
  var look = q.get('look');
  show('garage', q.get('garage'));
  show('language', language);
  show('look', look);
  document.documentElement.dataset.theme = look;
  var tell = function (body) {
    body.type = 'extra-page';
    body.id = id;
    window.parent.postMessage(body, window.location.origin);
  };
  var size = function () { tell({ height: document.documentElement.scrollHeight }); };
  new ResizeObserver(size).observe(document.body);
  size();
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    var m = event.data;
    if (!m || m.type !== 'extra-page' || m.id !== id) return;
    if (m.language) show('language', m.language);
    if (m.look) { show('look', m.look); document.documentElement.dataset.theme = m.look; }
  });
  document.querySelector('[data-action="grow"]').addEventListener('click', function () {
    document.querySelector('[data-filler]').style.height = '600px';
  });
  document.querySelector('[data-action="change"]').addEventListener('click', function () {
    tell({ changed: true });
  });
})();
